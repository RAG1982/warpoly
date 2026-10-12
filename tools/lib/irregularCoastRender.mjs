/**
 * tools/lib/irregularCoastRender.mjs — prévias RGBA do protótipo `irregularCoast.mjs` (sem PNG/DOM; o encode fica em
 * `tools/lib/png.mjs`, chamado por `tools/proto/irregular-coast.mjs`).
 *  - `renderBiomePreview(map, px)`: mar profundo/raso turquesa, areia, grama, deserto, rocha, vulcânico, neve… com relevo sombreado.
 *  - `renderParchmentPreview(map, px)`: estilo "mapa antigo" (pergaminho, costa em tinta, linhas de eco no mar, montanhas, rosa dos ventos).
 *  - `renderMaskPreview(mask, G, px)`: máscara terra/água simples (comparar com os mapas atuais do jogo).
 */
import { BIOME, fbm, valueNoise } from './irregularCoast.mjs';

const BIOME_RGB = {
  [BIOME.SAND]: [228, 208, 152], [BIOME.GRASS]: [88, 158, 62], [BIOME.SAVANNA]: [184, 170, 82], [BIOME.DESERT]: [216, 172, 100],
  [BIOME.STEPPE]: [170, 150, 88], [BIOME.ROCK]: [124, 120, 114], [BIOME.VOLCANIC]: [66, 54, 56], [BIOME.LAVA]: [236, 96, 28],
  [BIOME.SNOW]: [242, 247, 251], [BIOME.SWAMP]: [82, 100, 58], [BIOME.FOREST]: [52, 112, 48], [BIOME.ICE]: [188, 222, 240]
};
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const mix = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

/** Amostra bilinear de `field` (Float32 `G×G`) na posição de pixel `(px, py)` de uma imagem `W×W`. */
function bilinear(field, G, u, v) {
  const x = Math.min(G - 1.001, Math.max(0, u * G - 0.5)), y = Math.min(G - 1.001, Math.max(0, v * G - 0.5));
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
  const a = field[j * G + i], b = field[j * G + i + 1], c = field[(j + 1) * G + i], d = field[(j + 1) * G + i + 1];
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

function put(data, W, x, y, rgb, a = 1) {
  if (x < 0 || y < 0 || x >= W || y >= W) return;
  const o = (y * W + x) * 4;
  data[o] = mix(data[o], rgb[0], a); data[o + 1] = mix(data[o + 1], rgb[1], a); data[o + 2] = mix(data[o + 2], rgb[2], a); data[o + 3] = 255;
}
function line(data, W, x0, y0, x1, y1, rgb, a = 1) {
  const n = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))) || 1;
  for (let k = 0; k <= n; k++) put(data, W, Math.round(x0 + ((x1 - x0) * k) / n), Math.round(y0 + ((y1 - y0) * k) / n), rgb, a);
}
function hash(i, j, s) { return valueNoise(i * 12.9898, j * 78.233, s) * 0.5 + valueNoise(i * 3.7 + 9, j * 5.1 - 4, s + 5) * 0.5; }

/**
 * Prévia colorida por bioma. `px` = lado da imagem (ex.: 768). `view` (opcional) = recorte em coordenadas normalizadas do mapa
 * `{ u0, v0, u1, v1 }` (ex.: ilha vulcânica ampliada); sem ele, o mapa inteiro. Lava: laranja/vermelho com brilho (halo na terra
 * ao redor), crosta escura em fluxo; passagens de rocha resfriada em cinza com marcadores (anel = base, losango = passagem).
 */
export function renderBiomePreview(map, px = 768, view = { u0: 0, v0: 0, u1: 1, v1: 1 }) {
  const { grid: G, sd, height, biome, size, cell } = map;
  const lv = map.lava;
  const data = new Uint8Array(px * px * 4);
  const seed = map.options.seed | 0;
  for (let y = 0; y < px; y++) {
    for (let x = 0; x < px; x++) {
      const u = view.u0 + ((x + 0.5) / px) * (view.u1 - view.u0), v = view.v0 + ((y + 0.5) / px) * (view.v1 - view.v0);
      const d = bilinear(sd, G, u, v);
      const gi = Math.min(G - 1, Math.floor(u * G)), gj = Math.min(G - 1, Math.floor(v * G));
      let r, g, b;
      if (d <= 0) { // mar: turquesa raso -> azul fundo
        const t = smooth(0, 11, -d);
        r = mix(70, 10, t); g = mix(176, 48, t); b = mix(200, 110, t);
        const caust = fbm(u * 60 + 3, v * 60, seed + 9, 3);
        const k = 1 + (caust - 0.5) * 0.14 * (1 - t * 0.6);
        r *= k; g *= k; b *= k;
        const foam = smooth(-1.1, 0, d) * 0.65 * (0.6 + 0.4 * caust);
        r = mix(r, 255, foam); g = mix(g, 255, foam); b = mix(b, 255, foam);
      } else {
        // cor do bioma: mistura bilinear das 4 células vizinhas, com a coordenada deformada por ruído (bordas orgânicas)
        const wu = u + (fbm(u * 40, v * 40, seed + 91, 2) - 0.5) * 0.012, wv = v + (fbm(u * 40 + 9, v * 40 - 3, seed + 92, 2) - 0.5) * 0.012;
        const fx = Math.min(G - 1.001, Math.max(0, wu * G - 0.5)), fy = Math.min(G - 1.001, Math.max(0, wv * G - 0.5));
        const bi = Math.floor(fx), bj = Math.floor(fy), tx = fx - bi, ty = fy - bj;
        const col = [0, 0, 0];
        for (const [di, dj, w] of [[0, 0, (1 - tx) * (1 - ty)], [1, 0, tx * (1 - ty)], [0, 1, (1 - tx) * ty], [1, 1, tx * ty]]) {
          const lb = biome[(bj + dj) * G + bi + di];
          const cc = BIOME_RGB[lb] ?? BIOME_RGB[biome[gj * G + gi]] ?? BIOME_RGB[BIOME.GRASS]; // vizinho de água: usa o bioma local
          col[0] += cc[0] * w; col[1] += cc[1] * w; col[2] += cc[2] * w;
        }
        // relevo sombreado (luz NO), gradiente da altura
        const e = 1 / G;
        const hx = bilinear(height, G, u + e, v) - bilinear(height, G, u - e, v);
        const hy = bilinear(height, G, u, v + e) - bilinear(height, G, u, v - e);
        const shade = clamp01(0.5 + (-hx - hy) * 1.15) * 0.55 + 0.72;
        const tex = 1 + (fbm(u * 150, v * 150, seed + 77, 3) - 0.5) * 0.16;
        r = col[0] * shade * tex; g = col[1] * shade * tex; b = col[2] * shade * tex;
        // sombra d'água rasa: areia molhada junto à costa
        const wet = smooth(0.7, 0, d) * 0.28;
        r = mix(r, 150, wet); g = mix(g, 130, wet); b = mix(b, 90, wet);
        if (lv) [r, g, b] = shadeLava(lv, G, u, v, seed, r, g, b, gj * G + gi);
      }
      const o = (y * px + x) * 4;
      data[o] = Math.min(255, r); data[o + 1] = Math.min(255, g); data[o + 2] = Math.min(255, b); data[o + 3] = 255;
    }
  }
  void size; void cell;
  if (lv) drawLavaMarkers(data, px, map, view);
  return { width: px, height: px, data };
}

/** Aplica lava (núcleo incandescente + crosta), halo de brilho na terra e rocha das passagens a um pixel de terra. */
function shadeLava(lv, G, u, v, seed, r, g, b, cellIdx) {
  const soft = bilinear(lv.soft, G, u, v), glow = bilinear(lv.glow, G, u, v);
  const flow = fbm(u * 95 + 4, v * 95 - 7, seed + 611, 3), crust = fbm(u * 210 - 3, v * 210 + 5, seed + 612, 2);
  if (soft > 0.02) {
    const a = smooth(0.18, 0.55, soft); // borda da lava (macia)
    const core = clamp01((soft - 0.35) * 1.8) * (0.55 + 0.9 * flow);
    let lr = mix(150, 255, core), lg = mix(28, 205, core * core), lb = mix(8, 70, core * core * core);
    const dark = smooth(0.55, 0.8, crust) * 0.55 * (1 - core * 0.5); // placas de crosta escura
    lr = mix(lr, 52, dark); lg = mix(lg, 22, dark); lb = mix(lb, 18, dark);
    r = mix(r, lr, a); g = mix(g, lg, a); b = mix(b, lb, a);
  }
  const halo = smooth(0.03, 0.4, glow) * (1 - smooth(0.2, 0.55, soft)) * 0.5; // luz da lava sobre o basalto vizinho
  r = mix(r, Math.min(255, r * 0.55 + 190), halo); g = mix(g, g * 0.5 + 70, halo); b = mix(b, b * 0.45 + 22, halo * 0.8);
  if (lv.passage[cellIdx]) { // rocha resfriada: cinza-quente, mais clara nas bordas
    const t = 0.82 + (flow - 0.5) * 0.4;
    r = mix(r, 128 * t, 0.85); g = mix(g, 112 * t, 0.85); b = mix(b, 104 * t, 0.85);
  }
  return [r, g, b];
}

/** Marcadores sobre a prévia: anel branco = base (um por área), losango claro = passagem de rocha. */
function drawLavaMarkers(data, px, map, view) {
  const lv = map.lava, G = map.grid;
  const toPx = (i, j) => [Math.round(((((i + 0.5) / G) - view.u0) / (view.u1 - view.u0)) * px), Math.round(((((j + 0.5) / G) - view.v0) / (view.v1 - view.v0)) * px)];
  const scale = px / ((view.u1 - view.u0) * 768); // 1 na prévia 768 do mapa inteiro
  const rr = Math.max(3, Math.round(6 * Math.sqrt(scale)));
  for (const b of lv.bases) {
    const [cx, cy] = toPx(b.i, b.j);
    for (let a = 0; a < 90; a++) { const t = (a / 90) * Math.PI * 2; put(data, px, Math.round(cx + Math.cos(t) * rr), Math.round(cy + Math.sin(t) * rr), [255, 255, 255], 0.95); put(data, px, Math.round(cx + Math.cos(t) * (rr - 1)), Math.round(cy + Math.sin(t) * (rr - 1)), [40, 60, 120], 0.8); }
    for (let k = -1; k <= 1; k++) { put(data, px, cx + k, cy, [255, 255, 255], 0.95); put(data, px, cx, cy + k, [255, 255, 255], 0.95); }
  }
  for (const st of lv.streams) for (const p of st.passages) {
    const [cx, cy] = toPx(p.i, p.j), q = rr;
    line(data, px, cx - q, cy, cx, cy - q, [240, 236, 200], 0.95); line(data, px, cx, cy - q, cx + q, cy, [240, 236, 200], 0.95);
    line(data, px, cx + q, cy, cx, cy + q, [240, 236, 200], 0.95); line(data, px, cx, cy + q, cx - q, cy, [240, 236, 200], 0.95);
  }
}

/** Recorte (normalizado) em torno da ilha vulcânica, com margem; `null` se o mapa não tem lava. */
export function lavaIslandView(map, margin = 0.1) {
  if (!map.lava) return null;
  const G = map.grid;
  let i0 = G, j0 = G, i1 = 0, j1 = 0;
  for (let c = 0; c < map.owner.length; c++) {
    if (map.owner[c] !== map.lava.entity || !map.land[c]) continue;
    const i = c % G, j = (c - i) / G;
    i0 = Math.min(i0, i); i1 = Math.max(i1, i); j0 = Math.min(j0, j); j1 = Math.max(j1, j);
  }
  const side = Math.max(i1 - i0, j1 - j0) / G + 2 * margin, cu = (i0 + i1 + 1) / 2 / G, cv = (j0 + j1 + 1) / 2 / G;
  const u0 = Math.min(1 - side, Math.max(0, cu - side / 2)), v0 = Math.min(1 - side, Math.max(0, cv - side / 2));
  return { u0, v0, u1: u0 + side, v1: v0 + side };
}

/** Prévia "mapa antigo": pergaminho, costa em tinta, linhas de eco, montanhas (chevrons) e rosa dos ventos. */
export function renderParchmentPreview(map, px = 768) {
  const { grid: G, sd, biome, size } = map;
  const data = new Uint8Array(px * px * 4);
  const seed = map.options.seed | 0;
  const ink = [66, 42, 24];
  const scale = size / px; // u por pixel
  for (let y = 0; y < px; y++) {
    for (let x = 0; x < px; x++) {
      const u = (x + 0.5) / px, v = (y + 0.5) / px;
      const d = bilinear(sd, G, u, v);
      // pergaminho: manchas + fibras + bordas queimadas
      const mott = fbm(u * 5, v * 5, seed + 301, 4) - 0.5;
      const fiber = fbm(u * 220, v * 24, seed + 302, 2) - 0.5;
      const edge = Math.max(Math.abs(u - 0.5), Math.abs(v - 0.5)) * 2;
      const burn = smooth(0.72, 1.0, edge + (fbm(u * 18, v * 18, seed + 303, 3) - 0.5) * 0.18);
      let r = 224 + mott * 46 + fiber * 12, g = 200 + mott * 44 + fiber * 11, b = 154 + mott * 40 + fiber * 9;
      if (d > 0) { r += 8; g += 8; b += 6; } // terra um pouco mais clara
      r = mix(r, 92, burn * 0.8); g = mix(g, 58, burn * 0.8); b = mix(b, 28, burn * 0.8);
      // linhas de eco no mar (a cada 3,2 u), esmaecendo; levemente onduladas
      if (d < 0) {
        const wob = (fbm(u * 30, v * 30, seed + 304, 2) - 0.5) * 1.6;
        const q = (-d + wob) / 3.2;
        const frac = Math.abs(q - Math.round(q));
        if (q > 0.5 && q < 3.6 && frac < 0.07) {
          const a = 0.5 * (1 - (q - 0.5) / 3.2);
          r = mix(r, ink[0], a * 0.7); g = mix(g, ink[1], a * 0.7); b = mix(b, ink[2], a * 0.7);
        }
      }
      // costa em tinta (linha de ~1,6 px)
      const ad = Math.abs(d) / scale;
      if (ad < 1.5) {
        const a = clamp01(1.3 - ad * 0.8) * (0.85 + (fbm(u * 90, v * 90, seed + 305, 2) - 0.5) * 0.3);
        r = mix(r, ink[0], a); g = mix(g, ink[1], a); b = mix(b, ink[2], a);
      }
      const o = (y * px + x) * 4;
      data[o] = Math.max(0, Math.min(255, r)); data[o + 1] = Math.max(0, Math.min(255, g)); data[o + 2] = Math.max(0, Math.min(255, b)); data[o + 3] = 255;
    }
  }
  // montanhas (chevrons), árvores (pontos) e vulcão (chevron + fumaça)
  const step = 3;
  for (let gj = 2; gj < G - 2; gj += step) {
    for (let gi = 2; gi < G - 2; gi += step) {
      const c = gj * G + gi;
      const bm = biome[c];
      const h1 = hash(gi, gj, seed + 401), h2 = hash(gj, gi, seed + 402);
      const cx = Math.round(((gi + 0.5 + (h1 - 0.5) * step) / G) * px), cy = Math.round(((gj + 0.5 + (h2 - 0.5) * step) / G) * px);
      if (sd[c] < 2.4) continue;
      if ((bm === BIOME.ROCK || bm === BIOME.SNOW || bm === BIOME.VOLCANIC) && h1 > 0.32 && h1 < 0.75) {
        const s = 5 + Math.round(h2 * 4);
        line(data, px, cx - s, cy + s * 0.6, cx, cy - s * 0.7, ink, 0.85);
        line(data, px, cx, cy - s * 0.7, cx + s, cy + s * 0.6, ink, 0.85);
        line(data, px, cx, cy - s * 0.7, cx + 1, cy + s * 0.6, ink, 0.45);
      } else if ((bm === BIOME.GRASS || bm === BIOME.SAVANNA || bm === BIOME.FOREST) && h1 > (bm === BIOME.FOREST ? 0.4 : 0.49) && h1 < (bm === BIOME.FOREST ? 0.6 : 0.53)) {
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (dx * dx + dy * dy <= 5) put(data, px, cx + dx, cy + dy, [96, 84, 40], 0.7);
      } else if ((bm === BIOME.DESERT || bm === BIOME.STEPPE) && h1 > 0.5 && h1 < 0.6) {
        line(data, px, cx - 4, cy, cx, cy - 2, ink, 0.45); line(data, px, cx, cy - 2, cx + 4, cy, ink, 0.45);
      } else if (bm === BIOME.SWAMP && h1 > 0.5 && h1 < 0.66) {
        line(data, px, cx - 3, cy, cx + 3, cy, [70, 80, 60], 0.7); line(data, px, cx, cy - 3, cx, cy, [70, 80, 60], 0.7);
      }
    }
  }
  // rosa dos ventos (canto inferior direito) + moldura dupla
  const cx = Math.round(px * 0.86), cy = Math.round(px * 0.86), R = Math.round(px * 0.065);
  for (let a = 0; a < 720; a++) {
    const t = (a / 720) * Math.PI * 2;
    put(data, px, Math.round(cx + Math.cos(t) * R), Math.round(cy + Math.sin(t) * R), ink, 0.8);
    put(data, px, Math.round(cx + Math.cos(t) * R * 0.72), Math.round(cy + Math.sin(t) * R * 0.72), ink, 0.45);
  }
  for (let k = 0; k < 8; k++) {
    const t = (k * Math.PI) / 4, L = k % 2 === 0 ? R * 1.5 : R * 1.0;
    const nx = Math.cos(t), ny = Math.sin(t);
    line(data, px, cx, cy, cx + nx * L, cy + ny * L, ink, 0.9);
    if (k % 2 === 0) { // pontas largas dos pontos cardeais
      const px2 = -ny * R * 0.22, py2 = nx * R * 0.22;
      line(data, px, cx + nx * L, cy + ny * L, cx + nx * R * 0.4 + px2, cy + ny * R * 0.4 + py2, ink, 0.9);
      line(data, px, cx + nx * L, cy + ny * L, cx + nx * R * 0.4 - px2, cy + ny * R * 0.4 - py2, ink, 0.9);
    }
  }
  const m1 = Math.round(px * 0.018), m2 = Math.round(px * 0.03);
  for (const m of [m1, m2]) {
    line(data, px, m, m, px - m, m, ink, 0.85); line(data, px, m, px - m, px - m, px - m, ink, 0.85);
    line(data, px, m, m, m, px - m, ink, 0.85); line(data, px, px - m, m, px - m, px - m, ink, 0.85);
  }
  return { width: px, height: px, data };
}

/** Máscara terra/água (`mask` `G×G`) em cinza/azul, para comparar com os mapas atuais. */
export function renderMaskPreview(mask, G, px = 512) {
  const data = new Uint8Array(px * px * 4);
  for (let y = 0; y < px; y++) for (let x = 0; x < px; x++) {
    const i = Math.min(G - 1, Math.floor((x / px) * G)), j = Math.min(G - 1, Math.floor((y / px) * G));
    const land = mask[j * G + i] === 1;
    const o = (y * px + x) * 4;
    data[o] = land ? 120 : 24; data[o + 1] = land ? 170 : 78; data[o + 2] = land ? 90 : 140; data[o + 3] = 255;
  }
  return { width: px, height: px, data };
}
