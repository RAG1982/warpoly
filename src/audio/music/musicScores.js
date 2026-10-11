/**
 * musicScores.js (F7-08, reescrita em 2026-10-11) — partituras PROCEDURAIS da música adaptativa. PURO: dados + geração
 * de notas por passo; o som é feito por `MusicPlayer`/`instruments.js` (tudo sintetizado, sem samples).
 *
 * ESTILO (feedback do dono): música ANIMADA, um pouco MILITAR e URGENTE, como a de Warcraft II.
 *  - Andamento 120–140 bpm, compasso 4/4 de 16 passos (semicolcheias), marcha com síncopes e rufar de caixa nas viradas.
 *  - Reino (Aliança): fanfarra heroica em modo maior/dórico — trompetes, metais em quintas/oitavas, pífaro, caixas e bumbo.
 *  - Horda: percussão pesada (taiko/tambores), trompa de guerra, metais em trítono, modo frígio (2ª menor + 5ª diminuta).
 *  - Duas faixas por facção (paz × combate) e TRÊS VARIAÇÕES de cada (harmonia, andamento, ritmo da melodia, desenho da
 *    percussão e da síncope diferentes): `TRACK_SETS[família]` = [v0, v1, v2]. A escolha da variação é determinística e fica
 *    FORA da simulação (`pickVariant` em musicDirector.js).
 *
 * Uma faixa é uma progressão diatônica de 8 compassos (acordes gerados da escala do modo, então a harmonia sempre está "na
 * escala") + camadas:
 *   pattern  notas fixas por passo, relativas ao acorde (arpejo, baixo, ostinato, stabs de metal; `stack` empilha
 *            intervalos — quintas/oitavas/trítono —; `bars` restringe a compassos específicos)
 *   hold     o acorde sustentado no compasso (colchão/pad)
 *   drum     percussão por passo (velocidade 0..1; 16 ou 32 passos em laço); `fill` troca o desenho em compassos de virada
 *   melody   frase de 2 compassos (32 passos) gerada da escala do modo, cadenciada nos tempos fortes (varia por laço e `seed`)
 * Tudo determinístico: `eventsForStep(track, step, { seed, lite })` devolve sempre as mesmas notas — nada de Math.random
 * (a "humanização" de tempo/volume fica no player, com o RNG de render).
 *
 * Evento: { inst, midi, vel, dur }  — `dur` em PASSOS (semicolcheias). Percussão: `midi` = 0.
 */

export const STEPS_PER_BEAT = 4;
export const STEPS_PER_BAR = 16;

/** Escalas dos modos usados (semitons a partir da tônica). */
export const MODES = Object.freeze({
  major: Object.freeze([0, 2, 4, 5, 7, 9, 11]),
  dorian: Object.freeze([0, 2, 3, 5, 7, 9, 10]),
  mixolydian: Object.freeze([0, 2, 4, 5, 7, 9, 10]),
  phrygian: Object.freeze([0, 1, 3, 5, 7, 8, 10])
});

/** Intervalos (semitons) dos tons do acorde: 0 fundamental, 1 terça, 2 quinta, 3-5 mesmas notas uma oitava acima. */
const CHORD_TONES = Object.freeze({
  maj: [0, 4, 7, 12, 16, 19],
  min: [0, 3, 7, 12, 15, 19],
  dim: [0, 3, 6, 12, 15, 18]
});

/** Empilhamentos (semitons somados a cada nota de um `pattern` com `stack`). */
const STACKS = Object.freeze({
  fifths: [0, 7, 12], // quintas e oitavas: o som de metais militares (na execução usa a quinta do acorde)
  tritone: [0, 6, 12], // trítono: ameaça (Horda)
  octaves: [0, 12]
});

const mix = (x) => {
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  return (x ^ (x >>> 16)) >>> 0;
};
const hash = (a, b, c, d) => mix(mix(mix(mix((a | 0) + 0x9e3779b9) ^ (b | 0)) ^ (c | 0)) ^ (d | 0));

/** Moldes rítmicos da frase de melodia (32 passos = 2 compassos): [passo, duração]. Pontuados 3+3+2 e síncopes de marcha. */
const RHYTHMS = Object.freeze([
  [[0, 3], [3, 3], [6, 2], [8, 4], [12, 2], [14, 2], [16, 3], [19, 3], [22, 2], [24, 6], [30, 2]],
  [[0, 2], [2, 2], [4, 4], [8, 3], [11, 1], [12, 4], [16, 2], [18, 2], [20, 4], [24, 4], [28, 4]],
  [[0, 6], [6, 2], [8, 4], [12, 4], [16, 3], [19, 3], [22, 2], [24, 8]],
  [[0, 1], [1, 1], [2, 2], [4, 2], [6, 2], [8, 3], [11, 1], [12, 4], [16, 4], [20, 2], [22, 2], [24, 6], [30, 2]]
]);

/** Acorde diatônico do grau `deg` (0-based) da escala: [fundamental MIDI, tipo]. */
function chordFor(scale, key, deg) {
  const n = scale.length;
  const at = (d) => scale[d % n] + 12 * Math.floor(d / n);
  const r = at(deg);
  const third = at(deg + 2) - r;
  const fifth = at(deg + 4) - r;
  return [key + r, fifth !== 7 ? 'dim' : third === 3 ? 'min' : 'maj'];
}

/** Arpejo: um passo a cada `every` passos, percorrendo os tons `idx` do acorde. */
const arp = (idx, every, dur) => idx.map((n, k) => ({ i: k * every, n, dur }));
/** Cada passo vira `{i, n, dur, vel}` por uma tabela de velocidades por passo (0 = pausa). */
const pump = (vels, fn) => vels.map((v, i) => (v > 0 ? { i, vel: v, ...fn(i) } : null)).filter(Boolean);

// ------------------------------------------------------------------------------------------------ percussão
const D = (a) => a; // legibilidade: desenhos de 16 (ou 32) passos
// Reino, combate: bumbo no 1 e síncope no "e" do 2; caixa em marcha com notas fantasma; rufar nas viradas.
const H_KICK = [D([1, 0, 0, 0, 0, 0, 0, 0.6, 1, 0, 0, 0, 0, 0.5, 0, 0]), D([1, 0, 0, 0.5, 0, 0, 0.7, 0, 1, 0, 0, 0, 0, 0, 0.7, 0]), D([1, 0, 0, 0, 1, 0, 0, 0.5, 0, 0, 0.8, 0, 1, 0, 0, 0.5])];
const H_SNARE = [
  D([0, 0, 0.3, 0.3, 1, 0, 0.3, 0.5, 0, 0, 0.3, 0.3, 1, 0, 0.5, 0.7]),
  D([0, 0.25, 0.3, 0, 1, 0, 0.3, 0.3, 0, 0.25, 0.4, 0, 1, 0.3, 0.3, 0.6]),
  D([0.3, 0, 0.3, 0.3, 1, 0, 0.3, 0.3, 0.3, 0, 0.3, 0.3, 1, 0, 0.6, 0.6])
];
const ROLL = D([0.4, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 1, 1, 1]); // rufar crescente
const H_TOM = D([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.6, 0.6, 0.7, 0.8]);
// Horda, combate: taiko/tambores pesados em colcheias com síncopes e galope.
const O_TAIKO = [
  D([1, 0, 0.6, 0, 0.9, 0, 0.6, 0.5, 1, 0, 0.6, 0, 0.9, 0.5, 0.7, 0.8]),
  D([1, 0.5, 0, 0.7, 0.9, 0, 0.6, 0, 1, 0.5, 0, 0.7, 0.9, 0.6, 0.7, 0.9]),
  D([1, 0, 0.7, 0.5, 1, 0, 0.7, 0.5, 1, 0, 0.7, 0.5, 1, 0.6, 0.8, 1])
];
const O_KICK = [D([1, 0, 0, 0, 0, 0, 0.8, 0, 1, 0, 0, 0, 0, 0, 0.8, 0]), D([1, 0, 0, 0.6, 0, 0, 0.8, 0, 1, 0, 0, 0.6, 0, 0, 0.8, 0]), D([1, 0, 0, 0, 1, 0, 0, 0.7, 1, 0, 0, 0, 1, 0, 0.7, 0])];
const O_SNARE = [D([0, 0, 0, 0, 1, 0, 0, 0.4, 0, 0, 0, 0, 1, 0, 0.5, 0.6]), D([0, 0, 0.3, 0, 1, 0, 0, 0.4, 0, 0, 0.3, 0, 1, 0, 0.4, 0.7]), D([0, 0, 0, 0.3, 1, 0, 0.3, 0, 0, 0, 0, 0.3, 1, 0.3, 0.5, 0.7])];
const O_FILL = D([1, 0.6, 0.8, 0.6, 1, 0.6, 0.8, 0.6, 1, 0.7, 0.9, 0.7, 1, 0.8, 1, 1]);

const PEACE_SNARE = [D([0.3, 0, 0.18, 0.18, 0.35, 0, 0.18, 0.25, 0.3, 0, 0.18, 0.18, 0.35, 0, 0.25, 0.3]), D([0.3, 0, 0, 0.2, 0.35, 0, 0.2, 0, 0.3, 0, 0, 0.2, 0.35, 0.2, 0.25, 0.3]), D([0.25, 0.15, 0.2, 0.15, 0.35, 0, 0.2, 0.2, 0.25, 0.15, 0.2, 0.15, 0.35, 0, 0.3, 0.3])];
const PEACE_KICK = [D([0.7, 0, 0, 0, 0, 0, 0, 0, 0.6, 0, 0, 0, 0, 0, 0.4, 0]), D([0.7, 0, 0, 0, 0, 0, 0.4, 0, 0.6, 0, 0, 0, 0, 0, 0, 0]), D([0.7, 0, 0, 0, 0.5, 0, 0, 0, 0.6, 0, 0, 0, 0.5, 0, 0, 0])];

// ------------------------------------------------------------------------------------------------ faixas
function makeTrack({ family, faction, state, variant, bpm, mode, key, deg, seed, layers }) {
  const scale = MODES[mode];
  return {
    id: `${family}_${variant}`, family, faction, state, variant, bpm, mode, scale, key, seed,
    stepsPerBar: STEPS_PER_BAR, bars: deg.length,
    prog: deg.map((dg) => chordFor(scale, key, dg)),
    layers
  };
}

// Reino, paz: marcha leve ao amanhecer — alaúde, pífaro heroico, caixa suave e trompas.
const humanPeace = [
  { bpm: 120, mode: 'major', key: 43, deg: [0, 4, 5, 3, 0, 4, 3, 4], arp: [0, 1, 2, 1, 3, 2, 1, 2], seed: 11 },
  { bpm: 124, mode: 'dorian', key: 38, deg: [0, 3, 6, 3, 0, 3, 6, 4], arp: [0, 2, 1, 2, 3, 2, 1, 2], seed: 23 },
  { bpm: 126, mode: 'major', key: 36, deg: [0, 5, 3, 4, 0, 5, 3, 4], arp: [0, 1, 3, 1, 2, 1, 3, 1], seed: 37 }
].map((v, k) => makeTrack({
  family: 'human_peace', faction: 'human', state: 'peace', variant: k, ...v,
  layers: [
    { kind: 'pattern', inst: 'pluck', oct: 2, vel: 0.46, lite: true, steps: arp(v.arp, 2, 1.6) },
    { kind: 'hold', inst: 'pad', oct: 1, vel: 0.26, lite: false },
    { kind: 'pattern', inst: 'bass', oct: 0, vel: 0.5, lite: true, steps: [{ i: 0, n: 0, dur: 3 }, { i: 6, n: 2, dur: 2 }, { i: 8, n: 0, dur: 3 }, { i: 14, n: 2, dur: 2 }] },
    { kind: 'drum', inst: 'snare', steps: PEACE_SNARE[k], lite: false },
    { kind: 'drum', inst: 'kick', steps: PEACE_KICK[k], lite: true },
    { kind: 'pattern', inst: 'horn', oct: 1, vel: 0.3, lite: false, bars: [0, 4], steps: [{ i: 0, n: 0, dur: 14 }] },
    { kind: 'melody', inst: 'fife', oct: 2, vel: 0.4, density: 0.85, lite: true, mold: k, seedAdd: v.seed }
  ]
}));

// Reino, combate: fanfarra de guerra — marcha urgente, metais em quintas/oitavas, rufar de caixa e trompete.
const humanCombat = [
  { bpm: 132, mode: 'dorian', key: 40, deg: [0, 0, 6, 3, 0, 0, 5, 4], seed: 5, stabs: [0, 3, 6, 8, 11, 14] },
  { bpm: 136, mode: 'major', key: 43, deg: [0, 3, 4, 0, 0, 3, 4, 4], seed: 17, stabs: [0, 3, 6, 10, 12, 14] },
  { bpm: 140, mode: 'dorian', key: 38, deg: [0, 6, 3, 4, 0, 6, 5, 4], seed: 29, stabs: [0, 2, 6, 8, 10, 13] }
].map((v, k) => makeTrack({
  family: 'human_combat', faction: 'human', state: 'combat', variant: k, ...v,
  layers: [
    { kind: 'drum', inst: 'kick', steps: H_KICK[k], lite: true },
    { kind: 'drum', inst: 'snare', steps: H_SNARE[k], fill: { bars: [3, 7], steps: ROLL }, lite: true },
    { kind: 'drum', inst: 'tom', steps: H_TOM, lite: false, bars: [1, 5, 7] },
    { kind: 'drum', inst: 'cymbal', steps: [0.7, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], lite: false, bars: [0, 4] },
    { kind: 'pattern', inst: 'bass', oct: 0, vel: 0.56, lite: true, steps: pump([1, 0, 0.55, 0, 0.8, 0, 0.55, 0, 1, 0, 0.55, 0, 0.8, 0, 0.6, 0.5], (i) => ({ n: i % 8 === 4 ? 2 : 0, dur: 1.6 })) },
    { kind: 'pattern', inst: 'strings', oct: 1, vel: 0.2, lite: false, steps: pump([0.8, 0.5, 0.7, 0.5, 0.8, 0.5, 0.7, 0.5, 0.8, 0.5, 0.7, 0.5, 0.8, 0.5, 0.7, 0.6], (i) => ({ n: i % 4 === 2 ? 2 : 0, dur: 0.8 })) },
    { kind: 'pattern', inst: 'brass', oct: 2, vel: 0.36, lite: true, stack: 'fifths', steps: v.stabs.map((i) => ({ i, n: 0, dur: i % 4 === 0 ? 2.4 : 1.2 })) },
    { kind: 'melody', inst: 'trumpet', oct: 2, vel: 0.34, density: 0.78, lite: false, mold: k + 1, seedAdd: v.seed }
  ]
}));

// Horda, paz: brasa lenta nas montanhas — pulsação de taiko, bordão grave, trompa de guerra e flauta de osso (frígio).
const orcPeace = [
  { bpm: 120, mode: 'phrygian', key: 38, deg: [0, 0, 1, 6, 0, 0, 5, 6], seed: 3 },
  { bpm: 122, mode: 'phrygian', key: 40, deg: [0, 1, 0, 6, 0, 1, 6, 5], seed: 19 },
  { bpm: 124, mode: 'phrygian', key: 33, deg: [0, 6, 1, 0, 0, 5, 1, 0], seed: 31 }
].map((v, k) => makeTrack({
  family: 'orc_peace', faction: 'orc', state: 'peace', variant: k, ...v,
  layers: [
    { kind: 'hold', inst: 'drone', oct: 0, vel: 0.3, lite: false },
    { kind: 'drum', inst: 'taiko', steps: [[1, 0, 0, 0, 0, 0, 0.4, 0, 0.8, 0, 0, 0, 0, 0.4, 0, 0.5], [1, 0, 0, 0.4, 0, 0, 0, 0, 0.8, 0, 0.4, 0, 0, 0, 0.5, 0], [1, 0, 0, 0, 0.5, 0, 0, 0, 0.8, 0, 0, 0, 0.5, 0, 0.4, 0.5]][k], lite: true },
    { kind: 'drum', inst: 'snare', steps: PEACE_SNARE[k].map((x) => x * 0.55), lite: false },
    { kind: 'pattern', inst: 'bass', oct: 0, vel: 0.5, lite: true, steps: [{ i: 0, n: 0, dur: 5 }, { i: 6, n: 0, dur: 1.5 }, { i: 8, n: 0, dur: 5 }, { i: 14, n: 2, dur: 1.5 }] },
    { kind: 'pattern', inst: 'warhorn', oct: 1, vel: 0.3, lite: false, bars: [0, 4], steps: [{ i: 0, n: 0, dur: 14 }] },
    { kind: 'melody', inst: 'flute', oct: 2, vel: 0.42, density: 0.5, lite: true, mold: k + 2, seedAdd: v.seed }
  ]
}));

// Horda, combate: guerra — taiko pesado em galope, metais em trítono, cordas ameaçadoras e trompa (frígio).
const orcCombat = [
  { bpm: 136, mode: 'phrygian', key: 38, deg: [0, 0, 1, 0, 0, 6, 1, 4], seed: 7, stabs: [0, 3, 6, 8, 11, 14] },
  { bpm: 138, mode: 'phrygian', key: 40, deg: [0, 1, 0, 6, 0, 1, 6, 5], seed: 13, stabs: [0, 2, 6, 8, 10, 14] },
  { bpm: 140, mode: 'phrygian', key: 33, deg: [0, 6, 1, 0, 0, 5, 1, 4], seed: 41, stabs: [0, 3, 4, 8, 11, 12] }
].map((v, k) => makeTrack({
  family: 'orc_combat', faction: 'orc', state: 'combat', variant: k, ...v,
  layers: [
    { kind: 'drum', inst: 'taiko', steps: O_TAIKO[k], fill: { bars: [3, 7], steps: O_FILL }, lite: true },
    { kind: 'drum', inst: 'kick', steps: O_KICK[k], lite: true },
    { kind: 'drum', inst: 'snare', steps: O_SNARE[k], lite: false },
    { kind: 'drum', inst: 'cymbal', steps: [0.6, 0, 0, 0, 0, 0, 0, 0, 0.4, 0, 0, 0, 0, 0, 0, 0], lite: false, bars: [0, 4] },
    { kind: 'pattern', inst: 'bass', oct: 0, vel: 0.62, lite: true, steps: pump([1, 0.6, 0.8, 0.6, 1, 0.6, 0.8, 0.6, 1, 0.6, 0.8, 0.6, 1, 0.6, 0.8, 0.7], (i) => ({ semi: i % 4 === 3 ? 12 : 0, dur: 0.9 })) },
    { kind: 'pattern', inst: 'brass', oct: 2, vel: 0.36, lite: true, stack: 'tritone', steps: v.stabs.map((i) => ({ i, n: 0, dur: i % 4 === 0 ? 2.4 : 1.2 })) },
    { kind: 'pattern', inst: 'strings', oct: 1, vel: 0.26, lite: false, steps: pump(new Array(16).fill(0).map((_, i) => (i % 2 ? 0.55 : 0.8)), (i) => ({ semi: i % 4 === 1 ? 13 : 0, dur: 0.9 })) },
    { kind: 'pattern', inst: 'warhorn', oct: 1, vel: 0.3, lite: false, bars: [0, 2, 4, 6], steps: [{ i: 0, n: 0, dur: 6 }] },
    { kind: 'melody', inst: 'brass', oct: 2, vel: 0.32, density: 0.55, lite: false, mold: k, seedAdd: v.seed }
  ]
}));

/** Famílias de faixa (facção × estado) e suas variações. */
export const TRACK_SETS = Object.freeze({
  human_peace: Object.freeze(humanPeace),
  human_combat: Object.freeze(humanCombat),
  orc_peace: Object.freeze(orcPeace),
  orc_combat: Object.freeze(orcCombat)
});

/** Variação 0 de cada família (`TRACKS.orc_combat`): compatível com quem só conhece "uma faixa por facção e estado". */
export const TRACKS = Object.freeze(Object.fromEntries(Object.entries(TRACK_SETS).map(([k, v]) => [k, v[0]])));

/** Todas as faixas pelo id completo (`orc_combat_2`). */
export const TRACKS_BY_ID = Object.freeze(Object.fromEntries(Object.values(TRACK_SETS).flat().map((t) => [t.id, t])));

export const TRACK_FAMILIES = Object.freeze(Object.keys(TRACK_SETS));
export const TRACK_IDS = Object.freeze(Object.keys(TRACKS_BY_ID));
/** Quantas variações cada família tem. */
export const VARIANTS_PER_FAMILY = 3;

/** A faixa de `família` na variação `variant` (circular). Família desconhecida = `undefined`. */
export function trackFor(family, variant = 0) {
  const set = TRACK_SETS[family];
  if (!set) return undefined;
  return set[((variant | 0) % set.length + set.length) % set.length];
}

/** Passos de uma volta completa da faixa. */
export function trackLength(track) {
  return track.stepsPerBar * track.bars;
}

/** Duração de um passo (s). */
export function stepSeconds(track) {
  return 60 / (track.bpm * STEPS_PER_BEAT);
}

const chordAt = (track, bar) => track.prog[((bar % track.bars) + track.bars) % track.bars];

/** Frase de melodia (2 compassos = 32 passos): lista de { step, midi, dur } determinística por (laço, frase, seed). */
const phraseCache = new WeakMap();
function melodyPhrase(track, layerIdx, loop, phrase, seed) {
  let per = phraseCache.get(track);
  if (!per) phraseCache.set(track, (per = new Map()));
  const ck = `${layerIdx}|${loop}|${phrase}|${seed}`;
  const hit = per.get(ck);
  if (hit) return hit;

  const layer = track.layers[layerIdx];
  const scale = track.scale;
  const n = scale.length;
  const keyMidi = track.key + 12 * layer.oct;
  const keyPc = keyMidi % 12;
  const h0 = hash(seed, loop, phrase, layerIdx);
  const rhythm = RHYTHMS[(layer.mold + (loop + phrase) % 2) % RHYTHMS.length]; // alterna o molde entre frases
  const notes = [];
  let d = Math.floor(n / 2) + ((h0 >>> 8) % 3) - 1; // grau inicial (índice na escala)
  const maxD = n + 4; // até ~1,6 oitava acima da tônica
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
    const isWanted = (deg) => wanted.includes((keyPc + scale[deg % n]) % 12);
    if (step % 4 === 0 && (step % track.stepsPerBar === 0 || isLast || step % 8 === 0)) {
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
    notes.push({ step, midi: keyMidi + 12 * Math.floor(d / n) + scale[d % n], dur });
  });
  per.set(ck, notes);
  if (per.size > 64) per.delete(per.keys().next().value);
  return notes;
}

/**
 * Notas do passo global `step` (0, 1, 2…; a faixa dá a volta sozinha).
 * @param {object} track  uma de `TRACKS_BY_ID`
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
    if (layer.bars && !layer.bars.includes(bar)) return;
    switch (layer.kind) {
      case 'pattern': {
        // quintas: a quinta do próprio acorde (justa ou diminuta), sempre na escala; trítono é cromático de propósito
        const stack = layer.stack === 'fifths' ? [0, tones[2], 12] : layer.stack ? STACKS[layer.stack] : null;
        for (const s of layer.steps) {
          if (s.i !== i) continue;
          const base = root + 12 * layer.oct + (s.semi !== undefined ? s.semi : tones[s.n]);
          const vel = layer.vel * (s.vel ?? 1);
          if (stack) for (const k of stack) out.push({ inst: layer.inst, midi: base + k, vel: vel * (k === 0 ? 1 : 0.8), dur: s.dur });
          else out.push({ inst: layer.inst, midi: base, vel, dur: s.dur });
        }
        break;
      }
      case 'hold':
        if (i === 0) {
          for (let k = 0; k < 3; k++) out.push({ inst: layer.inst, midi: root + 12 * layer.oct + tones[k], vel: layer.vel, dur: track.stepsPerBar });
        }
        break;
      case 'drum': {
        const steps = layer.fill && layer.fill.bars.includes(bar) ? layer.fill.steps : layer.steps;
        const v = steps.length > track.stepsPerBar ? steps[local % steps.length] : steps[i];
        if (v > 0) out.push({ inst: layer.inst, midi: 0, vel: Math.min(1, v), dur: 1 });
        break;
      }
      case 'melody': {
        const phrase = Math.floor(local / (track.stepsPerBar * 2));
        const notes = melodyPhrase(track, li, loop, phrase, seed + (layer.seedAdd | 0) + (track.seed | 0));
        const within = local - phrase * track.stepsPerBar * 2;
        for (const nt of notes) if (nt.step === within) out.push({ inst: layer.inst, midi: nt.midi, vel: layer.vel, dur: nt.dur });
        break;
      }
      default:
        break;
    }
  });
  return out;
}
