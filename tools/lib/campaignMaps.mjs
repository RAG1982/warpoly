/**
 * tools/lib/campaignMaps.mjs (M2-03 · mapas de campanha)
 *
 * Receita dos mapas de campanha gerados pelo assador de costas (`buildCoastWorld`): um preset por palco (opções do gerador de
 * costa + regra de posição das bases) e uma etapa de pós-processamento que acrescenta o que a ficha da missão exige do mapa
 * (acampamento neutro, minas extras, âncoras nomeadas) e confere tudo (`verifyCoastWorld`, âncoras alcançáveis por terra/mar).
 * Usado por `tools/gen-campaign-maps.mjs`. Puro (Node, sem DOM, sem `Math.random`); o resultado é gravado em `src/data/maps/<id>.json`.
 *
 * Palcos deste arquivo (lote M2-03): 1 Baía de Aurelan, 2 Pouso do Encontro, 3 Pedra-Mãe.
 * Os palcos 2 e 3 servem às duas campanhas (Liga de Aurelan e Clãs do Cinzal): slot 0 = lado da Liga, slot 1 = lado dos Clãs, e as
 * âncoras trazem um par por lado quando a missão muda de dono (`pier1`/`pier2`, `emissary1`/`emissary2`).
 */
import { buildCoastWorld, verifyCoastWorld, COAST_PRESETS } from '../../src/data/maps/coast/index.js';
import { defaultAnchors } from '../../src/data/maps/anchors.js';
import { getHeightForMap } from '../../src/sim/terrainGenerators.js';
import { buildPathfinder, floodFill, isReached } from '../../src/data/maps/generator.js';
import { layoutAt } from '../../src/sim/MatchConfig.js';
import { getBiomeAt, BIOME } from '../../src/data/maps/biome.js';

const hyp = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const r1 = (v) => Math.round(v * 10) / 10;

export const GOLD_AMOUNT = 7500; // padrão do MUNDO-7

const freeze = (o) => Object.freeze(o);

/** Presets dos palcos (mesmo formato de `COAST_PRESETS`; `grid = size`, 1 célula = 1 u). */
export const CAMPAIGN_PRESETS = freeze({
  /** Palco 1: continente exuberante com enseadas e penínsulas; jogador a oeste, lado "rival" a leste (o acampamento neutro fica entre eles). */
  'camp-01-baia-de-aurelan': freeze({
    id: 'camp-01-baia-de-aurelan', name: 'Baía de Aurelan', uso: 'campanha, palco 1', tileset: 'exuberante', naval: false,
    options: freeze({ size: 176, grid: 176, continents: 1, continentDims: [0.45, 0.37], islands: 0, islets: 0, bays: 4, peninsulas: 2, roughness: 1.0, mountain: 0.8, lava: false, rivers: 0 }),
    layout: freeze({ bases: [{ entities: [0], side: 'west' }, { entities: [0], side: 'east' }], minSeparation: 70 }),
    verify: freeze({ landRange: [0.25, 0.8], minRivers: 0 })
  }),
  /** Palco 2: ilha temperada com praias, um rio com vaus, base da Liga a oeste e dos Clãs a leste. */
  'camp-02-pouso-do-encontro': freeze({
    id: 'camp-02-pouso-do-encontro', name: 'Pouso do Encontro', uso: 'campanha, palco 2 (Liga e Clãs)', tileset: 'verdejante', naval: false,
    options: freeze({ size: 176, grid: 176, continents: 1, continentDims: [0.42, 0.34], islands: 0, islets: 0, bays: 3, peninsulas: 3, roughness: 0.9, mountain: 0.35, lava: false, rivers: 1 }),
    layout: freeze({ bases: [{ entities: [0], side: 'west' }, { entities: [0], side: 'east' }], minSeparation: 66 }),
    verify: freeze({ landRange: [0.25, 0.8], minRivers: 1 })
  }),
  /** Palco 3: ilha rochosa (pedregoso), base do Paço a oeste e cabeça de ponte a leste; ouro extra no Paço. */
  'camp-03-pedra-mae': freeze({
    id: 'camp-03-pedra-mae', name: 'Pedra-Mãe', uso: 'campanha, palco 3 (Liga e Clãs)', tileset: 'pedregoso', naval: false,
    options: freeze({ size: 176, grid: 176, continents: 1, continentBiome: 'rocky', continentDims: [0.44, 0.36], islands: 0, islets: 0, bays: 3, peninsulas: 3, roughness: 1.15, lava: false, rivers: 0 }),
    layout: freeze({ bases: [{ entities: [0], side: 'west' }, { entities: [0], side: 'east' }], minSeparation: 66 }),
    verify: freeze({ landRange: [0.25, 0.8], minRivers: 0 })
  })
});

export const CAMPAIGN_IDS = Object.freeze(Object.keys(CAMPAIGN_PRESETS));

/** Nomes (pt-BR e en) de `map.<id>.name`. */
export const CAMPAIGN_NAMES = freeze({
  'camp-01-baia-de-aurelan': { pt: 'Baía de Aurelan', en: 'Aurelan Bay' },
  'camp-02-pouso-do-encontro': { pt: 'Pouso do Encontro', en: 'Meeting Landing' },
  'camp-03-pedra-mae': { pt: 'Pedra-Mãe', en: 'Mother Rock' }
});

// ---------------------------------------------------------------------------------------------------------------------------
// Contexto de posicionamento
// ---------------------------------------------------------------------------------------------------------------------------

function oceanSeed(sea, playable) {
  const half = playable / 2;
  for (let d = 4; d < 30; d += 2) {
    for (let t = -half; t <= half; t += 4) {
      for (const p of [{ x: t, z: -half + d }, { x: t, z: half - d }, { x: -half + d, z: t }, { x: half - d, z: t }]) {
        if (sea.isWalkableWorld(p.x, p.z)) return p;
      }
    }
  }
  return null;
}

/** Contexto com os pathfinders terrestre e naval e funções de consulta sobre o `mapDef` já assado. */
export function makeCtx(m) {
  const land = buildPathfinder(m, 'land');
  const sea = buildPathfinder(m, 'naval');
  const half = m.playable / 2;
  const hAt = (x, z) => getHeightForMap(m, x, z);
  const s0 = m.startSlots[0];
  const seen0 = floodFill(land, s0.x, s0.z);
  const oc = oceanSeed(sea, m.playable);
  const oceanSeen = oc ? floodFill(sea, oc.x, oc.z) : new Uint8Array(sea.numCells);
  const ctx = {
    m, land, sea, half, hAt, s0, s1: m.startSlots[1], seen0, oceanSeen,
    reach: (x, z) => isReached(land, seen0, x, z),
    oceanOk: (x, z) => hAt(x, z) < m.waterLevel && sea.isWalkableWorld(x, z) && isReached(sea, oceanSeen, x, z),
    /** Chão "comum" (nem neve, nem rocha nua, nem gelo): para acampamentos e marcos nos palcos verdes. */
    plain: (x, z) => ![BIOME.SNOW, BIOME.ROCK, BIOME.ICE, BIOME.VOLCANIC, BIOME.LAVA].includes(getBiomeAt(m, x, z)),
    /** Terra seca com `r` u de folga em volta. */
    dryClear(x, z, r) {
      if (hAt(x, z) < 1.95) return false;
      for (let a = 0; a < 16; a++) {
        const t = (a / 16) * Math.PI * 2;
        if (hAt(x + Math.cos(t) * r, z + Math.sin(t) * r) < 1.8 || hAt(x + Math.cos(t) * r * 0.5, z + Math.sin(t) * r * 0.5) < 1.8) return false;
      }
      return true;
    },
    /** Praia: terra seca com água a ≤ 4 u (a mesma definição do `landingZone` padrão). */
    isShore(x, z) {
      if (hAt(x, z) < 1.95) return false;
      for (let k = 0; k < 8; k++) {
        const t = (k / 8) * Math.PI * 2;
        const sx = x + Math.cos(t) * 4, sz = z + Math.sin(t) * 4;
        if (Math.abs(sx) <= half - 2 && Math.abs(sz) <= half - 2 && hAt(sx, sz) < m.waterLevel) return true;
      }
      return false;
    },
    /** Água navegável do oceano mais perto de (x, z), buscando em anéis de 4 a 16 u. */
    waterNear(x, z, rMin = 5, rMax = 16) {
      for (let rho = rMin; rho <= rMax; rho += 1) {
        let best = null, bd = Infinity;
        for (let a = 0; a < 48; a++) {
          const t = (a / 48) * Math.PI * 2;
          const px = x + Math.cos(t) * rho, pz = z + Math.sin(t) * rho;
          if (Math.abs(px) > half - 4 || Math.abs(pz) > half - 4 || !ctx.oceanOk(px, pz)) continue;
          // preferir o ponto mais fundo da vizinhança (navio de verdade passa), depois o primeiro ângulo
          const d = hAt(px, pz);
          if (d < bd) { bd = d; best = { x: r1(px), z: r1(pz) }; }
        }
        if (best) return best;
      }
      return null;
    },
    /** Varre a área jogável em passo fixo (ordem z, x) e devolve o ponto de menor `score` entre os que passam em `test`. */
    scan({ step = 2, test, score = () => 0 }) {
      let best = null, bs = Infinity;
      for (let z = -half + 6; z <= half - 6; z += step) {
        for (let x = -half + 6; x <= half - 6; x += step) {
          if (!test(x, z)) continue;
          const s = score(x, z);
          if (s < bs) { bs = s; best = { x, z, s }; }
        }
      }
      return best;
    }
  };
  ctx.avoid = []; // {x, z, r}: pontos já ocupados (jazidas, bosques, acampamentos, âncoras postas)
  for (const r of m.resources) ctx.avoid.push({ x: r.x, z: r.z, r: r.type === 'oil' ? 0 : 9 });
  for (const f of m.forests) ctx.avoid.push({ x: f.x, z: f.z, r: f.radius * 0.75 });
  for (const s of m.startSlots) {
    for (const b of layoutAt(s).buildings) ctx.avoid.push({ x: b.x, z: b.z, r: 8 });
    ctx.avoid.push({ x: s.x, z: s.z, r: 22 });
  }
  ctx.free = (x, z, extra = 0) => ctx.avoid.every((a) => Math.hypot(x - a.x, z - a.z) >= a.r + extra);
  ctx.take = (p, r) => { ctx.avoid.push({ x: p.x, z: p.z, r }); return p; };
  return ctx;
}

const need = (p, what) => { if (!p) throw new Error(`campanha: não achei lugar para ${what}`); return p; };
const pt = (p) => ({ x: r1(p.x), z: r1(p.z) });

// ---------------------------------------------------------------------------------------------------------------------------
// Pós-processamento por palco
// ---------------------------------------------------------------------------------------------------------------------------

/** Mina de ouro extra de `amount` GOLD_AMOUNT a `dMin`–`dMax` u do pátio `s` (expansão); registra em `m.resources` e devolve o ponto. */
function addGold(ctx, s, name, extra, { dMin = 20, dMax = 36, target = 26, plain = false } = {}) {
  const g = need(ctx.scan({
    test: (x, z) => ctx.dryClear(x, z, 5) && (!plain || ctx.plain(x, z)) && ctx.reach(x, z) && ctx.free(x, z, 4) && hyp({ x, z }, s) >= dMin && hyp({ x, z }, s) <= dMax,
    score: (x, z) => Math.abs(hyp({ x, z }, s) - target)
  }), `a mina extra ${name}`);
  ctx.take(g, 14);
  ctx.m.resources.push({ type: 'gold', x: r1(g.x), z: r1(g.z), amount: GOLD_AMOUNT });
  extra[name] = pt(g);
  return g;
}

/** Palco 1: acampamento da Irmandade da Maré entre as bases; Mural da Fenda numa enseada afastada; vela no horizonte. */
function postBaia(ctx, extra) {
  const { m, s0, s1 } = ctx;
  const camp = need(ctx.scan({
    test: (x, z) => ctx.dryClear(x, z, 13) && ctx.plain(x, z) && ctx.reach(x, z) && hyp({ x, z }, s0) >= 36 && hyp({ x, z }, s1) >= 30 && ctx.free(x, z, 2),
    score: (x, z) => Math.abs(hyp({ x, z }, s0) - 50) + 0.6 * Math.abs(hyp({ x, z }, s1) - 46)
  }), 'o acampamento neutro');
  ctx.take(camp, 16);
  m.neutrals.push({ kind: 'camp', x: r1(camp.x), z: r1(camp.z), guards: 4, reward: { gold: 300 }, deposit: { type: 'gold', amount: 3000 } });
  const mural = need(ctx.scan({
    test: (x, z) => ctx.reach(x, z) && ctx.isShore(x, z) && ctx.plain(x, z) && hyp({ x, z }, s0) >= 32 && hyp({ x, z }, s1) >= 28 && hyp({ x, z }, camp) >= 26 && ctx.free(x, z, 0),
    score: (x, z) => Math.abs(hyp({ x, z }, s0) - 68)
  }), 'o Mural da Fenda');
  ctx.take(mural, 10);
  extra.muralFenda = pt(mural);
  // a vela estranha: água navegável do oceano, longe do jogador, perto da borda
  const sail = need(ctx.scan({
    step: 4,
    test: (x, z) => ctx.oceanOk(x, z) && Math.max(Math.abs(x), Math.abs(z)) >= ctx.half - 22 && ctx.oceanOk(x + 6, z) && ctx.oceanOk(x - 6, z),
    score: (x, z) => -hyp({ x, z }, s0)
  }), 'a vela no horizonte');
  extra.shipHorizon = { ...pt(sail), water: true };
}

/** Palco 2: Cais de cada lado, forte de troncos no meio, Torre da Fenda numa ponta, Emissário/Mensageiro, patrulha. */
function postPouso(ctx, extra) {
  const { m, s0, s1 } = ctx;
  const mid = { x: (s0.x + s1.x) / 2, z: (s0.z + s1.z) / 2 };
  const pierFor = (s, other, name) => {
    const p = need(ctx.scan({
      step: 1,
      test: (x, z) => ctx.isShore(x, z) && ctx.reach(x, z) && hyp({ x, z }, s) >= 24 && hyp({ x, z }, s) <= 52 && ctx.waterNear(x, z) && ctx.free(x, z, 4),
      // a costa mais próxima do pátio e do lado oposto ao rival
      score: (x, z) => Math.abs(hyp({ x, z }, s) - 34) + 0.35 * Math.max(0, 80 - hyp({ x, z }, other)) * 0.2
    }), `o Cais de ${name}`);
    ctx.take(p, 12);
    return p;
  };
  const pier1 = pierFor(s0, s1, 'Aurelan');
  const pier2 = pierFor(s1, s0, 'Cinzal');
  extra.pier1 = pt(pier1); extra.pier1Water = { ...ctx.waterNear(pier1.x, pier1.z), water: true };
  extra.pier2 = pt(pier2); extra.pier2Water = { ...ctx.waterNear(pier2.x, pier2.z), water: true };
  // forte de troncos: perto do meio do caminho entre as bases
  const fort = need(ctx.scan({
    test: (x, z) => ctx.dryClear(x, z, 11) && ctx.plain(x, z) && ctx.reach(x, z) && ctx.free(x, z, 6) && hyp({ x, z }, s0) >= 30 && hyp({ x, z }, s1) >= 30,
    score: (x, z) => hyp({ x, z }, mid) * 0.6 + Math.abs(hyp({ x, z }, s0) - hyp({ x, z }, s1))
  }), 'o forte de troncos');
  ctx.take(fort, 16);
  extra.logFort = pt(fort);
  // Torre da Fenda em ruínas: ponta de terra (muita água em volta), longe das bases
  const wetFrac = (x, z, rho) => { let n = 0; for (let k = 0; k < 16; k++) { const t = (k / 16) * Math.PI * 2; if (ctx.hAt(x + Math.cos(t) * rho, z + Math.sin(t) * rho) < m.waterLevel) n++; } return n / 16; };
  const lh = need(ctx.scan({
    step: 1,
    test: (x, z) => ctx.dryClear(x, z, 2.5) && ctx.reach(x, z) && ctx.free(x, z, 6) && hyp({ x, z }, s0) >= 36 && hyp({ x, z }, s1) >= 36 && hyp({ x, z }, fort) >= 28,
    score: (x, z) => -wetFrac(x, z, 10) * 60 - wetFrac(x, z, 18) * 30 + Math.abs(hyp({ x, z }, mid) - 30) * 0.3
  }), 'a Torre da Fenda');
  ctx.take(lh, 14);
  extra.lighthouse = pt(lh);
  // Emissário (lado dos Clãs) e Mensageiro (lado da Liga): a ~30 u do pátio, rumo ao forte
  const toward = (s, to, d) => { const L = hyp(s, to) || 1; return { x: s.x + ((to.x - s.x) / L) * d, z: s.z + ((to.z - s.z) / L) * d }; };
  const near = (p, name, minR = 0) => need(ctx.scan({ test: (x, z) => ctx.dryClear(x, z, 3) && ctx.reach(x, z) && ctx.free(x, z, 3) && hyp({ x, z }, p) >= minR, score: (x, z) => hyp({ x, z }, p) }), name);
  const em1 = ctx.take(near(toward(s1, fort, 30), 'o Emissário'), 8);
  const em2 = ctx.take(near(toward(s0, fort, 30), 'o Mensageiro'), 8);
  extra.emissary1 = pt(em1); extra.emissary2 = pt(em2);
  // patrulha: 3 pontos em volta do forte (a 22 u)
  for (let k = 0; k < 3; k++) {
    const ang = (k / 3) * Math.PI * 2 + 0.6;
    const p = near({ x: fort.x + Math.cos(ang) * 22, z: fort.z + Math.sin(ang) * 22 }, `a patrulha ${k + 1}`, 0);
    ctx.take(p, 8);
    extra[`patrol${k + 1}`] = pt(p);
  }
  // uma mina de expansão por lado: com só 2 minas o ouro acaba e a partida IA×IA trava (soak, semente 8 brutal)
  addGold(ctx, s0, 'expansion1', extra, { plain: true });
  addGold(ctx, s1, 'expansion2', extra, { plain: true });
  extra.landingZone = pt(pier1); // praia de desembarque desta ilha: a do Cais da Liga (o `landingZone` padrão é só uma sugestão)
}

/** Palco 3: ouro extra no Paço, três praias de pouso com seu ponto no mar e seu forte, cabeça de ponte dos Clãs. */
function postPedra(ctx, extra) {
  const { m, s0, s1 } = ctx;
  // minas extras: 2 junto ao Paço (a Liga defende; os Clãs as capturam) e 1 na cabeça de ponte
  addGold(ctx, s0, 'colonyGold1', extra);
  addGold(ctx, s0, 'colonyGold2', extra);
  addGold(ctx, s1, 'bridgeheadGold', extra);
  // três praias onde as ondas (Barcaças) desembarcam, espalhadas em volta do Paço
  const cands = [];
  for (let z = -ctx.half + 6; z <= ctx.half - 6; z += 2) {
    for (let x = -ctx.half + 6; x <= ctx.half - 6; x += 2) {
      const d = hyp({ x, z }, s0);
      if (d < 36 || d > 72 || hyp({ x, z }, s1) < 44) continue;
      if (!ctx.isShore(x, z) || !ctx.reach(x, z) || !ctx.free(x, z, 3)) continue;
      const w = ctx.waterNear(x, z, 8, 18);
      if (!w) continue;
      cands.push({ x, z, d, w, ang: Math.atan2(z - s0.z, x - s0.x) });
    }
  }
  if (cands.length < 3) throw new Error('campanha: poucas praias para as ondas');
  const angDiff = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
  const picked = [];
  // primeiro: a praia mais próxima de 52 u; depois, a de maior separação angular (mín. 60°), com preferência por ~52 u
  picked.push(cands.reduce((a, c) => (Math.abs(c.d - 52) < Math.abs(a.d - 52) ? c : a)));
  for (let k = 1; k < 3; k++) {
    let best = null, bs = -Infinity;
    for (const c of cands) {
      const sep = Math.min(...picked.map((p) => angDiff(p.ang, c.ang)));
      if (sep < 1.0) continue;
      const s = sep * 40 - Math.abs(c.d - 52);
      if (s > bs) { bs = s; best = c; }
    }
    if (!best) throw new Error('campanha: não achei a praia de pouso ' + (k + 1));
    picked.push(best);
  }
  picked.sort((a, b) => a.ang - b.ang);
  picked.forEach((p, i) => {
    extra[`beach${i + 1}`] = pt(p);
    extra[`seaLanding${i + 1}`] = { x: p.w.x, z: p.w.z, water: true };
    ctx.take(p, 10);
  });
  // fortes da colônia (H03): um por praia, 14–18 u para dentro, rumo ao Paço
  picked.forEach((p, i) => {
    const L = hyp(p, s0) || 1;
    const aim = { x: p.x + ((s0.x - p.x) / L) * 16, z: p.z + ((s0.z - p.z) / L) * 16 };
    const f = need(ctx.scan({ test: (x, z) => ctx.dryClear(x, z, 5) && ctx.reach(x, z) && ctx.free(x, z, 3), score: (x, z) => hyp({ x, z }, aim) }), `o forte ${i + 1}`);
    ctx.take(f, 10);
    extra[`fort${i + 1}`] = pt(f);
  });
  // cabeça de ponte dos Clãs (H03): a praia mais próxima do slot 1 e o ponto no mar de onde as barcaças chegam
  const bh = need(ctx.scan({
    step: 1,
    test: (x, z) => ctx.isShore(x, z) && ctx.reach(x, z) && hyp({ x, z }, s1) >= 14 && hyp({ x, z }, s1) <= 40 && ctx.waterNear(x, z, 8, 18),
    score: (x, z) => hyp({ x, z }, s1)
  }), 'a cabeça de ponte');
  extra.bridgehead = pt(bh);
  extra.bridgeheadSea = { ...ctx.waterNear(bh.x, bh.z, 8, 18), water: true };
  extra.colonyHall = pt(s0); // o Paço do governador: o pátio do slot 0
  extra.landingZone = extra.beach1; // praia da primeira onda (o `landingZone` padrão é só uma sugestão)
}

const POST = freeze({ 'camp-01-baia-de-aurelan': postBaia, 'camp-02-pouso-do-encontro': postPouso, 'camp-03-pedra-mae': postPedra });

// ---------------------------------------------------------------------------------------------------------------------------
// Montagem
// ---------------------------------------------------------------------------------------------------------------------------

/**
 * Gera o mapa de campanha `id` com a semente pedida.
 * @returns {{ ok: boolean, id: string, seed: number, seedUsed?: number, attempts: object[], world?: object, mapDef?: object, extraAnchors?: object, verification?: object, error?: string }}
 */
export function buildCampaignMap(id, { seed = 1, tries = 12 } = {}) {
  const preset = CAMPAIGN_PRESETS[id];
  if (!preset) throw new Error(`campanha: mapa desconhecido "${id}" (${CAMPAIGN_IDS.join(', ')})`);
  const attempts = [];
  for (let k = 0; k < tries; k++) {
    const world = buildCoastWorld(preset, { seed: seed + k, tries: 1, id, name: CAMPAIGN_NAMES[id].pt });
    if (!world.ok) { attempts.push({ seed: seed + k, stage: world.attempts[0]?.stage ?? 'mundo', failures: world.attempts[0]?.failures ?? [] }); continue; }
    try {
      const out = finish(id, world, seed + k);
      return { ok: true, id, seed, seedUsed: seed + k, attempts, world, ...out };
    } catch (e) {
      attempts.push({ seed: seed + k, stage: 'campanha', failures: [e.message] });
    }
  }
  return { ok: false, id, seed, attempts };
}

function finish(id, world, seedUsed) {
  const m = structuredClone(world.mapDef);
  m.id = id;
  m.name = CAMPAIGN_NAMES[id].pt;
  m.hidden = true; // não aparece na lista da Escaramuça
  for (const r of m.resources) if (r.type === 'gold') r.amount = GOLD_AMOUNT;
  const ctx = makeCtx(m);
  const extra = {};
  POST[id](ctx, extra);
  // âncoras: padrão (recalculadas com as jazidas/acampamentos novos) + as da ficha; as escritas à mão prevalecem
  const base = { ...m.anchors };
  delete m.anchors;
  const anchors = { ...defaultAnchors(m), ...extra };
  void base;
  // chave `anchors` logo antes de `meta` (mesma ordem do assador)
  const out = {};
  for (const [k, v] of Object.entries(m)) {
    if (k === 'meta') out.anchors = anchors;
    out[k] = v;
  }
  out.meta = { ...m.meta, campaign: id, seedUsed };
  const verification = verifyCoastWorld(out, { naval: false });
  if (!verification.ok) throw new Error('mundo: ' + verification.failures.slice(0, 2).join(' | '));
  // âncoras de terra alcançáveis a partir do slot 0 por terra; de água, no oceano
  const c2 = makeCtx(out);
  for (const [name, a] of Object.entries(anchors)) {
    if (a.water) { if (!c2.oceanOk(a.x, a.z)) throw new Error(`âncora ${name}: água fora do oceano navegável`); }
    else if (!c2.reach(a.x, a.z) && !/^(well|ford)/.test(name)) throw new Error(`âncora ${name}: sem caminho por terra desde o slot 0`);
  }
  return { mapDef: out, extraAnchors: extra, verification };
}

export { COAST_PRESETS };
