/**
 * selectors.js — F8-04: resolução de donos, áreas e seletores de entidades das missões.
 *
 * Tudo determinístico: percorre `gm.allUnits` / `gm.buildings` (ordem de criação) e `rt.tags` (ids em ordem de inserção).
 */
import { NEUTRAL_OWNER_ID, NEUTRAL_HOSTILE_ID } from '../EntityIds.js';
import { getBuildingDef } from '../../data/index.js';

/** Entidade viva (unidade fora da animação de morte / construção não destruída). */
export function isAlive(e) {
  return !!e && !e.isDead && !e.isDying && e.state !== 'dying';
}

/** Dono concreto para criar entidades (`spawn`) ou creditar recursos: 'enemy' = primeiro hostil normal. */
export function resolveOwnerId(gm, spec) {
  if (typeof spec === 'number') return spec;
  switch (spec) {
    case 'neutral': return NEUTRAL_OWNER_ID;
    case 'bandits': return NEUTRAL_HOSTILE_ID;
    case 'enemy': { const h = gm.playerRegistry.firstHostileOf(gm.localPlayerId); return h ? h.id : NEUTRAL_HOSTILE_ID; }
    case 'ally': { const a = gm.players.find((p) => p.id !== gm.localPlayerId && gm.isAlly(gm.localPlayerId, p.id)); return a ? a.id : gm.localPlayerId; }
    case 'player':
    case undefined:
    default: return gm.localPlayerId;
  }
}

/** O dono `ownerId` casa com a especificação (`'enemy'` = qualquer hostil ao jogador local, inclusive bandoleiros)? */
export function ownerMatches(gm, spec, ownerId) {
  if (spec === undefined) return true;
  if (typeof spec === 'number') return ownerId === spec;
  const local = gm.localPlayerId;
  switch (spec) {
    case 'player': return ownerId === local;
    case 'enemy': return gm.isHostile(local, ownerId);
    case 'ally': return ownerId !== local && gm.isAlly(local, ownerId);
    case 'neutral': return ownerId === NEUTRAL_OWNER_ID;
    case 'bandits': return ownerId === NEUTRAL_HOSTILE_ID;
    default: return false;
  }
}

/** Ponto dentro da área `{x,z,r}` ou `{x1,z1,x2,z2}`. */
export function inArea(area, x, z) {
  if ('r' in area) {
    const dx = x - area.x;
    const dz = z - area.z;
    return dx * dx + dz * dz <= area.r * area.r;
  }
  return x >= Math.min(area.x1, area.x2) && x <= Math.max(area.x1, area.x2) && z >= Math.min(area.z1, area.z2) && z <= Math.max(area.z1, area.z2);
}

/** Tipo/papel da construção sem custo: cache por tipo. */
const roleCache = new Map();
export function roleOf(buildingType) {
  let r = roleCache.get(buildingType);
  if (r === undefined) {
    const def = getBuildingDef(buildingType);
    r = (def && def.role) || '';
    roleCache.set(buildingType, r);
  }
  return r;
}

function wantedKind(sel) {
  if (sel.kind && sel.kind !== 'any') return sel.kind;
  if (sel.buildingType !== undefined || sel.role !== undefined) return 'building';
  if (sel.unitType !== undefined) return 'unit';
  return 'any';
}

/**
 * Entidades VIVAS que casam com o seletor `{tag?, owner?, unitType?, buildingType?, role?, kind?, area?}`.
 * Por padrão, construções ainda em obra são incluídas; passe `{ builtOnly: true }` para só as concluídas.
 * @returns {object[]}
 */
export function selectEntities(rt, sel, { builtOnly = false } = {}) {
  const gm = rt.gm;
  const out = [];
  if (sel.tag !== undefined) {
    const ids = rt.tags.get(sel.tag);
    if (!ids) return out;
    for (let i = 0; i < ids.length; i++) {
      const e = gm.entitiesById.get(ids[i]);
      if (!isAlive(e)) continue;
      if (sel.owner !== undefined && !ownerMatches(gm, sel.owner, e.ownerId)) continue;
      out.push(e);
    }
    return out;
  }
  const kind = wantedKind(sel);
  const area = sel.area;
  if (kind !== 'building') {
    const units = gm.allUnits;
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      if (!isAlive(u)) continue;
      if (sel.unitType !== undefined && u.type !== sel.unitType) continue;
      if (sel.owner !== undefined && !ownerMatches(gm, sel.owner, u.ownerId)) continue;
      if (area && !inArea(area, u.mesh.position.x, u.mesh.position.z)) continue;
      out.push(u);
    }
  }
  if (kind !== 'unit') {
    const bs = gm.buildings;
    for (let i = 0; i < bs.length; i++) {
      const b = bs[i];
      if (!isAlive(b)) continue;
      if (builtOnly && b.isConstructed === false) continue;
      if (sel.buildingType !== undefined && b.type !== sel.buildingType) continue;
      if (sel.role !== undefined && roleOf(b.type) !== sel.role) continue;
      if (sel.owner !== undefined && !ownerMatches(gm, sel.owner, b.ownerId)) continue;
      if (area && !inArea(area, b.mesh.position.x, b.mesh.position.z)) continue;
      out.push(b);
    }
  }
  return out;
}

/** Comparação numérica por operador textual. */
export function compare(a, op, b) {
  switch (op || '>=') {
    case '==': return a === b;
    case '!=': return a !== b;
    case '>': return a > b;
    case '<': return a < b;
    case '<=': return a <= b;
    case '>=':
    default: return a >= b;
  }
}
