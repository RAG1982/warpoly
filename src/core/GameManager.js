import * as THREE from 'three';
import { Unit } from '../entities/Unit.js';
import { Building } from '../entities/Building.js';
import { Tree } from '../entities/Tree.js';
import { ResourceDeposit } from '../entities/ResourceDeposit.js';

export class GameManager {
  constructor(scene, terrain, soundManager, particleSystem) {
    this.scene = scene;
    this.terrain = terrain;
    this.soundManager = soundManager;
    this.particleSystem = particleSystem;

    // Economy & Pop
    this.resources = {
      wood: 180,
      gold: 140,
      stone: 80
    };
    this.population = 0;
    this.maxPopulation = 15;

    // Entity collections
    this.units = [];
    this.enemies = [];
    this.buildings = [];
    this.trees = [];
    this.resourceDeposits = [];
    this.arrows = [];

    // Selected entities
    this.selectedUnits = [];
    this.selectedBuilding = null;
    this.selectedResource = null;

    // Game state
    this.isGameOver = false;
    this.gameWon = false;
    this.gameSpeed = 1.0;
    this.isPaused = false;
    this.gameTime = 0;

    // Raid / Wave defense
    this.raidTimer = 75; // First bandit raid in 75s
    this.raidInterval = 90;
    this.raidWave = 0;

    this.initMapEntities();
  }

  initMapEntities() {
    // 1. Initial Buildings matching modelo.png
    const castle = new Building(this.scene, this.terrain, 'castle', 0, -2, true, 'player');
    this.buildings.push(castle);

    const lumberCamp = new Building(this.scene, this.terrain, 'lumber_camp', -19, -4, true, 'player');
    lumberCamp.mesh.rotation.y = Math.PI / 4;
    this.buildings.push(lumberCamp);

    const cottage = new Building(this.scene, this.terrain, 'cottage', 19, -7, true, 'player');
    cottage.mesh.rotation.y = -Math.PI / 4;
    this.buildings.push(cottage);

    const barracks = new Building(this.scene, this.terrain, 'barracks', 16, 13, true, 'player');
    barracks.mesh.rotation.y = -Math.PI / 2;
    this.buildings.push(barracks);

    // Bandit Stronghold on the mini-island (bottom-left)
    const banditCamp = new Building(this.scene, this.terrain, 'bandit_camp', -36, 32, true, 'enemy');
    this.buildings.push(banditCamp);

    // 2. Resource Deposits
    // Gold Mine at (-11, 15) as in modelo.png
    const goldMine = new ResourceDeposit(this.scene, this.terrain, 'gold', -11, 15);
    this.resourceDeposits.push(goldMine);

    // Additional Stone Quarry deposit
    const stoneQuarry = new ResourceDeposit(this.scene, this.terrain, 'stone', 28, 6);
    this.resourceDeposits.push(stoneQuarry);

    // 3. Trees matching layout in modelo.png
    const treePositions = [
      // Top left cluster (near lumber camp)
      [-23, -16, 'oak'], [-27, -12, 'oak'], [-25, -20, 'pine'],
      [-29, -5, 'autumn'], [-24, 4, 'oak'], [-32, -18, 'pine'],
      // Top island edge
      [-10, -25, 'oak'], [-3, -27, 'pine'], [8, -26, 'birch'], [15, -24, 'oak'],
      // Near cottage & right side
      [27, -18, 'autumn'], [32, -10, 'pine'], [30, -3, 'birch'], [34, 5, 'pine'],
      // Lower clusters
      [-19, 24, 'autumn'], [-25, 16, 'pine'], [5, 24, 'oak'], [12, 26, 'birch'],
      // Mini island trees
      [-32, 26, 'oak'], [-42, 30, 'pine'], [-38, 38, 'autumn']
    ];

    treePositions.forEach(([tx, tz, type]) => {
      const tree = new Tree(this.scene, this.terrain, tx, tz, type);
      this.trees.push(tree);
    });

    // 4. Initial Units matching modelo.png
    // Left Knight (guarding lumber yard)
    const k1 = this.spawnUnit('knight', -14, 4, 'player');
    k1.mesh.rotation.y = Math.PI / 4;

    // Right Knight (near castle & cottage)
    const k2 = this.spawnUnit('knight', 11, -1, 'player');
    k2.mesh.rotation.y = -Math.PI / 6;

    // Center Path Archers (drawn bows in formation)
    const a1 = this.spawnUnit('archer', -1, 6, 'player');
    a1.mesh.rotation.y = 0.1;
    const a2 = this.spawnUnit('archer', 3, 6, 'player');
    a2.mesh.rotation.y = -0.1;

    // Lower Knight & Archer (near Barracks)
    const k3 = this.spawnUnit('knight', 8, 12, 'player');
    k3.mesh.rotation.y = -Math.PI / 4;
    const a3 = this.spawnUnit('archer', 13, 16, 'player');
    a3.mesh.rotation.y = -Math.PI / 3;

    // Gold Miner Villager with pickaxe
    const v1 = this.spawnUnit('villager', -7, 14, 'player');
    v1.mesh.rotation.y = -Math.PI / 3;
    if (v1.mesh.userData.pickaxe) {
      v1.mesh.userData.pickaxe.visible = true;
      if (v1.mesh.userData.axe) v1.mesh.userData.axe.visible = false;
    }

    // Woodchopper Villager with axe
    const v2 = this.spawnUnit('villager', -15, -2, 'player');
    v2.mesh.rotation.y = Math.PI / 2;

    // Initial Bandit Guards near the mini-island camp
    this.spawnUnit('bandit', -33, 30, 'enemy');
    this.spawnUnit('bandit', -38, 33, 'enemy');

    this.recalculatePopCap();
  }

  recalculatePopCap() {
    let cap = 0;
    this.buildings.forEach(b => {
      if (b.isConstructed && b.faction === 'player') {
        cap += b.popGranted;
      }
    });
    this.maxPopulation = Math.max(10, cap);
    this.population = this.units.filter(u => !u.isDead).length;
  }

  canAfford(cost) {
    if (cost.wood && this.resources.wood < cost.wood) return false;
    if (cost.gold && this.resources.gold < cost.gold) return false;
    if (cost.stone && this.resources.stone < cost.stone) return false;
    return true;
  }

  deductResources(cost) {
    if (cost.wood) this.resources.wood -= cost.wood;
    if (cost.gold) this.resources.gold -= cost.gold;
    if (cost.stone) this.resources.stone -= cost.stone;
  }

  addResource(type, amount) {
    if (this.resources[type] !== undefined) {
      this.resources[type] += amount;
    }
  }

  spawnUnit(type, x, z, faction = 'player', rallyPoint = null) {
    const unit = new Unit(this.scene, this.terrain, type, x, z, faction);
    if (faction === 'player') {
      this.units.push(unit);
      this.population++;
      if (rallyPoint) {
        unit.moveTo(rallyPoint.x, rallyPoint.z);
      }
    } else {
      this.enemies.push(unit);
    }
    return unit;
  }

  buildNewBuilding(type, x, z) {
    const b = new Building(this.scene, this.terrain, type, x, z, false, 'player');
    this.buildings.push(b);
    this.soundManager.playBuildPlace();
    this.recalculatePopCap();

    // Task villagers to construct it
    const selectedVillagers = this.selectedUnits.filter(u => u.type === 'villager');
    if (selectedVillagers.length > 0) {
      selectedVillagers.forEach(v => v.orderBuild(b));
    } else {
      // Find nearest friendly villager
      let nearestV = null;
      let minDist = Infinity;
      this.units.forEach(u => {
        if (!u.isDead && u.type === 'villager') {
          const d = u.mesh.position.distanceTo(b.mesh.position);
          if (d < minDist) {
            minDist = d;
            nearestV = u;
          }
        }
      });
      if (nearestV) {
        nearestV.orderBuild(b);
      }
    }
    return b;
  }

  findNearestResource(pos, type) {
    let list = [];
    if (type === 'tree') {
      list = this.trees.filter(t => !t.isDead && t.woodRemaining > 0);
    } else {
      list = this.resourceDeposits.filter(r => r.type === type && r.resourcesRemaining > 0);
    }

    let nearest = null;
    let minDist = Infinity;
    list.forEach(item => {
      const d = pos.distanceTo(item.mesh.position);
      if (d < minDist) {
        minDist = d;
        nearest = item;
      }
    });
    return nearest;
  }

  findNearestDropoff(pos, resourceType, buildings = this.buildings) {
    const list = buildings || this.buildings || [];
    const valid = list.filter(b => {
      if (!b.isConstructed || b.faction !== 'player' || b.isDead) return false;
      if (b.type === 'castle') return true;
      if (resourceType === 'wood' && b.type === 'lumber_camp') return true;
      return false;
    });

    let nearest = null;
    let minDist = Infinity;
    valid.forEach(b => {
      const d = pos.distanceTo(b.mesh.position);
      if (d < minDist) {
        minDist = d;
        nearest = b;
      }
    });
    return nearest;
  }

  // --- SELECTION LOGIC ---

  clearSelection() {
    this.selectedUnits.forEach(u => u.setSelected(false));
    this.selectedUnits = [];
    if (this.selectedBuilding) {
      this.selectedBuilding.setSelected(false);
      this.selectedBuilding = null;
    }
    this.selectedResource = null;
  }

  selectSingle(entity) {
    this.clearSelection();
    if (!entity) return;

    if (entity instanceof Unit && entity.faction === 'player') {
      entity.setSelected(true);
      this.selectedUnits.push(entity);
      this.soundManager.playSelect();
    } else if (entity instanceof Building && entity.faction === 'player') {
      entity.setSelected(true);
      this.selectedBuilding = entity;
      this.soundManager.playSelect();
    } else if (entity instanceof Tree || entity instanceof ResourceDeposit) {
      this.selectedResource = entity;
      this.soundManager.playSelect();
    }
  }

  selectUnitsInBox(screenRect, camera) {
    this.clearSelection();
    const frustum = new THREE.Frustum();
    const projScreenMatrix = new THREE.Matrix4();
    projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(projScreenMatrix);

    const minX = Math.min(screenRect.x1, screenRect.x2);
    const maxX = Math.max(screenRect.x1, screenRect.x2);
    const minY = Math.min(screenRect.y1, screenRect.y2);
    const maxY = Math.max(screenRect.y1, screenRect.y2);

    this.units.forEach(u => {
      if (u.isDead || u.faction !== 'player') return;
      const screenPos = u.mesh.position.clone().project(camera);
      const sx = ((screenPos.x + 1) * window.innerWidth) / 2;
      const sy = ((-screenPos.y + 1) * window.innerHeight) / 2;

      if (sx >= minX && sx <= maxX && sy >= minY && sy <= maxY) {
        u.setSelected(true);
        this.selectedUnits.push(u);
      }
    });

    if (this.selectedUnits.length > 0) {
      this.soundManager.playSelect();
    }
  }

  issueOrder(entityUnderCursor, groundPoint) {
    if (this.selectedUnits.length === 0) {
      // If building selected, set rally point
      if (this.selectedBuilding && groundPoint) {
        this.selectedBuilding.setRallyPoint(groundPoint);
        this.soundManager.playOrder();
      }
      return;
    }

    this.soundManager.playOrder();

    if (entityUnderCursor) {
      const e = entityUnderCursor;
      // Right-clicked an enemy: Attack!
      if ((e instanceof Unit && e.faction === 'enemy') || (e instanceof Building && e.faction === 'enemy')) {
        this.selectedUnits.forEach(u => u.orderAttack(e));
        return;
      }
      // Right-clicked a resource: Gather! (Villagers only)
      if (e instanceof Tree || e instanceof ResourceDeposit) {
        this.selectedUnits.forEach(u => {
          if (u.type === 'villager') u.orderGather(e);
        });
        return;
      }
      // Right-clicked an incomplete building: Build!
      if (e instanceof Building && !e.isConstructed && e.faction === 'player') {
        this.selectedUnits.forEach(u => {
          if (u.type === 'villager') u.orderBuild(e);
        });
        return;
      }
    }

    // Right-clicked ground: Move in formation
    if (groundPoint) {
      const count = this.selectedUnits.length;
      const cols = Math.ceil(Math.sqrt(count));
      const spacing = 1.6;

      this.selectedUnits.forEach((u, idx) => {
        const row = Math.floor(idx / cols);
        const col = idx % cols;
        const offsetX = (col - (cols - 1) / 2) * spacing;
        const offsetZ = (row - (cols - 1) / 2) * spacing;
        u.moveTo(groundPoint.x + offsetX, groundPoint.z + offsetZ);
      });
    }
  }

  // --- GAME LOOP & AI ---

  update(delta) {
    if (this.isPaused || this.isGameOver) return;
    const dt = delta * this.gameSpeed;
    this.gameTime += dt;

    // Check Win/Loss conditions
    const castle = this.buildings.find(b => b.type === 'castle' && b.faction === 'player');
    if (!castle || castle.isDead) {
      this.isGameOver = true;
      this.gameWon = false;
      return;
    }

    const banditCamp = this.buildings.find(b => b.type === 'bandit_camp');
    if (!banditCamp || banditCamp.isDead) {
      if (!this.gameWon) {
        this.gameWon = true;
        this.isGameOver = true;
        this.soundManager.playVictory();
      }
      return;
    }

    // Update Trees
    this.trees.forEach(t => t.update(dt, this.particleSystem));

    // Update Projectiles
    for (let i = this.arrows.length - 1; i >= 0; i--) {
      this.arrows[i].update(dt);
      if (this.arrows[i].isDead) {
        this.arrows.splice(i, 1);
      }
    }

    // Update Buildings
    this.buildings.forEach(b => {
      b.update(dt, this, this.soundManager, this.particleSystem, this.arrows, this.enemies);
    });

    // Clean dead buildings
    for (let i = this.buildings.length - 1; i >= 0; i--) {
      if (this.buildings[i].isDead) {
        this.buildings.splice(i, 1);
        this.recalculatePopCap();
      }
    }

    // Update Units
    const allUnits = [...this.units, ...this.enemies];
    this.units.forEach(u => {
      u.update(dt, this, this.soundManager, this.particleSystem, this.arrows, allUnits, this.buildings);
    });
    this.enemies.forEach(e => {
      e.update(dt, this, this.soundManager, this.particleSystem, this.arrows, allUnits, this.buildings);
    });

    // Resolve Collisions: Units cannot walk through buildings or each other!
    this.resolveBuildingCollisions();
    this.resolveUnitCollisions();

    // Enemy AI & Raid Timer
    this.updateEnemyAI(dt);

    // Clean dead units (waits for death collapse animation if canRemove is false)
    for (let i = this.units.length - 1; i >= 0; i--) {
      if (this.units[i].isDead && this.units[i].canRemove !== false) {
        this.units.splice(i, 1);
        this.recalculatePopCap();
      }
    }
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      if (this.enemies[i].isDead && this.enemies[i].canRemove !== false) {
        this.enemies.splice(i, 1);
      }
    }
  }

  resolveBuildingCollisions() {
    const allEntities = [...this.units, ...this.enemies];
    const livingTrees = this.trees.filter(t => !t.isDead && t.woodRemaining > 0);
    const blockers = [...this.buildings, ...this.resourceDeposits, ...livingTrees];

    allEntities.forEach(unit => {
      if (unit.isDead) return;
      const uPos = unit.mesh.position;
      const uRad = unit.collisionRadius || 0.6;

      blockers.forEach(b => {
        if (b.isDead) return;
        const bPos = b.mesh.position;
        const bRad = b.collisionRadius || (b.type === 'tree' ? 0.75 : 3.0);

        const dx = uPos.x - bPos.x;
        const dz = uPos.z - bPos.z;
        const dist = Math.hypot(dx, dz);
        const minDist = bRad + uRad;

        if (dist < minDist) {
          let nx, nz;
          if (dist < 0.001) {
            nx = 1;
            nz = 0;
          } else {
            nx = dx / dist;
            nz = dz / dist;
          }
          const push = minDist - dist;
          uPos.x += nx * push;
          uPos.z += nz * push;
          uPos.y = this.terrain.getHeight(uPos.x, uPos.z);

          // Direct delivery upon colliding with dropoff building!
          if (unit.state === 'returning' && (b.type === 'castle' || (unit.carrying.type === 'wood' && b.type === 'lumber_camp'))) {
            unit.depositResources(this, this.soundManager, this.particleSystem);
          }
        }
      });
    });
  }

  resolveUnitCollisions() {
    const allUnits = [...this.units, ...this.enemies].filter(u => !u.isDead);
    const count = allUnits.length;

    for (let i = 0; i < count; i++) {
      const u1 = allUnits[i];
      const p1 = u1.mesh.position;
      const r1 = u1.collisionRadius || 0.6;

      for (let j = i + 1; j < count; j++) {
        const u2 = allUnits[j];
        const p2 = u2.mesh.position;
        const r2 = u2.collisionRadius || 0.6;

        const dx = p2.x - p1.x;
        const dz = p2.z - p1.z;
        const dist = Math.hypot(dx, dz);
        const minDist = r1 + r2;

        if (dist < minDist) {
          let nx, nz;
          if (dist < 0.001) {
            const angle = Math.random() * Math.PI * 2;
            nx = Math.cos(angle);
            nz = Math.sin(angle);
          } else {
            nx = dx / dist;
            nz = dz / dist;
          }

          const overlap = (minDist - dist) * 0.5;
          p1.x -= nx * overlap;
          p1.z -= nz * overlap;
          p1.y = this.terrain.getHeight(p1.x, p1.z);

          p2.x += nx * overlap;
          p2.z += nz * overlap;
          p2.y = this.terrain.getHeight(p2.x, p2.z);
        }
      }
    }
  }

  updateEnemyAI(dt) {
    this.raidTimer -= dt;
    if (this.raidTimer <= 0) {
      this.raidWave++;
      this.raidTimer = this.raidInterval;
      this.soundManager.playAlarm();

      // Spawn raiding party from mini-island bandit camp
      const raidCount = 2 + Math.min(6, this.raidWave * 2);
      for (let i = 0; i < raidCount; i++) {
        const rx = -34 + (Math.random() - 0.5) * 4;
        const rz = 30 + (Math.random() - 0.5) * 4;
        const b = this.spawnUnit('bandit', rx, rz, 'enemy');

        // Order raiders to march on Castle or nearest player structure
        const targetB = this.buildings.find(b => b.type === 'castle') || this.buildings[0];
        if (targetB) {
          b.orderAttack(targetB);
        }
      }
    }

    // Idle enemies scan for nearby player units
    this.enemies.forEach(enemy => {
      if (enemy.state === 'idle') {
        let closest = null;
        let minDist = 14;
        this.units.forEach(u => {
          if (!u.isDead) {
            const d = enemy.mesh.position.distanceTo(u.mesh.position);
            if (d < minDist) {
              minDist = d;
              closest = u;
            }
          }
        });

        if (closest) {
          enemy.orderAttack(closest);
        } else {
          // Attack nearest player building
          const playerBuildings = this.buildings.filter(b => b.faction === 'player' && !b.isDead);
          if (playerBuildings.length > 0) {
            let nearestB = playerBuildings[0];
            let minBDist = enemy.mesh.position.distanceTo(nearestB.mesh.position);
            playerBuildings.forEach(b => {
              const d = enemy.mesh.position.distanceTo(b.mesh.position);
              if (d < minBDist) {
                minBDist = d;
                nearestB = b;
              }
            });
            enemy.orderAttack(nearestB);
          }
        }
      }
    });
  }
}
