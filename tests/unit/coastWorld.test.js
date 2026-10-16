import { describe, it, expect, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import * as coast from '../../src/data/maps/coast/index.js';
import { registerMap, unregisterMap } from '../../src/data/maps/index.js';
import { validateMapDef } from '../../src/data/maps/validate.js';
import { buildPathfinder, floodFill, isReached } from '../../src/data/maps/generator.js';
import { getHeightForMap } from '../../src/sim/terrainGenerators.js';
import { paintedHeight, decodeHeights } from '../../src/data/maps/painted.js';
import { decodeLavaGrid } from '../../src/data/maps/lava.js';
import { decodeBiomeGrid, BIOME } from '../../src/data/maps/biome.js';
import { NAVAL_MAX_HEIGHT } from '../../src/data/combat.js';
import { Terrain } from '../../src/sim/Terrain.js';
import { START_LAYOUT, layoutAt, validateOilWells, validateNeutrals } from '../../src/sim/MatchConfig.js';
import { TILESETS } from '../../src/data/tilesets.js';
import { measureWood, WOOD_TARGET as GAME_WOOD_TARGET, WOOD_RADIUS as GAME_WOOD_RADIUS } from '../../tools/lib/woodStats.mjs';

const {
  COAST_PRESETS, COAST_PRESET_IDS, getCoastPreset, buildCoastWorld, verifyCoastWorld, estimateWood, bakedHeightFn, bakeTerrain,
  DEFAULT_BASE_LAYOUT, WOOD_TARGET, WOOD_RADIUS, generateCoast
} = coast;

/**
 * Presets e mundo assado (docs/specs/MUNDO-TERRENO-MAPAS.md §2.4–2.5 e §7 passo 1): cada preset gera, por semente, um `mapDef`
 * `painted` completo (bases, jazidas, florestas, vaus, poços, critters) que passa nas regras de jogo: base em terra seca com 14 u
 * livres, madeira alcançável >= 8000 por jogador (medida com o GameManager e o Pathfinder REAIS), conectividade terrestre e rota naval.
 */
const SEEDS = [1, 2, 3];
const PLAYERS = { 'dois-continentes': 2, 'duelo-continental': 2, 'arquipelago-vivo': 4, 'ilha-unica': 2, 'mundo-campanha': 2 };
const worlds = new Map();
const world = (id, seed) => { const k = `${id}:${seed}`; if (!worlds.has(k)) worlds.set(k, buildCoastWorld(id, { seed })); return worlds.get(k); };
const hashStr = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619); return h >>> 0; };
const hyp = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const registered = [];
afterAll(() => { for (const id of registered) unregisterMap(id); });

describe('presets: tabela do spec §2.5', () => {
  it('os 5 presets do spec existem, com nome em PT-BR, tileset existente e tamanho de mapa jogável', () => {
    expect([...COAST_PRESET_IDS].sort()).toEqual(['arquipelago-vivo', 'dois-continentes', 'duelo-continental', 'ilha-unica', 'mundo-campanha']);
    for (const id of COAST_PRESET_IDS) {
      const p = COAST_PRESETS[id];
      expect(p.id).toBe(id);
      expect(p.name.length).toBeGreaterThan(3);
      expect(TILESETS[p.tileset], `${id}: tileset ${p.tileset}`).toBeDefined();
      expect(p.options.size).toBeGreaterThanOrEqual(168); // regra P-7: mapa jogável >= 168
      expect(p.options.size).toBeLessThanOrEqual(256);
      expect(p.options.size % 8).toBe(0); // célula dyadic: a rotação de 180° é exata
      expect(p.options.grid).toBe(p.options.size); // 1 célula = 1 u, o mesmo passo do mapa assado
      expect(getCoastPreset(id)).toBe(p);
      expect(Object.isFrozen(p)).toBe(true);
    }
    expect(() => getCoastPreset('nao-existe')).toThrow(/preset desconhecido/);
  });

  it('o duelo é o único simétrico; só mundo-campanha e dois-continentes têm lava; arquipélago não tem rios', () => {
    expect(COAST_PRESETS['duelo-continental'].options.symmetry).toBe('rotate');
    for (const id of COAST_PRESET_IDS) if (id !== 'duelo-continental') expect(COAST_PRESETS[id].options.symmetry ?? 'none').toBe('none');
    expect(COAST_PRESETS['dois-continentes'].options.lava).toBe(true);
    expect(COAST_PRESETS['mundo-campanha'].options.lava).toBe(true);
    expect(COAST_PRESETS['arquipelago-vivo'].options.rivers).toBe(0);
    expect(COAST_PRESETS['arquipelago-vivo'].layout.bases).toHaveLength(4);
  });

  it('as constantes de madeira do módulo são as do jogo (tools/lib/woodStats.mjs) e o layout padrão é o START_LAYOUT', () => {
    expect(WOOD_TARGET).toBe(GAME_WOOD_TARGET);
    expect(WOOD_RADIUS).toBe(GAME_WOOD_RADIUS);
    expect(JSON.parse(JSON.stringify(DEFAULT_BASE_LAYOUT))).toEqual(JSON.parse(JSON.stringify(START_LAYOUT)));
  });
});

describe('mundo assado: formato, regras de base e validateMapDef', () => {
  for (const id of COAST_PRESET_IDS) {
    for (const seed of SEEDS) {
      it(`${id}, seed ${seed}: mapa painted completo, sem erros no validateMapDef e com as regras de base`, () => {
        const w = world(id, seed);
        expect(w.ok, JSON.stringify(w.attempts.map((a) => a.failures))).toBe(true);
        expect(w.verification.geo.ok).toBe(true);
        expect(w.verification.world.ok).toBe(true);
        expect(w.seed).toBeGreaterThanOrEqual(seed);
        const def = w.mapDef, P = COAST_PRESETS[id];
        expect(def.id).toBe(`mundo-${id}-${seed}`);
        expect(def.terrain.generator).toBe('painted');
        expect(def.terrain.params.cell).toBe(1);
        expect(def.terrain.params.nodes).toBe(def.size + 1);
        expect(decodeHeights(def.terrain.params.data)).toHaveLength((def.size + 1) ** 2);
        expect(def.size).toBe(P.options.size);
        expect(def.playable).toBe(def.size - 12);
        expect(def.waterLevel).toBe(0.5);
        expect(def.tileset).toBe(P.tileset);
        expect(def.startSlots).toHaveLength(PLAYERS[id]);
        expect(def.maxPlayers).toBe(PLAYERS[id]);
        expect(def.meta).toMatchObject({ generator: 'coast', preset: id, seed, seedUsed: w.seed });
        expect(def.generated).toBeUndefined(); // mapa assado: o replay não tenta regenerá-lo
        expect(Array.isArray(def.fords) && Array.isArray(def.resources) && Array.isArray(def.forests) && Array.isArray(def.neutrals)).toBe(true);
        // validador do editor: nenhum erro (os avisos de "base desconectada/inalcançável" são esperados nos mapas de vários continentes)
        const r = validateMapDef(def, { checkId: false });
        expect(r.errors, JSON.stringify(r.errors)).toEqual([]);
        if (!P.naval) expect(r.warnings.map((x) => x.code)).toEqual([]);
        expect(() => validateNeutrals(def)).not.toThrow();
        expect(() => validateOilWells(def)).not.toThrow();
        // JSON puro: sobrevive a um ciclo de serialização e continua válido
        const copy = JSON.parse(JSON.stringify(def));
        expect(validateMapDef(copy, { checkId: false }).errors).toEqual([]);
        expect(getHeightForMap(copy, def.startSlots[0].x, def.startSlots[0].z)).toBe(getHeightForMap(def, def.startSlots[0].x, def.startSlots[0].z));
      });

      it(`${id}, seed ${seed}: bases em terra seca com 14 u livres, jazidas a ~15–18 u, serraria a >= 9 u das jazidas e a <= 12 u de um bosque, unidades à frente`, () => {
        const def = world(id, seed).mapDef;
        const h = (p) => getHeightForMap(def, p.x, p.z);
        const terrain = new Terrain(def);
        def.startSlots.forEach((s, i) => {
          expect(h(s)).toBeGreaterThanOrEqual(1.95);
          for (let a = 0; a < 24; a++) for (const rho of [4, 8, 12, 13.5]) {
            const p = { x: s.x + Math.cos((a / 24) * Math.PI * 2) * rho, z: s.z + Math.sin((a / 24) * Math.PI * 2) * rho };
            expect(h(p), `base ${i}: (${p.x.toFixed(1)}, ${p.z.toFixed(1)}) a ${rho} u do pátio`).toBeGreaterThanOrEqual(1.8);
            expect(terrain.isLava(p.x, p.z)).toBe(false);
          }
          const lay = layoutAt(s);
          for (const b of [...lay.buildings, ...lay.units]) expect(h(b), `base ${i}: ${b.role}`).toBeGreaterThanOrEqual(1.8);
          for (const u of s.layout.units) expect(u.dz, 'unidades nascem à frente do HQ (dz > 0)').toBeGreaterThan(0);
          const lumber = lay.buildings.find((b) => b.role === 'lumber');
          const mines = def.resources.filter((r) => r.type !== 'oil' && hyp(r, s) < 25);
          expect(mines.map((r) => r.type).sort()).toEqual(['gold', 'stone']);
          for (const r of mines) {
            expect(hyp(lumber, r), 'serraria a >= 9 u da mina').toBeGreaterThanOrEqual(9);
            expect(hyp(r, s)).toBeGreaterThanOrEqual(14.5);
            expect(hyp(r, s)).toBeLessThanOrEqual(18.5);
            expect(h(r)).toBeGreaterThanOrEqual(1.8);
            for (const b of lay.buildings) expect(hyp(r, b), `mina a ${hyp(r, b).toFixed(1)} de ${b.role}`).toBeGreaterThanOrEqual(6.5);
          }
          expect(Math.min(...def.forests.map((f) => hyp(f, lumber))), 'serraria próxima de um arvoredo (regra P-14)').toBeLessThanOrEqual(12);
          for (const f of def.forests) expect(hyp(f, s), 'bosque a >= 27 u do pátio').toBeGreaterThanOrEqual(27);
        });
        const half = def.playable / 2;
        for (const f of def.forests) expect(Math.max(Math.abs(f.x), Math.abs(f.z)) + f.radius).toBeLessThanOrEqual(half - 1);
      });
    }
  }

  it('o formato assado: biomeGrid (RLE) decodifica, a lava coincide com o bioma LAVA e as alturas cabem no Int8', () => {
    for (const id of COAST_PRESET_IDS) {
      const def = world(id, 1).mapDef;
      const n = def.terrain.params.nodes;
      const biomes = decodeBiomeGrid(def.biomeGrid);
      expect(biomes, id).toHaveLength(n * n);
      expect(Math.max(...biomes)).toBeLessThanOrEqual(12);
      const heights = decodeHeights(def.terrain.params.data);
      expect(Math.max(...heights) / 10, id).toBeLessThanOrEqual(9); // cume <= 9 (limite do painted: 12,7)
      expect(Math.min(...heights) / 10).toBeGreaterThanOrEqual(-12.8);
      if (def.lavaGrid) {
        const lava = decodeLavaGrid(def.lavaGrid.data);
        let lavaNodes = 0;
        for (let k = 0; k < lava.length; k++) { expect(biomes[k] === BIOME.LAVA, `nó ${k}`).toBe(lava[k] === 1); if (lava[k]) { lavaNodes++; expect(heights[k]).toBe(4); } }
        expect(lavaNodes).toBeGreaterThan(0);
      } else {
        expect(biomes.includes(BIOME.LAVA), id).toBe(false);
      }
    }
  });

  it('bakedHeightFn é a mesma interpolação de paintedHeight (o planejador enxerga as alturas do jogo)', () => {
    const w = world('dois-continentes', 1);
    const f = bakedHeightFn(w.baked);
    for (let k = 0; k < 300; k++) {
      const x = ((k * 37) % 211) - 105.5, z = ((k * 53) % 199) - 99.3;
      expect(f(x, z)).toBe(paintedHeight(w.mapDef, x, z));
    }
    expect(bakeTerrain(w.map, { cell: 1 }).heights).toEqual(w.baked.heights);
  });

  it('lava (dois-continentes e mundo-campanha): grade de lava no mapa, Terrain.isLava e bloqueio; a ilha vulcânica tem >= 2 áreas', () => {
    for (const id of ['dois-continentes', 'mundo-campanha']) {
      const w = world(id, 1);
      expect(w.mapDef.lavaGrid, id).toBeDefined();
      expect(w.map.lava.areaCount).toBeGreaterThanOrEqual(2);
      const t = new Terrain(w.mapDef);
      let found = 0;
      for (let x = -w.mapDef.size / 2; x < w.mapDef.size / 2; x += 2) for (let z = -w.mapDef.size / 2; z < w.mapDef.size / 2; z += 2) if (t.isLava(x, z)) { found++; expect(t.isWalkable(x, z)).toBe(false); expect(t.isWater(x, z)).toBe(false); }
      expect(found).toBeGreaterThan(10);
    }
    for (const id of ['duelo-continental', 'ilha-unica', 'arquipelago-vivo']) expect(world(id, 1).mapDef.lavaGrid, id).toBeUndefined();
  });

  it('os vaus do mapa assado são os vaus dos rios (mesma contagem, em terra seca)', () => {
    for (const id of ['dois-continentes', 'duelo-continental', 'ilha-unica', 'mundo-campanha']) {
      const w = world(id, 1);
      expect(w.mapDef.fords).toHaveLength(w.map.rivers.fords.length);
      expect(w.mapDef.fords.length).toBeGreaterThanOrEqual(2);
      for (const f of w.mapDef.fords) expect(getHeightForMap(w.mapDef, f.x, f.z), `vau (${f.x}, ${f.z})`).toBeGreaterThanOrEqual(2.0);
    }
    expect(world('arquipelago-vivo', 1).mapDef.fords).toEqual([]);
  });
});

describe('madeira alcançável por jogador >= 8000 (GameManager e Pathfinder reais, tools/lib/woodStats.mjs)', () => {
  for (const id of COAST_PRESET_IDS) {
    it(`${id}: todo jogador alcança >= ${GAME_WOOD_TARGET} de madeira por terra a <= ${GAME_WOOD_RADIUS} u do pátio (mapas 1–3 × partidas 1–3)`, () => {
      for (const seed of SEEDS) {
        const def = world(id, seed).mapDef;
        registerMap(def); registered.push(def.id);
        for (const matchSeed of SEEDS) {
          const r = measureWood(def, { seed: matchSeed });
          r.gm.dispose?.();
          expect(r.perPlayer, `${id}/${seed}/${matchSeed}`).toHaveLength(PLAYERS[id]);
          expect(r.minWood, `${id} mapa ${seed} partida ${matchSeed}: ${r.perPlayer.map((p) => p.wood).join(', ')}`).toBeGreaterThanOrEqual(GAME_WOOD_TARGET);
        }
        unregisterMap(def.id);
      }
    });
  }

  it('as árvores nascem em terra firme e a >= 26 u de qualquer pátio (regra do GameManager) nos mundos gerados', () => {
    for (const id of ['dois-continentes', 'duelo-continental']) {
      const def = world(id, 1).mapDef;
      registerMap(def); registered.push(def.id);
      const r = measureWood(def, { seed: 1 });
      for (const t of r.gm.trees) {
        const { x, z } = t.mesh.position;
        expect(getHeightForMap(def, x, z), `${id}: árvore (${x.toFixed(1)}, ${z.toFixed(1)})`).toBeGreaterThanOrEqual(1.8);
        for (const s of def.startSlots) expect(Math.hypot(s.x - x, s.z - z)).toBeGreaterThanOrEqual(26);
      }
      r.gm.dispose?.();
      unregisterMap(def.id);
    }
  });

  it('estimateWood (independente do planejador) concorda com a meta com 5 sorteios por mapa', () => {
    for (const id of COAST_PRESET_IDS) {
      const def = world(id, 1).mapDef;
      const pf = buildPathfinder(def, 'land');
      const seen = def.startSlots.map((s) => floodFill(pf, s.x, s.z));
      const reach = def.startSlots.map((_, i) => (x, z) => isReached(pf, seen[i], x, z));
      for (let sd = 1; sd <= 5; sd++) for (const wood of estimateWood(def, sd, (x, z) => pf.terrain.getHeight(x, z), reach)) expect(wood, `${id} sorteio ${sd}`).toBeGreaterThanOrEqual(GAME_WOOD_TARGET);
    }
  });
});

describe('duelo-continental: simetria de jogo exata e equidade', () => {
  for (const seed of SEEDS) {
    it(`seed ${seed}: bases, jazidas, bosques e vaus são o giro de 180° um do outro; alturas simétricas; madeira real com diferença <= 10 %`, () => {
      const def = world('duelo-continental', seed).mapDef;
      const [a, b] = def.startSlots;
      expect(b.x).toBeCloseTo(-a.x, 6); expect(b.z).toBeCloseTo(-a.z, 6);
      expect(b.mirror).toEqual([-a.mirror[0], -a.mirror[1]]);
      expect(b.layout).toEqual(a.layout); // mesmos offsets no referencial espelhado
      const half = def.resources.length / 2;
      def.resources.slice(0, half).forEach((r, k) => { const g = def.resources[half + k]; expect(g.type).toBe(r.type); expect(g.x).toBeCloseTo(-r.x, 6); expect(g.z).toBeCloseTo(-r.z, 6); });
      const fh = def.forests.length / 2;
      def.forests.slice(0, fh).forEach((f, k) => { const g = def.forests[fh + k]; expect(g.count).toBe(f.count); expect(g.radius).toBe(f.radius); expect(g.x).toBeCloseTo(-f.x, 6); expect(g.z).toBeCloseTo(-f.z, 6); });
      for (const f of def.fords) expect(def.fords.some((g) => Math.abs(g.x + f.x) < 1e-6 && Math.abs(g.z + f.z) < 1e-6)).toBe(true);
      for (let k = 0; k < 400; k++) {
        const x = ((k * 29) % 197) - 98.5, z = ((k * 41) % 187) - 93.5;
        expect(Math.abs(getHeightForMap(def, x, z) - getHeightForMap(def, -x, -z)), `(${x}, ${z})`).toBeLessThanOrEqual(0.11); // quantização em décimos
      }
      const plan = world('duelo-continental', seed).plan;
      expect(plan.bases[0].wood).toBe(plan.bases[1].wood);
      registerMap(def); registered.push(def.id);
      for (const matchSeed of SEEDS) {
        const r = measureWood(def, { seed: matchSeed });
        r.gm.dispose?.();
        const [w0, w1] = r.perPlayer.map((p) => p.wood);
        expect(Math.min(w0, w1) / Math.max(w0, w1), `partida ${matchSeed}: ${w0} × ${w1}`).toBeGreaterThanOrEqual(0.9);
      }
      unregisterMap(def.id);
    });
  }

  it('a terra do duelo é uma massa só: as duas bases se alcançam por terra (atravessando os vaus do rio)', () => {
    const def = world('duelo-continental', 1).mapDef;
    const pf = buildPathfinder(def, 'land');
    expect(def.fords.length).toBeGreaterThanOrEqual(2);
    expect(isReached(pf, floodFill(pf, def.startSlots[0].x, def.startSlots[0].z), def.startSlots[1].x, def.startSlots[1].z)).toBe(true);
  });
});

describe('conectividade terrestre (Pathfinder real): cada base alcança as suas jazidas, a serraria e os bosques', () => {
  for (const id of COAST_PRESET_IDS) {
    it(`${id}: flood fill 4-vizinhos a partir de cada pátio chega às jazidas e a todos os bosques; bases de continentes/ilhas diferentes ficam separadas pelo mar`, () => {
      const def = world(id, 2).mapDef;
      const pf = buildPathfinder(def, 'land');
      const seen = def.startSlots.map((s) => floodFill(pf, s.x, s.z));
      def.startSlots.forEach((s, i) => {
        const lay = layoutAt(s);
        for (const b of lay.buildings) expect(isReached(pf, seen[i], b.x, b.z), `base ${i}: ${b.role}`).toBe(true);
        for (const u of lay.units) expect(isReached(pf, seen[i], u.x, u.z), `base ${i}: unidade ${u.role}`).toBe(true);
        for (const r of def.resources) if (r.type !== 'oil' && hyp(r, s) < 25) expect(isReached(pf, seen[i], r.x, r.z), `base ${i}: ${r.type}`).toBe(true);
      });
      for (const f of def.forests) expect(seen.some((sn) => isReached(pf, sn, f.x, f.z)), `bosque (${f.x}, ${f.z}) sem dono`).toBe(true);
      const connected = def.startSlots.map((s, i) => def.startSlots.map((t, j) => (isReached(pf, seen[i], t.x, t.z) ? j : -1)).filter((j) => j >= 0 && j !== i));
      if (id === 'duelo-continental' || id === 'ilha-unica') connected.forEach((c) => expect(c).toHaveLength(def.startSlots.length - 1)); // mesma terra
      else connected.forEach((c) => expect(c).toEqual([])); // cada base na sua massa de terra: só por mar
    });
  }
});

describe('rota naval (Pathfinder naval real): poços ligados ao oceano e costa para o Estaleiro de cada base', () => {
  for (const id of COAST_PRESET_IDS.filter((x) => COAST_PRESETS[x].naval)) {
    it(`${id}: 2 poços por base em água navegável do oceano (nunca em lago ou rio); cada base tem costa ligada a todos os poços e às costas das outras bases`, () => {
      const w = world(id, 1), def = w.mapDef;
      const wells = def.resources.filter((r) => r.type === 'oil');
      expect(wells).toHaveLength(2 * def.startSlots.length);
      const sea = buildPathfinder(def, 'naval'), land = buildPathfinder(def, 'land');
      // mar principal = região naval que contém o canto navegável mais externo
      let corner = null;
      for (let d = 0; d < 20 && !corner; d++) for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const p = { x: sx * (def.playable / 2 - 2 - d), z: sz * (def.playable / 2 - 2 - d) }; if (sea.isWalkableWorld(p.x, p.z)) { corner = p; break; } }
      expect(corner, 'canto de oceano navegável').not.toBeNull();
      const ocean = floodFill(sea, corner.x, corner.z);
      for (const wl of wells) {
        expect(getHeightForMap(def, wl.x, wl.z), `poço (${wl.x}, ${wl.z})`).toBeLessThanOrEqual(NAVAL_MAX_HEIGHT);
        expect(isReached(sea, ocean, wl.x, wl.z), `poço (${wl.x}, ${wl.z}) fora do mar principal`).toBe(true);
        expect(wl.amount).toBeGreaterThan(0);
      }
      for (let i = 0; i < wells.length; i++) for (let j = i + 1; j < wells.length; j++) expect(hyp(wells[i], wells[j])).toBeGreaterThanOrEqual(16);
      // costa para o Estaleiro: de cada pátio, por terra, até uma célula vizinha de água do mar principal
      def.startSlots.forEach((s, i) => {
        const seenLand = floodFill(land, s.x, s.z);
        let best = Infinity;
        for (let r = 0; r < land.rows; r++) for (let c = 0; c < land.cols; c++) {
          const k = r * land.cols + c;
          if (!seenLand[k]) continue;
          let touches = false;
          for (let dr = -1; dr <= 1 && !touches; dr++) for (let dc = -1; dc <= 1 && !touches; dc++) {
            const rr = r + dr, cc = c + dc;
            if (rr >= 0 && cc >= 0 && rr < sea.rows && cc < sea.cols && ocean[rr * sea.cols + cc]) touches = true;
          }
          if (touches) best = Math.min(best, Math.hypot(land.minCoord + (c + 0.5) * land.cellSize - s.x, land.minCoord + (r + 0.5) * land.cellSize - s.z));
        }
        expect(best, `base ${i}: distância à costa do mar principal`).toBeLessThan(60);
      });
      expect(w.verification.world.checks.naval.docks.every((d) => d !== null)).toBe(true);
    });
  }

  it('mapas sem mar navegável de poços (ilha-unica, duelo-continental) não têm poços', () => {
    for (const id of ['ilha-unica', 'duelo-continental']) expect(world(id, 1).mapDef.resources.some((r) => r.type === 'oil'), id).toBe(false);
  });
});

describe('verifyCoastWorld acusa mundos quebrados', () => {
  const base = () => structuredClone(world('dois-continentes', 1).mapDef);

  it('base na água, sem madeira, bosque ilhado, poço em terra e poços faltando', () => {
    const w = world('dois-continentes', 1);
    const opts = { naval: true };
    expect(verifyCoastWorld(w.mapDef, opts).ok).toBe(true);
    const wet = base(); wet.startSlots[0] = { ...wet.startSlots[0], x: -100, z: 100 };
    expect(verifyCoastWorld(wet, opts).failures.some((f) => f.startsWith('base-molhada:'))).toBe(true);
    const bare = base(); bare.forests = [];
    expect(verifyCoastWorld(bare, opts).failures.some((f) => f.startsWith('madeira:'))).toBe(true);
    const islet = w.map.entities.find((e) => e.kind === 'island' && e.area > 150);
    const isle = base(); isle.forests.push({ x: islet.cx, z: islet.cz, count: 10, radius: 4, species: 'oak' });
    expect(verifyCoastWorld(isle, opts).failures.some((f) => f.startsWith('bosque-ilhado:'))).toBe(true);
    const land = base(); const well = land.resources.findIndex((r) => r.type === 'oil'); land.resources[well] = { ...land.resources[well], x: land.startSlots[0].x, z: land.startSlots[0].z };
    expect(verifyCoastWorld(land, opts).failures.some((f) => f.startsWith('poço'))).toBe(true);
    const dry = base(); dry.resources = dry.resources.filter((r) => r.type !== 'oil');
    expect(verifyCoastWorld(dry, opts).failures.some((f) => f.startsWith('poços:'))).toBe(true);
  });
});

describe('buildCoastWorld: semente rejeitada, determinismo e tempo', () => {
  it('um preset impossível rejeita todas as sementes e diz por quê (nenhum mapa é devolvido)', () => {
    const tiny = { ...COAST_PRESETS['dois-continentes'], options: { ...COAST_PRESETS['dois-continentes'].options, continentDims: [0.07, 0.12] } };
    const r = buildCoastWorld(tiny, { seed: 1, tries: 3 });
    expect(r.ok).toBe(false);
    expect(r.attempts).toHaveLength(3);
    expect(r.attempts.map((a) => a.seed)).toEqual([1, 2, 3]);
    for (const a of r.attempts) { expect(['geografia', 'layout', 'mundo']).toContain(a.stage); expect(a.failures.length).toBeGreaterThan(0); }
    expect(r.mapDef).toBeUndefined();
  });

  it('uma semente que falha é rejeitada e a seguinte vale: o resultado diz a semente usada e guarda as tentativas', () => {
    let failing = null;
    for (let seed = 1; seed <= 14 && failing === null; seed++) if (!buildCoastWorld('dois-continentes', { seed, tries: 1 }).ok) failing = seed;
    if (failing === null) return; // todas as sementes 1–14 passaram de primeira: nada a rejeitar (o caminho de rejeição já foi coberto acima)
    const r = buildCoastWorld('dois-continentes', { seed: failing });
    expect(r.ok).toBe(true);
    expect(r.requestedSeed).toBe(failing);
    expect(r.seed).toBeGreaterThan(failing);
    expect(r.attempts[0].seed).toBe(failing);
    expect(r.mapDef.id).toBe(`mundo-dois-continentes-${failing}`);
    expect(r.mapDef.meta).toMatchObject({ seed: failing, seedUsed: r.seed });
  });

  it('mesma (preset, semente) ⇒ o mesmo JSON, byte a byte', () => {
    for (const id of COAST_PRESET_IDS) {
      const again = buildCoastWorld(id, { seed: 1 });
      expect(hashStr(JSON.stringify(again.mapDef)), id).toBe(hashStr(JSON.stringify(world(id, 1).mapDef)));
    }
  });

  it('o id, o nome e o tileset podem ser trocados; o resultado continua válido', () => {
    const r = buildCoastWorld('ilha-unica', { seed: 1, id: 'minha-ilha', name: 'Minha Ilha', tileset: 'pedregoso' });
    expect(r.mapDef).toMatchObject({ id: 'minha-ilha', name: 'Minha Ilha', tileset: 'pedregoso' });
    expect(validateMapDef(r.mapDef, { checkId: false }).errors).toEqual([]);
  });

  it('um mundo completo (geração + assadura + bases/florestas + verificação com Pathfinder) sai em <= 1 s', () => {
    // aquece o JIT e mede o MELHOR de 2 execuções de uma semente que passa de primeira (a máquina pode estar ocupada com outros testes)
    generateCoast({ seed: 99, size: 96, grid: 96, continents: 1, islands: 0, islets: 0, lava: false, rivers: 1 });
    for (const id of COAST_PRESET_IDS) {
      let best = Infinity;
      for (let k = 0; k < 2; k++) { const t0 = performance.now(); const r = buildCoastWorld(id, { seed: 1, tries: 1 }); best = Math.min(best, performance.now() - t0); expect(r.ok, id).toBe(true); }
      expect(best, `${id}: ${best.toFixed(0)} ms`).toBeLessThan(1000);
    }
  });
});

describe('tools/gen-world-map.mjs (CLI)', () => {
  const run = (...args) => spawnSync(process.execPath, ['tools/gen-world-map.mjs', ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

  it('gera o JSON de um preset no stdout (inclusive ilha-unica, que antes lançava erro) e o resumo no stderr', () => {
    const r = run('--seed', '1', '--preset', 'ilha-unica');
    expect(r.status, r.stderr).toBe(0);
    const def = JSON.parse(r.stdout);
    expect(def.id).toBe('mundo-ilha-unica-1');
    expect(def.terrain.generator).toBe('painted');
    expect(def.startSlots).toHaveLength(2);
    expect(r.stderr).toMatch(/preset ilha-unica: semente 1/);
    expect(hashStr(JSON.stringify(def))).toBe(hashStr(JSON.stringify(world('ilha-unica', 1).mapDef))); // a CLI gera o mesmo mapa que a API
  });

  it('preset desconhecido falha com mensagem e código 1', () => {
    const r = run('--preset', 'nao-existe');
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/preset desconhecido/);
    expect(run('--bogus').status).toBe(1);
  });
});
