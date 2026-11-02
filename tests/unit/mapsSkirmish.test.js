import { describe, it, expect } from 'vitest';
import { getMap, listMaps, DEFAULT_MAP_ID } from '../../src/data/maps/index.js';
import { validateMapDef } from '../../src/data/maps/validate.js';
import { getHeightForMap } from '../../src/world/terrainGenerators.js';
import { buildPathfinder, floodFill, isReached } from '../../src/data/maps/generator.js';
import { measureWood, WOOD_TARGET } from '../../tools/lib/woodStats.mjs';
import { SKIRMISH_PRESETS, OIL_AMOUNT, buildSkirmishMap } from '../../tools/lib/skirmishMaps.mjs';

/**
 * SKIRMISH-MAPS · os 6 mapas de Escaramuça gerados pelo assador de costas (`tools/gen-skirmish-maps.mjs`, receita em
 * `tools/lib/skirmishMaps.mjs`) que substituíram os 9 mapas antigos (F8-01). Checagens de dados: formato, tamanho >= 208, biomas
 * distintos (deserto, neve e lava presentes), `validateMapDef` sem erros nem avisos, ouro 7.500, petróleo em dobro (10.000),
 * naval com poços disputados, acampamentos, madeira alcançável e conectividade terrestre entre todas as bases (a IA não ataca por mar).
 */
const SKIRMISH = [
  { id: 'estreito-naval-1v1', players: 2, mode: '1v1', tileset: 'inverno', naval: true },
  { id: 'arquipelago-pontes-4p', players: 4, mode: 'ffa', tileset: 'deserto', naval: true },
  { id: 'vale-rio-1v1', players: 2, mode: '1v1', tileset: 'verdejante', naval: false },
  { id: 'desfiladeiro-lava-1v1', players: 2, mode: '1v1', tileset: 'vulcanico', naval: false, lava: true },
  { id: 'planalto-rocha-4p', players: 4, mode: 'ffa', tileset: 'pedregoso', naval: false },
  { id: 'bosques-antigos-2v2', players: 4, mode: '2v2', tileset: 'pantano', naval: false }
];
const OLD_IDS = ['continental-1v1', 'ilhas-4p', 'estreito-1v1', 'campos-1v1', 'desfiladeiro-1v1', 'vales-2v2', 'bosques-2v2', 'planalto-ffa-4p', 'arquipelago-naval-4p'];
const EXISTING_TILESETS = ['exuberante']; // duelo-continental-1..3 e ilha-unica-1..3

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

describe('SKIRMISH-MAPS · lista da Escaramuça', () => {
  it('os 6 mapas novos estão em listMaps; os 9 antigos saíram da lista (ficam hidden só para as campanhas antigas)', () => {
    const ids = listMaps().map((m) => m.id);
    for (const { id } of SKIRMISH) expect(ids).toContain(id);
    for (const id of OLD_IDS) { expect(ids).not.toContain(id); expect(getMap(id).hidden).toBe(true); }
  });

  it('cobertura de biomas: deserto, neve e lava entre os 6; biomas distintos entre si e dos 6 mapas do MUNDO-7', () => {
    const sets = SKIRMISH.map((s) => getMap(s.id).tileset);
    expect(new Set(sets).size).toBe(6);
    for (const t of ['deserto', 'inverno', 'vulcanico']) expect(sets).toContain(t);
    for (const t of EXISTING_TILESETS) expect(sets).not.toContain(t);
    expect(getMap('desfiladeiro-lava-1v1').lavaGrid).toBeTruthy();
  });

  it('pelo menos 2 navais (poços de petróleo no mar); modos 1v1, 2v2 e FFA presentes', () => {
    const navals = SKIRMISH.filter((s) => s.naval).map((s) => getMap(s.id));
    expect(navals.length).toBeGreaterThanOrEqual(2);
    for (const m of navals) expect(m.resources.filter((r) => r.type === 'oil').length).toBeGreaterThanOrEqual(m.maxPlayers * 2);
    expect(new Set(SKIRMISH.map((s) => s.mode))).toEqual(new Set(['1v1', '2v2', 'ffa']));
  });

  it('o mapa padrão é um mapa selecionável', () => {
    expect(listMaps().map((m) => m.id)).toContain(DEFAULT_MAP_ID);
    expect(DEFAULT_MAP_ID).toBe('duelo-continental-1');
  });

  it('a receita (tools/lib/skirmishMaps.mjs) tem um preset por mapa, com os mesmos ids e nomes', () => {
    for (const s of SKIRMISH) expect(SKIRMISH_PRESETS[s.id].name).toBe(getMap(s.id).name);
    expect(Object.keys(SKIRMISH_PRESETS).sort()).toEqual(SKIRMISH.map((s) => s.id).sort());
  });
});

for (const spec of SKIRMISH) {
  describe(`${spec.id}`, () => {
    const m = getMap(spec.id);

    it('formato: jogadores, tamanho >= 208, bioma, público (não hidden), gerado pelo assador de costas', () => {
      expect(m.id).toBe(spec.id);
      expect(typeof m.name).toBe('string');
      expect(m.maxPlayers).toBe(spec.players);
      expect(m.startSlots).toHaveLength(spec.players);
      expect(m.size).toBeGreaterThanOrEqual(208);
      expect(m.size).toBeLessThanOrEqual(256);
      expect(m.tileset).toBe(spec.tileset);
      expect(m.hidden).toBeFalsy();
      expect(m.terrain.generator).toBe('painted');
      expect(m.meta).toMatchObject({ generator: 'coast', skirmish: spec.id, mode: spec.mode });
    });

    it('validateMapDef sem erros nem avisos (inclui bases ligadas por terra, tudo alcançável por terra)', () => {
      const v = validateMapDef(m, { checkId: false });
      expect(v.errors).toEqual([]);
      expect(v.warnings).toEqual([]);
    });

    it('ouro de 7.500 por mina, uma mina de ouro de expansão por base, pedreiras', () => {
      const gold = m.resources.filter((r) => r.type === 'gold');
      expect(gold.length).toBeGreaterThanOrEqual(spec.players * 2);
      for (const g of gold) expect(g.amount).toBe(7500);
      expect(m.resources.filter((r) => r.type === 'stone').length).toBeGreaterThanOrEqual(spec.players);
    });

    it('petróleo em dobro: todo poço tem 10.000 (o padrão antigo era 5.000); navais têm >= 2 poços por base e 2+ disputados', () => {
      const oil = m.resources.filter((r) => r.type === 'oil');
      for (const o of oil) expect(o.amount).toBe(OIL_AMOUNT);
      if (spec.naval) {
        expect(oil.length).toBeGreaterThanOrEqual(spec.players * 2 + 2);
        for (const o of oil) expect(getHeightForMap(m, o.x, o.z)).toBeLessThan(m.waterLevel);
      } else {
        expect(oil).toHaveLength(0);
      }
    });

    it('acampamentos neutros: >= 2, a >= 25 u de qualquer base, em terra seca', () => {
      const camps = m.neutrals.filter((n) => n.kind === 'camp');
      expect(camps.length).toBeGreaterThanOrEqual(2);
      for (const c of camps) {
        expect(getHeightForMap(m, c.x, c.z)).toBeGreaterThanOrEqual(1.8);
        for (const s of m.startSlots) expect(dist(c, s)).toBeGreaterThanOrEqual(25);
      }
      expect(m.neutrals.some((n) => n.kind === 'critters')).toBe(true);
    });

    it('todas as bases se alcançam por terra (a IA não cruza o mar: o jogo sempre pode terminar)', () => {
      const pf = buildPathfinder(m, 'land');
      const seen = floodFill(pf, m.startSlots[0].x, m.startSlots[0].z);
      for (const s of m.startSlots) expect(isReached(pf, seen, s.x, s.z)).toBe(true);
    });

    if (spec.naval) {
      it('naval: cada base tem costa com água navegável ligada ao mar aberto (poços e Estaleiro)', () => {
        const sea = buildPathfinder(m, 'naval');
        const oil = m.resources.filter((r) => r.type === 'oil');
        const seen = floodFill(sea, oil[0].x, oil[0].z);
        for (const o of oil) expect(isReached(sea, seen, o.x, o.z), `poço (${o.x}, ${o.z}) isolado do mar`).toBe(true);
      });
    }

    it('o JSON é reproduzível pela receita (mesma semente ⇒ mesmo mapa)', () => {
      const again = buildSkirmishMap(spec.id, { seed: m.meta.seedUsed, tries: 1 });
      expect(again.ok).toBe(true);
      expect(JSON.stringify(again.mapDef)).toBe(JSON.stringify(m));
    }, 60000);

    it(`madeira: cada jogador alcança >= ${WOOD_TARGET} por terra a <= 60 u (partidas 1–3)`, () => {
      let min = Infinity;
      for (const seed of [1, 2, 3]) { const r = measureWood(m, { seed }); min = Math.min(min, r.minWood); r.gm.dispose?.(); }
      expect(min).toBeGreaterThanOrEqual(WOOD_TARGET);
    });
  });
}
