/**
 * src/data/maps/index.js (F2-05 · mapas orientados a dados)
 *
 * Registro estático dos mapas em `src/data/maps/<id>.json` — ver formato em README.md desta
 * pasta. Import estático (não fetch): funciona igual em Vite (jogo/inspetor) e em Node (Vitest,
 * headless), sem depender de DOM.
 */
import continental1v1 from './continental-1v1.json';
import ilhas4p from './ilhas-4p.json';

const MAPS = Object.freeze({
  'continental-1v1': continental1v1,
  'ilhas-4p': ilhas4p
});

export const DEFAULT_MAP_ID = 'continental-1v1';

/** @returns {object|undefined} a definição do mapa (JSON), ou `undefined` se o id não existir. */
export function getMap(id) {
  return MAPS[id];
}

/** @returns {object[]} todas as definições de mapa registradas (ordem estável). */
export function listMaps() {
  return Object.values(MAPS);
}
