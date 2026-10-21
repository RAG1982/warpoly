/**
 * src/data/biomeStyles.js (MUNDO-5 · MUNDO-TERRENO-MAPAS §3.1 e §3.3) — de BIOMA de célula (`biomeGrid`) para ESTILO visual.
 *
 * Puro dado + funções puras (sem three/DOM): a sim NÃO lê nada daqui. Quem lê: `biomeRegions.js` (mapa de regiões),
 * `Water`, `Decorations`, `TreeManager`, `TerrainView` e a pintura do splat (`splatPaint.js`).
 *
 * Um ESTILO é um objeto com o mesmo formato de um tileset (`src/data/tilesets.js`: `palette`, `rules`, `surface`, `water`, `decor`,
 * `trees`…), então todo o render regional reaproveita o que já existe por tileset. A coluna "tileset" da tabela do §3.1 vira
 * `BIOME_TO_STYLE`; as três linhas que pedem uma variante do tileset (estepe, floresta densa, gelo) viram variantes DERIVADAS
 * (`STYLE_VARIANTS`: paleta/regras sobrepostas ao tileset de origem). Os tilesets originais não são alterados.
 *
 * Bioma `null` = HERDA: mar (0) e areia (1) não têm estilo próprio; o mapa de regiões os preenche com o estilo da terra
 * vizinha (a praia de uma ilha vulcânica é areia escura; a de Velmara, areia clara) e, longe da terra, com o tileset base do mapa.
 */
import { TILESETS } from './tilesets.js';
import { BIOME } from './maps/biome.js';

/**
 * Deriva uma variante de tileset (paleta/regras/decoração sobrepostas). O resultado é um objeto novo (o tileset de origem não muda).
 * `id` = chave do estilo (`'deserto:estepe'`); `baseId` = tileset de origem.
 */
function derive(baseId, key, over) {
  const base = TILESETS[baseId];
  return Object.freeze({
    ...base,
    id: key,
    baseId,
    variant: true,
    name: over.name || base.name,
    palette: Object.freeze({ ...base.palette, ...(over.palette || {}) }),
    rules: Object.freeze({ ...base.rules, ...(over.rules || {}) }),
    surface: Object.freeze({ ...base.surface, ...(over.surface || {}) }),
    water: Object.freeze({ ...base.water, ...(over.water || {}) }),
    decor: Object.freeze({ ...base.decor, ...(over.decor || {}) }),
    trees: over.trees ? Object.freeze({ ...base.trees, ...over.trees }) : base.trees
  });
}

/** Variantes derivadas (não entram em `TILESETS`/`TILESET_IDS`, nem em `?tileset=`). */
export const STYLE_VARIANTS = Object.freeze({
  // Estepe (§3.1): palha seca e terra batida na borda do deserto; a regra `base: 'grass'` faz a palha dominar.
  'deserto:estepe': derive('deserto', 'deserto:estepe', {
    name: 'Estepe',
    palette: { grass: [0xb8a45a, 0x96873f], dirt: 0x8a6a40 },
    rules: { base: 'grass', patch: 'dirt', patchAmount: 0.30, crack: 0.05 },
    decor: { grass: 0xb8a45a, flowers: true, bushes: 0x9a8a44 }
  }),
  // Floresta densa (§3.1): grama escura sob a copa e folhedo no chão; cogumelos e tocos, poucas flores.
  'exuberante:floresta': derive('exuberante', 'exuberante:floresta', {
    name: 'Floresta densa',
    palette: { grass: [0x3f7e2e, 0x2f6a2c], dirt: 0x5a4a2c },
    rules: { patch: 'dirt', patchAmount: 0.34 },
    decor: { grass: 0x3f7e2e, flowers: false, mushrooms: true, bushes: 0x3a7a2a },
    trees: { tint: { color: 0x285a26, desat: 0.08, snow: null, snowAmount: 0 } }
  }),
  // Gelo (§3.1): o inverno com a base em gelo azulado (`sand` = gelo na costa) e neve em manchas.
  'inverno:gelo': derive('inverno', 'inverno:gelo', {
    name: 'Gelo',
    palette: { grass: [0xcfe7f3, 0xbcdef0], sand: 0xbcdef0, rock: 0x7b8798 },
    rules: { base: 'grass', patch: 'snow', high: 'rock', shore: 'sand', patchAmount: 0.38 },
    surface: { roughness: 0.30 },
    decor: { grass: 0xcfe7f3, pebbles: 0x9fb4c6 }
  })
});

/** Estilo (tileset ou variante) por chave; desconhecida = `undefined`. */
export function getStyleDef(key) {
  return STYLE_VARIANTS[key] || TILESETS[key];
}

/**
 * Bioma de célula → chave de estilo. `null` = herda (vizinhança / tileset base do mapa). Índice = id do bioma (`BIOME`).
 * Tabela do §3.1: Deserto→`deserto`; Estepe→`deserto` (regra `patch`); Pântano→`pantano`; Exuberante→`exuberante`;
 * Floresta densa→`exuberante` (camada `forest`); Savana→`savana`; Neve→`inverno`; Gelo→`inverno` (camada `ice`);
 * Rocha→`pedregoso`; Vulcânico e lava→`vulcanico` (a lava em si é o material emissivo de `world/Lava.js`).
 */
export const BIOME_TO_STYLE = Object.freeze([
  null, // 0 mar
  null, // 1 areia
  'exuberante', // 2 grama
  'savana', // 3 savana
  'deserto', // 4 deserto
  'deserto:estepe', // 5 estepe
  'pedregoso', // 6 rocha
  'vulcanico', // 7 vulcânico
  'vulcanico', // 8 lava (chão sob o fluxo: basalto)
  'inverno', // 9 neve
  'pantano', // 10 pântano
  'inverno:gelo', // 11 gelo
  'exuberante:floresta' // 12 floresta
]);

/** Chave do estilo do bioma (`null` = herda). Id fora do intervalo = herda. */
export function styleKeyOfBiome(biomeId) {
  const k = BIOME_TO_STYLE[biomeId];
  return k === undefined ? null : k;
}

/** O bioma tem estilo próprio (vota na região) ou só herda (mar e areia)? */
export function biomeHasStyle(biomeId) {
  return styleKeyOfBiome(biomeId) !== null;
}

/**
 * Tileset-base efetivo para o render regional: o `verdejante` (legado) pinta por outro caminho (sem splat), então num mapa regional
 * as células que herdam usam o `exuberante` (o mais próximo do visual legado). Os demais tilesets valem como são.
 */
export function regionalBaseDef(tilesetDef) {
  return tilesetDef && !tilesetDef.legacy ? tilesetDef : TILESETS.exuberante;
}

// ---------------------------------------------------------------------------------------------
// Decoração por bioma (Decorations): categorias, contagens-base e pesos por bioma da célula
// ---------------------------------------------------------------------------------------------

/**
 * Regras de colocação (render regional de `Decorations`). `weights`: bioma → peso (0 = nunca) com que a categoria aparece na
 * célula; `flag`: chave de `style.decor` que liga/desliga a categoria no estilo (como no tileset: flores/cogumelos/vitórias-régias);
 * `legacyCount`: instâncias da categoria no caminho antigo (o regional escala pela área do mapa); `minH`/`maxH`: faixa de altura.
 * `water: true` = categoria de água rasa (vitórias-régias): ignora `weights` e usa só a profundidade.
 */
export const DECOR_RULES = Object.freeze({
  grass: {
    legacyCount: 60, minH: 1.8, maxH: 99, flag: null,
    weights: { [BIOME.GRASS]: 1, [BIOME.FOREST]: 0.6, [BIOME.SAVANNA]: 1.3, [BIOME.STEPPE]: 1.3, [BIOME.DESERT]: 0.25, [BIOME.SWAMP]: 0.7, [BIOME.SNOW]: 0.2 }
  },
  pebbles: {
    legacyCount: 50, minH: 0.9, maxH: 3.4, flag: null,
    weights: { [BIOME.SAND]: 1, [BIOME.ROCK]: 1.2, [BIOME.DESERT]: 0.5, [BIOME.STEPPE]: 0.4, [BIOME.VOLCANIC]: 0.9, [BIOME.GRASS]: 0.25, [BIOME.SAVANNA]: 0.3, [BIOME.SNOW]: 0.4, [BIOME.ICE]: 0.3, [BIOME.SWAMP]: 0.2, [BIOME.FOREST]: 0.15 }
  },
  boulders: {
    legacyCount: 10, minH: 1.8, maxH: 99, flag: null,
    weights: { [BIOME.ROCK]: 1.6, [BIOME.VOLCANIC]: 0.9, [BIOME.DESERT]: 0.6, [BIOME.STEPPE]: 0.45, [BIOME.SAVANNA]: 0.45, [BIOME.GRASS]: 0.3, [BIOME.FOREST]: 0.3, [BIOME.SNOW]: 0.7, [BIOME.ICE]: 0.4, [BIOME.SWAMP]: 0.1 }
  },
  bushes: {
    legacyCount: 6, minH: 1.8, maxH: 99, flag: null,
    weights: { [BIOME.GRASS]: 1, [BIOME.FOREST]: 0.8, [BIOME.SAVANNA]: 0.5, [BIOME.STEPPE]: 0.5, [BIOME.SWAMP]: 0.4, [BIOME.DESERT]: 0.15 }
  },
  stumps: {
    legacyCount: 4, minH: 1.8, maxH: 99, flag: 'mushrooms',
    weights: { [BIOME.FOREST]: 1.4, [BIOME.GRASS]: 0.5, [BIOME.SWAMP]: 0.9, [BIOME.SAVANNA]: 0.1 }
  },
  flowers: {
    legacyCount: 13, minH: 1.8, maxH: 99, flag: 'flowers',
    weights: { [BIOME.GRASS]: 1, [BIOME.SAVANNA]: 0.5, [BIOME.STEPPE]: 0.5, [BIOME.FOREST]: 0.3 }
  },
  lilies: {
    legacyCount: 6, water: true, flag: 'lilies', minDepth: 0.08, maxDepth: 0.55,
    weights: {}
  }
});

/** Quantas instâncias de uma categoria de decoração num mapa regional de lado `size` (≥ contagem antiga; cresce com a área). */
export function decorCountFor(category, size) {
  const rule = DECOR_RULES[category];
  if (!rule) return 0;
  const k = Math.max(1, Math.min(3.5, (size / 140) * (size / 140)));
  return Math.max(rule.legacyCount, Math.round(rule.legacyCount * k));
}

// ---------------------------------------------------------------------------------------------
// Props .glb por bioma (M2-12/14/15/17 · ART-01/03/06/07/10): rochas, cactos, árvores mortas, gelo, troncos...
// ---------------------------------------------------------------------------------------------

/**
 * Regras de colocação dos props .glb (`planProps` em `decorPlan.js`; render em `Decorations`, um InstancedMesh por `glb`). Cada
 * prop é `lazy` em `glbModels.js`: só carrega se o mapa tem um bioma com peso > 0 (`propKeysOfMap`). `weights`: bioma → peso;
 * `legacyCount`: instâncias num mapa de 140 u (escala pela área como as demais decorações); `scale`: faixa de escala; `spacing`:
 * distância mínima (u) entre instâncias do MESMO prop; `water: true`: só em água rasa (`minDepth`..`maxDepth`, como as vitórias-régias);
 * `minH`/`maxH`: faixa de altura do terreno; `lift`: deslocamento vertical (m, negativo afunda no chão). Só visual: nada aqui entra na sim nem no checksum.
 */
export const PROP_RULES = Object.freeze({
  // M2-12 · deserto/estepe/savana
  rock_sandstone_a: {
    legacyCount: 5, minH: 1.8, maxH: 99, scale: [1.5, 2.5], spacing: 10,
    weights: { [BIOME.DESERT]: 1, [BIOME.STEPPE]: 0.35, [BIOME.SAVANNA]: 0.1 }
  },
  rock_sandstone_b: {
    legacyCount: 9, minH: 1.8, maxH: 99, scale: [1.2, 2.2], spacing: 6,
    weights: { [BIOME.DESERT]: 1, [BIOME.STEPPE]: 0.5, [BIOME.SAVANNA]: 0.2 }
  },
  tumbleweed: {
    legacyCount: 7, minH: 1.8, maxH: 99, scale: [1.2, 1.8], spacing: 5,
    weights: { [BIOME.DESERT]: 1, [BIOME.STEPPE]: 1, [BIOME.SAVANNA]: 0.3 }
  },
  // M2-14 · vulcânico
  rock_basalt_a: {
    legacyCount: 6, minH: 1.8, maxH: 99, scale: [1.2, 1.9], spacing: 9,
    weights: { [BIOME.VOLCANIC]: 1, [BIOME.ROCK]: 0.1 }
  },
  rock_basalt_b: {
    legacyCount: 8, minH: 1.8, maxH: 99, scale: [1.2, 1.9], spacing: 6,
    weights: { [BIOME.VOLCANIC]: 1, [BIOME.ROCK]: 0.2 }
  },
  volcano_cone: {
    legacyCount: 3, minH: 1.8, maxH: 99, scale: [1.4, 2.2], spacing: 14,
    weights: { [BIOME.VOLCANIC]: 1 }
  },
  tree_burnt: {
    legacyCount: 10, minH: 1.8, maxH: 99, scale: [1.0, 1.5], spacing: 6,
    weights: { [BIOME.VOLCANIC]: 1 }
  },
  fumarole: {
    legacyCount: 4, minH: 1.8, maxH: 99, scale: [1.2, 1.8], spacing: 10,
    weights: { [BIOME.VOLCANIC]: 1 }
  },
  obsidian: {
    legacyCount: 6, minH: 1.8, maxH: 99, scale: [1.2, 2.0], spacing: 7,
    weights: { [BIOME.VOLCANIC]: 1, [BIOME.ROCK]: 0.1 }
  },
  // M2-15 · neve e gelo
  ice_block_small: {
    legacyCount: 10, minH: 1.8, maxH: 99, scale: [1.2, 2.0], spacing: 5,
    weights: { [BIOME.ICE]: 1, [BIOME.SNOW]: 0.25 }
  },
  ice_block_large: {
    legacyCount: 4, minH: 1.8, maxH: 99, scale: [1.2, 1.8], spacing: 12,
    weights: { [BIOME.ICE]: 1, [BIOME.SNOW]: 0.12 }
  },
  tree_pine_snow: {
    legacyCount: 8, minH: 1.8, maxH: 99, scale: [0.9, 1.3], spacing: 6,
    weights: { [BIOME.SNOW]: 1, [BIOME.ICE]: 0.2, [BIOME.ROCK]: 0.1 }
  },
  rock_snow: {
    legacyCount: 9, minH: 1.8, maxH: 99, scale: [1.3, 2.2], spacing: 6,
    weights: { [BIOME.SNOW]: 1, [BIOME.ICE]: 0.4, [BIOME.ROCK]: 0.5 }
  },
  // M2-17 · sub-bosque (exuberante/floresta) e pântano; `lift` < 0 afunda o prop no chão (tronco e raiz na lama)
  fern: {
    legacyCount: 14, minH: 1.8, maxH: 99, scale: [1.4, 2.2], spacing: 3,
    weights: { [BIOME.FOREST]: 1, [BIOME.SWAMP]: 0.7, [BIOME.GRASS]: 0.5 }
  },
  log_fallen: {
    legacyCount: 6, minH: 1.8, maxH: 99, scale: [1.3, 1.9], spacing: 9,
    weights: { [BIOME.FOREST]: 1, [BIOME.SWAMP]: 0.4, [BIOME.GRASS]: 0.25 }
  },
  log_drowned: {
    legacyCount: 6, minH: 0.6, maxH: 1.8, lift: -0.1, scale: [1.0, 1.5], spacing: 9,
    weights: { [BIOME.SWAMP]: 1 }
  },
  mangrove_root: {
    legacyCount: 8, minH: 0.6, maxH: 1.6, lift: -0.1, scale: [1.2, 1.8], spacing: 7,
    weights: { [BIOME.SWAMP]: 1 }
  },
  // M2-16 · costa e praia (.glb pequenos; sem sombra projetada: 1 draw call cada). `shore`: só colado à água (sonda a N u);
  // `offshore`: naufragado em água rasa com terra à vista e mar aberto por perto (o bioma é o da terra vizinha); `slotClear`: folga das bases
  coast_shell: {
    legacyCount: 34, minH: 0.52, maxH: 0.95, shore: 3.2, shadow: false, scale: [0.85, 1.25], spacing: 0,
    weights: { [BIOME.SAND]: 1, [BIOME.SAVANNA]: 0.45, [BIOME.DESERT]: 0.5, [BIOME.STEPPE]: 0.4, [BIOME.GRASS]: 0.3, [BIOME.ROCK]: 0.12, [BIOME.VOLCANIC]: 0.1 }
  },
  coast_starfish: {
    legacyCount: 20, minH: 0.4, maxH: 0.66, shore: 2.2, lift: 0.02, shadow: false, scale: [0.85, 1.3], spacing: 0,
    weights: { [BIOME.SAND]: 1, [BIOME.GRASS]: 0.2, [BIOME.SAVANNA]: 0.3, [BIOME.DESERT]: 0.3, [BIOME.STEPPE]: 0.25, [BIOME.ROCK]: 0.2 }
  },
  coast_reed: {
    legacyCount: 34, minH: 0.2, maxH: 0.85, shore: 2.6, shadow: false, scale: [0.8, 1.25], spacing: 0,
    weights: { [BIOME.SWAMP]: 1.5, [BIOME.FOREST]: 0.55, [BIOME.GRASS]: 0.5, [BIOME.SAVANNA]: 0.25, [BIOME.STEPPE]: 0.15 }
  },
  coast_wreck: {
    legacyCount: 2, minH: 0.1, maxH: 0.42, offshore: true, lift: -0.12, slotClear: 16, shadow: false, scale: [0.95, 1.3], spacing: 38,
    weights: { [BIOME.SAND]: 1, [BIOME.GRASS]: 0.6, [BIOME.SAVANNA]: 0.8, [BIOME.DESERT]: 0.8, [BIOME.STEPPE]: 0.6, [BIOME.SWAMP]: 0.4, [BIOME.ROCK]: 0.5 }
  }
});

/** Quantas instâncias de um prop num mapa regional de lado `size` (mesma escala por área de `decorCountFor`). */
export function propCountFor(key, size) {
  const rule = PROP_RULES[key];
  if (!rule) return 0;
  const k = Math.max(1, Math.min(3.5, (size / 140) * (size / 140)));
  return Math.max(rule.legacyCount, Math.round(rule.legacyCount * k));
}
