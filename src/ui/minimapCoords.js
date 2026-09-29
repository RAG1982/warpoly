/**
 * src/ui/minimapCoords.js (F2-05 · mapas orientados a dados)
 *
 * Conversão mundo ↔ minimapa, extraída de `UIManager.drawMinimap`/`initMinimapEvents` para ser
 * reutilizada também pelas miniaturas do menu de escaramuça (`MainMenu.js`) e por
 * `terrainMinimapImage.js`. Parametrizada por `mapSize` (`mapDef.size`) em vez do antigo `140`
 * fixo — sem three.js nem DOM, testável em Node.
 */

/** Coordenada de mundo (x, z) → pixel do minimapa (0..w, 0..h). */
export function worldToMinimap(x, z, mapSize, w, h) {
  return {
    x: (x / mapSize + 0.5) * w,
    y: (z / mapSize + 0.5) * h
  };
}

/** Pixel do minimapa (0..w, 0..h) → coordenada de mundo (x, z). */
export function minimapToWorld(px, py, mapSize, w, h) {
  return {
    x: (px / w - 0.5) * mapSize,
    z: (py / h - 0.5) * mapSize
  };
}
