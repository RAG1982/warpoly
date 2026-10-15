/**
 * src/data/maps/coast/analyze.js (MUNDO-TERRENO-MAPAS §2.2 passo 6 · MUNDO-1)
 *
 * Métricas independentes do gerador: irregularidade da costa (perímetro/disco, Crofton), dimensão fractal (contagem de caixas),
 * componentes de terra por entidade, lagos e rota naval. `analyzeMap` é a "verificação embutida" que o teste e o relatório usam.
 */
import { labelComponents, distanceTransform } from './grid.js';
import { lavaStats } from './lavaStreams.js';
import { LAND_HEIGHT } from './constants.js';

/**
 * Perímetro (em células) pela fórmula de Cauchy–Crofton com 4 direções (0°, 90°, 45°, 135°): `P = π/8 · Σ dᵢ·Nᵢ`.
 * Fora da grade conta como água. Estimador sem o viés de "escada" da contagem de arestas.
 */
export function crofton(mask, G, value = 1) {
  const at = (i, j) => (i < 0 || j < 0 || i >= G || j >= G ? 0 : mask[j * G + i] === value ? 1 : 0);
  let n0 = 0, n90 = 0, n45 = 0, n135 = 0;
  for (let j = -1; j < G; j++) {
    for (let i = -1; i < G; i++) {
      const a = at(i, j);
      if (a !== at(i + 1, j)) n0++;
      if (a !== at(i, j + 1)) n90++;
      if (a !== at(i + 1, j + 1)) n45++;
      if (at(i + 1, j) !== at(i, j + 1)) n135++;
    }
  }
  return (Math.PI / 8) * (n0 + n90 + (n45 + n135) / Math.SQRT2);
}

/**
 * Índice de irregularidade = perímetro / perímetro de um disco de mesma área (1 = círculo; quadrado ≈ 1,13; costa natural ≳ 1,6).
 * `perimetro/√área` normalizado por `2√π`, o que o torna independente de escala. Por componente; devolve o agregado.
 * @returns {{ all: number, weighted: number, largest: number, components: {area:number, perimeter:number, index:number}[] }} áreas/perímetros em células
 */
export function irregularityIndex(mask, G) {
  const { labels, sizes } = labelComponents(mask, G, 1);
  const comps = [];
  for (let id = 0; id < sizes.length; id++) {
    const m = new Uint8Array(G * G);
    for (let c = 0; c < m.length; c++) if (labels[c] === id) m[c] = 1;
    const perimeter = crofton(m, G, 1);
    comps.push({ area: sizes[id], perimeter, index: perimeter / (2 * Math.sqrt(Math.PI * sizes[id])) });
  }
  const real = comps.filter((c) => c.area >= 20);
  const sumP = real.reduce((s, c) => s + c.perimeter, 0);
  const sumD = real.reduce((s, c) => s + 2 * Math.sqrt(Math.PI * c.area), 0);
  const largest = comps.reduce((b, c) => (c.area > (b?.area ?? 0) ? c : b), null);
  const big = comps.filter((c) => c.area >= 150);
  const bigArea = big.reduce((s2, c) => s2 + c.area, 0);
  const weighted = bigArea ? big.reduce((s2, c) => s2 + c.index * c.area, 0) / bigArea : 0; // ponderado por área (ignora ilhotas < 150 células)
  return { all: sumD ? sumP / sumD : 0, weighted, largest: largest?.index ?? 0, components: comps };
}

/** Fechamento morfológico (dilata `r` células e erode `r`): funde canais/rios estreitos e ilhotas coladas → contorno EXTERNO da massa de terra. */
export function closeMask(mask, G, r = 6) {
  const dl = distanceTransform(mask, G);
  const dil = new Uint8Array(mask.length);
  for (let c = 0; c < dil.length; c++) dil[c] = dl[c] <= r ? 1 : 0;
  const inv = new Uint8Array(mask.length);
  for (let c = 0; c < inv.length; c++) inv[c] = dil[c] ? 0 : 1;
  // fora da grade conta como água: borda é "não-dilatado"
  for (let i = 0; i < G; i++) { inv[i] = 1; inv[(G - 1) * G + i] = 1; inv[i * G] = 1; inv[i * G + G - 1] = 1; }
  const de = distanceTransform(inv, G);
  const out = new Uint8Array(mask.length);
  for (let c = 0; c < out.length; c++) out[c] = dil[c] && de[c] > r ? 1 : 0;
  return out;
}

/**
 * Índice "externo" (só para os mapas ATUAIS): irregularidade do contorno da massa de terra depois de fechar rios/canais (raio `r`
 * células) e de descartar componentes com menos de `minCells`; ponderado pela ÁREA. Serve para tirar o rio do `continental-1v1`
 * da conta (o rio inflava o perímetro). NÃO usar nos mapas novos: o fechamento fundiria ilhas separadas por canais estreitos.
 */
export function outerIrregularity(mask, G, { r = 10, minCells = 150 } = {}) {
  const closed = closeMask(mask, G, r);
  const idx = irregularityIndex(closed, G);
  const real = idx.components.filter((c) => c.area >= minCells);
  const area = real.reduce((s, c) => s + c.area, 0);
  return { weighted: area ? real.reduce((s, c) => s + c.index * c.area, 0) / area : 0, components: real.length, largest: idx.largest };
}

/**
 * Dimensão fractal da costa por contagem de caixas (box-counting) em escalas 2..32 células: curvas lisas/polígonos ≈ 1,0;
 * costas naturais ≈ 1,1–1,3. Insensível a rios e canais lisos (que inflam o índice perímetro/área), por isso é a 2ª métrica.
 */
export function coastFractalDimension(mask, G, scales = [2, 3, 4, 6, 8, 12, 16, 24, 32]) {
  const edge = [];
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
    const c = j * G + i;
    if (!mask[c]) continue;
    if (i === 0 || j === 0 || i === G - 1 || j === G - 1 || !mask[c - 1] || !mask[c + 1] || !mask[c - G] || !mask[c + G]) edge.push(i, j);
  }
  const xs = [], ys = [];
  for (const sc of scales) {
    const seen = new Set();
    for (let k = 0; k < edge.length; k += 2) seen.add(Math.floor(edge[k + 1] / sc) * 4096 + Math.floor(edge[k] / sc));
    xs.push(Math.log(1 / sc)); ys.push(Math.log(seen.size));
  }
  const n = xs.length, mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let k = 0; k < n; k++) { num += (xs[k] - mx) * (ys[k] - my); den += (xs[k] - mx) ** 2; }
  return den ? num / den : 0;
}

/** Máscara terra/água de um mapa do jogo (`mapDef`) amostrando `heightFn(mapDef, x, z) >= 0,65` numa grade `G × G` sobre `size`. */
export function landMaskFromHeight(mapDef, heightFn, G = 256) {
  const mask = new Uint8Array(G * G);
  const cell = mapDef.size / G;
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
    if (heightFn(mapDef, (i + 0.5) * cell - mapDef.size / 2, (j + 0.5) * cell - mapDef.size / 2) >= LAND_HEIGHT) mask[j * G + i] = 1;
  }
  return mask;
}

/** Estatísticas do mapa gerado (usadas pelo teste e pelo relatório). */
export function analyzeMap(map) {
  const { grid: G, cell, land, owner, entities } = map;
  const N = G * G;
  const cells = land.reduce((s, v) => s + v, 0);
  const comp = labelComponents(land, G, 1);
  const perEntity = entities.map((e) => {
    const ids = new Set();
    for (let c = 0; c < N; c++) if (owner[c] === e.index && land[c]) ids.add(comp.labels[c]);
    const m = new Uint8Array(N);
    for (let c = 0; c < N; c++) if (owner[c] === e.index) m[c] = 1;
    return { id: e.id, kind: e.kind, biome: e.biome, components: ids.size, area: e.area, index: irregularityIndex(m, G).largest };
  });
  // rota naval: água com ≥ 2 células da terra deve formar (quase) um só componente ligado ao oceano
  const dLand = distanceTransform(land, G);
  const nav = new Uint8Array(N);
  for (let c = 0; c < N; c++) nav[c] = !land[c] && dLand[c] >= 2 ? 1 : 0;
  const nl = labelComponents(nav, G, 1);
  const navTotal = nl.sizes.reduce((s, v) => s + v, 0);
  const mainNav = nl.sizes.indexOf(Math.max(...nl.sizes));
  const reach = (e) => {
    for (let c = 0; c < N; c++) {
      if (owner[c] !== e.index || !land[c]) continue;
      const i = c % G, j = (c - i) / G;
      for (let dj = -4; dj <= 4; dj++) for (let di = -4; di <= 4; di++) {
        const ii = i + di, jj = j + dj;
        if (ii >= 0 && jj >= 0 && ii < G && jj < G && nl.labels[jj * G + ii] === mainNav) return true;
      }
    }
    return false;
  };
  return {
    landFraction: cells / N,
    landComponents: comp.sizes.length,
    entityComponents: perEntity.map((p) => p.components),
    perEntity,
    lakes: map.lakes,
    smallestLake: map.lakes.length ? Math.min(...map.lakes) : Infinity,
    seaMainFraction: navTotal ? nl.sizes[mainNav] / navTotal : 0,
    allEntitiesReachableBySea: entities.every(reach),
    irregularity: irregularityIndex(land, G),
    fractalDim: coastFractalDimension(land, G),
    lava: lavaStats(map),
    cell
  };
}
