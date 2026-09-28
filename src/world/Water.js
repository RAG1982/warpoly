import * as THREE from 'three';
import {
  getWaterSurfaceTextures,
  getCattailLotusTextures
} from '../models/environment/waterTextures.js';
import { enableShadows } from '../models/materials.js';

/**
 * Next-Gen Stylized Water & Shoreline System for WarPoly
 * Inspired by Warcraft 2 hand-painted art style, Valorant, and Overwatch.
 *
 * Architecture:
 * 1. Deep Water Base Plane: Rich deep sapphire / ocean navy blue foundation.
 * 2. Translucent Animated Surface: Seamless Voronoi caustic light webs, low-poly wave displacement.
 * 3. Shoreline Foam Fringes: Stylized scalloped surf foam rings hugging the coastlines of the
 *    main island and bandit mini-island with pulsating alpha and tidal surge.
 * 4. Enhanced Cattails & Lotus Lilies: Textured velvet brown cattails, floating lotus pads & water lilies.
 */
export class Water {
  constructor(scene, terrain) {
    this.scene = scene;
    this.terrain = terrain;
    this.waterLevel = 0.5;

    // Collections for animations
    this.reedClumps = [];
    this.lotusEntities = [];

    // Multi-tiered Water System
    this.createDeepWaterBase();
    this.createWaterMesh();
    this.createReeds();
  }

  /**
   * 1. Deep Water Base Plane (Abyssal sapphire / ocean navy foundation)
   */
  createDeepWaterBase() {
    const geo = new THREE.PlaneGeometry(180, 180, 8, 8);
    geo.rotateX(-Math.PI / 2);

    const mat = new THREE.MeshStandardMaterial({
      color: 0x09233f, // Deep abyssal sapphire / navy blue
      roughness: 0.92,
      metalness: 0.08,
      flatShading: true
    });

    this.deepWaterMesh = new THREE.Mesh(geo, mat);
    this.deepWaterMesh.position.y = -1.8;
    this.deepWaterMesh.receiveShadow = true;
    this.deepWaterMesh.name = 'DeepWaterBase';
    this.scene.add(this.deepWaterMesh);
  }

  /**
   * 2. Translucent Animated Surface Mesh with Caustic Ripples & Low-Poly Wave Facets
   */
  createWaterMesh() {
    const size = 150;
    const segments = 64;
    const geo = new THREE.PlaneGeometry(size, size, segments, segments);
    geo.rotateX(-Math.PI / 2);

    this.initialPositions = geo.attributes.position.array.slice();

    const surfaceTextures = getWaterSurfaceTextures();

    this.surfaceMat = new THREE.MeshStandardMaterial({
      color: 0x3cb0d8, // Vibrant tranquil cyan / turquoise tint
      map: surfaceTextures.map,
      roughnessMap: surfaceTextures.roughnessMap,
      bumpMap: surfaceTextures.bumpMap,
      bumpScale: 0.06,
      roughness: 0.16,
      metalness: 0.20,
      transparent: true,
      opacity: 0.86,
      flatShading: true
    });

    this.mesh = new THREE.Mesh(geo, this.surfaceMat);
    this.mesh.position.y = this.waterLevel;
    this.mesh.receiveShadow = true;
    this.mesh.name = 'WaterSurface';
    this.scene.add(this.mesh);
  }



  /**
   * 4. Enhanced Cattails, Lotus Pads & Water Lilies
   */
  createReeds() {
    const reedGroup = new THREE.Group();
    reedGroup.name = 'WaterVegetationGroup';

    // Shallow calm water reed clump locations along river and coastlines
    const reedLocations = [
      { x: 10, z: 12 },
      { x: 12, z: 15 },
      { x: -10, z: -12 },
      { x: -12, z: -15 },
      { x: -15, z: 18 },
      { x: 15, z: -18 },
      { x: -20, z: 12 }
    ];

    const cattailTex = getCattailLotusTextures();

    // Materials
    const stemMat = new THREE.MeshStandardMaterial({
      map: cattailTex.cattailStemMap,
      roughness: 0.52,
      flatShading: true
    });

    const headMat = new THREE.MeshStandardMaterial({
      map: cattailTex.cattailHeadMap,
      roughnessMap: cattailTex.cattailHeadRoughness,
      roughness: 0.88,
      flatShading: true
    });

    const tipSpikeMat = new THREE.MeshStandardMaterial({
      color: 0x8a623a,
      roughness: 0.85,
      flatShading: true
    });

    const bladeMat = new THREE.MeshStandardMaterial({
      color: 0x4e933f,
      roughness: 0.6,
      side: THREE.DoubleSide,
      flatShading: true
    });

    const lotusLeafMat = new THREE.MeshStandardMaterial({
      map: cattailTex.lotusLeafMap,
      roughness: 0.28,
      side: THREE.DoubleSide
    });

    const lotusPetalMat = new THREE.MeshStandardMaterial({
      map: cattailTex.lotusPetalMap,
      roughness: 0.42,
      side: THREE.DoubleSide
    });

    const lotusCenterMat = new THREE.MeshStandardMaterial({
      color: 0xfbbf24,
      roughness: 0.35,
      flatShading: true
    });

    // Reusable Geometries
    const headCylinderGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.52, 7);
    const headCapGeo = new THREE.SphereGeometry(0.08, 7, 4);
    const spikeGeo = new THREE.CylinderGeometry(0.015, 0.02, 0.32, 4);
    const collarGeo = new THREE.CylinderGeometry(0.045, 0.055, 0.06, 6);

    reedLocations.forEach((loc, clumpIdx) => {
      const clump = new THREE.Group();
      clump.name = `ReedClump_${clumpIdx}`;

      // A. Cattail Stalks in Clump
      const stalkCount = 6 + Math.floor(Math.random() * 4);
      for (let s = 0; s < stalkCount; s++) {
        const stalk = new THREE.Group();

        const stemHeight = 1.9 + Math.random() * 0.8;
        const stemGeo = new THREE.CylinderGeometry(0.032, 0.052, stemHeight, 6);
        const stem = new THREE.Mesh(stemGeo, stemMat);
        stem.position.y = stemHeight * 0.5;
        stalk.add(stem);

        // Velvet brown cylindrical cattail head (with rounded top and bottom caps)
        const headGroup = new THREE.Group();
        const headCylinder = new THREE.Mesh(headCylinderGeo, headMat);
        headGroup.add(headCylinder);

        const headTopCap = new THREE.Mesh(headCapGeo, headMat);
        headTopCap.position.y = 0.26;
        headTopCap.scale.set(1, 0.6, 1);
        headGroup.add(headTopCap);

        const headBottomCap = new THREE.Mesh(headCapGeo, headMat);
        headBottomCap.position.y = -0.26;
        headBottomCap.scale.set(1, 0.6, 1);
        headGroup.add(headBottomCap);

        // Dried collar ring at base of cattail head
        const collar = new THREE.Mesh(collarGeo, tipSpikeMat);
        collar.position.y = -0.31;
        headGroup.add(collar);

        // Male flower spike needle protruding from apex
        const spike = new THREE.Mesh(spikeGeo, tipSpikeMat);
        spike.position.y = 0.44;
        headGroup.add(spike);

        headGroup.position.y = stemHeight - 0.2;
        stalk.add(headGroup);

        // Arching graceful reed blades around stalk base
        const bladeCount = 2 + Math.floor(Math.random() * 2);
        for (let b = 0; b < bladeCount; b++) {
          const bladeH = stemHeight * (0.6 + Math.random() * 0.35);
          const bladeGeo = new THREE.ConeGeometry(0.07, bladeH, 3);
          bladeGeo.translate(0, bladeH * 0.5, 0);
          const blade = new THREE.Mesh(bladeGeo, bladeMat);
          const bAngle = Math.random() * Math.PI * 2;
          blade.rotation.set(
            Math.sin(bAngle) * 0.3,
            bAngle,
            Math.cos(bAngle) * 0.3
          );
          blade.scale.set(0.4, 1, 1.2);
          stalk.add(blade);
        }

        // Stalk scatter within clump
        const ox = (Math.random() - 0.5) * 1.5;
        const oz = (Math.random() - 0.5) * 1.5;
        stalk.position.set(ox, 0, oz);
        stalk.rotation.z = (Math.random() - 0.5) * 0.16;
        stalk.rotation.x = (Math.random() - 0.5) * 0.16;

        clump.add(stalk);
      }

      // B. Floating Lotus Leaves / Lily Pads around clump
      const padCount = 4 + Math.floor(Math.random() * 3);
      for (let p = 0; p < padCount; p++) {
        const padR = 0.45 + Math.random() * 0.4;
        // Slotted fan disc with notch
        const padGeo = new THREE.CircleGeometry(padR, 14, 0.35, Math.PI * 1.76);
        padGeo.rotateX(-Math.PI / 2);

        const pad = new THREE.Mesh(padGeo, lotusLeafMat);
        const pox = (Math.random() - 0.5) * 2.8;
        const poz = (Math.random() - 0.5) * 2.8;
        const pY = this.waterLevel + 0.012 + Math.random() * 0.005;

        pad.position.set(pox, pY, poz);
        pad.rotation.y = Math.random() * Math.PI * 2;
        pad.rotation.z = (Math.random() - 0.5) * 0.04;
        pad.userData = { baseY: pY, offset: Math.random() * 6 };

        clump.add(pad);
        this.lotusEntities.push(pad);
      }

      // C. Blooming Lotus Flowers / Water Lilies
      const flowerCount = 1 + Math.floor(Math.random() * 2);
      for (let f = 0; f < flowerCount; f++) {
        const flower = new THREE.Group();

        // 1. Green outer sepals
        const sepalCount = 4;
        for (let s = 0; s < sepalCount; s++) {
          const sAngle = (s / sepalCount) * Math.PI * 2;
          const sGeo = new THREE.ConeGeometry(0.06, 0.22, 3);
          sGeo.rotateX(Math.PI * 0.4);
          const sepal = new THREE.Mesh(sGeo, bladeMat);
          sepal.rotation.y = sAngle;
          sepal.position.y = 0.02;
          flower.add(sepal);
        }

        // 2. Layer 1: Outward cupped lotus petals (6 petals)
        const pet1Count = 6;
        for (let p = 0; p < pet1Count; p++) {
          const pAngle = (p / pet1Count) * Math.PI * 2;
          const petGeo = new THREE.PlaneGeometry(0.11, 0.24);
          petGeo.rotateX(Math.PI * 0.32);
          const pet = new THREE.Mesh(petGeo, lotusPetalMat);
          pet.rotation.y = pAngle;
          pet.position.y = 0.04;
          flower.add(pet);
        }

        // 3. Layer 2: Upright inner lotus petals (5 petals)
        const pet2Count = 5;
        for (let p = 0; p < pet2Count; p++) {
          const pAngle = (p / pet2Count) * Math.PI * 2 + 0.5;
          const petGeo = new THREE.PlaneGeometry(0.09, 0.20);
          petGeo.rotateX(Math.PI * 0.16);
          const pet = new THREE.Mesh(petGeo, lotusPetalMat);
          pet.rotation.y = pAngle;
          pet.position.y = 0.06;
          flower.add(pet);
        }

        // 4. Golden stamen center core
        const coreGeo = new THREE.SphereGeometry(0.07, 6, 4);
        coreGeo.scale(1, 0.7, 1);
        const core = new THREE.Mesh(coreGeo, lotusCenterMat);
        core.position.y = 0.08;
        flower.add(core);

        const fox = (Math.random() - 0.5) * 2.2;
        const foz = (Math.random() - 0.5) * 2.2;
        const fY = this.waterLevel + 0.02;
        flower.position.set(fox, fY, foz);
        flower.rotation.y = Math.random() * Math.PI * 2;
        flower.userData = { baseY: fY, offset: Math.random() * 6 };

        clump.add(flower);
        this.lotusEntities.push(flower);
      }

      clump.position.set(loc.x, 0, loc.z);
      enableShadows(clump);
      reedGroup.add(clump);

      this.reedClumps.push(clump);
    });

    this.scene.add(reedGroup);
  }

  /**
   * Animation update called every frame
   * @param {number} time - Elapsed game time in seconds
   */
  update(time) {
    // 1. Oscillating Wave Displacement (Low-poly faceted water surface)
    if (this.mesh) {
      const pos = this.mesh.geometry.attributes.position;
      const init = this.initialPositions;

      for (let i = 0; i < pos.count; i++) {
        const x = init[i * 3];
        const z = init[i * 3 + 2];

        // Multi-frequency wave harmonics
        const w1 = Math.sin(x * 0.18 + time * 1.6) * 0.11;
        const w2 = Math.cos(z * 0.22 + time * 1.3) * 0.08;
        const w3 = Math.sin((x + z) * 0.14 + time * 2.0) * 0.05;

        pos.setY(i, w1 + w2 + w3);
      }

      pos.needsUpdate = true;
      this.mesh.geometry.computeVertexNormals();
    }

    // 2. Shifting Stylized Caustic Texture Offset (Drifting underwater light web)
    if (this.surfaceMat) {
      const ox = (time * 0.012) % 1;
      const oy = (time * 0.009) % 1;

      if (this.surfaceMat.map) {
        this.surfaceMat.map.offset.set(ox, oy);
      }
      if (this.surfaceMat.roughnessMap) {
        this.surfaceMat.roughnessMap.offset.set(ox, oy);
      }
      if (this.surfaceMat.bumpMap) {
        this.surfaceMat.bumpMap.offset.set(ox, oy);
      }
    }



    // 4. Gentle Breeze Sway on Cattails
    for (let c = 0; c < this.reedClumps.length; c++) {
      const clump = this.reedClumps[c];
      clump.rotation.z = Math.sin(time * 1.5 + clump.position.x * 0.4) * 0.035;
      clump.rotation.x = Math.cos(time * 1.2 + clump.position.z * 0.4) * 0.028;
    }

    // 5. Water Bobbing on Lotus Leaves & Water Lilies
    for (let l = 0; l < this.lotusEntities.length; l++) {
      const entity = this.lotusEntities[l];
      const bob = Math.sin(time * 2.2 + entity.userData.offset) * 0.014;
      entity.position.y = entity.userData.baseY + bob;
    }
  }
}
