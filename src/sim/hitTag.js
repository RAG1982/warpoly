/**
 * F7-06: classifica o atacante num tag de golpe (`cut | crush | magic | projectile`) — dica PURA de apresentação
 * (animação de morte por tipo de dano). Nenhuma lógica de sim nem o checksum a leem.
 */
export function hitTagFor(attacker) {
  if (!attacker) return 'cut';
  const dmg = attacker.damage && attacker.damage.type;
  if (dmg === 'magic' || attacker.maxMana > 0) return 'magic';
  if (dmg === 'siege' || attacker.projectileType === 'boulder') return 'crush';
  if (attacker.isRanged) return 'projectile';
  return 'cut';
}
