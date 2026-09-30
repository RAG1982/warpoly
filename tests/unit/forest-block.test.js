import { describe, it, expect } from 'vitest';
import { Pathfinder } from '../../src/core/Pathfinder.js';

/**
 * forest-block.test.js — F3-04 item 8: árvores vivas bloqueiam passagem (`blockCircle` no
 * `dynamicBlock`, mesmo mecanismo de construções — F1-07) e reabrem ao serem cortadas
 * (`blockCircle(..., -1)`). Terreno seco fixo (sem `Terrain`/three.js — mesmo padrão de
 * `pathfinder.test.js`).
 *
 * Nota (spec `_COMUM.md`: "não amplie o escopo"/"não reescreva o pathfinder"): com um anel
 * TOTALMENTE fechado (sem vão), `Pathfinder._searchAStar` não encontra o destino e o
 * `findPath` cai no fallback `[{x:destX,z:destZ}]` — uma linha reta que atravessa o próprio
 * bloqueio, em vez de sinalizar "sem caminho". Isso já era esperado: a spec F3-04 previu esse
 * caso ("registre NEW-<n>, não reescreva o pathfinder") — ver `docs/TASKS.md` NEW sugerido no
 * relatório desta execução. Por isso os testes abaixo provam o bloqueio real no nível que
 * governa o jogo (`hasLineOfSight`/`isWalkable`, a mesma camada que construções usam) e o
 * contorno via `findPath` só no caso com vão (gameplay real: sempre há alguma folga).
 */
const DRY = { getHeight: () => 1.0 };

/** Anel de N “árvores” (blockCircle) em volta de (0,0); `skipIndex` remove uma (vão/corte). */
function buildRing(pf, { radius = 6, count = 16, treeRadius = 2.0, skipIndex = -1 } = {}) {
  const trees = [];
  for (let i = 0; i < count; i++) {
    if (i === skipIndex) continue;
    const ang = (i / count) * Math.PI * 2;
    const x = Math.cos(ang) * radius;
    const z = Math.sin(ang) * radius;
    pf.blockCircle(x, z, treeRadius, +1);
    trees.push({ x, z, radius: treeRadius });
  }
  return trees;
}

/** Confere que todo trecho do caminho fica em terreno livre (mesmo helper de pathfinder.test.js). */
function expectPathOnLand(pf, startX, startZ, path) {
  let px = startX;
  let pz = startZ;
  for (const wp of path) {
    expect(pf.hasLineOfSight(px, pz, wp.x, wp.z), `trecho (${px},${pz}) -> (${wp.x},${wp.z})`).toBe(true);
    px = wp.x;
    pz = wp.z;
  }
}

describe('F3-04: árvores vivas bloqueiam passagem (Pathfinder.blockCircle)', () => {
  it('anel fechado de árvores: sem linha de visão direta de dentro para fora', () => {
    const pf = new Pathfinder(DRY, 40);
    buildRing(pf, {});
    expect(pf.hasLineOfSight(0, 0, 20, 0)).toBe(false);
    expect(pf.hasLineOfSight(0, 0, -20, 0)).toBe(false);
    expect(pf.hasLineOfSight(0, 0, 0, 20)).toBe(false);
  });

  it('anel com um vão (uma árvore "não plantada"): findPath contorna passando pelo vão', () => {
    const pf = new Pathfinder(DRY, 40);
    // Vão no índice 0 → gap centrado em (radius, 0) = (6, 0).
    buildRing(pf, { skipIndex: 0 });

    // Sem vão adjacente ao ponto oposto: ainda bloqueado nessa direção.
    expect(pf.hasLineOfSight(0, 0, -20, 0)).toBe(false);

    const path = pf.findPath(0, 0, 20, 0);
    expect(path.length).toBeGreaterThan(0);
    expectPathOnLand(pf, 0, 0, path);
    // Chega perto do destino pedido (findPath sempre substitui o último waypoint pelo destino exato).
    expect(path[path.length - 1]).toEqual({ x: 20, z: 0 });
  });

  it('cortar uma árvore do anel fechado (blockCircle delta -1) abre passagem', () => {
    const pf = new Pathfinder(DRY, 40);
    const trees = buildRing(pf, {});
    expect(pf.hasLineOfSight(0, 0, 20, 0)).toBe(false);

    // "Corta" a árvore mais próxima de (radius, 0) — mesma chamada que GameManager faz ao
    // remover o bloqueio de uma árvore morta (ver GameManager ~l.1160/1167).
    const cut = trees.reduce((best, t) => (Math.abs(t.z) < Math.abs(best.z) ? t : best), trees[0]);
    pf.blockCircle(cut.x, cut.z, cut.radius, -1);

    const path = pf.findPath(0, 0, 20, 0);
    expectPathOnLand(pf, 0, 0, path);
    expect(path[path.length - 1]).toEqual({ x: 20, z: 0 });
  });
});
