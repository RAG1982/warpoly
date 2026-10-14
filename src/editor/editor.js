/**
 * src/editor/editor.js (F8-03) — editor de mapas no navegador (`editor.html`).
 *
 * Edita um `mapModel` (grade `painted` + listas do formato de `src/data/maps/`) em vista 2D, com prévia 3D, desfazer/refazer,
 * validação ao vivo (`validateMapDef`, o mesmo validador do jogo), importar/exportar JSON e salvamento local.
 * `window.mapEditor` expõe a API para capturas/depuração. Mapas exportados NÃO entram no registro do jogo (importe-os à mão).
 */
import { t, applyI18n, setLanguage, getLanguage, LANGUAGES, onLanguageChange } from '../i18n/index.js';
import { listMaps } from '../data/maps/index.js';
import { validateMapDef, SIZE_LIMITS, FOREST_SPECIES } from '../data/maps/validate.js';
import { TILESETS, TILESET_IDS, resolveTilesetId } from '../data/tilesets.js';
import { CRITTER_SPECIES_LIST } from '../data/critters.js';
import {
  createModel, applyTerrainBrush, placeItem, eraseAt, exportMap, exportJson, importMap, importForEditing, History, heightAt,
  TERRAIN_TOOLS, ITEM_TOOLS
} from './mapModel.js';
import { saveMap, loadSaved, listSaved, deleteSaved, saveDraft, loadDraft } from './storage.js';
import { View2D } from './view2d.js';
import { Preview3D } from './preview3d.js';

const $ = (id) => document.getElementById(id);
const TOOL_COLORS = { raise: '#b58a5a', lower: '#5a7ab5', flatten: '#9aa0a8', smooth: '#c8c8d0', land: '#60984a', water: '#3a76b8', ford: '#e9d27a', start: '#4aa3ff', gold: '#ffd23a', stone: '#c3c8d0', oil: '#1a1a22', forest: '#2f8f3a', camp: '#ff5a4a', critters: '#ffffff', erase: '#ff8a7a' };
const BRUSH_TOOLS = new Set(TERRAIN_TOOLS);

let storage = null;
try { storage = window.localStorage; } catch { storage = null; }

const state = {
  model: createModel({ size: 128, fill: 'land' }),
  history: null,
  tool: 'raise',
  opts: { radius: 6, strength: 0.5, species: 'pine', count: 10, forestRadius: 7, guards: 4, rewardGold: 300, depositType: 'gold', depositAmount: 3000, critterSpecies: 'sheep', critterCount: 6, amount: '' },
  issues: { errors: [], warnings: [] },
  previewMode: 'light'
};

const view = new View2D($('view2d'));
const preview = new Preview3D($('view3d'));
let needsDraw = true;
let stroke = null;
let validateTimer = 0;
let saveTimer = 0;
let msgTimer = 0;

// ---------------------------------------------------------------------------------------------
// Utilidades de UI
// ---------------------------------------------------------------------------------------------
function message(text) {
  const el = $('message');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(msgTimer);
  msgTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

function el(tag, attrs = {}, children = []) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  for (const c of children) e.append(c);
  return e;
}

function field(labelText, input, valueEl) {
  return el('label', { class: 'field' }, [el('span', {}, [labelText, ...(valueEl ? [valueEl] : [])]), input]);
}

function slider(key, min, max, step, labelKey, fmt = (v) => String(v)) {
  const val = el('b', { text: fmt(state.opts[key]) });
  const input = el('input', { type: 'range', min, max, step, value: state.opts[key] });
  input.addEventListener('input', () => { state.opts[key] = Number(input.value); val.textContent = fmt(state.opts[key]); });
  return field(t(labelKey), input, val);
}

function selectOf(key, values, labelFn, labelKey) {
  const sel = el('select', {}, values.map((v) => el('option', { value: v, text: labelFn(v) })));
  sel.value = state.opts[key];
  sel.addEventListener('change', () => { state.opts[key] = sel.value; });
  return field(t(labelKey), sel);
}

function numberOf(key, min, max, step, labelKey) {
  const input = el('input', { type: 'number', min, max, step, value: state.opts[key] });
  input.addEventListener('input', () => { state.opts[key] = input.value === '' ? '' : Number(input.value); });
  return field(t(labelKey), input);
}

// ---------------------------------------------------------------------------------------------
// Painel de ferramentas (reconstruído ao trocar ferramenta/idioma/mapa)
// ---------------------------------------------------------------------------------------------
function toolButton(id) {
  const b = el('button', { 'data-tool': id, class: state.tool === id ? 'on' : '' }, [el('i', { class: 'sw', style: `background:${TOOL_COLORS[id]}` }), t(`editor.tool.${id}`)]);
  b.addEventListener('click', () => { state.tool = id; renderTools(); });
  return b;
}

function renderOptions() {
  const box = el('div');
  const tool = state.tool;
  if (BRUSH_TOOLS.has(tool)) {
    box.append(slider('radius', 2, 20, 0.5, 'editor.opt.radius'));
    if (tool === 'raise' || tool === 'lower') box.append(slider('strength', 0.1, 2, 0.1, 'editor.opt.strength'));
  } else if (tool === 'gold' || tool === 'stone' || tool === 'oil') {
    box.append(numberOf('amount', 100, 100000, 100, 'editor.opt.amount'));
  } else if (tool === 'forest') {
    box.append(selectOf('species', FOREST_SPECIES, (v) => t(`editor.species.${v}`), 'editor.opt.species'));
    box.append(slider('count', 1, 40, 1, 'editor.opt.count'));
    box.append(slider('forestRadius', 2, 14, 0.5, 'editor.opt.forestRadius'));
  } else if (tool === 'camp') {
    box.append(slider('guards', 1, 8, 1, 'editor.opt.guards'));
    box.append(numberOf('rewardGold', 0, 5000, 50, 'editor.opt.rewardGold'));
    box.append(selectOf('depositType', ['gold', 'stone'], (v) => t(`editor.res.${v}`), 'editor.opt.depositType'));
    box.append(numberOf('depositAmount', 500, 20000, 500, 'editor.opt.depositAmount'));
  } else if (tool === 'critters') {
    box.append(selectOf('critterSpecies', CRITTER_SPECIES_LIST, (v) => t(`editor.species.${v}`), 'editor.opt.species'));
    box.append(slider('critterCount', 1, 40, 1, 'editor.opt.count'));
  } else if (tool === 'start') {
    box.append(el('p', { class: 'hint', text: t('editor.hint.start') }));
  } else if (tool === 'erase') {
    box.append(el('p', { class: 'hint', text: t('editor.hint.erase') }));
  }
  return box;
}

function renderMeta() {
  const m = state.model;
  const box = el('div');
  const text = (key, labelKey, max) => {
    const i = el('input', { type: 'text', value: m[key], maxlength: max });
    i.addEventListener('change', () => { m[key] = i.value.trim(); commit(); });
    return field(t(labelKey), i);
  };
  const num = (key, labelKey, min, max, step = 1) => {
    const i = el('input', { type: 'number', min, max, step, value: m[key] });
    i.addEventListener('change', () => { m[key] = Number(i.value); commit(); needsDraw = true; });
    return field(t(labelKey), i);
  };
  const ts = el('select', {}, TILESET_IDS.map((id) => el('option', { value: id, text: TILESETS[id].name })));
  ts.value = resolveTilesetId(m.tileset);
  ts.addEventListener('change', () => { m.tileset = ts.value; commit(); });
  box.append(
    text('name', 'editor.map.name', 40),
    text('id', 'editor.map.id', 48),
    field(t('editor.map.size'), el('input', { type: 'text', value: `${m.size} × ${m.size}`, disabled: 'true' })),
    num('playable', 'editor.map.playable', 32, m.size, 2),
    num('maxPlayers', 'editor.map.maxPlayers', 2, 8),
    field(t('editor.map.tileset'), ts)
  );
  return box;
}

function renderTools() {
  const root = $('tools');
  root.replaceChildren(
    el('div', { class: 'panel' }, [el('h2', { text: t('editor.section.terrain') }), el('div', { class: 'toolgrid' }, TERRAIN_TOOLS.map(toolButton))]),
    el('div', { class: 'panel' }, [el('h2', { text: t('editor.section.items') }), el('div', { class: 'toolgrid' }, [...ITEM_TOOLS, 'erase'].map(toolButton))]),
    el('div', { class: 'panel' }, [el('h2', { text: t('editor.section.options') }), renderOptions()]),
    el('div', { class: 'panel' }, [el('h2', { text: t('editor.section.map') }), renderMeta()]),
    el('p', { class: 'hint', text: t('editor.hint.keys') })
  );
}

// ---------------------------------------------------------------------------------------------
// Validação, rascunho, histórico
// ---------------------------------------------------------------------------------------------
function issueText(i) {
  const params = { ...i.params };
  if (params.what) params.what = t(`editor.what.${params.what}`, { fallback: params.what });
  return t(`editor.issue.${i.code}`, { ...params, fallback: i.code });
}

export function runValidation() {
  const res = validateMapDef(exportMap(state.model));
  state.issues = res;
  const sum = $('issues-summary');
  if (res.ok && res.warnings.length === 0) {
    sum.className = 'ok';
    sum.textContent = t('editor.issues.valid');
  } else {
    sum.className = res.ok ? '' : 'bad';
    sum.textContent = t('editor.issues.summary', { errors: res.errors.length, warnings: res.warnings.length });
  }
  $('issues').replaceChildren(...[...res.errors, ...res.warnings].map((i) => el('li', { class: i.level, 'data-code': i.code, text: issueText(i) })));
  return res;
}

function scheduleValidate() {
  clearTimeout(validateTimer);
  validateTimer = setTimeout(runValidation, 350);
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { if (storage) saveDraft(storage, exportMap(state.model)); }, 600);
}

function updateButtons() {
  $('btn-undo').disabled = !state.history.canUndo;
  $('btn-redo').disabled = !state.history.canRedo;
}

function updateStatus(x, z) {
  const m = state.model;
  const counts = t('editor.status.counts', { slots: m.startSlots.length, res: m.resources.length, forests: m.forests.length, neutrals: m.neutrals.length });
  const pos = x === undefined ? '' : `${t('editor.status.cursor', { x: x.toFixed(1), z: z.toFixed(1), h: heightAt(m, x, z).toFixed(1) })}  ·  `;
  $('status').textContent = pos + counts;
}

/** Registra o estado atual no histórico e atualiza vista, validação e rascunho. */
function commit() {
  state.history.commit(state.model);
  afterChange();
}

function afterChange() {
  needsDraw = true;
  preview.markDirty();
  updateButtons();
  updateStatus();
  scheduleValidate();
  scheduleSave();
}

function setModel(model) {
  state.model = model;
  state.history = new History(model);
  preview.resetCamera(model.size);
  preview.size = 0;
  resizeViews();
  renderTools();
  afterChange();
  runValidation();
}

function undo() { if (state.history.undo(state.model)) { renderTools(); afterChange(); } }
function redo() { if (state.history.redo(state.model)) { renderTools(); afterChange(); } }

// ---------------------------------------------------------------------------------------------
// Entrada no canvas 2D
// ---------------------------------------------------------------------------------------------
function itemOpts() {
  const o = state.opts;
  return {
    amount: o.amount === '' ? undefined : o.amount, species: state.tool === 'critters' ? o.critterSpecies : o.species, count: state.tool === 'critters' ? o.critterCount : o.count,
    radius: state.tool === 'critters' ? 5 : o.forestRadius, guards: o.guards, rewardGold: o.rewardGold, depositType: o.depositType, depositAmount: o.depositAmount
  };
}

function stamp(tool, x, z, shift) {
  const o = state.opts;
  let useTool = tool;
  if (shift && tool === 'raise') useTool = 'lower';
  else if (shift && tool === 'lower') useTool = 'raise';
  return applyTerrainBrush(state.model, useTool, x, z, { radius: o.radius, strength: o.strength, level: stroke ? stroke.level : 0 });
}

function onDown(ev) {
  if (ev.button !== 0 && ev.button !== 2) return;
  ev.preventDefault();
  $('view2d').setPointerCapture(ev.pointerId);
  const [x, z] = view.screenToWorld(state.model, ev.clientX, ev.clientY);
  const tool = ev.button === 2 ? 'erase' : state.tool;
  if (tool === 'erase') {
    if (eraseAt(state.model, x, z, 3)) { renderTools(); commit(); preview.markDirty(); }
    return;
  }
  if (BRUSH_TOOLS.has(tool)) {
    stroke = { tool, last: [x, z], level: heightAt(state.model, x, z), changed: false };
    if (stamp(tool, x, z, ev.shiftKey)) { stroke.changed = true; needsDraw = true; preview.markDirty(false); }
  } else {
    placeItem(state.model, tool, x, z, itemOpts());
    commit();
  }
}

function onMove(ev) {
  const [x, z] = view.screenToWorld(state.model, ev.clientX, ev.clientY);
  const brush = BRUSH_TOOLS.has(state.tool);
  view.cursor = { x, z, radius: brush ? state.opts.radius : 0, color: TOOL_COLORS[state.tool] };
  needsDraw = true;
  updateStatus(x, z);
  if (stroke) {
    const [lx, lz] = stroke.last;
    if (Math.hypot(x - lx, z - lz) >= Math.max(1, state.opts.radius * 0.25)) {
      stroke.last = [x, z];
      if (stamp(stroke.tool, x, z, ev.shiftKey)) { stroke.changed = true; preview.markDirty(false); }
    }
  }
}

function onUp() {
  if (!stroke) return;
  const changed = stroke.changed;
  stroke = null;
  if (changed) commit();
}

function bindCanvas() {
  const c = $('view2d');
  c.addEventListener('pointerdown', onDown);
  c.addEventListener('pointermove', onMove);
  c.addEventListener('pointerup', onUp);
  c.addEventListener('pointercancel', onUp);
  c.addEventListener('pointerleave', () => { view.cursor = null; needsDraw = true; updateStatus(); });
  c.addEventListener('contextmenu', (e) => e.preventDefault());
  addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
    else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
    else if (e.key === '[') { state.opts.radius = Math.max(2, state.opts.radius - 1); renderTools(); }
    else if (e.key === ']') { state.opts.radius = Math.min(20, state.opts.radius + 1); renderTools(); }
  });
}

// ---------------------------------------------------------------------------------------------
// Arquivo: importar / exportar / salvar
// ---------------------------------------------------------------------------------------------
function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = el('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Valida e baixa `<id>.json`. Erros bloqueiam; avisos não. Devolve o resultado da validação. */
export function exportDownload() {
  const res = runValidation();
  if (!res.ok) { message(t('editor.msg.exportBlocked', { n: res.errors.length })); return res; }
  const file = `${state.model.id}.json`;
  download(file, exportJson(state.model));
  message(res.warnings.length ? t('editor.msg.exportedWarn', { file, n: res.warnings.length }) : t('editor.msg.exported', { file }));
  return res;
}

function importText(text, fromGame = false) {
  try {
    const model = fromGame ? importForEditing(JSON.parse(text)) : importMap(text);
    setModel(model);
    message(t('editor.msg.imported', { name: model.name }));
  } catch (e) {
    message(t('editor.msg.importFailed', { msg: e.message }));
  }
}

function openSaved() {
  const ul = $('saved-list');
  const items = storage ? listSaved(storage) : [];
  ul.replaceChildren(...(items.length ? items.map((s) => el('li', {}, [
    el('span', { text: `${s.name} (${s.id})` }),
    el('button', { type: 'button', text: t('editor.load'), onclick: () => { importText(JSON.stringify(loadSaved(storage, s.id))); $('dlg-saved').close(); } }),
    el('button', { type: 'button', text: t('editor.delete'), onclick: () => { deleteSaved(storage, s.id); openSaved(); } })
  ])) : [el('li', { class: 'hint', text: t('editor.saved.empty') })]));
  if (!$('dlg-saved').open) $('dlg-saved').showModal();
}

function bindHeader() {
  $('btn-undo').addEventListener('click', undo);
  $('btn-redo').addEventListener('click', redo);
  $('btn-export').addEventListener('click', exportDownload);
  $('btn-import').addEventListener('click', () => $('file-import').click());
  $('file-import').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (f) importText(await f.text());
    e.target.value = '';
  });
  $('btn-save').addEventListener('click', () => {
    try { saveMap(storage, exportMap(state.model)); message(t('editor.msg.saved')); } catch { message(t('editor.msg.saveFailed')); }
  });
  $('btn-saved').addEventListener('click', openSaved);
  $('btn-new').addEventListener('click', () => { $('new-name').value = t('editor.newDefaultName'); $('dlg-new').showModal(); });
  $('dlg-new').addEventListener('close', () => {
    if ($('dlg-new').returnValue !== 'ok') return;
    const name = $('new-name').value.trim() || t('editor.newDefaultName');
    const slug = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
    setModel(createModel({ size: Number($('new-size').value), fill: $('new-fill').value, name, id: slug.length >= 2 ? slug : 'meu-mapa' }));
  });
  $('sel-game-map').addEventListener('change', (e) => {
    const id = e.target.value;
    e.target.value = '';
    const def = listMaps({ includeHidden: true }).find((m) => m.id === id);
    if (def) importText(JSON.stringify(def), true);
  });
  $('pv-light').addEventListener('click', () => setPreview('light'));
  $('pv-game').addEventListener('click', () => setPreview('game'));
  $('pv-refresh').addEventListener('click', () => preview.refreshGame(state.model));
  $('sel-lang').addEventListener('change', (e) => setLanguage(e.target.value));
}

function setPreview(mode) {
  state.previewMode = mode;
  preview.setMode(mode);
  if (mode === 'game') preview.refreshGame(state.model);
  $('pv-light').classList.toggle('on', mode === 'light');
  $('pv-game').classList.toggle('on', mode === 'game');
  $('pv-refresh').hidden = mode !== 'game';
}

function fillStaticSelects() {
  $('new-size').replaceChildren(...[96, 112, 128, 144, 160, 176, 192].filter((s) => s >= SIZE_LIMITS.min).map((s) => el('option', { value: s, text: `${s} × ${s}` })));
  $('new-size').value = '128';
  $('new-fill').replaceChildren(el('option', { value: 'land', text: t('editor.fill.land') }), el('option', { value: 'water', text: t('editor.fill.water') }));
  const sel = $('sel-game-map');
  sel.replaceChildren(el('option', { value: '', text: t('editor.fromGame') }), ...listMaps({ includeHidden: true }).map((m) => el('option', { value: m.id, text: t(`map.${m.id}.name`, { fallback: m.name || m.id }) })));
  sel.value = '';
  const lang = $('sel-lang');
  lang.replaceChildren(...LANGUAGES.map((l) => el('option', { value: l.id, text: l.label })));
  lang.value = getLanguage();
}

// ---------------------------------------------------------------------------------------------
// Layout e laço de desenho
// ---------------------------------------------------------------------------------------------
function resizeViews() {
  const wrap = $('stage-wrap');
  view.resize(Math.min(wrap.clientWidth, wrap.clientHeight) - 4);
  const c = $('view3d');
  preview.resize(Math.max(200, c.clientWidth), Math.max(160, c.clientHeight));
  needsDraw = true;
}

function frame() {
  if (needsDraw) { view.draw(state.model); needsDraw = false; }
  preview.render(state.model);
  requestAnimationFrame(frame);
}

function relabel() {
  document.documentElement.lang = getLanguage();
  document.title = t('editor.title');
  applyI18n(document);
  fillStaticSelects();
  renderTools();
  runValidation();
  updateStatus();
}

function init() {
  fillStaticSelects();
  bindHeader();
  bindCanvas();
  onLanguageChange(relabel);
  const draft = storage ? loadDraft(storage) : null;
  let model = null;
  if (draft) { try { model = importMap(draft); } catch { model = null; } }
  state.model = model || state.model;
  state.history = new History(state.model);
  applyI18n(document);
  document.title = t('editor.title');
  renderTools();
  addEventListener('resize', resizeViews);
  new ResizeObserver(resizeViews).observe($('stage-wrap'));
  resizeViews();
  preview.resetCamera(state.model.size);
  updateButtons();
  updateStatus();
  runValidation();
  requestAnimationFrame(frame);
}

window.mapEditor = {
  state, view, preview, commit, setModel, undo, redo, runValidation, exportDownload, importText, setPreview, renderTools,
  stamp: (tool, x, z) => { const ch = applyTerrainBrush(state.model, tool, x, z, { radius: state.opts.radius, strength: state.opts.strength, level: heightAt(state.model, x, z) }); needsDraw = true; preview.markDirty(false); return ch; },
  place: (tool, x, z, o) => { const it = placeItem(state.model, tool, x, z, o); return it; },
  redraw: () => { needsDraw = true; preview.markDirty(); }
};

init();
