/**
 * tools/lib/campaignMaps.mjs (M2-03 · mapas de campanha)
 *
 * Receita dos mapas de campanha gerados pelo assador de costas (`buildCoastWorld`): um preset por palco (opções do gerador de
 * costa + regra de posição das bases) e uma etapa de pós-processamento que acrescenta o que a ficha da missão exige do mapa
 * (acampamento neutro, minas extras, âncoras nomeadas) e confere tudo (`verifyCoastWorld`, âncoras alcançáveis por terra/mar).
 * Usado por `tools/gen-campaign-maps.mjs`. Puro (Node, sem DOM, sem `Math.random`); o resultado é gravado em `src/data/maps/<id>.json`.
 *
 * Palcos deste arquivo: 1 Baía de Aurelan, 2 Pouso do Encontro, 3 Pedra-Mãe (lote M2-03); 4 Baixio do Breu, 5 Cerne Verde, 6 A Geada (lote M2-04);
 * 10 Costa Ferrugem, 11 Estepe do Vento, 12 Cabo Ferrugem (lote M2-06: continente orc, Cinzara, visto pela Aliança).
 * Os palcos 2 e 3 servem às duas campanhas (Liga de Aurelan e Clãs do Cinzal): slot 0 = lado da Liga, slot 1 = lado dos Clãs, e as
 * âncoras trazem um par por lado quando a missão muda de dono (`pier1`/`pier2`, `emissary1`/`emissary2`).
 */
import { buildCoastWorld, verifyCoastWorld, COAST_PRESETS } from '../../src/data/maps/coast/index.js';
import { defaultAnchors } from '../../src/data/maps/anchors.js';
import { getHeightForMap } from '../../src/sim/terrainGenerators.js';
import { buildPathfinder, floodFill, isReached } from '../../src/data/maps/generator.js';
import { layoutAt } from '../../src/sim/MatchConfig.js';
import { getBiomeAt, BIOME, decodeBiomeGrid, encodeRleBiomeGrid } from '../../src/data/maps/biome.js';
import { speciesForBiome } from '../../src/data/treeSpecies.js';
import { estimateWood } from '../../src/data/maps/coast/layout.js';
import { thinCorridor, makeWoodFn, CORRIDOR_DEFAULTS } from './corridorThin.mjs';

/** Parâmetros da etapa "afinar corredor" (largura da faixa em u, fração de árvores que fica, raio de floresta de coleta etc.): ver `corridorThin.mjs`. */
export const CORRIDOR_PARAMS = Object.freeze({ ...CORRIDOR_DEFAULTS });

const hyp = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const r1 = (v) => Math.round(v * 10) / 10;

export const GOLD_AMOUNT = 7500; // padrão do MUNDO-7

const freeze = (o) => Object.freeze(o);

/** Presets dos palcos (mesmo formato de `COAST_PRESETS`; `grid = size`, 1 célula = 1 u). */
export const CAMPAIGN_PRESETS = freeze({
  /** Palco 1: continente exuberante com enseadas e penínsulas; jogador a oeste, lado "rival" a leste (o acampamento neutro fica entre eles). */
  'camp-01-baia-de-aurelan': freeze({
    id: 'camp-01-baia-de-aurelan', name: 'Baía de Aurelan', uso: 'campanha, palco 1', tileset: 'exuberante', naval: false,
    options: freeze({ size: 176, grid: 176, continents: 1, continentDims: [0.45, 0.37], islands: 0, islets: 0, bays: 4, peninsulas: 2, roughness: 1.0, mountain: 0.8, lava: false, rivers: 0 }),
    layout: freeze({ bases: [{ entities: [0], side: 'west' }, { entities: [0], side: 'east' }], minSeparation: 70 }),
    verify: freeze({ landRange: [0.25, 0.8], minRivers: 0 })
  }),
  /** Palco 2: ilha temperada com praias, um rio com vaus, base da Liga a oeste e dos Clãs a leste. */
  'camp-02-pouso-do-encontro': freeze({
    id: 'camp-02-pouso-do-encontro', name: 'Pouso do Encontro', uso: 'campanha, palco 2 (Liga e Clãs)', tileset: 'verdejante', naval: false,
    options: freeze({ size: 176, grid: 176, continents: 1, continentDims: [0.42, 0.34], islands: 0, islets: 0, bays: 3, peninsulas: 3, roughness: 0.9, mountain: 0.35, lava: false, rivers: 1 }),
    layout: freeze({ bases: [{ entities: [0], side: 'west' }, { entities: [0], side: 'east' }], minSeparation: 66 }),
    verify: freeze({ landRange: [0.25, 0.8], minRivers: 1 })
  }),
  /** Palco 3: ilha rochosa (pedregoso), base do Paço a oeste e cabeça de ponte a leste; ouro extra no Paço. */
  'camp-03-pedra-mae': freeze({
    id: 'camp-03-pedra-mae', name: 'Pedra-Mãe', uso: 'campanha, palco 3 (Liga e Clãs)', tileset: 'pedregoso', naval: false,
    options: freeze({ size: 176, grid: 176, continents: 1, continentBiome: 'rocky', continentDims: [0.44, 0.36], islands: 0, islets: 0, bays: 3, peninsulas: 3, roughness: 1.15, lava: false, rivers: 0 }),
    layout: freeze({ bases: [{ entities: [0], side: 'west' }, { entities: [0], side: 'east' }], minSeparation: 66 }),
    verify: freeze({ landRange: [0.25, 0.8], minRivers: 0 })
  }),
  /** Palco 7 (M2-05): continente pantanoso com canais (rio com vaus), base do jogador a oeste e do aliado que trai a leste; o Salão inimigo vem por âncora. */
  'camp-07-brejo-mudo': freeze({
    id: 'camp-07-brejo-mudo', name: 'Brejo Mudo', uso: 'campanha, palco 7 (Liga e Clãs)', tileset: 'pantano', naval: false,
    options: freeze({ size: 176, grid: 176, continents: 1, continentBiome: 'swamp', continentDims: [0.44, 0.36], islands: 0, islets: 0, bays: 3, peninsulas: 3, roughness: 1.0, lava: false, rivers: 2 }),
    layout: freeze({ bases: [{ entities: [0], side: 'west' }, { entities: [0], side: 'east' }], minSeparation: 66 }),
    verify: freeze({ landRange: [0.25, 0.8], minRivers: 2 })
  }),
  /** Palco 8 (M2-05): ilha vulcânica pequena (jogável ≤ 128 u) cortada por UM rio de lava norte-sul com passagens de rocha; Liga a oeste, Clãs (forja e santuário) a leste. */
  'camp-08-fornalha': freeze({
    id: 'camp-08-fornalha', name: 'Fornalha', uso: 'campanha, palco 8 (Liga e Clãs)', tileset: 'vulcanico', naval: true, woodTarget: 5000,
    options: freeze({ size: 140, grid: 140, continents: 1, continentBiome: 'volcanic', continentDims: [0.42, 0.36], islands: 0, islets: 0, bays: 2, peninsulas: 2, roughness: 0.8, lava: true, lavaStreams: 1, lavaTheta: Math.PI / 2, lavaWidth: [4, 6], rivers: 0 }),
    layout: freeze({ bases: [{ entities: [0], side: 'west' }, { entities: [0], side: 'east' }], minSeparation: 50 }),
    verify: freeze({ landRange: [0.25, 0.8], minRivers: 0 })
  }),
  /** Palco 9 (M2-05): ilha deserta com dunas e três poços no meio; cabeça de ponte a oeste e base inimiga a leste. */
  'camp-09-miragem': freeze({
    id: 'camp-09-miragem', name: 'Miragem', uso: 'campanha, palco 9 (Liga e Clãs)', tileset: 'deserto', naval: false,
    options: freeze({ size: 176, grid: 176, continents: 1, continentBiome: 'arid', aridSwamp: false, continentDims: [0.44, 0.35], islands: 0, islets: 0, bays: 4, peninsulas: 2, roughness: 1.1, lava: false, rivers: 0 }),
    layout: freeze({ bases: [{ entities: [0], side: 'west' }, { entities: [0], side: 'east' }], minSeparation: 66 }),
    verify: freeze({ landRange: [0.25, 0.8], minRivers: 0 })
  }),
  /** Palco 4 (M2-04): atol de recifes; uma ilha comprida de "areia" com as bases nas pontas, ilhotas e baixios espalhados, poços de petróleo no mar fundo. */
  'camp-04-baixio-do-breu': freeze({
    id: 'camp-04-baixio-do-breu', name: 'Baixio do Breu', uso: 'campanha, palco 4 (frota)', tileset: 'exuberante', naval: true,
    options: freeze({ size: 224, grid: 224, continents: 1, continentBiome: 'atoll', continentDims: [0.35, 0.18], islands: 0, islets: 0, scatterIslets: 14, scatterRadius: [2.8, 5.5], scatterZone: 0.42, bays: 3, peninsulas: 2, roughness: 1.1, gap: 12, lava: false, rivers: 0, shoals: 34, shoalRadius: [7, 15], shoalBiome: 'sand', shoalMinCoast: 4 }),
    layout: freeze({ bases: [{ entities: [0], side: 'west' }, { entities: [0], side: 'east' }], minSeparation: 90 }),
    verify: freeze({ landRange: [0.12, 0.5], minRivers: 0 })
  }),
  /** Palco 5 (M2-04): floresta densa com clareiras, rio curto com um vau; Liga a oeste, Clã a leste. */
  'camp-05-cerne-verde': freeze({
    id: 'camp-05-cerne-verde', name: 'Cerne Verde', uso: 'campanha, palco 5 (Liga e Clãs)', tileset: 'verdejante', naval: false,
    options: freeze({ size: 176, grid: 176, continents: 1, continentBiome: 'forest', continentDims: [0.44, 0.36], islands: 0, islets: 0, bays: 3, peninsulas: 2, roughness: 1.0, lava: false, rivers: 1, riverFordSpacing: 40 }),
    layout: freeze({ bases: [{ entities: [0], side: 'west' }, { entities: [0], side: 'east' }], minSeparation: 66 }),
    verify: freeze({ landRange: [0.25, 0.8], minRivers: 1 })
  }),
  /** Palco 6 (M2-04): continente gelado com lagos congelados e banquisa; 4 bases: jogador (SO), Lanças Quebradas (L), Sal Cinzento (N) e o aliado Brumar (O/S). */
  'camp-06-a-geada': freeze({
    id: 'camp-06-a-geada', name: 'A Geada', uso: 'campanha, palco 6 (Prova de Fogo)', tileset: 'inverno', naval: false, woodTarget: 8000,
    options: freeze({ size: 208, grid: 208, continents: 1, continentBiome: 'ice', continentDims: [0.44, 0.4], islands: 0, islets: 0, bays: 3, peninsulas: 3, roughness: 1.1, lava: false, rivers: 0, lakes: 3, frozenLakes: true, lakeRadius: [7, 11], shoals: 10, shoalRadius: [6, 12], shoalBiome: 'ice', shoalMinCoast: 3 }),
    layout: freeze({ bases: [{ entities: [0], sides: ['west', 'south'] }, { entities: [0], sides: ['east', 'north'] }, { entities: [0], sides: ['east', 'south'] }, { entities: [0], sides: ['west', 'north'] }], minSeparation: 60 }),
    verify: freeze({ landRange: [0.25, 0.85], minRivers: 0 })
  }),
  /** Palco 10 (M2-06): a costa de Cinzara vista do mar. Continente árido a leste (terra a partir do meio), mar aberto a oeste; Marco da Colônia a oeste (slot 0), guarnição de Skarn a leste (slot 1). */
  'camp-10-costa-ferrugem': freeze({
    id: 'camp-10-costa-ferrugem', name: 'Costa Ferrugem', uso: 'campanha, palco 10 (desembarque)', tileset: 'deserto', naval: false,
    options: freeze({ size: 208, grid: 208, continents: 1, continentBiome: 'arid', continentCenter: [0.18, 0], continentDims: [0.42, 0.44], islands: 0, islets: 0, scatterIslets: 5, scatterRadius: [2.8, 5], scatterZone: 0.42, bays: 4, peninsulas: 2, roughness: 1.1, lava: false, rivers: 0 }),
    layout: freeze({ bases: [{ entities: [0], side: 'west' }, { entities: [0], side: 'east' }], minSeparation: 70 }),
    verify: freeze({ landRange: [0.2, 0.7], minRivers: 0 })
  }),
  /** Palco 11 (M2-06): interior de savana e estepe, costa a oeste para o Porto Albor (slot 0); Skarn a sudeste (slot 1) e Hurgan a nordeste (slot 2). */
  'camp-11-estepe-do-vento': freeze({
    id: 'camp-11-estepe-do-vento', name: 'Estepe do Vento', uso: 'campanha, palco 11 (colônia sob cerco)', tileset: 'savana', naval: false,
    options: freeze({ size: 208, grid: 208, continents: 1, continentBiome: 'steppe', continentCenter: [0.1, 0], continentDims: [0.44, 0.46], islands: 0, islets: 0, scatterIslets: 3, scatterRadius: [2.8, 4.5], scatterZone: 0.42, bays: 3, peninsulas: 2, roughness: 1.0, lava: false, rivers: 0 }),
    layout: freeze({ bases: [{ entities: [0], side: 'west' }, { entities: [0], sides: ['east', 'south'] }, { entities: [0], sides: ['east', 'north'] }], minSeparation: 62 }),
    verify: freeze({ landRange: [0.25, 0.8], minRivers: 0 })
  }),
  /** Palco 12 (M2-06): promontório de Cinzara apontando para 3 ilhas a oeste; o estreito entre a ponta e a ilha mais próxima é a zona de bloqueio. Slot 0 = Bastião, slot 1 = Skarn a leste. */
  'camp-12-cabo-ferrugem': freeze({
    id: 'camp-12-cabo-ferrugem', name: 'Cabo Ferrugem', uso: 'campanha, palco 12 (bastião e bloqueio)', tileset: 'deserto', naval: false,
    options: freeze({ size: 224, grid: 224, continents: 1, continentBiome: 'arid', continentCenter: [0.2, 0], continentDims: [0.36, 0.44], islands: 0, islets: 0, bigIslands: 3, bigIslandAt: [[-0.3, -0.27], [-0.34, 0.04], [-0.28, 0.3]], bigIslandScale: 0.42, bigIslandBiomes: ['arid', 'rocky', 'arid'], gap: 12, bays: 3, peninsulas: 4, roughness: 1.1, lava: false, rivers: 0 }),
    layout: freeze({ bases: [{ entities: [0], where: nearStrait }, { entities: [0], side: 'east' }], minSeparation: 70 }),
    verify: freeze({ landRange: [0.2, 0.7], minRivers: 0 })
  })
});

export const CAMPAIGN_IDS = Object.freeze(Object.keys(CAMPAIGN_PRESETS));

/** Nomes (pt-BR e en) de `map.<id>.name`. */
export const CAMPAIGN_NAMES = freeze({
  'camp-01-baia-de-aurelan': { pt: 'Baía de Aurelan', en: 'Aurelan Bay' },
  'camp-02-pouso-do-encontro': { pt: 'Pouso do Encontro', en: 'Meeting Landing' },
  'camp-03-pedra-mae': { pt: 'Pedra-Mãe', en: 'Mother Rock' },
  'camp-07-brejo-mudo': { pt: 'Brejo Mudo', en: 'Mute Marsh' },
  'camp-08-fornalha': { pt: 'Fornalha', en: 'The Furnace' },
  'camp-09-miragem': { pt: 'Miragem', en: 'Mirage' },
  'camp-04-baixio-do-breu': { pt: 'Baixio do Breu', en: 'Pitch Shoals' },
  'camp-05-cerne-verde': { pt: 'Cerne Verde', en: 'Green Heart' },
  'camp-06-a-geada': { pt: 'A Geada', en: 'The Frost' },
  'camp-10-costa-ferrugem': { pt: 'Costa Ferrugem', en: 'Rust Coast' },
  'camp-11-estepe-do-vento': { pt: 'Estepe do Vento', en: 'Wind Steppe' },
  'camp-12-cabo-ferrugem': { pt: 'Cabo Ferrugem', en: 'Cape Rust' }
});

// ---------------------------------------------------------------------------------------------------------------------------
// Contexto de posicionamento
// ---------------------------------------------------------------------------------------------------------------------------

function oceanSeed(sea, playable) {
  const half = playable / 2;
  for (let d = 4; d < 30; d += 2) {
    for (let t = -half; t <= half; t += 4) {
      for (const p of [{ x: t, z: -half + d }, { x: t, z: half - d }, { x: -half + d, z: t }, { x: half - d, z: t }]) {
        if (sea.isWalkableWorld(p.x, p.z)) return p;
      }
    }
  }
  return null;
}

/** Contexto com os pathfinders terrestre e naval e funções de consulta sobre o `mapDef` já assado. */
export function makeCtx(m) {
  const land = buildPathfinder(m, 'land');
  const sea = buildPathfinder(m, 'naval');
  const half = m.playable / 2;
  const hAt = (x, z) => getHeightForMap(m, x, z);
  const s0 = m.startSlots[0];
  const seen0 = floodFill(land, s0.x, s0.z);
  const oc = oceanSeed(sea, m.playable);
  const oceanSeen = oc ? floodFill(sea, oc.x, oc.z) : new Uint8Array(sea.numCells);
  const ctx = {
    m, land, sea, half, hAt, s0, s1: m.startSlots[1], seen0, oceanSeen,
    reach: (x, z) => isReached(land, seen0, x, z),
    oceanOk: (x, z) => hAt(x, z) < m.waterLevel && sea.isWalkableWorld(x, z) && isReached(sea, oceanSeen, x, z),
    /** Chão "comum" (nem neve, nem rocha nua, nem gelo): para acampamentos e marcos nos palcos verdes. */
    plain: (x, z) => ![BIOME.SNOW, BIOME.ROCK, BIOME.ICE, BIOME.VOLCANIC, BIOME.LAVA].includes(getBiomeAt(m, x, z)),
    /** Terra seca com `r` u de folga em volta. */
    dryClear(x, z, r) {
      if (hAt(x, z) < 1.95) return false;
      for (let a = 0; a < 16; a++) {
        const t = (a / 16) * Math.PI * 2;
        if (hAt(x + Math.cos(t) * r, z + Math.sin(t) * r) < 1.8 || hAt(x + Math.cos(t) * r * 0.5, z + Math.sin(t) * r * 0.5) < 1.8) return false;
      }
      return true;
    },
    /** Praia: terra seca com água a ≤ 4 u (a mesma definição do `landingZone` padrão). */
    isShore(x, z) {
      if (hAt(x, z) < 1.95) return false;
      for (let k = 0; k < 8; k++) {
        const t = (k / 8) * Math.PI * 2;
        const sx = x + Math.cos(t) * 4, sz = z + Math.sin(t) * 4;
        if (Math.abs(sx) <= half - 2 && Math.abs(sz) <= half - 2 && hAt(sx, sz) < m.waterLevel) return true;
      }
      return false;
    },
    /** Água navegável do oceano mais perto de (x, z), buscando em anéis de 4 a 16 u. */
    waterNear(x, z, rMin = 5, rMax = 16) {
      for (let rho = rMin; rho <= rMax; rho += 1) {
        let best = null, bd = Infinity;
        for (let a = 0; a < 48; a++) {
          const t = (a / 48) * Math.PI * 2;
          const px = x + Math.cos(t) * rho, pz = z + Math.sin(t) * rho;
          if (Math.abs(px) > half - 4 || Math.abs(pz) > half - 4 || !ctx.oceanOk(px, pz)) continue;
          // preferir o ponto mais fundo da vizinhança (navio de verdade passa), depois o primeiro ângulo
          const d = hAt(px, pz);
          if (d < bd) { bd = d; best = { x: r1(px), z: r1(pz) }; }
        }
        if (best) return best;
      }
      return null;
    },
    /** Varre a área jogável em passo fixo (ordem z, x) e devolve o ponto de menor `score` entre os que passam em `test`. */
    scan({ step = 2, test, score = () => 0 }) {
      let best = null, bs = Infinity;
      for (let z = -half + 6; z <= half - 6; z += step) {
        for (let x = -half + 6; x <= half - 6; x += step) {
          if (!test(x, z)) continue;
          const s = score(x, z);
          if (s < bs) { bs = s; best = { x, z, s }; }
        }
      }
      return best;
    }
  };
  ctx.avoid = []; // {x, z, r}: pontos já ocupados (jazidas, bosques, acampamentos, âncoras postas)
  for (const r of m.resources) ctx.avoid.push({ x: r.x, z: r.z, r: r.type === 'oil' ? 0 : 9 });
  for (const f of m.forests) ctx.avoid.push({ x: f.x, z: f.z, r: f.radius * 0.75 });
  for (const s of m.startSlots) {
    for (const b of layoutAt(s).buildings) ctx.avoid.push({ x: b.x, z: b.z, r: 8 });
    ctx.avoid.push({ x: s.x, z: s.z, r: 22, slot: true });
  }
  ctx.free = (x, z, extra = 0) => ctx.avoid.every((a) => Math.hypot(x - a.x, z - a.z) >= a.r + extra);
  /** Como `free`, mas com folga de `slotR` (em vez de 22 + extra) em volta dos pátios: para o que cabe colado à base (Santuário, cativeiro). */
  ctx.freeNear = (x, z, extra = 0, slotR = 14) => ctx.avoid.every((a) => Math.hypot(x - a.x, z - a.z) >= (a.slot ? slotR : a.r + extra));
  ctx.take = (p, r) => { ctx.avoid.push({ x: p.x, z: p.z, r }); return p; };
  return ctx;
}

const need = (p, what) => { if (!p) throw new Error(`campanha: não achei lugar para ${what}`); return p; };
const pt = (p) => ({ x: r1(p.x), z: r1(p.z) });

// ---------------------------------------------------------------------------------------------------------------------------
// Pós-processamento por palco
// ---------------------------------------------------------------------------------------------------------------------------

/** Mina de ouro extra de `amount` GOLD_AMOUNT a `dMin`–`dMax` u do pátio `s` (expansão); registra em `m.resources` e devolve o ponto. */
function addGold(ctx, s, name, extra, { dMin = 20, dMax = 36, target = 26, plain = false } = {}) {
  const g = need(ctx.scan({
    test: (x, z) => ctx.dryClear(x, z, 5) && (!plain || ctx.plain(x, z)) && ctx.reach(x, z) && ctx.free(x, z, 4) && hyp({ x, z }, s) >= dMin && hyp({ x, z }, s) <= dMax,
    score: (x, z) => Math.abs(hyp({ x, z }, s) - target)
  }), `a mina extra ${name}`);
  ctx.take(g, 14);
  ctx.m.resources.push({ type: 'gold', x: r1(g.x), z: r1(g.z), amount: GOLD_AMOUNT });
  extra[name] = pt(g);
  return g;
}

/** Palco 1: acampamento da Irmandade da Maré entre as bases; Mural da Fenda numa enseada afastada; vela no horizonte. */
function postBaia(ctx, extra) {
  const { m, s0, s1 } = ctx;
  const camp = need(ctx.scan({
    test: (x, z) => ctx.dryClear(x, z, 13) && ctx.plain(x, z) && ctx.reach(x, z) && hyp({ x, z }, s0) >= 36 && hyp({ x, z }, s1) >= 30 && ctx.free(x, z, 2),
    score: (x, z) => Math.abs(hyp({ x, z }, s0) - 50) + 0.6 * Math.abs(hyp({ x, z }, s1) - 46)
  }), 'o acampamento neutro');
  ctx.take(camp, 16);
  m.neutrals.push({ kind: 'camp', x: r1(camp.x), z: r1(camp.z), guards: 4, reward: { gold: 300 }, deposit: { type: 'gold', amount: 3000 } });
  const mural = need(ctx.scan({
    test: (x, z) => ctx.reach(x, z) && ctx.isShore(x, z) && ctx.plain(x, z) && hyp({ x, z }, s0) >= 32 && hyp({ x, z }, s1) >= 28 && hyp({ x, z }, camp) >= 26 && ctx.free(x, z, 0),
    score: (x, z) => Math.abs(hyp({ x, z }, s0) - 68)
  }), 'o Mural da Fenda');
  ctx.take(mural, 10);
  extra.muralFenda = pt(mural);
  // a vela estranha: água navegável do oceano, longe do jogador, perto da borda
  const sail = need(ctx.scan({
    step: 4,
    test: (x, z) => ctx.oceanOk(x, z) && Math.max(Math.abs(x), Math.abs(z)) >= ctx.half - 22 && ctx.oceanOk(x + 6, z) && ctx.oceanOk(x - 6, z),
    score: (x, z) => -hyp({ x, z }, s0)
  }), 'a vela no horizonte');
  extra.shipHorizon = { ...pt(sail), water: true };
}

/** Palco 2: Cais de cada lado, forte de troncos no meio, Torre da Fenda numa ponta, Emissário/Mensageiro, patrulha. */
function postPouso(ctx, extra) {
  const { m, s0, s1 } = ctx;
  const mid = { x: (s0.x + s1.x) / 2, z: (s0.z + s1.z) / 2 };
  const pierFor = (s, other, name) => {
    const p = need(ctx.scan({
      step: 1,
      test: (x, z) => ctx.isShore(x, z) && ctx.reach(x, z) && hyp({ x, z }, s) >= 24 && hyp({ x, z }, s) <= 52 && ctx.waterNear(x, z) && ctx.free(x, z, 4),
      // a costa mais próxima do pátio e do lado oposto ao rival
      score: (x, z) => Math.abs(hyp({ x, z }, s) - 34) + 0.35 * Math.max(0, 80 - hyp({ x, z }, other)) * 0.2
    }), `o Cais de ${name}`);
    ctx.take(p, 12);
    return p;
  };
  const pier1 = pierFor(s0, s1, 'Aurelan');
  const pier2 = pierFor(s1, s0, 'Cinzal');
  extra.pier1 = pt(pier1); extra.pier1Water = { ...ctx.waterNear(pier1.x, pier1.z), water: true };
  extra.pier2 = pt(pier2); extra.pier2Water = { ...ctx.waterNear(pier2.x, pier2.z), water: true };
  // forte de troncos: perto do meio do caminho entre as bases
  const fort = need(ctx.scan({
    test: (x, z) => ctx.dryClear(x, z, 11) && ctx.plain(x, z) && ctx.reach(x, z) && ctx.free(x, z, 6) && hyp({ x, z }, s0) >= 30 && hyp({ x, z }, s1) >= 30,
    score: (x, z) => hyp({ x, z }, mid) * 0.6 + Math.abs(hyp({ x, z }, s0) - hyp({ x, z }, s1))
  }), 'o forte de troncos');
  ctx.take(fort, 16);
  extra.logFort = pt(fort);
  // Torre da Fenda em ruínas: ponta de terra (muita água em volta), longe das bases
  const wetFrac = (x, z, rho) => { let n = 0; for (let k = 0; k < 16; k++) { const t = (k / 16) * Math.PI * 2; if (ctx.hAt(x + Math.cos(t) * rho, z + Math.sin(t) * rho) < m.waterLevel) n++; } return n / 16; };
  const lh = need(ctx.scan({
    step: 1,
    test: (x, z) => ctx.dryClear(x, z, 2.5) && ctx.reach(x, z) && ctx.free(x, z, 6) && hyp({ x, z }, s0) >= 36 && hyp({ x, z }, s1) >= 36 && hyp({ x, z }, fort) >= 28,
    score: (x, z) => -wetFrac(x, z, 10) * 60 - wetFrac(x, z, 18) * 30 + Math.abs(hyp({ x, z }, mid) - 30) * 0.3
  }), 'a Torre da Fenda');
  ctx.take(lh, 14);
  extra.lighthouse = pt(lh);
  // Emissário (lado dos Clãs) e Mensageiro (lado da Liga): a ~30 u do pátio, rumo ao forte
  const toward = (s, to, d) => { const L = hyp(s, to) || 1; return { x: s.x + ((to.x - s.x) / L) * d, z: s.z + ((to.z - s.z) / L) * d }; };
  const near = (p, name, minR = 0) => need(ctx.scan({ test: (x, z) => ctx.dryClear(x, z, 3) && ctx.reach(x, z) && ctx.free(x, z, 3) && hyp({ x, z }, p) >= minR, score: (x, z) => hyp({ x, z }, p) }), name);
  const em1 = ctx.take(near(toward(s1, fort, 30), 'o Emissário'), 8);
  const em2 = ctx.take(near(toward(s0, fort, 30), 'o Mensageiro'), 8);
  extra.emissary1 = pt(em1); extra.emissary2 = pt(em2);
  // patrulha: 3 pontos em volta do forte (a 22 u)
  for (let k = 0; k < 3; k++) {
    const ang = (k / 3) * Math.PI * 2 + 0.6;
    const p = near({ x: fort.x + Math.cos(ang) * 22, z: fort.z + Math.sin(ang) * 22 }, `a patrulha ${k + 1}`, 0);
    ctx.take(p, 8);
    extra[`patrol${k + 1}`] = pt(p);
  }
  // uma mina de expansão por lado: com só 2 minas o ouro acaba e a partida IA×IA trava (soak, semente 8 brutal)
  addGold(ctx, s0, 'expansion1', extra, { plain: true });
  addGold(ctx, s1, 'expansion2', extra, { plain: true });
  extra.landingZone = pt(pier1); // praia de desembarque desta ilha: a do Cais da Liga (o `landingZone` padrão é só uma sugestão)
}

/** Palco 3: ouro extra no Paço, três praias de pouso com seu ponto no mar e seu forte, cabeça de ponte dos Clãs. */
function postPedra(ctx, extra) {
  const { m, s0, s1 } = ctx;
  // minas extras: 2 junto ao Paço (a Liga defende; os Clãs as capturam) e 1 na cabeça de ponte
  addGold(ctx, s0, 'colonyGold1', extra);
  addGold(ctx, s0, 'colonyGold2', extra);
  addGold(ctx, s1, 'bridgeheadGold', extra);
  // três praias onde as ondas (Barcaças) desembarcam, espalhadas em volta do Paço
  const cands = [];
  for (let z = -ctx.half + 6; z <= ctx.half - 6; z += 2) {
    for (let x = -ctx.half + 6; x <= ctx.half - 6; x += 2) {
      const d = hyp({ x, z }, s0);
      if (d < 36 || d > 72 || hyp({ x, z }, s1) < 44) continue;
      if (!ctx.isShore(x, z) || !ctx.reach(x, z) || !ctx.free(x, z, 3)) continue;
      const w = ctx.waterNear(x, z, 8, 18);
      if (!w) continue;
      cands.push({ x, z, d, w, ang: Math.atan2(z - s0.z, x - s0.x) });
    }
  }
  if (cands.length < 3) throw new Error('campanha: poucas praias para as ondas');
  const angDiff = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
  const picked = [];
  // primeiro: a praia mais próxima de 52 u; depois, a de maior separação angular (mín. 60°), com preferência por ~52 u
  picked.push(cands.reduce((a, c) => (Math.abs(c.d - 52) < Math.abs(a.d - 52) ? c : a)));
  for (let k = 1; k < 3; k++) {
    let best = null, bs = -Infinity;
    for (const c of cands) {
      const sep = Math.min(...picked.map((p) => angDiff(p.ang, c.ang)));
      if (sep < 1.0) continue;
      const s = sep * 40 - Math.abs(c.d - 52);
      if (s > bs) { bs = s; best = c; }
    }
    if (!best) throw new Error('campanha: não achei a praia de pouso ' + (k + 1));
    picked.push(best);
  }
  picked.sort((a, b) => a.ang - b.ang);
  picked.forEach((p, i) => {
    extra[`beach${i + 1}`] = pt(p);
    extra[`seaLanding${i + 1}`] = { x: p.w.x, z: p.w.z, water: true };
    ctx.take(p, 10);
  });
  // fortes da colônia (H03): um por praia, 14–18 u para dentro, rumo ao Paço
  picked.forEach((p, i) => {
    const L = hyp(p, s0) || 1;
    const aim = { x: p.x + ((s0.x - p.x) / L) * 16, z: p.z + ((s0.z - p.z) / L) * 16 };
    const f = need(ctx.scan({ test: (x, z) => ctx.dryClear(x, z, 5) && ctx.reach(x, z) && ctx.free(x, z, 3), score: (x, z) => hyp({ x, z }, aim) }), `o forte ${i + 1}`);
    ctx.take(f, 10);
    extra[`fort${i + 1}`] = pt(f);
  });
  // cabeça de ponte dos Clãs (H03): a praia mais próxima do slot 1 e o ponto no mar de onde as barcaças chegam
  const bh = need(ctx.scan({
    step: 1,
    test: (x, z) => ctx.isShore(x, z) && ctx.reach(x, z) && hyp({ x, z }, s1) >= 14 && hyp({ x, z }, s1) <= 40 && ctx.waterNear(x, z, 8, 18),
    score: (x, z) => hyp({ x, z }, s1)
  }), 'a cabeça de ponte');
  extra.bridgehead = pt(bh);
  extra.bridgeheadSea = { ...ctx.waterNear(bh.x, bh.z, 8, 18), water: true };
  extra.colonyHall = pt(s0); // o Paço do governador: o pátio do slot 0
  extra.landingZone = extra.beach1; // praia da primeira onda (o `landingZone` padrão é só uma sugestão)
}

// ---------------------------------------------------------------------------------------------------------------------------
// Palcos 7–9 (lote M2-05)
// ---------------------------------------------------------------------------------------------------------------------------

/** Praia (terra seca com água a ≤ 4 u e ponto de água navegável do oceano a 8–18 u) entre `dMin` e `dMax` u do pátio `s`, a ~`target` u. */
function pickBeach(ctx, s, name, { dMin = 30, dMax = 62, target = 44, avoid = [] } = {}) {
  const b = need(ctx.scan({
    step: 1,
    test: (x, z) => ctx.isShore(x, z) && ctx.reach(x, z) && ctx.free(x, z, 4) && hyp({ x, z }, s) >= dMin && hyp({ x, z }, s) <= dMax
      && avoid.every((a) => hyp({ x, z }, a.p) >= a.r) && ctx.waterNear(x, z, 8, 18),
    score: (x, z) => Math.abs(hyp({ x, z }, s) - target)
  }), name);
  ctx.take(b, 10);
  return b;
}

/** Palco 7: Salão de Brakka com dois Cercados de Javalis, depósito de ferro do traidor, praias do desembarque da frota, expansões. */
function postBrejo(ctx, extra) {
  const { s0, s1 } = ctx;
  // Salão do inimigo (Brakka em A07): platô livre longe das duas bases (as missões constroem o Salão e os cercados aqui)
  const hall = need(ctx.scan({
    test: (x, z) => ctx.dryClear(x, z, 15) && ctx.reach(x, z) && ctx.free(x, z, 10) && hyp({ x, z }, s0) >= 56 && hyp({ x, z }, s1) >= 56,
    score: (x, z) => Math.abs(hyp({ x, z }, s0) - 72) + Math.abs(hyp({ x, z }, s1) - 72)
  }), 'o Salão de Brakka');
  ctx.take(hall, 22);
  extra.brakkaHall = pt(hall);
  for (let k = 0; k < 2; k++) {
    const ang = Math.atan2(hall.z - (s0.z + s1.z) / 2, hall.x - (s0.x + s1.x) / 2) + (k ? 1 : -1) * 1.1;
    const aim = { x: hall.x + Math.cos(ang) * 17, z: hall.z + Math.sin(ang) * 17 };
    const pen = need(ctx.scan({ test: (x, z) => ctx.dryClear(x, z, 5) && ctx.reach(x, z) && ctx.free(x, z, 3) && hyp({ x, z }, hall) >= 13, score: (x, z) => hyp({ x, z }, aim) }), `o Cercado de Javalis ${k + 1}`);
    ctx.take(pen, 9);
    extra[`boarPen${k + 1}`] = pt(pen);
  }
  addGold(ctx, hall, 'brakkaGold', extra, { dMin: 20, dMax: 40, target: 28 });
  // depósito de ferro de contrabando do aliado que trai (atrás da base dele, longe da do jogador)
  const iron = need(ctx.scan({
    test: (x, z) => ctx.dryClear(x, z, 5) && ctx.reach(x, z) && ctx.free(x, z, 4) && hyp({ x, z }, s1) >= 22 && hyp({ x, z }, s1) <= 36 && hyp({ x, z }, hall) >= 24,
    score: (x, z) => -hyp({ x, z }, s0)
  }), 'o depósito de ferro');
  ctx.take(iron, 10);
  extra.ironDepot = pt(iron);
  extra.allyStart = pt(s1); // o aliado que trai aos 5:30 (Mervane/Hurgan) parte do slot 1
  // praias do desembarque da frota de Aurelan (H07), uma em cada lado
  const b1 = pickBeach(ctx, s0, 'a praia 1', { avoid: [{ p: hall, r: 24 }] });
  const b2 = pickBeach(ctx, s1, 'a praia 2', { avoid: [{ p: hall, r: 24 }, { p: b1, r: 40 }] });
  [b1, b2].forEach((b, i) => {
    extra[`beach${i + 1}`] = pt(b);
    extra[`seaLanding${i + 1}`] = { ...ctx.waterNear(b.x, b.z, 8, 18), water: true };
  });
  extra.landingZone = extra.beach1;
  addGold(ctx, s0, 'expansion1', extra, { plain: true });
  addGold(ctx, s1, 'expansion2', extra, { plain: true });
}

/** Palco 8: passagens de lava, Monte Caldeira, Forja Naval (na costa) e Santuário das Cinzas do lado dos Clãs, prisioneiros, chegada de Lyra. */
function postFornalha(ctx, extra, world) {
  const { m, s0, s1 } = ctx;
  const half = ctx.half;
  const lava = world.map.lava;
  if (!lava) throw new Error('campanha: a ilha não ganhou rio de lava');
  // passagens de rocha (os vaus da lava): o centro de cada uma, ordenadas de norte (z menor) a sul
  const pass = [];
  for (const st of lava.streams) for (const p of st.passages) pass.push({ x: p.i + 0.5 - m.size / 2, z: p.j + 0.5 - m.size / 2 });
  pass.sort((a, b) => a.z - b.z);
  if (!pass.length) throw new Error('campanha: sem passagem de rocha');
  pass.forEach((p, i) => { extra[`lavaPass${i + 1}`] = pt(p); });
  // Monte Caldeira: o ponto mais alto, terra seca e alcançável, perto do centro da ilha
  const ent = world.map.entities[0];
  const peak = need(ctx.scan({
    step: 1,
    test: (x, z) => ctx.reach(x, z) && hyp({ x, z }, { x: ent.cx, z: ent.cz }) <= 18 && ctx.hAt(x, z) >= 1.9 && ctx.free(x, z, 0),
    score: (x, z) => -ctx.hAt(x, z)
  }), 'o Monte Caldeira');
  ctx.take(peak, 6);
  extra.calderaPeak = pt(peak);
  // Forja Naval: na costa do lado dos Clãs, com água navegável do oceano a 8–18 u (o Estaleiro e os Leviatãs de Ferro)
  const forge = need(ctx.scan({
    step: 1,
    test: (x, z) => ctx.isShore(x, z) && ctx.reach(x, z) && ctx.free(x, z, 4) && hyp({ x, z }, s1) >= 18 && hyp({ x, z }, s1) <= 44 && ctx.waterNear(x, z, 8, 18),
    score: (x, z) => Math.abs(hyp({ x, z }, s1) - 28)
  }), 'a Forja Naval');
  ctx.take(forge, 11);
  extra.forge = pt(forge);
  extra.forgeWater = { ...ctx.waterNear(forge.x, forge.z, 8, 18), water: true };
  // Santuário das Cinzas (Vozgul): terra firme entre a base dos Clãs e a passagem de lava, longe da costa
  const toward = pass.reduce((a, p) => (hyp(p, s1) < hyp(a, s1) ? p : a));
  const sanctum = need(ctx.scan({
    test: (x, z) => ctx.dryClear(x, z, 7) && !ctx.isShore(x, z) && ctx.reach(x, z) && ctx.freeNear(x, z, 4, 15) && hyp({ x, z }, s1) >= 15 && hyp({ x, z }, s1) <= 30 && hyp({ x, z }, forge) >= 16,
    score: (x, z) => Math.abs(hyp({ x, z }, s1) - 21) + 0.3 * hyp({ x, z }, toward)
  }), 'o Santuário das Cinzas');
  ctx.take(sanctum, 13);
  extra.sanctum = pt(sanctum);
  // prisioneiros (os magos de Orsolo): seis pontos num círculo de 4,5 u, no território dos Clãs mas fora do Santuário
  const cc = need(ctx.scan({
    test: (x, z) => ctx.dryClear(x, z, 7.5) && ctx.reach(x, z) && ctx.freeNear(x, z, 3, 14) && hyp({ x, z }, s1) >= 18 && hyp({ x, z }, s1) <= 56 && hyp({ x, z }, sanctum) >= 14 && hyp({ x, z }, forge) >= 12,
    score: (x, z) => Math.abs(hyp({ x, z }, s1) - 32)
  }), 'o cativeiro dos magos');
  ctx.take(cc, 14);
  extra.captiveCamp = pt(cc);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + 0.4;
    extra[`captive${k + 1}`] = pt({ x: cc.x + Math.cos(a) * 4.5, z: cc.z + Math.sin(a) * 4.5 });
  }
  // chegada do esquadrão de grifos da Capitã Lyra: ponto de mar aberto na borda oeste, na altura da base da Liga
  const lyra = need(ctx.scan({
    step: 2,
    test: (x, z) => ctx.oceanOk(x, z) && x <= -half + 14,
    score: (x, z) => Math.abs(z - s0.z) + Math.abs(x + half - 8)
  }), 'a chegada de Lyra');
  extra.lyraArrival = { ...pt(lyra), water: true };
  // uma mina de ouro de expansão por lado (com 2 minas o ouro acabava no soak dos outros palcos); sem filtro de bioma (a ilha é toda basalto)
  addGold(ctx, s0, 'expansion1', extra, { dMin: 18, dMax: 40, target: 26 });
  addGold(ctx, s1, 'expansion2', extra, { dMin: 18, dMax: 40, target: 26 });
}

/** Pinta um tapete de `id` (raio `r`) em torno de (x, z) no `biomeGrid` do mapa (só visual); só sobre os biomos de `only` (se dado), nunca no mar nem na lava. */
function paintBiome(m, x, z, r, id, only = null) {
  const bg = m.biomeGrid;
  const grid = decodeBiomeGrid(bg);
  const { nodes } = bg, cell = bg.cell || 1, half = m.size / 2;
  const i0 = Math.round((x + half) / cell), j0 = Math.round((z + half) / cell), rr = Math.ceil(r / cell);
  for (let j = j0 - rr; j <= j0 + rr; j++) {
    for (let i = i0 - rr; i <= i0 + rr; i++) {
      if (i < 0 || j < 0 || i >= nodes || j >= nodes) continue;
      if (Math.hypot((i - i0) * cell, (j - j0) * cell) > r) continue;
      const k = j * nodes + i;
      if (grid[k] === BIOME.SEA || grid[k] === BIOME.LAVA) continue;
      if (only && !only.includes(grid[k])) continue;
      grid[k] = id;
    }
  }
  m.biomeGrid = { ...bg, data: encodeRleBiomeGrid(grid) }; // objeto novo: o cache de `gridOfBiome` é por objeto
}

/** Palco 9: três poços no meio do deserto, ruínas, cabeça de ponte de cada lado, forte de cada lado, Ninho e Aviário. */
function postMiragem(ctx, extra) {
  const { m, s0, s1 } = ctx;
  const L = hyp(s0, s1) || 1;
  const ux = (s1.x - s0.x) / L, uz = (s1.z - s0.z) / L; // do slot 0 ao 1
  const nx = -uz, nz = ux; // perpendicular
  // 3 poços em zigue-zague no eixo entre as bases: perto do lado 0, no centro e perto do lado 1; cada um no melhor chão plano livre
  const wells = [];
  [[0.30, 0], [0.50, 1], [0.70, -1]].forEach(([t, side], k) => {
    const aim = { x: s0.x + ux * L * t + nx * side * 20, z: s0.z + uz * L * t + nz * side * 20 };
    const w = need(ctx.scan({
      test: (x, z) => ctx.dryClear(x, z, 7) && ctx.plain(x, z) && ctx.reach(x, z) && ctx.free(x, z, 8) && wells.every((o) => hyp({ x, z }, o) >= 24)
        && hyp({ x, z }, s0) >= 30 && hyp({ x, z }, s1) >= 30,
      score: (x, z) => hyp({ x, z }, aim)
    }), `o poço ${k + 1}`);
    ctx.take(w, 12);
    wells.push(w);
  });
  wells.sort((a, b) => hyp(a, s0) - hyp(b, s0)); // poço 1 = o mais perto do lado 0
  wells.forEach((w, i) => { extra[`waterWell${i + 1}`] = pt(w); });
  // ruínas: 4 conjuntos, a ~22 u dos poços, espalhados
  const ruins = [];
  for (let k = 0; k < 4; k++) {
    const w = wells[k % 3];
    const ang = (k / 4) * Math.PI * 2 + 0.9;
    const aim = { x: w.x + Math.cos(ang) * 22, z: w.z + Math.sin(ang) * 22 };
    const r = need(ctx.scan({ test: (x, z) => ctx.dryClear(x, z, 5) && ctx.reach(x, z) && ctx.free(x, z, 3) && ruins.every((o) => hyp({ x, z }, o) >= 20), score: (x, z) => hyp({ x, z }, aim) }), `as ruínas ${k + 1}`);
    ctx.take(r, 8);
    ruins.push(r);
    extra[`ruins${k + 1}`] = pt(r);
  }
  // forte de cada lado: entre a base e o poço mais próximo (chão firme de 10 u de folga)
  [[s0, wells[0], 'fortSite1'], [s1, wells[2], 'fortSite2']].forEach(([s, w, name]) => {
    const aim = { x: w.x + (s.x - w.x) * 0.38, z: w.z + (s.z - w.z) * 0.38 };
    const f = need(ctx.scan({ test: (x, z) => ctx.dryClear(x, z, 10) && ctx.reach(x, z) && ctx.free(x, z, 4) && hyp({ x, z }, w) >= 12, score: (x, z) => hyp({ x, z }, aim) }), `o ${name}`);
    ctx.take(f, 14);
    extra[name] = pt(f);
  });
  // cabeça de ponte de cada lado (praia + água de onde chegam as barcaças e os reforços navais)
  const b1 = pickBeach(ctx, s0, 'a cabeça de ponte 1', { dMin: 14, dMax: 44, target: 28 });
  const b2 = pickBeach(ctx, s1, 'a cabeça de ponte 2', { dMin: 14, dMax: 44, target: 28 });
  [b1, b2].forEach((b, i) => {
    extra[`bridgehead${i + 1}`] = pt(b);
    extra[`bridgehead${i + 1}Sea`] = { ...ctx.waterNear(b.x, b.z, 8, 18), water: true };
  });
  extra.landingZone = extra.bridgehead1;
  // Ninho das Serpes (Clãs, lado do slot 1) e Aviário (Liga, lado do slot 0): atrás de cada base
  const behind = (s, other, name) => {
    const p = need(ctx.scan({
      test: (x, z) => ctx.dryClear(x, z, 6) && !ctx.isShore(x, z) && ctx.reach(x, z) && ctx.freeNear(x, z, 3, 14) && hyp({ x, z }, s) >= 16 && hyp({ x, z }, s) <= 38,
      score: (x, z) => -hyp({ x, z }, other)
    }), `o ${name}`);
    ctx.take(p, 10);
    extra[name] = pt(p);
  };
  behind(s1, s0, 'nestSite');
  behind(s0, s1, 'aviarySite');
  addGold(ctx, s0, 'expansion1', extra, { plain: true });
  addGold(ctx, s1, 'expansion2', extra, { plain: true });
  // oásis dos poços (visual): borda de estepe de 6,5 u e tapete de grama de 4 u
  for (const w of wells) {
    paintBiome(m, w.x, w.z, 6.5, BIOME.STEPPE, [BIOME.DESERT, BIOME.STEPPE]);
    paintBiome(m, w.x, w.z, 4, BIOME.GRASS, [BIOME.DESERT, BIOME.STEPPE, BIOME.GRASS]);
  }
}

// ---------------------------------------------------------------------------------------------------------------------------
// Palcos 4–6 (M2-04)
// ---------------------------------------------------------------------------------------------------------------------------
const ptw = (p) => ({ ...pt(p), water: true });
/** Fração (0–1) de pontos em dois anéis de raio `r` em torno de (x, z) que são água navegável do oceano (folga para frota). */
function openSea(ctx, x, z, r) {
  let n = 0, t = 0;
  for (let a = 0; a < 16; a++) for (const k of [0.5, 1]) { t++; if (ctx.oceanOk(x + Math.cos((a / 16) * Math.PI * 2) * r * k, z + Math.sin((a / 16) * Math.PI * 2) * r * k)) n++; }
  return n / t;
}
/** Fração de um anel de raio `rho` que é água (terreno abaixo da linha d'água). */
function wetFrac(ctx, x, z, rho) {
  let n = 0;
  for (let k = 0; k < 16; k++) { const t = (k / 16) * Math.PI * 2; if (ctx.hAt(x + Math.cos(t) * rho, z + Math.sin(t) * rho) < ctx.m.waterLevel) n++; }
  return n / 16;
}
const toward = (s, to, d) => { const L = hyp(s, to) || 1; return { x: s.x + ((to.x - s.x) / L) * d, z: s.z + ((to.z - s.z) / L) * d }; };
/** Ponto de terra seca (folga `r`) alcançável e livre, o mais próximo de `p`. */
const nearDry = (ctx, p, name, { r = 3, minR = 0, freeR = 3 } = {}) => need(ctx.scan({ test: (x, z) => ctx.dryClear(x, z, r) && ctx.reach(x, z) && ctx.free(x, z, freeR) && hyp({ x, z }, p) >= minR, score: (x, z) => hyp({ x, z }, p) }), name);
/** Sorteio determinístico barato por posição (ordem estável de candidatos sem PRNG). */
const jitter = (x, z) => { const v = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453; return v - Math.floor(v); };

/** Palco 4: espaço para Estaleiro/Doca em cada lado, naufrágios nos baixios, rotas das frotas roteirizadas. Poços (`well1..4`) vêm do assador. */
function postBaixio(ctx, extra) {
  const { m, s0, s1, half } = ctx;
  const cache = new Map();
  const wetSpot = (x, z) => { const k = x * 1000 + z; if (!cache.has(k)) cache.set(k, ctx.waterNear(x, z, 6, 18)); return cache.get(k); };
  const yardFor = (s, other, name) => {
    const p = need(ctx.scan({
      step: 1,
      test: (x, z) => ctx.isShore(x, z) && ctx.reach(x, z) && hyp({ x, z }, s) >= 14 && hyp({ x, z }, s) <= 54 && ctx.free(x, z, 5) && wetSpot(x, z) && openSea(ctx, wetSpot(x, z).x, wetSpot(x, z).z, 10) >= 0.55,
      score: (x, z) => Math.abs(hyp({ x, z }, s) - 30) - 0.1 * hyp({ x, z }, other)
    }), `o espaço do ${name}`);
    ctx.take(p, 14);
    return p;
  };
  // uma mina de expansão por lado: com 1 mina por base o ouro acaba e a partida IA×IA trava (soak, semente 5 hard)
  addGold(ctx, s0, 'expansion1', extra, { dMin: 20, dMax: 40, target: 28 });
  addGold(ctx, s1, 'expansion2', extra, { dMin: 20, dMax: 40, target: 28 });
  const y1 = yardFor(s0, s1, 'Estaleiro da Liga'), y2 = yardFor(s1, s0, 'Doca do Clã');
  extra.shipyard1 = pt(y1); extra.shipyard1Water = ptw(wetSpot(y1.x, y1.z));
  extra.shipyard2 = pt(y2); extra.shipyard2Water = ptw(wetSpot(y2.x, y2.z));
  // naufrágios: água navegável encostada num baixio (recife), longe da terra, dos poços, das docas e uns dos outros
  const wells = m.resources.filter((r) => r.type === 'oil');
  const placed = [extra.shipyard1Water, extra.shipyard2Water, ...wells];
  const nearReef = (x, z) => { for (let a = 0; a < 12; a++) { const h = ctx.hAt(x + Math.cos((a / 12) * Math.PI * 2) * 5, z + Math.sin((a / 12) * Math.PI * 2) * 5); if (h > 0.15 && h < 0.45) return true; } return false; };
  const awayFromLand = (x, z) => wetFrac(ctx, x, z, 9) >= 1;
  const targets = [{ x: 0, z: 0 }, { x: -half * 0.45, z: half * 0.35 * (s0.z > 0 ? -1 : 1) }, { x: half * 0.45, z: half * 0.35 * (s0.z > 0 ? 1 : -1) }];
  targets.forEach((t, i) => {
    const w = need(ctx.scan({
      step: 2,
      test: (x, z) => ctx.oceanOk(x, z) && nearReef(x, z) && awayFromLand(x, z) && placed.every((q) => hyp({ x, z }, q) >= 24),
      score: (x, z) => hyp({ x, z }, t)
    }), `o naufrágio ${i + 1}`);
    placed.push(w);
    extra[`wreck${i + 1}`] = ptw(w);
  });
  // rotas das frotas roteirizadas: pontos de partida junto à borda (lado de cada base) e ponto de encontro no meio do mar
  const edge = (to, name) => need(ctx.scan({ step: 4, test: (x, z) => Math.max(Math.abs(x), Math.abs(z)) >= half - 26 && ctx.oceanOk(x, z) && openSea(ctx, x, z, 8) >= 0.8, score: (x, z) => hyp({ x, z }, to) }), name);
  extra.fleetStart1 = ptw(edge(s0, 'a partida da frota 1'));
  extra.fleetStart2 = ptw(edge(s1, 'a partida da frota 2'));
  extra.fleetMid = ptw(need(ctx.scan({ step: 3, test: (x, z) => ctx.oceanOk(x, z) && openSea(ctx, x, z, 10) >= 0.8, score: (x, z) => hyp({ x, z }, { x: 0, z: 0 }) }), 'o encontro das frotas'));
}

/** Palco 5: bosque sagrado (clareira cercada de árvores), ninho de grifos numa ponta, clareiras, Salão do Bosque de cada lado e mata densa extra. */
function postCerne(ctx, extra) {
  const { m, s0, s1 } = ctx;
  const mid = { x: (s0.x + s1.x) / 2, z: (s0.z + s1.z) / 2 };
  const grove = need(ctx.scan({
    test: (x, z) => ctx.dryClear(x, z, 10) && ctx.reach(x, z) && ctx.free(x, z, 8) && hyp({ x, z }, s0) >= 38 && hyp({ x, z }, s1) >= 38,
    score: (x, z) => hyp({ x, z }, mid)
  }), 'o bosque sagrado');
  ctx.take(grove, 24);
  extra.sacredGrove = pt(grove);
  const pick = (x, z, k) => speciesForBiome(getBiomeAt(m, x, z), false, (jitter(x, z) + k * 0.31) % 1);
  for (let k = 0; k < 5; k++) { // anel de árvores em volta da clareira (as árvores nascem a 2–7 u do centro de cada bosque)
    const a = (k / 5) * Math.PI * 2 + 0.4;
    const x = r1(grove.x + Math.cos(a) * 16), z = r1(grove.z + Math.sin(a) * 16);
    if (ctx.dryClear(x, z, 4)) m.forests.push({ x, z, count: 12, radius: 5, species: pick(x, z, k) });
  }
  const nest = need(ctx.scan({
    step: 1,
    test: (x, z) => ctx.dryClear(x, z, 2.5) && ctx.reach(x, z) && ctx.free(x, z, 6) && hyp({ x, z }, s0) >= 40 && hyp({ x, z }, s1) >= 40 && hyp({ x, z }, grove) >= 30,
    score: (x, z) => -wetFrac(ctx, x, z, 10) * 60 - wetFrac(ctx, x, z, 18) * 30
  }), 'o ninho de grifos');
  ctx.take(nest, 14);
  extra.gryphonNest = pt(nest);
  // clareiras: uma a caminho do meio de cada lado e uma terceira fora do eixo
  const perp = { x: -(s1.z - s0.z), z: s1.x - s0.x };
  const Lp = Math.hypot(perp.x, perp.z) || 1;
  const spots = [toward(s0, mid, 44), toward(s1, mid, 44), { x: mid.x + (perp.x / Lp) * 34, z: mid.z + (perp.z / Lp) * 34 }];
  spots.forEach((p, i) => {
    const c = need(ctx.scan({ test: (x, z) => ctx.dryClear(x, z, 9) && ctx.reach(x, z) && ctx.free(x, z, 6) && hyp({ x, z }, s0) >= 28 && hyp({ x, z }, s1) >= 28, score: (x, z) => hyp({ x, z }, p) }), `a clareira ${i + 1}`);
    ctx.take(c, 16);
    extra[`clearing${i + 1}`] = pt(c);
  });
  // Salão do Bosque (posto madeireiro) de cada lado: o do slot 1 é o alvo da Liga; o do slot 0, o do assalto da Horda
  for (const [s, name] of [[s0, 'lumberHall1'], [s1, 'lumberHall2']]) {
    const p = need(ctx.scan({ test: (x, z) => ctx.dryClear(x, z, 7) && ctx.reach(x, z) && ctx.free(x, z, 5) && hyp({ x, z }, s) >= 26 && hyp({ x, z }, s) <= 42, score: (x, z) => Math.abs(hyp({ x, z }, s) - 33) + 0.25 * hyp({ x, z }, mid) }), `o ${name}`);
    ctx.take(p, 14);
    extra[name] = pt(p);
  }
  // Oren e os dois Magos aliados chegam por perto do jogador (A05)
  extra.orenStart = pt(ctx.take(nearDry(ctx, toward(s0, mid, 24), 'o ponto do Oren', { r: 4 }), 8));
  // mata densa extra: bosques em toda a ilha, longe das bases, do bosque sagrado e dos já postos (mais madeira para a campanha)
  let added = 0;
  const scored = [];
  for (let z = -ctx.half + 10; z <= ctx.half - 10; z += 5) for (let x = -ctx.half + 10; x <= ctx.half - 10; x += 5) scored.push({ x, z, k: jitter(x, z) });
  scored.sort((a, b) => a.k - b.k);
  for (const c of scored) {
    if (added >= 14) break;
    if (!ctx.dryClear(c.x, c.z, 4) || !ctx.reach(c.x, c.z) || !ctx.free(c.x, c.z, 4)) continue;
    if (hyp(c, s0) < 30 || hyp(c, s1) < 30 || hyp(c, grove) < 24) continue;
    if (m.forests.some((f) => hyp(c, f) < 16)) continue;
    const x = r1(c.x), z = r1(c.z);
    m.forests.push({ x, z, count: 14, radius: 10, species: pick(x, z, added) });
    ctx.take({ x, z }, 14);
    added++;
  }
}

/** Palco 6: quatro bases (jogador, Lanças Quebradas, Sal Cinzento, aliado), Farol Boreal no meio, comboio entre o aliado e o jogador, lagos congelados. */
function postGeada(ctx, extra) {
  const { m } = ctx;
  const S = m.startSlots;
  extra.enemy1Start = pt(S[1]); extra.enemy2Start = pt(S[2]); extra.allyStart = pt(S[3]);
  const maxD = (x, z) => Math.max(...S.map((s) => hyp({ x, z }, s)));
  const light = need(ctx.scan({
    test: (x, z) => ctx.dryClear(x, z, 6) && ctx.reach(x, z) && ctx.free(x, z, 8) && S.every((s) => hyp({ x, z }, s) >= 34),
    score: (x, z) => maxD(x, z)
  }), 'o Farol Boreal');
  ctx.take(light, 16);
  extra.lighthouse = pt(light);
  extra.enemy1Fort = pt(ctx.take(nearDry(ctx, toward(S[1], light, 22), 'o forte dos Lanças Quebradas', { r: 5 }), 10));
  extra.allyFort = pt(ctx.take(nearDry(ctx, toward(S[3], light, 20), 'o forte de Brumar', { r: 5 }), 10));
  extra.allyHeroStart = pt(ctx.take(nearDry(ctx, toward(S[3], light, 10), 'a Dama Aurora', { r: 3 }), 6));
  extra.convoyStart = pt(ctx.take(nearDry(ctx, toward(S[3], S[0], 26), 'o início do comboio', { r: 3 }), 6));
  extra.convoyEnd = pt(ctx.take(nearDry(ctx, toward(S[0], S[3], 26), 'o fim do comboio', { r: 3 }), 6));
  // uma mina de expansão por base (pouco ouro, mas o soak trava com 1 mina por lado)
  S.forEach((s, i) => addGold(ctx, s, `expansion${i + 1}`, extra, { dMin: 22, dMax: 42, target: 30 }));
  // lagos congelados: água rasa de gelo (bioma gelo) cercada de terra
  const lakes = [];
  const isLake = (x, z) => {
    const h = ctx.hAt(x, z);
    if (!(h > 0.15 && h < 0.45) || getBiomeAt(m, x, z) !== BIOME.ICE) return false;
    let land = 0;
    for (let a = 0; a < 8; a++) if (ctx.hAt(x + Math.cos((a / 8) * Math.PI * 2) * 15, z + Math.sin((a / 8) * Math.PI * 2) * 15) >= 1.8) land++;
    return land >= 7;
  };
  for (let z = -ctx.half + 8; z <= ctx.half - 8; z += 3) for (let x = -ctx.half + 8; x <= ctx.half - 8; x += 3) if (isLake(x, z) && lakes.every((q) => hyp({ x, z }, q) >= 16)) lakes.push({ x, z });
  if (lakes.length < 2) throw new Error('campanha: poucos lagos congelados');
  lakes.slice(0, 3).forEach((p, i) => { extra[`lake${i + 1}`] = ptw(p); });
}

// ---------------------------------------------------------------------------------------------------------------------------
// Palcos 10–12 (M2-06): Cinzara, o continente orc, visto pela Aliança. O slot 0 é sempre o sítio do Marco da Colônia / Bastião (âncora
// `colonyMark` / `bastion`); os outros slots são os de Skarn (e Hurgan). Praias e mar: `pickLanding`; marcos de missão em volta.
// ---------------------------------------------------------------------------------------------------------------------------
const angDiff = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

/** Praia de desembarque: terra seca com água a <= 4 u, alcançável por terra, com mar aberto (espaço para barcaças) à frente. */
function pickLanding(ctx, s0, other, { dMin = 30, dMax = 56, target = 42 } = {}) {
  const cache = new Map();
  const wet = (x, z) => { const k = x * 1000 + z; if (!cache.has(k)) cache.set(k, ctx.waterNear(x, z, 6, 16)); return cache.get(k); };
  const p = need(ctx.scan({
    step: 1,
    test: (x, z) => {
      const d = hyp({ x, z }, s0);
      if (d < dMin || d > dMax || !ctx.isShore(x, z) || !ctx.reach(x, z) || !ctx.free(x, z, 4)) return false;
      const w = wet(x, z);
      return !!w && openSea(ctx, w.x, w.z, 8) >= 0.6;
    },
    score: (x, z) => Math.abs(hyp({ x, z }, s0) - target) - 0.05 * hyp({ x, z }, other)
  }), 'a praia de desembarque');
  return { p, sea: wet(p.x, p.z) };
}

/** Ponto de mar aberto (passo 4) com folga para frota, a `d` u de `from`, o mais perto de `d`; `away` afasta de pontos já postos. */
function openWater(ctx, from, d, name, { minR = 0, maxR = 1e9, around = null } = {}) {
  return need(ctx.scan({
    step: 4,
    test: (x, z) => ctx.oceanOk(x, z) && openSea(ctx, x, z, 9) >= 0.8 && (!around || (hyp({ x, z }, around) >= minR && hyp({ x, z }, around) <= maxR)),
    score: (x, z) => Math.abs(hyp({ x, z }, from) - d)
  }), name);
}

/** Palco 10: praia de desembarque no mar aberto a oeste, 3 torres da guarda costeira em volta, guarnição, Poço Velho escondido, partida das 2 Barcaças. */
function postCosta(ctx, extra) {
  const { m, s0, s1 } = ctx;
  extra.colonyMark = pt(s0); // sítio do Marco da Colônia (`spawnBuilding`): o pátio do slot 0
  const { p: land, sea } = pickLanding(ctx, s0, s1, { dMin: 30, dMax: 58, target: 44 });
  ctx.take(land, 5);
  extra.landingZone = pt(land);
  extra.unloadSea = ptw(sea); // `UNLOAD`: água navegável junto à praia onde as Barcaças encostam
  // partida das Barcaças: 2 pontos de mar aberto, a ~70 u da praia, lado a lado (`LOAD` é feito antes, a bordo)
  const b1 = openWater(ctx, land, 70, 'a partida da Barcaça 1');
  const b2 = openWater(ctx, land, 70, 'a partida da Barcaça 2', { minR: 10, maxR: 24, around: b1 });
  extra.bargeStart1 = ptw(b1); extra.bargeStart2 = ptw(b2);
  // guarda costeira: 3 torres a 11–26 u da praia, em direções diferentes (>= 0,45 rad), em terra firme alcançável
  const towers = [];
  for (let k = 0; k < 3; k++) {
    const t = need(ctx.scan({
      step: 1,
      test: (x, z) => {
        const d = hyp({ x, z }, land);
        return d >= 11 && d <= 26 && ctx.dryClear(x, z, 2.5) && ctx.reach(x, z) && ctx.free(x, z, -4)
          && towers.every((q) => hyp({ x, z }, q) >= 11 && angDiff(Math.atan2(z - land.z, x - land.x), Math.atan2(q.z - land.z, q.x - land.x)) >= 0.45);
      },
      score: (x, z) => Math.abs(hyp({ x, z }, land) - 18) + 0.15 * hyp({ x, z }, s0)
    }), `a torre costeira ${k + 1}`);
    ctx.take(t, 8);
    towers.push(t);
    extra[`coastTower${k + 1}`] = pt(t);
  }
  // guarnição: acampamento da IA de Skarn atrás das torres, no caminho para o interior
  extra.garrison = pt(ctx.take(nearDry(ctx, toward(land, s1, 34), 'a guarnição costeira', { r: 6, freeR: 5 }), 10));
  // Poço Velho (objetivo opcional): ponto seco escondido, longe da praia e das bases
  const well = need(ctx.scan({
    test: (x, z) => ctx.dryClear(x, z, 4) && ctx.reach(x, z) && ctx.free(x, z, 6) && hyp({ x, z }, land) >= 52 && hyp({ x, z }, s0) >= 30 && hyp({ x, z }, s1) >= 30,
    score: (x, z) => Math.abs(hyp({ x, z }, s0) - 64) + 0.4 * Math.abs(hyp({ x, z }, s1) - 56)
  }), 'o Poço Velho');
  ctx.take(well, 10);
  extra.oldWell = pt(well);
  // uma mina de expansão por lado (soak: com 1 mina por base o ouro acaba e a partida IA×IA trava)
  addGold(ctx, s0, 'expansion1', extra, { dMin: 20, dMax: 40, target: 28 });
  addGold(ctx, s1, 'expansion2', extra, { dMin: 20, dMax: 40, target: 28 });
  void m;
}

/** Palco 11: Marco no sítio do slot 0, praia de reforço por mar, rotas das 3 incursões, clã dissidente, comboio praia→colônia. */
function postEstepe(ctx, extra) {
  const { m, s0 } = ctx;
  const S = m.startSlots;
  const s1 = S[1], s2 = S[2];
  extra.colonyMark = pt(s0);
  extra.skarnStart = pt(s1); extra.hurganStart = pt(s2);
  const { p: land, sea } = pickLanding(ctx, s0, s1, { dMin: 26, dMax: 54, target: 38 });
  ctx.take(land, 12);
  extra.landingZone = pt(land);
  extra.reinforceSea = ptw(sea); // Barcaças de reforço (a cada 4 min) chegam por aqui
  extra.convoyStart = pt(land);
  extra.convoyEnd = pt(ctx.take(nearDry(ctx, toward(s0, land, 14), 'o fim do comboio', { r: 3, freeR: 3 }), 6));
  // rotas das incursões: uma por base inimiga (a ~52 u do Marco, rumo ao inimigo) e uma pelo meio das duas
  const mid12 = { x: (s1.x + s2.x) / 2, z: (s1.z + s2.z) / 2 };
  const raidAt = (aim, name) => ctx.take(nearDry(ctx, aim, name, { r: 4, freeR: 4 }), 8);
  extra.raid1 = pt(raidAt(toward(s0, s1, 56), 'a incursão 1'));
  extra.raid2 = pt(raidAt(toward(s0, s2, 56), 'a incursão 2'));
  extra.raid3 = pt(raidAt(toward(s0, mid12, 74), 'a incursão 3'));
  // clã dissidente (conversão por `transfer`): acampamento isolado, longe das três bases
  const clan = need(ctx.scan({
    test: (x, z) => ctx.dryClear(x, z, 7) && ctx.reach(x, z) && ctx.free(x, z, 6) && hyp({ x, z }, s0) >= 44 && hyp({ x, z }, s0) <= 90 && hyp({ x, z }, s1) >= 38 && hyp({ x, z }, s2) >= 38,
    score: (x, z) => Math.abs(hyp({ x, z }, s0) - 62) + 0.4 * Math.abs(hyp({ x, z }, s1) - hyp({ x, z }, s2))
  }), 'o clã dissidente');
  ctx.take(clan, 14);
  extra.dissidentClan = pt(clan);
  S.forEach((s, i) => addGold(ctx, s, `expansion${i + 1}`, extra, { dMin: 20, dMax: 40, target: 28 }));
}

// ---- Palco 12: promontório e estreito ----
const straitCache = new WeakMap();
let lastStrait = null;
/** Par mais próximo (ponta do continente, costa de uma ilha) do mapa gerado: o estreito do Cabo Ferrugem. */
function straitOf(map) {
  if (straitCache.has(map)) return straitCache.get(map);
  const G = map.grid, cell = map.size / G, half = map.size / 2;
  const at = (i, j) => (i < 0 || j < 0 || i >= G || j >= G ? 0 : map.land[j * G + i]);
  const shore = (i, j) => at(i, j) && (!at(i + 1, j) || !at(i - 1, j) || !at(i, j + 1) || !at(i, j - 1));
  const cont = [], isl = [];
  for (let j = 0; j < G; j += 2) for (let i = 0; i < G; i += 2) {
    if (!shore(i, j)) continue;
    const o = map.owner[j * G + i];
    (o === 0 ? cont : isl).push({ x: (i + 0.5) * cell - half, z: (j + 0.5) * cell - half });
  }
  let best = null, bd = Infinity;
  for (const a of cont) for (const b of isl) { const d = hyp(a, b); if (d < bd) { bd = d; best = { c: a, i: b, d }; } }
  const out = best ? { ...best, mid: { x: (best.c.x + best.i.x) / 2, z: (best.c.z + best.i.z) / 2 } } : null;
  straitCache.set(map, out);
  lastStrait = out;
  return out;
}
/** Filtro de base do slot 0 do palco 12: o Bastião fica no promontório, a 20–46 u da ponta que forma o estreito. */
function nearStrait(x, z, map) { const st = straitOf(map); return !!st && hyp({ x, z }, st.c) >= 20 && hyp({ x, z }, st.c) <= 46; }

/** Palco 12: Bastião no promontório (slot 0), estreito entre a ponta e as ilhas, 3 docas inimigas no litoral, partida da frota e do chefe. */
function postCabo(ctx, extra) {
  const { m, s0, s1, half } = ctx;
  const st = lastStrait;
  if (!st) throw new Error('campanha: sem estreito');
  extra.bastion = pt(s0);
  const sw = need(ctx.oceanOk(st.mid.x, st.mid.z) ? st.mid : ctx.waterNear(st.mid.x, st.mid.z, 1, 10), 'o estreito');
  extra.strait = ptw(sw);
  if (st.d > 26) throw new Error(`campanha: estreito largo demais (${Math.round(st.d)} u)`);
  // 3 docas orcs no litoral do continente voltado ao estreito: terra alcançável com água navegável diante
  const docks = [];
  for (let k = 0; k < 3; k++) {
    const d = need(ctx.scan({
      step: 1,
      test: (x, z) => {
        const ds = hyp({ x, z }, sw);
        return ds >= 16 && ds <= 66 && hyp({ x, z }, s0) >= 24 && ctx.isShore(x, z) && ctx.reach(x, z) && ctx.free(x, z, 2)
          && docks.every((q) => hyp({ x, z }, q) >= 20) && ctx.waterNear(x, z, 5, 14);
      },
      score: (x, z) => Math.abs(hyp({ x, z }, sw) - 40) + 0.05 * hyp({ x, z }, s1)
    }), `a doca ${k + 1}`);
    ctx.take(d, 9);
    docks.push(d);
    extra[`dock${k + 1}`] = pt(d);
  }
  // frota da Liga: dois pontos de mar aberto no oeste, ligados ao estreito pelo oceano
  const f1 = openWater(ctx, { x: -half + 22, z: sw.z }, 0, 'a partida da frota');
  extra.fleetStart = ptw(f1);
  extra.fleetStart2 = ptw(openWater(ctx, f1, 10, 'a partida da frota 2', { minR: 8, maxR: 20, around: f1 }));
  // chefe e ondas do ataque final: a leste, rumo ao Bastião
  extra.bossStart = pt(ctx.take(nearDry(ctx, toward(s1, s0, 16), 'o chefe', { r: 4, freeR: 4 }), 8));
  const L = hyp(s0, s1) || 1, px = -(s1.z - s0.z) / L, pz = (s1.x - s0.x) / L;
  const w0 = toward(s0, s1, 72);
  extra.waveStart1 = pt(ctx.take(nearDry(ctx, { x: w0.x + px * 24, z: w0.z + pz * 24 }, 'a onda 1', { r: 4, freeR: 4 }), 8));
  extra.waveStart2 = pt(ctx.take(nearDry(ctx, { x: w0.x - px * 24, z: w0.z - pz * 24 }, 'a onda 2', { r: 4, freeR: 4 }), 8));
  addGold(ctx, s0, 'expansion1', extra, { dMin: 20, dMax: 40, target: 28 });
  addGold(ctx, s1, 'expansion2', extra, { dMin: 20, dMax: 40, target: 28 });
  void m;
}

const POST = freeze({ 'camp-01-baia-de-aurelan': postBaia, 'camp-02-pouso-do-encontro': postPouso, 'camp-03-pedra-mae': postPedra, 'camp-04-baixio-do-breu': postBaixio, 'camp-05-cerne-verde': postCerne, 'camp-06-a-geada': postGeada, 'camp-07-brejo-mudo': postBrejo, 'camp-08-fornalha': postFornalha, 'camp-09-miragem': postMiragem, 'camp-10-costa-ferrugem': postCosta, 'camp-11-estepe-do-vento': postEstepe, 'camp-12-cabo-ferrugem': postCabo });

// ---------------------------------------------------------------------------------------------------------------------------
// Montagem
// ---------------------------------------------------------------------------------------------------------------------------

/**
 * Gera o mapa de campanha `id` com a semente pedida.
 * @returns {{ ok: boolean, id: string, seed: number, seedUsed?: number, attempts: object[], world?: object, mapDef?: object, extraAnchors?: object, verification?: object, error?: string }}
 */
export function buildCampaignMap(id, { seed = 1, tries = 12 } = {}) {
  const preset = CAMPAIGN_PRESETS[id];
  if (!preset) throw new Error(`campanha: mapa desconhecido "${id}" (${CAMPAIGN_IDS.join(', ')})`);
  const attempts = [];
  for (let k = 0; k < tries; k++) {
    const world = buildCoastWorld(preset, { seed: seed + k, tries: 1, id, name: CAMPAIGN_NAMES[id].pt, woodTarget: preset.woodTarget });
    if (!world.ok) { attempts.push({ seed: seed + k, stage: world.attempts[0]?.stage ?? 'mundo', failures: world.attempts[0]?.failures ?? [] }); continue; }
    try {
      const out = finish(id, world, seed + k);
      return { ok: true, id, seed, seedUsed: seed + k, attempts, world, ...out };
    } catch (e) {
      attempts.push({ seed: seed + k, stage: 'campanha', failures: [e.message] });
    }
  }
  return { ok: false, id, seed, attempts };
}

function finish(id, world, seedUsed) {
  const m = structuredClone(world.mapDef);
  m.id = id;
  m.name = CAMPAIGN_NAMES[id].pt;
  m.hidden = true; // não aparece na lista da Escaramuça
  for (const r of m.resources) if (r.type === 'gold') r.amount = GOLD_AMOUNT;
  const ctx = makeCtx(m);
  const extra = {};
  POST[id](ctx, extra, world);
  // âncoras: padrão (recalculadas com as jazidas/acampamentos novos) + as da ficha; as escritas à mão prevalecem
  const base = { ...m.anchors };
  delete m.anchors;
  const anchors = { ...defaultAnchors(m), ...extra };
  void base;
  // chave `anchors` logo antes de `meta` (mesma ordem do assador)
  const out = {};
  for (const [k, v] of Object.entries(m)) {
    if (k === 'meta') out.anchors = anchors;
    out[k] = v;
  }
  out.meta = { ...m.meta, campaign: id, seedUsed };
  const preset = CAMPAIGN_PRESETS[id];
  // afinar corredor: ≈ 2/3 das árvores da faixa entre as bases/acampamentos somem (visibilidade), sem tirar a madeira das bases
  const woodMin = preset.woodTarget ?? 8000;
  const thin = thinCorridor(out, { ...CORRIDOR_PARAMS, seed: seedUsed, label: id, woodMin, woodFn: makeWoodFn(out, { buildPathfinder, floodFill, isReached, estimateWood }) });
  out.forests = thin.forests;
  out.meta.corridorThin = { width: CORRIDOR_PARAMS.width, keepFrac: Math.round(CORRIDOR_PARAMS.keepFrac * 100) / 100, clusters: thin.thinned.length, trees: [thin.before, thin.after], cut: thin.thinned };
  const verification = verifyCoastWorld(out, { naval: !!preset.naval, woodTarget: preset.woodTarget });
  if (!verification.ok) throw new Error('mundo: ' + verification.failures.slice(0, 2).join(' | '));
  // âncoras de terra alcançáveis a partir do slot 0 por terra; de água, no oceano
  const c2 = makeCtx(out);
  for (const [name, a] of Object.entries(anchors)) {
    if (a.water) {
      if (/^lake/.test(name)) { if (!(c2.hAt(a.x, a.z) < out.waterLevel)) throw new Error(`âncora ${name}: lago fora da água`); } // lago congelado: água interior, não é oceano
      else if (!c2.oceanOk(a.x, a.z)) throw new Error(`âncora ${name}: água fora do oceano navegável`);
    }
    else if (!c2.reach(a.x, a.z) && !/^(well|ford)/.test(name)) throw new Error(`âncora ${name}: sem caminho por terra desde o slot 0`);
  }
  return { mapDef: out, extraAnchors: extra, verification };
}

export { COAST_PRESETS };
