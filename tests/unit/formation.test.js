import { describe, it, expect } from 'vitest';
import { planFormation, groupSpeed, MIN_SPACING } from '../../src/sim/formation.js';
import { steerDirection, SEP_MARGIN } from '../../src/sim/steering.js';

const mk = (n, x0 = 0, z0 = 0, gap = 1.2, cols = 6, r = 0.6) =>
  Array.from({ length: n }, (_, i) => ({ id: i + 1, x: x0 + (i % cols) * gap, z: z0 - Math.floor(i / cols) * gap, radius: r }));

describe('planFormation (F3-02)', () => {
  it('um lugar por unidade, sem sobreposição e centrado no destino', () => {
    const members = mk(40);
    const slots = planFormation(members, { x: 50, z: 0 });
    expect(slots.size).toBe(40);
    const pts = [...slots.values()];
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        expect(Math.hypot(pts[i].x - pts[j].x, pts[i].z - pts[j].z)).toBeGreaterThanOrEqual(MIN_SPACING - 1e-6);
      }
    }
    const cx = pts.reduce((a, p) => a + p.x, 0) / pts.length;
    const cz = pts.reduce((a, p) => a + p.z, 0) / pts.length;
    expect(Math.hypot(cx - 50, cz - 0)).toBeLessThan(1.5);
  });

  it('espaçamento cresce com o raio das unidades', () => {
    const small = [...planFormation(mk(4, 0, 0, 1.2, 4, 0.5), { x: 20, z: 0 }).values()];
    const big = [...planFormation(mk(4, 0, 0, 1.2, 4, 1.3), { x: 20, z: 0 }).values()];
    const gap = (pts) => Math.min(...pts.flatMap((a, i) => pts.slice(i + 1).map(b => Math.hypot(a.x - b.x, a.z - b.z))));
    expect(gap(big)).toBeGreaterThan(gap(small));
  });

  it('a formação fica voltada para o destino: quem está na frente fica na linha da frente', () => {
    // grupo em x∈[0,10] indo para +x: o de maior x deve receber o lugar com maior x
    const members = [
      { id: 1, x: 0, z: 0, radius: 0.6 },
      { id: 2, x: 5, z: 0, radius: 0.6 },
      { id: 3, x: 10, z: 0, radius: 0.6 },
      { id: 4, x: 15, z: 0, radius: 0.6 }
    ];
    const slots = planFormation(members, { x: 100, z: 0 });
    const xs = members.map(m => slots.get(m.id).x);
    // 4 unidades → 2 linhas (3 + 1): a de trás (id 1) fica atrás de todas as outras
    expect(xs[0]).toBeLessThan(Math.min(xs[1], xs[2], xs[3]));
    expect(xs[3]).toBeGreaterThanOrEqual(xs[1] - 1e-9);
  });

  it('preserva a ordem lateral dentro da linha (sem cruzamento de caminhos)', () => {
    // linha da frente com 4 unidades lado a lado (z crescente) e 2 atrás: cols = 4
    const members = [
      ...[-3, -1, 1, 3].map((z, i) => ({ id: i + 1, x: 10, z, radius: 0.6 })),
      { id: 5, x: 0, z: -1, radius: 0.6 },
      { id: 6, x: 0, z: 1, radius: 0.6 }
    ];
    const slots = planFormation(members, { x: 50, z: 0 });
    // lateral = eixo z neste cenário: a ordem em z da linha da frente se mantém (ou inverte por inteiro)
    const zs = [1, 2, 3, 4].map(id => slots.get(id).z);
    const inc = zs.every((z, i) => i === 0 || z > zs[i - 1]);
    const dec = zs.every((z, i) => i === 0 || z < zs[i - 1]);
    expect(inc || dec).toBe(true);
  });

  it('determinístico e estável: mesma entrada, mesmo resultado; unidade única vai ao ponto', () => {
    const members = mk(17);
    const a = [...planFormation(members, { x: 9, z: 9 }).entries()];
    const b = [...planFormation(members, { x: 9, z: 9 }).entries()];
    expect(a).toEqual(b);
    expect(planFormation([{ id: 7, x: 0, z: 0, radius: 1 }], { x: 3, z: 4 }).get(7)).toEqual({ x: 3, z: 4 });
    expect(planFormation([], { x: 0, z: 0 }).size).toBe(0);
  });
});

describe('groupSpeed (F3-02)', () => {
  it('é a menor velocidade efetiva do grupo; vazio = 0 (sem limite)', () => {
    expect(groupSpeed([{ speed: 6.2 }, { speed: 3 }, { speed: 4.5 }])).toBe(3);
    expect(groupSpeed([])).toBe(0);
    expect(groupSpeed([{ speed: 0 }, { speed: 4 }])).toBe(4); // 0 = parada/imóvel não trava o grupo
  });
});

describe('steerDirection (F3-02)', () => {
  it('sem vizinhos próximos não altera a direção', () => {
    const d = steerDirection(1, 0, 0, 0, 0.6, [{ x: 10, z: 0, radius: 0.6, stationary: false }]);
    expect(d).toEqual({ x: 1, z: 0 });
  });

  it('afasta-se de um vizinho encostado, mas continua avançando', () => {
    // vizinho logo à frente e ligeiramente à esquerda (+z): desvia para -z, com avanço positivo em x
    const d = steerDirection(1, 0, 0, 0, 0.6, [{ x: 1.0, z: 0.3, radius: 0.6, stationary: false }]);
    expect(d.z).toBeLessThan(0);
    expect(d.x).toBeGreaterThan(0);
    expect(Math.hypot(d.x, d.z)).toBeCloseTo(1, 6);
  });

  it('vizinho parado pesa menos que um em movimento', () => {
    const nb = { x: 1.0, z: 0.3, radius: 0.6 };
    const moving = steerDirection(1, 0, 0, 0, 0.6, [{ ...nb, stationary: false }]);
    const still = steerDirection(1, 0, 0, 0, 0.6, [{ ...nb, stationary: true }]);
    expect(Math.abs(still.z)).toBeLessThan(Math.abs(moving.z));
  });

  it('sobreposição exata desvia para o lado (determinístico) em vez de ficar parado', () => {
    const d = steerDirection(1, 0, 5, 5, 0.6, [{ x: 5, z: 5, radius: 0.6, stationary: false }]);
    expect(Number.isFinite(d.x) && Number.isFinite(d.z)).toBe(true);
    expect(d.x).toBeGreaterThan(0);
    expect(SEP_MARGIN).toBeGreaterThan(0);
  });

  it('nunca recua contra a marcha mesmo cercada pela frente', () => {
    const nbs = [0, 0.3, -0.3].map(z => ({ x: 0.9, z, radius: 0.6, stationary: false }));
    const d = steerDirection(1, 0, 0, 0, 0.6, nbs);
    expect(d.x).toBeGreaterThan(0);
  });
});
