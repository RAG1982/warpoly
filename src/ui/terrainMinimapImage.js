/**
 * src/ui/terrainMinimapImage.js (F2-05 · mapas orientados a dados)
 *
 * Desenha, uma única vez, uma imagem do terreno (água/areia/grama/rocha por altura) num canvas
 * offscreen do tamanho pedido — usada pelo minimapa em jogo (`UIManager.drawMinimap`, 1× por
 * partida) e pelas miniaturas do menu de escaramuça (`MainMenu.js`, sem uma `Terrain`/cena viva).
 * Por padrão amostra `getHeightForMap` (puro, sem three.js); passe `getHeight` para usar uma
 * `Terrain` já criada (mesmo resultado, mais rápido: sem redespachar pelo registro do gerador).
 */
import { getHeightForMap } from '../world/terrainGenerators.js';

const WATER = { r: 30, g: 72, b: 96 };
const SAND = { r: 212, g: 190, b: 131 };
const GRASS = { r: 98, g: 158, b: 70 };
const ROCK = { r: 138, g: 130, b: 118 };

/** @returns {HTMLCanvasElement} */
export function renderTerrainImage(mapDef, w, h, getHeight = (x, z) => getHeightForMap(mapDef, x, z)) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const size = mapDef.size;
  const img = ctx.createImageData(w, h);
  const data = img.data;

  for (let py = 0; py < h; py++) {
    const z = (py / h - 0.5) * size;
    for (let px = 0; px < w; px++) {
      const x = (px / w - 0.5) * size;
      const height = getHeight(x, z);
      const c = height < 0.2 ? WATER : height < 0.68 ? SAND : height < 1.9 ? GRASS : ROCK;
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
