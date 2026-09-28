import * as THREE from 'three';

/**
 * Névoa de guerra aplicada no shader dos materiais do mundo (F1-05, opção A).
 *
 * Um patch global de `onBeforeCompile` (no protótipo de `THREE.Material`) injeta, em todo material
 * Standard/Physical/Basic/Lambert/Phong/Toon, a amostragem de uma textura de visibilidade pela posição de
 * mundo (XZ) do fragmento: R = explorado, G = visível agora.
 *   - não explorado → cor da mortalha (quase preto)
 *   - memória       → cor dessaturada e escurecida
 *   - visível       → cor original
 * Vale para malhas comuns, InstancedMesh (árvores, decorações), BatchedMesh, terreno e água.
 *
 * Programas: todos os materiais com névoa ganham o mesmo sufixo em `customProgramCacheKey`, então o patch
 * não multiplica programas (cada programa "com névoa" substitui o "sem névoa" equivalente).
 * Os uniforms são objetos compartilhados: trocar a textura/parâmetros vale para todos os materiais de uma vez.
 *
 * Objetos (tudo que não é chão) usam o estado da névoa na ORIGEM deles (por instância em InstancedMesh), igual
 * para o objeto inteiro — uma árvore na borda não fica metade preta. Se a origem está em área não explorada
 * o objeto é recolhido no vertex shader
 * (vértices levados para fora do clip — sem `discard`, então o early-z continua valendo): assim uma árvore
 * no escuro não vira uma silhueta preta por cima do chão explorado atrás dela. O mesmo vale para os
 * materiais de profundidade das sombras (objeto oculto não projeta sombra). Malhas grandes cuja origem não
 * representa a posição (terreno, água) são marcadas com `userData.fogGround = true` (ver `markFogGround`)
 * e só escurecem por fragmento.
 *
 * Ficam SEM névoa: materiais com `depthTest === false` (barras de vida, HUD 3D), `userData.noFog === true`
 * (fantasma de construção, decal de clique…), ShaderMaterial/Sprite/Points/Line.
 * Mudar `userData.noFog`/`fogGround` depois do primeiro uso exige `material.needsUpdate = true`.
 *
 * O patch é instalado na importação deste módulo (antes do AssetPreloader compilar os materiais).
 * Enquanto nenhuma `FogOfWar` estiver ativa (`fowParams.z = 0`) o resultado é idêntico ao original.
 */

const _neutral = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
_neutral.needsUpdate = true;

export const fogUniforms = {
  /** Textura de visibilidade: R = explorado, G = visível (com blur); B = explorado, A = visível (sem blur). */
  fowMap: { value: _neutral },
  /** xy = 1 / tamanho do mundo (x, z); z = névoa ligada (0/1); w = limiar de "explorado" da origem do objeto. */
  fowParams: { value: new THREE.Vector4(1 / 160, 1 / 160, 0, 0.5) },
  /**
   * x = brilho da memória, y = dessaturação da memória,
   * z = largura da rampa (smoothstep 0..z sobre R/G: a borda suave fica do lado de FORA da área explorada,
   *     então tudo que está numa célula explorada/visível aparece inteiro), w = reservado.
   */
  fowStyle: { value: new THREE.Vector4(0.42, 0.72, 0.6, 0) },
  /** Cor das áreas não exploradas (espaço de saída, após tone mapping). */
  fowShroud: { value: new THREE.Vector3(0.012, 0.016, 0.024) }
};

const CACHE_SUFFIX = '|wp-fow1';
const CACHE_SUFFIX_GROUND = '|wp-fow1g';
const CACHE_SUFFIX_DEPTH = '|wp-fow1d';

/** Material de profundidade (sombras) que recebe só o recolhimento de objetos ocultos. */
function isFogDepthMaterial(material) {
  return !!material && (material.isMeshDepthMaterial || material.isMeshDistanceMaterial) &&
    !(material.userData && material.userData.noFog);
}

/** O material recebe névoa? */
export function fogAppliesTo(material) {
  if (!material) return false;
  if (material.userData && material.userData.noFog) return false;
  if (material.depthTest === false) return false;
  return !!(material.isMeshStandardMaterial || material.isMeshBasicMaterial || material.isMeshLambertMaterial ||
    material.isMeshPhongMaterial || material.isMeshToonMaterial);
}

/**
 * Marca malhas grandes (terreno, água) como "chão": só escurecem por fragmento, nunca são recolhidas.
 * Aceita material ou Object3D.
 */
export function markFogGround(target) {
  const mark = (m) => {
    if (!m || (m.userData && m.userData.fogGround)) return;
    m.userData.fogGround = true;
    m.needsUpdate = true;
  };
  if (!target) return;
  if (target.isMaterial) mark(target);
  else if (target.material) (Array.isArray(target.material) ? target.material : [target.material]).forEach(mark);
}

/** Marca materiais como imunes à névoa (HUD, fantasma de construção…). Aceita material, array ou Object3D. */
export function excludeFromFog(target) {
  const mark = (m) => {
    if (!m || (m.userData && m.userData.noFog)) return;
    m.userData.noFog = true;
    m.needsUpdate = true;
  };
  if (!target) return;
  if (Array.isArray(target)) target.forEach(mark);
  else if (target.isMaterial) mark(target);
  else if (target.traverse) {
    target.traverse(o => {
      if (!o.material) return;
      if (Array.isArray(o.material)) o.material.forEach(mark);
      else mark(o.material);
    });
  }
}

const VERTEX_DECL = /* glsl */`
uniform sampler2D fowMap;
uniform vec4 fowParams;
#ifdef WP_FOW_GROUND
  varying vec2 vFowXZ;
#else
  varying vec2 vFowObj;
#endif`;

const VERTEX_DECL_DEPTH = /* glsl */`
uniform sampler2D fowMap;
uniform vec4 fowParams;`;

// Chão (terreno/água): posição de mundo por vértice, amostrada por fragmento.
// Objetos: estado da névoa na ORIGEM (instância/lote/modelo), igual para o objeto inteiro; se a origem
// estiver em área não explorada o objeto é recolhido (vértices fora do clip).
const VERTEX_BODY = /* glsl */`
#ifdef WP_FOW_GROUND
{
  vec4 fowWorld = vec4( transformed, 1.0 );
  #ifdef USE_BATCHING
    fowWorld = batchingMatrix * fowWorld;
  #endif
  #ifdef USE_INSTANCING
    fowWorld = instanceMatrix * fowWorld;
  #endif
  vFowXZ = ( modelMatrix * fowWorld ).xz;
}
#else
{
  vec4 fowOrigin = vec4( 0.0, 0.0, 0.0, 1.0 );
  #ifdef USE_BATCHING
    fowOrigin = batchingMatrix * fowOrigin;
  #endif
  #ifdef USE_INSTANCING
    fowOrigin = instanceMatrix * fowOrigin;
  #endif
  vec4 fowO = textureLod( fowMap, ( modelMatrix * fowOrigin ).xz * fowParams.xy + 0.5, 0.0 );
  vFowObj = fowO.rg;
  if ( fowParams.z > 0.5 && fowO.b < fowParams.w ) gl_Position = vec4( 0.0, 0.0, 2.0, 1.0 );
}
#endif`;

// Profundidade (sombras): só o recolhimento.
const VERTEX_HIDE = /* glsl */`
{
  vec4 fowOrigin = vec4( 0.0, 0.0, 0.0, 1.0 );
  #ifdef USE_BATCHING
    fowOrigin = batchingMatrix * fowOrigin;
  #endif
  #ifdef USE_INSTANCING
    fowOrigin = instanceMatrix * fowOrigin;
  #endif
  float fowExplored = textureLod( fowMap, ( modelMatrix * fowOrigin ).xz * fowParams.xy + 0.5, 0.0 ).b;
  if ( fowParams.z > 0.5 && fowExplored < fowParams.w ) gl_Position = vec4( 0.0, 0.0, 2.0, 1.0 );
}`;

const FRAGMENT_DECL = /* glsl */`
uniform sampler2D fowMap;
uniform vec4 fowParams;
uniform vec4 fowStyle;
uniform vec3 fowShroud;
#ifdef WP_FOW_GROUND
  varying vec2 vFowXZ;
#else
  varying vec2 vFowObj;
#endif`;

const FRAGMENT_BODY = /* glsl */`
{
  #ifdef WP_FOW_GROUND
    vec2 fow = texture2D( fowMap, vFowXZ * fowParams.xy + 0.5 ).rg;
  #else
    vec2 fow = vFowObj;
  #endif
  fow = smoothstep( vec2( 0.0 ), vec2( fowStyle.z ), fow );
  vec3 fowCol = gl_FragColor.rgb;
  float fowLum = dot( fowCol, vec3( 0.299, 0.587, 0.114 ) );
  vec3 fowMem = mix( fowCol, vec3( fowLum ), fowStyle.y ) * fowStyle.x;
  vec3 fowOut = mix( fowMem, fowCol, fow.g );
  fowOut = mix( fowShroud, fowOut, fow.r );
  gl_FragColor.rgb = mix( fowCol, fowOut, fowParams.z );
}`;

/**
 * Injeta a névoa num shader de material embutido. Só altera se encontrar os pontos de injeção.
 * @param {{vertexShader:string, fragmentShader:string, uniforms:object, defines?:object}} shader
 * @param {{ground?: boolean}} [options] ground = não recolhe o objeto (terreno/água)
 * @returns {boolean}
 */
export function patchShaderForFog(shader, options = {}) {
  const vs = shader.vertexShader;
  const fs = shader.fragmentShader;
  if (!vs.includes('#include <project_vertex>') || !vs.includes('#include <common>')) return false;
  if (!fs.includes('#include <fog_fragment>') || !fs.includes('#include <common>')) return false;

  shader.uniforms.fowMap = fogUniforms.fowMap;
  shader.uniforms.fowParams = fogUniforms.fowParams;
  shader.uniforms.fowStyle = fogUniforms.fowStyle;
  shader.uniforms.fowShroud = fogUniforms.fowShroud;

  const ground = options.ground ? '\n#define WP_FOW_GROUND' : '';
  shader.vertexShader = vs
    .replace('#include <common>', `#include <common>${ground}${VERTEX_DECL}`)
    .replace('#include <project_vertex>', `#include <project_vertex>${VERTEX_BODY}`);
  // Depois da névoa de distância da cena: o não explorado fica preto mesmo ao longe.
  shader.fragmentShader = fs
    .replace('#include <common>', `#include <common>${ground}${FRAGMENT_DECL}`)
    .replace('#include <fog_fragment>', `#include <fog_fragment>${FRAGMENT_BODY}`);
  return true;
}

/** Materiais de profundidade (sombras): só recolhe objetos em área não explorada. */
export function patchDepthShaderForFog(shader) {
  const vs = shader.vertexShader;
  if (!vs.includes('#include <project_vertex>') || !vs.includes('#include <common>')) return false;
  shader.uniforms.fowMap = fogUniforms.fowMap;
  shader.uniforms.fowParams = fogUniforms.fowParams;
  shader.vertexShader = vs
    .replace('#include <common>', `#include <common>${VERTEX_DECL_DEPTH}`)
    .replace('#include <project_vertex>', `#include <project_vertex>${VERTEX_HIDE}`);
  return true;
}

let installed = false;

/** Instala o patch global (idempotente). */
export function installFogOfWarShader() {
  if (installed) return;
  installed = true;
  const proto = THREE.Material.prototype;
  const baseOnBeforeCompile = proto.onBeforeCompile;
  const baseCacheKey = proto.customProgramCacheKey;

  proto.onBeforeCompile = function fogOfWarOnBeforeCompile(shader, renderer) {
    baseOnBeforeCompile.call(this, shader, renderer);
    if (fogAppliesTo(this)) patchShaderForFog(shader, { ground: !!this.userData.fogGround });
    else if (isFogDepthMaterial(this)) patchDepthShaderForFog(shader);
  };
  proto.customProgramCacheKey = function fogOfWarCacheKey() {
    const key = baseCacheKey.call(this);
    if (fogAppliesTo(this)) return key + (this.userData.fogGround ? CACHE_SUFFIX_GROUND : CACHE_SUFFIX);
    return isFogDepthMaterial(this) ? key + CACHE_SUFFIX_DEPTH : key;
  };
}

installFogOfWarShader();
