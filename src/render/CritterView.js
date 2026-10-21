import { ModelFactory } from '../entities/ModelFactory.js';
import { CritterAnimator } from './critterAnimator.js';

/** M2-13: o javali `.glb` é mais baixo que o procedural; a carcaça tombada sobe um pouco para não afundar no chão. */
const GLB_CARCASS_LIFT = 0.12;

/** Malha de um `Critter`: copia pose/visibilidade do corpo de simulação a cada quadro e anima o javali `.glb`. */
export class CritterView {
  constructor(critter, scene) {
    this.critter = critter;
    this.entity = critter;
    this.scene = scene;
    this.root = ModelFactory.createCritter(critter.species);
    this.root.scale.setScalar(1.4);
    this.root.userData.entity = critter;
    // Só o `.glb` do javali tem os nós animáveis; o procedural (e a ovelha) seguem com o balanço do corpo da simulação.
    this.animator = null;
    if (this.root.userData.glbCritter) {
      const a = new CritterAnimator(this.root, ((critter.id || 0) * 0.6180339887) % 1);
      if (a.valid) this.animator = a;
    }
    this._last = typeof performance !== 'undefined' ? performance.now() : 0;
    scene.add(this.root);
    this.update();
  }

  update() {
    const b = this.critter.mesh;
    const r = this.root;
    r.position.set(b.position.x, b.position.y, b.position.z);
    r.rotation.set(0, b.rotation.y, b.rotation.z);
    r.visible = b.visible;
    if (this.animator) {
      const now = performance.now();
      const dt = (now - this._last) / 1000;
      this._last = now;
      const st = this.critter.state;
      this.animator.setState(st === 'walking' ? 'walk' : st === 'fleeing' ? 'run' : st === 'dead' ? 'dead' : 'idle');
      // As pernas já balançam: o rolamento do corpo inteiro só vale para a carcaça tombada.
      if (st !== 'dead') r.rotation.z = 0;
      else r.position.y += GLB_CARCASS_LIFT;
      if (r.visible) this.animator.update(dt);
    }
  }

  dispose() {
    this.scene.remove(this.root);
  }
}
