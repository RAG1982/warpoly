import { describe, it, expect } from 'vitest';
import * as coast from '../../src/data/maps/coast/index.js';
import { mulberry32 } from '../../src/sim/rng.js';
import { buildPathfinder } from '../../src/data/maps/generator.js';

const {
  generateCoast, generateRivers, walkableMask, riverStats, labelComponents, distanceTransform, rotateIndex, bakeTerrain, bakedHeightFn,
  bakeToMapDef, verifyCoastMap, FORD_HEIGHT, LAND_HEIGHT, RIVER_BED_EDGE, RIVER_BED_CENTER, COAST_PRESETS, DEFAULT_OPTIONS
} = coast;

/**
 * Rios (docs/specs/MUNDO-TERRENO-MAPAS.md §2.2 "Rios"): nascem no interior de um continente, descem até o oceano com meandros,
 * canal de 3,4–5 u (leito de −0,6 a −1,4), vau (platô 2,35) a cada ~25 u, delta alargado nos últimos 8 u, nascente afilada, e o rio
 * não pode partir a terra caminhável (vaus contam como terra).
 */
const hashBytes = (typed) => { const b = Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength); let h = 2166136261; for (let i = 0; i < b.length; i++) h = Math.imul(h ^ b[i], 16777619); return h >>> 0; };
const cache = new Map();
const gen = (opts) => { const k = JSON.stringify(opts); if (!cache.has(k)) cache.set(k, generateCoast(opts)); return cache.get(k); };
const SEEDS = [1, 2, 3, 4, 5, 6];
const cellOf = (m, x, z) => Math.floor((z + m.size / 2) / m.cell) * m.grid + Math.floor((x + m.size / 2) / m.cell);
const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];

describe('rios: configuração e valores padrão', () => {
  it('rios vêm desligados por padrão (o mapa do protótipo não muda) e rivers: 0 gera o mesmo mapa', () => {
    expect(DEFAULT_OPTIONS.rivers).toBe(0);
    const a = gen({ seed: 1 }), b = gen({ seed: 1, rivers: 0 });
    expect(a.rivers).toBeNull();
    expect(b.rivers).toBeNull();
    expect(hashBytes(a.height)).toBe(hashBytes(b.height));
    expect(riverStats(a)).toBeNull();
  });

  it('generateRivers devolve null sem rios pedidos e com continente pequeno demais', () => {
    const G = 48, N = G * G;
    const land = new Uint8Array(N), owner = new Int16Array(N).fill(-1);
    for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) if (Math.hypot(i - 24, j - 24) < 6) { land[j * G + i] = 1; owner[j * G + i] = 0; }
    const entities = [{ index: 0, kind: 'continent', biome: 'arid', cx: 0, cz: 0, rx: 6, rz: 6 }];
    const base = { grid: G, land, owner, entities, size: 48, cell: 1, lava: null };
    expect(generateRivers({ ...base, options: { ...DEFAULT_OPTIONS, seed: 1, rivers: 0 } }, mulberry32(1))).toBeNull();
    expect(generateRivers({ ...base, options: { ...DEFAULT_OPTIONS, seed: 1, rivers: 1 } }, mulberry32(1))).toBeNull(); // nenhum ponto a 8 u da costa
  });

  it('generateRivers num continente sintético (disco de 40 células): 1 rio, nasce no interior, chega à costa, tem vau e não parte a terra', () => {
    const G = 96, N = G * G;
    const land = new Uint8Array(N), owner = new Int16Array(N).fill(-1);
    for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) if (Math.hypot(i - 47.5, j - 47.5) < 40) { land[j * G + i] = 1; owner[j * G + i] = 0; }
    const entities = [{ index: 0, kind: 'continent', biome: 'arid', cx: 0, cz: 0, rx: 40, rz: 40 }];
    const map = { grid: G, land, owner, entities, size: 96, cell: 1, lava: null, options: { ...DEFAULT_OPTIONS, seed: 3, rivers: 1 } };
    const rv = generateRivers(map, mulberry32(7));
    expect(rv).not.toBeNull();
    expect(rv.count).toBe(1);
    const s = rv.streams[0];
    expect(s.length).toBeGreaterThanOrEqual(20);
    expect(s.length).toBeLessThanOrEqual(110);
    expect(s.fords).toBeGreaterThanOrEqual(1);
    // a nascente fica a >= 8 u de qualquer água e a foz encosta no oceano
    const water = new Uint8Array(N).map((_, c) => (land[c] ? 0 : 1));
    const dW = distanceTransform(water, G);
    expect(dW[s.source.j * G + s.source.i] * map.cell).toBeGreaterThanOrEqual(8);
    const mouthC = s.mouth.j * G + s.mouth.i;
    expect([mouthC - 1, mouthC + 1, mouthC - G, mouthC + G].some((n) => !land[n])).toBe(true);
    // a água do rio só ocupa terra do continente e a terra caminhável continua UMA massa (vaus incluídos)
    for (let c = 0; c < N; c++) if (rv.mask[c]) expect(land[c]).toBe(1);
    const walk = walkableMask({ land, lava: null, rivers: rv });
    expect(labelComponents(walk, G, 1).sizes).toHaveLength(1);
    for (let c = 0; c < N; c++) { expect(rv.mask[c] && rv.ford[c]).toBeFalsy(); if (rv.mask[c]) expect(walk[c]).toBe(0); if (rv.ford[c]) expect(walk[c]).toBe(1); }
    // determinismo da função isolada
    const again = generateRivers(map, mulberry32(7));
    expect(hashBytes(again.mask)).toBe(hashBytes(rv.mask));
    expect(hashBytes(generateRivers(map, mulberry32(8)).mask)).not.toBe(hashBytes(rv.mask));
  });
});

describe('rios: geometria do canal, vaus, foz e delta (1 rio por continente)', () => {
  for (const seed of SEEDS) {
    it(`seed ${seed}: 2 rios (um por continente), largura 3,4–5 u, leito −1,4…−0,6, vaus platô 2,35, foz no oceano, margens caminháveis`, () => {
      const m = gen({ seed, rivers: 1 });
      const rv = m.rivers, G = m.grid, N = G * G;
      expect(rv).not.toBeNull();
      expect(rv.count).toBe(2);
      expect(new Set(rv.streams.map((s) => s.entity)).size).toBe(2);
      for (const s of rv.streams) expect(m.entities[s.entity].kind).toBe('continent');
      for (const s of rv.streams) {
        expect(s.length).toBeGreaterThanOrEqual(20);
        expect(s.width).toBeGreaterThanOrEqual(3.4);
        expect(s.width).toBeLessThanOrEqual(5);
        if (s.length > 28) expect(s.fords).toBeGreaterThanOrEqual(1);
      }
      expect(rv.fords).toHaveLength(rv.streams.reduce((n, s) => n + s.fords, 0));
      const lakeless = new Uint8Array(N).map((_, c) => (m.land[c] ? 0 : 1));
      const wl = labelComponents(lakeless, G, 1);
      const ocean = wl.labels[0];
      const touchesOcean = (c) => { const i = c % G; return (i > 0 && wl.labels[c - 1] === ocean) || (i < G - 1 && wl.labels[c + 1] === ocean) || (c >= G && wl.labels[c - G] === ocean) || (c < N - G && wl.labels[c + G] === ocean); };
      const rl = labelComponents(rv.mask, G, 1);
      const reaching = new Set();
      for (let c = 0; c < N; c++) {
        if (rv.mask[c]) {
          expect(m.land[c], 'água de rio só em terra do continente').toBe(1);
          expect(m.entities[m.owner[c]].kind).toBe('continent');
          expect(m.height[c]).toBeLessThan(LAND_HEIGHT);
          expect(m.height[c]).toBeGreaterThanOrEqual(RIVER_BED_CENTER - 1e-4);
          expect(m.height[c]).toBeLessThanOrEqual(RIVER_BED_EDGE + 1e-4);
          if (touchesOcean(c)) reaching.add(rl.labels[c]);
          for (const n of [c - 1, c + 1, c - G, c + G]) if (m.land[n] && !rv.mask[n] && !rv.ford[n] && !(m.lava && m.lava.mask[n])) expect(m.height[n], 'margem do rio caminhável').toBeGreaterThanOrEqual(0.7);
        }
        if (rv.ford[c]) {
          expect(m.land[c]).toBe(1);
          expect(rv.mask[c]).toBe(0);
          expect(m.height[c]).toBeGreaterThanOrEqual(FORD_HEIGHT - 0.06);
        }
      }
      expect(reaching.size, 'cada rio tem um trecho de água ligado ao oceano (a foz)').toBeGreaterThanOrEqual(2);
      // cada vau cobre a largura do leito e fica em terra seca; vaus do mesmo rio distam >= 12 u ao longo do curso
      for (const f of rv.fords) {
        expect(f.r).toBeGreaterThanOrEqual(4.2);
        expect(rv.ford[cellOf(m, f.x, f.z)]).toBe(1);
        expect(m.height[cellOf(m, f.x, f.z)]).toBeGreaterThanOrEqual(FORD_HEIGHT - 0.06);
      }
      for (const s of rv.streams) {
        const along = rv.fords.filter((f) => f.stream === rv.streams.indexOf(s)).map((f) => f.s).sort((a, b) => a - b);
        for (let k = 1; k < along.length; k++) expect(along[k] - along[k - 1]).toBeGreaterThanOrEqual(12);
      }
    });

    it(`seed ${seed}: nascente afilada, delta alargado nos últimos ~8 u, nascente a >= 8 u da água; a terra caminhável continua UMA massa por entidade`, () => {
      const m = gen({ seed, rivers: 1 });
      const rv = m.rivers, G = m.grid;
      const water = new Uint8Array(G * G).map((_, c) => (m.land[c] ? 0 : 1));
      const dW = distanceTransform(water, G);
      for (const s of rv.streams) {
        const rads = s.path.map((p) => p.rad);
        const mid = median(s.path.filter((p) => p.s > 0.3 * s.length && p.s < 0.6 * s.length).map((p) => p.rad));
        expect(s.path[0].rad).toBeLessThanOrEqual(0.75 * mid); // nascente afilada
        const tail = Math.max(...s.path.filter((p) => p.s > s.length - 8).map((p) => p.rad));
        expect(tail).toBeGreaterThanOrEqual(1.35 * mid); // delta
        expect(Math.max(...rads)).toBeLessThanOrEqual(2.2 * (s.width / 2 / m.cell) * 1.2);
        expect(dW[s.source.j * G + s.source.i] * m.cell).toBeGreaterThanOrEqual(8);
      }
      const walk = walkableMask(m);
      const wc = labelComponents(walk, G, 1);
      const perEntity = new Map();
      for (let c = 0; c < G * G; c++) if (walk[c] && m.owner[c] >= 0) { const st = perEntity.get(m.owner[c]) ?? new Set(); st.add(wc.labels[c]); perEntity.set(m.owner[c], st); }
      for (const [idx, st] of perEntity) if (m.entities[idx].kind === 'continent') expect(st.size, m.entities[idx].id).toBe(1);
      expect(m.stats.landComponents).toBe(m.entities.length); // o rio não quebra a máscara de terra
      expect(verifyCoastMap(m, { minRivers: 1 }).failures).toEqual([]);
    });
  }

  it('deterministico: mesma semente ⇒ mesmos rios e vaus; sementes diferentes ⇒ rios diferentes', () => {
    const a = generateCoast({ seed: 11, rivers: 1 }), b = generateCoast({ seed: 11, rivers: 1 });
    expect(hashBytes(a.rivers.mask)).toBe(hashBytes(b.rivers.mask));
    expect(hashBytes(a.rivers.ford)).toBe(hashBytes(b.rivers.ford));
    expect(a.rivers.fords.map((f) => `${f.x},${f.z}`)).toEqual(b.rivers.fords.map((f) => `${f.x},${f.z}`));
    expect(hashBytes(gen({ seed: 12, rivers: 1 }).rivers.mask)).not.toBe(hashBytes(a.rivers.mask));
  });

  it('rivers: 2 dá até 2 rios por continente; riverWidth e riverFordSpacing são respeitados; rios só em continentes', () => {
    const m = gen({ seed: 3, rivers: 2, riverWidth: [3.6, 3.6], riverFordSpacing: 18 });
    expect(m.rivers.count).toBeGreaterThanOrEqual(2);
    expect(m.rivers.count).toBeLessThanOrEqual(4);
    for (const s of m.rivers.streams) expect(s.width).toBe(3.6);
    const few = gen({ seed: 3, rivers: 1, riverFordSpacing: 60 });
    const many = gen({ seed: 3, rivers: 1, riverFordSpacing: 15 });
    expect(many.rivers.fords.length).toBeGreaterThanOrEqual(few.rivers.fords.length);
    const arq = gen({ ...COAST_PRESETS['arquipelago-vivo'].options, seed: 3, rivers: 1 });
    expect(arq.rivers).toBeNull(); // só continentes recebem rios
  });

  it('simetria "rotate": cada rio tem um gêmeo girado 180° e os vaus também (coordenadas opostas)', () => {
    const m = gen({ ...COAST_PRESETS['duelo-continental'].options, seed: 2 });
    const G = m.grid;
    for (let c = 0; c < G * G; c++) { const r = rotateIndex(c, G); expect(m.rivers.mask[c]).toBe(m.rivers.mask[r]); expect(m.rivers.ford[c]).toBe(m.rivers.ford[r]); }
    for (const f of m.rivers.fords) expect(m.rivers.fords.some((g) => Math.abs(g.x + f.x) < 1e-6 && Math.abs(g.z + f.z) < 1e-6), `vau (${f.x},${f.z}) sem gêmeo`).toBe(true);
    expect(m.rivers.streams.filter((s) => s.twin)).toHaveLength(m.rivers.streams.length / 2);
  });
});

describe('rios no terreno assado: a água bloqueia, o vau atravessa (grade do Pathfinder real)', () => {
  /**
   * Travessia local: BFS 4-vizinhos na grade estática do Pathfinder (células de 1,5 u) só dentro de uma FAIXA retangular perpendicular
   * ao rio (± `halfAxis` ao longo do curso, ± `halfNormal` através dele). `null` se A ou B não são caminháveis (teste inconclusivo).
   */
  function stripReach(pf, c, t, n, halfAxis, halfNormal, A, B) {
    const inStrip = (x, z) => Math.abs((x - c.x) * t.x + (z - c.z) * t.z) <= halfAxis && Math.abs((x - c.x) * n.x + (z - c.z) * n.z) <= halfNormal;
    const cellXZ = (col, row) => [pf.minCoord + (col + 0.5) * pf.cellSize, pf.minCoord + (row + 0.5) * pf.cellSize];
    const ok = (col, row) => { const [x, z] = cellXZ(col, row); return pf.staticGrid[row * pf.cols + col] === 1 && inStrip(x, z); };
    const a = pf.toGrid(A.x, A.z), b = pf.toGrid(B.x, B.z);
    if (!ok(a.c, a.r) || !ok(b.c, b.r)) return null;
    const seen = new Set([a.r * pf.cols + a.c]), q = [[a.c, a.r]];
    for (let h = 0; h < q.length; h++) {
      const [col, row] = q[h];
      if (col === b.c && row === b.r) return true;
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nc = col + dc, nr = row + dr;
        if (nc < 0 || nr < 0 || nc >= pf.cols || nr >= pf.rows || !ok(nc, nr) || seen.has(nr * pf.cols + nc)) continue;
        seen.add(nr * pf.cols + nc); q.push([nc, nr]);
      }
    }
    return false;
  }

  it('a altura assada é < 0,65 no meio do rio, >= 2,0 nos vaus e >= 1,0 nas margens; o Pathfinder terrestre não atravessa a água (faixa de 5 u) e atravessa o vau', () => {
    const m = gen({ seed: 2, rivers: 1 });
    const baked = bakeTerrain(m, { cell: 1 });
    const h = bakedHeightFn(baked);
    const mapDef = bakeToMapDef(m, { id: 'rio-teste', playable: m.size - 12, baked });
    const pf = buildPathfinder(mapDef, 'land');
    let verifiedFord = 0, verifiedBlock = 0;
    m.rivers.streams.forEach((s, si) => {
      const pts = s.path;
      const world = (p) => ({ x: (p.i + 0.5) * m.cell - m.size / 2, z: (p.j + 0.5) * m.cell - m.size / 2 });
      const frame = (p) => {
        const k = pts.indexOf(p), a = pts[Math.max(0, k - 3)], b = pts[Math.min(pts.length - 1, k + 3)];
        const tx = b.i - a.i, tz = b.j - a.j, l = Math.hypot(tx, tz) || 1;
        return { t: { x: tx / l, z: tz / l }, n: { x: -tz / l, z: tx / l } };
      };
      const myFords = m.rivers.fords.filter((f) => f.stream === si);
      const nearest = (sv) => pts.reduce((best, p) => (Math.abs(p.s - sv) < Math.abs(best.s - sv) ? p : best), pts[0]);
      // (a) vau: o centro é seco (>= 2,0) e uma faixa em volta dele liga as duas margens
      for (const f of myFords) {
        expect(h(f.x, f.z)).toBeGreaterThanOrEqual(2.0);
        const p = nearest(f.s), c = world(p), { t, n } = frame(p), d = p.rad * m.cell + 3;
        const r = stripReach(pf, c, t, n, 2.5, d + 1, { x: c.x + n.x * d, z: c.z + n.z * d }, { x: c.x - n.x * d, z: c.z - n.z * d });
        if (r !== null) { expect(r, `vau (${f.x}, ${f.z}) tem que ligar as margens`).toBe(true); verifiedFord++; }
      }
      // (b) fora dos vaus: o leito é água e as margens são terra, mas a faixa NÃO liga as margens (o rio bloqueia)
      for (const frac of [0.12, 0.25, 0.35, 0.5, 0.65, 0.78, 0.9]) {
        const p = nearest(frac * s.length), c = world(p);
        if (myFords.some((f) => Math.hypot(f.x - c.x, f.z - c.z) < f.r + 3)) continue;
        expect(h(c.x, c.z), 'meio do rio').toBeLessThan(LAND_HEIGHT);
        const { t, n } = frame(p), d = p.rad * m.cell + 3;
        const A = { x: c.x + n.x * d, z: c.z + n.z * d }, B = { x: c.x - n.x * d, z: c.z - n.z * d };
        if (h(A.x, A.z) < 0.8 || h(B.x, B.z) < 0.8) continue; // junto da foz uma das margens já é o mar
        const r = stripReach(pf, c, t, n, 2.5, d + 1, A, B);
        if (r !== null) { expect(r, 'o rio bloqueia a travessia local').toBe(false); verifiedBlock++; }
      }
    });
    expect(verifiedFord).toBeGreaterThanOrEqual(1);
    expect(verifiedBlock).toBeGreaterThanOrEqual(4);
  });
});
