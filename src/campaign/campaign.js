/**
 * campaign.js (F8-05) — lógica PURA de campanhas: validação do índice, ordem, desbloqueio e carry-over.
 * Sem DOM/localStorage/Math.random: o estado de progresso vem como argumento (ver progress.js).
 *
 * Formato do índice (`src/data/campaigns/<id>/campaign.json`, versão 1):
 *   { format:"warpolycampaign", version:1, id, factionId, provisional?, title, subtitle?, premise, heroes?:[],
 *     missions:[{ id, requires?:[missionId…], carryOver?:{ from?, resources:{gold,wood,stone: fração 0..1}, max?, heroes?:[] } }] }
 * Os ids de `missions` são ids de missões F8-04 (já registradas). A ordem do array é a ordem de exibição; `requires`
 * só pode citar missões ANTERIORES (sem ciclos). Sem `requires` = disponível desde o início.
 */
export const CAMPAIGN_FORMAT = 'warpolycampaign';
export const CAMPAIGN_VERSION = 1;
const ID_RE = /^[a-z0-9_-]{1,48}$/;
const RES = ['gold', 'wood', 'stone'];

export class CampaignError extends Error {}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const okText = (t) => (typeof t === 'string' && t.length > 0) || (isObj(t) && typeof t['pt-BR'] === 'string' && t['pt-BR'].length > 0);

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
  if (def.provisional !== undefined && typeof def.provisional !== 'boolean') err('provisional', 'deve ser booleano');
  if (!Array.isArray(def.missions) || def.missions.length === 0) {
    err('missions', 'lista obrigatória e não vazia');
    return { ok: false, errors };
  }
  const seen = new Set();
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
    seen.add(m.id);
  });
  return { ok: errors.length === 0, errors };
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

/**
 * Plano da tela de fim de missão de campanha (puro). Decide quais botões fazem sentido.
 * Vitória: a missão atual conta como concluída (o progresso já foi gravado, mas não dependemos disso). A "próxima" é a
 * primeira missão DEPOIS da atual, na ordem da campanha, que esteja desbloqueada com esse progresso.
 * @returns {{ inCampaign:boolean, outcome:string, nextMissionId:string|null, hasNext:boolean, isLastMission:boolean,
 *   campaignComplete:boolean, carryOver:boolean }}
 */
export function campaignEndPlan(def, missionId, outcome, completed, opts = {}) {
  const idx = def ? def.missions.findIndex((m) => m.id === missionId) : -1;
  if (idx < 0) return { inCampaign: false, outcome, nextMissionId: null, hasNext: false, isLastMission: false, campaignComplete: false, carryOver: false };
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
  return {
    inCampaign: true,
    outcome,
    nextMissionId,
    hasNext: !!nextMissionId,
    isLastMission: idx === def.missions.length - 1,
    campaignComplete: won && isCampaignComplete(def, done),
    carryOver: !!(nextEntry && nextEntry.carryOver && nextEntry.carryOver.resources)
  };
}
