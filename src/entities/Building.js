import * as THREE from 'three';
import { ModelFactory } from './ModelFactory.js';
import { Arrow } from './Arrow.js';

export class Building {
  constructor(scene, terrain, type, x, z, isConstructed = true, faction = 'player') {
    this.scene = scene;
    this.terrain = terrain;
    this.type = type; // 'castle', 'lumber_camp', 'cottage', 'barracks', 'watchtower', 'farm', 'bandit_camp'
    this.faction = faction;
    this.isConstructed = isConstructed;
    this.buildProgress = isConstructed ? 100 : 0;
    this.maxBuildProgress = 100;

    // Stats config
    const stats = this.getBuildingStats(type);
    this.name = stats.name;
    this.hp = stats.hp;
    this.maxHp = stats.hp;
    this.cost = stats.cost;
    this.popGranted = stats.popGranted || 0;
    this.attackRange = stats.attackRange || 0;
    this.attackDamage = stats.attackDamage || 0;
    this.collisionRadius = stats.collisionRadius || 3.0;
    this.attackCooldown = 1.4;
    this.attackTimer = 0;

    // Training / Production queue
    this.queue = [];
    const rallyDist = this.collisionRadius + 2.5;
    this.rallyPoint = new THREE.Vector3(x + (this.type === 'castle' ? 0 : 2.0), 0, z + rallyDist);
    this.rallyPoint.y = this.terrain.getHeight(this.rallyPoint.x, this.rallyPoint.z);

    // Smoke timer for cottage chimney
    this.smokeTimer = 0;
    this.passiveTimer = 0;

    // Create 3D Meshes
    this.fullMesh = this.createBuildingMesh(type);
    const h = this.terrain.getHeight(x, z);
    this.fullMesh.position.set(x, h, z);
    this.fullMesh.userData.entity = this;

    // Foundation scaffold mesh (shown when under construction)
    this.scaffoldMesh = this.createScaffoldMesh();
    this.scaffoldMesh.position.set(x, h, z);
    this.scaffoldMesh.userData.entity = this;

    this.mesh = new THREE.Group();
    this.mesh.position.set(x, h, z);
    this.fullMesh.position.set(0, 0, 0);
    this.scaffoldMesh.position.set(0, 0, 0);

    this.mesh.add(this.fullMesh);
    this.mesh.add(this.scaffoldMesh);
    this.mesh.userData.entity = this;

    this.updateConstructionState();
    this.createSelectionRing();
    this.createRallyFlag();

    this.scene.add(this.mesh);
  }

  getBuildingStats(type) {
    switch (type) {
      case 'castle':
        return { name: 'Castle Keep', hp: 1600, cost: { wood: 200, stone: 150 }, popGranted: 10, collisionRadius: 5.5 };
      case 'lumber_camp':
        return { name: 'Lumber Camp', hp: 550, cost: { wood: 80, gold: 0, stone: 0 }, collisionRadius: 3.2 };
      case 'cottage':
        return { name: 'Cottage House', hp: 400, cost: { wood: 50, gold: 0, stone: 0 }, popGranted: 5, collisionRadius: 2.8 };
      case 'barracks':
        return { name: 'Barracks', hp: 850, cost: { wood: 120, stone: 60 }, collisionRadius: 3.5 };
      case 'watchtower':
        return { name: 'Watchtower', hp: 650, cost: { wood: 80, stone: 40 }, attackRange: 18, attackDamage: 18, collisionRadius: 2.0 };
      case 'farm':
        return { name: 'Wheat Farm', hp: 350, cost: { wood: 60, gold: 0, stone: 0 }, collisionRadius: 2.8 };
      case 'bandit_camp':
        return { name: 'Bandit Stronghold', hp: 1400, cost: {}, collisionRadius: 4.2 };
      default:
        return { name: 'Building', hp: 500, cost: { wood: 50 }, collisionRadius: 3.0 };
    }
  }

  createBuildingMesh(type) {
    switch (type) {
      case 'castle': return ModelFactory.createCastle();
      case 'lumber_camp': return ModelFactory.createLumberCamp();
      case 'cottage': return ModelFactory.createCottage();
      case 'barracks': return ModelFactory.createBarracks();
      case 'watchtower': return ModelFactory.createWatchtower();
      case 'farm': return ModelFactory.createFarm();
      case 'bandit_camp': return ModelFactory.createBanditCamp();
      default: return ModelFactory.createCottage();
    }
  }

  createScaffoldMesh() {
    const scaf = new THREE.Group();
    scaf.name = 'Scaffold';
    const mat = ModelFactory.materials.woodMedium;

    // Corner timber poles
    const poleGeo = new THREE.CylinderGeometry(0.1, 0.1, 2.5, 5);
    const coords = [[-2, -2], [2, -2], [-2, 2], [2, 2]];
    coords.forEach(([cx, cz]) => {
      const p = new THREE.Mesh(poleGeo, mat);
      p.position.set(cx, 1.25, cz);
      scaf.add(p);
    });

    // Horizontal rails
    const railGeo = new THREE.BoxGeometry(4.2, 0.1, 0.1);
    const r1 = new THREE.Mesh(railGeo, mat);
    r1.position.set(0, 1.8, -2);
    scaf.add(r1);
    const r2 = new THREE.Mesh(railGeo, mat);
    r2.position.set(0, 1.8, 2);
    scaf.add(r2);

    return ModelFactory.enableShadows(scaf);
  }

  createSelectionRing() {
    const radius = this.type === 'castle' ? 6.2 : this.type === 'barracks' ? 4.5 : 3.6;
    const ringGeo = new THREE.RingGeometry(radius - 0.25, radius, 32);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xdeb841, // glowing gold
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85
    });
    this.selectionRing = new THREE.Mesh(ringGeo, ringMat);
    this.selectionRing.position.y = 0.08;
    this.selectionRing.visible = false;
    this.mesh.add(this.selectionRing);
  }

  createRallyFlag() {
    this.rallyGroup = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.8, 4), ModelFactory.materials.woodDark);
    pole.position.y = 0.9;
    this.rallyGroup.add(pole);

    const banner = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.35, 0.04), ModelFactory.materials.bannerBlue);
    banner.position.set(0.3, 1.45, 0);
    this.rallyGroup.add(banner);

    this.rallyGroup.position.copy(this.rallyPoint);
    this.rallyGroup.visible = false;
    this.scene.add(this.rallyGroup);
  }

  setSelected(selected) {
    this.selectionRing.visible = selected;
    if (this.rallyGroup) {
      this.rallyGroup.visible = selected && (this.type === 'castle' || this.type === 'barracks');
    }
  }

  setRallyPoint(pos) {
    this.rallyPoint.copy(pos);
    this.rallyPoint.y = this.terrain.getHeight(pos.x, pos.z);
    if (this.rallyGroup) {
      this.rallyGroup.position.copy(this.rallyPoint);
      this.rallyGroup.visible = true;
    }
  }

  updateConstructionState() {
    if (this.isConstructed) {
      this.fullMesh.visible = true;
      this.scaffoldMesh.visible = false;
      this.fullMesh.scale.set(1, 1, 1);
    } else {
      this.fullMesh.visible = true;
      this.scaffoldMesh.visible = true;
      // Rising building height based on progress
      const factor = Math.max(0.1, this.buildProgress / 100);
      this.fullMesh.scale.set(1, factor, 1);
    }
  }

  construct(amount, soundManager, particleSystem) {
    if (this.isConstructed) return;
    this.buildProgress += amount;
    if (particleSystem) {
      particleSystem.spawnWoodChips(this.mesh.position);
    }
    if (this.buildProgress >= 100) {
      this.buildProgress = 100;
      this.isConstructed = true;
      this.updateConstructionState();
      if (soundManager) soundManager.playBuildComplete();
      if (particleSystem) {
        particleSystem.spawnFloatingText('Constructed!', this.mesh.position, '#ffd700');
      }
    } else {
      this.updateConstructionState();
    }
  }

  takeDamage(amount, particleSystem, attacker = null) {
    this.hp -= amount;
    if (particleSystem) {
      particleSystem.spawnFloatingText(`-${Math.round(amount)}`, this.mesh.position, '#ff4d4d');
      particleSystem.spawnHitSparks(this.mesh.position);
    }
    if (this.hp <= 0) {
      this.hp = 0;
      this.die();
    }
  }

  die() {
    this.isDead = true;
    this.scene.remove(this.mesh);
    if (this.rallyGroup) this.scene.remove(this.rallyGroup);
  }

  queueUnit(unitType, gameManager) {
    const costs = {
      villager: { wood: 50, gold: 20, time: 7 },
      knight: { wood: 70, gold: 50, stone: 20, time: 11 },
      archer: { wood: 60, gold: 35, time: 9 }
    };
    const c = costs[unitType];
    if (!c) return false;

    if (!gameManager.canAfford(c)) return false;
    if (gameManager.population >= gameManager.maxPopulation) return false;

    gameManager.deductResources(c);
    this.queue.push({
      type: unitType,
      progress: 0,
      totalTime: c.time
    });
    return true;
  }

  update(delta, gameManager, soundManager, particleSystem, arrows, enemies) {
    if (this.isDead) return;

    // Passive production (Farm gives +3 food/gold)
    if (this.isConstructed && this.type === 'farm') {
      this.passiveTimer += delta;
      if (this.passiveTimer >= 6.0) {
        this.passiveTimer = 0;
        gameManager.addResource('gold', 3);
        if (particleSystem) {
          particleSystem.spawnFloatingText('+3 Gold', this.mesh.position, '#ffd700');
        }
      }
    }

    // Cottage chimney smoke
    if (this.isConstructed && this.type === 'cottage' && particleSystem) {
      this.smokeTimer += delta;
      if (this.smokeTimer >= 0.8) {
        this.smokeTimer = 0;
        const chimneyPos = this.mesh.position.clone().add(new THREE.Vector3(-2.1, 4.4, -0.6));
        particleSystem.spawnSmokePuff(chimneyPos);
      }
    }

    // Watchtower auto-attack
    if (this.isConstructed && this.type === 'watchtower' && this.attackRange > 0 && enemies) {
      this.attackTimer += delta;
      if (this.attackTimer >= this.attackCooldown) {
        // Find closest enemy within range
        let closest = null;
        let minDist = this.attackRange;
        enemies.forEach(e => {
          if (!e.isDead) {
            const d = this.mesh.position.distanceTo(e.mesh.position);
            if (d < minDist) {
              minDist = d;
              closest = e;
            }
          }
        });

        if (closest) {
          this.attackTimer = 0;
          if (soundManager) soundManager.playBow();
          const arrowStart = this.mesh.position.clone().add(new THREE.Vector3(0, 6.8, 0));
          arrows.push(new Arrow(this.scene, arrowStart, closest, this.attackDamage, (target, dmg, hitPos) => {
            target.takeDamage(dmg, particleSystem);
            if (soundManager) soundManager.playArrowHit();
          }));
        }
      }
    }

    // Training Queue processing
    if (this.isConstructed && this.queue.length > 0) {
      const current = this.queue[0];
      current.progress += delta;
      if (current.progress >= current.totalTime) {
        // Spawn Unit outside building walls
        this.queue.shift();
        const spawnDist = this.collisionRadius + 1.2;
        const spawnX = this.mesh.position.x + (Math.random() - 0.5) * 1.5;
        const spawnZ = this.mesh.position.z + spawnDist;
        gameManager.spawnUnit(current.type, spawnX, spawnZ, this.faction, this.rallyPoint);
        if (soundManager) soundManager.playOrder();
      }
    }
  }
}
