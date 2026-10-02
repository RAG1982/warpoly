/**
 * HoverOutline.js (F6-06) — contorno barato da entidade sob o mouse: 8 colchetes de canto
 * (24 segmentos) ao redor da caixa da entidade, num único `LineSegments` (1 draw call, sem
 * pós-processamento nem clone de malhas). Cor por relação com o jogador local.
 */
import * as THREE from 'three';

/** Cor (hex) por relação — ver `classifyHover` em cursors.js. */
export const OUTLINE_COLORS = Object.freeze({
  hostile: 0xff4a3d,
  critter: 0xc4b5a0,
  resource: 0xffd75e,
  depleted: 0x9a8f7a,
  ownSite: 0x6ee7a0,
  ownDamaged: 0x6ee7a0,
  ownBuilding: 0x6ee7a0,
  ownUnit: 0x6ee7a0,
  ally: 0x5ac8fa,
  other: 0xd1d5db
});

/** Nomes de objetos que não fazem parte do corpo (anel de seleção, barras, decalques). */
const SKIP = /^(SelectionRing|HealthBar|HealthBg|HealthFill|ManaBg|ManaFill|Rally|Decal)/;
const _box = new THREE.Box3();
const _tmp = new THREE.Box3();

/** Caixa do corpo visível de `root` (ignora anéis/barras e objetos invisíveis). Devolve false se vazia. */
export function bodyBox(root, out = _box) {
  out.makeEmpty();
  root.updateWorldMatrix(true, false);
  const walk = (o) => {
    if (!o.visible || SKIP.test(o.name)) return;
    if ((o.isMesh || o.isSkinnedMesh) && o.geometry) {
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      if (o.geometry.boundingBox && !o.geometry.boundingBox.isEmpty()) {
        o.updateWorldMatrix(false, false);
        _tmp.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
        out.union(_tmp);
      }
    }
    for (let i = 0; i < o.children.length; i++) walk(o.children[i]);
  };
  walk(root);
  return !out.isEmpty();
}

/** Escreve 24 segmentos (colchetes nos 8 cantos) em `arr` (Float32Array de 144). */
export function writeBrackets(arr, min, max, frac = 0.28) {
  const sx = (max.x - min.x) * frac;
  const sy = (max.y - min.y) * frac;
  const sz = (max.z - min.z) * frac;
  let i = 0;
  const seg = (ax, ay, az, bx, by, bz) => { arr[i++] = ax; arr[i++] = ay; arr[i++] = az; arr[i++] = bx; arr[i++] = by; arr[i++] = bz; };
  for (const x of [min.x, max.x]) {
    const dx = x === min.x ? sx : -sx;
    for (const y of [min.y, max.y]) {
      const dy = y === min.y ? sy : -sy;
      for (const z of [min.z, max.z]) {
        const dz = z === min.z ? sz : -sz;
        seg(x, y, z, x + dx, y, z);
        seg(x, y, z, x, y + dy, z);
        seg(x, y, z, x, y, z + dz);
      }
    }
  }
  return i / 6; // nº de segmentos (24)
}

export class HoverOutline {
  /** @param {THREE.Scene} scene */
  constructor(scene) {
    this.scene = scene;
    this.positions = new Float32Array(24 * 2 * 3);
    const geo = new THREE.BufferGeometry();
    this.attr = new THREE.BufferAttribute(this.positions, 3);
    this.attr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.attr);
    this.material = new THREE.LineBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true, opacity: 1, fog: false });
    this.lines = new THREE.LineSegments(geo, this.material);
    this.lines.name = 'HoverOutline';
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 999;
    this.lines.visible = false;
    scene.add(this.lines);
  }

  get visible() { return this.lines.visible; }

  /** Mostra o contorno em `root` com a cor da relação; `root` nulo/inválido o oculta. */
  show(root, relation) {
    if (!root || !root.parent || !bodyBox(root)) { this.hide(); return; }
    writeBrackets(this.positions, _box.min, _box.max);
    this.attr.needsUpdate = true;
    this.material.color.setHex(OUTLINE_COLORS[relation] ?? OUTLINE_COLORS.other);
    this.lines.visible = true;
  }

  hide() { this.lines.visible = false; }

  dispose() {
    this.scene.remove(this.lines);
    this.lines.geometry.dispose();
    this.material.dispose();
  }
}
