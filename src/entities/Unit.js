import * as THREE from 'three';
import { ModelFactory } from './ModelFactory.js';
import { Arrow } from './Arrow.js';
import { UnitAnimator } from '../inspector/unitAnimator.js';
import { getUnitDef, getUnitStats as getUnitStatsFromData, WORKER_STATS } from '../data/index.js';
import { legacyOwnerId } from '../sim/EntityIds.js';

// Shared Selection Ring Geometry & Materials
const unitRingGeo = new THREE.RingGeometry(0.85, 1.05, 24);
unitRingGeo.rotateX(-Math.PI / 2);

const playerRingMat = new THREE.MeshBasicMaterial({
  color: 0xdeb841,
  side: THREE.DoubleSide,
  transparent: true,
  opacity: 0.85
});
const enemyRingMat = new THREE.MeshBasicMaterial({
  color: 0xef4444,
  side: THREE.DoubleSide,
  transparent: true,
  opacity: 0.85
});

// Shared 3D Health Bar Geometries & Materials (Zero Canvas, zero texture uploads)
const hpBgGeo = new THREE.PlaneGeometry(1.34, 0.22);
const hpFillGeo = new THREE.PlaneGeometry(1.28, 0.16);
hpFillGeo.translate(0.64, 0, 0); // pivot at left edge so scale.x scales neatly

const hpBgMat = new THREE.MeshBasicMaterial({
  color: 0x0f172a,
  side: THREE.DoubleSide,
  depthTest: false,
  depthWrite: false,
  transparent: false
});
const hpGreenMat = new THREE.MeshBasicMaterial({ color: 0x22c55e, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
const hpYellowMat = new THREE.MeshBasicMaterial({ color: 0xfacc15, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
const hpRedMat = new THREE.MeshBasicMaterial({ color: 0xef4444, depthTest: false, depthWrite: false, side: THREE.DoubleSide });

export class Unit {
  /**
   * @param {number|'player'|'enemy'} [owner]  ownerId do Player dono (F2-01)
   * @param {import('../core/GameManager.js').GameManager|null} [gameManager]
   */
  constructor(scene, terrain, type, x, z, owner = 0, gameManager = null) {
    this.scene = scene;
    this.terrain = terrain;
    this.type = type; // 'villager', 'knight', 'archer', 'bandit'
    /** Id estável da entidade (atribuído por GameManager.registerEntity). */
    this.id = undefined;
    /** Id do Player dono (F2-01). */
    this.ownerId = legacyOwnerId(owner);
    this.gameManager = gameManager;

    // Stats configuration
    const stats = this.getUnitStats(type);
    this.name = stats.name;
    this.hp = stats.hp;
    this.maxHp = stats.hp;
    this.speed = stats.speed;
    this.attack = stats.attack;
    this.attackRange = stats.attackRange;
    this.attackCooldown = stats.attackCooldown;
    this.armor = stats.armor || 0;
    this.collisionRadius = stats.collisionRadius || 0.6;

    // Raios de varredura / flags de papel (src/data/units.js)
    const def = getUnitDef(type);
    this.isRanged = def.isRanged;
    this.projectileType = def.projectile;
    this.aggroRange = def.aggroRange;
    this.threatScanRange = def.threatScanRange;
    this.retargetRange = def.retargetRange;
    this.helpRadius = def.helpRadius;

    // State machine: 'idle', 'moving', 'gathering', 'returning', 'building', 'attacking', 'dying'
    this.state = 'idle';
    this.targetPos = null;
    this.targetEntity = null;
    this.gatherTarget = null;
    this.buildTarget = null;
    this.attackTarget = null;

    // Navigation & Waypoints
    this.waypoints = null;
    this.waypointIndex = 0;
    this.pathDestination = null;

    // Worker inventory
    this.carrying = { type: null, amount: 0, max: WORKER_STATS.carryCapacity };
    this.actionTimer = 0;
    this.attackTimer = 0;
    this.walkTimer = 0;
    this.isDead = false;
    this.isDying = false;
    this.canRemove = false;
    this.isDisposed = false;
    this.hurtTimer = 0;
    this.deathTimer = 0;
    this.deathDuration = 1.6;
    this.hasFiredThisAttack = false;

    // Create 3D Model (zero-cost clone sharing pre-compiled geometries and materials)
    this.mesh = this.createModel(type);
    const h = this.terrain.getHeight(x, z);
    this.mesh.position.set(x, h, z);
    this.mesh.scale.set(1.62, 1.62, 1.62); // Scaled +20% for superior visibility and detail appreciation
    this.mesh.userData.entity = this;

    // Animator
    this.animator = new UnitAnimator(this.mesh, type);

    // Selection ring & 3D Health Bar
    this.createSelectionRing();
    this.createHealthBar();

    this.scene.add(this.mesh);
  }

  /**
   * Lado relativo ao jogador local: 'player' se o dono é o jogador local, 'enemy' caso contrário.
   * DÍVIDA (F2-01): getter de compatibilidade para UI/InputManager/névoa. Lógica nova deve usar
   * ownerId + gameManager.isHostile/isAlly.
   */
  get faction() {
    const gm = this.gameManager;
    const localId = gm && typeof gm.localPlayerId === 'number' ? gm.localPlayerId : 0;
    return this.ownerId === localId ? 'player' : 'enemy';
  }

  /** Dono de `other` é hostil ao dono desta unidade (por time). */
  isHostileTo(other) {
    if (!other) return false;
    const gm = this.gameManager;
    if (gm && gm.isHostile) return gm.isHostile(this.ownerId, other.ownerId);
    return other.ownerId !== this.ownerId;
  }

  /** Mesmo dono ou mesmo time. */
  isAlliedWith(other) {
    if (!other) return false;
    const gm = this.gameManager;
    if (gm && gm.isAlly) return gm.isAlly(this.ownerId, other.ownerId);
    return other.ownerId === this.ownerId;
  }

  getUnitStats(type) {
    return getUnitStatsFromData(type);
  }

  isCombatUnit() {
    return getUnitDef(this.type).isCombat;
  }

  isWorker() {
    return getUnitDef(this.type).isWorker;
  }

  createModel(type) {
    return ModelFactory.createUnit(type);
  }

  createSelectionRing() {
    this.selectionRing = new THREE.Mesh(unitRingGeo, this.faction === 'player' ? playerRingMat : enemyRingMat);
    this.selectionRing.name = 'SelectionRing';
    this.selectionRing.position.y = 0.05;
    this.selectionRing.visible = false;
    this.mesh.add(this.selectionRing);
  }

  createHealthBar() {
    this.hpGroup = new THREE.Group();
    this.hpGroup.name = 'HealthBar';
    const h = this.getHealthBarHeight();
    this.hpGroup.position.set(this.mesh.position.x, this.mesh.position.y + h, this.mesh.position.z);

    const bgMesh = new THREE.Mesh(hpBgGeo, hpBgMat);
    bgMesh.name = 'HealthBg';
    bgMesh.renderOrder = 1100;
    this.hpGroup.add(bgMesh);

    this.hpFillMesh = new THREE.Mesh(hpFillGeo, hpGreenMat);
    this.hpFillMesh.name = 'HealthFill';
    this.hpFillMesh.position.set(-0.64, 0, 0.005);
    this.hpFillMesh.renderOrder = 1101;
    this.hpGroup.add(this.hpFillMesh);

    this.hpGroup.visible = false;
    this.hpSprite = this.hpGroup; // backward compatibility alias
    if (this.scene) {
      this.scene.add(this.hpGroup);
    }
    this.updateHealthBar();
  }

  getHealthBarHeight() {
    return getUnitDef(this.type).healthBarHeight;
  }

  updateHealthBar() {
    if (!this.hpFillMesh) return;
    const pct = Math.max(0, Math.min(1, this.hp / this.maxHp));
    this.hpFillMesh.scale.x = Math.max(0.001, pct);
    this.hpFillMesh.material = pct > 0.5 ? hpGreenMat : (pct > 0.25 ? hpYellowMat : hpRedMat);
  }

  setSelected(selected) {
    this.isSelected = selected;
    if (this.isDead || this.isDying || this.state === 'dying') {
      if (this.selectionRing) this.selectionRing.visible = false;
      if (this.hpGroup) this.hpGroup.visible = false;
      return;
    }
    this.selectionRing.visible = selected;
    if (this.hpGroup) {
      this.hpGroup.visible = (this.mesh ? this.mesh.visible : true) && (selected || this.hp < this.maxHp);
    }
  }

  // --- COMMANDS ---

  moveTo(x, z, gameManager = this.gameManager) {
    if (this.isDead || this.isDying || this.state === 'dying') return;

    this.state = 'moving';
    this.targetEntity = null;
    this.gatherTarget = null;
    this.buildTarget = null;
    this.attackTarget = null;
    this.objectiveTarget = null;

    const gm = gameManager || this.gameManager;
    if (gm && gm.pathfinder) {
      // Snap destination if clicked in water
      if (gm.pathfinder.isWater(x, z)) {
        const snapped = gm.pathfinder.findNearestWalkable(x, z);
        x = snapped.x;
        z = snapped.z;
      }
      const path = gm.pathfinder.findPath(this.mesh.position.x, this.mesh.position.z, x, z);
      this.waypoints = path;
      this.waypointIndex = 0;
      this.pathDestination = { x, z };
      this.targetPos = new THREE.Vector3(path[0].x, 0, path[0].z);
    } else {
      this.targetPos = new THREE.Vector3(x, 0, z);
      this.waypoints = null;
      this.waypointIndex = 0;
      this.pathDestination = null;
    }
  }

  orderGather(resource) {
    if (this.isDead || this.isDying || this.state === 'dying') return;
    if (!this.isWorker()) return;
    this.gatherTarget = resource;
    this.targetEntity = resource;
    this.buildTarget = null;
    this.attackTarget = null;

    // Update active tool visibility on model
    if (this.mesh.userData.axe && this.mesh.userData.pickaxe) {
      const isTree = resource.type === 'tree';
      this.mesh.userData.axe.visible = isTree;
      this.mesh.userData.pickaxe.visible = !isTree;
      if (this.mesh.userData.hammer) this.mesh.userData.hammer.visible = false;
    }

    const resType = resource.type === 'tree' ? 'wood' : resource.type;
    // If worker is carrying a different resource type, drop off at base first before harvesting new type
    if (this.carrying.amount > 0 && this.carrying.type !== resType) {
      this.state = 'returning';
    } else {
      this.state = 'gathering';
    }
  }

  orderBuild(building) {
    if (this.isDead || this.isDying || this.state === 'dying') return;
    if (!this.isWorker()) return;
    this.state = 'building';
    this.buildTarget = building;
    this.targetEntity = building;
    this.gatherTarget = null;
    this.attackTarget = null;

    if (this.mesh.userData.hammer) {
      this.mesh.userData.hammer.visible = true;
      if (this.mesh.userData.axe) this.mesh.userData.axe.visible = false;
      if (this.mesh.userData.pickaxe) this.mesh.userData.pickaxe.visible = false;
    }
  }

  orderAttack(target, preserveObjective = false) {
    if (this.isDead || this.isDying || this.state === 'dying') return;
    this.state = 'attacking';
    this.attackTarget = target;
    this.targetEntity = target;
    this.gatherTarget = null;
    this.buildTarget = null;
    this.hasFiredThisAttack = false;
    const isBuilding = target && (target.fullMesh || target.isConstructed !== undefined);
    if (isBuilding) {
      this.objectiveTarget = target;
    } else if (!preserveObjective) {
      this.objectiveTarget = null;
    }
  }

  stop() {
    if (this.isDead || this.isDying || this.state === 'dying') return;
    this.state = 'idle';
    this.targetPos = null;
    this.targetEntity = null;
    this.gatherTarget = null;
    this.buildTarget = null;
    this.attackTarget = null;
    this.objectiveTarget = null;
    this.waypoints = null;
    this.waypointIndex = 0;
    this.pathDestination = null;
    this.hasFiredThisAttack = false;
    this.resetPose();
    if (this.animator) {
      this.animator.setAnimation('idle');
      this.animator.reset();
    }
  }

  takeDamage(amount, particleSystem, attacker = null, allUnits = []) {
    if (this.isDead || this.isDying) return;

    const effectiveDamage = Math.max(2, amount - this.armor);
    this.hp -= effectiveDamage;
    this.updateHealthBar();
    if (this.hpGroup) {
      this.hpGroup.visible = (this.mesh ? this.mesh.visible : true) && (this.isSelected || this.hp < this.maxHp);
    }

    if (particleSystem) {
      particleSystem.spawnFloatingText(`-${Math.round(effectiveDamage)}`, this.mesh.position, '#ff4747');
      particleSystem.spawnHitSparks(this.mesh.position);
    }

    if (this.hp <= 0) {
      this.hp = 0;
      this.die(particleSystem);
      return;
    }

    // Hurt recoil animation & red damage flash
    this.hurtTimer = 0.45;
    if (this.animator) {
      this.animator.setAnimation('hurt', true);
    }

    // Retaliation & Call for help: combat troops strike back when attacked
    if (attacker && !attacker.isDead && attacker.hp > 0 && this.isHostileTo(attacker)) {
      if (this.isCombatUnit()) {
        const isTargetBuilding = this.attackTarget && (this.attackTarget.fullMesh || this.attackTarget.isConstructed !== undefined);
        if (this.state !== 'attacking' || isTargetBuilding) {
          const savedObjective = isTargetBuilding ? this.attackTarget : this.objectiveTarget;
          this.orderAttack(attacker, !!savedObjective);
          if (savedObjective) {
            this.objectiveTarget = savedObjective;
          }
        }
      }

      // Nearby friendly combat troops rush to assist!
      if (allUnits && allUnits.length > 0) {
        allUnits.forEach(u => {
          if (!u.isDead && this.isAlliedWith(u) && u.isCombatUnit && u.isCombatUnit()) {
            const isFriendlyTargetBuilding = u.attackTarget && (u.attackTarget.fullMesh || u.attackTarget.isConstructed !== undefined);
            if (u.state === 'idle' || (u.state === 'attacking' && isFriendlyTargetBuilding)) {
              const d = this.mesh.position.distanceTo(u.mesh.position);
              if (d < this.helpRadius) {
                const savedObjective = isFriendlyTargetBuilding ? u.attackTarget : u.objectiveTarget;
                u.orderAttack(attacker, !!savedObjective);
                if (savedObjective) {
                  u.objectiveTarget = savedObjective;
                }
              }
            }
          }
        });
      }
    }
  }

  die(particleSystem) {
    if (this.isDying) return;
    this.isDying = true;
    this.isDead = true;
    this.canRemove = false;
    this.state = 'dying';
    this.deathTimer = 0;
    this.deathDuration = 1.6;

    this.targetPos = null;
    this.targetEntity = null;
    this.gatherTarget = null;
    this.buildTarget = null;
    this.attackTarget = null;
    this.objectiveTarget = null;
    this.waypoints = null;
    this.waypointIndex = 0;
    this.pathDestination = null;

    if (this.gameManager && this.gameManager.selectedUnits) {
      const idx = this.gameManager.selectedUnits.indexOf(this);
      if (idx !== -1) {
        this.gameManager.selectedUnits.splice(idx, 1);
      }
    }

    if (this.selectionRing) this.selectionRing.visible = false;
    if (this.hpGroup) this.hpGroup.visible = false;

    if (this.animator) {
      this.animator.setAnimation('die', true);
    }
  }

  resetPose() {
    this.resetWalkPose();
    const ud = this.mesh.userData;
    if (ud.toolGroup) ud.toolGroup.rotation.x = 0;
    if (ud.sword) ud.sword.rotation.x = 0.5;
    if (ud.weapon) ud.weapon.rotation.x = 0.5;
  }

  resetWalkPose() {
    const ud = this.mesh.userData;
    if (ud.legL) ud.legL.rotation.x = 0;
    if (ud.legR) ud.legR.rotation.x = 0;
    if (ud.armL) ud.armL.rotation.x = 0;
    if (ud.armR) ud.armR.rotation.x = 0;
  }

  stepTowards(targetX, targetZ, maxDist) {
    const curX = this.mesh.position.x;
    const curZ = this.mesh.position.z;
    const dx = targetX - curX;
    const dz = targetZ - curZ;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.05) return true;

    const move = Math.min(dist, maxDist);
    const dirX = dx / dist;
    const dirZ = dz / dist;

    const nextX = curX + dirX * move;
    const nextZ = curZ + dirZ * move;

    // WATER IMPASSABILITY: Units cannot enter or cross water!
    const nextH = this.terrain.getHeight(nextX, nextZ);
    if (nextH < 0.65) {
      // Impassable water obstacle! Try sliding along X or Z if one direction is on dry land
      const hX = this.terrain.getHeight(nextX, curZ);
      const hZ = this.terrain.getHeight(curX, nextZ);
      if (hX >= 0.65) {
        this.mesh.position.x = nextX;
      } else if (hZ >= 0.65) {
        this.mesh.position.z = nextZ;
      }
      this.mesh.position.y = this.terrain.getHeight(this.mesh.position.x, this.mesh.position.z);
      return false;
    }

    this.mesh.position.x = nextX;
    this.mesh.position.z = nextZ;
    this.mesh.position.y = nextH;

    this.mesh.rotation.y = Math.atan2(dirX, dirZ);
    return (dist - move) < 0.15;
  }

  moveTowards(destX, destZ, delta, gameManager = this.gameManager) {
    const curX = this.mesh.position.x;
    const curZ = this.mesh.position.z;
    const distToFinal = Math.hypot(destX - curX, destZ - curZ);
    if (distToFinal < 0.1) return;

    let subTargetX = destX;
    let subTargetZ = destZ;

    const gm = gameManager || this.gameManager;
    if (gm && gm.pathfinder) {
      const los = gm.pathfinder.hasLineOfSight(curX, curZ, destX, destZ);
      if (!los) {
        // Direct line blocked by water! Route through waypoints / fords
        const distFromLastDest = this.pathDestination
          ? Math.hypot(destX - this.pathDestination.x, destZ - this.pathDestination.z)
          : Infinity;

        if (!this.waypoints || this.waypoints.length === 0 || distFromLastDest > 2.5) {
          this.waypoints = gm.pathfinder.findPath(curX, curZ, destX, destZ);
          this.waypointIndex = 0;
          this.pathDestination = { x: destX, z: destZ };
        }

        if (this.waypoints && this.waypointIndex < this.waypoints.length) {
          const wp = this.waypoints[this.waypointIndex];
          const distToWp = Math.hypot(wp.x - curX, wp.z - curZ);
          if (distToWp < 0.8 && this.waypointIndex < this.waypoints.length - 1) {
            this.waypointIndex++;
          }
          const activeWp = this.waypoints[this.waypointIndex];
          subTargetX = activeWp.x;
          subTargetZ = activeWp.z;
        }
      } else {
        this.waypoints = null;
        this.pathDestination = null;
      }
    }

    this.stepTowards(subTargetX, subTargetZ, this.speed * delta);

    // Walk animation (if not playing hurt stagger)
    this.hasFiredThisAttack = false;
    if (this.animator && this.hurtTimer <= 0) {
      this.animator.setAnimation('walk');
      this.animator.update(delta);
    }
  }

  update(delta, gameManager, soundManager, particleSystem, arrows, allUnits, buildings) {
    if (this.canRemove) return;
    this.gameManager = gameManager;

    // Update 3D health bar position and billboard to face camera
    if (this.hpGroup && this.scene) {
      if (this.isDead || this.isDying || this.state === 'dying' || this.canRemove || (this.mesh && !this.mesh.visible)) {
        this.hpGroup.visible = false;
      } else {
        const isVisible = this.isSelected || this.hp < this.maxHp;
        this.hpGroup.visible = isVisible;
        if (isVisible && gameManager && gameManager.sceneManager) {
          const h = this.getHealthBarHeight();
          this.hpGroup.position.set(this.mesh.position.x, this.mesh.position.y + h, this.mesh.position.z);
          this.hpGroup.quaternion.copy(gameManager.sceneManager.camera.quaternion);
        }
      }
    }

    // Safety: ensure unit never stays submerged in water
    if (this.terrain.getHeight(this.mesh.position.x, this.mesh.position.z) < 0.65) {
      if (gameManager && gameManager.pathfinder) {
        const safe = gameManager.pathfinder.findNearestWalkable(this.mesh.position.x, this.mesh.position.z);
        this.mesh.position.x = safe.x;
        this.mesh.position.z = safe.z;
        this.mesh.position.y = this.terrain.getHeight(safe.x, safe.z);
      }
    }

    if (this.isDead || this.isDying || this.state === 'dying') {
      this.state = 'dying';
      this.deathTimer += delta;
      if (this.animator) {
        this.animator.update(delta);
      }
      if (this.deathTimer >= 1.0) {
        this.mesh.position.y -= delta * 0.35;
      }
      if (this.deathTimer >= this.deathDuration) {
        this.canRemove = true;
        this.dispose();
      }
      return;
    }

    if (this.hurtTimer > 0) {
      this.hurtTimer -= delta;
      if (this.animator) {
        this.animator.update(delta);
      }
      if (this.hurtTimer <= 0 && this.animator) {
        this.animator.reset();
      }
    }

    this.attackTimer += delta;
    this.actionTimer += delta;

    switch (this.state) {
      case 'idle':
        this.updateIdle(delta, allUnits, buildings);
        break;
      case 'moving':
        this.updateMoving(delta, gameManager);
        break;
      case 'gathering':
        this.updateGathering(delta, gameManager, soundManager, particleSystem, buildings);
        break;
      case 'returning':
        this.updateReturning(delta, gameManager, soundManager, particleSystem, buildings);
        break;
      case 'building':
        this.updateBuilding(delta, soundManager, particleSystem, gameManager);
        break;
      case 'attacking':
        this.updateAttacking(delta, soundManager, particleSystem, arrows, allUnits, buildings, gameManager);
        break;
    }
  }

  updateIdle(delta, allUnits, buildings) {
    this.hasFiredThisAttack = false;
    if (this.animator && this.hurtTimer <= 0) {
      this.animator.setAnimation('idle');
      this.animator.update(delta);
    }

    // Auto-Aggro: Military combat units actively scan for and attack approaching enemies
    if (this.isCombatUnit()) {
      const target = this.findNearestHostile(allUnits, buildings, this.aggroRange);
      if (target) {
        this.orderAttack(target);
      }
    }
  }

  updateMoving(delta, gameManager = this.gameManager) {
    if (!this.targetPos) {
      this.stop();
      return;
    }

    const curX = this.mesh.position.x;
    const curZ = this.mesh.position.z;
    const targetX = this.targetPos.x;
    const targetZ = this.targetPos.z;
    const dist = Math.hypot(targetX - curX, targetZ - curZ);

    if (dist < 0.45) {
      // Check if there are more waypoints along the route
      if (this.waypoints && this.waypointIndex < this.waypoints.length - 1) {
        this.waypointIndex++;
        const nextWp = this.waypoints[this.waypointIndex];
        this.targetPos = new THREE.Vector3(nextWp.x, 0, nextWp.z);
        return;
      }

      this.stop();
      return;
    }

    // Move step towards current target waypoint
    this.stepTowards(targetX, targetZ, this.speed * delta);

    // Walk animation cycle
    this.hasFiredThisAttack = false;
    if (this.animator && this.hurtTimer <= 0) {
      this.animator.setAnimation('walk');
      this.animator.update(delta);
    }
  }

  updateGathering(delta, gameManager, soundManager, particleSystem, buildings) {
    if (!this.gatherTarget || this.gatherTarget.isDead || (this.gatherTarget.resourcesRemaining <= 0 && this.gatherTarget.woodRemaining <= 0)) {
      // Find another nearby resource of same type if possible
      const nextResource = gameManager.findNearestResource(this.mesh.position, this.gatherTarget ? this.gatherTarget.type : 'tree');
      if (nextResource) {
        this.gatherTarget = nextResource;
      } else {
        // Return whatever is currently carried
        if (this.carrying.amount > 0) {
          this.state = 'returning';
        } else {
          this.stop();
        }
        return;
      }
    }

    const targetPos = this.gatherTarget.mesh.position;
    const dist = Math.hypot(this.mesh.position.x - targetPos.x, this.mesh.position.z - targetPos.z);
    // Contact / collision perimeter with resource
    const targetRadius = this.gatherTarget.collisionRadius || (this.gatherTarget.type === 'tree' ? 0.75 : 3.4);
    const contactDist = targetRadius + this.collisionRadius + 0.25;

    if (dist > contactDist) {
      this.moveTowards(targetPos.x, targetPos.z, delta);
      return;
    }

    // In contact / collided with resource: begin harvesting immediately at the collision point!
    const dirX = targetPos.x - this.mesh.position.x;
    const dirZ = targetPos.z - this.mesh.position.z;
    this.mesh.rotation.y = Math.atan2(dirX, dirZ);

    // Chop / Mine Animation
    this.hasFiredThisAttack = false;
    if (this.animator && this.hurtTimer <= 0) {
      this.animator.setAnimation('gather');
      this.animator.update(delta);
    }

    // Extract resource ticks (every 0.9s)
    if (this.actionTimer >= 0.9) {
      this.actionTimer = 0;
      const resType = this.gatherTarget.type === 'tree' ? 'wood' : this.gatherTarget.type;
      this.carrying.type = resType;

      if (resType === 'wood') {
        const harvested = this.gatherTarget.chop(3, particleSystem);
        this.carrying.amount += harvested;
        if (soundManager) soundManager.playChop();
      } else {
        const harvested = this.gatherTarget.mine(3, particleSystem);
        this.carrying.amount += harvested;
        if (soundManager) {
          if (resType === 'gold') soundManager.playMineGold();
          else soundManager.playMineStone();
        }
      }

      // If full capacity reached, return to base
      if (this.carrying.amount >= this.carrying.max) {
        this.state = 'returning';
        this.updateCarryingVisuals(true);
      }
    }
  }

  depositResources(gameManager, soundManager, particleSystem) {
    if (this.carrying.amount > 0) {
      const owner = gameManager.getPlayer ? gameManager.getPlayer(this.ownerId) : null;
      if (owner) owner.add(this.carrying.type, this.carrying.amount);
      const isLocal = !!(owner && owner.isLocal);

      if (particleSystem && (isLocal || (gameManager.fogOfWar && gameManager.fogOfWar.isExplored(this.mesh.position.x, this.mesh.position.z)))) {
        const color = this.carrying.type === 'gold' ? '#ffd700' : this.carrying.type === 'wood' ? '#68d391' : '#cbd5e1';
        particleSystem.spawnFloatingText(`+${this.carrying.amount} ${this.carrying.type.toUpperCase()}`, this.mesh.position, color);
      }
      if (soundManager && isLocal) soundManager.playOrder();
      this.carrying.amount = 0;
      this.updateCarryingVisuals(false);
    }

    // Immediately resume gathering if target still has resources
    if (this.gatherTarget && !this.gatherTarget.isDead && (this.gatherTarget.woodRemaining > 0 || this.gatherTarget.resourcesRemaining > 0)) {
      this.state = 'gathering';
      this.resetWalkPose();
      if (this.mesh.userData.axe && this.mesh.userData.pickaxe) {
        const isTree = this.gatherTarget.type === 'tree';
        this.mesh.userData.axe.visible = isTree;
        this.mesh.userData.pickaxe.visible = !isTree;
        if (this.mesh.userData.hammer) this.mesh.userData.hammer.visible = false;
      }
    } else {
      this.stop();
    }
  }

  updateReturning(delta, gameManager, soundManager, particleSystem, buildings) {
    // Find nearest dropoff building owned by this unit's player
    const dropoff = gameManager.findNearestDropoff(this.mesh.position, this.carrying.type, buildings || gameManager.buildings, this.ownerId);
    if (!dropoff) {
      this.stop();
      return;
    }

    const targetPos = dropoff.mesh.position;
    const dist = Math.hypot(this.mesh.position.x - targetPos.x, this.mesh.position.z - targetPos.z);
    
    // Contact / collision perimeter of dropoff building
    const dropoffRadius = dropoff.collisionRadius || (dropoff.type === 'castle' ? 5.5 : 3.2);
    const contactDist = dropoffRadius + this.collisionRadius + 0.25;

    // Delivery triggers upon colliding / contacting the dropoff building!
    if (dist <= contactDist) {
      if (dropoff.processWoodDelivery && this.carrying.type === 'wood') {
        dropoff.processWoodDelivery(particleSystem);
      }
      this.depositResources(gameManager, soundManager, particleSystem);
      return;
    }

    this.moveTowards(targetPos.x, targetPos.z, delta);
  }

  updateCarryingVisuals(visible) {
    const ud = this.mesh.userData;
    if (ud.pack) {
      ud.pack.visible = visible;
      if (ud.woodBundle) ud.woodBundle.visible = visible && this.carrying.type === 'wood';
      if (ud.goldSack) ud.goldSack.visible = visible && (this.carrying.type === 'gold' || this.carrying.type === 'stone');
    }
  }

  updateBuilding(delta, soundManager, particleSystem, gameManager) {
    if (!this.buildTarget || this.buildTarget.isDead || this.buildTarget.isConstructed) {
      this.stop();
      return;
    }

    const targetPos = this.buildTarget.mesh.position;
    const dist = Math.hypot(this.mesh.position.x - targetPos.x, this.mesh.position.z - targetPos.z);
    const targetRadius = this.buildTarget.collisionRadius || 3.0;
    const contactDist = targetRadius + this.collisionRadius + 0.25;

    if (dist > contactDist) {
      this.moveTowards(targetPos.x, targetPos.z, delta);
      return;
    }

    // In contact / collided with building scaffold: hammer it!
    const dirX = targetPos.x - this.mesh.position.x;
    const dirZ = targetPos.z - this.mesh.position.z;
    this.mesh.rotation.y = Math.atan2(dirX, dirZ);

    this.hasFiredThisAttack = false;
    if (this.animator && this.hurtTimer <= 0) {
      this.animator.setAnimation('gather');
      this.animator.update(delta);
    }

    if (this.actionTimer >= 0.8) {
      this.actionTimer = 0;
      const gm = gameManager || this.gameManager;
      this.buildTarget.construct(10, soundManager, particleSystem, gm);
      if (soundManager) soundManager.playHammer();
    }
  }

  updateAttacking(delta, soundManager, particleSystem, arrows, allUnits, buildings) {
    // 1. Target dead or invalid: find next closest hostile or resume objective
    if (!this.attackTarget || this.attackTarget.isDead || this.attackTarget.hp <= 0) {
      const nextUnit = this.findNearestHostileUnit(allUnits, this.retargetRange);
      if (nextUnit) {
        this.attackTarget = nextUnit;
        this.targetEntity = nextUnit;
        this.hasFiredThisAttack = false;
      } else if (this.objectiveTarget && !this.objectiveTarget.isDead && this.objectiveTarget.hp > 0) {
        // Resume siege on strategic objective building after clearing defending troops
        this.attackTarget = this.objectiveTarget;
        this.targetEntity = this.objectiveTarget;
        this.hasFiredThisAttack = false;
      } else {
        const nextTarget = this.findNearestHostile(allUnits, buildings, this.retargetRange);
        if (nextTarget) {
          this.attackTarget = nextTarget;
          this.targetEntity = nextTarget;
          this.hasFiredThisAttack = false;
        } else {
          this.objectiveTarget = null;
          this.stop();
          return;
        }
      }
    }

    // Dynamic Threat Scanning (Attack-Move logic):
    // If our current target is a building (or worker), scan for nearby hostile combat units to prevent tunnel-visioning!
    const isTargetBuilding = this.attackTarget && (this.attackTarget.fullMesh || this.attackTarget.isConstructed !== undefined);
    const isTargetWorker = this.attackTarget && this.attackTarget.isWorker && this.attackTarget.isWorker();
    if ((isTargetBuilding || isTargetWorker) && this.isCombatUnit() && allUnits) {
      this.threatScanTimer = (this.threatScanTimer || 0) + delta;
      if (this.threatScanTimer >= 0.35) {
        this.threatScanTimer = 0;
        const visionRange = this.threatScanRange;
        const nearestHostile = isTargetWorker ? this.findNearestHostileCombatUnit(allUnits, visionRange) : this.findNearestHostileUnit(allUnits, visionRange);
        if (nearestHostile) {
          if (isTargetBuilding && !this.objectiveTarget) {
            this.objectiveTarget = this.attackTarget;
          }
          this.attackTarget = nearestHostile;
          this.targetEntity = nearestHostile;
          this.hasFiredThisAttack = false;
        }
      }
    }

    // 2. Target is alive: compute distance accounting for target collision radius
    const targetPos = this.attackTarget.mesh.position;
    const dist = Math.hypot(this.mesh.position.x - targetPos.x, this.mesh.position.z - targetPos.z);
    const targetRadius = this.attackTarget.collisionRadius || (this.attackTarget.fullMesh ? 3.0 : 0.6);
    const effectiveRange = this.attackRange + targetRadius;

    // 3. Pursuit: If outside effective attack range, chase the moving target every frame!
    if (dist > effectiveRange) {
      this.hasFiredThisAttack = false;
      this.moveTowards(targetPos.x, targetPos.z, delta);
      return;
    }

    // 4. In range: Face target, drive attack animation synchronized with cooldown
    const dirX = targetPos.x - this.mesh.position.x;
    const dirZ = targetPos.z - this.mesh.position.z;
    this.mesh.rotation.y = Math.atan2(dirX, dirZ);

    if (this.animator && this.hurtTimer <= 0) {
      this.animator.setAnimation('fight');
      const progress = Math.min(1.0, this.attackTimer / this.attackCooldown);
      this.animator.setTime(progress * 1.0);
    }

    const progress = Math.min(1.0, this.attackTimer / this.attackCooldown);

    if (this.isRanged) {
      // Archer & Axethrower: Release projectile shot at progress >= 0.60
      if (progress >= 0.60 && !this.hasFiredThisAttack) {
        this.hasFiredThisAttack = true;
        if (soundManager) {
          if (this.projectileType === 'axe') soundManager.playSword();
          else soundManager.playBow();
        }
        const startPos = this.mesh.position.clone().add(new THREE.Vector3(0, 1.68, 0));
        const projType = this.projectileType;
        const arrow = new Arrow(this.scene, startPos, this.attackTarget, this.attack, (target, dmg, hitPos) => {
          target.takeDamage(dmg, particleSystem, this, allUnits);
          if (soundManager) soundManager.playArrowHit();
        }, projType);
        arrows.push(arrow);
        if (this.gameManager && this.gameManager.registerEntity) this.gameManager.registerEntity(arrow, this.ownerId);
      }
    } else {
      // Melee units (Knight, Villager, Bandit, Grunt, Ogre) strike at apex (progress >= 0.45)
      if (progress >= 0.45 && !this.hasFiredThisAttack) {
        this.hasFiredThisAttack = true;
        if (soundManager) soundManager.playSword();
        this.attackTarget.takeDamage(this.attack, particleSystem, this, allUnits);
      }
    }

    if (this.attackTimer >= this.attackCooldown) {
      this.attackTimer = 0;
      this.hasFiredThisAttack = false;
    }
  }

  findNearestHostileCombatUnit(allUnits, maxDist = 14) {
    if (!allUnits) return null;
    let closestCombat = null;
    let minCombatDist = maxDist;
    const uPos = this.mesh.position;
    const len = allUnits.length;

    for (let i = 0; i < len; i++) {
      const u = allUnits[i];
      if (!u.isDead && u.hp > 0 && this.isHostileTo(u)) {
        const dx = uPos.x - u.mesh.position.x;
        const dz = uPos.z - u.mesh.position.z;
        const d = Math.hypot(dx, dz);
        if (d < minCombatDist) {
          if (u.isCombatUnit && u.isCombatUnit()) {
            minCombatDist = d;
            closestCombat = u;
          }
        }
      }
    }
    return closestCombat;
  }

  findNearestHostileUnit(allUnits, maxDist = 14) {
    if (!allUnits) return null;
    const combatUnit = this.findNearestHostileCombatUnit(allUnits, maxDist);
    if (combatUnit) return combatUnit;

    let closestWorker = null;
    let minWorkerDist = maxDist;
    const uPos = this.mesh.position;
    const len = allUnits.length;

    for (let i = 0; i < len; i++) {
      const u = allUnits[i];
      if (!u.isDead && u.hp > 0 && this.isHostileTo(u)) {
        const dx = uPos.x - u.mesh.position.x;
        const dz = uPos.z - u.mesh.position.z;
        const d = Math.hypot(dx, dz);
        if (d < minWorkerDist) {
          minWorkerDist = d;
          closestWorker = u;
        }
      }
    }

    return closestWorker;
  }

  findNearestHostile(allUnits, buildings, maxDist = 15) {
    // 1. High priority: hostile units (combat troops > workers)
    const hostileUnit = this.findNearestHostileUnit(allUnits, maxDist);
    if (hostileUnit) {
      return hostileUnit;
    }

    // 2. Secondary priority: buildings (defensive watchtowers > regular buildings)
    if (buildings) {
      let closestTower = null;
      let minTowerDist = maxDist;
      let closestBuilding = null;
      let minBuildingDist = maxDist;

      const uPos = this.mesh.position;
      const len = buildings.length;

      for (let i = 0; i < len; i++) {
        const b = buildings[i];
        if (!b.isDead && b.hp > 0 && this.isHostileTo(b)) {
          const dx = uPos.x - b.mesh.position.x;
          const dz = uPos.z - b.mesh.position.z;
          const d = Math.hypot(dx, dz);
          if (d < maxDist) {
            const isTower = b.type === 'watchtower' || b.type === 'orc_watchtower';
            if (isTower && d < minTowerDist) {
              minTowerDist = d;
              closestTower = b;
            } else if (d < minBuildingDist) {
              minBuildingDist = d;
              closestBuilding = b;
            }
          }
        }
      }

      if (closestTower) return closestTower;
      if (closestBuilding) return closestBuilding;
    }

    return null;
  }

  dispose() {
    if (this.isDisposed) return;
    this.isDisposed = true;
    if (this.mesh && this.scene) {
      this.scene.remove(this.mesh);
    }
    if (this.hpGroup && this.scene) {
      this.scene.remove(this.hpGroup);
    }
  }
}
