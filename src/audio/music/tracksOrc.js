/**
 * tracksOrc.js — NOVAS variações da Horda, todas candidatas (ver `catalog.js`): 5 de paz e 6 de combate.
 * Estética: primal e agressiva — tambores pesados de guerra (taiko), metais graves (trompas/trombones) como trombetas de
 * invasão, madeiras escuras (flauta de osso), cantos corais graves, e RÍTMICA IRREGULAR (5/4, 7/8, 6/8). Marcha implacável.
 * As melodias são ESCRITAS (graus da escala, riffs e ostinatos que se repetem e resolvem), sem notas aleatórias. As de paz
 * evoluem com o tempo de partida (`evolutionLayers`).
 *
 * Família `orc_peace` (variações 3–7) e `orc_combat` (variações 3–8).
 */
import { makeTrack, span } from './musicEngine.js';
import { P, H, DR, LN, each, peace, LIFT } from './trackKit.js';

const j = (...bars) => bars.join(' ');
const OP = (variant) => ({ family: 'orc_peace', faction: 'orc', state: 'peace', variant });
const OC = (variant) => ({ family: 'orc_combat', faction: 'orc', state: 'combat', variant });

// ------------------------------------------------------------------------------------------------ PAZ
// 3 · Fogueira dos Clãs — 5/4 em mi frígio: flauta de osso, taiko de batimento irregular, bordão e coro grave.
const op3 = makeTrack({
  ...OP(3), meter: '5/4', bpm: 92, mode: 'phrygian', key: 40, seed: 311,
  deg: [0, 0, 1, 0, 0, 6, 0, 1, 0, 2, 1, 0],
  layers: peace('orc', 20, [
    LN('flute', 2, 0.4, j(
      '0:6 2:2 4:4 2:4 0:4', '4:6 2:2 0:4 2:8', '1:6 3:2 5:4 3:4 1:4', '0:12 2:4 0:4',
      '7:6 4:2 2:4 4:4 7:4', '6:6 3:2 1:4 3:4 6:4', '4:6 7:2 9:4 7:4 4:4', '8:6 5:2 3:4 1:4 3:4',
      '0:6 2:2 4:4 7:4 4:4', '2:6 4:2 6:4 4:4 2:4', '1:6 3:2 5:4 8:4 5:4', '0:20'
    ), { lift: LIFT }),
    H('drone', 0, 0.28, { lite: false }),
    DR('taiko', 'X...o...x...o...o...', { vel: 0.85 }),
    P('bass', 0, 0.5, '0:0:5 12:0:5'),
    P('warhorn', 1, 0.28, '0:0:18', { bars: [0, 4, 8], lite: false }),
    H('choir', 0, 0.14, { bars: span([4, 11]), lite: false })
  ])
});

// 4 · Marcha das Trompas — 7/8 (2+2+3) em lá frígio: chamados de trompa sobre taiko e baixo coxos.
const op4 = makeTrack({
  ...OP(4), meter: '7/8', bpm: 100, mode: 'phrygian', key: 45, seed: 313,
  deg: [0, 0, 1, 0, 0, 6, 1, 0, 0, 2, 1, 6, 0, 1, 6, 0],
  layers: peace('orc', 14, [
    LN('horn', 1, 0.36, j(
      '0:4 2:4 4:6', '7:4 4:4 2:6', '1:4 3:4 5:6', '4:4 2:4 0:6', '0:4 0:4 4:6', '6:4 8:4 10:6', '1:4 3:4 8:6', '7:8 4:6',
      '2:4 4:4 7:6', '9:4 6:4 4:6', '8:4 5:4 3:6', '10:4 8:4 6:6', '7:4 7:4 11:6', '8:4 10:4 12:6', '10:4 8:4 6:6', '7:14'
    ), { lift: LIFT }),
    DR('taiko', 'X...x...X.o.x.', { vel: 0.85 }),
    DR('kick', 'X.....x.....o.', { vel: 0.6 }),
    DR('snare', '....X.....X.x.', { vel: 0.4, lite: false }),
    H('drone', 0, 0.26, { lite: false }),
    P('bass', 0, 0.5, '0:0:4 4:0:3 8:2:5'),
    P('warhorn', 1, 0.28, '0:0:12', { bars: [0, 4, 8, 12], lite: false })
  ])
});

// 5 · Canto da Planície — ré menor a 84 bpm: coro grave amplo, violoncelo, flauta ecoando e batida lenta.
const choir5 = j(
  '2:8 4:4 2:4', '5:8 7:4 5:4', '4:8 6:4 4:4', '6:8 8:4 6:4', '7:8 9:4 7:4', '5:8 7:4 9:4', '7:8 5:4 3:4', '11:8 8:4 4:4',
  '9:8 7:4 4:4', '10:8 7:4 5:4', '9:8 7:4 5:4', '8:8 11:4 8:4', '7:8 9:4 11:4', '12:8 9:4 7:4', '10:8 8:4 6:4', '7:16'
);
const op5 = makeTrack({
  ...OP(5), bpm: 84, mode: 'minor', key: 38, seed: 317,
  deg: [0, 5, 2, 6, 0, 5, 3, '4M', 0, 3, 5, '4M', 0, 5, 6, 0],
  layers: peace('orc', 16, [
    LN('choir', 1, 0.34, choir5, { lift: LIFT }),
    LN('flute', 2, 0.2, choir5, { lite: false }),
    H('drone', 0, 0.24, { lite: false }),
    P('cello', 1, 0.2, '0:0:14', { lite: false }),
    DR('taiko', 'X.......o...x...', { vel: 0.7 }),
    P('bass', 0, 0.45, '0:0:7 8:2:7'),
    P('warhorn', 1, 0.26, '0:0:14', { bars: [0, 8], lite: false })
  ])
});

// 6 · Forja do Clã — lá frígio a 96 bpm: riff de trombones em ritmo de martelo, sinos de bigorna e taiko.
const op6 = makeTrack({
  ...OP(6), bpm: 96, mode: 'phrygian', key: 45, seed: 331,
  deg: [0, 0, 1, 0, 0, 6, 1, 0, 0, 0, 1, 6, 5, 6, 1, 0],
  layers: peace('orc', 16, [
    LN('trombone', 0, 0.4, j(
      '0:3 0:3 0:2 2:4 0:4', '0:3 0:3 0:2 4:4 2:4', '1:3 1:3 1:2 3:4 1:4', '0:3 0:3 0:2 2:4 4:4',
      '0:3 0:3 0:2 2:4 0:4', '6:3 6:3 6:2 8:4 6:4', '1:3 1:3 1:2 3:4 5:4', '0:3 0:3 0:2 2:4 0:4',
      '7:3 7:3 7:2 9:4 7:4', '7:3 7:3 7:2 11:4 9:4', '8:3 8:3 8:2 10:4 8:4', '6:3 6:3 6:2 8:4 10:4',
      '5:3 5:3 5:2 7:4 9:4', '6:3 6:3 6:2 8:4 6:4', '1:3 1:3 1:2 3:4 5:4', '0:3 0:3 0:2 0:8'
    ), { lift: LIFT }),
    DR('taiko', 'X..x..o.X..x..o.', { vel: 0.85 }),
    DR('kick', 'X.......o.......', { vel: 0.6 }),
    DR('snare', '..o...o...o...o.', { vel: 0.4, lite: false }),
    P('bell', 3, 0.3, '4:0:1 12:0:1', { lite: false }),
    H('drone', 0, 0.26, { lite: false }),
    P('bass', 0, 0.5, '0:0:3 6:0:2 8:0:3 14:2:2'),
    P('warhorn', 1, 0.28, '0:0:14', { bars: [0, 8], lite: false })
  ])
});

// 7 · Pedra e Fumaça — 6/8 lento em sol menor harmônico: balanço de flauta, trompa de guerra e gongo.
const op7 = makeTrack({
  ...OP(7), meter: '6/8', bpm: 80, mode: 'harmonicMinor', key: 43, seed: 337,
  deg: [0, 0, 5, 4, 0, 3, 4, 0, 0, 5, 4, 0, 3, 4, 0, 0],
  layers: peace('orc', 12, [
    LN('flute', 2, 0.38, j(
      '0:4 2:2 4:6', '7:6 4:2 2:4', '5:4 7:2 9:6', '8:6 6:2 4:4', '0:4 2:2 4:2 7:4', '7:4 5:2 3:6', '4:4 6:2 8:6', '7:12',
      '4:4 2:2 4:6', '9:6 7:2 5:4', '8:4 6:2 4:6', '2:4 4:2 7:6', '7:4 5:2 3:6', '8:4 6:2 4:6', '2:4 4:2 7:6', '7:12'
    ), { lift: LIFT }),
    DR('taiko', 'X.....o.x...', { vel: 0.85 }),
    P('gong', 1, 0.6, '0:0:1', { bars: [0, 8], lite: false }),
    H('drone', 0, 0.24, { lite: false }),
    P('bass', 0, 0.5, '0:0:5 6:2:5'),
    P('warhorn', 1, 0.26, '0:0:10', { bars: [0, 4, 8, 12], lite: false }),
    P('choir', 0, 0.16, '0:0:10', { bars: span([4, 11]), lite: false })
  ])
});

// ------------------------------------------------------------------------------------------------ COMBATE
// 3 · Invasão Implacável — mi frígio a 112 bpm: riff de trombones em quartas pesadas, taiko em marcha, trompa de guerra.
const oc3 = makeTrack({
  ...OC(3), bpm: 112, mode: 'phrygian', key: 40, seed: 341,
  deg: [0, 0, 1, 0, 0, 6, 1, 0, 0, 0, 1, 2, 3, 1, 6, 0],
  layers: [
    DR('taiko', 'X.x.X.x.X.x.X.xx', { fill: { bars: [7, 15], steps: 'XxXxXxXxXxXxXXXX' } }),
    DR('kick', 'X.......X.....x.'),
    DR('snare', '....X.......X.xX', { lite: false }),
    DR('cymbal', 'X...............', { bars: [0, 8], lite: false }),
    P('bass', 0, 0.6, each(16, 2, (i, k) => ({ semi: k % 4 === 3 ? 12 : 0, dur: 0.9 }))),
    P('brass', 2, 0.3, '0:0:3 6:0:2 8:0:3', { stack: 'tritone', bars: span([4, 7], [12, 15]), lite: false }),
    P('warhorn', 1, 0.3, '0:0:12', { bars: [0, 4, 8, 12], lite: false }),
    H('choir', 0, 0.16, { bars: span([8, 15]), lite: false }),
    LN('trombone', 1, 0.42, j(
      '0:4 0:4 0:4 2:4', '0:4 0:4 4:4 2:4', '1:4 1:4 1:4 3:4', '0:4 2:4 4:4 7:4', '0:4 0:4 0:4 2:4', '6:4 6:4 6:4 8:4', '1:4 1:4 3:4 5:4', '4:4 2:4 0:4 r:4',
      '7:4 7:4 7:4 9:4', '7:4 7:4 11:4 9:4', '8:4 8:4 8:4 10:4', '9:4 9:4 11:4 13:4', '10:4 10:4 12:4 14:4', '8:4 8:4 10:4 12:4', '13:4 10:4 8:4 6:4', '7:8 4:4 0:4'
    ))
  ]
});

// 4 · Perseguição Selvagem — ré frígio em 6/8 a 132: galope de colcheias nos trombones, taiko de dois tempos.
const oc4 = makeTrack({
  ...OC(4), meter: '6/8', bpm: 132, mode: 'phrygian', key: 38, seed: 347,
  deg: [0, 0, 1, 0, 0, 6, 1, 0, 0, 1, 0, 6, 0, 1, 6, 0],
  layers: [
    DR('taiko', 'X.x.x.X.x.x.', { fill: { bars: [7, 15], steps: 'XxXxXxXxXXXX' } }),
    DR('kick', 'X.....X.....'),
    DR('snare', '..o...X...o.', { lite: false }),
    DR('cymbal', 'X...........', { bars: [0, 8], lite: false }),
    P('bass', 0, 0.6, each(12, 2, (i, k) => ({ semi: k % 3 === 2 ? 12 : 0, dur: 0.9 }))),
    P('brass', 2, 0.3, '0:0:3 6:0:3', { stack: 'tritone', bars: [3, 7, 11, 15], lite: false }),
    P('warhorn', 1, 0.3, '0:0:10', { bars: [0, 4, 8, 12], lite: false }),
    P('strings', 1, 0.2, each(12, 2, (i, k) => ({ semi: k % 2 ? 13 : 0, dur: 1.4 })), { lite: false }),
    LN('trombone', 1, 0.42, j(
      '0:2 0:2 0:2 2:2 4:2 2:2', '0:2 0:2 0:2 4:2 2:2 0:2', '1:2 1:2 1:2 3:2 5:2 3:2', '0:2 2:2 4:2 7:2 4:2 2:2',
      '0:2 0:2 0:2 2:2 4:2 2:2', '6:2 6:2 6:2 8:2 10:2 8:2', '1:2 1:2 1:2 3:2 5:2 3:2', '7:4 4:4 0:4',
      '7:2 7:2 7:2 9:2 11:2 9:2', '8:2 8:2 8:2 10:2 12:2 10:2', '7:2 7:2 7:2 11:2 9:2 7:2', '6:2 6:2 6:2 8:2 10:2 8:2',
      '7:2 9:2 11:2 14:2 11:2 9:2', '8:2 10:2 12:2 10:2 8:2 10:2', '10:4 8:4 6:4', '7:8 4:4'
    ))
  ]
});

// 5 · Cerco da Horda — dó frígio a 66 bpm: trombones longos que sobem, taiko fúnebre, gongos e coro grave. Lento e ameaçador.
const oc5 = makeTrack({
  ...OC(5), bpm: 66, mode: 'phrygian', key: 36, seed: 349,
  deg: [0, 0, 1, 0, 0, 6, 1, 0, 0, 5, 1, 0, 3, 6, 1, 0],
  layers: [
    DR('taiko', 'X.......o...x...', { vel: 0.9, fill: { bars: [7, 15], steps: 'ooooxxxxXXXXXXXX' } }),
    DR('kick', 'X...............', { vel: 0.7, lite: false }),
    P('gong', 1, 0.7, '0:0:1', { bars: [0, 4, 8, 12] }),
    H('drone', 0, 0.26, { lite: false }),
    H('choir', 0, 0.18, { lite: false }),
    P('warhorn', 1, 0.3, '0:0:14', { bars: [2, 6, 10, 14], lite: false }),
    P('brass', 1, 0.28, '0:0:6 8:0:6', { stack: 'tritone', bars: span([8, 15]), lite: false }),
    P('strings', 1, 0.14, each(16, 2, (i, k) => ({ semi: k % 2 ? 13 : 0, dur: 1.8 })), { lite: false }),
    LN('trombone', 1, 0.4, j(
      '0:8 2:8', '4:8 2:8', '1:8 3:8', '2:8 0:8', '0:8 4:8', '6:8 8:8', '8:8 10:8', '7:8 4:8',
      '7:8 9:8', '5:8 7:8', '8:8 10:8', '9:8 7:8', '3:8 5:8', '6:8 8:8', '8:8 12:8', '14:16'
    ))
  ]
});

// 6 · Carga dos Lobos — si frígio em 7/8 a 150: galope de 7 colcheias (2+2+3) em trombones, taiko sem trégua.
const oc6 = makeTrack({
  ...OC(6), meter: '7/8', bpm: 150, mode: 'phrygian', key: 47, seed: 353,
  deg: [0, 0, 1, 0, 0, 6, 1, 0, 0, 0, 1, 2, 3, 1, 6, 0],
  layers: [
    DR('taiko', 'X.x.x.X.x.x.X.', { fill: { bars: [7, 15], steps: 'XxXxXxXxXxXXXX' } }),
    DR('kick', 'X.....X.....X.'),
    DR('snare', '....X.....X.x.', { lite: false }),
    DR('cymbal', 'X.............', { bars: [0, 8], lite: false }),
    P('bass', 0, 0.6, each(14, 2, (i, k) => ({ semi: k % 3 === 2 ? 12 : 0, dur: 0.9 }))),
    P('brass', 2, 0.3, '0:0:3 6:0:3 10:0:3', { stack: 'tritone', bars: span([4, 7], [12, 15]), lite: false }),
    P('warhorn', 1, 0.3, '0:0:12', { bars: [0, 4, 8, 12], lite: false }),
    LN('trombone', 1, 0.42, j(
      '0:2 0:2 0:2 2:2 0:2 2:2 4:2', '0:2 0:2 0:2 4:2 2:2 0:2 2:2', '1:2 1:2 1:2 3:2 1:2 3:2 5:2', '7:2 4:2 2:2 4:2 2:2 0:2 2:2',
      '0:2 0:2 0:2 2:2 0:2 2:2 4:2', '6:2 6:2 6:2 8:2 6:2 8:2 10:2', '1:2 1:2 1:2 3:2 1:2 3:2 5:2', '7:6 4:4 2:4',
      '7:2 7:2 7:2 9:2 7:2 9:2 11:2', '7:2 7:2 7:2 11:2 9:2 7:2 9:2', '8:2 8:2 8:2 10:2 8:2 10:2 12:2', '9:2 9:2 9:2 11:2 9:2 11:2 13:2',
      '10:2 10:2 10:2 12:2 10:2 12:2 14:2', '8:2 8:2 8:2 10:2 8:2 10:2 12:2', '6:2 6:2 6:2 8:2 6:2 8:2 10:2', '7:14'
    ))
  ]
});

// 7 · Defesa do Clã — fá menor harmônico em 5/4 a 126: riffs sincopados, sinos dobrando, a dominante fecha cada volta.
const oc7 = makeTrack({
  ...OC(7), meter: '5/4', bpm: 126, mode: 'harmonicMinor', key: 41, seed: 359,
  deg: [0, 0, 5, 4, 0, 3, 4, 0, 0, 5, 4, 0, 3, 4, 0, 4],
  layers: [
    DR('taiko', 'X.x.o.X.x.o.X.o.x.o.', { fill: { bars: [7, 15], steps: 'ooooxxxxxxxxXXXXXXXX' } }),
    DR('kick', 'X...o...x...X...o...'),
    DR('snare', '..ooX.ox..ooX.oxX.o.', { lite: false }),
    P('bell', 2, 0.4, '0:0:1 12:0:1', { lite: false }),
    P('strings', 1, 0.14, each(20, 1, (i) => ({ n: i % 2 ? 2 : 0, dur: 0.9 })), { lite: false }),
    H('choir', 0, 0.16, { bars: span([8, 15]), lite: false }),
    P('brass', 2, 0.3, '0:0:3 12:0:3', { stack: 'tritone', bars: span([8, 15]), lite: false }),
    P('bass', 0, 0.6, each(20, 2, (i, k) => ({ semi: k % 5 === 4 ? 12 : 0, dur: 0.9 }))),
    LN('trombone', 1, 0.42, j(
      '0:4 0:4 0:4 2:4 4:4', '7:6 4:2 2:4 4:4 0:4', '5:4 5:4 5:4 7:4 9:4', '4:4 4:4 4:4 6:4 8:4',
      '0:4 0:4 0:4 2:4 4:4', '3:4 3:4 3:4 5:4 7:4', '8:6 6:2 4:4 6:4 4:4', '7:12 4:4 0:4',
      '7:4 7:4 7:4 9:4 11:4', '9:6 7:2 5:4 7:4 9:4', '11:6 8:2 6:4 8:4 6:4', '11:4 9:4 7:4 4:4 7:4',
      '10:4 10:4 10:4 12:4 14:4', '11:6 8:2 6:4 8:4 11:4', '7:6 9:2 11:4 9:4 7:4', '4:6 6:2 8:4 6:4 4:4'
    ))
  ]
});

// 8 · Coro da Escuridão — dó sustenido menor a 90 bpm: coro grave em canto repetido, órgão, violoncelos e tímpanos lentos.
const oc8 = makeTrack({
  ...OC(8), bpm: 90, mode: 'minor', key: 37, seed: 361,
  deg: [0, 0, 5, '4M', 0, 3, 5, '4M', 0, 6, 5, '4M', 3, 5, '4M', 0],
  layers: [
    DR('taiko', 'X...X...X...X...', { vel: 0.6, fill: { bars: [7, 15], steps: 'ooooxxxxXXXXXXXX' } }),
    DR('kick', 'X.......o.......', { vel: 0.8 }),
    P('timpani', 0, 0.8, '0:0:3 8:0:3'),
    P('gong', 1, 0.7, '0:0:1', { bars: [0, 8] }),
    P('bell', 2, 0.35, '0:0:1', { bars: [2, 6, 10, 14], lite: false }),
    H('organ', 1, 0.18, { lite: false }),
    H('cello', 1, 0.2, { lite: false }),
    P('trombone', 1, 0.3, '0:0:14', { bars: [2, 6, 10, 14], lite: false }),
    LN('choir', 1, 0.36, j(
      '0:4 0:4 2:4 0:4', '0:4 2:4 4:4 2:4', '5:4 5:4 7:4 5:4', '4:4 4:4 8:4 4:4', '0:4 0:4 2:4 4:4', '3:4 3:4 5:4 3:4', '5:4 5:4 7:4 9:4', '4:4 4:4 8:4 4:4',
      '7:4 7:4 9:4 7:4', '6:4 6:4 8:4 6:4', '7:4 7:4 9:4 7:4', '8:4 4:4 8:4 4:4', '10:4 10:4 7:4 5:4', '9:4 7:4 5:4 7:4', '8:4 4:4 8:4 4:4', '7:16'
    ))
  ]
});

export const ORC_PEACE_NEW = Object.freeze([op3, op4, op5, op6, op7]);
export const ORC_COMBAT_NEW = Object.freeze([oc3, oc4, oc5, oc6, oc7, oc8]);
