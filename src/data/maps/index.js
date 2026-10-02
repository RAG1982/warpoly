/**
 * src/data/maps/index.js (F2-05 · mapas orientados a dados)
 *
 * Registro estático dos mapas em `src/data/maps/<id>.json` — ver formato em README.md desta
 * pasta. Import estático (não fetch): funciona igual em Vite (jogo/inspetor) e em Node (Vitest,
 * headless), sem depender de DOM.
 */
import continental1v1 from './continental-1v1.json';
import ilhas4p from './ilhas-4p.json';
import estreito1v1 from './estreito-1v1.json'; // F4-07a: mapa com mar, canal e poços de petróleo
import tutorial from './tutorial.json';

const MAPS = Object.freeze({
  'continental-1v1': continental1v1,
  'ilhas-4p': ilhas4p,
  'estreito-1v1': estreito1v1,
  tutorial // F6-09: mapa do tutorial (`hidden`: não aparece na lista da Escaramuça)
});

export const DEFAULT_MAP_ID = 'continental-1v1';

/** @returns {object|undefined} a definição do mapa (JSON), ou `undefined` se o id não existir. */
export function getMap(id) {
  return MAPS[id];
}

/** @returns {object[]} mapas selecionáveis na Escaramuça (ordem estável; `hidden: true` — ex.: o do tutorial — fica de fora). */
export function listMaps({ includeHidden = false } = {}) {
  return Object.values(MAPS).filter((m) => includeHidden || !m.hidden);
}
