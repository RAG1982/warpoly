import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { Building } from '../../src/sim/Building.js';
import { BuildingView } from '../../src/render/BuildingView.js';
import { FogView } from '../../src/render/FogView.js';
import { ModelFactory } from '../../src/entities/ModelFactory.js';

vi.hoisted(() => {
  const quiet = (orig) => (...a) => { if (typeof a[0] === 'string' && a[0].startsWith('[glbModels]')) return; orig(...a); };
  console.warn = quiet(console.warn.bind(console));
  console.error = quiet(console.error.bind(console));
});

/**
 * NEW-13 — chamas de construção sob a névoa: escondida (`fogHidden`) ou só LEMBRADA (`fogMemory`: já vista, sem visão atual)
 * não animam nem emitem fumaça; visível, animam normalmente. A captura de 2026-10-11 mostrou que só o `fogHidden` não bastava:
 * `BuildingMemory.isKnown` é verdadeiro para sempre depois da 1ª vez que a construção foi vista.
 */
function burningView() {
  ModelFactory.headless = true;
  const b = new Building({ getHeight: () => 0 }, 'castle', 0, 0, true, 1);
  b.hp = b.maxHp * 0.3; // < 50 %: chamas de dano
  const view = new BuildingView(b, new THREE.Scene());
  const emit = vi.fn();
  const ctx = { gm: { events: { emit } }, camera: new THREE.PerspectiveCamera() };
  return { view, ctx, emit };
}

describe('BuildingView — chamas e a névoa (NEW-13)', () => {
  it('escondida pela névoa: flameTime parado, sem fumaça; visível: anima e emite', () => {
    try {
      const { view, ctx, emit } = burningView();
      view.update(0.016, ctx); // cria as chamas
      expect(view.flamesGroup).toBeTruthy();

      view.fogHidden = true;
      const t0 = view.flameTime;
      for (let i = 0; i < 100; i++) view.update(0.1, ctx); // 10 s de jogo
      expect(view.flameTime).toBe(t0);
      expect(emit).not.toHaveBeenCalled();

      view.fogHidden = false;
      for (let i = 0; i < 30; i++) view.update(0.1, ctx);
      expect(view.flameTime).toBeGreaterThan(t0 + 2.9);
      expect(emit).toHaveBeenCalled();
    } finally {
      ModelFactory.headless = false;
    }
  });
});

describe('BuildingView — chamas e a memória da névoa (NEW-13, revisão visual 2026-10-11)', () => {
  it('lembrada (fogMemory): flameTime parado, sem fumaça nem VFX ambiente; ao voltar a ser vista, anima de novo', () => {
    try {
      const { view, ctx, emit } = burningView();
      view.update(0.016, ctx); // cria as chamas
      view.update(0.5, ctx);
      expect(view.flameTime).toBeGreaterThan(0.4);

      view.fogMemory = true; // já vista, sem visão atual (fogHidden segue false: a construção continua desenhada)
      expect(view.fogHidden).toBe(false);
      const t0 = view.flameTime;
      const scale0 = view.flameTongues[0].mesh.scale.y;
      emit.mockClear();
      for (let i = 0; i < 100; i++) view.update(0.1, ctx); // 10 s de jogo
      expect(view.flameTime).toBe(t0);
      expect(view.flameTongues[0].mesh.scale.y).toBe(scale0);
      expect(emit).not.toHaveBeenCalled();
      expect(view.root.visible).toBe(true); // memória: continua na cena (escurecida pelo shader)

      view.fogMemory = false;
      for (let i = 0; i < 30; i++) view.update(0.1, ctx);
      expect(view.flameTime).toBeGreaterThan(t0 + 2.9);
      expect(emit).toHaveBeenCalled();
    } finally {
      ModelFactory.headless = false;
    }
  });

  it('a fumaça da chaminé da Casa também para na memória', () => {
    try {
      ModelFactory.headless = true;
      const b = new Building({ getHeight: () => 0 }, 'cottage', 0, 0, true, 1);
      const view = new BuildingView(b, new THREE.Scene());
      const emit = vi.fn();
      const ctx = { gm: { events: { emit } }, camera: new THREE.PerspectiveCamera() };
      view.fogMemory = true;
      for (let i = 0; i < 100; i++) view.update(0.1, ctx);
      expect(emit).not.toHaveBeenCalled();
      view.fogMemory = false;
      for (let i = 0; i < 30; i++) view.update(0.1, ctx);
      expect(emit).toHaveBeenCalled();
    } finally {
      ModelFactory.headless = false;
    }
  });

  it('FogView.cullHiddenEnemies: fogMemory só para construção conhecida e sem visão atual (e só com a névoa ligada)', () => {
    const fv = Object.create(FogView.prototype); // só a lógica de `cullHiddenEnemies` (sem textura/cena)
    const b = { mesh: {}, isDead: false };
    const view = { fogHidden: false, fogMemory: false };
    const mem = { known: true, visibleNow: true };
    fv.fog = { enabled: true, grid: { isVisible: () => true }, buildingMemory: { isKnown: () => mem.known, isVisibleNow: () => mem.visibleNow } };
    fv.viewOf = () => view;

    fv.cullHiddenEnemies([], [b]);
    expect([view.fogHidden, view.fogMemory]).toEqual([false, false]); // visível agora

    mem.visibleNow = false;
    fv.cullHiddenEnemies([], [b]);
    expect([view.fogHidden, view.fogMemory]).toEqual([false, true]); // lembrada: desenhada e parada

    mem.known = false;
    fv.cullHiddenEnemies([], [b]);
    expect(view.fogHidden).toBe(true); // nunca vista: escondida

    fv.fog.enabled = false;
    fv.cullHiddenEnemies([], [b]);
    expect([view.fogHidden, view.fogMemory]).toEqual([false, false]); // névoa desligada: tudo ao vivo
  });
});
