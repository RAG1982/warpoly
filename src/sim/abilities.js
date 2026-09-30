/**
 * abilities.js (sim) — F4-03: lógica de lançamento de habilidades (validação, efeitos, auto-cast).
 *
 * Chamado por `CommandExecutor` (comando `CMD.CAST`) e por `Unit.updateCasting`. Só roda dentro do
 * `simStep` (mana, recarga e efeitos usam `SIM_DT`; RNG determinístico via `gm.combatRng`).
 * Catálogo de dados: `src/data/abilities.js`; status: `src/sim/statuses.js`.
 */
import { getAbility, isDebugUrl, abilityName } from '../data/abilities.js';
import { UNITS } from '../data/units.js';
import { computeDamage } from './combat.js';
import { evalRequirements, formatRequirementList } from './requirements.js';
import { addStatus, dispelStatuses } from './statuses.js';
import { EVT } from './events.js';
import { applySplashDamage } from '../entities/splash.js';

/** Habilidade `id` visível para esta partida (respeita `debugOnly`). */
export function resolveAbility(gm, id) {
  return getAbility(id, { debug: !!(gm && gm.debugAbilities) || isDebugUrl() });
}

/** Alvo precisa ser uma entidade (unidade/construção)? */
export function needsEntityTarget(ability) {
  return ability.target === 'unit' || ability.target === 'ally' || ability.target === 'enemy';
}

const isAlive = e => !!e && !e.isDead && !e.isDying && e.hp > 0;

/** Motivo (PT-BR) pelo qual `target` não serve para `ability` lançada por `caster`, ou `null` se serve. */
export function targetProblem(caster, ability, target) {
  if (!needsEntityTarget(ability)) return null;
  if (!isAlive(target)) return 'Alvo inválido.';
  if (ability.target === 'enemy') {
    if (!caster.isHostileTo(target)) return 'Alvo inválido: precisa ser um inimigo.';
  } else if (ability.target === 'ally') {
    if (!caster.isAlliedWith(target) || target.fullMesh || target.isConstructed !== undefined) return 'Alvo inválido: precisa ser uma unidade aliada.';
  } else if (target.fullMesh || target.isConstructed !== undefined) {
    return 'Alvo inválido: precisa ser uma unidade.';
  }
  return null;
}

/** Recarga restante (s) de `id` na unidade (0 = pronta). */
export function cooldownOf(unit, id) {
  return unit.cooldowns[id] || 0;
}

/**
 * A unidade pode começar a lançar agora? Checa: possui a habilidade, recarga, mana e requisitos.
 * @returns {{ok:boolean, reason?:string}}  `reason` já em PT-BR (usada em NOTIFY).
 */
export function canCast(gm, unit, ability) {
  if (!unit.abilities.includes(ability.id)) return { ok: false, reason: 'Esta unidade não possui a habilidade.' };
  const missing = evalRequirements(ability.requires, unit.ownerId, gm);
  if (missing.length > 0) {
    const player = gm.getPlayer ? gm.getPlayer(unit.ownerId) : null;
    return { ok: false, reason: `⚠️ Requer: ${formatRequirementList(missing, player ? player.factionId : null)}` };
  }
  if (cooldownOf(unit, ability.id) > 0) return { ok: false, reason: '⚠️ Habilidade em recarga' };
  const need = (ability.manaCost || 0) + (ability.manaPerHp > 0 ? ability.manaPerHp : 0);
  if (unit.mana + 1e-6 < need) return { ok: false, reason: '⚠️ Mana insuficiente' };
  return { ok: true };
}

/** Entre `units` que têm a habilidade e podem lançá-la, a de maior mana (empate: menor id). */
export function pickCaster(gm, units, ability) {
  let best = null;
  for (let i = 0; i < units.length; i++) {
    const u = units[i];
    if (!isAlive(u) || !canCast(gm, u, ability).ok) continue;
    if (!best || u.mana > best.mana || (u.mana === best.mana && u.id < best.id)) best = u;
  }
  return best;
}

function spendMana(gm, unit, amount) {
  if (amount <= 0) return;
  unit.mana = Math.max(0, unit.mana - amount);
  if (gm.events) gm.events.emit(EVT.MANA_CHANGED, { unitId: unit.id, ownerId: unit.ownerId, mana: Math.round(unit.mana) });
}

const posOf = v => ({ x: v.x, y: v.y, z: v.z });

/**
 * Aplica os efeitos de `ability` (já validado), debita a mana e inicia a recarga.
 * @param {*} target  entidade-alvo (ou null)
 * @param {number} [x]  alvo no chão
 * @param {number} [z]
 */
export function applyAbility(gm, caster, ability, target, x, z) {
  const cp = caster.mesh.position;
  let px = cp.x;
  let pz = cp.z;
  if (target && target.mesh) { px = target.mesh.position.x; pz = target.mesh.position.z; } else if (typeof x === 'number') { px = x; pz = z; }
  const py = caster.terrain ? caster.terrain.getHeight(px, pz) : 0;

  let cost = ability.manaCost || 0;
  let radius = ability.vfx && ability.vfx.radius ? ability.vfx.radius : 0;
  const recipient = target && target.mesh ? target : caster;

  for (let i = 0; i < ability.effects.length; i++) {
    const fx = ability.effects[i];
    switch (fx.kind) {
      case 'damage': {
        const dmg = { basic: fx.amount, piercing: 0, type: fx.damageType || 'magic' };
        if (fx.radius > 0) {
          radius = fx.radius;
          applySplashDamage(gm, caster, dmg, { x: px, z: pz }, fx.radius, gm.allUnits);
        } else if (target && isAlive(target)) {
          target.takeDamage(computeDamage(dmg, target, gm.combatRng), caster, gm.allUnits);
        }
        break;
      }
      case 'heal': {
        if (!isAlive(recipient) || recipient.maxHp === undefined) break;
        const missing = recipient.maxHp - recipient.hp;
        let heal = fx.perManaHp > 0 ? Infinity : fx.amount;
        heal = Math.min(heal, missing);
        if (fx.perManaHp > 0) {
          heal = Math.min(heal, Math.max(0, caster.mana - cost) * fx.perManaHp);
          cost += heal / fx.perManaHp;
        } else if (ability.manaPerHp > 0) {
          heal = Math.min(heal, Math.max(0, caster.mana - cost) / ability.manaPerHp);
          cost += heal * ability.manaPerHp;
        }
        if (heal > 0) {
          recipient.hp = Math.min(recipient.maxHp, recipient.hp + heal);
          if (recipient.updateHealthBar) recipient.updateHealthBar();
        }
        break;
      }
      case 'status':
        if (recipient.statuses) addStatus(recipient, fx.id, fx.duration, caster.id);
        break;
      case 'dispel':
        if (recipient.statuses) dispelStatuses(recipient);
        break;
      case 'summon':
        summonUnits(gm, caster, fx);
        break;
      default:
        break;
    }
  }

  spendMana(gm, caster, cost);
  caster.cooldowns[ability.id] = ability.cooldown || 0;
  if (gm.events) {
    const payload = { abilityId: ability.id, ownerId: caster.ownerId, pos: { x: px, y: py, z: pz }, unitId: caster.id };
    if (radius > 0) payload.radius = radius;
    if (target && target.id !== undefined) payload.targetId = target.id;
    gm.events.emit(EVT.ABILITY_EFFECT, payload);
  }
}

/** Stub de `summon` (F4-04): cria `count` unidades temporárias ao redor do lançador. */
function summonUnits(gm, caster, fx) {
  if (!UNITS[fx.unitType] || !gm.spawnUnit) return;
  const n = fx.count || 1;
  const cp = caster.mesh.position;
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2;
    const u = gm.spawnUnit(fx.unitType, cp.x + Math.cos(ang) * 2, cp.z + Math.sin(ang) * 2, caster.ownerId);
    if (u && fx.lifetime > 0) u.lifetime = fx.lifetime;
  }
}

/** Emite `ABILITY_CAST` (início do lançamento). */
export function emitCastStart(gm, caster, ability, target) {
  if (!gm.events) return;
  const tp = target && target.mesh ? target.mesh.position : caster.mesh.position;
  const payload = { unitId: caster.id, ownerId: caster.ownerId, abilityId: ability.id, pos: posOf(tp) };
  if (target && target.id !== undefined) payload.targetId = target.id;
  gm.events.emit(EVT.ABILITY_CAST, payload);
}

/**
 * Auto-cast: procura um alvo válido dentro de `ability.range` do lançador. Retorna `{target}` ou `null`.
 * `enemy`: hostil mais próximo (unidade); `ally`/`unit`: aliado ferido (menor PV relativo) — só se a
 * habilidade cura (`heal`); `none`/`self`: lança se há hostil próximo. `ground` não suporta auto-cast.
 */
export function findAutocastTarget(gm, caster, ability) {
  const p = caster.mesh.position;
  const list = gm.allUnits;
  let best = null;
  let bestScore = Infinity;
  const heals = ability.effects.some(e => e.kind === 'heal');
  for (let i = 0; i < list.length; i++) {
    const u = list[i];
    if (!isAlive(u)) continue;
    const d = Math.hypot(u.mesh.position.x - p.x, u.mesh.position.z - p.z);
    if (d > ability.range) continue;
    let score;
    if (ability.target === 'enemy' || ability.target === 'none' || ability.target === 'self') {
      if (!caster.isHostileTo(u)) continue;
      score = d;
    } else if (ability.target === 'ally' || ability.target === 'unit') {
      if (!caster.isAlliedWith(u)) continue;
      if (heals && u.hp >= u.maxHp) continue;
      score = u.hp / u.maxHp;
    } else continue;
    if (score < bestScore) { bestScore = score; best = u; }
  }
  if (ability.target === 'none' || ability.target === 'self') return best ? { target: null } : null;
  return best ? { target: best } : null;
}

/**
 * Unidades da seleção que definem o card de habilidades: as do tipo mais numeroso entre as que têm
 * habilidades (empate: o tipo que aparece primeiro). Vazio se ninguém tem habilidades.
 */
export function selectionAbilityUnits(selected) {
  const counts = new Map();
  for (let i = 0; i < selected.length; i++) {
    const u = selected[i];
    if (u.isDead || !u.abilities || u.abilities.length === 0) continue;
    counts.set(u.type, (counts.get(u.type) || 0) + 1);
  }
  let bestType = null;
  let bestN = 0;
  for (const [type, n] of counts) if (n > bestN) { bestN = n; bestType = type; }
  if (bestType === null) return [];
  return selected.filter(u => !u.isDead && u.type === bestType && u.abilities && u.abilities.length > 0);
}

export { abilityName };
