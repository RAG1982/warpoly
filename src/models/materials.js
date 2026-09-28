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
 * Enable shadow casting & receiving on all child meshes
 * @param {THREE.Object3D} obj
 * @returns {THREE.Object3D}
 */
export function enableShadows(obj) {
  obj.traverse(child => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
  return obj;
}
