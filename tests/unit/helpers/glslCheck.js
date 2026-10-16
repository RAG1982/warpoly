/**
 * Validação OFFLINE de shaders injetados via `onBeforeCompile` (sem GPU): monta o fragment shader de um material padrão do three como o
 * `WebGLProgram` faria (prefixo de defines + `#include` resolvidos com `THREE.ShaderChunk`) e roda o `glslangValidator`, se ele existir
 * na máquina. Não substitui o compilador do driver (limites de uniforms, extensões), mas pega erro de sintaxe, de tipo e de variável
 * não declarada no GLSL que os testes de string não pegam.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as THREE from 'three';

export function glslangAvailable() {
  try {
    return spawnSync('glslangValidator', ['--version'], { encoding: 'utf8' }).status === 0;
  } catch (e) {
    return false;
  }
}

/** Resolve `#include <chunk>` recursivamente com os trechos do three (como `resolveIncludes` do WebGLProgram). */
export function resolveIncludes(src) {
  return src.replace(/^[ \t]*#include +<([\w\d./]+)>/gm, (match, name) => {
    const chunk = THREE.ShaderChunk[name];
    if (chunk === undefined) throw new Error(`#include <${name}> inexistente no three`);
    return resolveIncludes(chunk);
  });
}

const PREFIX_COMMON = [
  '#version 300 es',
  '#define varying in',
  'layout(location = 0) out highp vec4 pc_fragColor;',
  '#define gl_FragColor pc_fragColor',
  '#define gl_FragDepthEXT gl_FragDepth',
  '#define texture2D texture',
  '#define textureCube texture',
  '#define texture2DProj textureProj',
  '#define texture2DLodEXT textureLod',
  'precision highp float;',
  'precision highp int;',
  'precision highp sampler2D;',
  'precision highp samplerCube;',
  'precision highp sampler3D;',
  'precision highp sampler2DArray;',
  'precision highp sampler2DShadow;',
  'precision highp samplerCubeShadow;',
  'precision highp sampler2DArrayShadow;',
  'precision highp isampler2D;',
  'precision highp isampler3D;',
  'precision highp isamplerCube;',
  'precision highp isampler2DArray;',
  'precision highp usampler2D;',
  'precision highp usampler3D;',
  'precision highp usamplerCube;',
  'precision highp usampler2DArray;'
];

/**
 * Fragment shader completo (texto GLSL ES 3.00) de um material padrão do three cujo `onBeforeCompile` é aplicado.
 * @param {THREE.Material} material  material com `onBeforeCompile` (a injeção sob teste)
 * @param {{shader?: 'standard'|'basic', defines?: string[]}} [opts]  `shader`: qual shader do three o material usa; `defines`: extras (`'USE_COLOR'`, `'USE_MAP'`…)
 */
export function buildFragmentGlsl(material, { shader: shaderName = 'standard', defines = [] } = {}) {
  const lib = THREE.ShaderLib[shaderName];
  const shader = { uniforms: {}, vertexShader: lib.vertexShader, fragmentShader: lib.fragmentShader };
  material.onBeforeCompile(shader, {});
  const lights = ['NUM_DIR_LIGHTS 0', 'NUM_POINT_LIGHTS 0', 'NUM_SPOT_LIGHTS 0', 'NUM_RECT_AREA_LIGHTS 0', 'NUM_SUN_LIGHTS 0', 'NUM_HEMI_LIGHTS 1',
    'NUM_DIR_LIGHT_SHADOWS 0', 'NUM_POINT_LIGHT_SHADOWS 0', 'NUM_SPOT_LIGHT_SHADOWS 0', 'NUM_SPOT_LIGHT_COORDS 0', 'NUM_SPOT_LIGHT_MAPS 0',
    'NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS 0', 'NUM_SUN_LIGHT_SHADOWS 0'];
  const defs = [...(shaderName === 'standard' ? ['STANDARD', 'OPAQUE'] : []), 'TONE_MAPPING', ...lights, 'NUM_CLIPPING_PLANES 0', 'UNION_CLIPPING_PLANES 0', ...defines]
    .map((d) => `#define ${d}`);
  const tail = [
    'uniform mat4 viewMatrix;',
    'uniform vec3 cameraPosition;',
    'uniform bool isOrthographic;',
    'vec3 toneMapping( vec3 color ) { return color; }',
    resolveIncludes('#include <colorspace_pars_fragment>'),
    'vec4 linearToOutputTexel( vec4 value ) { return value; }',
    'float luminance( const in vec3 rgb ) { return dot( rgb, vec3( 0.2126, 0.7152, 0.0722 ) ); }'
  ];
  // `average` (helper do three) colide com uma função embutida do glslang; o driver WebGL não a tem: renomeia só para validar
  return [...PREFIX_COMMON, ...defs, ...tail, resolveIncludes(shader.fragmentShader)].join('\n').replace(/\baverage\b/g, 'wpAverage');
}

/** Roda o `glslangValidator` num fragment shader; `{ ok, output }`. */
export function validateFragmentGlsl(glsl) {
  const dir = mkdtempSync(join(tmpdir(), 'wp-glsl-'));
  try {
    const file = join(dir, 'shader.frag');
    writeFileSync(file, glsl);
    const r = spawnSync('glslangValidator', ['-S', 'frag', file], { encoding: 'utf8' });
    return { ok: r.status === 0, output: `${r.stdout || ''}${r.stderr || ''}` };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
