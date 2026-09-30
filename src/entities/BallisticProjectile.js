import * as THREE from 'three';
import { ModelFactory } from './ModelFactory.js';

/**
 * F4-02 — projétil balístico do cerco (`'bolt'` da Balista, `'boulder'` da Catapulta).
 *
 * Diferente da `Arrow`, NÃO persegue o alvo: voa até um ponto fixo (a posição prevista no
 * momento do disparo) numa parábola de pico `clamp(dist × 0,35, 2, 9)` e, ao chegar, chama
 * `onImpact(pos)` — quem dispara aplica o dano em área (`applySplashDamage`). Mantém o contrato
 * de tick fixo/interpolação da F1-09 (`simStep` + `renderUpdate` com `_prevPos/_simPos/_prevQuat/_simQuat`)
 * e de descarte do GameManager (`arrows[]`, `isDead`). Nada aloca por quadro (vetores de módulo).
 */

/** Velocidade horizontal+vertical (unidades/s): a Balista atira mais rápido e mais raso. */
export const BALLISTIC_SPEED = { bolt: 22, boulder: 14 };

/** Tempo de voo (s) para uma distância 3D `dist` — usado também na previsão de mira. */
export function ballisticFlightTime(dist, kind) {
  return Math.max(0.3, dist / (BALLISTIC_SPEED[kind] || 14));
}

/** Altura do pico da parábola para a distância `dist`. */
export function ballisticPeak(dist) {
  return Math.min(9, Math.max(2, dist * 0.35));
}

// Malha da pedra: geometria/material criados 1x e compartilhados por todos os projéteis.
let boulderTemplate = null;
function getBoulderTemplate() {
  if (!boulderTemplate) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x8a8d90, flatShading: true, roughness: 0.9 });
    boulderTemplate = new THREE.Mesh(new THREE.DodecahedronGeometry(0.42, 0), mat);
    boulderTemplate.castShadow = true;
  }
  return boulderTemplate;
}

const _cur = new THREE.Vector3();
const _next = new THREE.Vector3();

export class BallisticProjectile {
  /**
   * @param {THREE.Scene} scene
   * @param {THREE.Vector3} startPos  origem (clonada)
   * @param {{x:number,y:number,z:number}} impactPos  ponto de impacto fixo (já previsto pelo chamador)
   * @param {'bolt'|'boulder'} kind
   * @param {(pos: THREE.Vector3) => void} onImpact
   */
  constructor(scene, startPos, impactPos, kind, onImpact) {
    this.scene = scene;
    this.kind = kind;
    this.onImpact = onImpact;
    this.startPos = startPos.clone();
    this.impactPos = new THREE.Vector3(impactPos.x, impactPos.y, impactPos.z);
    this.dist = this.startPos.distanceTo(this.impactPos);
    this.duration = ballisticFlightTime(this.dist, kind);
    this.peak = ballisticPeak(this.dist);
    this.progress = 0;
    this.isDead = false;

    if (kind === 'boulder') {
      this.mesh = ModelFactory.headless ? new THREE.Group() : getBoulderTemplate().clone();
    } else {
      this.mesh = ModelFactory.createArrow();
      this.mesh.scale.setScalar(2.4);
    }
    this.mesh.position.copy(this.startPos);
    this.scene.add(this.mesh);

    this._prevPos = this.mesh.position.clone();
    this._simPos = this.mesh.position.clone();
    this._prevQuat = this.mesh.quaternion.clone();
    this._simQuat = this.mesh.quaternion.clone();
  }

  /** Ponto da trajetória no instante t ∈ [0,1] (escreve em `out`). */
  _pointAt(t, out) {
    out.lerpVectors(this.startPos, this.impactPos, t);
    out.y += Math.sin(t * Math.PI) * this.peak;
    return out;
  }

  simStep(delta) {
    if (this.isDead) return;
    this.progress += delta / this.duration;
    if (this.progress >= 1) {
      this.progress = 1;
      this.hit();
      return;
    }
    this._pointAt(this.progress, _cur);
    this._pointAt(Math.min(1, this.progress + 0.05), _next);
    this.mesh.position.copy(_cur);
    if (this.kind === 'boulder') {
      this.mesh.rotation.x += delta * 6; // gira em voo
    } else {
      this.mesh.lookAt(_next);
    }
  }

  renderUpdate(alpha) {
    if (this.isDead) return;
    this.mesh.position.lerpVectors(this._prevPos, this._simPos, alpha);
    this.mesh.quaternion.slerpQuaternions(this._prevQuat, this._simQuat, alpha);
  }

  hit() {
    this.isDead = true;
    this.mesh.position.copy(this.impactPos);
    if (this.onImpact) this.onImpact(this.impactPos);
    this.scene.remove(this.mesh);
  }
}
