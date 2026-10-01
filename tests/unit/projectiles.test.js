import { describe, it, expect, vi } from 'vitest';
import { Projectile, ballisticFlightTime, ballisticPeak } from '../../src/sim/projectiles.js';

const target = (x, y, z) => ({ hp: 10, mesh: { position: { x, y, z } } });

describe('Projectile (F2-08): dados de simulação sem three.js', () => {
  it('homing: persegue o alvo e chama onHit(target, damage, posição do último passo) uma vez', () => {
    const t = target(10, 0, 0);
    const onHit = vi.fn();
    const p = new Projectile({ kind: 'arrow', from: { x: 0, y: 1, z: 0 }, target: t, damage: { basic: 5 }, onHit });
    expect(p.duration).toBeCloseTo(Math.max(0.3, Math.hypot(10, 1) / 18), 6);
    let steps = 0;
    while (!p.isDead && steps++ < 100) {
      if (steps === 3) t.mesh.position.x = 12; // alvo anda: a flecha rastreia
      p.simStep(0.05);
    }
    expect(p.isDead).toBe(true);
    expect(onHit).toHaveBeenCalledTimes(1);
    const [tg, dmg, hitPos] = onHit.mock.calls[0];
    expect(tg).toBe(t);
    expect(dmg).toEqual({ basic: 5 });
    expect(hitPos.x).toBeGreaterThan(5); // perto do alvo, no último passo
    p.simStep(0.05); // morto: nada acontece
    expect(onHit).toHaveBeenCalledTimes(1);
  });

  it('balístico: voa ao ponto FIXO (não persegue) e entrega o ponto de impacto', () => {
    const onHit = vi.fn();
    const p = new Projectile({ kind: 'boulder', from: { x: 0, y: 1.7, z: 0 }, impact: { x: 14, y: 0, z: 0 }, onHit });
    expect(p.duration).toBeCloseTo(ballisticFlightTime(Math.hypot(14, 1.7), 'boulder'), 6);
    let peak = 0;
    let steps = 0;
    while (!p.isDead && steps++ < 400) {
      p.simStep(0.05);
      peak = Math.max(peak, p.pos.y);
    }
    expect(onHit).toHaveBeenCalledTimes(1);
    expect(onHit.mock.calls[0][0]).toEqual({ x: 14, y: 0, z: 0 });
    expect(peak).toBeGreaterThan(1.7 + ballisticPeak(p.dist) * 0.8); // parábola
    expect(p.spin).toBeGreaterThan(0); // pedra gira em voo
  });

  it('prev guarda a posição do passo anterior (interpolação do render) e aim fica à frente na curva', () => {
    const p = new Projectile({ kind: 'bolt', from: { x: 0, y: 0, z: 0 }, impact: { x: 22, y: 0, z: 0 }, onHit: () => {} });
    p.simStep(0.05);
    const first = { ...p.pos };
    p.simStep(0.05);
    expect(p.prev).toEqual(first);
    expect(p.aim.x).toBeGreaterThan(p.pos.x);
  });

  it('funções de voo: tempo mínimo 0,3 s e pico limitado a 9', () => {
    expect(ballisticFlightTime(1, 'bolt')).toBe(0.3);
    expect(ballisticFlightTime(22, 'bolt')).toBeCloseTo(1);
    expect(ballisticPeak(1000)).toBe(9);
    expect(ballisticPeak(1)).toBe(2);
  });
});
