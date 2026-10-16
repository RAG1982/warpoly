import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as coast from '../../src/data/maps/coast/index.js';
import * as shim from '../../tools/lib/irregularCoast.mjs';
import { mulberry32 } from '../../src/sim/rng.js';

const {
  generateIrregularCoast, generateCoast, generateLava, resolveLagoons, listLakes, analyzeMap, verifyCoastMap,
  labelComponents, distanceTransform, rotateIndex, COAST_PRESETS
} = coast;

/**
 * MUNDO-1 (docs/specs/MUNDO-TERRENO-MAPAS.md §7 passo 1): o gerador de costas vira módulo de dados puro em `src/data/maps/coast/`.
 * Cobre: pureza (sem three/DOM/Math.random), shim de `tools/lib/irregularCoast.mjs`, determinismo, conectividade (cada massa de
 * terra conectada), lagoas, rota naval, simetria exata e tempo por mapa. Rios: `coastRivers.test.js`; presets, bases, madeira e
 * rota naval do mapa assado: `coastWorld.test.js`.
 */
const hashBytes = (typed) => { const b = Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength); let h = 2166136261; for (let i = 0; i < b.length; i++) h = Math.imul(h ^ b[i], 16777619); return h >>> 0; };
const cache = new Map(); // mapas gerados uma vez só (os testes que comparam duas execuções chamam o gerador direto)
const gen = (opts) => { const k = JSON.stringify(opts); if (!cache.has(k)) cache.set(k, generateCoast(opts)); return cache.get(k); };
const same = (a, b) => hashBytes(a.land) === hashBytes(b.land) && hashBytes(a.height) === hashBytes(b.height) && hashBytes(a.biome) === hashBytes(b.biome) && hashBytes(a.sd) === hashBytes(b.sd) && hashBytes(a.owner) === hashBytes(b.owner);

describe('coast: módulo puro (sem three.js, sem DOM, sem Math.random)', () => {
  const DIR = 'src/data/maps/coast';
  const files = readdirSync(DIR).filter((f) => f.endsWith('.js'));
  // código sem comentários (// e /* */ em uma linha, e linhas de bloco ` * ...`)
  const code = (f) => readFileSync(join(DIR, f), 'utf8').split('\n').map((l) => l.replace(/\/\/.*$/, '').replace(/^\s*\*.*$/, '').replace(/^\s*\/\*\*.*$/, '').replace(/\/\*.*?\*\//g, '')).join('\n');

  it('o módulo tem os arquivos esperados e o index reexporta a API pública', () => {
    for (const f of ['index.js', 'generate.js', 'rivers.js', 'lagoons.js', 'lavaStreams.js', 'analyze.js', 'presets.js', 'layout.js', 'verify.js', 'world.js', 'bake.js']) expect(files).toContain(f);
    for (const name of ['generateIrregularCoast', 'generateCoast', 'generateLava', 'generateRivers', 'resolveLagoons', 'analyzeMap', 'verifyCoastMap', 'verifyCoastWorld', 'COAST_PRESETS', 'buildCoastWorld', 'planLayout', 'bakeToMapDef', 'bakeTerrain']) {
      expect(coast[name], name).toBeDefined();
    }
  });

  it('nenhum arquivo usa Math.random, Date.now, performance.now ou new Date (toda a aleatoriedade vem de semente)', () => {
    const bad = [];
    for (const f of files) code(f).split('\n').forEach((line, i) => { if (/Math\.random\s*\(|Date\.now\s*\(|performance\.now\s*\(|new Date\s*\(/.test(line)) bad.push(`${f}:${i + 1}: ${line.trim()}`); });
    expect(bad).toEqual([]);
  });

  it('nenhum arquivo importa three.js, pacotes externos ou usa DOM/navegador', () => {
    const bad = [];
    for (const f of files) {
      const src = code(f);
      for (const m of src.matchAll(/(?:import|export)[^;'"]*?from\s*['"]([^'"]+)['"]/g)) if (!/^\.{1,2}\//.test(m[1])) bad.push(`${f}: importa "${m[1]}"`);
      if (/\b(document|window|localStorage|sessionStorage|navigator|HTMLElement|OffscreenCanvas|requestAnimationFrame|Image)\b/.test(src.replace(/['"`][^'"`\n]*['"`]/g, '""'))) bad.push(`${f}: usa DOM`);
    }
    expect(bad).toEqual([]);
  });

  it('o PRNG é o mulberry32 de src/sim/rng.js: a mesma semente sempre dá a mesma sequência', () => {
    const a = generateCoast({ seed: 5, size: 96, grid: 96, continents: 1, islands: 0, islets: 0, lava: false });
    const b = generateCoast({ seed: 5, size: 96, grid: 96, continents: 1, islands: 0, islets: 0, lava: false });
    expect(same(a, b)).toBe(true);
  });
});

describe('coast: shim tools/lib/irregularCoast.mjs (tools/proto e gen-world-map seguem funcionando)', () => {
  const LEGACY = ['BIOME', 'BIOME_NAMES', 'LAND_HEIGHT', 'DEFAULT_OPTIONS', 'LAVA_HEIGHT', 'valueNoise', 'fbm', 'labelComponents', 'distanceTransform', 'labelComponents8', 'lavaWalkable', 'bfsReach', 'lavaStats', 'crofton', 'irregularityIndex', 'closeMask', 'outerIrregularity', 'coastFractalDimension', 'landMaskFromHeight', 'analyzeMap', 'bakeToMapDef', 'generateIrregularCoast'];

  it('reexporta toda a API do protótipo, com as mesmas referências do módulo de dados', () => {
    for (const name of LEGACY) {
      expect(shim[name], name).toBeDefined();
      expect(shim[name], `${name} é a mesma referência`).toBe(coast[name]);
    }
  });

  it('a API original continua exigindo islands >= 5, enquanto o gerador geral aceita menos', () => {
    expect(() => generateIrregularCoast({ seed: 1, islands: 3 })).toThrow(/islands/);
    const m = generateCoast({ seed: 1, size: 128, grid: 128, continents: 1, islands: 1, islets: 0, lava: false });
    expect(m.entities.filter((e) => e.kind === 'island')).toHaveLength(1);
  });
});

describe('coast: determinismo', () => {
  it('mesma semente ⇒ mesma terra, altura, bioma e distância; sementes diferentes ⇒ mapas diferentes', () => {
    const a = generateIrregularCoast({ seed: 9 }), b = generateIrregularCoast({ seed: 9 });
    expect(same(a, b)).toBe(true);
    expect(a.entities.map((e) => `${e.id}:${e.area}`)).toEqual(b.entities.map((e) => `${e.id}:${e.area}`));
    expect(same(a, generateIrregularCoast({ seed: 10 }))).toBe(false);
  });

  it('cada preset é determinístico (mesma semente, mesmo resultado) inclusive rios e lava', () => {
    for (const id of Object.keys(COAST_PRESETS)) {
      const opts = { ...COAST_PRESETS[id].options, seed: 4 };
      const a = generateCoast(opts), b = generateCoast(opts);
      expect(same(a, b), id).toBe(true);
      if (a.rivers) { expect(hashBytes(a.rivers.mask), id).toBe(hashBytes(b.rivers.mask)); expect(hashBytes(a.rivers.ford)).toBe(hashBytes(b.rivers.ford)); }
      if (a.lava) expect(hashBytes(a.lava.mask), id).toBe(hashBytes(b.lava.mask));
    }
  });

  it('opções omitidas = padrão do protótipo (rios desligados, 2 continentes, 6 ilhas, lava ligada)', () => {
    const m = generateIrregularCoast({ seed: 2 });
    expect(m.rivers).toBeNull();
    expect(m.lava).not.toBeNull();
    expect(m.entities.filter((e) => e.kind === 'continent')).toHaveLength(2);
    expect(m.options.islands).toBe(6);
    expect(same(m, generateCoast({ seed: 2 }))).toBe(true); // o gerador geral com as mesmas opções produz o mesmo mapa
  });
});

describe('coast: conectividade (cada massa de terra é UMA só; sem fragmentos soltos)', () => {
  const CONFIGS = [
    { name: 'protótipo', opts: {}, verify: {} },
    { name: 'com rios', opts: { rivers: 1 }, verify: { minRivers: 1 } },
    { name: 'duelo (1 continente, simetria)', opts: COAST_PRESETS['duelo-continental'].options, verify: COAST_PRESETS['duelo-continental'].verify },
    { name: 'arquipélago (4 ilhas grandes)', opts: COAST_PRESETS['arquipelago-vivo'].options, verify: COAST_PRESETS['arquipelago-vivo'].verify }
  ];
  for (const cfg of CONFIGS) {
    for (const seed of [1, 2, 3]) {
      it(`${cfg.name}, seed ${seed}: terra de cada entidade = 1 componente 4-conexo; #componentes = #entidades`, () => {
        const m = gen({ seed, ...cfg.opts });
        const lc = labelComponents(m.land, m.grid, 1);
        expect(lc.sizes).toHaveLength(m.entities.length);
        expect(m.stats.landComponents).toBe(m.entities.length);
        const compOf = new Map();
        for (let c = 0; c < m.land.length; c++) {
          if (!m.land[c]) continue;
          expect(m.owner[c], 'toda terra pertence a uma entidade').toBeGreaterThanOrEqual(0);
          const set = compOf.get(m.owner[c]) ?? new Set();
          set.add(lc.labels[c]);
          compOf.set(m.owner[c], set);
        }
        for (const e of m.entities) expect(compOf.get(e.index)?.size, e.id).toBe(1);
        expect(new Set([...compOf.values()].map((st) => [...st][0])).size).toBe(m.entities.length); // entidades distintas em componentes distintos
        for (let i = 0; i < m.grid; i++) { expect(m.land[i]).toBe(0); expect(m.land[i * m.grid]).toBe(0); } // mar nas bordas
        expect(verifyCoastMap(m, cfg.verify).failures).toEqual([]);
      });
    }
  }

  it('verifyCoastMap acusa uma massa de terra partida e fragmentos soltos', () => {
    const m = gen({ seed: 1 });
    const broken = { ...m, land: new Uint8Array(m.land), stats: { ...m.stats, entityComponents: m.stats.entityComponents.map((n, k) => (k === 0 ? 2 : n)), landComponents: m.stats.landComponents + 1 } };
    const r = verifyCoastMap(broken);
    expect(r.ok).toBe(false);
    expect(r.failures.some((f) => f.startsWith('componentes:'))).toBe(true);
    expect(r.failures.some((f) => f.startsWith('entidade-partida:'))).toBe(true);
  });
});

describe('coast: lagoas (água não ligada ao oceano)', () => {
  /** Anel de terra com um poço de água pequeno e um grande dentro; o mar é a borda. */
  function ringWithPockets(G = 40) {
    const land = new Uint8Array(G * G), owner = new Int16Array(G * G).fill(-1);
    for (let j = 4; j < 36; j++) for (let i = 4; i < 36; i++) { land[j * G + i] = 1; owner[j * G + i] = 0; }
    for (let j = 8; j < 11; j++) for (let i = 8; i < 11; i++) { land[j * G + i] = 0; owner[j * G + i] = -1; } // 9 células
    for (let j = 18; j < 28; j++) for (let i = 18; i < 28; i++) { land[j * G + i] = 0; owner[j * G + i] = -1; } // 100 células
    return { G, land, owner };
  }

  it('resolveLagoons: lagoa pequena vira terra do mesmo dono; a grande fica como lago; o oceano não muda', () => {
    const { G, land, owner } = ringWithPockets();
    const r = resolveLagoons(land, owner, G, 60);
    expect(r.lakes).toEqual([100]);
    expect(r.filled).toBe(1);
    for (let j = 8; j < 11; j++) for (let i = 8; i < 11; i++) { expect(land[j * G + i]).toBe(1); expect(owner[j * G + i]).toBe(0); }
    expect(land[20 * G + 20]).toBe(0);
    expect(land[0]).toBe(0);
    expect(resolveLagoons(land, owner, G, 60)).toEqual({ lakes: [100], filled: 0 }); // idempotente
    expect(listLakes(land, G).lakes.map((l) => l.size)).toEqual([100]);
  });

  for (const seed of [1, 2, 3, 4, 5, 6]) {
    it(`seed ${seed}: nenhuma lagoa com menos de minLake células (recontagem independente) e m.lakes confere`, () => {
      const m = gen({ seed });
      const { lakes } = listLakes(m.land, m.grid);
      for (const l of lakes) expect(l.size, `lagoa de ${l.size} células`).toBeGreaterThanOrEqual(m.options.minLake);
      expect(lakes.map((l) => l.size).sort((a, b) => a - b)).toEqual([...m.lakes].sort((a, b) => a - b));
      expect(m.stats.smallestLake).toBeGreaterThanOrEqual(m.options.minLake);
    });
  }

  it('verifyCoastMap acusa uma lagoa minúscula criada à mão dentro de um continente', () => {
    const m = gen({ seed: 1 });
    const land = new Uint8Array(m.land);
    const G = m.grid;
    let cx = -1;
    for (let c = 0; c < land.length && cx < 0; c++) if (land[c] && m.owner[c] === 0 && land[c - 1] && land[c + 1] && land[c - G] && land[c + G] && land[c - G - 1] && land[c + G + 1]) cx = c;
    land[cx] = 0; land[cx + 1] = 0;
    const r = verifyCoastMap({ ...m, land });
    expect(r.failures.some((f) => f.startsWith('lagoa-pequena:'))).toBe(true);
  });

  it('os mapas de preset também não têm lagoas pequenas (rios e vaus não criam poças)', () => {
    for (const id of Object.keys(COAST_PRESETS)) {
      const m = gen({ ...COAST_PRESETS[id].options, seed: 2 });
      const { lakes } = listLakes(m.land, m.grid);
      for (const l of lakes) expect(l.size, id).toBeGreaterThanOrEqual(m.options.minLake);
    }
  });
});

describe('coast: rota naval (o mar ao redor das entidades é um só)', () => {
  const navStats = (m) => {
    const G = m.grid, N = G * G;
    const dLand = distanceTransform(m.land, G);
    const nav = new Uint8Array(N);
    for (let c = 0; c < N; c++) nav[c] = !m.land[c] && dLand[c] >= 2 ? 1 : 0;
    const nl = labelComponents(nav, G, 1);
    const total = nl.sizes.reduce((s, v) => s + v, 0);
    const main = nl.sizes.indexOf(Math.max(...nl.sizes));
    const mainMask = new Uint8Array(N);
    for (let c = 0; c < N; c++) mainMask[c] = nl.labels[c] === main ? 1 : 0;
    const dMain = distanceTransform(mainMask, G);
    const touches = m.entities.map((e) => { let best = Infinity; for (let c = 0; c < N; c++) if (m.owner[c] === e.index && m.land[c]) best = Math.min(best, dMain[c]); return best; });
    return { fraction: nl.sizes[main] / total, touches };
  };

  for (const seed of [1, 2, 3, 4]) {
    it(`protótipo seed ${seed}: o mar a >= 2 células da terra é >= 95 % um componente e toda entidade chega a ele (<= 4 células)`, () => {
      const m = gen({ seed });
      const s = navStats(m);
      expect(s.fraction).toBeGreaterThan(0.95);
      for (const t of s.touches) expect(t).toBeLessThanOrEqual(4);
      expect(m.stats.seaMainFraction).toBeCloseTo(s.fraction, 9);
      expect(m.stats.allEntitiesReachableBySea).toBe(true);
    });
  }

  it('todos os presets mantêm a rota naval (mar principal >= 95 % e acesso de toda entidade)', () => {
    for (const id of Object.keys(COAST_PRESETS)) {
      const m = gen({ ...COAST_PRESETS[id].options, seed: 3 });
      const s = navStats(m);
      expect(s.fraction, id).toBeGreaterThan(0.95);
      for (const t of s.touches) expect(t, id).toBeLessThanOrEqual(4);
    }
  });

  it('verifyCoastMap acusa mar partido ou entidade sem acesso ao mar', () => {
    const m = gen({ seed: 1 });
    const r1 = verifyCoastMap({ ...m, stats: { ...m.stats, seaMainFraction: 0.8 } });
    expect(r1.failures.some((f) => f.startsWith('rota-naval:'))).toBe(true);
    const r2 = verifyCoastMap({ ...m, stats: { ...m.stats, allEntitiesReachableBySea: false } });
    expect(r2.failures.some((f) => f.startsWith('rota-naval:'))).toBe(true);
  });

  it('o canal mínimo entre entidades (gap) deixa água navegável entre elas: nenhuma terra encosta em outra entidade', () => {
    const m = gen({ seed: 3 });
    const G = m.grid;
    for (let c = 0; c < G * G; c++) {
      if (!m.land[c]) continue;
      for (const n of [c + 1, c + G]) if (m.land[n]) expect(m.owner[n], `células coladas ${c}/${n}`).toBe(m.owner[c]);
    }
  });
});

describe('coast: simetria "rotate" (rotação de 180°, exata)', () => {
  const opts = { ...COAST_PRESETS['duelo-continental'].options };

  for (const seed of [1, 2, 3]) {
    it(`seed ${seed}: terra, altura, bioma, distância à costa e rios são iguais na célula girada`, () => {
      const m = gen({ seed, ...opts });
      const G = m.grid;
      for (let c = 0; c < G * G; c++) {
        const r = rotateIndex(c, G);
        if (m.land[c] !== m.land[r] || m.height[c] !== m.height[r] || m.biome[c] !== m.biome[r] || m.sd[c] !== m.sd[r] || m.rivers.mask[c] !== m.rivers.mask[r] || m.rivers.ford[c] !== m.rivers.ford[r]) {
          throw new Error(`célula ${c} difere da girada ${r}`);
        }
      }
      expect(m.rivers.count % 2).toBe(0); // cada rio ganha um gêmeo
      expect(m.entities.filter((e) => e.twinOf !== undefined).length).toBeGreaterThanOrEqual(1);
      for (const e of m.entities) if (e.twinOf !== undefined) expect(e.area).toBe(m.entities[e.twinOf].area);
      expect(m.lava).toBeNull();
    });
  }

  it('simetria "rotate" não vale com 2 continentes nem com ilhas grandes', () => {
    expect(() => generateCoast({ seed: 1, symmetry: 'rotate' })).toThrow(/rotate/);
    expect(() => generateCoast({ seed: 1, symmetry: 'rotate', continents: 0, bigIslands: 2 })).toThrow(/rotate/);
  });
});

describe('coast: lava (generateLava exportado) e análise (analyzeMap exportado)', () => {
  it('generateLava com o PRNG raiz do mapa reproduz exatamente o divisor de lava embutido (bases, passagens, áreas)', () => {
    const m = gen({ seed: 1 });
    const lv = generateLava(m, mulberry32(m.options.seed ^ 0x51ed270b));
    expect(lv).not.toBeNull();
    expect(hashBytes(lv.mask)).toBe(hashBytes(m.lava.mask));
    expect(hashBytes(lv.passage)).toBe(hashBytes(m.lava.passage));
    expect(lv.bases.map((b) => b.cell)).toEqual(m.lava.bases.map((b) => b.cell));
    expect(lv.areaCount).toBeGreaterThanOrEqual(2);
    expect(lv.bases).toHaveLength(lv.areaCount);
    expect(lv.passageCount).toBeGreaterThanOrEqual(lv.streams.length);
  });

  it('analyzeMap reproduz as estatísticas do mapa (terra, componentes, mar, irregularidade, lava, rios)', () => {
    const m = gen({ ...COAST_PRESETS['dois-continentes'].options, seed: 2 });
    const s = analyzeMap(m);
    expect(s.landFraction).toBeCloseTo(m.stats.landFraction, 12);
    expect(s.landComponents).toBe(m.entities.length);
    expect(s.irregularity.weighted).toBeGreaterThan(1.45);
    expect(s.fractalDim).toBeGreaterThan(1.08);
    expect(s.lava.areas).toBeGreaterThanOrEqual(2);
    expect(s.rivers.count).toBeGreaterThanOrEqual(2);
  });
});

describe('coast: tempo por mapa (<= 1 s)', () => {
  // aquece o JIT com um mapa pequeno e mede o MELHOR de 2 execuções (a máquina pode estar ocupada com outros testes em paralelo)
  const warm = () => generateCoast({ seed: 99, size: 96, grid: 96, continents: 1, islands: 0, islets: 0, lava: false, rivers: 1 });
  const best = (fn, runs = 2) => { let b = Infinity; for (let k = 0; k < runs; k++) { const t0 = performance.now(); fn(k); b = Math.min(b, performance.now() - t0); } return b; };

  it('o mapa padrão do protótipo (256², 11 entidades, lava) sai em <= 1 s', () => {
    warm();
    expect(best((k) => generateIrregularCoast({ seed: 40 + k }))).toBeLessThan(1000);
  });

  for (const id of Object.keys(COAST_PRESETS)) {
    it(`preset ${id} (${COAST_PRESETS[id].options.size}², com rios${COAST_PRESETS[id].options.lava ? ' e lava' : ''}) sai em <= 1 s`, () => {
      warm();
      expect(best((k) => generateCoast({ ...COAST_PRESETS[id].options, seed: 7 + k }))).toBeLessThan(1000);
    });
  }
});
