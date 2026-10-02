/**
 * Body.js — F2-08b: corpo de simulação sem three.js.
 *
 * `Vec3` imita o subconjunto de `THREE.Vector3` que o resto do código usa em posições de entidades
 * (`set/copy/clone/distanceTo/...`), para que `entity.mesh.position.x` (legado) continue funcionando
 * quando a entidade passa a ser só dados. `Body` é o "mesh de simulação" (`entity.mesh` nas entidades já
 * migradas): posição/rotação/escala/visibilidade como números. A malha real vive na view
 * (`src/render/EntityViews.js`), que copia o `Body` para o `THREE.Object3D` a cada quadro.
 */
export class Vec3 {
  constructor(x = 0, y = 0, z = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
  }

  set(x, y, z) {
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }

  copy(v) {
    this.x = v.x;
    this.y = v.y;
    this.z = v.z;
    return this;
  }

  clone() {
    return new Vec3(this.x, this.y, this.z);
  }

  add(v) {
    this.x += v.x;
    this.y += v.y;
    this.z += v.z;
    return this;
  }

  sub(v) {
    this.x -= v.x;
    this.y -= v.y;
    this.z -= v.z;
    return this;
  }

  addScaledVector(v, s) {
    this.x += v.x * s;
    this.y += v.y * s;
    this.z += v.z * s;
    return this;
  }

  lerpVectors(a, b, t) {
    this.x = a.x + (b.x - a.x) * t;
    this.y = a.y + (b.y - a.y) * t;
    this.z = a.z + (b.z - a.z) * t;
    return this;
  }

  distanceToSquared(v) {
    const dx = this.x - v.x;
    const dy = this.y - v.y;
    const dz = this.z - v.z;
    return dx * dx + dy * dy + dz * dz;
  }

  distanceTo(v) {
    return Math.sqrt(this.distanceToSquared(v));
  }

  toArray(arr = [], offset = 0) {
    arr[offset] = this.x;
    arr[offset + 1] = this.y;
    arr[offset + 2] = this.z;
    return arr;
  }
}

export class Body {
  constructor(x = 0, y = 0, z = 0) {
    this.position = new Vec3(x, y, z);
    this.rotation = new Vec3(0, 0, 0);
    this.scale = new Vec3(1, 1, 1);
    this.visible = true;
    this.userData = {};
  }
}
