/**
 * tools/lib/skirmishMaps.mjs (SKIRMISH-MAPS · mapas de Escaramuça gerados pelo assador de costas)
 *
 * Receita dos 6 mapas de Escaramuça que substituem os 9 mapas antigos (`continental-1v1`, `ilhas-4p`, `estreito-1v1`, `campos-1v1`,
 * `desfiladeiro-1v1`, `vales-2v2`, `bosques-2v2`, `planalto-ffa-4p`, `arquipelago-naval-4p`): um preset por mapa (opções do gerador de costa +
 * regra de posição das bases) e uma etapa final que acrescenta o que a Escaramuça pede (expansão de ouro por base, acampamentos neutros,
 * poços de petróleo disputados nos navais, crista com desfiladeiros no Desfiladeiro), afina o corredor (madeira 8000 × 1,05 por base) e confere
 * tudo com `verifyCoastWorld` e `validateMapDef`. Usado por `tools/gen-skirmish-maps.mjs`. Puro (Node, sem DOM, sem `Math.random`).
 *
 * Convenções (iguais às dos demais mapas fixos): ouro 7.500 por mina; petróleo DOBRADO em relação ao padrão antigo (10.000 por poço,
 * `OIL_AMOUNT`; o antigo era 5.000); madeira >= 8.000 × 1,05 por jogador a <= 60 u da base; acampamentos a >= 25 u de qualquer base.
 */
import { buildCoastWorld, verifyCoastWorld } from '../../src/data/maps/coast/index.js';
import { defaultAnchors } from '../../src/data/maps/anchors.js';
import { getHeightForMap } from '../../src/sim/terrainGenerators.js';
import { buildPathfinder, floodFill, isReached } from '../../src/data/maps/generator.js';
import { estimateWood } from '../../src/data/maps/coast/layout.js';
import { thinCorridor, makeWoodFn, CORRIDOR_DEFAULTS } from './corridorThin.mjs';
import { carveRidge } from './cliffRidge.mjs';
import { registerMap, unregisterMap } from '../../src/data/maps/index.js';
import { measureWood } from './woodStats.mjs';
import { makeCtx, GOLD_AMOUNT } from './campaignMaps.mjs';

const freeze = (o) => Object.freeze(o);
const hyp = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const r1 = (v) => Math.round(v * 10) / 10;

/** Petróleo por poço nos mapas novos: o dobro do padrão antigo (5.000). */
export const OIL_AMOUNT = 10000;
/** Piso de madeira por base (a verificação aplica a folga de 5 %). */
export const SKIRMISH_WOOD_FLOOR = 8000;
/** Piso usado ao afinar o corredor: a madeira estimada fica folgada (o sorteio real de árvores da partida varia até ~30 % abaixo da estimativa). */
export const SKIRMISH_THIN_WOOD = 9500;
/** Crista do Desfiladeiro (mesmos parâmetros do palco Pedra-Mãe da campanha, que já passou no Pathfinder e nas muralhas). */
export const DESFILADEIRO_RIDGE = freeze({ cliffHeight: 5, hTop: 7.4, core: 3.0, fall: 3.6, gapWidth: 6.2, gapRamp: 1.4, gapSep: 26, wave: 5.5, along: 0.5 });

/**
 * Presets (mesmo formato de `COAST_PRESETS` + campos da receita):
 *  - `mode`: '1v1' | '2v2' | 'ffa'; `extraGold`: minas de expansão por base (7.500); `camps`: acampamentos neutros;
 *  - `contestedWells`: poços de petróleo extras no meio do mar (navais), `ridge`: crista com desfiladeiros.
 */
export const SKIRMISH_PRESETS = freeze({
  /** 1×1 naval: dois continentes de gelo ligados por um istmo no meio do estreito; o mar contorna o istmo ao norte e ao sul. */
  'estreito-naval-1v1': freeze({
    id: 'estreito-naval-1v1', name: 'Estreito de Vaeloria', mode: '1v1', tileset: 'inverno', naval: true, extraGold: 1, camps: 2, contestedWells: 2,
    options: freeze({
      size: 224, grid: 224, continents: 2, continentBiomes: ['ice', 'ice'], continentDims: [0.17, 0.4], continentSpacing: 0.37, gap: 16, islands: 3, islets: 2, bays: 3, peninsulas: 2, roughness: 1.0,
      lava: false, rivers: 0, bridges: [{ a: 0, b: 1, width: 13, bow: 0 }]
    }),
    layout: freeze({ bases: [{ entities: [0], side: 'west' }, { entities: [1], side: 'east' }], minSeparation: 90 }),
    verify: freeze({ landRange: [0.15, 0.55], minRivers: 0 })
  }),
  /** FFA naval de 4: quatro ilhas desérticas nos cantos ligadas em cadeia por três pontes (a quarta aresta fica aberta: o mar do centro dá a volta). */
  'arquipelago-pontes-4p': freeze({
    id: 'arquipelago-pontes-4p', name: 'Arquipélago', mode: 'ffa', tileset: 'deserto', naval: true, extraGold: 1, camps: 3, contestedWells: 4,
    options: freeze({
      size: 256, grid: 256, continents: 0, bigIslands: 4, bigIslandScale: 1.05, bigIslandAt: [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]], bigIslandBiomes: ['arid', 'arid', 'arid', 'rocky'],
      islands: 2, islets: 0, gap: 12, lava: false, rivers: 0, bridges: [{ a: 0, b: 1, width: 12 }, { a: 1, b: 3, width: 12 }, { a: 3, b: 2, width: 12 }]
    }),
    layout: freeze({ bases: [{ entities: [0] }, { entities: [1] }, { entities: [2] }, { entities: [3] }], minSeparation: 80 }),
    verify: freeze({ landRange: [0.2, 0.5], minRivers: 0 })
  }),
  /** 1×1 terrestre: vale verdejante simétrico (180°) cortado por rios com vaus. */
  'vale-rio-1v1': freeze({
    id: 'vale-rio-1v1', name: 'Vale do Rio', mode: '1v1', tileset: 'verdejante', naval: false, extraGold: 1, camps: 2,
    options: freeze({ size: 224, grid: 224, continents: 1, continentDims: [0.36, 0.28], symmetry: 'rotate', islands: 0, islets: 0, bays: 1, peninsulas: 1, roughness: 0.8, lava: false, rivers: 2, riverFordSpacing: 40, snowMinCells: 400 }),
    layout: freeze({ bases: [{ entities: [0], side: 'west' }, { twinOf: 0 }] }),
    verify: freeze({ landRange: [0.25, 0.7], minRivers: 1 })
  }),
  /** 1×1 terrestre: ilha vulcânica partida de norte a sul por um rio de lava (intransponível) com 2 passagens de rocha: o desfiladeiro. */
  'desfiladeiro-lava-1v1': freeze({
    id: 'desfiladeiro-lava-1v1', name: 'Desfiladeiro', mode: '1v1', tileset: 'vulcanico', naval: false, extraGold: 1, camps: 2,
    options: freeze({ size: 208, grid: 208, continents: 1, continentBiome: 'volcanic', continentDims: [0.44, 0.34], islands: 0, islets: 0, bays: 3, peninsulas: 2, roughness: 1.1, lava: true, lavaStreams: 1, lavaTheta: Math.PI / 2, lavaWidth: [5, 7], lavaPassages: 2, rivers: 0 }),
    layout: freeze({ bases: [{ entities: [0], side: 'west' }, { entities: [0], side: 'east' }], minSeparation: 100 }),
    verify: freeze({ landRange: [0.25, 0.8], minRivers: 0 })
  }),
  /** FFA terrestre de 4: planalto rochoso, uma base em cada quadrante. */
  'planalto-rocha-4p': freeze({
    id: 'planalto-rocha-4p', name: 'Planalto', mode: 'ffa', tileset: 'pedregoso', naval: false, extraGold: 1, camps: 4,
    options: freeze({ size: 240, grid: 240, continents: 1, continentBiome: 'rocky', continentDims: [0.4, 0.4], islands: 0, islets: 0, bays: 3, peninsulas: 2, roughness: 0.9, lava: false, rivers: 0 }),
    layout: freeze({ bases: [{ entities: [0], sides: ['west', 'north'] }, { entities: [0], sides: ['east', 'north'] }, { entities: [0], sides: ['east', 'south'] }, { entities: [0], sides: ['west', 'south'] }], minSeparation: 90 }),
    verify: freeze({ landRange: [0.25, 0.8], minRivers: 0 })
  }),
  /** 2×2 terrestre: pântano de mata fechada com um rio e vaus; duplas a norte (slots 0 e 1) e a sul (2 e 3). */
  'bosques-antigos-2v2': freeze({
    id: 'bosques-antigos-2v2', name: 'Bosques Antigos', mode: '2v2', tileset: 'pantano', naval: false, extraGold: 1, camps: 3,
    options: freeze({ size: 240, grid: 240, continents: 1, continentBiome: 'swamp', continentDims: [0.4, 0.38], islands: 0, islets: 0, bays: 3, peninsulas: 2, roughness: 1.0, lava: false, rivers: 1, riverFordSpacing: 40 }),
    layout: freeze({ bases: [{ entities: [0], sides: ['west', 'north'] }, { entities: [0], sides: ['east', 'north'] }, { entities: [0], sides: ['west', 'south'] }, { entities: [0], sides: ['east', 'south'] }], minSeparation: 80 }),
    verify: freeze({ landRange: [0.25, 0.8], minRivers: 1 })
  })
});

export const SKIRMISH_IDS = Object.freeze(Object.keys(SKIRMISH_PRESETS));

const need = (p, what) => { if (!p) throw new Error(`escaramuça: não achei lugar para ${what}`); return p; };

/** Expansão de ouro: 1 mina de 7.500 por base a 38–62 u do pátio, em terra seca alcançável. */
function addExpansionGold(ctx, count) {
  const { m } = ctx;
  for (const s of m.startSlots) {
    for (let k = 0; k < count; k++) {
      const g = need(ctx.scan({
        test: (x, z) => ctx.dryClear(x, z, 5) && ctx.reach(x, z) && ctx.free(x, z, 4) && hyp({ x, z }, s) >= 38 && hyp({ x, z }, s) <= 62
          && m.startSlots.every((o) => o === s || hyp({ x, z }, o) >= hyp({ x, z }, s) + 6),
        score: (x, z) => Math.abs(hyp({ x, z }, s) - 46)
      }), 'a mina de expansão');
      ctx.take(g, 14);
      m.resources.push({ type: 'gold', x: r1(g.x), z: r1(g.z), amount: GOLD_AMOUNT });
    }
  }
}

/** Acampamentos neutros: equidistantes das bases mais próximas (justiça), em chão firme e alcançáveis, separados entre si. */
function addCamps(ctx, count, guards) {
  const { m } = ctx;
  const slots = m.startSlots;
  const placed = [];
  const pairs = slots.length === 2 ? [[0, 1], [0, 1]] : slots.map((_, i) => [i, (i + 1) % slots.length]);
  for (let k = 0; k < count; k++) {
    const [ia, ib] = pairs[k % pairs.length];
    const a = slots[ia], b = slots[ib];
    const c = need(ctx.scan({
      test: (x, z) => ctx.dryClear(x, z, 7) && ctx.reach(x, z) && ctx.free(x, z, 3) && m.forests.every((f) => hyp({ x, z }, f) >= f.radius + 4) && slots.every((s) => hyp({ x, z }, s) >= 34) && placed.every((q) => hyp({ x, z }, q) >= 40),
      score: (x, z) => {
        const da = hyp({ x, z }, a), db = hyp({ x, z }, b);
        return Math.abs(da - db) * 1.5 + Math.abs((da + db) / 2 - (slots.length === 2 ? 72 : 62)) + (slots.length === 2 && k === 1 ? Math.hypot(x, z) * 0.4 : 0);
      }
    }), `o acampamento ${k + 1}`);
    ctx.take(c, 9);
    placed.push(c);
    m.neutrals.push({ kind: 'camp', x: r1(c.x), z: r1(c.z), guards, reward: { gold: 300 }, deposit: { type: 'gold', amount: 3000 } });
  }
}

/** Poços de petróleo disputados no meio do mar: água funda, ligada ao oceano, longe da costa (>= 9 u), equidistantes das bases. */
function addContestedWells(ctx, count) {
  const { m, half } = ctx;
  const wells = m.resources.filter((r) => r.type === 'oil');
  const clear = (x, z) => {
    if (ctx.hAt(x, z) > 0.05 || !ctx.oceanOk(x, z)) return false;
    for (let a = 0; a < 12; a++) {
      const t = (a / 12) * Math.PI * 2;
      if (ctx.hAt(x + Math.cos(t) * 9, z + Math.sin(t) * 9) >= 0.1 || ctx.hAt(x + Math.cos(t) * 5, z + Math.sin(t) * 5) >= 0.1) return false;
    }
    return true;
  };
  const sl = m.startSlots;
  const mean = (p) => sl.reduce((t, s) => t + hyp(p, s), 0) / sl.length;
  for (let k = 0; k < count; k++) {
    const w = need(ctx.scan({
      step: 2,
      test: (x, z) => Math.hypot(x, z) <= half - 14 && clear(x, z) && wells.every((o) => hyp({ x, z }, o) >= (k < 2 ? 36 : 24)),
      // justiça: a mesma distância média/dispersão para todas as bases; perto do centro do mapa
      score: (x, z) => sl.reduce((t, s) => t + Math.abs(hyp({ x, z }, s) - mean({ x, z })), 0) + 0.35 * Math.hypot(x, z)
    }), `o poço disputado ${k + 1}`);
    const o = { type: 'oil', x: r1(w.x), z: r1(w.z), amount: OIL_AMOUNT };
    wells.push(o);
    m.resources.push(o);
  }
}

/** Esculpe a crista do Desfiladeiro (antes do contexto): nada do gerador pode cair nela. */
function preRidge(m, seedUsed) {
  const info = carveRidge(m, { getHeightForMap }, { ...DESFILADEIRO_RIDGE, seed: seedUsed });
  const { F, band } = info;
  const inBand = (p, extra = 3) => Math.abs(F.tOf(p.x, p.z) - F.wv(F.uOf(p.x, p.z))) <= band + extra;
  for (const s of m.startSlots) if (Math.abs(F.side(s.x, s.z)) < band + 22) throw new Error('crista: base perto demais da crista');
  for (const r of m.resources) if (r.type !== 'oil' && inBand(r, 4)) throw new Error('crista: jazida na crista');
  m.forests = m.forests.filter((f) => Math.abs(F.tOf(f.x, f.z) - F.wv(F.uOf(f.x, f.z))) > band + f.radius * 0.5);
  return info;
}

function finish(preset, world, seedUsed) {
  const m = structuredClone(world.mapDef);
  m.id = preset.id;
  m.name = preset.name;
  for (const r of m.resources) {
    if (r.type === 'gold') r.amount = GOLD_AMOUNT;
    else if (r.type === 'oil') r.amount = OIL_AMOUNT; // petróleo em dobro
  }
  if (preset.ridge) preRidge(m, seedUsed);
  const ctx = makeCtx(m);
  addExpansionGold(ctx, preset.extraGold ?? 0);
  addCamps(ctx, preset.camps ?? 0, preset.mode === 'ffa' ? 4 : 3);
  if (preset.naval) addContestedWells(ctx, preset.contestedWells ?? 0);
  // âncoras padrão recalculadas com as jazidas/acampamentos novos (antes de `meta`)
  delete m.anchors;
  const anchors = defaultAnchors(m);
  const out = {};
  for (const [k, v] of Object.entries(m)) {
    if (k === 'meta') out.anchors = anchors;
    out[k] = v;
  }
  out.meta = { ...m.meta, skirmish: preset.id, mode: preset.mode, seedUsed };
  // afinar corredor: parte das árvores da faixa entre as bases some (visibilidade), sem tirar a madeira das bases. A madeira é conferida com a partida
  // REAL (GameManager, sementes 1–3): se faltar, tenta de novo sem afinar; se ainda faltar, a semente é rejeitada.
  const original = out.forests.map((f) => f.count);
  let verification = null, lastErr = '';
  for (const thinIt of [true, false]) {
    const cand = { ...out, forests: out.forests.map((f, i) => ({ ...f, count: original[i] })), meta: { ...out.meta } };
    if (thinIt) {
      const thin = thinCorridor(cand, { ...CORRIDOR_DEFAULTS, seed: seedUsed, label: preset.id, woodMin: SKIRMISH_THIN_WOOD, woodFn: makeWoodFn(cand, { buildPathfinder, floodFill, isReached, estimateWood }) });
      cand.forests = thin.forests;
      cand.meta.corridorThin = { width: CORRIDOR_DEFAULTS.width, keepFrac: Math.round(CORRIDOR_DEFAULTS.keepFrac * 100) / 100, clusters: thin.thinned.length, trees: [thin.before, thin.after], cut: thin.thinned, original };
    }
    const v = verifyCoastWorld(cand, { naval: !!preset.naval, woodTarget: SKIRMISH_WOOD_FLOOR });
    if (!v.ok) { lastErr = 'mundo: ' + v.failures.slice(0, 2).join(' | '); continue; }
    const probe = { ...cand, id: '__skirmish-probe', hidden: true };
    registerMap(probe);
    let min = Infinity;
    try {
      for (const sd of [1, 2, 3]) { const r = measureWood(probe, { seed: sd }); min = Math.min(min, r.minWood); r.gm.dispose?.(); }
    } finally { unregisterMap(probe.id); }
    if (min < SKIRMISH_WOOD_FLOOR) { lastErr = `madeira real (GameManager): ${min} < ${SKIRMISH_WOOD_FLOOR}${thinIt ? ' (com afinar)' : ''}`; continue; }
    Object.assign(out, cand);
    verification = v;
    break;
  }
  if (!verification) throw new Error(lastErr);
  return { mapDef: out, verification };
}

/**
 * Gera o mapa de Escaramuça `id` com a semente pedida (tenta `seed … seed + tries − 1`).
 * @returns {{ ok: boolean, id: string, seed: number, seedUsed?: number, attempts: object[], world?: object, mapDef?: object, verification?: object }}
 */
export function buildSkirmishMap(id, { seed = 1, tries = 1 } = {}) {
  const preset = SKIRMISH_PRESETS[id];
  if (!preset) throw new Error(`escaramuça: mapa desconhecido "${id}" (${SKIRMISH_IDS.join(', ')})`);
  const attempts = [];
  for (let k = 0; k < tries; k++) {
    const world = buildCoastWorld(preset, { seed: seed + k, tries: 1, id, name: preset.name });
    if (!world.ok) { attempts.push({ seed: seed + k, stage: world.attempts[0]?.stage ?? 'mundo', failures: world.attempts[0]?.failures ?? [] }); continue; }
    try {
      const out = finish(preset, world, seed + k);
      return { ok: true, id, seed, seedUsed: seed + k, attempts, world, ...out };
    } catch (e) {
      attempts.push({ seed: seed + k, stage: 'escaramuça', failures: [e.message] });
    }
  }
  return { ok: false, id, seed, attempts };
}
