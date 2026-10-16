/**
 * Mapa de fixture do render regional (MUNDO-5): pequeno (96 × 96), com `painted` + `biomeGrid` + `lavaGrid` montados no próprio teste
 * (os mapas do jogo ainda não têm `biomeGrid`). Layout (x para leste, z para o sul):
 *
 *  - continente x ∈ [-40, 40], z ∈ [-34, 6]: a metade oeste (x < 0) é GRAMA, com uma faixa de FLORESTA e um canto de NEVE;
 *    a metade leste (x ≥ 0) é DESERTO, com uma faixa de ESTEPE e um lago (água rasa, areia em volta);
 *  - ilha vulcânica (círculo c = (0, 30), r = 13): VULCÂNICO com um anel de ROCHA (6 ≤ r < 8) e um córrego de LAVA de oeste a leste
 *    (z ≈ 30, 3 células) com uma passagem de rocha em x ≈ 0;
 *  - o resto é mar (h = -1,5); uma faixa de AREIA de 2 células contorna cada massa de terra.
 */
import { encodeHeights, paintedNodes } from '../../../src/data/maps/painted.js';
import { BIOME, encodeBiomeGrid } from '../../../src/data/maps/biome.js';
import { encodeLavaGrid } from '../../../src/data/maps/lava.js';

export const FIXTURE_SIZE = 96;

const inRect = (x, z, x0, x1, z0, z1) => x >= x0 && x <= x1 && z >= z0 && z <= z1;
const rectDist = (x, z, x0, x1, z0, z1) => Math.max(x0 - x, 0, x - x1, z0 - z, 0, z - z1); // distância (Chebyshev) ao retângulo

/** Descreve a célula (x, z): `{ h, biome, lava }`. */
export function fixtureCell(x, z) {
  const R = { x0: -40, x1: 40, z0: -34, z1: 6 };
  const cx = 0, cz = 30, cr = 13;
  const dIsland = Math.hypot(x - cx, z - cz);
  // lago do deserto: círculo (24, -14) r 5
  const dLake = Math.hypot(x - 24, z + 14);

  // ilha vulcânica
  if (dIsland <= cr) {
    const beach = cr - dIsland < 2;
    const lavaStripe = Math.abs(z - cz) <= 1.5 && Math.abs(x - cx) <= cr - 2;
    const passage = Math.abs(x - cx) <= 1;
    if (lavaStripe && !passage) return { h: 0.4, biome: BIOME.LAVA, lava: true };
    if (lavaStripe && passage) return { h: 1.2, biome: BIOME.ROCK, lava: false };
    if (beach) return { h: 1.0, biome: BIOME.SAND, lava: false };
    return { h: 2.6, biome: dIsland >= 6 && dIsland < 8 ? BIOME.ROCK : BIOME.VOLCANIC, lava: false }; // anel de rocha no meio do vulcânico
  }

  // continente
  const dRect = rectDist(x, z, R.x0, R.x1, R.z0, R.z1);
  if (dRect > 2) return { h: -1.5, biome: BIOME.SEA, lava: false };
  if (dRect > 0) return { h: 0.7, biome: BIOME.SAND, lava: false }; // praia fora do retângulo (2 células)
  if (dLake <= 5) return { h: 0.2, biome: BIOME.SEA, lava: false }; // lago (água rasa)
  if (dLake <= 7) return { h: 1.0, biome: BIOME.SAND, lava: false };
  if (rectDist(x, z, R.x0 + 2, R.x1 - 2, R.z0 + 2, R.z1 - 2) > 0) return { h: 1.0, biome: BIOME.SAND, lava: false }; // faixa de praia dentro
  let biome;
  if (x < 0) {
    biome = BIOME.GRASS;
    if (inRect(x, z, -32, -20, -28, -12)) biome = BIOME.FOREST;
    if (inRect(x, z, -38, -33, -32, -27)) biome = BIOME.SNOW;
  } else {
    biome = BIOME.DESERT;
    if (inRect(x, z, 6, 14, -30, -2)) biome = BIOME.STEPPE;
  }
  return { h: 2.6, biome, lava: false };
}

/** Monta o `mapDef` da fixture. `tileset` = tileset base do mapa; `withBiomes`/`withLava` ligam as grades. */
export function makeRegionalMap({ id = 'fixture-regional', tileset = 'exuberante', size = FIXTURE_SIZE, withBiomes = true, withLava = true } = {}) {
  const cell = 1;
  const nodes = paintedNodes(size, cell);
  const h = new Int8Array(nodes * nodes);
  const bio = new Uint8Array(nodes * nodes);
  const lava = new Uint8Array(nodes * nodes);
  for (let j = 0; j < nodes; j++) {
    for (let i = 0; i < nodes; i++) {
      const c = fixtureCell(-size / 2 + i * cell, -size / 2 + j * cell);
      h[j * nodes + i] = Math.round(c.h * 10);
      bio[j * nodes + i] = c.biome;
      if (c.lava) lava[j * nodes + i] = 1;
    }
  }
  const mapDef = {
    id,
    name: 'Fixture regional',
    size,
    playable: size - 8,
    waterLevel: 0.5,
    tileset,
    terrain: { generator: 'painted', params: { cell, nodes, data: encodeHeights(h) } },
    startSlots: [{ x: -30, z: -10 }, { x: 30, z: -26 }],
    resources: [{ type: 'gold', x: -24, z: -4, amount: 5000 }],
    forests: [{ species: 'oak', x: -26, z: -20, count: 10, radius: 5 }, { species: 'pine', x: 10, z: -16, count: 6, radius: 4 }],
    fords: []
  };
  if (withBiomes) mapDef.biomeGrid = { cell, nodes, data: encodeBiomeGrid(bio) };
  if (withLava) mapDef.lavaGrid = { cell, nodes, data: encodeLavaGrid(lava) };
  return mapDef;
}
