import { describe, it, expect } from 'vitest';
import {
  createModel, applyTerrainBrush, placeItem, eraseAt, exportMap, exportJson, importMap, importForEditing, History,
  heightAt, brushWeight, LAND_HEIGHT, WATER_HEIGHT, FORD_HEIGHT
} from '../../src/editor/mapModel.js';
import { validateMapDef } from '../../src/data/maps/validate.js';
import { getMap, listMaps, registerMap, unregisterMap } from '../../src/data/maps/index.js';
import { getHeightForMap } from '../../src/sim/terrainGenerators.js';
import { encodeHeights, decodeHeights } from '../../src/data/maps/painted.js';
import { validateMatchConfig, PLAYER_COLORS } from '../../src/sim/MatchConfig.js';
import { GameManager } from '../../src/core/GameManager.js';
import { Terrain } from '../../src/world/Terrain.js';
import { SIM_DT } from '../../src/sim/constants.js';
import { saveMap, loadSaved, listSaved, deleteSaved, saveDraft, loadDraft } from '../../src/editor/storage.js';

/** Mapa 1v1 completo e válido, feito só com as operações do editor. */
function buildSample(id = 'editor-teste') {
  const m = createModel({ size: 128, fill: 'land', id, name: 'Teste do editor' });
  // rio vertical com vau
  for (let z = -60; z <= 60; z += 3) applyTerrainBrush(m, 'water', 0, z, { radius: 6 });
  applyTerrainBrush(m, 'ford', 0, 0, { radius: 7 });
  placeItem(m, 'start', -40, -30);
  placeItem(m, 'start', 40, 30);
  placeItem(m, 'gold', -40, -45, { amount: 5000 });
  placeItem(m, 'gold', 40, 45);
  placeItem(m, 'forest', -30, 5, { count: 40, radius: 8, species: 'oak' });
  placeItem(m, 'forest', 30, -5, { count: 40, radius: 8, species: 'pine' });
  placeItem(m, 'camp', 20, -40, { guards: 3 });
  placeItem(m, 'critters', 25, 40, { species: 'sheep', count: 5 });
  return m;
}

describe('editor de mapas — modelo e pincéis (F8-03)', () => {
  it('createModel: grade da fábrica bate com paintedNodes e altura base', () => {
    const m = createModel({ size: 96, fill: 'water' });
    expect(m.nodes).toBe(49);
    expect(m.h.length).toBe(49 * 49);
    expect(heightAt(m, 0, 0)).toBeCloseTo(WATER_HEIGHT, 1);
    expect(heightAt(createModel({ size: 96 }), 10, 10)).toBeCloseTo(LAND_HEIGHT, 1);
  });

  it('brushWeight: 1 no centro, 0 fora do raio, monotônico', () => {
    expect(brushWeight(0, 5)).toBe(1);
    expect(brushWeight(5, 5)).toBe(0);
    expect(brushWeight(2, 5)).toBeGreaterThan(brushWeight(3, 5));
  });

  it('raise/lower alteram a altura e respeitam a faixa do Int8', () => {
    const m = createModel({ size: 96 });
    const h0 = heightAt(m, 0, 0);
    expect(applyTerrainBrush(m, 'raise', 0, 0, { radius: 6, strength: 1 })).toBe(true);
    expect(heightAt(m, 0, 0)).toBeGreaterThan(h0);
    for (let i = 0; i < 60; i++) applyTerrainBrush(m, 'raise', 0, 0, { radius: 6, strength: 2 });
    expect(heightAt(m, 0, 0)).toBeLessThanOrEqual(12.7);
    for (let i = 0; i < 80; i++) applyTerrainBrush(m, 'lower', 0, 0, { radius: 6, strength: 2 });
    expect(heightAt(m, 0, 0)).toBeGreaterThanOrEqual(-12.8);
  });

  it('water/land trocam o terreno e o nó fora do raio não muda; flatten e smooth', () => {
    const m = createModel({ size: 96 });
    applyTerrainBrush(m, 'water', 0, 0, { radius: 8 });
    expect(heightAt(m, 0, 0)).toBeLessThan(0.5);
    expect(heightAt(m, 30, 30)).toBeCloseTo(LAND_HEIGHT, 1);
    applyTerrainBrush(m, 'land', 0, 0, { radius: 8 });
    expect(heightAt(m, 0, 0)).toBeGreaterThan(2);
    applyTerrainBrush(m, 'raise', 20, 20, { radius: 4, strength: 2 });
    applyTerrainBrush(m, 'flatten', 20, 20, { radius: 6, level: 3 });
    expect(heightAt(m, 20, 20)).toBeCloseTo(3, 0);
    const before = heightAt(m, 22, 20);
    applyTerrainBrush(m, 'smooth', 22, 20, { radius: 5 });
    expect(Math.abs(heightAt(m, 22, 20) - 3)).toBeLessThanOrEqual(Math.abs(before - 3) + 1e-9);
  });

  it('pincel de vau: terra seca em volta e uma entrada em fords (sem duplicar no mesmo ponto)', () => {
    const m = createModel({ size: 96, fill: 'water' });
    expect(applyTerrainBrush(m, 'ford', 0, 0, { radius: 6 })).toBe(true);
    expect(heightAt(m, 0, 0)).toBeCloseTo(FORD_HEIGHT, 1);
    expect(m.fords).toHaveLength(1);
    applyTerrainBrush(m, 'ford', 0.5, 0, { radius: 6 });
    expect(m.fords).toHaveLength(1);
    expect(() => applyTerrainBrush(m, 'nada', 0, 0)).toThrow();
  });

  it('itens: maxPlayers acompanha as bases; borracha remove o mais próximo (e vaus)', () => {
    const m = createModel({ size: 128 });
    placeItem(m, 'start', -20, 0);
    placeItem(m, 'start', 20, 0);
    placeItem(m, 'start', 0, 20);
    expect(m.maxPlayers).toBe(3);
    placeItem(m, 'gold', 10, 10);
    applyTerrainBrush(m, 'ford', 40, 40, { radius: 5 });
    expect(eraseAt(m, 0.5, 20.5).list).toBe('startSlots');
    expect(m.maxPlayers).toBe(2);
    expect(eraseAt(m, 60, 60)).toBeNull();
    expect(eraseAt(m, 40, 40).list).toBe('fords');
    expect(eraseAt(m, 10, 10).list).toBe('resources');
  });

  it('histórico: desfazer/refazer restauram grade e listas; novo commit descarta o refazer', () => {
    const m = createModel({ size: 96 });
    const hist = new History(m);
    applyTerrainBrush(m, 'water', 0, 0, { radius: 8 });
    hist.commit(m);
    placeItem(m, 'start', 30, 30);
    hist.commit(m);
    expect(hist.canUndo).toBe(true);
    expect(hist.undo(m)).toBe(true);
    expect(m.startSlots).toHaveLength(0);
    expect(heightAt(m, 0, 0)).toBeLessThan(0.5);
    hist.undo(m);
    expect(heightAt(m, 0, 0)).toBeCloseTo(LAND_HEIGHT, 1);
    expect(hist.undo(m)).toBe(false);
    hist.redo(m);
    hist.redo(m);
    expect(m.startSlots).toHaveLength(1);
    expect(hist.redo(m)).toBe(false);
    hist.undo(m);
    placeItem(m, 'gold', 5, 5);
    hist.commit(m);
    expect(hist.canRedo).toBe(false);
  });
});

describe('editor de mapas — serialização (round-trip)', () => {
  it('codifica/decodifica a grade base64 sem perda', () => {
    const a = new Int8Array([-128, -1, 0, 1, 127, 26, -12]);
    expect(Array.from(decodeHeights(encodeHeights(a)))).toEqual(Array.from(a));
  });

  it('exportar → importar → exportar dá o mesmo JSON (e o texto também)', () => {
    const m = buildSample();
    const json = exportMap(m);
    const again = exportMap(importMap(JSON.parse(JSON.stringify(json))));
    expect(again).toEqual(json);
    expect(exportJson(importMap(exportJson(m)))).toBe(exportJson(m));
  });

  it('o modelo importado reproduz alturas e listas; o gerador painted devolve a mesma altura do editor', () => {
    const m = buildSample();
    const def = exportMap(m);
    const back = importMap(def);
    expect(back.startSlots).toEqual(m.startSlots);
    expect(Array.from(back.h)).toEqual(Array.from(m.h));
    for (const [x, z] of [[0, 0], [-40, -30], [3.3, -17.1], [63, 63], [-70, 10]]) {
      expect(getHeightForMap(def, x, z)).toBeCloseTo(heightAt(m, x, z), 9);
    }
  });

  it('preserva campos extras (roads, splatMasks, decorationDensity)', () => {
    const m = buildSample();
    const def = { ...exportMap(m), roads: [{ points: [[0, 0], [10, 10]] }], decorationDensity: 0.5 };
    const out = exportMap(importMap(def));
    expect(out.roads).toEqual(def.roads);
    expect(out.decorationDensity).toBe(0.5);
  });

  it('importa mapas existentes de qualquer gerador (rasteriza a grade) e mantém as listas', () => {
    for (const id of ['continental-1v1', 'ilhas-4p', 'tutorial']) {
      const src = getMap(id);
      const model = importMap(src);
      expect(model.startSlots).toEqual(src.startSlots);
      expect(model.forests).toEqual(src.forests);
      for (const s of src.startSlots) expect(heightAt(model, s.x, s.z)).toBeGreaterThanOrEqual(1.8);
      // depois de re-exportado, as bases continuam em terra seca e o mapa não tem erros estruturais
      const res = validateMapDef({ ...exportMap(model), id: 'x-' + id }, { connectivity: false });
      expect(res.errors.filter((e) => e.code !== 'woodLow')).toEqual([]);
    }
  });

  it('importForEditing troca o id (o original segue registrado) e rejeita lixo', () => {
    const model = importForEditing(getMap('continental-1v1'));
    expect(model.id).toBe('continental-1v1-editado');
    expect(getMap('continental-1v1')).toBeTruthy();
    expect(() => importMap('{"a":1}')).toThrow();
    expect(() => importMap('não é json')).toThrow();
    expect(() => importMap({ size: 128, terrain: { generator: 'painted', params: { cell: 2, nodes: 5, data: 'AAAA' } } })).toThrow();
  });
});

describe('editor de mapas — validação (mesmo validador do jogo)', () => {
  it('mapa de exemplo é válido (sem erros nem avisos de conectividade)', () => {
    const res = validateMapDef(exportMap(buildSample()));
    expect(res.errors).toEqual([]);
    expect(res.warnings.filter((w) => w.code === 'unreachable' || w.code === 'slotsDisconnected')).toEqual([]);
    expect(res.ok).toBe(true);
  });

  it('acusa erros: poucos jogadores, base na água, id duplicado, poço em terra, acampamento inválido', () => {
    const m = buildSample();
    m.startSlots.pop();
    m.maxPlayers = 2;
    let codes = validateMapDef(exportMap(m)).errors.map((e) => e.code);
    expect(codes).toContain('slotsMin');
    expect(codes).toContain('maxPlayers');

    const m2 = buildSample();
    placeItem(m2, 'start', 0, -20); // em cima do rio
    expect(validateMapDef(exportMap(m2)).errors.map((e) => e.code)).toContain('slotWet');

    const m3 = buildSample('continental-1v1');
    expect(validateMapDef(exportMap(m3)).errors.map((e) => e.code)).toContain('idTaken');
    expect(validateMapDef(exportMap(m3), { checkId: false }).ok).toBe(true);

    const m4 = buildSample();
    placeItem(m4, 'oil', 40, 20);
    codes = validateMapDef(exportMap(m4)).errors.map((e) => e.code);
    expect(codes).toContain('game');

    const m5 = buildSample();
    m5.neutrals[0].guards = 99;
    expect(validateMapDef(exportMap(m5)).errors.map((e) => e.code)).toContain('game');

    const m6 = buildSample();
    m6.id = 'Inválido!';
    expect(validateMapDef(exportMap(m6)).errors.map((e) => e.code)).toContain('idInvalid');
  });

  it('avisos: acampamento perto da base, sem ouro, pouca madeira, ilha desconectada', () => {
    const m = buildSample();
    m.resources = m.resources.filter((r) => r.x > 0);
    m.forests = m.forests.slice(0, 1);
    m.forests[0].count = 2;
    placeItem(m, 'camp', -40, -20);
    applyTerrainBrush(m, 'water', 40, 30, { radius: 10 });
    applyTerrainBrush(m, 'land', 40, 30, { radius: 5 });
    const codes = validateMapDef(exportMap(m)).warnings.map((w) => w.code);
    expect(codes).toEqual(expect.arrayContaining(['campNearSlot', 'slotNoGold', 'woodLow', 'slotsDisconnected']));
  });
});

describe('editor de mapas — mapa exportado carrega no pipeline do jogo', () => {
  it('registerMap → getMap, validateMatchConfig e 600 ticks de partida IA×IA sem exceção', () => {
    const def = JSON.parse(exportJson(buildSample('editor-pipeline')));
    registerMap(def);
    try {
      expect(getMap('editor-pipeline')).toBe(def);
      expect(listMaps().map((x) => x.id)).toContain('editor-pipeline');
      const players = [0, 1].map((i) => ({
        id: i, name: `P${i}`, factionId: i ? 'orc' : 'human', team: i, color: PLAYER_COLORS[i], isAI: true, isLocal: i === 0, startSlot: i
      }));
      const cfg = validateMatchConfig({ mapId: def.id, seed: 5, difficulty: 'normal', headless: true, players });
      const gm = new GameManager(new Terrain(def), null, null, cfg);
      expect(() => { for (let i = 0; i < 600; i++) gm.simStep(SIM_DT); }).not.toThrow();
      for (const p of gm.players) expect(gm.buildings.some((b) => b.ownerId === p.id && !b.isDead)).toBe(true);
      expect(gm.resourceDeposits.filter((d) => d.type === 'gold').length).toBeGreaterThanOrEqual(2);
    } finally {
      unregisterMap('editor-pipeline');
    }
  }, 60000);

  it('o mapa exportado não entra sozinho no registro', () => {
    exportJson(buildSample('editor-fora'));
    expect(getMap('editor-fora')).toBeUndefined();
  });
});

describe('editor de mapas — armazenamento local', () => {
  const fake = () => {
    const d = new Map();
    return { getItem: (k) => (d.has(k) ? d.get(k) : null), setItem: (k, v) => d.set(k, String(v)), removeItem: (k) => d.delete(k) };
  };
  it('salva, lista, carrega e apaga mapas; rascunho sobrevive', () => {
    const st = fake();
    const def = exportMap(buildSample('salvo-1'));
    saveMap(st, def, 100);
    saveMap(st, exportMap(buildSample('salvo-2')), 200);
    expect(listSaved(st).map((x) => x.id)).toEqual(['salvo-2', 'salvo-1']);
    expect(loadSaved(st, 'salvo-1')).toEqual(def);
    deleteSaved(st, 'salvo-1');
    expect(loadSaved(st, 'salvo-1')).toBeNull();
    expect(saveDraft(st, def)).toBe(true);
    expect(loadDraft(st)).toEqual(def);
    expect(loadDraft(fake())).toBeNull();
  });
});
