import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  createModel, applyTerrainBrush, applyBiomeBrush, fillBiomeRegion, placeItem, importMap, exportMap, exportLayerJson, importLayer,
  regenerateCoast, replaceModel, layerAt, heightAt, History, LAVA_HEIGHT, PASSAGE_MIN_HEIGHT
} from '../../src/editor/mapModel.js';
import { analyzeLava } from '../../src/editor/gridCheck.js';
import { BIOME } from '../../src/data/maps/biome.js';
import { isLavaAt } from '../../src/data/maps/lava.js';
import { getBiomeAt } from '../../src/data/maps/biome.js';
import { validateMapDef } from '../../src/data/maps/validate.js';

const fornalha = () => JSON.parse(readFileSync(new URL('../../src/data/maps/camp-08-fornalha.json', import.meta.url), 'utf8'));

/** Terra com um córrego de lava vertical em x = 0 e uma base de cada lado. */
function lavaMap({ passage = null, width = 6 } = {}) {
  const m = createModel({ size: 128, fill: 'land', id: 'lava-teste' });
  for (let z = -66; z <= 66; z += 2) applyTerrainBrush(m, 'lava', 0, z, { radius: width / 2 });
  if (passage) applyTerrainBrush(m, 'passage', 0, passage.z, { radius: passage.r });
  placeItem(m, 'start', -35, 0);
  placeItem(m, 'start', 35, 0);
  placeItem(m, 'gold', -35, 12);
  placeItem(m, 'gold', 35, 12);
  return m;
}

describe('editor M2-09 — pincéis de lava e passagem', () => {
  it('lava liga o bit, baixa o leito e passa pelo validador do jogo (isLavaAt)', () => {
    const m = createModel({ size: 128 });
    expect(m.lava).toBeNull();
    expect(applyTerrainBrush(m, 'lava', 10, 10, { radius: 4 })).toBe(true);
    expect(layerAt(m, m.lava, 10, 10)).toBe(1);
    expect(layerAt(m, m.lava, 30, 30)).toBe(0);
    expect(heightAt(m, 10, 10)).toBeCloseTo(LAVA_HEIGHT, 1);
    expect(isLavaAt(exportMap(m), 10, 10)).toBe(true);
    expect(isLavaAt(exportMap(m), 30, 30)).toBe(false);
  });

  it('passagem apaga a lava no raio e ergue o leito para >= 1,05 (caminhável)', () => {
    const m = lavaMap();
    expect(layerAt(m, m.lava, 0, 0)).toBe(1);
    applyTerrainBrush(m, 'passage', 0, 0, { radius: 5 });
    expect(layerAt(m, m.lava, 0, 0)).toBe(0);
    expect(heightAt(m, 0, 0)).toBeGreaterThanOrEqual(PASSAGE_MIN_HEIGHT - 0.05);
    expect(layerAt(m, m.lava, 0, 30)).toBe(1); // fora do raio continua lava
  });

  it('com biomeGrid, lava e passagem mantêm o bioma coerente (LAVA / ROCK)', () => {
    const m = createModel({ size: 128 });
    applyBiomeBrush(m, 0, 0, { radius: 3, biome: BIOME.GRASS });
    applyTerrainBrush(m, 'lava', 20, 0, { radius: 4 });
    const def = exportMap(m);
    expect(getBiomeAt(def, 20, 0)).toBe(BIOME.LAVA);
    applyTerrainBrush(m, 'passage', 20, 0, { radius: 4 });
    expect(getBiomeAt(exportMap(m), 20, 0)).toBe(BIOME.ROCK);
  });
});

describe('editor M2-09 — pincel e balde de bioma', () => {
  it('pincel cria o biomeGrid (mar abaixo da água, resto grama) e pinta o disco', () => {
    const m = createModel({ size: 128 });
    expect(applyBiomeBrush(m, 8, 8, { radius: 5, biome: BIOME.DESERT })).toBe(true);
    expect(layerAt(m, m.biome, 8, 8)).toBe(BIOME.DESERT);
    expect(layerAt(m, m.biome, -40, -40)).toBe(BIOME.GRASS);
    expect(applyBiomeBrush(m, 8, 8, { radius: 5, biome: BIOME.DESERT })).toBe(false); // sem mudança
    expect(validateMapDef(exportMap(m)).errors.filter((e) => e.code === 'biomeData')).toEqual([]);
  });

  it('bioma inválido lança', () => {
    expect(() => applyBiomeBrush(createModel({ size: 96 }), 0, 0, { biome: 99 })).toThrow();
  });

  it('balde troca só a região contígua', () => {
    const m = createModel({ size: 96 });
    applyBiomeBrush(m, -20, 0, { radius: 4, biome: BIOME.SNOW });
    applyBiomeBrush(m, 20, 0, { radius: 4, biome: BIOME.SNOW });
    const n = fillBiomeRegion(m, -20, 0, BIOME.SWAMP);
    expect(n).toBeGreaterThan(5);
    expect(layerAt(m, m.biome, -20, 0)).toBe(BIOME.SWAMP);
    expect(layerAt(m, m.biome, 20, 0)).toBe(BIOME.SNOW);
    expect(fillBiomeRegion(m, -20, 0, BIOME.SWAMP)).toBe(0);
  });

  it('balde com LAVA liga também o bit de lava', () => {
    const m = createModel({ size: 96 });
    applyBiomeBrush(m, 0, 0, { radius: 3, biome: BIOME.ROCK });
    fillBiomeRegion(m, 30, 30, BIOME.LAVA);
    expect(layerAt(m, m.lava, 30, 30)).toBe(1);
    expect(layerAt(m, m.lava, 0, 0)).toBe(0);
  });
});

describe('editor M2-09 — round-trip de lavaGrid/biomeGrid (camp-08-fornalha)', () => {
  it('importar e exportar reproduz as grades e o terreno sem diferença', () => {
    const def = fornalha();
    const out = exportMap(importMap(def));
    expect(out.lavaGrid).toEqual(def.lavaGrid);
    expect(out.biomeGrid).toEqual(def.biomeGrid);
    expect(out.terrain).toEqual(def.terrain);
  });

  it('pintar lava + passagem, exportar e reimportar: idêntico; export é estável', () => {
    const m = importMap(fornalha());
    applyTerrainBrush(m, 'lava', -30, -30, { radius: 6 });
    applyTerrainBrush(m, 'passage', -30, -30, { radius: 3 });
    applyBiomeBrush(m, 40, 40, { radius: 5, biome: BIOME.SNOW });
    m.id = 'fornalha-editada';
    const once = exportMap(m);
    expect(once.lavaGrid.data).not.toEqual(fornalha().lavaGrid.data);
    const again = exportMap(importMap(JSON.parse(JSON.stringify(once))));
    expect(again).toEqual(once);
    expect(JSON.stringify(again)).toBe(JSON.stringify(once));
    expect(validateMapDef(once).errors).toEqual([]);
  });

  it('exportar/importar só a grade: aceita com e sem invólucro e rejeita tamanho errado', () => {
    const m = importMap(fornalha());
    const wrapped = exportLayerJson(m, 'biome');
    expect(JSON.parse(wrapped).biomeGrid).toEqual(fornalha().biomeGrid);
    const other = importMap(fornalha());
    applyBiomeBrush(other, 0, 0, { radius: 8, biome: BIOME.ICE });
    importLayer(other, 'biome', wrapped);
    expect(exportMap(other).biomeGrid).toEqual(fornalha().biomeGrid);
    importLayer(other, 'lava', JSON.stringify(fornalha().lavaGrid)); // sem invólucro
    expect(exportMap(other).lavaGrid).toEqual(fornalha().lavaGrid);
    const small = createModel({ size: 96 });
    expect(() => importLayer(small, 'biome', wrapped)).toThrow();
    expect(() => importLayer(small, 'lava', { lavaGrid: { cell: 1, nodes: 3, data: 'AAAA' } })).toThrow();
    expect(() => exportLayerJson(small, 'lava')).toThrow();
  });
});

describe('editor M2-09 — desfazer/refazer das camadas', () => {
  it('undo/redo restauram lava e bioma', () => {
    const m = createModel({ size: 96 });
    const hist = new History(m);
    applyTerrainBrush(m, 'lava', 0, 0, { radius: 5 });
    hist.commit(m);
    applyBiomeBrush(m, 20, 20, { radius: 4, biome: BIOME.SAND });
    hist.commit(m);
    expect(layerAt(m, m.biome, 20, 20)).toBe(BIOME.SAND);
    hist.undo(m);
    expect(m.biome).toBeNull();
    expect(layerAt(m, m.lava, 0, 0)).toBe(1);
    hist.undo(m);
    expect(m.lava).toBeNull();
    expect(m.biome).toBeNull();
    hist.redo(m);
    hist.redo(m);
    expect(layerAt(m, m.biome, 20, 20)).toBe(BIOME.SAND);
    expect(m.lava.data).toBeInstanceOf(Uint8Array);
  });
});

describe('editor M2-09 — regenerar costa', () => {
  it('preset + semente gera um mapa válido, determinístico, com biomeGrid; mantém id e nome', () => {
    const base = createModel({ size: 128, id: 'meu-id', name: 'Meu nome' });
    const a = regenerateCoast(base, 'duelo-continental', 1);
    const b = regenerateCoast(base, 'duelo-continental', 1);
    expect(a.ok).toBe(true);
    expect(a.model.id).toBe('meu-id');
    expect(a.model.name).toBe('Meu nome');
    expect(a.model.biome).not.toBeNull();
    expect(a.model.startSlots.length).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(exportMap(a.model))).toBe(JSON.stringify(exportMap(b.model)));
    expect(validateMapDef(exportMap(a.model)).errors).toEqual([]);
    expect(() => regenerateCoast(base, 'nao-existe', 1)).toThrow();
  }, 30000);

  it('replaceModel troca o conteúdo no mesmo objeto e o histórico desfaz', () => {
    const m = createModel({ size: 96, id: 'x' });
    const hist = new History(m);
    const r = regenerateCoast(m, 'duelo-continental', 2);
    replaceModel(m, r.model);
    hist.commit(m);
    expect(m.size).toBe(224);
    hist.undo(m);
    expect(m.size).toBe(96);
    expect(m.biome).toBeNull();
  }, 30000);
});

describe('editor M2-09 — avisos de lava (gridCheck)', () => {
  it('sem lava: nenhum aviso', () => {
    expect(analyzeLava(createModel({ size: 96 }))).toEqual([]);
  });

  it('lava separando as bases sem passagem: aviso lavaNoPassage', () => {
    const issues = analyzeLava(lavaMap());
    expect(issues.map((i) => i.code)).toContain('lavaNoPassage');
  });

  it('passagem larga liga as bases e cala o aviso; passagem estreita avisa passageNarrow', () => {
    const wide = analyzeLava(lavaMap({ passage: { z: 0, r: 8 } })).map((i) => i.code);
    expect(wide).not.toContain('lavaNoPassage');
    expect(wide).not.toContain('passageNarrow');
    const narrow = analyzeLava(lavaMap({ passage: { z: 0, r: 2.5 } })).map((i) => i.code);
    expect(narrow).not.toContain('lavaNoPassage');
    expect(narrow).toContain('passageNarrow');
  });

  it('lava isolada pequena e bosque sobre lava', () => {
    const m = createModel({ size: 128 });
    applyTerrainBrush(m, 'lava', 20, 20, { radius: 1 });
    expect(analyzeLava(m).map((i) => i.code)).toContain('lavaIsolated');
    const f = createModel({ size: 128 });
    applyTerrainBrush(f, 'lava', 0, 0, { radius: 8 });
    placeItem(f, 'forest', 0, 0, { count: 5, radius: 3 });
    const e = analyzeLava(f).find((i) => i.code === 'lavaForest');
    expect(e.level).toBe('error');
  });

  it('camp-08-fornalha, tal como está, não gera erro nem aviso de lava', () => {
    expect(analyzeLava(importMap(fornalha()))).toEqual([]);
  });
});
