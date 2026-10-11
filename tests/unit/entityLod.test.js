import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { Unit } from '../../src/sim/Unit.js';
import { Building } from '../../src/sim/Building.js';
import { UnitView } from '../../src/render/UnitView.js';
import { BuildingView } from '../../src/render/BuildingView.js';
import { ModelFactory } from '../../src/entities/ModelFactory.js';
import { LOD_DISTANCES } from '../../src/render/lod.js';

vi.hoisted(() => {
  const quiet = (orig) => (...a) => { if (typeof a[0] === 'string' && a[0].startsWith('[glbModels]')) return; orig(...a); };
  console.warn = quiet(console.warn.bind(console));
  console.error = quiet(console.error.bind(console));
});

const withHeadless = (fn) => () => {
  ModelFactory.headless = true;
  try { fn(); } finally { ModelFactory.headless = false; }
};
const terrain = { getHeight: () => 0 };
const ctxAt = (d) => ({ alpha: 1, camera: null, lodFrustum: null, lodTarget: new THREE.Vector3(d, 0, 0), frameIndex: 0 });

describe('LOD de unidades (F1-10 item 4)', () => {
  it('longe: sem sombra e sem lodDetail; perto restaura; histerese na banda', withHeadless(() => {
    const unit = new Unit(terrain, 'villager', 0, 0, 0, null);
    const view = new UnitView(unit, new THREE.Scene());
    const shadowMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    shadowMesh.castShadow = true;
    const plume = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    plume.userData.lodDetail = true;
    view.root.add(shadowMesh, plume);
    const U = LOD_DISTANCES.unit;

    view.update(0.016, ctxAt(U * 1.05)); // dentro da banda: continua perto
    expect(view._lodLevel).toBe(0);
    expect(shadowMesh.castShadow).toBe(true);

    view.update(0.016, ctxAt(U * 1.3));
    expect(view._lodLevel).toBe(1);
    expect(shadowMesh.castShadow).toBe(false);
    expect(plume.visible).toBe(false);

    view.update(0.016, ctxAt(U * 0.95)); // dentro da banda: continua longe
    expect(view._lodLevel).toBe(1);
    expect(shadowMesh.castShadow).toBe(false);

    view.update(0.016, ctxAt(U * 0.5));
    expect(view._lodLevel).toBe(0);
    expect(shadowMesh.castShadow).toBe(true);
    expect(plume.visible).toBe(true);
  }));
});

describe('LOD de construções (F1-10 item 4)', () => {
  it('longe: oculta lodDetail e a bandeira de reunião; perto restaura', withHeadless(() => {
    const b = new Building(terrain, 'castle', 0, 0, true, 0);
    const view = new BuildingView(b, new THREE.Scene());
    const flame = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    flame.userData.lodDetail = true;
    view.root.add(flame);
    b.rallyShown = true;
    const B = LOD_DISTANCES.building;

    view.update(0.016, ctxAt(B * 1.05));
    expect(view._lodLevel).toBe(0);
    expect(flame.visible).toBe(true);
    expect(view.rallyGroup.visible).toBe(true);

    view.update(0.016, ctxAt(B * 1.3));
    expect(view._lodLevel).toBe(1);
    expect(flame.visible).toBe(false);
    expect(view.rallyGroup.visible).toBe(false);

    view.update(0.016, ctxAt(B * 0.95));
    expect(view._lodLevel).toBe(1);

    view.update(0.016, ctxAt(B * 0.5));
    expect(view._lodLevel).toBe(0);
    expect(flame.visible).toBe(true);
    expect(view.rallyGroup.visible).toBe(true);
  }));
});
