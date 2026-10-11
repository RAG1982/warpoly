/**
 * musicScores.js (F7-08) — partituras PROCEDURAIS da música adaptativa (PURO: dados + geração de notas por passo; o som
 * é feito por `MusicPlayer`/`instruments.js`). Quatro faixas em loop, duas por facção: `human_peace`, `human_combat`,
 * `orc_peace`, `orc_combat`.
 *
 * Uma faixa é uma progressão de acordes (`prog`, um acorde por compasso) + camadas:
 *   pattern  notas fixas por passo, relativas ao acorde (arpejo, baixo, ostinato, stabs de metal)
 *   hold     o acorde inteiro sustentado no compasso (colchão/pad)
 *   drum     percussão por passo (velocidade 0..1; arrays de 1 ou 2 compassos em loop)
 *   melody   frase de 2 compassos gerada de uma escala, com cadência nos tempos fortes (variação por laço e `seed`)
 * Tudo determinístico: `eventsForStep(track, step, { seed, lite })` devolve sempre as mesmas notas — nada de Math.random
 * (a "humanização" de tempo/volume fica no player, com o RNG de render).
 *
 * Evento: { inst, midi, vel, dur }  — `dur` em PASSOS (colcheias). Percussão: `midi` = afinação relativa (tom) ou 0.
 */

export const STEPS_PER_BEAT = 2;

/** Intervalos (semitons) dos tons do acorde: 0 fundamental, 1 terça, 2 quinta, 3-5 mesmas notas uma oitava acima. */
const CHORD_TONES = Object.freeze({
  maj: [0, 4, 7, 12, 16, 19],
  min: [0, 3, 7, 12, 15, 19],
  sus: [0, 5, 7, 12, 17, 19]
});

const mix = (x) => {
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  return (x ^ (x >>> 16)) >>> 0;
};
const hash = (a, b, c, d) => mix(mix(mix(mix((a | 0) + 0x9e3779b9) ^ (b | 0)) ^ (c | 0)) ^ (d | 0));

/** Moldes rítmicos da frase de melodia (16 passos): [passo, duração em passos]. */
const RHYTHMS = Object.freeze([
  [[0, 3], [3, 1], [4, 2], [6, 2], [8, 3], [11, 1], [12, 4]],
  [[0, 2], [2, 2], [4, 4], [8, 2], [10, 2], [12, 4]],
  [[0, 4], [4, 2], [6, 2], [8, 4], [12, 2], [14, 2]],
  [[0, 1], [1, 1], [2, 2], [4, 3], [7, 1], [8, 4], [12, 4]]
]);

const arp = (n, dur = 1.5) => n.map((idx, i) => (idx < 0 ? null : { i, n: idx, dur })).filter(Boolean);

/** @type {Record<string, object>} */
export const TRACKS = Object.freeze({
  // Aldeia ao amanhecer: sol maior, arpejo de alaúde, colchão suave e flauta pentatônica.
  human_peace: {
    id: 'human_peace', faction: 'human', state: 'peace', bpm: 76, stepsPerBar: 8, bars: 8,
    prog: [[43, 'maj'], [40, 'min'], [48, 'maj'], [50, 'maj'], [43, 'maj'], [47, 'min'], [48, 'maj'], [50, 'maj']],
    layers: [
      { kind: 'pattern', inst: 'pluck', oct: 2, vel: 0.5, lite: true, steps: arp([0, 1, 2, 1, 3, 2, 1, 2]) },
      { kind: 'hold', inst: 'pad', oct: 1, vel: 0.3, lite: false },
      { kind: 'pattern', inst: 'bass', oct: 0, vel: 0.55, lite: true, steps: [{ i: 0, n: 0, dur: 3 }, { i: 4, n: 0, dur: 3 }] },
      { kind: 'melody', inst: 'flute', scale: [0, 2, 4, 7, 9], key: 67, vel: 0.5, density: 0.85, lite: true },
      { kind: 'drum', inst: 'shaker', steps: [0, 0.12, 0, 0.1, 0, 0.12, 0, 0.1], lite: false }
    ]
  },

  // Marcha de guerra: mi menor, tambores, metais em stabs e cordas em ostinato.
  human_combat: {
    id: 'human_combat', faction: 'human', state: 'combat', bpm: 138, stepsPerBar: 8, bars: 8,
    prog: [[40, 'min'], [40, 'min'], [48, 'maj'], [50, 'maj'], [40, 'min'], [40, 'min'], [45, 'min'], [47, 'maj']],
    layers: [
      { kind: 'pattern', inst: 'bass', oct: 0, vel: 0.6, lite: true, steps: [0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({ i, n: 0, dur: 0.9, vel: [1, 0.5, 0.7, 0.5, 1, 0.5, 0.7, 0.5][i] })) },
      { kind: 'pattern', inst: 'strings', oct: 1, vel: 0.32, lite: false, steps: arp([0, 0, 2, 0, 0, 0, 2, 0], 0.9) },
      { kind: 'pattern', inst: 'brass', oct: 2, vel: 0.42, lite: true, steps: [{ i: 0, n: 0, dur: 2 }, { i: 0, n: 2, dur: 2 }, { i: 3, n: 0, dur: 1 }, { i: 4, n: 0, dur: 2 }, { i: 4, n: 2, dur: 2 }] },
      { kind: 'drum', inst: 'kick', steps: [1, 0, 0, 0, 1, 0, 0.7, 0], lite: true },
      { kind: 'drum', inst: 'snare', steps: [0, 0, 1, 0, 0, 0, 1, 0.6], lite: true },
      { kind: 'drum', inst: 'tom', steps: [0, 0, 0, 0.6, 0, 0, 0, 0.5, 0, 0.5, 0, 0, 0, 0.6, 0.7, 0.8], lite: false },
      { kind: 'melody', inst: 'brass', scale: [0, 3, 5, 7, 10], key: 64, vel: 0.36, density: 0.6, lite: false }
    ]
  },

  // Brasa lenta nas montanhas: ré menor, bordões graves, coração de tambor, flauta de osso e trompa distante.
  orc_peace: {
    id: 'orc_peace', faction: 'orc', state: 'peace', bpm: 62, stepsPerBar: 8, bars: 8,
    prog: [[38, 'min'], [38, 'min'], [46, 'maj'], [48, 'maj'], [38, 'min'], [38, 'min'], [43, 'min'], [45, 'sus']],
    layers: [
      { kind: 'hold', inst: 'drone', oct: 0, vel: 0.34, lite: false },
      { kind: 'pattern', inst: 'bass', oct: 0, vel: 0.5, lite: true, steps: [{ i: 0, n: 0, dur: 7 }] },
      { kind: 'drum', inst: 'tom', steps: [0.55, 0, 0, 0.35, 0, 0, 0, 0], lite: true },
      { kind: 'melody', inst: 'flute', scale: [0, 3, 5, 7, 10], key: 62, vel: 0.45, density: 0.45, lite: true }
    ],
    // trompa distante: nota longa no 1º compasso de cada grupo de 4
    horn: { bars: [0, 4], dur: 7 }
  },

  // Guerra: ré frígio, tambores pesados, metais dissonantes (trítono) e cordas ameaçadoras.
  orc_combat: {
    id: 'orc_combat', faction: 'orc', state: 'combat', bpm: 152, stepsPerBar: 8, bars: 8,
    prog: [[38, 'min'], [38, 'min'], [39, 'maj'], [38, 'min'], [38, 'min'], [46, 'maj'], [39, 'maj'], [45, 'maj']],
    layers: [
      { kind: 'drum', inst: 'tom', steps: [1, 0.5, 0.7, 0.5, 1, 0.5, 0.9, 0.7], lite: true },
      { kind: 'drum', inst: 'kick', steps: [1, 0, 0, 0, 0, 0, 0.8, 0], lite: true },
      { kind: 'pattern', inst: 'bass', oct: 0, vel: 0.65, lite: true, steps: [0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({ i, n: 0, dur: 0.9, vel: [1, 0.6, 0.8, 0.6, 1, 0.6, 0.8, 0.6][i] })) },
      { kind: 'pattern', inst: 'brass', oct: 2, vel: 0.4, lite: true, steps: [{ i: 0, semi: 0, dur: 2 }, { i: 0, semi: 6, dur: 2 }, { i: 4, semi: 0, dur: 2 }, { i: 4, semi: 6, dur: 2 }] },
      { kind: 'pattern', inst: 'strings', oct: 1, vel: 0.3, lite: false, steps: [0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({ i, semi: i % 2 ? 13 : 0, dur: 0.9 })) },
      { kind: 'melody', inst: 'brass', scale: [0, 1, 3, 5, 7, 8, 10], key: 62, vel: 0.34, density: 0.5, lite: false }
    ]
  }
});

export const TRACK_IDS = Object.freeze(Object.keys(TRACKS));

/** Passos de uma volta completa da faixa. */
export function trackLength(track) {
  return track.stepsPerBar * track.bars;
}

/** Duração de um passo (s). */
export function stepSeconds(track) {
  return 60 / (track.bpm * STEPS_PER_BEAT);
}

const chordAt = (track, bar) => track.prog[((bar % track.bars) + track.bars) % track.bars];

/** Frase de melodia (2 compassos = 16 passos): lista de { step, midi, dur } determinística por (laço, frase, seed). */
const phraseCache = new WeakMap();
function melodyPhrase(track, layerIdx, loop, phrase, seed) {
  let per = phraseCache.get(track);
  if (!per) phraseCache.set(track, (per = new Map()));
  const ck = `${layerIdx}|${loop}|${phrase}|${seed}`;
  const hit = per.get(ck);
  if (hit) return hit;

  const layer = track.layers[layerIdx];
  const scale = layer.scale;
  const n = scale.length;
  const h0 = hash(seed, loop, phrase, layerIdx);
  const rhythm = RHYTHMS[h0 % RHYTHMS.length];
  const notes = [];
  let d = Math.floor(n / 2) + ((h0 >>> 8) % 3) - 1; // grau inicial (índice na escala sobre 2 oitavas)
  const maxD = n + Math.floor(n / 2); // até ~1,5 oitava acima do grau 0
  const pcOf = (deg) => ((scale[deg % n] % 12) + 120) % 12;

  let prevD = -1;
  rhythm.forEach(([step, dur], k) => {
    const isFirst = k === 0;
    const isLast = k === rhythm.length - 1;
    const h = hash(seed, loop, phrase * 31 + k, layerIdx + 7);
    if (!isFirst && !isLast && h / 4294967296 >= layer.density) return; // pausa
    const bar = phrase * 2 + Math.floor(step / track.stepsPerBar);
    const [root, type] = chordAt(track, bar);
    const tones = CHORD_TONES[type];
    // final de frase pousa na fundamental ou na quinta; tempos fortes, em qualquer tom do acorde
    const wanted = (isLast ? [tones[0], tones[2]] : [tones[0], tones[1], tones[2]]).map((t) => (root + t) % 12);
    const keyPc = layer.key % 12;
    const isWanted = (deg) => wanted.includes((keyPc + pcOf(deg)) % 12);
    if (step % track.stepsPerBar === 0 || isLast) {
      // procura o grau-alvo mais próximo do corrente, evitando repetir a nota anterior quando há alternativa
      let best = -1;
      let bestAlt = -1;
      for (let off = 0; off <= 3; off++) {
        for (const cand of off === 0 ? [d] : [d - off, d + off]) {
          if (cand < 0 || cand > maxD || !isWanted(cand)) continue;
          if (cand !== prevD) { if (best < 0) best = cand; } else if (bestAlt < 0) bestAlt = cand;
        }
        if (best >= 0) break;
      }
      d = best >= 0 ? best : bestAlt >= 0 ? bestAlt : d;
    } else {
      d += [-2, -1, -1, 0, 1, 1, 2][(h >>> 4) % 7];
      if (d === prevD) d += (h >>> 9) & 1 ? 1 : -1; // não repete a nota
    }
    d = Math.max(0, Math.min(maxD, d));
    prevD = d;
    notes.push({ step, midi: layer.key + 12 * Math.floor(d / n) + scale[d % n], dur });
  });
  per.set(ck, notes);
  if (per.size > 64) per.delete(per.keys().next().value);
  return notes;
}

/**
 * Notas do passo global `step` (0, 1, 2…; a faixa dá a volta sozinha).
 * @param {object} track  uma de `TRACKS`
 * @param {number} step
 * @param {{seed?:number, lite?:boolean}} [opts]  `lite`: só as camadas `lite: true` (preset baixo)
 * @returns {Array<{inst:string, midi:number, vel:number, dur:number}>}
 */
export function eventsForStep(track, step, { seed = 1, lite = false } = {}) {
  const len = trackLength(track);
  const loop = Math.floor(step / len);
  const local = ((step % len) + len) % len;
  const bar = Math.floor(local / track.stepsPerBar);
  const i = local % track.stepsPerBar;
  const [root, type] = chordAt(track, bar);
  const tones = CHORD_TONES[type];
  const out = [];

  track.layers.forEach((layer, li) => {
    if (lite && layer.lite === false) return;
    switch (layer.kind) {
      case 'pattern':
        for (const s of layer.steps) {
          if (s.i !== i) continue;
          const semi = s.semi !== undefined ? s.semi : tones[s.n];
          out.push({ inst: layer.inst, midi: root + 12 * layer.oct + semi, vel: layer.vel * (s.vel ?? 1), dur: s.dur });
        }
        break;
      case 'hold':
        if (i === 0) {
          for (let k = 0; k < 3; k++) out.push({ inst: layer.inst, midi: root + 12 * layer.oct + tones[k], vel: layer.vel, dur: track.stepsPerBar });
        }
        break;
      case 'drum': {
        const v = layer.steps[local % layer.steps.length];
        if (v > 0) out.push({ inst: layer.inst, midi: 0, vel: v, dur: 1 });
        break;
      }
      case 'melody': {
        const phrase = Math.floor(local / (track.stepsPerBar * 2));
        const notes = melodyPhrase(track, li, loop, phrase, seed);
        const within = local - phrase * track.stepsPerBar * 2;
        for (const nt of notes) if (nt.step === within) out.push({ inst: layer.inst, midi: nt.midi, vel: layer.vel, dur: nt.dur });
        break;
      }
      default:
        break;
    }
  });

  // trompa distante (orc_peace): nota longa no início de certos compassos
  if (track.horn && !lite && i === 0 && track.horn.bars.includes(bar)) {
    out.push({ inst: 'horn', midi: root + 12, vel: 0.3, dur: track.horn.dur });
  }
  return out;
}
