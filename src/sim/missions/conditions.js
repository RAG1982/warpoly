/**
 * conditions.js — F8-04: avaliação das condições dos gatilhos (`time`, `every`, `area`, `dead`, `count`, `var`,
 * `objective`, `resource`, `trigger`) e dos combinadores `all` / `any` / `not`. Sem efeitos colaterais.
 */
import { SIM_DT } from '../constants.js';
import { compare, inArea, isAlive, ownerMatches, resolveOwnerId, selectEntities } from './selectors.js';

const ticksOf = (seconds) => Math.max(1, Math.round(seconds / SIM_DT));

/**
 * @param {import('./MissionRuntime.js').MissionRuntime} rt
 * @param {object} cond
 * @returns {boolean}
 */
export function evalCondition(rt, cond) {
  if (cond.all) { for (let i = 0; i < cond.all.length; i++) if (!evalCondition(rt, cond.all[i])) return false; return true; }
  if (cond.any) { for (let i = 0; i < cond.any.length; i++) if (evalCondition(rt, cond.any[i])) return true; return false; }
  if (cond.not) return !evalCondition(rt, cond.not);
  const gm = rt.gm;
  switch (cond.type) {
    case 'time':
      return rt.tick * SIM_DT + 1e-9 >= cond.at;
    case 'every': {
      const start = Math.round((cond.start ?? 0) / SIM_DT);
      const period = ticksOf(cond.seconds);
      return rt.tick > 0 && rt.tick >= start && (rt.tick - start) % period === 0;
    }
    case 'area': {
      const need = cond.count ?? 1;
      const owner = cond.owner ?? 'player';
      let n = 0;
      const ids = cond.tag !== undefined ? rt.tags.get(cond.tag) : null;
      if (cond.tag !== undefined && !ids) return false;
      const list = ids ? ids.map((id) => gm.entitiesById.get(id)) : gm.allUnits;
      for (let i = 0; i < list.length; i++) {
        const u = list[i];
        if (!isAlive(u) || u.type === undefined) continue;
        if (!ownerMatches(gm, owner, u.ownerId)) continue;
        if (cond.unitType !== undefined && u.type !== cond.unitType) continue;
        if (!inArea(cond.area, u.mesh.position.x, u.mesh.position.z)) continue;
        if (++n >= need) return true;
      }
      return false;
    }
    case 'dead': {
      let need = cond.count;
      if (need === undefined) {
        if (cond.select.tag !== undefined) { const ids = rt.tags.get(cond.select.tag); need = ids ? ids.length : 0; } else need = 1;
      }
      return need > 0 && rt.deathCount(cond.select) >= need;
    }
    case 'count':
      return compare(selectEntities(rt, cond.select, { builtOnly: true }).length, cond.op, cond.value);
    case 'var':
      return compare(rt.vars[cond.name], cond.op || '==', cond.value);
    case 'objective': {
      const o = rt.objectives.get(cond.id);
      return !!o && o.status === cond.status;
    }
    case 'resource': {
      const p = gm.getPlayer(resolveOwnerId(gm, cond.owner ?? 'player'));
      return !!p && compare(p.resources[cond.resource] || 0, cond.op, cond.value);
    }
    case 'trigger': {
      const t = rt.triggers.get(cond.id);
      return !!t && t.fired > 0;
    }
    default:
      return false;
  }
}
