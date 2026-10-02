/**
 * BuildingView.js — F2-08c: malha de uma construção (`src/sim/Building.js`, entidade pura). Segura o `THREE.Group`
 * raiz (modelo, andaime, anel de seleção), a barra de vida (billboard), a bandeira do ponto de reunião, as chamas de
 * dano e o VFX ambiente das subclasses (`src/render/buildings/**`). Criada/removida pela `EntityViews`; lê o estado da
 * simulação a cada quadro (`update`) e nunca escreve nela (só emite `BUILDING_VFX` para áudio/partículas).
 */
import * as THREE from 'three';
import { ModelFactory } from '../entities/ModelFactory.js';
import { getBuildingDef } from '../data/index.js';
import { EVT } from '../sim/events.js';

/** Vector3 → objeto plano `{x,y,z}` (payload de evento: nunca referências a objetos three.js). */
function posOf(v) {
  return { x: v.x, y: v.y, z: v.z };
}

// Shared Ring Geometries by building radius
const bldRingGeoCastle = new THREE.RingGeometry(5.95, 6.2, 32);
bldRingGeoCastle.rotateX(-Math.PI / 2);
const bldRingGeoBarracks = new THREE.RingGeometry(4.25, 4.5, 32);
bldRingGeoBarracks.rotateX(-Math.PI / 2);
const bldRingGeoDefault = new THREE.RingGeometry(3.35, 3.6, 32);
bldRingGeoDefault.rotateX(-Math.PI / 2);

const bldRingMat = new THREE.MeshBasicMaterial({
  color: 0xdeb841,
  side: THREE.DoubleSide,
  transparent: true,
  opacity: 0.85
});

// Shared Scaffold Geometries
const scafPoleGeo = new THREE.CylinderGeometry(0.1, 0.1, 2.5, 5);
const scafRailGeo = new THREE.BoxGeometry(4.2, 0.1, 0.1);

// Shared 3D Health Bar Geometries & Materials (Zero Canvas, zero texture uploads)
const bldHpBgGeo = new THREE.PlaneGeometry(2.46, 0.34);
const bldHpFillGeo = new THREE.PlaneGeometry(2.38, 0.26);
bldHpFillGeo.translate(1.19, 0, 0); // pivot left edge

const bldHpBgMat = new THREE.MeshBasicMaterial({
  color: 0x0f172a,
  side: THREE.DoubleSide,
  depthTest: false,
  depthWrite: false,
  transparent: false
});
const bldHpGreenMat = new THREE.MeshBasicMaterial({ color: 0x22c55e, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
const bldHpYellowMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
const bldHpRedMat = new THREE.MeshBasicMaterial({ color: 0xef4444, depthTest: false, depthWrite: false, side: THREE.DoubleSide });

// F1-08: vetores de módulo reutilizados por frame (evita alocação em update/VFX)
const _flameSmokePos = new THREE.Vector3();
const _chimneyPos = new THREE.Vector3();
const _chimneyOffsetGreatHall = new THREE.Vector3(-2.2, 9.8, -1.8);
const _chimneyOffsetCottage = new THREE.Vector3(-2.1, 4.4, -0.6);

export class BuildingView {
  /**
   * @param {import('../sim/Building.js').Building} building
   * @param {import('three').Scene|null} scene
   */
  constructor(building, scene) {
    this.entity = building;
    this.scene = scene;
    const type = building.type;
    const p = building.mesh.position;

    this.fullMesh = this.createBuildingMesh(type);
    this.fullMesh.userData.entity = building;
    this.scaffoldMesh = this.createScaffoldMesh();
    this.scaffoldMesh.userData.entity = building;

    /** Raiz da malha (picking/raycast): `userData.entity` aponta para a entidade de simulação. */
    this.root = new THREE.Group();
    this.root.position.set(p.x, p.y, p.z);
    this.root.rotation.y = building.mesh.rotation.y;
    this.root.add(this.fullMesh);
    this.root.add(this.scaffoldMesh);
    this.root.userData.entity = building;

    // F7-02: tinge o material `TeamColor` dos .glb com a cor do dono (no-op para modelos procedurais).
    const gm = building.gameManager;
    const owner = gm && gm.getPlayer ? gm.getPlayer(building.ownerId) : null;
    if (owner && owner.color) ModelFactory.setTeamColor(this.fullMesh, owner.color);

    /** Visível pela névoa (escrito pela `FogView`; só inimigos são escondidos). */
    this.fogHidden = false;
    this.flamesGroup = null;
    this.flameTongues = [];
    this.flameClusters = [];
    this.flameTime = 0;
    this.flameSmokeTimer = 0;
    this.smokeTimer = 0;
    this._csKey = null;
    this._hpPct = -1;

    this.createSelectionRing();
    this.createRallyFlag();
    this.createHealthBar();
    this.updateConstructionState();

    // Lifecycle hook for subclass VFX and animations
    this.initCustomVFX();

    if (this.scene) this.scene.add(this.root);
  }

  /** Alias da raiz 3D (compatível com o antigo `Building.mesh` usado por inspetor e subclasses). */
  get mesh() { return this.root; }
  get id() { return this.entity.id; }
  get ownerId() { return this.entity.ownerId; }
  get type() { return this.entity.type; }
  get queue() { return this.entity.queue; }
  get isConstructed() { return this.entity.isConstructed; }
  get isDead() { return this.entity.isDead; }
  get hp() { return this.entity.hp; }
  get maxHp() { return this.entity.maxHp; }
  get collisionRadius() { return this.entity.collisionRadius; }
  get isSelected() { return this.entity.isSelected; }
  get underAttackTimer() { return this.entity.underAttackTimer; }
  get buildProgress() { return this.entity.buildProgress; }

  // Base virtual methods for custom VFX/animations
  initCustomVFX() {}
  updateCustomVFX(delta, gameManager) {}
  cleanupCustomVFX() {}

  createBuildingMesh(type) {
    switch (type) {
      case 'castle': return ModelFactory.createCastle();
      case 'great_hall': return ModelFactory.createGreatHall();
      case 'lumber_camp': return ModelFactory.createLumberCamp();
      case 'orc_lumber_mill': return ModelFactory.createOrcLumberMill();
      case 'cottage': return ModelFactory.createCottage();
      case 'pig_farm': return ModelFactory.createPigFarm();
      case 'orc_house': return ModelFactory.createOrcHouse ? ModelFactory.createOrcHouse() : ModelFactory.createCottage();
      case 'orc_forge': return ModelFactory.createOrcForge ? ModelFactory.createOrcForge() : ModelFactory.createOrcBarracks();
      case 'forge': return ModelFactory.createHumanForge ? ModelFactory.createHumanForge() : ModelFactory.createBarracks();
      case 'stable': return ModelFactory.createStable();
      case 'ogre_den': return ModelFactory.createOgreDen();
      case 'arcane_tower':
      case 'ash_sanctum':
      case 'temple':
      case 'storm_altar':
      case 'aviary':
      case 'serpent_nest': return ModelFactory.createBuildingByType(type);
      case 'workshop': return ModelFactory.createWorkshop();
      case 'orc_workshop': return ModelFactory.createOrcWorkshop();
      case 'barracks': return ModelFactory.createBarracks();
      case 'orc_barracks': return ModelFactory.createOrcBarracks();
      case 'watchtower': return ModelFactory.createWatchtower();
      case 'orc_watchtower': return ModelFactory.createOrcWatchtower();
      case 'farm': return ModelFactory.createFarm();
      case 'bandit_camp': return ModelFactory.createBanditCamp();
      default: return ModelFactory.createCottage();
    }
  }

  createScaffoldMesh() {
    const scaf = new THREE.Group();
    scaf.name = 'Scaffold';
    const mat = ModelFactory.materials.woodMedium;

    // Corner timber poles (shared geometry)
    const coords = [[-2, -2], [2, -2], [-2, 2], [2, 2]];
    coords.forEach(([cx, cz]) => {
      const p = new THREE.Mesh(scafPoleGeo, mat);
      p.position.set(cx, 1.25, cz);
      scaf.add(p);
    });

    // Horizontal rails (shared geometry)
    const r1 = new THREE.Mesh(scafRailGeo, mat);
    r1.position.set(0, 1.8, -2);
    scaf.add(r1);
    const r2 = new THREE.Mesh(scafRailGeo, mat);
    r2.position.set(0, 1.8, 2);
    scaf.add(r2);

    return ModelFactory.enableShadows(scaf);
  }

  createSelectionRing() {
    const ringGeo = (this.type === 'castle' || this.type === 'great_hall')
      ? bldRingGeoCastle
      : (this.type === 'barracks' || this.type === 'orc_barracks')
      ? bldRingGeoBarracks
      : bldRingGeoDefault;

    this.selectionRing = new THREE.Mesh(ringGeo, bldRingMat);
    this.selectionRing.name = 'SelectionRing';
    this.selectionRing.position.y = 0.08;
    this.selectionRing.visible = false;
    this.mesh.add(this.selectionRing);
  }

  createRallyFlag() {
    this.rallyGroup = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.8, 4), ModelFactory.materials.woodDark);
    pole.position.y = 0.9;
    this.rallyGroup.add(pole);

    const bannerMat = (this.type === 'great_hall' || this.type === 'orc_barracks') ? ModelFactory.materials.redPlume : ModelFactory.materials.bannerBlue;
    const banner = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.35, 0.04), bannerMat);
    banner.position.set(0.3, 1.45, 0);
    this.rallyGroup.add(banner);

    this.rallyGroup.position.copy(this.entity.rallyPoint);
    this.rallyGroup.visible = false;
    if (this.scene) this.scene.add(this.rallyGroup);
  }

  getBuildingHeight() {
    return getBuildingDef(this.entity.type).healthBarHeight;
  }

  createHealthBar() {
    this.hpGroup = new THREE.Group();
    this.hpGroup.name = 'HealthBar';
    this.hpGroup.position.set(this.root.position.x, this.root.position.y + this.getBuildingHeight() + 0.8, this.root.position.z);

    const bgMesh = new THREE.Mesh(bldHpBgGeo, bldHpBgMat);
    bgMesh.name = 'HealthBg';
    bgMesh.renderOrder = 1100;
    this.hpGroup.add(bgMesh);

    this.hpFillMesh = new THREE.Mesh(bldHpFillGeo, bldHpGreenMat);
    this.hpFillMesh.name = 'HealthFill';
    this.hpFillMesh.position.set(-1.19, 0, 0.005);
    this.hpFillMesh.renderOrder = 1101;
    this.hpGroup.add(this.hpFillMesh);

    const barScale = Math.max(1.0, (this.collisionRadius * 0.95) / 2.4);
    this.hpGroup.scale.set(barScale, 1.0, 1.0);

    this.hpGroup.visible = false;
    this.hpSprite = this.hpGroup; // backward compatibility alias
    if (this.scene) this.scene.add(this.hpGroup);
    this.updateHealthBar();
  }

  updateHealthBar() {
    if (!this.hpFillMesh) return;
    const pct = Math.max(0, Math.min(1, this.hp / this.maxHp));
    this.hpFillMesh.scale.x = Math.max(0.001, pct);
    this.hpFillMesh.material = pct > 0.5 ? bldHpGreenMat : (pct > 0.25 ? bldHpYellowMat : bldHpRedMat);
  }

  createDamageFlames() {
    if (this.flamesGroup) return;

    this.flamesGroup = new THREE.Group();
    this.flameTongues = [];
    this.flameClusters = [];

    const fireOrangeMat = new THREE.MeshStandardMaterial({
      color: 0xff3b00,
      emissive: 0xff2200,
      emissiveIntensity: 1.6,
      roughness: 0.3,
      flatShading: true
    });
    const fireYellowMat = new THREE.MeshStandardMaterial({
      color: 0xffea00,
      emissive: 0xffcc00,
      emissiveIntensity: 2.0,
      roughness: 0.2,
      flatShading: true
    });
    const charcoalMat = new THREE.MeshStandardMaterial({
      color: 0x181818,
      roughness: 0.9,
      flatShading: true
    });

    const h = this.getBuildingHeight();
    const r = this.collisionRadius * 0.55;

    // 3 prominent flame cluster positions across building roofs and facades
    const clusterPositions = [
      new THREE.Vector3(-r * 0.1, h * 0.78, -r * 0.1),
      new THREE.Vector3(r * 0.5, h * 0.52, r * 0.25),
      new THREE.Vector3(-r * 0.35, h * 0.38, r * 0.55)
    ];

    clusterPositions.forEach((pos, cIdx) => {
      const cluster = new THREE.Group();
      cluster.position.copy(pos);
      const clusterScale = cIdx === 0 ? 1.3 : cIdx === 1 ? 1.15 : 1.0;
      cluster.scale.set(clusterScale, clusterScale, clusterScale);

      // Charred ember base
      const baseGeo = new THREE.CylinderGeometry(0.45, 0.58, 0.1, 5);
      const baseMesh = new THREE.Mesh(baseGeo, charcoalMat);
      baseMesh.position.y = 0.05;
      cluster.add(baseMesh);

      // Main center flame
      const mainGeo = new THREE.ConeGeometry(0.42, 1.45, 5);
      const mainMesh = new THREE.Mesh(mainGeo, fireOrangeMat);
      mainMesh.position.y = 0.72;
      cluster.add(mainMesh);
      this.flameTongues.push({
        mesh: mainMesh,
        baseScaleX: 1,
        baseScaleY: 1,
        baseRotZ: 0,
        offset: cIdx * 1.5
      });

      // Inner glowing core
      const coreGeo = new THREE.ConeGeometry(0.24, 0.9, 5);
      const coreMesh = new THREE.Mesh(coreGeo, fireYellowMat);
      coreMesh.position.y = 0.48;
      cluster.add(coreMesh);
      this.flameTongues.push({
        mesh: coreMesh,
        baseScaleX: 1,
        baseScaleY: 1,
        baseRotZ: 0,
        offset: cIdx * 1.5 + 0.8
      });

      // Side flame 1
      const side1Geo = new THREE.ConeGeometry(0.3, 1.1, 5);
      const side1Mesh = new THREE.Mesh(side1Geo, fireOrangeMat);
      side1Mesh.position.set(0.22, 0.52, 0.12);
      side1Mesh.rotation.z = -0.25;
      cluster.add(side1Mesh);
      this.flameTongues.push({
        mesh: side1Mesh,
        baseScaleX: 0.85,
        baseScaleY: 0.85,
        baseRotZ: -0.25,
        offset: cIdx * 1.5 + 1.6
      });

      // Side flame 2
      const side2Geo = new THREE.ConeGeometry(0.24, 0.85, 5);
      const side2Mesh = new THREE.Mesh(side2Geo, fireOrangeMat);
      side2Mesh.position.set(-0.18, 0.42, -0.15);
      side2Mesh.rotation.z = 0.28;
      cluster.add(side2Mesh);
      this.flameTongues.push({
        mesh: side2Mesh,
        baseScaleX: 0.7,
        baseScaleY: 0.7,
        baseRotZ: 0.28,
        offset: cIdx * 1.5 + 2.4
      });

      this.flamesGroup.add(cluster);
      this.flameClusters.push(cluster);
    });

    // Flickering warm fire light on building
    const fireLight = new THREE.PointLight(0xff5500, 1.8, 12.0);
    fireLight.position.set(0, h * 0.6, 0);
    this.flamesGroup.add(fireLight);
    this.flamesGroup.userData.fireLight = fireLight;

    this.flamesGroup.visible = false;
    this.mesh.add(this.flamesGroup);
  }

  /** Destroi/oculta as chamas conforme o PV (`hp < 50 %`, em pé). */
  updateDamageFlames() {
    const e = this.entity;
    // Obra em andamento nasce com 10 % do PV: só mostra chamas de dano se levou dano de combate.
    const isDamagedOver50 = e.hp < e.maxHp * 0.5 && !e.isDead && (e.isConstructed || e.wasDamaged);
    if (isDamagedOver50) {
      if (!this.flamesGroup) {
        this.createDamageFlames();
      }
      this.flamesGroup.visible = true;
    } else if (this.flamesGroup) {
      this.flamesGroup.visible = false;
    }
  }

  updateConstructionState() {
    const e = this.entity;
    if (e.isConstructed) {
      this.fullMesh.visible = true;
      this.scaffoldMesh.visible = false;
      this.fullMesh.scale.set(1, 1, 1);
    } else {
      this.fullMesh.visible = true;
      this.scaffoldMesh.visible = true;
      // Rising building height based on progress
      const factor = Math.max(0.1, e.buildProgress / 100);
      this.fullMesh.scale.set(1, factor, 1);
    }
  }

  /** Visibilidade lógica da malha (sim) e da névoa (render). */
  _shown() {
    return this.entity.mesh.visible !== false && !this.fogHidden;
  }

  /**
   * Um quadro (F1-09): sincroniza malha/barra/chamas com a simulação, billboard da barra de vida, chamas e fumaça de
   * dano, fumaça de chaminé e VFX customizado das subclasses (forjas, chiqueiro, serraria, bandeiras).
   * @param {number} frameDelta  segundos reais desde o último quadro
   * @param {import('./EntityViews.js').EntityViews} [ctx]  `gm` e `camera` do quadro
   */
  update(frameDelta, ctx) {
    const e = this.entity;
    const gameManager = ctx && ctx.gm;
    const camera = ctx && ctx.camera;
    if (e.isDead) {
      this.hpGroup.visible = false;
      if (this.flamesGroup) this.flamesGroup.visible = false;
      this.rallyGroup.visible = false;
      return;
    }
    const gmEvents = gameManager && gameManager.events;
    const shown = this._shown();
    this.root.visible = shown;
    const bp = e.mesh.position;
    this.root.position.set(bp.x, bp.y, bp.z);
    this.root.rotation.y = e.mesh.rotation.y;

    // Construção em andamento / concluída.
    const csKey = e.isConstructed ? -1 : e.buildProgress;
    if (csKey !== this._csKey) {
      this._csKey = csKey;
      this.updateConstructionState();
    }

    // Anel de seleção e bandeira do ponto de reunião.
    this.selectionRing.visible = e.isSelected;
    this.rallyGroup.visible = e.rallyShown;
    if (e.rallyShown) this.rallyGroup.position.set(e.rallyPoint.x, e.rallyPoint.y, e.rallyPoint.z);

    // Barra de vida: preenchimento + billboard voltado para a câmera.
    const pct = Math.max(0, Math.min(1, e.hp / e.maxHp));
    if (pct !== this._hpPct) {
      this._hpPct = pct;
      this.updateHealthBar();
    }
    const barVisible = shown && (e.isSelected || e.hp < e.maxHp || (e.underAttackTimer && e.underAttackTimer > 0));
    this.hpGroup.visible = !!barVisible;
    if (barVisible && camera) {
      this.hpGroup.position.set(bp.x, bp.y + this.getBuildingHeight() + 0.8, bp.z);
      this.hpGroup.quaternion.copy(camera.quaternion);
    }

    this.updateDamageFlames();

    // Animate damage flames and smoke if active
    if (this.flamesGroup && this.flamesGroup.visible) {
      this.flameTime = (this.flameTime || 0) + frameDelta;
      const t = this.flameTime;
      for (let i = 0; i < this.flameTongues.length; i++) {
        const tongue = this.flameTongues[i];
        const f = Math.sin(t * 14 + tongue.offset);
        const f2 = Math.cos(t * 11 + tongue.offset);
        tongue.mesh.scale.y = tongue.baseScaleY * (0.8 + 0.35 * f);
        tongue.mesh.scale.x = tongue.baseScaleX * (0.9 + 0.2 * f2);
        tongue.mesh.rotation.z = tongue.baseRotZ + f * 0.12;
      }

      if (this.flamesGroup.userData && this.flamesGroup.userData.fireLight) {
        this.flamesGroup.userData.fireLight.intensity = 1.3 + 0.5 * Math.sin(t * 18);
      }

      this.flameSmokeTimer = (this.flameSmokeTimer || 0) + frameDelta;
      if (this.flameSmokeTimer >= 0.7) {
        this.flameSmokeTimer = 0;
        if (gmEvents && this.flameClusters.length > 0) {
          const cluster = this.flameClusters[Math.floor(Math.random() * this.flameClusters.length)]; // visual: não afeta o estado
          cluster.getWorldPosition(_flameSmokePos);
          _flameSmokePos.y += 0.5;
          gmEvents.emit(EVT.BUILDING_VFX, { buildingId: e.id, ownerId: e.ownerId, pos: posOf(_flameSmokePos), kind: 'chimney_smoke' });
        }
      }
    }

    // Subclass custom procedural animation and VFX update
    if (e.isConstructed) {
      this.updateCustomVFX(frameDelta, gameManager);
    }

    // Cottage & Great Hall chimney smoke
    if (e.isConstructed && (e.type === 'cottage' || e.type === 'great_hall') && gmEvents) {
      this.smokeTimer += frameDelta;
      if (this.smokeTimer >= 0.8) {
        this.smokeTimer = 0;
        const chimneyOffset = e.type === 'great_hall' ? _chimneyOffsetGreatHall : _chimneyOffsetCottage;
        _chimneyPos.copy(this.root.position).add(chimneyOffset);
        gmEvents.emit(EVT.BUILDING_VFX, { buildingId: e.id, ownerId: e.ownerId, pos: posOf(_chimneyPos), kind: 'chimney_smoke' });
      }
    }
  }

  /** Tira as malhas da cena (a raiz fica intacta se a `FogView` a reaproveitou como fantasma da construção). */
  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    this.hpGroup.visible = false;
    if (this.flamesGroup) this.flamesGroup.visible = false;
    this.cleanupCustomVFX();
    if (this.scene) {
      if (this.root.parent === this.scene) this.scene.remove(this.root);
      this.scene.remove(this.rallyGroup);
      this.scene.remove(this.hpGroup);
    }
  }
}
