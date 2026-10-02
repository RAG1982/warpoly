import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  frustumGroundQuad, playerColor, pointerToCanvas, pickMinimapTarget, OrderFlashes, orderKindFor,
  NEUTRAL_COLOR, FALLBACK_COLOR, ORDER_FLASH_LIFE
} from '../../src/ui/minimapView.js';
import { worldToMinimap } from '../../src/ui/minimapCoords.js';

function cameraLooking(target, angle = 0, zoom = 1) {
  const cam = new THREE.PerspectiveCamera(32, 16 / 9, 0.5, 900);
  const dist = 76 * zoom;
  const height = 44 * zoom;
  cam.position.set(target.x + Math.cos(angle) * dist, height, target.z + Math.sin(angle) * dist);
  cam.lookAt(target);
  cam.updateMatrixWorld();
  cam.updateProjectionMatrix();
  return cam;
}

describe('frustumGroundQuad (F6-04)', () => {
  it('devolve um trapézio: borda de cima (longe) mais larga que a de baixo (perto)', () => {
    const cam = cameraLooking(new THREE.Vector3(0, 0, 0));
    const q = frustumGroundQuad(cam, THREE.Vector3, 200);
    expect(q).toHaveLength(4);
    const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
    const bottom = dist(q[0], q[1]);
    const top = dist(q[3], q[2]);
    expect(top).toBeGreaterThan(bottom * 1.1);
  });

  it('contém o ponto alvo da câmera (centro da tela) e fica dentro do mapa', () => {
    const cam = cameraLooking(new THREE.Vector3(10, 0, -5), 0.7);
    const size = 200;
    const q = frustumGroundQuad(cam, THREE.Vector3, size);
    // ponto dentro do polígono (ray casting)
    const inside = (px, pz) => {
      let c = false;
      for (let i = 0, j = q.length - 1; i < q.length; j = i++) {
        if ((q[i].z > pz) !== (q[j].z > pz) && px < ((q[j].x - q[i].x) * (pz - q[i].z)) / (q[j].z - q[i].z) + q[i].x) c = !c;
      }
      return c;
    };
    expect(inside(10, -5)).toBe(true);
    for (const p of q) {
      expect(Math.abs(p.x)).toBeLessThanOrEqual(size / 2);
      expect(Math.abs(p.z)).toBeLessThanOrEqual(size / 2);
    }
  });

  it('afastar o zoom aumenta a área; raios acima do horizonte ficam limitados (sem NaN)', () => {
    const area = (q) => { let a = 0; for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; a += q[i].x * q[j].z - q[j].x * q[i].z; } return Math.abs(a) / 2; };
    const near = frustumGroundQuad(cameraLooking(new THREE.Vector3(), 0, 0.6), THREE.Vector3, 1000);
    const far = frustumGroundQuad(cameraLooking(new THREE.Vector3(), 0, 1.4), THREE.Vector3, 1000);
    expect(area(far)).toBeGreaterThan(area(near));
    const flat = new THREE.PerspectiveCamera(60, 1, 0.5, 900);
    flat.position.set(0, 5, 0);
    flat.lookAt(0, 4.9, -50); // quase horizontal: o canto de cima não toca o chão
    const q = frustumGroundQuad(flat, THREE.Vector3, 2000, { maxDist: 150 });
    for (const p of q) { expect(Number.isFinite(p.x) && Number.isFinite(p.z)).toBe(true); expect(Math.hypot(p.x, p.z)).toBeLessThanOrEqual(151); }
  });

  it('o trapézio mapeado ao minimapa fica dentro do canvas', () => {
    const q = frustumGroundQuad(cameraLooking(new THREE.Vector3(0, 0, 0)), THREE.Vector3, 140);
    for (const p of q) {
      const m = worldToMinimap(p.x, p.z, 140, 140, 140);
      expect(m.x).toBeGreaterThanOrEqual(0); expect(m.x).toBeLessThanOrEqual(140);
      expect(m.y).toBeGreaterThanOrEqual(0); expect(m.y).toBeLessThanOrEqual(140);
    }
  });
});

describe('playerColor / pointerToCanvas', () => {
  const reg = { getPlayer: (id) => (id === 1 ? { color: '#ff00ff' } : id === 2 ? {} : null) };
  it('usa a cor do jogador; neutro em laranja; desconhecido em cinza', () => {
    expect(playerColor(reg, 1, 99)).toBe('#ff00ff');
    expect(playerColor(reg, 99, 99)).toBe(NEUTRAL_COLOR);
    expect(playerColor(reg, 2, 99)).toBe(FALLBACK_COLOR);
    expect(playerColor(reg, 7, 99)).toBe(FALLBACK_COLOR);
    expect(playerColor(null, 1, 99)).toBe(FALLBACK_COLOR);
  });
  it('compensa a escala CSS do canvas (escala de UI)', () => {
    const rect = { left: 10, top: 20, width: 210, height: 210 }; // canvas 140 mostrado a 1,5x
    expect(pointerToCanvas(10 + 105, 20 + 105, rect, 140, 140)).toEqual({ x: 70, y: 70 });
    expect(pointerToCanvas(10, 20, rect, 140, 140)).toEqual({ x: 0, y: 0 });
  });
});

describe('pickMinimapTarget', () => {
  const ent = (id, ownerId, x, z, extra = {}) => ({ id, ownerId, mesh: { position: { x, z } }, isDead: false, ...extra });
  const mkGm = (over = {}) => ({
    localPlayerId: 0,
    isHostile: (a, b) => a !== b && b !== 5, // 5 = aliado
    fogOfWar: { isVisible: () => true, isBuildingKnown: () => true, isExplored: () => true },
    enemies: [], buildings: [], resourceDeposits: [],
    ...over
  });

  it('prioriza unidade hostil > construção hostil > mina > obra própria; respeita o raio', () => {
    const gm = mkGm({
      enemies: [ent(1, 1, 10, 10)],
      buildings: [ent(2, 1, 10.5, 10), ent(3, 0, 10.2, 10, { isConstructed: false, hp: 1, maxHp: 10 })],
      resourceDeposits: [ent(4, null, 10.1, 10, { resourcesRemaining: 100 })]
    });
    expect(pickMinimapTarget(gm, 10, 10, 3).id).toBe(1);
    gm.enemies = [];
    expect(pickMinimapTarget(gm, 10, 10, 3).id).toBe(2);
    gm.buildings = [ent(3, 0, 10.2, 10, { isConstructed: false, hp: 1, maxHp: 10 })];
    expect(pickMinimapTarget(gm, 10, 10, 3).id).toBe(4);
    gm.resourceDeposits = [];
    expect(pickMinimapTarget(gm, 10, 10, 3).id).toBe(3);
    expect(pickMinimapTarget(gm, 50, 50, 3)).toBeNull();
  });

  it('ignora hostil na névoa, mina esgotada, mortos, aliados e construção própria íntegra', () => {
    const gm = mkGm({
      fogOfWar: { isVisible: () => false, isBuildingKnown: () => false, isExplored: () => true },
      enemies: [ent(1, 1, 0, 0)],
      buildings: [ent(2, 1, 0, 0), ent(3, 5, 0, 0), ent(4, 0, 0, 0, { isConstructed: true, hp: 10, maxHp: 10 })],
      resourceDeposits: [ent(5, null, 0, 0, { resourcesRemaining: 0 }), ent(6, null, 0, 0, { resourcesRemaining: 5, isDead: true })]
    });
    expect(pickMinimapTarget(gm, 0, 0, 3)).toBeNull();
    gm.fogOfWar.isExplored = () => false;
    gm.resourceDeposits = [ent(7, null, 0, 0, { resourcesRemaining: 9 })];
    expect(pickMinimapTarget(gm, 0, 0, 3)).toBeNull();
  });

  it('orderKindFor classifica ataque / coleta / mover', () => {
    const gm = mkGm();
    expect(orderKindFor(gm, null)).toBe('move');
    expect(orderKindFor(gm, ent(1, 1, 0, 0))).toBe('attack');
    expect(orderKindFor(gm, ent(2, null, 0, 0, { resourcesRemaining: 3, ownerId: 0 }))).toBe('gather');
  });
});

describe('OrderFlashes', () => {
  it('expira após ORDER_FLASH_LIFE e mantém no máximo 8', () => {
    const f = new OrderFlashes();
    for (let i = 0; i < 12; i++) f.add(i, i);
    expect(f.items).toHaveLength(8);
    f.update(ORDER_FLASH_LIFE / 2);
    expect(f.items).toHaveLength(8);
    f.update(ORDER_FLASH_LIFE);
    expect(f.items).toHaveLength(0);
  });
});
