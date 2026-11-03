/**
 * src/editor/gridCheck.js (M2-09) — avisos do editor sobre a lava (MUNDO-TERRENO-MAPAS §3.5, "Editor"), além do `validateMapDef`:
 * células de lava isoladas, bosque sobre lava (erro), lava que separa as bases sem passagem e passagem de rocha mais estreita
 * que 6 u. Puro (sem DOM/three.js); devolve itens `{ level, code, params }` no formato do validador, para a mesma lista de avisos.
 */
import { layerAt, worldToNode, nodeToWorld } from './mapModel.js';

const WALK_MIN = 0.68; // altura mínima caminhável do Pathfinder
export const LAVA_ISOLATED_MAX = 6; // componente de lava com menos células que isto é "isolado"
export const PASSAGE_MIN_WIDTH = 4.5; // unidades de mundo (aviso do editor, MUNDO-TERRENO-MAPAS §3.5; o jogo recomenda ≥ 6 u)

const NB4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const NB8 = [...NB4, [1, 1], [1, -1], [-1, 1], [-1, -1]];

/** Grade `nodes × nodes` (a do terreno) com lava (1) amostrada da camada `lava`, que pode ter outra resolução. */
function lavaOnTerrain(model) {
  const n = model.nodes;
  const out = new Uint8Array(n * n);
  if (!model.lava) return out;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) out[j * n + i] = layerAt(model, model.lava, nodeToWorld(model, i), nodeToWorld(model, j)) === 1 ? 1 : 0;
  }
  return out;
}

/** Componentes 8-conexos de lava na grade da própria camada: devolve os tamanhos (nº de células). */
export function lavaComponentSizes(model) {
  const l = model.lava;
  if (!l) return [];
  const n = l.nodes;
  const seen = new Uint8Array(n * n);
  const sizes = [];
  for (let start = 0; start < n * n; start++) {
    if (l.data[start] !== 1 || seen[start]) continue;
    let count = 0;
    const stack = [start];
    seen[start] = 1;
    while (stack.length) {
      const k = stack.pop();
      count++;
      const i = k % n;
      const j = (k - i) / n;
      for (const [di, dj] of NB8) {
        const a = i + di;
        const b = j + dj;
        if (a < 0 || b < 0 || a >= n || b >= n) continue;
        const nk = b * n + a;
        if (l.data[nk] === 1 && !seen[nk]) { seen[nk] = 1; stack.push(nk); }
      }
    }
    sizes.push(count);
  }
  return sizes;
}

/** Nós alcançáveis (4-conexos) a partir de `from`, andando só onde `walk[k]` é 1 (o nó inicial sempre vale). */
function reach(walk, n, from) {
  const seen = new Uint8Array(n * n);
  const stack = [from];
  seen[from] = 1;
  while (stack.length) {
    const k = stack.pop();
    const i = k % n;
    const j = (k - i) / n;
    for (const [di, dj] of NB4) {
      const a = i + di;
      const b = j + dj;
      if (a < 0 || b < 0 || a >= n || b >= n) continue;
      const nk = b * n + a;
      if (!seen[nk] && walk[nk]) { seen[nk] = 1; stack.push(nk); }
    }
  }
  return seen;
}

/** Avisos/erros de lava do modelo. Sem lava no mapa, devolve `[]`. */
export function analyzeLava(model) {
  if (!model.lava || !model.lava.data.includes(1)) return [];
  const issues = [];
  const n = model.nodes;
  const lava = lavaOnTerrain(model);

  const isolated = lavaComponentSizes(model).filter((s) => s < LAVA_ISOLATED_MAX).length;
  if (isolated > 0) issues.push({ level: 'warning', code: 'lavaIsolated', params: { n: isolated, min: LAVA_ISOLATED_MAX } });

  model.forests.forEach((f, i) => {
    if (layerAt(model, model.lava, f.x, f.z) === 1) issues.push({ level: 'error', code: 'lavaForest', params: { n: i + 1 } });
  });

  const slots = model.startSlots;
  if (slots.length < 2) return issues;
  const clampNode = (v) => Math.max(0, Math.min(n - 1, Math.round(worldToNode(model, v))));
  const nodeOf = (p) => clampNode(p.z) * n + clampNode(p.x);
  const open = new Uint8Array(n * n); // com a lava tratada como chão
  const closed = new Uint8Array(n * n); // o que o jogo realmente deixa andar
  for (let k = 0; k < n * n; k++) {
    const dry = model.h[k] / 10 >= WALK_MIN;
    open[k] = dry || lava[k] ? 1 : 0;
    closed[k] = dry && !lava[k] ? 1 : 0;
  }
  const start = nodeOf(slots[0]);
  const rOpen = reach(open, n, start);
  const rClosed = reach(closed, n, start);
  const lost = [];
  slots.forEach((s, i) => { if (i > 0 && rOpen[nodeOf(s)] && !rClosed[nodeOf(s)]) lost.push(i + 1); });
  if (lost.length) {
    issues.push({ level: 'warning', code: 'lavaNoPassage', params: { slots: lost.join(', ') } });
    return issues;
  }

  // largura: tira do chão tudo a menos de PASSAGE_MIN_WIDTH/2 de lava e vê se alguma base ligada por terra perde a ligação
  const rr = PASSAGE_MIN_WIDTH / 2 / model.cell;
  const r = Math.ceil(rr);
  const eroded = closed.slice();
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      if (!lava[j * n + i]) continue;
      for (let dj = -r; dj <= r; dj++) {
        for (let di = -r; di <= r; di++) {
          const a = i + di;
          const b = j + dj;
          if (a >= 0 && b >= 0 && a < n && b < n && di * di + dj * dj <= rr * rr) eroded[b * n + a] = 0;
        }
      }
    }
  }
  const rEroded = reach(eroded, n, start);
  const narrow = [];
  slots.forEach((s, i) => { if (i > 0 && rClosed[nodeOf(s)] && !rEroded[nodeOf(s)]) narrow.push(i + 1); });
  if (narrow.length) issues.push({ level: 'warning', code: 'passageNarrow', params: { slots: narrow.join(', '), w: PASSAGE_MIN_WIDTH } });
  return issues;
}
