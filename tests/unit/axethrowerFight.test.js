import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { UnitAnimator } from '../../src/animation/UnitAnimator.js';

/**
 * NEW-49 — `applyAxethrowerFight`: a fase de continuação (0,60–0,78) não definia `weaponR.rotation.x` (nem armL/head/torso.x),
 * então o machado saltava para o repouso e voltava à pose do arremesso em 0,78. Amostra a fase inteira com as partes
 * em repouso a cada amostra (como o animador faz a cada quadro) e exige continuidade.
 */
const PARTS = ['torso', 'head', 'armL', 'armR', 'weaponR'];

function sample(p) {
  const parts = {};
  for (const k of PARTS) parts[k] = new THREE.Object3D();
  parts.weaponR.rotation.x = -0.78; // repouso do machado
  UnitAnimator.prototype.applyAxethrowerFight.call({}, p, parts);
  const out = {};
  for (const k of PARTS) out[k] = [parts[k].rotation.x, parts[k].rotation.y, parts[k].rotation.z];
  return out;
}

describe('UnitAnimator.applyAxethrowerFight — continuidade (NEW-49)', () => {
  it('nenhuma parte salta entre amostras de 0,002 de progresso (nem nas fronteiras 0,38 / 0,60 / 0,78)', () => {
    const dp = 0.002;
    let worst = 0;
    let at = '';
    let prev = sample(0);
    for (let p = dp; p <= 1.00001; p += dp) {
      const cur = sample(Math.min(p, 1));
      for (const k of PARTS) for (let a = 0; a < 3; a++) {
        const d = Math.abs(cur[k][a] - prev[k][a]);
        if (d > worst) { worst = d; at = `${k}[${a}] @${p.toFixed(3)}`; }
      }
      prev = cur;
    }
    // o arremesso é a fase mais rápida (~3,25 rad em 0,22 de progresso ≈ 0,03 por amostra): qualquer salto real é ≥ 0,3
    expect(worst, at).toBeLessThan(0.06);
  });

  it('weaponR mantém a pose final do arremesso durante a continuação e fecha no repouso', () => {
    const end = sample(0.5999).weaponR[0];
    expect(sample(0.65).weaponR[0]).toBeCloseTo(end, 1);
    expect(sample(0.77).weaponR[0]).toBeCloseTo(end, 1);
    expect(sample(1).weaponR[0]).toBeCloseTo(-0.78, 5);
  });
});
