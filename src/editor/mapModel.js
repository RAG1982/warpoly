/**
 * src/editor/mapModel.js (F8-03 · editor de mapas) — modelo puro (sem DOM/three.js): criação, pincéis, itens, histórico e
 * (de)serialização no formato de `src/data/maps/`.
 *
 * O modelo guarda a altura numa grade `Int8Array` (décimos) exatamente como o gerador `painted` a lê; exportar → importar → exportar
 * reproduz o mesmo JSON. Mapas de outros geradores (`continental`/`islands`) são rasterizados na grade ao importar.
 */
import { getHeightForMap } from '../sim/terrainGenerators.js';
import { PAINTED_SCALE, PAINTED_MIN, PAINTED_MAX, paintedNodes, encodeHeights, decodeHeights, toH10 } from '../data/maps/painted.js';
import { encodeLavaGrid, decodeLavaGrid } from '../data/maps/lava.js';
import { BIOME, MAX_BIOME_ID, encodeBiomeGrid, encodeRleBiomeGrid, decodeBiomeGrid } from '../data/maps/biome.js';
import { buildCoastWorld, getCoastPreset } from '../data/maps/coast/index.js';

export const LAND_HEIGHT = 2.6;
export const WATER_HEIGHT = -1.2;
export const FORD_HEIGHT = 2.35;
export const DEFAULT_CELL = 2;
export const WATER_LEVEL = 0.5;
export const LAVA_HEIGHT = 0.4; // altura do leito de lava (a mesma do assador `coast/surface.js`)
export const PASSAGE_MIN_HEIGHT = 1.05; // passagem de rocha resfriada: caminhável (o Pathfinder pede h >= 0,68)
export const TERRAIN_TOOLS = Object.freeze(['raise', 'lower', 'flatten', 'smooth', 'land', 'water', 'ford', 'lava', 'passage']);
/** Ferramentas de bioma (M2-09): `biome` pinta um disco; `biomeFill` preenche a região contígua do mesmo bioma. */
export const BIOME_TOOLS = Object.freeze(['biome', 'biomeFill']);
export const ITEM_TOOLS = Object.freeze(['start', 'gold', 'stone', 'oil', 'forest', 'camp', 'critters']);
const LIST_KEYS = Object.freeze(['fords', 'startSlots', 'resources', 'forests', 'neutrals']);
const KNOWN_KEYS = new Set(['id', 'name', 'size', 'playable', 'tileset', 'waterLevel', 'maxPlayers', 'terrain', 'lavaGrid', 'biomeGrid', ...LIST_KEYS]);
const LAYER_KEYS = Object.freeze({ lava: 'lavaGrid', biome: 'biomeGrid' });

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
    cell, nodes, h, lava: null, biome: null, fords: [], startSlots: [], resources: [], forests: [], neutrals: [], extra: {}
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
      else if (tool === 'lava') next = toward(LAVA_HEIGHT * PAINTED_SCALE, w * 1.6);
      else if (tool === 'passage') next = Math.max(cur, toward(PASSAGE_MIN_HEIGHT * PAINTED_SCALE, w * 2));
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
  if (tool === 'lava' || tool === 'passage') {
    if (tool === 'lava' && !model.lava) model.lava = newLayer(model);
    if (model.lava && stampLayer(model, model.lava, x, z, radius, tool === 'lava' ? 1 : 0)) changed = true;
    if (model.biome && stampLayer(model, model.biome, x, z, radius, tool === 'lava' ? BIOME.LAVA : BIOME.ROCK, tool === 'passage' ? (v) => v === BIOME.LAVA : null)) changed = true;
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
// Camadas de lava e de bioma (M2-09): grades Uint8 com `cell`/`nodes` próprios (como `lavaGrid`/`biomeGrid` do mapa)
// ---------------------------------------------------------------------------------------------
function newLayer(model, fillValue = 0) {
  return { cell: model.cell, nodes: model.nodes, data: new Uint8Array(model.nodes * model.nodes).fill(fillValue) };
}

/** Bioma "natural" de uma altura (usado para criar o `biomeGrid` ao pintar o primeiro bioma): mar abaixo da água, grama acima. */
function defaultBiomeLayer(model) {
  const layer = newLayer(model);
  const lvl = model.waterLevel;
  for (let j = 0; j < layer.nodes; j++) {
    for (let i = 0; i < layer.nodes; i++) {
      const h = heightAt(model, -model.size / 2 + i * layer.cell, -model.size / 2 + j * layer.cell);
      layer.data[j * layer.nodes + i] = h < lvl ? BIOME.SEA : h < 1.2 ? BIOME.SAND : BIOME.GRASS;
    }
  }
  if (model.lava) for (let k = 0; k < layer.data.length; k++) if (model.lava.data[k] === 1) layer.data[k] = BIOME.LAVA;
  layer.encoding = 'rle';
  return layer;
}

/** Valor da camada em (x, z) (vizinho mais próximo, como `isLavaAt`/`getBiomeAt`); `null` fora da grade. */
export function layerAt(model, layer, x, z) {
  if (!layer) return null;
  const fx = (x + model.size / 2) / layer.cell;
  const fz = (z + model.size / 2) / layer.cell;
  if (fx < 0 || fz < 0 || fx >= layer.nodes || fz >= layer.nodes) return null;
  const i = Math.min(layer.nodes - 1, Math.round(fx));
  const j = Math.min(layer.nodes - 1, Math.round(fz));
  return layer.data[j * layer.nodes + i];
}

/** Escreve `value` nos nós a até `radius` de (x, z). `only(v)` (opcional) restringe aos nós cujo valor atual passa no teste. */
function stampLayer(model, layer, x, z, radius, value, only = null) {
  const n = layer.nodes;
  const lo = (v) => (v + model.size / 2) / layer.cell;
  const i0 = Math.max(0, Math.floor(lo(x - radius)));
  const i1 = Math.min(n - 1, Math.ceil(lo(x + radius)));
  const j0 = Math.max(0, Math.floor(lo(z - radius)));
  const j1 = Math.min(n - 1, Math.ceil(lo(z + radius)));
  let changed = false;
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const dx = -model.size / 2 + i * layer.cell - x;
      const dz = -model.size / 2 + j * layer.cell - z;
      if (dx * dx + dz * dz > radius * radius) continue;
      const k = j * n + i;
      if (layer.data[k] === value || (only && !only(layer.data[k]))) continue;
      layer.data[k] = value;
      changed = true;
    }
  }
  return changed;
}

/** Pincel de bioma: pinta o disco com o bioma `opts.biome` (0–12) e cria o `biomeGrid` se ainda não houver. */
export function applyBiomeBrush(model, x, z, { radius = 6, biome = BIOME.GRASS } = {}) {
  if (!Number.isInteger(biome) || biome < 0 || biome > MAX_BIOME_ID) throw new Error(`bioma inválido: ${biome}`);
  if (!model.biome) model.biome = defaultBiomeLayer(model);
  let changed = stampLayer(model, model.biome, x, z, radius, biome);
  // lava é bioma e bit de lava ao mesmo tempo: manter os dois coerentes
  if (model.lava && stampLayer(model, model.lava, x, z, radius, biome === BIOME.LAVA ? 1 : 0)) changed = true;
  if (biome === BIOME.LAVA && !model.lava) { model.lava = newLayer(model); changed = stampLayer(model, model.lava, x, z, radius, 1) || changed; }
  return changed;
}

/** Balde: troca o bioma da região contígua (4-conexa) que contém (x, z). Devolve o nº de nós alterados. */
export function fillBiomeRegion(model, x, z, biome) {
  if (!Number.isInteger(biome) || biome < 0 || biome > MAX_BIOME_ID) throw new Error(`bioma inválido: ${biome}`);
  if (!model.biome) model.biome = defaultBiomeLayer(model);
  const { nodes: n, data } = model.biome;
  const fx = Math.round((x + model.size / 2) / model.biome.cell);
  const fz = Math.round((z + model.size / 2) / model.biome.cell);
  if (fx < 0 || fz < 0 || fx >= n || fz >= n) return 0;
  const from = data[fz * n + fx];
  if (from === biome) return 0;
  if (biome === BIOME.LAVA && !model.lava) model.lava = newLayer(model);
  const lava = model.lava?.nodes === n ? model.lava.data : null;
  const paint = (k) => { data[k] = biome; if (lava) lava[k] = biome === BIOME.LAVA ? 1 : 0; };
  const stack = [fz * n + fx];
  paint(stack[0]);
  let count = 0;
  while (stack.length) {
    const k = stack.pop();
    count++;
    const i = k % n;
    const j = (k - i) / n;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di;
      const nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= n || nj >= n) continue;
      const nk = nj * n + ni;
      if (data[nk] === from) { paint(nk); stack.push(nk); }
    }
  }
  return count;
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
    ...(model.lava ? { lavaGrid: exportLayer(model, 'lava') } : {}),
    ...(model.biome ? { biomeGrid: exportLayer(model, 'biome') } : {}),
    fords: clone(model.fords),
    startSlots: clone(model.startSlots),
    resources: clone(model.resources),
    forests: clone(model.forests),
    neutrals: clone(model.neutrals)
  };
  return Object.assign(out, clone(model.extra));
}

/** Camada → objeto `lavaGrid`/`biomeGrid` do formato do mapa (`biome` sai em RLE salvo se veio em base64). */
export function exportLayer(model, kind) {
  const l = model[kind];
  if (!l) return null;
  if (kind === 'lava') return { cell: l.cell, nodes: l.nodes, data: encodeLavaGrid(l.data) };
  return l.encoding === 'base64'
    ? { cell: l.cell, nodes: l.nodes, data: encodeBiomeGrid(l.data) }
    : { cell: l.cell, nodes: l.nodes, encoding: 'rle', data: encodeRleBiomeGrid(l.data) };
}

/** Lê um `lavaGrid`/`biomeGrid` (objeto do mapa) para uma camada, validando tamanho (e ids de bioma). Lança `Error` PT-BR se inválido. */
export function decodeLayer(kind, grid, size) {
  if (!grid || typeof grid !== 'object') throw new Error('grade ausente');
  const cell = grid.cell || 1;
  if (!(cell > 0) || grid.nodes !== paintedNodes(size, cell)) throw new Error('a grade não bate com o tamanho do mapa');
  const data = kind === 'lava' ? decodeLavaGrid(grid.data) : decodeBiomeGrid(grid);
  if (!data || data.length !== grid.nodes * grid.nodes) throw new Error('dados da grade inconsistentes');
  const copy = Uint8Array.from(data);
  const max = kind === 'lava' ? 1 : MAX_BIOME_ID;
  for (let k = 0; k < copy.length; k++) if (copy[k] > max) throw new Error('valor fora da faixa na grade');
  const layer = { cell, nodes: grid.nodes, data: copy };
  if (kind === 'biome') layer.encoding = grid.encoding === 'rle' || Array.isArray(grid.data) ? 'rle' : 'base64';
  return layer;
}

/** Texto JSON de uma camada isolada (`{ "biomeGrid": {...} }`), para exportar só os biomas ou só a lava. */
export function exportLayerJson(model, kind) {
  if (!model[kind]) throw new Error('mapa sem essa grade');
  return JSON.stringify({ [LAYER_KEYS[kind]]: exportLayer(model, kind) }, null, 2) + '\n';
}

/** Importa uma camada isolada (texto/objeto, com ou sem o invólucro `{ biomeGrid }`) para o modelo. */
export function importLayer(model, kind, input) {
  const obj = typeof input === 'string' ? JSON.parse(input) : input;
  model[kind] = decodeLayer(kind, obj?.[LAYER_KEYS[kind]] ?? obj, model.size);
  return model[kind];
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
    cell, nodes, h, lava: null, biome: null, extra: {}
  };
  if (def.lavaGrid) model.lava = decodeLayer('lava', def.lavaGrid, def.size);
  if (def.biomeGrid) model.biome = decodeLayer('biome', def.biomeGrid, def.size);
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
const copyLayer = (l) => (l ? { ...l, data: l.data.slice() } : null);

export function snapshotOf(model) {
  const { h, lava, biome, ...rest } = model;
  return { h: h.slice(), lava: copyLayer(lava), biome: copyLayer(biome), rest: clone(rest) };
}

export function restoreSnapshot(model, snapshot) {
  const rest = clone(snapshot.rest);
  for (const k of Object.keys(model)) delete model[k];
  Object.assign(model, rest);
  model.h = snapshot.h.slice();
  model.lava = copyLayer(snapshot.lava);
  model.biome = copyLayer(snapshot.biome);
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

// ---------------------------------------------------------------------------------------------
// Regenerar costa (M2-09): preset + semente → mapa novo no lugar do conteúdo do modelo
// ---------------------------------------------------------------------------------------------
/** Troca TODO o conteúdo de `model` por `other` (mesmo objeto, para o editor e o histórico continuarem apontando para ele). */
export function replaceModel(model, other) {
  for (const k of Object.keys(model)) delete model[k];
  Object.assign(model, other);
  return model;
}

/**
 * Gera um mapa pelo gerador de costas (`coast/`, puro e determinístico: mesma semente ⇒ mesmo mapa) e devolve um modelo novo.
 * Mantém `id`/`name` do modelo atual. `ok: false` se nenhuma das `tries` sementes passou na verificação do preset.
 * @returns {{ ok: boolean, model?: object, seed?: number, requestedSeed: number, preset: string, failures?: string[] }}
 */
export function regenerateCoast(model, presetId, seed = 1, { tries = 10 } = {}) {
  const preset = getCoastPreset(presetId);
  const world = buildCoastWorld(preset, { seed, tries, id: model.id, name: model.name });
  if (!world.ok) return { ok: false, preset: preset.id, requestedSeed: seed, failures: world.attempts.flatMap((a) => a.failures.slice(0, 1)) };
  const next = importMap(world.mapDef);
  next.id = model.id;
  next.name = model.name;
  return { ok: true, model: next, seed: world.seed, requestedSeed: seed, preset: preset.id };
}
