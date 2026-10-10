import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

// As texturas de água são pintadas em <canvas> (sem DOM no Node): troca por mapas vazios, que o `Water` aceita.
vi.mock('../../src/models/environment/waterTextures.js', () => ({
  getWaterSurfaceTextures: () => ({ map: null, roughnessMap: null, bumpMap: null }),
  getCattailLotusTextures: () => ({
    cattailStemMap: null, cattailHeadMap: null, cattailHeadRoughness: null, lotusLeafMap: null, lotusPetalMap: null
  })
}));

const { Water, mergeByMaterial, pickReedLocations } = await import('../../src/world/Water.js');
const { Terrain } = await import('../../src/sim/Terrain.js');
const { getMap } = await import('../../src/data/maps/index.js');
const { WATER_LEVEL } = await import('../../src/data/combat.js');

const triCount = (geo) => (geo.index ? geo.index.count : geo.attributes.position.count) / 3;

function sampleTree() {
  const root = new THREE.Group();
  const matA = new THREE.MeshStandardMaterial({ color: 0xff0000 });
  const matB = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
  const boxGeo = new THREE.BoxGeometry(1, 2, 1);
  const coneGeo = new THREE.ConeGeometry(0.5, 1.5, 5);
  const branch = new THREE.Group();
  branch.position.set(3, 1, -2);
  branch.rotation.set(0.3, 0.9, -0.2);
  branch.scale.set(1.2, 0.8, 1.1);
  root.add(branch);
  const mk = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.y = x; return m; };
  branch.add(mk(boxGeo, matA, 0, 0, 0), mk(boxGeo, matA, 1, 2, 0), mk(coneGeo, matB, -1, 0.5, 1));
  root.add(mk(coneGeo, matB, 5, 0, 5), mk(boxGeo, matB, -4, 1, 2));
  return { root, matA, matB };
}

describe('Water — plantas aquáticas mescladas (F7-00b, aceite de desempenho)', () => {
  it('mergeByMaterial: uma malha por material, mesmos triângulos e mesma caixa, sem tocar nas geometrias originais', () => {
    const { root, matA, matB } = sampleTree();
    root.updateMatrixWorld(true);
    const meshes = [];
    root.traverse((o) => { if (o.isMesh) meshes.push(o); });
    const before = meshes.map((m) => m.geometry.attributes.position.array.slice());
    const expectedTris = meshes.reduce((n, m) => n + triCount(m.geometry), 0);
    const expectedBox = new THREE.Box3().setFromObject(root, true); // preciso (vértices), como a malha fundida

    const merged = mergeByMaterial(root, 'Teste');
    expect(merged.name).toBe('Teste');
    expect(merged.children).toHaveLength(2);
    expect(new Set(merged.children.map((m) => m.material))).toEqual(new Set([matA, matB]));
    expect(merged.children.reduce((n, m) => n + triCount(m.geometry), 0)).toBe(expectedTris);
    const box = new THREE.Box3().setFromObject(merged, true);
    expect(box.min.distanceTo(expectedBox.min)).toBeLessThan(1e-5);
    expect(box.max.distanceTo(expectedBox.max)).toBeLessThan(1e-5);
    meshes.forEach((m, i) => expect(Array.from(m.geometry.attributes.position.array)).toEqual(Array.from(before[i])));
  });

  it('o Water de tileset com plantas cria as 7 moitas com poucas malhas (eram ~625) e ainda as anima', () => {
    const scene = new THREE.Scene();
    const terrain = { width: 140, getHeight: () => 0.3, mapDef: { tileset: 'verdejante' } }; // lago raso em todo o mapa
    const water = new Water(scene, terrain, { tileset: 'verdejante' });
    const group = scene.getObjectByName('WaterVegetationGroup');
    expect(group).toBeTruthy();
    expect(group.children).toHaveLength(7);
    let meshes = 0;
    group.traverse((o) => { if (o.isMesh) meshes++; });
    expect(meshes).toBeGreaterThan(14); // estático + flutuante por moita
    expect(meshes).toBeLessThanOrEqual(7 * 10); // ~8 materiais por moita
    let casters = 0;
    group.traverse((o) => { if (o.isMesh && o.castShadow) casters++; });
    expect(casters).toBeGreaterThan(7); // `enableShadows` segue seletivo (só malhas grandes projetam), mas as fundidas projetam
    expect(water.lotusEntities).toHaveLength(7);
    expect(water.reedClumps).toHaveLength(7);

    water.update(0);
    const y0 = water.lotusEntities.map((e) => e.position.y);
    const rot0 = water.reedClumps.map((c) => c.rotation.z);
    water.update(1.3);
    water.lotusEntities.forEach((e, i) => {
      expect(Math.abs(e.position.y)).toBeLessThanOrEqual(0.0141); // oscila ±1,4 cm em torno do nível d'água
      expect(e.position.y).not.toBe(y0[i]);
    });
    water.reedClumps.forEach((c, i) => expect(c.rotation.z).not.toBe(rot0[i])); // o balanço da moita segue
  });

  it('NEW-52: terreno todo seco => nenhuma moita', () => {
    const scene = new THREE.Scene();
    new Water(scene, { width: 140, getHeight: () => 2.5, mapDef: { tileset: 'verdejante' } }, { tileset: 'verdejante' });
    expect(scene.getObjectByName('WaterVegetationGroup').children).toHaveLength(0);
  });

  it('NEW-52: continental-1v1 — juncos só em água rasa (e as posições fixas antigas eram terra seca)', () => {
    const terrain = new Terrain(getMap('continental-1v1'));
    const locs = pickReedLocations(terrain, WATER_LEVEL);
    expect(locs.length).toBeGreaterThan(0);
    expect(locs.length).toBeLessThanOrEqual(7);
    for (const { x, z } of locs) {
      const h = terrain.getHeight(x, z);
      expect(h, `(${x},${z})`).toBeLessThan(WATER_LEVEL);
      expect(h).toBeGreaterThan(WATER_LEVEL - 0.7);
      for (const [dx, dz] of [[0.9, 0], [-0.9, 0], [0, 0.9], [0, -0.9]]) {
        expect(terrain.getHeight(x + dx, z + dz), `(${x},${z})+(${dx},${dz})`).toBeLessThan(WATER_LEVEL);
      }
    }
    // determinístico
    expect(pickReedLocations(terrain, WATER_LEVEL)).toEqual(locs);
    // as posições fixas do mapa antigo ficavam em terra seca neste mapa (o bug)
    const old = [[10, 12], [12, 15], [-10, -12], [-12, -15], [-15, 18], [15, -18], [-20, 12]];
    expect(old.some(([x, z]) => terrain.getHeight(x, z) > WATER_LEVEL)).toBe(true);
  });

  it('tileset sem plantas (inverno) não cria a vegetação', () => {
    const scene = new THREE.Scene();
    const terrain = { width: 140, getHeight: () => 2.5, mapDef: { tileset: 'inverno' } };
    new Water(scene, terrain, { tileset: 'inverno' });
    expect(scene.getObjectByName('WaterVegetationGroup')).toBeUndefined();
  });
});
