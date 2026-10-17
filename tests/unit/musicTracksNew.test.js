import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  TRACK_SETS, TRACKS_BY_ID, eventsForStep, trackLength, stepSeconds, loopSeconds, METERS, CHORD_TONES
} from '../../src/audio/music/musicScores.js';
import { MUSIC_CATALOG, getTrack, listTracks } from '../../src/audio/music/catalog.js';
import { MusicPlayer } from '../../src/audio/music/MusicPlayer.js';
import { playInstrument } from '../../src/audio/music/instruments.js';
import { SFX } from '../../src/audio/sfxRecipes.js';
import { createAudioRng } from '../../src/audio/audioConfig.js';
import { createFakeAudioContext } from './helpers/fakeAudio.js';

// Catálogo completo: ≥ 8 faixas por família, escala/modo, compasso/andamento, duração, caráter e qualidade musical.

const FAMILIES = ['human_peace', 'human_combat', 'orc_peace', 'orc_combat'];
const music = MUSIC_CATALOG.filter((e) => e.kind === 'music');
const mod12 = (n) => ((n % 12) + 12) % 12;
const scorePcs = (t) => new Set(t.scale.map((s) => mod12(t.key + s)));

describe('catálogo: quantidade, candidatas e padrões', () => {
  it('≥ 8 faixas por família; 3 clássicas + ≥ 5 novas de paz e ≥ 6 novas de combate', () => {
    for (const fam of FAMILIES) {
      expect(TRACK_SETS[fam].length, fam).toBeGreaterThanOrEqual(8);
      const entries = listTracks({ family: fam });
      const fresh = entries.filter((e) => e.candidate);
      expect(entries.filter((e) => !e.candidate), fam).toHaveLength(3);
      expect(fresh.length, `${fam} novas`).toBeGreaterThanOrEqual(fam.endsWith('combat') ? 6 : 5);
      for (const e of fresh) {
        expect(e.inGame, `${e.id} nasce desligada`).toBe(false);
        expect(e.variant, e.id).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('abertura (1 + 2 candidatas), vitória e derrota por facção estão no catálogo', () => {
    expect(listTracks({ category: 'title' })).toHaveLength(3);
    for (const f of ['human', 'orc']) {
      for (const c of ['victory', 'defeat']) {
        const e = listTracks({ category: c, faction: f });
        expect(e, `${c} ${f}`).toHaveLength(1);
        expect(e[0].kind).toBe('sfx');
        expect(SFX[e[0].sfx], `receita ${e[0].sfx}`).toBeTruthy();
        expect(SFX[e[0].sfx].dur).toBeGreaterThan(1);
      }
    }
    expect(getTrack('victory_human').sfx).toBe('victoryFanfareHuman');
    expect(getTrack('victory_orc').sfx).toBe('victoryFanfareOrc');
  });

  it('o dono não gostou do combate atual: nenhuma faixa de combate liga por padrão (o jogo usa a reserva clássica)', () => {
    expect(music.filter((e) => e.category === 'combat' && e.inGame)).toHaveLength(0);
    expect(music.filter((e) => e.category === 'peace' && e.inGame)).toHaveLength(6);
  });
});

describe('cada faixa: escala/modo, compasso, andamento e duração', () => {
  it('compasso e andamento coerentes com o declarado', () => {
    for (const e of music) {
      const t = TRACKS_BY_ID[e.id];
      expect(METERS[t.meter], e.id).toBeTruthy();
      expect(t.stepsPerBar, e.id).toBe(METERS[t.meter]);
      expect(e.meter, e.id).toBe(t.meter);
      expect(Number.isInteger(t.bpm) && t.bpm >= 60 && t.bpm <= 160, `${e.id} bpm ${t.bpm}`).toBe(true);
      expect(stepSeconds(t)).toBeCloseTo(60 / (t.bpm * 4), 9);
      expect(trackLength(t)).toBe(t.stepsPerBar * t.bars);
      expect(t.prog).toHaveLength(t.bars);
    }
    // as novas exploram compassos irregulares
    const novel = new Set(music.filter((e) => e.candidate).map((e) => e.meter));
    for (const m of ['3/4', '6/8', '5/4', '7/8']) expect(novel.has(m), m).toBe(true);
  });

  it('duração da volta: ≥ 13 s (clássicas) e ≥ 20 s (novas); abertura ≥ 90 s', () => {
    for (const e of music) {
      const t = TRACKS_BY_ID[e.id];
      const min = e.category === 'title' ? 90 : e.candidate ? 20 : 13;
      expect(loopSeconds(t), `${e.id} ${loopSeconds(t).toFixed(1)} s`).toBeGreaterThanOrEqual(min);
      expect(e.seconds, e.id).toBe(Math.round(loopSeconds(t)));
    }
  });

  it('as raízes dos acordes e todas as notas das linhas escritas estão na escala do modo', () => {
    for (const e of music) {
      const t = TRACKS_BY_ID[e.id];
      const pcs = scorePcs(t);
      for (const [root] of t.prog) expect(pcs.has(mod12(root)), `${e.id} acorde ${root}`).toBe(true);
      const lines = t.layers.map((l, i) => [l, i]).filter(([l]) => l.kind === 'line');
      for (const [, li] of lines) {
        const only = { ...t, layers: t.layers.map((x, i) => (i === li ? x : { kind: 'none' })) };
        for (let s = 0; s < trackLength(t); s++) for (const ev of eventsForStep(only, s)) expect(pcs.has(mod12(ev.midi)), `${e.id} passo ${s} nota ${ev.midi}`).toBe(true);
      }
    }
  });

  it('demais instrumentos: escala, tons do acorde do compasso (ex.: dominante maior) ou cromatismo ameaçador dos Clãs', () => {
    for (const e of music) {
      const t = TRACKS_BY_ID[e.id];
      const pcs = scorePcs(t);
      for (let s = 0; s < trackLength(t); s++) {
        const bar = Math.floor(s / t.stepsPerBar);
        const [root, type] = t.prog[bar];
        const chord = new Set(CHORD_TONES[type].map((x) => mod12(root + x)));
        for (const ev of eventsForStep(t, s, { intensity: 1 })) {
          if (!ev.midi) continue;
          const pc = mod12(ev.midi);
          if (pcs.has(pc) || chord.has(pc)) continue;
          expect(t.faction === 'orc' && [1, 6].includes(mod12(pc - root)), `${e.id} ${ev.inst} ${ev.midi} no passo ${s}`).toBe(true);
        }
      }
    }
  });

  it('nunca estoura o orçamento de notas por passo (≤ 16 nas novas), nem com a intensidade no máximo', () => {
    for (const e of music) {
      const t = TRACKS_BY_ID[e.id];
      let worst = 0;
      for (const intensity of [0, 1]) for (let s = 0; s < trackLength(t); s++) worst = Math.max(worst, eventsForStep(t, s, { intensity }).length);
      expect(worst, e.id).toBeLessThanOrEqual(e.candidate || e.category === 'title' ? 16 : 18); // (as clássicas + evolução chegam a 17)
    }
  });
});

describe('caráter: identidades distintas, melodias escritas e musicais', () => {
  it('as variações de uma família têm identidade própria (andamento/tonalidade/harmonia/notas)', () => {
    for (const fam of FAMILIES) {
      const set = TRACK_SETS[fam];
      const sigs = set.map((t) => `${t.bpm}|${t.meter}|${t.mode}|${t.key}|${t.prog.map((c) => c.join(':')).join(',')}`);
      expect(new Set(sigs).size, fam).toBe(set.length);
      const dumps = set.map((t) => JSON.stringify(Array.from({ length: Math.min(trackLength(t), 320) }, (_, s) => eventsForStep(t, s, { seed: 7 }))));
      expect(new Set(dumps).size, fam).toBe(set.length);
      // pelo menos 5 "assinaturas de timbre" diferentes (conjunto de instrumentos) por família
      const timbres = new Set(set.map((t) => [...new Set(t.layers.map((l) => l.inst))].sort().join(',')));
      expect(timbres.size, `${fam} timbres`).toBeGreaterThanOrEqual(5);
    }
  });

  it('as novas faixas usam melodias ESCRITAS (nada de notas aleatórias) e todas têm Math.random banido nas partituras', () => {
    for (const e of music.filter((x) => x.candidate || x.category === 'title')) {
      const t = TRACKS_BY_ID[e.id];
      expect(t.layers.some((l) => l.kind === 'line'), `${e.id} tem linha escrita`).toBe(true);
      expect(t.layers.some((l) => l.kind === 'melody'), `${e.id} sem melodia gerada`).toBe(false);
    }
    const dir = join(dirname(fileURLToPath(import.meta.url)), '../../src/audio/music');
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.js'))) {
      const code = readFileSync(join(dir, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      expect(code, f).not.toMatch(/Math\.random|Date\.now|performance\.now/);
    }
  });

  it('melodia reconhecível: tempos fortes em tons do acorde, saltos raros, motivo/ritmo que se repete e pouso no acorde final', () => {
    for (const e of music.filter((x) => x.candidate || x.category === 'title')) {
      const t = TRACKS_BY_ID[e.id];
      t.layers.forEach((layer, li) => {
        if (layer.kind !== 'line') return;
        const only = { ...t, layers: t.layers.map((x, i) => (i === li ? x : { kind: 'none' })) };
        const notes = [];
        for (let s = 0; s < trackLength(t); s++) for (const ev of eventsForStep(only, s)) notes.push({ s, midi: ev.midi });
        if (notes.length < 8) return;
        // tempos fortes (início de tempo) em tons do acorde
        let strong = 0;
        let ok = 0;
        for (const n of notes) {
          if (n.s % 4 !== 0) continue;
          strong++;
          const [root, type] = t.prog[Math.floor(n.s / t.stepsPerBar)];
          if (CHORD_TONES[type].map((x) => mod12(root + x)).includes(mod12(n.midi))) ok++;
        }
        expect(ok / Math.max(1, strong), `${e.id}/${layer.inst} tons do acorde nos tempos fortes`).toBeGreaterThanOrEqual(0.85);
        // saltos grandes (> 9 semitons) são raros
        let leaps = 0;
        for (let i = 1; i < notes.length; i++) if (Math.abs(notes[i].midi - notes[i - 1].midi) > 9) leaps++;
        expect(leaps / notes.length, `${e.id}/${layer.inst} saltos`).toBeLessThan(0.1);
        // ritmo repetido: há compassos com o mesmo desenho rítmico (frase/ostinato reconhecível)
        const perBar = new Map();
        for (const n of notes) {
          const bar = Math.floor(n.s / t.stepsPerBar);
          if (!perBar.has(bar)) perBar.set(bar, []);
          perBar.get(bar).push(n.s % t.stepsPerBar);
        }
        const shapes = [...perBar.values()].map((a) => a.join(','));
        expect(new Set(shapes).size, `${e.id}/${layer.inst} ritmos`).toBeLessThan(shapes.length);
        // a última nota da volta pousa em tom do último acorde
        const last = notes[notes.length - 1];
        const [root, type] = t.prog[Math.floor(last.s / t.stepsPerBar)];
        expect(CHORD_TONES[type].map((x) => mod12(root + x)).includes(mod12(last.midi)), `${e.id}/${layer.inst} pouso`).toBe(true);
      });
    }
  });

  it('combate é mais denso que a paz da mesma facção (percussão e metais), e a paz começa calma', () => {
    const avg = (t, x = 0) => {
      let n = 0;
      for (let s = 0; s < trackLength(t); s++) n += eventsForStep(t, s, { intensity: x }).length;
      return n / trackLength(t);
    };
    for (const f of ['human', 'orc']) {
      const peace = TRACK_SETS[`${f}_peace`].reduce((a, t) => a + avg(t), 0) / TRACK_SETS[`${f}_peace`].length;
      const combat = TRACK_SETS[`${f}_combat`].reduce((a, t) => a + avg(t), 0) / TRACK_SETS[`${f}_combat`].length;
      expect(combat, f).toBeGreaterThan(peace);
    }
    // a paz a 100 % de intensidade se aproxima do ritmo do combate (urgência)
    const p = TRACK_SETS.human_peace[3];
    expect(avg(p, 1)).toBeGreaterThan(avg(p, 0) * 1.25);
  });
});

describe('execução: instrumentos e player com TODAS as faixas', () => {
  it('todo instrumento usado em qualquer faixa existe, agenda nós e se desfaz', () => {
    const used = new Set();
    for (const t of Object.values(TRACKS_BY_ID)) for (const l of t.layers) used.add(l.inst);
    expect(used.size).toBeGreaterThanOrEqual(25);
    for (const inst of used) {
      const ctx = createFakeAudioContext();
      const rng = createAudioRng(1);
      const noise = ctx.createBuffer(1, 4410, 44100);
      const out = ctx.createGain();
      const before = ctx.nodes.length;
      expect(() => playInstrument(ctx, out, noise, inst, 52, 0.1, 0.5, 0.8, rng), inst).not.toThrow();
      expect(ctx.nodes.length, `${inst} criou nós`).toBeGreaterThan(before);
      for (const n of ctx.nodes.filter((x) => x.started !== undefined)) if (n.started) expect(n.stopped, `${inst}: fonte sem stop`).toBe(true);
    }
  });

  it('o MusicPlayer toca cada faixa em ticks de 150 ms respeitando o teto de notas por tick', () => {
    for (const e of music) {
      const t = TRACKS_BY_ID[e.id];
      const ctx = createFakeAudioContext();
      const mp = new MusicPlayer({ ctx, out: ctx.createGain(), noise: ctx.createBuffer(1, 4410, 44100), rng: createAudioRng(2) });
      expect(mp.playTrack(t)).toBe(true);
      expect(mp.currentTrackId).toBe(e.id);
      mp.setIntensity(e.category === 'peace' ? 1 : 0);
      let worst = 0;
      for (let k = 0; k < 40; k++) {
        const before = mp.stats.notes;
        ctx.advance(0.15);
        mp.tick();
        worst = Math.max(worst, mp.stats.notes - before);
      }
      expect(mp.stats.notes, e.id).toBeGreaterThan(0);
      expect(worst, e.id).toBeLessThanOrEqual(80 + 16);
      const p = mp.progress();
      expect(p.dur, e.id).toBeCloseTo(loopSeconds(t) / (e.category === 'peace' ? 1 + t.tempoGain : 1), 0);
    }
  });
});
