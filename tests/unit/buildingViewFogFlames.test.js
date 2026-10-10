import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { Building } from '../../src/sim/Building.js';
import { BuildingView } from '../../src/render/BuildingView.js';
import { ModelFactory } from '../../src/entities/ModelFactory.js';

vi.hoisted(() => {
  const quiet = (orig) => (...a) => { if (typeof a[0] === 'string' && a[0].startsWith('[glbModels]')) return; orig(...a); };
  console.warn = quiet(console.warn.bind(console));
  console.error = quiet(console.error.bind(console));
});

/**
 * NEW-13 — chamas de construção sob a névoa (`fogHidden`): não animam e não emitem fumaça; visível, animam normalmente.
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
