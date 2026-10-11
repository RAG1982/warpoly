import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { UnitAnimator } from '../../src/animation/UnitAnimator.js';
import { blendWeight, BLEND_DURATION } from '../../src/animation/animMath.js';

/**
 * F7-06 (fechamento): o cross-fade tem de ser exatamente (1-w)·pose antiga + w·pose crua para TODAS as partes.
 * O Arremessador de Machados expõe o mesmo nó por três chaves (`weapon`, `weaponR`, `drawnAxe` em AxethrowerModel.js);
 * sem deduplicar `_blendObjs` o machado era misturado 3 vezes (peso w^3) e ficava atrás do braço durante a troca.
 */
function fakeAxethrower() {
  const root = new THREE.Group();
  const mk = (name) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.Material());
    m.name = name;
    root.add(m);
    return m;
  };
  const torso = mk('Torso');
  const head = mk('Head');
  const armL = mk('ArmL');
  const armR = mk('ArmR');
  const legL = mk('LegL');
  const legR = mk('LegR');
  const weaponR = mk('WeaponR');
  root.userData = { torso, head, armL, armR, legL, legR, weapon: weaponR, weaponR, drawnAxe: weaponR };
  return { root, weaponR };
}

const snap = (an) => an._blendObjs.map((o) => [o.position.x, o.position.y, o.position.z, o.rotation.x, o.rotation.y, o.rotation.z, o.scale.x, o.scale.y, o.scale.z]);

describe('UnitAnimator — cross-fade (F7-06)', () => {
  it('partes referenciadas por várias chaves entram UMA vez em _blendObjs', () => {
    const { root, weaponR } = fakeAxethrower();
    const an = new UnitAnimator(root, 'axethrower');
    expect(an._blendObjs.filter((o) => o === weaponR)).toHaveLength(1);
    expect(new Set(an._blendObjs).size).toBe(an._blendObjs.length);
    expect(an._blendObjs).toHaveLength(7);
  });

  it('pose exibida = (1-w)·antiga + w·crua em todas as partes (inclusive a referenciada por 3 chaves) e converge ao fim do blend', () => {
    const { root } = fakeAxethrower();
    const an = new UnitAnimator(root, 'axethrower');
    an.setAnimation('fight', true);
    an._blendT = 99; // sem blend pendente
    an.setTime(0.35);
    for (let i = 0; i < 10; i++) an.update(1 / 60); // golpe em andamento
    const pre = snap(an);
    an.setAnimation('idle'); // captura a pose atual e zera o relógio do blend
    const raw0 = snap(an); // pose crua do início do novo estado = o que um corte seco mostraria
    let hard = 0;
    raw0.forEach((row, i) => row.forEach((v, j) => { hard = Math.max(hard, Math.abs(v - pre[i][j])); }));
    expect(hard).toBeGreaterThan(0.5); // o teste só vale se o corte seco seria um salto grande
    let maxErr = 0;
    let moved = 0;
    for (let k = 1; k <= 14; k++) {
      an.update(1 / 60);
      const shown = snap(an);
      an._applyPoseRaw(an.time);
      const raw = snap(an);
      const w = blendWeight(k / 60);
      shown.forEach((row, i) => row.forEach((v, j) => {
        maxErr = Math.max(maxErr, Math.abs(v - ((1 - w) * pre[i][j] + w * raw[i][j])));
        if (k === 1) moved = Math.max(moved, Math.abs(v - pre[i][j]));
      }));
      if (k / 60 >= BLEND_DURATION) expect(w).toBe(1);
    }
    expect(maxErr).toBeLessThan(1e-6);
    expect(moved).toBeLessThan(0.1 * hard); // 1º quadro: a menos de 10 % do salto de um corte seco (smoothstep: w(1/60 s) ≈ 0,039)
  });
});
