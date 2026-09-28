import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { patchShaderForFog, fogAppliesTo, fogUniforms } from '../../src/render/fogOfWarShader.js';

describe('fogOfWarShader', () => {
  it('aplica só a materiais do mundo (não a HUD com depthTest=false nem noFog)', () => {
    expect(fogAppliesTo(new THREE.MeshStandardMaterial())).toBe(true);
    expect(fogAppliesTo(new THREE.MeshBasicMaterial())).toBe(true);
    expect(fogAppliesTo(new THREE.MeshBasicMaterial({ depthTest: false }))).toBe(false);
    const ghost = new THREE.MeshBasicMaterial();
    ghost.userData.noFog = true;
    expect(fogAppliesTo(ghost)).toBe(false);
    expect(fogAppliesTo(new THREE.SpriteMaterial())).toBe(false);
    expect(fogAppliesTo(new THREE.ShaderMaterial())).toBe(false);
  });

  it('cache key: mesmo sufixo para todos os materiais com névoa', () => {
    const a = new THREE.MeshStandardMaterial({ color: 0xff0000 });
    const b = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
    const hud = new THREE.MeshBasicMaterial({ depthTest: false });
    expect(a.customProgramCacheKey()).toBe(b.customProgramCacheKey());
    expect(a.customProgramCacheKey()).not.toBe(hud.customProgramCacheKey());
  });

  it('injeta varying, uniforms compartilhados e o bloco de cor', () => {
    const lib = THREE.ShaderLib.standard;
    const shader = { vertexShader: lib.vertexShader, fragmentShader: lib.fragmentShader, uniforms: {} };
    expect(patchShaderForFog(shader)).toBe(true);
    expect(shader.vertexShader).toContain('vFowXZ = ( modelMatrix * fowWorld ).xz');
    expect(shader.vertexShader).toContain('instanceMatrix * fowOrigin');
    expect(shader.vertexShader).not.toContain('#define WP_FOW_GROUND');
    const g = { vertexShader: lib.vertexShader, fragmentShader: lib.fragmentShader, uniforms: {} };
    patchShaderForFog(g, { ground: true });
    expect(g.vertexShader).toContain('#define WP_FOW_GROUND');
    expect(g.fragmentShader).toContain('#define WP_FOW_GROUND');
    expect(shader.fragmentShader).toContain('texture2D( fowMap');
    expect(shader.uniforms.fowMap).toBe(fogUniforms.fowMap);
  });
});
