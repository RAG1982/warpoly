import * as THREE from 'three';
import { ModelFactory } from '../entities/ModelFactory.js';

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
    window.addEventListener('keydown', e => this.onKeyDown(e));
    window.addEventListener('keyup', e => this.onKeyUp(e));

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
    dom.addEventListener('mousedown', e => this.onMouseDown(e));
    window.addEventListener('mousemove', e => this.onMouseMove(e));
    window.addEventListener('mouseup', e => this.onMouseUp(e));
    dom.addEventListener('wheel', e => this.onWheel(e), { passive: false });
    dom.addEventListener('contextmenu', e => e.preventDefault());

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

    if (e.code === 'KeyH') {
      // Focus on Castle
      const castle = this.gm.buildings.find(b => b.type === 'castle');
      if (castle) {
        this.sm.cameraTarget.copy(castle.mesh.position);
        this.gm.selectSingle(castle);
      }
    } else if (e.code === 'Escape') {
      if (this.placingBuildingType) {
        this.cancelPlacement();
      } else {
        this.gm.clearSelection();
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
    const zoomDir = Math.sign(e.deltaY) * 0.12;
    this.sm.zoomCamera(zoomDir);
  }

  onMouseDown(e) {
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

    // Update ghost building position
    if (this.placingBuildingType && this.ghostMesh) {
      const h = this.terrain.getHeight(this.groundIntersection.x, this.groundIntersection.z);
      this.ghostMesh.position.set(this.groundIntersection.x, h, this.groundIntersection.z);
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
    this.gm.units.forEach(u => allMeshes.push(u.mesh));
    this.gm.enemies.forEach(e => allMeshes.push(e.mesh));
    this.gm.buildings.forEach(b => allMeshes.push(b.mesh));
    this.gm.trees.forEach(t => allMeshes.push(t.mesh));
    this.gm.resourceDeposits.forEach(r => allMeshes.push(r.mesh));

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

    // Create ghost mesh preview
    switch (buildingType) {
      case 'lumber_camp': this.ghostMesh = ModelFactory.createLumberCamp(); break;
      case 'cottage': this.ghostMesh = ModelFactory.createCottage(); break;
      case 'barracks': this.ghostMesh = ModelFactory.createBarracks(); break;
      case 'watchtower': this.ghostMesh = ModelFactory.createWatchtower(); break;
      case 'farm': this.ghostMesh = ModelFactory.createFarm(); break;
      default: this.ghostMesh = ModelFactory.createCottage(); break;
    }

    // Set semi-transparent green ghost material
    const ghostMat = new THREE.MeshBasicMaterial({
      color: 0x48bb78,
      transparent: true,
      opacity: 0.6,
      wireframe: false
    });

    this.ghostMesh.traverse(c => {
      if (c.isMesh) {
        c.material = ghostMat;
        c.castShadow = false;
        c.receiveShadow = false;
      }
    });

    this.sm.scene.add(this.ghostMesh);
  }

  confirmPlacement() {
    if (!this.placingBuildingType) return;
    const stats = this.getCost(this.placingBuildingType);
    if (!this.gm.canAfford(stats.cost)) {
      return;
    }

    // Valid placement check: height must be above water
    const h = this.terrain.getHeight(this.groundIntersection.x, this.groundIntersection.z);
    if (h < 1.2) {
      return; // Too close to water
    }

    this.gm.deductResources(stats.cost);
    this.gm.buildNewBuilding(this.placingBuildingType, this.groundIntersection.x, this.groundIntersection.z);
    this.cancelPlacement();
  }

  cancelPlacement() {
    if (this.ghostMesh) {
      this.sm.scene.remove(this.ghostMesh);
      this.ghostMesh = null;
    }
    this.placingBuildingType = null;
  }

  getCost(type) {
    switch (type) {
      case 'lumber_camp': return { cost: { wood: 80 } };
      case 'cottage': return { cost: { wood: 50 } };
      case 'barracks': return { cost: { wood: 120, stone: 60 } };
      case 'watchtower': return { cost: { wood: 80, stone: 40 } };
      case 'farm': return { cost: { wood: 60 } };
      default: return { cost: { wood: 50 } };
    }
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
}
