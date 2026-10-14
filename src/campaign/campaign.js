/**
 * campaign.js (F8-05) — lógica PURA de campanhas: validação do índice, ordem, desbloqueio e carry-over.
 * Sem DOM/localStorage/Math.random: o estado de progresso vem como argumento (ver progress.js).
 *
 * Formato do índice (`src/data/campaigns/<id>/campaign.json`, versão 1):
 *   { format:"warpolycampaign", version:1, id, factionId, provisional?, title, subtitle?, premise, heroes?:[],
 *     missions:[{ id, requires?:[missionId…], carryOver?:{ from?, resources:{gold,wood,stone: fração 0..1}, max?, heroes?:[] } }] }
 * F8-05b: cada entrada pode ter `unlocks: { units:[], buildings:[], research:[], heroes:[] }` = o que a missão LIBERA (progressão
 * da campanha). O conjunto DISPONÍVEL na missão N é a união cumulativa dos `unlocks` das missões 1..N (`availableTech`); a partida
 * da campanha leva isso em `MatchConfig.techRestriction` (`techRestrictionFor`). Missões isoladas (menu "Missões") não são restritas.
 * `epilogue?` (tela final da campanha): { title:{pt-BR,en}, paragraphs:[{pt-BR,en} x 3..5], faction:'human'|'orc', credits?:{pt-BR,en} }.
 * Os ids de `missions` são ids de missões F8-04 (já registradas). A ordem do array é a ordem de exibição; `requires`
 * só pode citar missões ANTERIORES (sem ciclos). Sem `requires` = disponível desde o início.
 */
import { UNITS } from '../data/units.js';
import { BUILDINGS } from '../data/buildings.js';
import { RESEARCH } from '../data/upgrades.js';
import { TECH_KINDS, techItemProblem, parseResearchToken, researchToken } from '../sim/techRestriction.js';

export const CAMPAIGN_FORMAT = 'warpolycampaign';
export const CAMPAIGN_VERSION = 1;
const ID_RE = /^[a-z0-9_-]{1,48}$/;
const RES = ['gold', 'wood', 'stone'];

export class CampaignError extends Error {}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const okText = (t) => (typeof t === 'string' && t.length > 0) || (isObj(t) && typeof t['pt-BR'] === 'string' && t['pt-BR'].length > 0);

const okBi = (t) => isObj(t) && ['pt-BR', 'en'].every((l) => typeof t[l] === 'string' && t[l].trim().length > 0);

/** Valida o epílogo opcional (puro). Acrescenta erros via `err`. */
function validateEpilogue(e, err) {
  if (!isObj(e)) return err('epilogue', 'deve ser objeto');
  if (!okBi(e.title)) err('epilogue.title', 'precisa de pt-BR e en');
  if (!['human', 'orc'].includes(e.faction)) err('epilogue.faction', 'deve ser human|orc');
  if (!Array.isArray(e.paragraphs) || e.paragraphs.length < 3 || e.paragraphs.length > 5) err('epilogue.paragraphs', 'lista de 3 a 5 parágrafos');
  else e.paragraphs.forEach((p, i) => { if (!okBi(p)) err(`epilogue.paragraphs[${i}]`, 'precisa de pt-BR e en'); });
  if (e.credits !== undefined && !okBi(e.credits)) err('epilogue.credits', 'precisa de pt-BR e en');
}

/**
 * @param {object} def  índice da campanha
 * @param {{ hasMission?: (id:string)=>boolean }} [opts]  confere se cada missão existe
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateCampaign(def, opts = {}) {
  const errors = [];
  const err = (p, m) => errors.push(`${p}: ${m}`);
  if (!isObj(def)) return { ok: false, errors: ['a campanha deve ser um objeto JSON'] };
  if (def.format !== CAMPAIGN_FORMAT) err('format', `deve ser "${CAMPAIGN_FORMAT}"`);
  if (def.version !== CAMPAIGN_VERSION) err('version', `versão ${def.version} não suportada`);
  if (typeof def.id !== 'string' || !ID_RE.test(def.id)) err('id', 'id inválido');
  if (!['human', 'orc'].includes(def.factionId)) err('factionId', 'deve ser human|orc');
  if (!okText(def.title)) err('title', 'texto obrigatório (pt-BR)');
  if (!okText(def.premise)) err('premise', 'texto obrigatório (pt-BR)');
  if (def.epilogue !== undefined) validateEpilogue(def.epilogue, err);
  if (def.provisional !== undefined && typeof def.provisional !== 'boolean') err('provisional', 'deve ser booleano');
  if (def.track !== undefined && !['main', 'beta'].includes(def.track)) err('track', 'deve ser main|beta');
  if (def.order !== undefined && typeof def.order !== 'number') err('order', 'deve ser numérico');
  if (def.betaLabel !== undefined && !okText(def.betaLabel)) err('betaLabel', 'texto obrigatório');
  if (!Array.isArray(def.missions) || def.missions.length === 0) {
    err('missions', 'lista obrigatória e não vazia');
    return { ok: false, errors };
  }
  const seen = new Set();
  const unlocked = new Set();
  def.missions.forEach((m, i) => {
    const p = `missions[${i}]`;
    if (!isObj(m) || typeof m.id !== 'string') return err(p, 'precisa de id');
    if (seen.has(m.id)) err(`${p}.id`, `missão repetida "${m.id}"`);
    if (opts.hasMission && !opts.hasMission(m.id)) err(`${p}.id`, `missão desconhecida "${m.id}"`);
    if (m.requires !== undefined) {
      if (!Array.isArray(m.requires)) err(`${p}.requires`, 'deve ser lista');
      else for (const r of m.requires) if (!seen.has(r)) err(`${p}.requires`, `"${r}" deve ser uma missão anterior`);
    }
    if (m.carryOver !== undefined) {
      const c = m.carryOver;
      if (!isObj(c)) err(`${p}.carryOver`, 'deve ser objeto');
      else {
        if (c.from !== undefined && !seen.has(c.from)) err(`${p}.carryOver.from`, 'deve ser uma missão anterior');
        if (c.resources !== undefined) {
          if (!isObj(c.resources)) err(`${p}.carryOver.resources`, 'deve ser objeto');
          else for (const [k, v] of Object.entries(c.resources)) {
            if (!RES.includes(k)) err(`${p}.carryOver.resources.${k}`, 'recurso desconhecido');
            else if (typeof v !== 'number' || !(v >= 0 && v <= 1)) err(`${p}.carryOver.resources.${k}`, 'fração 0..1');
          }
        }
        if (c.max !== undefined && !(typeof c.max === 'number' && c.max >= 0)) err(`${p}.carryOver.max`, 'número ≥ 0');
        if (c.heroes !== undefined && !Array.isArray(c.heroes)) err(`${p}.carryOver.heroes`, 'deve ser lista (reservado: F4-08)');
      }
    }
    if (m.unlocks !== undefined) validateUnlocks(m.unlocks, `${p}.unlocks`, def, errors, unlocked);
    seen.add(m.id);
  });
  return { ok: errors.length === 0, errors };
}

/** Facção do item compatível com a campanha (a da campanha ou neutra: petroleiro, barcaça, plataforma)? */
function factionOk(itemFaction, campaignFaction) {
  return !itemFaction || itemFaction === 'neutral' || itemFaction === campaignFaction;
}

/** Valida o bloco `unlocks` de uma missão: tipos existentes em `src/data`, da facção da campanha, sem repetição entre missões. */
function validateUnlocks(u, p, def, errors, unlocked) {
  const err = (path, m) => errors.push(`${path}: ${m}`);
  if (!isObj(u)) return err(p, 'deve ser objeto');
  for (const k of Object.keys(u)) if (!TECH_KINDS.includes(k)) err(`${p}.${k}`, `campo desconhecido (use ${TECH_KINDS.join('|')})`);
  for (const kind of TECH_KINDS) {
    const list = u[kind];
    if (list === undefined) continue;
    if (!Array.isArray(list)) { err(`${p}.${kind}`, 'deve ser lista'); continue; }
    for (const id of list) {
      const prob = techItemProblem(kind, id);
      if (prob) { err(`${p}.${kind}`, prob); continue; }
      let fac;
      if (kind === 'units' || kind === 'heroes') fac = UNITS[id].faction;
      else if (kind === 'buildings') fac = BUILDINGS[id].faction;
      else fac = RESEARCH[parseResearchToken(id).id].faction;
      if (!factionOk(fac, def.factionId)) err(`${p}.${kind}`, `"${id}" é da facção ${fac}, a campanha é ${def.factionId}`);
      if (kind === 'heroes' && UNITS[id].faction !== def.factionId) err(`${p}.${kind}`, `herói "${id}" não é da campanha`);
      const key = `${kind}:${id}`;
      if (unlocked.has(key)) err(`${p}.${kind}`, `"${id}" já foi liberado antes`);
      else if (kind === 'research') {
        const r = parseResearchToken(id);
        if (r.level > 1 && !unlocked.has(`research:${researchToken(r.id, r.level - 1)}`) && !(u.research || []).includes(researchToken(r.id, r.level - 1))) {
          err(`${p}.research`, `"${id}" precisa do nível anterior liberado antes ou junto`);
        }
      }
      unlocked.add(key);
    }
  }
}

export function assertCampaign(def, opts) {
  const r = validateCampaign(def, opts);
  if (!r.ok) throw new CampaignError(`Campanha inválida:\n- ${r.errors.join('\n- ')}`);
  return def;
}

/** Ids das missões na ordem da campanha. */
export const missionOrder = (def) => def.missions.map((m) => m.id);

export const entryOf = (def, missionId) => def.missions.find((m) => m.id === missionId) || null;

/** `completed`: objeto/Set/Map com os ids concluídos na tentativa atual. */
function isDone(completed, id) {
  if (!completed) return false;
  if (completed instanceof Set) return completed.has(id);
  if (completed instanceof Map) return completed.has(id);
  return Object.prototype.hasOwnProperty.call(completed, id);
}

/** Missão desbloqueada = todas as `requires` concluídas (ou sem `requires`). `unlockAll` libera tudo (depuração). */
export function isUnlocked(def, missionId, completed, { unlockAll = false } = {}) {
  const e = entryOf(def, missionId);
  if (!e) return false;
  if (unlockAll) return true;
  return (e.requires || []).every((r) => isDone(completed, r));
}

/** @returns {'completed'|'available'|'locked'} */
export function missionStatus(def, missionId, completed, opts) {
  if (isDone(completed, missionId)) return 'completed';
  return isUnlocked(def, missionId, completed, opts) ? 'available' : 'locked';
}

/** Primeira missão disponível ainda não concluída (a "próxima"); `null` se a campanha acabou. */
export function nextMission(def, completed, opts) {
  for (const m of def.missions) if (missionStatus(def, m.id, completed, opts) === 'available') return m.id;
  return null;
}

export const isCampaignComplete = (def, completed) => def.missions.every((m) => isDone(completed, m.id));

/**
 * Recursos iniciais de uma missão: os da própria missão + carry-over do resultado da missão anterior
 * (`carryOver.from`, padrão = 1ª de `requires`): `min(max, floor(fração × saldo final))` por recurso.
 * @param {object} missionDef  definição da missão (F8-04)
 * @param {object|null} entry  entrada da campanha
 * @param {Record<string,{resources?:object}>} completed  resultados por missão
 * @returns {{gold:number,wood:number,stone:number}}
 */
export function startingResourcesFor(missionDef, entry, completed) {
  const base = { gold: 0, wood: 0, stone: 0, ...(missionDef.startingResources || {}) };
  const c = entry && entry.carryOver;
  if (!c || !c.resources) return base;
  const from = c.from || (entry.requires && entry.requires[0]);
  const prev = from && completed && completed[from];
  if (!prev || !prev.resources) return base;
  const cap = c.max ?? Infinity;
  for (const k of RES) {
    const frac = c.resources[k];
    if (!frac) continue;
    base[k] += Math.min(cap, Math.floor(frac * Math.max(0, prev.resources[k] || 0)));
  }
  return base;
}

// ------------------------------------------------------------------ liberação progressiva (F8-05b)

/** Posição (0-based) da missão: aceita o índice ou o id; `-1` se não existir. */
function indexOfMission(def, ref) {
  if (typeof ref === 'number') return ref < def.missions.length ? ref : def.missions.length - 1;
  return def.missions.findIndex((m) => m.id === ref);
}

/** Algum `unlocks` na campanha? (sem nenhum, a campanha não restringe a árvore tecnológica) */
export const hasTechProgression = (def) => def.missions.some((m) => isObj(m.unlocks));

/**
 * O que a campanha LIBERA na missão `missionRef` (índice 0-based ou id), só ela (as novidades): `{units, buildings, research, heroes}` (listas).
 */
export function missionUnlocks(def, missionRef) {
  const i = indexOfMission(def, missionRef);
  const u = (i >= 0 && def.missions[i].unlocks) || {};
  return Object.fromEntries(TECH_KINDS.map((k) => [k, [...(u[k] || [])]]));
}

/**
 * Conjunto DISPONÍVEL na missão `missionRef` (índice 0-based — 0 = missão 1 — ou id da missão): a união CUMULATIVA dos `unlocks`
 * das missões 1..N. Função pura; sem `unlocks` devolve conjuntos vazios (use `hasTechProgression` para saber se há restrição).
 * `research` usa fichas `"id"` (nível 1) e `"id@2"` (nível 2).
 * @returns {{units:Set<string>, buildings:Set<string>, research:Set<string>, heroes:Set<string>}}
 */
export function availableTech(def, missionRef) {
  const out = { units: new Set(), buildings: new Set(), research: new Set(), heroes: new Set() };
  const idx = indexOfMission(def, missionRef);
  for (let i = 0; i <= idx; i++) {
    const u = def.missions[i].unlocks;
    if (!u) continue;
    for (const kind of TECH_KINDS) for (const id of u[kind] || []) out[kind].add(id);
  }
  return out;
}

/** Número (1-based) da missão que libera o item, ou `null` se a campanha nunca o libera. */
export function unlockMissionOf(def, kind, id) {
  for (let i = 0; i < def.missions.length; i++) {
    const u = def.missions[i].unlocks;
    if (u && (u[kind] || []).includes(id)) return i + 1;
  }
  return null;
}

/**
 * `MatchConfig.techRestriction` da missão `missionRef` para o(s) jogador(es) `players` (padrão: [0], o jogador local das missões
 * da campanha): disponível = `availableTech`, mais `later` (itens que só chegam em missão posterior → dica "Disponível na missão N"),
 * `mission` e `unlocks` (novidades da missão, para o anúncio). `null` quando a campanha não tem progressão.
 */
export function techRestrictionFor(def, missionRef, { players = [0] } = {}) {
  if (!hasTechProgression(def)) return null;
  const idx = indexOfMission(def, missionRef);
  if (idx < 0) return null;
  const avail = availableTech(def, idx);
  const cfg = { players: [...players] };
  for (const kind of TECH_KINDS) cfg[kind] = [...avail[kind]];
  const later = {};
  for (const kind of TECH_KINDS) {
    later[kind] = {};
    for (let i = idx + 1; i < def.missions.length; i++) {
      for (const id of (def.missions[i].unlocks && def.missions[i].unlocks[kind]) || []) later[kind][id] = i + 1;
    }
  }
  cfg.later = later;
  cfg.mission = idx + 1;
  cfg.unlocks = missionUnlocks(def, idx);
  return cfg;
}

/**
 * Plano da tela de fim de missão de campanha (puro). Decide quais botões fazem sentido.
 * Vitória: a missão atual conta como concluída (o progresso já foi gravado, mas não dependemos disso). A "próxima" é a
 * primeira missão DEPOIS da atual, na ordem da campanha, que esteja desbloqueada com esse progresso.
 * @returns {{ inCampaign:boolean, outcome:string, nextMissionId:string|null, hasNext:boolean, isLastMission:boolean,
 *   campaignComplete:boolean, carryOver:boolean, epilogue:object|null, factionId:string|null }}
 *   `epilogue`/`factionId` só vêm preenchidos quando a campanha foi concluída (tela final especial).
 */
export function campaignEndPlan(def, missionId, outcome, completed, opts = {}) {
  const idx = def ? def.missions.findIndex((m) => m.id === missionId) : -1;
  if (idx < 0) return { inCampaign: false, outcome, nextMissionId: null, hasNext: false, isLastMission: false, campaignComplete: false, carryOver: false, epilogue: null, factionId: null };
  const won = outcome === 'victory';
  const keys = completed instanceof Set || completed instanceof Map ? [...completed.keys()] : Object.keys(completed || {});
  const done = Object.fromEntries(keys.map((k) => [k, true]));
  if (won) done[missionId] = true;
  let nextMissionId = null;
  if (won) {
    for (let i = idx + 1; i < def.missions.length; i++) {
      if (isUnlocked(def, def.missions[i].id, done, opts)) { nextMissionId = def.missions[i].id; break; }
    }
  }
  const nextEntry = nextMissionId ? entryOf(def, nextMissionId) : null;
  const campaignComplete = won && isCampaignComplete(def, done);
  return {
    inCampaign: true,
    outcome,
    nextMissionId,
    hasNext: !!nextMissionId,
    isLastMission: idx === def.missions.length - 1,
    campaignComplete,
    carryOver: !!(nextEntry && nextEntry.carryOver && nextEntry.carryOver.resources),
    epilogue: campaignComplete && def.epilogue ? def.epilogue : null,
    factionId: campaignComplete ? (def.epilogue?.faction || def.factionId || null) : null
  };
}
