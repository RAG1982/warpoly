// Materials & Utility
export { materials, enableShadows } from './materials.js';

// Units
export { createKnight } from './units/KnightModel.js';
export { createArcher } from './units/ArcherModel.js';
export { createVillager } from './units/VillagerModel.js';
export {
  getVillagerFaceTextures,
  getVillagerCapTextures,
  getVillagerTunicApronTextures,
  getVillagerArmsGlovesTextures,
  getVillagerPantsBootsTextures,
  getVillagerAxeTextures,
  getVillagerPickaxeTextures,
  getVillagerHammerTextures,
  getVillagerBackpackTextures,
  getVillagerWoodBundleTextures,
  getVillagerGoldSackTextures
} from './units/villagerTextures.js';
export { createBandit } from './units/BanditModel.js';
export { createPeon } from './units/PeonModel.js';
export { createGrunt } from './units/GruntModel.js';
export { createAxethrower } from './units/AxethrowerModel.js';
export { createOgre } from './units/OgreModel.js';
export { getPeonFaceTextures, getPeonTunicHarnessTextures, getPeonPantsBootsTextures, getPeonToolTextures } from './units/peonTextures.js';
export { getGruntFaceTextures, getGruntArmorTextures, getGruntAxeTextures } from './units/gruntTextures.js';
export { getAxethrowerFaceTextures, getAxethrowerHarnessTextures, getAxethrowerAxeTextures } from './units/axethrowerTextures.js';
export { getOgreFaceTextures, getOgreClubTextures } from './units/ogreTextures.js';

// Buildings
export { createCastle } from './buildings/CastleModel.js';
export { createLumberCamp } from './buildings/LumberCampModel.js';
export { createGoldMine } from './buildings/GoldMineModel.js';
export { createStoneQuarry } from './buildings/StoneQuarryModel.js';
export { createCottage } from './buildings/CottageModel.js';
export { createBarracks } from './buildings/BarracksModel.js';
export {
  getBarracksMaterials,
  getBarracksStoneTimberTextures,
  getBarracksRoofTextures,
  getBarracksDoorWindowTextures,
  getBarracksPropsTextures
} from './buildings/barracksTextures.js';
export { createWatchtower } from './buildings/WatchtowerModel.js';
export { createFarm } from './buildings/FarmModel.js';
export { createBanditCamp } from './buildings/BanditCampModel.js';
export { createGreatHall } from './buildings/GreatHallModel.js';
export { createOrcBarracks } from './buildings/OrcBarracksModel.js';
export { createPigFarm } from './buildings/PigFarmModel.js';
export { createOrcLumberMill } from './buildings/OrcLumberMillModel.js';
export { createOrcWatchtower } from './buildings/OrcWatchtowerModel.js';
export { createOrcHouse } from './buildings/OrcHouseModel.js';
export { createOrcForge } from './buildings/OrcForgeModel.js';
export { createHumanForge } from './buildings/HumanForgeModel.js';
export {
  getOrcDarkLogBarkTextures,
  getOrcLogEndTextures,
  getOrcSplitRoofTextures,
  getOrcAnimalFurTextures,
  getOrcSpikedIronTextures,
  getOrcBoneTuskTextures,
  getOrcHordeBannerTextures,
  getOrcGlowingWindowTextures,
  getOrcBasaltStoneTextures,
  getOrcBlazingFireTextures,
  getOrcMudWaterTextures,
  getOrcPigSkinTextures
} from './buildings/orcTextures.js';


// Environment & Props
export { createTree } from './environment/TreeModel.js';
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

