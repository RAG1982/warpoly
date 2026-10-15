/**
 * src/data/maps/coast/entities.js (MUNDO-TERRENO-MAPAS §2.2 · MUNDO-1)
 *
 * Entidades do mundo (continentes, ilhas, ilhotas) e o campo escalar de cada uma: `f(x,z) = 1 - r/R(θ) + ruído + enseadas/penínsulas`
 * (`f > 0` = terra). `r/R(θ)` é a distância elíptica normalizada pelo raio angular `R(θ)` (série de Fourier aleatória, k = 2..6);
 * o ruído é fBm de domínio deformado (domain warp); enseadas (gaussianas negativas) e penínsulas (positivas) são explícitas.
 * Puro e determinístico: a aleatoriedade vem do PRNG (`mulberry32`) recebido por parâmetro.
 */
import { fbm } from './noise.js';

/** Tipos de ilha: ordem fixa (os 6 primeiros são distintos). `r` = raio-base em u; `stretch` = alongamento. */
export const ISLAND_TYPES = Object.freeze([
  { biome: 'volcanic', r: [14, 16.5], stretch: 1.05, rough: 0.45, noise: 0.40 },
  { biome: 'rocky', r: [10, 12.5], stretch: 1.25, rough: 1.0, noise: 0.62, ridged: true },
  { biome: 'ice', r: [10, 12], stretch: 1.6, rough: 0.7, noise: 0.5 },
  { biome: 'swamp', r: [11, 13], stretch: 1.15, rough: 1.1, noise: 0.62 },
  { biome: 'tropical', r: [9, 11], stretch: 1.2, rough: 0.8, noise: 0.5 },
  { biome: 'atoll', r: [10, 11.5], stretch: 1.0, rough: 0.6, noise: 0.35, ring: true },
  { biome: 'rocky', r: [8, 10], stretch: 1.4, rough: 1.2, noise: 0.65, ridged: true },
  { biome: 'tropical', r: [8, 9.5], stretch: 1.3, rough: 0.9, noise: 0.55 },
  { biome: 'swamp', r: [8, 10], stretch: 1.2, rough: 1.0, noise: 0.6 }
]);

/** Biomas das ilhas grandes (arquipélago de 4 jogadores): ciclam por quadrante; só visual. */
export const BIG_ISLAND_BIOMES = Object.freeze(['lush', 'arid', 'lush', 'arid', 'swamp', 'rocky']);

export function makeHarmonics(rng, rough) {
  const h = [];
  for (let k = 2; k <= 6; k++) h.push({ k, a: rng.range(0.4, 1) * 0.24 * rough / Math.pow(k, 0.55), p: rng.range(0, Math.PI * 2) });
  return h;
}

export function makeFeatures(rng, count, type) {
  const out = [];
  const used = [];
  for (let n = 0; n < count; n++) {
    let theta = 0;
    for (let t = 0; t < 30; t++) {
      theta = rng.range(0, Math.PI * 2);
      if (used.every((u) => Math.abs(Math.atan2(Math.sin(theta - u), Math.cos(theta - u))) > 0.7)) break;
    }
    used.push(theta);
    out.push(type === 'bay'
      ? { type, theta, c0: rng.range(0.62, 0.82), sa: rng.range(0.22, 0.34), sp: rng.range(0.06, 0.1), amp: rng.range(0.7, 1.0) }
      : { type, theta, c0: rng.range(1.02, 1.12), sa: rng.range(0.2, 0.32), sp: rng.range(0.06, 0.09), amp: rng.range(0.55, 0.8) });
  }
  return out;
}

/** Campo escalar de uma entidade: > 0 = terra, 0 = costa. */
export function entityField(e, x, z, o) {
  const sx = e.flipX ? -1 : 1;
  const dx0 = (x - e.cx) * sx, dz0 = z - e.cz;
  const c = Math.cos(e.rot), s = Math.sin(e.rot);
  const ex = (dx0 * c + dz0 * s) / e.rx, ez = (-dx0 * s + dz0 * c) / e.rz;
  const r = Math.hypot(ex, ez);
  const th = Math.atan2(ez, ex);
  let R = 1;
  for (const h of e.harmonics) R += h.a * Math.cos(h.k * th + h.p);
  R = Math.max(0.5, R);
  const base = e.ring ? 1 - Math.abs(r / R - 0.72) / 0.3 : 1 - r / R;
  // deformação de domínio + fBm (+ "ridged" para costa de rocha serrilhada)
  const Rw = Math.max(e.rx, e.rz);
  const wf = 1 / (1.3 * Rw), nf = 1 / (0.9 * Rw);
  const rough = o.roughness * e.rough;
  const wx = fbm(x * wf + 11.1, z * wf - 4.7, e.seed + 1, 3, 0.5) - 0.5;
  const wz = fbm(x * wf - 7.3, z * wf + 19.9, e.seed + 2, 3, 0.5) - 0.5;
  const q = e.warp * rough * Rw;
  let n = fbm((x + wx * q) * nf, (z + wz * q) * nf, e.seed + 3, 5, 0.42 + 0.16 * Math.min(1.5, rough)) - 0.5;
  if (e.ridged) n = (1 - Math.abs(n * 4)) * 0.5 - 0.25 + n * 0.5;
  let f = base + n * e.noise * (0.55 + 0.45 * rough) * 1.6;
  f += (fbm(x * 0.13 + 5.5, z * 0.13 - 2.2, e.seed + 9, 3, 0.55) - 0.5) * 0.2 * rough + (fbm(x * 0.26 - 3.1, z * 0.26 + 8.4, e.seed + 10, 2, 0.5) - 0.5) * 0.1 * rough; // detalhe fino: pontas e reentrâncias de ~4–8 u
  for (const b of e.features) {
    const ca = Math.cos(b.theta), sa = Math.sin(b.theta);
    const along = ex * ca + ez * sa, perp = -ex * sa + ez * ca;
    const g = Math.exp(-0.5 * (((along - b.c0) / b.sa) ** 2 + (perp / b.sp) ** 2));
    f += b.type === 'bay' ? -b.amp * g : b.amp * g;
  }
  return f;
}

export function continentEntity(id, biome, cx, cz, rng, o, seed) {
  const rx = 0.135 * o.size * rng.range(0.94, 1.08) * o.continentScale, rz = 0.34 * o.size * rng.range(0.9, 1.04) * o.continentScale;
  return {
    id, kind: 'continent', biome, cx, cz, rx, rz, rot: rng.range(-0.35, 0.35), seed, flipX: false,
    harmonics: makeHarmonics(rng, o.roughness), noise: 0.7, warp: 0.5, rough: 1,
    features: [...makeFeatures(rng, o.bays, 'bay'), ...makeFeatures(rng, o.peninsulas, 'peninsula')]
  };
}

export function islandEntity(id, type, cx, cz, rng, o, seed) {
  const r = rng.range(type.r[0], type.r[1]);
  return {
    id, kind: 'island', biome: type.biome, cx, cz, rx: r * type.stretch, rz: r / Math.sqrt(type.stretch) * 1.0, rot: rng.range(0, Math.PI),
    seed, flipX: false, harmonics: makeHarmonics(rng, type.rough * o.roughness), noise: type.noise, warp: 0.3, rough: type.rough,
    ridged: !!type.ridged, ring: !!type.ring, features: [], r
  };
}
