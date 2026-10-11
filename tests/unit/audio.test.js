import { describe, it, expect, beforeEach } from 'vitest';
import {
  distanceGain, listenerRanges, panFor, positionalMix, LISTENER_TUNING, MIN_AUDIBLE, zoomVolume
} from '../../src/audio/attenuation.js';
import { VoicePool } from '../../src/audio/VoicePool.js';
import { MusicDirector, trackIdFor, DIRECTOR_DEFAULTS } from '../../src/audio/musicDirector.js';
import {
  AUDIO_LEVELS, AUDIO_CAPS, parseAudioParam, selectAudioLevel, isAutomation, clampVolume, createAudioRng
} from '../../src/audio/audioConfig.js';
import { detectAudioLevel } from '../../src/audio/audioEnv.js';
import { soundsForEvent, combatWeight, SFX_EVENTS, COMBAT_EVENTS } from '../../src/audio/audioMapping.js';
import { AMBIENCE_PROFILES, AMBIENCE_LAYERS, ambienceMix, nightFactor } from '../../src/audio/ambience.js';
import { TILESET_IDS } from '../../src/data/tilesets.js';
import { TRACKS, TRACK_IDS, eventsForStep, trackLength, stepSeconds } from '../../src/audio/music/musicScores.js';
import { fillWhite, fillPink } from '../../src/audio/noise.js';
import { SFX, SFX_LIMITS } from '../../src/audio/sfxRecipes.js';
import { AudioEngine } from '../../src/audio/AudioEngine.js';
import { SoundManager } from '../../src/core/SoundManager.js';
import { createAudioEvents } from '../../src/audio/AudioEvents.js';
import { VOICE_PROFILES } from '../../src/audio/speech/speechLines.js';
import { EventBus } from '../../src/sim/EventBus.js';
import { EVT } from '../../src/sim/events.js';
import { ABILITIES } from '../../src/data/index.js';
import { resolveAbility } from '../../src/sim/abilities.js';
import { createOptionsStore, OPTION_DEFS, TAB_OPTIONS } from '../../src/ui/optionsStore.js';
import { applyAudio } from '../../src/ui/optionsApply.js';
import { QUALITY_PRESETS } from '../../src/core/QualitySettings.js';
import { createFakeAudioContext, createFakeAudioContextClass, liveSources } from './helpers/fakeAudio.js';

function fakeStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    _m: m
  };
}

// ---------------------------------------------------------------------------------------------------------
describe('F7-08 atenuação pela distância (função pura)', () => {
  const ref = 26, max = 100;

  it('ganho 1 até o raio de referência e 0 a partir do raio máximo', () => {
    expect(distanceGain(0, ref, max)).toBe(1);
    expect(distanceGain(ref, ref, max)).toBe(1);
    expect(distanceGain(max, ref, max)).toBe(0);
    expect(distanceGain(max * 3, ref, max)).toBe(0);
  });

  it('é monótona não crescente e fica em (0,1) entre os raios', () => {
    let prev = 1;
    for (let d = ref; d <= max; d += 2) {
      const g = distanceGain(d, ref, max);
      expect(g).toBeLessThanOrEqual(prev + 1e-12);
      expect(g).toBeGreaterThanOrEqual(0);
      if (d > ref && d < max) { expect(g).toBeGreaterThan(0); expect(g).toBeLessThan(1); }
      prev = g;
    }
  });

  it('metade do caminho cai para 25% (queda quadrática) e a potência muda a curva', () => {
    expect(distanceGain((ref + max) / 2, ref, max)).toBeCloseTo(0.25, 6);
    expect(distanceGain((ref + max) / 2, ref, max, 1)).toBeCloseTo(0.5, 6);
  });

  it('entradas inválidas: NaN/Infinity = inaudível; negativa = perto; max <= ref vira degrau', () => {
    expect(distanceGain(NaN, ref, max)).toBe(0);
    expect(distanceGain(Infinity, ref, max)).toBe(0);
    expect(distanceGain(undefined, ref, max)).toBe(0);
    expect(distanceGain(-5, ref, max)).toBe(1);
    expect(distanceGain(10, 20, 20)).toBe(1);
    expect(distanceGain(30, 20, 20)).toBe(0);
  });

  it('os raios do ouvinte ENCOLHEM com o zoom afastado e respeitam os limites', () => {
    const a = listenerRanges(0.5), b = listenerRanges(1), c = listenerRanges(1.8);
    expect(a.ref).toBeGreaterThan(b.ref);
    expect(b.max).toBeGreaterThan(c.max);
    expect(a.max).toBe(LISTENER_TUNING.maxNear);
    expect(c.max).toBe(LISTENER_TUNING.maxFar);
    expect(listenerRanges(99).max).toBe(LISTENER_TUNING.maxFar);
    expect(listenerRanges(0.01).ref).toBe(LISTENER_TUNING.refNear);
    expect(listenerRanges(NaN).ref).toBe(listenerRanges(1).ref);
  });

  it('panorama: lado direito positivo, centro zero, satura em maxPan', () => {
    expect(panFor(0, 0, 1, 0, 30)).toBe(0);
    expect(panFor(15, 0, 1, 0, 30)).toBeCloseTo(0.35, 6);
    expect(panFor(-15, 0, 1, 0, 30)).toBeCloseTo(-0.35, 6);
    expect(panFor(500, 0, 1, 0, 30)).toBe(LISTENER_TUNING.maxPan);
    expect(panFor(0, 20, 0, 1, 20)).toBe(LISTENER_TUNING.maxPan); // "direita" da câmera pode ser o eixo z
    expect(panFor(5, 5, 1, 0, 0)).toBe(0);
  });

  it('mistura posicional: sem posição = interface; perto audível; longe inaudível', () => {
    const L = { x: 0, z: 0, zoom: 1, rightX: 1, rightZ: 0 };
    expect(positionalMix(L, null)).toEqual({ gain: 1, pan: 0, distance: 0, audible: true });
    const near = positionalMix(L, { x: 10, z: 0 });
    expect(near.gain).toBeCloseTo(zoomVolume(1), 6); // ganho cheio × volume do zoom
    expect(near.pan).toBeGreaterThan(0);
    const mid = positionalMix(L, { x: 60, z: 0 });
    expect(mid.gain).toBeGreaterThan(MIN_AUDIBLE);
    expect(mid.gain).toBeLessThan(1);
    expect(positionalMix(L, { x: 400, z: 0 }).audible).toBe(false);
    // afastar o zoom ENCOLHE o alcance
    expect(positionalMix({ ...L, zoom: 0.5 }, { x: 100, z: 0 }).audible).toBe(true);
    expect(positionalMix({ ...L, zoom: 1.8 }, { x: 100, z: 0 }).audible).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------------------
describe('F7-08 limite de vozes com prioridade (VoicePool)', () => {
  const spec = (key, priority = 1, loudness = 1, duration = 1) => ({ key, priority, loudness, duration });

  it('nunca passa do teto e concede enquanto há vaga', () => {
    const pool = new VoicePool({ max: 3 });
    for (let i = 0; i < 3; i++) expect(pool.request(spec('a'), 0).ok).toBe(true);
    expect(pool.count(0)).toBe(3);
    for (let i = 0; i < 20; i++) pool.request(spec('b', 1, 1), 0.01 * i);
    expect(pool.count(0.2)).toBeLessThanOrEqual(3);
  });

  it('prioridade maior rouba a voz mais fraca; prioridade menor é negada', () => {
    const pool = new VoicePool({ max: 2 });
    const low = pool.request(spec('chop', 0.8), 0);
    const mid = pool.request(spec('sword', 1.5), 0);
    const hi = pool.request(spec('alarm', 5), 0.1);
    expect(hi.ok).toBe(true);
    expect(hi.evicted).toBe(low.id); // a de menor prioridade saiu
    expect(pool.voices.map(v => v.id).sort()).toEqual([mid.id, hi.id].sort());
    const weak = pool.request(spec('chop', 0.5), 0.2);
    expect(weak.ok).toBe(false);
    expect(weak.reason).toBe('full');
    expect(pool.count(0.2)).toBe(2);
  });

  it('empate de prioridade: o mais alto vence, o mais baixo (distante) é negado, empate total rouba a mais velha', () => {
    const pool = new VoicePool({ max: 2 });
    const a = pool.request(spec('x', 1, 0.5), 0);
    const b = pool.request(spec('x', 1, 0.9), 0);
    expect(pool.request(spec('x', 1, 0.2), 0.1).ok).toBe(false); // mais baixo que as duas
    const loud = pool.request(spec('x', 1, 1), 0.1);
    expect(loud.ok).toBe(true);
    expect(loud.evicted).toBe(a.id); // a mais fraca (volume 0,5)
    const tie = pool.request(spec('x', 1, 1), 0.2); // empata com `loud` e vence `b` (0,9)? não: b é mais fraca
    expect(tie.ok).toBe(true);
    expect(tie.evicted).toBe(b.id);
  });

  it('voz expirada libera a vaga sem timer (tempo injetado)', () => {
    const pool = new VoicePool({ max: 1 });
    expect(pool.request(spec('a', 1, 1, 0.5), 0).ok).toBe(true);
    expect(pool.request(spec('b', 0.1, 0.1, 0.5), 0.4).ok).toBe(false);
    const late = pool.request(spec('b', 0.1, 0.1, 0.5), 0.5);
    expect(late.ok).toBe(true);
    expect(late.evicted).toBe(0); // vaga livre: ninguém foi roubado
  });

  it('teto por som (perKey): o novo só entra se vencer uma voz do mesmo som', () => {
    const pool = new VoicePool({ max: 10, perKey: { sword: 2 } });
    const s1 = pool.request(spec('sword', 1, 0.6), 0);
    pool.request(spec('sword', 1, 0.8), 0);
    expect(pool.request(spec('sword', 1, 0.4), 0).ok).toBe(false);
    expect(pool.stats.deniedByReason.key).toBe(1);
    const strong = pool.request(spec('sword', 1, 1), 0);
    expect(strong.ok).toBe(true);
    expect(strong.evicted).toBe(s1.id);
    expect(pool.request(spec('chop', 1, 0.1), 0).ok).toBe(true); // outro som não é afetado
  });

  it('intervalo mínimo entre recomeços do mesmo som (minGap)', () => {
    const pool = new VoicePool({ max: 10, minGap: { chop: 0.05 } });
    expect(pool.request(spec('chop'), 1).ok).toBe(true);
    const r = pool.request(spec('chop'), 1.03);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('gap');
    expect(pool.request(spec('chop'), 1.06).ok).toBe(true);
    expect(pool.request(spec('other'), 1.06).ok).toBe(true);
  });

  it('teto 0 nega tudo; setMax reduzindo devolve as vozes tiradas (as mais fracas)', () => {
    expect(new VoicePool({ max: 0 }).request(spec('a'), 0).reason).toBe('off');
    const pool = new VoicePool({ max: 4 });
    const ids = [pool.request(spec('a', 1), 0), pool.request(spec('b', 3), 0), pool.request(spec('c', 2), 0), pool.request(spec('d', 5), 0)].map(r => r.id);
    const dropped = pool.setMax(2);
    expect(dropped).toEqual([ids[0], ids[2]]); // prioridades 1 e 2 saem
    expect(pool.count(0)).toBe(2);
  });

  it('release libera a vaga antes do fim e clear zera', () => {
    const pool = new VoicePool({ max: 1 });
    const r = pool.request(spec('a', 5, 1, 10), 0);
    pool.release(r.id);
    expect(pool.count(0)).toBe(0);
    pool.request(spec('a'), 0);
    pool.clear();
    expect(pool.count(0)).toBe(0);
  });
});

// ---------------------------------------------------------------------------------------------------------
describe('F7-08 música adaptativa: estado de combate (MusicDirector)', () => {
  it('um golpe solto não vira combate; golpes em sequência viram', () => {
    const d = new MusicDirector();
    d.add(1, 0);
    expect(d.update(0.1)).toBe('peace');
    for (let t = 1; t <= 5; t += 0.5) d.add(1, t);
    expect(d.update(5)).toBe('combat');
  });

  it('a intensidade cai pela metade a cada meia-vida', () => {
    const d = new MusicDirector({ halfLife: 5 });
    d.add(8, 0);
    expect(d.level(5)).toBeCloseTo(4, 6);
    expect(d.level(10)).toBeCloseTo(2, 6);
  });

  it('só volta à paz depois do tempo mínimo em combate E da intensidade baixa (histerese)', () => {
    const d = new MusicDirector();
    d.add(10, 0);
    expect(d.update(0)).toBe('combat');
    // intensidade cai rápido, mas o tempo mínimo em combate (10 s) ainda não passou
    expect(d.level(9)).toBeLessThan(DIRECTOR_DEFAULTS.exit * 4);
    expect(d.update(9)).toBe('combat');
    // passou o mínimo, mas ainda há combate: mantém
    d.add(10, 10);
    expect(d.update(10.5)).toBe('combat');
    // some o combate: volta
    let state = 'combat';
    for (let t = 11; t < 80 && state === 'combat'; t += 1) state = d.update(t);
    expect(state).toBe('peace');
  });

  it('não oscila: depois de entrar em combate, uma pausa curta não troca de estado', () => {
    const d = new MusicDirector();
    for (let t = 0; t < 6; t++) d.add(2, t);
    expect(d.update(6)).toBe('combat');
    expect(d.update(8)).toBe('combat');
    expect(d.update(12)).toBe('combat'); // < minCombat desde 6
  });

  it('faixa por facção e estado; facção desconhecida usa a humana', () => {
    expect(trackIdFor('human', 'peace')).toBe('human_peace');
    expect(trackIdFor('orc', 'combat')).toBe('orc_combat');
    expect(trackIdFor('neutral', 'combat')).toBe('human_combat');
    expect(trackIdFor(undefined, 'qualquer')).toBe('human_peace');
    for (const f of ['human', 'orc']) for (const s of ['peace', 'combat']) expect(TRACKS[trackIdFor(f, s)]).toBeTruthy();
  });

  it('reset volta à paz e zera a intensidade', () => {
    const d = new MusicDirector();
    d.add(20, 0);
    d.update(0);
    d.reset(100);
    expect(d.state).toBe('peace');
    expect(d.level(100)).toBe(0);
  });
});

// ---------------------------------------------------------------------------------------------------------
describe('F7-08 mixer: volume por canal persistido (storage falso)', () => {
  let st, store;
  beforeEach(() => { st = fakeStorage(); store = createOptionsStore(st); });

  it('os três canais (música, efeitos, falas) e o geral têm padrão e fazem parte da aba de áudio', () => {
    expect(store.get('volumeMaster')).toBe(1);
    expect(store.get('volumeMusic')).toBe(OPTION_DEFS.volumeMusic.def);
    expect(store.get('volumeSfx')).toBe(OPTION_DEFS.volumeSfx.def);
    expect(store.get('volumeVoice')).toBe(0.8);
    expect(TAB_OPTIONS.audio).toEqual(expect.arrayContaining(['volumeMaster', 'volumeMusic', 'volumeSfx', 'volumeVoice']));
  });

  it('grava e relê cada canal pelas chaves do localStorage', () => {
    store.set('volumeMusic', 0.1);
    store.set('volumeSfx', 0.35);
    store.set('volumeVoice', 0.65);
    store.set('volumeMaster', 0.9);
    expect(st._m.get('warpoly.volMusic')).toBe('0.1');
    expect(st._m.get('warpoly.volSfx')).toBe('0.35');
    expect(st._m.get('warpoly.volVoice')).toBe('0.65');
    expect(st._m.get('warpoly.volMaster')).toBe('0.9');
    // outra instância sobre o mesmo storage (recarregar a página) lê os mesmos valores
    const again = createOptionsStore(st);
    expect(again.get('volumeMusic')).toBe(0.1);
    expect(again.get('volumeSfx')).toBe(0.35);
    expect(again.get('volumeVoice')).toBe(0.65);
    expect(again.get('volumeMaster')).toBe(0.9);
  });

  it('valores fora da faixa são limitados e lixo vira o padrão', () => {
    store.set('volumeVoice', 7);
    store.set('volumeMusic', -1);
    expect(store.get('volumeVoice')).toBe(1);
    expect(store.get('volumeMusic')).toBe(0);
    const bad = createOptionsStore(fakeStorage({ 'warpoly.volVoice': 'alto', 'warpoly.volMusic': '', 'warpoly.volSfx': 'NaN' }));
    expect(bad.get('volumeVoice')).toBe(OPTION_DEFS.volumeVoice.def);
    expect(bad.get('volumeMusic')).toBe(OPTION_DEFS.volumeMusic.def);
    expect(bad.get('volumeSfx')).toBe(OPTION_DEFS.volumeSfx.def);
  });

  it('storage que lança erro (modo privado/bloqueado) não quebra: leitura = padrão, gravação ignorada', () => {
    const boom = {
      getItem() { throw new Error('SecurityError'); },
      setItem() { throw new Error('QuotaExceededError'); },
      removeItem() { throw new Error('SecurityError'); }
    };
    const s = createOptionsStore(boom);
    expect(() => s.get('volumeVoice')).not.toThrow();
    expect(s.get('volumeVoice')).toBe(0.8);
    expect(() => s.set('volumeVoice', 0.3)).not.toThrow();
    expect(s.set('volumeMusic', 0.4)).toBe(0.4); // devolve o valor efetivo mesmo sem persistir
    expect(() => s.resetTab('audio')).not.toThrow();
    expect(createOptionsStore(null).get('volumeSfx')).toBe(OPTION_DEFS.volumeSfx.def);
  });

  it('restaurar padrão da aba de áudio apaga as chaves dos canais', () => {
    store.set('volumeVoice', 0.2);
    store.set('volumeMusic', 0.9);
    store.resetTab('audio');
    expect(st._m.has('warpoly.volVoice')).toBe(false);
    expect(st._m.has('warpoly.volMusic')).toBe(false);
    expect(store.get('volumeVoice')).toBe(0.8);
  });

  it('applyAudio empurra os quatro volumes para o gerenciador de som (e cai no modo antigo sem setVolumes)', () => {
    store.set('volumeMusic', 0.2); store.set('volumeSfx', 0.4); store.set('volumeVoice', 0.6); store.set('volumeMaster', 0.5);
    const got = [];
    applyAudio({ setVolumes: (v) => got.push(v) }, store);
    expect(got).toEqual([{ master: 0.5, music: 0.2, sfx: 0.4, voice: 0.6 }]);
    const old = [];
    applyAudio({ setSfxVolume: (v) => old.push(['sfx', v]), setMusicVolume: (v) => old.push(['music', v]) }, store);
    expect(old).toEqual([['sfx', 0.2], ['music', 0.1]]);
    expect(() => applyAudio(null, store)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------------------------------------
describe('F7-08 configuração: nível por preset, ?audio= e automação muda', () => {
  it('parseAudioParam aceita 0/1/off/on e níveis; lixo = null', () => {
    expect(parseAudioParam(null)).toBe(null);
    expect(parseAudioParam('0')).toBe('off');
    expect(parseAudioParam('off')).toBe('off');
    expect(parseAudioParam('mute')).toBe('off');
    expect(parseAudioParam('1')).toBe('high');
    expect(parseAudioParam('low')).toBe('low');
    expect(parseAudioParam('MED')).toBe('med');
    expect(parseAudioParam('xx')).toBe(null);
  });

  it('automação (navigator.webdriver) fica MUDA por padrão; ?audio= força mesmo assim', () => {
    expect(isAutomation({ webdriver: true })).toBe(true);
    expect(isAutomation({ webdriver: false })).toBe(false);
    expect(isAutomation(undefined)).toBe(false);
    expect(selectAudioLevel(QUALITY_PRESETS.high, 'high', null, { automation: true })).toBe('off');
    expect(selectAudioLevel(QUALITY_PRESETS.high, 'high', 'low', { automation: true })).toBe('low');
    expect(selectAudioLevel(QUALITY_PRESETS.high, 'high', 'on', { automation: true })).toBe('high');
  });

  it('texq=low reduz; o preset decide nos demais; ?audio=0 desliga', () => {
    expect(selectAudioLevel(QUALITY_PRESETS.high, 'low')).toBe('low');
    expect(selectAudioLevel(QUALITY_PRESETS.med, 'med')).toBe('med');
    expect(selectAudioLevel(QUALITY_PRESETS.high, 'high')).toBe('high');
    expect(selectAudioLevel(QUALITY_PRESETS.ultra, 'ultra')).toBe('high');
    expect(selectAudioLevel(QUALITY_PRESETS.high, 'high', '0')).toBe('off');
    expect(selectAudioLevel(null, 'med')).toBe('med');
    for (const p of Object.values(QUALITY_PRESETS)) expect(AUDIO_LEVELS).toContain(p.audio);
  });

  it('tetos de vozes e recursos crescem com o nível; off zera tudo', () => {
    expect(AUDIO_CAPS.off.maxVoices).toBe(0);
    expect(AUDIO_CAPS.low.maxVoices).toBeLessThan(AUDIO_CAPS.med.maxVoices);
    expect(AUDIO_CAPS.med.maxVoices).toBeLessThan(AUDIO_CAPS.high.maxVoices);
    expect(AUDIO_CAPS.low.ambience).toBe(false);
    expect(AUDIO_CAPS.med.ambience).toBe(true);
    expect(AUDIO_CAPS.off.music).toBe('none');
  });

  it('detectAudioLevel lê ?audio= e navigator.webdriver da janela injetada', () => {
    const win = (search, webdriver) => ({ location: { search }, navigator: { webdriver } });
    expect(detectAudioLevel(null, 'low', win('?skipPreload&texq=low', true))).toBe('off');
    expect(detectAudioLevel(null, 'low', win('?skipPreload&texq=low&audio=low', true))).toBe('low');
    expect(detectAudioLevel(QUALITY_PRESETS.high, 'high', win('', false))).toBe('high');
    expect(detectAudioLevel(null, 'med', {})).toBe('med');
  });

  it('clampVolume e o RNG de render são determinísticos e independentes de Math.random', () => {
    expect(clampVolume(2)).toBe(1);
    expect(clampVolume(-1)).toBe(0);
    expect(clampVolume('x', 0.3)).toBe(0.3);
    const a = createAudioRng(9), b = createAudioRng(9);
    const sa = Array.from({ length: 6 }, () => a()), sb = Array.from({ length: 6 }, () => b());
    expect(sa).toEqual(sb);
    expect(sa.every(v => v >= 0 && v < 1)).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------------------
describe('F7-08 mapeamento evento -> som (puro)', () => {
  const pos = { x: 3, y: 0, z: 4 };

  it('trabalho: próprio sempre soa; alheio só se visível e com prioridade menor', () => {
    const own = soundsForEvent(EVT.WORKER_CHOP, { pos, ownerId: 0 }, { own: true, visible: true });
    expect(own).toHaveLength(1);
    expect(own[0]).toMatchObject({ sfx: 'chop', priority: 1.2 });
    expect(own[0].pos).toBe(pos);
    expect(soundsForEvent(EVT.WORKER_CHOP, { pos, ownerId: 1 }, { own: false, visible: false })).toEqual([]);
    const other = soundsForEvent(EVT.WORKER_CHOP, { pos, ownerId: 1 }, { own: false, visible: true });
    expect(other[0].priority).toBeLessThan(own[0].priority);
    expect(soundsForEvent(EVT.WORKER_MINE, { pos, resource: 'gold' }, { own: true })[0].sfx).toBe('mineGold');
    expect(soundsForEvent(EVT.WORKER_MINE, { pos, resource: 'stone' }, { own: true })[0].sfx).toBe('mineStone');
    expect(soundsForEvent(EVT.WORKER_HAMMER, { pos }, { own: true })[0].sfx).toBe('hammer');
  });

  it('projéteis: disparo e impacto por tipo; cerco bate mais forte', () => {
    const from = { x: 1, y: 1, z: 1 };
    expect(soundsForEvent(EVT.PROJECTILE_FIRED, { kind: 'arrow', from }, { own: true })[0]).toMatchObject({ sfx: 'bow', pos: from });
    expect(soundsForEvent(EVT.PROJECTILE_FIRED, { kind: 'axe', from }, { own: true })[0].sfx).toBe('throw');
    expect(soundsForEvent(EVT.PROJECTILE_FIRED, { kind: 'bolt', from }, { own: true })[0].sfx).toBe('bolt');
    expect(soundsForEvent(EVT.PROJECTILE_FIRED, { kind: 'boulder', from }, { own: true })[0].sfx).toBe('catapult');
    const arrow = soundsForEvent(EVT.PROJECTILE_HIT, { kind: 'arrow', pos }, { own: false, visible: true })[0];
    const rock = soundsForEvent(EVT.PROJECTILE_HIT, { kind: 'boulder', pos }, { own: false, visible: true })[0];
    expect(arrow.sfx).toBe('arrowHit');
    expect(rock.sfx).toBe('stoneHit');
    expect(rock.priority).toBeGreaterThan(arrow.priority);
    expect(soundsForEvent(EVT.MELEE_HIT, { pos }, { own: false, visible: false })).toEqual([]);
    expect(soundsForEvent(EVT.EXPLOSION, { pos, radius: 2 }, { own: false, visible: true })[0]).toMatchObject({ sfx: 'explosion', priority: 3 });
  });

  it('marcos do jogador local não são posicionais e têm prioridade alta; o dos outros só se visível', () => {
    expect(soundsForEvent(EVT.UNDER_ATTACK, { pos }, { own: true })[0]).toMatchObject({ sfx: 'alarm', pos: null, priority: 5 });
    expect(soundsForEvent(EVT.UNDER_ATTACK, { pos }, { own: false })).toEqual([]);
    expect(soundsForEvent(EVT.UNIT_TRAINED, { pos }, { own: true })[0]).toMatchObject({ sfx: 'chime', pos: null });
    expect(soundsForEvent(EVT.UNIT_TRAINED, { pos }, { own: false, visible: false })).toEqual([]);
    const enemyTrain = soundsForEvent(EVT.UNIT_TRAINED, { pos }, { own: false, visible: true })[0];
    expect(enemyTrain.pos).toBe(pos);
    expect(enemyTrain.gain).toBeLessThan(1);
    expect(soundsForEvent(EVT.BUILDING_COMPLETED, { pos }, { own: true })[0]).toMatchObject({ sfx: 'buildComplete', pos: null, priority: 3 });
    expect(soundsForEvent(EVT.RESEARCH_DONE, {}, { own: true })[0].sfx).toBe('buildComplete');
    expect(soundsForEvent(EVT.RESEARCH_DONE, {}, { own: false })).toEqual([]);
    expect(soundsForEvent(EVT.BUILDING_PLACED, { pos }, { own: false })).toEqual([]);
    expect(soundsForEvent(EVT.RESOURCE_GATHERED, {}, { own: true })[0].sfx).toBe('gather');
    expect(soundsForEvent(EVT.MATCH_WON, {}, {})[0]).toMatchObject({ sfx: 'victory', priority: 6 });
    expect(soundsForEvent(EVT.MATCH_LOST, {}, {})[0]).toMatchObject({ sfx: 'defeat', priority: 6 });
  });

  it('morte, desabamento e magia; morte por expiração é muda; evento desconhecido = nada', () => {
    expect(soundsForEvent(EVT.UNIT_DIED, { pos }, { own: true })[0].sfx).toBe('death');
    expect(soundsForEvent(EVT.UNIT_DIED, { pos, expired: true }, { own: true })).toEqual([]);
    expect(soundsForEvent(EVT.BUILDING_DESTROYED, { pos }, { own: false, visible: true })[0].sfx).toBe('collapse');
    const cast = soundsForEvent(EVT.ABILITY_CAST, { pos }, { own: true, vfxKind: 'beam' })[0];
    expect(cast).toMatchObject({ sfx: 'cast', variant: 'beam' });
    expect(soundsForEvent(EVT.ABILITY_CAST, { pos }, { own: true })[0].variant).toBe('burst');
    expect(soundsForEvent('nao_existe', {}, { own: true })).toEqual([]);
  });

  it('todo som mapeado tem receita; todo evento registrado tem mapeamento', () => {
    const used = new Set();
    for (const type of SFX_EVENTS) {
      const out = soundsForEvent(type, { pos, from: pos, kind: 'arrow', resource: 'gold' }, { own: true, visible: true });
      expect(out.length, type).toBeGreaterThan(0);
      for (const d of out) { used.add(d.sfx); expect(SFX[d.sfx], d.sfx).toBeTruthy(); }
    }
    for (const k of ['bolt', 'catapult', 'stoneHit', 'throw']) {
      expect(SFX[k]).toBeTruthy();
    }
    expect(used.size).toBeGreaterThan(8);
  });

  it('peso de combate: o que é seu pesa mais; alheio só perto; expirada não conta', () => {
    expect(combatWeight(EVT.UNIT_DAMAGED, {}, { own: true })).toBe(1);
    expect(combatWeight(EVT.UNIT_DAMAGED, {}, { own: false, near: true })).toBe(0.5);
    expect(combatWeight(EVT.UNIT_DAMAGED, {}, { own: false, near: false })).toBe(0);
    expect(combatWeight(EVT.UNIT_DIED, {}, { own: true })).toBeGreaterThan(combatWeight(EVT.UNIT_DAMAGED, {}, { own: true }));
    expect(combatWeight(EVT.UNIT_DIED, { expired: true }, { own: true })).toBe(0);
    expect(combatWeight(EVT.BUILDING_DESTROYED, {}, { own: true })).toBeGreaterThan(combatWeight(EVT.BUILDING_DAMAGED, {}, { own: true }));
    expect(combatWeight(EVT.EXPLOSION, {}, { near: true })).toBeGreaterThan(0);
    expect(combatWeight(EVT.WORKER_CHOP, {}, { own: true })).toBe(0);
    for (const t of COMBAT_EVENTS) expect(combatWeight(t, {}, { own: true })).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------------------------------------
describe('F7-08 ambiência por tileset (puro)', () => {
  it('todo tileset de src/data/tilesets.js tem perfil; níveis em 0..1', () => {
    for (const id of TILESET_IDS) {
      expect(AMBIENCE_PROFILES[id], id).toBeTruthy();
      const mix = ambienceMix(id);
      for (const k of AMBIENCE_LAYERS) { expect(mix[k]).toBeGreaterThanOrEqual(0); expect(mix[k]).toBeLessThanOrEqual(1); }
    }
  });

  it('cada tileset soa diferente: inverno tem neve e sem grilos; pântano tem água e grilos; devastadas tem estrondo', () => {
    expect(ambienceMix('inverno').snow).toBeGreaterThan(0);
    expect(ambienceMix('inverno').crickets).toBe(0);
    expect(ambienceMix('pantano').water).toBeGreaterThan(ambienceMix('verdejante').water);
    expect(ambienceMix('pantano', { night: 1 }).crickets).toBeGreaterThan(ambienceMix('pantano').crickets);
    expect(ambienceMix('devastadas').rumble).toBeGreaterThan(0);
    expect(ambienceMix('verdejante').snow).toBe(0);
  });

  it('aliases e desconhecido caem no tileset padrão', () => {
    expect(ambienceMix('winter')).toEqual(ambienceMix('inverno'));
    expect(ambienceMix('ilhas')).toEqual(ambienceMix('verdejante'));
    expect(ambienceMix('xyz')).toEqual(ambienceMix('verdejante'));
    expect(ambienceMix(undefined)).toEqual(ambienceMix('verdejante'));
  });

  it('noite: dia/pôr do sol/noite e ciclo dia-noite (fase 0 = meia-noite)', () => {
    expect(nightFactor({ timeOfDay: 'day' })).toBe(0);
    expect(nightFactor({ timeOfDay: 'sunset' })).toBe(0.5);
    expect(nightFactor({ timeOfDay: 'night' })).toBe(1);
    expect(nightFactor({ dayNight: { enabled: true, phase: 0 } })).toBeCloseTo(1, 6);
    expect(nightFactor({ dayNight: { enabled: true, phase: 0.5 } })).toBe(0);
    expect(nightFactor({ timeOfDay: 'night', dayNight: { enabled: false, phase: 0.5 } })).toBe(1);
    expect(nightFactor()).toBe(0);
  });
});

// ---------------------------------------------------------------------------------------------------------
describe('F7-08 partituras procedurais', () => {
  it('quatro faixas (duas por facção) com laço de 8 compassos', () => {
    expect([...TRACK_IDS].sort()).toEqual(['human_combat', 'human_peace', 'orc_combat', 'orc_peace']);
    for (const t of Object.values(TRACKS)) {
      expect(trackLength(t)).toBe(t.stepsPerBar * t.bars);
      expect(t.prog).toHaveLength(t.bars);
      expect(stepSeconds(t)).toBeGreaterThan(0.05);
    }
    expect(TRACKS.human_combat.bpm).toBeGreaterThan(TRACKS.human_peace.bpm);
    expect(TRACKS.orc_combat.bpm).toBeGreaterThan(TRACKS.orc_peace.bpm);
  });

  it('as notas ficam em faixa audível e finitas; vel em (0,1]; durações positivas', () => {
    for (const t of Object.values(TRACKS)) {
      let n = 0;
      for (let s = 0; s < trackLength(t) * 2; s++) {
        for (const e of eventsForStep(t, s, { seed: 3 })) {
          n++;
          expect(Number.isFinite(e.midi)).toBe(true);
          if (e.midi) { expect(e.midi).toBeGreaterThanOrEqual(28); expect(e.midi).toBeLessThanOrEqual(96); }
          expect(e.vel).toBeGreaterThan(0);
          expect(e.vel).toBeLessThanOrEqual(1);
          expect(e.dur).toBeGreaterThan(0);
        }
      }
      expect(n, t.id).toBeGreaterThan(100);
    }
  });

  it('é determinística (mesma semente = mesmas notas) e dá a volta no laço', () => {
    const t = TRACKS.human_peace;
    const a = JSON.stringify(Array.from({ length: 80 }, (_, s) => eventsForStep(t, s, { seed: 5 })));
    const b = JSON.stringify(Array.from({ length: 80 }, (_, s) => eventsForStep(t, s, { seed: 5 })));
    expect(a).toBe(b);
    // camadas fixas (sem melodia) se repetem a cada volta
    const fixed = (s) => eventsForStep(t, s, { seed: 5 }).filter(e => e.inst !== 'flute');
    for (let s = 0; s < trackLength(t); s++) expect(fixed(s)).toEqual(fixed(s + trackLength(t)));
    // a melodia varia entre voltas
    const mel = (loop) => JSON.stringify(Array.from({ length: trackLength(t) }, (_, s) => eventsForStep(t, s + loop * trackLength(t), { seed: 5 }).filter(e => e.inst === 'flute')));
    expect(mel(0)).not.toBe(mel(1));
  });

  it('paz e combate soam diferente: combate tem percussão/metais; paz não tem caixa/tambor de guerra', () => {
    const insts = (t) => {
      const set = new Set();
      for (let s = 0; s < trackLength(t); s++) for (const e of eventsForStep(t, s)) set.add(e.inst);
      return set;
    };
    expect(insts(TRACKS.human_combat).has('snare')).toBe(true);
    expect(insts(TRACKS.human_combat).has('brass')).toBe(true);
    expect(insts(TRACKS.human_peace).has('snare')).toBe(false);
    expect(insts(TRACKS.human_peace).has('pluck')).toBe(true);
    expect(insts(TRACKS.orc_peace).has('drone')).toBe(true);
    expect(insts(TRACKS.orc_combat).has('tom')).toBe(true);
  });

  it('modo leve (preset baixo) só mantém as camadas essenciais', () => {
    for (const t of Object.values(TRACKS)) {
      let full = 0, lite = 0;
      for (let s = 0; s < trackLength(t); s++) {
        full += eventsForStep(t, s, { lite: false }).length;
        lite += eventsForStep(t, s, { lite: true }).length;
      }
      expect(lite, t.id).toBeGreaterThan(0);
      expect(lite, t.id).toBeLessThan(full);
    }
    const padStep = eventsForStep(TRACKS.human_peace, 0, { lite: true }).map(e => e.inst);
    expect(padStep).not.toContain('pad');
  });

  it('ruído branco e rosa: finitos e dentro de [-1, 1]', () => {
    const rng = createAudioRng(1);
    const w = fillWhite(new Float32Array(4096), rng);
    const p = fillPink(new Float32Array(4096), rng);
    for (const x of [w, p]) {
      expect(x.every(Number.isFinite)).toBe(true);
      expect(Math.max(...x.map(Math.abs))).toBeLessThanOrEqual(1.2);
      expect(Math.max(...x.map(Math.abs))).toBeGreaterThan(0.05);
    }
  });
});

// ---------------------------------------------------------------------------------------------------------
describe('F7-08 motor de áudio (contexto falso): mixer, limitador, posicional e vozes', () => {
  let ctx, eng;
  const mk = (level = 'med') => { ctx = createFakeAudioContext(); eng = new AudioEngine({ ctx, level, timers: null }); return eng; };

  it('o grafo termina em mestre -> limitador (compressor) -> saída, com os 3 canais nos barramentos certos', () => {
    mk();
    expect(eng.master.connections).toContain(eng.limiter);
    expect(eng.limiter.connections).toContain(ctx.destination);
    expect(eng.limiter.kind).toBe('compressor');
    expect(eng.limiter.ratio.value).toBeGreaterThanOrEqual(12); // comportamento de limitador
    expect(eng.limiter.threshold.value).toBeLessThan(0);
    expect(eng.limiter.attack.value).toBeLessThanOrEqual(0.005);
    expect(eng.buses.sfx.connections).toContain(eng.master);
    expect(eng.buses.voice.connections).toContain(eng.master);
    expect(eng.buses.music.connections).toContain(eng.musicDuck);
    expect(eng.musicDuck.connections).toContain(eng.master);
    expect(eng.ambienceBus.connections).toContain(eng.buses.sfx); // ambiência soa no canal de efeitos
  });

  it('volume por canal: cada barramento recebe o seu valor; geral multiplica no mestre', () => {
    mk();
    eng.setVolumes({ master: 0.7, music: 0.3, sfx: 0.6, voice: 0.9 }, true);
    const last = (n) => n.gain.events.filter(e => e[0] === 'set').pop()[1];
    expect(last(eng.master)).toBe(0.7);
    expect(last(eng.buses.music)).toBe(0.3);
    expect(last(eng.buses.sfx)).toBe(0.6);
    expect(last(eng.buses.voice)).toBe(0.9);
    eng.setVolumes({ voice: 0.1 }); // suave (setTargetAtTime), os outros canais ficam
    expect(eng.buses.voice.gain.events.at(-1)[0]).toBe('target');
    expect(eng.volumes).toEqual({ master: 0.7, music: 0.3, sfx: 0.6, voice: 0.1 });
    eng.setVolumes({ sfx: 5, music: -2 });
    expect(eng.volumes.sfx).toBe(1);
    expect(eng.volumes.music).toBe(0);
  });

  it('som longe da câmera nem cria nós; perto toca e atenua pela distância', () => {
    mk();
    eng.setListener({ x: 0, z: 0, zoom: 1, rightX: 1, rightZ: 0 });
    const before = ctx.counts.osc || 0;
    expect(eng.playSfx('hammer', { pos: { x: 500, z: 0 } })).toBe(false);
    expect(eng.counters.culled).toBe(1);
    expect(ctx.counts.osc || 0).toBe(before);
    expect(eng.playSfx('hammer', { pos: { x: 5, z: 0 } })).toBe(true);
    expect(ctx.counts.osc).toBeGreaterThan(before);
    const near = ctx.nodes.filter(n => n.kind === 'gain').pop();
    ctx.advance(0.2);
    eng.playSfx('hammer', { pos: { x: 70, z: 0 } });
    const gains = ctx.nodes.filter(n => n.kind === 'gain' && n.gain.value > 0 && n.gain.value < 1);
    expect(gains.length).toBeGreaterThan(0); // a voz do som distante saiu com ganho entre 0 e 1
    expect(near).toBeTruthy();
  });

  it('panorama estéreo só nos níveis que têm pan; som de interface não usa', () => {
    mk('med');
    eng.setListener({ x: 0, z: 0, zoom: 1, rightX: 1, rightZ: 0 });
    eng.playSfx('hammer', { pos: { x: 20, z: 0 } });
    expect(ctx.counts.panner).toBe(1);
    ctx.advance(1);
    eng.playSfx('select'); // interface
    expect(ctx.counts.panner).toBe(1);
    const low = createFakeAudioContext();
    const e2 = new AudioEngine({ ctx: low, level: 'low', timers: null });
    e2.setListener({ x: 0, z: 0, zoom: 1, rightX: 1, rightZ: 0 });
    e2.playSfx('hammer', { pos: { x: 20, z: 0 } });
    expect(low.counts.panner || 0).toBe(0);
  });

  it('limite de vozes: com o teto cheio, prioridade alta rouba (parando as fontes) e baixa é descartada', () => {
    mk('low'); // 8 vozes
    for (let i = 0; i < 8; i++) expect(eng.playSfx('victory', { priority: 2 })).toBe(true);
    expect(eng.pool.count(ctx.currentTime)).toBe(8);
    expect(eng.playSfx('victory', { priority: 1 })).toBe(false); // mais fraca que todas
    expect(eng.counters.dropped).toBe(1);
    const stoppedBefore = ctx.nodes.filter(n => n.kind === 'osc' && n.stopped && n.stopAt < 0.1).length;
    expect(eng.playSfx('alarm', { priority: 5 })).toBe(true);
    expect(eng.pool.count(ctx.currentTime)).toBe(8); // continua no teto
    expect(eng.pool.stats.evicted).toBe(1);
    const evictedStops = ctx.nodes.filter(n => n.kind === 'osc' && n.stopped && n.stopAt < 0.1).length;
    expect(evictedStops).toBeGreaterThan(stoppedBefore); // a voz roubada teve as fontes paradas
    expect(liveSources(ctx, 'osc')).toBeGreaterThan(0);
  });

  it('o teto de vozes acompanha o nível (low < med < high) e off não toca nada', () => {
    mk('med');
    expect(eng.pool.max).toBe(AUDIO_CAPS.med.maxVoices);
    eng.setLevel('high');
    expect(eng.pool.max).toBe(AUDIO_CAPS.high.maxVoices);
    eng.setLevel('off');
    expect(eng.pool.max).toBe(0);
    expect(eng.playSfx('select')).toBe(false);
    expect(eng.speak({ key: 'k', ph: "s'i~", voice: VOICE_PROFILES.h_soldier })).toBe(0);
    expect(eng.music.playing).toBe(false);
  });

  it('canal em zero (efeitos/geral) não cria vozes', () => {
    mk();
    eng.setVolumes({ sfx: 0 });
    expect(eng.playSfx('select')).toBe(false);
    eng.setVolumes({ sfx: 0.5, master: 0 });
    expect(eng.playSfx('select')).toBe(false);
    eng.setVolumes({ master: 1 });
    expect(eng.playSfx('select')).toBe(true);
  });

  it('toda receita roda sem erro e respeita a duração declarada', () => {
    mk('high');
    for (const [name, r] of Object.entries(SFX)) {
      ctx.advance(2); // passa o minGap e libera as vozes anteriores
      const ok = eng.playSfx(name, { pos: null, variant: name === 'cast' ? 'ring' : undefined });
      expect(ok, name).toBe(true);
      expect(r.dur, name).toBeGreaterThan(0.05);
      expect(r.dur, name).toBeLessThan(2);
    }
    for (const v of ['burst', 'ring', 'beam', 'aura']) { ctx.advance(2); expect(eng.playSfx('cast', { variant: v })).toBe(true); }
    // limites por som só mencionam receitas que existem
    for (const k of Object.keys({ ...SFX_LIMITS.perKey, ...SFX_LIMITS.minGap })) expect(SFX[k], k).toBeTruthy();
  });

  it('fala: sintetiza uma vez, cacheia, corta a fala anterior e abaixa a música', () => {
    mk();
    const spyBuf = { n: 0 };
    const orig = ctx.createBuffer.bind(ctx);
    ctx.createBuffer = (...a) => { spyBuf.n++; return orig(...a); };
    const line = { key: 'h.soldier.order.0', ph: "s'i~, se~J'oh!", voice: VOICE_PROFILES.h_soldier };
    const d1 = eng.speak(line);
    expect(d1).toBeGreaterThan(0.5);
    expect(d1).toBeLessThan(2.5);
    const created = spyBuf.n;
    expect(ctx.counts.bufsrc).toBeGreaterThan(0);
    expect(eng.musicDuck.gain.events.some(e => e[0] === 'target' && e[1] < 1)).toBe(true); // ducking
    const first = eng._speech;
    ctx.advance(0.2);
    eng.speak({ key: 'h.soldier.order.1', ph: "pr'o~tU!", voice: VOICE_PROFILES.h_soldier });
    expect(first.src.stopped).toBe(true); // cortou a anterior
    expect(first.g.gain.events.some(e => e[0] === 'target' && e[1] === 0)).toBe(true);
    ctx.advance(3);
    const again = eng.speak(line);
    expect(again).toBeCloseTo(d1, 6);
    expect(spyBuf.n).toBe(created + 1); // só a 2ª fala foi sintetizada; a 1ª veio do cache
    expect(eng.counters.speech).toBe(3);
  });

  it('o cache de falas é limitado (LRU)', () => {
    mk();
    for (let i = 0; i < 80; i++) eng.speak({ key: `k${i}`, ph: "s'a", voice: VOICE_PROFILES.h_worker });
    expect(eng._speechCache.size).toBeLessThanOrEqual(64);
    expect(eng._speechCache.has('k79')).toBe(true);
    expect(eng._speechCache.has('k0')).toBe(false);
  });

  it('falas desligadas por canal (voz 0) ou nível não tocam', () => {
    mk();
    eng.setVolumes({ voice: 0 });
    expect(eng.speak({ key: 'a', ph: "s'a", voice: VOICE_PROFILES.h_worker })).toBe(0);
  });

  it('música: paz por facção ao começar a partida; combate recente troca com crossfade; volta à paz depois', () => {
    mk();
    expect(eng.music.currentId).toBe('human_peace'); // menu
    eng.beginMatch({ faction: 'orc', tilesetId: 'inverno' });
    expect(eng.music.currentId).toBe('orc_peace');
    // agenda notas (instrumentos criam osciladores)
    const osc0 = ctx.counts.osc || 0;
    ctx.advance(0.3);
    eng.tick();
    expect(ctx.counts.osc).toBeGreaterThan(osc0);
    expect(eng.music.stats.notes).toBeGreaterThan(0);

    // combate sustentado
    for (let i = 0; i < 6; i++) eng.noteCombat(1);
    ctx.advance(0.15);
    eng.tick();
    expect(eng.music.currentId).toBe('orc_combat');
    expect(eng.music.runs.length).toBeGreaterThanOrEqual(2); // as faixas de paz ainda saem (crossfade)
    const inn = eng.music.runs[eng.music.runs.length - 1];
    const out = eng.music.runs[eng.music.runs.length - 2];
    expect(out.id).toBe('orc_peace');
    expect(out.gain.gain.events.some(e => e[0] === 'target' && e[1] === 0)).toBe(true); // saindo
    expect(inn.gain.gain.events.some(e => e[0] === 'target' && e[1] === 1)).toBe(true); // entrando

    // sem mais combate: volta à paz depois do tempo mínimo e a faixa velha é descartada
    for (let t = 0; t < 60; t += 0.15) { ctx.advance(0.15); eng.tick(); }
    expect(eng.director.state).toBe('peace');
    expect(eng.music.currentId).toBe('orc_peace');
    for (let t = 0; t < 12; t += 0.15) { ctx.advance(0.15); eng.tick(); }
    expect(eng.music.runs.length).toBe(1);
  });

  it('música: silêncio por hold/preferência/volume zero para o agendamento; nível leve usa menos camadas', () => {
    mk();
    eng.beginMatch({ faction: 'human', tilesetId: 'verdejante' });
    expect(eng.music.playing).toBe(true);
    eng.setMusicHold(true);
    expect(eng.music.playing).toBe(false);
    eng.setMusicHold(false);
    expect(eng.music.playing).toBe(true);
    eng.setMusicOn(false);
    expect(eng.music.playing).toBe(false);
    eng.setMusicOn(true);
    eng.setVolumes({ music: 0 });
    expect(eng.music.playing).toBe(false);
    eng.setVolumes({ music: 0.3 });
    expect(eng.music.playing).toBe(true);
    eng.setLevel('low');
    expect(eng.music.lite).toBe(true);
  });

  it('ambiência liga por tileset ao começar a partida, só em nível médio+, e some ao terminar', () => {
    mk('med');
    eng.beginMatch({ faction: 'human', tilesetId: 'inverno' });
    expect(eng.ambience.active.sort()).toEqual(['snow', 'wind']);
    ctx.advance(10);
    eng.tick();
    eng.endMatch();
    ctx.advance(10);
    eng.tick();
    expect(eng.ambience.active).toEqual([]);

    const lowCtx = createFakeAudioContext();
    const low = new AudioEngine({ ctx: lowCtx, level: 'low', timers: null });
    low.beginMatch({ faction: 'human', tilesetId: 'pantano' });
    expect(low.ambience.active).toEqual([]);

    mk('med');
    eng.beginMatch({ faction: 'human', tilesetId: 'pantano' });
    expect(eng.ambience.active.sort()).toEqual(['crickets', 'water', 'wind']);
  });

  it('insetos da ambiência crescem à noite (sonda da cena)', () => {
    mk('med');
    eng.sceneProbe = () => ({ timeOfDay: 'night' });
    eng.beginMatch({ faction: 'human', tilesetId: 'verdejante' });
    const gainOf = (name) => eng.ambience.layers.get(name).gain.gain.events.filter(e => e[0] === 'target').pop()[1];
    const night = gainOf('crickets');
    mk('med');
    eng.sceneProbe = () => ({ timeOfDay: 'day' });
    eng.beginMatch({ faction: 'human', tilesetId: 'verdejante' });
    expect(night).toBeGreaterThan(gainOf('crickets'));
  });

  it('stats expõe estado para depuração e dispose para tudo', () => {
    mk();
    eng.beginMatch({ faction: 'human', tilesetId: 'verdejante' });
    eng.playSfx('select');
    const s = eng.stats();
    expect(s).toMatchObject({ level: 'med', state: 'running', voices: 1, music: { track: 'human_peace' } });
    expect(s.ambience.length).toBeGreaterThan(0);
    eng.dispose();
    expect(ctx.state).toBe('closed');
    expect(eng.music.playing).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------------------
describe('F7-08 SoundManager: AudioContext só após gesto, nível por config, mudo em automação', () => {
  const mkSm = (level = 'med') => {
    const Fake = createFakeAudioContextClass();
    const logs = [];
    const sm = new SoundManager({ level, env: { AudioContext: Fake, log: (m) => logs.push(m), timers: null } });
    return { sm, Fake, logs };
  };

  it('construir e tocar antes do gesto não cria AudioContext; resume() (gesto) cria e loga', () => {
    const { sm, Fake, logs } = mkSm();
    expect(Fake.made).toHaveLength(0);
    expect(sm.playSelect()).toBe(false);
    expect(sm.playChop({ x: 0, z: 0 })).toBe(false);
    expect(Fake.made).toHaveLength(0);
    expect(sm.initialized).toBe(false);
    sm.resume(); // gesto
    expect(Fake.made).toHaveLength(1);
    expect(sm.initialized).toBe(true);
    expect(logs.join('\n')).toMatch(/AudioContext iniciado: estado=running, nível=med/);
    sm.resume();
    expect(Fake.made).toHaveLength(1); // idempotente
    expect(sm.playSelect()).toBe(true);
  });

  it("nível 'off' (testes/automação/?audio=0) nunca cria AudioContext nem toca", () => {
    const { sm, Fake } = mkSm('off');
    sm.resume();
    sm.init();
    expect(Fake.made).toHaveLength(0);
    expect(sm.playSelect()).toBe(false);
    expect(sm.canSpeak()).toBe(false);
    expect(sm.stats().level).toBe('off');
  });

  it('volumes definidos antes do gesto valem depois; canais independentes; mudo geral', () => {
    const { sm } = mkSm();
    sm.setVolumes({ music: 0.3, sfx: 0.6, voice: 0.4, master: 0.8 });
    sm.resume();
    expect(sm.engine.volumes).toEqual({ master: 0.8, music: 0.3, sfx: 0.6, voice: 0.4 });
    sm.setVoiceVolume(0);
    expect(sm.canSpeak()).toBe(false);
    expect(sm.playSelect()).toBe(true); // efeitos seguem
    expect(sm.toggleSound()).toBe(false);
    expect(sm.playSelect()).toBe(false);
    expect(sm.volumes.master).toBe(0.8); // a preferência do jogador fica; só o mestre do motor vai a zero
    expect(sm.engine.volumes.master).toBe(0);
    expect(sm.toggleSound()).toBe(true);
    expect(sm.playSelect()).toBe(true);
    sm.setSfxVolume(2);
    expect(sm.volumes.sfx).toBe(1);
  });

  it('partida pedida antes do gesto é aplicada quando o motor nasce; startMusic/stopMusic seguram a música', () => {
    const { sm } = mkSm();
    sm.beginMatch({ faction: 'orc', tilesetId: 'devastadas' });
    sm.resume();
    expect(sm.engine.match).toEqual({ faction: 'orc', tilesetId: 'devastadas' });
    expect(sm.engine.music.currentId).toBe('orc_peace');
    expect(sm.engine.ambience.active).toContain('rumble');
    sm.stopMusic();
    expect(sm.isMusicPlaying).toBe(false);
    sm.startMusic();
    expect(sm.isMusicPlaying).toBe(true);
    sm.endMatch();
    expect(sm.engine.match).toBe(null);
  });

  it('a API antiga continua: play* existem e voltam booleano; stats funciona antes e depois do gesto', () => {
    const { sm } = mkSm();
    expect(sm.stats().state).toMatch(/sem gesto/);
    sm.resume();
    for (const m of ['playChop', 'playMineGold', 'playMineStone', 'playHammer', 'playSword', 'playBow', 'playArrowHit', 'playSelect', 'playOrder', 'playBuildPlace', 'playBuildComplete', 'playError', 'playAlarm', 'playVictory']) {
      expect(typeof sm[m], m).toBe('function');
    }
    expect(sm.stats().state).toBe('running');
    expect(sm.toggleMusic()).toBe(false);
    expect(sm.toggleMusic()).toBe(true);
  });

  it('Web Audio indisponível não derruba o jogo (aviso e segue mudo)', () => {
    const sm = new SoundManager({ level: 'med', env: { AudioContext: function Boom() { throw new Error('bloqueado'); }, log() {}, timers: null } });
    const warn = console.warn;
    console.warn = () => {};
    try { expect(() => sm.resume()).not.toThrow(); } finally { console.warn = warn; }
    expect(sm.initialized).toBe(false);
    expect(sm.playSelect()).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------------------
describe('F7-08 AudioEvents: eventos da sim -> som (sim intocada)', () => {
  function setup({ visible = () => true, faction = 'human', canSpeak = true } = {}) {
    const events = new EventBus();
    const calls = [];
    let clock = 10;
    const gm = {
      events, localPlayerId: 0, localPlayer: { factionId: faction },
      entitiesById: new Map(),
      selectedUnits: [],
      getPlayer: (id) => ({ factionId: id === 0 ? faction : 'orc' }),
      fogOfWar: { isVisible: (x, z) => visible(x, z) },
      sceneManager: {
        cameraTarget: { x: 0, z: 0 }, zoomLevel: 1, timeOfDay: 'day', dayNight: { enabled: false, phase: 0.4 },
        camera: { matrixWorld: { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] } }
      },
      soundManager: 'original'
    };
    const sound = {
      setListener: () => calls.push(['listener']),
      playSfx: (n, o) => { calls.push(['sfx', n, o]); return true; },
      playSelect: () => calls.push(['select']),
      playOrder: () => calls.push(['order']),
      canSpeak: () => canSpeak,
      now: () => clock,
      speak: (l) => { calls.push(['speak', l.key, l.voiceId]); return 0.8; },
      noteCombat: (w) => calls.push(['combat', w]),
      beginMatch: (m) => calls.push(['begin', m]),
      endMatch: () => calls.push(['end']),
      setSceneProbe: (fn) => calls.push(['probe', fn])
    };
    const dispose = createAudioEvents(gm, sound, { tilesetId: 'inverno' });
    const emit = (type, p) => { events.emit(type, p); events.flush(); };
    const only = (kind) => calls.filter(c => c[0] === kind);
    return { gm, sound, calls, dispose, emit, only, tick: (dt) => { clock += dt; } };
  }

  it('avisa a partida (facção do jogador local e tileset) e devolve tudo no dispose', () => {
    const t = setup({ faction: 'orc' });
    expect(t.only('begin')[0][1]).toEqual({ faction: 'orc', tilesetId: 'inverno' });
    expect(t.gm.soundManager).not.toBe('original'); // gancho do InputManager
    expect(typeof t.gm.soundManager.playSelect).toBe('function');
    t.dispose();
    expect(t.gm.soundManager).toBe('original');
    expect(t.only('end')).toHaveLength(1);
    t.emit(EVT.WORKER_CHOP, { pos: { x: 0, y: 0, z: 0 }, ownerId: 0 }); // ouvintes removidos
    expect(t.only('sfx')).toHaveLength(0);
  });

  it('efeitos do jogador local sempre soam; de outros só se a névoa deixa ver', () => {
    let vis = false;
    const t = setup({ visible: () => vis });
    const pos = { x: 4, y: 0, z: 4 };
    t.emit(EVT.WORKER_CHOP, { pos, ownerId: 0 });
    expect(t.only('sfx').map(c => c[1])).toEqual(['chop']);
    t.emit(EVT.WORKER_CHOP, { pos, ownerId: 1 });
    expect(t.only('sfx')).toHaveLength(1); // fora da visão: mudo
    vis = true;
    t.emit(EVT.WORKER_CHOP, { pos, ownerId: 1 });
    expect(t.only('sfx')).toHaveLength(2);
    const [, name, opts] = t.only('sfx')[1];
    expect(name).toBe('chop');
    expect(opts.priority).toBeLessThan(t.only('sfx')[0][2].priority); // trabalho alheio tem prioridade menor
    expect(opts.pos).toBe(pos);
  });

  it('marcos locais (alarme, unidade treinada) não são posicionais', () => {
    const t = setup();
    t.emit(EVT.UNDER_ATTACK, { ownerId: 0, pos: { x: 1, y: 0, z: 1 } });
    t.emit(EVT.UNIT_TRAINED, { ownerId: 0, pos: { x: 1, y: 0, z: 1 }, unitType: 'knight', unitId: 1 });
    const sfx = t.only('sfx');
    expect(sfx.map(c => c[1])).toEqual(['alarm', 'chime']);
    expect(sfx.every(c => c[2].pos === null)).toBe(true);
  });

  it('magia usa o tipo de VFX da habilidade para escolher a variante do som', () => {
    const t = setup();
    const id = Object.keys(ABILITIES).find(k => { const a = resolveAbility({}, k); return a && a.vfx && a.vfx.kind; });
    expect(id).toBeTruthy();
    t.emit(EVT.ABILITY_CAST, { unitId: 1, ownerId: 0, abilityId: id, pos: { x: 2, y: 0, z: 2 } });
    const [, name, opts] = t.only('sfx')[0];
    expect(name).toBe('cast');
    expect(opts.variant).toBe(resolveAbility({}, id).vfx.kind);
  });

  it('combate alimenta a música: seu dano pesa 1; alheio só visível e perto; longe/invisível = 0', () => {
    let vis = true;
    const t = setup({ visible: () => vis });
    t.emit(EVT.UNIT_DAMAGED, { unitId: 1, ownerId: 0, pos: { x: 100, y: 0, z: 0 }, amount: 5 });
    t.emit(EVT.UNIT_DAMAGED, { unitId: 2, ownerId: 1, pos: { x: 10, y: 0, z: 0 }, amount: 5 });
    t.emit(EVT.UNIT_DAMAGED, { unitId: 2, ownerId: 1, pos: { x: 900, y: 0, z: 0 }, amount: 5 }); // longe
    vis = false;
    t.emit(EVT.UNIT_DAMAGED, { unitId: 2, ownerId: 1, pos: { x: 10, y: 0, z: 0 }, amount: 5 }); // invisível
    t.emit(EVT.UNIT_DIED, { unitId: 3, ownerId: 0, pos: { x: 0, y: 0, z: 0 }, unitType: 'knight' });
    expect(t.only('combat').map(c => c[1])).toEqual([1, 0.5, 3]);
  });

  it('clicar numa unidade com voz fala (sem o clique); numa construção toca o clique', () => {
    const t = setup();
    t.gm.entitiesById.set(7, { id: 7, type: 'knight', ownerId: 0 });
    t.gm.entitiesById.set(8, { id: 8, type: 'castle', ownerId: 0, isConstructed: true });
    t.emit(EVT.SELECTED, { entityId: 7, ownerId: 0 });
    expect(t.only('speak')).toHaveLength(1);
    expect(t.only('speak')[0][1]).toMatch(/^h\.soldier\.select\./);
    expect(t.only('select')).toHaveLength(0);
    t.tick(1);
    t.emit(EVT.SELECTED, { entityId: 8, ownerId: 0 });
    expect(t.only('select')).toHaveLength(1);
    expect(t.only('speak')).toHaveLength(1);
  });

  it('ordem fala a unidade líder; ordens em rajada não viram metralhadora (sem fala nem clique)', () => {
    const t = setup();
    t.gm.selectedUnits = [{ id: 1, type: 'villager', ownerId: 0 }, { id: 2, type: 'hero_brann', ownerId: 0 }, { id: 3, type: 'knight', ownerId: 0 }];
    t.emit(EVT.ORDER_ISSUED, { ownerId: 0 });
    expect(t.only('speak')).toHaveLength(1);
    expect(t.only('speak')[0][1]).toMatch(/^h\.hero\.order\./); // o herói fala por todos
    t.tick(0.3);
    t.emit(EVT.ORDER_ISSUED, { ownerId: 0 });
    expect(t.only('speak')).toHaveLength(1);
    expect(t.only('order')).toHaveLength(0);
    t.tick(1.5);
    t.emit(EVT.ORDER_ISSUED, { ownerId: 0 });
    expect(t.only('speak')).toHaveLength(2);
  });

  it('seleção em grupo e ordens por tecla (gm.soundManager) também falam; sem voz toca o clique de antes', () => {
    const t = setup({ faction: 'orc' });
    t.gm.selectedUnits = [{ id: 5, type: 'grunt', ownerId: 0 }, { id: 6, type: 'peon', ownerId: 0 }];
    t.gm.soundManager.playSelect();
    expect(t.only('speak')[0][1]).toMatch(/^o\.soldier\.select\./);
    t.tick(2);
    t.gm.soundManager.playOrder();
    expect(t.only('speak')[1][1]).toMatch(/^o\.soldier\.order\./);
    t.gm.selectedUnits = [];
    t.gm.soundManager.playSelect(); // nada selecionado: clique
    expect(t.only('select')).toHaveLength(1);

    const mute = setup({ canSpeak: false });
    mute.gm.selectedUnits = [{ id: 5, type: 'knight', ownerId: 0 }];
    mute.gm.soundManager.playSelect();
    mute.gm.soundManager.playOrder();
    expect(mute.only('speak')).toHaveLength(0);
    expect(mute.only('select')).toHaveLength(1);
    expect(mute.only('order')).toHaveLength(1);
  });

  it('a unidade neutra compartilhada (petroleiro) fala com a voz da facção do dono', () => {
    const t = setup({ faction: 'orc' });
    t.gm.entitiesById.set(9, { id: 9, type: 'tanker', ownerId: 0 });
    t.emit(EVT.SELECTED, { entityId: 9, ownerId: 0 });
    expect(t.only('speak')[0][1]).toMatch(/^o\.crew\.select\./);
    expect(t.only('speak')[0][2]).toBe('o_crew');
  });
});
