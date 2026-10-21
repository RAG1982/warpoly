/**
 * src/data/critters.js (MUNDO-TERRENO-MAPAS.md §5, MUNDO-HISTORIA-CAMPANHA.md §1.4)
 *
 * Registro de espécies de animais neutros decorativos (critters) e correspondência por bioma.
 * Cada espécie mapeia os biomas em que habita por padrão e chaves i18n correspondentes.
 */

const sheepDef = Object.freeze({
  id: 'sheep',
  name: 'Ovelha',
  i18nKey: 'critter.sheep',
  biomes: Object.freeze(['lush', 'temperate', 'forest', 'grassland', 'exuberante', 'temperado', 'verdejante', 'grama', 'floresta']),
  description: 'Fauna dócil típica de campos verdejantes e zonas temperadas.'
});

const boarDef = Object.freeze({
  id: 'boar',
  alias: 'pig',
  name: 'Javali',
  i18nKey: 'critter.boar',
  biomes: Object.freeze(['desert', 'savanna', 'swamp', 'deserto', 'savana', 'pantano', 'estepe', 'steppe']),
  description: 'Fauna selvagem e rústica de terras áridas, savanas e brejos.'
});

/**
 * Tabela de espécies de critters registradas e seus biomas (MUNDO-TERRENO-MAPAS.md §5).
 * Mapeia `sheep` (exuberante/temperado) e `boar` (deserto/savana/pântano),
 * com `pig` registrado como alias funcional de `boar`.
 */
export const CRITTER_SPECIES = Object.freeze({
  sheep: sheepDef,
  boar: boarDef,
  pig: boarDef
});

/** Lista de espécies primárias ativas (sem duplicatas de alias). */
export const CRITTER_SPECIES_LIST = Object.freeze(['sheep', 'boar']);

/** Todas as chaves válidas aceitas em mapas, saves e validação (inclui 'pig'). */
export const VALID_CRITTER_SPECIES = Object.freeze(['sheep', 'boar', 'pig']);

/**
 * Normaliza o nome da espécie convertendo aliases legados (ex.: 'pig' -> 'boar').
 * @param {string} [species]
 * @returns {'sheep'|'boar'}
 */
export function normalizeCritterSpecies(species) {
  if (species === 'boar' || species === 'pig') return 'boar';
  return 'sheep';
}

/**
 * Retorna a espécie nativa mais adequada para o bioma ou tileset informado.
 * @param {string} biome Nome do bioma ou ID de tileset
 * @returns {'sheep'|'boar'}
 */
export function getCritterForBiome(biome) {
  if (!biome) return 'sheep';
  const b = String(biome).trim().toLowerCase();
  for (const [key, def] of Object.entries(CRITTER_SPECIES)) {
    if (key === 'pig') continue;
    if (def.biomes.some((bm) => bm.toLowerCase() === b)) {
      return def.id;
    }
  }
  return 'sheep';
}

/**
 * M2-13: chaves `GLB_MODELS` dos critters que o mapa usa (hoje só o javali `.glb`, que é `lazy`). Para `ensureGlbKeys` antes da
 * partida: mapa sem `neutrals` de javali/porco não baixa o `.glb`.
 * @param {{neutrals?: Array<{kind: string, species?: string}>}} mapDef
 * @returns {string[]}
 */
export function critterGlbKeysOfMap(mapDef) {
  const list = (mapDef && mapDef.neutrals) || [];
  const hasBoar = list.some((n) => n && n.kind === 'critters' && normalizeCritterSpecies(n.species) === 'boar');
  return hasBoar ? ['critter_boar'] : [];
}
