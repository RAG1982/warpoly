import { describe, it, expect } from 'vitest';
import { SceneManager } from '../../src/core/SceneManager.js';

describe('limite da câmera pelo mapa', () => {
  const sm = Object.create(SceneManager.prototype);

  it('mapas grandes (campanha 256, jogável 244) deixam a câmera alcançar as bordas', () => {
    sm.setCameraBoundsFromMap({ size: 256, playable: 244 });
    expect(sm.cameraBound).toBe(122);
  });

  it('usa size quando não há playable; mapas pequenos mantêm o mínimo de 55', () => {
    sm.setCameraBoundsFromMap({ size: 160 });
    expect(sm.cameraBound).toBe(80);
    sm.setCameraBoundsFromMap({ size: 64 });
    expect(sm.cameraBound).toBe(55);
    sm.setCameraBoundsFromMap(null);
    expect(sm.cameraBound).toBe(55);
  });
});
