/**
 * src/data/maps/coast/bake.js (MUNDO-TERRENO-MAPAS §2.5 · MUNDO-1)
 *
 * Assa o mapa gerado numa definição de mapa jogável (`terrain.generator: "painted"`, alturas em décimos Int8 em base64) com
 * `lavaGrid` e `biomeGrid`. O runtime só lê bytes: o campo do gerador usa `sin/cos/atan2/exp`, cujas últimas casas podem diferir
 * entre motores, por isso o gerador roda em ferramenta/editor e o jogo carrega o resultado assado (determinismo em rede e replay).
 */
import { toH10, encodeHeights, paintedNodes, PAINTED_SCALE } from '../painted.js';
import { encodeLavaGrid } from '../lava.js';
import { encodeRleBiomeGrid } from '../biome.js';
import { LAVA_HEIGHT } from './constants.js';

/**
 * Amostra o mapa gerado numa grade regular de nós (x = -size/2 + i·cell): alturas em décimos (Int8, interpolação bilinear da
 * grade do gerador), lava (1 = lava) e bioma por nó (vizinho mais próximo).
 * @returns {{ size: number, cell: number, nodes: number, heights: Int8Array, lavaData: Uint8Array|null, biomeData: Uint8Array }}
 */
export function bakeTerrain(map, { cell = 1 } = {}) {
  const size = map.size;
  const G = map.grid;
  const nodes = paintedNodes(size, cell);
  const heights = new Int8Array(nodes * nodes);
  const lavaData = map.lava ? new Uint8Array(nodes * nodes) : null;
  const biomeData = new Uint8Array(nodes * nodes);

  for (let j = 0; j < nodes; j++) {
    const z = -size / 2 + j * cell;
    const gz = Math.max(0, Math.min(G - 1, ((z + size / 2) / size) * (G - 1)));
    const j0 = Math.floor(gz);
    const j1 = Math.min(G - 1, j0 + 1);
    const tz = gz - j0;

    for (let i = 0; i < nodes; i++) {
      const x = -size / 2 + i * cell;
      const gx = Math.max(0, Math.min(G - 1, ((x + size / 2) / size) * (G - 1)));
      const i0 = Math.floor(gx);
      const i1 = Math.min(G - 1, i0 + 1);
      const tx = gx - i0;

      const h00 = map.height[j0 * G + i0];
      const h10 = map.height[j0 * G + i1];
      const h01 = map.height[j1 * G + i0];
      const h11 = map.height[j1 * G + i1];
      const top = h00 + (h10 - h00) * tx;
      const bot = h01 + (h11 - h01) * tx;
      const h = top + (bot - top) * tz;

      const gi = Math.round(gx);
      const gj = Math.round(gz);
      const isLava = map.lava ? map.lava.mask[gj * G + gi] === 1 : false;
      biomeData[j * nodes + i] = map.biome[gj * G + gi];

      if (isLava) {
        if (lavaData) lavaData[j * nodes + i] = 1;
        heights[j * nodes + i] = toH10(LAVA_HEIGHT);
      } else {
        heights[j * nodes + i] = toH10(h);
      }
    }
  }
  return { size, cell, nodes, heights, lavaData, biomeData };
}

/** Altura (u) do terreno assado em (x, z): a mesma interpolação bilinear de `paintedHeight` (`../painted.js`), sem passar por base64. */
export function bakedHeightFn(baked) {
  const { nodes, cell, size, heights } = baked;
  const half = size / 2;
  return (x, z) => {
    const fx = Math.max(0, Math.min(nodes - 1, (x + half) / cell));
    const fz = Math.max(0, Math.min(nodes - 1, (z + half) / cell));
    const i0 = Math.min(nodes - 2, Math.floor(fx));
    const j0 = Math.min(nodes - 2, Math.floor(fz));
    const tx = fx - i0;
    const tz = fz - j0;
    const a = heights[j0 * nodes + i0];
    const b = heights[j0 * nodes + i0 + 1];
    const c = heights[(j0 + 1) * nodes + i0];
    const d = heights[(j0 + 1) * nodes + i0 + 1];
    const top = a + (b - a) * tx;
    const bot = c + (d - c) * tx;
    return (top + (bot - top) * tz) / PAINTED_SCALE;
  };
}

/**
 * Converte o mapa gerado pelo irregularCoast em uma definição de mapa jogável ("painted") com suporte a lavaGrid.
 * @param {object} map  resultado de generateIrregularCoast
 * @param {object} [opts]  configurações do mapa (id, name, tileset, startSlots, resources, etc.); `biomeGrid: true` grava também o `biomeGrid` (RLE)
 * @returns {object} mapDef completo no formato aceito pelo jogo
 */
export function bakeToMapDef(map, {
  id = 'costa-irregular-1',
  name = 'Costa Irregular',
  tileset = 'vulcanico',
  cell = 1,
  playable = 180,
  maxPlayers = 2,
  startSlots = null,
  resources = null,
  forests = null,
  fords = [],
  neutrals = [],
  biomeGrid = false,
  baked = null
} = {}) {
  const size = map.size;
  const { nodes, heights, lavaData, biomeData } = baked ?? bakeTerrain(map, { cell });

  // Se startSlots não foram fornecidos, deriva 2 slots nos continentes/áreas habitáveis
  const slots = startSlots || [
    { x: Math.round(-size * 0.28), z: 0 },
    { x: Math.round(size * 0.28), z: 0 }
  ];

  const res = resources || [
    { type: 'gold', x: slots[0].x + 10, z: slots[0].z + 6, amount: 20000 },
    { type: 'gold', x: slots[1].x - 10, z: slots[1].z - 6, amount: 20000 }
  ];

  const forst = forests || [
    { species: 'oak', x: slots[0].x - 6, z: slots[0].z - 12, count: 24, radius: 8 },
    { species: 'oak', x: slots[1].x + 6, z: slots[1].z + 12, count: 24, radius: 8 }
  ];

  return {
    id,
    name,
    size,
    playable,
    waterLevel: 0.5,
    tileset,
    maxPlayers,
    terrain: {
      generator: 'painted',
      params: {
        cell,
        nodes,
        data: encodeHeights(heights)
      }
    },
    ...(lavaData ? {
      lavaGrid: {
        cell,
        nodes,
        data: encodeLavaGrid(lavaData)
      }
    } : {}),
    ...(biomeGrid ? { biomeGrid: { cell, nodes, encoding: 'rle', data: encodeRleBiomeGrid(biomeData) } } : {}),
    startSlots: slots,
    resources: res,
    forests: forst,
    fords,
    neutrals
  };
}
