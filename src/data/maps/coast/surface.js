/**
 * src/data/maps/coast/surface.js (MUNDO-TERRENO-MAPAS §2.2 passos 4–5 · MUNDO-1)
 *
 * Superfície do mundo: distância assinada à costa (`sd`), altura (praia rasa, interior ~2,6, fundo até −3,6 no mar, cone e cratera
 * no vulcão, cordilheira no continente exuberante, leito dos rios, platô dos vaus, lava a 0,4) e bioma por célula.
 * Altera `map` no lugar: define `map.sd`, `map.height` e `map.biome`.
 */
import { fbm, smoothstep, clamp } from './noise.js';
import { distanceTransform, boxBlur } from './grid.js';
import { BIOME, LAVA_HEIGHT, FORD_HEIGHT, RIVER_BED_EDGE, RIVER_BED_CENTER } from './constants.js';
import { lushMountain } from './entities.js';
import { rotateIndex } from './rotate.js';

export function finalizeSurface(map) {
  const { grid: G, cell, land, owner, entities, size } = map;
  const N = G * G, half = size / 2;
  const rv = map.rivers;
  // terra seca = terra menos a ÁGUA dos rios: o rio entra na distância assinada como água (margem de areia, praia rasa e leito fundo)
  let dry = land;
  if (rv) { dry = new Uint8Array(N); for (let c = 0; c < N; c++) dry[c] = land[c] && !rv.mask[c] ? 1 : 0; }
  const water = new Uint8Array(N);
  for (let c = 0; c < N; c++) water[c] = dry[c] ? 0 : 1;
  const dLand = distanceTransform(dry, G); // em água: distância à terra
  const dWater = distanceTransform(water, G); // em terra: distância à água
  const sdRaw = new Float32Array(N);
  for (let c = 0; c < N; c++) sdRaw[c] = dry[c] ? (dWater[c] - 0.5) * cell : -(dLand[c] - 0.5) * cell;
  const sd = boxBlur(sdRaw, G, 2); // costa suave para a amostragem bilinear
  const height = new Float32Array(N);
  const biome = new Uint8Array(N);
  const seed = map.options.seed | 0;
  const lv = map.lava;
  const dLava = lv ? distanceTransform(lv.mask, G) : null;
  for (let j = 0; j < G; j++) {
    const z = (j + 0.5) * cell - half;
    for (let i = 0; i < G; i++) {
      const c = j * G + i, x = (i + 0.5) * cell - half;
      const d = sd[c];
      if (!land[c]) {
        height[c] = 0.55 - Math.min(4.1, Math.max(0, -d) * 0.32);
        biome[c] = BIOME.SEA;
        continue;
      }
      const e = entities[owner[c]] ?? entities[0];
      const dd = Math.max(0, d);
      let h = 0.72 + Math.min(1.88, dd * 0.42);
      h += (fbm(x * 0.09, z * 0.09, seed + 7, 3) - 0.5) * 0.35 * smoothstep(1, 5, dd);
      let b = BIOME.GRASS;
      const beach = e.kind === 'continent' ? 1.7 : e.biome === 'tropical' || e.biome === 'atoll' || e.kind === 'islet' ? 2.4 : 1.2;
      const nz = fbm(x * 0.05, z * 0.05, seed + 21, 4);
      const nz2 = fbm(x * 0.11 + 40, z * 0.11 - 9, seed + 33, 3);
      const zn = (z - e.cz) / (e.rz || 1);
      if (e.biome === 'lush') {
        const mount = lushMountain(e, x, z, dd, seed);
        h += mount * 3.4;
        b = h > 4.0 ? BIOME.SNOW : h > 3.35 ? BIOME.ROCK : (zn > 0.12 && nz > 0.5) ? BIOME.SAVANNA : nz2 > 0.56 && dd > 4 ? BIOME.FOREST : BIOME.GRASS;
      } else if (e.biome === 'arid') {
        const dune = Math.sin((x * 0.9 + z * 0.35) * 0.22 + nz * 6) * 0.5 + 0.5;
        h += dune * 0.25 * smoothstep(2, 8, dd);
        const rockN = fbm(x * 0.07 - 31, z * 0.07 + 12, seed + 55, 3);
        if (rockN > 0.66 && dd > 6) { b = BIOME.ROCK; h += (rockN - 0.66) * 6; }
        else if (nz2 > 0.64 && dd < 16) b = BIOME.SWAMP;
        else if (nz > 0.55) b = BIOME.STEPPE;
        else b = BIOME.DESERT;
      } else if (e.biome === 'volcanic') {
        const rc = Math.hypot(x - e.cx, z - e.cz) / Math.max(e.rx, e.rz);
        h += 3.4 * Math.pow(Math.max(0, 1 - rc * 1.15), 1.3) - 1.2 * smoothstep(0.2, 0, rc);
        b = rc < 0.62 || nz > 0.62 ? BIOME.VOLCANIC : BIOME.ROCK;
      } else if (e.biome === 'rocky') {
        b = nz > 0.64 && dd > 3 ? BIOME.GRASS : BIOME.ROCK;
        h += (fbm(x * 0.12, z * 0.12, seed + 63, 3) - 0.4) * 2 * smoothstep(2, 7, dd);
      } else if (e.biome === 'ice') {
        b = dd < 2.2 ? BIOME.ICE : nz > 0.62 ? BIOME.ROCK : BIOME.SNOW;
      } else if (e.biome === 'swamp') {
        b = nz > 0.6 ? BIOME.GRASS : BIOME.SWAMP;
      } else if (e.biome === 'atoll') {
        b = dd > 3.4 && nz > 0.45 ? BIOME.GRASS : BIOME.SAND;
      } else { // tropical, islet
        b = dd > 3.2 ? BIOME.GRASS : BIOME.SAND;
      }
      if (dd < beach && b !== BIOME.LAVA) b = e.biome === 'ice' ? BIOME.ICE : e.biome === 'swamp' && nz2 > 0.5 ? BIOME.SWAMP : BIOME.SAND;
      if (lv) {
        if (lv.mask[c]) { h = LAVA_HEIGHT; b = BIOME.LAVA; } // lava: nem terrestre (< 0,65) nem naval (> 0,1)
        else if (lv.passage[c]) { h = Math.max(h, 1.05); b = BIOME.ROCK; } // passagem = rocha resfriada, caminhável
        else if (dLava[c] <= 3 && b !== BIOME.SAND) b = BIOME.VOLCANIC; // cinza/basalto ao redor do fluxo
      }
      if (rv) {
        if (rv.mask[c]) { h = RIVER_BED_EDGE + (RIVER_BED_CENTER - RIVER_BED_EDGE) * clamp(-d / 2.2, 0, 1); b = BIOME.SAND; } // leito: abaixo de 0,65 (bloqueia terrestres)
        else if (rv.ford[c]) { h = Math.max(h, FORD_HEIGHT + Math.sin(x * 0.5) * 0.05); b = BIOME.SAND; } // vau: platô seco e caminhável
      }
      height[c] = h;
      biome[c] = b;
    }
  }
  if (map.options.symmetry === 'rotate') {
    // simetria 'rotate': o ruído da superfície depende da posição absoluta; a média de cada célula com a girada (e o bioma da de menor
    // índice) deixa altura, distância e bioma EXATAMENTE simétricos. Terra, rios e vaus já são simétricos por construção.
    for (let c = 0; c < N; c++) {
      const r = rotateIndex(c, G);
      if (r <= c) continue;
      const h = (height[c] + height[r]) / 2, d = (sd[c] + sd[r]) / 2;
      height[c] = height[r] = h; sd[c] = sd[r] = d; biome[r] = biome[c];
    }
  }
  map.sd = sd; map.height = height; map.biome = biome;
}
