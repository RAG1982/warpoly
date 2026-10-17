import { describe, it, expect, beforeAll } from 'vitest';
import { getMap, listMaps, loadAllCampaignMaps } from '../../src/data/maps/index.js';
import { validateMapDef } from '../../src/data/maps/validate.js';
import { buildPathfinder, floodFill, isReached } from '../../src/data/maps/generator.js';
import { getHeightForMap } from '../../src/sim/terrainGenerators.js';
import { TILESETS } from '../../src/data/tilesets.js';
import { decodeBiomeGrid, getBiomeAt, BIOME } from '../../src/data/maps/biome.js';
import { isLavaAt, decodeLavaGrid, encodeLavaGrid } from '../../src/data/maps/lava.js';
import { measureWood, WOOD_TARGET, WOOD_RADIUS } from '../../tools/lib/woodStats.mjs';
import { buildCampaignMap, CAMPAIGN_IDS, CAMPAIGN_NAMES, GOLD_AMOUNT } from '../../tools/lib/campaignMaps.mjs';
import ptBR from '../../src/i18n/pt-BR.json';
import en from '../../src/i18n/en.json';

/**
 * M2-05: mapas de campanha do lote 3 (palcos 7 Brejo Mudo, 8 Fornalha, 9 Miragem), gerados por `tools/gen-campaign-maps.mjs`
 * (receita em `tools/lib/campaignMaps.mjs`). Arquivo próprio para não conflitar com `campaignMaps.test.js` (lotes M2-03/M2-04).
 */
const IDS = ['camp-07-brejo-mudo', 'camp-08-fornalha', 'camp-09-miragem'];

beforeAll(async () => { await loadAllCampaignMaps(); }); // M2-28: mapas de campanha sob demanda

/** Meta de madeira por base: a Fornalha (ilha vulcânica de 128 u jogáveis) tem exceção documentada de 5.000 (README de mapas). */
const WOOD_MIN = { 'camp-07-brejo-mudo': WOOD_TARGET, 'camp-08-fornalha': 5000, 'camp-09-miragem': WOOD_TARGET };
const ANCHORS = {
  'camp-07-brejo-mudo': ['playerStart', 'allyStart', 'brakkaHall', 'boarPen1', 'boarPen2', 'brakkaGold', 'ironDepot', 'beach1', 'seaLanding1', 'beach2', 'seaLanding2', 'expansion1', 'expansion2', 'landingZone'],
  'camp-08-fornalha': ['playerStart', 'enemyStart', 'lavaPass1', 'calderaPeak', 'forge', 'forgeWater', 'sanctum', 'captiveCamp', 'captive1', 'captive2', 'captive3', 'captive4', 'captive5', 'captive6', 'lyraArrival', 'expansion1', 'expansion2', 'landingZone'],
  'camp-09-miragem': ['playerStart', 'enemyStart', 'waterWell1', 'waterWell2', 'waterWell3', 'ruins1', 'ruins2', 'ruins3', 'ruins4', 'fortSite1', 'fortSite2', 'bridgehead1', 'bridgehead1Sea', 'bridgehead2', 'bridgehead2Sea', 'nestSite', 'aviarySite', 'expansion1', 'expansion2', 'landingZone']
};
const WATER = new Set(['seaLanding1', 'seaLanding2', 'forgeWater', 'lyraArrival', 'bridgehead1Sea', 'bridgehead2Sea']);
const hyp = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

function oceanSeen(m, sea) {
  const half = m.playable / 2;
  for (let d = 4; d < 30; d += 2) for (let t = -half; t <= half; t += 4) {
    const p = { x: t, z: -half + d };
    if (sea.isWalkableWorld(p.x, p.z)) return floodFill(sea, p.x, p.z);
  }
  throw new Error('sem oceano');
}

/** Fração do chão (sem o mar) cujo bioma está em `ids`. */
const biomeShare = (m, ids) => {
  const g = decodeBiomeGrid(m.biomeGrid);
  let land = 0, hit = 0;
  for (const v of g) { if (v === BIOME.SEA) continue; land++; if (ids.includes(v)) hit++; }
  return hit / land;
};

describe('M2-05 · registro e formato (palcos 7, 8 e 9)', () => {
  it('a receita conhece os três palcos e traz nome pt-BR e en', () => {
    expect(CAMPAIGN_IDS).toEqual(expect.arrayContaining(IDS));
    for (const id of IDS) {
      expect(ptBR[`map.${id}.name`], id).toBe(CAMPAIGN_NAMES[id].pt);
      expect(en[`map.${id}.name`], id).toBe(CAMPAIGN_NAMES[id].en);
    }
  });

  for (const id of IDS) {
    it(`${id}: hidden (fora da Escaramuça), painted com biomeGrid, tileset existente, 2 vagas, ouro ${GOLD_AMOUNT} por mina`, () => {
      const m = getMap(id);
      expect(m.id).toBe(id);
      expect(m.hidden).toBe(true);
      expect(listMaps().map((x) => x.id)).not.toContain(id);
      expect(m.terrain.generator).toBe('painted');
      expect(decodeBiomeGrid(m.biomeGrid).length).toBe(m.biomeGrid.nodes ** 2);
      expect(TILESETS[m.tileset], m.tileset).toBeDefined();
      expect(m.size).toBeGreaterThanOrEqual(96);
      expect(m.size).toBeLessThanOrEqual(192);
      expect(m.startSlots).toHaveLength(2);
      expect(m.maxPlayers).toBe(2);
      const gold = m.resources.filter((r) => r.type === 'gold');
      expect(gold.length).toBeGreaterThanOrEqual(3);
      for (const g of gold) expect(g.amount).toBe(GOLD_AMOUNT);
    });

    it(`${id}: validateMapDef sem erros e sem avisos (inclusive âncoras e conectividade)`, () => {
      const v = validateMapDef(getMap(id), { checkId: false });
      expect(v.errors).toEqual([]);
      expect(v.warnings).toEqual([]);
    });

    it(`${id}: madeira alcançável a ${WOOD_RADIUS} u >= ${WOOD_MIN[id]} por jogador (sementes de partida 1 e 2)`, () => {
      for (const seed of [1, 2]) {
        const r = measureWood(getMap(id), { seed });
        r.gm.dispose?.();
        for (const p of r.perPlayer) expect(p.wood, `${id} seed ${seed} slot ${p.slot}`).toBeGreaterThanOrEqual(WOOD_MIN[id]);
      }
    });

    it(`${id}: o JSON é reproduzível pela receita (mesma semente ⇒ mesmo mapa)`, () => {
      const m = getMap(id);
      const again = buildCampaignMap(id, { seed: m.meta.seedUsed, tries: 1 });
      expect(again.ok).toBe(true);
      expect(JSON.stringify(again.mapDef)).toBe(JSON.stringify(m));
    });

    it(`${id}: âncoras exigidas existem; as de terra são alcançáveis por terra a partir do slot 0 e as de água ficam no oceano`, () => {
      const m = getMap(id);
      for (const name of ANCHORS[id]) expect(m.anchors[name], `${id}.${name}`).toBeTruthy();
      const land = buildPathfinder(m, 'land');
      const sea = buildPathfinder(m, 'naval');
      const seenLand = floodFill(land, m.startSlots[0].x, m.startSlots[0].z);
      const ocean = oceanSeen(m, sea);
      for (const [name, a] of Object.entries(m.anchors)) {
        if (a.water) {
          expect(WATER.has(name) || /^well\d+$/.test(name), `${id}.${name} é água inesperada`).toBe(true);
          expect(getHeightForMap(m, a.x, a.z), name).toBeLessThan(m.waterLevel);
          expect(isReached(sea, ocean, a.x, a.z), `${id}.${name} no oceano navegável`).toBe(true);
        } else if (!/^ford\d+$/.test(name)) {
          expect(isReached(land, seenLand, a.x, a.z), `${id}.${name} por terra`).toBe(true);
        }
      }
    });
  }
});

describe('M2-05 · Brejo Mudo (palco 7)', () => {
  const id = 'camp-07-brejo-mudo';
  it('pantanosa: tileset pantano, boa parte do chão em pântano, canais com vaus, 5 minas (2 bases + expansões + a do Salão)', () => {
    const m = getMap(id);
    expect(m.tileset).toBe('pantano');
    expect(biomeShare(m, [BIOME.SWAMP])).toBeGreaterThan(0.25);
    expect(m.fords.length).toBeGreaterThanOrEqual(2);
    expect(m.resources.filter((r) => r.type === 'gold')).toHaveLength(5);
  });

  it('o aliado que trai parte do slot 1; Salão de Brakka e Cercados de Javalis longe das duas bases; depósito de ferro atrás da base do aliado', () => {
    const m = getMap(id);
    const [s0, s1] = m.startSlots;
    const a = m.anchors;
    expect(a.allyStart).toEqual({ x: s1.x, z: s1.z });
    expect(hyp(a.brakkaHall, s0)).toBeGreaterThanOrEqual(50);
    expect(hyp(a.brakkaHall, s1)).toBeGreaterThanOrEqual(50);
    for (const k of ['boarPen1', 'boarPen2']) {
      expect(hyp(a[k], a.brakkaHall), k).toBeGreaterThanOrEqual(10);
      expect(hyp(a[k], a.brakkaHall), k).toBeLessThanOrEqual(30);
    }
    expect(hyp(a.boarPen1, a.boarPen2)).toBeGreaterThanOrEqual(10);
    expect(hyp(a.ironDepot, s1)).toBeLessThanOrEqual(40);
    expect(hyp(a.ironDepot, s1)).toBeLessThan(hyp(a.ironDepot, s0));
  });

  it('praias do desembarque da frota (uma por lado) com água navegável do oceano por perto', () => {
    const m = getMap(id);
    const sea = buildPathfinder(m, 'naval');
    const ocean = oceanSeen(m, sea);
    for (const i of [1, 2]) {
      const b = m.anchors[`beach${i}`], w = m.anchors[`seaLanding${i}`];
      expect(w.water).toBe(true);
      expect(hyp(b, w), `praia ${i}`).toBeLessThanOrEqual(22);
      expect(isReached(sea, ocean, w.x, w.z)).toBe(true);
    }
    expect(hyp(m.anchors.beach1, m.anchors.beach2)).toBeGreaterThanOrEqual(40);
    expect(m.anchors.landingZone).toEqual(m.anchors.beach1);
  });
});

describe('M2-05 · Fornalha (palco 8)', () => {
  const id = 'camp-08-fornalha';
  const lavaCells = (m) => decodeLavaGrid(m.lavaGrid.data);

  it('vulcânica de 96–128 u de jogo: tileset vulcanico, lavaGrid com o rio de lava, chão vulcânico/rocha, forja e santuário', () => {
    const m = getMap(id);
    expect(m.tileset).toBe('vulcanico');
    expect(m.playable).toBeGreaterThanOrEqual(96);
    expect(m.playable).toBeLessThanOrEqual(128);
    expect(m.lavaGrid).toBeTruthy();
    expect(lavaCells(m).reduce((n, v) => n + v, 0)).toBeGreaterThan(150);
    expect(biomeShare(m, [BIOME.VOLCANIC, BIOME.ROCK, BIOME.LAVA])).toBeGreaterThan(0.9);
    expect(m.anchors.forge && m.anchors.sanctum).toBeTruthy();
  });

  it('a lava bloqueia terrestres e navais (sem dano) e as passagens de rocha são terra firme ao lado da lava', () => {
    const m = getMap(id);
    const land = buildPathfinder(m, 'land');
    const sea = buildPathfinder(m, 'naval');
    const half = m.size / 2, g = lavaCells(m), n = m.lavaGrid.nodes;
    let checked = 0;
    for (let k = 0; k < g.length && checked < 40; k += 37) {
      if (!g[k]) continue;
      const x = (k % n) - half, z = Math.floor(k / n) - half;
      expect(isLavaAt(m, x, z)).toBe(true);
      expect(land.isWalkableWorld(x, z), `terrestre em (${x}, ${z})`).toBe(false);
      expect(sea.isWalkableWorld(x, z), `naval em (${x}, ${z})`).toBe(false);
      checked++;
    }
    expect(checked).toBeGreaterThan(5);
    const passes = Object.keys(m.anchors).filter((k) => /^lavaPass\d+$/.test(k));
    expect(passes.length).toBeGreaterThanOrEqual(1);
    for (const k of passes) {
      const p = m.anchors[k];
      expect(isLavaAt(m, p.x, p.z), k).toBe(false);
      expect(getHeightForMap(m, p.x, p.z), k).toBeGreaterThanOrEqual(1.8);
      let near = false;
      for (let a = 0; a < 16 && !near; a++) for (const r of [4, 6, 8]) near = near || isLavaAt(m, p.x + Math.cos((a / 16) * Math.PI * 2) * r, p.z + Math.sin((a / 16) * Math.PI * 2) * r);
      expect(near, `${k} junto à lava`).toBe(true);
    }
  });

  it('conectividade: as duas bases e tudo da ficha se alcançam por terra pelas passagens; com a lava fechando as passagens a ilha se parte em duas, cada lado com ouro', () => {
    const m = getMap(id);
    const [s0, s1] = m.startSlots;
    const land = buildPathfinder(m, 'land');
    const seen = floodFill(land, s0.x, s0.z);
    for (const name of ['forge', 'sanctum', 'captiveCamp', 'calderaPeak', 'captive1', 'captive6', 'expansion1', 'expansion2']) {
      expect(isReached(land, seen, m.anchors[name].x, m.anchors[name].z), name).toBe(true);
    }
    expect(isReached(land, seen, s1.x, s1.z)).toBe(true);
    // lava sobre as passagens: o terrestre não atravessa mais
    const closed = structuredClone(m);
    const g = lavaCells(closed).slice();
    const n = closed.lavaGrid.nodes, half = closed.size / 2;
    for (const k of Object.keys(m.anchors).filter((x) => /^lavaPass\d+$/.test(x))) {
      const p = m.anchors[k];
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) if (Math.hypot(i - half - p.x, j - half - p.z) <= 8) g[j * n + i] = 1;
    }
    closed.lavaGrid = { ...closed.lavaGrid, data: encodeLavaGrid(g) };
    const land2 = buildPathfinder(closed, 'land');
    const seenW = floodFill(land2, s0.x, s0.z);
    const seenE = floodFill(land2, s1.x, s1.z);
    expect(isReached(land2, seenW, s1.x, s1.z)).toBe(false);
    expect(isReached(land2, seenW, m.anchors.sanctum.x, m.anchors.sanctum.z)).toBe(false);
    const golds = m.resources.filter((r) => r.type === 'gold');
    expect(golds.filter((p) => isReached(land2, seenW, p.x, p.z)).length).toBeGreaterThanOrEqual(2);
    expect(golds.filter((p) => isReached(land2, seenE, p.x, p.z)).length).toBeGreaterThanOrEqual(2);
    for (const q of m.resources.filter((r) => r.type === 'stone')) expect(isReached(land2, seenW, q.x, q.z) || isReached(land2, seenE, q.x, q.z)).toBe(true);
  });

  it('forja na costa com água do oceano ligada por mar (Estaleiro e Leviatãs), poços de petróleo no mar, santuário e cativeiro do lado dos Clãs', () => {
    const m = getMap(id);
    const [s0, s1] = m.startSlots;
    const sea = buildPathfinder(m, 'naval');
    const ocean = oceanSeen(m, sea);
    const a = m.anchors;
    expect(hyp(a.forge, a.forgeWater)).toBeLessThanOrEqual(22);
    expect(isReached(sea, ocean, a.forgeWater.x, a.forgeWater.z)).toBe(true);
    const wells = m.resources.filter((r) => r.type === 'oil');
    expect(wells.length).toBeGreaterThanOrEqual(4);
    for (const w of wells) expect(isReached(sea, ocean, w.x, w.z), `poço ${w.x},${w.z}`).toBe(true);
    expect(hyp(a.sanctum, s1)).toBeLessThan(hyp(a.sanctum, s0));
    expect(hyp(a.forge, s1)).toBeLessThan(hyp(a.forge, s0));
    for (let i = 1; i <= 6; i++) expect(hyp(a[`captive${i}`], a.captiveCamp)).toBeLessThanOrEqual(6);
    expect(hyp(a.captiveCamp, a.sanctum)).toBeGreaterThanOrEqual(14);
  });

  it('Lyra chega pelo mar a oeste; o Monte Caldeira é o ponto mais alto perto do centro', () => {
    const m = getMap(id);
    const a = m.anchors;
    expect(a.lyraArrival.water).toBe(true);
    expect(a.lyraArrival.x).toBeLessThan(0);
    expect(hyp(a.calderaPeak, { x: 0, z: 0 })).toBeLessThanOrEqual(24);
    expect(getHeightForMap(m, a.calderaPeak.x, a.calderaPeak.z)).toBeGreaterThanOrEqual(3);
  });
});

describe('M2-05 · Miragem (palco 9)', () => {
  const id = 'camp-09-miragem';
  it('deserta: tileset deserto, quase só deserto/estepe/rocha (sem pântano) e oásis de grama em volta de cada poço', () => {
    const m = getMap(id);
    expect(m.tileset).toBe('deserto');
    expect(biomeShare(m, [BIOME.DESERT, BIOME.STEPPE])).toBeGreaterThan(0.6);
    expect(biomeShare(m, [BIOME.SWAMP])).toBe(0);
    for (const k of [1, 2, 3]) {
      const w = m.anchors[`waterWell${k}`];
      expect(getBiomeAt(m, w.x, w.z), `poço ${k}`).toBe(BIOME.GRASS);
    }
  });

  it('três poços afastados entre si e das bases, ruínas, um forte por lado, Ninho do lado dos Clãs e Aviário do lado da Liga', () => {
    const m = getMap(id);
    const [s0, s1] = m.startSlots;
    const a = m.anchors;
    const wells = [1, 2, 3].map((i) => a[`waterWell${i}`]);
    for (let i = 0; i < 3; i++) {
      expect(hyp(wells[i], s0)).toBeGreaterThanOrEqual(30);
      expect(hyp(wells[i], s1)).toBeGreaterThanOrEqual(30);
      for (let j = i + 1; j < 3; j++) expect(hyp(wells[i], wells[j])).toBeGreaterThanOrEqual(24);
    }
    expect(hyp(wells[0], s0)).toBeLessThanOrEqual(hyp(wells[0], s1));
    for (const k of [1, 2, 3, 4]) expect(a[`ruins${k}`]).toBeTruthy();
    expect(hyp(a.fortSite1, s0)).toBeLessThan(hyp(a.fortSite1, s1));
    expect(hyp(a.fortSite2, s1)).toBeLessThan(hyp(a.fortSite2, s0));
    expect(hyp(a.nestSite, s1)).toBeLessThan(hyp(a.nestSite, s0));
    expect(hyp(a.aviarySite, s0)).toBeLessThan(hyp(a.aviarySite, s1));
  });

  it('cabeça de ponte nos dois lados: praia a <= 44 u da base com água do oceano ligada por mar (barcaças e reforços navais)', () => {
    const m = getMap(id);
    const sea = buildPathfinder(m, 'naval');
    const ocean = oceanSeen(m, sea);
    m.startSlots.forEach((s, i) => {
      const b = m.anchors[`bridgehead${i + 1}`], w = m.anchors[`bridgehead${i + 1}Sea`];
      expect(hyp(b, s), `cabeça de ponte ${i + 1}`).toBeLessThanOrEqual(44);
      expect(hyp(b, w)).toBeLessThanOrEqual(22);
      expect(isReached(sea, ocean, w.x, w.z)).toBe(true);
    });
    expect(m.anchors.landingZone).toEqual(m.anchors.bridgehead1);
  });
});
