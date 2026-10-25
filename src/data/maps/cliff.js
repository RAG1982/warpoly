/**
 * src/data/maps/cliff.js (M3-04 · penhascos e cristas intransponíveis)
 *
 * Campo opcional do mapa: `"cliffHeight": 5` = todo ponto com altura >= `cliffHeight` é rochedo/penhasco INTRANSPONÍVEL para
 * unidades terrestres (e navais): bloqueia o `Pathfinder` e a colocação de construções, como a lava, mas sem grade própria:
 * a crista é só terreno alto (o relevo já é desenhado como rocha íngreme pelo `TerrainView`). Aéreas atravessam.
 * Mapa sem `cliffHeight` não muda em nada (todos os mapas antigos). Os desfiladeiros (passagens estreitas entre cristas) são
 * escritos pelo gerador de campanha (`tools/lib/cliffRidge.mjs`), onde a altura volta ao chão da planície.
 *
 * Puro e determinístico (só lê a altura assada).
 */
import { getHeightForMap } from '../../sim/terrainGenerators.js';

/** `true` se (x, z) é crista/penhasco intransponível segundo `mapDef.cliffHeight`. */
export function isCliffAt(mapDef, x, z) {
  const c = mapDef?.cliffHeight;
  if (typeof c !== 'number') return false;
  return getHeightForMap(mapDef, x, z) >= c;
}
