import { Building } from './Building.js';

/**
 * F3-08 — segmento de muralha (simulação). Reaproveita o esqueleto de `Building` (obra por estágios, PV/armadura,
 * bloqueio do pathfinder pelo `GameManager`). F2-08c: o corpo visual (InstancedMesh por facção) vive em
 * `src/render/WallView.js` (`WallBatch` + `WallView`); aqui não há malha.
 */
export class Wall extends Building {
  constructor(terrain, type, x, z, isConstructed = true, owner = 0) {
    super(terrain, type, x, z, isConstructed, owner);
  }
}
