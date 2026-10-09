/**
 * src/editor/mapModel.js (F8-03 · editor de mapas) — modelo puro (sem DOM/three.js): criação, pincéis, itens, histórico e
 * (de)serialização no formato de `src/data/maps/`.
 *
 * O modelo guarda a altura numa grade `Int8Array` (décimos) exatamente como o gerador `painted` a lê; exportar → importar → exportar
 * reproduz o mesmo JSON. Mapas de outros geradores (`continental`/`islands`) são rasterizados na grade ao importar.
 */
import { getHeightForMap } from '../sim/terrainGenerators.js';
import { PAINTED_SCALE, PAINTED_MIN, PAINTED_MAX, paintedNodes, encodeHeights, decodeHeights, toH10 } from '../data/maps/painted.js';

export const LAND_HEIGHT = 2.6;
export const WATER_HEIGHT = -1.2;
export const FORD_HEIGHT = 2.35;
export const DEFAULT_CELL = 2;
export const WATER_LEVEL = 0.5;
export const TERRAIN_TOOLS = Object.freeze(['raise', 'lower', 'flatten', 'smooth', 'land', 'water', 'ford']);
export const ITEM_TOOLS = Object.freeze(['start', 'gold', 'stone', 'oil', 'forest', 'camp', 'critters']);
const LIST_KEYS = Object.freeze(['fords', 'startSlots', 'resources', 'forests', 'neutrals']);
const KNOWN_KEYS = new Set(['id', 'name', 'size', 'playable', 'tileset', 'waterLevel', 'maxPlayers', 'terrain', ...LIST_KEYS]);

const r2 = (v) => Math.round(v * 100) / 100 + 0;
const snap = (v) => Math.round(v * 2) / 2 + 0; // itens ficam em múltiplos de 0,5
const clone = (o) => JSON.parse(JSON.stringify(o));

/** Novo mapa em branco: `fill` = 'water' | 'land'. */
export function createModel({ size = 128, fill = 'land', id = 'meu-mapa', name = 'Meu mapa', tileset = 'verdejante' } = {}) {
  const cell = size % DEFAULT_CELL === 0 ? DEFAULT_CELL : 1;
  const nodes = paintedNodes(size, cell);
  const h = new Int8Array(nodes * nodes).fill(toH10(fill === 'water' ? WATER_HEIGHT : LAND_HEIGHT));
  return {
    id, name, size, playable: size - 16, tileset, waterLevel: WATER_LEVEL, maxPlayers: 2,
    cell, nodes, h, fords: [], startSlots: [], resources: [], forests: [], neutrals: [], extra: {}
  };
}

// ---------------------------------------------------------------------------------------------
// Grade
// ---------------------------------------------------------------------------------------------
export const nodeToWorld = (model, i) => -model.size / 2 + i * model.cell;
export const worldToNode = (model, v) => (v + model.size / 2) / model.cell;

export function heightAtNode(model, i, j) {
  return model.h[j * model.nodes + i] / PAINTED_SCALE;
}

/** Altura (bilinear) em (x, z) — igual ao que o gerador `painted` devolverá depois de exportar. */
export function heightAt(model, x, z) {
  const n = model.nodes;
  const fx = Math.max(0, Math.min(n - 1, worldToNode(model, x)));
  const fz = Math.max(0, Math.min(n - 1, worldToNode(model, z)));
  const i0 = Math.min(n - 2, Math.floor(fx));
  const j0 = Math.min(n - 2, Math.floor(fz));
  const tx = fx - i0;
  const tz = fz - j0;
  const g = (i, j) => model.h[j * n + i];
  const top = g(i0, j0) + (g(i0 + 1, j0) - g(i0, j0)) * tx;
  const bot = g(i0, j0 + 1) + (g(i0 + 1, j0 + 1) - g(i0, j0 + 1)) * tx;
  return (top + (bot - top) * tz) / PAINTED_SCALE;
}

/** Peso do pincel: 1 no centro, 0 na borda (smoothstep). */
export function brushWeight(dist, radius) {
  if (dist >= radius) return 0;
  const t = 1 - dist / radius;
  return t * t * (3 - 2 * t);
}

// ---------------------------------------------------------------------------------------------
// Pincéis de terreno
// ---------------------------------------------------------------------------------------------
/**
 * Aplica um carimbo do pincel em (x, z). `opts`: `radius` (mundo), `strength` (unidades por carimbo, raise/lower), `level`
 * (alvo do flatten). Devolve `true` se algo mudou.
 */
export function applyTerrainBrush(model, tool, x, z, { radius = 6, strength = 0.5, level = 0 } = {}) {
  if (!TERRAIN_TOOLS.includes(tool)) throw new Error(`pincel desconhecido: ${tool}`);
  const n = model.nodes;
  const i0 = Math.max(0, Math.floor(worldToNode(model, x - radius)));
  const i1 = Math.min(n - 1, Math.ceil(worldToNode(model, x + radius)));
  const j0 = Math.max(0, Math.floor(worldToNode(model, z - radius)));
  const j1 = Math.min(n - 1, Math.ceil(worldToNode(model, z + radius)));
  let changed = false;
  const src = tool === 'smooth' ? model.h.slice() : model.h;
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const w = brushWeight(Math.hypot(nodeToWorld(model, i) - x, nodeToWorld(model, j) - z), radius);
      if (w <= 0) continue;
      const k = j * n + i;
      const cur = src[k];
      let next = cur;
      const toward = (target, f) => cur + (target - cur) * Math.min(1, f);
      if (tool === 'raise') next = cur + strength * PAINTED_SCALE * w;
      else if (tool === 'lower') next = cur - strength * PAINTED_SCALE * w;
      else if (tool === 'flatten') next = toward(level * PAINTED_SCALE, w * 1.6);
      else if (tool === 'land') next = toward(LAND_HEIGHT * PAINTED_SCALE, w * 1.6);
      else if (tool === 'water') next = toward(WATER_HEIGHT * PAINTED_SCALE, w * 1.6);
      else if (tool === 'ford') next = toward(FORD_HEIGHT * PAINTED_SCALE, w * 2);
      else {
        // smooth: média dos 4 vizinhos
        const nb = [src[k - (i > 0 ? 1 : 0)], src[k + (i < n - 1 ? 1 : 0)], src[k - (j > 0 ? n : 0)], src[k + (j < n - 1 ? n : 0)]];
        next = toward((nb[0] + nb[1] + nb[2] + nb[3]) / 4, w * 0.8);
      }
      const q = Math.max(PAINTED_MIN * PAINTED_SCALE, Math.min(PAINTED_MAX * PAINTED_SCALE, Math.round(next)));
      if (q !== model.h[k]) {
        model.h[k] = q;
        changed = true;
      }
    }
  }
  if (tool === 'ford') {
    const r = r2(Math.max(model.cell * 1.5, radius * 0.7));
    const fx = snap(x);
    const fz = snap(z);
    if (!model.fords.some((f) => Math.hypot(f.x - fx, f.z - fz) < r * 0.5)) {
      model.fords.push({ x: fx, z: fz, r });
      changed = true;
    }
  }
  return changed;
}

// ---------------------------------------------------------------------------------------------
// Itens
// ---------------------------------------------------------------------------------------------
/** Posiciona um item. `opts` por tipo (ver defaults). Devolve o objeto criado (já dentro do modelo). */
export function placeItem(model, tool, x, z, opts = {}) {
  const px = snap(x);
  const pz = snap(z);
  let item;
  if (tool === 'start') {
    item = { x: px, z: pz };
    model.startSlots.push(item);
    if (model.maxPlayers === model.startSlots.length - 1) model.maxPlayers = model.startSlots.length;
  } else if (tool === 'gold' || tool === 'stone' || tool === 'oil') {
    item = { type: tool, x: px, z: pz };
    if (opts.amount > 0) item.amount = Math.round(opts.amount);
    model.resources.push(item);
  } else if (tool === 'forest') {
    item = { x: px, z: pz, count: Math.max(1, Math.round(opts.count ?? 8)), radius: r2(opts.radius ?? 6), species: opts.species ?? 'pine' };
    model.forests.push(item);
  } else if (tool === 'camp') {
    item = {
      kind: 'camp', x: px, z: pz, guards: Math.max(1, Math.min(8, Math.round(opts.guards ?? 4))),
      reward: { gold: Math.max(0, Math.round(opts.rewardGold ?? 300)) },
      deposit: { type: opts.depositType ?? 'gold', amount: Math.max(1, Math.round(opts.depositAmount ?? 3000)) }
    };
    model.neutrals.push(item);
  } else if (tool === 'critters') {
    item = { kind: 'critters', species: opts.species ?? 'sheep', x: px, z: pz, count: Math.max(1, Math.min(40, Math.round(opts.count ?? 6))), radius: r2(opts.radius ?? 5) };
    model.neutrals.push(item);
  } else throw new Error(`item desconhecido: ${tool}`);
  return item;
}

/** Remove o item mais próximo de (x, z) dentro de `reach` (florestas/critters contam o próprio raio). Devolve `{list,item}` ou `null`. */
export function eraseAt(model, x, z, reach = 3) {
  let best = null;
  for (const list of LIST_KEYS) {
    for (const item of model[list]) {
      const rr = (list === 'forests' || item.kind === 'critters' ? Math.max(reach, item.radius * 0.7) : list === 'fords' ? Math.max(reach, item.r * 0.6) : reach);
      const d = Math.hypot(item.x - x, item.z - z);
      if (d <= rr && (!best || d - rr < best.score)) best = { list, item, score: d - rr };
    }
  }
  if (!best) return null;
  const arr = model[best.list];
  arr.splice(arr.indexOf(best.item), 1);
  if (best.list === 'startSlots' && model.maxPlayers > model.startSlots.length) model.maxPlayers = model.startSlots.length;
  return { list: best.list, item: best.item };
}

// ---------------------------------------------------------------------------------------------
// Serialização
// ---------------------------------------------------------------------------------------------
/** Modelo → JSON do mapa (objeto simples, no formato de `src/data/maps/`). */
export function exportMap(model) {
  const out = {
    id: model.id,
    name: model.name,
    size: model.size,
    playable: model.playable,
    tileset: model.tileset,
    waterLevel: model.waterLevel,
    maxPlayers: model.maxPlayers,
    terrain: { generator: 'painted', params: { cell: model.cell, nodes: model.nodes, data: encodeHeights(model.h) } },
    fords: clone(model.fords),
    startSlots: clone(model.startSlots),
    resources: clone(model.resources),
    forests: clone(model.forests),
    neutrals: clone(model.neutrals)
  };
  return Object.assign(out, clone(model.extra));
}

export function exportJson(model) {
  return JSON.stringify(exportMap(model), null, 2) + '\n';
}

/** JSON do mapa (objeto ou texto) → modelo. Lança `Error` se o formato for inválido. */
export function importMap(input) {
  const def = typeof input === 'string' ? JSON.parse(input) : input;
  if (!def || typeof def !== 'object' || typeof def.size !== 'number' || !def.terrain?.generator) throw new Error('mapa inválido: faltam size/terrain');
  if (!(def.size >= 8 && def.size <= 1024)) throw new Error('mapa inválido: size fora da faixa');
  let cell;
  let nodes;
  let h;
  if (def.terrain.generator === 'painted') {
    ({ cell, nodes } = def.terrain.params);
    h = decodeHeights(def.terrain.params.data);
    if (nodes !== paintedNodes(def.size, cell) || h.length !== nodes * nodes) throw new Error('mapa inválido: grade pintada inconsistente');
  } else {
    // rasteriza o gerador paramétrico na grade (perde só o que é menor que uma célula)
    cell = def.size % DEFAULT_CELL === 0 ? DEFAULT_CELL : 1;
    nodes = paintedNodes(def.size, cell);
    h = new Int8Array(nodes * nodes);
    for (let j = 0; j < nodes; j++) {
      for (let i = 0; i < nodes; i++) h[j * nodes + i] = toH10(getHeightForMap(def, -def.size / 2 + i * cell, -def.size / 2 + j * cell));
    }
  }
  const model = {
    id: def.id ?? 'meu-mapa', name: def.name ?? 'Meu mapa', size: def.size, playable: def.playable ?? def.size,
    tileset: def.tileset ?? 'verdejante', waterLevel: def.waterLevel ?? WATER_LEVEL, maxPlayers: def.maxPlayers ?? (def.startSlots?.length || 2),
    cell, nodes, h, extra: {}
  };
  for (const k of LIST_KEYS) model[k] = Array.isArray(def[k]) ? clone(def[k]) : [];
  for (const k of Object.keys(def)) if (!KNOWN_KEYS.has(k)) model.extra[k] = clone(def[k]);
  if (def.terrain.generator !== 'painted') delete model.extra.generated; // deixa de ser "gerado" ao ser editado
  return model;
}

/** Para editar um mapa do jogo: importa e troca o id por `<id>-editado` (o original continua registrado). */
export function importForEditing(def) {
  const model = importMap(def);
  model.id = `${model.id}-editado`.slice(0, 48);
  model.name = `${model.name} (editado)`;
  delete model.extra.hidden;
  return model;
}

// ---------------------------------------------------------------------------------------------
// Histórico (desfazer/refazer) por instantâneos
// ---------------------------------------------------------------------------------------------
export function snapshotOf(model) {
  const { h, ...rest } = model;
  return { h: h.slice(), rest: clone(rest) };
}

export function restoreSnapshot(model, snapshot) {
  const rest = clone(snapshot.rest);
  for (const k of Object.keys(model)) if (k !== 'h') delete model[k];
  Object.assign(model, rest);
  model.h = snapshot.h.slice();
}

export class History {
  constructor(model, limit = 100) {
    this.limit = limit;
    this.stack = [snapshotOf(model)];
    this.index = 0;
  }

  /** Registra o estado atual do modelo (chame ao fim de cada pincelada/colocação). Descarta o "refazer". */
  commit(model) {
    this.stack.length = this.index + 1;
    this.stack.push(snapshotOf(model));
    if (this.stack.length > this.limit) this.stack.shift();
    this.index = this.stack.length - 1;
  }

  get canUndo() { return this.index > 0; }
  get canRedo() { return this.index < this.stack.length - 1; }

  undo(model) {
    if (!this.canUndo) return false;
    restoreSnapshot(model, this.stack[--this.index]);
    return true;
  }

  redo(model) {
    if (!this.canRedo) return false;
    restoreSnapshot(model, this.stack[++this.index]);
    return true;
  }
}
