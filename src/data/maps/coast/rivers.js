/**
 * src/data/maps/coast/rivers.js (MUNDO-TERRENO-MAPAS §2.2 "Rios" · MUNDO-1)
 *
 * Rios: cada rio NASCE no interior de um continente (de preferência nas montanhas do continente exuberante), DESCE por um caminho
 * de menor custo até o oceano (custo = comprimento × ruído, mais uma penalidade de subida: o caminho serpenteia e não corre
 * pela crista) e sulca um canal de 3,4–5 u de largura (leito de −0,6 a −1,4, como o `continental`), com a nascente afilada e o
 * DELTA alargado nos últimos 8 u. A cada ~25 u há um VAU (platô de 2,35, caminhável; entra em `fords`). Um rio só é aceito se o
 * continente continuar UMA massa caminhável (vaus contam como terra) e se a foz tocar o oceano; senão sorteia outra nascente
 * (até 8 tentativas por rio).
 *
 * Representação (como a lava): o rio é uma CAMADA sobre a máscara de terra. `land`/`owner` não mudam (o continente continua uma
 * massa só); `map.rivers.mask` marca a água do rio (altura < 0,65: bloqueia terrestres, como o rio do `continental`) e
 * `map.rivers.ford` os vaus. `walkableMask(map)` dá a terra caminhável (sem lava e sem água de rio).
 *
 * Puro e determinístico: usa só o PRNG recebido (`root.fork('rivers')`, que não consome o estado de `root`).
 */
import { fbm, smoothstep } from './noise.js';
import { NB8, CellHeap, distanceTransform, labelComponents } from './grid.js';
import { lushMountain } from './entities.js';
import { rotateIndex } from './rotate.js';

/** Terra caminhável considerando lava e rios: `land` sem lava e sem a ÁGUA dos rios (os vaus continuam terra). */
export function walkableMask(map) {
  const { land, lava, rivers } = map;
  const w = new Uint8Array(land.length);
  for (let c = 0; c < w.length; c++) w[c] = land[c] && !(lava && lava.mask[c]) && !(rivers && rivers.mask[c]) ? 1 : 0;
  return w;
}

/** Média móvel (janela ±`win`) sobre os pontos `[i, j]`, mantendo as pontas fixas. */
function smoothPoints(pts, win, passes) {
  let cur = pts;
  for (let p = 0; p < passes; p++) {
    cur = cur.map((q, k) => {
      if (k === 0 || k === cur.length - 1) return q;
      const w = Math.min(win, k, cur.length - 1 - k);
      let si = 0, sj = 0;
      for (let m = -w; m <= w; m++) { si += cur[k + m][0]; sj += cur[k + m][1]; }
      return [si / (2 * w + 1), sj / (2 * w + 1)];
    });
  }
  return cur;
}

/**
 * Gera os rios do mapa (`o.rivers` por continente; em simetria 'rotate' cada rio ganha um gêmeo girado 180°).
 * @param {object} map   mapa parcial (`options, grid, land, owner, entities, size, cell, lava?`)
 * @param {{ fork: (label: string) => object }} root  PRNG raiz
 * @returns {null | { mask: Uint8Array, ford: Uint8Array, streams: object[], fords: {x,z,r,i,j,s,stream}[], count: number, attempts: number }}
 */
export function generateRivers(map, root) {
  const o = map.options;
  const perContinent = Math.floor(o.rivers || 0);
  if (!(perContinent > 0)) return null;
  const { grid: G, land, owner, entities, cell, size, lava } = map;
  const N = G * G, half = size / 2;
  const rng = root.fork('rivers');
  const sym = o.symmetry === 'rotate';
  const rot = (c) => rotateIndex(c, G);
  const seed = o.seed | 0;

  const water = new Uint8Array(N);
  for (let c = 0; c < N; c++) water[c] = land[c] ? 0 : 1;
  const wl = labelComponents(water, G, 1);
  const oceanId = wl.labels[0];
  const dW = distanceTransform(water, G); // em terra: distância (células) à água mais próxima
  const coast = new Uint8Array(N); // terra com um vizinho (4) de oceano: a foz pode terminar aqui
  for (let c = 0; c < N; c++) {
    if (!land[c]) continue;
    const i = c % G;
    if ((i > 0 && wl.labels[c - 1] === oceanId) || (i < G - 1 && wl.labels[c + 1] === oceanId) || (c >= G && wl.labels[c - G] === oceanId) || (c < N - G && wl.labels[c + G] === oceanId)) coast[c] = 1;
  }

  const total = { mask: new Uint8Array(N), ford: new Uint8Array(N), streams: [], fords: [], attempts: 0 };
  const failedSources = [];
  let noiseSeed = 0;

  /** Tenta um rio no continente `e`; devolve `{ mask, ford, stream, fords }` (estado novo completo) ou `null`. */
  function tryRiver(e, index) {
    const base = total.mask.some((v) => v) || total.ford.some((v) => v);
    const dFoot = base ? distanceTransform(total.mask.map((v, c) => (v || total.ford[c] ? 1 : 0)), G) : null;
    // --- continente: células próprias e profundidade máxima
    const own = new Uint8Array(N);
    let maxD = 0;
    for (let c = 0; c < N; c++) if (land[c] && owner[c] === e.index && !(lava && lava.mask[c])) { own[c] = 1; maxD = Math.max(maxD, dW[c]); }
    if (maxD * cell < 8) return null;
    const minSrc = Math.min(12, 0.7 * maxD * cell);
    // --- nascente: longe da costa, nas montanhas (continente exuberante), longe de rios já feitos e de tentativas que falharam
    let src = -1, best = -Infinity;
    for (let c = 0; c < N; c++) {
      if (!own[c]) continue;
      const d = dW[c] * cell;
      if (d < minSrc) continue;
      if (dFoot && dFoot[c] * cell < 26) continue;
      const i = c % G, j = (c - i) / G;
      if (failedSources.some((f) => Math.hypot(f.i - i, f.j - j) * cell < 12)) continue;
      const x = (i + 0.5) * cell - half, z = (j + 0.5) * cell - half;
      const score = d + (e.biome === 'lush' ? 10 * lushMountain(e, x, z, d, seed) : 0) + 5 * fbm(x * 0.08, z * 0.08, seed + 303 + index * 17, 2);
      if (score > best) { best = score; src = c; }
    }
    if (src < 0) return null;
    const srcI = src % G, srcJ = (src - srcI) / G;

    // --- descida: caminho de menor custo da nascente a toda a costa do continente (Dijkstra, 8 vizinhos)
    const ns = (seed ^ 0x7121) + noiseSeed++ * 977;
    const nz = new Float32Array(N).fill(-1);
    const costAt = (c) => {
      if (nz[c] < 0) {
        const i = c % G, j = (c - i) / G;
        nz[c] = fbm(((i + 0.5) * cell - half) * 0.07, ((j + 0.5) * cell - half) * 0.07, ns, 3);
      }
      return 1 + 3.2 * nz[c] + (dW[c] * cell < 5 ? 1.5 : 0);
    };
    const dist = new Float32Array(N).fill(Infinity), plen = new Float32Array(N), prev = new Int32Array(N).fill(-1);
    const heap = new CellHeap(4096);
    dist[src] = 0; heap.push(src, 0);
    while (heap.size) {
      const c = heap.pop(), dc = heap.lastKey;
      if (dc > dist[c]) continue;
      const i = c % G, j = (c - i) / G;
      for (const [di, dj] of NB8) {
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= G || jj >= G) continue;
        const n = jj * G + ii;
        if (!own[n]) continue;
        const len = di && dj ? Math.SQRT2 : 1;
        const climb = Math.max(0, dW[n] - dW[c]) * cell * 0.5; // subir custa: o rio não corre pela crista
        const nd = dc + len * costAt(n) + climb;
        if (nd < dist[n]) { dist[n] = nd; plen[n] = plen[c] + len; prev[n] = c; heap.push(n, nd); }
      }
    }
    // --- foz: célula da costa cujo caminho tem o comprimento sorteado (>= 22 u), longe de outras fozes
    const wantLen = rng.range(34, 64);
    let mouth = -1, bestGap = Infinity, longest = 0;
    for (let c = 0; c < N; c++) if (coast[c] && own[c] && Number.isFinite(dist[c])) longest = Math.max(longest, plen[c] * cell);
    if (longest < 20) { failedSources.push({ i: srcI, j: srcJ }); return null; }
    const minLen = Math.min(22, 0.8 * longest);
    for (let c = 0; c < N; c++) {
      if (!coast[c] || !own[c] || !Number.isFinite(dist[c])) continue;
      const L = plen[c] * cell;
      if (L < minLen) continue;
      let gap = Math.abs(L - wantLen);
      if (dFoot && dFoot[c] * cell < 22) gap += 40; // evita duas fozes coladas
      if (gap < bestGap) { bestGap = gap; mouth = c; }
    }
    if (mouth < 0) { failedSources.push({ i: srcI, j: srcJ }); return null; }

    // --- traçado: cadeia de células da nascente à foz, suavizada, mais um trecho que entra no mar
    const chain = [];
    for (let c = mouth; c >= 0; c = prev[c]) chain.push([c % G, (c - (c % G)) / G]);
    chain.reverse();
    let pts = smoothPoints(chain, 3, 2);
    // meandro: deslocamento lateral senoidal (amplitude 1,5–3 u, comprimento de onda 24–36 u), nulo nas pontas (foz e nascente)
    {
      const cum = [0];
      for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
      const Lc = cum[cum.length - 1] * cell;
      const amp = rng.range(1.5, 3) / cell, lam = rng.range(24, 36) / cell, phase = rng.range(0, Math.PI * 2);
      pts = pts.map((q, k) => {
        const p0 = pts[Math.max(0, k - 2)], p1 = pts[Math.min(pts.length - 1, k + 2)];
        const tx = p1[0] - p0[0], ty = p1[1] - p0[1], tl = Math.hypot(tx, ty) || 1;
        const sU = cum[k] * cell;
        const env = smoothstep(0, 9, sU) * smoothstep(0, 12, Lc - sU);
        const off = amp * Math.sin((2 * Math.PI * cum[k]) / lam + phase) * env;
        return [q[0] - (ty / tl) * off, q[1] + (tx / tl) * off];
      });
    }
    const a = pts[Math.max(0, pts.length - 6)], b = pts[pts.length - 1];
    const ln = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    for (let k = 1; k <= 3; k++) pts.push([b[0] + ((b[0] - a[0]) / ln) * k, b[1] + ((b[1] - a[1]) / ln) * k]);
    // reamostra a 0,5 célula e acumula o comprimento (u)
    const samples = [];
    let acc = 0;
    for (let k = 0; k + 1 < pts.length; k++) {
      const p = pts[k], q = pts[k + 1];
      const seg = Math.hypot(q[0] - p[0], q[1] - p[1]);
      const n = Math.max(1, Math.ceil(seg / 0.5));
      for (let m = 0; m < n; m++) {
        const t = m / n;
        samples.push({ i: p[0] + (q[0] - p[0]) * t, j: p[1] + (q[1] - p[1]) * t, s: (acc + seg * t) * cell });
      }
      acc += seg;
    }
    const last = pts[pts.length - 1];
    samples.push({ i: last[0], j: last[1], s: acc * cell });
    const L = acc * cell; // comprimento (u), já com o trecho final no mar
    const w0 = rng.range(o.riverWidth[0], o.riverWidth[1]); // largura (u)
    const ws = (rng.range(0, 1000) | 0);
    for (const p of samples) {
      const taper = 0.5 + 0.5 * smoothstep(0, 8, p.s); // nascente afilada
      const delta = 1 + 0.9 * smoothstep(L - 11, L - 3, p.s); // delta: alarga nos últimos ~8 u
      const wob = 0.92 + 0.16 * fbm(p.s * 0.15, 1.3, ws, 2);
      p.rad = Math.max(1.2, (w0 / 2 / cell) * taper * delta * wob);
    }
    // --- sulco do canal (só sobre a terra do continente)
    const mask = new Uint8Array(N);
    for (const p of samples) {
      const r = p.rad + 0.35;
      for (let j = Math.floor(p.j - r); j <= Math.ceil(p.j + r); j++) for (let i = Math.floor(p.i - r); i <= Math.ceil(p.i + r); i++) {
        if (i < 0 || j < 0 || i >= G || j >= G) continue;
        const c = j * G + i;
        if (own[c] && (i - p.i) * (i - p.i) + (j - p.j) * (j - p.j) <= r * r) mask[c] = 1;
      }
    }
    // --- vaus: a cada ~`riverFordSpacing` u (nenhum na nascente nem no delta), cada um cobre a largura inteira do leito
    const ford = new Uint8Array(N);
    const fordList = [];
    const usable = L - 3 - 8 - 6; // do fim da nascente afilada até o começo do delta (sem o trecho que entra no mar)
    const nFords = usable < 4 ? 0 : Math.max(1, Math.round(usable / o.riverFordSpacing));
    for (let k = 0; k < nFords; k++) {
      const s = 6 + (usable * (k + 0.5)) / nFords + rng.range(-1.5, 1.5);
      let pi = 0;
      for (let m = 1; m < samples.length; m++) if (Math.abs(samples[m].s - s) < Math.abs(samples[pi].s - s)) pi = m;
      const p = samples[pi];
      const rf = Math.max(4.2, p.rad * cell + 2.6); // u
      const rc = rf / cell;
      for (let j = Math.floor(p.j - rc); j <= Math.ceil(p.j + rc); j++) for (let i = Math.floor(p.i - rc); i <= Math.ceil(p.i + rc); i++) {
        if (i < 0 || j < 0 || i >= G || j >= G) continue;
        const c = j * G + i;
        if (mask[c] && (i - p.i) * (i - p.i) + (j - p.j) * (j - p.j) <= rc * rc) { mask[c] = 0; ford[c] = 1; }
      }
      fordList.push({ x: (p.i + 0.5) * cell - half, z: (p.j + 0.5) * cell - half, r: +rf.toFixed(2), i: p.i, j: p.j, s: +p.s.toFixed(2), stream: total.streams.length });
    }
    const stream = {
      entity: e.index, source: { i: srcI, j: srcJ }, mouth: { i: mouth % G, j: (mouth - (mouth % G)) / G },
      length: +L.toFixed(2), width: +w0.toFixed(2), path: samples.map((p) => ({ i: +p.i.toFixed(3), j: +p.j.toFixed(3), s: +p.s.toFixed(2), rad: +p.rad.toFixed(3) })), fords: fordList.length, twin: false
    };
    // --- estado novo = anterior + este rio (+ gêmeo girado 180° na simetria 'rotate'; máscaras giradas ficam exatas)
    const mask2 = new Uint8Array(total.mask), ford2 = new Uint8Array(total.ford);
    for (let c = 0; c < N; c++) { if (mask[c]) mask2[c] = 1; if (ford[c]) ford2[c] = 1; }
    const fords = fordList.slice();
    if (sym) {
      for (let c = 0; c < N; c++) { if (mask[c]) mask2[rot(c)] = 1; if (ford[c]) ford2[rot(c)] = 1; }
      for (const f of fordList) fords.push({ ...f, x: -f.x, z: -f.z, i: G - 1 - f.i, j: G - 1 - f.j, stream: f.stream + 1 });
    }
    for (let c = 0; c < N; c++) if (ford2[c]) mask2[c] = 0;
    // --- validação: o continente continua UMA massa caminhável e a foz toca o oceano
    const walk = new Uint8Array(N);
    for (let c = 0; c < N; c++) walk[c] = own[c] && !mask2[c] ? 1 : 0;
    if (labelComponents(walk, G, 1).sizes.length !== 1) { failedSources.push({ i: srcI, j: srcJ }); return null; }
    let touches = false;
    for (let c = 0; c < N && !touches; c++) {
      if (!mask2[c] || !mask[c]) continue;
      const i = c % G;
      if ((i > 0 && wl.labels[c - 1] === oceanId) || (i < G - 1 && wl.labels[c + 1] === oceanId) || (c >= G && wl.labels[c - G] === oceanId) || (c < N - G && wl.labels[c + G] === oceanId)) touches = true;
    }
    if (!touches) { failedSources.push({ i: srcI, j: srcJ }); return null; }
    return { mask: mask2, ford: ford2, stream, twin: sym ? { ...stream, twin: true, source: { i: G - 1 - srcI, j: G - 1 - srcJ }, mouth: { i: G - 1 - stream.mouth.i, j: G - 1 - stream.mouth.j }, path: stream.path.map((p) => ({ ...p, i: +(G - 1 - p.i).toFixed(3), j: +(G - 1 - p.j).toFixed(3) })) } : null, fords };
  }

  for (const e of entities) {
    if (e.kind !== 'continent') continue;
    for (let k = 0; k < perContinent; k++) {
      for (let attempt = 0; attempt < 8; attempt++) {
        total.attempts++;
        const r = tryRiver(e, k);
        if (!r) continue;
        total.mask = r.mask; total.ford = r.ford;
        total.streams.push(r.stream);
        if (r.twin) total.streams.push(r.twin);
        total.fords.push(...r.fords);
        break;
      }
    }
  }
  if (!total.streams.length) return null;
  total.count = total.streams.length;
  return total;
}

/** Métricas independentes do gerador para os rios (usadas pelo teste e pelo relatório). */
export function riverStats(map) {
  const rv = map.rivers;
  if (!rv) return null;
  let waterCells = 0, fordCells = 0;
  for (let c = 0; c < rv.mask.length; c++) { waterCells += rv.mask[c]; fordCells += rv.ford[c]; }
  return {
    count: rv.count, waterCells, fordCells, fords: rv.fords.length, attempts: rv.attempts,
    lengths: rv.streams.map((s) => s.length), widths: rv.streams.map((s) => s.width),
    waterAreaUnits: +(waterCells * map.cell * map.cell).toFixed(1)
  };
}

