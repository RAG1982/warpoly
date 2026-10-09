import { describe, it, expect } from 'vitest';
import { getMap, listMaps } from '../../src/data/maps/index.js';

/**
 * F8-01 · pacote de mapas skirmish (campos-1v1, desfiladeiro-1v1, vales-2v2, bosques-2v2, planalto-ffa-4p,
 * arquipelago-naval-4p). Checagens de dados: carregam por getMap, simetria básica entre bases, madeira mínima,
 * bosques longe dos pátios e dentro da área jogável, e nenhuma sobreposição de bases/recursos/acampamentos.
 * (O soak por mapa é feito à parte: `tools/soak.mjs --maps <id>`; ver docs/TASKS.md, F8-01.)
 */
const SKIRMISH = [
  { id: 'campos-1v1', players: 2, size: 160 },
  { id: 'desfiladeiro-1v1', players: 2, size: 144 },
  { id: 'vales-2v2', players: 4, size: 144 },
  { id: 'bosques-2v2', players: 4, size: 160 },
  { id: 'planalto-ffa-4p', players: 4, size: 176 },
  { id: 'arquipelago-naval-4p', players: 4, size: 192, naval: true }
];

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const sortedDists = (from, list) => list.map((p) => dist(from, p)).sort((a, b) => a - b);

describe('F8-01 · pacote de mapas skirmish', () => {
  it('os 6 mapas estão registrados em listMaps (sem ser ocultos)', () => {
    const ids = listMaps().map((m) => m.id);
    for (const { id } of SKIRMISH) expect(ids).toContain(id);
  });

  for (const spec of SKIRMISH) {
    describe(spec.id, () => {
      const m = getMap(spec.id);

      it('carrega via getMap com o número de jogadores e tamanho previstos', () => {
        expect(m).toBeTruthy();
        expect(m.id).toBe(spec.id);
        expect(typeof m.name).toBe('string');
        expect(m.maxPlayers).toBe(spec.players);
        expect(m.startSlots).toHaveLength(spec.players);
        expect(m.size).toBe(spec.size);
        expect(m.hidden).toBeFalsy();
      });

      it('madeira: >= 8 árvores planejadas por jogador, todas dentro da área jogável', () => {
        const planned = m.forests.reduce((n, f) => n + f.count, 0);
        expect(planned).toBeGreaterThanOrEqual(8 * spec.players);
        const half = m.playable / 2;
        for (const f of m.forests) {
          expect(Math.max(Math.abs(f.x), Math.abs(f.z)) + f.radius).toBeLessThanOrEqual(half - 1);
        }
      });

      it('madeira: nenhum bosque a menos de 26 un. de um pátio de base (falhas assim travavam partidas)', () => {
        for (const f of m.forests) {
          for (const s of m.startSlots) expect(dist(s, f)).toBeGreaterThan(26);
        }
      });

      it('simetria básica: as distâncias de cada base a recursos, acampamentos e florestas são iguais', () => {
        const points = [
          ...m.resources.filter((r) => r.type !== 'oil'),
          ...m.neutrals.filter((n) => n.kind === 'camp'),
        ];
        const ref = sortedDists(m.startSlots[0], points);
        for (let i = 1; i < m.startSlots.length; i++) {
          const d = sortedDists(m.startSlots[i], points);
          expect(d).toHaveLength(ref.length);
          d.forEach((v, k) => expect(Math.abs(v - ref[k])).toBeLessThan(0.1));
        }
        const fRef = sortedDists(m.startSlots[0], m.forests);
        for (let i = 1; i < m.startSlots.length; i++) {
          const d = sortedDists(m.startSlots[i], m.forests);
          expect(d).toHaveLength(fRef.length);
          d.forEach((v, k) => expect(Math.abs(v - fRef[k])).toBeLessThan(0.1));
        }
      });

      it('não-sobreposição: bases a >= 40 umas das outras; recursos e acampamentos não se sobrepõem', () => {
        for (let i = 0; i < m.startSlots.length; i++) {
          for (let j = i + 1; j < m.startSlots.length; j++) {
            expect(dist(m.startSlots[i], m.startSlots[j])).toBeGreaterThanOrEqual(40);
          }
        }
        const pts = [...m.resources, ...m.neutrals.filter((n) => n.kind === 'camp')];
        for (let i = 0; i < pts.length; i++) {
          for (let j = i + 1; j < pts.length; j++) {
            expect(dist(pts[i], pts[j]), `${pts[i].type ?? 'camp'} (${pts[i].x}, ${pts[i].z}) x ${pts[j].type ?? 'camp'}`).toBeGreaterThan(4);
          }
        }
        for (const r of m.resources) {
          for (const s of m.startSlots) {
            if (r.type === 'oil') continue;
            expect(dist(s, r)).toBeGreaterThan(6);
          }
        }
      });

      if (spec.naval) {
        it('naval: tem poços de petróleo e pelo menos um poço por base', () => {
          const oil = m.resources.filter((r) => r.type === 'oil');
          expect(oil.length).toBeGreaterThanOrEqual(spec.players);
          expect(m.terrain.generator).toBe('islands');
        });
      }
    });
  }
});
