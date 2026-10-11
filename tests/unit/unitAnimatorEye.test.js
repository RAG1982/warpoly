import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { UnitAnimator, ANIMATION_DURATIONS } from '../../src/animation/UnitAnimator.js';

/**
 * F7-00b: tentáculos articulados do Olho Vigia. O .glb (`tools/blender/build_watching_eye.py`) tem
 * WatchingEye > Torso > { Body, Fin, Anim_Tentacle0..5 > TentacleN }; o `UnitAnimator` ondula `rotation.x/z` de cada
 * `Anim_Tentacle*` (pivô no ponto de fixação) sem tocar na malha.
 */
function fakeEye(n = 6) {
  const root = new THREE.Group();
  root.name = 'WatchingEye';
  const torso = new THREE.Group();
  torso.name = 'Torso';
  torso.position.set(0, 2.4, 0);
  root.add(torso);
  const mesh = (name) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.Material());
    m.name = name;
    return m;
  };
  torso.add(mesh('Body'), mesh('Fin'));
  const pivots = [];
  for (let i = 0; i < n; i++) {
    const p = new THREE.Group();
    p.name = `Anim_Tentacle${i}`;
    p.position.set(0.4 * Math.sin(i), -0.4, 0.4 * Math.cos(i));
    p.add(mesh(`Tentacle${i}`));
    torso.add(p);
    pivots.push(p);
  }
  root.userData = { torso };
  return { root, torso, pivots };
}

describe('Olho Vigia — tentáculos articulados (F7-00b)', () => {
  it('só o Olho Vigia coleta os nós Anim_Tentacle*; entram em meshParts (reset e cross-fade)', () => {
    const { root, pivots } = fakeEye();
    const an = new UnitAnimator(root, 'watching_eye');
    expect(an._tentacles).toHaveLength(6);
    expect(an._tentacles).toEqual(pivots);
    expect(an.meshParts.tentacle0).toBe(pivots[0]);
    expect(an.meshParts.tentacle5).toBe(pivots[5]);
    pivots.forEach((p) => expect(an._blendObjs).toContain(p));
    // outros tipos de modelo ignoram os nós (nenhum custo por quadro)
    expect(new UnitAnimator(fakeEye().root, 'knight')._tentacles).toHaveLength(0);
    // religar o animador a outro modelo não acumula tentáculos do anterior
    an.bindModel(fakeEye(3).root, 'watching_eye');
    expect(an._tentacles).toHaveLength(3);
  });

  it('em idle os tentáculos ondulam de leve, defasados, dentro das amplitudes e sem emenda no laço', () => {
    const { root, pivots } = fakeEye();
    const an = new UnitAnimator(root, 'watching_eye');
    const dur = ANIMATION_DURATIONS.idle;
    let maxX = 0;
    let maxZ = 0;
    for (let k = 0; k < 40; k++) {
      an.setTime((k / 40) * dur);
      pivots.forEach((p) => {
        maxX = Math.max(maxX, Math.abs(p.rotation.x));
        maxZ = Math.max(maxZ, Math.abs(p.rotation.z));
      });
    }
    expect(maxX).toBeGreaterThan(0.08); // há movimento visível...
    expect(maxX).toBeLessThanOrEqual(0.16 * 0.7 + 1e-9); // ...mas leve (rotação ≤ ~6,4°)
    expect(maxZ).toBeGreaterThan(0.05);
    expect(maxZ).toBeLessThanOrEqual(0.12 * 0.7 + 1e-9);
    an.setTime(0.5);
    expect(Math.abs(pivots[0].rotation.x - pivots[1].rotation.x)).toBeGreaterThan(1e-3); // defasagem por índice
    // ciclo inteiro por loop: o fim do laço coincide com o começo
    an.applyTentacles(0);
    const start = pivots.map((p) => [p.rotation.x, p.rotation.z]);
    an.applyTentacles(dur);
    pivots.forEach((p, i) => {
      expect(p.rotation.x).toBeCloseTo(start[i][0], 9);
      expect(p.rotation.z).toBeCloseTo(start[i][1], 9);
    });
  });

  it('ao andar a amplitude cresce e os tentáculos arrastam para trás (rotação x média positiva)', () => {
    const { root, pivots } = fakeEye();
    const an = new UnitAnimator(root, 'watching_eye');
    const stats = (anim) => {
      an.setAnimation(anim, true);
      const dur = ANIMATION_DURATIONS[anim];
      let max = 0;
      let sum = 0;
      let n = 0;
      for (let k = 0; k < 48; k++) {
        an.setTime((k / 48) * dur);
        pivots.forEach((p) => { max = Math.max(max, Math.abs(p.rotation.x)); sum += p.rotation.x; n++; });
      }
      return { max, mean: sum / n };
    };
    const idle = stats('idle');
    const walk = stats('walk');
    expect(walk.max).toBeGreaterThan(idle.max);
    expect(walk.mean).toBeGreaterThan(0.1);
    expect(Math.abs(idle.mean)).toBeLessThan(0.03);
  });

  it('resetTransforms devolve os pivôs ao repouso (rotação 0) e o Torso respira levando o conjunto junto', () => {
    const { root, torso, pivots } = fakeEye();
    const an = new UnitAnimator(root, 'watching_eye');
    an.setTime(0.5);
    expect(pivots.some((p) => p.rotation.x !== 0)).toBe(true);
    expect(torso.scale.y).not.toBe(1); // respiração do idle no nó Torso (pai de Body, Fin e tentáculos)
    an.resetTransforms();
    pivots.forEach((p) => { expect(p.rotation.x).toBe(0); expect(p.rotation.z).toBe(0); });
    expect(torso.scale.y).toBe(1);
    expect(torso.position.y).toBe(2.4);
  });

  it('modelo sem tentáculos (fallback procedural) anima sem erro', () => {
    const root = new THREE.Group();
    root.name = 'WatchingEye';
    root.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.Material()));
    const an = new UnitAnimator(root, 'watching_eye');
    expect(an._tentacles).toHaveLength(0);
    for (const a of ['idle', 'walk', 'fight', 'hurt', 'die', 'cast']) {
      an.setAnimation(a, true);
      expect(() => an.setTime(0.3)).not.toThrow();
    }
  });
});
