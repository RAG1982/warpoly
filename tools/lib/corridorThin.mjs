/**
 * tools/lib/corridorThin.mjs (B-arvores-corredor · "afinar corredor")
 *
 * Etapa determinística da receita dos mapas: reduz as árvores no CORREDOR entre a base do jogador (slot 0) e as demais bases /
 * acampamentos neutros, para devolver visibilidade ao caminho de ataque. As árvores nascem em tempo de jogo de `mapDef.forests`
 * (`GameManager.spawnWoodlands`), então "tirar árvores" = baixar o `count` dos bosques cujo centro cai no corredor; a ORDEM e a
 * POSIÇÃO dos bosques não mudam (âncoras `forestN` e a ordem de consumo do `rngMap` seguem válidas).
 *
 * Regras:
 *  - corredor = faixa de largura `width` (u) em volta de cada segmento slot0→(outros slots e acampamentos `neutrals.kind==='camp'`);
 *    um bosque entra se a distância do centro ao segmento ≤ width/2 + radius·`reachFactor`;
 *  - ficam de fora os bosques de coleta de madeira: centro a menos de `keepRadius` (30 u) de qualquer base, ou a ≤ `lumberRadius`
 *    (14 u) da serraria do layout da base;
 *  - nos bosques do corredor sobra `keepFrac` (≈ 1/3) das árvores, distribuídas com pesos sorteados (RNG determinístico, `mulberry32` com
 *    semente derivada de `seed`+label): uns bosquetes ficam mais cheios (cobertura), outros quase vazios — sem buraco regular;
 *  - garantia de madeira: se `woodFn(forests)` (madeira estimada por base) ficar abaixo de `woodMin`, devolve árvores aos bosques afinados
 *    mais próximos da base deficitária (e só deles) até a meta voltar.
 * Puro (sem DOM, sem Math.random).
 */
import { mulberry32 } from '../../src/sim/rng.js';
import { layoutAt } from '../../src/sim/MatchConfig.js';

export const CORRIDOR_DEFAULTS = Object.freeze({
  width: 44, // largura da faixa (u); o pedido original falava em ~28, mas com 28 só ~15 % das árvores caem na faixa e a visão continua bloqueada pelos lados
  keepFrac: 1 / 3, // fração das árvores do corredor que permanece (remove ≈ 2/3)
  keepRadius: 30, // bosques a menos disto de uma base são "floresta de coleta": ficam na zona branda (`softFrac`)
  softFrac: 0.45, // fração que permanece nos bosques da zona branda (perto da base, fora do bosque da serraria)
  lumberRadius: 14, // bosques a ≤ isto da serraria do layout (a floresta de coleta de cada base): INTOCADOS
  reachFactor: 0.6, // quanto do raio do bosque conta para ele "estar" no corredor
  restoreStep: 2, // árvores devolvidas por passo da garantia de madeira
  minKeep: 2, // todo bosque afinado mantém ao menos isto
  woodMargin: 1.05 // folga de madeira exigida (igual a WOOD_VERIFY_MARGIN)
});

/** Distância do ponto p ao segmento a→b. */
export function distToSegment(p, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const l2 = dx * dx + dz * dz;
  const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / l2)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.z - (a.z + t * dz));
}

/** Segmentos do corredor: slot 0 → cada outro slot e cada acampamento neutro. */
export function corridorSegments(mapDef) {
  const s0 = mapDef.startSlots[0];
  const segs = [];
  mapDef.startSlots.slice(1).forEach((s) => segs.push({ a: s0, b: s }));
  for (const n of mapDef.neutrals ?? []) if (n.kind === 'camp') segs.push({ a: s0, b: n });
  return segs;
}

/** Posição de mundo da serraria de cada slot (layout do slot ou o padrão, espelhado como no jogo). */
function lumberSpots(mapDef) {
  const out = [];
  for (const s of mapDef.startSlots) for (const b of layoutAt(s).buildings) if (b.role === 'lumber') out.push({ x: b.x, z: b.z });
  return out;
}

/**
 * @param {object} mapDef
 * @param {object} [opts]  { seed, label, woodFn(forests)=>number[], woodMin, ...CORRIDOR_DEFAULTS }
 * @returns {{ forests: object[], thinned: number[], before: number, after: number }}  `forests` novo (o mapDef não é alterado)
 */
export function thinCorridor(mapDef, opts = {}) {
  const o = { ...CORRIDOR_DEFAULTS, ...opts };
  const orig = mapDef.forests;
  const forests = orig.map((f) => ({ ...f }));
  const segs = corridorSegments(mapDef);
  const lumbers = lumberSpots(mapDef);
  const inCorridor = [], soft = [];
  orig.forEach((f, i) => {
    if (lumbers.some((l) => Math.hypot(f.x - l.x, f.z - l.z) <= o.lumberRadius)) return;
    const lim = o.width / 2 + f.radius * o.reachFactor;
    if (!segs.some((sg) => distToSegment(f, sg.a, sg.b) <= lim)) return;
    if (mapDef.startSlots.some((s) => Math.hypot(f.x - s.x, f.z - s.z) < o.keepRadius)) soft.push(i);
    else inCorridor.push(i);
  });
  const before = orig.reduce((n, f) => n + f.count, 0);
  if (!inCorridor.length && !soft.length) return { forests, thinned: [], before, after: before };

  // pesos sorteados (RNG determinístico): bosquetes de cobertura (peso alto) e clareiras quase vazias (peso baixo)
  const rng = mulberry32(opts.seed ?? 1).fork(`corredor:${opts.label ?? mapDef.id}`);
  const w = inCorridor.map(() => { const r = rng.next(); return r < 0.4 ? 1.8 + rng.next() * 1.2 : 0.1 + rng.next() * 0.5; });
  const totalIn = inCorridor.reduce((n, i) => n + orig[i].count, 0);
  const keepTotal = totalIn * o.keepFrac;
  const sw = w.reduce((a, b) => a + b, 0);
  let carry = 0;
  inCorridor.forEach((i, k) => {
    const want = (keepTotal * w[k]) / sw + carry;
    const c = Math.max(o.minKeep, Math.min(orig[i].count, Math.round(want)));
    carry = want - c;
    forests[i].count = c;
  });

  for (const i of soft) { forests[i].count = Math.max(o.minKeep, Math.round(orig[i].count * o.softFrac)); inCorridor.push(i); }

  // garantia de madeira: devolve árvores aos bosques afinados mais perto da base deficitária
  if (opts.woodFn && opts.woodMin) {
    const need = opts.woodMin * o.woodMargin;
    const thinnedSet = new Set(inCorridor);
    for (let guard = 0; guard < inCorridor.length * 6 + 2; guard++) {
      const woods = opts.woodFn(forests);
      const bad = woods.findIndex((x) => x < need);
      if (bad < 0) break;
      const s = mapDef.startSlots[bad];
      let best = -1, bd = Infinity;
      for (const i of thinnedSet) {
        if (forests[i].count >= orig[i].count) continue;
        const d = Math.hypot(orig[i].x - s.x, orig[i].z - s.z);
        if (d < bd) { bd = d; best = i; }
      }
      if (best < 0 || bd > 70) break;
      forests[best].count = Math.min(orig[best].count, forests[best].count + o.restoreStep); // devolve aos poucos (menos árvores de volta que um bosque inteiro)
      if (forests[best].count >= orig[best].count) thinnedSet.delete(best);
    }
  }
  const thinned = inCorridor.filter((i) => forests[i].count < orig[i].count);
  return { forests, thinned, before, after: forests.reduce((n, f) => n + f.count, 0) };
}

/**
 * Estimador de madeira por base para o `woodFn` (mesmas regras de `verifyCoastWorld`: pior de 5 sorteios, árvores a ≤ 60 u e alcançáveis).
 * `deps` = { buildPathfinder, floodFill, isReached, estimateWood } (injetados para este arquivo não importar o gerador de costas).
 */
export function makeWoodFn(mapDef, deps, seeds = [1, 2, 3, 4, 5]) {
  const { buildPathfinder, floodFill, isReached, estimateWood } = deps;
  const land = buildPathfinder(mapDef, 'land');
  const seen = mapDef.startSlots.map((s) => floodFill(land, s.x, s.z));
  const reach = mapDef.startSlots.map((_, i) => (x, z) => isReached(land, seen[i], x, z));
  const hAt = (x, z) => land.terrain.getHeight(x, z);
  return (forests) => {
    const m = { ...mapDef, forests };
    const woods = mapDef.startSlots.map(() => Infinity);
    for (const sd of seeds) estimateWood(m, sd, hAt, reach).forEach((w, i) => { woods[i] = Math.min(woods[i], w); });
    return woods;
  };
}
