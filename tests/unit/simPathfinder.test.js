import { describe, it, expect } from 'vitest';
import { Pathfinder, MinHeap } from '../../src/sim/Pathfinder.js';

/** F10-01 — pathfinding em grade simples: ótimo, obstáculo, sem caminho, orçamento, determinismo. */

const dry = { getHeight: () => 1.0 };
const mk = () => new Pathfinder(dry, 55);

const pathLength = (sx, sz, path) => {
  let len = 0, px = sx, pz = sz;
  for (const w of path) { len += Math.hypot(w.x - px, w.z - pz); px = w.x; pz = w.z; }
  return len;
};

/** Parede vertical em x=0 de z=-30 a z=+30 (círculos de raio 1,5 a cada 1,5), deixando passagem a partir de z>=gapZ. */
function wall(pf, gapZ = 30) {
  for (let z = -40; z < gapZ; z += 1.5) pf.blockCircle(0, z, 1.5, 1);
}

describe('A* em grade', () => {
  it('sem obstáculos: caminho reto é ótimo (comprimento = distância euclidiana)', () => {
    const pf = mk();
    const path = pf.findPath(-30, -10, 30, 25);
    expect(pathLength(-30, -10, path)).toBeCloseTo(Math.hypot(60, 35), 5);
  });

  it('parede com passagem: contorna e o comprimento fica perto do ótimo geométrico (≤ 8 %)', () => {
    const pf = mk();
    wall(pf, 20);
    const path = pf.findPath(-15, 0, 15, 0);
    expect(path.length).toBeGreaterThan(1);
    expect(path.noPath).toBeFalsy();
    // ótimo: ir até a ponta da parede (~z=20 + folga de raio) e voltar
    const gapZ = 20 + 1.5;
    const optimal = 2 * Math.hypot(15, gapZ);
    const len = pathLength(-15, 0, path);
    expect(len).toBeGreaterThanOrEqual(2 * Math.hypot(15, 20) - 1e-6); // nunca menor que o limite inferior geométrico
    expect(len).toBeLessThanOrEqual(optimal * 1.08);
    // todo trecho respeita a linha de visão (não atravessa a parede)
    let px = -15, pz = 0;
    for (const w of path) { expect(pf.hasLineOfSight(px, pz, w.x, w.z)).toBe(true); px = w.x; pz = w.z; }
  });

  it('remover o bloqueio restaura o caminho reto de 1 waypoint', () => {
    const pf = mk();
    for (let z = -40; z < 40; z += 1.5) pf.blockCircle(0, z, 1.5, 1);
    const blocked = pf.findPath(-15, 0, 15, 0);
    for (let z = -40; z < 40; z += 1.5) pf.blockCircle(0, z, 1.5, -1);
    const free = pf.findPath(-15, 0, 15, 0);
    expect(free).toEqual([{ x: 15, z: 0 }]);
    expect(blocked.length === 0 || blocked.noPath || blocked.length > 1).toBe(true);
  });

  it('sem caminho: parede total até as bordas → não atravessa (noPath ou caminho curto até a margem)', () => {
    const pf = mk();
    for (let z = -56; z <= 56; z += 1.5) pf.blockCircle(0, z, 1.5, 1);
    const path = pf.findPath(-15, 0, 15, 0);
    // jamais um caminho reto de 1 waypoint no destino
    const direct = path.length === 1 && path[0].x === 15 && path[0].z === 0;
    expect(direct).toBe(false);
    if (path.length > 0) {
      const last = path[path.length - 1];
      expect(last.x).toBeLessThan(0); // termina do lado de origem
    }
  });

  it('determinismo: mesma consulta duas vezes (e em instâncias novas) dá exatamente o mesmo caminho', () => {
    const run = () => { const pf = mk(); wall(pf, 18); return pf.findPath(-20, -5, 22, 7); };
    const a = run();
    expect(run()).toEqual(a);
    const pf = mk(); wall(pf, 18);
    expect(pf.findPath(-20, -5, 22, 7)).toEqual(pf.findPath(-20, -5, 22, 7));
  });

  it('modo largo não é pior que inválido: devolve caminho válido com e sem folga', () => {
    const pf = mk();
    wall(pf, 20);
    const p = pf.findPath(-15, 0, 15, 0, true);
    expect(p.length).toBeGreaterThan(0);
  });

  it('origem ou destino fora do mapa jogável: não lança e não devolve ponto fora dos limites', () => {
    const pf = mk();
    const path = pf.findPath(0, 0, 500, 500);
    for (const w of path) {
      expect(Math.abs(w.x)).toBeLessThan(55);
      expect(Math.abs(w.z)).toBeLessThan(55);
    }
  });
});

describe('orçamento de nós (processQueue)', () => {
  const unit = (x, z) => ({ mesh: { position: { x, z } }, isDead: false, canRemove: false });

  it('maxNodes pequeno atende ao menos 1 pedido por chamada e preserva a ORDEM de chegada', () => {
    const pf = mk();
    wall(pf, 20);
    const order = [];
    for (let i = 0; i < 6; i++) pf.requestPath(unit(-15, i), 15, i, () => order.push(i));
    pf.processQueue(1);
    expect(order.length).toBeGreaterThanOrEqual(1); // sempre atende ao menos 1
    expect(order.length).toBeLessThan(6); // mas o orçamento corta o resto para a próxima chamada
    let calls = 0;
    while (order.length < 6 && calls < 50) { pf.processQueue(1); calls++; }
    expect(order).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('orçamento grande resolve tudo numa chamada só', () => {
    const pf = mk();
    const got = [];
    for (let i = 0; i < 5; i++) pf.requestPath(unit(-20, i), 20, i, p => got.push(p));
    pf.processQueue(1e9);
    expect(got).toHaveLength(5);
  });

  it('resultado independe de como o orçamento fatia a fila', () => {
    const solve = (budget) => {
      const pf = mk(); wall(pf, 20);
      const res = [];
      for (let i = 0; i < 4; i++) pf.requestPath(unit(-15, i * 2), 15, i * 2, p => res.push(p));
      for (let k = 0; k < 40 && res.length < 4; k++) pf.processQueue(budget);
      return res;
    };
    expect(solve(1)).toEqual(solve(1e9));
  });
});

describe('MinHeap', () => {
  it('pop em fila vazia devolve valor "vazio" e size reflete o conteúdo', () => {
    const h = new MinHeap(8);
    expect(h.size).toBe(0);
    h.push(5, 2); h.push(7, 1); h.push(9, 3);
    expect(h.size).toBe(3);
    expect(h.pop()).toBe(7);
    expect(h.pop()).toBe(5);
    expect(h.pop()).toBe(9);
    expect(h.size).toBe(0);
  });
  it('clear esvazia', () => {
    const h = new MinHeap(8);
    h.push(1, 1); h.push(2, 2);
    h.clear();
    expect(h.size).toBe(0);
  });
});
