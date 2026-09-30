import * as THREE from 'three';
import { getTerrainTextures, getTerrainTexturesFromHeight } from '../models/environment/terrainTextures.js';
import { getMap, DEFAULT_MAP_ID } from '../data/maps/index.js';
import { getHeightForMap } from './terrainGenerators.js';

/**
 * Terreno orientado a dados (F2-05): tamanho, segmentos, altura, vaus e slots vêm de `mapDef`
 * (ver `src/data/maps/README.md`) em vez de constantes fixas. `getHeight` delega para o gerador
 * registrado em `terrainGenerators.js` (`mapDef.terrain.generator`).
 *
 * `landmarks` (compatibilidade com `getTerrainTextures`, que pinta o rio/vaus/bases do mapa
 * continental) é derivado de `mapDef.fords`/`startSlots` — mapas sem esses dados (ex.: islands)
 * simplesmente não têm vau/base marcados na textura.
 */
export class Terrain {
  constructor(scene, mapDef = getMap(DEFAULT_MAP_ID)) {
    this.scene = scene;
    this.mapDef = mapDef;
    this.width = mapDef.size;
    this.depth = mapDef.size;
    this.segments = Math.round(mapDef.size * 0.8);

    // Compatibilidade com getTerrainTextures (pinta rio/vaus/bases do mapa continental).
    const [ford0, ford1, ford2] = mapDef.fords || [];
    const [slot0, slot1] = mapDef.startSlots || [];
    this.landmarks = {
      humanBase: slot0 ? new THREE.Vector2(slot0.x, slot0.z) : new THREE.Vector2(0, 0),
      orcBase: slot1 ? new THREE.Vector2(slot1.x, slot1.z) : new THREE.Vector2(0, 0),
      centerFord: ford1 ? new THREE.Vector2(ford1.x, ford1.z) : new THREE.Vector2(0, 0),
      northFord: ford0 ? new THREE.Vector2(ford0.x, ford0.z) : new THREE.Vector2(0, 0),
      southFord: ford2 ? new THREE.Vector2(ford2.x, ford2.z) : new THREE.Vector2(0, 0)
    };

    this.createTerrainMesh();
  }

  /**
   * Altura do terreno em (x, z), delegada ao gerador do mapa (`terrainGenerators.js`).
   */
  getHeight(x, z) {
    return getHeightForMap(this.mapDef, x, z);
  }

  getSurfaceType(x, z, h) {
    if (h < 0.2) return 'water';
    if (h < 1.4) return 'sand';
    return 'grass';
  }

  isWater(x, z) {
    return this.getHeight(x, z) < 0.65;
  }

  isWalkable(x, z) {
    return this.getHeight(x, z) >= 0.65;
  }

  createTerrainMesh() {
    const geo = new THREE.PlaneGeometry(this.width, this.depth, this.segments, this.segments);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const h = this.getHeight(x, z);
      pos.setY(i, h);
    }

    // Convert to non-indexed for crisp flat shading
    const nonIndexedGeo = geo.toNonIndexed();
    nonIndexedGeo.computeVertexNormals();

    // Map exact UV coordinates from world space [-70, 70] to [0, 1]
    const p = nonIndexedGeo.attributes.position;
    const uvArray = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const z = p.getZ(i);
      uvArray[i * 2] = (x + this.width / 2) / this.width;
      uvArray[i * 2 + 1] = (z + this.depth / 2) / this.depth;
    }
    nonIndexedGeo.setAttribute('uv', new THREE.BufferAttribute(uvArray, 2));

    // Multi-tone vertex modulation
    const colors = [];
    const normals = nonIndexedGeo.attributes.normal;

    for (let i = 0; i < p.count; i += 3) {
      const cx = (p.getX(i) + p.getX(i+1) + p.getX(i+2)) / 3;
      const cy = (p.getY(i) + p.getY(i+1) + p.getY(i+2)) / 3;
      const cz = (p.getZ(i) + p.getZ(i+1) + p.getZ(i+2)) / 3;

      const ny = (normals.getY(i) + normals.getY(i+1) + normals.getY(i+2)) / 3;

      const hash = Math.abs(Math.sin(cx * 12.9898 + cz * 78.233)) * 43758.5453;
      const rand = hash - Math.floor(hash);

      const triColor = new THREE.Color(1.0, 1.0, 1.0);

      if (cy < 0.2) {
        // Submerged riverbed / sand
        triColor.setRGB(0.90, 0.88, 0.78);
      } else if (cy < 1.4) {
        // Sandy shoreline slope
        const sandTone = 0.95 + (rand - 0.5) * 0.05;
        triColor.setRGB(sandTone, sandTone * 0.97, sandTone * 0.90);
      } else if (ny < 0.65) {
        // Steep slope / rock cliff
        const cliffTone = 0.86 + (rand - 0.5) * 0.06;
        triColor.setRGB(cliffTone * 0.94, cliffTone * 0.92, cliffTone * 0.88);
      } else {
        // Lush plateau
        const isOrcTerritory = (cx < -5 && cz > 5);
        if (isOrcTerritory) {
          // Earthy rustic grass for Orc dominion
          const orcTone = 0.96 + (rand - 0.5) * 0.05;
          triColor.setRGB(orcTone * 0.98, orcTone * 0.96, orcTone * 0.88);
        } else {
          // Lush emerald grass for Human kingdom
          const grassTone = 0.98 + (rand - 0.5) * 0.06;
          triColor.setRGB(grassTone * 0.98, grassTone, grassTone * 0.96);
        }
      }

      for (let v = 0; v < 3; v++) {
        colors.push(triColor.r, triColor.g, triColor.b);
      }
    }

    nonIndexedGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    // Master Procedural PBR Terrain Material
    let terrainTex;
    if (this.mapDef.terrain?.generator === 'continental') {
      terrainTex = getTerrainTextures(this.landmarks, this.width);
    } else {
      terrainTex = getTerrainTexturesFromHeight({
        id: this.mapDef.id,
        size: this.width,
        getHeight: (x, z) => this.getHeight(x, z),
        waterLevel: this.mapDef.waterLevel ?? 0.5,
        startSlots: this.mapDef.startSlots || []
      });
    }

    const mat = new THREE.MeshStandardMaterial({
      map: terrainTex.map,
      roughnessMap: terrainTex.roughnessMap,
      bumpMap: terrainTex.bumpMap,
      bumpScale: 0.04,
      vertexColors: true,
      flatShading: true,
      roughness: 0.82,
      metalness: 0.04
    });

    this.mesh = new THREE.Mesh(nonIndexedGeo, mat);
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = false;
    this.mesh.name = 'Terrain';
    this.scene.add(this.mesh);
  }
}
