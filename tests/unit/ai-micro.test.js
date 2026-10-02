import { describe, it, expect, vi } from 'vitest';
import { CMD } from '../../src/sim/commands.js';
import { DIFFICULTY_PROFILES } from '../../src/ai/AIProfile.js';
import { makeGm, place } from './helpers/aiWorld.js';

/** F5-05 — micro tático em mundo sintético (cada tática emite o comando esperado). */

describe('F5-05: micro tático (mundo sintético)', () => {
  /** Mundo 1v1 com a IA 0 (Brutal por padrão) e as unidades iniciais afastadas da ação. */
  function arena(difficulty = 'hard') {
    const gm = makeGm({ difficulties: [difficulty, 'normal'] });
    const d = gm.aiDirectors[0];
    // todo mundo longe: a "arena" fica em (0, 0) — no meio do mapa, longe das duas bases
    for (const u of gm.getUnitsOf(0).concat(gm.getUnitsOf(1))) place(gm, u, u.ownerId === 0 ? 30 : -30, u.ownerId === 0 ? -20 : 20);
    const spy = vi.spyOn(gm, 'issue');
    const spawn = (type, owner, x, z) => {
      const u = gm.spawnUnit(type, x, z, owner);
      place(gm, u, x, z);
      return u;
    };
    const cmds = type => spy.mock.calls.map(c => c[0]).filter(c => c.type === type);
    const refresh = () => { d.perception.update(); };
    return { gm, d, spy, spawn, cmds, refresh };
  }

  it('recua feridos (< 30 % PV) em combate longe da base', () => {
    const { gm, d, spawn, cmds, refresh } = arena('normal');
    const hurt = spawn('knight', 0, 0, 0);
    hurt.hp = hurt.maxHp * 0.1;
    hurt.state = 'attacking';
    spawn('grunt', 1, 3, 0);
    refresh();
    d.microManager.update();
    const moves = cmds(CMD.MOVE);
    expect(moves.length).toBe(1);
    expect(moves[0].unitIds).toEqual([hurt.id]);
    expect(d.isReserved(hurt.id)).toBe(true);
    gm.dispose();
  });

  it('Fácil não faz micro nenhum', () => {
    const { gm, d, spawn, spy, refresh } = arena('easy');
    const hurt = spawn('knight', 0, 0, 0);
    hurt.hp = 5;
    hurt.state = 'attacking';
    spawn('grunt', 1, 3, 0);
    refresh();
    d.microManager.update();
    expect(spy).not.toHaveBeenCalled();
    gm.dispose();
  });

  it('foca fogo: conjurador/atirador antes do corpo a corpo, mesmo com mais PV (Difícil)', () => {
    const { gm, d, spawn, cmds, refresh } = arena('hard');
    const mine = [spawn('knight', 0, 0, 0), spawn('knight', 0, 1, 1), spawn('knight', 0, 2, 0)];
    const brute = spawn('grunt', 1, 4, 0);
    const shooter = spawn('axethrower', 1, 5, 2);
    mine.forEach(u => { u.state = 'attacking'; u.targetEntity = brute; u.attackTarget = brute; });
    refresh();
    d.microManager.update();
    const atk = cmds(CMD.ATTACK);
    expect(atk.length).toBe(1);
    expect(atk[0].targetId).toBe(shooter.id);
    expect(atk[0].unitIds.length).toBe(3);
    gm.dispose();
  });

  it('kiting: atirador não foge de infantaria mais rápida (só perderia dano)', () => {
    const { gm, d, spawn, cmds, refresh } = arena('hard');
    const arch = spawn('archer', 0, 0, 0);
    arch.state = 'attacking';
    spawn('grunt', 1, 1.5, 0);
    refresh();
    d.microManager.update();
    expect(cmds(CMD.MOVE).length).toBe(0);
    gm.dispose();
  });

  it('kiting: atirador colado num alvo mais lento (cerco) recua; depois reengaja', () => {
    const { gm, d, spawn, cmds, refresh } = arena('hard');
    const arch = spawn('archer', 0, 0, 0);
    arch.state = 'attacking';
    spawn('catapult', 1, 1.5, 0);
    refresh();
    d.microManager.update();
    const mv = cmds(CMD.MOVE);
    expect(mv.length).toBe(1);
    expect(mv[0].unitIds).toEqual([arch.id]);
    expect(mv[0].x).toBeLessThan(0); // foge para longe do inimigo (que está em +x)
    d.simTime += 1;
    arch.state = 'idle';
    place(gm, arch, mv[0].x, mv[0].z);
    refresh();
    d.microManager.update();
    expect(cmds(CMD.ATTACK).length).toBe(1);
    gm.dispose();
  });

  it('protege o cerco: escolta ociosa ataca a ameaça que chegou perto da balista', () => {
    const { gm, d, spawn, cmds, refresh } = arena('hard');
    const siege = spawn('ballista', 0, 0, 0);
    siege.state = 'attacking';
    const guard = spawn('knight', 0, 8, 0);
    guard.state = 'idle';
    const threat = spawn('grunt', 1, 5, 0);
    refresh();
    d.microManager.update();
    const atk = cmds(CMD.ATTACK).filter(c => c.targetId === threat.id);
    expect(atk.length).toBe(1);
    expect(atk[0].unitIds).toContain(guard.id);
    gm.dispose();
  });

  it('assédio: com 3 montarias ociosas e inimigo conhecido, 2 viram esquadrão reservado e miram trabalhadores', () => {
    const { gm, d, spawn, cmds, refresh } = arena('hard');
    const hq1 = gm.buildings.find(b => b.ownerId === 1 && b.role === 'hq');
    const cav = [spawn('cavalier', 0, 0, 0), spawn('cavalier', 0, 1, 0), spawn('cavalier', 0, 2, 0)];
    const worker = spawn('peon', 1, 12, 0);
    place(gm, gm.getUnitsOf(0).find(u => u.type === d.meleeType), hq1.mesh.position.x + 6, hq1.mesh.position.z + 6);
    refresh();
    expect(d.perception.hasIntel()).toBe(true);
    d.simTime = 300;
    d.microManager.update();
    expect(d.microManager.harass.size).toBe(2);
    cav.slice(0, 2).forEach(u => expect(d.isReserved(u.id)).toBe(true));
    expect(d.isReserved(cav[2].id)).toBe(false);
    expect(cmds(CMD.ATTACK).some(c => c.targetId === worker.id)).toBe(true);
    gm.dispose();
  });

  it('flanco (Brutal): montarias vão a um waypoint lateral; o resto ataca direto', () => {
    const { gm, d, spawn, cmds } = arena('brutal');
    const units = [spawn('knight', 0, 0, 0), spawn('knight', 0, 1, 0), spawn('archer', 0, 2, 0), spawn('cavalier', 0, 3, 0), spawn('cavalier', 0, 4, 0)];
    const target = { id: 999, x: 40, z: 0, ownerId: 1 };
    const main = d.microManager.planWave(units, target);
    expect(main.map(u => u.type)).not.toContain('cavalier');
    expect(main.length).toBe(3);
    const mv = cmds(CMD.MOVE);
    expect(mv.length).toBe(1);
    const b = d.baseCenter;
    const dx = target.x - b.x; const dz = target.z - b.y;
    const off = Math.abs(dx * (mv[0].z - b.y) - dz * (mv[0].x - b.x)) / Math.hypot(dx, dz);
    expect(off).toBeGreaterThan(15); // lateral à linha base→alvo
    // Difícil não flanqueia
    const h = gm.aiDirectors[0];
    h.profile = DIFFICULTY_PROFILES.hard;
    h.microManager.flank = null;
    expect(h.microManager.planWave(units, target).length).toBe(5);
    gm.dispose();
  });

  it('magias: Mago lança Bola de Fogo no aglomerado quando a pesquisa existe', () => {
    const { gm, d, spawn, cmds, refresh } = arena('hard');
    const mage = spawn('mage', 0, 0, 0);
    mage.mana = mage.maxMana;
    d.player.setResearchLevel('spell_fireball', 1);
    spawn('grunt', 1, 6, 0); spawn('grunt', 1, 7, 1); spawn('grunt', 1, 6, 2);
    refresh();
    d.microManager.update();
    const cast = cmds(CMD.CAST);
    expect(cast.length).toBe(1);
    expect(cast[0].abilityId).toBe('fireball');
    expect(cast[0].unitIds).toEqual([mage.id]);
    gm.dispose();
  });
});
