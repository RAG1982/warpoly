/**
 * vfxEmitters.js (F7-05) — receitas dos efeitos: transformam um descritor (`vfxMapping.js`) em partículas
 * escritas nos pools da `VfxLayer`. Só apresentação; RNG de render (`createRenderRng`), nunca o da sim.
 * Atrasos (t0 no futuro) permitem colunas de fumaça/brasas sem nenhum trabalho de CPU por frame.
 */
import * as THREE from 'three';
import { scaleCount } from './vfxConfig.js';

const _c = new THREE.Color();
const palette = {};
/** Cor (linear) memoizada por hex => [r,g,b]; sem alocar por spawn depois do primeiro uso. */
export function rgb(hex) {
  let v = palette[hex];
  if (!v) {
    _c.set(hex);
    v = palette[hex] = [_c.r, _c.g, _c.b];
  }
  return v;
}

const COL = {
  blood: rgb('#8a0f14'), bloodDark: rgb('#4d0a0e'),
  bone: rgb('#d8d2bd'),
  wood: rgb('#8a6a42'), woodDark: rgb('#5a4129'), stone: rgb('#8e9296'), stoneDark: rgb('#5d6165'),
  smokeGrey: rgb('#8c8780'), smokeDark: rgb('#3d3a38'), dust: rgb('#b09c80'),
  ember: rgb('#ff8a2a'), fire: rgb('#ffc24a'), spark: rgb('#ffe79a'), white: rgb('#fff6d8')
};

export function playFx(L, rng, d) {
  switch (d.fx) {
    case 'blood': return blood(L, rng, d);
    case 'hit_spark': return hitSpark(L, rng, d);
    case 'unit_death': return unitDeath(L, rng, d);
    case 'building_collapse': return collapse(L, rng, d);
    case 'construction': return construction(L, rng, d);
    case 'explosion': return explosion(L, rng, d);
    case 'magic': return magic(L, rng, d);
    default: return undefined;
  }
}

function put(layer, L, t, life, size, g, p, ox, oy, oz, vx, vy, vz, col) {
  layer.ring.spawn(L.time + t, life, size, g, p.x + ox, p.y + oy, p.z + oz, vx, vy, vz, col[0], col[1], col[2], p.y);
}

function blood(L, rng, d) {
  const n = scaleCount(2 + Math.min(4, d.amount / 12), L.density);
  for (let i = 0; i < n; i++) {
    const a = rng() * 6.283, s = rng.range(0.8, 2.6);
    put(L.solid, L, 0, rng.range(0.45, 0.9), rng.range(0.05, 0.11), 9.8, d.pos,
      0, rng.range(0.5, 1.1), 0, Math.cos(a) * s, rng.range(1.4, 3.2), Math.sin(a) * s, rng() < 0.6 ? COL.blood : COL.bloodDark);
  }
}

function hitSpark(L, rng, d) {
  const n = scaleCount(3 + Math.min(3, d.amount / 20), L.density);
  for (let i = 0; i < n; i++) {
    const a = rng() * 6.283, s = rng.range(1.5, 4);
    put(L.glow, L, 0, rng.range(0.18, 0.4), rng.range(0.06, 0.11), 8, d.pos,
      0, rng.range(0.6, 1.2), 0, Math.cos(a) * s, rng.range(1.5, 3.5), Math.sin(a) * s, COL.spark);
  }
  const m = scaleCount(d.wood ? 2 : 1, L.density);
  for (let i = 0; i < m; i++) {
    put(L.solid, L, 0, rng.range(0.5, 0.9), rng.range(0.08, 0.14), 9.8, d.pos,
      rng.signed(0.3), rng.range(0.6, 1.2), rng.signed(0.3), rng.signed(2), rng.range(1.5, 3), rng.signed(2),
      d.bone ? COL.bone : (d.wood ? COL.wood : COL.stone));
  }
}

function unitDeath(L, rng, d) {
  if (d.siege) {
    const n = scaleCount(8, L.density);
    for (let i = 0; i < n; i++) {
      const a = rng() * 6.283, s = rng.range(1, 3.2);
      put(L.solid, L, 0, rng.range(1.2, 2.2), rng.range(0.12, 0.28), 9.8, d.pos,
        0, rng.range(0.4, 1), 0, Math.cos(a) * s, rng.range(2, 5), Math.sin(a) * s, rng() < 0.5 ? COL.wood : COL.woodDark);
    }
    puff(L, rng, d.pos, 0.9, 3, 1.6);
    return;
  }
  const n = scaleCount(d.undead ? 8 : 10, L.density);
  for (let i = 0; i < n; i++) {
    const a = rng() * 6.283, s = rng.range(0.6, 2.4);
    put(L.solid, L, rng.range(0, 0.15), rng.range(1.0, 2.4), rng.range(0.06, 0.15), 9.8, d.pos,
      0, rng.range(0.5, 1.3), 0, Math.cos(a) * s, rng.range(1.5, 4), Math.sin(a) * s,
      d.undead ? COL.bone : (rng() < 0.65 ? COL.blood : COL.bloodDark));
  }
  puff(L, rng, d.pos, 0.55, 2, 0.8);
}

/** Pufes de fumaça/poeira em volta de `p`. */
function puff(L, rng, p, size, count, spread, col = COL.dust, life = 1.2) {
  const n = scaleCount(count, L.density);
  for (let i = 0; i < n; i++) {
    const a = rng() * 6.283, r = rng() * spread;
    put(L.smoke, L, rng.range(0, 0.2), life * rng.range(0.7, 1.2), size * rng.range(0.7, 1.3), -0.25, p,
      Math.cos(a) * r, 0.2, Math.sin(a) * r, Math.cos(a) * 0.5, rng.range(0.3, 0.9), Math.sin(a) * 0.5, col);
  }
}

function collapse(L, rng, d) {
  const r = d.radius;
  const nd = scaleCount(Math.round(14 + r * 7), L.density);
  for (let i = 0; i < nd; i++) {
    const a = rng() * 6.283, s = rng.range(1.5, 4.8) * (0.6 + r * 0.12);
    const wood = rng() < 0.55;
    put(L.solid, L, rng.range(0, 0.12), rng.range(7, 11), rng.range(0.22, 0.55), 11, d.pos,
      Math.cos(a) * r * 0.4, rng.range(0.5, 2), Math.sin(a) * r * 0.4, Math.cos(a) * s, rng.range(3, 7.5), Math.sin(a) * s,
      wood ? (rng() < 0.5 ? COL.wood : COL.woodDark) : (rng() < 0.5 ? COL.stone : COL.stoneDark));
  }
  // nuvem de poeira inicial + coluna de fumaça escura que dura alguns segundos (tudo agendado por atraso)
  puff(L, rng, d.pos, 1.4 + r * 0.25, 12, r * 0.7, COL.dust, 2.2);
  const ns = scaleCount(Math.round(10 + r * 3), L.density);
  for (let i = 0; i < ns; i++) {
    const a = rng() * 6.283, rr = rng() * r * 0.5;
    put(L.smoke, L, 0.3 + (i / ns) * 3.6, rng.range(2.6, 4.4), (1.1 + r * 0.22) * rng.range(0.8, 1.2), -0.55, d.pos,
      Math.cos(a) * rr, 0.6, Math.sin(a) * rr, rng.signed(0.35), rng.range(0.6, 1.2), rng.signed(0.35),
      rng() < 0.6 ? COL.smokeDark : COL.smokeGrey);
  }
  const ne = scaleCount(Math.round(8 + r * 2), L.density);
  for (let i = 0; i < ne; i++) {
    const a = rng() * 6.283, rr = rng() * r * 0.5;
    put(L.glow, L, rng.range(0, 1.8), rng.range(1.2, 2.6), rng.range(0.08, 0.17), -0.3, d.pos,
      Math.cos(a) * rr, 0.4, Math.sin(a) * rr, rng.signed(0.5), rng.range(0.8, 2), rng.signed(0.5), rng() < 0.5 ? COL.ember : COL.fire);
  }
  put(L.glow, L, 0, 0.35, r * 1.2, 0, d.pos, 0, 0.8, 0, 0, 0, 0, COL.fire);
}

/** Pegadas de obra por estágio: estacas na colocação; tábuas/pedras e poeira a cada estágio; brilho ao concluir. */
function construction(L, rng, d) {
  const r = d.radius;
  if (d.placed) {
    puff(L, rng, d.pos, 0.9, 8, r * 0.9, COL.dust, 1.4);
    if (L.caps.constructionMarks) {
      for (let i = 0; i < 4; i++) { // estacas nos cantos
        const sx = i & 1 ? 1 : -1, sz = i & 2 ? 1 : -1;
        put(L.solid, L, 0, 60, 0.28, 0, d.pos, sx * r * 0.85, 0.14, sz * r * 0.85, 0, 0, 0, COL.woodDark);
      }
    }
    return;
  }
  if (d.done) {
    puff(L, rng, d.pos, 1.1, 10, r * 0.9, COL.dust, 1.6);
    const n = scaleCount(14, L.density);
    for (let i = 0; i < n; i++) {
      const a = rng() * 6.283, rr = rng() * r * 0.9;
      put(L.glow, L, rng.range(0, 0.3), rng.range(0.8, 1.5), rng.range(0.1, 0.18), -0.8, d.pos,
        Math.cos(a) * rr, 0.3, Math.sin(a) * rr, 0, rng.range(0.8, 1.8), 0, COL.white);
    }
    return;
  }
  const st = d.stage; // 1..3: mais material espalhado e mais poeira
  puff(L, rng, d.pos, 0.8 + st * 0.15, 4 + st * 2, r * 0.9, COL.dust, 1.2);
  if (L.caps.constructionMarks) {
    const n = scaleCount(3 + st * 2, 1);
    for (let i = 0; i < n; i++) {
      const a = rng() * 6.283, rr = r * rng.range(0.7, 1.1);
      put(L.solid, L, rng() * 0.2, 45, rng.range(0.18, 0.34), 9.8, d.pos,
        Math.cos(a) * rr, 1 + rng() * 0.5, Math.sin(a) * rr, 0, 0, 0, st >= 2 && rng() < 0.5 ? COL.stone : COL.wood);
    }
  }
}

function explosion(L, rng, d) {
  const r = d.radius;
  const nd = scaleCount(14, L.density);
  for (let i = 0; i < nd; i++) {
    const a = rng() * 6.283, s = rng.range(2, 6) * (0.5 + r * 0.2);
    put(L.glow, L, 0, rng.range(0.5, 1.2), rng.range(0.1, 0.22), 6, d.pos,
      0, 0.5, 0, Math.cos(a) * s, rng.range(2.5, 6), Math.sin(a) * s, rng() < 0.5 ? COL.ember : COL.fire);
  }
  const ns = scaleCount(6, L.density);
  for (let i = 0; i < ns; i++) {
    const a = rng() * 6.283, rr = rng() * r * 0.5;
    put(L.smoke, L, 0.1 + rng() * 0.4, rng.range(1.6, 2.6), (0.9 + r * 0.25) * rng.range(0.8, 1.2), -0.5, d.pos,
      Math.cos(a) * rr, 0.4, Math.sin(a) * rr, rng.signed(0.5), rng.range(0.6, 1.4), rng.signed(0.5), COL.smokeDark);
  }
  const nc = scaleCount(8, L.density);
  for (let i = 0; i < nc; i++) {
    const a = rng() * 6.283, s = rng.range(2, 5);
    put(L.solid, L, 0, rng.range(2, 4), rng.range(0.12, 0.26), 11, d.pos,
      0, 0.4, 0, Math.cos(a) * s, rng.range(3, 6), Math.sin(a) * s, rng() < 0.5 ? COL.stoneDark : COL.woodDark);
  }
  put(L.glow, L, 0, 0.3, r * 1.1, 0, d.pos, 0, 0.8, 0, 0, 0, 0, COL.white);
}

function magic(L, rng, d) {
  const col = rgb(d.color);
  const R = Math.max(0.6, d.radius);
  switch (d.kind) {
    case 'ring': {
      const n = scaleCount(30, L.density);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * 6.283 + rng() * 0.1, sp = R / 0.7;
        put(L.glow, L, 0, 0.7, rng.range(0.12, 0.2), -0.5, d.pos,
          0, 0.15, 0, Math.cos(a) * sp, rng.range(0.4, 1.0), Math.sin(a) * sp, col);
      }
      break;
    }
    case 'aura': {
      const n = scaleCount(22, L.density);
      for (let i = 0; i < n; i++) {
        const a = rng() * 6.283, rr = Math.sqrt(rng()) * 1.2;
        put(L.glow, L, rng() * Math.max(0.4, d.duration), rng.range(0.7, 1.3), rng.range(0.09, 0.16), -0.8, d.pos,
          Math.cos(a) * rr, 0.1, Math.sin(a) * rr, 0, rng.range(0.9, 1.8), 0, col);
      }
      break;
    }
    case 'beam': {
      const n = scaleCount(14, L.density);
      for (let i = 0; i < n; i++) {
        const a = rng() * 6.283, s = rng.range(0.8, 2.4);
        put(L.glow, L, 0, rng.range(0.35, 0.7), rng.range(0.1, 0.18), 3, d.pos,
          0, 1, 0, Math.cos(a) * s, rng.range(1, 3), Math.sin(a) * s, col);
      }
      break;
    }
    default: { // burst
      const n = scaleCount(26, L.density);
      for (let i = 0; i < n; i++) {
        const a = rng() * 6.283, s = rng.range(1, 3.6), up = rng.range(1.5, 4.2);
        put(L.glow, L, 0, rng.range(0.5, 1.0), rng.range(0.1, 0.2), 4, d.pos,
          0, 0.8, 0, Math.cos(a) * s, up, Math.sin(a) * s, col);
      }
      put(L.glow, L, 0, 0.3, Math.min(2.4, 0.8 + R * 0.3), 0, d.pos, 0, 1, 0, 0, 0, 0, col);
    }
  }
}
