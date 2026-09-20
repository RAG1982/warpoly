import * as THREE from 'three';

export const materials = {
  stone: new THREE.MeshStandardMaterial({ color: 0x93989c, flatShading: true, roughness: 0.85 }),
  stoneDark: new THREE.MeshStandardMaterial({ color: 0x767c80, flatShading: true, roughness: 0.9 }),
  stoneLight: new THREE.MeshStandardMaterial({ color: 0xb1b6bb, flatShading: true, roughness: 0.8 }),
  roofBlue: new THREE.MeshStandardMaterial({ color: 0x3d638c, flatShading: true, roughness: 0.65 }),
  roofGold: new THREE.MeshStandardMaterial({ color: 0xdaa94e, flatShading: true, roughness: 0.7 }),
  woodDark: new THREE.MeshStandardMaterial({ color: 0x5e3e26, flatShading: true, roughness: 0.8 }),
  woodMedium: new THREE.MeshStandardMaterial({ color: 0x825735, flatShading: true, roughness: 0.75 }),
  woodLight: new THREE.MeshStandardMaterial({ color: 0xbe9568, flatShading: true, roughness: 0.7 }),
  logEnd: new THREE.MeshStandardMaterial({ color: 0xd2ae82, flatShading: true, roughness: 0.8 }),
  plasterYellow: new THREE.MeshStandardMaterial({ color: 0xe8cf8c, flatShading: true, roughness: 0.8 }),
  goldOre: new THREE.MeshStandardMaterial({ color: 0xf5b81a, flatShading: true, roughness: 0.35, metalness: 0.7 }),
  goldOreBright: new THREE.MeshStandardMaterial({ color: 0xffd54f, flatShading: true, roughness: 0.25, metalness: 0.8 }),
  steelArmor: new THREE.MeshStandardMaterial({ color: 0xc8d2dc, flatShading: true, roughness: 0.3, metalness: 0.75 }),
  steelDark: new THREE.MeshStandardMaterial({ color: 0x7b8794, flatShading: true, roughness: 0.4, metalness: 0.6 }),
  redPlume: new THREE.MeshStandardMaterial({ color: 0xdb3236, flatShading: true, roughness: 0.7 }),
  leatherBrown: new THREE.MeshStandardMaterial({ color: 0x784a29, flatShading: true, roughness: 0.8 }),
  tunicGreen: new THREE.MeshStandardMaterial({ color: 0x487a3e, flatShading: true, roughness: 0.8 }),
  skin: new THREE.MeshStandardMaterial({ color: 0xf2be9b, flatShading: true, roughness: 0.7 }),
  bannerBlue: new THREE.MeshStandardMaterial({ color: 0x2b6cb0, flatShading: true, roughness: 0.6 }),
  leafGreen1: new THREE.MeshStandardMaterial({ color: 0x5ea853, flatShading: true, roughness: 0.8 }),
  leafGreen2: new THREE.MeshStandardMaterial({ color: 0x6eb758, flatShading: true, roughness: 0.8 }),
  leafGreen3: new THREE.MeshStandardMaterial({ color: 0x4a8f42, flatShading: true, roughness: 0.8 }),

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
