import { describe, it, expect, vi } from 'vitest';
import { CMD } from '../../src/sim/commands.js';
import { NEUTRAL_HOSTILE_ID } from '../../src/sim/EntityIds.js';
import { makeGm, place } from './helpers/aiWorld.js';

/**
 * NEW-25 — a IA (Normal+) ataca acampamentos neutros (bandidos) de forma ocasional: só com >= 8 combatentes parados, sem
 * inimigo à vista, com o acampamento já revelado à percepção, deixando defesa em casa e retornando ao fluxo normal.
 */

function world(diff = 'normal') {
  const gm = makeGm({ seed: 3, difficulties: [diff, diff] });
  const d = gm.aiDirectors[0];
  d._apmTokens = 1e9;
  d.simTime = 1000; // depois do atraso inicial de expedição
  const mil = d.militaryManager;
  const camps = gm.buildings.filter(b => b.ownerId === NEUTRAL_HOSTILE_ID && b.type === 'bandit_camp');
  const at = (type, x, z) => { const u = gm.spawnUnit(type, x, z, d.playerId); place(gm, u, x, z); return u; };
  return { gm, d, mil, camps, at };
}
/** Camp mais próximo da base da IA (a percepção escolhe o mais próximo). */
function nearestCamp(d, camps) {
  return camps.slice().sort((a, b) => Math.hypot(a.mesh.position.x - d.baseCenter.x, a.mesh.position.z - d.baseCenter.y) - Math.hypot(b.mesh.position.x - d.baseCenter.x, b.mesh.position.z - d.baseCenter.y))[0];
}
/** Põe a base da IA a 40 do acampamento (dentro do alcance de risco). */
function baseNear(w, camp) {
  w.d.baseCenter = { x: camp.mesh.position.x + 40, y: camp.mesh.position.z };
}
/** Exército parado de n combatentes perto da base. */
function army(w, n) {
  const out = [];
  const b = w.d.baseCenter;
  for (let i = 0; i < n; i++) out.push(w.at(i % 3 === 0 ? w.d.rangedType : w.d.meleeType, b.x + 4 + i * 0.8, b.y + 6));
  return out;
}
/** Revela o acampamento à percepção (como se o explorador o tivesse visto). */
function reveal(w, camp) {
  const p = camp.mesh.position;
  w.d.perception.camps.set(camp.id, { id: camp.id, x: p.x, z: p.z, guards: 3, lastSeen: 0 });
}
const cmds = spy => spy.mock.calls.map(c => c[0]);

describe('NEW-25: IA ataca acampamento neutro', () => {
  it('o mapa tem acampamentos neutros e a percepção só os conhece depois de revelados', () => {
    const w = world();
    expect(w.camps.length).toBeGreaterThan(0);
    expect(w.d.perception.camps.size).toBe(0);
    // uma unidade da IA ao lado do acampamento o revela
    const c = w.camps[0];
    w.at(w.d.meleeType, c.mesh.position.x + 3, c.mesh.position.z);
    w.d.perception.update();
    expect(w.d.perception.camps.has(c.id)).toBe(true);
    w.gm.dispose();
  });

  it('com >= 8 combatentes parados e acampamento revelado: ordem de ataque, deixando defesa em casa', () => {
    const w = world();
    const camp = nearestCamp(w.d, w.camps);
    baseNear(w, camp);
    army(w, 12);
    reveal(w, camp);
    const spy = vi.spyOn(w.gm, 'issue');
    w.mil.manageNeutralCamp();
    const c = cmds(spy).filter(x => x.type === CMD.ATTACK_MOVE);
    expect(c.length).toBe(1);
    expect(c[0].unitIds.length).toBeLessThan(12);
    expect(c[0].unitIds.length).toBeGreaterThanOrEqual(6);
    expect(c[0].x).toBeCloseTo(camp.mesh.position.x, 3);
    expect(w.mil._campOp).not.toBe(null);
    w.gm.dispose();
  });

  it('não ataca: poucos combatentes, Fácil, acampamento desconhecido, inimigo à vista ou cooldown', () => {
    const run1 = (setup) => {
      const w = world(setup.diff || 'normal');
      const camp = nearestCamp(w.d, w.camps);
      baseNear(w, camp);
      army(w, setup.n ?? 12);
      if (!setup.hidden) reveal(w, camp);
      if (setup.visible) w.d.perception.visibleUnits.push({});
      if (setup.cool) w.mil._campNextAt = 5000;
      const spy = vi.spyOn(w.gm, 'issue');
      w.mil.manageNeutralCamp();
      const n = cmds(spy).length;
      w.gm.dispose();
      return n;
    };
    expect(run1({ n: 6 })).toBe(0);
    expect(run1({ diff: 'easy' })).toBe(0);
    expect(run1({ hidden: true })).toBe(0);
    expect(run1({ visible: true })).toBe(0);
    expect(run1({ cool: true })).toBe(0);
  });

  it('acampamento além do alcance de risco (> 90 da base): não ataca', () => {
    const w = world();
    const camp = nearestCamp(w.d, w.camps);
    w.d.baseCenter = { x: camp.mesh.position.x + 120, y: camp.mesh.position.z };
    army(w, 12);
    reveal(w, camp);
    const spy = vi.spyOn(w.gm, 'issue');
    w.mil.manageNeutralCamp();
    expect(cmds(spy).length).toBe(0);
    w.gm.dispose();
  });

  it('só lança com a IA no fluxo normal: onda em marcha bloqueia', () => {
    const w = world();
    const camp = nearestCamp(w.d, w.camps);
    baseNear(w, camp);
    const units = army(w, 12);
    reveal(w, camp);
    units[0].state = 'attacking';
    w.mil.waveIds.add(units[0].id);
    const spy = vi.spyOn(w.gm, 'issue');
    w.mil.manageNeutralCamp();
    expect(cmds(spy).length).toBe(0);
    w.gm.dispose();
  });

  it('recolhe ao ponto de reunião quando o acampamento cai, e espera o cooldown', () => {
    const w = world();
    const camp = nearestCamp(w.d, w.camps);
    baseNear(w, camp);
    army(w, 12);
    reveal(w, camp);
    w.mil.manageNeutralCamp();
    expect(w.mil._campOp).not.toBe(null);
    const ids = [...w.mil._campOp.ids];
    camp.die();
    const spy = vi.spyOn(w.gm, 'issue');
    w.mil.manageNeutralCamp();
    const c = cmds(spy);
    expect(c.length).toBe(1);
    expect(c[0].type).toBe(CMD.MOVE);
    expect(c[0].unitIds).toEqual(ids);
    expect(w.mil._campOp).toBe(null);
    expect(w.mil._campNextAt).toBeGreaterThan(1000);
    w.gm.dispose();
  });

  it('recolhe quando as baixas passam de 60 %', () => {
    const w = world();
    const camp = nearestCamp(w.d, w.camps);
    baseNear(w, camp);
    army(w, 12);
    reveal(w, camp);
    w.mil.manageNeutralCamp();
    expect(w.mil._campOp).not.toBe(null);
    const ids = [...w.mil._campOp.ids];
    for (let i = 0; i < Math.ceil(ids.length * 0.65); i++) w.gm.getEntity(ids[i]).die();
    w.mil.manageNeutralCamp();
    expect(w.mil._campOp).toBe(null);
    w.gm.dispose();
  });

  it('as unidades do ataque ao acampamento não entram na próxima onda', () => {
    const w = world();
    const camp = nearestCamp(w.d, w.camps);
    baseNear(w, camp);
    army(w, 12);
    reveal(w, camp);
    w.mil.manageNeutralCamp();
    expect(w.mil._campOp).not.toBe(null);
    for (const id of w.mil._campOp.ids) w.gm.getEntity(id).state = 'idle';
    w.mil.collectSquad();
    for (let i = 0; i < w.mil.readySquadCount; i++) expect(w.mil._campOp.ids.has(w.mil.readySquadBuffer[i].id)).toBe(false);
    w.gm.dispose();
  });
});
