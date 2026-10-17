import { describe, it, expect, beforeAll } from 'vitest';
import { getMap, listMaps, loadAllCampaignMaps } from '../../src/data/maps/index.js';
import { validateMapDef } from '../../src/data/maps/validate.js';
import { buildPathfinder, floodFill, isReached } from '../../src/data/maps/generator.js';
import { getHeightForMap } from '../../src/sim/terrainGenerators.js';
import { TILESETS } from '../../src/data/tilesets.js';
import { decodeBiomeGrid } from '../../src/data/maps/biome.js';
import { measureWood, WOOD_TARGET, WOOD_RADIUS } from '../../tools/lib/woodStats.mjs';
import { buildCampaignMap, CAMPAIGN_IDS, CAMPAIGN_NAMES, GOLD_AMOUNT } from '../../tools/lib/campaignMaps.mjs';
import ptBR from '../../src/i18n/pt-BR.json';
import en from '../../src/i18n/en.json';

/**
 * M2-03: mapas de campanha do lote 1 (palcos 1 Baía de Aurelan, 2 Pouso do Encontro, 3 Pedra-Mãe), gerados por
 * `tools/gen-campaign-maps.mjs` (receita em `tools/lib/campaignMaps.mjs`). Os palcos 2 e 3 servem às duas campanhas
 * (slot 0 = lado da Liga de Aurelan, slot 1 = lado dos Clãs do Cinzal).
 */
const IDS = ['camp-01-baia-de-aurelan', 'camp-02-pouso-do-encontro', 'camp-03-pedra-mae'];

// M2-28: os mapas de campanha são carregados sob demanda (chunks); os testes os carregam antes de usar `getMap`.
beforeAll(async () => { await loadAllCampaignMaps(); });
const MIN_ANCHORS = {
  'camp-01-baia-de-aurelan': ['playerStart', 'enemyStart', 'goldMine1', 'goldMine2', 'neutralCamp1', 'landingZone', 'muralFenda', 'shipHorizon'],
  'camp-02-pouso-do-encontro': ['playerStart', 'enemyStart', 'goldMine1', 'landingZone', 'pier1', 'pier1Water', 'pier2', 'pier2Water', 'logFort', 'lighthouse', 'emissary1', 'emissary2', 'patrol1', 'patrol2', 'patrol3', 'expansion1', 'expansion2'],
  'camp-03-pedra-mae': ['playerStart', 'enemyStart', 'colonyHall', 'colonyGold1', 'colonyGold2', 'bridgeheadGold', 'beach1', 'beach2', 'beach3', 'seaLanding1', 'seaLanding2', 'seaLanding3', 'fort1', 'fort2', 'fort3', 'bridgehead', 'bridgeheadSea', 'landingZone']
};
const WATER = new Set(['shipHorizon', 'pier1Water', 'pier2Water', 'seaLanding1', 'seaLanding2', 'seaLanding3', 'bridgeheadSea']);
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
  it('a receita conhece os três palcos e traz nome pt-BR e en', () => {
    expect(CAMPAIGN_IDS).toEqual(expect.arrayContaining(IDS)); // M2-05/M2-04: a receita tem os palcos dos outros lotes também
    for (const id of IDS) {
      expect(CAMPAIGN_NAMES[id].pt.length).toBeGreaterThan(3);
      expect(ptBR[`map.${id}.name`], id).toBe(CAMPAIGN_NAMES[id].pt);
      expect(en[`map.${id}.name`], id).toBe(CAMPAIGN_NAMES[id].en);
    }
  });

  for (const id of IDS) {
    it(`${id}: registrado como hidden (fora da Escaramuça), painted com biomeGrid, tileset existente, tamanho 96–192, 2 vagas`, () => {
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
      expect(m.size).toBeLessThanOrEqual(192);
      expect(m.startSlots).toHaveLength(2);
      expect(m.maxPlayers).toBe(2);
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

    it(`${id}: madeira alcançável a ${WOOD_RADIUS} u >= ${WOOD_TARGET} por jogador (sementes de partida 1 e 2)`, () => {
      for (const seed of [1, 2]) {
        const r = measureWood(getMap(id), { seed });
        r.gm.dispose?.();
        for (const p of r.perPlayer) expect(p.wood, `${id} seed ${seed} slot ${p.slot}`).toBeGreaterThanOrEqual(WOOD_TARGET);
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
        if (a.water) {
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
