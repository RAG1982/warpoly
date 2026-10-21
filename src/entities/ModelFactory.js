import * as THREE from 'three';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import {
  materials,
  enableShadows,
  createBanditCamp,
  createStable,
  createOgreDen,
  createBallista,
  createCatapult,
  createSapper,
  createMage,
  createNecromancer,
  createSkeleton,
  createArcaneTower,
  createAshSanctum,
  createTemple,
  createStormAltar,
  createWatchingEye,
  createGlider,
  createWarBalloon,
  createGryphonRider,
  createWarSerpent,
  createAviary,
  createSerpentNest,
  createArsonist,
  createTanker,
  createFrigate,
  createBarge,
  createDreadnought,
  createSubmersible,
  createFoundry,
  createNavalForge,
  createShipyard,
  createShipDock,
  createRefinery,
  createCauldron,
  createPlatform,
  createOilWell,
  createWorkshop,
  createOrcWorkshop,
  createCritter,
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

/** Tamanho (x, y, z) do bloco reserva por tipo de item (ver `ModelFactory._placeholder`). */
const PLACEHOLDER_SIZE_BY_KIND = { building: [4.5, 3, 4.5], unit: [0.8, 1.8, 0.8], tree: [1.6, 5, 1.6] };
const PLACEHOLDER_SIZES = {
  castle: [6.5, 4.5, 6.5], great_hall: [6.5, 4.5, 6.5], cavalier: [0.9, 2, 2.2], ogre: [1.2, 2.6, 1.2],
  gold_mine: [5, 3, 5], stone_quarry: [5, 3, 5]
};
const placeholderGeometries = new Map();
function placeholderGeometry(size) {
  const k = size.join('x');
  if (!placeholderGeometries.has(k)) placeholderGeometries.set(k, new THREE.BoxGeometry(size[0], size[1], size[2]));
  return placeholderGeometries.get(k);
}
const placeholderMaterials = {};
function placeholderMaterial(kind) {
  if (!placeholderMaterials[kind]) {
    placeholderMaterials[kind] = new THREE.MeshStandardMaterial({ color: kind === 'tree' ? 0x3f7d3a : kind === 'unit' ? 0x9a8f80 : 0xb8a88a, roughness: 0.9 });
  }
  return placeholderMaterials[kind];
}

export class ModelFactory {
  // Shared materials
  static materials = materials;

  // Pipeline Blender (F7-00): .glb só com ?glb=1 (lógica em glbModels.js)
  static glbEnabled = glbEnabled;
  static loadGlbModels(factions = null) { return loadGlbTemplates(factions); }
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

  /**
   * F7-00b: os modelos procedurais (e as texturas de canvas) dos itens migrados para o Blender foram removidos. Se o .glb
   * não carregou (rede) ou `?glb=0`, entra este bloco simples, sem texturas, para o jogo continuar jogável: unidades levam um
   * nó `Torso` (o `UnitAnimator` o acha pelo nome). Em modo headless (testes), grupo vazio como o `getOrCreateModel`.
   * @param {string} key chave do .glb (`GLB_MODELS`)
   * @param {'building'|'unit'|'tree'} [kind]
   */
  static _placeholder(key, kind = 'building') {
    const group = new THREE.Group();
    group.name = `Placeholder_${key}`;
    if (this.headless) return group;
    const size = PLACEHOLDER_SIZES[key] || PLACEHOLDER_SIZE_BY_KIND[kind];
    const mesh = new THREE.Mesh(placeholderGeometry(size), placeholderMaterial(kind));
    mesh.name = kind === 'unit' ? 'Torso' : 'Static_Mesh';
    mesh.position.y = size[1] / 2;
    group.add(mesh);
    return enableShadows(group);
  }

  /**
   * NEW-40: chave do modelo 3D de uma unidade. Classes avançadas (`modelOf`) usam o .glb próprio quando
   * ele está carregado (Templário, Ogro Feiticeiro); senão herdam o modelo da unidade base. O animador
   * continua usando `modelOf` (mesma rig).
   */
  static visualType(type, def) {
    if (def && def.modelOf && glbEnabled && glbTemplates.has(type)) return type;
    return (def && def.modelOf) || type;
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
    // F4-06: asas e hélice dos aéreos (batida/giro no `UnitAnimator`)
    ud.wingL = clone.getObjectByName('WingL') || ud.wingL;
    ud.wingR = clone.getObjectByName('WingR') || ud.wingR;
    ud.rotor = clone.getObjectByName('Rotor') || ud.rotor;

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

  /**
   * F4-07a: tipos neutros (mesmo `type` para as duas facções) com .glb por facção; `factionId` do dono escolhe a chave.
   * Sem .glb carregado (ou ?glb=0), cai no modelo procedural único.
   */
  static FACTION_GLB = {
    oil_platform: { orc: 'orc_oil_platform' }, tanker: { orc: 'orc_tanker' },
    frigate: { orc: 'orc_frigate' }, barge: { orc: 'orc_barge' }, dreadnought: { orc: 'orc_dreadnought' } // F4-07b
  };

  static _factionGlb(type, factionId) {
    const alt = this.FACTION_GLB[type] && this.FACTION_GLB[type][factionId];
    return (alt && glbEnabled && this.createGlbModel(alt)) || null;
  }

  /** F4-07b: navio com .glb por facção (`FACTION_GLB`) e fallback procedural (variante orc). */
  static _shipModel(type, factionId, fn) {
    const orc = factionId === 'orc';
    return this._factionGlb(type, factionId) || this._glbOr(type, () => this.getOrCreateModel(orc ? `${type}_orc` : type, () => fn(orc)));
  }

  static createBuildingByType(type, factionId = 'human') {
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
      case 'arcane_tower': return this._glbOr('arcane_tower', () => this.getOrCreateModel('arcane_tower', createArcaneTower));
      case 'ash_sanctum': return this._glbOr('ash_sanctum', () => this.getOrCreateModel('ash_sanctum', createAshSanctum));
      case 'temple': return this._glbOr('temple', () => this.getOrCreateModel('temple', createTemple));
      case 'storm_altar': return this._glbOr('storm_altar', () => this.getOrCreateModel('storm_altar', createStormAltar));
      case 'aviary': return this._glbOr('aviary', () => this.getOrCreateModel('aviary', createAviary)); // F4-06
      case 'serpent_nest': return this._glbOr('serpent_nest', () => this.getOrCreateModel('serpent_nest', createSerpentNest));
      // F4-07: naval/petróleo (procedurais provisórios; o .glb do Blender substitui via `_glbOr` com a mesma chave)
      case 'shipyard': return this._glbOr('shipyard', () => this.getOrCreateModel('shipyard', createShipyard));
      case 'ship_dock': return this._glbOr('ship_dock', () => this.getOrCreateModel('ship_dock', createShipDock));
      case 'refinery': return this._glbOr('refinery', () => this.getOrCreateModel('refinery', createRefinery));
      case 'ash_cauldron': return this._glbOr('ash_cauldron', () => this.getOrCreateModel('ash_cauldron', createCauldron));
      case 'oil_platform': return this._factionGlb('oil_platform', factionId) || this._glbOr('oil_platform', () => this.getOrCreateModel('oil_platform', createPlatform));
      case 'foundry': return this._glbOr('foundry', () => this.getOrCreateModel('foundry', createFoundry)); // F4-07b (sem .glb ainda)
      case 'naval_forge': return this._glbOr('naval_forge', () => this.getOrCreateModel('naval_forge', createNavalForge));
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
    return this._glbOr('castle', () => this._placeholder('castle'));
  }

  static createLumberCamp() {
    return this._glbOr('lumber_camp', () => this._placeholder('lumber_camp'));
  }

  static createGoldMine() {
    return this._glbOr('gold_mine', () => this._placeholder('gold_mine'));
  }

  static createStoneQuarry() {
    return this._glbOr('stone_quarry', () => this._placeholder('stone_quarry'));
  }

  static createCottage() {
    return this._glbOr('cottage', () => this._placeholder('cottage'));
  }

  static createBarracks() {
    return this._glbOr('barracks', () => this._placeholder('barracks'));
  }

  static createWatchtower() {
    return this._glbOr('watchtower', () => this._placeholder('watchtower'));
  }

  static createFarm() {
    return this._glbOr('farm', () => this._placeholder('farm'));
  }

  static createBanditCamp() {
    return this._glbOr('bandit_camp', () => this.getOrCreateModel('bandit_camp', createBanditCamp));
  }

  static createStable() {
    return this._glbOr('stable', () => this.getOrCreateModel('stable', createStable));
  }

  static createWorkshop() {
    return this._glbOr('workshop', () => this.getOrCreateModel('workshop', createWorkshop));
  }

  static createOrcWorkshop() {
    return this._glbOr('orc_workshop', () => this.getOrCreateModel('orc_workshop', createOrcWorkshop));
  }

  static createOgreDen() {
    return this._glbOr('ogre_den', () => this.getOrCreateModel('ogre_den', createOgreDen));
  }

  static createHumanForge() {
    return this._glbOr('forge', () => this._placeholder('forge'));
  }

  // --- Orc Buildings ---
  static createGreatHall() {
    return this._glbOr('great_hall', () => this._placeholder('great_hall'));
  }

  static createOrcBarracks() {
    return this._glbOr('orc_barracks', () => this._placeholder('orc_barracks'));
  }

  static createPigFarm() {
    return this._glbOr('pig_farm', () => this._placeholder('pig_farm'));
  }

  static createOrcLumberMill() {
    return this._glbOr('orc_lumber_mill', () => this._placeholder('orc_lumber_mill'));
  }

  static createOrcWatchtower() {
    return this._glbOr('orc_watchtower', () => this._placeholder('orc_watchtower'));
  }

  static createOrcHouse() {
    return this._glbOr('orc_house', () => this._placeholder('orc_house'));
  }

  static createOrcForge() {
    return this._glbOr('orc_forge', () => this._placeholder('orc_forge'));
  }

  // --- Environment & Props ---
  static createTree(type = 'oak') {
    return this._glbOr('tree_' + type, () => this._placeholder('tree_' + type, 'tree'));
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
    return this._glbOr('knight', () => this._placeholder('knight', 'unit'));
  }

  /** F4-01/NEW-33: cavaleiro montado (.glb do Blender; sem ele, o bloco reserva de `_placeholder`). */
  static createCavalier() {
    return this._glbOr('cavalier', () => this._placeholder('cavalier', 'unit'));
  }

  /** F4-02: balista (cerco humano, procedural). */
  static createBallista() {
    return this._glbOr('ballista', () => this.getOrCreateModel('ballista', createBallista, 'ballista'));
  }

  /** F4-02: catapulta (cerco orc, procedural). */
  static createCatapult() {
    return this._glbOr('catapult', () => this.getOrCreateModel('catapult', createCatapult, 'catapult'));
  }

  static createArcher() {
    return this._glbOr('archer', () => this._placeholder('archer', 'unit'));
  }

  static createVillager() {
    return this._glbOr('villager', () => this._placeholder('villager', 'unit'));
  }

  /** F3-10 / MUNDO-TERRENO-MAPAS §5: critter decorativo (`sheep` | `boar` | `pig`). */
  static createCritter(species = 'sheep') {
    const norm = species === 'pig' ? 'boar' : (species || 'sheep');
    return this.getOrCreateModel(`critter_${norm}`, () => createCritter(norm));
  }

  static createBandit() {
    return this._glbOr('bandit', () => this._placeholder('bandit', 'unit'));
  }

  // --- Orc Units ---
  static createPeon() {
    return this._glbOr('peon', () => this._placeholder('peon', 'unit'));
  }

  static createGrunt() {
    return this._glbOr('grunt', () => this._placeholder('grunt', 'unit'));
  }

  static createAxethrower() {
    return this._glbOr('axethrower', () => this._placeholder('axethrower', 'unit'));
  }

  static createOgre() {
    return this._glbOr('ogre', () => this._placeholder('ogre', 'unit'));
  }

  /** F4-05: Sapadores de Pólvora (humano; .glb do Blender, fallback procedural). */
  static createSapper() {
    return this._glbOr('sapper', () => this.getOrCreateModel('sapper', createSapper, 'sapper'));
  }

  /** F4-05: Incendiários (orc; .glb do Blender, fallback procedural). */
  static createArsonist() {
    return this._glbOr('arsonist', () => this.getOrCreateModel('arsonist', createArsonist, 'arsonist'));
  }

  /** F4-07a: poço de petróleo no mar (jazida `oil`). */
  static createOilWell() {
    return this._glbOr('oil_well', () => this.getOrCreateModel('oil_well', createOilWell));
  }

  static createUnit(type, factionId = 'human') {
    switch (type) {
      case 'villager': return this.createVillager();
      case 'knight': return this.createKnight();
      case 'hero_brann': return this._glbOr('hero_brann', () => this.createKnight()); // Capitão Brann: .glb próprio (Tripo); sem .glb, cavaleiro procedural
      case 'archer': return this.createArcher();
      case 'bandit': return this.createBandit();
      case 'peon': return this.createPeon();
      case 'grunt': return this.createGrunt();
      case 'hero_drogath': return this._glbOr('hero_drogath', () => this.createGrunt()); // Drogath Punho-de-Brasa: .glb próprio (Tripo); sem ele, o Talhador
      case 'axethrower': return this.createAxethrower();
      case 'ogre': return this.createOgre();
      case 'hero_skarn': return this._glbOr('hero_skarn', () => this.createOgre()); // Skarn: .glb próprio (Tripo + martelo); sem ele, o Ogro
      case 'cavalier': return this.createCavalier();
      case 'ballista': return this.createBallista();
      case 'catapult': return this.createCatapult();
      case 'mage': return this._glbOr('mage', () => this.getOrCreateModel('mage', createMage, 'mage'));
      case 'hero_oren': return this._glbOr('hero_oren', () => this._glbOr('mage', () => this.getOrCreateModel('mage', createMage, 'mage'))); // Mestre Arcano Oren: .glb próprio (Tripo); sem ele, o Mago
      case 'hero_vozgul': return this._glbOr('hero_vozgul', () => this._glbOr('necromancer', () => this.getOrCreateModel('necromancer', createNecromancer, 'necromancer'))); // Vozgul, a Profetisa: .glb próprio (Tripo); sem ele, o Necromante
      case 'necromancer': return this._glbOr('necromancer', () => this.getOrCreateModel('necromancer', createNecromancer, 'necromancer'));
      case 'sheep': return this.createCritter('sheep');
      case 'boar': return this.createCritter('boar');
      case 'pig': return this.createCritter('boar');
      case 'watching_eye': return this._glbOr('watching_eye', () => this.getOrCreateModel('watching_eye', createWatchingEye));
      // NEW-40: classes avançadas com .glb próprio (sem .glb, caem no modelo da unidade base)
      case 'templar': return this._glbOr('templar', () => this.createCavalier());
      case 'ogre_mage': return this._glbOr('ogre_mage', () => this.createOgre());
      // F4-06: aéreos (procedurais provisórios; Blender na F7)
      case 'glider': return this._glbOr('glider', () => this.getOrCreateModel('glider', createGlider, 'glider'));
      case 'war_balloon': return this._glbOr('war_balloon', () => this.getOrCreateModel('war_balloon', createWarBalloon, 'war_balloon'));
      case 'gryphon_rider': return this._glbOr('gryphon_rider', () => this.getOrCreateModel('gryphon_rider', createGryphonRider, 'gryphon_rider'));
      case 'war_serpent': return this._glbOr('war_serpent', () => this.getOrCreateModel('war_serpent', createWarSerpent, 'war_serpent'));
      // F4-07: naval (procedurais provisórios; .glb via `_glbOr` com a mesma chave)
      case 'tanker': return this._factionGlb('tanker', factionId) || this._glbOr('tanker', () => this.getOrCreateModel('tanker', createTanker));
      // F4-07b: navios de guerra (.glb por facção; procedural com `?glb=0`). O orc usa os tipos `war_galley/iron_leviathan/colossal_turtle` (`modelOf`).
      case 'frigate': return this._shipModel('frigate', factionId, createFrigate);
      case 'barge': return this._shipModel('barge', factionId, createBarge);
      case 'dreadnought': return this._shipModel('dreadnought', factionId, createDreadnought);
      case 'submersible': return this.getOrCreateModel(factionId === 'orc' ? 'submersible_orc' : 'submersible', () => createSubmersible(factionId === 'orc')); // sem .glb
      case 'sapper': return this.createSapper();
      case 'arsonist': return this.createArsonist();
      default: return this.createVillager();
    }
  }
}
