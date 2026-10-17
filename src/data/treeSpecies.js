/**
 * src/data/treeSpecies.js (M2-10 · ART-02) — espécies de árvore dos mapas (`forests[].species`), puro (sem three/DOM).
 *
 * Fonte única de: ids válidos (validador, editor), modelo `.glb` de cada espécie, quais são `lazy` (carregam só quando o mapa as usa),
 * a mistura de companhia dos bosques (os 35 % de variedade do `spawnWoodlands`) e a escolha de espécie por bioma (`speciesForBiome`).
 * A espécie é só visual: a simulação só guarda `treeType`; nada aqui mexe em `rngMap` (cada escolha consome o mesmo nº de sorteios).
 */

/** Ids de célula de bioma (iguais a `BIOME` de `maps/biome.js`; repetidos para este módulo não depender dele). */
const B = Object.freeze({ SAND: 1, GRASS: 2, SAVANNA: 3, DESERT: 4, STEPPE: 5, ROCK: 6, SNOW: 9, SWAMP: 10, ICE: 11 });

/** id → { key do GLB_MODELS, lazy (fora do boot; carregada sob demanda quando o mapa usa a espécie) }. */
export const TREE_SPECIES = Object.freeze({
  oak: Object.freeze({ key: 'tree_oak', lazy: false }),
  pine: Object.freeze({ key: 'tree_pine', lazy: false }),
  autumn: Object.freeze({ key: 'tree_autumn', lazy: false }),
  birch: Object.freeze({ key: 'tree_birch', lazy: false }),
  broad: Object.freeze({ key: 'tree_broad', lazy: true }), // copa larga: bosques exuberantes
  palm: Object.freeze({ key: 'tree_palm', lazy: true }), // palmeira: costa e deserto (copa ~1,6 u ao lado do pé)
  acacia: Object.freeze({ key: 'tree_acacia', lazy: true }) // acácia: savana
});

/** Espécies válidas em `forests[].species` (mesma ordem do objeto acima). */
export const FOREST_SPECIES = Object.freeze(Object.keys(TREE_SPECIES));

/**
 * Copa fora do pé (hit-proxy de seleção): só a palmeira, cujo tronco inclina e deixa a copa ~1,6 u ao lado do pé (+x do modelo, medido no
 * `.glb`). `dx`/`y`/`r`/`h`: deslocamento em x, altura do centro, raio e altura do cilindro extra, em unidades do modelo (× escala da árvore).
 * A colisão da simulação continua no pé (`collisionRadius`): é o tronco que bloqueia, a copa fica no alto.
 */
export const TREE_CROWN_PROXY = Object.freeze({
  palm: Object.freeze({ dx: 1.6, y: 6.2, r: 2.3, h: 2.6 })
});

/** Chave do `GLB_MODELS` de uma espécie; tipo desconhecido cai no carvalho (comportamento histórico do `registerTree`). */
export function treeKeyOf(type) {
  return (TREE_SPECIES[type] || TREE_SPECIES.oak).key;
}

/**
 * Mistura de variedade de um bosque (os 35 % que não são a espécie preferida). Só as espécies novas têm lista própria: as antigas
 * seguem sorteando de `['oak','pine','autumn']` (mesma lista de antes ⇒ mesmo mapa). O tamanho das listas é irrelevante para o
 * determinismo: `rngMap.pick` consome sempre UM sorteio.
 */
export const DEFAULT_TREE_MIX = Object.freeze(['oak', 'pine', 'autumn']);
export const TREE_MIX = Object.freeze({
  broad: Object.freeze(['oak', 'birch', 'broad']),
  palm: Object.freeze(['palm', 'acacia', 'autumn']),
  acacia: Object.freeze(['acacia', 'autumn', 'oak'])
});
export function treeMixFor(species) {
  return TREE_MIX[species] || DEFAULT_TREE_MIX;
}

/**
 * Espécie de um bosque pelo bioma da célula. `roll` ∈ [0,1) é UM sorteio do chamador (quem chama consome exatamente um, sempre).
 * @param {number} biome    id de célula (`BIOME`)
 * @param {boolean} coastal  água a poucas unidades (costa/atol)
 * @param {number} roll
 */
export function speciesForBiome(biome, coastal, roll) {
  const pick = (arr) => arr[Math.min(arr.length - 1, Math.floor(roll * arr.length))];
  if (biome === B.SAND) return pick(['palm', 'palm', 'autumn']);
  if (biome === B.DESERT) return coastal ? pick(['palm', 'palm', 'autumn']) : pick(['autumn', 'palm', 'autumn']);
  if (biome === B.SAVANNA) return coastal ? pick(['acacia', 'palm', 'acacia']) : pick(['acacia', 'acacia', 'autumn']);
  if (biome === B.STEPPE) return pick(['autumn', 'oak', 'acacia']);
  if (biome === B.SNOW || biome === B.ICE || biome === B.ROCK) return pick(['pine', 'pine', 'autumn']);
  if (biome === B.SWAMP) return pick(['oak', 'autumn']);
  return coastal ? pick(['oak', 'palm', 'birch', 'broad']) : pick(['oak', 'broad', 'birch', 'pine']);
}

/** Chaves de `GLB_MODELS` das espécies LAZY usadas por uma lista de espécies (sem repetição). */
export function lazyTreeKeys(speciesList) {
  const out = new Set();
  for (const s of speciesList || []) {
    const sp = TREE_SPECIES[s];
    if (sp && sp.lazy) out.add(sp.key);
  }
  return [...out];
}

/** Chaves lazy das árvores de um mapa (`forests[].species`). */
export function lazyTreeKeysOfMap(mapDef) {
  return lazyTreeKeys(((mapDef && mapDef.forests) || []).map((f) => f.species));
}
