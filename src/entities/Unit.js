import * as THREE from 'three';
import { ModelFactory } from './ModelFactory.js';
import { Arrow } from './Arrow.js';
import { UnitAnimator } from '../inspector/unitAnimator.js';

export class Unit {
  constructor(scene, terrain, type, x, z, faction = 'player') {
    this.scene = scene;
    this.terrain = terrain;
    this.type = type; // 'villager', 'knight', 'archer', 'bandit'
    this.faction = faction; // 'player' or 'enemy'

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

    // State machine: 'idle', 'moving', 'gathering', 'returning', 'building', 'attacking', 'dying'
    this.state = 'idle';
    this.targetPos = null;
    this.targetEntity = null;
    this.gatherTarget = null;
    this.buildTarget = null;
    this.attackTarget = null;

    // Worker inventory
    this.carrying = { type: null, amount: 0, max: 15 };
    this.actionTimer = 0;
    this.attackTimer = 0;
    this.walkTimer = 0;
    this.isDead = false;
    this.isDying = false;
    this.canRemove = false;
    this.hurtTimer = 0;
    this.deathTimer = 0;
    this.deathDuration = 1.6;
    this.hasFiredThisAttack = false;

    // Create 3D Model
    this.mesh = this.createModel(type);
    const h = this.terrain.getHeight(x, z);
    this.mesh.position.set(x, h, z);
    this.mesh.scale.set(1.35, 1.35, 1.35); // Heroic RTS proportions matching modelo.png
    this.mesh.userData.entity = this;

    // Animator
    this.animator = new UnitAnimator(this.mesh, type);

    // Selection ring
    this.createSelectionRing();
    this.createHealthBar();

    this.scene.add(this.mesh);
  }

  getUnitStats(type) {
    switch (type) {
      case 'villager':
        return { name: 'Villager', hp: 85, speed: 4.5, attack: 7, attackRange: 1.6, attackCooldown: 1.0, collisionRadius: 0.55 };
      case 'knight':
        return { name: 'Knight', hp: 190, speed: 4.8, attack: 26, attackRange: 1.9, attackCooldown: 1.1, armor: 4, collisionRadius: 0.70 };
      case 'archer':
        return { name: 'Archer', hp: 95, speed: 4.3, attack: 18, attackRange: 14.0, attackCooldown: 1.4, collisionRadius: 0.55 };
      case 'bandit':
        return { name: 'Bandit Raider', hp: 125, speed: 4.4, attack: 16, attackRange: 1.9, attackCooldown: 1.2, armor: 1, collisionRadius: 0.70 };
      default:
        return { name: 'Unit', hp: 100, speed: 4.0, attack: 10, attackRange: 1.5, attackCooldown: 1.0, collisionRadius: 0.60 };
    }
  }

  createModel(type) {
    let model;
    switch (type) {
      case 'villager': model = ModelFactory.createVillager(); break;
      case 'knight': model = ModelFactory.createKnight(); break;
      case 'archer': model = ModelFactory.createArcher(); break;
      case 'bandit': model = ModelFactory.createBandit(); break;
      default: model = ModelFactory.createVillager(); break;
    }
    this.cloneMaterials(model);
    return model;
  }

  cloneMaterials(model) {
    if (!model) return;
    const matMap = new Map();
    model.traverse(child => {
      if (child.isMesh && child.material) {
        if (Array.isArray(child.material)) {
          child.material = child.material.map(m => {
            if (!matMap.has(m)) matMap.set(m, m.clone());
            return matMap.get(m);
          });
        } else {
          if (!matMap.has(child.material)) {
            matMap.set(child.material, child.material.clone());
          }
          child.material = matMap.get(child.material);
        }
      }
    });
  }

  createSelectionRing() {
    const ringGeo = new THREE.RingGeometry(0.85, 1.05, 24);
    ringGeo.rotateX(-Math.PI / 2);
    const color = this.faction === 'player' ? 0xdeb841 : 0xef4444;
    const ringMat = new THREE.MeshBasicMaterial({
      color,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85
    });
    this.selectionRing = new THREE.Mesh(ringGeo, ringMat);
    this.selectionRing.position.y = 0.05;
    this.selectionRing.visible = false;
    this.mesh.add(this.selectionRing);
  }

  createHealthBar() {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 12;
    this.hpCanvas = canvas;
    this.hpCtx = canvas.getContext('2d');

    this.hpTexture = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({ map: this.hpTexture, transparent: true, depthTest: false });
    this.hpSprite = new THREE.Sprite(spriteMat);
    this.hpSprite.scale.set(1.4, 0.28, 1);
    this.hpSprite.position.set(0, 2.3, 0);
    this.hpSprite.visible = false;
    this.mesh.add(this.hpSprite);
    this.updateHealthBar();
  }

  updateHealthBar() {
    const ctx = this.hpCtx;
    ctx.clearRect(0, 0, 64, 12);

    // Background border
    ctx.fillStyle = '#1e1c19';
    ctx.fillRect(0, 0, 64, 12);

    // HP fill
    const pct = Math.max(0, this.hp / this.maxHp);
    ctx.fillStyle = pct > 0.5 ? '#4ade80' : pct > 0.25 ? '#facc15' : '#ef4444';
    ctx.fillRect(2, 2, Math.floor(60 * pct), 8);

    this.hpTexture.needsUpdate = true;
  }

  setSelected(selected) {
    this.selectionRing.visible = selected;
    this.hpSprite.visible = selected || this.hp < this.maxHp;
  }

  // --- COMMANDS ---

  moveTo(x, z) {
    this.state = 'moving';
    this.targetPos = new THREE.Vector3(x, 0, z);
    this.targetEntity = null;
    this.gatherTarget = null;
    this.buildTarget = null;
    this.attackTarget = null;
  }

  orderGather(resource) {
    if (this.type !== 'villager') return;
    this.state = 'gathering';
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
  }

  orderBuild(building) {
    if (this.type !== 'villager') return;
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

  orderAttack(target) {
    this.state = 'attacking';
    this.attackTarget = target;
    this.targetEntity = target;
    this.gatherTarget = null;
    this.buildTarget = null;
    this.hasFiredThisAttack = false;
  }

  stop() {
    this.state = 'idle';
    this.targetPos = null;
    this.targetEntity = null;
    this.gatherTarget = null;
    this.buildTarget = null;
    this.attackTarget = null;
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
    this.hpSprite.visible = true;

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

    // Retaliation & Call for help: soldiers & bandits strike back when attacked
    if (attacker && !attacker.isDead && attacker.hp > 0 && attacker.faction !== this.faction) {
      const isCombatUnit = this.type === 'knight' || this.type === 'archer' || this.type === 'bandit';
      if (isCombatUnit) {
        // If idle, moving, or attacking a passive structure, turn to engage the attacker!
        const attackingBuilding = this.attackTarget && (this.attackTarget.type === 'castle' || this.attackTarget.type === 'lumber_camp' || this.attackTarget.type === 'cottage' || this.attackTarget.type === 'barracks' || this.attackTarget.type === 'watchtower' || this.attackTarget.type === 'farm' || this.attackTarget.type === 'bandit_camp');
        if (this.state !== 'attacking' || attackingBuilding) {
          this.orderAttack(attacker);
        }
      }

      // Nearby friendly soldiers & bandits rush to help!
      if (allUnits && allUnits.length > 0) {
        allUnits.forEach(u => {
          if (!u.isDead && u.faction === this.faction && (u.type === 'knight' || u.type === 'archer' || u.type === 'bandit')) {
            if (u.state === 'idle') {
              const d = this.mesh.position.distanceTo(u.mesh.position);
              if (d < 14) {
                u.orderAttack(attacker);
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

    if (this.selectionRing) this.selectionRing.visible = false;
    if (this.hpSprite) this.hpSprite.visible = false;

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

  moveTowards(destX, destZ, delta) {
    const currentPos = this.mesh.position;
    const dir = new THREE.Vector3(destX - currentPos.x, 0, destZ - currentPos.z);
    const dist = dir.length();
    if (dist < 0.1) return;

    dir.normalize();
    const step = Math.min(dist, this.speed * delta);
    this.mesh.position.addScaledVector(dir, step);

    const groundH = this.terrain.getHeight(this.mesh.position.x, this.mesh.position.z);
    this.mesh.position.y = groundH;

    this.mesh.rotation.y = Math.atan2(dir.x, dir.z);

    // Walk animation (if not playing hurt stagger)
    this.hasFiredThisAttack = false;
    if (this.animator && this.hurtTimer <= 0) {
      this.animator.setAnimation('walk');
      this.animator.update(delta);
    }
  }

  update(delta, gameManager, soundManager, particleSystem, arrows, allUnits, buildings) {
    if (this.canRemove) return;

    if (this.state === 'dying') {
      this.deathTimer += delta;
      if (this.animator) {
        this.animator.update(delta);
      }
      if (this.deathTimer >= 1.0) {
        this.mesh.position.y -= delta * 0.35;
      }
      if (this.deathTimer >= this.deathDuration) {
        this.canRemove = true;
        this.scene.remove(this.mesh);
      }
      return;
    }

    if (this.isDead) return;

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
        this.updateMoving(delta);
        break;
      case 'gathering':
        this.updateGathering(delta, gameManager, soundManager, particleSystem, buildings);
        break;
      case 'returning':
        this.updateReturning(delta, gameManager, soundManager, particleSystem, buildings);
        break;
      case 'building':
        this.updateBuilding(delta, soundManager, particleSystem);
        break;
      case 'attacking':
        this.updateAttacking(delta, soundManager, particleSystem, arrows, allUnits, buildings);
        break;
    }
  }

  updateIdle(delta, allUnits, buildings) {
    this.hasFiredThisAttack = false;
    if (this.animator && this.hurtTimer <= 0) {
      this.animator.setAnimation('idle');
      this.animator.update(delta);
    }

    // Auto-Aggro: Military units actively scan for and attack approaching enemies
    if (this.faction === 'player' && (this.type === 'knight' || this.type === 'archer')) {
      const scanRange = this.type === 'archer' ? 14 : 10;
      const target = this.findNearestHostile(allUnits, buildings, scanRange);
      if (target) {
        this.orderAttack(target);
      }
    } else if (this.faction === 'enemy') {
      const target = this.findNearestHostile(allUnits, buildings, 13);
      if (target) {
        this.orderAttack(target);
      }
    }
  }

  updateMoving(delta) {
    if (!this.targetPos) {
      this.stop();
      return;
    }

    const currentPos = this.mesh.position;
    const dest = this.targetPos.clone();
    dest.y = currentPos.y;

    const dist = currentPos.distanceTo(dest);
    if (dist < 0.3) {
      this.mesh.position.x = dest.x;
      this.mesh.position.z = dest.z;
      this.stop();
      return;
    }

    // Direction and rotation
    const dir = new THREE.Vector3().subVectors(dest, currentPos).normalize();
    const moveDist = Math.min(dist, this.speed * delta);
    this.mesh.position.addScaledVector(dir, moveDist);

    // Stick to terrain surface height
    const groundH = this.terrain.getHeight(this.mesh.position.x, this.mesh.position.z);
    this.mesh.position.y = groundH;

    // Rotate unit facing movement direction
    const targetAngle = Math.atan2(dir.x, dir.z);
    this.mesh.rotation.y = targetAngle;

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
      gameManager.addResource(this.carrying.type, this.carrying.amount);
      if (particleSystem) {
        const color = this.carrying.type === 'gold' ? '#ffd700' : this.carrying.type === 'wood' ? '#68d391' : '#cbd5e1';
        particleSystem.spawnFloatingText(`+${this.carrying.amount} ${this.carrying.type.toUpperCase()}`, this.mesh.position, color);
      }
      if (soundManager) soundManager.playOrder();
      this.carrying.amount = 0;
      this.updateCarryingVisuals(false);
    }

    // Immediately resume gathering if target still has resources
    if (this.gatherTarget && !this.gatherTarget.isDead && (this.gatherTarget.woodRemaining > 0 || this.gatherTarget.resourcesRemaining > 0)) {
      this.state = 'gathering';
      this.resetWalkPose();
    } else {
      this.stop();
    }
  }

  updateReturning(delta, gameManager, soundManager, particleSystem, buildings) {
    // Find nearest dropoff building (Castle or Lumber Camp for wood, Castle for gold/stone)
    const dropoff = gameManager.findNearestDropoff(this.mesh.position, this.carrying.type, buildings || gameManager.buildings);
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

  updateBuilding(delta, soundManager, particleSystem) {
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
      this.buildTarget.construct(10, soundManager, particleSystem);
      if (soundManager) soundManager.playHammer();
    }
  }

  updateAttacking(delta, soundManager, particleSystem, arrows, allUnits, buildings) {
    // 1. Target dead or invalid: find next closest hostile
    if (!this.attackTarget || this.attackTarget.isDead || this.attackTarget.hp <= 0) {
      const nextTarget = this.findNearestHostile(allUnits, buildings, 16);
      if (nextTarget) {
        this.attackTarget = nextTarget;
        this.targetEntity = nextTarget;
        this.hasFiredThisAttack = false;
      } else {
        this.stop();
        return;
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

    if (this.type === 'archer') {
      // Archer: Bow draws from 0.25 to 0.65; release arrow shot at progress >= 0.65
      if (progress >= 0.65 && !this.hasFiredThisAttack) {
        this.hasFiredThisAttack = true;
        if (soundManager) soundManager.playBow();
        const startPos = this.mesh.position.clone().add(new THREE.Vector3(0, 1.4, 0));
        arrows.push(new Arrow(this.scene, startPos, this.attackTarget, this.attack, (target, dmg, hitPos) => {
          target.takeDamage(dmg, particleSystem, this, allUnits);
          if (soundManager) soundManager.playArrowHit();
        }));
      }
    } else {
      // Melee units (Knight, Villager, Bandit) strike at apex (progress >= 0.45)
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

  findNearestHostile(allUnits, buildings, maxDist = 15) {
    let closest = null;
    let minDist = maxDist;

    if (allUnits) {
      allUnits.forEach(u => {
        if (!u.isDead && u.hp > 0 && u.faction !== this.faction) {
          const d = this.mesh.position.distanceTo(u.mesh.position);
          if (d < minDist) {
            minDist = d;
            closest = u;
          }
        }
      });
    }

    if (buildings) {
      buildings.forEach(b => {
        if (!b.isDead && b.hp > 0 && b.faction !== this.faction) {
          const d = this.mesh.position.distanceTo(b.mesh.position);
          if (d < minDist) {
            minDist = d;
            closest = b;
          }
        }
      });
    }

    return closest;
  }
}
