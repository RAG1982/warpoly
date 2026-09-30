#!/usr/bin/env node
/**
 * tools/balance-audit.mjs — F3-11: auditoria de dados (DPS, PV, custo, eficiência) e paridade
 * humano × orc. Puro Node. Uso: node tools/balance-audit.mjs
 * Dano efetivo = média de `computeDamage` contra armadura 0 e contra armadura 4 (1000 golpes, seed 42).
 * Eficiência de custo = DPS × PV / custo (custo = ouro + madeira + pedra; peso 1:1:1).
 */
import { computeDamage } from '../src/sim/combat.js';
import { UNITS } from '../src/data/units.js';
import { createRng } from '../src/sim/rng.js';

const rng = createRng(42);
const avgDmg = (u, armor) => {
  let s = 0;
  for (let i = 0; i < 1000; i++) s += computeDamage(u.damage, { armor, hp: 1000 }, rng);
  return s / 1000;
};
const rows = [];
for (const u of Object.values(UNITS)) {
  if (!u.cost || u.faction === 'neutral') continue;
  const cost = u.cost.gold + u.cost.wood + u.cost.stone;
  const dps0 = avgDmg(u, 0) / u.attackCooldown;
  const dps4 = avgDmg(u, 4) / u.attackCooldown;
  rows.push({ type: u.type, faction: u.faction, hp: u.hp, armor: u.armor, cost, dps0, dps4, eff: (dps4 * u.hp) / cost });
}
console.log('| unidade | facção | PV | armadura | custo | DPS (arm 0) | DPS (arm 4) | eficiência (DPS4×PV/custo) |');
console.log('|---|---|---|---|---|---|---|---|');
for (const r of rows) {
  console.log(`| ${r.type} | ${r.faction} | ${r.hp} | ${r.armor} | ${r.cost} | ${r.dps0.toFixed(2)} | ${r.dps4.toFixed(2)} | ${r.eff.toFixed(1)} |`);
}
const PAIRS = [['villager', 'peon'], ['knight', 'grunt'], ['archer', 'axethrower'], ['ranger', 'berserker']];
console.log('\nParidade humano × orc (eficiência):');
for (const [h, o] of PAIRS) {
  const a = rows.find((r) => r.type === h);
  const b = rows.find((r) => r.type === o);
  if (!a || !b) continue;
  console.log(`- ${h} × ${o}: ${(((b.eff - a.eff) / a.eff) * 100).toFixed(1)}% (orc em relação ao humano)`);
}
