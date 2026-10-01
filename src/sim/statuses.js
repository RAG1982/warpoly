/**
 * statuses.js — F4-03: status temporários de unidade (puro, sem three.js; testável em Node).
 *
 * `unit.statuses` é um array FIXO de `STATUS_CAPACITY` slots `{id, remaining, source}` (slot livre:
 * `id === null`) — nenhum objeto é alocado por passo. O efeito agregado (`unit.mods`) é cacheado e
 * recalculado só quando um status entra/sai. Só multiplicadores/flags; a regra de jogo vive em
 * `Unit.js` (`speedMul` no movimento, `attackSpeedMul` no cooldown, `damageMul` no dano,
 * `invulnerable` em `takeDamage`). F4-04: `invisible` (detecção em `src/sim/detection.js`),
 * `flameshield` (golpe corpo a corpo devolve dano), `unholy_armor` (invulnerável + perde 50 % do PV atual
 * ao expirar — `onExpire`). `polymorph` (marcador) e `shielded` seguem declarados sem comportamento.
 */

export const STATUS_CAPACITY = 8;

export const STATUS_DEFS = Object.freeze({
  slow: { speedMul: 0.5, dispellable: true },
  haste: { speedMul: 1.5, attackSpeedMul: 1.5, dispellable: true },
  bloodlust: { damageMul: 1.5, attackSpeedMul: 1.5, speedMul: 1.25, dispellable: true },
  invisible: { invisible: true, dispellable: true },
  invulnerable: { invulnerable: true, dispellable: false },
  flameshield: { flameshield: true, dispellable: true },
  unholy_armor: { invulnerable: true, dispellable: false, onEndHpLoss: 0.5 },
  polymorph: { polymorph: true, dispellable: true },
  shielded: { shielded: true, dispellable: true }
});

/** Cria o array de slots (chamado uma vez por unidade). */
export function createStatusSlots() {
  const slots = new Array(STATUS_CAPACITY);
  for (let i = 0; i < STATUS_CAPACITY; i++) slots[i] = { id: null, remaining: 0, source: 0 };
  return slots;
}

/** Objeto de modificadores neutros (um por unidade; reescrito em `recalcMods`). */
export function createMods() {
  return { speedMul: 1, attackSpeedMul: 1, damageMul: 1, invulnerable: false, invisible: false, polymorph: false, shielded: false, flameshield: false };
}

/** Reagrega `unit.mods` a partir dos slots ativos. Multiplicadores se acumulam (produto). */
export function recalcMods(unit) {
  const m = unit.mods;
  m.speedMul = 1;
  m.attackSpeedMul = 1;
  m.damageMul = 1;
  m.invulnerable = false;
  m.invisible = false;
  m.polymorph = false;
  m.shielded = false;
  m.flameshield = false;
  const slots = unit.statuses;
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    if (s.id === null) continue;
    const def = STATUS_DEFS[s.id];
    if (!def) continue;
    if (def.speedMul) m.speedMul *= def.speedMul;
    if (def.attackSpeedMul) m.attackSpeedMul *= def.attackSpeedMul;
    if (def.damageMul) m.damageMul *= def.damageMul;
    if (def.invulnerable) m.invulnerable = true;
    if (def.invisible) m.invisible = true;
    if (def.polymorph) m.polymorph = true;
    if (def.shielded) m.shielded = true;
    if (def.flameshield) m.flameshield = true;
  }
}

/** A unidade tem o status `id` ativo? */
export function hasStatus(unit, id) {
  const slots = unit.statuses;
  for (let i = 0; i < slots.length; i++) if (slots[i].id === id) return true;
  return false;
}

/**
 * Aplica `id` por `duration` s. Se já ativo, renova a duração (mantém a maior). Sem slot livre,
 * substitui o de menor duração restante. Retorna false se `id` é desconhecido.
 */
export function addStatus(unit, id, duration, source = 0) {
  if (!STATUS_DEFS[id]) return false;
  const slots = unit.statuses;
  let free = -1;
  let weakest = 0;
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    if (s.id === id) {
      if (duration > s.remaining) s.remaining = duration;
      s.source = source;
      return true;
    }
    if (s.id === null) { if (free < 0) free = i; } else if (s.remaining < slots[weakest].remaining || slots[weakest].id === null) weakest = i;
  }
  const slot = slots[free >= 0 ? free : weakest];
  slot.id = id;
  slot.remaining = duration;
  slot.source = source;
  recalcMods(unit);
  return true;
}

/** Remove os statuses removíveis (`dispellable`). Retorna quantos saíram. */
export function dispelStatuses(unit) {
  const slots = unit.statuses;
  let n = 0;
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    if (s.id !== null && STATUS_DEFS[s.id] && STATUS_DEFS[s.id].dispellable) {
      s.id = null;
      s.remaining = 0;
      n++;
    }
  }
  if (n > 0) recalcMods(unit);
  return n;
}

/** Remove o status `id` (sem `onExpire`). Retorna true se estava ativo. */
export function removeStatus(unit, id) {
  const slots = unit.statuses;
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    if (s.id === id) {
      s.id = null;
      s.remaining = 0;
      recalcMods(unit);
      return true;
    }
  }
  return false;
}

/** Limpa todos os slots (reposição ao reciclar a unidade). */
export function clearStatuses(unit) {
  const slots = unit.statuses;
  for (let i = 0; i < slots.length; i++) {
    slots[i].id = null;
    slots[i].remaining = 0;
    slots[i].source = 0;
  }
  recalcMods(unit);
}

/**
 * Avança `dt` s; expira status cujo tempo acabou (e recalcula `mods` se algum saiu).
 * `onExpire(unit, id)` (opcional; F4-04) roda DEPOIS de `mods` recalculado, uma vez por status que expirou.
 */
export function tickStatuses(unit, dt, onExpire = null) {
  const slots = unit.statuses;
  let changed = false;
  let expired = null; // só aloca quando há expiração e callback (raro)
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    if (s.id === null) continue;
    s.remaining -= dt;
    if (s.remaining <= 0) {
      const id = s.id;
      s.id = null;
      s.remaining = 0;
      changed = true;
      if (onExpire) {
        if (expired === null) expired = [];
        expired.push(id);
      }
    }
  }
  if (changed) recalcMods(unit);
  if (expired !== null) for (let i = 0; i < expired.length; i++) onExpire(unit, expired[i]);
}
