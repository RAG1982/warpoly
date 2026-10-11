/**
 * tracksTitle.js — TEMAS DE ABERTURA (tela inicial/menus). Família `title` (neutra): a variação 0 é o tema do jogo; 1 e 2 são
 * candidatas para o dono escolher. Tudo original e sintetizado.
 *
 *  0 "Marcha da Tempestade" (≈ 100 s, ré menor harmônico, 4/4 a 96 bpm): abre com caixas e tambores marchando, a Horda
 *    entra com metais graves, silêncio de suspense, cordas trágicas dos humanos, explosão tutti com tímpanos, diálogo entre
 *    metais e cordas, clímax e final em acorde suspenso (ré sus4) que desemboca limpo na marcha do início (laço do menu).
 *  1 "Réquiem das Muralhas" (≈ 91 s, lá menor, 4/4 a 84 bpm): lamento de violinos e violoncelos, resposta de metais e coro.
 *  2 "Chamado dos Tambores" (≈ 92 s, mi frígio, 5/4 a 104 bpm): marcha irregular da Horda em 5/4.
 */
import { makeTrack, place, span, vol, ramp, rollSteps, shift } from './musicEngine.js';

/** Uma oitava abaixo (7 graus): os trechos de tutti são escritos "altos" e tocados neste registro nos metais e violinos. */
const dn = (s) => shift(s, -7);

const T = (v) => ({ family: 'title', faction: 'neutral', state: 'title', variant: v });

// ------------------------------------------------------------------------------------------------ 0 · Marcha da Tempestade
const MARCH = 'g.ooX.oxg.ooX.xX';
const DEG0 = [
  0, 0, 0, 0, // 0–3   abertura: percussão militar
  0, 0, 3, 0, 5, 4, 0, 0, // 4–11  Horda: metais graves
  0, 6, 4, 4, // 12–15 suspense
  0, 5, 3, 4, 0, '2M', 5, 4, // 16–23 cordas trágicas
  0, 0, 5, 4, // 24–27 explosão
  0, 3, 5, 4, 0, 3, 6, 4, // 28–35 diálogo e subida
  0, 5, 4, '0s' // 36–39 clímax e acorde suspenso
];
// Tema dos metais da Horda (oito compassos): fanfarra sobre o acorde de ré menor, quedas em escala, tensão Sib–Dó# (2ª aumentada).
const A_THEME = [
  '0:6 0:2 2:4 4:4', '4:6 2:2 1:4 0:4', '3:6 3:2 5:4 7:4', '4:6 6:2 7:4 4:4',
  '5:6 5:2 7:4 9:4', '8:6 7:2 6:4 4:4', '7:6 4:2 2:4 0:4', '0:12 r:4'
].join(' ');
// Lamento dos violinos (oito compassos, crescendo): sobe em arco e pousa na dominante.
const B_VIOLIN = [
  vol('4:8 7:6 6:2', 0.55), vol('7:12 9:4', 0.6), vol('10:8 9:4 7:4', 0.65), vol('8:6 9:2 8:4 6:4', 0.7),
  vol('7:10 4:2 7:4', 0.75), vol('9:8 11:4 9:4', 0.8), vol('12:8 11:4 9:4', 0.9), vol('13:8 11:4 8:4', 1)
].join(' ');
const EXPLOSION = '7:6 7:2 9:4 11:4 11:6 9:2 8:4 7:4 12:6 12:2 14:4 16:4 15:8 13:4 11:4';
const CALL1 = '0:4 0:2 2:2 4:4 7:4 7:6 5:2 3:4 5:4';
const ANSWER1 = '12:6 11:2 9:4 7:4 8:8 6:4 4:4';
const CALL2 = '7:4 7:2 9:2 11:4 14:4 14:6 12:2 10:4 12:4';
const TOGETHER = '13:4 15:4 13:4 10:4 11:8 13:4 15:4';
const FINAL = '7:6 7:2 9:4 11:4 12:6 11:2 9:4 7:4 8:6 6:2 4:4 6:4 11:16';
const spb16 = 16;

const title0 = makeTrack({
  ...T(0), id: 'title_0', bpm: 96, mode: 'harmonicMinor', key: 38, seed: 101, deg: DEG0,
  layers: [
    // --- percussão militar: caixa marchando (com rufar nas viradas), bumbo, tímpanos, gongo e prato
    { kind: 'drum', inst: 'snare', steps: MARCH, vel: 0.95, lite: true, bars: span([0, 11], [16, 23], [28, 38]), fill: { bars: [3, 11, 23, 35], steps: 'ooooxxxxXXXXXXXX' } },
    { kind: 'drum', inst: 'snare', steps: 'X.oxX.oxX.oxX.xX', lite: true, bars: [24, 25] },
    { kind: 'drum', inst: 'snare', steps: ramp(spb16, 0.5, 1), lite: true, bars: [26, 27] },
    { kind: 'drum', inst: 'kick', steps: 'X...o...X..xo.x.', lite: true, bars: span([0, 11], [24, 38]) },
    { kind: 'pattern', inst: 'timpani', oct: 0, vel: 0.6, lite: true, bars: span([0, 11], [16, 23], [28, 35]), steps: [{ i: 0, n: 0, dur: 2 }, { i: 8, n: 2, dur: 2, vel: 0.8 }, { i: 14, n: 0, dur: 1, vel: 0.6 }] },
    { kind: 'pattern', inst: 'timpani', oct: 0, vel: 0.85, lite: true, bars: span([24, 27], [36, 38]), steps: [0, 4, 8, 12].map((i, k) => ({ i, n: k % 2 ? 2 : 0, dur: 2 })) },
    { kind: 'pattern', inst: 'timpani', oct: 0, vel: 0.4, lite: false, bars: span([12, 14]), steps: [{ i: 0, n: 0, dur: 2 }, { i: 3, n: 0, dur: 2, vel: 0.7 }, { i: 8, n: 0, dur: 2 }, { i: 11, n: 0, dur: 2, vel: 0.7 }] },
    { kind: 'pattern', inst: 'timpani', oct: 0, vel: 0.8, lite: true, bars: [23, 35], steps: rollSteps(spb16, 0.25, 1) },
    { kind: 'pattern', inst: 'timpani', oct: 0, vel: 0.5, lite: false, bars: [39], steps: rollSteps(spb16, 0.7, 0.15) },
    { kind: 'drum', inst: 'cymbal', steps: 'X...............', lite: false, bars: [24, 28, 36] },
    { kind: 'pattern', inst: 'gong', oct: 1, vel: 0.9, lite: false, bars: [0, 24, 36, 39], steps: [{ i: 0, n: 0, dur: 1 }] },
    // --- Horda: trombones e trompas na fanfarra grave
    { kind: 'pattern', inst: 'warhorn', oct: 1, vel: 0.3, lite: false, bars: [2, 3], steps: [{ i: 0, n: 0, dur: 14 }] },
    { kind: 'hold', inst: 'trombone', oct: 0, vel: 0.22, lite: false, bars: span([4, 11], [39, 39]) },
    { kind: 'line', inst: 'trombone', oct: 1, vel: 0.42, lite: true, line: place(40, spb16, [4, A_THEME], [24, dn(EXPLOSION)], [28, dn(CALL1)], [32, dn(CALL2)], [34, dn(TOGETHER)], [36, dn(FINAL)]) },
    { kind: 'line', inst: 'horn', oct: 2, vel: 0.2, lite: false, line: place(40, spb16, [4, A_THEME]) },
    { kind: 'line', inst: 'trumpet', oct: 2, vel: 0.28, lite: false, line: place(40, spb16, [24, dn(EXPLOSION)], [28, dn(CALL1)], [32, dn(CALL2)], [34, dn(TOGETHER)], [36, dn(FINAL)]) },
    // --- suspense quase silencioso: órgão baixo e dobres de sino
    { kind: 'hold', inst: 'organ', oct: 1, vel: 0.2, lite: false, bars: span([12, 15], [39, 39]) },
    { kind: 'pattern', inst: 'bell', oct: 2, vel: 0.5, lite: false, bars: [12, 14], steps: [{ i: 0, n: 0, dur: 1 }] },
    // --- humanos: violinos trágicos e violoncelos
    { kind: 'hold', inst: 'cello', oct: 1, vel: 0.22, lite: false, bars: span([16, 23], [36, 38]) },
    { kind: 'line', inst: 'violin', oct: 2, vel: 0.36, lite: true, line: place(40, spb16, [16, B_VIOLIN], [24, dn(EXPLOSION)], [30, dn(ANSWER1)], [34, dn(TOGETHER)], [36, dn(FINAL)]) },
    // --- coro grave no diálogo e no final
    { kind: 'hold', inst: 'choir', oct: 0, vel: 0.18, lite: false, bars: span([32, 35], [39, 39]) }
  ]
});

// ------------------------------------------------------------------------------------------------ 1 · Réquiem das Muralhas
const DEG1 = [
  0, 0, 0, 0, // 0–3 abertura
  0, 5, 2, '4M', 0, 3, '4M', 0, // 4–11 lamento
  5, 2, 3, '4M', 5, 2, '4M', '4M', // 12–19 resposta dos metais
  0, 5, 2, '4M', 3, 5, '4M', '4M', // 20–27 clímax
  0, 3, '4M', '0s' // 28–31 despedida
];
const LAMENT = ['0:6 2:2 4:8', '5:8 2:4 0:4', '4:8 2:4 4:4', '1:8 4:4 1:4', '0:6 2:2 4:4 7:4', '7:6 6:2 5:4 3:4', '4:8 1:4 4:4', '0:12 r:4'].join(' ');
const BRASS1 = ['5:6 5:2 7:4 9:4', '9:6 9:2 6:4 4:4', '3:6 3:2 5:4 7:4', '8:8 4:4 1:4', '5:6 5:2 7:4 9:4', '11:6 9:2 6:4 4:4', '8:6 8:2 11:4 8:4', '11:12 r:4'].join(' ');
const CLIMAX1 = ['7:6 7:2 9:4 11:4', '12:6 11:2 9:4 7:4', '11:6 9:2 6:4 9:4', '8:6 11:2 8:4 4:4', '10:6 8:2 7:4 10:4', '12:6 9:2 7:4 9:4', '8:4 11:4 15:8', '11:16'].join(' ');
const OUTRO1 = '4:8 3:4 1:4 3:8 5:4 3:4 1:8 4:4 1:4 4:16';

const title1 = makeTrack({
  ...T(1), id: 'title_1', bpm: 84, mode: 'minor', key: 45, seed: 113, deg: DEG1,
  layers: [
    { kind: 'drum', inst: 'snare', steps: MARCH, vel: 0.6, lite: true, bars: span([0, 11], [20, 27]), fill: { bars: [3, 11, 27], steps: 'ooooxxxxXXXXXXXX' } },
    { kind: 'drum', inst: 'kick', steps: 'X.......o...X...', lite: true, bars: span([0, 3], [12, 27]) },
    { kind: 'pattern', inst: 'timpani', oct: 0, vel: 0.6, lite: true, bars: span([0, 3], [8, 31]), steps: [{ i: 0, n: 0, dur: 2 }, { i: 8, n: 2, dur: 2, vel: 0.75 }] },
    { kind: 'pattern', inst: 'gong', oct: 1, vel: 0.8, lite: false, bars: [0, 12, 20, 31], steps: [{ i: 0, n: 0, dur: 1 }] },
    { kind: 'pattern', inst: 'bell', oct: 2, vel: 0.45, lite: false, bars: [2, 3], steps: [{ i: 0, n: 0, dur: 1 }] },
    { kind: 'hold', inst: 'organ', oct: 1, vel: 0.16, lite: false, bars: span([0, 3], [28, 31]) },
    { kind: 'hold', inst: 'cello', oct: 1, vel: 0.24, lite: false, bars: span([12, 30]) },
    { kind: 'line', inst: 'violin', oct: 2, vel: 0.36, lite: true, line: place(32, spb16, [4, vol(LAMENT, 0.8)], [28, OUTRO1]) },
    { kind: 'line', inst: 'cello', oct: 1, vel: 0.28, lite: false, line: place(32, spb16, [4, '0:16 5:16 2:16 4:16 0:16 3:16 4:16 0:16']) },
    { kind: 'hold', inst: 'trombone', oct: 0, vel: 0.2, lite: false, bars: span([12, 27], [31, 31]) },
    { kind: 'line', inst: 'trombone', oct: 1, vel: 0.4, lite: true, line: place(32, spb16, [12, dn(BRASS1)], [20, dn(CLIMAX1)]) },
    { kind: 'line', inst: 'horn', oct: 2, vel: 0.2, lite: false, line: place(32, spb16, [12, dn(BRASS1)]) },
    { kind: 'line', inst: 'trumpet', oct: 2, vel: 0.28, lite: false, line: place(32, spb16, [20, dn(CLIMAX1)]) },
    { kind: 'line', inst: 'violin', oct: 2, vel: 0.24, lite: false, line: place(32, spb16, [20, dn(CLIMAX1)]) },
    { kind: 'hold', inst: 'choir', oct: 0, vel: 0.2, lite: false, bars: span([12, 27], [31, 31]) }
  ]
});

// ------------------------------------------------------------------------------------------------ 2 · Chamado dos Tambores (5/4)
const spb54 = 20;
const DEG2 = [
  0, 0, 0, 0, // 0–3
  0, 1, 0, 6, 0, 1, 2, 0, // 4–11 tema dos metais
  0, 4, 4, 4, // 12–15 suspense
  0, 2, 3, 1, 0, 5, 6, 1, // 16–23 canto do clã
  0, 1, 6, 1, 0, 5, 1, '0p' // 24–31 final
];
const THEME2 = ['0:6 0:2 2:4 4:4 2:4', '1:6 1:2 3:4 5:4 3:4', '0:6 2:2 4:4 7:4 4:4', '6:6 5:2 3:4 1:4 3:4', '0:6 0:2 2:4 4:4 2:4', '1:6 1:2 3:4 5:4 3:4', '2:6 4:2 6:4 9:4 6:4', '0:12 r:8'].join(' ');
const CHANT2 = ['0:8 2:4 0:8', '2:8 4:4 2:8', '3:8 5:4 3:8', '1:8 3:4 1:8', '0:8 4:4 7:8', '5:8 7:4 9:8', '6:8 8:4 6:8', '1:8 3:4 5:8'].join(' ');
const DRIVE2 = ['7:6 7:2 9:4 11:4 9:4', '8:6 8:2 10:4 12:4 10:4', '13:6 12:2 10:4 8:4 10:4', '8:6 8:2 10:4 12:4 15:4', '7:6 9:2 11:4 14:4 11:4', '12:6 14:2 16:4 14:4 12:4', '15:6 14:2 12:4 10:4 8:4', '14:20'].join(' ');
const KICK54 = 'X...o...x...X...o...';
const SNARE54 = '..ooX.ox..ooX.oxX.o.';
const TAIKO54 = 'X.x.o.X.x.o.X.o.x.o.';

const title2 = makeTrack({
  ...T(2), id: 'title_2', bpm: 104, meter: '5/4', mode: 'phrygian', key: 40, seed: 127, deg: DEG2,
  layers: [
    { kind: 'drum', inst: 'taiko', steps: TAIKO54, lite: true, bars: span([0, 11], [16, 31]) },
    { kind: 'drum', inst: 'kick', steps: KICK54, lite: true, bars: span([4, 11], [24, 30]) },
    { kind: 'drum', inst: 'snare', steps: SNARE54, vel: 0.9, lite: true, bars: span([0, 11], [16, 30]), fill: { bars: [3, 11, 23, 30], steps: 'ooooxxxxxxxxXXXXXXXX' } },
    { kind: 'pattern', inst: 'timpani', oct: 0, vel: 0.6, lite: false, bars: span([12, 14]), steps: [{ i: 0, n: 0, dur: 2 }, { i: 3, n: 0, dur: 2, vel: 0.7 }, { i: 12, n: 0, dur: 2 }, { i: 15, n: 0, dur: 2, vel: 0.7 }] },
    { kind: 'pattern', inst: 'timpani', oct: 0, vel: 0.8, lite: true, bars: [15, 23], steps: rollSteps(spb54, 0.25, 1) },
    { kind: 'pattern', inst: 'gong', oct: 1, vel: 0.85, lite: false, bars: [0, 24, 31], steps: [{ i: 0, n: 0, dur: 1 }] },
    { kind: 'drum', inst: 'cymbal', steps: 'X...................', lite: false, bars: [24, 28] },
    { kind: 'pattern', inst: 'warhorn', oct: 1, vel: 0.3, lite: false, bars: [2, 3], steps: [{ i: 0, n: 0, dur: 18 }] },
    { kind: 'hold', inst: 'trombone', oct: 0, vel: 0.22, lite: false, bars: span([4, 11], [24, 31]) },
    { kind: 'line', inst: 'trombone', oct: 1, vel: 0.42, lite: true, line: place(32, spb54, [4, THEME2], [24, dn(DRIVE2)]) },
    { kind: 'line', inst: 'horn', oct: 2, vel: 0.2, lite: false, line: place(32, spb54, [4, THEME2]) },
    { kind: 'line', inst: 'trumpet', oct: 2, vel: 0.28, lite: false, line: place(32, spb54, [24, dn(DRIVE2)]) },
    { kind: 'hold', inst: 'organ', oct: 1, vel: 0.2, lite: false, bars: span([12, 15], [31, 31]) },
    { kind: 'pattern', inst: 'bell', oct: 2, vel: 0.5, lite: false, bars: [12, 14], steps: [{ i: 0, n: 0, dur: 1 }] },
    { kind: 'line', inst: 'choir', oct: 1, vel: 0.3, lite: true, line: place(32, spb54, [16, CHANT2]) },
    { kind: 'line', inst: 'flute', oct: 3, vel: 0.22, lite: false, line: place(32, spb54, [16, CHANT2]) },
    { kind: 'hold', inst: 'cello', oct: 1, vel: 0.22, lite: false, bars: span([16, 23]) },
    { kind: 'line', inst: 'violin', oct: 2, vel: 0.3, lite: false, line: place(32, spb54, [24, dn(DRIVE2)]) }
  ]
});

export const TITLE_TRACKS = Object.freeze([title0, title1, title2]);
