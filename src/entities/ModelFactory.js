import * as THREE from 'three';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import {
  materials,
  enableShadows,
  createCastle,
  createLumberCamp,
  createGoldMine,
  createStoneQuarry,
  createCottage,
  createBarracks,
  createWatchtower,
  createFarm,
  createBanditCamp,
  createGreatHall,
  createOrcBarracks,
  createPigFarm,
  createOrcLumberMill,
  createOrcWatchtower,
  createOrcHouse,
  createOrcForge,
  createHumanForge,
  createStable,
  createOgreDen,
  createCavalier,
  createBallista,
  createCatapult,
  createSapper,
  createMage,
  createNecromancer,
  createSkeleton,
  createArcaneTower,
  createAshSanctum,
  createArsonist,
  createWorkshop,
  createOrcWorkshop,
  createTree,
  createKnight,
  createArcher,
  createVillager,
  createBandit,
  createCritter,
  createPeon,
  createGrunt,
  createAxethrower,
  createOgre,
  createArrow,
  createFlowerPatch,
  createPebbles,
  createGrassTuft,
  createBerryBush,
  createBoulder,
  createMushroomStump,
  createWaterLily
} from '../models/index.js';
import { createWallSegment } from '../models/buildings/WallModel.js';
import { prepareStaticTemplate, isStaticMergeEnabled } from '../render/staticTemplates.js';
import { mergeUnitTemplate } from '../render/mergeUnitTemplate.js';
import { skinUnitTemplate, isSkinEnabled } from '../render/skinUnitTemplate.js';
import { GLB_MODELS, glbEnabled, glbTemplates, loadGlbTemplates, setTeamColor } from './glbModels.js';

/**
 * Fast and memory-safe Object3D clone helper.
 * Temporarily clears userData containing circular / non-serializable Object3D references
 * to avoid Three.js JSON.stringify warnings, while preserving shared GPU geometries and materials.
 */
const HORSE_LEG_NAMES = ['HorseLegFL', 'HorseLegFR', 'HorseLegBL', 'HorseLegBR'];

function cloneModel(template) {
  const savedData = [];
  let hasSkinnedMesh = false;
  template.traverse(obj => {
    savedData.push({ obj, userData: obj.userData });
    obj.userData = {};
    if (obj.isSkinnedMesh) hasSkinnedMesh = true;
  });
  // F1-03b: SkinnedMesh.clone() não religa o Skeleton aos ossos do clone; SkeletonUtils.clone
  // clona bones + malhas em paralelo e reconstrói o Skeleton de cada SkinnedMesh do clone.
  const clone = hasSkinnedMesh ? skeletonClone(template) : template.clone(true);
  for (let i = 0; i < savedData.length; i++) {
    savedData[i].obj.userData = savedData[i].userData;
  }
  if (hasSkinnedMesh) unifySkeletons(clone);
  return clone;
}

/**
 * F1-03b: `SkeletonUtils.clone` cria um `Skeleton` novo (com sua própria bone texture) para CADA
 * SkinnedMesh do clone, mesmo quando todas compartilhavam o mesmo Skeleton no template (as várias
 * malhas — 1 por material — de uma unidade sempre compartilham os mesmos ossos). Sem isso, cada
 * material recalcularia/enviaria sua própria bone texture por quadro (custo ~N× sem ganho de
 * FPS). Rebinda todas as SkinnedMesh do clone ao Skeleton da primeira (ossos idênticos, já que
 * vieram do mesmo template) e descarta as demais (nunca chegaram a computar a bone texture).
 */
function unifySkeletons(root) {
  let shared = null;
  root.traverse(node => {
    if (!node.isSkinnedMesh) return;
    if (!shared) {
      shared = node.skeleton;
      return;
    }
    const redundant = node.skeleton;
    node.bind(shared, node.bindMatrix);
    if (redundant !== shared) redundant.dispose();
  });
}

export class ModelFactory {
  // Shared materials
  static materials = materials;

  // Pipeline Blender (F7-00): .glb só com ?glb=1 (lógica em glbModels.js)
  static glbEnabled = glbEnabled;
  static loadGlbModels() { return loadGlbTemplates(); }
  static setTeamColor(obj, color) { return setTeamColor(obj, color); }

  /** Clone de um .glb já carregado (ou null), com nomes preservados e userData religado. */
  static createGlbModel(key) {
    const template = glbTemplates.get(key);
    if (!template) return null;
    const clone = cloneModel(template);
    if (GLB_MODELS[key].type) this.rebindUserData(clone, GLB_MODELS[key].type);
    this._workerGlbDefaults(clone); // glTF não tem `visible`: estado inicial dos trabalhadores
    return clone;
  }

  /** Trabalhadores (.glb): só o machado visível; mochila e cargas ocultas (igual aos procedurais). */
  static _workerGlbDefaults(clone) {
    const ud = clone.userData;
    if (!ud || !ud.toolGroup || !ud.pack) return;
    if (ud.pickaxe) ud.pickaxe.visible = false;
    if (ud.hammer) ud.hammer.visible = false;
    ud.pack.visible = false;
    if (ud.woodBundle) ud.woodBundle.visible = false;
    if (ud.goldSack) ud.goldSack.visible = false;
  }

  static _glbOr(key, fallback) {
    return (glbEnabled && this.createGlbModel(key)) || fallback();
  }

  // Template instances cache (loaded in memory once, cloned instantaneously)
  static templates = new Map();

  // Helper to enable shadow casting & receiving on all child meshes
  static enableShadows(obj) {
    return enableShadows(obj);
  }

  /**
   * Rebinds named nodes and animation closures on a cloned unit instance
   */
  static rebindUserData(clone, type) {
    if (!clone) return clone;
    const ud = clone.userData = clone.userData || {};
    ud.torso = clone.getObjectByName('Torso') || ud.torso;
    ud.head = clone.getObjectByName('Head') || ud.head;
    ud.armL = clone.getObjectByName('ArmL') || ud.armL;
    ud.armR = clone.getObjectByName('ArmR') || ud.armR;
    ud.legL = clone.getObjectByName('LegL') || ud.legL;
    ud.legR = clone.getObjectByName('LegR') || ud.legR;
    ud.sword = clone.getObjectByName('Sword') || ud.sword;
    ud.shieldGroup = clone.getObjectByName('ShieldGroup') || ud.shieldGroup;
    ud.bow = clone.getObjectByName('Bow') || ud.bow;
    ud.weapon = clone.getObjectByName('Weapon') || ud.weapon;
    ud.toolGroup = clone.getObjectByName('ToolGroup') || ud.toolGroup;
    ud.axe = clone.getObjectByName('Axe') || ud.axe;
    ud.pickaxe = clone.getObjectByName('Pickaxe') || ud.pickaxe;
    ud.hammer = clone.getObjectByName('Hammer') || ud.hammer;
    ud.pack = clone.getObjectByName('Pack') || ud.pack;
    ud.woodBundle = clone.getObjectByName('WoodBundle') || ud.woodBundle;
    ud.goldSack = clone.getObjectByName('GoldSack') || ud.goldSack;
    ud.plume = clone.getObjectByName('Plume') || ud.plume;
    ud.drawnArrow = clone.getObjectByName('DrawnArrow') || ud.drawnArrow;
    ud.weaponL = clone.getObjectByName('WeaponL') || ud.weaponL;
    ud.weaponR = clone.getObjectByName('WeaponR') || ud.weaponR;
    ud.drawnAxe = clone.getObjectByName('DrawnAxe') || ud.drawnAxe;
    ud.horn = clone.getObjectByName('Horn') || ud.horn;
    ud.mohawk = clone.getObjectByName('Mohawk') || ud.mohawk;
    // F4-01: pernas do cavalo (cavalier) — balançam em fase alternada no `UnitAnimator`
    const horseLegs = HORSE_LEG_NAMES.map(n => clone.getObjectByName(n));
    if (horseLegs.every(Boolean)) ud.horseLegs = horseLegs;
    // F4-02: cerco (Balista/Catapulta) — braço que recua/arremessa e rodas
    ud.siegeArm = clone.getObjectByName('SiegeArm') || ud.siegeArm;
    ud.wheelL = clone.getObjectByName('WheelL') || ud.wheelL;
    ud.wheelR = clone.getObjectByName('WheelR') || ud.wheelR;
    // F4-05: pavio dos sapadores (pisca na animação)
    ud.fuse = clone.getObjectByName('Fuse') || ud.fuse;
    // F4-04: cristal do cajado dos conjuradores (pulsa na 'cast')
    ud.crystal = clone.getObjectByName('Crystal') || ud.crystal;

    // Archer dynamic bow string closure rebinding
    const sTop = clone.getObjectByName('BowStringTop');
    const sBot = clone.getObjectByName('BowStringBottom');
    if (sTop && sBot) {
      // extremidades da corda: empties BowTipTop/BowTipBottom do .glb (arco Blender); senão ±0.95
      const tipT = clone.getObjectByName('BowTipTop');
      const tipB = clone.getObjectByName('BowTipBottom');
      const topTipPos = tipT ? tipT.position.clone() : new THREE.Vector3(0, 0.95, -0.05);
      const botTipPos = tipB ? tipB.position.clone() : new THREE.Vector3(0, -0.95, -0.05);
      const upVec = new THREE.Vector3(0, 1, 0);
      const dArrow = clone.getObjectByName('DrawnArrow');
      ud.updateBowString = function(drawDist = 0) {
        const nockPos = new THREE.Vector3(0, 0, -drawDist);
        const dirTop = new THREE.Vector3().subVectors(nockPos, topTipPos);
        const lenTop = dirTop.length();
        sTop.position.addVectors(topTipPos, nockPos).multiplyScalar(0.5);
        sTop.scale.set(1, lenTop, 1);
        sTop.quaternion.setFromUnitVectors(upVec, dirTop.normalize());

        const dirBot = new THREE.Vector3().subVectors(nockPos, botTipPos);
        const lenBot = dirBot.length();
        sBot.position.addVectors(botTipPos, nockPos).multiplyScalar(0.5);
        sBot.scale.set(1, lenBot, 1);
        sBot.quaternion.setFromUnitVectors(upVec, dirBot.normalize());

        if (dArrow) {
          if (drawDist > 0.02) {
            dArrow.visible = true;
            dArrow.position.set(0, 0, -drawDist);
          } else {
            dArrow.visible = false;
          }
        }
      };
      ud.updateBowString(0);
    }

    return clone;
  }

  /**
   * F2-03 (modo headless): partidas headless (`MatchConfig.headless`, testes de determinismo em
   * Node, sem DOM/WebGL) não podem gerar texturas procedurais (`document.createElement('canvas')`).
   * Com a flag ligada, todo `createXxx()` que passa por aqui (unidades, construções, minas,
   * pedreiras, flechas) devolve um `THREE.Group()` vazio em vez de rodar o gerador procedural —
   * a simulação (posição/estado/colisão) não depende da malha visual.
   */
  static headless = false;

  /**
   * Retrieves a model from the preloaded template cache and returns a zero-cost clone,
   * sharing GPU geometries and materials.
   */
  static getOrCreateModel(key, generatorFn, type = null) {
    if (this.headless) return new THREE.Group();
    if (!this.templates.has(key)) {
      let template = prepareStaticTemplate(key, generatorFn()); // F1-02 (?merge=0 desliga)
      if (type && isStaticMergeEnabled()) {
        // F1-03b: skinning rígido (1 draw call por material da unidade); ?skin=0 volta à mescla
        // por osso da F1-03 (para comparar).
        template = isSkinEnabled() ? skinUnitTemplate(template) : mergeUnitTemplate(template);
      }
      this.templates.set(key, template);
    }
    const template = this.templates.get(key);
    const clone = cloneModel(template);
    if (type) {
      this.rebindUserData(clone, type);
    }
    return clone;
  }

  // Ghost building preview cache and shared materials (zero cloning & zero shader recompilations at runtime)
  static ghostCache = new Map();
  static ghostValidMat = new THREE.MeshBasicMaterial({
    color: 0x48bb78,
    transparent: true,
    opacity: 0.55,
    depthWrite: false
  });
  static ghostInvalidMat = new THREE.MeshBasicMaterial({
    color: 0xef4444,
    transparent: true,
    opacity: 0.55,
    depthWrite: false
  });

  /**
   * Retrieves a pre-built ghost preview model from the cache, or creates and caches it.
   */
  static getGhost(type) {
    if (this.ghostCache.has(type)) {
      return this.ghostCache.get(type);
    }
    const ghost = this.createGhost(type, this.ghostValidMat);
    this.ghostCache.set(type, ghost);
    return ghost;
  }

  /**
   * Updates the ghost preview material between valid (green) and invalid (red)
   */
  static setGhostMaterial(ghostMesh, material) {
    if (!ghostMesh) return;
    ghostMesh.traverse(c => {
      if (c.isMesh && c.material !== material) {
        c.material = material;
      }
    });
  }

  /**
   * Creates a fast ghost preview for building placement using a single shared ghost material
   */
  static createGhost(type, ghostMaterial) {
    const clone = this.createBuildingByType(type);
    clone.traverse(c => {
      if (c.isMesh) {
        c.material = ghostMaterial;
        c.castShadow = false;
        c.receiveShadow = false;
      }
    });
    return clone;
  }

  static createBuildingByType(type) {
    switch (type) {
      case 'castle': return this.createCastle();
      case 'great_hall': return this.createGreatHall();
      case 'lumber_camp': return this.createLumberCamp();
      case 'orc_lumber_mill': return this.createOrcLumberMill();
      case 'cottage': return this.createCottage();
      case 'pig_farm': return this.createPigFarm();
      case 'orc_house': return this.createOrcHouse();
      case 'orc_forge': return this.createOrcForge();
      case 'forge': return this.createHumanForge();
      case 'stable': return this.createStable();
      case 'ogre_den': return this.createOgreDen();
      case 'arcane_tower': return this.getOrCreateModel('arcane_tower', createArcaneTower);
      case 'ash_sanctum': return this.getOrCreateModel('ash_sanctum', createAshSanctum);
      case 'workshop': return this.createWorkshop();
      case 'orc_workshop': return this.createOrcWorkshop();
      case 'wall_human': return createWallSegment('human');
      case 'wall_orc': return createWallSegment('orc');
      case 'barracks': return this.createBarracks();
      case 'orc_barracks': return this.createOrcBarracks();
      case 'watchtower': return this.createWatchtower();
      case 'orc_watchtower': return this.createOrcWatchtower();
      case 'farm': return this.createFarm();
      case 'bandit_camp': return this.createBanditCamp();
      default: return this.createCottage();
    }
  }

  // --- Human Buildings ---
  static createCastle() {
    return this._glbOr('castle', () => this.getOrCreateModel('castle', createCastle));
  }

  static createLumberCamp() {
    return this.getOrCreateModel('lumber_camp', createLumberCamp);
  }

  static createGoldMine() {
    return this.getOrCreateModel('gold_mine', createGoldMine);
  }

  static createStoneQuarry() {
    return this.getOrCreateModel('stone_quarry', createStoneQuarry);
  }

  static createCottage() {
    return this.getOrCreateModel('cottage', createCottage);
  }

  static createBarracks() {
    return this.getOrCreateModel('barracks', createBarracks);
  }

  static createWatchtower() {
    return this.getOrCreateModel('watchtower', createWatchtower);
  }

  static createFarm() {
    return this.getOrCreateModel('farm', createFarm);
  }

  static createBanditCamp() {
    return this.getOrCreateModel('bandit_camp', createBanditCamp);
  }

  static createStable() {
    return this._glbOr('stable', () => this.getOrCreateModel('stable', createStable));
  }

  static createWorkshop() {
    return this.getOrCreateModel('workshop', createWorkshop);
  }

  static createOrcWorkshop() {
    return this.getOrCreateModel('orc_workshop', createOrcWorkshop);
  }

  static createOgreDen() {
    return this._glbOr('ogre_den', () => this.getOrCreateModel('ogre_den', createOgreDen));
  }

  static createHumanForge() {
    return this.getOrCreateModel('forge', createHumanForge);
  }

  // --- Orc Buildings ---
  static createGreatHall() {
    return this.getOrCreateModel('great_hall', createGreatHall);
  }

  static createOrcBarracks() {
    return this.getOrCreateModel('orc_barracks', createOrcBarracks);
  }

  static createPigFarm() {
    return this.getOrCreateModel('pig_farm', createPigFarm);
  }

  static createOrcLumberMill() {
    return this.getOrCreateModel('orc_lumber_mill', createOrcLumberMill);
  }

  static createOrcWatchtower() {
    return this.getOrCreateModel('orc_watchtower', createOrcWatchtower);
  }

  static createOrcHouse() {
    return this.getOrCreateModel('orc_house', createOrcHouse);
  }

  static createOrcForge() {
    return this.getOrCreateModel('orc_forge', createOrcForge);
  }

  // --- Environment & Props ---
  static createTree(type = 'oak') {
    return this.getOrCreateModel('tree_' + type, () => createTree(type));
  }

  static createArrow() {
    return this.getOrCreateModel('arrow', createArrow);
  }

  static createFlowerPatch(type) {
    return this.getOrCreateModel('flower_' + type, () => createFlowerPatch(type));
  }

  static createPebbles(count) {
    return createPebbles(count);
  }

  static createGrassTuft() {
    return this.getOrCreateModel('grass_tuft', createGrassTuft);
  }

  static createBerryBush(type = 'red') {
    return this.getOrCreateModel('bush_' + type, () => createBerryBush(type));
  }

  static createBoulder(size = 'large') {
    return this.getOrCreateModel('boulder_' + size, () => createBoulder(size));
  }

  static createMushroomStump() {
    return this.getOrCreateModel('mushroom_stump', createMushroomStump);
  }

  static createWaterLily() {
    return this.getOrCreateModel('water_lily', createWaterLily);
  }

  // --- Human Units ---
  static createKnight() {
    return this._glbOr('knight', () => this.getOrCreateModel('knight', createKnight, 'knight'));
  }

  /** F4-01/NEW-33: cavaleiro montado (.glb do Blender; fallback procedural: cavalo de caixas + tronco do Espadachim). */
  static createCavalier() {
    return this._glbOr('cavalier', () => this.getOrCreateModel('cavalier', createCavalier, 'cavalier'));
  }

  /** F4-02: balista (cerco humano, procedural). */
  static createBallista() {
    return this.getOrCreateModel('ballista', createBallista, 'ballista');
  }

  /** F4-02: catapulta (cerco orc, procedural). */
  static createCatapult() {
    return this.getOrCreateModel('catapult', createCatapult, 'catapult');
  }

  static createArcher() {
    return this._glbOr('archer', () => this.getOrCreateModel('archer', createArcher, 'archer'));
  }

  static createVillager() {
    return this._glbOr('villager', () => this.getOrCreateModel('villager', createVillager, 'villager'));
  }

  /** F3-10: critter decorativo (`sheep` | `pig`). */
  static createCritter(species = 'sheep') {
    return this.getOrCreateModel(`critter_${species}`, () => createCritter(species));
  }

  static createBandit() {
    return this._glbOr('bandit', () => this.getOrCreateModel('bandit', createBandit, 'bandit'));
  }

  // --- Orc Units ---
  static createPeon() {
    return this._glbOr('peon', () => this.getOrCreateModel('peon', createPeon, 'peon'));
  }

  static createGrunt() {
    return this._glbOr('grunt', () => this.getOrCreateModel('grunt', createGrunt, 'grunt'));
  }

  static createAxethrower() {
    return this._glbOr('axethrower', () => this.getOrCreateModel('axethrower', createAxethrower, 'axethrower'));
  }

  static createOgre() {
    return this._glbOr('ogre', () => this.getOrCreateModel('ogre', createOgre, 'ogre'));
  }

  /** F4-05: Sapadores de Pólvora (humano, procedural). */
  static createSapper() {
    return this.getOrCreateModel('sapper', createSapper, 'sapper');
  }

  /** F4-05: Incendiários (orc, procedural). */
  static createArsonist() {
    return this.getOrCreateModel('arsonist', createArsonist, 'arsonist');
  }

  static createUnit(type) {
    switch (type) {
      case 'villager': return this.createVillager();
      case 'knight': return this.createKnight();
      case 'archer': return this.createArcher();
      case 'bandit': return this.createBandit();
      case 'peon': return this.createPeon();
      case 'grunt': return this.createGrunt();
      case 'axethrower': return this.createAxethrower();
      case 'ogre': return this.createOgre();
      case 'cavalier': return this.createCavalier();
      case 'ballista': return this.createBallista();
      case 'catapult': return this.createCatapult();
      case 'mage': return this.getOrCreateModel('mage', createMage, 'mage');
      case 'necromancer': return this.getOrCreateModel('necromancer', createNecromancer, 'necromancer');
      case 'skeleton': return this.getOrCreateModel('skeleton', createSkeleton, 'skeleton');
      case 'sheep': return this.createCritter('sheep');
      case 'sapper': return this.createSapper();
      case 'arsonist': return this.createArsonist();
      default: return this.createVillager();
    }
  }
}
