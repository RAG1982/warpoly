/**
 * techRestriction.js (F8-05b) — restrição de árvore tecnológica por jogador (liberação progressiva da campanha).
 *
 * `MatchConfig.techRestriction` (JSON puro, serializável em saves/replays) lista o que o(s) jogador(es) em `players`
 * PODEM usar; tudo o que não estiver nas listas é recusado pelos mesmos pontos que já checam requisitos
 * (`src/sim/requirements.js` → `Building.queueUnit`, `Building.startResearch`, `GameManager.placeBuilding/placeWall`).
 * Partidas sem `techRestriction` (escaramuça, menu "Missões", rede) não mudam em nada — nem no checksum.
 *
 * Formato:
 *   { players:[0], units:[tipo…], buildings:[tipo…], research:[id | "id@2"…], heroes:[tipo…],
 *     mission?: N (1-based, só apresentação), unlocks?: {…} (novidades da missão, só apresentação),
 *     later?: { units:{tipo:N}, buildings:{…}, research:{…}, heroes:{…} } (missão que libera cada item, p/ a dica) }
 *
 * - `research`: `"id"` libera o nível 1; `"id@2"` libera também o nível 2 (um item por nível).
 * - Unidade promovida (`modelOf`, ex.: Patrulheiro → Arqueiro) é liberada se ela OU a base estiver na lista.
 * - `heroes` é informativo para a sim (heróis entram só pela ação `spawn` de missão); o teste de conteúdo confere o uso.
 * Módulo puro (sem three.js/DOM), determinístico: roda em Node.
 */
import { UNITS } from '../data/units.js';
import { BUILDINGS } from '../data/buildings.js';
import { RESEARCH } from '../data/upgrades.js';

export const TECH_KINDS = Object.freeze(['units', 'buildings', 'research', 'heroes']);

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Ficha de pesquisa por nível: `("melee_weapons", 2)` → `"melee_weapons@2"`; nível 1 = o próprio id. */
export const researchToken = (id, level = 1) => (level > 1 ? `${id}@${level}` : id);

/** `"id@2"` → `{ id, level }` (sem `@`: nível 1). */
export function parseResearchToken(token) {
  const m = /^([a-z0-9_]+)(?:@(\d+))?$/.exec(String(token));
  return m ? { id: m[1], level: m[2] ? Number(m[2]) : 1 } : { id: String(token), level: 1 };
}

/** Existe em `src/data` e é um item deste tipo? Devolve texto do erro ou `null`. */
export function techItemProblem(kind, id) {
  if (typeof id !== 'string') return 'deve ser texto';
  switch (kind) {
    case 'units': {
      const u = UNITS[id];
      if (!u) return `unidade desconhecida "${id}"`;
      if (u.isHero) return `"${id}" é herói (use "heroes")`;
      if (u.cost === null || u.cost === undefined) return `"${id}" não é treinável`;
      return null;
    }
    case 'buildings': {
      const b = BUILDINGS[id];
      if (!b) return `construção desconhecida "${id}"`;
      if (b.role === 'camp') return `"${id}" não é construível`;
      return null;
    }
    case 'research': {
      const { id: rid, level } = parseResearchToken(id);
      const r = RESEARCH[rid];
      if (!r) return `pesquisa desconhecida "${id}"`;
      if (level < 1 || level > r.levels.length) return `"${id}": a pesquisa tem ${r.levels.length} nível(is)`;
      return null;
    }
    case 'heroes': {
      const u = UNITS[id];
      if (!u || !u.isHero) return `herói desconhecido "${id}"`;
      return null;
    }
    default:
      return `tipo de item desconhecido "${kind}"`;
  }
}

/** Valida uma `techRestriction` bruta (JSON). @returns {{ok:boolean, errors:string[]}} */
export function validateTechRestriction(cfg) {
  const errors = [];
  if (!isObj(cfg)) return { ok: false, errors: ['techRestriction deve ser um objeto'] };
  if (!Array.isArray(cfg.players) || cfg.players.length === 0 || !cfg.players.every((p) => Number.isInteger(p) && p >= 0)) {
    errors.push('players: lista não vazia de ids de jogador');
  }
  for (const kind of TECH_KINDS) {
    const list = cfg[kind];
    if (!Array.isArray(list)) { errors.push(`${kind}: deve ser uma lista`); continue; }
    const seen = new Set();
    for (const id of list) {
      const prob = techItemProblem(kind, id);
      if (prob) errors.push(`${kind}: ${prob}`);
      else if (seen.has(id)) errors.push(`${kind}: "${id}" repetido`);
      seen.add(id);
    }
  }
  return { ok: errors.length === 0, errors };
}

/** Versão compilada (Sets) de uma `techRestriction` válida. */
export function compileTechRestriction(cfg) {
  const c = {
    players: new Set(cfg.players),
    units: new Set(cfg.units),
    buildings: new Set(cfg.buildings),
    research: new Set(cfg.research),
    heroes: new Set(cfg.heroes),
    later: cfg.later || {}
  };
  return c;
}

const compiledCache = new WeakMap();

/** `techRestriction` compilada da partida (ou `null` = sem restrição). Cache por objeto de config. */
export function techRestrictionOf(gm) {
  const cfg = gm && gm.matchConfig && gm.matchConfig.techRestriction;
  if (!cfg) return null;
  let c = compiledCache.get(cfg);
  if (!c) {
    c = compileTechRestriction(cfg);
    compiledCache.set(cfg, c);
  }
  return c;
}

/**
 * O jogador `playerId` está IMPEDIDO de usar o item? Devolve a "exigência travada" (`{ locked, kind, id, mission }`, no formato
 * dos requisitos de `requirements.js`; `mission` = missão da campanha que libera, ou `null`) ou `null` se pode.
 * @param {'units'|'buildings'|'research'|'heroes'} kind
 * @param {string} id  tipo de unidade/construção, id de pesquisa ou herói
 * @param {number} [level]  só para `research`
 */
export function techLock(gm, playerId, kind, id, level = 1) {
  const c = techRestrictionOf(gm);
  if (!c || !c.players.has(playerId)) return null;
  // ENG-WALL: o Centro extra (Paço Real/Salão do Clã pelo menu do trabalhador) está liberado em TODAS as missões: a tabela de `unlocks`
  // (conferida contra MUNDO-HISTORIA-CAMPANHA.md §4) não o lista. Para escondê-lo numa missão, liste-o como `later` e remova esta exceção.
  if (kind === 'buildings' && BUILDINGS[id] && BUILDINGS[id].role === 'hq') return null;
  let allowed;
  let token = id;
  if (kind === 'units') {
    const base = UNITS[id] && UNITS[id].modelOf;
    allowed = c.units.has(id) || (!!base && c.units.has(base));
  } else if (kind === 'research') {
    token = researchToken(id, level);
    allowed = c.research.has(token);
  } else {
    allowed = c[kind].has(id);
  }
  if (allowed) return null;
  const later = c.later && c.later[kind] ? c.later[kind][token] : undefined;
  return { locked: true, kind, id: token, mission: typeof later === 'number' ? later : null };
}

/** String estável da parte da config que decide a simulação (entra no checksum só quando há restrição). */
export function techHashString(cfg) {
  if (!cfg) return '';
  const sorted = (a) => [...a].sort().join(',');
  return `p:${sorted(cfg.players)};u:${sorted(cfg.units)};b:${sorted(cfg.buildings)};r:${sorted(cfg.research)};h:${sorted(cfg.heroes)}`;
}
