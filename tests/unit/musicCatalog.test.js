import { describe, it, expect } from 'vitest';
import {
  MUSIC_CATALOG, MUSIC_SELECTION_KEY, getTrack, listTracks, isTrackEnabled, enabledIds, enabledForGroup, enabledVariants,
  normalizeSelection, serializeSelection, loadSelection, saveSelection
} from '../../src/audio/music/catalog.js';
import { TRACKS_BY_ID, TRACK_SETS, eventsForStep, trackLength, stepSeconds } from '../../src/audio/music/musicScores.js';
import { intensityFromGameTime, quantizeIntensity, INTENSITY_RAMP } from '../../src/audio/music/intensity.js';
import { MusicPlayer } from '../../src/audio/music/MusicPlayer.js';
import { AudioEngine } from '../../src/audio/AudioEngine.js';
import { createAudioRng } from '../../src/audio/audioConfig.js';
import { createFakeAudioContext } from './helpers/fakeAudio.js';

// Catálogo único de músicas + evolução pelo tempo de partida (intensidade 0..1).

const music = MUSIC_CATALOG.filter((e) => e.kind === 'music');

describe('catálogo: estrutura e coerência com as partituras', () => {
  it('ids únicos, campos obrigatórios e toda partitura está catalogada (e vice-versa)', () => {
    expect(new Set(MUSIC_CATALOG.map((e) => e.id)).size).toBe(MUSIC_CATALOG.length);
    expect(music.map((e) => e.id).sort()).toEqual(Object.keys(TRACKS_BY_ID).sort());
    for (const e of MUSIC_CATALOG) {
      expect(['title', 'peace', 'combat', 'victory', 'defeat'], e.id).toContain(e.category);
      expect(['human', 'orc', 'neutral'], e.id).toContain(e.faction);
      expect(typeof e.title, e.id).toBe('string');
      expect(e.title.length, e.id).toBeGreaterThan(2);
      expect(e.description.length, e.id).toBeGreaterThan(15);
      expect(typeof e.inGame, e.id).toBe('boolean');
      expect(typeof e.candidate, e.id).toBe('boolean');
      if (e.candidate) expect(e.inGame, `${e.id} candidata nasce desligada`).toBe(false);
    }
  });

  it('bpm, compasso e modo do catálogo vêm da partitura', () => {
    for (const e of music) {
      const t = TRACKS_BY_ID[e.id];
      expect(e.bpm, e.id).toBe(t.bpm);
      expect(e.meter, e.id).toBe(t.meter);
      expect(e.mode, e.id).toBe(t.mode);
      expect(e.family, e.id).toBe(t.family);
      expect(TRACK_SETS[e.family][e.variant], e.id).toBe(t);
      expect(e.category, e.id).toBe(t.state);
    }
  });

  it('as faixas atuais de combate saem do jogo por padrão (continuam no catálogo); as de paz entram', () => {
    for (const e of music.filter((x) => x.category === 'combat' && !x.candidate)) expect(e.inGame, e.id).toBe(false);
    for (const e of music.filter((x) => x.category === 'peace' && !x.candidate)) expect(e.inGame, e.id).toBe(true);
    expect(getTrack('orc_combat_0').title).toBeTruthy();
    expect(getTrack('nao_existe')).toBeUndefined();
    expect(listTracks({ family: 'orc_peace', candidate: false })).toHaveLength(3);
  });
});

describe('seleção: isTrackEnabled, reserva e armazenamento', () => {
  it('sem override vale inGame; com override vale a seleção', () => {
    expect(isTrackEnabled('human_peace_0')).toBe(true);
    expect(isTrackEnabled('human_peace_0', null)).toBe(true);
    expect(isTrackEnabled('human_combat_0')).toBe(false);
    expect(isTrackEnabled('nao_existe')).toBe(false);
    // lista exata (array, Set, objeto {enabled}, texto JSON)
    for (const sel of [['human_combat_0'], new Set(['human_combat_0']), { enabled: ['human_combat_0'] }, JSON.stringify({ version: 1, enabled: ['human_combat_0'] })]) {
      expect(isTrackEnabled('human_combat_0', sel)).toBe(true);
      expect(isTrackEnabled('human_peace_0', sel)).toBe(false); // fora da lista exata
    }
    // mapa parcial: o que não aparece segue o padrão
    expect(isTrackEnabled('human_peace_0', { human_peace_0: false })).toBe(false);
    expect(isTrackEnabled('human_peace_1', { human_peace_0: false })).toBe(true);
    expect(isTrackEnabled('human_combat_1', { human_combat_1: true })).toBe(true);
    // lixo = padrões
    expect(normalizeSelection('{quebrado')).toBeNull();
    expect(isTrackEnabled('human_peace_0', '{quebrado')).toBe(true);
    expect(enabledIds()).toContain('human_peace_2');
    expect(enabledIds(['orc_peace_1'])).toEqual(['orc_peace_1']);
  });

  it('categoria sem faixas habilitadas cai nas ATUAIS (não candidatas)', () => {
    const none = { enabled: [] };
    const fam = enabledForGroup('combat', 'orc', none);
    expect(fam.length).toBeGreaterThanOrEqual(3);
    expect(fam.every((e) => !e.candidate && e.faction === 'orc' && e.category === 'combat')).toBe(true);
    expect(enabledVariants('orc_combat', none)).toEqual([0, 1, 2]);
    expect(enabledVariants('orc_combat')).toEqual([0, 1, 2]); // padrão: nenhuma de combate ligada -> reserva
    expect(enabledVariants('human_peace', ['human_peace_1'])).toEqual([1]);
    expect(enabledVariants('nao_existe')).toEqual([]);
  });

  it('armazenamento: grava/lê JSON {version, enabled}, ignora erros de storage', () => {
    const mem = new Map();
    const storage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) };
    expect(loadSelection(storage)).toBeNull();
    expect(saveSelection(storage, ['orc_peace_0', 'x_invalida'])).toBe(true);
    expect(JSON.parse(mem.get(MUSIC_SELECTION_KEY))).toEqual({ version: 1, enabled: ['orc_peace_0'] });
    const sel = loadSelection(storage);
    expect(sel.get('orc_peace_0')).toBe(true);
    expect(sel.get('orc_peace_1')).toBe(false);
    expect(serializeSelection(new Set(['orc_peace_1']))).toBe('{"version":1,"enabled":["orc_peace_1"]}');
    expect(saveSelection(storage, null)).toBe(true);
    expect(loadSelection(storage)).toBeNull();
    const broken = { getItem() { throw new Error('bloqueado'); }, setItem() { throw new Error('bloqueado'); }, removeItem() { throw new Error('x'); } };
    expect(loadSelection(broken)).toBeNull();
    expect(saveSelection(broken, ['orc_peace_0'])).toBe(false);
    expect(saveSelection(null, [])).toBe(false);
  });
});

describe('intensidade: tempo de partida -> 0..1', () => {
  it('curva suave, não decrescente, 0 no início e 1 no fim', () => {
    expect(intensityFromGameTime(0)).toBe(0);
    expect(intensityFromGameTime(-5)).toBe(0);
    expect(intensityFromGameTime(NaN)).toBe(0);
    expect(intensityFromGameTime(INTENSITY_RAMP.startSeconds)).toBe(0);
    expect(intensityFromGameTime(INTENSITY_RAMP.fullSeconds)).toBe(1);
    expect(intensityFromGameTime(1e6)).toBe(1);
    let prev = -1;
    for (let s = 0; s <= 1500; s += 15) {
      const v = intensityFromGameTime(s);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
    expect(quantizeIntensity(0.51)).toBe(0.5);
    expect(quantizeIntensity(2)).toBe(1);
    expect(intensityFromGameTime(300)).toBe(intensityFromGameTime(300)); // determinística
  });

  const peace = Object.values(TRACKS_BY_ID).filter((t) => t.state === 'peace');
  const density = (t, x) => {
    let n = 0;
    for (let s = 0; s < trackLength(t); s++) n += eventsForStep(t, s, { seed: 3, intensity: x }).length;
    return n;
  };

  it('toda faixa de paz fica mais densa (nunca menos) de 0 a 1 e mais rápida em 2–6 %', () => {
    expect(peace.length).toBeGreaterThanOrEqual(6);
    for (const t of peace) {
      let prev = -1;
      for (const x of [0, 0.125, 0.25, 0.5, 0.75, 0.9, 1]) {
        const d = density(t, x);
        expect(d, `${t.id} @${x}`).toBeGreaterThanOrEqual(prev);
        prev = d;
      }
      expect(density(t, 1), t.id).toBeGreaterThan(density(t, 0) * 1.25);
      const faster = stepSeconds(t, 0) / stepSeconds(t, 1);
      expect(faster - 1, `${t.id} andamento`).toBeGreaterThanOrEqual(0.02);
      expect(faster - 1, `${t.id} andamento`).toBeLessThanOrEqual(0.06 + 1e-9);
    }
  });

  it('intensidade 0 (padrão) soa igual a não passar intensidade; o laço não quebra (camadas fixas repetem a cada volta)', () => {
    for (const t of peace) {
      const len = trackLength(t);
      const leadInst = t.layers.find((l) => l.kind === 'melody' || l.kind === 'line')?.inst;
      const fixed = (e) => e.filter((x) => x.inst !== leadInst);
      for (let s = 0; s < len; s += 7) {
        expect(eventsForStep(t, s, { seed: 2, intensity: 0 })).toEqual(eventsForStep(t, s, { seed: 2 }));
        expect(fixed(eventsForStep(t, s, { seed: 2, intensity: 0.8 }))).toEqual(fixed(eventsForStep(t, s + len, { seed: 2, intensity: 0.8 })));
      }
    }
  });

  it('registro sobe: a melodia fica mais aguda em intensidade alta', () => {
    for (const t of peace) {
      const lead = t.layers.find((l) => (l.kind === 'melody' || l.kind === 'line') && l.lift);
      expect(lead, `${t.id} tem camada com registro que sobe`).toBeTruthy();
      const avg = (x) => {
        const m = [];
        for (let s = 0; s < trackLength(t); s++) for (const e of eventsForStep(t, s, { seed: 3, intensity: x })) if (e.inst === lead.inst && e.midi > 0) m.push(e.midi);
        return m.reduce((a, b) => a + b, 0) / m.length;
      };
      expect(avg(1)).toBeGreaterThan(avg(0) + 6);
    }
  });
});

describe('player e motor: intensidade e seleção', () => {
  const mkPlayer = () => {
    const ctx = createFakeAudioContext();
    const out = ctx.createGain();
    const noise = ctx.createBuffer(1, 4410, 44100);
    return { ctx, mp: new MusicPlayer({ ctx, out, noise, rng: createAudioRng(1) }) };
  };

  it('setIntensity acelera o passo e progress() acompanha a volta', () => {
    const { ctx, mp } = mkPlayer();
    mp.play('human_peace', { variant: 0 });
    mp.tick();
    const base = mp.runs[0].stepSec;
    mp.setIntensity(1);
    ctx.advance(0.2);
    mp.tick();
    expect(mp.runs[0].stepSec).toBeLessThan(base);
    expect(mp.intensity).toBe(1);
    const p = mp.progress();
    expect(p.dur).toBeGreaterThan(10);
    expect(p.pos).toBeGreaterThanOrEqual(0);
    expect(p.pos).toBeLessThanOrEqual(p.dur);
    mp.setIntensity(NaN);
    expect(mp.intensity).toBe(0);
  });

  it('o motor passa o tempo de partida à música e honra a seleção do jogador', () => {
    const ctx = createFakeAudioContext();
    const eng = new AudioEngine({ ctx, level: 'med', seed: 9, timers: null });
    eng.setMusicSelection(['human_peace_1']);
    eng.beginMatch({ faction: 'human', tilesetId: 'verdejante' });
    expect(eng.music.currentTrackId).toBe('human_peace_1');
    eng.setMatchTime(0);
    expect(eng.music.intensity).toBe(0);
    eng.setMatchTime(1200);
    expect(eng.music.intensity).toBe(1);
    // seleção que desliga tudo na facção -> reserva nas atuais
    const eng2 = new AudioEngine({ ctx: createFakeAudioContext(), level: 'med', seed: 9, timers: null });
    eng2.setMusicSelection({ enabled: [] });
    eng2.beginMatch({ faction: 'orc', tilesetId: 'inverno' });
    expect(eng2.music.currentId).toBe('orc_peace');
    expect(TRACK_SETS.orc_peace.slice(0, 3).map((t) => t.id)).toContain(eng2.music.currentTrackId);
  });
});
