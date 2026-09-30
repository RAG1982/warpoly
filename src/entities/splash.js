import { Building } from './Building.js';
import { computeDamage } from '../sim/combat.js';

/**
 * F4-02 — dano em área do cerco.
 *
 * `applySplashDamage` atinge TODAS as entidades hostis ao `owner` (unidades e construções vivas)
 * cujo centro (x,z) esteja a ≤ `radius` de `pos`. Queda linear: 100 % no centro → `edge` na borda
 * (padrão 50 % para o cerco; 40 % nos sapadores — F4-05).
 * Sem fogo amigo (só `owner.isHostileTo`). Contrato de RNG: 1 `computeDamage` por entidade atingida,
 * em ordem crescente de `id` (determinismo). Buffers de módulo: não aloca por chamada.
 */

const _units = [];
const _blds = [];
const _all = [];

/** Multiplicador de queda: 1 no centro, `edge` (padrão 0,5) na borda. */
export function splashFalloff(dist, radius, edge = 0.5) {
  if (radius <= 0) return 1;
  return 1 - (1 - edge) * Math.min(1, dist / radius);
}

/**
 * @param {import('../core/GameManager.js').GameManager} gm
 * @param {import('./Unit.js').Unit} owner  quem disparou (define hostilidade e recebe o crédito)
 * @param {{basic:number,piercing:number,type:string}} damage
 * @param {{x:number,z:number}} pos  ponto de impacto
 * @param {number} radius
 * @param {Array} allUnits
 * @param {number} [edge=0.5]  multiplicador de dano na borda do raio
 * @param {boolean} [surface=false]  mede a distância até a SUPERFÍCIE da entidade (centro − `collisionRadius`),
 *   não até o centro (F4-05: a explosão do sapador alcança segmentos de muralha vizinhos)
 * @returns {number} quantas entidades foram atingidas
 */
export function applySplashDamage(gm, owner, damage, pos, radius, allUnits, edge = 0.5, surface = false) {
  _all.length = 0;
  const alive = e => !e.isDead && !e.isDying && e.hp > 0 && owner.isHostileTo(e);
  gm.unitGrid.queryRadius(pos.x, pos.z, radius, alive, _units);
  gm.blockerGrid.queryRadius(pos.x, pos.z, radius, e => e instanceof Building && alive(e), _blds);
  for (let i = 0; i < _units.length; i++) _all.push(_units[i]);
  for (let i = 0; i < _blds.length; i++) _all.push(_blds[i]);
  _all.sort((a, b) => a.id - b.id);

  let hits = 0;
  for (let i = 0; i < _all.length; i++) {
    const e = _all[i];
    const d0 = Math.hypot(e.mesh.position.x - pos.x, e.mesh.position.z - pos.z);
    const d = surface ? Math.max(0, d0 - (e.collisionRadius || 0)) : d0;
    if (d > radius) continue;
    const dmg = Math.max(1, Math.round(computeDamage(damage, e, gm.combatRng) * splashFalloff(d, radius, edge)));
    e.takeDamage(dmg, owner, allUnits);
    hits++;
  }
  _all.length = 0;
  _units.length = 0;
  _blds.length = 0;
  return hits;
}
