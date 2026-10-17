import { describe, it, expect } from 'vitest';
import {
  TRACK_SETS as ALL_SETS, TRACKS, VARIANTS_PER_FAMILY, MODES, STEPS_PER_BAR, STEPS_PER_BEAT,
  eventsForStep, trackLength, stepSeconds, trackFor
} from '../../src/audio/music/musicScores.js';
import { pickVariant, trackIdFor } from '../../src/audio/musicDirector.js';
import { AudioEngine } from '../../src/audio/AudioEngine.js';
import { playInstrument } from '../../src/audio/music/instruments.js';
import { createAudioRng } from '../../src/audio/audioConfig.js';
import { createFakeAudioContext } from './helpers/fakeAudio.js';

// Música (commit 3): marcha animada, militar e urgente; tema por facção; ≥ 3 variações por faixa; geração incremental.

// Este arquivo testa as faixas CLÁSSICAS (as 3 primeiras variações de cada família de paz/combate). As candidatas novas e os
// temas de abertura têm os testes em musicTracksNew.test.js e musicTitle.test.js.
const TRACK_FAMILIES = ['human_combat', 'human_peace', 'orc_combat', 'orc_peace'];
const TRACK_SETS = Object.fromEntries(TRACK_FAMILIES.map((f) => [f, ALL_SETS[f].slice(0, VARIANTS_PER_FAMILY)]));
const allTracks = Object.values(TRACK_SETS).flat();
const TRACK_IDS = allTracks.map((t) => t.id);
const pcInScale = (track, midi) => track.scale.includes((((midi - track.key) % 12) + 12) % 12);
const dump = (track, loops = 2, seed = 5) => JSON.stringify(Array.from({ length: trackLength(track) * loops }, (_, s) => eventsForStep(track, s, { seed })));

describe('estrutura: 4 famílias × 3 variações, 4/4 de 16 passos, 8 compassos', () => {
  it('duas faixas por facção (paz e combate), cada uma com pelo menos 3 variações', () => {
    expect(Object.keys(ALL_SETS).sort()).toEqual(['human_combat', 'human_peace', 'orc_combat', 'orc_peace', 'title']);
    expect(VARIANTS_PER_FAMILY).toBeGreaterThanOrEqual(3);
    for (const fam of TRACK_FAMILIES) expect(TRACK_SETS[fam].length, fam).toBeGreaterThanOrEqual(3);
    expect(new Set(TRACK_IDS).size).toBe(TRACK_IDS.length);
    expect(TRACK_IDS).toHaveLength(12);
    expect(TRACKS.orc_combat).toBe(ALL_SETS.orc_combat[0]);
    expect(trackFor('orc_combat', 3 * ALL_SETS.orc_combat.length + 1)).toBe(ALL_SETS.orc_combat[1]); // circular
    expect(trackFor('nao_existe')).toBeUndefined();
    for (const t of allTracks) {
      expect(t.stepsPerBar).toBe(STEPS_PER_BAR);
      expect(STEPS_PER_BAR / STEPS_PER_BEAT).toBe(4); // 4/4
      expect(trackLength(t)).toBe(STEPS_PER_BAR * 8);
      expect(t.prog).toHaveLength(t.bars);
      expect(t.family).toBe(`${t.faction}_${t.state}`);
    }
  });

  it('andamento animado: 120–140 bpm em todas as faixas; combate mais rápido que a paz da mesma facção', () => {
    for (const t of allTracks) {
      expect(t.bpm, t.id).toBeGreaterThanOrEqual(120);
      expect(t.bpm, t.id).toBeLessThanOrEqual(140);
      expect(stepSeconds(t)).toBeCloseTo(60 / (t.bpm * 4), 9);
    }
    for (const f of ['human', 'orc']) {
      const peace = Math.max(...TRACK_SETS[`${f}_peace`].map((t) => t.bpm));
      const combat = Math.min(...TRACK_SETS[`${f}_combat`].map((t) => t.bpm));
      expect(combat, f).toBeGreaterThan(peace);
    }
  });

  it('todas as variações de uma família são distintas (andamento/harmonia e notas)', () => {
    for (const fam of TRACK_FAMILIES) {
      const set = TRACK_SETS[fam];
      const dumps = new Set(set.map((t) => dump(t)));
      expect(dumps.size, fam).toBe(set.length);
      const sigs = new Set(set.map((t) => `${t.bpm}|${t.key}|${t.mode}|${t.prog.map((c) => c.join(':')).join(',')}`));
      expect(sigs.size, `${fam} harmonia/andamento`).toBe(set.length);
    }
    // e famílias diferentes não repetem material
    expect(new Set(allTracks.map((t) => dump(t, 1))).size).toBe(allTracks.length);
  });
});

describe('escala e modo esperados', () => {
  it('Reino em maior/dórico; Clãs em frígio', () => {
    for (const t of TRACK_SETS.human_peace.concat(TRACK_SETS.human_combat)) expect(['major', 'dorian', 'mixolydian'], t.id).toContain(t.mode);
    for (const t of TRACK_SETS.orc_peace.concat(TRACK_SETS.orc_combat)) expect(t.mode, t.id).toBe('phrygian');
    expect(MODES.phrygian).toContain(1); // 2ª menor
    expect(MODES.phrygian).not.toContain(6);
  });

  it('a harmonia é diatônica: fundamentais dos acordes pertencem à escala do modo', () => {
    for (const t of allTracks) for (const [root] of t.prog) expect(pcInScale(t, root), `${t.id} acorde ${root}`).toBe(true);
  });

  it('a melodia só usa notas da escala da faixa (todas as variações, vários laços)', () => {
    for (const t of allTracks) {
      const melodyOnly = { ...t, layers: t.layers.map((l) => (l.kind === 'melody' ? l : { kind: 'none' })) };
      let n = 0;
      for (let s = 0; s < trackLength(t) * 4; s++) {
        for (const e of eventsForStep(melodyOnly, s, { seed: 9 })) {
          n++;
          expect(pcInScale(t, e.midi), `${t.id} nota ${e.midi} no passo ${s}`).toBe(true);
        }
      }
      expect(n, `${t.id} tem melodia`).toBeGreaterThan(20);
    }
  });

  it('demais instrumentos também ficam na escala, exceto o trítono/cromatismo ameaçador dos Clãs', () => {
    for (const t of allTracks) {
      for (let s = 0; s < trackLength(t); s++) {
        for (const e of eventsForStep(t, s)) {
          if (!e.midi) continue; // percussão
          if (t.faction === 'orc' && (e.inst === 'brass' || e.inst === 'strings')) continue; // trítono e 9ª menor de propósito
          expect(pcInScale(t, e.midi), `${t.id} ${e.inst} ${e.midi}`).toBe(true);
        }
      }
    }
  });

  it('timbre militar: metais em quintas/oitavas no Reino, em trítono nos Clãs', () => {
    const intervals = (t, inst) => {
      const set = new Set();
      for (let s = 0; s < trackLength(t); s++) {
        const notes = eventsForStep(t, s).filter((e) => e.inst === inst && e.vel > 0).map((e) => e.midi).sort((a, b) => a - b);
        if (notes.length >= 3) set.add(notes[1] - notes[0]);
      }
      return set;
    };
    for (const t of TRACK_SETS.human_combat) {
      const iv = intervals(t, 'brass');
      expect([...iv].every((x) => x === 7 || x === 6), t.id).toBe(true); // quinta justa (ou diminuta sobre grau diminuto)
      expect(iv.has(7), t.id).toBe(true);
    }
    for (const t of TRACK_SETS.orc_combat) expect(intervals(t, 'brass').has(6), t.id).toBe(true);
  });
});

describe('caráter: marcha militar, síncopes, rufar e percussão por facção', () => {
  const countInst = (t, inst, pred = () => true) => {
    let n = 0;
    for (let s = 0; s < trackLength(t); s++) for (const e of eventsForStep(t, s)) if (e.inst === inst && pred(s, e)) n++;
    return n;
  };
  const insts = (t) => {
    const set = new Set();
    for (let s = 0; s < trackLength(t); s++) for (const e of eventsForStep(t, s)) set.add(e.inst);
    return set;
  };

  it('combate: caixa, bumbo/taiko, metais; rufar de caixa (≥ 12 golpes) no compasso de virada', () => {
    for (const t of TRACK_SETS.human_combat) {
      const i = insts(t);
      for (const need of ['snare', 'kick', 'brass', 'trumpet', 'bass']) expect(i.has(need), `${t.id} ${need}`).toBe(true);
      const bar = (b) => countInst(t, 'snare', (s) => Math.floor(s / 16) === b);
      expect(bar(3), `${t.id} rufar`).toBeGreaterThanOrEqual(12);
      expect(bar(3)).toBeGreaterThan(bar(2));
    }
    for (const t of TRACK_SETS.orc_combat) {
      const i = insts(t);
      for (const need of ['taiko', 'kick', 'brass', 'warhorn', 'bass']) expect(i.has(need), `${t.id} ${need}`).toBe(true);
      expect(countInst(t, 'taiko')).toBeGreaterThan(countInst(t, 'snare')); // os Clãs são tambor
    }
  });

  it('há síncopes: notas e batidas fora dos tempos (passos que não caem no pulso)', () => {
    for (const t of TRACK_SETS.human_combat.concat(TRACK_SETS.orc_combat)) {
      const off = countInst(t, 'brass', (s) => s % 4 !== 0);
      const hits = countInst(t, 'brass');
      expect(off, `${t.id} metais fora do pulso`).toBeGreaterThan(0);
      expect(off / hits, t.id).toBeGreaterThan(0.25);
    }
  });

  it('paz também marcha (caixa suave e bumbo), mas sem rufar, sem prato e mais calma que o combate', () => {
    for (const fam of ['human_peace', 'orc_peace']) {
      for (const t of TRACK_SETS[fam]) {
        const i = insts(t);
        expect(i.has('snare') || i.has('taiko'), t.id).toBe(true);
        expect(i.has('cymbal'), t.id).toBe(false);
        expect(i.has('brass'), t.id).toBe(false);
        const peaks = Math.max(...Array.from({ length: trackLength(t) }, (_, s) => eventsForStep(t, s).filter((e) => e.inst === 'snare').reduce((m, e) => Math.max(m, e.vel), 0)));
        expect(peaks, t.id).toBeLessThan(0.7);
      }
    }
    expect(insts(TRACKS.human_peace).has('fife')).toBe(true);
    expect(insts(TRACKS.orc_peace).has('drone')).toBe(true);
  });

  it('cada facção tem timbre próprio (instrumentos exclusivos)', () => {
    const fam = (f) => new Set(TRACK_FAMILIES.filter((k) => k.startsWith(f)).flatMap((k) => TRACK_SETS[k].flatMap((t) => [...insts(t)])));
    const human = fam('human'), orc = fam('orc');
    for (const x of ['trumpet', 'fife', 'pluck']) { expect(human.has(x), x).toBe(true); expect(orc.has(x), x).toBe(false); }
    for (const x of ['taiko', 'warhorn', 'drone']) { expect(orc.has(x), x).toBe(true); expect(human.has(x), x).toBe(false); }
  });
});

describe('geração: determinística, limitada e leve', () => {
  it('mesma semente = mesmas notas; a melodia varia a cada laço e as camadas fixas se repetem', () => {
    for (const t of allTracks) {
      expect(dump(t, 1, 5)).toBe(dump(t, 1, 5));
      const fixedTrack = { ...t, layers: t.layers.map((l) => (l.kind === 'melody' ? { kind: 'none' } : l)) }; // sem a melodia
      const fixed = (s) => JSON.stringify(eventsForStep(fixedTrack, s, { seed: 5 }));
      for (let s = 0; s < trackLength(t); s += 3) expect(fixed(s), `${t.id} passo ${s}`).toBe(fixed(s + trackLength(t)));
    }
    const t = TRACKS.human_peace;
    const loopMel = (loop) => JSON.stringify(Array.from({ length: trackLength(t) }, (_, s) => eventsForStep(t, s + loop * trackLength(t), { seed: 5 }).filter((e) => e.inst === 'fife')));
    expect(loopMel(0)).not.toBe(loopMel(1));
  });

  it('notas audíveis e finitas; velocidade em (0,1]; durações positivas; no máximo 18 notas por passo', () => {
    for (const t of allTracks) {
      let n = 0, worst = 0;
      for (let s = 0; s < trackLength(t) * 2; s++) {
        const evs = eventsForStep(t, s, { seed: 3 });
        worst = Math.max(worst, evs.length);
        for (const e of evs) {
          n++;
          expect(Number.isFinite(e.midi)).toBe(true);
          if (e.midi) { expect(e.midi, `${t.id} ${e.inst}`).toBeGreaterThanOrEqual(28); expect(e.midi, `${t.id} ${e.inst}`).toBeLessThanOrEqual(96); }
          expect(e.vel).toBeGreaterThan(0);
          expect(e.vel).toBeLessThanOrEqual(1);
          expect(e.dur).toBeGreaterThan(0);
        }
      }
      expect(n, t.id).toBeGreaterThan(150);
      expect(worst, `${t.id} pico de notas por passo`).toBeLessThanOrEqual(18);
    }
  });

  it('modo leve (preset baixo) mantém só as camadas essenciais', () => {
    for (const t of allTracks) {
      let full = 0, lite = 0;
      for (let s = 0; s < trackLength(t); s++) {
        full += eventsForStep(t, s, { lite: false }).length;
        lite += eventsForStep(t, s, { lite: true }).length;
      }
      expect(lite, t.id).toBeGreaterThan(0);
      expect(lite, t.id).toBeLessThan(full);
    }
  });

  it('gerar uma volta inteira de cada faixa é barato (orçamento de CPU: bem abaixo de um quadro)', () => {
    const t0 = performance.now();
    for (const t of allTracks) for (let s = 0; s < trackLength(t); s++) eventsForStep(t, s, { seed: 2 });
    const ms = performance.now() - t0;
    // 12 faixas × 128 passos: folga enorme sobre 16 ms POR PASSO; o limite abaixo só pega uma regressão grosseira
    expect(ms).toBeLessThan(400);
  });
});

describe('escolha determinística da variação (fora da sim)', () => {
  it('pickVariant: mesma entrada = mesma saída; sempre em 0..2; nunca repete a anterior; cobre as três', () => {
    for (const fam of TRACK_FAMILIES) {
      const seen = new Set();
      let prev = -1;
      for (let n = 0; n < 40; n++) {
        const v = pickVariant(0x51f7, fam, n, prev);
        expect(v).toBe(pickVariant(0x51f7, fam, n, prev));
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(VARIANTS_PER_FAMILY);
        expect(v).not.toBe(prev);
        seen.add(v);
        prev = v;
      }
      expect(seen.size, fam).toBe(VARIANTS_PER_FAMILY);
    }
    expect(pickVariant(1, 'orc_peace', 0)).toBe(pickVariant(1, 'orc_peace', 0));
    const a = Array.from({ length: 12 }, (_, n) => pickVariant(1, 'orc_peace', n));
    const b = Array.from({ length: 12 }, (_, n) => pickVariant(2, 'orc_peace', n));
    expect(a.join()).not.toBe(b.join()); // a semente muda a ordem
    expect(pickVariant(1, 'x', 0, -1, 1)).toBe(0);
  });

  const mkEngine = (seed) => {
    const ctx = createFakeAudioContext();
    return { ctx, eng: new AudioEngine({ ctx, level: 'med', seed, timers: null }) };
  };

  it('o motor escolhe a variação de forma determinística e a música muda de variação a cada troca/rodízio', () => {
    const run = (seed) => {
      const { ctx, eng } = mkEngine(seed);
      const seq = [];
      eng.beginMatch({ faction: 'orc', tilesetId: 'inverno' });
      seq.push(`${eng.music.currentId}#${eng.music.currentVariant}`);
      for (let k = 0; k < 4; k++) {
        for (let i = 0; i < 6; i++) eng.noteCombat(1);
        ctx.advance(0.15); eng.tick();
        seq.push(`${eng.music.currentId}#${eng.music.currentVariant}`);
        for (let t = 0; t < 40; t += 0.15) { ctx.advance(0.15); eng.tick(); }
        seq.push(`${eng.music.currentId}#${eng.music.currentVariant}`);
      }
      return seq;
    };
    const a = run(0x51f7);
    expect(run(0x51f7)).toEqual(a);
    expect(a.some((x) => x.startsWith('orc_combat')) && a.some((x) => x.startsWith('orc_peace'))).toBe(true);
    // a mesma família não repete a variação em seguida
    for (let i = 1; i < a.length; i++) if (a[i].split('#')[0] === a[i - 1].split('#')[0]) expect(a[i], `${i}`).toBe(a[i - 1]); // dentro de 40 s não há rodízio
  });

  it('rodízio: depois de 3 voltas na mesma família entra outra variação (crossfade), sem trocar de família', () => {
    const { ctx, eng } = mkEngine(7);
    eng.beginMatch({ faction: 'human', tilesetId: 'verdejante' });
    const first = eng.music.currentVariant;
    const cur = eng.music.runs[eng.music.runs.length - 1].track; // (a primeira faixa, o tema de abertura do menu, ainda sai)
    const loopSec = trackLength(cur) * stepSeconds(cur);
    let changed = -1;
    for (let t = 0; t < loopSec * 4.2; t += 0.15) {
      ctx.advance(0.15); eng.tick();
      if (eng.music.currentVariant !== first) { changed = t; break; }
    }
    expect(changed).toBeGreaterThan(loopSec * 2.5);
    expect(changed).toBeLessThan(loopSec * 3.6);
    expect(eng.music.currentId).toBe('human_peace');
    expect(eng.music.runs.length).toBeGreaterThanOrEqual(2); // a variação antiga ainda sai
    expect(eng.stats().music.variant).toBe(eng.music.currentVariant);
  });

  it('orçamento por tick: o player agenda um número limitado de notas, mesmo após o relógio saltar', () => {
    const { ctx, eng } = mkEngine(3);
    eng.beginMatch({ faction: 'orc', tilesetId: 'inverno' });
    for (let i = 0; i < 8; i++) eng.noteCombat(1);
    ctx.advance(0.15); eng.tick(); // combate
    let worst = 0;
    for (let k = 0; k < 40; k++) {
      const before = eng.music.stats.notes;
      ctx.advance(k % 10 === 0 ? 3 : 0.15); // de vez em quando a aba "dorme" e o relógio salta
      eng.tick();
      worst = Math.max(worst, eng.music.stats.notes - before);
    }
    expect(worst).toBeGreaterThan(0);
    expect(worst).toBeLessThanOrEqual(80 + 18);
    expect(trackIdFor('orc', 'combat')).toBe('orc_combat');
  });
});

describe('instrumentos sintetizados', () => {
  it('todo instrumento usado pelas partituras existe e agenda nós sem erro (e se desfaz sozinho)', () => {
    const used = new Set();
    for (const t of allTracks) for (const l of t.layers) used.add(l.inst);
    for (const inst of used) {
      const ctx = createFakeAudioContext();
      const rng = createAudioRng(1);
      const noise = ctx.createBuffer(1, 4410, 44100);
      const out = ctx.createGain();
      const before = ctx.nodes.length;
      expect(() => playInstrument(ctx, out, noise, inst, 60, 0.1, 0.5, 0.8, rng), inst).not.toThrow();
      expect(ctx.nodes.length, `${inst} criou nós`).toBeGreaterThan(before);
      const sources = ctx.nodes.filter((n) => n.started !== undefined);
      expect(sources.length, inst).toBeGreaterThan(0);
      for (const n of sources) if (n.started) expect(n.stopped, `${inst}: fonte iniciada sem stop`).toBe(true);
    }
  });
});
