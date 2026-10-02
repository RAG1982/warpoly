import { BuildingView } from '../BuildingView.js';
import { EVT } from '../../sim/events.js';

/**
 * F4-07a: Estaleiro/Doca/Plataforma (.glb do Blender). Anima os nós opcionais `Anim_Crane`/`Anim_Crane_2`
 * (guindaste oscila), `Anim_Drill` (broca gira) e emite fumaça em `Anim_Smoke`. Banners (`Anim_Banners`) só levam
 * a cor do time. Sem os nós (modelos procedurais, ?glb=0) não faz nada.
 */
export class NavalBuildingView extends BuildingView {
  initCustomVFX() {
    this._t = 0;
    this._smokeTimer = 0;
    this._cranes = ['Anim_Crane', 'Anim_Crane_2'].map(n => this.mesh.getObjectByName(n)).filter(Boolean);
    this._craneBase = this._cranes.map(c => c.rotation.y);
    this._drill = this.mesh.getObjectByName('Anim_Drill');
    this._smoke = this.mesh.getObjectByName('Anim_Smoke');
    this._v = this._smoke ? this._smoke.position.clone() : null;
  }

  updateCustomVFX(delta, gameManager) {
    this._t += delta;
    this._cranes.forEach((c, i) => { c.rotation.y = this._craneBase[i] + Math.sin(this._t * 0.5 + i * 1.7) * 0.35; });
    if (this._drill) this._drill.rotation.y += delta * 3;
    const ev = gameManager && gameManager.events;
    if (this._smoke && ev) {
      this._smokeTimer += delta;
      if (this._smokeTimer >= 0.8) {
        this._smokeTimer = 0;
        this._smoke.getWorldPosition(this._v);
        ev.emit(EVT.BUILDING_VFX, {
          buildingId: this.id, ownerId: this.ownerId,
          pos: { x: this._v.x, y: this._v.y, z: this._v.z }, kind: 'chimney_smoke'
        });
      }
    }
  }

  cleanupCustomVFX() {
    this._cranes = [];
    this._drill = null;
    this._smoke = null;
  }
}
