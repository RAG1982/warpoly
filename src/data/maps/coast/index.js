/**
 * src/data/maps/coast/index.js (MUNDO-TERRENO-MAPAS §2 e §7 passo 1 · MUNDO-1)
 *
 * Gerador de costas irregulares promovido a módulo de dados: continentes e ilhas de contorno natural, lagoas, rios com vaus,
 * lava como divisor de áreas, análise/verificação e assadura em mapa jogável (`painted`). PURO: sem three.js, sem DOM, sem
 * `Math.random` — toda aleatoriedade vem de semente (`mulberry32`), então a mesma semente gera sempre o mesmo mapa.
 *
 * O jogo NÃO roda o gerador em cada cliente (o campo usa `sin/cos/exp`): ele roda em ferramenta/editor e o resultado é assado
 * em JSON (`bakeToMapDef`), que o runtime só lê.
 */
export * from './constants.js';
export * from './noise.js';
export * from './grid.js';
export * from './entities.js';
export * from './lagoons.js';
export * from './lavaStreams.js';
export * from './rivers.js';
export * from './surface.js';
export * from './analyze.js';
export * from './rotate.js';
export * from './generate.js';
export * from './bake.js';
export * from './layout.js';
export * from './verify.js';
export * from './presets.js';
export * from './world.js';
