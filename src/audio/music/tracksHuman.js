/**
 * tracksHuman.js — NOVAS variações do Reino (Liga de Aurelan), todas candidatas (ver `catalog.js`): 5 de paz e 6 de combate.
 * Estética: nobre, barroca, ordem e dever real — trompetes majestosos, violinos e violoncelos, CRAVO aristocrático, 4/4
 * firme (e alguns 3/4 e 6/8 cavalheirescos). As melodias são ESCRITAS (graus da escala, motivos que se repetem e resolvem
 * na tônica), sem notas aleatórias. As de paz evoluem com o tempo de partida (`evolutionLayers`).
 *
 * Família `human_peace` (variações 3–7) e `human_combat` (variações 3–8).
 */
import { makeTrack, place, span } from './musicEngine.js';
import { P, H, DR, LN, each, peace, LIFT } from './trackKit.js';

const j = (...bars) => bars.join(' ');
const HP = (variant) => ({ family: 'human_peace', faction: 'human', state: 'peace', variant });
const HC = (variant) => ({ family: 'human_combat', faction: 'human', state: 'combat', variant });
const ROLL16 = 'ooooxxxxXXXXXXXX';
const MARCH16 = 'g.ooX.oxg.ooX.xX';

// ------------------------------------------------------------------------------------------------ PAZ
// 3 · Corte de Cristal — barroco em ré maior: cravo em arpejos, violinos em sequências, violoncelo firme.
const hp3 = makeTrack({
  ...HP(3), bpm: 100, mode: 'major', key: 38, seed: 211,
  deg: [0, 4, 5, 2, 3, 0, 3, 4, 0, 4, 5, 2, 3, 0, 1, 4],
  layers: peace('human', 16, [
    LN('violin', 2, 0.34, j(
      '2:4 4:2 2:2 0:4 2:4', '1:4 2:2 1:2 -1:4 1:4', '0:4 -2:2 0:2 2:4 0:4', '2:4 4:2 2:2 6:4 4:4',
      '3:4 5:2 3:2 7:4 5:4', '7:6 6:2 4:4 2:4', '3:4 5:4 7:4 5:4', '6:4 4:4 8:4 6:4',
      '4:4 7:2 4:2 2:4 4:4', '6:4 8:2 6:2 4:4 6:4', '7:4 5:2 7:2 9:4 7:4', '9:4 8:2 9:2 6:4 4:4',
      '10:4 9:2 7:2 5:4 3:4', '7:4 4:2 2:2 4:4 7:4', '8:4 7:2 5:2 3:4 5:4', '6:8 4:4 1:4'
    ), { lift: LIFT }),
    P('harpsichord', 1, 0.34, each(16, 2, (i, k) => ({ n: [0, 1, 2, 3, 2, 1, 2, 1][k % 8], dur: 1.6 }))),
    P('cello', 0, 0.4, '0:0:6 8:2:6'),
    H('strings', 1, 0.15, { lite: false }),
    P('horn', 1, 0.2, '0:0:14', { bars: [0, 8], lite: false })
  ])
});

// 4 · Fanfarra do Rei — dó maior, trombetas majestosas em ritmo pontuado sobre cordas e baixo real.
const hp4 = makeTrack({
  ...HP(4), bpm: 112, mode: 'major', key: 36, seed: 223,
  deg: [0, 3, 4, 0, 5, 3, 4, 0, 0, 5, 3, 4, 2, 3, 4, 0],
  layers: peace('human', 16, [
    LN('trumpet', 2, 0.32, j(
      '0:6 0:2 2:4 4:4', '3:6 3:2 5:4 7:4', '4:6 4:2 6:4 8:4', '7:8 4:4 2:4',
      '5:6 5:2 7:4 9:4', '7:6 5:2 3:4 5:4', '6:4 4:4 6:4 8:4', '7:12 4:4',
      '4:4 7:2 4:2 2:4 4:4', '5:4 7:2 5:2 9:4 7:4', '3:4 5:2 3:2 7:4 5:4', '4:4 6:2 4:2 8:4 6:4',
      '9:6 9:2 6:4 4:4', '10:6 9:2 7:4 5:4', '8:6 6:2 4:4 6:4', '7:12 r:4'
    ), { lift: LIFT }),
    H('strings', 1, 0.17, { lite: false }),
    P('bass', 0, 0.5, '0:0:4 8:2:4'),
    P('pluck', 1, 0.3, each(16, 4, (i, k) => ({ n: [0, 1, 2, 1][k], dur: 3 }))),
    P('horn', 1, 0.22, '0:0:14', { bars: [0, 4, 8, 12], lite: false })
  ])
});

// 5 · Jardins do Castelo — minueto em 3/4, sol maior: cravo valsando, violino e flauta.
const hp5 = makeTrack({
  ...HP(5), meter: '3/4', bpm: 96, mode: 'major', key: 43, seed: 227,
  deg: [0, 4, 5, 3, 0, 4, 3, 4, 0, 5, 1, 4, 0, 3, 4, 0],
  layers: peace('human', 12, [
    LN('violin', 2, 0.34, j(
      '0:4 2:4 4:4', '8:4 6:4 4:4', '5:4 7:4 9:4', '7:4 5:4 3:4',
      '2:4 4:2 2:2 0:4', '6:4 4:2 6:2 8:4', '5:4 7:2 5:2 3:4', '4:4 6:4 8:4',
      '7:6 4:2 2:4', '5:4 7:2 5:2 2:4', '5:4 3:4 1:4', '4:4 6:2 8:2 6:4',
      '2:4 4:4 7:4', '3:4 5:4 7:4', '8:4 6:4 4:4', '7:12'
    ), { lift: LIFT }),
    LN('flute', 3, 0.16, j('0:12', '4:12', '5:12', '3:12', '0:12', '4:12', '3:12', '4:12', '0:12', '5:12', '1:12', '4:12', '0:12', '3:12', '4:12', '0:12'), { lite: false }),
    P('harpsichord', 1, 0.3, '4:1:1.6 4:2:1.6 8:1:1.6 8:2:1.6'),
    P('cello', 0, 0.42, '0:0:5'),
    H('strings', 1, 0.13, { lite: false })
  ])
});

// 6 · Cavaleiros ao Amanhecer — 6/8 pastoral em fá maior: trompa, alaúde e uma caixa leve de marcha.
const hp6 = makeTrack({
  ...HP(6), meter: '6/8', bpm: 96, mode: 'major', key: 41, seed: 229,
  deg: [0, 5, 3, 4, 0, 5, 3, 4, 0, 3, 4, 2, 3, 4, 0, 0],
  layers: peace('human', 12, [
    LN('violin', 2, 0.34, j(
      '0:4 2:2 4:6', '-2:4 0:2 2:6', '3:4 5:2 7:6', '4:4 6:2 8:6',
      '7:4 4:2 2:6', '2:4 0:2 -2:6', '3:4 7:2 5:6', '4:6 6:2 4:4',
      '0:4 2:2 4:2 7:4', '7:4 5:2 3:2 5:4', '8:4 6:2 4:2 6:4', '2:4 4:2 6:6',
      '5:4 7:2 3:6', '4:4 6:2 8:2 6:4', '7:6 4:2 2:4', '0:12'
    ), { lift: LIFT }),
    P('pluck', 1, 0.34, each(12, 2, (i, k) => ({ n: [0, 1, 2, 1, 2, 1][k % 6], dur: 1.6 }))),
    P('bass', 0, 0.46, '0:0:5 6:2:5'),
    P('horn', 1, 0.22, '0:0:10', { bars: [0, 4, 8, 12], lite: false }),
    DR('kick', 'X.....o.....', { vel: 0.7 }),
    DR('snare', '..o...x...o.', { vel: 0.5, lite: false })
  ])
});

// 7 · Juramento da Guarda — solene, mi bemol maior: coral lento de órgão e violoncelo, trompa ao fundo.
const hp7 = makeTrack({
  ...HP(7), bpm: 84, mode: 'major', key: 39, seed: 233,
  deg: [0, 4, 5, 2, 3, 0, 3, 4, 0, 4, 5, 2, 3, 0, 4, 0],
  layers: peace('human', 16, [
    LN('cello', 1, 0.4, j(
      '4:8 2:8', '6:8 4:8', '7:8 5:8', '6:8 4:8', '7:8 5:4 3:4', '4:8 7:8', '5:8 3:4 5:4', '6:8 8:8',
      '7:12 4:4', '8:8 6:8', '9:8 7:8', '9:8 6:8', '10:8 7:8', '9:8 7:8', '8:8 6:8', '7:16'
    ), { lift: LIFT }),
    H('organ', 1, 0.17, { lite: false }),
    P('organ', 0, 0.2, '0:0:14'),
    P('horn', 1, 0.26, '0:0:14', { bars: [0, 8], lite: false }),
    P('pluck', 1, 0.26, each(16, 4, (i, k) => ({ n: [0, 1, 2, 1][k], dur: 3 }))),
    P('timpani', 0, 0.3, '0:0:2', { bars: [0, 4, 8, 12], lite: false })
  ])
});

// ------------------------------------------------------------------------------------------------ COMBATE
// 3 · Marcha de Ataque Pesada — ré menor, tímpanos e caixa, trombones pesados em ostinato, trompetes na segunda metade.
const T3 = j('0:6 0:2 2:4 4:4', '4:6 2:2 1:4 0:4', '5:6 5:2 7:4 9:4', '6:6 6:2 8:4 10:4');
const hc3 = makeTrack({
  ...HC(3), bpm: 108, mode: 'minor', key: 38, seed: 241,
  deg: [0, 0, 5, 6, 0, 3, '4M', '4M', 0, 0, 5, 6, 3, 5, '4M', 0],
  layers: [
    DR('kick', 'X...o...X...o.x.'),
    DR('snare', MARCH16, { fill: { bars: [3, 7, 11, 15], steps: ROLL16 } }),
    P('timpani', 0, 0.7, '0:0:2 8:2:2'),
    DR('cymbal', 'X...............', { bars: [0, 8], lite: false }),
    P('strings', 1, 0.2, each(16, 2, (i, k) => ({ n: k % 2 ? 2 : 0, dur: 1.6 })), { lite: false }),
    P('bass', 0, 0.55, '0:0:3 6:0:2 8:0:3 14:2:2'),
    P('horn', 1, 0.28, '0:0:14', { bars: [0, 4, 8, 12], lite: false }),
    LN('trombone', 1, 0.42, j(
      T3, '7:6 7:2 9:4 11:4', '3:6 3:2 5:4 7:4', '4:6 4:2 8:4 4:4', '4:6 4:2 8:2 4:2 r:4',
      T3, '3:6 3:2 5:4 7:4', '5:6 5:2 7:4 9:4', '4:4 8:4 11:4 8:4', '7:12 r:4'
    )),
    LN('trumpet', 2, 0.28, place(16, 16, [8, j(T3, '3:6 3:2 5:4 7:4', '5:6 5:2 7:4 9:4', '4:4 8:4 11:4 8:4', '7:12 r:4')]), { lite: false })
  ]
});

// 4 · Perseguição em 6/8 — lá menor: violinos em galope de colcheias, trompete a toda, tom e caixa em ritmo de dois tempos.
const hc4 = makeTrack({
  ...HC(4), meter: '6/8', bpm: 126, mode: 'minor', key: 45, seed: 251,
  deg: [0, 0, 5, 6, 0, 3, '4M', '4M', 0, 0, 5, 6, 3, 5, '4M', 0],
  layers: [
    DR('kick', 'X.....X.....'),
    DR('snare', '..o...X...o.', { fill: { bars: [3, 7, 11, 15], steps: 'oooxxxxxXXXX' } }),
    DR('tom', 'o.x.o.x.o.x.', { lite: false, vel: 0.8 }),
    DR('cymbal', 'X...........', { bars: [0, 8], lite: false }),
    P('violin', 1, 0.26, each(12, 2, (i, k) => ({ n: [0, 2, 1, 2, 1, 2][k % 6], dur: 1.7 })), { lite: false }),
    P('bass', 0, 0.55, '0:0:5 6:0:5'),
    P('brass', 2, 0.28, '0:0:3 6:0:3', { stack: 'fifths', bars: [4, 5, 12, 13], lite: false }),
    LN('trumpet', 1, 0.36, j(
      '7:6 9:2 11:4', '11:6 9:2 7:4', '5:6 7:2 9:4', '6:6 8:2 10:4', '7:6 9:2 11:4', '10:6 7:2 5:4', '11:6 8:2 4:4', '8:4 11:4 8:4',
      '11:4 9:2 7:2 9:4', '7:4 9:4 11:4', '9:4 7:2 5:2 7:4', '8:4 10:4 8:4', '10:4 7:2 5:2 3:4', '9:4 7:4 5:4', '11:4 8:4 4:4', '7:12'
    ))
  ]
});

// 5 · Cerco Lento — si menor a 72 bpm: violoncelos em ostinato grave, tímpanos fúnebres, dobres de sino e lamento de trompete.
const hc5 = makeTrack({
  ...HC(5), bpm: 72, mode: 'minor', key: 47, seed: 257,
  deg: [0, 0, 5, 0, 3, 0, 5, '4M', 0, 5, 0, 3, 5, 0, '4M', 0],
  layers: [
    DR('kick', 'X.......o.......', { vel: 0.8 }),
    DR('snare', ROLL16, { bars: [7, 15], vel: 0.7 }),
    P('timpani', 0, 0.8, '0:0:2 8:0:2'),
    P('cello', 0, 0.5, each(16, 4, (i, k) => ({ n: k % 2 ? 2 : 0, dur: 3.5 }))),
    P('bell', 2, 0.4, '0:0:1', { bars: [0, 2, 4, 6, 8, 10, 12, 14], lite: false }),
    H('trombone', 0, 0.18, { lite: false }),
    P('strings', 1, 0.14, each(16, 2, (i, k) => ({ n: k % 2 ? 1 : 0, dur: 1.8 })), { lite: false }),
    LN('trumpet', 1, 0.34, j(
      '7:8 4:4 2:4', '4:12 2:4', '5:8 7:4 9:4', '7:12 4:4', '3:8 5:4 7:4', '9:8 7:4 4:4', '9:8 7:4 5:4', '8:8 4:8',
      '7:8 9:4 11:4', '9:8 7:4 5:4', '7:8 4:4 2:4', '5:8 7:4 3:4', '9:8 7:4 5:4', '11:8 9:4 7:4', '8:12 4:4', '7:16'
    ))
  ]
});

// 6 · Carga da Cavalaria — sol mixolídio a 144 bpm: galope de tímpanos (longa-curta-curta), chamado repetido de trompetes.
const hc6 = makeTrack({
  ...HC(6), bpm: 144, mode: 'mixolydian', key: 43, seed: 263,
  deg: [0, 6, 3, 0, 0, 6, 4, 0, 3, 0, 6, 4, 5, 6, 4, 0],
  layers: [
    P('timpani', 0, 0.6, each(16, 1, (i) => ([0, 2, 3].includes(i % 4) ? { n: 0, dur: 1, vel: i % 4 === 0 ? 1 : 0.6 } : null))),
    DR('kick', 'X.......X.......'),
    DR('snare', '..oX..oX..oX..oX', { fill: { bars: [3, 7, 11, 15], steps: ROLL16 } }),
    DR('cymbal', 'X...............', { bars: [0, 8], lite: false }),
    P('bass', 0, 0.5, '0:0:3 4:0:3 8:0:3 12:2:3'),
    P('violin', 1, 0.22, each(16, 2, (i, k) => ({ n: [0, 2, 1, 2][k % 4], dur: 1.6 })), { lite: false }),
    P('brass', 2, 0.28, '0:0:3 8:0:3', { stack: 'fifths', bars: [0, 4, 8, 12], lite: false }),
    LN('trumpet', 2, 0.36, j(
      '0:2 0:2 0:4 4:4 7:4', '-1:2 -1:2 -1:4 1:4 3:4', '3:2 3:2 3:4 5:4 7:4', '7:8 4:4 2:4',
      '0:2 0:2 0:4 2:4 4:4', '-1:2 -1:2 -1:4 3:4 1:4', '4:2 4:2 4:4 8:4 4:4', '7:6 4:2 2:4 0:4',
      '3:2 3:2 3:4 5:4 7:4', '7:6 4:2 2:4 4:4', '-1:2 -1:2 -1:4 1:4 3:4', '4:4 8:4 4:4 8:4',
      '5:2 5:2 5:4 7:4 9:4', '6:6 3:2 1:4 3:4', '4:4 8:4 4:4 1:4', '7:12 r:4'
    ))
  ]
});

// 7 · Defesa Desesperada — mi menor harmônico: tremolo de cordas, sinos dobrando, gritos de trompete que sobem; termina na dominante.
const hc7 = makeTrack({
  ...HC(7), bpm: 120, mode: 'harmonicMinor', key: 40, seed: 269,
  deg: [0, 3, 4, 0, 5, 4, 0, 4, 0, 3, 4, 0, 3, 4, 0, 4],
  layers: [
    DR('kick', 'X..xX..xX..xX..x'),
    DR('snare', 'g.g.X.g.g.g.X.gX', { fill: { bars: [7, 15], steps: ROLL16 } }),
    P('timpani', 0, 0.75, '0:0:2 6:2:2 8:0:2 14:2:2'),
    P('strings', 1, 0.13, each(16, 1, (i) => ({ n: i % 2 ? 2 : 0, dur: 0.9 })), { lite: false }),
    P('bell', 2, 0.4, '0:0:1 8:0:1', { lite: false }),
    H('organ', 1, 0.14, { lite: false }),
    P('brass', 2, 0.28, '0:0:2 8:0:2 10:0:2', { stack: 'fifths', bars: span([8, 15]), lite: false }),
    LN('trumpet', 2, 0.34, j(
      '4:6 2:2 0:4 2:4', '7:6 5:2 3:4 5:4', '4:4 6:4 8:4 6:4', '7:8 4:4 2:4',
      '9:6 7:2 5:4 7:4', '8:6 6:2 4:4 6:4', '7:6 4:2 2:4 0:4', '8:4 6:4 4:4 r:4',
      '7:2 7:2 7:4 9:4 11:4', '10:6 7:2 5:4 7:4', '11:6 8:2 6:4 8:4', '7:8 4:4 7:4',
      '10:4 7:4 10:4 7:4', '11:4 8:4 11:4 8:4', '9:6 7:2 4:4 2:4', '8:8 6:4 4:4'
    ))
  ]
});

// 8 · Confronto Sombrio — sol menor harmônico a 80 bpm: coro grave, órgão, violoncelos e tímpanos lentos.
const hc8 = makeTrack({
  ...HC(8), bpm: 80, mode: 'harmonicMinor', key: 43, seed: 271,
  deg: [0, 5, 4, 0, 3, 4, 0, 4, 0, 3, 5, 4, 3, 4, 0, 0],
  layers: [
    DR('kick', 'X.......o.......', { vel: 0.8 }),
    DR('snare', 'X.......X.......', { vel: 0.45, fill: { bars: [7, 15], steps: ROLL16 } }),
    P('timpani', 0, 0.8, '0:0:3 8:0:3'),
    P('bell', 2, 0.4, '0:0:1', { bars: [0, 4, 8, 12], lite: false }),
    P('gong', 1, 0.7, '0:0:1', { bars: [0, 8], lite: false }),
    H('organ', 1, 0.18, { lite: false }),
    H('cello', 1, 0.2, { lite: false }),
    P('trombone', 1, 0.3, '0:0:14', { bars: [2, 6, 10, 14], lite: false }),
    LN('choir', 1, 0.34, j(
      '0:8 2:4 4:4', '5:8 7:4 5:4', '4:8 6:4 8:4', '7:12 4:4', '3:8 5:4 7:4', '8:8 6:4 4:4', '2:8 4:4 7:4', '6:12 4:4',
      '7:8 9:4 7:4', '7:8 5:4 3:4', '9:8 7:4 5:4', '8:8 6:4 4:4', '7:8 5:4 7:4', '8:8 6:8', '7:8 4:4 2:4', '0:16'
    )),
    LN('violin', 2, 0.16, place(16, 16, [8, j('0:16', '3:16', '5:16', '4:16', '3:16', '4:16', '0:16', '0:16')]), { lite: false })
  ]
});

export const HUMAN_PEACE_NEW = Object.freeze([hp3, hp4, hp5, hp6, hp7]);
export const HUMAN_COMBAT_NEW = Object.freeze([hc3, hc4, hc5, hc6, hc7, hc8]);
