/**
 * musicScores.js (F7-08, reescrita em 2026-10-11) — REGISTRO das partituras PROCEDURAIS da música adaptativa. PURO: dados +
 * geração de notas por passo (o motor de partitura vive em `musicEngine.js`); o som é feito por `MusicPlayer`/`instruments.js`
 * (tudo sintetizado, sem samples).
 *
 * ESTILO (feedback do dono): música ANIMADA, um pouco MILITAR e URGENTE, como a de Warcraft II.
 *  - Reino (Aliança): fanfarra heroica em modo maior/dórico — trompetes, metais em quintas/oitavas, pífaro, caixas e bumbo.
 *  - Horda: percussão pesada (taiko/tambores), trompa de guerra, metais em trítono, modo frígio (2ª menor + 5ª diminuta).
 *  - As 3 primeiras variações de cada família (paz/combate × facção) são as CLÁSSICAS deste arquivo; as demais (candidatas
 *    novas) vêm de `tracksHuman.js`, `tracksOrc.js` e `tracksTitle.js`. O catálogo (`catalog.js`) diz quais tocam no jogo.
 *  - A escolha da variação é determinística e fica FORA da simulação (`pickVariant` em musicDirector.js).
 *  - Faixas de PAZ evoluem com o tempo de partida (`intensity`): ver `musicEngine.js` e `intensity.js`.
 */
import { STEPS_PER_BAR, makeTrack, arp, pump, evolutionLayers } from './musicEngine.js';
import { TITLE_TRACKS } from './tracksTitle.js';
import { HUMAN_PEACE_NEW, HUMAN_COMBAT_NEW } from './tracksHuman.js';
import { ORC_PEACE_NEW, ORC_COMBAT_NEW } from './tracksOrc.js';

export { STEPS_PER_BEAT, STEPS_PER_BAR, METERS, MODES, MINOR_MODES, CHORD_TONES, makeTrack, trackLength, stepSeconds, loopSeconds, eventsForStep, parseLine, evolutionLayers } from './musicEngine.js';

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

// ------------------------------------------------------------------------------------------------ faixas clássicas (as 3 variações originais de cada família)
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
    { kind: 'melody', inst: 'fife', oct: 2, vel: 0.4, density: 0.85, lite: true, mold: k, seedAdd: v.seed, lift: { at: 0.75, oct: 1 } },
    ...evolutionLayers(STEPS_PER_BAR, 'human')
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
    { kind: 'melody', inst: 'flute', oct: 2, vel: 0.42, density: 0.5, lite: true, mold: k + 2, seedAdd: v.seed, lift: { at: 0.75, oct: 1 } },
    ...evolutionLayers(STEPS_PER_BAR, 'orc')
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

/** Famílias de faixa (facção × estado) e suas variações: as 3 clássicas primeiro, depois as candidatas novas. */
export const TRACK_SETS = Object.freeze({
  human_peace: Object.freeze([...humanPeace, ...HUMAN_PEACE_NEW]),
  human_combat: Object.freeze([...humanCombat, ...HUMAN_COMBAT_NEW]),
  orc_peace: Object.freeze([...orcPeace, ...ORC_PEACE_NEW]),
  orc_combat: Object.freeze([...orcCombat, ...ORC_COMBAT_NEW]),
  title: Object.freeze([...TITLE_TRACKS])
});

/** Variação 0 de cada família (`TRACKS.orc_combat`): compatível com quem só conhece "uma faixa por facção e estado". */
export const TRACKS = Object.freeze(Object.fromEntries(Object.entries(TRACK_SETS).map(([k, v]) => [k, v[0]])));

/** Todas as faixas pelo id completo (`orc_combat_2`). */
export const TRACKS_BY_ID = Object.freeze(Object.fromEntries(Object.values(TRACK_SETS).flat().map((t) => [t.id, t])));

export const TRACK_FAMILIES = Object.freeze(Object.keys(TRACK_SETS));
export const TRACK_IDS = Object.freeze(Object.keys(TRACKS_BY_ID));
/** Quantas variações CLÁSSICAS cada família tem (as demais são candidatas; ver `catalog.js`). */
export const VARIANTS_PER_FAMILY = 3;

/** A faixa de `família` na variação `variant` (circular). Família desconhecida = `undefined`. */
export function trackFor(family, variant = 0) {
  const set = TRACK_SETS[family];
  if (!set) return undefined;
  return set[((variant | 0) % set.length + set.length) % set.length];
}
