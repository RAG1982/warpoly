import * as THREE from 'three';

export const materials = {
  stone: new THREE.MeshStandardMaterial({ color: 0x94a3b8, flatShading: true, roughness: 0.8 }),
  stoneDark: new THREE.MeshStandardMaterial({ color: 0x64748b, flatShading: true, roughness: 0.85 }),
  stoneLight: new THREE.MeshStandardMaterial({ color: 0xcfd8dc, flatShading: true, roughness: 0.75 }),
  roofBlue: new THREE.MeshStandardMaterial({ color: 0x2563eb, flatShading: true, roughness: 0.45 }),
  roofGold: new THREE.MeshStandardMaterial({ color: 0xfacc15, flatShading: true, roughness: 0.35, metalness: 0.65 }),
  woodDark: new THREE.MeshStandardMaterial({ color: 0x78350f, flatShading: true, roughness: 0.75 }),
  woodMedium: new THREE.MeshStandardMaterial({ color: 0x9a3412, flatShading: true, roughness: 0.7 }),
  woodLight: new THREE.MeshStandardMaterial({ color: 0xd97706, flatShading: true, roughness: 0.65 }),
  logEnd: new THREE.MeshStandardMaterial({ color: 0xfde68a, flatShading: true, roughness: 0.75 }),
  plasterYellow: new THREE.MeshStandardMaterial({ color: 0xfef08a, flatShading: true, roughness: 0.75 }),
  goldOre: new THREE.MeshStandardMaterial({ color: 0xfacc15, flatShading: true, roughness: 0.25, metalness: 0.85 }),
  goldOreBright: new THREE.MeshStandardMaterial({ color: 0xfef08a, flatShading: true, roughness: 0.18, metalness: 0.9 }),
  steelArmor: new THREE.MeshStandardMaterial({ color: 0xe2e8f0, flatShading: true, roughness: 0.22, metalness: 0.85 }),
  steelDark: new THREE.MeshStandardMaterial({ color: 0x94a3b8, flatShading: true, roughness: 0.3, metalness: 0.75 }),
  redPlume: new THREE.MeshStandardMaterial({ color: 0xef4444, flatShading: true, roughness: 0.5 }),
  leatherBrown: new THREE.MeshStandardMaterial({ color: 0x9a3412, flatShading: true, roughness: 0.65 }),
  tunicGreen: new THREE.MeshStandardMaterial({ color: 0x16a34a, flatShading: true, roughness: 0.58 }),
  skin: new THREE.MeshStandardMaterial({ color: 0xfed7aa, flatShading: true, roughness: 0.55 }),
  bannerBlue: new THREE.MeshStandardMaterial({ color: 0x2563eb, flatShading: true, roughness: 0.45 }),
  leafGreen1: new THREE.MeshStandardMaterial({ color: 0x4ade80, flatShading: true, roughness: 0.75 }),
  leafGreen2: new THREE.MeshStandardMaterial({ color: 0x22c55e, flatShading: true, roughness: 0.75 }),
  leafGreen3: new THREE.MeshStandardMaterial({ color: 0x16a34a, flatShading: true, roughness: 0.75 }),

  // Additional materials for decorations, environment, and buildings
  featherWhite: new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true }),
  bowString: new THREE.MeshBasicMaterial({ color: 0xffffff }),
  windowDark: new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.5 }),
  doorDark: new THREE.MeshStandardMaterial({ color: 0x27190f, roughness: 0.85 }),
  tunnelBlack: new THREE.MeshStandardMaterial({ color: 0x140f09, roughness: 0.95 }),
  soil: new THREE.MeshStandardMaterial({ color: 0x5a3922, roughness: 0.9 }),
  wheat: new THREE.MeshStandardMaterial({ color: 0xe6b843, flatShading: true }),
  banditCloth: new THREE.MeshStandardMaterial({ color: 0x4a3b32, flatShading: true }),
  tentCrimson: new THREE.MeshStandardMaterial({ color: 0x692b23, flatShading: true }),
  bannerRed: new THREE.MeshStandardMaterial({ color: 0xb91c1c, flatShading: true }),
  pebble: new THREE.MeshStandardMaterial({ color: 0x9fa4a6, flatShading: true, roughness: 0.9 }),
  grass: new THREE.MeshStandardMaterial({ color: 0x56a644, flatShading: true }),
  flowerLeaf: new THREE.MeshStandardMaterial({ color: 0x489639, flatShading: true }),
  flowerCenter: new THREE.MeshStandardMaterial({ color: 0xfacc15, flatShading: true })
};

/**
 * Limiar (raio da bounding sphere, em coordenadas do objeto raiz) abaixo do qual uma peça
 * não projeta sombra: parafusos, rebites, telhas pequenas, detalhes. F1-04.
 */
export const SHADOW_CAST_MIN_RADIUS = 0.4;
/** Modelos pequenos (unidades) usam um limiar proporcional ao próprio raio, até este piso. */
export const SHADOW_CAST_MIN_RADIUS_FLOOR = 0.12;
/** Fração do raio do modelo usada como limiar em modelos pequenos. */
export const SHADOW_CAST_RELATIVE = 0.12;
/** Abaixo deste raio a peça também não recebe sombra (não se nota e poupa shader). */
export const SHADOW_RECEIVE_MIN_RADIUS = 0.06;

/**
 * Opções globais de sombra dos modelos, ajustadas por QualitySettings.apply().
 * `pointLightShadows`: PointLights dos modelos (lanternas, braseiros) projetam sombra?
 * Cada uma custa 6 passadas extras (cubemap) e hoje redesenha as árvores instanciadas inteiras
 * (esfera de culling cobre o mapa todo): desligado em todos os presets até a F1-02/03.
 */
export const shadowOptions = { pointLightShadows: false };

const _rootInv = new THREE.Matrix4();
const _rel = new THREE.Matrix4();
const _sphere = new THREE.Sphere();

function castsVisibleShadow(material) {
  const mats = Array.isArray(material) ? material : [material];
  // Materiais sem iluminação (chamas, cordas de arco) ou muito transparentes não projetam sombra
  return mats.some(m => m && !m.isMeshBasicMaterial && !(m.transparent && m.opacity < 0.6));
}

/**
 * Liga sombras de forma seletiva nos filhos do modelo:
 * - `castShadow` só em peças cujo raio (coordenadas do raiz) ≥ limiar;
 *   limiar = clamp(raioDoModelo × 0,12, 0,12, 0,4) — assim unidades mantêm torso/pernas/armas
 *   e prédios descartam os detalhes miúdos;
 * - `receiveShadow` em tudo que não seja minúsculo;
 * - PointLights do modelo só projetam sombra se `shadowOptions.pointLightShadows`.
 * Opções: `minCastRadius` (limiar absoluto), `all: true` (comportamento antigo: tudo projeta).
 * Estatísticas da última chamada em `enableShadows.stats`.
 * @param {THREE.Object3D} obj
 * @param {{minCastRadius?: number, all?: boolean}} [options]
 * @returns {THREE.Object3D}
 */
export function enableShadows(obj, options = {}) {
  obj.updateMatrixWorld(true);
  _rootInv.copy(obj.matrixWorld).invert();

  // 1ª passada: raio de cada malha no espaço do raiz + raio do modelo inteiro
  const entries = [];
  let modelRadius = 0;
  obj.traverse(child => {
    // Luzes locais dos modelos: lembra quem pediu sombra e aplica a opção do preset
    if (child.isLight && !child.isDirectionalLight && (child.castShadow || child.userData.wantsShadow)) {
      child.userData.wantsShadow = true;
      child.castShadow = shadowOptions.pointLightShadows;
      return;
    }
    if (!child.isMesh) return;
    const geo = child.geometry;
    if (!geo) return;
    if (!geo.boundingSphere) geo.computeBoundingSphere();
    _rel.multiplyMatrices(_rootInv, child.matrixWorld);
    _sphere.copy(geo.boundingSphere).applyMatrix4(_rel);
    // InstancedMesh: a esfera da geometria não cobre as instâncias — sempre trata como grande
    const radius = child.isInstancedMesh ? Infinity : _sphere.radius;
    entries.push({ child, radius });
    if (!child.isInstancedMesh) modelRadius = Math.max(modelRadius, _sphere.center.length() + _sphere.radius);
  });

  const absMin = options.minCastRadius ?? SHADOW_CAST_MIN_RADIUS;
  const castMin = options.all ? 0 : Math.min(absMin, Math.max(SHADOW_CAST_MIN_RADIUS_FLOOR, modelRadius * SHADOW_CAST_RELATIVE));

  let cast = 0;
  for (const { child, radius } of entries) {
    child.castShadow = radius >= castMin && (options.all || castsVisibleShadow(child.material));
    child.receiveShadow = radius >= SHADOW_RECEIVE_MIN_RADIUS;
    if (child.castShadow) cast++;
  }
  enableShadows.stats = { meshes: entries.length, cast, castMin, modelRadius };
  return obj;
}
