/**
 * src/data/maps/coast/presets.js (MUNDO-TERRENO-MAPAS §2.5 · MUNDO-1)
 *
 * Presets do gerador de costa (tabela "Tipos de mapa novos" do spec §2.5). Cada preset é um conjunto de opções do gerador
 * (`options`), a regra de posição das bases (`layout`, ver `layout.js`), se o mapa é naval (poços de petróleo e costa para o Estaleiro)
 * e a faixa de terra esperada. Os tamanhos usam `grid = size` (1 célula = 1 u, o mesmo passo do mapa assado) e as larguras de lava e de
 * rio em unidades de mundo (córrego de 4–6 u, rio de 3,4–5 u).
 *
 * Índices de entidade em `layout.bases[].entities`: os continentes vêm primeiro (0 e 1; ou só o 0), depois as ilhas grandes, as ilhas
 * e as ilhotas (ordem de criação de `generateCoast`).
 */

const freeze = (o) => Object.freeze(o);

export const COAST_PRESETS = freeze({
  /** 1×1 naval / campanha: 2 continentes (Velmara a oeste, Cinzara a leste) + 2 ilhas + 1 ilhota; uma base por continente. Mar largo entre as terras (MUNDO-7, 2026-10-16: continentes afastados, canal de 16 u, menos ilhas). */
  'dois-continentes': freeze({
    id: 'dois-continentes',
    name: 'Guerra dos Dois Continentes',
    uso: '1×1 naval / campanha',
    tileset: 'exuberante',
    naval: true,
    options: freeze({ size: 224, grid: 224, continents: 2, continentDims: [0.175, 0.44], continentSpacing: 0.38, gap: 16, islands: 2, islets: 1, lava: true, lavaWidth: [4, 6], rivers: 1 }),
    layout: freeze({ bases: [{ entities: [0] }, { entities: [1] }] }),
    verify: freeze({ landRange: [0.25, 0.5], minRivers: 1 })
  }),
  /** 1×1 / 2×2: um continente com duas costas, simetria exata de 180° (terra, altura, bioma, rios e bases), ilhas de recurso na costa. */
  'duelo-continental': freeze({
    id: 'duelo-continental',
    name: 'Duelo Continental',
    uso: '1×1 competitivo',
    tileset: 'exuberante',
    naval: false,
    options: freeze({ size: 224, grid: 224, continents: 1, continentDims: [0.35, 0.27], symmetry: 'rotate', islands: 4, islets: 4, bays: 2, peninsulas: 1, roughness: 0.9, lava: false, rivers: 1 }),
    layout: freeze({ bases: [{ entities: [0], side: 'west' }, { twinOf: 0 }] }),
    verify: freeze({ landRange: [0.25, 0.5], minRivers: 1 })
  }),
  /** FFA / naval de 4 jogadores: 4 ilhas grandes irregulares nos cantos (uma por quadrante), 2 ilhas, sem ilhotas; mar largo entre as ilhas (MUNDO-7, 2026-10-16). No lugar de `ilhas-4p` (que fica). */
  'arquipelago-vivo': freeze({
    id: 'arquipelago-vivo',
    name: 'Arquipélago do Mar Fendido',
    uso: 'FFA / naval 4 jogadores',
    tileset: 'exuberante',
    naval: true,
    options: freeze({ size: 256, grid: 256, continents: 0, bigIslands: 4, bigIslandScale: 1.05, bigIslandAt: [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]], islands: 2, islets: 0, gap: 12, lava: false, rivers: 0 }),
    layout: freeze({ bases: [{ entities: [0] }, { entities: [1] }, { entities: [2] }, { entities: [3] }] }),
    verify: freeze({ landRange: [0.2, 0.46], minRivers: 0 })
  }),
  /** Tutorial / missão: uma ilha irregular grande com duas bases (jogador a oeste, rival a leste). */
  'ilha-unica': freeze({
    id: 'ilha-unica',
    name: 'Ilha dos Estilhaços',
    uso: 'tutorial / missão',
    tileset: 'exuberante',
    naval: false,
    options: freeze({ size: 224, grid: 224, continents: 1, continentDims: [0.36, 0.3], islands: 0, islets: 3, bays: 2, peninsulas: 2, lava: false, rivers: 1 }),
    layout: freeze({ bases: [{ entities: [0], side: 'west' }, { entities: [0], side: 'east' }], minSeparation: 70 }),
    verify: freeze({ landRange: [0.2, 0.5], minRivers: 1 })
  }),
  /** Missões 7–12: continente alheio a leste (deserto), "cabeça de ponte" a oeste (ilha grande do jogador) + ilhas (com a vulcânica). */
  'mundo-campanha': freeze({
    id: 'mundo-campanha',
    name: 'Cabeça de Ponte',
    uso: 'campanha (missões 7–12)',
    tileset: 'exuberante',
    naval: true,
    options: freeze({
      size: 256, grid: 256, continents: 1, continentBiome: 'arid', continentCenter: [0.2, 0], continentDims: [0.24, 0.36], bigIslands: 1, bigIslandAt: [[-0.3, 0]], bigIslandScale: 1.15,
      islands: 4, islets: 4, lava: true, lavaWidth: [4, 6], rivers: 1
    }),
    layout: freeze({ bases: [{ entities: [1] }, { entities: [0] }] }),
    verify: freeze({ landRange: [0.3, 0.55], minRivers: 1 })
  })
});

export const COAST_PRESET_IDS = Object.freeze(Object.keys(COAST_PRESETS));

/** Preset por id (ou o próprio objeto, se já for um preset). Lança `Error` se o id não existir. */
export function getCoastPreset(idOrPreset) {
  if (idOrPreset && typeof idOrPreset === 'object') return idOrPreset;
  const p = COAST_PRESETS[idOrPreset];
  if (!p) throw new Error(`coast: preset desconhecido "${idOrPreset}" (${COAST_PRESET_IDS.join(', ')})`);
  return p;
}
