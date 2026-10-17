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
// M2-28: os mapas de campanha (`camp-*`, M2-03…07; `hidden: true`) NÃO são importados aqui: ficam em chunks carregados
// sob demanda (`campaignLoaders.js`, `ensureMapLoaded`), fora do bundle de boot.
import { CAMPAIGN_MAP_LOADERS } from './campaignLoaders.js';
// Navais (dois-continentes, arquipelago-vivo): em `pendentes/` até existir IA rival que ataque por mar (NEW-44). Fora do registro = fora do jogo e do boot.
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
  tutorial // F6-09: mapa do tutorial (`hidden`: não aparece na lista da Escaramuça)
});

const GENERATED = new Map(); // F8-02: mapas gerados registrados em runtime
const LAZY_LOADED = new Map(); // M2-28: mapas de campanha já carregados (id → definição)
const LAZY_PENDING = new Map(); // M2-28: carregamentos em andamento (id → Promise), para não importar duas vezes

export const DEFAULT_MAP_ID = 'continental-1v1';

const isLazyId = (id) => Object.prototype.hasOwnProperty.call(CAMPAIGN_MAP_LOADERS, id);

/**
 * @returns {object|undefined} a definição do mapa (JSON), ou `undefined` se o id não existir.
 * M2-28: um mapa de campanha ainda não carregado LANÇA (erro claro) — chame `await ensureMapLoaded(id)` antes
 * (o `main.js` já faz isso ao carregar a partida). Para só consultar sem lançar, use `peekMap`.
 */
export function getMap(id) {
  const m = MAPS[id] ?? GENERATED.get(id) ?? LAZY_LOADED.get(id);
  if (m === undefined && isLazyId(id)) {
    throw new Error(`getMap: o mapa "${id}" é carregado sob demanda e ainda não foi carregado; use "await ensureMapLoaded('${id}')" antes.`);
  }
  return m;
}

/** Como `getMap`, mas nunca lança: devolve `undefined` para um id desconhecido OU de mapa de campanha ainda não carregado. */
export function peekMap(id) {
  return MAPS[id] ?? GENERATED.get(id) ?? LAZY_LOADED.get(id);
}

/** `true` se o id existe no registro (inclusive mapa de campanha ainda não carregado). */
export function hasMap(id) {
  return peekMap(id) !== undefined || isLazyId(id);
}

/** `true` se `getMap(id)` já devolve a definição (mapas estáticos/gerados sempre; os de campanha só depois de carregados). */
export function isMapLoaded(id) {
  return peekMap(id) !== undefined;
}

/** `true` se o mapa é de carregamento sob demanda (campanha), esteja carregado ou não. */
export function isLazyMap(id) {
  return isLazyId(id);
}

/**
 * M2-28 · garante que o mapa `id` esteja carregado e devolve a definição. Mapas estáticos/gerados resolvem na hora;
 * os de campanha entram por `import()` dinâmico (um chunk por mapa) e passam a valer para `getMap`/`listMaps`.
 * Rejeita com erro claro se o id não existir.
 * @returns {Promise<object>}
 */
export function ensureMapLoaded(id) {
  const ready = peekMap(id);
  if (ready !== undefined) return Promise.resolve(ready);
  if (!isLazyId(id)) return Promise.reject(new Error(`ensureMapLoaded: mapa desconhecido "${id}"`));
  let p = LAZY_PENDING.get(id);
  if (!p) {
    p = CAMPAIGN_MAP_LOADERS[id]()
      .then((mod) => {
        const def = mod.default ?? mod;
        LAZY_LOADED.set(id, def);
        return def;
      })
      .finally(() => LAZY_PENDING.delete(id));
    LAZY_PENDING.set(id, p);
  }
  return p;
}

/** Sinônimo de `ensureMapLoaded` (nome da ficha M2-28). */
export const loadMap = ensureMapLoaded;

/** Carrega todos os mapas de campanha (testes, ferramentas Node e o editor); devolve as definições carregadas. */
export function loadAllCampaignMaps() {
  return Promise.all(Object.keys(CAMPAIGN_MAP_LOADERS).map((id) => ensureMapLoaded(id)));
}

/**
 * @returns {object[]} mapas selecionáveis na Escaramuça (ordem estável; `hidden: true` — ex.: o do tutorial — fica de fora).
 * Só inclui mapas de campanha que JÁ foram carregados (e eles são `hidden`); para listar todos os ids use `listMapIds`.
 */
export function listMaps({ includeHidden = false } = {}) {
  return [...Object.values(MAPS), ...GENERATED.values(), ...LAZY_LOADED.values()].filter((m) => includeHidden || !m.hidden);
}

/** @returns {string[]} ids dos mapas registrados; com `includeHidden`, inclui os de campanha ainda não carregados. */
export function listMapIds({ includeHidden = false } = {}) {
  const loaded = listMaps({ includeHidden }).map((m) => m.id);
  return includeHidden ? [...new Set([...loaded, ...Object.keys(CAMPAIGN_MAP_LOADERS)])] : loaded;
}

// ---------------------------------------------------------------------------------------------
// F8-02 · mapas gerados proceduralmente (registro opcional, em memória; não toca nos mapas estáticos)
// ---------------------------------------------------------------------------------------------
/** Registra um mapa (ex.: de `generateMap`) para `getMap(id)`/`validateMatchConfig`. Não sobrescreve mapas estáticos. */
export function registerMap(mapDef) {
  if (!mapDef || typeof mapDef.id !== 'string') throw new Error('registerMap: mapa sem id');
  if (MAPS[mapDef.id] || isLazyId(mapDef.id)) throw new Error(`registerMap: id "${mapDef.id}" já pertence a um mapa estático`);
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
