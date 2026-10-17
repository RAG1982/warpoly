/**
 * src/data/maps/coast/layout.js (MUNDO-TERRENO-MAPAS §2.4 · MUNDO-1)
 *
 * Posiciona, sobre o terreno JÁ ASSADO (`bakeTerrain`: as mesmas alturas que o jogo lê), as bases (`startSlots`), as jazidas de
 * ouro e pedra, as florestas, os poços de petróleo (mapas navais) e alguns critters; e reúne os vaus dos rios.
 *
 * Regras de jogo respeitadas (ver `docs/specs/MUNDO-TERRENO-MAPAS.md` §2.4 e `src/data/maps/README.md`):
 *  - base em platô de terra seca (`h ≥ 1,95`) com raio livre de 14 u, sem lava nem água de rio, e acesso por terra a tudo o que é dela;
 *  - madeira alcançável por jogador ≥ `WOOD_TARGET` (8000 = 67 árvores de 120) a ≤ 60 u do pátio: as árvores só nascem a ≥ 26 u de
 *    qualquer pátio, ≥ 8,5 u de jazidas, ≥ 9 u de vaus, a ≥ `bRad + 7,5` u das construções e com espaçamento ≥ 4,4 u
 *    (`GameManager.spawnWoodlands`); o planejador SIMULA esse sorteio para escolher bosques que entregam a meta com folga;
 *  - serraria inicial a ≤ 12 u de um bosque (regra P-14) e a ≥ 9 u das jazidas; unidades à frente do HQ (dz > 0);
 *  - poços de petróleo a ≥ 6 u da costa, em água ligada ao oceano; nenhum poço em lago.
 *
 * Puro e determinístico: aleatoriedade só do PRNG semeado (`mulberry32`).
 */
import { mulberry32 } from '../../../sim/rng.js';
import { distanceTransform, labelComponents } from './grid.js';
import { PAINTED_SCALE } from '../painted.js';
import { BASE_DRY_HEIGHT, TREE_MIN_HEIGHT, WOOD_TARGET, WOOD_RADIUS, TREE_WOOD } from './constants.js';
import { bakedHeightFn } from './bake.js';
import { speciesForBiome } from '../../treeSpecies.js';

/** Layout inicial padrão (cópia de `START_LAYOUT`, `src/sim/MatchConfig.js`; um teste confere que continuam iguais). */
export const DEFAULT_BASE_LAYOUT = Object.freeze({
  buildings: Object.freeze([
    Object.freeze({ role: 'hq', dx: 0, dz: 0, rotY: 0 }),
    Object.freeze({ role: 'lumber', dx: -12, dz: -4, rotY: Math.PI / 4 }),
    Object.freeze({ role: 'house', dx: 12, dz: 0, rotY: -Math.PI / 4 })
  ]),
  units: Object.freeze([
    Object.freeze({ role: 'worker', dx: -3, dz: 6 }),
    Object.freeze({ role: 'worker', dx: 3, dz: 6 }),
    Object.freeze({ role: 'melee', dx: -2, dz: 9 }),
    Object.freeze({ role: 'melee', dx: 2, dz: 9 }),
    Object.freeze({ role: 'ranged', dx: -6, dz: 11 })
  ])
});

/** Raios de colisão das construções iniciais (`src/data/buildings.js`): o sorteio de árvores fica a `raio + 7,5` delas. */
const BUILDING_RADIUS = Object.freeze({ hq: 5.5, lumber: 3.2, house: 3.2 });
export const BASE_CLEARANCE = 14; // raio livre de terra seca em volta do pátio (u)
export const COURTYARD_CLEAR = 26; // as árvores só nascem a ≥ 26 u de qualquer pátio
export const FOREST_COUNT = 14;
export const FOREST_RADIUS = 10;
export const LUMBER_TO_FOREST = 11.5; // serraria a 11,5 u do centro do bosque inicial (regra P-14: <= 12 u, com folga para o arredondamento das coordenadas)
const TREE_SPACING = 4.4;
export const WOOD_MARGIN_STOP = 1.3; // o planejador planta bosques até a madeira simulada chegar a WOOD_TARGET × 1,3…
export const WOOD_MARGIN_MIN = 1.15; // …e só aceita a base se chegar a WOOD_TARGET × 1,15 (o sorteio real varia com a semente da partida)

const hyp = (ax, az, bx, bz) => { const dx = ax - bx, dz = az - bz; return Math.sqrt(dx * dx + dz * dz); }; // mais rápido que Math.hypot nos laços quentes

/**
 * Campo de nós do terreno assado: altura, terra seca, folga (u) até o que não é terra seca e região conexa (4-vizinhos, terra
 * caminhável). `at(x, z)` devolve o índice do nó mais próximo. Todas as grades têm `nodes × nodes` posições, x = -size/2 + i·cell.
 */
export function makeNodeField(baked, { playable } = {}) {
  const { nodes: N, cell, size, heights, lavaData } = baked;
  const half = size / 2;
  const total = N * N;
  const H = new Float32Array(total);
  const dry = new Uint8Array(total), walk = new Uint8Array(total);
  for (let k = 0; k < total; k++) {
    H[k] = heights[k] / PAINTED_SCALE;
    const lava = lavaData ? lavaData[k] : 0;
    dry[k] = H[k] >= BASE_DRY_HEIGHT && !lava ? 1 : 0;
    walk[k] = H[k] >= 0.7 && !lava ? 1 : 0;
  }
  const nonDry = new Uint8Array(total);
  for (let k = 0; k < total; k++) nonDry[k] = dry[k] ? 0 : 1;
  const dt = distanceTransform(nonDry, N);
  const clear = new Float32Array(total); // u
  for (let k = 0; k < total; k++) clear[k] = dt[k] * cell;
  // regiões conexas na terra caminhável ERODIDA (>= 1,5 u de margem): passagens de menos de ~3 u não contam (o Pathfinder usa células de
  // 1,5 u e não as atravessa)
  const nonWalk = new Uint8Array(total);
  for (let k = 0; k < total; k++) nonWalk[k] = walk[k] ? 0 : 1;
  const dw = distanceTransform(nonWalk, N);
  const walkSafe = new Uint8Array(total);
  for (let k = 0; k < total; k++) walkSafe[k] = dw[k] * cell >= 1.5 ? 1 : 0;
  const region = labelComponents(walkSafe, N, 1).labels;
  const playHalf = (playable ?? size) / 2;
  const field = {
    N, cell, size, half, H, dry, walk, clear, region, playHalf, biomeData: baked.biomeData,
    heightAt: bakedHeightFn(baked),
    xOf: (i) => -half + i * cell,
    at: (x, z) => {
      const i = Math.max(0, Math.min(N - 1, Math.round((x + half) / cell)));
      const j = Math.max(0, Math.min(N - 1, Math.round((z + half) / cell)));
      return j * N + i;
    },
    inside: (x, z, margin = 0) => Math.abs(x) < playHalf - margin && Math.abs(z) < playHalf - margin
  };
  return field;
}

/** Imagem integral (soma de prefixos) de uma máscara `N × N` para contar nós em caixas em O(1). */
function integralImage(mask, N) {
  const S = new Int32Array((N + 1) * (N + 1));
  for (let j = 0; j < N; j++) {
    let row = 0;
    for (let i = 0; i < N; i++) {
      row += mask[j * N + i];
      S[(j + 1) * (N + 1) + (i + 1)] = S[j * (N + 1) + (i + 1)] + row;
    }
  }
  return S;
}

function boxCount(S, N, i, j, r) {
  const i0 = Math.max(0, i - r), i1 = Math.min(N - 1, i + r), j0 = Math.max(0, j - r), j1 = Math.min(N - 1, j + r);
  const W = N + 1;
  return S[(j1 + 1) * W + (i1 + 1)] - S[j0 * W + (i1 + 1)] - S[(j1 + 1) * W + i0] + S[j0 * W + i0];
}

/** Máscara de "terra de árvore": seca e a ≥ 2,5 u da água (o sorteio real exige h ≥ 1,9). */
function treeMask(field, regionId = null) {
  const { N, region, dry, clear } = field;
  const tree = new Uint8Array(N * N);
  for (let k = 0; k < tree.length; k++) tree[k] = dry[k] && clear[k] >= 2.5 && (regionId === null || region[k] === regionId) ? 1 : 0;
  return tree;
}

/**
 * Candidatos a base: nós de terra seca com folga ≥ `BASE_CLEARANCE` dentro da área jogável, ordenados do melhor ao pior segundo a
 * capacidade de floresta (terra de árvore nos anéis [26, 60] u em volta, contada em caixas) e a proximidade da costa.
 * @param {object} field  `makeNodeField`
 * @param {(x:number,z:number,k:number)=>boolean} accept  filtro (entidade do mapa, metade do mapa, distância a outras bases…)
 * @param {{ stride?: number }} [opts]
 * @returns {{ i: number, j: number, k: number, x: number, z: number, cap: number, clear: number, score: number }[]}
 */
export function rankBaseSites(field, accept, { stride = 3 } = {}) {
  const { N, cell, dry, clear, xOf, inside } = field;
  const S = integralImage(treeMask(field), N);
  const r1 = Math.round(WOOD_RADIUS / cell), r0 = Math.round(COURTYARD_CLEAR / cell);
  const out = [];
  for (let j = 0; j < N; j += stride) {
    for (let i = 0; i < N; i += stride) {
      const k = j * N + i;
      if (!dry[k] || clear[k] < BASE_CLEARANCE) continue;
      const x = xOf(i), z = xOf(j);
      if (!inside(x, z, BASE_CLEARANCE)) continue;
      if (!accept(x, z, k)) continue;
      const cap = (boxCount(S, N, i, j, r1) - boxCount(S, N, i, j, r0)) * cell * cell; // u² de terra de árvore nos anéis (caixas)
      const score = Math.min(cap, 3600) / 360 - Math.max(0, clear[k] - 20) * 0.15 - Math.max(0, 15 - clear[k]) * 0.5;
      out.push({ i, j, k, x, z, cap, clear: clear[k], score });
    }
  }
  out.sort((a, b) => b.score - a.score || a.k - b.k);
  return out;
}

// ---------------------------------------------------------------------------------------------
// Sorteio de árvores (cópia fiel das regras de `GameManager.spawnWoodlands`)
// ---------------------------------------------------------------------------------------------
/** Hash espacial de árvores (células de 5 u) para o teste de espaçamento mínimo. */
class TreeHash {
  constructor() { this.cells = new Map(); }

  add(x, z) {
    const key = Math.floor(x / 5) * 4096 + Math.floor(z / 5);
    let arr = this.cells.get(key);
    if (!arr) { arr = []; this.cells.set(key, arr); }
    arr.push(x, z);
  }

  tooClose(x, z, d) {
    const cx = Math.floor(x / 5), cz = Math.floor(z / 5);
    for (let a = cx - 1; a <= cx + 1; a++) {
      for (let b = cz - 1; b <= cz + 1; b++) {
        const arr = this.cells.get(a * 4096 + b);
        if (!arr) continue;
        for (let k = 0; k < arr.length; k += 2) if ((arr[k] - x) ** 2 + (arr[k + 1] - z) ** 2 < d * d) return true;
      }
    }
    return false;
  }
}

/**
 * Simula um cluster de `spawnWoodlands` (`count` árvores sorteadas num anel de 2..2+`radius` u em volta do centro) contra as
 * restrições do jogo e devolve as árvores que o jogo plantaria (NÃO altera `hash`; quem aceita o cluster chama `hash.add`).
 * `ctx`: { heightAt(x,z), regionOk?(x,z), courtyards[], deposits[], buildings[{x,z,r}], fords[], hash }.
 */
function simulateCluster(ctx, cx, cz, count, radius, rng) {
  const { heightAt, regionOk, courtyards, deposits, buildings, fords, hash } = ctx;
  const placed = [];
  const maxAttempts = count * 24;
  for (let attempts = 0; placed.length < count && attempts < maxAttempts; attempts++) {
    const ang = rng.next() * Math.PI * 2;
    const d = 2.0 + rng.next() * radius;
    const x = cx + Math.cos(ang) * d, z = cz + Math.sin(ang) * d;
    if (heightAt(x, z) < TREE_MIN_HEIGHT) continue;
    if (regionOk && !regionOk(x, z)) continue;
    if (buildings.some((b) => hyp(x, z, b.x, b.z) < b.r + 7.5)) continue;
    if (courtyards.some((c) => hyp(x, z, c.x, c.z) < COURTYARD_CLEAR)) continue;
    if (deposits.some((r) => hyp(x, z, r.x, r.z) < 8.5)) continue;
    if (fords.some((f) => hyp(x, z, f.x, f.z) < 9.0)) continue;
    if (hash.tooClose(x, z, TREE_SPACING)) continue;
    if (placed.some((t) => (t.x - x) ** 2 + (t.z - z) ** 2 < TREE_SPACING * TREE_SPACING)) continue;
    placed.push({ x, z });
  }
  return placed;
}

/**
 * Estima a madeira de cada base de um `mapDef` pronto: sorteia as árvores de TODOS os `forests` (na ordem do mapa, como o jogo) com
 * as regras de `spawnWoodlands` e soma, por slot, as árvores a ≤ 60 u do pátio e alcançáveis por terra a partir dele (`reach[i]` = função
 * `(x, z) => boolean`). Independente do planejador (PRNG próprio); serve de verificação e de estimativa com várias sementes.
 * @param {object} mapDef  mapa com `startSlots`, `resources`, `forests`, `fords`
 * @param {number} seed
 * @param {(x:number,z:number)=>number} heightAt
 * @param {((x:number,z:number)=>boolean)[]} reach
 * @returns {number[]} madeira por slot
 */
export function estimateWood(mapDef, seed, heightAt, reach) {
  const rng = mulberry32(((seed >>> 0) ^ 0x5eed0d00) >>> 0);
  const slots = mapDef.startSlots;
  const courtyards = slots.map((s) => ({ x: s.x, z: s.z }));
  const buildings = [];
  for (const s of slots) {
    const mirror = s.mirror ?? mirrorFor(s);
    const lay = s.layout ?? DEFAULT_BASE_LAYOUT;
    for (const b of lay.buildings) buildings.push({ x: s.x + b.dx * mirror[0], z: s.z + b.dz * mirror[1], r: BUILDING_RADIUS[b.role] ?? 3 });
  }
  const ctx = {
    heightAt, regionOk: null, courtyards, buildings, fords: mapDef.fords ?? [], hash: new TreeHash(),
    deposits: mapDef.resources.filter((r) => r.type !== 'oil')
  };
  const trees = [];
  for (const f of mapDef.forests) {
    for (const t of simulateCluster(ctx, f.x, f.z, f.count, f.radius, rng)) { ctx.hash.add(t.x, t.z); trees.push(t); }
  }
  return slots.map((s, i) => trees.reduce((n, t) => n + (hyp(t.x, t.z, s.x, s.z) <= WOOD_RADIUS && reach[i](t.x, t.z) ? 1 : 0), 0) * TREE_WOOD);
}

// ---------------------------------------------------------------------------------------------
// Plano de uma base
// ---------------------------------------------------------------------------------------------
const mirrorFor = (site) => [site.x >= 0 ? 1 : -1, site.z <= 0 ? 1 : -1];
const placeAt = (site, mirror, dx, dz) => ({ x: site.x + dx * mirror[0], z: site.z + dz * mirror[1] });

/** Posições do layout inicial de um slot (serraria em `lumberWorld`, posição de mundo, quando dada). */
function layoutPositions(site, mirror, lumberWorld = null) {
  const L = DEFAULT_BASE_LAYOUT;
  const buildings = L.buildings.map((b) => {
    if (b.role === 'lumber' && lumberWorld) return { role: b.role, x: lumberWorld.x, z: lumberWorld.z, r: BUILDING_RADIUS.lumber };
    return { role: b.role, ...placeAt(site, mirror, b.dx, b.dz), r: BUILDING_RADIUS[b.role] };
  });
  const units = L.units.map((u) => ({ role: u.role, ...placeAt(site, mirror, u.dx, u.dz) }));
  return { buildings, units };
}

const dryAt = (field, p, minClear) => { const k = field.at(p.x, p.z); return field.dry[k] === 1 && field.clear[k] >= minClear; };
const angDiff = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

/**
 * Planeja UMA base num ponto candidato: espelhamento do layout, bosque inicial + serraria a 11,5 u dele, ouro e pedra e os demais
 * bosques, até a madeira simulada passar da meta. Devolve `null` se o ponto não serve.
 * `world`: { field, sites[] (pátios de TODAS as bases; o desta é `site`), fords[], extraDeposits[], extraBuildings[], extraTrees[] }.
 */
function planBase(world, site, index, rngRoot, woodTarget) {
  const { field, fords } = world;
  const rng = rngRoot.fork(`base${index}`);
  const regionId = field.region[site.k];
  const courtyards = world.sites.map((s, k) => (k === index ? site : s));
  const stop = woodTarget * WOOD_MARGIN_STOP, min = woodTarget * WOOD_MARGIN_MIN;
  const preferred = mirrorFor(site);
  const mirrors = [preferred, [-preferred[0], preferred[1]], [preferred[0], -preferred[1]], [-preferred[0], -preferred[1]]];
  const outward = hyp(site.x, site.z, 0, 0) > 10 ? Math.atan2(site.z, site.x) : Math.atan2(-preferred[1], -preferred[0]); // "para fora" do centro do mapa

  const S = integralImage(treeMask(field, regionId), field.N);
  const boxFrac = (x, z, r) => {
    const k = field.at(x, z), i = k % field.N, j = (k - i) / field.N, rr = Math.round(r / field.cell);
    return boxCount(S, field.N, i, j, rr) / ((2 * rr + 1) ** 2);
  };

  let tries = 0;
  for (const mirror of mirrors) {
    // 1) as posições padrão do layout (menos a serraria) precisam ser terra seca
    const base = layoutPositions(site, mirror);
    if (![...base.buildings.filter((b) => b.role !== 'lumber'), ...base.units].every((p) => dryAt(field, p, 2))) continue;

    // 2) bosque inicial a 28–36 u do HQ (de preferência voltado ao centro do mapa) e serraria a 11,5 u dele (regra P-14)
    const starters = [];
    for (let a = 0; a < 24; a++) {
      const ang = outward + Math.PI + (a % 2 ? 1 : -1) * Math.ceil(a / 2) * ((Math.PI * 2) / 24);
      for (const d of [32, 30, 34, 36, 28]) {
        const q = { x: site.x + Math.cos(ang) * d, z: site.z + Math.sin(ang) * d };
        if (!field.inside(q.x, q.z, FOREST_RADIUS + 3) || !dryAt(field, q, 4) || field.region[field.at(q.x, q.z)] !== regionId) continue;
        const L = { x: site.x + Math.cos(ang) * (d - LUMBER_TO_FOREST), z: site.z + Math.sin(ang) * (d - LUMBER_TO_FOREST) };
        if (!dryAt(field, L, 3)) continue;
        starters.push({ q, L, frac: boxFrac(q.x, q.z, 8), d, a });
      }
    }
    starters.sort((x, y) => y.frac - x.frac || x.a - y.a || x.d - y.d);
    for (const st of starters.slice(0, 6)) {
      if (++tries > 4) return null; // poucas tentativas por ponto: se os melhores bosques não bastam, outro ponto serve mais
      const lay = layoutPositions(site, mirror, st.L);
      const lumber = lay.buildings.find((b) => b.role === 'lumber');
      if (lay.units.some((u) => hyp(u.x, u.z, st.L.x, st.L.z) < 4)) continue;
      // 3) jazidas: ouro e pedra a 15–18 u do HQ, "para fora", longe da serraria, da casa, das unidades e do bosque inicial
      const house = lay.buildings.find((b) => b.role === 'house');
      const spots = [];
      for (let a = 0; a < 36; a++) {
        const ang = (a / 36) * Math.PI * 2;
        for (const rho of [15, 16.5, 18]) {
          const p = { x: site.x + Math.cos(ang) * rho, z: site.z + Math.sin(ang) * rho, ang };
          if (!field.inside(p.x, p.z, 4) || !dryAt(field, p, 4)) continue;
          if (hyp(p.x, p.z, lumber.x, lumber.z) < 10.5 || hyp(p.x, p.z, house.x, house.z) < 9) continue;
          if (lay.units.some((u) => hyp(u.x, u.z, p.x, p.z) < 4.5)) continue;
          if (hyp(p.x, p.z, st.q.x, st.q.z) < 14) continue;
          if (fords.some((f) => hyp(p.x, p.z, f.x, f.z) < 12)) continue;
          spots.push({ ...p, diff: angDiff(ang, outward) + (rho - 15) * 0.02 });
        }
      }
      spots.sort((a, b) => a.diff - b.diff);
      const gold = spots[0];
      const stone = gold && spots.find((p) => hyp(p.x, p.z, gold.x, gold.z) >= 11 && angDiff(p.ang, gold.ang) > 0.8);
      if (!gold || !stone) continue;
      const deposits = [{ type: 'gold', x: +gold.x.toFixed(1), z: +gold.z.toFixed(1) }, { type: 'stone', x: +stone.x.toFixed(1), z: +stone.z.toFixed(1) }];

      // 4) bosques: o inicial e mais, do mais perto ao mais longe, até a madeira simulada passar da meta
      const hash = new TreeHash();
      for (const t of world.extraTrees) hash.add(t.x, t.z);
      const ctx = {
        heightAt: field.heightAt, regionOk: (x, z) => field.region[field.at(x, z)] === regionId, courtyards, fords, hash,
        deposits: [...deposits, ...world.extraDeposits],
        buildings: [...lay.buildings.map((b) => ({ x: b.x, z: b.z, r: b.r })), ...world.extraBuildings]
      };
      const clusters = [], trees = [];
      const addCluster = (q) => {
        const placed = simulateCluster(ctx, q.x, q.z, FOREST_COUNT, FOREST_RADIUS, rng);
        if (placed.length < 6) return false;
        for (const t of placed) { hash.add(t.x, t.z); trees.push(t); }
        clusters.push({ x: +q.x.toFixed(1), z: +q.z.toFixed(1), count: FOREST_COUNT, radius: FOREST_RADIUS, planted: placed.length });
        return true;
      };
      const inRange = () => trees.reduce((s, t) => s + (hyp(t.x, t.z, site.x, site.z) <= WOOD_RADIUS ? 1 : 0), 0) * TREE_WOOD;
      if (!addCluster(st.q)) continue;
      const cand = [];
      for (let j = 0; j < field.N; j += 2) {
        for (let i = 0; i < field.N; i += 2) {
          const q = { x: field.xOf(i), z: field.xOf(j) };
          const d = hyp(q.x, q.z, site.x, site.z);
          if (d < 27 || d > 52 || !field.inside(q.x, q.z, FOREST_RADIUS + 3)) continue;
          const k = j * field.N + i;
          if (!field.dry[k] || field.region[k] !== regionId) continue;
          if (courtyards.some((c) => hyp(c.x, c.z, q.x, q.z) < 29)) continue;
          const frac = boxFrac(q.x, q.z, 8);
          if (frac < 0.55) continue;
          cand.push({ ...q, d, key: frac * 60 - d });
        }
      }
      cand.sort((a, b) => b.key - a.key || a.d - b.d);
      let misses = 0;
      for (const q of cand) {
        if (inRange() >= stop || misses >= 12) break;
        if (clusters.some((c) => hyp(c.x, c.z, q.x, q.z) < 19)) continue;
        if (ctx.deposits.some((r) => hyp(r.x, r.z, q.x, q.z) < 12) || fords.some((f) => hyp(f.x, f.z, q.x, q.z) < 11)) continue;
        if (addCluster(q)) misses = 0; else misses++;
      }
      const wood = inRange();
      if (wood < min) continue; // não bastou: tenta outro bosque inicial/espelhamento
      return { site, mirror, lumber: { x: +st.L.x.toFixed(1), z: +st.L.z.toFixed(1) }, deposits, clusters, trees, wood, buildings: ctx.buildings.slice(0, 3), units: lay.units };
    }
  }
  return null;
}

/** Layout (`startSlots[i].layout`) com a serraria deslocada para o offset de mundo dado (as demais entradas ficam como o padrão). */
function slotLayout(site, mirror, lumber) {
  const L = DEFAULT_BASE_LAYOUT;
  return {
    buildings: L.buildings.map((b) => (b.role === 'lumber'
      ? { role: 'lumber', dx: +((lumber.x - site.x) / mirror[0]).toFixed(2), dz: +((lumber.z - site.z) / mirror[1]).toFixed(2), rotY: b.rotY }
      : { ...b })),
    units: L.units.map((u) => ({ ...u }))
  };
}

/** Poços de petróleo só em água com profundidade navegável (`NAVAL_MAX_HEIGHT` = 0,1 menos uma folga) e `amount` padrão dos mapas navais. */
const WELL_MAX_HEIGHT = 0.05;
export const WELL_AMOUNT = 5000;
export const WELLS_PER_BASE = 2;

/**
 * Poços de petróleo de um mapa naval: 2 por base, em água LIGADA AO OCEANO (nunca em lago nem em rio), a ≥ 7 u da costa, o mais perto
 * possível da base (≤ 75 u) e a ≥ 16 u uns dos outros. Para bases gêmeas (`twinOf`), os poços da gêmea são o giro de 180° dos da mãe.
 * @returns {{ type: 'oil', x: number, z: number, amount: number }[]}
 */
function planWells(field, sites, spec, perBase = WELLS_PER_BASE) {
  const { N, cell, H, xOf, inside } = field;
  const water = new Uint8Array(N * N);
  for (let k = 0; k < water.length; k++) water[k] = H[k] <= WELL_MAX_HEIGHT ? 1 : 0;
  const wl = labelComponents(water, N, 1);
  const ocean = wl.labels[0];
  const land = new Uint8Array(N * N);
  for (let k = 0; k < land.length; k++) land[k] = water[k] ? 0 : 1;
  const dt = distanceTransform(land, N);
  const wells = [];
  const farFromAll = (x, z) => wells.every((w) => hyp(x, z, w.x, w.z) >= 16);
  const out = new Array(sites.length).fill(null).map(() => []);
  for (let b = 0; b < sites.length; b++) {
    const tw = spec.bases[b].twinOf;
    if (tw !== undefined && out[tw].length) {
      for (const w of out[tw]) { const t = { type: 'oil', x: -w.x, z: -w.z, amount: WELL_AMOUNT }; out[b].push(t); wells.push(t); }
      continue;
    }
    const s = sites[b];
    const cands = [];
    for (let j = 0; j < N; j += 2) {
      for (let i = 0; i < N; i += 2) {
        const k = j * N + i;
        if (wl.labels[k] !== ocean || dt[k] * cell < 7) continue;
        const x = xOf(i), z = xOf(j);
        if (!inside(x, z, 6)) continue;
        const d = hyp(x, z, s.x, s.z);
        if (d > 75) continue;
        cands.push({ x, z, d: d + Math.max(0, dt[k] * cell - 12) * 0.5 });
      }
    }
    cands.sort((a, c) => a.d - c.d);
    for (const c of cands) {
      if (out[b].length >= perBase) break;
      if (!farFromAll(c.x, c.z)) continue;
      const w = { type: 'oil', x: +c.x.toFixed(1), z: +c.z.toFixed(1), amount: WELL_AMOUNT };
      out[b].push(w); wells.push(w);
    }
  }
  return out.flat();
}

/** Um grupo de critters (4 animais, raio 6) por base, a 18–30 u do pátio, em terra seca longe das jazidas e dos bosques. */
function planCritters(field, plans, speciesOfBase) {
  const out = [];
  plans.forEach((p, b) => {
    if (!p) return;
    const keepAway = [...p.deposits, ...p.clusters, { x: p.lumber.x, z: p.lumber.z }];
    for (let a = 0; a < 24; a++) {
      const ang = (a / 24) * Math.PI * 2;
      let done = false;
      for (const rho of [24, 21, 27, 30, 18]) {
        const q = { x: p.site.x + Math.cos(ang) * rho, z: p.site.z + Math.sin(ang) * rho };
        if (!field.inside(q.x, q.z, 8) || !dryAt(field, q, 4)) continue;
        if (keepAway.some((r) => hyp(q.x, q.z, r.x, r.z) < 9)) continue;
        out.push({ kind: 'critters', species: speciesOfBase(b), x: +q.x.toFixed(1), z: +q.z.toFixed(1), count: 4, radius: 6 });
        done = true;
        break;
      }
      if (done) break;
    }
  });
  return out;
}

/**
 * Planeja as bases do mundo.
 * @param {object} map     mapa gerado (`generateCoast`): usa `owner`/`size`/`grid` (qual entidade é dona de cada ponto) e `rivers.fords`
 * @param {object} baked   terreno assado (`bakeTerrain`)
 * @param {{ bases: {entities?: number[], side?: 'west'|'east', twinOf?: number}[], minSeparation?: number }} spec
 * @param {{ playable: number, seed?: number, woodTarget?: number }} opts
 * @returns {{ ok: boolean, failures: string[], bases: object[], startSlots: object[], resources: object[], forests: object[], fords: object[], neutrals: object[], field: object }}
 */
export function planLayout(map, baked, spec, opts) {
  const woodTarget = opts.woodTarget ?? WOOD_TARGET;
  const field = makeNodeField(baked, { playable: opts.playable });
  const rng = mulberry32(((opts.seed ?? map.options.seed) ^ 0x1a40f0e5) >>> 0);
  const G = map.grid, half = map.size / 2;
  const ownerAt = (x, z) => map.owner[Math.min(G - 1, Math.max(0, Math.floor(((z + half) / map.size) * G))) * G + Math.min(G - 1, Math.max(0, Math.floor(((x + half) / map.size) * G)))];
  const fords = (map.rivers?.fords ?? []).map((f) => ({ x: +f.x.toFixed(2), z: +f.z.toFixed(2), r: f.r }));
  const failures = [];
  const minSep = spec.minSeparation ?? 60;
  const nb = spec.bases.length;

  // pátios provisórios: o melhor candidato de cada base (as gêmeas são o giro de 180° da gêmea-mãe)
  const ranked = [];
  const sites = [];
  for (let b = 0; b < nb; b++) {
    const bs = spec.bases[b];
    if (bs.twinOf !== undefined) { ranked.push(null); sites.push(null); continue; }
    const ents = new Set(bs.entities);
    const prev = sites.filter(Boolean);
    const cands = rankBaseSites(field, (x, z) => {
      if (ents.size && !ents.has(ownerAt(x, z))) return false;
      if (bs.side === 'west' && x > -0.1 * map.size) return false;
      if (bs.side === 'east' && x < 0.1 * map.size) return false;
      return prev.every((p) => hyp(x, z, p.x, p.z) >= minSep);
    });
    ranked.push(cands);
    if (!cands.length) failures.push(`base ${b}: nenhum ponto com ${BASE_CLEARANCE} u de terra seca livre`);
    sites.push(cands[0] ?? null);
    const tw = spec.bases.findIndex((x) => x.twinOf === b);
    if (tw >= 0 && cands[0]) sites[tw] = rotateSite(field, cands[0]);
  }
  const plans = new Array(nb).fill(null);
  const world = { field, sites: sites.map((s) => s ?? { x: 1e6, z: 1e6, k: 0 }), fords, extraDeposits: [], extraBuildings: [], extraTrees: [] };
  for (let b = 0; b < nb; b++) {
    const bs = spec.bases[b];
    if (bs.twinOf !== undefined || !ranked[b]?.length) continue;
    // tenta os melhores pontos (afastados entre si) até um entregar a madeira
    const tried = [];
    for (const cand of ranked[b]) {
      if (tried.length >= 5) break;
      if (tried.some((t) => hyp(t.x, t.z, cand.x, cand.z) < 10)) continue;
      tried.push(cand);
      const tw = spec.bases.findIndex((x) => x.twinOf === b);
      const siteB = cand;
      if (tw >= 0) world.sites[tw] = rotateSite(field, cand);
      world.sites[b] = siteB;
      const plan = planBase(world, siteB, b, rng, woodTarget);
      if (plan) { plans[b] = plan; break; }
    }
    if (!plans[b]) { failures.push(`base ${b}: não achou madeira para ${woodTarget} (testou ${tried.length} pontos)`); continue; }
    const p = plans[b];
    world.sites[b] = p.site;
    world.extraDeposits.push(...p.deposits);
    world.extraBuildings.push(...p.buildings);
    world.extraTrees.push(...p.trees);
    // a gêmea é o giro de 180° da base planejada
    const tw = spec.bases.findIndex((x) => x.twinOf === b);
    if (tw >= 0) {
      const r = (q) => ({ ...q, x: -q.x, z: -q.z });
      const site2 = rotateSite(field, p.site);
      plans[tw] = {
        site: site2, mirror: [-p.mirror[0], -p.mirror[1]], lumber: r(p.lumber), deposits: p.deposits.map(r), clusters: p.clusters.map(r), trees: p.trees.map(r),
        wood: p.wood, buildings: p.buildings.map(r), units: p.units.map(r), twin: true
      };
      world.sites[tw] = site2;
      world.extraDeposits.push(...plans[tw].deposits);
      world.extraBuildings.push(...plans[tw].buildings);
      world.extraTrees.push(...plans[tw].trees);
    }
  }

  const startSlots = [], resources = [], forests = [];
  // M2-10: espécie pelo bioma da célula (palmeira na costa/deserto, acácia na savana, copa larga no exuberante; `speciesForBiome`).
  // Um único sorteio de `rng` por bosque, como antes (a sequência dos demais sorteios do planejador não muda).
  const COAST_NEAR = 14; // u: água a menos disso conta como costa
  const speciesOf = (x, z) => {
    const k = field.at(x, z);
    return speciesForBiome(field.biomeData[k], field.clear[k] < COAST_NEAR, rng.next());
  };
  const bases = [];
  for (let b = 0; b < nb; b++) {
    const p = plans[b];
    if (!p) { bases.push(null); continue; }
    startSlots.push({ x: +p.site.x.toFixed(1), z: +p.site.z.toFixed(1), mirror: p.mirror, layout: slotLayout(p.site, p.mirror, p.lumber) });
    for (const d of p.deposits) resources.push({ ...d });
    for (const c of p.clusters) forests.push({ x: c.x, z: c.z, count: c.count, radius: c.radius, species: speciesOf(c.x, c.z) });
    bases.push({ index: b, x: p.site.x, z: p.site.z, mirror: p.mirror, entity: ownerAt(p.site.x, p.site.z), wood: p.wood, trees: p.trees.length, clusters: p.clusters.length, clear: p.site.clear, cap: p.site.cap, twin: !!p.twin });
  }

  let wells = [];
  if (spec.naval && plans.every(Boolean)) {
    wells = planWells(field, plans.map((p) => p.site), spec);
    if (wells.length < nb * WELLS_PER_BASE) failures.push(`poços: só ${wells.length} de ${nb * WELLS_PER_BASE} (água ligada ao oceano a ≥ 7 u da costa)`);
    resources.push(...wells);
  }
  const neutrals = plans.every(Boolean) ? planCritters(field, plans, (b) => (map.entities[ownerAt(plans[b].site.x, plans[b].site.z)]?.biome === 'lush' ? 'sheep' : 'boar')) : [];

  return { ok: failures.length === 0 && plans.every(Boolean), failures, bases, startSlots, resources, forests, fords, neutrals, wells, field, plans };
}

/** Giro de 180° de um ponto de base (nó `(i, j) → (N-1-i, N-1-j)`; o mundo `(x, z) → (-x, -z)`). */
function rotateSite(field, s) {
  const N = field.N;
  const i = N - 1 - s.i, j = N - 1 - s.j;
  return { ...s, i, j, k: j * N + i, x: -s.x, z: -s.z };
}
