import * as THREE from 'three';
import { ModelFactory } from '../entities/ModelFactory.js';
import { getCost } from '../data/index.js';

export class InputManager {
  constructor(sceneManager, gameManager, terrain) {
    this.sm = sceneManager;
    this.gm = gameManager;
    this.terrain = terrain;

    // Raycaster & Mouse
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.groundIntersection = new THREE.Vector3();
    this.hoveredEntity = null;

    // Keyboard state
    this.keys = {};

    // F2-04: com `suspended` (menu de pausa aberto) só a câmera responde (WASD/setas);
    // cliques e atalhos são ignorados. `onPauseRequest` é chamado no Esc sem nada a cancelar.
    this.suspended = false;
    this.onPauseRequest = null;

    // Listeners de window/DOM removidos em dispose() (sessão de partida descartável).
    this._abort = new AbortController();
    const opts = { signal: this._abort.signal };
    window.addEventListener('keydown', e => this.onKeyDown(e), opts);
    window.addEventListener('keyup', e => this.onKeyUp(e), opts);
    window.addEventListener('blur', () => { this.keys = {}; }, opts);

    // Mouse drag / selection box
    this.isLeftDown = false;
    this.isRightDown = false;
    this.leftDownPos = { x: 0, y: 0 };
    this.currentMousePos = { x: 0, y: 0 };
    this.isDraggingBox = false;

    // Ghost building placement
    this.placingBuildingType = null;
    this.ghostMesh = null;

    // Click feedback ring on ground
    this.createClickDecal();

    // DOM events
    const dom = this.sm.renderer.domElement;
    dom.addEventListener('mousedown', e => this.onMouseDown(e), opts);
    window.addEventListener('mousemove', e => this.onMouseMove(e), opts);
    window.addEventListener('mouseup', e => this.onMouseUp(e), opts);
    dom.addEventListener('wheel', e => this.onWheel(e), { passive: false, signal: this._abort.signal });
    dom.addEventListener('contextmenu', e => e.preventDefault(), opts);

    // Selection marquee box element
    this.boxEl = document.getElementById('selection-box');
  }

  createClickDecal() {
    const geo = new THREE.RingGeometry(0.5, 0.75, 24);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color: 0x68d391, side: THREE.DoubleSide, transparent: true, opacity: 0 });
    this.clickDecal = new THREE.Mesh(geo, mat);
    this.clickDecal.position.y = 0.1;
    this.sm.scene.add(this.clickDecal);
    this.decalLife = 0;
  }

  playClickDecal(pos, color = 0x68d391) {
    this.clickDecal.position.copy(pos);
    this.clickDecal.position.y += 0.12;
    this.clickDecal.material.color.setHex(color);
    this.clickDecal.material.opacity = 0.9;
    this.clickDecal.scale.set(1, 1, 1);
    this.decalLife = 0.35;
  }

  onKeyDown(e) {
    this.keys[e.code] = true;
    if (this.suspended) return;

    if (e.code === 'KeyH') {
      // Focus on Castle / Great Hall
      const hq = this.gm.buildings.find(b => (b.type === 'castle' || b.type === 'great_hall') && b.faction === 'player');
      if (hq) {
        this.sm.cameraTarget.copy(hq.mesh.position);
        this.gm.selectSingle(hq);
      }
    } else if (e.code === 'Escape') {
      // Esc: cancela a colocação; senão limpa a seleção; senão abre o menu de pausa (F2-04).
      if (this.placingBuildingType) {
        this.cancelPlacement();
      } else if (this.gm.selectedUnits.length > 0 || this.gm.selectedBuilding || this.gm.selectedResource) {
        this.gm.clearSelection();
      } else if (this.onPauseRequest) {
        e.preventDefault();
        this.onPauseRequest();
      }
    } else if (e.code === 'KeyQ') {
      this.sm.rotateCamera(Math.PI / 8);
    } else if (e.code === 'KeyE') {
      this.sm.rotateCamera(-Math.PI / 8);
    }
  }

  onKeyUp(e) {
    this.keys[e.code] = false;
  }

  onWheel(e) {
    e.preventDefault();
    if (this.suspended) return;
    const zoomDir = Math.sign(e.deltaY) * 0.12;
    this.sm.zoomCamera(zoomDir);
  }

  onMouseDown(e) {
    if (this.suspended) return;
    if (e.target && e.target.closest && e.target.closest('#ui-layer')) {
      return;
    }

    this.updateMouseCoords(e);
    this.raycastScene();

    if (e.button === 0) {
      // Left Click
      this.isLeftDown = true;
      this.leftDownPos = { x: e.clientX, y: e.clientY };

      if (this.placingBuildingType) {
        this.confirmPlacement();
      }
    } else if (e.button === 2) {
      // Right Click
      this.isRightDown = true;
      if (this.placingBuildingType) {
        this.cancelPlacement();
      } else {
        const targetColor = (this.hoveredEntity && this.hoveredEntity.faction === 'enemy') ? 0xef4444 : 0xdeb841;
        this.playClickDecal(this.groundIntersection, targetColor);
        this.gm.issueOrder(this.hoveredEntity, this.groundIntersection);
      }
    }
  }

  onMouseMove(e) {
    this.currentMousePos = { x: e.clientX, y: e.clientY };

    if (e.target && e.target.closest && e.target.closest('#ui-layer')) {
      return;
    }

    // Skip redundant raycasting on tiny sub-pixel mouse jitter
    if (this.lastMoveX !== undefined && !this.isLeftDown && !this.placingBuildingType) {
      const distSq = (e.clientX - this.lastMoveX) ** 2 + (e.clientY - this.lastMoveY) ** 2;
      if (distSq < 9) return;
    }
    this.lastMoveX = e.clientX;
    this.lastMoveY = e.clientY;

    this.updateMouseCoords(e);
    this.raycastScene();

    // Selection box dragging
    if (this.isLeftDown && !this.placingBuildingType) {
      const dx = Math.abs(e.clientX - this.leftDownPos.x);
      const dy = Math.abs(e.clientY - this.leftDownPos.y);

      if (dx > 6 || dy > 6) {
        this.isDraggingBox = true;
        this.updateSelectionBoxEl();
      }
    }

    // Update ghost building position and validity color (Green = OK, Red = Obstructed)
    if (this.placingBuildingType && this.ghostMesh) {
      const gx = Math.round(this.groundIntersection.x * 2) / 2;
      const gz = Math.round(this.groundIntersection.z * 2) / 2;

      if (gx !== this.lastGhostGx || gz !== this.lastGhostGz) {
        this.lastGhostGx = gx;
        this.lastGhostGz = gz;

        const h = this.terrain.getHeight(gx, gz);
        this.ghostMesh.position.set(gx, h, gz);

        const isValid = this.gm.canPlaceBuilding(this.placingBuildingType, gx, gz);
        const targetMat = isValid ? ModelFactory.ghostValidMat : ModelFactory.ghostInvalidMat;
        ModelFactory.setGhostMaterial(this.ghostMesh, targetMat);
      }
    }
  }

  onMouseUp(e) {
    if (e.button === 0) {
      if (!this.isLeftDown) return;
      this.isLeftDown = false;

      // If mouseup is over UI element, do not perform 3D scene selection or raycasting
      if (e.target && e.target.closest && e.target.closest('#ui-layer')) {
        if (this.isDraggingBox) {
          this.isDraggingBox = false;
          if (this.boxEl) this.boxEl.style.display = 'none';
        }
        return;
      }

      if (this.isDraggingBox) {
        this.isDraggingBox = false;
        if (this.boxEl) this.boxEl.style.display = 'none';
        this.gm.selectUnitsInBox({
          x1: this.leftDownPos.x,
          y1: this.leftDownPos.y,
          x2: e.clientX,
          y2: e.clientY
        }, this.sm.camera);
      } else if (!this.placingBuildingType) {
        // If military units are selected and player clicks on an enemy, issue attack command!
        if (this.gm.selectedUnits.length > 0 && this.hoveredEntity && this.hoveredEntity.faction === 'enemy') {
          this.playClickDecal(this.hoveredEntity.mesh.position, 0xef4444);
          this.gm.issueOrder(this.hoveredEntity, this.hoveredEntity.mesh.position);
        } else {
          // Standard single selection
          this.gm.selectSingle(this.hoveredEntity);
        }
      }
    } else if (e.button === 2) {
      if (!this.isRightDown) return;
      this.isRightDown = false;
    }
  }

  updateMouseCoords(e) {
    this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
  }

  updateSelectionBoxEl() {
    if (!this.boxEl) return;
    const x1 = Math.min(this.leftDownPos.x, this.currentMousePos.x);
    const y1 = Math.min(this.leftDownPos.y, this.currentMousePos.y);
    const w = Math.abs(this.currentMousePos.x - this.leftDownPos.x);
    const h = Math.abs(this.currentMousePos.y - this.leftDownPos.y);

    this.boxEl.style.display = 'block';
    this.boxEl.style.left = `${x1}px`;
    this.boxEl.style.top = `${y1}px`;
    this.boxEl.style.width = `${w}px`;
    this.boxEl.style.height = `${h}px`;
  }

  raycastScene() {
    this.raycaster.setFromCamera(this.mouse, this.sm.camera);

    // Test terrain intersection
    const hits = this.raycaster.intersectObject(this.terrain.mesh);
    if (hits.length > 0) {
      this.groundIntersection.copy(hits[0].point);
    }

    // Test entity intersection
    const allMeshes = [];
    this.gm.units.forEach(u => { if (u.mesh?.parent) allMeshes.push(u.mesh); });
    this.gm.enemies.forEach(e => { if (e.mesh?.parent) allMeshes.push(e.mesh); });
    this.gm.buildings.forEach(b => { if (b.mesh?.parent) allMeshes.push(b.mesh); });
    this.gm.trees.forEach(t => { if (t.mesh?.parent) allMeshes.push(t.mesh); });
    this.gm.resourceDeposits.forEach(r => { if (r.mesh?.parent) allMeshes.push(r.mesh); });

    const entityHits = this.raycaster.intersectObjects(allMeshes, true);
    if (entityHits.length > 0) {
      let cur = entityHits[0].object;
      while (cur && !cur.userData?.entity && cur.parent) {
        cur = cur.parent;
      }
      this.hoveredEntity = cur?.userData?.entity || null;
    } else {
      this.hoveredEntity = null;
    }
  }

  // --- GHOST BUILDING PLACEMENT ---

  startPlacement(buildingType) {
    this.cancelPlacement();
    this.placingBuildingType = buildingType;

    this.ghostMesh = ModelFactory.getGhost(buildingType);
    this.sm.scene.add(this.ghostMesh);

    if (this.groundIntersection && (this.groundIntersection.x !== 0 || this.groundIntersection.z !== 0)) {
      const gx = Math.round(this.groundIntersection.x * 2) / 2;
      const gz = Math.round(this.groundIntersection.z * 2) / 2;
      const h = this.terrain.getHeight(gx, gz);
      this.ghostMesh.position.set(gx, h, gz);
      this.lastGhostGx = gx;
      this.lastGhostGz = gz;

      const isValid = this.gm.canPlaceBuilding(buildingType, gx, gz);
      const targetMat = isValid ? ModelFactory.ghostValidMat : ModelFactory.ghostInvalidMat;
      ModelFactory.setGhostMaterial(this.ghostMesh, targetMat);
    } else {
      ModelFactory.setGhostMaterial(this.ghostMesh, ModelFactory.ghostValidMat);
      this.ghostMesh.position.set(0, -100, 0);
      this.lastGhostGx = null;
      this.lastGhostGz = null;
    }
  }

  confirmPlacement() {
    if (!this.placingBuildingType) return;
    const stats = this.getCost(this.placingBuildingType);
    if (!this.gm.canAfford(stats.cost)) {
      this.uiManager?.showNotification('⚠️ Recursos insuficientes!');
      return;
    }

    const gx = this.groundIntersection.x;
    const gz = this.groundIntersection.z;

    // Strict clearance check: dry terrain, distance to other buildings, trees, deposits, and fords
    if (!this.gm.canPlaceBuilding(this.placingBuildingType, gx, gz)) {
      this.uiManager?.showNotification('❌ Local obstruído! Mantenha distância de árvores e outras construções.');
      return;
    }

    this.gm.deductResources(stats.cost);
    this.gm.buildNewBuilding(this.placingBuildingType, gx, gz);
    this.cancelPlacement();
  }

  cancelPlacement() {
    if (this.ghostMesh) {
      this.sm.scene.remove(this.ghostMesh);
      this.ghostMesh = null;
    }
    this.lastGhostGx = null;
    this.lastGhostGz = null;
    this.placingBuildingType = null;
  }

  getCost(type) {
    return { cost: getCost(type) };
  }

  update(delta) {
    // Camera Panning via WASD / Arrow Keys
    const panSpeed = 40 * delta * this.sm.zoomLevel;
    let moveForward = 0;
    let moveRight = 0;

    if (this.keys['KeyW'] || this.keys['ArrowUp']) moveForward += panSpeed;
    if (this.keys['KeyS'] || this.keys['ArrowDown']) moveForward -= panSpeed;
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) moveRight -= panSpeed;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) moveRight += panSpeed;

    if (moveForward !== 0 || moveRight !== 0) {
      this.sm.panCamera(moveRight, moveForward);
    }

    // Update click decal animation
    if (this.decalLife > 0) {
      this.decalLife -= delta;
      this.clickDecal.scale.addScalar(delta * 2.5);
      this.clickDecal.material.opacity = Math.max(0, this.decalLife / 0.35);
    }
  }

  /** F2-04: remove listeners, fantasma de construção e o anel de clique (fim da sessão). */
  dispose() {
    this._abort.abort();
    this.cancelPlacement();
    if (this.boxEl) this.boxEl.style.display = 'none';
    if (this.clickDecal) {
      this.clickDecal.removeFromParent();
      this.clickDecal.geometry.dispose();
      this.clickDecal.material.dispose();
      this.clickDecal = null;
    }
    this.keys = {};
    this.hoveredEntity = null;
    this.onPauseRequest = null;
    this.uiManager = null;
  }
}
