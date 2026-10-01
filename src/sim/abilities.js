/**
 * abilities.js (sim) — F4-03: lógica de lançamento de habilidades (validação, efeitos, auto-cast).
 *
 * Chamado por `CommandExecutor` (comando `CMD.CAST`) e por `Unit.updateCasting`. Só roda dentro do
 * `simStep` (mana, recarga e efeitos usam `SIM_DT`; RNG determinístico via `gm.combatRng`).
 * Catálogo de dados: `src/data/abilities.js`; status: `src/sim/statuses.js`.
 */
import { getAbility, isDebugUrl, abilityName } from '../data/abilities.js';
import * as THREE from 'three';
import { UNITS } from '../data/units.js';
import { BallisticProjectile, ballisticFlightTime } from '../entities/BallisticProjectile.js';
import { computeDamage } from './combat.js';
import { evalRequirements, formatRequirementList } from './requirements.js';
import { addStatus, dispelStatuses } from './statuses.js';
import { EVT } from './events.js';
import { applySplashDamage } from '../entities/splash.js';
import { getUnitDef } from '../data/index.js';

const CHANNEL_FX = fx => fx.kind === 'channel';

/** Efeito `channel` da habilidade (ou null). */
export function getChannel(ability) {
  for (let i = 0; i < ability.effects.length; i++) if (CHANNEL_FX(ability.effects[i])) return ability.effects[i];
  return null;
}

/** A unidade `target` pode ser transmutada? (não herói, cerco, suicida nem ovelha) */
export function canPolymorph(target) {
  if (!target || target.fullMesh || target.isConstructed !== undefined) return false;
  const d = getUnitDef(target.type);
  return !(d.isHero || d.isSiege || d.suicide || target.type === 'sheep');
}

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
  if (ability.effects.some(e => e.kind === 'polymorph') && !canPolymorph(target)) return 'Alvo inválido: não pode ser transmutado.';
  if (ability.effects.some(e => e.kind === 'exorcism') && !getUnitDef(target.type).undead) return 'Alvo inválido: só funciona contra mortos-vivos.';
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
  const rd = ability.effects.find(e => e.kind === 'raise_dead');
  if (rd && gm.corpses && gm.corpses.countNear(unit.mesh.position.x, unit.mesh.position.z, rd.radius) === 0) {
    return { ok: false, reason: '⚠️ Nenhum cadáver por perto' };
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
          const dealt = computeDamage(dmg, target, gm.combatRng);
          target.takeDamage(dealt, caster, gm.allUnits);
          if (fx.lifesteal > 0 && isAlive(caster)) {
            caster.hp = Math.min(caster.maxHp, caster.hp + dealt * fx.lifesteal);
            if (caster.updateHealthBar) caster.updateHealthBar();
          }
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
        summonUnits(gm, caster, fx, px, pz);
        break;
      case 'line_damage':
        if (isAlive(target)) fireLine(gm, caster, fx, target);
        break;
      case 'polymorph':
        if (isAlive(target) && canPolymorph(target)) gm.polymorphUnit(target, fx.unitType || 'sheep');
        break;
      case 'reveal':
        // Vista Sagrada: a névoa é de apresentação (só o jogador local/aliados enxergam o efeito).
        if (gm.fogOfWar && gm.fogOfWar.revealArea && (caster.ownerId === gm.localPlayerId || (gm.isAlly && gm.isAlly(gm.localPlayerId, caster.ownerId)))) {
          gm.fogOfWar.revealArea(px, pz, fx.radius, fx.duration);
        }
        radius = fx.radius;
        break;
      case 'exorcism': {
        if (!isAlive(target) || !getUnitDef(target.type).undead) break;
        const dealt = Math.max(1, Math.floor(Math.min(target.hp, Math.max(0, caster.mana - cost) / fx.manaPerHp)));
        if (caster.mana - cost + 1e-6 < dealt * fx.manaPerHp) break;
        cost += dealt * fx.manaPerHp;
        target.takeDamage(dealt, caster, gm.allUnits);
        break;
      }
      case 'runes':
        if (gm.hazards) gm.hazards.spawnRunes(caster.ownerId, px, pz, fx);
        radius = fx.radius;
        break;
      case 'whirlwind':
        if (gm.hazards) gm.hazards.spawnWhirlwind(caster.ownerId, px, pz, fx);
        break;
      case 'raise_dead': {
        const spots = [];
        const n = gm.corpses ? gm.corpses.consume(cp.x, cp.z, fx.radius, fx.maxCorpses, spots) : 0;
        for (let k = 0; k < n; k++) spawnSummons(gm, caster, fx.unitType, 1, spots[k].x, spots[k].z, fx.lifetime);
        break;
      }
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

/** Cria `count` unidades temporárias em anel de raio 1,5 ao redor de (x,z): dono = lançador, sem suprimento. */
function spawnSummons(gm, caster, unitType, count, x, z, lifetime) {
  if (!UNITS[unitType] || !gm.spawnUnit) return;
  for (let i = 0; i < count; i++) {
    const ang = (i / count) * Math.PI * 2;
    const off = count > 1 ? 1.5 : 0;
    const u = gm.spawnUnit(unitType, x + Math.cos(ang) * off, z + Math.sin(ang) * off, caster.ownerId);
    if (!u) continue;
    u.summoned = true;
    if (lifetime > 0) u.lifetime = lifetime;
  }
  const owner = gm.getPlayer ? gm.getPlayer(caster.ownerId) : null;
  if (owner) owner.recalculatePop(gm);
}

function summonUnits(gm, caster, fx, px, pz) {
  spawnSummons(gm, caster, fx.unitType, fx.count || 1, px, pz, fx.lifetime);
}

/** Bola de Fogo: projétil balístico até o alvo; no impacto atinge até `maxTargets` numa linha. */
function fireLine(gm, caster, fx, target) {
  const cp = caster.mesh.position;
  const from = { x: cp.x, y: cp.y + 1.68, z: cp.z };
  const tp = target.mesh.position;
  const dist = Math.hypot(tp.x - cp.x, tp.z - cp.z);
  let dx = (tp.x - cp.x) / (dist || 1);
  let dz = (tp.z - cp.z) / (dist || 1);
  if (dist < 1e-6) { dx = 0; dz = 1; }
  const impact = { x: tp.x, y: tp.y, z: tp.z };
  const onImpact = () => lineDamage(gm, caster, fx, impact.x, impact.z, dx, dz);
  if (!gm.arrows || !caster.scene) { onImpact(); return; }
  const kind = fx.projectile || 'bolt';
  const start = new THREE.Vector3(from.x, from.y, from.z);
  const proj = new BallisticProjectile(caster.scene, start, impact, kind, onImpact);
  proj.duration = Math.min(proj.duration, ballisticFlightTime(dist, kind));
  gm.arrows.push(proj);
  if (gm.registerEntity) gm.registerEntity(proj, caster.ownerId);
}

const _cand = [];
function lineDamage(gm, caster, fx, x0, z0, dx, dz) {
  const len = fx.length;
  const r = fx.radius;
  const cx = x0 + dx * len / 2;
  const cz = z0 + dz * len / 2;
  _cand.length = 0;
  const list = [];
  gm.unitGrid.queryRadius(cx, cz, len / 2 + r + 1, u => isAlive(u) && caster.isHostileTo(u), list);
  for (let i = 0; i < list.length; i++) {
    const u = list[i];
    const ux = u.mesh.position.x - x0;
    const uz = u.mesh.position.z - z0;
    let t = ux * dx + uz * dz;
    t = Math.max(0, Math.min(len, t));
    const d = Math.hypot(ux - dx * t, uz - dz * t) - (u.collisionRadius || 0) * 0.5;
    if (d <= r) _cand.push({ u, t });
  }
  _cand.sort((a, b) => a.t - b.t || a.u.id - b.u.id);
  const hit = _cand.slice(0, fx.maxTargets).map(c => c.u).sort((a, b) => a.id - b.id);
  const dmg = { basic: fx.amount, piercing: 0, type: fx.damageType || 'magic' };
  for (let i = 0; i < hit.length; i++) {
    if (isAlive(hit[i])) hit[i].takeDamage(computeDamage(dmg, hit[i], gm.combatRng), caster, gm.allUnits);
  }
  _cand.length = 0;
  if (gm.events) gm.events.emit(EVT.ABILITY_EFFECT, { abilityId: 'fireball', ownerId: caster.ownerId, pos: { x: x0, y: 0, z: z0 }, unitId: caster.id });
}

/**
 * Uma onda de canalização: cobra `ability.manaCost` (retorna false se faltar) e causa o dano da onda em (x,z).
 */
export function applyChannelWave(gm, caster, ability, channel, x, z) {
  const cost = ability.manaCost || 0;
  if (caster.mana + 1e-6 < cost) return false;
  spendMana(gm, caster, cost);
  const w = channel.wave;
  applySplashDamage(gm, caster, { basic: w.amount, piercing: 0, type: w.damageType || 'magic' }, { x, z }, w.radius, gm.allUnits, 1);
  if (gm.events) {
    const y = caster.terrain ? caster.terrain.getHeight(x, z) : 0;
    gm.events.emit(EVT.ABILITY_EFFECT, { abilityId: ability.id, ownerId: caster.ownerId, pos: { x, y, z }, radius: w.radius, unitId: caster.id });
  }
  return true;
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
      if (ability.autocastBelow > 0 && u.hp / u.maxHp >= ability.autocastBelow) continue; // F4-04b: Cura só abaixo de 60 %
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
