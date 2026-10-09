import { describe, it, expect } from 'vitest';
import { ParticleRing } from '../../src/render/vfx/ParticleRing.js';
import {
  VFX_CAPS, parseVfxParam, selectVfxLevel, scaleCount, createRenderRng
} from '../../src/render/vfx/vfxConfig.js';
import {
  effectsForEvent, corpseDecay, constructionStage, CORPSE, CONSTRUCTION_STAGES
} from '../../src/render/vfx/vfxMapping.js';
import { EVT } from '../../src/sim/events.js';
import { QUALITY_PRESETS } from '../../src/core/QualitySettings.js';

const pos = { x: 1, y: 0.5, z: 2 };

describe('F7-05 pool de partículas (ParticleRing)', () => {
  it('reusa slots e respeita o teto', () => {
    const r = new ParticleRing(4);
    const idx = [];
    for (let i = 0; i < 10; i++) idx.push(r.spawn(0, 1, 1, 0, i, 0, 0, 0, 0, 0, 1, 1, 1, 0));
    expect(idx).toEqual([0, 1, 2, 3, 0, 1, 2, 3, 0, 1]);
    expect(r.used).toBe(4);
    expect(r.aliveCount(0.5)).toBe(4);
    expect(r.start[0]).toBe(8); // o slot 0 foi reciclado pela 9ª partícula
    expect(r.totalSpawned).toBe(10);
  });

  it('não realoca os buffers ao spawnar (sem alocação)', () => {
    const r = new ParticleRing(8);
    const before = [r.start, r.vel, r.par, r.cg];
    for (let i = 0; i < 100; i++) r.spawn(i, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0);
    expect([r.start, r.vel, r.par, r.cg]).toEqual(before);
    expect(r.start).toBe(before[0]);
    expect(r.par).toBe(before[2]);
    expect(r.start.length).toBe(24);
  });

  it('teto 0 desliga o pool', () => {
    const r = new ParticleRing(0);
    expect(r.spawn(0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0)).toBe(-1);
    expect(r.aliveCount(0)).toBe(0);
  });

  it('atraso (t0 futuro) conta como vivo e expira após t0+vida; rebase desloca', () => {
    const r = new ParticleRing(2);
    r.spawn(5, 2, 1, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0);
    expect(r.aliveCount(0)).toBe(1);
    expect(r.aliveCount(7.01)).toBe(0);
    r.rebase(5);
    expect(r.par[0]).toBe(0);
    r.clear();
    expect(r.used).toBe(0);
  });
});

describe('F7-05 configuração / presets', () => {
  it('parseVfxParam', () => {
    expect(parseVfxParam(null)).toBe(null);
    expect(parseVfxParam('0')).toBe('off');
    expect(parseVfxParam('off')).toBe('off');
    expect(parseVfxParam('1')).toBe('high');
    expect(parseVfxParam('med')).toBe('med');
    expect(parseVfxParam('xx')).toBe(null);
  });

  it('texq=low reduz; preset decide nos demais; ?vfx força', () => {
    expect(selectVfxLevel(QUALITY_PRESETS.high, 'low')).toBe('low');
    expect(selectVfxLevel(QUALITY_PRESETS.high, 'high')).toBe('high');
    expect(selectVfxLevel(QUALITY_PRESETS.med, 'med')).toBe('med');
    expect(selectVfxLevel(QUALITY_PRESETS.ultra, 'ultra')).toBe('high');
    expect(selectVfxLevel(QUALITY_PRESETS.high, 'low', 'high')).toBe('high');
    expect(selectVfxLevel(QUALITY_PRESETS.high, 'high', 'off')).toBe('off');
    expect(selectVfxLevel(null, 'med')).toBe('med');
  });

  it('tetos crescem com o nível e off zera tudo', () => {
    expect(VFX_CAPS.off.solid + VFX_CAPS.off.smoke + VFX_CAPS.off.glow).toBe(0);
    for (const k of ['solid', 'smoke', 'glow']) {
      expect(VFX_CAPS.low[k]).toBeLessThan(VFX_CAPS.med[k]);
      expect(VFX_CAPS.med[k]).toBeLessThan(VFX_CAPS.high[k]);
    }
    expect(scaleCount(10, 0)).toBe(0);
    expect(scaleCount(10, 0.4)).toBe(4);
    expect(scaleCount(1, 0.1)).toBe(1);
  });

  it('RNG de render é determinístico e independente de Math.random', () => {
    const a = createRenderRng(5), b = createRenderRng(5);
    const sa = Array.from({ length: 5 }, () => a());
    const sb = Array.from({ length: 5 }, () => b());
    expect(sa).toEqual(sb);
    expect(sa.every(v => v >= 0 && v < 1)).toBe(true);
  });
});

describe('F7-05 decaimento de corpo', () => {
  it('invisível antes do atraso, permanece, encolhe/afunda e termina', () => {
    expect(corpseDecay(0).visible).toBe(false);
    const stay = corpseDecay(CORPSE.delay + 1);
    expect(stay).toEqual({ visible: true, scale: 1, sink: 0, done: false });
    const mid = corpseDecay(CORPSE.delay + CORPSE.linger + CORPSE.decay / 2);
    expect(mid.visible).toBe(true);
    expect(mid.scale).toBeLessThan(1);
    expect(mid.sink).toBeGreaterThan(0);
    const end = corpseDecay(CORPSE.delay + CORPSE.linger + CORPSE.decay + 0.01);
    expect(end.done).toBe(true);
  });

  it('é monotônico durante o decaimento', () => {
    let prev = 1;
    for (let t = CORPSE.delay + CORPSE.linger; t < CORPSE.delay + CORPSE.linger + CORPSE.decay; t += 0.25) {
      const s = corpseDecay(t).scale;
      expect(s).toBeLessThanOrEqual(prev + 1e-9);
      prev = s;
    }
  });
});

describe('F7-05 mapeamento evento -> efeito', () => {
  it('dano em unidade: sangue; morto-vivo/cerco: faíscas', () => {
    expect(effectsForEvent(EVT.UNIT_DAMAGED, { pos, amount: 12 }, {})[0].fx).toBe('blood');
    expect(effectsForEvent(EVT.UNIT_DAMAGED, { pos, amount: 12 }, { unit: { undead: true } })[0]).toMatchObject({ fx: 'hit_spark', bone: true });
    expect(effectsForEvent(EVT.UNIT_DAMAGED, { pos, amount: 12 }, { unit: { siege: true } })[0].fx).toBe('hit_spark');
  });

  it('dano em construção: faíscas com lascas', () => {
    expect(effectsForEvent(EVT.BUILDING_DAMAGED, { pos, amount: 30 })[0]).toMatchObject({ fx: 'hit_spark', wood: true });
  });

  it('morte: gera cadáver só para unidades com corpo; expirada/sem corpo não', () => {
    const base = { pos, ownerId: 1, unitType: 'grunt' };
    const fx = effectsForEvent(EVT.UNIT_DIED, base, { unit: {}, teamColor: '#ff0000' }).map(d => d.fx);
    expect(fx).toEqual(['unit_death', 'corpse']);
    expect(effectsForEvent(EVT.UNIT_DIED, { ...base, expired: true }, { unit: {} }).map(d => d.fx)).toEqual(['unit_death']);
    expect(effectsForEvent(EVT.UNIT_DIED, base, { unit: { corpseless: true } }).map(d => d.fx)).toEqual(['unit_death']);
    expect(effectsForEvent(EVT.UNIT_DIED, base, { unit: { undead: true, corpseless: true } }).map(d => d.fx)).toEqual(['unit_death']);
  });

  it('construção destruída: desabamento com o raio da construção; obra: pegada por estágio', () => {
    const d = effectsForEvent(EVT.BUILDING_DESTROYED, { pos, buildingType: 'castle' }, { radius: 5.5 })[0];
    expect(d).toMatchObject({ fx: 'building_collapse', radius: 5.5 });
    expect(effectsForEvent(EVT.BUILDING_PLACED, { pos }, { radius: 3 })[0]).toMatchObject({ fx: 'construction', placed: true, stage: 0 });
    expect(effectsForEvent(EVT.BUILDING_COMPLETED, { pos }, { radius: 3 })[0]).toMatchObject({ fx: 'construction', done: true, stage: CONSTRUCTION_STAGES });
  });

  it('magia: usa o vfx da definição; sem vfx nada; explosão', () => {
    const m = effectsForEvent(EVT.ABILITY_EFFECT, { pos, radius: 3 }, { vfx: { kind: 'ring', color: '#38bdf8' } })[0];
    expect(m).toMatchObject({ fx: 'magic', kind: 'ring', color: '#38bdf8', radius: 3 });
    expect(effectsForEvent(EVT.ABILITY_EFFECT, { pos }, {})).toEqual([]);
    expect(effectsForEvent(EVT.EXPLOSION, { pos, radius: 2.5 })[0]).toMatchObject({ fx: 'explosion', radius: 2.5 });
  });

  it('fora da visão e eventos não mapeados não geram nada', () => {
    expect(effectsForEvent(EVT.UNIT_DIED, { pos }, { visible: false })).toEqual([]);
    expect(effectsForEvent(EVT.NOTIFY, { pos })).toEqual([]);
  });

  it('estágios de obra', () => {
    expect(constructionStage(0)).toBe(0);
    expect(constructionStage(24.9)).toBe(0);
    expect(constructionStage(25)).toBe(1);
    expect(constructionStage(99)).toBe(3);
    expect(constructionStage(100)).toBe(3);
    expect(constructionStage(50, true)).toBe(CONSTRUCTION_STAGES);
  });
});
