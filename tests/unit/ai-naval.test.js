import { describe, it, expect } from 'vitest';
import { CMD } from '../../src/sim/commands.js';
import { EVT } from '../../src/sim/events.js';
import { DIFFICULTY_PROFILES } from '../../src/ai/AIProfile.js';
import { getUnitDef } from '../../src/data/index.js';
import { makeGm, run, place } from './helpers/aiWorld.js';

/** AI-NAVAL — a IA constrói porto/refinaria/plataforma, treina frota e a usa (mapas com mar + petróleo). */

describe('AI-NAVAL: perfis e inércia', () => {
  it('todas as dificuldades têm parâmetros navais coerentes (mais difícil = mais cedo / maior frota)', () => {
    const ids = ['easy', 'normal', 'hard', 'brutal'];
    for (const id of ids) {
      const n = DIFFICULTY_PROFILES[id].naval;
      expect(n, id).toBeTruthy();
      expect(n.maxFleet).toBeGreaterThanOrEqual(n.fleet);
      expect(n.attackAt).toBeGreaterThan(0);
    }
    for (let i = 1; i < ids.length; i++) {
      const a = DIFFICULTY_PROFILES[ids[i - 1]].naval;
      const b = DIFFICULTY_PROFILES[ids[i]].naval;
      expect(b.at).toBeLessThan(a.at);
      expect(b.maxFleet).toBeGreaterThanOrEqual(a.maxFleet);
    }
  });

  it('mapa sem petróleo/mar: o gerente naval fica inerte (sem reserva, sem obras, sem comandos navais)', () => {
    const gm = makeGm({ difficulties: ['brutal', 'brutal'] });
    const issued = [];
    const orig = gm.issue.bind(gm);
    gm.issue = c => { issued.push(c); return orig(c); };
    run(gm, 20 * 60 * 5);
    for (const d of gm.aiDirectors) {
      expect(d.navalManager.planActive()).toBe(false);
      expect(d.navalManager.planReserve()).toBeNull();
    }
    const navalTypes = new Set(['shipyard', 'ship_dock', 'refinery', 'ash_cauldron', 'oil_platform', 'tanker', 'frigate', 'war_galley']);
    expect(issued.filter(c => navalTypes.has(c.buildingType) || navalTypes.has(c.unitType))).toEqual([]);
    gm.dispose();
  });
});

describe('AI-NAVAL: exclusões do exército terrestre', () => {
  it('navios não entram em getCombatUnitCount nem no esquadrão terrestre', () => {
    const gm = makeGm({ mapId: 'estreito-naval-1v1' });
    const d = gm.aiDirectors[0];
    const before = d.getCombatUnitCount();
    const sy = d.navalManager.types.shipyard;
    expect(sy).toBe('shipyard');
    const dock = gm.navalPathfinder.findNearestWalkable(d.baseCenter.x, d.baseCenter.y, 40);
    expect(dock).toBeTruthy();
    const ship = gm.spawnUnit('frigate', dock.x, dock.y ?? dock.z, 0);
    place(gm, ship, dock.x, dock.z);
    expect(d.getCombatUnitCount()).toBe(before);
    d.militaryManager.collectSquad();
    for (let i = 0; i < d.militaryManager.readySquadCount; i++) expect(d.militaryManager.readySquadBuffer[i].layer).not.toBe('naval');
    gm.dispose();
  });
});

describe('AI-NAVAL: escolha de alvo', () => {
  it('prefere plataforma/navio conhecido a uma construção costeira qualquer e ataca de um ponto de água', () => {
    const gm = makeGm({ mapId: 'estreito-naval-1v1' });
    const d = gm.aiDirectors[0];
    const wells = gm.resourceDeposits.filter(w => w.type === 'oil');
    expect(wells.length).toBeGreaterThan(0);
    const w = wells[0].mesh.position;
    const per = d.perception;
    per.buildings.set(9001, { id: 9001, type: 'oil_platform', ownerId: 1, x: w.x, z: w.z, role: 'platform', radius: 2, tier: 1, lastSeen: 0 });
    const t = d.navalManager.pickTarget(w.x + 20, w.z + 20);
    expect(t).toBeTruthy();
    expect(t.id).toBe(9001);
    expect(t.isUnit).toBe(false);
    expect(gm.navalPathfinder.isWalkableWorld(t.sx, t.sz)).toBe(true);
    // um petroleiro inimigo visto agora tem prioridade ainda maior que a plataforma, se estiver mais perto
    per.now = 100;
    per.units.set(9002, { id: 9002, type: 'tanker', ownerId: 1, x: w.x + 18, z: w.z + 18, cls: 'worker', lastSeen: 100 });
    const t2 = d.navalManager.pickTarget(w.x + 20, w.z + 20);
    expect(t2.id).toBe(9002);
    expect(t2.isUnit).toBe(true);
    gm.dispose();
  });
});

describe('AI-NAVAL: economia e frota em mapa naval', () => {
  it('partida IA×IA real (Normal × Normal): alguém ergue Estaleiro/Plataforma, coleta petróleo e treina navios de guerra', () => {
    const gm = makeGm({ mapId: 'estreito-naval-1v1', difficulties: ['normal', 'normal'] });
    const trained = { tanker: 0, warship: 0 };
    gm.events.on(EVT.UNIT_TRAINED, e => {
      const def = getUnitDef(e.unitType);
      if (def.isTanker) trained.tanker++; else if (def.layer === 'naval' && def.isCombat) trained.warship++;
    });
    const issued = new Set();
    const orig = gm.issue.bind(gm);
    gm.issue = c => { issued.add(c.type + ':' + (c.buildingType || c.unitType || '')); return orig(c); };
    for (let m = 0; m < 24 && !gm.isGameOver; m++) run(gm, 20 * 60);
    expect(issued.has(`${CMD.PLACE_BUILDING}:shipyard`) || issued.has(`${CMD.PLACE_BUILDING}:ship_dock`)).toBe(true);
    expect(issued.has(`${CMD.PLACE_BUILDING}:oil_platform`)).toBe(true);
    expect(issued.has(`${CMD.GATHER}:`)).toBe(true);
    expect(trained.tanker).toBeGreaterThanOrEqual(1);
    expect(trained.warship).toBeGreaterThanOrEqual(1);
    gm.dispose();
  }, 240000);
});
