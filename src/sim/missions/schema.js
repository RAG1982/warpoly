/**
 * schema.js — F8-04: formato e validação das missões (JSON em `src/data/missions/<id>.json`).
 *
 * Puro (sem three.js/DOM, sem relógio/aleatório): importável em Node. Documentação do formato:
 * `src/data/missions/README.md`. `validateMission(def, opts)` devolve a lista COMPLETA de erros (PT-BR) em vez
 * de parar no primeiro; `assertMission` lança `MissionError` com todos eles.
 */
import { UNITS, BUILDINGS, RESEARCH } from '../../data/index.js';
import { getMap } from '../../data/maps/index.js';

export const MISSION_FORMAT = 'warpolymission';
/** Versão do FORMATO. Suba e escreva migração quando o JSON mudar de forma incompatível. */
export const MISSION_VERSION = 1;

export const OBJECTIVE_TYPES = Object.freeze(['destroy', 'survive', 'escort', 'rescue', 'build', 'collect', 'eliminate', 'flag']);
export const PRIORITIES = Object.freeze(['primary', 'secondary', 'hidden']);
export const OBJECTIVE_STATUSES = Object.freeze(['inactive', 'active', 'completed', 'failed']);
export const CONDITION_TYPES = Object.freeze(['time', 'every', 'area', 'dead', 'count', 'var', 'objective', 'resource', 'trigger', 'research']);
export const ACTION_TYPES = Object.freeze([
  'spawn', 'spawnBuilding', 'setTier', 'giveResources', 'takeResources', 'setObjective', 'addObjective', 'revealObjective', 'reveal', 'setTeam',
  'transfer', 'dialog', 'message', 'victory', 'defeat', 'music', 'sound', 'camera', 'cutscene', 'setVar', 'incVar',
  'enableTrigger', 'disableTrigger', 'tag', 'order', 'guard'
]);
export const OPS = Object.freeze(['==', '!=', '>', '>=', '<', '<=']);
export const RESOURCES = Object.freeze(['gold', 'wood', 'stone', 'oil']);
export const SOUND_IDS = Object.freeze(['victory', 'alarm', 'error', 'build', 'order', 'select', 'hammer', 'sword']);
export const MUSIC_IDS = Object.freeze(['on', 'off']);
export const ORDER_KINDS = Object.freeze(['move', 'attackMove', 'stop']);
export const OWNER_KEYWORDS = Object.freeze(['player', 'enemy', 'ally', 'neutral', 'bandits']);
export const LANGS = Object.freeze(['pt-BR', 'en']);
const ID_RE = /^[a-z0-9][a-z0-9_-]{0,47}$/;
/** Cor de marcação (anel de seleção) das unidades/construções de missão: `#rrggbb`. */
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

export class MissionError extends Error {
  constructor(errors, id = '?') {
    super(`Missão "${id}" inválida:\n- ${errors.join('\n- ')}`);
    this.name = 'MissionError';
    this.errors = errors;
  }
}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isStr = (v) => typeof v === 'string' && v.length > 0;

/** Contexto de validação: acumula erros com o caminho do campo. */
class Ctx {
  constructor(opts) {
    this.errors = [];
    this.opts = opts;
    this.half = Infinity;
  }
  err(path, msg) { this.errors.push(`${path}: ${msg}`); }
}

function checkText(c, path, v, { optional = false } = {}) {
  if (v === undefined && optional) return;
  if (typeof v === 'string') { if (!v) c.err(path, 'texto vazio'); return; }
  if (!isObj(v)) { c.err(path, 'texto deve ser string ou {"pt-BR": "...", "en": "..."}'); return; }
  if (!isStr(v['pt-BR'])) c.err(path, 'falta a tradução "pt-BR" (idioma base)');
  for (const k of Object.keys(v)) {
    if (!LANGS.includes(k)) c.err(path, `idioma desconhecido "${k}"`);
    else if (!isStr(v[k])) c.err(path, `tradução "${k}" deve ser texto não vazio`);
  }
}

function checkNum(c, path, v, { min = -Infinity, max = Infinity, int = false, optional = false } = {}) {
  if (v === undefined && optional) return;
  if (!isNum(v)) return c.err(path, 'deve ser número finito');
  if (int && !Number.isInteger(v)) c.err(path, 'deve ser inteiro');
  if (v < min || v > max) c.err(path, `fora do intervalo [${min}, ${max}]`);
}

function checkOwner(c, path, v, { optional = false } = {}) {
  if (v === undefined && optional) return;
  if (Number.isInteger(v) && v >= 0) return;
  if (typeof v === 'string' && OWNER_KEYWORDS.includes(v)) return;
  c.err(path, `dono inválido (id inteiro ≥ 0 ou ${OWNER_KEYWORDS.join('|')})`);
}

function checkXZ(c, path, o) {
  checkNum(c, `${path}.x`, o && o.x);
  checkNum(c, `${path}.z`, o && o.z);
  if (isObj(o) && isNum(o.x) && isNum(o.z) && (Math.abs(o.x) > c.half || Math.abs(o.z) > c.half)) c.err(path, 'fora da área do mapa');
}

function checkArea(c, path, a) {
  if (!isObj(a)) return c.err(path, 'área deve ser {x,z,r} ou {x1,z1,x2,z2}');
  if ('r' in a) {
    checkXZ(c, path, a);
    checkNum(c, `${path}.r`, a.r, { min: 0.5, max: 200 });
  } else if ('x1' in a) {
    for (const k of ['x1', 'z1', 'x2', 'z2']) checkNum(c, `${path}.${k}`, a[k]);
  } else c.err(path, 'área deve ter "r" (círculo) ou "x1,z1,x2,z2" (retângulo)');
}

function checkMarkColor(c, path, v) {
  if (v === undefined) return;
  if (typeof v !== 'string' || !HEX_COLOR_RE.test(v)) c.err(path, 'cor inválida (use o formato hexadecimal "#rrggbb")');
}

function checkTagRef(c, path, tag) {
  if (!isStr(tag) || !ID_RE.test(tag)) return c.err(path, 'tag inválida (a-z, 0-9, _ ou -)');
  c.tagRefs.push([path, tag]);
}

/** Seletor de entidades: `{tag?, owner?, unitType?, buildingType?, role?, kind?, area?, killedBy?}`. */
function checkSelect(c, path, s, { forDeath = false } = {}) {
  if (!isObj(s)) return c.err(path, 'seletor deve ser um objeto');
  const known = ['tag', 'owner', 'unitType', 'buildingType', 'role', 'kind', 'area', 'killedBy'];
  for (const k of Object.keys(s)) if (!known.includes(k)) c.err(`${path}.${k}`, 'campo desconhecido no seletor');
  if (s.tag !== undefined) checkTagRef(c, `${path}.tag`, s.tag);
  checkOwner(c, `${path}.owner`, s.owner, { optional: true });
  checkOwner(c, `${path}.killedBy`, s.killedBy, { optional: true });
  if (s.unitType !== undefined && !UNITS[s.unitType]) c.err(`${path}.unitType`, `unidade desconhecida "${s.unitType}"`);
  if (s.buildingType !== undefined && !BUILDINGS[s.buildingType]) c.err(`${path}.buildingType`, `construção desconhecida "${s.buildingType}"`);
  if (s.role !== undefined && !isStr(s.role)) c.err(`${path}.role`, 'papel deve ser texto');
  if (s.kind !== undefined && !['unit', 'building', 'any'].includes(s.kind)) c.err(`${path}.kind`, 'kind deve ser unit|building|any');
  if (s.area !== undefined) {
    if (forDeath) c.err(`${path}.area`, 'seletor de mortes não aceita área');
    else checkArea(c, `${path}.area`, s.area);
  }
  if (forDeath && s.tag === undefined && s.unitType === undefined && s.buildingType === undefined && s.role === undefined) {
    c.err(path, 'seletor de mortes precisa de tag, unitType, buildingType ou role');
  }
  if (!forDeath && s.killedBy !== undefined) c.err(`${path}.killedBy`, 'killedBy só vale em seletores de mortes (objetivo destroy / condição dead)');
}

function checkCondition(c, path, cond, ids) {
  if (!isObj(cond)) return c.err(path, 'condição deve ser um objeto');
  if ('all' in cond || 'any' in cond) {
    const key = 'all' in cond ? 'all' : 'any';
    if (!Array.isArray(cond[key]) || cond[key].length === 0) return c.err(`${path}.${key}`, 'deve ser lista não vazia');
    cond[key].forEach((x, i) => checkCondition(c, `${path}.${key}[${i}]`, x, ids));
    return;
  }
  if ('not' in cond) return checkCondition(c, `${path}.not`, cond.not, ids);
  const p = `${path}(${cond.type})`;
  if (!CONDITION_TYPES.includes(cond.type)) return c.err(path, `tipo de condição desconhecido "${cond.type}"`);
  switch (cond.type) {
    case 'time': checkNum(c, `${p}.at`, cond.at, { min: 0 }); break;
    case 'every':
      checkNum(c, `${p}.seconds`, cond.seconds, { min: 0.05 });
      checkNum(c, `${p}.start`, cond.start, { min: 0, optional: true });
      break;
    case 'area':
      checkOwner(c, `${p}.owner`, cond.owner, { optional: true });
      checkArea(c, `${p}.area`, cond.area);
      checkNum(c, `${p}.count`, cond.count, { min: 1, int: true, optional: true });
      if (cond.unitType !== undefined && !UNITS[cond.unitType]) c.err(`${p}.unitType`, `unidade desconhecida "${cond.unitType}"`);
      if (cond.tag !== undefined) checkTagRef(c, `${p}.tag`, cond.tag);
      break;
    case 'dead':
      checkSelect(c, `${p}.select`, cond.select, { forDeath: true });
      checkNum(c, `${p}.count`, cond.count, { min: 1, int: true, optional: true });
      break;
    case 'count':
      checkSelect(c, `${p}.select`, cond.select);
      if (cond.op !== undefined && !OPS.includes(cond.op)) c.err(`${p}.op`, 'operador inválido');
      checkNum(c, `${p}.value`, cond.value, { min: 0 });
      break;
    case 'var':
      if (!isStr(cond.name)) c.err(`${p}.name`, 'nome obrigatório');
      else c.varRefs.push([`${p}.name`, cond.name]);
      if (cond.op !== undefined && !OPS.includes(cond.op)) c.err(`${p}.op`, 'operador inválido');
      if (!['number', 'boolean', 'string'].includes(typeof cond.value)) c.err(`${p}.value`, 'valor deve ser número, booleano ou texto');
      break;
    case 'objective':
      if (!isStr(cond.id)) c.err(`${p}.id`, 'id obrigatório');
      else c.objRefs.push([`${p}.id`, cond.id]);
      if (!['inactive', 'active', 'completed', 'failed'].includes(cond.status)) c.err(`${p}.status`, 'status inválido');
      break;
    case 'resource':
      checkOwner(c, `${p}.owner`, cond.owner, { optional: true });
      if (!RESOURCES.includes(cond.resource)) c.err(`${p}.resource`, 'recurso inválido');
      if (cond.op !== undefined && !OPS.includes(cond.op)) c.err(`${p}.op`, 'operador inválido');
      checkNum(c, `${p}.value`, cond.value, { min: 0 });
      break;
    case 'trigger':
      if (!isStr(cond.id)) c.err(`${p}.id`, 'id obrigatório');
      else c.trigRefs.push([`${p}.id`, cond.id]);
      break;
    case 'research': { // F8-05b: pesquisa concluída (`level` padrão 1)
      checkOwner(c, `${p}.owner`, cond.owner, { optional: true });
      if (!isStr(cond.id) || !RESEARCH[cond.id]) c.err(`${p}.id`, `pesquisa desconhecida "${cond.id}"`);
      else checkNum(c, `${p}.level`, cond.level, { min: 1, max: RESEARCH[cond.id].levels.length, int: true, optional: true });
      break;
    }
  }
  void ids;
}

function checkObjectiveDef(c, path, o, { dynamic = false } = {}) {
  if (!isObj(o)) return c.err(path, 'objetivo deve ser um objeto');
  if (!isStr(o.id) || !ID_RE.test(o.id)) c.err(`${path}.id`, 'id inválido (a-z, 0-9, _ ou -)');
  if (!OBJECTIVE_TYPES.includes(o.type)) return c.err(`${path}.type`, `tipo de objetivo desconhecido "${o.type}"`);
  if (!PRIORITIES.includes(o.priority ?? 'primary')) c.err(`${path}.priority`, `prioridade deve ser ${PRIORITIES.join('|')}`);
  checkText(c, `${path}.title`, o.title);
  checkText(c, `${path}.description`, o.description, { optional: true });
  if (o.active !== undefined && typeof o.active !== 'boolean') c.err(`${path}.active`, 'deve ser booleano');
  if (o.failWhen !== undefined) checkCondition(c, `${path}.failWhen`, o.failWhen);
  const p = `${path}(${o.type})`;
  switch (o.type) {
    case 'destroy':
      checkSelect(c, `${p}.select`, o.select, { forDeath: true });
      checkNum(c, `${p}.count`, o.count, { min: 1, int: true, optional: true });
      break;
    case 'survive':
      checkNum(c, `${p}.seconds`, o.seconds, { min: 1 });
      break;
    case 'escort':
      checkTagRef(c, `${p}.tag`, o.tag);
      checkArea(c, `${p}.area`, o.area);
      checkNum(c, `${p}.count`, o.count, { min: 1, int: true, optional: true });
      break;
    case 'rescue':
      checkTagRef(c, `${p}.tag`, o.tag);
      checkNum(c, `${p}.count`, o.count, { min: 1, int: true, optional: true });
      checkOwner(c, `${p}.owner`, o.owner, { optional: true });
      break;
    case 'build':
      if (o.buildingType === undefined && o.role === undefined) c.err(p, 'informe buildingType ou role');
      if (o.buildingType !== undefined && !BUILDINGS[o.buildingType]) c.err(`${p}.buildingType`, `construção desconhecida "${o.buildingType}"`);
      checkNum(c, `${p}.count`, o.count, { min: 1, int: true });
      checkOwner(c, `${p}.owner`, o.owner, { optional: true });
      break;
    case 'collect':
      if (!RESOURCES.includes(o.resource)) c.err(`${p}.resource`, 'recurso inválido');
      checkNum(c, `${p}.amount`, o.amount, { min: 1 });
      if (o.mode !== undefined && !['gathered', 'stock'].includes(o.mode)) c.err(`${p}.mode`, 'mode deve ser gathered|stock');
      checkOwner(c, `${p}.owner`, o.owner, { optional: true });
      break;
    case 'eliminate':
      if (o.owners !== undefined) {
        if (!Array.isArray(o.owners) || o.owners.length === 0) c.err(`${p}.owners`, 'deve ser lista não vazia');
        else o.owners.forEach((x, i) => checkOwner(c, `${p}.owners[${i}]`, x));
      }
      if (o.include !== undefined && !['all', 'buildings', 'units'].includes(o.include)) c.err(`${p}.include`, 'include deve ser all|buildings|units');
      break;
    case 'flag':
      checkCondition(c, `${p}.condition`, o.condition);
      break;
  }
  void dynamic;
}

function checkDialogLike(c, path, a) {
  checkText(c, `${path}.text`, a.text);
  checkText(c, `${path}.speaker`, a.speaker, { optional: true });
  if (a.portrait !== undefined && !isStr(a.portrait)) c.err(`${path}.portrait`, 'retrato deve ser um emoji/texto curto');
  checkNum(c, `${path}.duration`, a.duration, { min: 0.5, max: 120, optional: true });
}

function checkAction(c, path, a, setup = false) {
  if (!isObj(a)) return c.err(path, 'ação deve ser um objeto');
  if (!ACTION_TYPES.includes(a.type)) return c.err(`${path}.type`, `tipo de ação desconhecido "${a.type}"`);
  const p = `${path}(${a.type})`;
  switch (a.type) {
    case 'spawn': {
      checkOwner(c, `${p}.owner`, a.owner);
      checkXZ(c, p, a);
      const list = a.units ?? (a.unitType ? [{ type: a.unitType, count: a.count ?? 1 }] : null);
      if (!Array.isArray(list) || list.length === 0) c.err(p, 'informe unitType(+count) ou units:[{type,count}]');
      else {
        list.forEach((u, i) => {
          if (!UNITS[u && u.type]) c.err(`${p}.units[${i}].type`, `unidade desconhecida "${u && u.type}"`);
          checkNum(c, `${p}.units[${i}].count`, u && u.count, { min: 1, max: 60, int: true });
        });
      }
      if (a.tag !== undefined) { if (!isStr(a.tag) || !ID_RE.test(a.tag)) c.err(`${p}.tag`, 'tag inválida'); else c.tagDefs.add(a.tag); }
      if (a.order !== undefined) {
        if (!isObj(a.order) || !ORDER_KINDS.includes(a.order.kind)) c.err(`${p}.order.kind`, `kind deve ser ${ORDER_KINDS.join('|')}`);
        else if (a.order.kind !== 'stop') checkXZ(c, `${p}.order`, a.order);
      }
      if (a.guard !== undefined && !(typeof a.guard === 'boolean' || (isObj(a.guard) && typeof a.guard.r === 'number' && a.guard.r > 0))) c.err(`${p}.guard`, 'deve ser booleano ou {r>0}');
      checkMarkColor(c, `${p}.markColor`, a.markColor);
      break;
    }
    case 'spawnBuilding': {
      // Construção já concluída (forte aliado, torre inimiga…). `type` já é o discriminador da ação: o tipo da construção é `buildingType`.
      checkOwner(c, `${p}.owner`, a.owner);
      checkXZ(c, p, a);
      const bdef = isStr(a.buildingType) ? BUILDINGS[a.buildingType] : null;
      if (!bdef) c.err(`${p}.buildingType`, isStr(a.buildingType) ? `construção desconhecida "${a.buildingType}"` : 'informe buildingType (tipo de src/data/buildings.js)');
      else if (bdef.role === 'platform') c.err(`${p}.buildingType`, 'plataforma de petróleo só existe sobre um poço (não pode ser criada por spawnBuilding)');
      else if (isNum(a.x) && isNum(a.z)) {
        const r = bdef.collisionRadius || 0; // a pegada inteira precisa caber na área jogável
        if (Math.abs(a.x) + r > c.half || Math.abs(a.z) + r > c.half) c.err(p, 'a pegada da construção sai da área jogável do mapa');
      }
      if (a.tag !== undefined) { if (!isStr(a.tag) || !ID_RE.test(a.tag)) c.err(`${p}.tag`, 'tag inválida'); else c.tagDefs.add(a.tag); }
      checkMarkColor(c, `${p}.markColor`, a.markColor);
      checkNum(c, `${p}.facing`, a.facing, { min: -360, max: 360, optional: true });
      break;
    }
    case 'setTier': // F8-05b: eleva o Centro do dono ao nível `tier`
      checkOwner(c, `${p}.owner`, a.owner, { optional: true });
      checkNum(c, `${p}.tier`, a.tier, { min: 2, max: 3, int: true });
      break;
    case 'giveResources':
    case 'takeResources': {
      checkOwner(c, `${p}.owner`, a.owner, { optional: true });
      let any = false;
      for (const r of RESOURCES) if (a[r] !== undefined) { any = true; checkNum(c, `${p}.${r}`, a[r], { min: 0 }); }
      if (!any) c.err(p, 'informe ao menos um recurso (gold/wood/stone/oil)');
      break;
    }
    case 'setObjective':
      if (!isStr(a.id)) c.err(`${p}.id`, 'id obrigatório'); else c.objRefs.push([`${p}.id`, a.id]);
      if (!OBJECTIVE_STATUSES.includes(a.status)) c.err(`${p}.status`, `status deve ser ${OBJECTIVE_STATUSES.join('|')}`);
      break;
    case 'addObjective':
      checkObjectiveDef(c, `${p}.objective`, a.objective, { dynamic: true });
      if (isObj(a.objective) && isStr(a.objective.id)) c.objAdded.add(a.objective.id);
      break;
    case 'revealObjective':
      if (!isStr(a.id)) c.err(`${p}.id`, 'id obrigatório'); else c.objRefs.push([`${p}.id`, a.id]);
      break;
    case 'reveal':
      if (a.all !== true) { checkXZ(c, p, a); checkNum(c, `${p}.radius`, a.radius, { min: 1, max: 400 }); }
      break;
    case 'setTeam':
      checkOwner(c, `${p}.player`, a.player);
      checkNum(c, `${p}.team`, a.team, { min: 0, int: true });
      break;
    case 'transfer':
      checkSelect(c, `${p}.select`, a.select);
      checkOwner(c, `${p}.to`, a.to);
      if (a.tag !== undefined) { if (!isStr(a.tag) || !ID_RE.test(a.tag)) c.err(`${p}.tag`, 'tag inválida'); else c.tagDefs.add(a.tag); }
      break;
    case 'dialog': checkDialogLike(c, p, a); break;
    case 'message':
      checkText(c, `${p}.text`, a.text);
      break;
    case 'victory':
    case 'defeat':
      checkText(c, `${p}.text`, a.text, { optional: true });
      break;
    case 'music': if (!MUSIC_IDS.includes(a.id)) c.err(`${p}.id`, `id deve ser ${MUSIC_IDS.join('|')}`); break;
    case 'sound': if (!SOUND_IDS.includes(a.id)) c.err(`${p}.id`, `id deve ser ${SOUND_IDS.join('|')}`); break;
    case 'camera':
      checkXZ(c, p, a);
      checkNum(c, `${p}.zoom`, a.zoom, { min: 0.3, max: 3, optional: true });
      break;
    case 'cutscene': {
      if (!Array.isArray(a.steps) || a.steps.length === 0) { c.err(`${p}.steps`, 'deve ser lista não vazia'); break; }
      checkNum(c, `${p}.duration`, a.duration, { min: 1, max: 300 });
      if (a.skippable !== undefined && typeof a.skippable !== 'boolean') c.err(`${p}.skippable`, 'deve ser booleano');
      let last = -1;
      a.steps.forEach((s, i) => {
        const sp = `${p}.steps[${i}]`;
        if (!isObj(s)) return c.err(sp, 'passo deve ser um objeto');
        checkNum(c, `${sp}.at`, s.at, { min: 0 });
        if (isNum(s.at)) {
          if (s.at < last) c.err(`${sp}.at`, 'passos devem estar em ordem crescente de tempo');
          if (isNum(a.duration) && s.at > a.duration) c.err(`${sp}.at`, 'passo depois do fim da cutscene');
          last = s.at;
        }
        if (s.x !== undefined || s.z !== undefined) checkXZ(c, sp, s);
        checkNum(c, `${sp}.zoom`, s.zoom, { min: 0.3, max: 3, optional: true });
        if (s.dialog !== undefined) checkDialogLike(c, `${sp}.dialog`, s.dialog);
      });
      break;
    }
    case 'setVar':
      if (!isStr(a.name)) c.err(`${p}.name`, 'nome obrigatório'); else c.varRefs.push([`${p}.name`, a.name]);
      if (!['number', 'boolean', 'string'].includes(typeof a.value)) c.err(`${p}.value`, 'valor deve ser número, booleano ou texto');
      break;
    case 'incVar':
      if (!isStr(a.name)) c.err(`${p}.name`, 'nome obrigatório'); else c.varRefs.push([`${p}.name`, a.name]);
      checkNum(c, `${p}.by`, a.by ?? 1);
      break;
    case 'enableTrigger':
    case 'disableTrigger':
      if (!isStr(a.id)) c.err(`${p}.id`, 'id obrigatório'); else c.trigRefs.push([`${p}.id`, a.id]);
      break;
    case 'tag':
      checkSelect(c, `${p}.select`, a.select);
      if (!isStr(a.tag) || !ID_RE.test(a.tag)) c.err(`${p}.tag`, 'tag inválida'); else c.tagDefs.add(a.tag);
      break;
    case 'order':
      checkSelect(c, `${p}.select`, a.select);
      if (!ORDER_KINDS.includes(a.kind)) c.err(`${p}.kind`, `kind deve ser ${ORDER_KINDS.join('|')}`);
      else if (a.kind !== 'stop') checkXZ(c, p, a);
      if (a.release !== undefined && typeof a.release !== 'boolean') c.err(`${p}.release`, 'deve ser booleano');
      break;
    case 'guard':
      checkSelect(c, `${p}.select`, a.select);
      if (a.release !== undefined && typeof a.release !== 'boolean') c.err(`${p}.release`, 'deve ser booleano');
      if (a.area !== undefined) {
        if (!isObj(a.area) || typeof a.area.r !== 'number' || a.area.r <= 0) c.err(`${p}.area`, 'área circular {x,z,r} obrigatória');
        else checkXZ(c, `${p}.area`, a.area);
      }
      if (a.radius !== undefined) checkNum(c, `${p}.radius`, a.radius, { min: 1 });
      break;
  }
  void setup;
}

/**
 * Valida a definição de missão. @param {object} def
 * @param {{ checkMap?: boolean }} [opts]  `checkMap` (padrão true): confere `mapId`/slots/área no registro de mapas.
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateMission(def, opts = {}) {
  const c = new Ctx(opts);
  c.tagRefs = []; c.varRefs = []; c.objRefs = []; c.trigRefs = [];
  c.tagDefs = new Set(); c.objAdded = new Set();
  if (!isObj(def)) return { ok: false, errors: ['a missão deve ser um objeto JSON'] };

  if (def.format !== MISSION_FORMAT) c.err('format', `deve ser "${MISSION_FORMAT}"`);
  if (def.version !== MISSION_VERSION) c.err('version', `versão ${def.version} não suportada (esperada ${MISSION_VERSION})`);
  if (!isStr(def.id) || !ID_RE.test(def.id)) c.err('id', 'id inválido (a-z, 0-9, _ ou -; até 48)');
  checkText(c, 'title', def.title);
  checkText(c, 'subtitle', def.subtitle, { optional: true });

  // Briefing
  if (!isObj(def.briefing)) c.err('briefing', 'obrigatório');
  else {
    checkText(c, 'briefing.text', def.briefing.text);
    checkText(c, 'briefing.speaker', def.briefing.speaker, { optional: true });
    if (def.briefing.portrait !== undefined && !isStr(def.briefing.portrait)) c.err('briefing.portrait', 'retrato deve ser um emoji/texto curto');
    if (def.briefing.hints !== undefined) {
      if (!Array.isArray(def.briefing.hints)) c.err('briefing.hints', 'deve ser lista');
      else def.briefing.hints.forEach((h, i) => checkText(c, `briefing.hints[${i}]`, h));
    }
  }

  // Mapa e jogadores
  let mapDef = null;
  if (!isStr(def.mapId)) c.err('mapId', 'obrigatório');
  else if (opts.checkMap !== false) {
    mapDef = getMap(def.mapId);
    if (!mapDef) c.err('mapId', `mapa desconhecido "${def.mapId}"`);
  }
  if (mapDef) c.half = (mapDef.playable ?? mapDef.size) / 2;
  checkNum(c, 'seed', def.seed, { min: 0, int: true });

  const playerIds = new Set();
  if (!Array.isArray(def.players) || def.players.length < 1) c.err('players', 'deve ser lista com ao menos o jogador local');
  else {
    let locals = 0;
    const slots = new Set();
    def.players.forEach((p, i) => {
      const pp = `players[${i}]`;
      if (!isObj(p)) return c.err(pp, 'deve ser um objeto');
      if (!Number.isInteger(p.id) || p.id < 0 || p.id > 15) c.err(`${pp}.id`, 'id inteiro 0..15');
      else if (playerIds.has(p.id)) c.err(`${pp}.id`, `id duplicado ${p.id}`);
      else playerIds.add(p.id);
      checkText(c, `${pp}.name`, p.name);
      if (!['human', 'orc'].includes(p.factionId)) c.err(`${pp}.factionId`, 'deve ser human|orc');
      checkNum(c, `${pp}.team`, p.team, { min: 0, int: true });
      if (!Number.isInteger(p.startSlot) || p.startSlot < 0) c.err(`${pp}.startSlot`, 'slot inteiro ≥ 0');
      else {
        if (slots.has(p.startSlot)) c.err(`${pp}.startSlot`, 'slot repetido');
        slots.add(p.startSlot);
        if (mapDef && !mapDef.startSlots[p.startSlot]) c.err(`${pp}.startSlot`, `o mapa "${def.mapId}" não tem o slot ${p.startSlot}`);
      }
      if (p.isAI !== undefined && typeof p.isAI !== 'boolean') c.err(`${pp}.isAI`, 'deve ser booleano');
      if (p.isLocal) locals++;
    });
    if (locals !== 1) c.err('players', 'exatamente um jogador com isLocal:true');
    if (mapDef && def.players.length > mapDef.maxPlayers) c.err('players', `o mapa aceita no máximo ${mapDef.maxPlayers}`);
  }
  if (def.startingResources !== undefined) {
    if (!isObj(def.startingResources)) c.err('startingResources', 'deve ser {wood,gold,stone}');
    else for (const k of ['wood', 'gold', 'stone']) checkNum(c, `startingResources.${k}`, def.startingResources[k], { min: 0 });
  }
  for (const k of ['autoVictory', 'defeatWhenWiped']) {
    if (def[k] !== undefined && typeof def[k] !== 'boolean') c.err(k, 'deve ser booleano');
  }

  // Variáveis
  const varNames = new Set();
  if (def.vars !== undefined) {
    if (!isObj(def.vars)) c.err('vars', 'deve ser um objeto {nome: valor}');
    else {
      for (const [k, v] of Object.entries(def.vars)) {
        if (!ID_RE.test(k)) c.err(`vars.${k}`, 'nome de variável inválido');
        if (!['number', 'boolean', 'string'].includes(typeof v)) c.err(`vars.${k}`, 'valor deve ser número, booleano ou texto');
        varNames.add(k);
      }
    }
  }

  // Objetivos
  const objIds = new Set();
  if (!Array.isArray(def.objectives) || def.objectives.length === 0) c.err('objectives', 'deve ser lista não vazia');
  else {
    def.objectives.forEach((o, i) => {
      checkObjectiveDef(c, `objectives[${i}]`, o);
      if (isObj(o) && isStr(o.id)) {
        if (objIds.has(o.id)) c.err(`objectives[${i}].id`, `id duplicado "${o.id}"`);
        objIds.add(o.id);
      }
    });
    if (!def.objectives.some((o) => isObj(o) && (o.priority ?? 'primary') === 'primary') && def.autoVictory !== false) {
      c.err('objectives', 'sem objetivo primário a missão nunca termina por si só (use autoVictory:false com uma ação victory)');
    }
  }
  c.added = c.objAdded;

  // Gatilhos
  const trigIds = new Set();
  if (def.triggers !== undefined) {
    if (!Array.isArray(def.triggers)) c.err('triggers', 'deve ser lista');
    else {
      def.triggers.forEach((t, i) => {
        const tp = `triggers[${i}]`;
        if (!isObj(t)) return c.err(tp, 'deve ser um objeto');
        if (!isStr(t.id) || !ID_RE.test(t.id)) c.err(`${tp}.id`, 'id inválido');
        else if (trigIds.has(t.id)) c.err(`${tp}.id`, `id duplicado "${t.id}"`);
        else trigIds.add(t.id);
        if (t.once !== undefined && typeof t.once !== 'boolean') c.err(`${tp}.once`, 'deve ser booleano');
        if (t.enabled !== undefined && typeof t.enabled !== 'boolean') c.err(`${tp}.enabled`, 'deve ser booleano');
        checkNum(c, `${tp}.cooldown`, t.cooldown, { min: 0, optional: true });
        checkCondition(c, `${tp}.when`, t.when);
        if (!Array.isArray(t.actions) || t.actions.length === 0) c.err(`${tp}.actions`, 'deve ser lista não vazia');
        else t.actions.forEach((a, k) => checkAction(c, `${tp}.actions[${k}]`, a));
      });
    }
  }
  if (def.setup !== undefined) {
    if (!Array.isArray(def.setup)) c.err('setup', 'deve ser lista de ações');
    else def.setup.forEach((a, k) => checkAction(c, `setup[${k}]`, a, true));
  }

  // Referências cruzadas
  for (const [path, name] of c.varRefs) if (!varNames.has(name)) c.err(path, `variável "${name}" não declarada em "vars"`);
  for (const [path, id] of c.objRefs) if (!objIds.has(id) && !c.objAdded.has(id)) c.err(path, `objetivo "${id}" não existe`);
  for (const [path, id] of c.trigRefs) if (!trigIds.has(id)) c.err(path, `gatilho "${id}" não existe`);
  for (const [path, tag] of c.tagRefs) if (!c.tagDefs.has(tag)) c.err(path, `tag "${tag}" nunca é criada (spawn/tag/transfer com "tag")`);
  // Donos citados precisam existir (números)
  return { ok: c.errors.length === 0, errors: c.errors };
}

/** Valida e devolve a missão; lança `MissionError` com todos os problemas. */
export function assertMission(def, opts) {
  const r = validateMission(def, opts);
  if (!r.ok) throw new MissionError(r.errors, def && def.id);
  return def;
}
