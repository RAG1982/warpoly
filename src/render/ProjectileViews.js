/**
 * ProjectileViews.js — F2-08: visão (malhas) dos projéteis da simulação.
 *
 * A simulação (`src/sim/projectiles.js`) só guarda números; aqui cada `Projectile` em `gm.arrows` ganha
 * uma malha (flecha, machado, virote, pedra) criada na 1ª vez em que aparece e removida quando sai da
 * lista (acertou/morreu). A cada quadro a pose é interpolada entre o passo anterior (`prev`) e o atual
 * (`pos`) com o `alpha` do tick fixo (F1-09), e a malha olha para `aim` (ponto logo à frente na curva).
 * Nunca escreve na simulação. Não existe em modo headless.
 */
import * as THREE from 'three';
import { ModelFactory } from '../entities/ModelFactory.js';
import { getAxethrowerAxeTextures } from '../models/index.js';

// F1-08: templates compartilhados (geometria/material criados 1x; as malhas por projétil só clonam a hierarquia).
let axeTemplate = null;
function getAxeTemplate() {
  if (!axeTemplate) {
    const axeGrp = new THREE.Group();
    const axeMat = new THREE.MeshStandardMaterial({ map: getAxethrowerAxeTextures().map, roughness: 0.4, metalness: 0.8 });
    const haft = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.85, 6), axeMat);
    axeGrp.add(haft);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.38, 0.32), axeMat);
    blade.position.set(0, 0.32, 0.12);
    axeGrp.add(blade);
    axeGrp.scale.set(1.1, 1.1, 1.1);
    axeTemplate = axeGrp;
  }
  return axeTemplate;
}

let boulderTemplate = null;
function getBoulderTemplate() {
  if (!boulderTemplate) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x8a8d90, flatShading: true, roughness: 0.9 });
    boulderTemplate = new THREE.Mesh(new THREE.DodecahedronGeometry(0.42, 0), mat);
    boulderTemplate.castShadow = true;
  }
  return boulderTemplate;
}

let cannonballTemplate = null;
function getCannonballTemplate() {
  if (!cannonballTemplate) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x1f1f23, roughness: 0.5, metalness: 0.6 });
    cannonballTemplate = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8), mat);
  }
  return cannonballTemplate;
}

// VFX-AIR: bola de fogo da Serpe de Guerra (casca laranja translúcida + núcleo amarelo, aditivo/bloom).
let fireTemplate = null;
function getFireTemplate() {
  if (!fireTemplate) {
    const outer = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff6a12, transparent: true, opacity: 0.85, depthWrite: false }));
    outer.material.userData.bloom = true;
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffe08a }));
    core.material.userData.bloom = true;
    fireTemplate = new THREE.Group();
    fireTemplate.add(outer, core);
  }
  return fireTemplate;
}

// VFX-AIR: raio do Cavaleiro Grifo (orbe azul-branco; o rastro em zigue-zague são partículas do pool `glow`, ver `vfxEmitters`).
let lightningTemplate = null;
function getLightningTemplate() {
  if (!lightningTemplate) {
    lightningTemplate = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), new THREE.MeshBasicMaterial({ color: 0xd8f4ff }));
    lightningTemplate.material.userData.bloom = true;
  }
  return lightningTemplate;
}

function createMesh(kind) {
  if (kind === 'cannonball') return ModelFactory.headless ? new THREE.Group() : getCannonballTemplate().clone();
  if (kind === 'axe') return getAxeTemplate().clone(true);
  if (kind === 'boulder') return ModelFactory.headless ? new THREE.Group() : getBoulderTemplate().clone();
  if (kind === 'fire') return getFireTemplate().clone(true);
  if (kind === 'lightning') return getLightningTemplate().clone();
  const m = ModelFactory.createArrow();
  if (kind === 'bolt') m.scale.setScalar(2.4);
  return m;
}

// M2-31: a simulação lança a flecha em (unidade + 1,68 em y); com o arqueiro v2 a flecha deve SAIR DO ARCO (que fica no lado -x,
// na altura do encaixe). Só visual: acha o atirador pela posição de origem (a simulação não guarda quem atirou), mede o ponto do
// arco (flecha encaixada, à frente do punho) no mundo e a malha parte dali, voltando à trajetória da simulação em ARROW_BLEND do voo.
const ARROW_BLEND = 0.25;
const BOW_MUZZLE = new THREE.Vector3(0.05, 0, 0.3); // no sistema do nó Bow: ao lado do arco (OFFSET_FLECHA) e à frente do encaixe
const _tmp = new THREE.Vector3();
function shooterAnimatorOf(gm, p) {
  if (!gm.entityViews || !gm.entityViews.views) return null;
  for (const [e, v] of gm.entityViews.views) {
    const mp = e.mesh && e.mesh.position;
    if (!mp || mp.x !== p.start.x || mp.z !== p.start.z || !v.animator) continue;
    return v.animator;
  }
  return null;
}
function bowMuzzleOffset(gm, p) {
  if (p.kind !== 'arrow') return null;
  const an = shooterAnimatorOf(gm, p);
  if (!an) return null;
  const parts = an.meshParts;
  if (!parts || !parts.bow || !parts.foreArmL) return null; // arqueiro antigo: comportamento de sempre
  parts.bow.updateWorldMatrix(true, false);
  _tmp.copy(BOW_MUZZLE).applyMatrix4(parts.bow.matrixWorld);
  return new THREE.Vector3(_tmp.x - p.start.x, _tmp.y - p.start.y, _tmp.z - p.start.z);
}

// VFX-AIR: a bola de fogo sai da boca da Serpe (nó `Mouth`, filho de `Head`) e o raio do bico/peito do Grifo (`Head`).
// Coordenadas locais do nó `Head` (cabeça de 0,42 de largura, frente em +Z).
const ELEMENTAL_MUZZLE = Object.freeze({
  fire: new THREE.Vector3(0, -0.08, 0.36),
  lightning: new THREE.Vector3(0, -0.02, 0.5)
});
const _elemNode = { fire: 'mouth', lightning: 'head' };
function elementalMuzzleOffset(gm, p) {
  const local = ELEMENTAL_MUZZLE[p.kind];
  if (!local) return null;
  const an = shooterAnimatorOf(gm, p);
  if (!an) return null;
  const node = an.meshParts && an.meshParts[_elemNode[p.kind]];
  if (!node) return null;
  node.updateWorldMatrix(true, false);
  _tmp.copy(local).applyMatrix4(node.matrixWorld);
  return new THREE.Vector3(_tmp.x - p.start.x, _tmp.y - p.start.y, _tmp.z - p.start.z);
}

export class ProjectileViews {
  /**
   * @param {import('../core/GameManager.js').GameManager} gm
   * @param {THREE.Scene} scene
   */
  constructor(gm, scene, vfx = null) {
    this.gm = gm;
    this.scene = scene;
    /** VFX-AIR: partículas GPU (rastro de brasas, arco do raio, clarões de boca); null = sem partículas. */
    this.vfx = vfx;
    /** @type {Map<object, {mesh: THREE.Object3D, seen: number, off: THREE.Vector3|null, elem: boolean, origin: object|null}>} */
    this.views = new Map();
    this._frame = 0;
  }

  /** VFX-AIR: fogo/raio só aparecem onde o jogador enxerga (névoa), como os demais efeitos de combate. */
  _visibleAt(pos) {
    const fog = this.gm.fogOfWar;
    return !fog || fog.isVisible(pos.x, pos.z);
  }

  /** Um quadro: cria/posiciona as malhas dos projéteis vivos e remove as dos que saíram da simulação. */
  update(alpha) {
    const list = this.gm.arrows;
    const frame = ++this._frame;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (p.isDead) continue;
      let v = this.views.get(p);
      if (!v) {
        const mesh = createMesh(p.kind);
        mesh.position.set(p.pos.x, p.pos.y, p.pos.z);
        this.scene.add(mesh);
        const elem = p.kind === 'fire' || p.kind === 'lightning';
        const off = elem ? elementalMuzzleOffset(this.gm, p) : bowMuzzleOffset(this.gm, p);
        // origem visual = boca/bico do atirador (a simulação dispara do peito); o arco e o clarão nascem daí
        const origin = elem ? { x: p.start.x + (off ? off.x : 0), y: p.start.y + (off ? off.y : 0), z: p.start.z + (off ? off.z : 0) } : null;
        v = { mesh, seen: frame, off, elem, origin };
        this.views.set(p, v);
        if (elem && this.vfx && this._visibleAt(origin)) this.vfx.play({ fx: p.kind === 'fire' ? 'fire_muzzle' : 'lightning_muzzle', pos: origin });
      }
      v.seen = frame;
      const m = v.mesh;
      m.position.set(
        p.prev.x + (p.pos.x - p.prev.x) * alpha,
        p.prev.y + (p.pos.y - p.prev.y) * alpha,
        p.prev.z + (p.pos.z - p.prev.z) * alpha
      );
      if (v.off) {
        const k = Math.max(0, 1 - p.progress / ARROW_BLEND);
        if (k > 0) m.position.addScaledVector(v.off, k);
      }
      if (v.elem) {
        // VFX-AIR: a malha e as partículas de rastro só aparecem com a área visível (névoa de guerra)
        const vis = this._visibleAt(m.position);
        m.visible = vis;
        if (vis && this.vfx && (frame & 1) === 0) {
          if (p.kind === 'fire') this.vfx.play({ fx: 'fire_trail', pos: { x: m.position.x, y: m.position.y, z: m.position.z } });
          else this.vfx.play({ fx: 'lightning_arc', from: v.origin, to: { x: m.position.x, y: m.position.y, z: m.position.z } });
        }
      }
      if (p.kind === 'boulder' || p.kind === 'cannonball') {
        m.rotation.x = p.spin; // gira em voo
      } else {
        m.lookAt(p.aim.x, p.aim.y, p.aim.z);
        if (p.kind === 'axe') m.rotateX(p.spin);
      }
    }
    for (const [p, v] of this.views) {
      if (v.seen !== frame) {
        this.scene.remove(v.mesh);
        this.views.delete(p);
      }
    }
  }

  dispose() {
    for (const v of this.views.values()) this.scene.remove(v.mesh);
    this.views.clear();
  }
}
