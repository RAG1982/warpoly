import * as THREE from 'three';
import { getTextureQuality } from '../textureQuality.js';
import {
  DETAIL_ATLAS_SIDES,
  DETAIL_TILE_WORLD,
  paintDetailAtlas,
  detailChannelsOf,
  detailWeightsOfRegions,
  detailWeightsOfStyle,
  terrainDetailEnabled
} from './biomeDetail.js';

/**
 * M2-19 · liga o detalhe de bioma (`biomeDetail.js`) ao material do terreno: UM material, UMA malha, zero chamada de desenho a mais.
 * O `onBeforeCompile` do material soma ao splat (a) uma modulação de cor multiplicativa e (b) um relevo falso (perturbação da normal
 * pela derivada de tela da altura do padrão) lidos do atlas ladrilhável, ponderados pela textura de pesos por bioma.
 *
 * Texturas compartilhadas: o atlas por (qualidade, canais) e os pesos por `RegionMap` (WeakMap) ou por tileset.
 */

const atlasCache = new Map();
const weightCache = new WeakMap();
const styleWeightCache = new Map();

/** Textura do atlas (RGBA ladrilhável) para os canais pedidos, no lado do preset `?texq=` atual. */
export function getDetailAtlasTexture(channels) {
  const q = getTextureQuality();
  const side = DETAIL_ATLAS_SIDES[q] || DETAIL_ATLAS_SIDES.med;
  const key = `${side}_${channels.map((c) => (c ? 1 : 0)).join('')}`;
  let t = atlasCache.get(key);
  if (t) return t;
  const data = new Uint8Array(side * side * 4);
  paintDetailAtlas(data, side, channels);
  t = new THREE.DataTexture(data, side, side, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  t.colorSpace = THREE.NoColorSpace;
  t.userData = { side };
  t.needsUpdate = true;
  atlasCache.set(key, t);
  return t;
}

function weightTexture(n, data) {
  const t = new THREE.DataTexture(data, n, n, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.minFilter = t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}

/** Pesos de um mapa regional (memorizados por `RegionMap`) ou, sem regiões, os do tileset único (2×2 constante). */
function getWeightsTexture(def, regions) {
  if (regions) {
    if (weightCache.has(regions)) return weightCache.get(regions);
    const w = detailWeightsOfRegions(regions);
    const t = w ? weightTexture(w.n, w.data) : null;
    weightCache.set(regions, t);
    return t;
  }
  const sw = detailWeightsOfStyle(def);
  if (!sw) return null;
  const key = def.id;
  let t = styleWeightCache.get(key);
  if (!t) {
    const d = new Uint8Array(2 * 2 * 4);
    for (let i = 0; i < 4; i++) for (let k = 0; k < 4; k++) d[i * 4 + k] = Math.round(sw[k] * 255);
    t = weightTexture(2, d);
    styleWeightCache.set(key, t);
  }
  return t;
}

/** Amplitude da cor (multiplicativa) e do relevo falso por padrão (rocha, vulcânico, pântano, gelo/neve). */
const AMP = [0.85, 0.95, 1.1, 1.0];
const BUMP = [1.0, 1.2, 0.8, 0.8];
/** Tom multiplicado nas partes ESCURAS de cada padrão (frestas, fissuras, lama, rachaduras). */
const DARK = [[0.88, 0.85, 0.82], [1.0, 0.80, 0.74], [0.82, 0.90, 0.70], [0.80, 0.90, 1.04]];

/**
 * Instala o detalhe no material do terreno. Sem efeito (e devolve `false`) se `?terraindetail=0` ou nenhum estilo do mapa tem detalhe.
 * @param {THREE.MeshStandardMaterial} mat  precisa de `map` (o splat: o `vMapUv` dele é a posição de mundo normalizada)
 * @param {{ def: object, regions: object|null, size: number }} o
 * @returns {boolean}
 */
export function installBiomeDetail(mat, { def, regions, size }) {
  if (!terrainDetailEnabled() || !mat.map) return false;
  const defs = regions ? regions.styles.map((s) => s.def) : [def];
  const channels = detailChannelsOf(defs);
  if (!channels.some(Boolean)) return false;
  const weights = getWeightsTexture(def, regions);
  if (!weights) return false;
  const atlas = getDetailAtlasTexture(channels);

  const uniforms = {
    uBdAtlas: { value: atlas },
    uBdW: { value: weights },
    uBdRep: { value: size / DETAIL_TILE_WORLD },
    uBdSide: { value: atlas.userData.side },
    uBdAmp: { value: new THREE.Vector4(...AMP) },
    uBdBump: { value: new THREE.Vector4(...BUMP) },
    uBdDark: { value: DARK.map((c) => new THREE.Vector3(...c)) }
  };
  const baseCompile = THREE.Material.prototype.onBeforeCompile; // com o patch da névoa de guerra
  mat.onBeforeCompile = function biomeDetailOnBeforeCompile(shader, renderer) {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform sampler2D uBdAtlas; uniform sampler2D uBdW; uniform float uBdRep; uniform float uBdSide;
uniform vec4 uBdAmp; uniform vec4 uBdBump; uniform vec3 uBdDark[4];`)
      .replace('#include <map_fragment>', `#include <map_fragment>
float wpBdH = 0.0;
{
  vec4 wpW = texture2D( uBdW, vMapUv );
  vec2 wpD = vMapUv * uBdRep;
  vec4 wpP1 = texture2D( uBdAtlas, wpD );
  vec4 wpP2 = texture2D( uBdAtlas, wpD.yx * 0.37 + vec2( 0.31, 0.57 ) );
  vec4 wpV = ( wpP1 - 0.5 ) * ( 0.65 + 0.7 * wpP2 ) * 2.0;
  vec4 wpDark = clamp( -wpV, 0.0, 1.0 ) * wpW;
  vec3 wpC = diffuseColor.rgb * max( 0.0, 1.0 + dot( wpW * uBdAmp, wpV ) );
  wpC *= mix( vec3( 1.0 ), uBdDark[0], wpDark.x ) * mix( vec3( 1.0 ), uBdDark[1], wpDark.y )
       * mix( vec3( 1.0 ), uBdDark[2], wpDark.z ) * mix( vec3( 1.0 ), uBdDark[3], wpDark.w );
  diffuseColor.rgb = wpC;
  float wpTexPerPx = max( length( fwidth( wpD ) ), 1e-5 ) * uBdSide;
  wpBdH = dot( wpW * uBdBump, wpV ) * ( 1.0 - smoothstep( 0.6, 2.2, wpTexPerPx ) ) * 0.06;
}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{
  vec2 wpDh = vec2( dFdx( wpBdH ), dFdy( wpBdH ) );
  vec3 wpSx = normalize( dFdx( - vViewPosition ) );
  vec3 wpSy = normalize( dFdy( - vViewPosition ) );
  vec3 wpR1 = cross( wpSy, normal );
  vec3 wpR2 = cross( normal, wpSx );
  float wpDet = dot( wpSx, wpR1 ) * faceDirection;
  vec3 wpGrad = sign( wpDet ) * ( wpDh.x * wpR1 + wpDh.y * wpR2 );
  normal = normalize( abs( wpDet ) * normal - wpGrad );
}`);
    baseCompile.call(this, shader, renderer);
  };
  mat.customProgramCacheKey = function () {
    return 'wp-biomedetail' + THREE.Material.prototype.customProgramCacheKey.call(this);
  };
  mat.needsUpdate = true;
  mat.userData.biomeDetail = { channels, uniforms };
  return true;
}
