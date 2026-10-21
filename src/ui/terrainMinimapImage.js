/**
 * src/ui/terrainMinimapImage.js (F2-05 · mapas orientados a dados; M2-26 · cor de bioma)
 *
 * Desenha, uma única vez, uma imagem do terreno (água/areia/terra/rocha) num canvas
 * offscreen do tamanho pedido — usada pelo minimapa em jogo (`UIManager.drawMinimap`, 1× por
 * partida) e pelas miniaturas do menu de escaramuça (`MainMenu.js`, sem uma `Terrain`/cena viva).
 * Por padrão amostra `getHeightForMap` (puro, sem three.js); passe `getHeight` para usar uma
 * `Terrain` já criada (mesmo resultado, mais rápido: sem redespachar pelo registro do gerador).
 *
 * M2-26: com `mapDef.biomeGrid` a TERRA leva a cor do bioma (grama, savana, deserto, rocha, vulcânico, neve, pântano, gelo, floresta,
 * lava…) em vez do cinza-marrom por altura; água, praia e sombreado sutil por altura continuam. Sem `biomeGrid` o resultado é o de sempre.
 */
import { getHeightForMap } from '../world/terrainGenerators.js';
import { BIOME, gridOfBiome } from '../data/maps/biome.js';
import { buildLavaInfo } from '../data/lavaRender.js';

/** M2-18: cor da lava no minimapa (laranja de brasa; o miolo é mais claro, a borda mais escura) — vale também em mapa só com `lavaGrid`. */
export const MINIMAP_LAVA = Object.freeze({ edge: { r: 196, g: 62, b: 20 }, core: { r: 255, g: 140, b: 48 } });

const WATER = { r: 30, g: 72, b: 96 };
const SAND = { r: 212, g: 190, b: 131 };
const GRASS = { r: 98, g: 158, b: 70 };
const ROCK = { r: 138, g: 130, b: 118 };

/** Cor da terra por bioma (id de `BIOME`). Mar (0) e ids desconhecidos não têm cor: caem na regra por altura. */
export const MINIMAP_BIOME_COLOR = Object.freeze({
  [BIOME.SAND]: SAND,
  [BIOME.GRASS]: GRASS,
  [BIOME.SAVANNA]: { r: 176, g: 160, b: 84 },
  [BIOME.DESERT]: { r: 218, g: 186, b: 112 },
  [BIOME.STEPPE]: { r: 166, g: 148, b: 88 },
  [BIOME.ROCK]: ROCK,
  [BIOME.VOLCANIC]: { r: 82, g: 62, b: 58 },
  [BIOME.LAVA]: { r: 218, g: 84, b: 30 },
  [BIOME.SNOW]: { r: 236, g: 242, b: 248 },
  [BIOME.SWAMP]: { r: 84, g: 98, b: 54 },
  [BIOME.ICE]: { r: 176, g: 214, b: 234 },
  [BIOME.FOREST]: { r: 56, g: 112, b: 54 }
});

/**
 * Cor (RGB 0..255) de um ponto do minimapa: `biome` = id do `biomeGrid` ou `null` (mapa sem grade). Água pela altura; praia (altura
 * baixa) mistura areia com o bioma; o resto é o bioma com um sombreado leve pela altura.
 * @returns {{r:number,g:number,b:number}}
 */
export function minimapColorAt(height, biome) {
  if (height < 0.2) return WATER;
  const bc = biome != null ? MINIMAP_BIOME_COLOR[biome] : undefined;
  if (!bc) return height < 0.68 ? SAND : height < 1.9 ? GRASS : ROCK;
  if (biome === BIOME.LAVA) return bc;
  const shade = 0.93 + Math.min(0.14, Math.max(0, (height - 0.7) * 0.05)); // 0,93 na praia … 1,07 nos picos
  let c = bc;
  if (height < 0.68 && biome !== BIOME.SAND) {
    // praia do bioma: metade areia
    c = { r: (bc.r + SAND.r) / 2, g: (bc.g + SAND.g) / 2, b: (bc.b + SAND.b) / 2 };
  }
  return { r: Math.min(255, c.r * shade), g: Math.min(255, c.g * shade), b: Math.min(255, c.b * shade) };
}

/** @returns {HTMLCanvasElement} */
export function renderTerrainImage(mapDef, w, h, getHeight = (x, z) => getHeightForMap(mapDef, x, z)) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const size = mapDef.size;
  const img = ctx.createImageData(w, h);
  const data = img.data;

  const bg = mapDef.biomeGrid;
  const grid = bg ? gridOfBiome(bg) : null;
  const nodes = bg ? bg.nodes : 0;
  const cell = bg ? bg.cell || 1 : 1;
  let lava = null;
  try { lava = buildLavaInfo(mapDef); } catch { lava = null; }

  for (let py = 0; py < h; py++) {
    const z = (py / h - 0.5) * size;
    for (let px = 0; px < w; px++) {
      const x = (px / w - 0.5) * size;
      const height = getHeight(x, z);
      let biome = null;
      if (grid) {
        const bx = Math.round((x + size / 2) / cell), bz = Math.round((z + size / 2) / cell);
        if (bx >= 0 && bz >= 0 && bx < nodes && bz < nodes) biome = grid[bz * nodes + bx];
      }
      let c = minimapColorAt(height, biome);
      if (lava && lava.isLavaAt(x, z)) {
        const k = 0.5 + 0.5 * Math.sin(x * 0.37) * Math.sin(z * 0.31); // veios claros e escuros, como o fluxo da lava
        const { edge, core } = MINIMAP_LAVA;
        c = { r: edge.r + (core.r - edge.r) * k, g: edge.g + (core.g - edge.g) * k, b: edge.b + (core.b - edge.b) * k };
      }
      const i = (py * w + px) * 4;
      data[i] = c.r;
      data[i + 1] = c.g;
      data[i + 2] = c.b;
      data[i + 3] = 255;
    }
  }

  ctx.putImageData(img, 0, 0);
  return canvas;
}
