import * as THREE from 'three';
import { VISION_RADII, DEFAULT_UNIT, DEFAULT_BUILDING } from '../data/index.js';

/**
 * Fog of War (Névoa de Guerra & Exploração Permanente)
 * 
 * Inspired by classic RTS games (Warcraft 2 / Age of Empires).
 * - Covers the vast 320x320 map in an unexplored shroud.
 * - Player units and buildings continuously reveal territory based on their vision radius.
 * - Exploration is PERMANENT: once revealed, the landscape remains explored.
 * - Renders a sleek 3D shroud over the world and overlays the dark fog on the minimap.
 * - Culls enemy units and structures that are hidden in the unexplored darkness.
 */
export class FogOfWar {
  constructor(scene, worldWidth = 140, worldDepth = 140) {
    this.scene = scene;
    this.worldWidth = worldWidth;
    this.worldDepth = worldDepth;

    // Grid resolution for exploration logic (128x128 covers 140x140 with ~1.1 unit precision)
    this.gridSize = 128;
    this.cellSize = worldWidth / this.gridSize;

    // 2D Array: 0 = Unexplored (fog), 1 = Explored (permanently revealed)
    this.explored = new Uint8Array(this.gridSize * this.gridSize);

    // Active vision (currently visible right now)
    this.activeVision = new Uint8Array(this.gridSize * this.gridSize);

    // Canvas for 3D Shroud & Minimap Texture
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.gridSize;
    this.canvas.height = this.gridSize;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });

    // Initial fill: pitch-dark fog
    this.ctx.fillStyle = '#0a0d14';
    this.ctx.fillRect(0, 0, this.gridSize, this.gridSize);

    // Three.js Texture from Canvas
    this.fogTexture = new THREE.CanvasTexture(this.canvas);
    this.fogTexture.minFilter = THREE.LinearFilter;
    this.fogTexture.magFilter = THREE.LinearFilter;
    this.fogTexture.generateMipmaps = false;

    // Vision radii by entity type — src/data (units.js / buildings.js)
    this.visionRadii = { ...VISION_RADII };

    this.needsUpdate = true;
    this.updateTimer = 0;

    // 3D Shroud Mesh in world
    this.createShroudMesh();
  }

  createShroudMesh() {
    const geo = new THREE.PlaneGeometry(this.worldWidth, this.worldDepth, 1, 1);
    geo.rotateX(-Math.PI / 2);

    // Custom shader material for soft ethereal shroud with animated mist tint
    const shroudMat = new THREE.MeshBasicMaterial({
      map: this.fogTexture,
      transparent: true,
      opacity: 0.94,
      depthWrite: false
    });

    this.shroudMesh = new THREE.Mesh(geo, shroudMat);
    this.shroudMesh.position.y = 5.2; // Hover above ground and buildings
    this.shroudMesh.renderOrder = 999; // Render on top of terrain/decorations
    this.shroudMesh.name = 'FogOfWarShroud';
    this.scene.add(this.shroudMesh);
  }

  /**
   * Converts world coordinates (wx, wz) to grid coordinates (gx, gz)
   */
  worldToGrid(wx, wz) {
    const halfW = this.worldWidth / 2;
    const halfD = this.worldDepth / 2;
    const gx = Math.floor(((wx + halfW) / this.worldWidth) * this.gridSize);
    const gz = Math.floor(((wz + halfD) / this.worldDepth) * this.gridSize);
    return {
      gx: Math.max(0, Math.min(this.gridSize - 1, gx)),
      gz: Math.max(0, Math.min(this.gridSize - 1, gz))
    };
  }

  /**
   * Checks if a world position is explored
   */
  isExplored(wx, wz) {
    const { gx, gz } = this.worldToGrid(wx, wz);
    return this.explored[gz * this.gridSize + gx] === 1;
  }

  /**
   * Reveals an area centered at (wx, wz) with given world radius
   */
  revealArea(wx, wz, radius) {
    const { gx: centerGx, gz: centerGz } = this.worldToGrid(wx, wz);
    const gridRadius = Math.ceil(radius / this.cellSize);
    const gridRadiusSq = gridRadius * gridRadius;

    let anyNewExplored = false;

    const minX = Math.max(0, centerGx - gridRadius);
    const maxX = Math.min(this.gridSize - 1, centerGx + gridRadius);
    const minZ = Math.max(0, centerGz - gridRadius);
    const maxZ = Math.min(this.gridSize - 1, centerGz + gridRadius);

    for (let gz = minZ; gz <= maxZ; gz++) {
      const dz = gz - centerGz;
      const dz2 = dz * dz;
      for (let gx = minX; gx <= maxX; gx++) {
        const dx = gx - centerGx;
        if (dx * dx + dz2 <= gridRadiusSq) {
          const idx = gz * this.gridSize + gx;
          this.activeVision[idx] = 1;
          if (this.explored[idx] === 0) {
            this.explored[idx] = 1;
            anyNewExplored = true;
          }
        }
      }
    }

    if (anyNewExplored) {
      this.needsUpdate = true;
    }
  }

  /**
   * Main update tick called by GameManager
   */
  update(delta, playerUnits, playerBuildings, enemyUnits = [], enemyBuildings = []) {
    this.updateTimer += delta;
    if (this.updateTimer < 0.1) return; // Update 10 times per second for smooth performance
    this.updateTimer = 0;

    // Reset active vision buffer
    this.activeVision.fill(0);

    // 1. Reveal fog around living player units
    for (let i = 0; i < playerUnits.length; i++) {
      const u = playerUnits[i];
      if (!u.isDead && u.mesh) {
        const r = this.visionRadii[u.type] || DEFAULT_UNIT.visionRadius;
        this.revealArea(u.mesh.position.x, u.mesh.position.z, r);
      }
    }

    // 2. Reveal fog around living player buildings
    for (let i = 0; i < playerBuildings.length; i++) {
      const b = playerBuildings[i];
      if (!b.isDead && b.mesh) {
        const r = this.visionRadii[b.type] || DEFAULT_BUILDING.visionRadius;
        this.revealArea(b.mesh.position.x, b.mesh.position.z, r);
      }
    }

    // 3. Update canvas texture if new territory was uncovered
    if (this.needsUpdate) {
      this.redrawCanvas();
      this.fogTexture.needsUpdate = true;
      this.needsUpdate = false;
    }

    // 4. Hide enemy units & buildings in unexplored darkness
    this.cullUnexploredEnemies(enemyUnits, enemyBuildings);
  }

  /**
   * Redraws the 2D canvas representing the Fog texture
   * Unexplored = Deep dark slate/mist with soft vignette
   * Explored = Fully transparent
   */
  redrawCanvas() {
    const imgData = this.ctx.createImageData(this.gridSize, this.gridSize);
    const data = imgData.data;

    for (let i = 0; i < this.gridSize * this.gridSize; i++) {
      const isExp = this.explored[i] === 1;
      const isVis = this.activeVision[i] === 1;

      const p = i * 4;
      if (isVis) {
        // Active line of sight: totally transparent
        data[p] = 10;
        data[p + 1] = 13;
        data[p + 2] = 20;
        data[p + 3] = 0; // 100% transparent
      } else if (isExp) {
        // Explored but no current unit standing there: very faint memory mist
        data[p] = 10;
        data[p + 1] = 13;
        data[p + 2] = 20;
        data[p + 3] = 40; // ~15% subtle darkness
      } else {
        // Pitch-black unexplored Fog of War
        data[p] = 10;
        data[p + 1] = 13;
        data[p + 2] = 20;
        data[p + 3] = 245; // ~96% opaque dark fog
      }
    }

    this.ctx.putImageData(imgData, 0, 0);
  }

  /**
   * Culls enemy visibility: enemy units and buildings are invisible
   * if they are standing in territory the player has never explored.
   */
  cullUnexploredEnemies(enemyUnits, enemyBuildings) {
    for (let i = 0; i < enemyUnits.length; i++) {
      const u = enemyUnits[i];
      if (u && u.mesh) {
        const explored = this.isExplored(u.mesh.position.x, u.mesh.position.z);
        u.mesh.visible = explored;
        if (!explored && u.hpGroup) {
          u.hpGroup.visible = false;
        }
      }
    }

    for (let i = 0; i < enemyBuildings.length; i++) {
      const b = enemyBuildings[i];
      if (b && b.mesh) {
        const explored = this.isExplored(b.mesh.position.x, b.mesh.position.z);
        b.mesh.visible = explored;
        if (!explored && b.hpGroup) {
          b.hpGroup.visible = false;
        }
      }
    }
  }

  /**
   * Draws the fog overlay directly onto the 2D Minimap canvas
   */
  drawMinimapFog(minimapCtx, mapWidth, mapHeight) {
    if (!this.canvas) return;
    minimapCtx.drawImage(this.canvas, 0, 0, this.gridSize, this.gridSize, 0, 0, mapWidth, mapHeight);
  }
}
