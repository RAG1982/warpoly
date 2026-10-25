/**
 * tools/lib/cliffRidge.mjs (M3-04 · crista intransponível com desfiladeiros)
 *
 * Esculpe, num mapa de campanha já assado (`painted`), uma CRISTA de rocha que corta a ilha de costa a costa entre as duas bases,
 * com 1–2 DESFILADEIROS estreitos (passagens de ~6–7 u) onde o jogador pode fechar com muralhas. A crista é só terreno alto: o campo
 * opcional `cliffHeight` do mapa (`src/data/maps/cliff.js`) faz o `Pathfinder` tratar alturas >= `cliffHeight` como intransponíveis.
 *
 * Passos (determinísticos; só `mulberry32`, sem `Math.random`): referencial (t = eixo base→base, u = ao longo da crista, crista em
 * t = onda(u)); escolha dos desfiladeiros em terra firme longe da costa; escultura da altura + bioma rocha; "vedação": com os
 * desfiladeiros tampados virtualmente, nenhum caminho terrestre pode ligar as bases (se ligar por uma falha na costa, a falha é
 * erguida e o teste repete). Usa o `Pathfinder` real do jogo.
 */
import { mulberry32 } from '../../src/sim/rng.js';
import { decodeHeights, encodeHeights, toH10 } from '../../src/data/maps/painted.js';
import { decodeBiomeGrid, encodeRleBiomeGrid, BIOME } from '../../src/data/maps/biome.js';
import { buildPathfinder, floodFill, isReached } from '../../src/data/maps/generator.js';

export const RIDGE_DEFAULTS = Object.freeze({
  cliffHeight: 5, // alturas >= isto são intransponíveis (a planície fica em ~1,9–3,9)
  hTop: 7.4, // altura do topo da crista
  core: 3.0, // meia-largura do topo plano (u)
  fall: 3.6, // largura de cada encosta (u)
  gapWidth: 6.2, // largura da abertura (u) entre as faces da crista (a passagem medida na grade fica ~1 u maior)
  gapRamp: 1.4, // suavização das faces do desfiladeiro (u)
  gapSep: 26, // distância entre os dois desfiladeiros (u)
  wave: 5.5, // amplitude do serpenteio da crista (u)
  along: 0.5 // posição da crista no eixo base 0 → base 1 (0..1)
});

const smooth = (x) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };

/** Referencial da crista: t cresce rumo à base 1 (orcs); u corre ao longo da crista; a crista passa por t = wave(u). */
export function ridgeFrame(m, { seed = 1, along = RIDGE_DEFAULTS.along, wave = RIDGE_DEFAULTS.wave } = {}) {
  const s0 = m.startSlots[0], s1 = m.startSlots[1];
  const L = Math.hypot(s1.x - s0.x, s1.z - s0.z);
  const a = { x: (s1.x - s0.x) / L, z: (s1.z - s0.z) / L };
  const n = { x: -a.z, z: a.x };
  const P0 = { x: s0.x + a.x * L * along, z: s0.z + a.z * L * along };
  const rng = mulberry32(((seed * 2654435761) >>> 0) ^ 0x51ed);
  const ph = [rng.next() * 6.283, rng.next() * 6.283, rng.next() * 6.283];
  const wv = (u) => wave * (0.6 * Math.sin((u * 6.283) / 61 + ph[0]) + 0.4 * Math.sin((u * 6.283) / 29 + ph[1]));
  const hv = (u, t) => 0.45 * Math.sin((u * 6.283) / 17 + ph[2]) + 0.35 * Math.sin((t * 6.283) / 11 + u * 0.13);
  const tOf = (x, z) => (x - P0.x) * a.x + (z - P0.z) * a.z;
  const uOf = (x, z) => (x - P0.x) * n.x + (z - P0.z) * n.z;
  /** (t, u) → mundo */
  const world = (t, u) => ({ x: P0.x + a.x * t + n.x * u, z: P0.z + a.z * t + n.z * u });
  /** distância assinada (u) ao eixo da crista, positiva do lado dos orcs */
  const side = (x, z) => tOf(x, z) - wv(uOf(x, z));
  return { s0, s1, L, a, n, P0, wv, hv, tOf, uOf, world, side };
}

/** Escolhe os dois desfiladeiros (posições `u`): terra firme larga dos dois lados e longe de qualquer costa; o 1º perto do eixo. */
export function pickGaps(m, F, { gapSep = RIDGE_DEFAULTS.gapSep, core = RIDGE_DEFAULTS.core, fall = RIDGE_DEFAULTS.fall } = {}) {
  const { getHeightForMap } = F._deps;
  const reach = core + fall + 8;
  const okU = (u) => {
    for (let du = -8; du <= 8; du += 2.5) {
      for (let dt = -reach; dt <= reach; dt += 3) {
        const p = F.world(F.wv(u + du) + dt, u + du);
        if (Math.abs(p.x) > m.playable / 2 - 6 || Math.abs(p.z) > m.playable / 2 - 6) return false;
        if (getHeightForMap(m, p.x, p.z) < 1.9) return false;
      }
    }
    return true;
  };
  const cands = [];
  for (let u = -70; u <= 70; u += 1) if (okU(u)) cands.push(u);
  if (cands.length < 8) return null;
  // desfiladeiros em torno de um centro u0 (o mais próximo do eixo que deixe espaço para os dois)
  let best = null;
  for (const u0 of cands) {
    const uA = u0 - gapSep / 2, uB = u0 + gapSep / 2;
    if (!cands.includes(Math.round(uA)) || !cands.includes(Math.round(uB))) continue;
    const s = Math.abs(u0) + 0.1 * Math.abs(F.wv(u0));
    if (!best || s < best.s) best = { s, uA: Math.round(uA), uB: Math.round(uB), u0 };
  }
  return best;
}

/**
 * Esculpe a crista em `m` (muta `m.terrain.params.data`, `m.biomeGrid`, `m.cliffHeight`). Devolve `{ F, gaps, leaks }`.
 * @param {object} m mapa assado (painted, cell 1)
 */
export function carveRidge(m, deps, opts = {}) {
  const o = { ...RIDGE_DEFAULTS, ...opts };
  const { getHeightForMap } = deps;
  const F = ridgeFrame(m, { seed: o.seed ?? 1, along: o.along, wave: o.wave });
  F._deps = deps;
  const gp = pickGaps(m, F, o);
  if (!gp) throw new Error('crista: sem terra firme larga o bastante para os desfiladeiros');
  const gaps = [{ u: gp.uA, w: o.gapWidth }, { u: gp.uB, w: o.gapWidth }];
  const p = m.terrain.params;
  const nodes = p.nodes, cell = p.cell, half = m.size / 2;
  if (cell !== 1) throw new Error('crista: espera terreno painted com cell 1');
  const h10 = decodeHeights(p.data);
  const H = new Float32Array(nodes * nodes);
  for (let k = 0; k < H.length; k++) H[k] = h10[k] / 10;
  const orig = Float32Array.from(H);

  // distância (em células) até a terra, para a água perto da costa (o espigão da crista entra um pouco no mar)
  const LAND = 0.68;
  const landDist = new Uint8Array(nodes * nodes).fill(255);
  let frontier = [];
  for (let k = 0; k < orig.length; k++) if (orig[k] >= LAND) { landDist[k] = 0; frontier.push(k); }
  for (let d = 1; d <= 5; d++) {
    const next = [];
    for (const k of frontier) {
      const i = k % nodes, j = (k - i) / nodes;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= nodes || jj >= nodes) continue;
        const kk = jj * nodes + ii;
        if (landDist[kk] === 255) { landDist[kk] = d; next.push(kk); }
      }
    }
    frontier = next;
  }

  const band = o.core + o.fall;
  const gapF = (u) => {
    let f = 1;
    for (const g of gaps) f = Math.min(f, smooth((Math.abs(u - g.u) - g.w / 2) / o.gapRamp));
    return f;
  };
  const weightAt = (x, z, withGaps = true) => {
    const u = F.uOf(x, z);
    const d = Math.abs(F.tOf(x, z) - F.wv(u));
    if (d >= band) return 0;
    const prof = d <= o.core ? 1 : smooth(1 - (d - o.core) / o.fall);
    return prof * (withGaps ? gapF(u) : 1);
  };
  const topAt = (x, z) => o.hTop + F.hv(F.uOf(x, z), F.tOf(x, z));

  const carve = (plug) => {
    const out = Float32Array.from(orig);
    for (let j = 0; j < nodes; j++) {
      const z = -half + j * cell;
      for (let i = 0; i < nodes; i++) {
        const x = -half + i * cell;
        const k = j * nodes + i;
        const w0 = weightAt(x, z, !plug);
        if (w0 <= 0) continue;
        const ld = landDist[k];
        const wf = orig[k] >= LAND ? 1 : Math.max(0, 1 - ld / 5);
        out[k] = orig[k] + (topAt(x, z) - orig[k]) * w0 * wf;
      }
    }
    return out;
  };

  const withData = (arr) => {
    const g = new Int8Array(arr.length);
    for (let k = 0; k < arr.length; k++) g[k] = toH10(arr[k]);
    return { ...m, terrain: { ...m.terrain, params: { ...p, data: encodeHeights(g) } }, cliffHeight: o.cliffHeight };
  };

  // vedação: com os desfiladeiros tampados, as bases NÃO podem se alcançar por terra; senão ergue a falha e repete
  let heights = carve(false);
  const plugged = carve(true);
  const gapCells = new Uint8Array(nodes * nodes); // células da área dos desfiladeiros (ficam como estão)
  for (let j = 0; j < nodes; j++) for (let i = 0; i < nodes; i++) {
    const x = -half + i, z = -half + j;
    const u = F.uOf(x, z);
    if (Math.abs(F.tOf(x, z) - F.wv(u)) <= band + 2 && gaps.some((g) => Math.abs(u - g.u) <= g.w / 2 + o.gapRamp + 2.5)) gapCells[j * nodes + i] = 1;
  }
  let leaks = 0;
  for (let it = 0; it < 60; it++) {
    const probe = withData(plugged);
    // a probe usa a crista COM os desfiladeiros tampados (plugged), mas as falhas corrigidas valem nos dois
    const pf = buildPathfinder(probe, 'land');
    const seen = floodFill(pf, m.startSlots[0].x, m.startSlots[0].z);
    if (!isReached(pf, seen, m.startSlots[1].x, m.startSlots[1].z)) break;
    // caminho (BFS) base 0 → base 1 pela grade: as células dele na faixa da crista são a falha
    const path = bfsPath(pf, m.startSlots[0], m.startSlots[1]);
    let fixed = 0;
    for (const c of path) {
      const w = pf.toWorld(c % pf.cols, Math.floor(c / pf.cols));
      const d = Math.abs(F.tOf(w.x, w.z) - F.wv(F.uOf(w.x, w.z)));
      if (d > band + 1) continue;
      for (let dj = -3; dj <= 3; dj++) for (let di = -3; di <= 3; di++) {
        if (di * di + dj * dj > 10) continue;
        const i = Math.round(w.x + half) + di, j = Math.round(w.z + half) + dj;
        if (i < 0 || j < 0 || i >= nodes || j >= nodes) continue;
        const k = j * nodes + i;
        const t = o.hTop + 0.4;
        if (plugged[k] < t) { plugged[k] = t; fixed++; }
        if (!gapCells[k] && heights[k] < t) heights[k] = t;
      }
    }
    leaks++;
    if (!fixed) throw new Error('crista: falha na costa que não consegui fechar');
  }
  // as correções de costa também valem fora dos desfiladeiros (já aplicadas em `heights` quando fora da área dos desfiladeiros)
  for (let k = 0; k < plugged.length; k++) if (!gapCells[k] && plugged[k] > heights[k]) heights[k] = plugged[k];

  const g8 = new Int8Array(heights.length);
  for (let k = 0; k < heights.length; k++) g8[k] = toH10(heights[k]);
  m.terrain = { ...m.terrain, params: { ...p, data: encodeHeights(g8) } }; // objeto novo: `painted.js` guarda a grade decodificada por objeto de params
  m.cliffHeight = o.cliffHeight;

  // bioma: rocha sob a crista
  if (m.biomeGrid) {
    const b = decodeBiomeGrid(m.biomeGrid);
    const bn = m.biomeGrid.nodes, bc = m.biomeGrid.cell || 1;
    for (let j = 0; j < bn; j++) for (let i = 0; i < bn; i++) {
      const x = -half + i * bc, z = -half + j * bc;
      const k = j * nodes + i;
      if (bc === cell && bn === nodes && b[j * bn + i] !== BIOME.SEA && heights[k] >= 0.68 && (weightAt(x, z, true) > 0.25 || heights[k] > o.cliffHeight - 0.2)) b[j * bn + i] = BIOME.ROCK;
    }
    m.biomeGrid = { ...m.biomeGrid, encoding: 'rle', data: encodeRleBiomeGrid(b) };
  }
  return { F, gaps, leaks, opts: o, band, getHeightForMap };
}

function bfsPath(pf, from, to) {
  const a = pf.toGrid(from.x, from.z), b = pf.toGrid(to.x, to.z);
  const start = a.r * pf.cols + a.c, goal = b.r * pf.cols + b.c;
  const prev = new Int32Array(pf.numCells).fill(-1);
  prev[start] = start;
  const q = [start];
  for (let h = 0; h < q.length; h++) {
    const k = q[h];
    if (k === goal) break;
    const c = k % pf.cols, r = (k - c) / pf.cols;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const cc = c + dc, rr = r + dr;
      if (cc < 0 || rr < 0 || cc >= pf.cols || rr >= pf.rows) continue;
      const kk = rr * pf.cols + cc;
      if (prev[kk] !== -1 || pf.staticGrid[kk] !== 1) continue;
      prev[kk] = k;
      q.push(kk);
    }
  }
  const path = [];
  for (let k = goal; prev[k] !== -1 && k !== start; k = prev[k]) path.push(k);
  return path;
}

/**
 * Largura da passagem de cada desfiladeiro NA GRADE DE NAVEGAÇÃO: em cada linha de corte perpendicular à crista (t fixo, de -core a
 * +core em passos de 1 u), conta a corrida contígua de células caminháveis que contém o centro; devolve a menor (em células e u).
 */
export function measureGaps(m, F, gaps, pf = buildPathfinder(m, 'land')) {
  const out = [];
  for (const g of gaps) {
    let minCells = Infinity, atT = 0;
    for (let dt = -6; dt <= 6; dt += 0.5) {
      const t = F.wv(g.u) + dt;
      const cells = new Set();
      for (const dir of [1, -1]) {
        for (let du = dir > 0 ? 0 : -0.5; Math.abs(du) <= 16; du += dir * 0.5) {
          const p = F.world(t, g.u + du);
          if (!pf.isWalkableWorld(p.x, p.z)) break;
          const c = pf.toGrid(p.x, p.z);
          cells.add(c.r * pf.cols + c.c);
        }
      }
      if (cells.size && cells.size < minCells) { minCells = cells.size; atT = dt; }
    }
    out.push({ u: g.u, cells: minCells, width: minCells * pf.cellSize, atT });
  }
  return out;
}

/** Passo entre centros de muralha (`WALL_STEP` do jogo). */
export const WALL_STEP = 2.4;

/** BFS 4-vizinhos na grade de navegação COM a camada dinâmica (muralhas): a base `to` é alcançável a partir de `from`? */
export function reachableDynamic(pf, from, to) {
  const a = pf.toGrid(from.x, from.z), b = pf.toGrid(to.x, to.z);
  const start = a.r * pf.cols + a.c, goal = b.r * pf.cols + b.c;
  const seen = new Uint8Array(pf.numCells);
  seen[start] = 1;
  const q = [start];
  for (let h = 0; h < q.length; h++) {
    const k = q[h];
    if (k === goal) return true;
    const c = k % pf.cols, r = (k - c) / pf.cols;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const cc = c + dc, rr = r + dr;
      if (!pf.isWalkable(cc, rr)) continue;
      const kk = rr * pf.cols + cc;
      if (seen[kk]) continue;
      seen[kk] = 1;
      q.push(kk);
    }
  }
  return false;
}

/**
 * Corte mais estreito (perpendicular à crista) de um desfiladeiro: `{ width, t, mid }` (t = posição no eixo; mid = u do centro da passagem).
 */
export function narrowestCut(pf, F, gap, { core = RIDGE_DEFAULTS.core, fall = RIDGE_DEFAULTS.fall } = {}) {
  const band = core + fall;
  let best = null;
  for (let dt = -band + 1; dt <= band - 1; dt += 0.5) {
    const t = F.wv(gap.u) + dt;
    const p0 = F.world(t, gap.u);
    if (!pf.isWalkableWorld(p0.x, p0.z)) continue;
    let lo = 0, hi = 0;
    for (let du = 0.25; du <= 16; du += 0.25) { const p = F.world(t, gap.u + du); if (!pf.isWalkableWorld(p.x, p.z)) break; hi = du; }
    for (let du = 0.25; du <= 16; du += 0.25) { const p = F.world(t, gap.u - du); if (!pf.isWalkableWorld(p.x, p.z)) break; lo = -du; }
    const width = hi - lo;
    const score = width + 0.02 * Math.abs(dt + 2);
    if (!best || score < best.score) best = { score, width, dt, t, mid: gap.u + (hi + lo) / 2 };
  }
  if (!best) throw new Error('crista: desfiladeiro sem corte caminhável');
  return best;
}

/** Linha de `n` muralhas (passo 2,4) centrada no corte, e 2 torres 5,5 u atrás (lado do Paço), uma de cada lado. */
export function wallLine(F, cut, n) {
  const walls = [];
  for (let i = 0; i < n; i++) walls.push(F.world(cut.t, cut.mid + (i - (n - 1) / 2) * WALL_STEP));
  const towers = [5.2, -5.2].map((du) => F.world(cut.t - 5.5, cut.mid + du));
  return { walls, towers, center: F.world(cut.t, cut.mid), width: cut.width, n };
}

/** As bases se alcançam (camada dinâmica incluída) com estas muralhas postas? */
export function sealedBy(pf, walls, s0, s1) {
  for (const w of walls) pf.blockCircle(w.x, w.z, 1.5, 1);
  const open = reachableDynamic(pf, s0, s1);
  for (const w of walls) pf.blockCircle(w.x, w.z, 1.5, -1);
  return !open;
}
