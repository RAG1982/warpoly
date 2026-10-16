/**
 * src/data/maps/coast/lavaStreams.js (MUNDO-TERRENO-MAPAS §3.5 · MUNDO-1)
 *
 * Lava como divisor de áreas na ilha vulcânica: 1–2 córregos que vão de costa a costa e dividem a ilha em `streams + 1` áreas, com
 * 1–2 passagens de rocha resfriada por córrego (as únicas ligações entre as áreas) e uma base (`start slot`) por área.
 * Bloqueio puro como a água, sem dano. Puro e determinístico (usa só o PRNG recebido).
 */
import { fbm, clamp } from './noise.js';
import { NB8, distanceTransform, labelComponents8, boxBlur } from './grid.js';

/**
 * Máscara caminhável para a lava: terra firme (`land`) que não é lava. `openPassages=false` trata as passagens de rocha como
 * bloqueadas (mostra as ÁREAS separadas pelo córrego); `true` as inclui (mostra a conectividade real).
 */
export function lavaWalkable(map, openPassages = true) {
  const { land, lava } = map;
  const w = new Uint8Array(land.length);
  for (let c = 0; c < w.length; c++) w[c] = land[c] && !(lava && lava.mask[c]) && (openPassages || !(lava && lava.passage[c])) ? 1 : 0;
  return w;
}

/**
 * Córregos de lava na ilha vulcânica: 1–2 caminhos sinuosos (deslocamento por fBm em torno de uma corda costa a costa) de
 * 3–4 células de largura que dividem a ilha em `streams + 1` áreas; 1–2 passagens de rocha resfriada por córrego (única
 * ligação entre as áreas) e uma base (`start slot`) por área. Tenta até 80 vezes (deslocamento cada vez menor) até validar.
 * @param {object} map   mapa parcial (`options, grid, land, owner, entities, size, cell`)
 * @param {{ fork: (label: string) => object }} root  PRNG raiz (usa `root.fork('lava')`; não consome o estado de `root`)
 * @returns {null | { mask, passage, soft, glow, streams, areas, bases, passageCount, areaCount, attempts }}
 */
export function generateLava(map, root) {
  const o = map.options;
  const e = map.entities.find((x) => x.biome === 'volcanic');
  if (!e) return null;
  const { grid: G, land, owner } = map;
  const N = G * G;
  const own = new Uint8Array(N);
  let area = 0, ci = 0, cj = 0;
  for (let c = 0; c < N; c++) if (land[c] && owner[c] === e.index) { own[c] = 1; area++; ci += c % G; cj += (c - (c % G)) / G; }
  if (area < 200) return null;
  ci /= area; cj /= area;
  const R = Math.sqrt(area / Math.PI);
  const rng = root.fork('lava');
  const sliverMin = 30, areaMin = 60, clearMin = 2.5;

  for (let attempt = 0; attempt < 80; attempt++) {
    const wig = attempt < 40 ? 1 : attempt < 65 ? 0.5 : 0;
    const S = o.lavaStreams > 0 ? o.lavaStreams : (rng.next() < 0.45 ? 2 : 1);
    const theta = rng.range(0, Math.PI);
    const offs = S === 1 ? [rng.range(-0.15, 0.15) * R] : (() => { const s = rng.range(0.28, 0.36) * R; return [-s, s]; })();
    const mask = new Uint8Array(N), passage = new Uint8Array(N);
    const streams = [];
    let bad = false;
    for (let k = 0; k < S && !bad; k++) {
      const th = theta + (S === 2 ? rng.range(-0.1, 0.1) : 0);
      const dx = Math.cos(th), dy = Math.sin(th), nx = -dy, ny = dx;
      const px0 = ci + nx * offs[k], py0 = cj + ny * offs[k];
      const march = (sgn) => {
        let t = 0;
        while (t < 4 * R) {
          const i = Math.round(px0 + dx * sgn * t), j = Math.round(py0 + dy * sgn * t);
          if (i < 0 || j < 0 || i >= G || j >= G || !own[j * G + i]) return t;
          t += 0.5;
        }
        return t;
      };
      if (!own[Math.round(py0) * G + Math.round(px0)]) { bad = true; break; }
      const lNeg = march(-1) + 3, lPos = march(1) + 3;
      const A = [px0 - dx * lNeg, py0 - dy * lNeg], B = [px0 + dx * lPos, py0 + dy * lPos];
      const L = lNeg + lPos;
      const steps = Math.ceil(L * 1.6);
      const w0 = rng.range(o.lavaWidth[0], o.lavaWidth[1]);
      const amp = 0.22 * R * rng.range(0.6, 1) * wig, phase = rng.range(0, 50), ws = rng.range(0, 1000) | 0;
      const path = [];
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const disp = amp * (fbm(t * 2.4 + phase, 3.7, ws, 3) - 0.5) * 2 * Math.pow(Math.sin(Math.PI * t), 0.5);
        const rad = Math.max(1.5, (w0 / 2) * (0.92 + 0.16 * fbm(t * 5 + 7, 1.3, ws + 5, 2)));
        path.push({ t, i: A[0] + (B[0] - A[0]) * t + nx * disp, j: A[1] + (B[1] - A[1]) * t + ny * disp, rad });
      }
      streams.push({ path, width: w0, passages: [] });
      for (const p of path) {
        const r = p.rad + 0.35, i0 = Math.floor(p.i - r), i1 = Math.ceil(p.i + r), j0 = Math.floor(p.j - r), j1 = Math.ceil(p.j + r);
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
          if (i < 0 || j < 0 || i >= G || j >= G) continue;
          if (Math.hypot(i - p.i, j - p.j) <= r && own[j * G + i]) mask[j * G + i] = 1;
        }
      }
    }
    if (bad) continue;
    // 1. cada córrego é UM componente (8-conexo), os córregos não se fundem e cada um vai de costa a costa
    const lc = labelComponents8(mask, G, 1);
    if (lc.sizes.length !== S) continue;
    if (!lavaSpansIsland(mask, land, G, lc, R)) continue;
    // 2. fatias minúsculas (< sliverMin células) entre a lava e a costa são absorvidas pela lava
    const walk = new Uint8Array(N);
    for (let c = 0; c < N; c++) walk[c] = own[c] && !mask[c] ? 1 : 0;
    let al = labelComponents8(walk, G, 1);
    for (let c = 0; c < N; c++) if (walk[c] && al.sizes[al.labels[c]] < sliverMin) { mask[c] = 1; walk[c] = 0; }
    al = labelComponents8(walk, G, 1);
    if (al.sizes.length !== S + 1 || al.sizes.some((n) => n < areaMin)) continue;
    // 3. passagens de rocha resfriada: 1–2 por córrego, ~6 células ao longo do fluxo (>= 4,5 u: cabem 3 células de 1,5 u do pathfinder)
    const passInfo = [];
    for (let k = 0; k < S; k++) {
      const n = o.lavaPassages > 0 ? o.lavaPassages : (rng.next() < 0.5 ? 1 : 2);
      const path = streams[k].path, last = path.length - 1;
      const centers = n === 1 ? [rng.range(0.38, 0.62)] : [rng.range(0.2, 0.36), rng.range(0.64, 0.8)];
      for (const tc of centers) {
        const half = 0.5 / (last / 1.6); // ±0,5 célula ao longo do fluxo + raio do disco => ~5–6 células de passagem (>= 3 u)
        const s0 = Math.max(0, Math.round((tc - half) * last)), s1 = Math.min(last, Math.round((tc + half) * last));
        let removed = 0;
        for (let s = s0; s <= s1; s++) {
          const p = path[s], r = p.rad + 0.4;
          for (let j = Math.floor(p.j - r); j <= Math.ceil(p.j + r); j++) for (let i = Math.floor(p.i - r); i <= Math.ceil(p.i + r); i++) {
            if (i < 0 || j < 0 || i >= G || j >= G) continue;
            const c = j * G + i;
            if (mask[c] && Math.hypot(i - p.i, j - p.j) <= r) { mask[c] = 0; passage[c] = 1; removed++; }
          }
        }
        const mid = path[Math.round(tc * last)];
        streams[k].passages.push({ t: tc, i: mid.i, j: mid.j, cells: removed });
        passInfo.push(removed);
      }
    }
    if (passInfo.some((n) => n < 12)) continue;
    // 4. validação: com as passagens FECHADAS as áreas continuam S+1; ABERTAS formam 1 só; cada passagem toca >= 2 áreas
    const closed = new Uint8Array(N), open = new Uint8Array(N);
    for (let c = 0; c < N; c++) { open[c] = own[c] && !mask[c] ? 1 : 0; closed[c] = open[c] && !passage[c] ? 1 : 0; }
    const cl = labelComponents8(closed, G, 1);
    if (cl.sizes.length !== S + 1 || cl.sizes.some((n) => n < areaMin)) continue;
    if (labelComponents8(open, G, 1).sizes.length !== 1) continue;
    const pl = labelComponents8(passage, G, 1);
    let passOk = pl.sizes.length === passInfo.length;
    for (let id = 0; id < pl.sizes.length && passOk; id++) {
      const touch = new Set();
      for (let c = 0; c < N; c++) {
        if (pl.labels[c] !== id) continue;
        const i = c % G, j = (c - i) / G;
        for (const [di, dj] of NB8) { const ii = i + di, jj = j + dj; if (ii >= 0 && jj >= 0 && ii < G && jj < G && closed[jj * G + ii]) touch.add(cl.labels[jj * G + ii]); }
      }
      if (touch.size < 2) passOk = false;
    }
    if (!passOk) continue;
    // 5. uma base por área: célula de maior folga, longe do cone do vulcão
    const nonWalk = new Uint8Array(N);
    for (let c = 0; c < N; c++) nonWalk[c] = closed[c] ? 0 : 1;
    const clr = distanceTransform(nonWalk, G);
    const areas = cl.sizes.map((size, id) => ({ id, size, base: null }));
    const bestScore = areas.map(() => -1);
    for (let c = 0; c < N; c++) {
      const id = cl.labels[c];
      if (id < 0) continue;
      const i = c % G, j = (c - i) / G;
      const rc = Math.hypot(i - ci, j - cj) / R;
      const score = clr[c] * (0.35 + 0.65 * clamp((rc - 0.25) / 0.35, 0, 1));
      if (score > bestScore[id]) { bestScore[id] = score; areas[id].base = { cell: c, i, j, clearance: clr[c] }; }
    }
    if (areas.some((a) => !a.base || a.base.clearance < clearMin)) continue;
    const cellSize = map.cell, half = map.size / 2;
    for (const a of areas) { a.base.x = (a.base.i + 0.5) * cellSize - half; a.base.z = (a.base.j + 0.5) * cellSize - half; a.areaUnits = a.size * cellSize * cellSize; }
    const maskF = Float32Array.from(mask); // boxBlur reaproveita o buffer de entrada: não passar a máscara original
    const soft = boxBlur(maskF, G, 1), glow = boxBlur(Float32Array.from(mask), G, 5);
    return { entity: e.index, mask, passage, soft, glow, streams, areas, bases: areas.map((a) => a.base), passageCount: passInfo.length, areaCount: S + 1, attempts: attempt + 1 };
  }
  return null;
}

/** O córrego (componente de lava) vai de costa a costa: tem células coladas na água em dois pontos separados por >= 0,9·R. */
function lavaSpansIsland(mask, land, G, lc, R) {
  for (let id = 0; id < lc.sizes.length; id++) {
    const pts = [];
    for (let c = 0; c < mask.length; c++) {
      if (lc.labels[c] !== id) continue;
      const i = c % G, j = (c - i) / G;
      for (const [di, dj] of NB8) {
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= G || jj >= G || !land[jj * G + ii]) { pts.push([i, j]); break; }
      }
    }
    let far = 0;
    for (let a = 0; a < pts.length; a++) for (let b = a + 1; b < pts.length; b++) far = Math.max(far, Math.hypot(pts[a][0] - pts[b][0], pts[a][1] - pts[b][1]));
    if (far < 0.9 * R) return false;
  }
  return true;
}

/** Métricas independentes do gerador (usadas pelo teste e pelo `metrics.json`). */
export function lavaStats(map) {
  const lv = map.lava;
  if (!lv) return null;
  let lavaCells = 0, passageCells = 0;
  for (let c = 0; c < lv.mask.length; c++) { lavaCells += lv.mask[c]; passageCells += lv.passage[c]; }
  return {
    streams: lv.streams.length, areas: lv.areaCount, passages: lv.passageCount, lavaCells, passageCells, attempts: lv.attempts,
    lavaAreaUnits: +(lavaCells * map.cell * map.cell).toFixed(1), widthCells: lv.streams.map((s) => +s.width.toFixed(2)),
    areaUnits: lv.areas.map((a) => +a.areaUnits.toFixed(1))
  };
}
