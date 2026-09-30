/**
 * requirements.js — F3-04: requisitos de construção (`BUILDINGS[type].requires`, ver
 * `src/data/buildings.js`). Módulo puro (sem three.js), testável em Node.
 *
 * `gm` só precisa expor `buildings` (array de instâncias com `ownerId`, `type`,
 * `isConstructed`, `isDead`) — o mesmo objeto que `GameManager.placeBuilding` já tem.
 */
import { getBuildingDef } from '../data/index.js';

/**
 * Requisitos de `buildingType` ainda não satisfeitos por `playerId` (construção do tipo
 * exigido precisa existir, pertencer ao jogador e estar **concluída**).
 * @param {number} playerId
 * @param {string} buildingType
 * @param {{buildings: Array}} gm
 * @returns {string[]}  tipos de construção faltando ([] = pode construir)
 */
export function missingRequirements(playerId, buildingType, gm) {
  const requires = getBuildingDef(buildingType).requires || [];
  if (requires.length === 0) return [];
  const buildings = (gm && gm.buildings) || [];
  return requires.filter(reqType => !buildings.some(b =>
    b.ownerId === playerId && b.type === reqType && b.isConstructed && !b.isDead
  ));
}
