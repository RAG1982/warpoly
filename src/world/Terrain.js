import * as THREE from 'three';
import { getTerrainTextures } from '../models/environment/terrainTextures.js';

/**
 * Balanced RTS Continental Terrain System (Size: 140x140)
 * 
 * Features:
 * 1. Dominant Land Continent (>75% land, <25% water):
 *    Continuous solid landmass extending across |x| < 56, |z| < 56.
 *    Only thin natural beach borders and shallow coastlines along the outer perimeter.
 * 2. Human Kingdom (Northeast): Vast rolling emerald plains around (32, -30).
 * 3. Orc Dominion (Southwest): Expansive rugged rustic plains around (-32, 30).
 * 4. Central River Valley: Curving natural river channel along diagonal x - z = 0.
 * 5. Three Strategic Crossings / Fords:
 *    North Ford (-16, -16), Center Ford (0, 0), and South Ford (16, 16) - all wide, solid land bridges (y = 2.4).
 */
export class Terrain {
  constructor(scene) {
    this.scene = scene;
    this.width = 140;
    this.depth = 140;
    this.segments = 112;

    // Key Realm Centers & Strategic Locations
    this.landmarks = {
      humanBase: new THREE.Vector2(32, -30),
      orcBase: new THREE.Vector2(-32, 30),
      centerFord: new THREE.Vector2(0, 0),
      northFord: new THREE.Vector2(-16, -16),
      southFord: new THREE.Vector2(16, 16)
    };

    this.createTerrainMesh();
  }

  /**
   * Calculates terrain height for any (x, z) coordinate
   */
  getHeight(x, z) {
    const maxCoord = Math.max(Math.abs(x), Math.abs(z));

    // Base continental plateau elevation with natural rolling knolls
    const bumps = Math.sin(x * 0.3) * 0.2 + Math.cos(z * 0.3) * 0.2 + Math.sin((x + z) * 0.14) * 0.12;
    let height = 2.6 + bumps;

    // Outer Coastline Perimeter Falloff (solid land up to 55 units, then slopes down to water at 65+)
    if (maxCoord > 54) {
      const t = Math.min(1, Math.max(0, (maxCoord - 54) / 12));
      const falloff = t * t * (3 - 2 * t);
      height = 2.6 - falloff * 4.4; // Drops smoothly to -1.8 (water level is 0.0)
    }

    // Natural River Valley (diagonal along x - z = 0, with a gentle organic bend)
    const riverBend = Math.sin((x + z) * 0.08) * 5.5;
    const distToRiverLine = Math.abs(x - z - riverBend) / Math.SQRT2;

    // River channel width ~ 6.0 units
    if (distToRiverLine < 6.0 && maxCoord < 56) {
      // Check if point is on one of the 3 Strategic Crossings / Fords
      const dNorthFord = Math.hypot(x - this.landmarks.northFord.x, z - this.landmarks.northFord.y);
      const dSouthFord = Math.hypot(x - this.landmarks.southFord.x, z - this.landmarks.southFord.y);
      const dCenterFord = Math.hypot(x - this.landmarks.centerFord.x, z - this.landmarks.centerFord.y);

      const isFord = (dNorthFord < 7.5) || (dSouthFord < 7.5) || (dCenterFord < 8.5);

      if (isFord) {
        // Dry, solid, fully walkable land bridge (elevation 2.35)
        height = Math.max(height, 2.35 + Math.sin(x * 0.5) * 0.1);
      } else {
        // Carve river channel down below water level
        const riverDepthFactor = 1 - (distToRiverLine / 6.0);
        const channelHeight = -0.6 - riverDepthFactor * 1.4;
        height = Math.min(height, channelHeight);
      }
    }

    return height;
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
    const terrainTex = getTerrainTextures(this.landmarks, this.width);

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
