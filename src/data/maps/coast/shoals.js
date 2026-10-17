/**
 * src/data/maps/coast/shoals.js (M2-04 · baixios e gelo flutuante)
 *
 * Baixios: manchas de mar RASO (altura ~0,3: abaixo da linha d'água 0,5, mas acima de `NAVAL_MAX_HEIGHT` 0,1) espalhadas pela água aberta.
 * Nem navio nem tropa passam por elas; o que sobra de água funda forma os canais. Servem de recifes (Baixio do Breu, bioma "areia") e de
 * banquisa (A Geada, bioma "gelo": gelo NÃO navegável). Cada mancha só é aceita se não cortar a rota naval (o núcleo da água funda, a
 * `shoalChannel` u das margens, continua um só pedaço). Puro e determinístico (PRNG semeado). Desligado por padrão (`shoals: 0`).
 */
import { labelComponents, distanceTransform } from './grid.js';
import { fbm } from './noise.js';
import { BIOME } from './constants.js';

/** Maior componente do "núcleo" navegável: água funda a ≥ `channel` u de qualquer terra ou baixio. */
function coreSize(map, shoal, channel) {
  const { grid: G, cell, land } = map;
  const N = G * G;
  const blocked = new Uint8Array(N);
  for (let c = 0; c < N; c++) blocked[c] = land[c] || shoal[c] ? 1 : 0;
  const dt = distanceTransform(blocked, G);
  const core = new Uint8Array(N);
  for (let c = 0; c < N; c++) core[c] = dt[c] * cell >= channel ? 1 : 0;
  const lc = labelComponents(core, G, 1);
  let best = 0;
  for (const s of lc.sizes) if (s > best) best = s;
  return best;
}

/**
 * Espalha `options.shoals` manchas de raio `options.shoalRadius` ([mín, máx] u), a ≥ `shoalMinCoast` u da terra e a `shoalMargin` u da borda.
 * @returns {{ count: number, cells: number, tries: number }|null}
 */
export function applyShoals(map, root) {
  const o = map.options;
  if (!(o.shoals > 0)) return null;
  const { grid: G, cell, land, size } = map;
  const N = G * G, half = size / 2;
  const rng = root.fork('shoals');
  const channel = o.shoalChannel ?? 3.2;
  const margin = o.shoalMargin ?? 14;
  const shoal = new Uint8Array(N);
  const coastDist = distanceTransform(land, G);
  const biome = BIOME[String(o.shoalBiome || 'SAND').toUpperCase()];
  const [r0, r1] = o.shoalRadius ?? [6, 14];
  let count = 0, tries = 0, cells = 0;
  let base = coreSize(map, shoal, channel);
  while (count < o.shoals && tries < o.shoals * 14) {
    tries++;
    const cx = rng.range(-half + margin, half - margin), cz = rng.range(-half + margin, half - margin);
    const ra = rng.range(r0, r1), rb = ra * rng.range(0.45, 0.9), rot = rng.range(0, Math.PI);
    const cs = Math.cos(rot), sn = Math.sin(rot), seed = (o.seed * 97 + tries * 31) | 0;
    const mine = [];
    const R = ra * 1.5;
    const i0 = Math.max(0, Math.floor((cx - R + half) / cell)), i1 = Math.min(G - 1, Math.ceil((cx + R + half) / cell));
    const j0 = Math.max(0, Math.floor((cz - R + half) / cell)), j1 = Math.min(G - 1, Math.ceil((cz + R + half) / cell));
    for (let j = j0; j <= j1; j++) {
      const z = (j + 0.5) * cell - half;
      for (let i = i0; i <= i1; i++) {
        const c = j * G + i, x = (i + 0.5) * cell - half;
        if (land[c] || shoal[c] || coastDist[c] * cell < (o.shoalMinCoast ?? 4)) continue;
        if (Math.abs(x) > half - margin || Math.abs(z) > half - margin) continue;
        const dx = x - cx, dz = z - cz;
        const ex = (dx * cs + dz * sn) / ra, ez = (-dx * sn + dz * cs) / rb;
        const f = Math.hypot(ex, ez) + (fbm(x * 0.12, z * 0.12, seed, 3) - 0.5) * 0.7;
        if (f < 1) mine.push(c);
      }
    }
    if (mine.length < 25) continue;
    for (const c of mine) shoal[c] = 1;
    const after = coreSize(map, shoal, channel);
    // o que o núcleo perdeu além das células da própria mancha é rota cortada
    let blobInCore = 0;
    for (const c of mine) if (coastDist[c] * cell >= channel) blobInCore++;
    if (base - after - blobInCore > 0.01 * base) { for (const c of mine) shoal[c] = 0; continue; }
    base = after;
    count++; cells += mine.length;
  }
  const H = o.shoalHeight ?? 0.3;
  for (let c = 0; c < N; c++) {
    if (!shoal[c]) continue;
    const i = c % G, j = (c - i) / G;
    const x = (i + 0.5) * cell - half, z = (j + 0.5) * cell - half;
    map.height[c] = H + (fbm(x * 0.2, z * 0.2, (o.seed ^ 0x5b0a1) | 0, 2) - 0.5) * 0.12;
    map.biome[c] = biome;
  }
  map.shoal = shoal;
  return { count, cells, tries };
}
