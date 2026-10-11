import { describe, it, expect } from 'vitest';
import {
  TRACK_SETS, TRACKS_BY_ID, MODES, MINOR_MODES, eventsForStep, trackLength, loopSeconds
} from '../../src/audio/music/musicScores.js';
import { getTrack, enabledVariants } from '../../src/audio/music/catalog.js';
import { AudioEngine } from '../../src/audio/AudioEngine.js';
import { SoundManager } from '../../src/core/SoundManager.js';
import { createFakeAudioContext, createFakeAudioContextClass } from './helpers/fakeAudio.js';

// Tema de abertura (tela inicial): "Marcha da Tempestade" + 2 candidatas.

const titles = TRACK_SETS.title;
const main = titles[0];
const barEvents = (t, bar, opts = {}) => {
  const out = [];
  for (let s = bar * t.stepsPerBar; s < (bar + 1) * t.stepsPerBar; s++) out.push(...eventsForStep(t, s, { seed: 1, ...opts }));
  return out;
};
const PERC = new Set(['snare', 'kick', 'tom', 'taiko', 'cymbal', 'timpani', 'gong']);

describe('abertura: estrutura', () => {
  it('3 temas na família title (neutra); o 0 é o do jogo e os outros são candidatas', () => {
    expect(titles).toHaveLength(3);
    expect(titles.map((t) => t.id)).toEqual(['title_0', 'title_1', 'title_2']);
    for (const t of titles) {
      expect(t.faction).toBe('neutral');
      expect(t.state).toBe('title');
      expect(TRACKS_BY_ID[t.id]).toBe(t);
    }
    expect(getTrack('title_0')).toMatchObject({ category: 'title', faction: 'neutral', inGame: true, candidate: false });
    expect(getTrack('title_1')).toMatchObject({ inGame: false, candidate: true });
    expect(getTrack('title_2')).toMatchObject({ inGame: false, candidate: true });
    expect(enabledVariants('title')).toEqual([0]);
    expect(enabledVariants('title', { enabled: ['title_1'] })).toEqual([1]);
  });

  it('o tema do jogo tem ≥ 90 s, 4/4, modo menor (3ª menor) e nenhuma aceleração por intensidade', () => {
    expect(loopSeconds(main)).toBeGreaterThanOrEqual(90);
    expect(main.meter).toBe('4/4');
    expect(MINOR_MODES).toContain(main.mode);
    expect(MODES[main.mode][2]).toBe(3);
    expect(main.tempoGain).toBe(0);
    for (const t of titles) {
      expect(loopSeconds(t), t.id).toBeGreaterThanOrEqual(90);
      expect(MODES[t.mode][2], `${t.id} é menor`).toBe(3);
      expect(MINOR_MODES, t.id).toContain(t.mode);
    }
  });

  it('as candidatas são distintas entre si: andamento, compasso, tonalidade e notas', () => {
    expect(new Set(titles.map((t) => `${t.bpm}|${t.meter}|${t.key}|${t.mode}`)).size).toBe(3);
    const dump = (t) => JSON.stringify(Array.from({ length: 256 }, (_, s) => eventsForStep(t, s)));
    expect(new Set(titles.map(dump)).size).toBe(3);
    expect(titles[2].meter).toBe('5/4');
    expect(titles[2].stepsPerBar).toBe(20);
  });

  it('sem estouro de notas por passo (orçamento de CPU do player)', () => {
    for (const t of titles) {
      let worst = 0;
      for (let s = 0; s < trackLength(t); s++) worst = Math.max(worst, eventsForStep(t, s).length);
      expect(worst, t.id).toBeLessThanOrEqual(16);
    }
  });
});

describe('abertura: caráter e dramaturgia ("Marcha da Tempestade")', () => {
  it('abre com percussão militar (caixas e tambores) e sem instrumentos melódicos nos primeiros compassos', () => {
    for (let bar = 0; bar < 2; bar++) {
      const insts = new Set(barEvents(main, bar).map((e) => e.inst));
      expect(insts.has('snare')).toBe(true);
      expect(insts.has('timpani') || insts.has('kick')).toBe(true);
      for (const i of insts) expect(PERC.has(i), `compasso ${bar}: ${i}`).toBe(true);
    }
  });

  it('contraste: metais graves da Horda (trombones/trompas) e cordas trágicas (violinos/violoncelos)', () => {
    const insts = (a, b) => new Set(Array.from({ length: b - a + 1 }, (_, k) => barEvents(main, a + k)).flat().map((e) => e.inst));
    const horde = insts(4, 11);
    expect(horde.has('trombone') && horde.has('horn')).toBe(true);
    expect(horde.has('violin')).toBe(false);
    const humans = insts(16, 23);
    expect(humans.has('violin') && humans.has('cello')).toBe(true);
    expect(humans.has('trombone')).toBe(false);
    // as cordas sobem de volume (crescendo) no lamento
    const violinVel = (bar) => Math.max(...barEvents(main, bar).filter((e) => e.inst === 'violin').map((e) => e.vel));
    expect(violinVel(23)).toBeGreaterThan(violinVel(16));
  });

  it('alterna suspense quase silencioso e explosões (tutti + tímpanos)', () => {
    const density = (bar) => barEvents(main, bar).length;
    const suspense = [12, 13, 14].map(density);
    const boom = [24, 25, 26, 27].map(density);
    expect(Math.max(...suspense)).toBeLessThan(Math.min(...boom) / 2);
    const tutti = new Set(barEvents(main, 24).map((e) => e.inst));
    for (const need of ['timpani', 'cymbal', 'gong', 'trombone', 'trumpet', 'violin', 'snare']) expect(tutti.has(need), need).toBe(true);
    // o suspense não tem metais nem caixa
    const quiet = new Set([12, 13, 14].flatMap((b) => barEvents(main, b)).map((e) => e.inst));
    expect(quiet.has('trombone') || quiet.has('snare') || quiet.has('cymbal')).toBe(false);
  });

  it('final em acorde suspenso (sus4) sobre a tônica, com a 3ª ausente; desemboca limpo na marcha do início', () => {
    const last = main.bars - 1;
    expect(main.prog[last][1]).toBe('sus4');
    const pcs = new Set(barEvents(main, last).filter((e) => e.midi > 0 && e.inst !== 'gong' && e.inst !== 'timpani').map((e) => ((e.midi - main.key) % 12 + 12) % 12));
    expect([...pcs].every((pc) => [0, 5, 7].includes(pc))).toBe(true); // tônica, 4ª e 5ª
    expect(pcs.has(3) || pcs.has(4)).toBe(false);
    // o último compasso é muito mais esparso que o clímax e o primeiro compasso recomeça só com percussão
    expect(barEvents(main, last).length).toBeLessThan(barEvents(main, last - 1).length);
    expect(eventsForStep(main, 0).some((e) => e.inst === 'snare' || e.inst === 'gong')).toBe(true);
  });

  it('sempre na escala do modo (linhas escritas), com acordes diatônicos e tônica d', () => {
    for (const t of titles) {
      const only = { ...t, layers: t.layers.filter((l) => l.kind === 'line') };
      for (let s = 0; s < trackLength(t); s++) {
        for (const e of eventsForStep(only, s)) expect(t.scale.includes(((e.midi - t.key) % 12 + 12) % 12), `${t.id} passo ${s} nota ${e.midi}`).toBe(true);
      }
    }
    expect(main.key % 12).toBe(2); // ré
  });
});

describe('abertura ligada ao motor: menu -> partida -> menu', () => {
  const mk = (extra = {}) => {
    const ctx = createFakeAudioContext();
    const eng = new AudioEngine({ ctx, level: 'med', seed: 5, timers: null, ...extra });
    return { ctx, eng };
  };

  it('sem partida toca o tema de abertura; a partida troca (crossfade) para a música da facção; sair volta ao tema', () => {
    const { ctx, eng } = mk();
    expect(eng.music.currentId).toBe('title');
    expect(eng.music.currentTrackId).toBe('title_0');
    ctx.advance(0.3);
    eng.tick();
    expect(eng.music.stats.notes).toBeGreaterThan(0);
    eng.beginMatch({ faction: 'orc', tilesetId: 'inverno' });
    expect(eng.music.currentId).toBe('orc_peace');
    expect(eng.music.runs.length).toBeGreaterThanOrEqual(2); // o tema sai com fade
    const fading = eng.music.runs[0];
    expect(fading.killAt).not.toBe(Infinity);
    eng.endMatch();
    expect(eng.music.currentId).toBe('title');
    expect(eng.music.currentTrackId).toBe('title_0');
  });

  it('respeita o volume de música 0, a preferência desligada e o nível off', () => {
    const a = mk({ volumes: { music: 0 } });
    expect(a.eng.music.playing).toBe(false);
    a.eng.setVolumes({ music: 0.4 });
    expect(a.eng.music.currentId).toBe('title');
    a.eng.setMusicOn(false);
    expect(a.eng.music.playing).toBe(false);
    const off = mk({ level: 'off' });
    expect(off.eng.music.playing).toBe(false);
  });

  it('SoundManager: nada é criado antes do gesto; no gesto o tema de abertura começa; ?audio=0 nunca cria o contexto', () => {
    const made = createFakeAudioContextClass();
    const sm = new SoundManager({ level: 'med', env: { AudioContext: made, timers: null, log: () => {}, storage: null } });
    expect(sm.ctx).toBeNull();
    sm.resume();
    expect(sm.engine.music.currentId).toBe('title');
    const off = new SoundManager({ level: 'off', env: { AudioContext: made, timers: null, log: () => {}, storage: null } });
    off.resume();
    expect(off.engine).toBeNull();
  });

  it('a seleção do jogador (localStorage) vale também para o tema de abertura', () => {
    const made = createFakeAudioContextClass();
    const storage = { getItem: () => JSON.stringify({ version: 1, enabled: ['title_2'] }), setItem() {}, removeItem() {} };
    const sm = new SoundManager({ level: 'med', env: { AudioContext: made, timers: null, log: () => {}, storage } });
    sm.resume();
    expect(sm.engine.music.currentTrackId).toBe('title_2');
    sm.beginMatch({ faction: 'human', tilesetId: 'verdejante' });
    sm.endMatch();
    expect(sm.engine.music.currentTrackId).toBe('title_2');
  });
});
