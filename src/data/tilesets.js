/**
 * src/data/tilesets.js (F7-04 · MUNDO-TERRENO-MAPAS §3.1) — tilesets e biomas de terreno estilo WC2.
 * Puro dado + funções puras (sem three/DOM): a sim NÃO lê nada daqui; só `TerrainView`, `Water`,
 * `Decorations`, `TreeManager`, `SceneManager` e a prévia.
 *
 * Seleção: campo `tileset` do JSON do mapa (`src/data/maps/README.md`).
 * Biomas disponíveis:
 * - Legados / clássicos: `verdejante` (Floresta, o look original), `inverno`, `devastadas`, `pantano`
 * - Novos biomas (MUNDO-TERRENO-MAPAS §3.1): `exuberante`, `deserto`, `savana`, `vulcanico`, `pedregoso`
 * `ilhas` é alias de `verdejante`.
 *
 * `legacy: true` (só o verdejante) mantém exatamente o caminho de pintura anterior à F7-04 (textura, cores de vértice,
 * água e atmosfera idênticas); os demais usam o splat map (`src/models/environment/tilesetTextures.js`).
 */

export const DEFAULT_TILESET = 'verdejante';
export const TILESET_ALIASES = Object.freeze({
  ilhas: 'verdejante',
  floresta: 'verdejante',
  winter: 'inverno',
  wasteland: 'devastadas',
  swamp: 'pantano',
  desert: 'deserto',
  lush: 'exuberante',
  savanna: 'savana',
  volcanic: 'vulcanico',
  rocky: 'pedregoso',
  stony: 'pedregoso'
});

/** Cores como 0xRRGGBB. `palette.*` com 2 tons = [claro, escuro] (mistura por ruído). */
export const TILESETS = Object.freeze({
  verdejante: {
    id: 'verdejante',
    name: 'Floresta',
    legacy: true,
    palette: { grass: [0x78d458, 0x66873c], dirt: 0x855533, sand: 0xe4ce95, rock: 0x8a8f6a, snow: 0xf2f6fa, mud: 0x5a4a30, road: 0xa98757 },
    water: { color: 0x3cb0d8, opacity: 0.86, deep: 0x09233f, foam: 0xffffff, foamStrength: 0.7, plants: true },
    // F7-03: color grading do pós-processamento (tint RGB, saturação, contraste, brilho, vinheta); neutro = sem efeito
    grade: { tint: [1, 1, 1], sat: 1.04, contrast: 1.02, brightness: 1, vignette: 0.10 },
    atmosphere: {
      sky: 0x85c8ec,
      fogNear: 95,
      fogFar: 320,
      hemiSky: 0xcde6ff,
      hemiGround: 0x567848,
      fog: { color: 0x85c8ec, near: 95, far: 320 },
      ambient: { sky: 0xcde6ff, ground: 0x567848, color: 0xcde6ff },
      sun: { color: 0xfffaec, intensity: 2.45 }
    },
    fog: { color: 0x85c8ec, near: 95, far: 320 },
    ambient: { sky: 0xcde6ff, ground: 0x567848, color: 0xcde6ff },
    sun: { color: 0xfffaec, intensity: 2.45 },
    lighting: {
      fog: { color: 0x85c8ec, near: 95, far: 320 },
      ambient: { sky: 0xcde6ff, ground: 0x567848, color: 0xcde6ff },
      sun: { color: 0xfffaec, intensity: 2.45 }
    },
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
    // F7-03: color grading do pós-processamento (tint RGB, saturação, contraste, brilho, vinheta); neutro = sem efeito
    grade: { tint: [0.95, 1.0, 1.07], sat: 0.9, contrast: 1.04, brightness: 1.02, vignette: 0.14 },
    atmosphere: {
      sky: 0xc9dbe8,
      fogNear: 80,
      fogFar: 270,
      hemiSky: 0xdbe9ff,
      hemiGround: 0x8497ad,
      fog: { color: 0xc9dbe8, near: 80, far: 270 },
      ambient: { sky: 0xdbe9ff, ground: 0x8497ad, color: 0xdbe9ff },
      sun: { color: 0xf0f6ff, intensity: 2.3 }
    },
    fog: { color: 0xc9dbe8, near: 80, far: 270 },
    ambient: { sky: 0xdbe9ff, ground: 0x8497ad, color: 0xdbe9ff },
    sun: { color: 0xf0f6ff, intensity: 2.3 },
    lighting: {
      fog: { color: 0xc9dbe8, near: 80, far: 270 },
      ambient: { sky: 0xdbe9ff, ground: 0x8497ad, color: 0xdbe9ff },
      sun: { color: 0xf0f6ff, intensity: 2.3 }
    },
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
    // F7-03: color grading do pós-processamento (tint RGB, saturação, contraste, brilho, vinheta); neutro = sem efeito
    grade: { tint: [1.09, 0.98, 0.86], sat: 1.02, contrast: 1.06, brightness: 0.98, vignette: 0.18 },
    atmosphere: {
      sky: 0xb69b7e,
      fogNear: 70,
      fogFar: 250,
      hemiSky: 0xf0cfa5,
      hemiGround: 0x6a4a35,
      fog: { color: 0xb69b7e, near: 70, far: 250 },
      ambient: { sky: 0xf0cfa5, ground: 0x6a4a35, color: 0xf0cfa5 },
      sun: { color: 0xffe2b8, intensity: 2.4 }
    },
    fog: { color: 0xb69b7e, near: 70, far: 250 },
    ambient: { sky: 0xf0cfa5, ground: 0x6a4a35, color: 0xf0cfa5 },
    sun: { color: 0xffe2b8, intensity: 2.4 },
    lighting: {
      fog: { color: 0xb69b7e, near: 70, far: 250 },
      ambient: { sky: 0xf0cfa5, ground: 0x6a4a35, color: 0xf0cfa5 },
      sun: { color: 0xffe2b8, intensity: 2.4 }
    },
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
    // F7-03: color grading do pós-processamento (tint RGB, saturação, contraste, brilho, vinheta); neutro = sem efeito
    grade: { tint: [0.93, 1.04, 0.88], sat: 0.88, contrast: 1.03, brightness: 0.96, vignette: 0.2 },
    atmosphere: {
      sky: 0x9bb08f,
      fogNear: 55,
      fogFar: 210,
      hemiSky: 0xcbe0b5,
      hemiGround: 0x3d4a2a,
      fog: { color: 0x9bb08f, near: 55, far: 210 },
      ambient: { sky: 0xcbe0b5, ground: 0x3d4a2a, color: 0xcbe0b5 },
      sun: { color: 0xe8eac4, intensity: 2.1 }
    },
    fog: { color: 0x9bb08f, near: 55, far: 210 },
    ambient: { sky: 0xcbe0b5, ground: 0x3d4a2a, color: 0xcbe0b5 },
    sun: { color: 0xe8eac4, intensity: 2.1 },
    lighting: {
      fog: { color: 0x9bb08f, near: 55, far: 210 },
      ambient: { sky: 0xcbe0b5, ground: 0x3d4a2a, color: 0xcbe0b5 },
      sun: { color: 0xe8eac4, intensity: 2.1 }
    },
    decor: { grass: 0x7d8f4a, flowers: false, pebbles: 0x6d6a56, boulders: 0x66705a, mushrooms: true, lilies: true, bushes: 0x6f7d3e },
    trees: { tint: { color: 0x8a7d62, desat: 0.65, snow: null, snowAmount: 0 } }
  },

  // -------------------------------------------------------------------------------------------
  // Novos biomas de Ondara (MUNDO-TERRENO-MAPAS §3.1)
  // -------------------------------------------------------------------------------------------

  exuberante: {
    id: 'exuberante',
    name: 'Exuberante',
    legacy: false,
    // Pradaria verde viva com manchas de terra marrom, granito cinza e costa turquesa.
    palette: {
      grass: [0x5fa43c, 0x3f7e2e],
      dirt: 0x7a5230,
      sand: 0xe8d9a8,
      rock: 0x9b9a94,
      snow: 0xf2f6fa,
      mud: 0x5a4228,
      road: 0xbfa372
    },
    rules: { base: 'grass', patch: 'dirt', high: 'rock', shore: 'sand', patchAmount: 0.28, shoreTop: 1.5, highStart: 4.5, rockSlope: [0.55, 1.05], crack: 0 },
    surface: { roughness: 0.52, cliff: 0x7a7870, strata: 0.08 },
    water: { color: 0x35b7c9, opacity: 0.88, deep: 0x0d4a8c, foam: 0xffffff, foamStrength: 0.85, plants: true },
    grade: { tint: [1.02, 1.02, 0.98], sat: 1.10, contrast: 1.04, brightness: 1.02, vignette: 0.10 },
    atmosphere: {
      sky: 0x7ec5f0,
      fogNear: 95,
      fogFar: 330,
      hemiSky: 0xd6eeff,
      hemiGround: 0x4a7a35,
      fog: { color: 0x7ec5f0, near: 95, far: 330 },
      ambient: { sky: 0xd6eeff, ground: 0x4a7a35, color: 0xd6eeff },
      sun: { color: 0xfffaec, intensity: 2.5 }
    },
    fog: { color: 0x7ec5f0, near: 95, far: 330 },
    ambient: { sky: 0xd6eeff, ground: 0x4a7a35, color: 0xd6eeff },
    sun: { color: 0xfffaec, intensity: 2.5 },
    lighting: {
      fog: { color: 0x7ec5f0, near: 95, far: 330 },
      ambient: { sky: 0xd6eeff, ground: 0x4a7a35, color: 0xd6eeff },
      sun: { color: 0xfffaec, intensity: 2.5 }
    },
    decor: { grass: 0x5fa43c, flowers: true, pebbles: 0x9b9a94, boulders: 0x8a8a84, mushrooms: true, lilies: true, bushes: 0x4a8c30 },
    trees: { tint: { color: 0x2f6a2c, desat: 0.10, snow: null, snowAmount: 0 } }
  },

  deserto: {
    id: 'deserto',
    name: 'Deserto',
    legacy: false,
    // Dunas de areia clara bege-dourado, capim seco, arenito e trilhas tan-claras.
    palette: {
      grass: [0xc9a24a, 0xb8923a],
      dirt: 0xc4a574,
      sand: 0xe6cf9c,
      rock: 0x8a8378,
      snow: 0xf5eedb,
      mud: 0x8a6a40,
      road: 0xc4a574
    },
    rules: { base: 'sand', patch: 'grass', high: 'rock', shore: 'sand', patchAmount: 0.35, shoreTop: 1.4, highStart: 4.2, rockSlope: [0.52, 1.00], crack: 0.15 },
    surface: { roughness: 0.85, cliff: 0x8a8378, strata: 0.22 },
    water: { color: 0x2f5a58, opacity: 0.90, deep: 0x142a2a, foam: 0xe6cf9c, foamStrength: 0.50, plants: true },
    grade: { tint: [1.08, 1.02, 0.92], sat: 1.05, contrast: 1.05, brightness: 1.02, vignette: 0.14 },
    atmosphere: {
      sky: 0xdfc08a,
      fogNear: 75,
      fogFar: 280,
      hemiSky: 0xffe6b8,
      hemiGround: 0x8a6e45,
      fog: { color: 0xdfc08a, near: 75, far: 280 },
      ambient: { sky: 0xffe6b8, ground: 0x8a6e45, color: 0xffe6b8 },
      sun: { color: 0xfff4d6, intensity: 2.6 }
    },
    fog: { color: 0xdfc08a, near: 75, far: 280 },
    ambient: { sky: 0xffe6b8, ground: 0x8a6e45, color: 0xffe6b8 },
    sun: { color: 0xfff4d6, intensity: 2.6 },
    lighting: {
      fog: { color: 0xdfc08a, near: 75, far: 280 },
      ambient: { sky: 0xffe6b8, ground: 0x8a6e45, color: 0xffe6b8 },
      sun: { color: 0xfff4d6, intensity: 2.6 }
    },
    decor: { grass: 0xc9a24a, flowers: false, pebbles: 0x8a8378, boulders: 0x8a8378, mushrooms: false, lilies: true, bushes: 0xb8923a },
    trees: { tint: { color: 0x7a9a50, desat: 0.45, snow: null, snowAmount: 0 } }
  },

  savana: {
    id: 'savana',
    name: 'Savana',
    legacy: false,
    // Capim alto dourado/palha, terra avermelhada, rochas planas e acácias.
    palette: {
      grass: [0xb8a64a, 0x9d8a3a],
      dirt: 0xa5784a,
      sand: 0xd8c28a,
      rock: 0x8c7e68,
      snow: 0xe8e2d2,
      mud: 0x6e4e32,
      road: 0xb58e5c
    },
    rules: { base: 'grass', patch: 'dirt', high: 'rock', shore: 'sand', patchAmount: 0.38, shoreTop: 1.4, highStart: 4.0, rockSlope: [0.52, 1.00], crack: 0.20 },
    surface: { roughness: 0.72, cliff: 0x785e48, strata: 0.12 },
    water: { color: 0x4fa89a, opacity: 0.90, deep: 0x163438, foam: 0xe8e2c8, foamStrength: 0.65, plants: true },
    grade: { tint: [1.06, 1.01, 0.90], sat: 1.02, contrast: 1.05, brightness: 1.01, vignette: 0.14 },
    atmosphere: {
      sky: 0xc8ba94,
      fogNear: 85,
      fogFar: 300,
      hemiSky: 0xffe2b8,
      hemiGround: 0x6a5632,
      fog: { color: 0xc8ba94, near: 85, far: 300 },
      ambient: { sky: 0xffe2b8, ground: 0x6a5632, color: 0xffe2b8 },
      sun: { color: 0xfff1cf, intensity: 2.55 }
    },
    fog: { color: 0xc8ba94, near: 85, far: 300 },
    ambient: { sky: 0xffe2b8, ground: 0x6a5632, color: 0xffe2b8 },
    sun: { color: 0xfff1cf, intensity: 2.55 },
    lighting: {
      fog: { color: 0xc8ba94, near: 85, far: 300 },
      ambient: { sky: 0xffe2b8, ground: 0x6a5632, color: 0xffe2b8 },
      sun: { color: 0xfff1cf, intensity: 2.55 }
    },
    decor: { grass: 0xb8a64a, flowers: false, pebbles: 0x8c7e68, boulders: 0x7e705c, mushrooms: false, lilies: true, bushes: 0xa09040 },
    trees: { tint: { color: 0x8a9244, desat: 0.35, snow: null, snowAmount: 0 } }
  },

  vulcanico: {
    id: 'vulcanico',
    name: 'Vulcânico',
    legacy: false,
    // Basalto escuro, cinzas, rocha rubra, céu escuro de fumaça e árvores queimadas.
    palette: {
      grass: [0x3a3436, 0x2b2528],
      dirt: 0x4a4244,
      sand: 0x383234,
      rock: 0x6b2f22,
      snow: 0x8a7f7c,
      mud: 0x221c1e,
      road: 0x5a4e4e
    },
    rules: { base: 'grass', patch: 'dirt', high: 'rock', shore: 'sand', patchAmount: 0.45, shoreTop: 1.3, highStart: 3.5, rockSlope: [0.48, 0.95], crack: 0.60 },
    surface: { roughness: 0.95, cliff: 0x3d3032, strata: 0.25 },
    water: { color: 0x2a3a40, opacity: 0.92, deep: 0x0f181c, foam: 0x6a5555, foamStrength: 0.50, plants: false },
    grade: { tint: [1.12, 0.92, 0.84], sat: 0.95, contrast: 1.10, brightness: 0.94, vignette: 0.22 },
    atmosphere: {
      sky: 0x6a4a40,
      fogNear: 50,
      fogFar: 200,
      hemiSky: 0xd97555,
      hemiGround: 0x2b2022,
      fog: { color: 0x6a4a40, near: 50, far: 200 },
      ambient: { sky: 0xd97555, ground: 0x2b2022, color: 0xd97555 },
      sun: { color: 0xff7a40, intensity: 2.1 }
    },
    fog: { color: 0x6a4a40, near: 50, far: 200 },
    ambient: { sky: 0xd97555, ground: 0x2b2022, color: 0xd97555 },
    sun: { color: 0xff7a40, intensity: 2.1 },
    lighting: {
      fog: { color: 0x6a4a40, near: 50, far: 200 },
      ambient: { sky: 0xd97555, ground: 0x2b2022, color: 0xd97555 },
      sun: { color: 0xff7a40, intensity: 2.1 }
    },
    decor: { grass: 0x3a3436, flowers: false, pebbles: 0x4a4244, boulders: 0x3d3032, mushrooms: false, lilies: false, bushes: 0x2b2528 },
    trees: { tint: { color: 0x222222, desat: 0.90, snow: null, snowAmount: 0 } }
  },

  pedregoso: {
    id: 'pedregoso',
    name: 'Pedregoso',
    legacy: false,
    // Granito cinza dominante, musgo, pouca vegetação e costa marítima agitada.
    palette: {
      grass: [0x6b7754, 0x5d6b45],
      dirt: 0x68645c,
      sand: 0xcdbf99,
      rock: 0x7d7a72,
      snow: 0xe6e9ec,
      mud: 0x4e4c45,
      road: 0x9a968c
    },
    rules: { base: 'rock', patch: 'grass', high: 'rock', shore: 'sand', patchAmount: 0.32, shoreTop: 1.5, highStart: 3.6, rockSlope: [0.45, 0.90], crack: 0.30 },
    surface: { roughness: 0.88, cliff: 0x65625a, strata: 0.18 },
    water: { color: 0x3b8599, opacity: 0.90, deep: 0x112836, foam: 0xf0f4f8, foamStrength: 0.90, plants: false },
    grade: { tint: [0.98, 1.01, 1.03], sat: 0.94, contrast: 1.06, brightness: 0.98, vignette: 0.15 },
    atmosphere: {
      sky: 0x9bb0c2,
      fogNear: 70,
      fogFar: 260,
      hemiSky: 0xc4d8e8,
      hemiGround: 0x5a5e58,
      fog: { color: 0x9bb0c2, near: 70, far: 260 },
      ambient: { sky: 0xc4d8e8, ground: 0x5a5e58, color: 0xc4d8e8 },
      sun: { color: 0xf5f8fc, intensity: 2.35 }
    },
    fog: { color: 0x9bb0c2, near: 70, far: 260 },
    ambient: { sky: 0xc4d8e8, ground: 0x5a5e58, color: 0xc4d8e8 },
    sun: { color: 0xf5f8fc, intensity: 2.35 },
    lighting: {
      fog: { color: 0x9bb0c2, near: 70, far: 260 },
      ambient: { sky: 0xc4d8e8, ground: 0x5a5e58, color: 0xc4d8e8 },
      sun: { color: 0xf5f8fc, intensity: 2.35 }
    },
    decor: { grass: 0x5d6b45, flowers: false, pebbles: 0x7d7a72, boulders: 0x6e6b63, mushrooms: false, lilies: false, bushes: 0x54623e },
    trees: { tint: { color: 0x5d6b45, desat: 0.40, snow: null, snowAmount: 0 } }
  }
});

export const TILESET_IDS = Object.freeze(Object.keys(TILESETS));
export const BIOMES = TILESETS;
export const BIOME_TILES_IDS = TILESET_IDS;

/** Nome canônico (resolve aliases, desconhecido → `verdejante`). */
export function resolveTilesetId(id) {
  if (typeof id === 'string') {
    if (TILESETS[id]) return id;
    if (TILESET_ALIASES[id]) return TILESET_ALIASES[id];
  }
  return DEFAULT_TILESET;
}

export const resolveBiomeId = resolveTilesetId;

export function getTileset(id) {
  return TILESETS[resolveTilesetId(id)];
}

export const getBiome = getTileset;

/** Depuração: `?tileset=inverno` na URL força o tileset de qualquer mapa (só render; no Node não existe `location`). */
function urlOverride() {
  try {
    const v = globalThis.location && new URLSearchParams(globalThis.location.search).get('tileset');
    return v && (TILESETS[v] || TILESET_ALIASES[v]) ? v : null;
  } catch (e) {
    return null;
  }
}

/** Tileset de um mapa (`mapDef.tileset`; `?tileset=` na URL tem prioridade, para depurar). */
export function getMapTileset(mapDef) {
  return getTileset(urlOverride() || (mapDef && mapDef.tileset));
}

/** `?tileset=<id>` força o tileset de TODO o mapa (depuração): o render regional por `biomeGrid` (MUNDO-5) fica desligado. */
export function tilesetOverrideActive() {
  return urlOverride() !== null;
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
