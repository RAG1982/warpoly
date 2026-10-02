import { ModelFactory } from '../entities/ModelFactory.js';

/** Malha de uma `ResourceDeposit` (mina de ouro / pedreira): estática, criada 1x na posição da sim. */
export class ResourceDepositView {
  constructor(deposit, scene) {
    this.deposit = deposit;
    this.entity = deposit;
    this.scene = scene;
    this.root = deposit.type === 'gold' ? ModelFactory.createGoldMine() : ModelFactory.createStoneQuarry();
    const p = deposit.position;
    this.root.position.set(p.x, p.y, p.z);
    this.root.userData.entity = deposit;
    scene.add(this.root);
  }

  update() {}

  dispose() {
    this.scene.remove(this.root);
  }
}
