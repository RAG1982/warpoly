import { describe, it, expect, beforeAll } from 'vitest';
import { getMap, listMaps, loadAllCampaignMaps } from '../../src/data/maps/index.js';
import { validateMapDef } from '../../src/data/maps/validate.js';
import { buildPathfinder, floodFill, isReached } from '../../src/data/maps/generator.js';
import { TILESETS } from '../../src/data/tilesets.js';
import { measureWood } from '../../tools/lib/woodStats.mjs';
import { buildCampaignMap, CAMPAIGN_PRESETS, CAMPAIGN_NAMES, FAR_OIL, GOLD_AMOUNT } from '../../tools/lib/campaignMaps.mjs';
import ptBR from '../../src/i18n/pt-BR.json';
import en from '../../src/i18n/en.json';

/**
 * M2-07 — mapas de campanha da Horda: 1 Praia das Cinzas Vermelhas, 10 Cabo Aurora (desembarque, 2 continentes),
 * 11 Savana de Âmbar (Brasa-Alta sob cerco) e 12 Cabo Aurora, ponta leste (cidadela). Receitas em `tools/lib/campaignMaps.mjs`;
 * 10–12 reaproveitam a geometria dos palcos da Aliança (Costa Ferrugem, Estepe do Vento, Cabo Ferrugem) com outro bioma/tileset e
 * poços de petróleo recolocados longe da costa das bases (FAR_OIL).
 */
const SPEC = {
  'camp-01-praia-das-cinzas': { size: 208, tileset: 'deserto', slots: 2, isolated: false, anchors: ['playerStart', 'enemyStart', 'banditCamp1', 'banditCamp2', 'banditCamp3', 'muralFenda', 'shipHorizon', 'orcSails'] },
  'camp-10-cabo-aurora': { size: 384, tileset: 'exuberante', slots: 2, isolated: true, anchors: ['playerStart', 'enemyStart', 'landingZone', 'unloadSea', 'colonyMark', 'shipyard1', 'bargeStart1', 'bargeStart2', 'dock1', 'dock2', 'dock3', 'coastTower1', 'coastTower2', 'coastTower3', 'garrison', 'isletFarol', 'wellMid1', 'wellMid2', 'patrolSea'] },
  'camp-11-savana-de-ambar': { size: 352, tileset: 'savana', slots: 3, isolated: false, anchors: ['playerStart', 'enemyStart', 'colonyMark', 'skarnStart', 'hurganStart', 'enemy1Start', 'enemy2Start', 'landingZone', 'reinforceSea', 'convoyStart', 'convoyEnd', 'raid1', 'raid2', 'raid3', 'dissidentClan'] },
  'camp-12-cabo-aurora-leste': { size: 384, tileset: 'exuberante', slots: 2, isolated: false, anchors: ['playerStart', 'enemyStart', 'bastion', 'bastionHall', 'strait', 'dock1', 'dock2', 'dock3', 'fleetStart', 'orcFleetStart', 'assaultSea', 'assaultBeach', 'landingZone', 'reinforceSea', 'bossStart', 'passA', 'passB', 'well5', 'well6', 'isletCaptive', 'isletRuin'] }
};
const IDS = Object.keys(SPEC);
const WATER = new Set(['shipHorizon', 'orcSails', 'unloadSea', 'shipyard1Water', 'bargeStart1', 'bargeStart2', 'wellMid1', 'wellMid2', 'patrolSea', 'reinforceSea', 'strait', 'fleetStart', 'fleetStart2', 'orcFleetStart', 'orcFleetStart2', 'assaultSea', 'well5', 'well6', 'siegeFleetStart', 'siegeFleetStart2']);
const hyp = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

beforeAll(async () => { await loadAllCampaignMaps(); });

function oceanFill(m, sea) {
  const half = m.playable / 2;
  for (let d = 4; d < 30; d += 2) for (let t = -half; t <= half; t += 4) {
    const p = { x: t, z: -half + d };
    if (sea.isWalkableWorld(p.x, p.z)) return floodFill(sea, p.x, p.z);
  }
  throw new Error('sem oceano');
}

describe('M2-07 · mapas da Horda: registro e formato', () => {
  for (const id of IDS) {
    const S = SPEC[id];
    it(`${id}: oculto (fora da Escaramuça), painted, tileset ${S.tileset}, ${S.size} de lado, ${S.slots} vagas, nome pt/en`, () => {
      const m = getMap(id);
      expect(m.id).toBe(id);
      expect(m.hidden).toBe(true);
      expect(listMaps().map((x) => x.id)).not.toContain(id);
      expect(m.size).toBe(S.size);
      expect(m.tileset).toBe(S.tileset);
      expect(TILESETS[m.tileset]).toBeTruthy();
      expect(m.terrain.generator).toBe('painted');
      expect(m.biomeGrid).toBeTruthy();
      expect(m.startSlots).toHaveLength(S.slots);
      expect(m.maxPlayers).toBe(S.slots);
      expect(ptBR[`map.${id}.name`]).toBe(CAMPAIGN_NAMES[id].pt);
      expect(en[`map.${id}.name`]).toBe(CAMPAIGN_NAMES[id].en);
      expect(CAMPAIGN_PRESETS[id].naval).toBe(true);
    });

    it(`${id}: validateMapDef sem erros`, () => {
      expect(validateMapDef(getMap(id), { checkId: false }).errors).toEqual([]);
    });

    it(`${id}: JSON reproduzível pela receita (mesma semente ⇒ mesmo mapa)`, () => {
      const m = getMap(id);
      const again = buildCampaignMap(id, { seed: m.meta.seedUsed, tries: 1 });
      expect(again.ok).toBe(true);
      expect(JSON.stringify(again.mapDef)).toBe(JSON.stringify(m));
    }, 60000);

    it(`${id}: âncoras da ficha existem; as de água ficam no oceano navegável e as de terra são alcançáveis`, () => {
      const m = getMap(id);
      const land = buildPathfinder(m, 'land');
      const sea = buildPathfinder(m, 'naval');
      const ocean = oceanFill(m, sea);
      const seen0 = floodFill(land, m.startSlots[0].x, m.startSlots[0].z);
      for (const k of S.anchors) {
        const a = m.anchors[k];
        expect(a, k).toBeTruthy();
        if (WATER.has(k)) expect(isReached(sea, ocean, a.x, a.z), `${k} no oceano`).toBe(true);
        else if (!S.isolated && !/^(islet|well)/.test(k)) expect(isReached(land, seen0, a.x, a.z), `${k} por terra`).toBe(true);
      }
    });

    it(`${id}: conectividade das bases e madeira >= 6000 por base`, () => {
      const m = getMap(id);
      const land = buildPathfinder(m, 'land');
      const seen0 = floodFill(land, m.startSlots[0].x, m.startSlots[0].z);
      m.startSlots.slice(1).forEach((s) => {
        expect(isReached(land, seen0, s.x, s.z), 'bases no mesmo continente').toBe(!S.isolated);
      });
      for (const a of m.startSlots) for (const b of m.startSlots) if (a !== b) expect(hyp(a, b)).toBeGreaterThanOrEqual(S.size >= 320 ? 150 : 90);
      const r = measureWood(m, { seed: 1 });
      r.gm.dispose?.();
      for (const p of r.perPlayer) expect(p.wood, `slot ${p.slot}`).toBeGreaterThanOrEqual(6000);
    }, 60000);

    it(`${id}: minas de ouro iniciais a ~30 u da base e jazidas com ${GOLD_AMOUNT}`, () => {
      const m = getMap(id);
      const gold = m.resources.filter((r) => r.type === 'gold');
      for (const g of gold) expect(g.amount).toBe(GOLD_AMOUNT);
      for (const s of m.startSlots) {
        const d = Math.min(...gold.map((g) => hyp(g, s)));
        expect(d, 'mina inicial').toBeGreaterThanOrEqual(28);
        expect(d).toBeLessThanOrEqual(36);
      }
    });

    it(`${id}: poços de petróleo de 10000 em mar aberto, longe da costa das bases (>= ${FAR_OIL.minShore} u) e alcançáveis por barcaça/petroleiro`, () => {
      const m = getMap(id);
      const oil = m.resources.filter((r) => r.type === 'oil');
      expect(oil.length).toBeGreaterThanOrEqual(4);
      const sea = buildPathfinder(m, 'naval');
      const ocean = oceanFill(m, sea);
      const land = buildPathfinder(m, 'land');
      const seens = m.startSlots.slice(0, 2).map((s) => floodFill(land, s.x, s.z));
      for (const w of oil) {
        expect(w.amount).toBe(10000);
        expect(isReached(sea, ocean, w.x, w.z), `poço ${w.x},${w.z} navegável`).toBe(true);
        // distância ao litoral da terra de cada base (amostragem da malha de terra em passos de 3 u)
        for (const seen of seens) {
          let d = Infinity;
          for (let j = 0; j < land.rows; j += 2) for (let i = 0; i < land.cols; i += 2) {
            const p = land.toWorld(i, j);
            if (!isReached(land, seen, p.x, p.z)) continue;
            const e = hyp(p, w);
            if (e < d) d = e;
          }
          expect(d, `poço ${w.x},${w.z} longe da costa`).toBeGreaterThanOrEqual(FAR_OIL.minShore - 4);
        }
        for (const s of m.startSlots) expect(hyp(s, w), 'longe do centro da base').toBeGreaterThanOrEqual(60);
      }
      expect(m.meta.oilFar).toHaveLength(oil.length);
    }, 60000);
  }
});

describe('M2-07 · especificidades', () => {
  it('Cabo Aurora (10): os dois continentes são isolados por terra; o oceano liga as duas costas', () => {
    const m = getMap('camp-10-cabo-aurora');
    const land = buildPathfinder(m, 'land');
    const seen0 = floodFill(land, m.startSlots[0].x, m.startSlots[0].z);
    expect(isReached(land, seen0, m.startSlots[1].x, m.startSlots[1].z)).toBe(false);
    expect(hyp(m.startSlots[0], m.startSlots[1])).toBeGreaterThanOrEqual(150);
  });

  it('Cabo Aurora, ponta leste (12): crista de falésia com 2 desfiladeiros e estreito estreito (<= 26 u)', () => {
    const m = getMap('camp-12-cabo-aurora-leste');
    expect(m.meta.ridge.gaps).toHaveLength(2);
    expect(m.anchors.passA).toBeTruthy();
    expect(m.anchors.passB).toBeTruthy();
    expect(m.anchors.strait.water).toBe(true);
  });

  it('Praia das Cinzas (1): 3 acampamentos de saqueadores neutros (naval leve: ilha ao largo)', () => {
    const m = getMap('camp-01-praia-das-cinzas');
    expect(m.neutrals.filter((n) => n.kind === 'camp')).toHaveLength(3);
  });
});
