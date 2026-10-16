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
import campos1v1 from './campos-1v1.json'; // F8-01: pacote de skirmish (1v1, 2v2, FFA, naval)
import desfiladeiro1v1 from './desfiladeiro-1v1.json';
import vales2v2 from './vales-2v2.json';
import bosques2v2 from './bosques-2v2.json';
import planaltoFfa4p from './planalto-ffa-4p.json';
import arquipelagoNaval4p from './arquipelago-naval-4p.json';
// MUNDO-7 (2026-10-16): mapas por tipo gerados pelo gerador de costa (`tools/gen-world-map.mjs`), sementes aprovadas
import duelo1 from './duelo-continental-1.json';
import duelo2 from './duelo-continental-2.json';
import duelo3 from './duelo-continental-3.json';
import ilhaUnica1 from './ilha-unica-1.json';
import ilhaUnica2 from './ilha-unica-2.json';
import ilhaUnica3 from './ilha-unica-3.json';
import dois1 from './dois-continentes-1.json';
import dois2 from './dois-continentes-2.json';
import dois3 from './dois-continentes-3.json';
import arq1 from './arquipelago-vivo-1.json';
import arq2 from './arquipelago-vivo-2.json';
import arq3 from './arquipelago-vivo-3.json';
import { generateMap } from './generator.js';

const MAPS = Object.freeze({
  'continental-1v1': continental1v1,
  'ilhas-4p': ilhas4p,
  'estreito-1v1': estreito1v1,
  'campos-1v1': campos1v1,
  'desfiladeiro-1v1': desfiladeiro1v1,
  'vales-2v2': vales2v2,
  'bosques-2v2': bosques2v2,
  'planalto-ffa-4p': planaltoFfa4p,
  'arquipelago-naval-4p': arquipelagoNaval4p,
  'duelo-continental-1': duelo1,
  'duelo-continental-2': duelo2,
  'duelo-continental-3': duelo3,
  'ilha-unica-1': ilhaUnica1,
  'ilha-unica-2': ilhaUnica2,
  'ilha-unica-3': ilhaUnica3,
  'dois-continentes-1': dois1,
  'dois-continentes-2': dois2,
  'dois-continentes-3': dois3,
  'arquipelago-vivo-1': arq1,
  'arquipelago-vivo-2': arq2,
  'arquipelago-vivo-3': arq3,
  tutorial // F6-09: mapa do tutorial (`hidden`: não aparece na lista da Escaramuça)
});

const GENERATED = new Map(); // F8-02: mapas gerados registrados em runtime

export const DEFAULT_MAP_ID = 'continental-1v1';

/** @returns {object|undefined} a definição do mapa (JSON), ou `undefined` se o id não existir. */
export function getMap(id) {
  return MAPS[id] ?? GENERATED.get(id);
}

/** @returns {object[]} mapas selecionáveis na Escaramuça (ordem estável; `hidden: true` — ex.: o do tutorial — fica de fora). */
export function listMaps({ includeHidden = false } = {}) {
  return [...Object.values(MAPS), ...GENERATED.values()].filter((m) => includeHidden || !m.hidden);
}

// ---------------------------------------------------------------------------------------------
// F8-02 · mapas gerados proceduralmente (registro opcional, em memória; não toca nos mapas estáticos)
// ---------------------------------------------------------------------------------------------
/** Registra um mapa (ex.: de `generateMap`) para `getMap(id)`/`validateMatchConfig`. Não sobrescreve mapas estáticos. */
export function registerMap(mapDef) {
  if (!mapDef || typeof mapDef.id !== 'string') throw new Error('registerMap: mapa sem id');
  if (MAPS[mapDef.id]) throw new Error(`registerMap: id "${mapDef.id}" já pertence a um mapa estático`);
  GENERATED.set(mapDef.id, mapDef);
  return mapDef;
}

/** Gera (determinístico) e registra um mapa; devolve a definição. Opções: ver `generateMap`. */
export function registerGeneratedMap(options) {
  return registerMap(generateMap(options));
}

export function unregisterMap(id) {
  return GENERATED.delete(id);
}
