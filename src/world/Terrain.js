import * as THREE from 'three';
import { getTerrainTextures } from '../models/environment/terrainTextures.js';

export class Terrain {
  constructor(scene) {
    this.scene = scene;
    this.width = 140;
    this.depth = 140;
    this.segments = 96;
    
    // Landmarks for painting paths and dirt clearings
    this.landmarks = {
      castle: new THREE.Vector2(0, -2),
      lumberCamp: new THREE.Vector2(-19, -4),
      goldMine: new THREE.Vector2(-11, 15),
      cottage: new THREE.Vector2(19, -7),
      barracks: new THREE.Vector2(16, 13),
      banditCamp: new THREE.Vector2(-36, 32) // mini-island
    };

    this.createTerrainMesh();
  }

  // Calculate terrain height for any (x, z) with natural terraces and gentle rolling knolls
  getHeight(x, z) {
    const distToCenter = Math.hypot(x, z);
    const miniX = -36;
    const miniZ = 32;
    const distToMini = Math.hypot(x - miniX, z - miniZ);

    let height = -2.0;

    // Main island falloff (radius ~ 42)
    const mainRadius = 40 + Math.sin(x * 0.15) * 4 + Math.cos(z * 0.18) * 4;
    if (distToCenter < mainRadius + 8) {
      if (distToCenter < mainRadius - 10) {
        // Upper grass plateau (smooth with subtle rolling low-poly bumps)
        const bumps = Math.sin(x * 0.3) * 0.22 + Math.cos(z * 0.3) * 0.22 + Math.sin(x * 0.1 + z * 0.1) * 0.15;
        height = 2.6 + bumps;
      } else {
        // Slope down to beach and water with subtle natural terrace step
        const t = (distToCenter - (mainRadius - 10)) / 18;
        const clampedT = Math.min(1, Math.max(0, t));
        const factor = 1 - (clampedT * clampedT * (3 - 2 * clampedT));
        height = -1.2 + factor * 3.8;
      }
    }

    // Mini island (bottom left)
    const miniRadius = 12 + Math.sin(x * 0.4) * 1.5;
    if (distToMini < miniRadius + 5) {
      if (distToMini < miniRadius - 4) {
        const miniHeight = 2.2 + Math.sin(x * 0.5) * 0.18;
        height = Math.max(height, miniHeight);
      } else {
        const t = (distToMini - (miniRadius - 4)) / 9;
        const factor = 1 - Math.min(1, Math.max(0, t));
        height = Math.max(height, -1.0 + factor * 3.2);
      }
    }

    return height;
  }

  // Determine ground type: 'path', 'tilled_dirt', 'grass', 'sand', 'water'
  getSurfaceType(x, z, h) {
    if (h < 0.2) return 'water';
    if (h < 1.4) return 'sand';

    // Check tilled soil patches (brown dirt around Lumber Camp, Farm, and Castle base)
    const dLumber = Math.hypot(x - this.landmarks.lumberCamp.x, z - this.landmarks.lumberCamp.y);
    if (dLumber < 6.5) return 'tilled_dirt';

    const dFarm = Math.hypot(x - this.landmarks.cottage.x, z - (this.landmarks.cottage.y + 4));
    if (dFarm < 5.5) return 'tilled_dirt';

    const dSoilPatch = Math.hypot(x - (-2), z - 17);
    if (dSoilPatch < 4.2) return 'tilled_dirt';

    return 'grass';
  }

  distanceToSegment(p, a, b) {
    const ab = new THREE.Vector2().subVectors(b, a);
    const ap = new THREE.Vector2().subVectors(p, a);
    const abLenSq = ab.lengthSq();
    if (abLenSq === 0) return ap.length();
    const t = Math.max(0, Math.min(1, ap.dot(ab) / abLenSq));
    const proj = new THREE.Vector2().copy(a).addScaledVector(ab, t);
    return p.distanceTo(proj);
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

    // Convert to non-indexed so each triangle facet has unique vertices and flat shading
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

    // Multi-tone vertex modulation (subtle low-poly ambient facet shading)
    const colors = [];
    const normals = nonIndexedGeo.attributes.normal;

    for (let i = 0; i < p.count; i += 3) {
      const cx = (p.getX(i) + p.getX(i+1) + p.getX(i+2)) / 3;
      const cy = (p.getY(i) + p.getY(i+1) + p.getY(i+2)) / 3;
      const cz = (p.getZ(i) + p.getZ(i+1) + p.getZ(i+2)) / 3;

      const ny = (normals.getY(i) + normals.getY(i+1) + normals.getY(i+2)) / 3;

      // Seed pseudo-random per face for subtle facet lighting
      const hash = Math.abs(Math.sin(cx * 12.9898 + cz * 78.233)) * 43758.5453;
      const rand = hash - Math.floor(hash);

      const triColor = new THREE.Color(1.0, 1.0, 1.0);

      if (cy < 0.2) {
        // Submerged sand
        triColor.setRGB(0.92, 0.90, 0.82);
      } else if (cy < 1.4) {
        // Sandy shoreline slope
        const sandTone = 0.96 + (rand - 0.5) * 0.05;
        triColor.setRGB(sandTone, sandTone * 0.98, sandTone * 0.92);
      } else if (ny < 0.65) {
        // Steep slope / rock cliff
        const cliffTone = 0.86 + (rand - 0.5) * 0.06;
        triColor.setRGB(cliffTone * 0.94, cliffTone * 0.92, cliffTone * 0.88);
      } else {
        // Lush plateau: subtle facet modulation for hand-painted vibrancy
        const grassTone = 0.98 + (rand - 0.5) * 0.06;
        triColor.setRGB(grassTone * 0.98, grassTone, grassTone * 0.96);
      }

      for (let v = 0; v < 3; v++) {
        colors.push(triColor.r, triColor.g, triColor.b);
      }
    }

    nonIndexedGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    // Master Procedural PBR Terrain Material
    const terrainTex = getTerrainTextures(this.landmarks);

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
