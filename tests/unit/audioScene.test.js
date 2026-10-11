import { describe, it, expect } from 'vitest';
import { inView, isAudible, zoomVolume, listenerRanges, positionalMix, mulMat4, LISTENER_TUNING } from '../../src/audio/attenuation.js';
import { AUDIO_SCENE } from '../../src/audio/audioConfig.js';
import { createAudioEvents } from '../../src/audio/AudioEvents.js';
import { EventBus } from '../../src/sim/EventBus.js';
import { EVT } from '../../src/sim/events.js';

// Culling por cena visível e por zoom (feedback do dono, 2026-10-11): só soa o que a câmera vê; longe = mais baixo e curto.

/** Câmera ortográfica de teste: vê x em [-halfW,halfW] e z em [-halfH,halfH] (chão), olhando de cima. Colunas-maiores como o three. */
function orthoViewProj(halfW = 10, halfH = 6) {
  // clip.x = x / halfW; clip.y = z / halfH; w = 1
  return new Float64Array([1 / halfW, 0, 0, 0, 0, 0, 0, 0, 0, 1 / halfH, 0, 0, 0, 0, 0, 1]);
}
const L = (extra = {}) => ({ x: 0, z: 0, zoom: 1, rightX: 1, rightZ: 0, viewProj: orthoViewProj(), ...extra });

describe('isAudible: cena visível (frustum) + margem', () => {
  it('ponto dentro do frustum soa; fora não', () => {
    expect(isAudible({ x: 0, z: 0 }, L())).toBe(true);
    expect(isAudible({ x: 9, z: 5 }, L())).toBe(true);
    expect(isAudible({ x: 12, z: 0 }, L())).toBe(false);
    expect(isAudible({ x: 0, z: -9 }, L())).toBe(false);
  });

  it('a margem de 8 % da tela aceita um pouco além da borda e nada além disso', () => {
    // largura da tela = 20 (NDC 2 = 20 unidades) -> 8 % = 1,6 unidade além de cada borda
    expect(AUDIO_SCENE.margin).toBeCloseTo(0.08, 6);
    expect(inView({ x: 11.5, z: 0 }, L())).toBe(true);
    expect(inView({ x: 11.7, z: 0 }, L())).toBe(false);
    expect(inView({ x: 11.7, z: 0 }, L(), 0.2)).toBe(true); // margem maior (explosão/cerco)
    expect(inView({ x: 10.5, z: 0 }, L(), 0)).toBe(false);
  });

  it('atrás da câmera (w <= 0) nunca soa; sem câmera nem limites não há recorte', () => {
    const behind = new Float64Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1]);
    expect(inView({ x: 0, z: 0 }, L({ viewProj: behind }))).toBe(false);
    expect(inView({ x: 5000, z: 0 }, { x: 0, z: 0, zoom: 1 })).toBe(true);
  });

  it('limites retangulares no chão (alternativa ao frustum) também aceitam margem', () => {
    const b = { x: 0, z: 0, zoom: 1, bounds: { minX: -10, maxX: 10, minZ: -6, maxZ: 6 } };
    expect(inView({ x: 0, z: 0 }, b)).toBe(true);
    expect(inView({ x: 11.5, z: 0 }, b)).toBe(true);
    expect(inView({ x: 12, z: 0 }, b)).toBe(false);
    expect(inView({ x: 0, z: 6.9 }, b)).toBe(true); // 12 * 0,08 = 0,96 -> até 6,96
    expect(inView({ x: 0, z: 7.2 }, b)).toBe(false);
  });

  it('sem posição (interface/alerta global) sempre soa, mesmo com a câmera longe de tudo', () => {
    expect(isAudible(null, L({ x: 999 }))).toBe(true);
    expect(isAudible(undefined, L())).toBe(true);
    expect(positionalMix(L(), null)).toEqual({ gain: 1, pan: 0, distance: 0, audible: true });
  });

  it('dentro do frustum mas além do raio de audição também some', () => {
    const wide = L({ viewProj: orthoViewProj(500, 500), zoom: 1.8 });
    expect(isAudible({ x: 20, z: 0 }, wide)).toBe(true);
    expect(isAudible({ x: 300, z: 0 }, wide)).toBe(false);
  });
});

describe('zoom: longe = mais baixo e alcance menor', () => {
  it('volume cai até -6 dB no zoom 1,8 e sobe perto', () => {
    expect(20 * Math.log10(zoomVolume(1.8))).toBeCloseTo(AUDIO_SCENE.farDb, 6);
    expect(20 * Math.log10(zoomVolume(1.8))).toBeCloseTo(-6, 6);
    expect(20 * Math.log10(zoomVolume(0.5))).toBeCloseTo(AUDIO_SCENE.nearDb, 6);
    let prev = Infinity;
    for (let z = 0.5; z <= 1.8001; z += 0.1) {
      const v = zoomVolume(z);
      expect(v).toBeLessThanOrEqual(prev + 1e-12);
      prev = v;
    }
    expect(zoomVolume(5)).toBe(zoomVolume(LISTENER_TUNING.maxZoom)); // satura
    expect(Number.isFinite(zoomVolume(NaN))).toBe(true);
  });

  it('a mesma fonte, na mesma distância, soa mais baixa com o zoom afastado', () => {
    const wide = (zoom) => L({ zoom, viewProj: orthoViewProj(500, 500) });
    const p = { x: 14, z: 0 };
    const near = positionalMix(wide(0.5), p).gain;
    const mid = positionalMix(wide(1.0), p).gain;
    const far = positionalMix(wide(1.8), p).gain;
    expect(near).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(far);
    expect(far).toBeLessThan(1); // abaixo do ganho cheio: -6 dB e já fora do raio de referência
  });

  it('o raio útil diminui com o zoom afastado', () => {
    expect(listenerRanges(1.8).max).toBeLessThan(listenerRanges(0.5).max);
    const wide = (zoom) => L({ zoom, viewProj: orthoViewProj(500, 500) });
    expect(isAudible({ x: 100, z: 0 }, wide(0.5))).toBe(true);
    expect(isAudible({ x: 100, z: 0 }, wide(1.8))).toBe(false);
  });
});

describe('mulMat4', () => {
  it('multiplica na ordem do three.js (identidade e translação)', () => {
    const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const T = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 5, 6, 7, 1];
    expect(Array.from(mulMat4(new Float64Array(16), I, T))).toEqual(T);
    expect(Array.from(mulMat4(new Float64Array(16), T, I))).toEqual(T);
    const S = [2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 1];
    const out = mulMat4(new Float64Array(16), S, T); // S × T: escala depois de transladar
    expect([out[12], out[13], out[14]]).toEqual([10, 12, 14]);
  });
});

describe('AudioEvents: descarta o que está fora da cena; globais seguem', () => {
  function setup() {
    const events = new EventBus();
    const calls = [];
    const proj = orthoViewProj(10, 6);
    const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const gm = {
      events, localPlayerId: 0, localPlayer: { factionId: 'human' }, entitiesById: new Map(), selectedUnits: [],
      getPlayer: () => ({ factionId: 'human' }), fogOfWar: { isVisible: () => true }, soundManager: null,
      sceneManager: {
        cameraTarget: { x: 0, z: 0 }, zoomLevel: 1,
        camera: { matrixWorld: { elements: identity }, projectionMatrix: { elements: proj }, matrixWorldInverse: { elements: identity } }
      }
    };
    const sound = {
      setListener: () => {}, playSfx: (n, o) => { calls.push([n, o]); return true; }, playSelect() {}, playOrder() {},
      canSpeak: () => false, now: () => 0, speak: () => 0, noteCombat() {}, beginMatch() {}, endMatch() {}, setSceneProbe() {}
    };
    createAudioEvents(gm, sound, {});
    return { calls, emit: (t, p) => { events.emit(t, p); events.flush(); } };
  }

  it('combate, coleta, construção e morte fora da tela não soam; dentro soam', () => {
    const t = setup();
    const out = { x: 40, y: 0, z: 0 };
    const inside = { x: 2, y: 0, z: 1 };
    for (const [type, p] of [
      [EVT.MELEE_HIT, { ownerId: 0 }], [EVT.WORKER_CHOP, { ownerId: 0 }], [EVT.WORKER_MINE, { ownerId: 0, resource: 'gold' }],
      [EVT.WORKER_HAMMER, { ownerId: 0 }], [EVT.UNIT_DIED, { ownerId: 0, unitType: 'knight' }],
      [EVT.BUILDING_DESTROYED, { ownerId: 0, buildingType: 'barracks' }], [EVT.EXPLOSION, { ownerId: 0, radius: 3 }]
    ]) {
      t.emit(type, { ...p, pos: out });
      expect(t.calls.length, `${type} fora da tela`).toBe(0);
      t.emit(type, { ...p, pos: inside });
      expect(t.calls.length, `${type} na tela`).toBeGreaterThan(0);
      t.calls.length = 0;
    }
    t.emit(EVT.PROJECTILE_FIRED, { kind: 'arrow', from: out, ownerId: 0 });
    t.emit(EVT.PROJECTILE_HIT, { kind: 'arrow', pos: out, ownerId: 0 });
    expect(t.calls.length).toBe(0);
  });

  it('alerta "sob ataque" fora da tela e fim de partida seguem tocando como interface (sem posição)', () => {
    const t = setup();
    t.emit(EVT.UNDER_ATTACK, { ownerId: 0, pos: { x: 500, y: 0, z: 500 } });
    t.emit(EVT.MATCH_WON, { ownerId: 0 });
    expect(t.calls.map(c => c[0])).toEqual(['alarm', 'victory']);
    expect(t.calls.every(c => c[1].pos === null)).toBe(true);
  });
});
