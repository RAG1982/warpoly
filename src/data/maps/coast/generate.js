/**
 * src/data/maps/coast/generate.js (MUNDO-TERRENO-MAPAS §2.2 · MUNDO-1)
 *
 * Gera, de forma determinística por semente, um mapa de altura + máscara terra/água com 2 continentes de contorno irregular e
 * várias ilhas de tipos diferentes entre eles. Módulo puro (sem DOM/three/Math.random): toda a aleatoriedade vem do PRNG
 * `mulberry32` semeado por `options.seed`.
 *
 * Algoritmo (resumo):
 *  1. Cada entidade (continente/ilha/ilhota) tem um campo escalar `f(x,z) = 1 - r/R(θ) + ruído + enseadas/penínsulas` (ver `entities.js`).
 *  2. `terra = f > 0` (+ margem de oceano no contorno do mapa), filtro de maioria 3×3 (tira dentes de 1 célula),
 *     recorte por "folga" (distância mínima entre entidades = canal navegável) e fica só o MAIOR componente da entidade.
 *  3. Lagoas pequenas (< `minLake` células, água não ligada ao oceano) viram terra; as grandes ficam como lagos (`lagoons.js`).
 *  4. Lava na ilha vulcânica (`lavaStreams.js`), distância assinada à costa → altura e bioma por entidade (`surface.js`).
 *
 * Índice de células `j * grid + i` (j = z, i = x); x/z em unidades de mundo, centro em (0,0), lado `size`.
 */
import { mulberry32 } from '../../../sim/rng.js';
import { smoothstep } from './noise.js';
import { distanceTransform, majorityFilter, keepLargest } from './grid.js';
import { DEFAULT_OPTIONS } from './constants.js';
import { ISLAND_TYPES, makeHarmonics, continentEntity, islandEntity, entityField } from './entities.js';
import { resolveLagoons } from './lagoons.js';
import { generateLava } from './lavaStreams.js';
import { finalizeSurface } from './surface.js';
import { analyzeMap } from './analyze.js';

/**
 * @param {Partial<typeof DEFAULT_OPTIONS>} [options]
 * @returns {object} mapa: `{ options, size, grid, cell, land, owner, sd, height, biome, entities, lakes, stats }`
 */
export function generateIrregularCoast(options = {}) {
  const o = { ...DEFAULT_OPTIONS, ...options };
  o.seed = Number(o.seed) >>> 0;
  if (!(o.islands >= 5)) throw new Error('irregularCoast: islands deve ser >= 5');
  const G = o.grid, N = G * G, cell = o.size / G, half = o.size / 2;
  const root = mulberry32(o.seed ^ 0x51ed270b);
  const gapCells = Math.ceil(o.gap / cell);
  const toX = (i) => (i + 0.5) * cell - half;

  const land = new Uint8Array(N);
  const owner = new Int16Array(N).fill(-1);
  const entities = [];

  /** Constrói a máscara de uma entidade (campo → limiar → maioria → folga → maior componente). */
  function buildMask(e, occDist) {
    const R = Math.max(e.rx, e.rz) * 1.8;
    const i0 = Math.max(2, Math.floor((e.cx - R + half) / cell)), i1 = Math.min(G - 3, Math.ceil((e.cx + R + half) / cell));
    const j0 = Math.max(2, Math.floor((e.cz - R + half) / cell)), j1 = Math.min(G - 3, Math.ceil((e.cz + R + half) / cell));
    let mask = new Uint8Array(N);
    for (let j = j0; j <= j1; j++) {
      const z = toX(j);
      for (let i = i0; i <= i1; i++) {
        const x = toX(i);
        let f = entityField(e, x, z, o);
        const m = Math.max(Math.abs(x), Math.abs(z)) / half;
        f -= 3 * smoothstep(0.86, 0.97, m); // oceano garantido no contorno do mapa
        if (f > 0) mask[j * G + i] = 1;
      }
    }
    mask = majorityFilter(mask, G, 2);
    if (occDist) for (let c = 0; c < N; c++) if (mask[c] && occDist[c] < gapCells) mask[c] = 0;
    return keepLargest(mask, G);
  }

  function commit(e, mask) {
    let area = 0;
    for (let c = 0; c < N; c++) if (mask[c]) { land[c] = 1; owner[c] = e.index; area++; }
    e.area = area * cell * cell;
  }

  // 1. continentes
  const rngC = root.fork('continents');
  const sp = o.continentSpacing * o.size;
  const cA = continentEntity('continente-oeste', 'lush', -sp, rngC.range(-0.03, 0.03) * o.size, rngC, o, (o.seed ^ 0x1111) | 0);
  let cB;
  if (o.symmetry === 'mirror') {
    cB = { ...cA, id: 'continente-leste', biome: 'arid', cx: -cA.cx, cz: -cA.cz, flipX: true, rot: cA.rot, seed: (o.seed ^ 0x2222) | 0 };
  } else {
    cB = continentEntity('continente-leste', 'arid', sp, rngC.range(-0.03, 0.03) * o.size, rngC, o, (o.seed ^ 0x2222) | 0);
  }
  for (const e of [cA, cB]) {
    e.index = entities.length; entities.push(e);
    commit(e, buildMask(e, e.index === 0 ? null : distanceTransform(land, G)));
  }

  // 2. ilhas (posição por amostragem com rejeição; tentativas com novo sorteio se a máscara sair pequena)
  const rngI = root.fork('islands');
  const order = [];
  for (let k = 0; k < o.islands; k++) order.push(ISLAND_TYPES[k % ISLAND_TYPES.length]);
  const placed = []; // {x,z,r}
  const tryPlace = (type, rr, attempts, minAreaFrac, rngP, zone) => {
    const occ = distanceTransform(land, G);
    for (let a = 0; a < attempts; a++) {
      const r = rr ?? rngP.range(type.r[0], type.r[1]);
      const cx = rngP.range(-zone.x, zone.x) * o.size, cz = rngP.range(-zone.z, zone.z) * o.size;
      const iC = Math.floor((cx + half) / cell), jC = Math.floor((cz + half) / cell);
      if (occ[jC * G + iC] * cell < r * 1.2 + o.gap) continue;
      if (placed.some((p) => Math.hypot(p.x - cx, p.z - cz) < p.r + r * 1.2 + o.gap + 1)) continue;
      return { cx, cz, r, occ };
    }
    return null;
  };
  for (let k = 0; k < order.length; k++) {
    const type = order[k];
    let ok = false;
    for (let attempt = 0; attempt < 14 && !ok; attempt++) {
      const spot = tryPlace(type, null, 200, 0.5, rngI, { x: 0.16, z: 0.39 });
      if (!spot) continue;
      const e = islandEntity(`ilha-${k + 1}-${type.biome}`, type, spot.cx, spot.cz, rngI, o, (o.seed * 31 + k * 977 + attempt) | 0);
      e.rx = spot.r * type.stretch; e.rz = spot.r / Math.sqrt(type.stretch);
      const mask = buildMask(e, spot.occ);
      let area = 0; for (let c = 0; c < N; c++) area += mask[c];
      if (area * cell * cell < 0.45 * Math.PI * e.rx * e.rz) continue;
      e.index = entities.length; entities.push(e); commit(e, mask);
      placed.push({ x: e.cx, z: e.cz, r: Math.max(e.rx, e.rz) });
      ok = true;
    }
  }
  // 3. arquipélago: ilhotas ao redor da ilha "tropical" (ou da última)
  const host = entities.find((e) => e.biome === 'tropical') ?? entities[entities.length - 1];
  for (let k = 0; k < o.islets; k++) {
    let occ = distanceTransform(land, G);
    for (let attempt = 0; attempt < 120; attempt++) {
      const rr = rngI.range(2.8, 4.4);
      const ang = rngI.range(0, Math.PI * 2), dist = Math.max(host.rx, host.rz) * rngI.range(1.5, 2.6) + o.gap;
      const cx = host.cx + Math.cos(ang) * dist, cz = host.cz + Math.sin(ang) * dist;
      if (Math.abs(cx) > half * 0.8 || Math.abs(cz) > half * 0.8) continue;
      const iC = Math.floor((cx + half) / cell), jC = Math.floor((cz + half) / cell);
      if (occ[jC * G + iC] * cell < rr * 1.5 + o.gap) continue;
      if (placed.some((p) => Math.hypot(p.x - cx, p.z - cz) < p.r + rr * 1.5 + o.gap)) continue;
      const e = {
        id: `ilhota-${k + 1}`, kind: 'islet', biome: 'islet', cx, cz, rx: rr, rz: rr * rngI.range(0.7, 1), rot: rngI.range(0, Math.PI), seed: (o.seed * 57 + k * 131) | 0,
        flipX: false, harmonics: makeHarmonics(rngI, 0.9), noise: 0.5, warp: 0.25, rough: 0.8, features: []
      };
      const mask = buildMask(e, occ);
      let area = 0; for (let c = 0; c < N; c++) area += mask[c];
      if (area * cell * cell < 12) continue;
      e.index = entities.length; entities.push(e); commit(e, mask);
      placed.push({ x: cx, z: cz, r: rr });
      break;
    }
  }

  // 4. lagoas: água não ligada ao oceano e pequena vira terra; grandes ficam como lagos
  const { lakes } = resolveLagoons(land, owner, G, o.minLake);
  for (const e of entities) { let a = 0; for (let c = 0; c < N; c++) if (owner[c] === e.index) a++; e.area = a * cell * cell; }

  const map = { options: o, size: o.size, grid: G, cell, land, owner, entities, lakes };
  map.lava = o.lava ? generateLava(map, root) : null;
  finalizeSurface(map);
  map.stats = analyzeMap(map);
  return map;
}
