import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { generateMap, minMapSize, buildPathfinder, floodFill, isReached } from '../../src/data/maps/generator.js';
import { getMap, listMaps, registerGeneratedMap, unregisterMap } from '../../src/data/maps/index.js';
import { getHeightForMap } from '../../src/world/terrainGenerators.js';
import { GameManager } from '../../src/core/GameManager.js';
import { Terrain } from '../../src/world/Terrain.js';
import { PLAYER_COLORS, validateMatchConfig } from '../../src/sim/MatchConfig.js';
import { NAVAL_MAX_HEIGHT } from '../../src/data/combat.js';
import { SIM_DT } from '../../src/sim/constants.js';

const DRY = 1.8;
const slotDist = (s, p) => Math.hypot(s.x - p.x, s.z - p.z);
const sortedDists = (m, slot, list) => list.map((p) => slotDist(slot, p)).sort((a, b) => a - b);

const CASES = [
  { players: 2, size: 96 },
  { players: 3, size: 128 },
  { players: 4, size: 128 },
  { players: 5, size: 160 },
  { players: 6, size: 160 },
  { players: 7, size: 176 },
  { players: 8, size: 192 }
];

describe('gerador procedural de mapas (F8-02)', () => {
  it('mesma seed ⇒ mesmo JSON; seeds diferentes ⇒ mapas diferentes', () => {
    const a = JSON.stringify(generateMap({ seed: 42, players: 4, size: 128 }));
    expect(JSON.stringify(generateMap({ seed: 42, players: 4, size: 128 }))).toBe(a);
    expect(JSON.stringify(generateMap({ seed: 43, players: 4, size: 128 }))).not.toBe(a);
    const n = JSON.stringify(generateMap({ seed: 42, players: 4, size: 128, naval: true }));
    expect(JSON.stringify(generateMap({ seed: 42, players: 4, size: 128, naval: true }))).toBe(n);
    expect(n).not.toBe(a);
  });

  it('valida parâmetros e eleva o tamanho ao mínimo que comporta os jogadores', () => {
    expect(() => generateMap({ players: 1 })).toThrow();
    expect(() => generateMap({ players: 9 })).toThrow();
    expect(() => generateMap({ size: 300 })).toThrow();
    expect(() => generateMap({ theme: 'lava' })).toThrow();
    const m = generateMap({ seed: 1, players: 8, size: 96 });
    expect(m.size).toBe(minMapSize(8));
    expect(m.size).toBeGreaterThanOrEqual(96);
  });

  for (const naval of [false, true]) {
    for (const c of CASES) {
      describe(`${c.players} jogadores, ${c.size}${naval ? ', naval' : ''}`, () => {
        const m = generateMap({ seed: 5, players: c.players, size: c.size, naval });

        it('formato do mapa, slots e recursos em terra seca (poços em água navegável), dentro da área jogável', () => {
          expect(m.maxPlayers).toBe(c.players);
          expect(m.startSlots).toHaveLength(c.players);
          expect(m.size).toBeLessThanOrEqual(192);
          expect(m.playable).toBeLessThanOrEqual(m.size);
          const half = m.playable / 2;
          for (const s of m.startSlots) {
            expect(Math.abs(s.x)).toBeLessThan(half);
            expect(Math.abs(s.z)).toBeLessThan(half);
            expect(getHeightForMap(m, s.x, s.z)).toBeGreaterThanOrEqual(DRY);
          }
          for (const r of m.resources) {
            expect(Math.abs(r.x)).toBeLessThan(half);
            expect(Math.abs(r.z)).toBeLessThan(half);
            const h = getHeightForMap(m, r.x, r.z);
            if (r.type === 'oil') expect(h).toBeLessThanOrEqual(NAVAL_MAX_HEIGHT);
            else expect(h, `${r.type} (${r.x}, ${r.z})`).toBeGreaterThanOrEqual(DRY);
          }
          for (const n of m.neutrals) if (n.kind === 'camp') expect(getHeightForMap(m, n.x, n.z)).toBeGreaterThanOrEqual(DRY);
          for (const f of m.forests) expect(getHeightForMap(m, f.x, f.z)).toBeGreaterThanOrEqual(DRY);
        });

        it('simetria: todo jogador vê as mesmas distâncias a recursos, florestas e acampamentos', () => {
          const camps = m.neutrals.filter((n) => n.kind === 'camp');
          const groups = [
            ['ouro', m.resources.filter((r) => r.type === 'gold')],
            ['pedra', m.resources.filter((r) => r.type === 'stone')],
            ['petróleo', m.resources.filter((r) => r.type === 'oil')],
            ['florestas', m.forests],
            ['acampamentos', camps],
            ['critters', m.neutrals.filter((n) => n.kind === 'critters')]
          ];
          for (const [name, list] of groups) {
            const ref = sortedDists(m, m.startSlots[0], list);
            for (let i = 1; i < c.players; i++) {
              const d = sortedDists(m, m.startSlots[i], list);
              d.forEach((v, k) => expect(Math.abs(v - ref[k]), `${name}, jogador ${i}`).toBeLessThan(0.1));
            }
          }
          // quantidades próprias iguais: cada base tem 1 ouro + 1 pedra "dela" (a 20 ou menos) e o mesmo nº de poços próximos
          const near = (i, type) => m.resources.filter((r) => r.type === type && slotDist(m.startSlots[i], r) < 20).length;
          for (let i = 1; i < c.players; i++) {
            expect(near(i, 'gold')).toBe(near(0, 'gold'));
            expect(near(i, 'stone')).toBe(near(0, 'stone'));
          }
          expect(near(0, 'gold')).toBeGreaterThanOrEqual(1);
          expect(near(0, 'stone')).toBeGreaterThanOrEqual(1);
          // distâncias entre bases vizinhas iguais (anel regular)
          const dn = slotDist(m.startSlots[0], m.startSlots[1]);
          for (let i = 1; i < c.players; i++) expect(Math.abs(slotDist(m.startSlots[i], m.startSlots[(i + 1) % c.players]) - dn)).toBeLessThan(0.1);
        });

        it('conectividade terrestre entre bases, recursos e acampamentos (flood fill no Pathfinder)', () => {
          const pf = buildPathfinder(m, 'land');
          const seen = floodFill(pf, m.startSlots[0].x, m.startSlots[0].z);
          for (const s of m.startSlots) expect(isReached(pf, seen, s.x, s.z)).toBe(true);
          for (const r of m.resources) if (r.type !== 'oil') expect(isReached(pf, seen, r.x, r.z)).toBe(true);
          for (const n of m.neutrals) if (n.kind === 'camp') expect(isReached(pf, seen, n.x, n.z)).toBe(true);
        });

        if (naval) {
          it('poços acessíveis por mar e costa para Estaleiro em cada base', () => {
            const sea = buildPathfinder(m, 'naval');
            const wells = m.resources.filter((r) => r.type === 'oil');
            expect(wells.length).toBeGreaterThanOrEqual(c.players);
            const water = floodFill(sea, wells[0].x, wells[0].z);
            for (const w of wells) expect(isReached(sea, water, w.x, w.z), `poço (${w.x}, ${w.z})`).toBe(true);
            for (const s of m.startSlots) {
              let found = false;
              for (let rho = 8; rho <= 26 && !found; rho++) {
                for (let a = 0; a < 24 && !found; a++) {
                  const x = s.x + Math.cos((a / 24) * Math.PI * 2) * rho;
                  const z = s.z + Math.sin((a / 24) * Math.PI * 2) * rho;
                  if (getHeightForMap(m, x, z) < DRY || !sea.nearNavigable(x, z, 5.3)) continue;
                  for (let dx = -6; dx <= 6 && !found; dx += 1.5) {
                    for (let dz = -6; dz <= 6 && !found; dz += 1.5) {
                      if (Math.hypot(dx, dz) <= 5.3 && isReached(sea, water, x + dx, z + dz) && sea.isWalkableWorld(x + dx, z + dz)) found = true;
                    }
                  }
                }
              }
              expect(found, `base (${s.x}, ${s.z}) sem costa para Estaleiro`).toBe(true);
            }
          });
        } else {
          it('mapa terrestre não tem poços de petróleo', () => {
            expect(m.resources.some((r) => r.type === 'oil')).toBe(false);
          });
        }
      });
    }
  }

  it('simetria espelhada (jogadores pares) também é simétrica e conectada', () => {
    const m = generateMap({ seed: 9, players: 6, size: 160, symmetry: 'mirror' });
    expect(m.generator.symmetry).toBe('mirror');
    const ref = sortedDists(m, m.startSlots[0], m.forests);
    for (let i = 1; i < 6; i++) sortedDists(m, m.startSlots[i], m.forests).forEach((v, k) => expect(Math.abs(v - ref[k])).toBeLessThan(0.1));
    expect(generateMap({ seed: 9, players: 5, size: 160, symmetry: 'mirror' }).generator.symmetry).toBe('rotational');
  });

  it('muitas seeds geram sem exceção (terrestre e naval)', () => {
    for (let seed = 1; seed <= 12; seed++) {
      expect(() => generateMap({ seed, players: 2 + (seed % 7), size: 192 })).not.toThrow();
      expect(() => generateMap({ seed, players: 2 + (seed % 7), size: 192, naval: true })).not.toThrow();
    }
  });

  it('densidade de florestas e tema são respeitados', () => {
    const base = generateMap({ seed: 3, players: 4, size: 160, forestDensity: 1 });
    expect(generateMap({ seed: 3, players: 4, size: 160, forestDensity: 0 }).forests).toHaveLength(0);
    // F8-01: a regra de 27 un. dos pátios limita a quantidade em mapas pequenos; densidade maior nunca tira árvores
    expect(generateMap({ seed: 3, players: 4, size: 160, forestDensity: 2 }).forests.length).toBeGreaterThanOrEqual(base.forests.length);
    expect(base.tileset).toBe('verdejante');
    expect(generateMap({ seed: 3, players: 4, size: 160, naval: true }).tileset).toBe('ilhas');
  });

  it('registro opcional: mapas gerados entram em getMap/listMaps sem afetar os estáticos', () => {
    const before = listMaps().length;
    const m = registerGeneratedMap({ seed: 77, players: 3, size: 128 });
    try {
      expect(getMap(m.id)).toBe(m);
      expect(listMaps().length).toBe(before + 1);
      expect(() => registerGeneratedMap({ seed: 77, players: 3, size: 128 })).not.toThrow(); // gerados podem ser substituídos
      expect(getMap('continental-1v1')).toBeTruthy();
    } finally {
      unregisterMap(m.id);
    }
    expect(getMap(m.id)).toBeUndefined();
  });
});

function ffa(mapId, n, seed) {
  const players = Array.from({ length: n }, (_, i) => ({
    id: i, name: `P${i}`, factionId: i % 2 === 0 ? 'human' : 'orc', team: i, color: PLAYER_COLORS[i],
    isAI: true, isLocal: i === 0, startSlot: i
  }));
  return validateMatchConfig({ mapId, seed, difficulty: 'normal', headless: true, players });
}

describe('partida headless em mapas gerados (F8-02)', () => {
  for (const { n, naval, seed } of [{ n: 2, naval: false, seed: 11 }, { n: 4, naval: false, seed: 12 }, { n: 3, naval: true, seed: 13 }]) {
    it(`${n} IAs${naval ? ' (naval)' : ''}: 600 ticks sem exceção e todas as bases vivas`, () => {
      const m = registerGeneratedMap({ seed, players: n, size: 128, naval });
      try {
        void THREE;
        const gm = new GameManager(new Terrain(m), null, null, ffa(m.id, n, seed));
        const initial = gm.allUnits.filter((u) => u.ownerId !== 99).length;
        expect(() => { for (let i = 0; i < 600; i++) gm.simStep(SIM_DT); }).not.toThrow();
        expect(gm.allUnits.filter((u) => !u.isDead && u.ownerId !== 99).length).toBeGreaterThanOrEqual(initial);
        for (const p of gm.players) expect(gm.buildings.some((b) => b.ownerId === p.id && !b.isDead)).toBe(true);
        expect(gm.resourceDeposits.filter((d) => d.type === 'oil').length).toBe(m.resources.filter((r) => r.type === 'oil').length);
      } finally {
        unregisterMap(m.id);
      }
    }, 60000);
  }
});
