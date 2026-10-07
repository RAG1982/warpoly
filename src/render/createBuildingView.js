/**
 * createBuildingView.js — F2-08c: escolhe a view (subclasse de `BuildingView`) de uma construção de simulação.
 * Usado pela `EntityViews` (partida) e pelo inspetor.
 */
import { BuildingView } from './BuildingView.js';
import { WallView } from './WallView.js';
import { GreatHall, OrcBarracks, PigFarm, OrcHouse, OrcWatchtower, OrcLumberMill, OrcForge } from './buildings/orc/index.js';
import { NavalBuildingView } from './buildings/NavalBuildingView.js';
import { HumanForge } from './buildings/HumanForge.js';

const VIEW_BY_TYPE = {
  great_hall: GreatHall,
  orc_barracks: OrcBarracks,
  pig_farm: PigFarm,
  orc_house: OrcHouse,
  orc_watchtower: OrcWatchtower,
  orc_lumber_mill: OrcLumberMill,
  orc_forge: OrcForge,
  forge: HumanForge,
  shipyard: NavalBuildingView, // F4-07a
  ship_dock: NavalBuildingView,
  foundry: NavalBuildingView, // F4-07b
  naval_forge: NavalBuildingView,
  oil_platform: NavalBuildingView
};

/**
 * @param {import('../sim/Building.js').Building} building
 * @param {import('three').Scene|null} scene
 * @param {(faction: string) => object} [getWallBatch]  fábrica do `WallBatch` por facção (só para muralhas)
 */
export function createBuildingView(building, scene, getWallBatch = null) {
  if (building.role === 'wall') {
    const batch = getWallBatch ? getWallBatch(building.type === 'wall_orc' ? 'orc' : 'human') : null;
    return new WallView(building, scene, batch);
  }
  const Cls = VIEW_BY_TYPE[building.type] || BuildingView;
  return new Cls(building, scene);
}
