/**
 * tools/lib/farOil.mjs (OIL-FAR · poços de petróleo longe da costa)
 *
 * Os poços dos mapas navais nasciam colados à costa da base (<= 75 u em linha reta, ~10 u de água da praia): o petroleiro explorava sem
 * risco. Aqui, uma etapa da receita (depois do pós-processamento do mapa, antes das âncoras) reposiciona poços escolhidos para que a
 * DISTÂNCIA REAL DE NAVEGAÇÃO (Dijkstra na grade naval do Pathfinder, com folga de 1 célula em volta) a partir da "doca" do jogador
 * (o ponto de água do Estaleiro, ou a água do oceano mais perto do Paço) fique na faixa pedida. Mesma quantidade, mesmo `amount`, mesma
 * ordem em `m.resources` (as âncoras `well1..n` seguem os mesmos índices), sempre em água funda ligada ao oceano.
 * Puro (Node, sem `Math.random`).
 */

const hyp = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const r1 = (v) => Math.round(v * 10) / 10;

/** Dijkstra 8-vizinhos na grade naval a partir de (x, z): distância em u por célula (`Infinity` = inalcançável). */
export function navDist(sea, x, z) {
  const { cols, rows, staticGrid: G, cellSize: cs } = sea;
  const N = cols * rows;
  // passável = o mesmo que o Pathfinder naval do jogo (grade estática; a folga "larga" é só preferência e cai para a grade normal)
  const clear = G;
  const dist = new Float64Array(N).fill(Infinity);
  // só vale o maior componente de água "livre" (o oceano): a doca encosta na costa e pode cair numa poça sem saída
  const comp = new Int32Array(N).fill(-1);
  let bestComp = -1, bestSize = 0, nComp = 0;
  for (let s0 = 0; s0 < N; s0++) {
    if (!clear[s0] || comp[s0] >= 0) continue;
    const st = [s0]; comp[s0] = nComp; let size = 0;
    while (st.length) {
      const i = st.pop(); size++;
      for (const j of [i - 1, i + 1, i - cols, i + cols]) if (j >= 0 && j < N && clear[j] && comp[j] < 0) { comp[j] = nComp; st.push(j); }
    }
    if (size > bestSize) { bestSize = size; bestComp = nComp; }
    nComp++;
  }
  let start = -1, bd = Infinity;
  for (let i = 0; i < N; i++) if (comp[i] === bestComp) { const w = sea.toWorld(i % cols, (i / cols) | 0); const d = Math.hypot(w.x - x, w.z - z); if (d < bd) { bd = d; start = i; } }
  if (start < 0) return { dist, clear, at: () => Infinity };
  // heap binário simples
  const heap = [[0, start]];
  dist[start] = 0;
  const push = (item) => { heap.push(item); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
  const D = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
  while (heap.length) {
    const [d, i] = pop();
    if (d > dist[i]) continue;
    const c = i % cols, r = (i / cols) | 0;
    for (const [dc, dr, w] of D) {
      const cc = c + dc, rr = r + dr;
      if (cc < 0 || rr < 0 || cc >= cols || rr >= rows) continue;
      const j = rr * cols + cc;
      if (!clear[j]) continue;
      if (dc !== 0 && dr !== 0 && (!clear[r * cols + cc] || !clear[rr * cols + c])) continue; // sem cortar quina
      const nd = d + w * cs;
      if (nd < dist[j]) { dist[j] = nd; push([nd, j]); }
    }
  }
  return { dist, clear, at: (px, pz) => { const g = sea.toGrid(px, pz); return dist[g.r * cols + g.c]; } };
}

/** "Doca" de um jogador: o ponto de água navegável do oceano mais perto do Paço (ou o dado). */
export function dockOf(ctx, slot, given = null, ref = null) {
  if (given) return { x: given.x, z: given.z };
  const { sea, m, hAt } = ctx;
  // `ref` ({x, z, maxNav}): só vale água a <= maxNav u de navegação do ponto de referência (ex.: o mar central), mesmo que o mar externo esteja mais perto do Paço
  let seen = null;
  if (ref) { let rb = null, rd = Infinity; for (let r = 0; r < sea.rows; r++) for (let c = 0; c < sea.cols; c++) { const w = sea.toWorld(c, r); if (!ctx.oceanOk(w.x, w.z)) continue; const d = hyp(w, ref); if (d < rd) { rd = d; rb = w; } } const nf = navDist(sea, rb.x, rb.z); seen = new Uint8Array(sea.numCells); for (let i = 0; i < seen.length; i++) if (nf.dist[i] <= (ref.maxNav ?? 150)) seen[i] = 1; }
  let best = null, bd = Infinity;
  for (let r = 0; r < sea.rows; r++) for (let c = 0; c < sea.cols; c++) {
    const w = sea.toWorld(c, r);
    if (!ctx.oceanOk(w.x, w.z) || hAt(w.x, w.z) > 0.05) continue;
    if (seen && !seen[r * sea.cols + c]) continue;
    const d = hyp(w, slot);
    if (d < bd) { bd = d; best = w; }
  }
  void m;
  return best;
}

/** Água funda (sem terra a <= 8 u) ligada ao oceano. */
export function deepSeaOk(ctx, x, z, r = 8) {
  if (!ctx.oceanOk(x, z) || ctx.hAt(x, z) > 0.05) return false;
  for (let a = 0; a < 12; a++) {
    const t = (a / 12) * Math.PI * 2;
    if (ctx.hAt(x + Math.cos(t) * r, z + Math.sin(t) * r) >= 0.1 || ctx.hAt(x + Math.cos(t) * r * 0.5, z + Math.sin(t) * r * 0.5) >= 0.1) return false;
  }
  return true;
}

/**
 * Reposiciona poços. `spec.docks`: pontos de água por jogador (índice = slot). `spec.moves`: lista de
 * `{ index, player, min, max, target, ... }` — o `index`-ésimo poço de `m.resources` vai para o ponto de água funda com
 * distância de navegação desde a doca do `player` em [min, max] (o mais perto de `target`), e opcionalmente
 * `awayFrom` (outro jogador: distância de navegação dele >= `awayMin`) / `nearEnemy` (preferir perto da doca do outro).
 * `spec.minGap`: distância mínima entre poços (padrão 16).
 */
export function relocateWells(ctx, docks, moves, { minGap = 16, step = 1, edge = 14 } = {}) {
  const { m, sea, half } = ctx;
  const oil = m.resources.filter((r) => r.type === 'oil');
  const fields = docks.map((d) => (d ? navDist(sea, d.x, d.z) : null));
  const report = [];
  for (const mv of moves) {
    const well = oil[mv.index];
    if (!well) throw new Error(`petróleo: poço ${mv.index} não existe`);
    const others = oil.filter((o) => o !== well);
    const f = fields[mv.player];
    let best = null, bs = Infinity;
    for (let z = -half + 6; z <= half - 6; z += step) {
      for (let x = -half + 6; x <= half - 6; x += step) {
        const eg = mv.edge ?? edge; if (Math.abs(x) > half - eg || Math.abs(z) > half - eg) continue;
        const d = f.at(x, z);
        if (!(d >= mv.min && d <= mv.max)) continue;
        if (!deepSeaOk(ctx, x, z, mv.clearR ?? 8)) continue;
        if (!others.every((o) => hyp({ x, z }, o) >= minGap)) continue;
        if (mv.avoid && mv.avoid.some((a) => hyp({ x, z }, a) < (a.r ?? 25))) continue; // não bloquear praia de desembarque/reforço da missão
        if (mv.awayFrom !== undefined && !(fields[mv.awayFrom].at(x, z) >= mv.awayMin)) continue;
        let s = Math.abs(d - mv.target);
        if (mv.safe) { let mn = Infinity; fields.forEach((ff, q) => { if (q !== mv.player && ff) mn = Math.min(mn, ff.at(x, z)); }); s -= 0.3 * Math.min(mn, 300); } // seguro-ish: longe das docas dos outros
        if (mv.lean !== undefined) { const e = fields[mv.lean].at(x, z); s += 0.3 * (Number.isFinite(e) ? e : 1000); } // exposição: prefere o lado do inimigo
        if (s < bs) { bs = s; best = { x, z, d }; }
      }
    }
    if (!best) throw new Error(`petróleo: não achei lugar para o poço ${mv.index} (jogador ${mv.player}, ${mv.min}–${mv.max} u)`);
    well.x = r1(best.x); well.z = r1(best.z);
    report.push({ index: mv.index, x: well.x, z: well.z, nav: Math.round(best.d) });
  }
  return report;
}

/** Receitas por mapa: `(ctx, extra) => { docks, moves }` (ver `relocateWells`). Doca = água do Estaleiro (âncora) ou a água do oceano mais perto do Paço. */
const dockPair = (ctx, extra, ref = null) => ctx.m.startSlots.map((s, i) => dockOf(ctx, s, extra[`shipyard${i + 1}Water`] ?? null, ref));
export const FAR_OIL = {
  /** Baixio do Breu (palco 4): o poço seguro-ish a ~30 u de navegação da doca e o outro longe (>= 56 u) pendendo para o lado inimigo; os 2 poços do meio ficam. */
  'camp-04-baixio-do-breu': (ctx, extra) => ({
    docks: dockPair(ctx, extra),
    moves: [
      { index: 0, player: 0, min: 27, max: 33, target: 30 }, { index: 1, player: 0, min: 56, max: 100, target: 66, lean: 1 },
      { index: 2, player: 1, min: 27, max: 33, target: 30 }, { index: 3, player: 1, min: 56, max: 100, target: 66, lean: 0 }
    ]
  }),
  /** Fornalha (palco 8): os poços da Liga (índices 0 = seguro-ish e 1 = longe); os do lado dos Clãs (baía leste) ficam. */
  'camp-08-fornalha': (ctx, extra) => ({
    docks: dockPair(ctx, extra),
    moves: [{ index: 0, player: 0, min: 27, max: 33, target: 30 }, { index: 1, player: 0, min: 60, max: 100, target: 68, lean: 1 }]
  }),
  /** Estreito de Vaeloria (Escaramuça 1x1 naval): o istmo parte o mar em norte (jogador 1) e sul (jogador 0), ligados só pela volta de ~440 u; cada jogador
   *  tem no seu mar 1 poço seguro-ish (~30 u) e 1 longe (~60 u), além do poço disputado (~80 u) que já havia (índices 4 e 5, ficam). */
  'estreito-naval-1v1': (ctx) => ({
    docks: dockPair(ctx, {}),
    moves: [
      { index: 0, player: 0, min: 27, max: 36, target: 30, clearR: 4, safe: true }, { index: 1, player: 0, min: 50, max: 80, target: 60, lean: 1 },
      { index: 2, player: 1, min: 27, max: 36, target: 30, clearR: 4, safe: true }, { index: 3, player: 1, min: 50, max: 80, target: 60, lean: 0 }
    ]
  }),
  /** Arquipélago (Escaramuça FFA naval de 4): as 4 docas ficam no mar central (a do jogador 3 estaria no mar externo, a ~450 u dos demais); por jogador 1 poço seguro-ish (~30 u) e 1 longe (~58 u); os 4 poços disputados do centro (índices 8–11) ficam. */
  'arquipelago-pontes-4p': (ctx) => ({
    // docks[4] = a doca do jogador 3 no mar externo (leste), a ~450 u dos demais por mar: o poço seguro-ish dele fica lá; o longe, no mar central
    docks: [...dockPair(ctx, {}, { x: -20, z: 20, maxNav: 130 }), dockOf(ctx, ctx.m.startSlots[3])],
    moves: [0, 1, 2, 3].flatMap((p) => [
      { index: p * 2, player: p === 3 ? 4 : p, min: p === 3 ? 18 : 27, max: p === 3 ? 60 : 36, target: 30, clearR: p === 3 ? 3 : 4, edge: p === 3 ? 7 : undefined, safe: true },
      { index: p * 2 + 1, player: p, min: 50, max: 85, target: 58, clearR: 6, lean: (p + 1) % 4, awayFrom: (p + 1) % 4, awayMin: 45 }
    ])
  }),
  /** Costa Ferrugem (palco 10): o poço do meio do canal (índice 4, wellMid1, ~26 u da doca) fica como seguro-ish e o contestado (5, ~115 u) também; os dois da
   *  costa oeste (0 e 1, atrás do Paço) vão para mar aberto rumo ao inimigo. A doca é a água do Estaleiro (shipyard1Water). */
  'camp-10-costa-ferrugem': (ctx, extra) => ({
    docks: dockPair(ctx, extra),
    moves: [{ index: 0, player: 0, min: 55, max: 100, target: 66, lean: 1 }, { index: 1, player: 0, min: 80, max: 140, target: 95, lean: 1 }]
  }),
  /** Estepe do Vento (palco 11): poços da Liga (0 = seguro-ish, 1 = longe); os dos Clãs e do aliado ficam. */
  'camp-11-estepe-do-vento': (ctx, extra) => ({
    docks: dockPair(ctx, extra),
    moves: [{ index: 0, player: 0, min: 27, max: 36, target: 30, avoid: [{ ...extra.reinforceSea, r: 42 }, { ...extra.landingZone, r: 42 }] }, { index: 1, player: 0, min: 60, max: 100, target: 68, lean: 1 }]
  }),
  /** Cabo Ferrugem (palco 12): poços da Liga 0 (seguro-ish) e 1 (longe); os de 5.000 (4 e 5, ~56–63 u, perto do estreito) e os do inimigo ficam. */
  'camp-12-cabo-ferrugem': (ctx, extra) => ({
    docks: dockPair(ctx, extra),
    moves: [{ index: 0, player: 0, min: 27, max: 36, target: 30, clearR: 5, avoid: [{ ...extra.reinforceSea, r: 22 }, { ...extra.landingZone, r: 22 }] }, { index: 1, player: 0, min: 60, max: 100, target: 68, lean: 1 }]
  }),
  /** Miragem (palco 9): idem (poços da Liga: índices 0 e 1). */
  'camp-09-miragem': (ctx, extra) => ({
    docks: dockPair(ctx, extra),
    moves: [{ index: 0, player: 0, min: 27, max: 33, target: 30 }, { index: 1, player: 0, min: 60, max: 100, target: 68, lean: 1 }]
  })
};

/** Aplica a receita `FAR_OIL[id]` (se houver) em `ctx.m`; devolve o relatório (índice, posição, distância de navegação). */
export function applyFarOil(id, ctx, extra) {
  const f = FAR_OIL[id];
  if (!f) return null;
  const { docks, moves } = f(ctx, extra);
  return relocateWells(ctx, docks, moves);
}
