import { describe, it, expect, vi } from 'vitest';
import { Projectile, HOMING_SPEED } from '../../src/sim/projectiles.js';
import { effectsForEvent } from '../../src/render/vfx/vfxMapping.js';
import { playFx } from '../../src/render/vfx/vfxEmitters.js';
import { ParticleRing } from '../../src/render/vfx/ParticleRing.js';
import { createRenderRng } from '../../src/render/vfx/vfxConfig.js';
import { EVT } from '../../src/sim/events.js';
import { GameManager } from '../../src/core/GameManager.js';
import { Terrain } from '../../src/world/Terrain.js';
import { createMatchConfig } from '../../src/sim/MatchConfig.js';
import { CMD } from '../../src/sim/commands.js';
import { SIM_DT } from '../../src/sim/constants.js';
import { UNITS, getUnitDef } from '../../src/data/index.js';

/**
 * vfxAir.test.js — VFX-AIR: projéteis de fogo (Serpe de Guerra) e raio (Cavaleiro Grifo) — dados, impacto, efeitos de
 * partícula e um disparo real na simulação (alcance 8, dano em área no impacto).
 */
const target = (x, y, z) => ({ hp: 10, mesh: { position: { x, y, z } } });

describe('VFX-AIR: projéteis fire/lightning (sim)', () => {
  it('são homing com velocidade própria; o raio é bem mais rápido que a bola de fogo', () => {
    expect(HOMING_SPEED.lightning).toBeGreaterThan(HOMING_SPEED.fire);
    const t = target(8, 0, 0);
    const bolt = new Projectile({ kind: 'lightning', from: { x: 0, y: 2, z: 0 }, target: t, damage: {}, onHit: () => {} });
    const ball = new Projectile({ kind: 'fire', from: { x: 0, y: 2, z: 0 }, target: t, damage: {}, onHit: () => {} });
    expect(bolt.homing).toBe(true);
    expect(ball.homing).toBe(true);
    expect(bolt.duration).toBeLessThanOrEqual(ball.duration);
    expect(ball.duration).toBeCloseTo(Math.max(0.3, Math.hypot(8, 2) / HOMING_SPEED.fire), 6);
  });

  it('acerta o alvo que anda e entrega (alvo, dano, posição) ao onHit uma vez', () => {
    const t = target(8, 0, 0);
    const onHit = vi.fn();
    const p = new Projectile({ kind: 'fire', from: { x: 0, y: 2, z: 0 }, target: t, damage: { piercing: 38 }, onHit });
    let steps = 0;
    while (!p.isDead && steps++ < 400) {
      if (steps === 4) t.mesh.position.x = 9; // o alvo se afasta: a bola rastreia
      p.simStep(SIM_DT);
    }
    expect(onHit).toHaveBeenCalledTimes(1);
    const [tg, dmg] = onHit.mock.calls[0];
    expect(tg).toBe(t);
    expect(dmg).toEqual({ piercing: 38 });
    expect(p.pos.x).toBeGreaterThan(7);
  });
});

describe('VFX-AIR: mapeamento de impacto', () => {
  const at = { x: 3, y: 0, z: -2 };
  it('impacto da bola de fogo vira explosão de fogo com o raio do golpe', () => {
    const fx = effectsForEvent(EVT.PROJECTILE_HIT, { kind: 'fire', pos: at, splashRadius: 1.2 });
    expect(fx).toEqual([{ fx: 'fire_impact', pos: { x: 3, y: 0, z: -2 }, radius: 1.2 }]);
  });
  it('impacto do raio vira flash + faíscas; flechas e cerco não geram efeito de elemento', () => {
    expect(effectsForEvent(EVT.PROJECTILE_HIT, { kind: 'lightning', pos: at })).toEqual([{ fx: 'lightning_impact', pos: { x: 3, y: 0, z: -2 } }]);
    expect(effectsForEvent(EVT.PROJECTILE_HIT, { kind: 'arrow', pos: at })).toEqual([]);
    expect(effectsForEvent(EVT.PROJECTILE_HIT, { kind: 'bolt', pos: at, splashRadius: 2 })).toEqual([]);
  });
});

describe('VFX-AIR: receitas de partícula (pool glow)', () => {
  const makeLayers = () => {
    const mk = (kind, cap) => ({ kind, ring: new ParticleRing(cap) });
    return { density: 1, time: 0, caps: { constructionMarks: true }, solid: mk('solid', 64), smoke: mk('smoke', 64), glow: mk('glow', 512) };
  };
  it('cada efeito de fogo/raio escreve partículas no pool glow', () => {
    const fxs = [
      { fx: 'fire_muzzle', pos: { x: 0, y: 2, z: 0 } },
      { fx: 'fire_trail', pos: { x: 1, y: 2, z: 0 } },
      { fx: 'fire_impact', pos: { x: 2, y: 0, z: 0 }, radius: 1.2 },
      { fx: 'lightning_muzzle', pos: { x: 0, y: 2, z: 0 } },
      { fx: 'lightning_impact', pos: { x: 2, y: 0, z: 0 } },
      { fx: 'lightning_arc', from: { x: 0, y: 2, z: 0 }, to: { x: 8, y: 2, z: 0 } }
    ];
    for (const d of fxs) {
      const L = makeLayers();
      playFx(L, createRenderRng(7), d);
      expect(L.glow.ring.totalSpawned, d.fx).toBeGreaterThan(0);
    }
  });
  it('o arco do raio tem vários pontos entre origem e alvo (zigue-zague), não um ponto só', () => {
    const L = makeLayers();
    playFx(L, createRenderRng(3), { fx: 'lightning_arc', from: { x: 0, y: 2, z: 0 }, to: { x: 8, y: 2, z: 0 } });
    expect(L.glow.ring.totalSpawned).toBeGreaterThanOrEqual(4);
    // pontos interiores: x entre as pontas e (com jitter) longe da linha reta em pelo menos um ponto
    let off = 0;
    for (let i = 0; i < L.glow.ring.totalSpawned; i++) {
      const x = L.glow.ring.start[i * 3], z = L.glow.ring.start[i * 3 + 2];
      expect(x).toBeGreaterThan(-1);
      expect(x).toBeLessThan(9);
      off = Math.max(off, Math.abs(z));
    }
    expect(off).toBeGreaterThan(0);
  });
  it('arco degenerado (origem = alvo) não escreve nada', () => {
    const L = makeLayers();
    playFx(L, createRenderRng(1), { fx: 'lightning_arc', from: { x: 1, y: 1, z: 1 }, to: { x: 1, y: 1, z: 1 } });
    expect(L.glow.ring.totalSpawned).toBe(0);
  });
});

describe('VFX-AIR: dados e disparo real na simulação', () => {
  function makeGm(seed = 5) {
    const terrain = new Terrain();
    const cfg = createMatchConfig({ seed, headless: true });
    const gm = new GameManager(terrain, null, null, cfg);
    gm.aiDirectors.forEach(d => d.dispose?.());
    gm.aiDirectors = [];
    gm.aiDirector = null;
    return gm;
  }
  const isHq = b => b.type === 'castle' || b.type === 'great_hall';
  const arena = gm => { const hq = gm.buildings.find(b => b.ownerId === 0 && isHq(b)); return { x: hq.mesh.position.x - 6, z: hq.mesh.position.z - 26 }; };

  it('Grifo e Serpe são atiradores aéreos com projétil próprio e alcance 8', () => {
    expect(getUnitDef('gryphon_rider')).toMatchObject({ isRanged: true, projectile: 'lightning', attackRange: 8 });
    expect(getUnitDef('war_serpent')).toMatchObject({ isRanged: true, projectile: 'fire', attackRange: 8 });
    expect(UNITS.gryphon_rider.damage.piercing).toBe(38); // dano por tiro mantido: o DPS não muda, só a distância
  });

  for (const [type, kind] of [['gryphon_rider', 'lightning'], ['war_serpent', 'fire']]) {
    it(`${type} dispara um projétil "${kind}" do alcance e o alvo perde vida`, () => {
      const gm = makeGm();
      const { x, z } = arena(gm);
      const atk = gm.spawnUnit(type, x, z, 0);
      const foe = gm.spawnUnit('grunt', x + 6, z, 1);
      foe.hp = foe.maxHp = 100000;
      foe.speed = 0;
      gm.issue({ type: CMD.ATTACK, playerId: 0, unitIds: [atk.id], targetId: foe.id });
      const kinds = new Set();
      const hp0 = foe.hp;
      const n = Math.round(4 / SIM_DT);
      for (let i = 0; i < n; i++) {
        gm.simStep(SIM_DT);
        for (const a of gm.arrows) kinds.add(a.kind);
      }
      expect(kinds.has(kind)).toBe(true);
      expect(foe.hp).toBeLessThan(hp0);
      expect(atk.state).not.toBe('idle');
    });
  }
});
