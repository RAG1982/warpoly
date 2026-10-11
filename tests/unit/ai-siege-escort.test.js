import { describe, it, expect, vi } from 'vitest';
import { CMD } from '../../src/sim/commands.js';
import { makeGm, run, place } from './helpers/aiWorld.js';

/**
 * NEW-34 — escolta de cerco: a onda com cerco encena num ponto de encontro (cerco atrás da linha), só lança quando o cerco
 * chega, e inimigo colado dentro do alcance mínimo do cerco é atacado por uma escolta corpo a corpo (ou o cerco recua).
 */

function world() {
  const gm = makeGm({ seed: 3, difficulties: ['normal', 'normal'] });
  const d = gm.aiDirectors[0];
  d._apmTokens = 1e9;
  const mil = d.militaryManager;
  const at = (type, x, z) => { const u = gm.spawnUnit(type, x, z, d.playerId); place(gm, u, x, z); return u; };
  return { gm, d, mil, at };
}
const target = { id: 99999, x: 40, z: 0, ownerId: 1 };
const cmds = spy => spy.mock.calls.map(c => c[0]);

describe('NEW-34: encenação da onda com cerco', () => {
  it('cerco + tropa contra alvo distante: ponto de encontro a 26 do alvo, cerco 8 atrás; nada ataca ainda', () => {
    const { gm, d, mil, at } = world();
    const army = [at(d.meleeType, -20, 0), at(d.meleeType, -22, 2), at(d.rangedType, -22, -2)];
    const siege = [at(d.siegeType, -24, 0)];
    const spy = vi.spyOn(gm, 'issue');
    expect(mil._startOperation([...army, ...siege], target)).toBe(true);
    const c = cmds(spy);
    expect(c.length).toBe(2);
    expect(c.every(x => x.type === CMD.ATTACK_MOVE)).toBe(true);
    const armyCmd = c.find(x => x.unitIds.includes(army[0].id));
    const siegeCmd = c.find(x => x.unitIds.includes(siege[0].id));
    expect(armyCmd.unitIds).not.toContain(siege[0].id);
    expect(Math.hypot(armyCmd.x - target.x, armyCmd.z - target.z)).toBeCloseTo(26, 3);
    expect(Math.hypot(siegeCmd.x - target.x, siegeCmd.z - target.z)).toBeCloseTo(34, 3);
    expect(mil._op.phase).toBe('stage');
    gm.dispose();
  });

  it('sem cerco, ou alvo perto: não encena', () => {
    const { gm, d, mil, at } = world();
    const army = [at(d.meleeType, -20, 0), at(d.meleeType, -22, 2)];
    expect(mil._startOperation(army, target)).toBe(false);
    const siege = at(d.siegeType, 20, 0);
    const near = [at(d.meleeType, 22, 0), at(d.meleeType, 22, 2), siege];
    expect(mil._startOperation(near, target)).toBe(false);
    expect(mil._op).toBe(null);
    gm.dispose();
  });

  it('espera o cerco chegar; ao chegar lança o ataque', () => {
    const { gm, d, mil, at } = world();
    const army = [at(d.meleeType, -20, 0), at(d.meleeType, -22, 2)];
    const siege = at(d.siegeType, -24, 0);
    mil._startOperation([...army, siege], target);
    siege.state = 'moving';
    d.simTime = 5;
    const spy = vi.spyOn(gm, 'issue');
    mil.updateOperation();
    expect(spy).not.toHaveBeenCalled(); // cerco ainda longe do ponto de encontro
    place(gm, siege, mil._op.siegeStage.x, mil._op.siegeStage.z);
    mil.updateOperation();
    const c = cmds(spy);
    expect(c.length).toBe(2);
    expect(c.every(x => x.type === CMD.ATTACK_MOVE || x.type === CMD.ATTACK)).toBe(true);
    expect(mil._op.phase).toBe('assault');
    gm.dispose();
  });

  it('timeout: lança mesmo com o cerco atrasado', () => {
    const { gm, d, mil, at } = world();
    const army = [at(d.meleeType, -20, 0), at(d.meleeType, -22, 2)];
    const siege = at(d.siegeType, -24, 0);
    mil._startOperation([...army, siege], target);
    siege.state = 'moving';
    d.simTime = 100;
    mil.updateOperation();
    expect(mil._op.phase).toBe('assault');
    gm.dispose();
  });

  it('a operação reserva as unidades: collectSquad não as recolhe de novo', () => {
    const { gm, d, mil, at } = world();
    const army = [at(d.meleeType, -20, 0), at(d.meleeType, -22, 2)];
    const siege = at(d.siegeType, -24, 0);
    mil._startOperation([...army, siege], target);
    for (const u of [...army, siege]) u.state = 'idle';
    mil.collectSquad();
    for (let i = 0; i < mil.readySquadCount; i++) expect([...army, siege]).not.toContain(mil.readySquadBuffer[i]);
    gm.dispose();
  });
});

describe('NEW-34: inimigo dentro do alcance mínimo do cerco', () => {
  function assault() {
    const w = world();
    const { gm, d, mil, at } = w;
    const army = [at(d.meleeType, 20, 10), at(d.meleeType, 22, 12), at(d.rangedType, 22, 8)];
    const siege = at(d.siegeType, 18, 0);
    mil._startOperation([...army, siege], { id: 99999, x: 80, z: 0, ownerId: 1 });
    siege.state = 'idle';
    d.simTime = 5;
    mil.updateOperation(); // lança
    const foe = gm.spawnUnit(d.meleeType, 19, 1, 1);
    place(gm, foe, 19, 1);
    return { ...w, army, siege, foe };
  }

  it('manda corpo a corpo atacar o inimigo colado (nunca o atirador/cerco)', () => {
    const { gm, d, mil, army, siege, foe } = assault();
    const spy = vi.spyOn(gm, 'issue');
    d.simTime = 10;
    mil.updateOperation();
    const c = cmds(spy);
    expect(c.length).toBe(1);
    expect(c[0].type).toBe(CMD.ATTACK);
    expect(c[0].targetId).toBe(foe.id);
    expect(c[0].unitIds).not.toContain(siege.id);
    expect(c[0].unitIds).not.toContain(army[2].id);
    expect(c[0].unitIds.length).toBeGreaterThan(0);
    mil.updateOperation(); // cooldown: no mesmo instante não repete
    expect(cmds(spy).length).toBe(1);
    gm.dispose();
  });

  it('sem escolta corpo a corpo: o cerco recua, afastando-se do inimigo', () => {
    const { gm, d, mil, army, siege, foe } = assault();
    mil._op.army = [army[2].id]; // só atirador
    const spy = vi.spyOn(gm, 'issue');
    d.simTime = 10;
    mil.updateOperation();
    const c = cmds(spy);
    expect(c.length).toBe(1);
    expect(c[0].type).toBe(CMD.MOVE);
    expect(c[0].unitIds).toEqual([siege.id]);
    const before = Math.hypot(siege.mesh.position.x - foe.mesh.position.x, siege.mesh.position.z - foe.mesh.position.z);
    const after = Math.hypot(c[0].x - foe.mesh.position.x, c[0].z - foe.mesh.position.z);
    expect(after).toBeGreaterThan(before + 4);
    gm.dispose();
  });

  it('inimigo fora do alcance mínimo: nenhuma ordem', () => {
    const { gm, d, mil, foe } = assault();
    place(gm, foe, 18, 15);
    const spy = vi.spyOn(gm, 'issue');
    d.simTime = 10;
    mil.updateOperation();
    expect(spy).not.toHaveBeenCalled();
    gm.dispose();
  });

  it('a operação termina quando o cerco morre', () => {
    const { gm, mil, siege } = assault();
    siege.die();
    mil.updateOperation();
    expect(mil._op).toBe(null);
    gm.dispose();
  });

  it('partida IA×IA com a operação ativa roda sem exceção e de forma reprodutível', () => {
    const a = makeGm({ seed: 5, difficulties: ['normal', 'normal'] });
    run(a, 600);
    const b = makeGm({ seed: 5, difficulties: ['normal', 'normal'] });
    run(b, 600);
    expect(a.currentTick).toBe(b.currentTick);
    a.dispose(); b.dispose();
  });
});
