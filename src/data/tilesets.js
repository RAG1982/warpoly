/**
 * src/data/tilesets.js (F7-04) — tilesets de terreno estilo WC2. Puro dado + funções puras (sem three/DOM):
 * a sim NÃO lê nada daqui; só `TerrainView`, `Water`, `Decorations`, `TreeManager`, `SceneManager` e a prévia.
 *
 * Seleção: campo `tileset` do JSON do mapa (`src/data/maps/README.md`). Ids: `verdejante` (Floresta, o look original),
 * `inverno`, `devastadas` (Terras Devastadas), `pantano`. `ilhas` (valor legado dos mapas navais) é alias de `verdejante`.
 * Mapas gerados (`generateMap({ theme })`) usam o mesmo id em `theme`.
 *
 * `legacy: true` (só o verdejante) mantém exatamente o caminho de pintura anterior à F7-04 (textura, cores de vértice,
 * água e atmosfera idênticas); os demais usam o splat map (`src/models/environment/tilesetTextures.js`).
 */

export const DEFAULT_TILESET = 'verdejante';
export const TILESET_ALIASES = Object.freeze({ ilhas: 'verdejante', floresta: 'verdejante', winter: 'inverno', wasteland: 'devastadas', swamp: 'pantano' });

/** Cores como 0xRRGGBB. `palette.*` com 2 tons = [claro, escuro] (mistura por ruído). */
export const TILESETS = Object.freeze({
  verdejante: {
    id: 'verdejante',
    name: 'Floresta',
    legacy: true,
    palette: { grass: [0x78d458, 0x66873c], dirt: 0x855533, sand: 0xe4ce95, rock: 0x8a8f6a, snow: 0xf2f6fa, mud: 0x5a4a30, road: 0xa98757 },
    water: { color: 0x3cb0d8, opacity: 0.86, deep: 0x09233f, foam: 0xffffff, foamStrength: 0.7, plants: true },
    atmosphere: { sky: 0x85c8ec, fogNear: 95, fogFar: 320, hemiSky: 0xcde6ff, hemiGround: 0x567848 },
    decor: { grass: 0xffffff, flowers: true, pebbles: 0xffffff, boulders: 0xffffff, mushrooms: true, lilies: true, bushes: 0xffffff },
    trees: { tint: null }
  },

  inverno: {
    id: 'inverno',
    name: 'Inverno',
    legacy: false,
    // Neve cobre a planície; terra congelada em manchas, gelo/rocha azulada nas encostas, areia = gelo na costa.
    palette: { grass: [0xf0f6fb, 0xd5e4f1], dirt: 0x8a8272, sand: 0xbfd8e6, rock: 0x7b8798, snow: 0xffffff, mud: 0x6d675c, road: 0xa89d8a },
    rules: { base: 'grass', patch: 'dirt', high: 'rock', shore: 'sand', patchAmount: 0.30, shoreTop: 1.5, highStart: 4.2, rockSlope: [0.55, 1.05], crack: 0 },
    surface: { roughness: 0.62, cliff: 0x6a7684, strata: 0.10 },
    water: { color: 0x7fb7d6, opacity: 0.94, deep: 0x1c3a52, foam: 0xf4fbff, foamStrength: 0.85, plants: false },
    atmosphere: { sky: 0xc9dbe8, fogNear: 80, fogFar: 270, hemiSky: 0xdbe9ff, hemiGround: 0x8497ad },
    decor: { grass: 0xdfe9f2, flowers: false, pebbles: 0xaab6c4, boulders: 0xb9c6d4, mushrooms: false, lilies: false, bushes: 0xcfdcea },
    trees: { tint: { color: 0xffffff, desat: 0.35, snow: 0xf4f8ff, snowAmount: 0.85 } }
  },

  devastadas: {
    id: 'devastadas',
    name: 'Terras Devastadas',
    legacy: false,
    // Terra seca avermelhada e rachada, rocha escura, cinzas; sem verde.
    palette: { grass: [0x9a7a4e, 0x7e6240], dirt: 0x6b4a32, sand: 0xc2a06a, rock: 0x4d4440, snow: 0xcfc8bc, mud: 0x4a3a2e, road: 0xb39766 },
    rules: { base: 'grass', patch: 'dirt', high: 'rock', shore: 'sand', patchAmount: 0.42, shoreTop: 1.4, highStart: 3.8, rockSlope: [0.5, 0.95], crack: 0.55 },
    surface: { roughness: 0.93, cliff: 0x5a4a40, strata: 0.16 },
    water: { color: 0x5f8f86, opacity: 0.9, deep: 0x13262a, foam: 0xe9e4d2, foamStrength: 0.6, plants: false },
    atmosphere: { sky: 0xb69b7e, fogNear: 70, fogFar: 250, hemiSky: 0xf0cfa5, hemiGround: 0x6a4a35 },
    decor: { grass: 0xa8885a, flowers: false, pebbles: 0x8a7a68, boulders: 0x7a6a5e, mushrooms: false, lilies: false, bushes: 0x8a6e48 },
    trees: { tint: { color: 0xc9a27a, desat: 0.75, snow: null, snowAmount: 0 } }
  },

  pantano: {
    id: 'pantano',
    name: 'Pântano',
    legacy: false,
    // Lama escura, relva úmida esverdeada, água turva e vegetação morta.
    palette: { grass: [0x6c7f3a, 0x4d5e2c], dirt: 0x4e3d27, sand: 0x7b6b45, rock: 0x575a4a, snow: 0xcfd6c4, mud: 0x3d3524, road: 0x8c7648 },
    rules: { base: 'grass', patch: 'mud', high: 'dirt', shore: 'mud', patchAmount: 0.50, shoreTop: 1.6, highStart: 4.4, rockSlope: [0.6, 1.1], crack: 0 },
    surface: { roughness: 0.55, cliff: 0x4d4a3a, strata: 0.08 },
    water: { color: 0x58703a, opacity: 0.95, deep: 0x142014, foam: 0xc9d6a0, foamStrength: 0.55, plants: true },
    atmosphere: { sky: 0x9bb08f, fogNear: 55, fogFar: 210, hemiSky: 0xcbe0b5, hemiGround: 0x3d4a2a },
    decor: { grass: 0x7d8f4a, flowers: false, pebbles: 0x6d6a56, boulders: 0x66705a, mushrooms: true, lilies: true, bushes: 0x6f7d3e },
    trees: { tint: { color: 0x8a7d62, desat: 0.65, snow: null, snowAmount: 0 } }
  }
});

export const TILESET_IDS = Object.freeze(Object.keys(TILESETS));

/** Nome canônico (resolve aliases, desconhecido → `verdejante`). */
export function resolveTilesetId(id) {
  if (typeof id === 'string') {
    if (TILESETS[id]) return id;
    if (TILESET_ALIASES[id]) return TILESET_ALIASES[id];
  }
  return DEFAULT_TILESET;
}

export function getTileset(id) {
  return TILESETS[resolveTilesetId(id)];
}

/** Tileset de um mapa (`mapDef.tileset`). */
export function getMapTileset(mapDef) {
  return getTileset(mapDef && mapDef.tileset);
}

// ---------------------------------------------------------------------------------------------
// Splat (puro): pesos por classe a partir de altura, declive e ruído. Usado pela pintura da textura e testado em Node.
// ---------------------------------------------------------------------------------------------
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export function smoothstep(a, b, x) {
  if (a === b) return x < a ? 0 : 1;
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}

/**
 * Pesos (soma 1) das classes do splat num ponto.
 * @param {object} rules   `tileset.rules`
 * @param {number} h       altura do terreno
 * @param {number} slope   declive (|∇h|, unidades de altura por unidade de mundo)
 * @param {number} n       ruído grande escala 0..1 (manchas)
 * @param {number} waterLevel
 * @returns {{base:number, patch:number, high:number, shore:number, rock:number, seabed:number}}
 */
export function splatWeights(rules, h, slope, n, waterLevel = 0.5) {
  const seabed = smoothstep(waterLevel - 0.15, waterLevel - 0.45, h);
  const shore = (1 - seabed) * smoothstep(rules.shoreTop, rules.shoreTop - 0.7, h + (n - 0.5) * 0.5);
  const rock = smoothstep(rules.rockSlope[0], rules.rockSlope[1], slope);
  const high = smoothstep(rules.highStart - 0.5, rules.highStart + 0.5, h + (n - 0.5) * 1.4);
  const patch = smoothstep(1 - rules.patchAmount - 0.06, 1 - rules.patchAmount + 0.06, n);
  let remain = 1;
  const take = (w) => { const v = remain * clamp01(w); remain -= v; return v; };
  const wSeabed = take(seabed);
  const wRock = take(rock);
  const wShore = take(shore);
  const wHigh = take(high);
  const wPatch = take(patch);
  return { seabed: wSeabed, rock: wRock, shore: wShore, high: wHigh, patch: wPatch, base: remain };
}
