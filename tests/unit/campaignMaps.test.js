import { describe, it, expect, beforeAll } from 'vitest';
import { getMap, listMaps, loadAllCampaignMaps } from '../../src/data/maps/index.js';
import { validateMapDef } from '../../src/data/maps/validate.js';
import { buildPathfinder, floodFill, isReached } from '../../src/data/maps/generator.js';
import { getHeightForMap } from '../../src/sim/terrainGenerators.js';
import { TILESETS } from '../../src/data/tilesets.js';
import { decodeBiomeGrid } from '../../src/data/maps/biome.js';
import { measureWood, WOOD_RADIUS } from '../../tools/lib/woodStats.mjs';
import { buildCampaignMap, CAMPAIGN_IDS, CAMPAIGN_NAMES, GOLD_AMOUNT, CAMPAIGN_WOOD_FLOOR, PEDRA_BIG_GOLD, GEADA_LIGHT_GOLD } from '../../tools/lib/campaignMaps.mjs';
import ptBR from '../../src/i18n/pt-BR.json';
import en from '../../src/i18n/en.json';

/**
 * M2-03: mapas de campanha do lote 1 (palcos 1 Baía de Aurelan, 2 Pouso do Encontro, 3 Pedra-Mãe) e, da M2-04, os palcos
 * 4 Baixio do Breu, 5 Cerne Verde e 6 A Geada, gerados por `tools/gen-campaign-maps.mjs` (receita em `tools/lib/campaignMaps.mjs`).
 * Os palcos 2 a 6 servem às duas campanhas (slot 0 = lado da Liga de Aurelan, slot 1 = lado dos Clãs do Cinzal). A Geada tem 4 vagas
 * (jogador, Lanças Quebradas, Sal Cinzento e o aliado Brumar).
 */
const IDS = ['camp-01-baia-de-aurelan', 'camp-02-pouso-do-encontro', 'camp-03-pedra-mae', 'camp-05-cerne-verde', 'camp-06-a-geada', 'camp-11-estepe-do-vento', 'camp-12-cabo-ferrugem']; // M3-05: o palco 4 (dois continentes isolados) tem os seus testes em campaignM04.test.js; o palco 10 (M3-11, naval) em campaignM10.test.js
const SLOTS = { 'camp-06-a-geada': 4, 'camp-11-estepe-do-vento': 3 }; // as demais têm 2 vagas

// M2-28: os mapas de campanha são carregados sob demanda (chunks); os testes os carregam antes de usar `getMap`.
beforeAll(async () => { await loadAllCampaignMaps(); });
const MIN_ANCHORS = {
  'camp-01-baia-de-aurelan': ['playerStart', 'enemyStart', 'goldMine1', 'goldMine2', 'neutralCamp1', 'landingZone', 'muralFenda', 'shipHorizon', 'orcSails', 'banditCamp1', 'banditCamp2', 'banditCamp3'],
  'camp-02-pouso-do-encontro': ['playerStart', 'enemyStart', 'goldMine1', 'landingZone', 'pier1', 'pier1Water', 'pier2', 'pier2Water', 'logFort', 'lighthouse', 'emissary1', 'emissary2', 'patrol1', 'patrol2', 'patrol3', 'expansion1', 'expansion2'],
  'camp-03-pedra-mae': ['playerStart', 'enemyStart', 'colonyHall', 'colonyGold1', 'bridgeheadGold', 'passA', 'passB', 'passAPlayer', 'passBPlayer', 'wallA1', 'wallA2', 'wallA3', 'wallB1', 'wallB2', 'wallB3', 'towerA1', 'towerA2', 'towerB1', 'towerB2', 'orcMuster', 'shrine1', 'captive1', 'beach1', 'beach2', 'beach3', 'seaLanding1', 'seaLanding2', 'seaLanding3', 'fort1', 'fort2', 'fort3', 'bridgehead', 'bridgeheadSea', 'landingZone'],
  'camp-04-baixio-do-breu': ['playerStart', 'enemyStart', 'well1', 'well2', 'well3', 'well4', 'shipyard1', 'shipyard1Water', 'shipyard2', 'shipyard2Water', 'wreck1', 'wreck2', 'wreck3', 'fleetStart1', 'fleetStart2', 'fleetMid'],
  'camp-05-cerne-verde': ['playerStart', 'enemyStart', 'goldMine1', 'sacredGrove', 'gryphonNest', 'clearing1', 'clearing2', 'clearing3', 'lumberHall1', 'lumberHall2', 'orenStart', 'ford1', 'landingZone'],
  'camp-06-a-geada': ['playerStart', 'enemyStart', 'enemy1Start', 'enemy2Start', 'allyStart', 'lighthouse', 'lightSea', 'lightSouth', 'lightTower1', 'lightTower2', 'lightGold1', 'lightGold2', 'enemy1Fort', 'fortTower1', 'fortTower2', 'fortTower3', 'fortTower4', 'allyFort', 'allyTower1', 'allyTower2', 'allyHeroStart', 'convoyStart', 'convoyAmbush', 'convoyEnd', 'expansion1', 'expansion2', 'expansion3', 'expansion4', 'ruins1', 'captive1', 'iceDock', 'iceDockSea', 'lake1', 'lake2', 'lake3'],
  'camp-11-estepe-do-vento': ['playerStart', 'enemyStart', 'colonyMark', 'skarnStart', 'hurganStart', 'landingZone', 'reinforceSea', 'convoyStart', 'convoyEnd', 'raid1', 'raid2', 'raid3', 'dissidentClan', 'expansion1', 'expansion2', 'expansion3'],
  'camp-12-cabo-ferrugem': ['playerStart', 'enemyStart', 'bastion', 'bastionHall', 'strait', 'dock1', 'dock2', 'dock3', 'dockGuard1', 'dockGuard2', 'dockGuard3', 'fleetStart', 'fleetStart2', 'orcFleetStart', 'orcFleetStart2', 'assaultSea', 'assaultBeach', 'landingZone', 'reinforceSea', 'bossStart', 'waveStart1', 'waveStart2', 'raid3', 'passA', 'passB', 'wallA1', 'wallA4', 'wallB1', 'wallB4', 'towerA1', 'towerA2', 'towerB1', 'towerB2', 'ballistaA', 'ballistaB', 'well5', 'well6', 'isletCaptive', 'isletRuin', 'expansion1', 'expansion2']
};
const WATER = new Set(['shipHorizon', 'orcSails', 'pier1Water', 'pier2Water', 'seaLanding1', 'seaLanding2', 'seaLanding3', 'bridgeheadSea', 'well1', 'well2', 'well3', 'well4', 'shipyard1Water', 'shipyard2Water', 'wreck1', 'wreck2', 'wreck3', 'fleetStart1', 'fleetStart2', 'fleetMid', 'unloadSea', 'bargeStart1', 'bargeStart2', 'reinforceSea', 'strait', 'fleetStart', 'lightSea', 'iceDockSea', 'well5', 'well6', 'siegeFleetStart', 'siegeFleetStart2', 'orcFleetStart', 'orcFleetStart2', 'assaultSea']); // M3-13: frotas orcs e praia do assalto no mar; M3-12: a Estepe do Vento tem 6 poços e a frota de cerco no mar
const isLake = (name) => /^lake\d$/.test(name); // lago congelado (A Geada): água rasa interior, fora do oceano navegável
const hyp = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

function oceanSeen(m, sea) {
  const half = m.playable / 2;
  for (let d = 4; d < 30; d += 2) for (let t = -half; t <= half; t += 4) {
    const p = { x: t, z: -half + d };
    if (sea.isWalkableWorld(p.x, p.z)) return floodFill(sea, p.x, p.z);
  }
  throw new Error('sem oceano');
}

describe('M2-03 · registro e formato', () => {
  it('a receita conhece os palcos de campanha e traz nome pt-BR e en', () => {
    expect(CAMPAIGN_IDS).toEqual(expect.arrayContaining(IDS)); // M2-05: a receita tem também os palcos 7-9 (tests/unit/campaignMapsM205.test.js)
    for (const id of IDS) {
      expect(CAMPAIGN_NAMES[id].pt.length).toBeGreaterThan(3);
      expect(ptBR[`map.${id}.name`], id).toBe(CAMPAIGN_NAMES[id].pt);
      expect(en[`map.${id}.name`], id).toBe(CAMPAIGN_NAMES[id].en);
    }
  });

  for (const id of IDS) {
    it(`${id}: registrado como hidden (fora da Escaramuça), painted com biomeGrid, tileset existente, tamanho 96–320, 2 vagas (3 no 11, 4 na Geada)`, () => {
      const m = getMap(id);
      expect(m, id).toBeTruthy();
      expect(m.id).toBe(id);
      expect(m.hidden).toBe(true);
      expect(listMaps().map((x) => x.id)).not.toContain(id);
      expect(listMaps({ includeHidden: true }).map((x) => x.id)).toContain(id);
      expect(m.terrain.generator).toBe('painted');
      expect(m.biomeGrid).toBeTruthy();
      expect(decodeBiomeGrid(m.biomeGrid).length).toBe(m.biomeGrid.nodes ** 2);
      expect(TILESETS[m.tileset], m.tileset).toBeDefined();
      expect(m.size).toBeGreaterThanOrEqual(96);
      expect(m.size).toBeLessThanOrEqual(['camp-11-estepe-do-vento', 'camp-12-cabo-ferrugem'].includes(id) ? 384 : 320); // M3-06b: camp-05 tem 320; M3-12: a Estepe do Vento tem 352; M3-13: o Cabo Ferrugem tem 384
      expect(m.startSlots).toHaveLength(SLOTS[id] ?? 2);
      expect(m.maxPlayers).toBe(SLOTS[id] ?? 2);
    });

    it(`${id}: validateMapDef sem erros e sem avisos (inclusive âncoras e conectividade)`, () => {
      const v = validateMapDef(getMap(id), { checkId: false });
      expect(v.errors).toEqual([]);
      expect(v.warnings).toEqual([]);
    });

    it(`${id}: toda mina de ouro tem ${GOLD_AMOUNT}`, () => {
      const gold = getMap(id).resources.filter((r) => r.type === 'gold');
      expect(gold.length).toBeGreaterThanOrEqual(2);
      for (const g of gold) expect(g.amount).toBe(id === 'camp-03-pedra-mae' && g.amount === PEDRA_BIG_GOLD ? PEDRA_BIG_GOLD : id === 'camp-06-a-geada' && g.amount === GEADA_LIGHT_GOLD ? GEADA_LIGHT_GOLD : GOLD_AMOUNT); // M3-04: a mina grande da Pedra-Mãe tem 12.000; M3-07: os 2 veios do Farol (A Geada) têm 5.000
    });

    it(`${id}: madeira alcançável a ${WOOD_RADIUS} u >= ${CAMPAIGN_WOOD_FLOOR} por jogador (sementes de partida 1 e 2)`, () => {
      for (const seed of [1, 2]) {
        const r = measureWood(getMap(id), { seed });
        r.gm.dispose?.();
        for (const p of r.perPlayer) expect(p.wood, `${id} seed ${seed} slot ${p.slot}`).toBeGreaterThanOrEqual(CAMPAIGN_WOOD_FLOOR);
      }
    });

    it(`${id}: o JSON é reproduzível pela receita (mesma semente ⇒ mesmo mapa)`, () => {
      const m = getMap(id);
      const again = buildCampaignMap(id, { seed: m.meta.seedUsed, tries: 1 });
      expect(again.ok).toBe(true);
      expect(JSON.stringify(again.mapDef)).toBe(JSON.stringify(m));
    });
  }
});

describe('M2-03 · âncoras da ficha de cada missão', () => {
  for (const id of IDS) {
    it(`${id}: âncoras exigidas existem; as de terra são alcançáveis por terra a partir do slot 0 e as de água ficam no oceano`, () => {
      const m = getMap(id);
      for (const name of MIN_ANCHORS[id]) expect(m.anchors[name], `${id}.${name}`).toBeTruthy();
      const land = buildPathfinder(m, 'land');
      const sea = buildPathfinder(m, 'naval');
      const seenLand = floodFill(land, m.startSlots[0].x, m.startSlots[0].z);
      const ocean = oceanSeen(m, sea);
      for (const [name, a] of Object.entries(m.anchors)) {
        if (a.water && isLake(name)) {
          expect(getHeightForMap(m, a.x, a.z), name).toBeLessThan(m.waterLevel);
          expect(getHeightForMap(m, a.x, a.z), `${name}: gelo raso, nem navio nem tropa`).toBeGreaterThan(0.1);
        } else if (a.water) {
          expect(WATER.has(name), `${id}.${name} é água inesperada`).toBe(true);
          expect(getHeightForMap(m, a.x, a.z), name).toBeLessThan(m.waterLevel);
          expect(isReached(sea, ocean, a.x, a.z), `${id}.${name} no oceano navegável`).toBe(true);
        } else if (id === 'camp-12-cabo-ferrugem' && /^islet/.test(name)) {
          expect(getHeightForMap(m, a.x, a.z), `${name}: ilhota seca`).toBeGreaterThan(m.waterLevel); // M3-13: ilhotas só se alcançam de barco
        } else {
          expect(isReached(land, seenLand, a.x, a.z), `${id}.${name} por terra`).toBe(true);
        }
      }
    });
  }

  it('Baía de Aurelan: reduto de 3 acampamentos de bandidos (âncoras banditCamp1..3) juntos (≤ 18 u), ≥ 70 u da base do jogador e Mural da Fenda em terra', () => {
    const m = getMap('camp-01-baia-de-aurelan');
    const camps = m.neutrals.filter((n) => n.kind === 'camp');
    expect(camps).toHaveLength(3);
    camps.forEach((c, i) => {
      expect(c.guards).toBeGreaterThanOrEqual(6);
      expect(c.reward.gold).toBeGreaterThan(0);
      expect(m.anchors[`banditCamp${i + 1}`]).toEqual({ x: c.x, z: c.z });
      expect(m.anchors[`neutralCamp${i + 1}`]).toEqual({ x: c.x, z: c.z });
      expect(hyp(c, m.startSlots[0])).toBeGreaterThanOrEqual(70);
      expect(hyp(c, m.startSlots[1])).toBeGreaterThanOrEqual(24);
      for (let j = i + 1; j < camps.length; j++) expect(hyp(c, camps[j])).toBeLessThanOrEqual(18);
    });
    expect(hyp(m.anchors.muralFenda, m.anchors.playerStart)).toBeGreaterThan(30);
    for (const c of camps) expect(hyp(m.anchors.muralFenda, c)).toBeGreaterThan(20);
  });

  it('Pouso do Encontro: rio com vaus, Cais de cada lado na costa com água navegável, forte de troncos entre as bases e Torre da Fenda numa ponta', () => {
    const m = getMap('camp-02-pouso-do-encontro');
    expect(m.fords.length).toBeGreaterThanOrEqual(1);
    const sea = buildPathfinder(m, 'naval');
    for (const k of ['pier1', 'pier2']) {
      expect(hyp(m.anchors[k], m.anchors[`${k}Water`]), k).toBeLessThanOrEqual(16);
      expect(sea.nearNavigable(m.anchors[`${k}Water`].x, m.anchors[`${k}Water`].z, 1.5), k).toBe(true);
    }
    expect(hyp(m.anchors.pier1, m.startSlots[0])).toBeLessThan(hyp(m.anchors.pier1, m.startSlots[1])); // o Cais 1 é da Liga (slot 0)
    expect(hyp(m.anchors.pier2, m.startSlots[1])).toBeLessThan(hyp(m.anchors.pier2, m.startSlots[0])); // o Cais 2 é dos Clãs (slot 1)
    for (const s of m.startSlots) expect(hyp(m.anchors.logFort, s)).toBeGreaterThanOrEqual(30);
    expect(hyp(m.anchors.lighthouse, m.anchors.logFort)).toBeGreaterThanOrEqual(25);
    expect(m.anchors.landingZone).toEqual(m.anchors.pier1);
    expect(m.resources.filter((r) => r.type === 'gold')).toHaveLength(4); // 2 por lado: com só 2 minas o ouro acabava e o soak travava
  });

  it('Pedra-Mãe: minas iniciais a ~32 u do Paço (não coladas), mina grande atrás dos desfiladeiros, 3 praias de pouso afastadas com ponto no mar ligado por mar, 3 fortes e cabeça de ponte', () => {
    const m = getMap('camp-03-pedra-mae');
    expect(m.tileset).toBe('pedregoso');
    const hall = m.anchors.colonyHall;
    expect(hall).toEqual({ x: m.startSlots[0].x, z: m.startSlots[0].z });
    // M3-04: a mina inicial de cada base foi afastada (era a ~15–18 u do Centro; agora ~32 u de centro a centro, ~23 u de borda a borda)
    for (const s of m.startSlots) {
      const near = m.resources.filter((r) => r.type === 'gold').map((r) => hyp(r, s)).sort((a, b) => a - b)[0];
      expect(near, 'mina mais próxima do Centro').toBeGreaterThanOrEqual(28);
      expect(near).toBeLessThanOrEqual(36);
    }
    const beaches = [1, 2, 3].map((i) => m.anchors[`beach${i}`]);
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) expect(hyp(beaches[i], beaches[j])).toBeGreaterThanOrEqual(40);
    const sea = buildPathfinder(m, 'naval');
    const ocean = oceanSeen(m, sea);
    for (let i = 1; i <= 3; i++) {
      const w = m.anchors[`seaLanding${i}`], b = m.anchors[`beach${i}`], f = m.anchors[`fort${i}`];
      expect(w.water).toBe(true);
      expect(hyp(w, b), `praia ${i}`).toBeLessThanOrEqual(20);
      expect(isReached(sea, ocean, w.x, w.z), `ponto no mar ${i}`).toBe(true);
      expect(hyp(f, b), `forte ${i} perto da praia`).toBeLessThanOrEqual(30);
      expect(hyp(hall, b), `praia ${i} a distância de ataque do Paço`).toBeGreaterThan(30);
      expect(hyp(hall, b)).toBeLessThan(80);
    }
    expect(hyp(m.anchors.bridgehead, m.startSlots[1])).toBeLessThanOrEqual(40);
    expect(m.anchors.landingZone).toEqual(m.anchors.beach1);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------
// M3-X3: minas de ouro iniciais dos palcos 1 e 2 afastadas do Centro (como a Pedra-Mãe)
// ---------------------------------------------------------------------------------------------------------------------------
describe('M3-X3 · minas iniciais dos palcos 1 e 2 afastadas do Centro', () => {
  // Centro (Paço) de raio ≈ 5,5 u e mina de raio ≈ 3,4 u: borda a borda = centro a centro − 8,9 u
  const EDGE = 8.9;
  for (const id of ['camp-01-baia-de-aurelan', 'camp-02-pouso-do-encontro']) {
    it(`${id}: a mina inicial de cada base fica a 30–34 u do Centro (centro a centro; borda a borda ≈ 22–30 u), com a mesma distância nos dois lados (±2 u)`, () => {
      const m = getMap(id);
      // a mina inicial é a âncora goldMine1/2 (as de expansão ficam mais longe ou são outras âncoras)
      const init = [m.anchors.goldMine1, m.anchors.goldMine2];
      for (const g of init) expect(m.resources.some((r) => r.type === 'gold' && r.x === g.x && r.z === g.z), 'âncora de mina sem jazida').toBe(true);
      const d = m.startSlots.map((s, k) => hyp(init[k], s));
      for (const v of d) {
        expect(v).toBeGreaterThanOrEqual(30);
        expect(v).toBeLessThanOrEqual(34);
        expect(v - EDGE).toBeGreaterThanOrEqual(21);
        expect(v - EDGE).toBeLessThanOrEqual(30);
      }
      expect(Math.abs(d[0] - d[1])).toBeLessThanOrEqual(2);
    });

    it(`${id}: a mina inicial está em terra firme, sem bosque por cima, com caminho de terra seca até o Centro`, () => {
      const m = getMap(id);
      for (const [k, s] of m.startSlots.entries()) {
        const g = m.anchors[`goldMine${k + 1}`];
        expect(getHeightForMap(m, g.x, g.z), 'mina sobre terra').toBeGreaterThanOrEqual(1.95);
        for (const f of m.forests) expect(hyp(g, f), 'bosque sobre a mina').toBeGreaterThanOrEqual(f.radius);
        const L = hyp(g, s);
        for (let k = 1; k < L; k++) {
          const t = k / L;
          const h = getHeightForMap(m, s.x + (g.x - s.x) * t, s.z + (g.z - s.z) * t);
          expect(h, `caminho mina↔Centro (${k} u)`).toBeGreaterThanOrEqual(1.8);
        }
      }
    });
  }
});

// ---------------------------------------------------------------------------------------------------------------------------
// M2-04: palcos 4 (Baixio do Breu), 5 (Cerne Verde) e 6 (A Geada)
// ---------------------------------------------------------------------------------------------------------------------------
/** Conta células (passo 2 u) da área jogável com `test(x, z)` verdadeiro. */
function countCells(m, test, step = 2) {
  let n = 0;
  const half = m.playable / 2;
  for (let z = -half; z <= half; z += step) for (let x = -half; x <= half; x += step) if (test(x, z)) n++;
  return n;
}

function biomeAtLocal(m, x, z) {
  const g = decodeBiomeGrid(m.biomeGrid);
  const n = m.biomeGrid.nodes, cell = m.biomeGrid.cell, half = m.size / 2;
  const i = Math.max(0, Math.min(n - 1, Math.round((x + half) / cell))), j = Math.max(0, Math.min(n - 1, Math.round((z + half) / cell)));
  return g[j * n + i];
}

// M3-05: o Baixio do Breu foi refeito (2 continentes isolados, 2 ilhotas, 6 poços): testes em tests/unit/campaignM04.test.js

describe('M2-04 · Cerne Verde (floresta densa, clareiras, bosque sagrado, ninho de grifos)', () => {
  const id = 'camp-05-cerne-verde';
  it('a terra é quase toda floresta (bioma e bosques), com um rio curto de um vau', () => {
    const m = getMap(id);
    const forestCells = countCells(m, (x, z) => getHeightForMap(m, x, z) > 1 && biomeAtLocal(m, x, z) === 12);
    const landCells = countCells(m, (x, z) => getHeightForMap(m, x, z) > 1);
    expect(forestCells / landCells).toBeGreaterThan(0.6);
    expect(m.forests.length).toBeGreaterThanOrEqual(18);
    expect(m.fords).toHaveLength(1);
    expect(m.anchors.ford1).toEqual({ x: m.fords[0].x, z: m.fords[0].z });
  });

  it('bosque sagrado e ninho de grifos longe das bases; 3 clareiras sem bosque por perto; um Salão do Bosque por lado', () => {
    const m = getMap(id);
    for (const s of m.startSlots) {
      expect(hyp(m.anchors.sacredGrove, s)).toBeGreaterThanOrEqual(38);
      expect(hyp(m.anchors.gryphonNest, s)).toBeGreaterThanOrEqual(40);
    }
    expect(hyp(m.anchors.gryphonNest, m.anchors.sacredGrove)).toBeGreaterThanOrEqual(30);
    for (const k of ['clearing1', 'clearing2', 'clearing3']) {
      for (const f of m.forests) expect(hyp(m.anchors[k], f), `${k} x bosque (${f.x},${f.z})`).toBeGreaterThanOrEqual(8);
    }
    expect(hyp(m.anchors.lumberHall1, m.startSlots[0])).toBeLessThan(hyp(m.anchors.lumberHall1, m.startSlots[1]));
    expect(hyp(m.anchors.lumberHall2, m.startSlots[1])).toBeLessThan(hyp(m.anchors.lumberHall2, m.startSlots[0]));
    expect(hyp(m.anchors.orenStart, m.startSlots[0])).toBeLessThan(40);
  });
});

describe('M2-04/M3-07 · A Geada (gelo, lagos congelados, Farol Boreal, 4 vagas)', () => {
  const id = 'camp-06-a-geada';
  it('4 vagas ligadas por terra, tileset de inverno e a terra é neve, gelo ou rocha', () => {
    const m = getMap(id);
    expect(m.tileset).toBe('inverno');
    expect(m.startSlots).toHaveLength(4);
    const land = buildPathfinder(m, 'land');
    const seen = floodFill(land, m.startSlots[0].x, m.startSlots[0].z);
    for (const s of m.startSlots) expect(isReached(land, seen, s.x, s.z)).toBe(true);
    const cold = countCells(m, (x, z) => getHeightForMap(m, x, z) > 1 && [6, 9, 11].includes(biomeAtLocal(m, x, z)));
    const dry = countCells(m, (x, z) => getHeightForMap(m, x, z) > 1);
    expect(cold / dry).toBeGreaterThan(0.9);
  });

  it('gelo NÃO navegável: lagos congelados e banquisa rasos (0,1 < altura < linha d\'água) com bioma gelo, e nenhum navio os alcança', () => {
    const m = getMap(id);
    const sea = buildPathfinder(m, 'naval');
    const ocean = oceanSeen(m, sea);
    const lakes = Object.keys(m.anchors).filter(isLake);
    expect(lakes.length).toBeGreaterThanOrEqual(2);
    for (const k of lakes) {
      const a = m.anchors[k];
      expect(biomeAtLocal(m, a.x, a.z), k).toBe(11);
      expect(getHeightForMap(m, a.x, a.z), `${k}: gelo raso, nem navio nem tropa`).toBeGreaterThan(0.1);
      expect(isReached(sea, ocean, a.x, a.z), `${k} não é navegável`).toBe(false);
    }
    const floe = countCells(m, (x, z) => { const h = getHeightForMap(m, x, z); return h > 0.15 && h < 0.45 && biomeAtLocal(m, x, z) === 11; });
    expect(floe).toBeGreaterThan(200); // banquisa + lagos (células de 2 u)
  });

  it('M3-07: mapa de 320 com bases a >= 140 u uma da outra; Farol Boreal no cabo do mar do norte (>= 70 u de toda base), fortes do inimigo e do aliado, comboio de Brumar ao Farol e 10 minas de ouro', () => {
    const m = getMap(id);
    expect(m.size).toBe(320);
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) expect(hyp(m.startSlots[i], m.startSlots[j]), `bases ${i}-${j}`).toBeGreaterThanOrEqual(140);
    for (const s of m.startSlots) expect(hyp(m.anchors.lighthouse, s)).toBeGreaterThanOrEqual(70);
    expect(m.anchors.allyStart).toEqual({ x: m.startSlots[3].x, z: m.startSlots[3].z });
    expect(m.anchors.enemy1Start).toEqual({ x: m.startSlots[1].x, z: m.startSlots[1].z });
    expect(m.anchors.enemy2Start).toEqual({ x: m.startSlots[2].x, z: m.startSlots[2].z });
    expect(hyp(m.anchors.enemy1Fort, m.startSlots[1])).toBeLessThan(35);
    expect(hyp(m.anchors.allyFort, m.startSlots[3])).toBeLessThan(35);
    expect(hyp(m.anchors.convoyStart, m.startSlots[3])).toBeLessThan(hyp(m.anchors.convoyStart, m.startSlots[0]));
    expect(hyp(m.anchors.convoyEnd, m.anchors.lighthouse)).toBeLessThan(30);
    // o Farol é um cabo: tem água navegável do oceano do norte a 6-16 u (`lightSea`)
    expect(hyp(m.anchors.lighthouse, m.anchors.lightSea)).toBeLessThanOrEqual(16);
    const golds = m.resources.filter((r) => r.type === 'gold');
    expect(golds).toHaveLength(10); // 4 iniciais (a ~32 u do Centro) + 4 de expansão + 2 veios do Farol
    expect(golds.filter((g) => g.amount === GEADA_LIGHT_GOLD)).toHaveLength(2);
    for (const s of m.startSlots) {
      const near = golds.map((g) => hyp(g, s)).sort((a, b) => a - b);
      expect(near[0]).toBeGreaterThanOrEqual(30);
      expect(near[0]).toBeLessThanOrEqual(34);
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------------------
// M2-06: palcos 10 (Costa Ferrugem), 11 (Estepe do Vento) e 12 (Cabo Ferrugem), o continente orc visto pela Aliança
// ---------------------------------------------------------------------------------------------------------------------------
describe('M2-06 · Estepe do Vento (colônia sob cerco)', () => {
  const id = 'camp-11-estepe-do-vento';
  it('interior de savana e estepe, 3 vagas ligadas por terra e Paço no slot 0 (Marco da Colônia na praia, M3-12)', () => {
    const m = getMap(id);
    expect(m.tileset).toBe('savana');
    const dry = countCells(m, (x, z) => getHeightForMap(m, x, z) > 1);
    const sav = countCells(m, (x, z) => getHeightForMap(m, x, z) > 1 && [3, 4, 5].includes(biomeAtLocal(m, x, z)));
    expect(sav / dry).toBeGreaterThan(0.7);
    const land = buildPathfinder(m, 'land');
    const seen = floodFill(land, m.startSlots[0].x, m.startSlots[0].z);
    for (const s of m.startSlots) expect(isReached(land, seen, s.x, s.z)).toBe(true);
    expect(m.anchors.skarnStart).toEqual({ x: m.startSlots[1].x, z: m.startSlots[1].z });
    expect(m.anchors.hurganStart).toEqual({ x: m.startSlots[2].x, z: m.startSlots[2].z });
  });
  it('M3-12: 352 de lado, bases a >= 150 u umas das outras; Marco da Colônia na praia (14–22 u do desembarque, longe do Paço e de Skarn)', () => {
    const m = getMap(id);
    expect(m.size).toBe(352);
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) expect(hyp(m.startSlots[i], m.startSlots[j]), `bases ${i}-${j}`).toBeGreaterThanOrEqual(150);
    const a = m.anchors;
    expect(hyp(a.colonyMark, a.landingZone)).toBeGreaterThanOrEqual(14);
    expect(hyp(a.colonyMark, a.landingZone)).toBeLessThanOrEqual(22);
    expect(hyp(a.colonyMark, m.startSlots[0])).toBeGreaterThanOrEqual(30);
    expect(hyp(a.colonyMark, m.startSlots[1])).toBeGreaterThanOrEqual(60);
  });
  it('M3-12: frota de cerco com duas partidas no mar (água navegável, ligada ao oceano) e 6 poços de petróleo, 2 deles perto do Paço', () => {
    const m = getMap(id);
    const a = m.anchors;
    const sea = buildPathfinder(m, 'naval');
    const ocean = oceanSeen(m, sea);
    for (const k of ['siegeFleetStart', 'siegeFleetStart2']) {
      expect(a[k].water, k).toBe(true);
      expect(isReached(sea, ocean, a[k].x, a[k].z), k).toBe(true);
    }
    expect(hyp(a.siegeFleetStart, m.startSlots[1])).toBeGreaterThanOrEqual(60);
    const oil = m.resources.filter((r) => r.type === 'oil');
    expect(oil.length).toBeGreaterThanOrEqual(4);
    expect(Math.min(...oil.map((r) => hyp(r, m.startSlots[0])))).toBeLessThanOrEqual(55); // OIL-FAR-2: o poço seguro-ish fica a ~30 u de NAVEGAÇÃO da doca (não mais colado ao Paço)
  });
  it('praia de reforço com mar navegável, 3 rotas de incursão rumo ao Marco e clã dissidente longe das bases inimigas', () => {
    const m = getMap(id);
    const a = m.anchors;
    const sea = buildPathfinder(m, 'naval');
    expect(isReached(sea, oceanSeen(m, sea), a.reinforceSea.x, a.reinforceSea.z)).toBe(true);
    expect(hyp(a.landingZone, a.reinforceSea)).toBeLessThanOrEqual(16);
    expect(hyp(a.landingZone, m.startSlots[0])).toBeLessThan(60);
    for (const k of ['raid1', 'raid2', 'raid3']) expect(hyp(a[k], m.startSlots[0]), k).toBeLessThan(90);
    for (const s of m.startSlots.slice(1)) expect(hyp(a.dissidentClan, s)).toBeGreaterThanOrEqual(38);
  });
});

describe('M3-13 · Cabo Ferrugem (384, naval: crista de falésia, estreito, docas e praias)', () => {
  const id = 'camp-12-cabo-ferrugem';
  it('mapa de 384 (o máximo), naval, bases a >= 150 u, Bastião no sítio do slot 0 perto do estreito, que é água do oceano entre o cabo e uma ilha', () => {
    const m = getMap(id);
    const a = m.anchors;
    expect(m.size).toBe(384);
    expect(hyp(m.startSlots[0], m.startSlots[1])).toBeGreaterThanOrEqual(150);
    expect(a.bastion).toEqual({ x: m.startSlots[0].x, z: m.startSlots[0].z });
    expect(hyp(a.bastion, a.strait)).toBeLessThanOrEqual(60);
    const sea = buildPathfinder(m, 'naval');
    const ocean = oceanSeen(m, sea);
    expect(isReached(sea, ocean, a.strait.x, a.strait.z)).toBe(true);
    // há terra de ambos os lados do estreito em até 22 u, e terra alcançável (continente) e isolada (ilha)
    const land = buildPathfinder(m, 'land');
    const seen = floodFill(land, m.startSlots[0].x, m.startSlots[0].z);
    let cont = false, isle = false;
    for (let k = 0; k < 48; k++) {
      const t = (k / 48) * Math.PI * 2;
      for (const rho of [8, 12, 16, 20]) {
        const x = a.strait.x + Math.cos(t) * rho, z = a.strait.z + Math.sin(t) * rho;
        if (getHeightForMap(m, x, z) < 1.8) continue;
        if (isReached(land, seen, x, z)) cont = true; else isle = true;
      }
    }
    expect(cont, 'continente junto ao estreito').toBe(true);
    expect(isle, 'ilha junto ao estreito').toBe(true);
  });

  it('crista de falésia (cliffHeight) entre as bases com 2 desfiladeiros: sem muralha as bases se alcançam; com as 8 muralhas (4 + 4) não; cada linha sozinha não sela', () => {
    const m = getMap(id);
    const a = m.anchors;
    expect(m.cliffHeight).toBeGreaterThan(0);
    expect(m.meta.ridge.gaps).toHaveLength(2);
    const land = buildPathfinder(m, 'land');
    const [s0, s1] = m.startSlots;
    const reach = () => {
      const seen = new Uint8Array(land.numCells);
      const q = [];
      const g = land.toGrid(s0.x, s0.z);
      const goal = land.toGrid(s1.x, s1.z);
      q.push(g.r * land.cols + g.c); seen[q[0]] = 1;
      for (let h = 0; h < q.length; h++) {
        const k = q[h], c = k % land.cols, r = (k - c) / land.cols;
        if (r === goal.r && c === goal.c) return true;
        for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          if (!land.isWalkable(c + dc, r + dr)) continue;
          const kk = (r + dr) * land.cols + (c + dc);
          if (!seen[kk]) { seen[kk] = 1; q.push(kk); }
        }
      }
      return false;
    };
    const walls = (L) => [1, 2, 3, 4].map((k) => a[`wall${L}${k}`]);
    const put = (ws, d) => { for (const w of ws) land.blockCircle(w.x, w.z, 1.5, d); };
    expect(reach(), 'sem muralhas').toBe(true);
    put(walls('A'), 1);
    expect(reach(), 'só a linha A').toBe(true);
    put(walls('B'), 1);
    expect(reach(), 'as duas linhas').toBe(false);
    put(walls('A'), -1);
    expect(reach(), 'só a linha B').toBe(true);
    put(walls('B'), -1);
  });

  it('3 docas orcs no litoral dos Clãs (norte da crista), com água navegável diante e guarda; praias de desembarque e do assalto perto do Bastião; frotas no oceano', () => {
    const m = getMap(id);
    const a = m.anchors;
    const sea = buildPathfinder(m, 'naval');
    const ocean = oceanSeen(m, sea);
    const docks = [1, 2, 3].map((i) => a[`dock${i}`]);
    for (let i = 0; i < 3; i++) {
      expect(hyp(docks[i], a.bastion), `doca ${i + 1} longe do Bastião`).toBeGreaterThanOrEqual(60);
      expect(hyp(docks[i], m.startSlots[1]), `doca ${i + 1} fora da base de Skarn`).toBeGreaterThanOrEqual(40);
      expect(hyp(a[`dockGuard${i + 1}`], docks[i])).toBeLessThanOrEqual(20);
      for (let j = i + 1; j < 3; j++) expect(hyp(docks[i], docks[j])).toBeGreaterThanOrEqual(24);
      let wet = false;
      for (let k = 0; k < 16 && !wet; k++) wet = getHeightForMap(m, docks[i].x + Math.cos(k / 16 * Math.PI * 2) * 8, docks[i].z + Math.sin(k / 16 * Math.PI * 2) * 8) < m.waterLevel;
      expect(wet, `doca ${i + 1} com água ao lado`).toBe(true);
    }
    for (const k of ['fleetStart', 'fleetStart2', 'orcFleetStart', 'orcFleetStart2', 'assaultSea', 'reinforceSea', 'well5', 'well6']) expect(isReached(sea, ocean, a[k].x, a[k].z), k).toBe(true);
    expect(hyp(a.landingZone, a.bastion)).toBeLessThanOrEqual(46);
    expect(hyp(a.assaultBeach, a.landingZone)).toBeGreaterThanOrEqual(26);
    expect(hyp(a.bossStart, m.startSlots[1])).toBeLessThan(hyp(a.bossStart, m.startSlots[0]));
    expect(hyp(a.bastionHall, a.bastion)).toBeGreaterThanOrEqual(20);
    expect(hyp(a.orcFleetStart, a.strait)).toBeGreaterThanOrEqual(100);
    for (const k of ['waveStart1', 'waveStart2', 'raid3']) expect(hyp(a[k], m.startSlots[0]), k).toBeGreaterThan(40);
  });
});
