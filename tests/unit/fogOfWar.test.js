import { describe, it, expect, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { FogOfWar } from '../../src/sim/FogOfWar.js';
import { FogView } from '../../src/render/FogView.js';
import { fogUniforms, resetFogTexture } from '../../src/render/fogOfWarShader.js';

// NEW-41: `FogView` importa o `ModelFactory`, que na importação dispara o download de ~50 .glb (falha em Node, com um
// `console.warn` de pilha enorme por arquivo, assíncrono, durante o teste). `?glb=0` desliga essa carga automática.
vi.hoisted(() => {
  globalThis.window = { location: { search: '?glb=0' } };
});

// O uniform da névoa é um singleton do módulo: cada teste devolve o estado ao neutro, para não depender da ordem.
afterEach(() => {
  resetFogTexture();
  fogUniforms.fowParams.value.z = 0;
});

describe('FogOfWar — dispose', () => {
  it('dispose() seguido de nova instância não compartilha estado (uniform de textura trocado)', () => {
    const sceneA = new THREE.Scene();
    const fowA = new FogView(new FogOfWar(160, 160), sceneA);
    const texA = fogUniforms.fowMap.value;
    expect(texA).not.toBe(null);

    fowA.dispose();
    // O uniform compartilhado não pode continuar apontando para a textura já descartada.
    expect(fogUniforms.fowMap.value).not.toBe(texA);
    expect(fogUniforms.fowParams.value.z).toBe(0);

    const sceneB = new THREE.Scene();
    const fowB = new FogView(new FogOfWar(160, 160), sceneB);
    // A 2ª partida ganha sua própria textura, distinta da 1ª (já descartada).
    expect(fogUniforms.fowMap.value).not.toBe(texA);
    expect(fogUniforms.fowMap.value).toBe(fowB.fogTexture);
    fowB.dispose();
  }, 30000); // F8-04: o teste é síncrono mas estourava os 5 s padrão quando o pool do vitest está saturado
});
