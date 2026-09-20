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

