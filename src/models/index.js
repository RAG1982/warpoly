// Materials & Utility
export { materials, enableShadows } from './materials.js';

// F7-00b: os modelos procedurais (e as texturas de canvas) dos itens 100% migrados para o Blender foram removidos:
// Espadachim, Cavaleiro, Arqueiro, Camponês, Bandido, Lacaio, Grunt, Arremessador de Machados, Ogro; Castelo, Serraria,
// Casa, Quartel, Torre de Vigia, Fazenda e Forja humanos; Grande Salão, Quartel, Chiqueiro, Serraria, Torre, Toca e Forja
// orcs; Mina de Ouro, Pedreira e as 4 árvores. Só existem como .glb (`public/models/`, `src/entities/glbModels.js`); sem o
// arquivo, `ModelFactory._placeholder` entrega um bloco simples. Ficam os procedurais abaixo (ver docs/TASKS.md, F7-00b).

// Units
export { createCritter } from './units/CritterModel.js';
export { createBallista } from './units/BallistaModel.js';
export { createCatapult } from './units/CatapultModel.js';
export { createMage } from './units/MageModel.js';
export { createNecromancer } from './units/NecromancerModel.js';
export { createSkeleton } from './units/SkeletonModel.js';
export { createArcaneTower } from './buildings/ArcaneTowerModel.js';
export { createAshSanctum } from './buildings/AshSanctumModel.js';
export { createTemple } from './buildings/TempleModel.js';
export { createStormAltar } from './buildings/StormAltarModel.js';
export { createWatchingEye } from './units/WatchingEyeModel.js';
export { createGlider } from './units/GliderModel.js';
export { createWarBalloon } from './units/BalloonModel.js';
export { createGryphonRider } from './units/GryphonRiderModel.js';
export { createWarSerpent } from './units/WarSerpentModel.js';
export { createAviary } from './buildings/AviaryModel.js';
export { createSerpentNest } from './buildings/SerpentNestModel.js';
export { createSapper } from './units/SapperModel.js';
export { createArsonist } from './units/ArsonistModel.js';
// F4-07: naval/petróleo (procedurais provisórios)
export { createTanker } from './units/TankerModel.js';
export { createFrigate, createBarge, createDreadnought, createSubmersible } from './units/ShipModels.js'; // F4-07b
export { createFoundry } from './buildings/FoundryModel.js';
export { createNavalForge } from './buildings/NavalForgeModel.js';
export { createShipyard } from './buildings/ShipyardModel.js';
export { createShipDock } from './buildings/ShipDockModel.js';
export { createRefinery } from './buildings/RefineryModel.js';
export { createCauldron } from './buildings/CauldronModel.js';
export { createPlatform } from './buildings/PlatformModel.js';
export { createOilWell } from './environment/OilWellModel.js';
// Machado de arremesso (projétil, `ProjectileViews`): o único getter que sobrou de `axethrowerTextures.js`
export { getAxethrowerAxeTextures } from './units/axethrowerTextures.js';

// Buildings
export { createBanditCamp } from './buildings/BanditCampModel.js'; // Acampamento em revisão (arte A): mantém o procedural
export { createStable } from './buildings/StableModel.js';
export { createOgreDen } from './buildings/OgreDenModel.js';
export { createWorkshop } from './buildings/WorkshopModel.js';
export { createOrcWorkshop } from './buildings/OrcWorkshopModel.js';

// Environment & Props
export {
  createFlowerPatch,
  createPebbles,
  createPebble,
  createGrassTuft,
  createBerryBush,
  createBoulder,
  createMushroomStump,
  createWaterLily
} from './environment/DecorationModels.js';
export { createArrow } from './environment/ArrowModel.js';
export {
  getGraniteBoulderTextures,
  getRiverPebbleTextures,
  clearRockTextureCache
} from './environment/rockTextures.js';
export {
  getFlowerTextures,
  getFlowerCenterTextures,
  getBerryBushTextures,
  getBerryTextures,
  getGrassBladeTextures,
  getMushroomTextures,
  getMushroomStemTextures,
  getMushroomGillsTextures,
  getStumpBarkTextures,
  getStumpTopTextures,
  getStumpTextures,
  getWaterLilyTextures,
  getLotusTextures,
  clearFloraTextureCache
} from './environment/floraTextures.js';
