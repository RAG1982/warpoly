/**
 * src/data/maps/coast/grid.js (MUNDO-TERRENO-MAPAS §2.2 · MUNDO-1)
 *
 * Operações puras sobre grades quadradas `G × G` (índice `j * G + i`, j = z, i = x): rotulagem de componentes, transformada de
 * distância, filtros morfológicos e BFS. Sem DOM, sem three.js, sem aleatoriedade.
 */

/** Vizinhança 8-conexa: esquerda, direita, cima, baixo e as 4 diagonais. */
export const NB8 = Object.freeze([[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]);

/** Rotula componentes 4-conexos de `mask[i] === value`. Devolve `{ labels (Int32, -1 = fora), sizes }`. */
export function labelComponents(mask, G, value = 1) {
  const N = G * G;
  const labels = new Int32Array(N).fill(-1);
  const sizes = [];
  const queue = new Int32Array(N);
  for (let s = 0; s < N; s++) {
    if (mask[s] !== value || labels[s] >= 0) continue;
    const id = sizes.length;
    let head = 0, tail = 0, count = 0;
    queue[tail++] = s; labels[s] = id;
    while (head < tail) {
      const c = queue[head++]; count++;
      const i = c % G;
      if (i > 0 && mask[c - 1] === value && labels[c - 1] < 0) { labels[c - 1] = id; queue[tail++] = c - 1; }
      if (i < G - 1 && mask[c + 1] === value && labels[c + 1] < 0) { labels[c + 1] = id; queue[tail++] = c + 1; }
      if (c >= G && mask[c - G] === value && labels[c - G] < 0) { labels[c - G] = id; queue[tail++] = c - G; }
      if (c < N - G && mask[c + G] === value && labels[c + G] < 0) { labels[c + G] = id; queue[tail++] = c + G; }
    }
    sizes.push(count);
  }
  return { labels, sizes };
}

/** Rotula componentes 8-conexos de `mask[i] === value` (sem regra de "corte de quina": a lava e o rio precisam vedar até na diagonal). */
export function labelComponents8(mask, G, value = 1) {
  const N = G * G;
  const labels = new Int32Array(N).fill(-1);
  const sizes = [];
  const queue = new Int32Array(N);
  for (let s = 0; s < N; s++) {
    if (mask[s] !== value || labels[s] >= 0) continue;
    const id = sizes.length;
    let head = 0, tail = 0;
    queue[tail++] = s; labels[s] = id;
    while (head < tail) {
      const c = queue[head++];
      const i = c % G, j = (c - i) / G;
      for (const [di, dj] of NB8) {
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= G || jj >= G) continue;
        const n = jj * G + ii;
        if (mask[n] === value && labels[n] < 0) { labels[n] = id; queue[tail++] = n; }
      }
    }
    sizes.push(tail);
  }
  return { labels, sizes };
}

/** Transformada de distância (chanfro 1/√2) em células até a célula-fonte mais próxima (`source[i] === 1`). */
export function distanceTransform(source, G) {
  const INF = 1e9, R2 = Math.SQRT2;
  const d = new Float32Array(G * G);
  for (let i = 0; i < d.length; i++) d[i] = source[i] === 1 ? 0 : INF;
  for (let j = 0; j < G; j++) {
    for (let i = 0; i < G; i++) {
      const c = j * G + i;
      let v = d[c];
      if (i > 0) v = Math.min(v, d[c - 1] + 1);
      if (j > 0) {
        v = Math.min(v, d[c - G] + 1);
        if (i > 0) v = Math.min(v, d[c - G - 1] + R2);
        if (i < G - 1) v = Math.min(v, d[c - G + 1] + R2);
      }
      d[c] = v;
    }
  }
  for (let j = G - 1; j >= 0; j--) {
    for (let i = G - 1; i >= 0; i--) {
      const c = j * G + i;
      let v = d[c];
      if (i < G - 1) v = Math.min(v, d[c + 1] + 1);
      if (j < G - 1) {
        v = Math.min(v, d[c + G] + 1);
        if (i < G - 1) v = Math.min(v, d[c + G + 1] + R2);
        if (i > 0) v = Math.min(v, d[c + G - 1] + R2);
      }
      d[c] = v;
    }
  }
  return d;
}

/** Filtro de maioria 3×3 (tira dentes e buracos de 1 célula). */
export function majorityFilter(mask, G, passes = 2) {
  let cur = mask;
  for (let p = 0; p < passes; p++) {
    const next = new Uint8Array(cur);
    for (let j = 1; j < G - 1; j++) {
      for (let i = 1; i < G - 1; i++) {
        let s = 0;
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) s += cur[(j + dj) * G + i + di];
        if (s >= 6) next[j * G + i] = 1; else if (s <= 3) next[j * G + i] = 0;
      }
    }
    cur = next;
  }
  return cur;
}

/** Mantém só o maior componente 4-conexo da máscara. */
export function keepLargest(mask, G) {
  const { labels, sizes } = labelComponents(mask, G, 1);
  if (sizes.length <= 1) return mask;
  let best = 0;
  for (let k = 1; k < sizes.length; k++) if (sizes[k] > sizes[best]) best = k;
  const out = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i++) if (labels[i] === best) out[i] = 1;
  return out;
}

/** Suavização por média 3×3 (`passes` passadas). Devolve um buffer novo (ou `src` se `passes` = 0). */
export function boxBlur(src, G, passes = 2) {
  let a = src, b = new Float32Array(src.length);
  for (let p = 0; p < passes; p++) {
    for (let j = 0; j < G; j++) {
      for (let i = 0; i < G; i++) {
        let s = 0, n = 0;
        for (let dj = -1; dj <= 1; dj++) {
          const jj = j + dj; if (jj < 0 || jj >= G) continue;
          for (let di = -1; di <= 1; di++) { const ii = i + di; if (ii < 0 || ii >= G) continue; s += a[jj * G + ii]; n++; }
        }
        b[j * G + i] = s / n;
      }
    }
    [a, b] = [b, a];
  }
  return a;
}

/** BFS 8-conexo (só pela máscara caminhável `walk`) de `from` a `to` (índices de célula). */
export function bfsReach(walk, G, from, to) {
  if (!walk[from] || !walk[to]) return false;
  const seen = new Uint8Array(walk.length), q = [from];
  seen[from] = 1;
  for (let h = 0; h < q.length; h++) {
    const c = q[h];
    if (c === to) return true;
    const i = c % G, j = (c - i) / G;
    for (const [di, dj] of NB8) {
      const ii = i + di, jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= G || jj >= G) continue;
      const n = jj * G + ii;
      if (walk[n] && !seen[n]) { seen[n] = 1; q.push(n); }
    }
  }
  return false;
}
