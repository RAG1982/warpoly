import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { FogOfWar } from '../../src/core/FogOfWar.js';
import { fogUniforms } from '../../src/render/fogOfWarShader.js';

describe('FogOfWar — dispose', () => {
  it('dispose() seguido de nova instância não compartilha estado (uniform de textura trocado)', () => {
    const sceneA = new THREE.Scene();
    const fowA = new FogOfWar(sceneA, 160, 160);
    const texA = fogUniforms.fowMap.value;
    expect(texA).not.toBe(null);

    fowA.dispose();
    // O uniform compartilhado não pode continuar apontando para a textura já descartada.
    expect(fogUniforms.fowMap.value).not.toBe(texA);
    expect(fogUniforms.fowParams.value.z).toBe(0);

    const sceneB = new THREE.Scene();
    const fowB = new FogOfWar(sceneB, 160, 160);
    // A 2ª partida ganha sua própria textura, distinta da 1ª (já descartada).
    expect(fogUniforms.fowMap.value).not.toBe(texA);
    expect(fogUniforms.fowMap.value).toBe(fowB.fogTexture);
    fowB.dispose();
  });
});
