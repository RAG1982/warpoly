/**
 * objectives.js — F8-04: avaliação dos tipos de objetivo (`destroy`, `survive`, `escort`, `rescue`, `build`, `collect`,
 * `eliminate`, `flag`). Cada avaliador lê o estado da simulação e devolve `{ status, cur, max }`, onde `status` é
 * 'completed' | 'failed' | null (sem mudança) e `cur`/`max` alimentam o progresso do painel. Sem efeitos colaterais.
 */
import { SIM_DT } from '../constants.js';
import { evalCondition } from './conditions.js';
import { isAlive, inArea, ownerMatches, selectEntities, resolveOwnerId, roleOf } from './selectors.js';

/** Papéis de construção que não contam em "eliminar" (mesma regra de `victory.js`). */
const NON_COUNTING_ROLES = new Set(['wall', 'platform']);

/** Tipos avaliados a cada tick; os demais (varreduras) a cada `POLL_TICKS`. */
export const EXACT_TYPES = new Set(['survive', 'flag']);
export const POLL_TICKS = 5;

const EVALUATORS = {
  destroy(rt, o, st) {
    const def = o.def;
    let need = def.count;
    if (need === undefined) {
      if (def.select.tag !== undefined) {
        const ids = rt.tags.get(def.select.tag);
        need = ids ? ids.length : 0;
      } else need = 1;
    }
    if (need <= 0) return { status: null, cur: 0, max: 0 };
    const cur = Math.min(need, rt.deathCount(def.select));
    return { status: cur >= need ? 'completed' : null, cur, max: need };
  },

  survive(rt, o, st) {
    const elapsed = (rt.tick - st.startTick) * SIM_DT;
    const cur = Math.min(o.def.seconds, Math.max(0, elapsed));
    return { status: elapsed + 1e-9 >= o.def.seconds ? 'completed' : null, cur: Math.floor(cur), max: o.def.seconds };
  },

  escort(rt, o) {
    const def = o.def;
    const ids = rt.tags.get(def.tag) || [];
    const need = def.count ?? 1;
    let alive = 0;
    let inside = 0;
    for (let i = 0; i < ids.length; i++) {
      const e = rt.gm.entitiesById.get(ids[i]);
      if (!isAlive(e)) continue;
      alive++;
      if (inArea(def.area, e.mesh.position.x, e.mesh.position.z)) inside++;
    }
    if (ids.length === 0) return { status: null, cur: 0, max: need };
    if (inside >= need) return { status: 'completed', cur: need, max: need };
    return { status: alive < need ? 'failed' : null, cur: inside, max: need };
  },

  rescue(rt, o) {
    const def = o.def;
    const ids = rt.tags.get(def.tag) || [];
    const owner = def.owner ?? 'player';
    let rescued = 0;
    let alive = 0;
    for (let i = 0; i < ids.length; i++) {
      const e = rt.gm.entitiesById.get(ids[i]);
      if (!isAlive(e)) continue;
      alive++;
      if (ownerMatches(rt.gm, owner, e.ownerId)) rescued++;
    }
    const need = def.count ?? Math.max(1, ids.length);
    if (ids.length === 0) return { status: null, cur: 0, max: need };
    if (rescued >= need) return { status: 'completed', cur: need, max: need };
    return { status: alive < need ? 'failed' : null, cur: rescued, max: need };
  },

  build(rt, o) {
    const def = o.def;
    const sel = { kind: 'building', owner: def.owner ?? 'player' };
    if (def.buildingType !== undefined) sel.buildingType = def.buildingType;
    if (def.role !== undefined) sel.role = def.role;
    const cur = Math.min(def.count, selectEntities(rt, sel, { builtOnly: true }).length);
    return { status: cur >= def.count ? 'completed' : null, cur, max: def.count };
  },

  collect(rt, o) {
    const def = o.def;
    const ownerId = resolveOwnerId(rt.gm, def.owner ?? 'player');
    let raw;
    if ((def.mode ?? 'gathered') === 'stock') {
      const p = rt.gm.getPlayer(ownerId);
      raw = p ? p.resources[def.resource] || 0 : 0;
    } else {
      raw = rt.gathered(ownerId, def.resource);
    }
    const cur = Math.min(def.amount, Math.floor(raw));
    return { status: cur >= def.amount ? 'completed' : null, cur, max: def.amount };
  },

  eliminate(rt, o) {
    const def = o.def;
    const gm = rt.gm;
    const include = def.include ?? 'all';
    const owners = def.owners ?? gm.players.filter((p) => p.id !== gm.localPlayerId && gm.isHostile(gm.localPlayerId, p.id)).map((p) => p.id);
    let left = 0;
    if (include !== 'buildings') {
      const us = gm.allUnits;
      for (let i = 0; i < us.length; i++) {
        const u = us[i];
        if (isAlive(u) && ownersHas(gm, owners, u.ownerId)) left++;
      }
    }
    if (include !== 'units') {
      const bs = gm.buildings;
      for (let i = 0; i < bs.length; i++) {
        const b = bs[i];
        if (isAlive(b) && !NON_COUNTING_ROLES.has(roleOf(b.type)) && ownersHas(gm, owners, b.ownerId)) left++;
      }
    }
    // O total inicial (para a barra de progresso) é o maior valor já visto.
    if (left > (o.max || 0)) o.max = left;
    return { status: left === 0 ? 'completed' : null, cur: (o.max || 0) - left, max: o.max || 0 };
  },

  flag(rt, o) {
    const ok = evalCondition(rt, o.def.condition);
    return { status: ok ? 'completed' : null, cur: ok ? 1 : 0, max: 1 };
  }
};

function ownersHas(gm, owners, ownerId) {
  for (let i = 0; i < owners.length; i++) if (ownerMatches(gm, owners[i], ownerId)) return true;
  return false;
}

/**
 * Avalia um objetivo ativo. `failWhen` (qualquer tipo) é checado depois da conclusão.
 * @returns {{status: 'completed'|'failed'|null, cur: number, max: number}}
 */
export function evalObjective(rt, o) {
  const r = EVALUATORS[o.def.type](rt, o, o);
  if (r.status === null && o.def.failWhen && evalCondition(rt, o.def.failWhen)) r.status = 'failed';
  return r;
}
