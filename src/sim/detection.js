/**
 * detection.js — F4-04: invisibilidade e detecção (puro, sem three.js).
 *
 * Uma unidade com o status `invisible` (`unit.mods.invisible`) NÃO é alvo de auto-aquisição nem de
 * ordem de ataque dos inimigos que não a detectam. Um jogador (`ownerId`) detecta o alvo se:
 *  - o alvo é aliado dele (ou dele mesmo); ou
 *  - alguma unidade aliada dele com `detector: true` (F4-06) está a ≤ `DETECT_RADIUS` do alvo; ou
 *  - alguma construção aliada concluída com `role: 'arcane'` (Torre Arcana/Santuário) está a ≤ `DETECT_RADIUS`; ou
 *  - qualquer unidade aliada viva está a ≤ `DETECT_CONTACT_RADIUS` (contato).
 * Só varre `gm.allUnits`/`gm.buildings` quando o alvo está invisível (raro), então o custo é desprezível.
 */
import { DETECT_RADIUS, DETECT_CONTACT_RADIUS } from '../data/combat.js';
import { getUnitDef, getBuildingDef } from '../data/index.js';

/**
 * O jogador `ownerId` enxerga/pode mirar `target` (unidade)?
 * @param {*} gm
 * @param {*} target  unidade
 * @param {number} ownerId  dono do observador
 */
export function isDetectedBy(gm, target, ownerId) {
  if (!target || !target.mods || !target.mods.invisible) return true;
  if (target.ownerId === ownerId || (gm && gm.isAlly && gm.isAlly(ownerId, target.ownerId))) return true;
  if (!gm) return false;
  const tp = target.mesh.position;
  const units = gm.allUnits || [];
  for (let i = 0; i < units.length; i++) {
    const u = units[i];
    if (u === target || u.isDead || u.isDying || !u.mesh) continue;
    if (u.ownerId !== ownerId && !(gm.isAlly && gm.isAlly(ownerId, u.ownerId))) continue;
    const d = Math.hypot(u.mesh.position.x - tp.x, u.mesh.position.z - tp.z);
    if (d <= DETECT_CONTACT_RADIUS) return true;
    if (d <= DETECT_RADIUS && getUnitDef(u.type).detector) return true;
  }
  const blds = gm.buildings || [];
  for (let i = 0; i < blds.length; i++) {
    const b = blds[i];
    if (b.isDead || !b.isConstructed || !b.mesh) continue;
    if (getBuildingDef(b.type).role !== 'arcane') continue;
    if (b.ownerId !== ownerId && !(gm.isAlly && gm.isAlly(ownerId, b.ownerId))) continue;
    if (Math.hypot(b.mesh.position.x - tp.x, b.mesh.position.z - tp.z) <= DETECT_RADIUS) return true;
  }
  return false;
}
