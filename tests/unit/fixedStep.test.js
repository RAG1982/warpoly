import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { GameManager } from '../../src/core/GameManager.js';
import { Unit } from '../../src/entities/Unit.js';
import { SIM_DT, MAX_STEPS, lerpAngle, animationLodStep } from '../../src/sim/constants.js';

/**
 * F1-09 — tick fixo (20 Hz), interpolação e LOD de animação.
 *
 * `GameManager.advance()`/`simStep()` dependem de muito estado de partida (players, terrain,
 * grades espaciais…) para instanciar um GameManager de verdade num teste unitário; os testes de
 * acumulador abaixo chamam `GameManager.prototype.advance` num objeto fake mínimo, com `simStep`
 * substituído por um espião que só conta chamadas — exercita exatamente a lógica do acumulador
 * (o que a spec pede), sem montar uma partida completa.
 */
function fakeGameManager() {
  let stepCalls = 0;
  const gm = {
    isPaused: false,
    isGameOver: false,
    gameSpeed: 1.0,
    _acc: 0,
    _lastAlpha: 0,
    allUnits: [],
    arrows: [],
    simStep(dt) {
      stepCalls++;
      expect(dt).toBe(SIM_DT);
    },
    advance: GameManager.prototype.advance,
    _restoreSimPose: GameManager.prototype._restoreSimPose,
    _snapshotPrevPose: GameManager.prototype._snapshotPrevPose,
    _snapshotSimPose: GameManager.prototype._snapshotSimPose
  };
  return { gm, getStepCalls: () => stepCalls };
}

describe('F1-09: GameManager.advance (tick fixo)', () => {
  it('roda exatamente 40 passos em 2s simulados a 30, 60 e 144 FPS', () => {
    const frameCounts = { 30: 60, 60: 120, 144: 288 };
    for (const [fps, frames] of Object.entries(frameCounts)) {
      const { gm, getStepCalls } = fakeGameManager();
      const dt = 1 / Number(fps);
      let lastAlpha = 0;
      for (let i = 0; i < frames; i++) {
        lastAlpha = gm.advance(dt);
      }
      expect(getStepCalls()).toBe(40);
      expect(lastAlpha).toBeGreaterThanOrEqual(0);
      expect(lastAlpha).toBeLessThan(1);
    }
  });

  it('gameSpeed=2 dobra os passos executados no mesmo tempo real', () => {
    const { gm, getStepCalls } = fakeGameManager();
    gm.gameSpeed = 2;
    const dt = 1 / 60;
    for (let i = 0; i < 120; i++) gm.advance(dt);
    expect(getStepCalls()).toBe(80);
  });

  it('delta gigante roda no máximo MAX_STEPS e zera o acumulador (evita espiral de morte)', () => {
    const { gm, getStepCalls } = fakeGameManager();
    const alpha = gm.advance(10); // 10s de uma vez: passaria de MAX_STEPS*SIM_DT
    expect(getStepCalls()).toBe(MAX_STEPS);
    expect(gm._acc).toBe(0);
    expect(alpha).toBe(0);
  });

  it('alpha está sempre em [0,1)', () => {
    const { gm } = fakeGameManager();
    for (let i = 0; i < 50; i++) {
      const alpha = gm.advance(0.013);
      expect(alpha).toBeGreaterThanOrEqual(0);
      expect(alpha).toBeLessThan(1);
    }
  });
});

describe('F1-09: interpolação de transform', () => {
  it('lerpVectors interpola posição linearmente por alpha', () => {
    const prev = new THREE.Vector3(0, 0, 0);
    const sim = new THREE.Vector3(10, 0, 0);
    const out = new THREE.Vector3();
    out.lerpVectors(prev, sim, 0.25);
    expect(out.x).toBeCloseTo(2.5, 6);
  });

  it('lerpAngle interpola rotação pelo menor arco (350° → 10°)', () => {
    const a = THREE.MathUtils.degToRad(350);
    const b = THREE.MathUtils.degToRad(10);
    const out = lerpAngle(a, b, 0.5);
    // Menor arco de 350° a 10° passa por 360°/0°, então o meio do caminho é 0° (360°).
    const outDeg = ((THREE.MathUtils.radToDeg(out) % 360) + 360) % 360;
    expect(outDeg).toBeCloseTo(0, 3);
  });

  it('Unit.renderUpdate interpola mesh.position/rotation.y entre _prevPos/_simPos', () => {
    const fakeUnit = {
      canRemove: false,
      isDying: false,
      state: 'idle',
      hurtTimer: 0,
      scene: null,
      hpGroup: null,
      animator: null,
      mesh: {
        position: new THREE.Vector3(0, 0, 0),
        rotation: { y: THREE.MathUtils.degToRad(350) },
        visible: true
      },
      _prevPos: new THREE.Vector3(0, 0, 0),
      _simPos: new THREE.Vector3(10, 0, 0),
      _prevRotY: THREE.MathUtils.degToRad(350),
      _simRotY: THREE.MathUtils.degToRad(10)
    };

    Unit.prototype.renderUpdate.call(fakeUnit, 0.016, 0.25, 1);

    expect(fakeUnit.mesh.position.x).toBeCloseTo(2.5, 6);
  });
});

describe('F1-09: LOD de animação (animationLodStep)', () => {
  it('unidade próxima (<=60) sempre anima', () => {
    expect(animationLodStep(0, 0, 1)).toBe(1);
    expect(animationLodStep(60, 123, 7)).toBe(1);
  });

  it('unidade a média distância (60-100) anima 1 em cada 2 frames', () => {
    // (frameIndex + id) par → anima; ímpar → pula.
    expect(animationLodStep(80, 0, 0)).toBe(1);
    expect(animationLodStep(80, 1, 0)).toBe(0);
    expect(animationLodStep(80, 0, 1)).toBe(0);
    expect(animationLodStep(80, 1, 1)).toBe(1);
  });

  it('unidade distante (>100) anima 1 em cada 4 frames', () => {
    expect(animationLodStep(150, 0, 0)).toBe(1);
    expect(animationLodStep(150, 1, 0)).toBe(0);
    expect(animationLodStep(150, 2, 0)).toBe(0);
    expect(animationLodStep(150, 3, 0)).toBe(0);
    expect(animationLodStep(150, 4, 0)).toBe(1);
  });
});
