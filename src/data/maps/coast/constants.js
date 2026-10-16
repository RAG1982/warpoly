/**
 * src/data/maps/coast/constants.js (MUNDO-TERRENO-MAPAS §2.2 · MUNDO-1)
 *
 * Constantes do gerador de costa: ids de bioma, limiares de altura (iguais aos do jogo), opções padrão e metas de madeira.
 * Convenções (iguais às do jogo): x/z em unidades de mundo, centro em (0,0), lado `size`; terra caminhável = altura ≥ 0,65
 * (`Terrain.isWalkable`); linha d'água 0,5; terra seca (construção) ≥ 1,8; árvores só a partir de 1,9.
 */
import { BIOME } from '../biome.js';

export { BIOME };
export const BIOME_NAMES = Object.freeze(['mar', 'areia', 'grama exuberante', 'savana', 'deserto', 'estepe', 'rocha', 'vulcânico', 'lava', 'neve', 'pântano', 'gelo', 'floresta densa']);

export const LAND_HEIGHT = 0.65; // `Terrain.isWalkable`
/** Altura assada das células de lava: abaixo de 0,65 (terrestre bloqueia) e acima de `NAVAL_MAX_HEIGHT` 0,1 (naval também bloqueia). */
export const LAVA_HEIGHT = 0.4;
/** Platô do vau (mesma altura do vau do gerador `continental`): terra seca e caminhável dentro do leito do rio. */
export const FORD_HEIGHT = 2.35;
/** Leito do rio: de −0,6 (margem) a −1,4 (eixo), como o canal do `continental`. */
export const RIVER_BED_EDGE = -0.6;
export const RIVER_BED_CENTER = -1.4;
/** Terra seca (`GameManager.canPlaceBuilding`) e piso para árvores (`spawnWoodlands`). */
export const DRY_HEIGHT = 1.8;
export const TREE_MIN_HEIGHT = 1.9;
/** Altura mínima de terra seca exigida do platô de uma base (o jogo aceita ≥ 1,8; folga como em `generator.js`). */
export const BASE_DRY_HEIGHT = 1.95;

/** Meta de madeira alcançável por jogador e raio de contagem (iguais a `WOOD_TARGET`/`WOOD_RADIUS` de `tools/lib/woodStats.mjs`). */
export const WOOD_TARGET = 8000;
export const WOOD_RADIUS = 60;
/** Madeira por árvore (`Tree.maxWood`). */
export const TREE_WOOD = 120;

export const DEFAULT_OPTIONS = Object.freeze({
  seed: 1,
  size: 192, // lado do mundo (u)
  grid: 256, // células por lado (cell = size / grid)
  roughness: 1, // 0,4..1,6: rugosidade da costa (amplitude/ganho do ruído e da deformação de domínio)
  islands: 6, // ilhas "grandes" entre os continentes (≥ 5; os 6 primeiros tipos são distintos)
  islets: 5, // ilhotas do arquipélago ao redor de uma ilha
  bays: 3, // enseadas/baías por continente
  peninsulas: 3, // penínsulas por continente
  gap: 5, // canal mínimo entre entidades (u) — garante rota naval
  minLake: 60, // lagoa (água não ligada ao oceano) com menos células que isso vira terra
  symmetry: 'none', // 'none' | 'mirror' (o 2º continente espelha a forma-base do 1º, mas com outro ruído) | 'rotate' (rotação de 180°, exata)
  continentSpacing: 0.29, // |cx| dos continentes, em frações de `size`
  continents: 2, // 2 (oeste × leste, padrão) | 1 (uma massa central com duas costas) | 0 (só ilhas)
  continentScale: 1, // multiplica os raios dos continentes (mais terra para madeira em mapas grandes)
  continentBiome: 'lush', // bioma do continente único (`continents: 1`)
  continentCenter: null, // [fx, fz] em frações de `size` do continente único (null = centro do mapa)
  continentDims: null, // [rx, rz] em frações de `size` dos continentes (null = 0,135 × 0,34 com 2 continentes; 0,30 × 0,24 com 1)
  islandZone: null, // { x, z } em frações de `size` onde as ilhas procuram lugar (null = corredor central ou mapa todo)
  bigIslands: 0, // ilhas grandes (do tamanho de um continente pequeno), uma por quadrante (arquipélago de 4 jogadores)
  bigIslandAt: null, // [[fx, fz], ...] centros das ilhas grandes em frações de `size` (null = os 4 quadrantes)
  bigIslandScale: 1, // multiplica o raio das ilhas grandes
  lava: true, // córregos de lava na ilha vulcânica (Fornalha): divisor de áreas com passagens de rocha (spec §3.5)
  lavaStreams: 0, // 0 = auto (1 ou 2 córregos, por semente); 1 | 2 força
  lavaPassages: 0, // 0 = auto (1 ou 2 passagens por córrego, por semente); 1 | 2 força (por córrego)
  lavaWidth: [3, 4], // largura do córrego em células da grade (3–4 células = 2,25–3 u com grid 256 / size 192)
  rivers: 0, // rios por continente (spec §2.2): 0 = sem rios; o rio nasce no interior, desce até a costa e tem vaus a cada ~25 u
  riverWidth: [3.4, 5], // largura do canal (u)
  riverFordSpacing: 25 // distância média entre vaus ao longo do rio (u)
});
