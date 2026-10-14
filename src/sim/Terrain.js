import { getMap, DEFAULT_MAP_ID } from '../data/maps/index.js';
import { getHeightForMap } from './terrainGenerators.js';
import { isLavaAt } from '../data/maps/lava.js';

/**
 * Terreno orientado a dados (F2-05): tamanho, segmentos, altura, vaus e slots vêm de `mapDef`
 * (ver `src/data/maps/README.md`) em vez de constantes fixas. `getHeight` delega para o gerador
 * registrado em `terrainGenerators.js` (`mapDef.terrain.generator`).
 *
 * F2-08c: parte de simulação do terreno (só dados/altura); a malha, a textura e os pontos de referência para a
 * textura procedural vivem em `src/render/TerrainView.js`.
 */
export class Terrain {
  /** @param {object} [mapDef]  definição do mapa (`src/data/maps`); padrão: mapa continental */
  constructor(mapDef = getMap(DEFAULT_MAP_ID)) {
    this.mapDef = mapDef;
    this.width = mapDef.size;
    this.depth = mapDef.size;
    this.segments = Math.round(mapDef.size * 0.8);
    /** Injetado pela `GameManager` (navegação). */
    this.pathfinder = null;
  }

  /**
   * Altura do terreno em (x, z), delegada ao gerador do mapa (`terrainGenerators.js`).
   */
  getHeight(x, z) {
    return getHeightForMap(this.mapDef, x, z);
  }

  isLava(x, z) {
    return isLavaAt(this.mapDef, x, z);
  }

  getSurfaceType(x, z, h) {
    if (this.isLava(x, z)) return 'lava';
    if (h < 0.2) return 'water';
    if (h < 1.4) return 'sand';
    return 'grass';
  }

  isWater(x, z) {
    if (this.isLava(x, z)) return false;
    return this.getHeight(x, z) < 0.65;
  }

  isWalkable(x, z) {
    if (this.isLava(x, z)) return false;
    return this.getHeight(x, z) >= 0.65;
  }
}
