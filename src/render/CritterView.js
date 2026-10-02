import { ModelFactory } from '../entities/ModelFactory.js';

/** Malha de um `Critter`: copia pose/visibilidade do corpo de simulação a cada quadro. */
export class CritterView {
  constructor(critter, scene) {
    this.critter = critter;
    this.scene = scene;
    this.root = ModelFactory.createCritter(critter.species);
    this.root.scale.setScalar(1.4);
    this.root.userData.entity = critter;
    scene.add(this.root);
    this.update();
  }

  update() {
    const b = this.critter.mesh;
    const r = this.root;
    r.position.set(b.position.x, b.position.y, b.position.z);
    r.rotation.set(0, b.rotation.y, b.rotation.z);
    r.visible = b.visible;
  }

  dispose() {
    this.scene.remove(this.root);
  }
}
