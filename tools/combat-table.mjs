#!/usr/bin/env node
/**
 * tools/combat-table.mjs — F3-03 item 7/8: tabela de simulação do modelo de combate WC2
 * (`src/sim/combat.js`, `computeDamage`). Puro Node, **sem navegador** (não usa GameManager/
 * three.js) — só os dados de balanceamento (`src/data/units.js`, `buildings.js`) e o RNG
 * determinístico (`src/sim/rng.js`, mesmo `fork('combat')` usado pelo jogo).
 *
 * Para cada par (atacante × alvo): dano médio/mín/máx em 1000 golpes, nº de golpes até matar
 * (HP do alvo ÷ dano médio, arredondado para cima — sem regenerar HP entre golpes) e tempo até
 * matar num duelo 1×1 (golpes × cooldown de ataque do atacante).
 *
 * Uso: node tools/combat-table.mjs   (sem safe-run — sem navegador/Blender, só Node puro).
 */
import { computeDamage } from '../src/sim/combat.js';
import { UNITS } from '../src/data/units.js';
import { BUILDINGS } from '../src/data/buildings.js';
import { createRng } from '../src/sim/rng.js';

const SEED = 42;
const SAMPLES = 1000;

// { label, damage: {basic,piercing,type}, cooldown }
function attackerFrom(defOrTower, cooldown) {
  return { damage: defOrTower, cooldown };
}

const ATTACKERS = {
  knight: attackerFrom(UNITS.knight.damage, UNITS.knight.attackCooldown),
  archer: attackerFrom(UNITS.archer.damage, UNITS.archer.attackCooldown),
  grunt: attackerFrom(UNITS.grunt.damage, UNITS.grunt.attackCooldown),
  watchtower: attackerFrom(BUILDINGS.watchtower.tower.damage, BUILDINGS.watchtower.tower.cooldown)
};

// { label, armor, hp, isConstructed }
const TARGETS = {
  knight: { armor: UNITS.knight.armor, hp: UNITS.knight.hp },
  grunt: { armor: UNITS.grunt.armor, hp: UNITS.grunt.hp },
  archer: { armor: UNITS.archer.armor, hp: UNITS.archer.hp },
  castle: { armor: BUILDINGS.castle.armor, hp: BUILDINGS.castle.hp, isConstructed: true }
};

const PAIRS = [
  ['knight', 'grunt'],
  ['archer', 'knight'],
  ['grunt', 'archer'],
  ['knight', 'castle'],
  ['archer', 'castle'],
  ['watchtower', 'knight']
];

function measure(attackerKey, targetKey, rng) {
  const attacker = ATTACKERS[attackerKey];
  const target = TARGETS[targetKey];
  const samples = [];
  for (let i = 0; i < SAMPLES; i++) {
    samples.push(computeDamage(attacker.damage, target, rng));
  }
  const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
  const min = Math.min(...samples);
  const max = Math.max(...samples);
  const hitsToKill = Math.ceil(target.hp / avg);
  const timeToKillS = +(hitsToKill * attacker.cooldown).toFixed(1);
  return { avg: +avg.toFixed(2), min, max, hitsToKill, timeToKillS };
}

console.log(`F3-03 — tabela de combate (${SAMPLES} golpes/par, seed ${SEED}, mesma fórmula do jogo)`);
console.log('par (atacante x alvo) | dano médio | mín | máx | golpes p/ matar | tempo p/ matar (s)');

for (const [attackerKey, targetKey] of PAIRS) {
  // Fork isolado por par para o resultado não depender da ordem em que os pares são medidos.
  const rng = createRng(SEED).fork(`combat-table:${attackerKey}x${targetKey}`);
  const r = measure(attackerKey, targetKey, rng);
  console.log(`${attackerKey} x ${targetKey} | ${r.avg} | ${r.min} | ${r.max} | ${r.hitsToKill} | ${r.timeToKillS}`);
}
