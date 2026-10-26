import { describe, it, expect } from 'vitest';
import { SFX, SFX_LIMITS } from '../../src/audio/sfxRecipes.js';
import { LIBRARY, METAL_KINDS } from '../../src/audio/sfxLibrary.js';
import { soundsForEvent, SFX_EVENTS, COMBAT_EVENTS, SILENT_EVENTS } from '../../src/audio/audioMapping.js';
import { EVT } from '../../src/sim/events.js';
import { UNITS } from '../../src/data/units.js';
import { renderRecipe, measure } from './helpers/offlineSynth.js';

// Biblioteca de efeitos (commit 2): cada receita renderizada OFFLINE (Node puro) gera áudio finito, audível, sem passar
// do teto e dentro da duração declarada; o mapeamento evento -> receita cobre todo o catálogo de eventos.

const hash = (data) => {
  let h = 2166136261;
  for (let i = 0; i < data.length; i += 7) h = Math.imul(h ^ Math.round(data[i] * 20000), 16777619);
  return h >>> 0;
};

describe('receitas: buffer não vazio, finito, sem clipping, duração dentro dos limites', () => {
  for (const [name, recipe] of Object.entries(SFX)) {
    it(name, () => {
      const variants = name in LIBRARY ? [0, 1, 2, 3] : [0];
      for (const v of variants) {
        const { data, sr } = renderRecipe(recipe, { v, variant: name === 'cast' ? 'ring' : undefined }, { seed: 11 + v });
        const m = measure(data, sr);
        expect(data.length, `${name} v${v}`).toBeGreaterThan(0);
        expect(m.bad, `${name} v${v} não finitos`).toBe(0);
        expect(m.rms, `${name} v${v} silêncio`).toBeGreaterThan(0.004);
        expect(m.peak, `${name} v${v} clipping`).toBeLessThanOrEqual(1);
        expect(m.peak, `${name} v${v} fraco demais`).toBeGreaterThan(0.08);
        expect(m.end, `${name} v${v} passou da duração declarada`).toBeLessThanOrEqual(recipe.dur + 0.05);
        expect(m.end, `${name} v${v} curto demais`).toBeGreaterThan(0.05);
      }
      expect(recipe.dur).toBeGreaterThanOrEqual(0.1);
      expect(recipe.dur).toBeLessThanOrEqual(4);
    });
  }

  it('limites por som só citam receitas que existem', () => {
    for (const k of Object.keys({ ...SFX_LIMITS.perKey, ...SFX_LIMITS.minGap })) expect(SFX[k], k).toBeTruthy();
  });
});

describe('variantes: 3–4 por golpe, sorteadas pelo RNG de áudio (nunca Math.random)', () => {
  it('as 4 variantes de cada receita da biblioteca soam diferentes', () => {
    for (const name of ['metalHit', 'stoneHit', 'chop', 'mineStone', 'mineGold', 'collapse', 'shipSink']) {
      const hs = new Set([0, 1, 2, 3].map((v) => hash(renderRecipe(LIBRARY[name], { v, kind: 'blade' }, { seed: 5 }).data)));
      expect(hs.size, name).toBe(4);
    }
    for (const name of ['bow', 'axeThrow', 'treeFall', 'hammer', 'axeHit']) {
      const hs = new Set([0, 1, 2].map((v) => hash(renderRecipe(LIBRARY[name], { v }, { seed: 5 }).data)));
      expect(hs.size, name).toBe(3);
    }
  });

  it('metal: lâmina, escudo e armadura diferem; aço (Liga de Aurelan) difere de ferro (Clãs do Cinzal)', () => {
    const r = (opts) => hash(renderRecipe(LIBRARY.metalHit, { v: 1, ...opts }, { seed: 3 }).data);
    expect(new Set(METAL_KINDS.map((kind) => r({ kind }))).size).toBe(3);
    expect(r({ kind: 'blade', variant: 'steel' })).not.toBe(r({ kind: 'blade', variant: 'iron' }));
  });

  it('sem variante forçada, golpes seguidos variam com o RNG de áudio e a mesma semente repete', () => {
    const seeds = [1, 2, 3, 4, 5, 6, 7, 8];
    const hs = seeds.map((seed) => hash(renderRecipe(LIBRARY.metalHit, {}, { seed }).data));
    expect(new Set(hs).size).toBeGreaterThanOrEqual(5);
    expect(hash(renderRecipe(LIBRARY.metalHit, {}, { seed: 4 }).data)).toBe(hs[3]);
  });

  it('nenhuma receita usa Math.random', () => {
    const real = Math.random;
    Math.random = () => { throw new Error('Math.random proibido no áudio'); };
    try {
      for (const recipe of Object.values(SFX)) expect(() => renderRecipe(recipe, {}, { seed: 2 })).not.toThrow();
    } finally {
      Math.random = real;
    }
  });
});

describe('mapeamento evento -> receita', () => {
  const pos = { x: 3, y: 0, z: 4 };
  const ctx = { own: true, visible: true };
  const navalId = Object.keys(UNITS).find((k) => UNITS[k].layer === 'naval');
  const landId = Object.keys(UNITS).find((k) => UNITS[k].layer !== 'naval');

  it('todo evento do catálogo tem destino: efeito, música adaptativa ou "mudo" justificado', () => {
    const covered = new Set([...SFX_EVENTS, ...COMBAT_EVENTS, ...Object.keys(SILENT_EVENTS)]);
    for (const type of Object.values(EVT)) expect(covered.has(type), `evento sem som listado: ${type}`).toBe(true);
    for (const type of Object.keys(SILENT_EVENTS)) {
      expect(SFX_EVENTS.includes(type), `${type} é mudo mas está em SFX_EVENTS`).toBe(false);
      expect(String(SILENT_EVENTS[type]).length, type).toBeGreaterThan(3);
    }
  });

  it('todo evento de SFX_EVENTS gera ao menos um som cuja receita existe', () => {
    for (const type of SFX_EVENTS) {
      const out = soundsForEvent(type, { pos, from: pos, kind: type === EVT.BUILDING_VFX ? 'anvil_spark' : 'arrow', resource: 'gold', unitType: landId }, ctx);
      expect(out.length, type).toBeGreaterThan(0);
      for (const d of out) expect(SFX[d.sfx], `${type} -> ${d.sfx}`).toBeTruthy();
    }
  });

  it('trabalho: machado do lenhador, queda da árvore (dono neutro), picareta e martelo', () => {
    expect(soundsForEvent(EVT.WORKER_CHOP, { pos, ownerId: 0 }, ctx)[0].sfx).toBe('chop');
    expect(soundsForEvent(EVT.WORKER_CHOP, { pos, ownerId: -1 }, { own: false, visible: true })[0].sfx).toBe('treeFall');
    expect(soundsForEvent(EVT.WORKER_CHOP, { pos, ownerId: -1 }, { own: false, visible: false })).toEqual([]);
    expect(soundsForEvent(EVT.WORKER_MINE, { pos, resource: 'stone' }, ctx)[0].sfx).toBe('mineStone');
    expect(soundsForEvent(EVT.WORKER_MINE, { pos, resource: 'gold' }, ctx)[0].sfx).toBe('mineGold');
    expect(soundsForEvent(EVT.WORKER_HAMMER, { pos }, ctx)[0].sfx).toBe('hammer');
  });

  it('forja: só as faíscas da bigorna tilintam; fumaça e serragem são mudas', () => {
    expect(soundsForEvent(EVT.BUILDING_VFX, { pos, kind: 'anvil_spark' }, ctx)[0].sfx).toBe('anvil');
    expect(soundsForEvent(EVT.BUILDING_VFX, { pos, kind: 'chimney_smoke' }, ctx)).toEqual([]);
    expect(soundsForEvent(EVT.BUILDING_VFX, { pos, kind: 'sawdust' }, ctx)).toEqual([]);
    expect(soundsForEvent(EVT.BUILDING_VFX, { pos, kind: 'anvil_spark' }, { own: false, visible: false })).toEqual([]);
  });

  it('combate: metal por facção, flecha, machado arremessado e impacto de pedra', () => {
    expect(soundsForEvent(EVT.MELEE_HIT, { pos, ownerId: 0 }, { ...ctx, faction: 'human' })[0]).toMatchObject({ sfx: 'metalHit', variant: 'steel' });
    expect(soundsForEvent(EVT.MELEE_HIT, { pos, ownerId: 1 }, { ...ctx, faction: 'orc' })[0]).toMatchObject({ sfx: 'metalHit', variant: 'iron' });
    expect(soundsForEvent(EVT.PROJECTILE_FIRED, { kind: 'arrow', from: pos }, ctx)[0].sfx).toBe('bow');
    expect(soundsForEvent(EVT.PROJECTILE_HIT, { kind: 'arrow', pos }, ctx)[0].sfx).toBe('arrowHit');
    expect(soundsForEvent(EVT.PROJECTILE_FIRED, { kind: 'axe', from: pos }, ctx)[0].sfx).toBe('axeThrow');
    expect(soundsForEvent(EVT.PROJECTILE_HIT, { kind: 'axe', pos }, ctx)[0].sfx).toBe('axeHit');
    expect(soundsForEvent(EVT.PROJECTILE_HIT, { kind: 'boulder', pos }, ctx)[0].sfx).toBe('stoneHit');
    expect(soundsForEvent(EVT.PROJECTILE_HIT, { kind: 'bolt', pos }, ctx)[0].sfx).toBe('stoneHit');
  });

  it('explosão cresce com o raio; desabamento e afundamento têm margem de tela maior', () => {
    const small = soundsForEvent(EVT.EXPLOSION, { pos, radius: 2 }, ctx)[0];
    const big = soundsForEvent(EVT.EXPLOSION, { pos, radius: 8 }, ctx)[0];
    expect(small.sfx).toBe('explosion');
    expect(big.size).toBeGreaterThan(small.size);
    expect(soundsForEvent(EVT.EXPLOSION, { pos }, ctx)[0].size).toBeGreaterThan(0);
    expect(small.margin).toBeGreaterThan(0.08);
    const col = soundsForEvent(EVT.BUILDING_DESTROYED, { pos, buildingType: 'barracks' }, ctx)[0];
    expect(col.sfx).toBe('collapse');
    expect(col.margin).toBeGreaterThan(0.08);
  });

  it('navio que morre afunda; unidade de terra morre normalmente', () => {
    expect(navalId, 'há unidade naval nos dados').toBeTruthy();
    expect(soundsForEvent(EVT.UNIT_DIED, { pos, unitType: navalId, ownerId: 0 }, ctx)[0].sfx).toBe('shipSink');
    expect(soundsForEvent(EVT.UNIT_DIED, { pos, unitType: landId, ownerId: 0 }, ctx)[0].sfx).toBe('death');
    expect(soundsForEvent(EVT.UNIT_DIED, { pos, ownerId: 0 }, ctx)[0].sfx).toBe('death');
    expect(soundsForEvent(EVT.UNIT_DIED, { pos, unitType: navalId, expired: true }, ctx)).toEqual([]);
  });

  it('a biblioteca inteira está ligada a algum evento (nenhuma receita nova órfã)', () => {
    const used = new Set();
    const payloads = [
      [EVT.WORKER_CHOP, { ownerId: 0 }], [EVT.WORKER_CHOP, { ownerId: -1 }], [EVT.WORKER_MINE, { resource: 'gold' }], [EVT.WORKER_MINE, { resource: 'stone' }],
      [EVT.WORKER_HAMMER, {}], [EVT.BUILDING_VFX, { kind: 'anvil_spark' }], [EVT.MELEE_HIT, {}], [EVT.EXPLOSION, { radius: 3 }],
      [EVT.UNIT_DIED, { unitType: navalId }], [EVT.BUILDING_DESTROYED, {}],
      ...['arrow', 'axe', 'bolt', 'boulder', 'cannonball'].flatMap((kind) => [[EVT.PROJECTILE_FIRED, { kind, from: pos }], [EVT.PROJECTILE_HIT, { kind }]])
    ];
    for (const [type, p] of payloads) for (const d of soundsForEvent(type, { pos, ...p }, ctx)) used.add(d.sfx);
    for (const name of Object.keys(LIBRARY)) expect(used.has(name), `receita órfã: ${name}`).toBe(true);
  });
});
