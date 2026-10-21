/**
 * src/data/maps/coast/generate.js (MUNDO-TERRENO-MAPAS §2.2 · MUNDO-1)
 *
 * Gera, de forma determinística por semente, um mapa de altura + máscara terra/água com continentes de contorno irregular e
 * ilhas de tipos diferentes. Módulo puro (sem DOM/three/Math.random): toda a aleatoriedade vem do PRNG `mulberry32` semeado por
 * `options.seed`.
 *
 * Algoritmo (resumo):
 *  1. Cada entidade (continente/ilha/ilhota) tem um campo escalar `f(x,z) = 1 - r/R(θ) + ruído + enseadas/penínsulas` (ver `entities.js`).
 *  2. `terra = f > 0` (+ margem de oceano no contorno do mapa), filtro de maioria 3×3 (tira dentes de 1 célula),
 *     recorte por "folga" (distância mínima entre entidades = canal navegável) e fica só o MAIOR componente da entidade.
 *  3. Lagoas pequenas (< `minLake` células, água não ligada ao oceano) viram terra; as grandes ficam como lagos (`lagoons.js`).
 *  4. Lava na ilha vulcânica (`lavaStreams.js`), rios com vaus nos continentes (`rivers.js`), distância assinada à costa → altura e
 *     bioma por entidade (`surface.js`).
 *
 * Configurações (`options.continents`): 2 continentes (oeste × leste, padrão: o protótipo do spec), 1 massa central com duas costas
 * (`duelo-continental`, `ilha-unica`, `mundo-campanha`) ou nenhum (`arquipelago-vivo`, só ilhas e ilhas grandes). A simetria
 * `rotate` (rotação de 180°) deixa a terra, a altura, o bioma e os rios EXATAMENTE simétricos (mapas competitivos).
 *
 * Índice de células `j * grid + i` (j = z, i = x); x/z em unidades de mundo, centro em (0,0), lado `size`.
 */
import { mulberry32 } from '../../../sim/rng.js';
import { smoothstep, fbm } from './noise.js';
import { labelComponents, distanceTransform, majorityFilter, keepLargest } from './grid.js';
import { DEFAULT_OPTIONS } from './constants.js';
import { ISLAND_TYPES, BIG_ISLAND_BIOMES, makeHarmonics, makeFeatures, continentEntity, islandEntity, entityField } from './entities.js';
import { resolveLagoons } from './lagoons.js';
import { generateLava } from './lavaStreams.js';
import { generateRivers } from './rivers.js';
import { finalizeSurface } from './surface.js';
import { applyShoals } from './shoals.js';
import { analyzeMap } from './analyze.js';
import { rotateIndex } from './rotate.js';

/**
 * API original do protótipo: 2 continentes (por padrão) e `islands >= 5` ilhas. Use `generateCoast` para configurações livres.
 * @param {Partial<typeof DEFAULT_OPTIONS>} [options]
 * @returns {object} mapa: `{ options, size, grid, cell, land, owner, sd, height, biome, entities, lakes, lava, rivers, stats }`
 */
export function generateIrregularCoast(options = {}) {
  const islands = options.islands ?? DEFAULT_OPTIONS.islands;
  if (!(islands >= 5)) throw new Error('irregularCoast: islands deve ser >= 5');
  return generateCoast(options);
}

/**
 * Gerador geral de costas (sem o mínimo de 5 ilhas do protótipo). Mesma entrada ⇒ mesmo mapa, byte a byte.
 * @param {Partial<typeof DEFAULT_OPTIONS>} [options]
 */
export function generateCoast(options = {}) {
  const o = { ...DEFAULT_OPTIONS, ...options };
  o.seed = Number(o.seed) >>> 0;
  if (![0, 1, 2].includes(o.continents)) throw new Error('coast: continents deve ser 0, 1 ou 2');
  if (!(o.islands >= 0)) throw new Error('coast: islands deve ser >= 0');
  const sym = o.symmetry === 'rotate';
  if (sym) {
    if (o.continents === 2) throw new Error('coast: symmetry "rotate" não vale com 2 continentes (use 1 ou 0)');
    if (o.bigIslands > 0) throw new Error('coast: symmetry "rotate" não vale com bigIslands');
    o.lava = false; // o córrego de lava é sorteado por ilha e não tem gêmeo: sem lava nos mapas simétricos
  }
  const G = o.grid, N = G * G, cell = o.size / G, half = o.size / 2;
  const root = mulberry32(o.seed ^ 0x51ed270b);
  const gapCells = Math.ceil(o.gap / cell);
  const toX = (i) => (i + 0.5) * cell - half;
  const rotIdx = (c) => rotateIndex(c, G);

  const land = new Uint8Array(N);
  const owner = new Int16Array(N).fill(-1);
  const entities = [];

  /** Máscara girada 180°. */
  function rotMask(mask) {
    const out = new Uint8Array(N);
    for (let c = 0; c < N; c++) if (mask[c]) out[rotIdx(c)] = 1;
    return out;
  }

  /** Constrói a máscara de uma entidade (campo → limiar → maioria → folga → maior componente). `e.sym`: campo e máscara simétricos. */
  function buildMask(e, occDist) {
    const R = Math.max(e.rx, e.rz) * 1.8;
    const i0 = Math.max(2, Math.floor((e.cx - R + half) / cell)), i1 = Math.min(G - 3, Math.ceil((e.cx + R + half) / cell));
    const j0 = Math.max(2, Math.floor((e.cz - R + half) / cell)), j1 = Math.min(G - 3, Math.ceil((e.cz + R + half) / cell));
    let mask = new Uint8Array(N);
    for (let j = j0; j <= j1; j++) {
      const z = toX(j);
      for (let i = i0; i <= i1; i++) {
        const x = toX(i);
        let f = e.sym ? 0.5 * (entityField(e, x, z, o) + entityField(e, -x, -z, o)) : entityField(e, x, z, o);
        const m = Math.max(Math.abs(x), Math.abs(z)) / half;
        f -= 3 * smoothstep(0.86, 0.97, m); // oceano garantido no contorno do mapa
        if (f > 0) mask[j * G + i] = 1;
      }
    }
    mask = majorityFilter(mask, G, 2);
    if (occDist) for (let c = 0; c < N; c++) if (mask[c] && occDist[c] < gapCells) mask[c] = 0;
    if (!e.sym) return keepLargest(mask, G);
    // entidade simétrica: maior componente + o seu gêmeo girado (o centro, se estiver nele, é o próprio gêmeo)
    const lc = labelComponents(mask, G, 1);
    if (lc.sizes.length <= 1) return mask;
    let best = 0;
    for (let k = 1; k < lc.sizes.length; k++) if (lc.sizes[k] > lc.sizes[best]) best = k;
    const out = new Uint8Array(N);
    for (let c = 0; c < N; c++) if (lc.labels[c] === best) { out[c] = 1; out[rotIdx(c)] = 1; }
    return out;
  }

  function commit(e, mask) {
    let area = 0;
    for (let c = 0; c < N; c++) if (mask[c]) { land[c] = 1; owner[c] = e.index; area++; }
    e.area = area * cell * cell;
  }

  /** Registra a entidade e, na simetria `rotate`, o seu gêmeo (a máscara girada 180°, entidade `<id>-b`). */
  function commitEntity(e, mask, twin = sym && !e.sym) {
    e.index = entities.length; entities.push(e);
    commit(e, mask);
    if (twin) {
      const t = { ...e, id: `${e.id}-b`, cx: -e.cx, cz: -e.cz, twinOf: e.index, index: entities.length };
      entities.push(t);
      commit(t, rotMask(mask));
    }
  }

  // 1. continentes
  const rngC = root.fork('continents');
  const sp = o.continentSpacing * o.size;
  if (o.continents === 2) {
    const dims2 = o.continentDims ?? [0.135, 0.34];
    const cA = continentEntity('continente-oeste', 'lush', -sp, rngC.range(-0.03, 0.03) * o.size, rngC, o, (o.seed ^ 0x1111) | 0, dims2);
    let cB;
    if (o.symmetry === 'mirror') {
      cB = { ...cA, id: 'continente-leste', biome: 'arid', cx: -cA.cx, cz: -cA.cz, flipX: true, rot: cA.rot, seed: (o.seed ^ 0x2222) | 0 };
    } else {
      cB = continentEntity('continente-leste', 'arid', sp, rngC.range(-0.03, 0.03) * o.size, rngC, o, (o.seed ^ 0x2222) | 0, dims2);
    }
    for (const e of [cA, cB]) {
      e.index = entities.length; entities.push(e);
      commit(e, buildMask(e, e.index === 0 ? null : distanceTransform(land, G)));
    }
  } else if (o.continents === 1) {
    const [fx, fz] = o.continentCenter ?? [0, 0];
    const jitter = sym || o.continentCenter ? 0 : 1;
    const dims = o.continentDims ?? [0.3, 0.24];
    const c1 = continentEntity('continente', o.continentBiome, (fx + rngC.range(-0.02, 0.02) * jitter) * o.size, (fz + rngC.range(-0.02, 0.02) * jitter) * o.size, rngC, o, (o.seed ^ 0x1111) | 0, dims);
    if (sym) { c1.cx = 0; c1.cz = 0; c1.sym = true; }
    c1.index = entities.length; entities.push(c1);
    commit(c1, buildMask(c1, null));
  }

  // 1b. ilhas grandes (do tamanho de um continente pequeno): arquipélago de 4 jogadores, ou a "cabeça de ponte" do mundo-campanha
  const rngB = root.fork('bigIslands');
  for (let k = 0; k < o.bigIslands; k++) {
    const at = o.bigIslandAt?.[k] ?? [k % 2 ? 0.23 : -0.23, k < 2 ? -0.23 : 0.23];
    const r0 = 0.17 * o.size * o.bigIslandScale * rngB.range(0.92, 1.08);
    const e = {
      id: `ilha-grande-${k + 1}`, kind: 'island', big: true, biome: BIG_ISLAND_BIOMES[k % BIG_ISLAND_BIOMES.length],
      cx: (at[0] + rngB.range(-0.025, 0.025)) * o.size, cz: (at[1] + rngB.range(-0.025, 0.025)) * o.size,
      rx: r0 * rngB.range(1, 1.15), rz: r0, rot: rngB.range(0, Math.PI), seed: (o.seed * 41 + k * 613) | 0, flipX: false,
      harmonics: makeHarmonics(rngB, o.roughness), noise: 0.62, warp: 0.42, rough: 1,
      features: [...makeFeatures(rngB, 2, 'bay'), ...makeFeatures(rngB, 2, 'peninsula')]
    };
    e.index = entities.length; entities.push(e);
    commit(e, buildMask(e, land.some((v) => v) ? distanceTransform(land, G) : null));
  }

  // 2. ilhas (posição por amostragem com rejeição; tentativas com novo sorteio se a máscara sair pequena)
  const rngI = root.fork('islands');
  const placed = []; // {x,z,r}: ilhas e ilhotas já postas (os continentes e as ilhas grandes entram pela distância à terra, `occ`)
  const order = [];
  for (let k = 0; k < o.islands; k++) order.push(ISLAND_TYPES[k % ISLAND_TYPES.length]);
  const zone = o.islandZone ?? (o.continents === 2 ? { x: 0.16, z: 0.39 } : { x: 0.42, z: 0.42 });
  const tryPlace = (type, rr, attempts, minAreaFrac, rngP, zn) => {
    const occ = distanceTransform(land, G);
    for (let a = 0; a < attempts; a++) {
      const r = rr ?? rngP.range(type.r[0], type.r[1]);
      const cx = rngP.range(-zn.x, zn.x) * o.size, cz = rngP.range(-zn.z, zn.z) * o.size;
      const iC = Math.floor((cx + half) / cell), jC = Math.floor((cz + half) / cell);
      if (occ[jC * G + iC] * cell < r * 1.2 + o.gap) continue;
      if (placed.some((p) => Math.hypot(p.x - cx, p.z - cz) < p.r + r * 1.2 + o.gap + 1)) continue;
      if (sym && Math.hypot(cx, cz) < r * 1.3 * Math.max(type.stretch ?? 1, 1.2) + o.gap / 2 + 1) continue; // o gêmeo (girado 180°) não pode encostar
      return { cx, cz, r, occ };
    }
    return null;
  };
  for (let k = 0; k < order.length; k++) {
    const type = order[k];
    let ok = false;
    for (let attempt = 0; attempt < 14 && !ok; attempt++) {
      const spot = tryPlace(type, null, 200, 0.5, rngI, zone);
      if (!spot) continue;
      const e = islandEntity(`ilha-${k + 1}-${type.biome}`, type, spot.cx, spot.cz, rngI, o, (o.seed * 31 + k * 977 + attempt) | 0);
      e.rx = spot.r * type.stretch; e.rz = spot.r / Math.sqrt(type.stretch);
      const mask = buildMask(e, spot.occ);
      let area = 0; for (let c = 0; c < N; c++) area += mask[c];
      if (area * cell * cell < 0.45 * Math.PI * e.rx * e.rz) continue;
      commitEntity(e, mask);
      placed.push({ x: e.cx, z: e.cz, r: Math.max(e.rx, e.rz) });
      if (sym) placed.push({ x: -e.cx, z: -e.cz, r: Math.max(e.rx, e.rz) });
      ok = true;
    }
  }
  // 3. arquipélago: ilhotas ao redor da ilha "tropical" (ou da última)
  const host = entities.find((e) => e.biome === 'tropical') ?? entities[entities.length - 1];
  for (let k = 0; host && k < o.islets; k++) {
    const occ = distanceTransform(land, G);
    for (let attempt = 0; attempt < 120; attempt++) {
      const rr = rngI.range(2.8, 4.4);
      const ang = rngI.range(0, Math.PI * 2), dist = Math.max(host.rx, host.rz) * rngI.range(1.5, 2.6) + o.gap;
      const cx = host.cx + Math.cos(ang) * dist, cz = host.cz + Math.sin(ang) * dist;
      if (Math.abs(cx) > half * 0.8 || Math.abs(cz) > half * 0.8) continue;
      const iC = Math.floor((cx + half) / cell), jC = Math.floor((cz + half) / cell);
      if (occ[jC * G + iC] * cell < rr * 1.5 + o.gap) continue;
      if (placed.some((p) => Math.hypot(p.x - cx, p.z - cz) < p.r + rr * 1.5 + o.gap)) continue;
      if (sym && Math.hypot(cx, cz) < rr * 1.6 + o.gap) continue;
      const e = {
        id: `ilhota-${k + 1}`, kind: 'islet', biome: 'islet', cx, cz, rx: rr, rz: rr * rngI.range(0.7, 1), rot: rngI.range(0, Math.PI), seed: (o.seed * 57 + k * 131) | 0,
        flipX: false, harmonics: makeHarmonics(rngI, 0.9), noise: 0.5, warp: 0.25, rough: 0.8, features: []
      };
      const mask = buildMask(e, occ);
      let area = 0; for (let c = 0; c < N; c++) area += mask[c];
      if (area * cell * cell < 12) continue;
      commitEntity(e, mask);
      placed.push({ x: cx, z: cz, r: rr });
      if (sym) placed.push({ x: -cx, z: -cz, r: rr });
      break;
    }
  }

  // 3b. (M2-04) ilhotas espalhadas por todo o mapa (recifes): sorteio próprio, nenhum efeito quando `scatterIslets` é 0
  if (o.scatterIslets > 0) {
    const rngS = root.fork('scatter');
    const zn = o.scatterZone * o.size;
    for (let k = 0; k < o.scatterIslets; k++) {
      const occ = distanceTransform(land, G);
      for (let attempt = 0; attempt < 160; attempt++) {
        const rr = rngS.range(o.scatterRadius[0], o.scatterRadius[1]);
        const cx = rngS.range(-zn, zn), cz = rngS.range(-zn, zn);
        const iC = Math.floor((cx + half) / cell), jC = Math.floor((cz + half) / cell);
        if (iC < 0 || jC < 0 || iC >= G || jC >= G || occ[jC * G + iC] * cell < rr * 1.5 + o.gap) continue;
        if (Math.max(Math.abs(cx), Math.abs(cz)) > half * 0.8) continue;
        const e = {
          id: `ilhota-s${k + 1}`, kind: 'islet', biome: 'islet', cx, cz, rx: rr, rz: rr * rngS.range(0.7, 1), rot: rngS.range(0, Math.PI), seed: (o.seed * 59 + k * 137) | 0,
          flipX: false, harmonics: makeHarmonics(rngS, 0.9), noise: 0.5, warp: 0.25, rough: 0.8, features: []
        };
        const mask = buildMask(e, occ);
        let area = 0; for (let c = 0; c < N; c++) area += mask[c];
        if (area * cell * cell < 12) continue;
        commitEntity(e, mask);
        break;
      }
    }
  }
  // 3c. (M2-04) lagos interiores escavados no continente (antes de `resolveLagoons`, que mantém os de >= minLake células)
  if (o.lakes > 0) {
    const rngL = root.fork('lakes');
    for (let k = 0; k < o.lakes; k++) {
      const dWater = distanceTransform(land.map((v) => (v ? 0 : 1)), G); // em terra: distância (células) à água
      for (let attempt = 0; attempt < 200; attempt++) {
        const rr = rngL.range(o.lakeRadius[0], o.lakeRadius[1]);
        const cx = rngL.range(-0.3, 0.3) * o.size, cz = rngL.range(-0.3, 0.3) * o.size;
        const iC = Math.floor((cx + half) / cell), jC = Math.floor((cz + half) / cell);
        if (!land[jC * G + iC] || dWater[jC * G + iC] * cell < rr * 1.5 + 8) continue;
        const rb = rr * rngL.range(0.55, 0.9), rot = rngL.range(0, Math.PI), cs = Math.cos(rot), sn = Math.sin(rot), sd = (o.seed * 71 + k * 29) | 0;
        for (let j = Math.max(0, jC - Math.ceil(rr * 1.6 / cell)); j <= Math.min(G - 1, jC + Math.ceil(rr * 1.6 / cell)); j++) {
          for (let i = Math.max(0, iC - Math.ceil(rr * 1.6 / cell)); i <= Math.min(G - 1, iC + Math.ceil(rr * 1.6 / cell)); i++) {
            const x = toX(i), z = toX(j), dx = x - cx, dz = z - cz;
            const ex = (dx * cs + dz * sn) / rr, ez = (-dx * sn + dz * cs) / rb;
            if (Math.hypot(ex, ez) + (fbm(x * 0.1, z * 0.1, sd, 3) - 0.5) * 0.6 < 1 && land[j * G + i]) { land[j * G + i] = 0; owner[j * G + i] = -1; }
          }
        }
        break;
      }
    }
  }

  // 4. lagoas: água não ligada ao oceano e pequena vira terra; grandes ficam como lagos
  const { lakes } = resolveLagoons(land, owner, G, o.minLake);
  for (const e of entities) { let a = 0; for (let c = 0; c < N; c++) if (owner[c] === e.index) a++; e.area = a * cell * cell; }

  const map = { options: o, size: o.size, grid: G, cell, land, owner, entities, lakes };
  map.lava = o.lava ? generateLava(map, root) : null;
  map.rivers = o.rivers > 0 ? generateRivers(map, root) : null;
  finalizeSurface(map);
  applyShoals(map, root);
  map.stats = analyzeMap(map);
  return map;
}
