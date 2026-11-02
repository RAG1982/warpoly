import { describe, it, expect, beforeAll } from 'vitest';
import { getMap, listMaps, loadAllCampaignMaps } from '../../src/data/maps/index.js';
import { validateMapDef } from '../../src/data/maps/validate.js';
import { buildPathfinder, floodFill, isReached } from '../../src/data/maps/generator.js';
import { getHeightForMap } from '../../src/sim/terrainGenerators.js';
import { measureWood } from '../../tools/lib/woodStats.mjs';
import { buildCampaignMap, CAMPAIGN_PRESETS } from '../../tools/lib/campaignMaps.mjs';

/**
 * M3-11 — palco 10 "Costa Ferrugem" (`camp-10-costa-ferrugem`), a travessia do Mar Fendido: 384 de lado (jogável 372), naval.
 * Slot 0 = ilha-continente da Liga (oeste, sem caminho por terra até Cinzara); slot 1 = Clãs em Cinzara (leste). Entre as duas costas,
 * ~140 u de mar aberto e o Farol (ilha rochosa do meio) com dois poços do mar e o Poço Velho. Gerado por `tools/gen-campaign-maps.mjs`
 * (receita `postTravessia` em `tools/lib/campaignMaps.mjs`). Este arquivo substitui os testes M2-06 do palco 10 (que o gerou a 208).
 */
const ID = 'camp-10-costa-ferrugem';
const hyp = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

beforeAll(async () => { await loadAllCampaignMaps(); });

function oceanSeen(m, sea) {
  const half = m.playable / 2;
  for (let d = 4; d < 30; d += 2) for (let t = -half; t <= half; t += 4) {
    const p = { x: t, z: -half + d };
    if (sea.isWalkableWorld(p.x, p.z)) return floodFill(sea, p.x, p.z);
  }
  throw new Error('sem oceano');
}

describe('M3-11 · Costa Ferrugem: registro e formato', () => {
  it('384 de lado (no limite de SIZE_LIMITS), naval, deserto, oculto (fora da Escaramuça), 2 vagas', () => {
    const m = getMap(ID);
    expect(m.id).toBe(ID);
    expect(m.hidden).toBe(true);
    expect(listMaps().map((x) => x.id)).not.toContain(ID);
    expect(m.size).toBe(384);
    expect(m.playable).toBeGreaterThanOrEqual(360);
    expect(m.tileset).toBe('deserto');
    expect(m.startSlots).toHaveLength(2);
    expect(m.maxPlayers).toBe(2);
    expect(CAMPAIGN_PRESETS[ID].naval).toBe(true);
    expect(CAMPAIGN_PRESETS[ID].isolated).toBe(true);
  });

  it('validateMapDef sem erros (os avisos de conectividade entre continentes são esperados, como no palco 4)', () => {
    const v = validateMapDef(getMap(ID), { checkId: false });
    expect(v.errors).toEqual([]);
  });

  it('bases bem afastadas (≥ 150 u) e madeira alcançável a 60 u >= 6.000 por base (sementes 1 e 2)', () => {
    const m = getMap(ID);
    const [s0, s1] = m.startSlots;
    expect(hyp(s0, s1)).toBeGreaterThanOrEqual(150);
    for (const seed of [1, 2]) {
      const r = measureWood(getMap(ID), { seed });
      r.gm.dispose?.();
      for (const p of r.perPlayer) expect(p.wood, `seed ${seed} slot ${p.slot}`).toBeGreaterThanOrEqual(6000);
    }
  });

  it('o JSON é reproduzível pela receita (mesma semente ⇒ mesmo mapa)', () => {
    const m = getMap(ID);
    const again = buildCampaignMap(ID, { seed: m.meta.seedUsed, tries: 1 });
    expect(again.ok).toBe(true);
    expect(JSON.stringify(again.mapDef)).toBe(JSON.stringify(m));
  });
});

describe('M3-11 · Costa Ferrugem: a travessia', () => {
  const ANCHORS = ['playerStart', 'enemyStart', 'landingZone', 'unloadSea', 'colonyMark', 'colonyGold', 'shipyard1', 'shipyard1Water', 'beach1', 'bargeStart1', 'bargeStart2', 'dock1', 'dock2', 'dock3', 'coastTower1', 'coastTower2', 'coastTower3', 'garrison', 'isletFarol', 'isletWell', 'wellMid1', 'wellMid2', 'patrolSea'];

  it('todas as âncoras da missão existem', () => {
    const a = getMap(ID).anchors;
    for (const k of ANCHORS) expect(a[k], k).toBeTruthy();
  });

  it('a Liga (slot 0) não alcança Cinzara a pé; a praia, o Marco, as docas e a guarda são alcançáveis por terra a partir dos Clãs (slot 1)', () => {
    const m = getMap(ID);
    const land = buildPathfinder(m, 'land');
    const seen0 = floodFill(land, m.startSlots[0].x, m.startSlots[0].z);
    const seen1 = floodFill(land, m.startSlots[1].x, m.startSlots[1].z);
    const a = m.anchors;
    expect(isReached(land, seen0, a.landingZone.x, a.landingZone.z), 'praia a pé desde a Liga').toBe(false);
    for (const k of ['landingZone', 'colonyMark', 'dock1', 'dock2', 'dock3', 'garrison', 'coastTower1', 'coastTower2', 'coastTower3']) {
      expect(isReached(land, seen1, a[k].x, a[k].z), `${k} por terra desde os Clãs`).toBe(true);
    }
    expect(isReached(land, seen0, a.shipyard1.x, a.shipyard1.z), 'estaleiro por terra desde a Liga').toBe(true);
    expect(isReached(land, seen1, a.isletWell.x, a.isletWell.z), 'Poço Velho a pé desde os Clãs').toBe(false);
    expect(isReached(land, seen0, a.isletWell.x, a.isletWell.z), 'Poço Velho a pé desde a Liga').toBe(false);
  });

  it('a Liga cruza o mar: a partida das Barcaças e o estaleiro são água do oceano, e a praia fica a ≥ 100 u dali', () => {
    const m = getMap(ID);
    const sea = buildPathfinder(m, 'naval');
    const ocean = oceanSeen(m, sea);
    const a = m.anchors;
    for (const k of ['shipyard1Water', 'bargeStart1', 'bargeStart2', 'unloadSea', 'wellMid1', 'wellMid2', 'patrolSea']) {
      expect(a[k].water, k).toBe(true);
      expect(isReached(sea, ocean, a[k].x, a[k].z), `${k} no oceano navegável`).toBe(true);
    }
    expect(hyp(a.bargeStart1, a.unloadSea)).toBeGreaterThanOrEqual(100);
    expect(hyp(a.bargeStart1, a.bargeStart2)).toBeLessThanOrEqual(12);
    expect(hyp(a.beach1, a.bargeStart1)).toBeLessThanOrEqual(14);
    expect(hyp(a.shipyard1, a.playerStart)).toBeLessThanOrEqual(60);
  });

  it('o Marco fica atrás da praia (14–24 u), longe da base dos Clãs; as docas ficam no litoral (16 u entre si, a 16–70 u da praia)', () => {
    const a = getMap(ID).anchors;
    const d = hyp(a.colonyMark, a.landingZone);
    expect(d).toBeGreaterThanOrEqual(14);
    expect(d).toBeLessThanOrEqual(24);
    expect(hyp(a.colonyMark, a.enemyStart)).toBeGreaterThanOrEqual(60);
    const docks = [1, 2, 3].map((i) => a[`dock${i}`]);
    for (const p of docks) {
      expect(hyp(p, a.landingZone)).toBeGreaterThanOrEqual(16);
      expect(hyp(p, a.landingZone)).toBeLessThanOrEqual(70);
    }
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) expect(hyp(docks[i], docks[j])).toBeGreaterThanOrEqual(16);
  });

  it('o Farol (ilha do meio) tem terra seca; o Poço Velho e os poços do mar estão a ≥ 16 u uns dos outros', () => {
    const m = getMap(ID);
    const a = m.anchors;
    expect(getHeightForMap(m, a.isletFarol.x, a.isletFarol.z)).toBeGreaterThanOrEqual(1.8);
    expect(hyp(a.wellMid1, a.wellMid2)).toBeGreaterThanOrEqual(16);
    const oil = m.resources.filter((r) => r.type === 'oil');
    for (const w of oil) expect(oil.filter((q) => q !== w && hyp(q, w) < 16)).toEqual([]);
  });
});
