/**
 * HazardView.js — F4-04b: apresentação das runas explosivas e dos redemoinhos (`gm.hazards.items`, ver
 * `src/sim/hazards.js`). Malhas de geometria/material compartilhados, reaproveitadas por um pool (nenhuma alocação
 * por quadro depois do aquecimento). Runas só aparecem para o dono e aliados do jogador local ("invisíveis a
 * inimigos"); redemoinhos aparecem para todos quando a área está visível na névoa. Criado pela `MatchSession`
 * (nunca em modo headless) e chamado por `GameManager.renderUpdate`.
 */
import * as THREE from 'three';

const runeRingGeo = new THREE.RingGeometry(0.55, 0.75, 12);
runeRingGeo.rotateX(-Math.PI / 2);
const runeGemGeo = new THREE.OctahedronGeometry(0.22, 0);
const runeMat = new THREE.MeshBasicMaterial({ color: 0xc084fc, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide });
const runeGemMat = new THREE.MeshBasicMaterial({ color: 0xe9d5ff });
const whirlGeo = new THREE.ConeGeometry(1, 2.4, 10, 1, true);
const whirlMat = new THREE.MeshBasicMaterial({ color: 0xa8a29e, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide });

export class HazardView {
  /**
   * @param {THREE.Scene} scene
   * @param {*} gm GameManager
   */
  constructor(scene, gm) {
    this.scene = scene;
    this.gm = gm;
    this.group = new THREE.Group();
    this.group.name = 'Hazards';
    scene.add(this.group);
    /** @type {Map<number, THREE.Group>} */
    this.live = new Map();
    this.pool = { rune: [], whirlwind: [] };
    this._t = 0;
    this._seen = new Set();
  }

  _acquire(kind) {
    const free = this.pool[kind].pop();
    if (free) { free.visible = true; return free; }
    const g = new THREE.Group();
    g.userData.kind = kind;
    if (kind === 'rune') {
      g.add(new THREE.Mesh(runeRingGeo, runeMat));
      const gem = new THREE.Mesh(runeGemGeo, runeGemMat);
      gem.position.y = 0.35;
      g.add(gem);
    } else {
      for (let i = 0; i < 3; i++) {
        const c = new THREE.Mesh(whirlGeo, whirlMat);
        c.position.y = 1.2;
        c.scale.set(1 - i * 0.28, 1, 1 - i * 0.28);
        c.rotation.x = Math.PI; // ponta para baixo
        g.add(c);
      }
    }
    this.group.add(g);
    return g;
  }

  update(frameDelta) {
    const gm = this.gm;
    this._t += frameDelta;
    const items = gm.hazards ? gm.hazards.items : [];
    const localId = gm.localPlayerId;
    const seen = this._seen;
    seen.clear();
    for (let i = 0; i < items.length; i++) {
      const h = items[i];
      seen.add(h.id);
      let view = this.live.get(h.id);
      if (!view) {
        view = this._acquire(h.kind);
        this.live.set(h.id, view);
      }
      const y = gm.terrain ? gm.terrain.getHeight(h.x, h.z) : 0;
      view.position.set(h.x, y + 0.12, h.z);
      let show;
      if (h.kind === 'rune') {
        show = h.ownerId === localId || (gm.isAlly && gm.isAlly(localId, h.ownerId));
        const gem = view.children[1];
        gem.rotation.y = this._t * 2;
        gem.position.y = 0.35 + Math.sin(this._t * 3 + h.id) * 0.08;
      } else {
        show = !gm.fogOfWar || gm.fogOfWar.isVisible(h.x, h.z);
        view.rotation.y = this._t * 6;
      }
      view.visible = !!show;
    }
    if (this.live.size !== seen.size) {
      for (const [id, view] of this.live) {
        if (seen.has(id)) continue;
        view.visible = false;
        this.pool[view.userData.kind].push(view);
        this.live.delete(id);
      }
    }
  }

  dispose() {
    this.scene.remove(this.group);
    this.live.clear();
    this.pool.rune.length = 0;
    this.pool.whirlwind.length = 0;
  }
}
