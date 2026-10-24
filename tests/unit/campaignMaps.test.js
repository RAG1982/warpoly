import { describe, it, expect, beforeAll } from 'vitest';
import { getMap, listMaps, loadAllCampaignMaps } from '../../src/data/maps/index.js';
import { validateMapDef } from '../../src/data/maps/validate.js';
import { buildPathfinder, floodFill, isReached } from '../../src/data/maps/generator.js';
import { getHeightForMap } from '../../src/sim/terrainGenerators.js';
import { TILESETS } from '../../src/data/tilesets.js';
import { decodeBiomeGrid } from '../../src/data/maps/biome.js';
import { measureWood, WOOD_RADIUS } from '../../tools/lib/woodStats.mjs';
import { buildCampaignMap, CAMPAIGN_IDS, CAMPAIGN_NAMES, GOLD_AMOUNT, CAMPAIGN_WOOD_FLOOR } from '../../tools/lib/campaignMaps.mjs';
import ptBR from '../../src/i18n/pt-BR.json';
import en from '../../src/i18n/en.json';

/**
 * M2-03: mapas de campanha do lote 1 (palcos 1 Baía de Aurelan, 2 Pouso do Encontro, 3 Pedra-Mãe) e, da M2-04, os palcos
 * 4 Baixio do Breu, 5 Cerne Verde e 6 A Geada, gerados por `tools/gen-campaign-maps.mjs` (receita em `tools/lib/campaignMaps.mjs`).
 * Os palcos 2 a 6 servem às duas campanhas (slot 0 = lado da Liga de Aurelan, slot 1 = lado dos Clãs do Cinzal). A Geada tem 4 vagas
 * (jogador, Lanças Quebradas, Sal Cinzento e o aliado Brumar).
 */
const IDS = ['camp-01-baia-de-aurelan', 'camp-02-pouso-do-encontro', 'camp-03-pedra-mae', 'camp-04-baixio-do-breu', 'camp-05-cerne-verde', 'camp-06-a-geada', 'camp-10-costa-ferrugem', 'camp-11-estepe-do-vento', 'camp-12-cabo-ferrugem'];
const SLOTS = { 'camp-06-a-geada': 4, 'camp-11-estepe-do-vento': 3 }; // as demais têm 2 vagas

// M2-28: os mapas de campanha são carregados sob demanda (chunks); os testes os carregam antes de usar `getMap`.
beforeAll(async () => { await loadAllCampaignMaps(); });
const MIN_ANCHORS = {
  'camp-01-baia-de-aurelan': ['playerStart', 'enemyStart', 'goldMine1', 'goldMine2', 'neutralCamp1', 'landingZone', 'muralFenda', 'shipHorizon'],
  'camp-02-pouso-do-encontro': ['playerStart', 'enemyStart', 'goldMine1', 'landingZone', 'pier1', 'pier1Water', 'pier2', 'pier2Water', 'logFort', 'lighthouse', 'emissary1', 'emissary2', 'patrol1', 'patrol2', 'patrol3', 'expansion1', 'expansion2'],
  'camp-03-pedra-mae': ['playerStart', 'enemyStart', 'colonyHall', 'colonyGold1', 'colonyGold2', 'bridgeheadGold', 'beach1', 'beach2', 'beach3', 'seaLanding1', 'seaLanding2', 'seaLanding3', 'fort1', 'fort2', 'fort3', 'bridgehead', 'bridgeheadSea', 'landingZone'],
  'camp-04-baixio-do-breu': ['playerStart', 'enemyStart', 'well1', 'well2', 'well3', 'well4', 'shipyard1', 'shipyard1Water', 'shipyard2', 'shipyard2Water', 'wreck1', 'wreck2', 'wreck3', 'fleetStart1', 'fleetStart2', 'fleetMid'],
  'camp-05-cerne-verde': ['playerStart', 'enemyStart', 'goldMine1', 'sacredGrove', 'gryphonNest', 'clearing1', 'clearing2', 'clearing3', 'lumberHall1', 'lumberHall2', 'orenStart', 'ford1', 'landingZone'],
  'camp-06-a-geada': ['playerStart', 'enemyStart', 'enemy1Start', 'enemy2Start', 'allyStart', 'lighthouse', 'enemy1Fort', 'allyFort', 'allyHeroStart', 'convoyStart', 'convoyEnd', 'expansion1', 'expansion2', 'expansion3', 'expansion4', 'lake1', 'lake2'],
  'camp-10-costa-ferrugem': ['playerStart', 'enemyStart', 'landingZone', 'colonyMark', 'unloadSea', 'bargeStart1', 'bargeStart2', 'coastTower1', 'coastTower2', 'coastTower3', 'garrison', 'oldWell', 'expansion1', 'expansion2'],
  'camp-11-estepe-do-vento': ['playerStart', 'enemyStart', 'colonyMark', 'skarnStart', 'hurganStart', 'landingZone', 'reinforceSea', 'convoyStart', 'convoyEnd', 'raid1', 'raid2', 'raid3', 'dissidentClan', 'expansion1', 'expansion2', 'expansion3'],
  'camp-12-cabo-ferrugem': ['playerStart', 'enemyStart', 'bastion', 'strait', 'dock1', 'dock2', 'dock3', 'fleetStart', 'fleetStart2', 'bossStart', 'waveStart1', 'waveStart2', 'expansion1', 'expansion2']
};
const WATER = new Set(['shipHorizon', 'pier1Water', 'pier2Water', 'seaLanding1', 'seaLanding2', 'seaLanding3', 'bridgeheadSea', 'well1', 'well2', 'well3', 'well4', 'shipyard1Water', 'shipyard2Water', 'wreck1', 'wreck2', 'wreck3', 'fleetStart1', 'fleetStart2', 'fleetMid', 'unloadSea', 'bargeStart1', 'bargeStart2', 'reinforceSea', 'strait', 'fleetStart']);
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
    it(`${id}: registrado como hidden (fora da Escaramuça), painted com biomeGrid, tileset existente, tamanho 96–224, 2 vagas (3 no 11, 4 na Geada)`, () => {
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
      expect(m.size).toBeLessThanOrEqual(224);
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
      for (const g of gold) expect(g.amount).toBe(GOLD_AMOUNT);
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
        } else {
          expect(isReached(land, seenLand, a.x, a.z), `${id}.${name} por terra`).toBe(true);
        }
      }
    });
  }

  it('Baía de Aurelan: acampamento neutro (4 guardas, recompensa de ouro) a >= 25 u das bases e Mural da Fenda em terra', () => {
    const m = getMap('camp-01-baia-de-aurelan');
    const camps = m.neutrals.filter((n) => n.kind === 'camp');
    expect(camps).toHaveLength(1);
    expect(camps[0].guards).toBe(4);
    expect(camps[0].reward.gold).toBeGreaterThan(0);
    for (const s of m.startSlots) expect(hyp(camps[0], s)).toBeGreaterThanOrEqual(25);
    expect(m.anchors.neutralCamp1).toEqual({ x: camps[0].x, z: camps[0].z });
    expect(hyp(m.anchors.muralFenda, m.anchors.playerStart)).toBeGreaterThan(30);
    expect(hyp(m.anchors.muralFenda, camps[0])).toBeGreaterThan(20);
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

  it('Pedra-Mãe: ouro abundante junto ao Paço (>= 3 minas a <= 40 u), 3 praias de pouso afastadas com ponto no mar ligado por mar, 3 fortes e cabeça de ponte', () => {
    const m = getMap('camp-03-pedra-mae');
    expect(m.tileset).toBe('pedregoso');
    const hall = m.anchors.colonyHall;
    expect(hall).toEqual({ x: m.startSlots[0].x, z: m.startSlots[0].z });
    expect(m.resources.filter((r) => r.type === 'gold' && hyp(r, hall) <= 40).length).toBeGreaterThanOrEqual(3);
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

describe('M2-04 · Baixio do Breu (recifes, petróleo, naufrágios)', () => {
  const id = 'camp-04-baixio-do-breu';
  it('mapa naval: 4 poços em água do oceano, baixios (água rasa que não é navegável) em boa parte do mar e ilhotas espalhadas', () => {
    const m = getMap(id);
    expect(m.size).toBe(224);
    const sea = buildPathfinder(m, 'naval');
    const ocean = oceanSeen(m, sea);
    const wells = m.resources.filter((r) => r.type === 'oil');
    expect(wells).toHaveLength(4);
    for (const w of wells) {
      expect(isReached(sea, ocean, w.x, w.z), `poço ${w.x},${w.z}`).toBe(true);
      expect(getHeightForMap(m, w.x, w.z)).toBeLessThan(0.1);
    }
    wells.forEach((w, i) => expect(m.anchors[`well${i + 1}`]).toEqual({ x: w.x, z: w.z, water: true })); // well1..4 = os poços, nesta ordem
    const reef = countCells(m, (x, z) => { const h = getHeightForMap(m, x, z); return h > 0.15 && h < 0.45; });
    const open = countCells(m, (x, z) => getHeightForMap(m, x, z) < 0.05);
    const total = countCells(m, () => true);
    expect(reef / total, 'baixios').toBeGreaterThan(0.08); // "quase só água rasa e funda"
    expect(open / total, 'água funda').toBeGreaterThan(0.4);
    expect(m.resources.filter((r) => r.type === 'gold')).toHaveLength(4); // 1 padrão + 1 de expansão por lado: com 1 só o soak travava
  });

  it('espaço para Estaleiro/Doca: costa de cada lado com água funda ligada ao oceano; poços e naufrágios afastados entre si; frotas no mar principal', () => {
    const m = getMap(id);
    const sea = buildPathfinder(m, 'naval');
    const ocean = oceanSeen(m, sea);
    for (const k of ['shipyard1', 'shipyard2']) {
      const a = m.anchors[k], w = m.anchors[`${k}Water`];
      expect(hyp(a, w), k).toBeLessThanOrEqual(18);
      expect(sea.nearNavigable(w.x, w.z, 1.5), k).toBe(true);
      expect(isReached(sea, ocean, w.x, w.z), k).toBe(true);
    }
    expect(hyp(m.anchors.shipyard1, m.startSlots[0])).toBeLessThan(hyp(m.anchors.shipyard1, m.startSlots[1]));
    expect(hyp(m.anchors.shipyard2, m.startSlots[1])).toBeLessThan(hyp(m.anchors.shipyard2, m.startSlots[0]));
    const wrecks = [1, 2, 3].map((i) => m.anchors[`wreck${i}`]);
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) expect(hyp(wrecks[i], wrecks[j])).toBeGreaterThanOrEqual(24);
    for (const w of wrecks) for (const r of m.resources.filter((q) => q.type === 'oil')) expect(hyp(w, r)).toBeGreaterThanOrEqual(24);
    for (const k of ['fleetStart1', 'fleetStart2', 'fleetMid']) expect(isReached(sea, ocean, m.anchors[k].x, m.anchors[k].z), k).toBe(true);
    expect(hyp(m.anchors.fleetStart1, m.startSlots[0])).toBeLessThan(hyp(m.anchors.fleetStart1, m.startSlots[1]));
  });
});

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

describe('M2-04 · A Geada (gelo, lagos congelados, Farol Boreal, 4 vagas)', () => {
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

  it('Farol Boreal no meio (>= 34 u de toda base), forte inimigo e do aliado, comboio entre o aliado e o jogador e uma mina extra por base', () => {
    const m = getMap(id);
    for (const s of m.startSlots) expect(hyp(m.anchors.lighthouse, s)).toBeGreaterThanOrEqual(34);
    expect(m.anchors.allyStart).toEqual({ x: m.startSlots[3].x, z: m.startSlots[3].z });
    expect(m.anchors.enemy1Start).toEqual({ x: m.startSlots[1].x, z: m.startSlots[1].z });
    expect(m.anchors.enemy2Start).toEqual({ x: m.startSlots[2].x, z: m.startSlots[2].z });
    expect(hyp(m.anchors.enemy1Fort, m.startSlots[1])).toBeLessThan(35);
    expect(hyp(m.anchors.allyFort, m.startSlots[3])).toBeLessThan(35);
    expect(hyp(m.anchors.convoyStart, m.startSlots[3])).toBeLessThan(hyp(m.anchors.convoyStart, m.startSlots[0]));
    expect(hyp(m.anchors.convoyEnd, m.startSlots[0])).toBeLessThan(hyp(m.anchors.convoyEnd, m.startSlots[3]));
    expect(m.resources.filter((r) => r.type === 'gold')).toHaveLength(8); // 1 padrão + 1 de expansão por base
  });
});

// ---------------------------------------------------------------------------------------------------------------------------
// M2-06: palcos 10 (Costa Ferrugem), 11 (Estepe do Vento) e 12 (Cabo Ferrugem), o continente orc visto pela Aliança
// ---------------------------------------------------------------------------------------------------------------------------
describe('M2-06 · Costa Ferrugem (desembarque)', () => {
  const id = 'camp-10-costa-ferrugem';
  it('continente árido com mar aberto a oeste; praia de desembarque com água navegável diante e Marco no sítio do slot 0', () => {
    const m = getMap(id);
    expect(m.tileset).toBe('deserto');
    const sea = buildPathfinder(m, 'naval');
    const ocean = oceanSeen(m, sea);
    const a = m.anchors;
    expect(a.colonyMark).toEqual({ x: m.startSlots[0].x, z: m.startSlots[0].z });
    expect(hyp(a.landingZone, a.unloadSea)).toBeLessThanOrEqual(16);
    for (const k of ['unloadSea', 'bargeStart1', 'bargeStart2']) expect(isReached(sea, ocean, a[k].x, a[k].z), k).toBe(true);
    expect(hyp(a.landingZone, m.startSlots[0])).toBeGreaterThanOrEqual(30);
    expect(hyp(a.landingZone, m.startSlots[0])).toBeLessThan(hyp(a.landingZone, m.startSlots[1]));
    expect(hyp(a.bargeStart1, a.bargeStart2)).toBeLessThanOrEqual(26); // as duas Barcaças saem juntas
  });
  it('3 torres costeiras em volta da praia (11–26 u, afastadas entre si) e guarnição entre a praia e o interior', () => {
    const a = getMap(id).anchors;
    const t = [1, 2, 3].map((i) => a[`coastTower${i}`]);
    for (const p of t) { expect(hyp(p, a.landingZone)).toBeGreaterThanOrEqual(11); expect(hyp(p, a.landingZone)).toBeLessThanOrEqual(26); }
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) expect(hyp(t[i], t[j])).toBeGreaterThanOrEqual(11);
    expect(hyp(a.garrison, a.landingZone)).toBeGreaterThan(15);
    expect(hyp(a.oldWell, a.landingZone)).toBeGreaterThanOrEqual(50);
  });
});

describe('M2-06 · Estepe do Vento (colônia sob cerco)', () => {
  const id = 'camp-11-estepe-do-vento';
  it('interior de savana e estepe, 3 vagas ligadas por terra e Marco no slot 0', () => {
    const m = getMap(id);
    expect(m.tileset).toBe('savana');
    const dry = countCells(m, (x, z) => getHeightForMap(m, x, z) > 1);
    const sav = countCells(m, (x, z) => getHeightForMap(m, x, z) > 1 && [3, 4, 5].includes(biomeAtLocal(m, x, z)));
    expect(sav / dry).toBeGreaterThan(0.7);
    const land = buildPathfinder(m, 'land');
    const seen = floodFill(land, m.startSlots[0].x, m.startSlots[0].z);
    for (const s of m.startSlots) expect(isReached(land, seen, s.x, s.z)).toBe(true);
    expect(m.anchors.colonyMark).toEqual({ x: m.startSlots[0].x, z: m.startSlots[0].z });
    expect(m.anchors.skarnStart).toEqual({ x: m.startSlots[1].x, z: m.startSlots[1].z });
    expect(m.anchors.hurganStart).toEqual({ x: m.startSlots[2].x, z: m.startSlots[2].z });
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

describe('M2-06 · Cabo Ferrugem (promontório, estreito e docas)', () => {
  const id = 'camp-12-cabo-ferrugem';
  it('Bastião no sítio do slot 0 perto do estreito, que é água do oceano estreita entre o promontório e uma ilha', () => {
    const m = getMap(id);
    const a = m.anchors;
    expect(a.bastion).toEqual({ x: m.startSlots[0].x, z: m.startSlots[0].z });
    expect(hyp(a.bastion, a.strait)).toBeLessThanOrEqual(60);
    const sea = buildPathfinder(m, 'naval');
    const ocean = oceanSeen(m, sea);
    expect(isReached(sea, ocean, a.strait.x, a.strait.z)).toBe(true);
    // há terra de ambos os lados do estreito em até 22 u (largura do canal <= ~26 u), e terra alcançável (continente) e isolada (ilha)
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
  it('3 docas orcs no litoral do continente, com água navegável diante; frota e chefe/ondas nos lugares certos', () => {
    const m = getMap(id);
    const a = m.anchors;
    const sea = buildPathfinder(m, 'naval');
    const ocean = oceanSeen(m, sea);
    const docks = [1, 2, 3].map((i) => a[`dock${i}`]);
    for (let i = 0; i < 3; i++) {
      expect(hyp(docks[i], a.strait), `doca ${i + 1} perto do estreito`).toBeLessThanOrEqual(66);
      expect(hyp(docks[i], a.bastion)).toBeGreaterThanOrEqual(24);
      for (let j = i + 1; j < 3; j++) expect(hyp(docks[i], docks[j])).toBeGreaterThanOrEqual(20);
    }
    for (const k of ['fleetStart', 'fleetStart2']) expect(isReached(sea, ocean, a[k].x, a[k].z), k).toBe(true);
    expect(hyp(a.bossStart, m.startSlots[1])).toBeLessThan(hyp(a.bossStart, m.startSlots[0]));
    for (const k of ['waveStart1', 'waveStart2']) expect(hyp(a[k], m.startSlots[0])).toBeGreaterThan(40);
  });
});
