import { describe, it, expect } from 'vitest';
import { GameManager } from '../../src/core/GameManager.js';
import { Terrain } from '../../src/world/Terrain.js';
import { createMatchConfig } from '../../src/sim/MatchConfig.js';
import { CMD } from '../../src/sim/commands.js';
import { SIM_DT } from '../../src/sim/constants.js';
import { stateChecksum as checksum } from '../../src/sim/checksum.js';

/** M2-29 — revide inteligente: troca de alvo por proximidade (regra 2) e por bloqueio inimigo (regra 3). */

function makeGm(seed = 7) {
  const cfg = createMatchConfig({ seed, headless: true });
  const gm = new GameManager(new Terrain(), null, null, cfg);
  gm.aiDirectors.forEach(d => d.dispose?.());
  gm.aiDirectors = [];
  gm.aiDirector = null;
  return gm;
}

function arena(gm) {
  const p = gm.getPlayer(0).startPos;
  return { x: p.x - 6, z: p.z - 26 };
}

function step(gm, n) {
  for (let i = 0; i < n; i++) gm.simStep(SIM_DT);
}

/** Alvo longe fora do alcance; `victim` revida `first`. */
function setup() {
  const gm = makeGm();
  const a = arena(gm);
  const victim = gm.spawnUnit('knight', a.x, a.z, 0);
  const first = gm.spawnUnit('grunt', a.x + 18, a.z, 1);
  victim.orderAttack(first); // revide automático (flag não explícito)
  return { gm, a, victim, first };
}

describe('revide inteligente (M2-29)', () => {
  it('regra 2: atacante mais perto que o alvo atual troca o alvo', () => {
    const { gm, a, victim, first } = setup();
    const near = gm.spawnUnit('archer', a.x + 8, a.z + 2, 1);
    victim.takeDamage(1, near, gm.allUnits);
    expect(victim.attackTarget).toBe(near);
    expect(first.isDead).toBe(false);
  });

  it('regra 2: atacante mais longe que o alvo atual NÃO troca', () => {
    const { gm, a, victim, first } = setup();
    const far = gm.spawnUnit('archer', a.x + 28, a.z, 1);
    victim.takeDamage(1, far, gm.allUnits);
    expect(victim.attackTarget).toBe(first);
  });

  it('regra 2: usa a distância atual (não a de quando foi atingida)', () => {
    const { gm, a, victim, first } = setup();
    const other = gm.spawnUnit('archer', a.x - 12, a.z, 1); // 12 atrás; first está a 18
    first.mesh.position.x = a.x + 30; // first se afastou: agora other é o mais próximo
    victim.takeDamage(1, other, gm.allUnits);
    expect(victim.attackTarget).toBe(other);
  });

  it('ordem explícita de ataque do jogador nunca é substituída por revide', () => {
    const gm = makeGm();
    const a = arena(gm);
    const victim = gm.spawnUnit('knight', a.x, a.z, 0);
    const first = gm.spawnUnit('grunt', a.x + 18, a.z, 1);
    const near = gm.spawnUnit('archer', a.x + 5, a.z, 1);
    gm.issue({ type: CMD.ATTACK, playerId: 0, unitIds: [victim.id], targetId: first.id });
    step(gm, 8);
    expect(victim.attackTarget).toBe(first);
    victim.takeDamage(1, near, gm.allUnits);
    expect(victim.attackTarget).toBe(first);
    step(gm, 20);
    expect(victim.attackTarget).toBe(first);
  });

  it('regra 3: bloqueado por inimigo no caminho, passa a atacar o bloqueador', () => {
    const gm = makeGm();
    const a = arena(gm);
    const victim = gm.spawnUnit('knight', a.x, a.z, 0);
    const archer = gm.spawnUnit('archer', a.x + 20, a.z, 1);
    const blocker = gm.spawnUnit('grunt', a.x + 1.2, a.z, 1); // encostado na frente
    blocker.hold();
    victim.orderAttack(archer);
    // trava a unidade no lugar para simular o bloqueio sem depender de física
    let swapped = false;
    for (let i = 0; i < 60 && !swapped; i++) {
      victim.mesh.position.x = a.x;
      victim.mesh.position.z = a.z;
      step(gm, 1);
      swapped = victim.attackTarget === blocker;
    }
    expect(swapped).toBe(true);
  });

  it('regra 3: aliado bloqueando não troca o alvo', () => {
    const gm = makeGm();
    const a = arena(gm);
    const victim = gm.spawnUnit('knight', a.x, a.z, 0);
    const archer = gm.spawnUnit('archer', a.x + 20, a.z, 1);
    const ally = gm.spawnUnit('knight', a.x + 1.2, a.z, 0);
    ally.hold();
    victim.orderAttack(archer);
    for (let i = 0; i < 40; i++) {
      victim.mesh.position.x = a.x;
      victim.mesh.position.z = a.z;
      step(gm, 1);
    }
    expect(victim.attackTarget).toBe(archer);
  });

  it('regra 3: ordem explícita de ataque não troca para o bloqueador', () => {
    const gm = makeGm();
    const a = arena(gm);
    const victim = gm.spawnUnit('knight', a.x, a.z, 0);
    const archer = gm.spawnUnit('archer', a.x + 20, a.z, 1);
    const blocker = gm.spawnUnit('grunt', a.x + 1.2, a.z, 1);
    blocker.hold();
    gm.issue({ type: CMD.ATTACK, playerId: 0, unitIds: [victim.id], targetId: archer.id });
    for (let i = 0; i < 40; i++) {
      victim.mesh.position.x = a.x;
      victim.mesh.position.z = a.z;
      step(gm, 1);
    }
    expect(victim.attackTarget).toBe(archer);
  });

  it('determinismo: duas execuções dão o mesmo checksum', () => {
    const run = () => {
      const { gm, a, victim } = setup();
      const o = gm.spawnUnit('archer', a.x + 6, a.z + 3, 1);
      gm.spawnUnit('grunt', a.x + 1.4, a.z, 1);
      victim.takeDamage(1, o, gm.allUnits);
      step(gm, 200);
      return checksum(gm);
    };
    expect(run()).toBe(run());
  });
});
