/**
 * TerrainView.js — F2-08c: malha, textura e material do terreno (`src/sim/Terrain.js` é só dados/altura).
 * `mesh` é o `THREE.Mesh` usado pelo picking (`InputManager`).
 */
import * as THREE from 'three';
import { getTerrainTextures, getTerrainTexturesFromHeight } from '../models/environment/terrainTextures.js';
import { getTilesetTerrainTexture, withRoads } from '../models/environment/tilesetTextures.js';
import { installBiomeDetail } from '../models/environment/biomeDetailMaterial.js';
import { getTileset, getMapTileset } from '../data/tilesets.js';
import { getRegionMap } from '../data/biomeRegions.js';
import { buildLavaInfo, LAVA_STYLE } from '../data/lavaRender.js';

export class TerrainView {
  /**
   * @param {import('three').Scene} scene
   * @param {import('../sim/Terrain.js').Terrain} terrain
   * @param {{tileset?: string, regions?: boolean}} [options]  F7-04: `tileset` força um tileset (prévia); padrão = `mapDef.tileset`.
   *   MUNDO-5: com `mapDef.biomeGrid` o terreno é regional (splat por bioma); `regions: false` desliga (a prévia de tilesets compara
   *   o tileset puro). A lava (`mapDef.lavaGrid`) esquenta o terreno vizinho em qualquer caso.
   */
  constructor(scene, terrain, options = {}) {
    this.scene = scene;
    this.terrain = terrain;
    const mapDef = terrain.mapDef;
    /** F7-04: tileset ativo (`src/data/tilesets.js`). */
    this.tileset = options.tileset ? getTileset(options.tileset) : getMapTileset(mapDef);
    /** MUNDO-5: regiões de bioma (`biomeGrid`), ou `null` = caminho antigo, idêntico ao de antes. */
    this._regionsOn = options.regions !== false;
    this.regions = this._regionsOn ? getRegionMap(mapDef, this.tileset) : null;
    /** MUNDO-5: lava (`lavaGrid`) para o brilho no terreno vizinho, ou `null`. */
    this.lava = buildLavaInfo(mapDef);
    // Compatibilidade com getTerrainTextures (pinta rio/vaus/bases do mapa continental); `landmarks` é derivado
    // de `mapDef.fords`/`startSlots` — mapas sem esses dados simplesmente não têm vau/base marcados na textura.
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

  dispose() {
    if (this.mesh && this.mesh.parent) this.mesh.parent.remove(this.mesh);
  }

  /** F7-04 (prévia): troca o tileset reconstruindo a malha. */
  setTileset(id) {
    this.dispose();
    if (this.mesh) { this.mesh.geometry.dispose(); this.mesh.material.dispose(); }
    this.tileset = getTileset(id);
    this.regions = this._regionsOn ? getRegionMap(this.terrain.mapDef, this.tileset) : null; // o estilo base mudou
    this.createTerrainMesh();
  }

  createTerrainMesh() {
    const terrain = this.terrain;
    const regions = this.regions;
    const lava = this.lava;
    // Regional (MUNDO-5): sempre o splat (o tileset legado pinta por outro caminho e não sabe de regiões).
    const useSplat = !this.tileset.legacy || !!regions;
    const geo = new THREE.PlaneGeometry(terrain.width, terrain.depth, terrain.segments, terrain.segments);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const h = terrain.getHeight(x, z);
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
      uvArray[i * 2] = (x + terrain.width / 2) / terrain.width;
      uvArray[i * 2 + 1] = (z + terrain.depth / 2) / terrain.depth;
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

      if (useSplat) {
        // F7-04: a cor vem do splat da textura; aqui só sombreamento de relevo (estratos nos penhascos, base escurecida).
        const wl = terrain.mapDef.waterLevel ?? 0.5;
        const surf = regions ? regions.styleDefAt(cx, cz).surface : this.tileset.surface; // MUNDO-5: estratos da região
        let tone = 0.97 + (rand - 0.5) * 0.06;
        if (cy > wl + 0.1 && ny < 0.72) {
          const k = Math.min(1, (0.72 - ny) / 0.3); // 0 = encosta suave, 1 = parede
          const strata = 0.5 + 0.5 * Math.sin(cy * 5.5 + rand * 0.6);
          tone *= 1 - k * (0.12 + surf.strata * strata);
        } else if (ny >= 0.72 && ny < 0.86) {
          tone *= 1.04; // quina superior do platô levemente mais clara
        }
        triColor.setRGB(tone, tone, tone);
      } else if (cy < 0.2) {
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

      // MUNDO-5: terreno vizinho da lava aquece (cor de vértice laranja a ≤ 3 u; o brilho de verdade é a malha emissiva de `world/Lava.js`)
      if (lava) {
        const heat = lava.heatAt(cx, cz, LAVA_STYLE.glowRadius);
        if (heat > 0.001) triColor.setRGB(triColor.r * (1 + 0.85 * heat), triColor.g * (1 + 0.12 * heat), triColor.b * (1 - 0.35 * heat));
      }

      for (let v = 0; v < 3; v++) {
        colors.push(triColor.r, triColor.g, triColor.b);
      }
    }

    nonIndexedGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    // Master Procedural PBR Terrain Material
    let terrainTex;
    const roads = terrain.mapDef.roads;
    if (useSplat) {
      terrainTex = getTilesetTerrainTexture({
        def: this.tileset,
        id: terrain.mapDef.id,
        size: terrain.width,
        getHeight: (x, z) => terrain.getHeight(x, z),
        waterLevel: terrain.mapDef.waterLevel ?? 0.5,
        startSlots: terrain.mapDef.startSlots || [],
        roads,
        masks: terrain.mapDef.splatMasks || [],
        regions,
        lava
      });
    } else if (terrain.mapDef.terrain?.generator === 'continental') {
      terrainTex = getTerrainTextures(this.landmarks, terrain.width);
    } else {
      terrainTex = getTerrainTexturesFromHeight({
        id: terrain.mapDef.id,
        size: terrain.width,
        getHeight: (x, z) => terrain.getHeight(x, z),
        waterLevel: terrain.mapDef.waterLevel ?? 0.5,
        startSlots: terrain.mapDef.startSlots || []
      });
    }
    // Estradas num mapa 'verdejante' (legado): copia a textura cacheada e pinta por cima (nenhum mapa atual tem `roads`).
    if (!useSplat && roads && roads.length) terrainTex = withRoads(terrainTex, roads, terrain.width, this.tileset.palette.road);

    const mat = new THREE.MeshStandardMaterial({
      map: terrainTex.map,
      roughnessMap: terrainTex.roughnessMap,
      bumpMap: terrainTex.bumpMap,
      bumpScale: 0.04,
      vertexColors: true,
      flatShading: true,
      roughness: regions ? regions.roughness : (this.tileset.legacy ? 0.82 : this.tileset.surface.roughness),
      metalness: 0.04
    });
    // M2-19: detalhe procedural de rocha/vulcânico/pântano/gelo (textura ladrilhável + pesos por bioma, no shader do próprio terreno)
    if (useSplat) installBiomeDetail(mat, { def: this.tileset, regions, size: terrain.width });
    this.material = mat;

    this.mesh = new THREE.Mesh(nonIndexedGeo, mat);
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = false;
    this.mesh.name = 'Terrain';
    this.scene.add(this.mesh);
  }
}
