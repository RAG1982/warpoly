import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  getWaterSurfaceTextures,
  getCattailLotusTextures
} from '../models/environment/waterTextures.js';
import { enableShadows } from '../models/materials.js';
import { markFogGround } from '../render/fogOfWarShader.js';
import { getMapTileset, getTileset } from '../data/tilesets.js';
import { getTextureQuality } from '../models/textureQuality.js';
import { getRegionMap } from '../data/biomeRegions.js';
import { buildLavaInfo } from '../data/lavaRender.js';
import { Lava } from './Lava.js';

/**
 * F7-00b (aceite de desempenho): funde todos os `Mesh` sob `root` (qualquer profundidade; `root` na identidade e sem pai) em UM
 * `Mesh` por material, em coordenadas de `root`. As plantas aquáticas eram ~625 malhas soltas (hastes, cabeças, lâminas, folhas,
 * pétalas...) = ~500 dos ~680 draw calls da cena inicial (passe principal + sombras); agora são ~8 malhas por moita.
 */
export function mergeByMaterial(root, name) {
  root.updateMatrixWorld(true);
  const byMaterial = new Map();
  root.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry.clone().applyMatrix4(o.matrixWorld);
    if (!byMaterial.has(o.material)) byMaterial.set(o.material, []);
    byMaterial.get(o.material).push(g);
  });
  const out = new THREE.Group();
  out.name = name;
  for (const [material, geos] of byMaterial) {
    const merged = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    out.add(new THREE.Mesh(merged, material));
  }
  return out;
}

/**
 * M2-16: tinta da água RASA por tileset-base (cor sRGB + quanto ela tinge, 0..1) e transparência extra na beirada. A água vai de
 * "fundo" (cor do estilo, um pouco mais escura) a "raso" (tinta clara, mais translúcida, o fundo de areia aparece) pela profundidade
 * do terreno sob cada vértice: o gradiente raso→fundo das costas. Só em mapas regionais (`biomeGrid`).
 */
const SHALLOW_TINT = {
  default: { color: 0x9cf0e0, amount: 0.5 },
  pantano: { color: 0xa3b45e, amount: 0.42 }, // lagoa turva: raso esverdeado de limo
  inverno: { color: 0xdaf3ff, amount: 0.42 },
  vulcanico: { color: 0x6c6a66, amount: 0.18 },
  deserto: { color: 0x94f0d6, amount: 0.55 },
  savana: { color: 0xa0e8c8, amount: 0.46 },
  pedregoso: { color: 0xa9dde6, amount: 0.34 }
};
const SHALLOW_END = 2.6; // u de profundidade em que a tinta rasa some
const DEEP_START = 1.4; // u a partir de onde a água escurece
const DEEP_END = 4.5;
const smooth01 = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Água rasa própria para juncos/vitórias-régias: abaixo do nível d'água, mas longe do abismo. */
const REED_MIN_DEPTH = 0.05;
const REED_MAX_DEPTH = 0.6;
const REED_CLEARANCE = 0.9; // pontos em volta da moita também precisam estar na água (rasa ou funda, nunca terra)
const REED_SPACING = 7;

/**
 * NEW-52: escolhe até `max` posições de moitas em água rasa do terreno (determinístico: varre uma grade
 * em ordem fixa, pula `REED_SPACING` entre moitas). Terreno sem água rasa => lista vazia.
 * MUNDO-5: `accept(x, z)` (opcional) filtra as posições (moitas só em água de região com plantas); sem ele, nada muda.
 * @returns {Array<{x:number, z:number}>}
 */
export function pickReedLocations(terrain, waterLevel = 0.5, max = 7, accept = null) {
  const size = (terrain && (terrain.mapDef?.size || terrain.width)) || 140;
  // M1-05/NEW-52: só dentro da área jogável (`mapDef.playable`); antes a varredura ia até a borda do mundo (juncos na névoa, fora de jogo).
  const playable = terrain && terrain.mapDef && terrain.mapDef.playable;
  const half = Math.min(size / 2 - 4, playable ? playable / 2 : Infinity);
  // MUNDO-5: lava (altura assada 0,4, "rasa" para esta conta) não é água: nada de juncos no córrego. Mapa sem `lavaGrid`: sempre falso.
  const lava = (x, z) => typeof terrain.isLava === 'function' && terrain.isLava(x, z);
  const shallow = (x, z) => {
    if (lava(x, z)) return false;
    const h = terrain.getHeight(x, z);
    return h <= waterLevel - REED_MIN_DEPTH && h >= waterLevel - REED_MAX_DEPTH;
  };
  const wet = (x, z) => !lava(x, z) && terrain.getHeight(x, z) <= waterLevel - REED_MIN_DEPTH;
  const ring = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const found = [];
  // Varredura em ordem fixa (determinística); o espaçamento mínimo espalha as moitas pelo mapa.
  for (let x = -half; x <= half && found.length < max; x += 1) {
    for (let z = -half; z <= half && found.length < max; z += 1) {
      if (!shallow(x, z)) continue;
      if (!ring.every(([dx, dz]) => wet(x + dx * REED_CLEARANCE, z + dz * REED_CLEARANCE))) continue;
      if (accept && !accept(x, z)) continue;
      if (found.some((f) => Math.hypot(f.x - x, f.z - z) < REED_SPACING)) continue;
      found.push({ x, z });
    }
  }
  return found;
}

/**
 * Next-Gen Stylized Water & Shoreline System for WarPoly
 * Stylized hand-painted look with soft shading.
 *
 * Architecture:
 * 1. Deep Water Base Plane: Rich deep sapphire / ocean navy blue foundation.
 * 2. Translucent Animated Surface: Seamless Voronoi caustic light webs, low-poly wave displacement.
 * 3. Shoreline Foam Fringes: Stylized scalloped surf foam rings hugging the coastlines of the
 *    main island and bandit mini-island with pulsating alpha and tidal surge.
 * 4. Enhanced Cattails & Lotus Lilies: Textured velvet brown cattails, floating lotus pads & water lilies.
 */
export class Water {
  /**
   * @param {{tileset?: string, regions?: boolean}} [options]  F7-04: cor da água, espuma e plantas vêm do tileset (padrão: `mapDef.tileset`).
   *   MUNDO-5: com `mapDef.biomeGrid` a cor/opacidade da água, a cor/força da espuma e as moitas variam por região (o mar adota o
   *   estilo da costa vizinha e volta ao tileset base longe dela); `regions: false` desliga. Com `mapDef.lavaGrid` desenha a lava
   *   emissiva (`world/Lava.js`, 1 draw call) e tira a espuma das bordas dela.
   */
  constructor(scene, terrain, options = {}) {
    this.scene = scene;
    this.terrain = terrain;
    this.waterLevel = 0.5;
    this.tileset = options.tileset ? getTileset(options.tileset) : getMapTileset(terrain && terrain.mapDef);
    this.cfg = this.tileset.water;
    /** MUNDO-5: regiões de bioma, ou `null` = caminho antigo (água/espuma/plantas só do tileset do mapa). */
    this.regions = options.regions === false ? null : getRegionMap(terrain && terrain.mapDef, this.tileset);
    /** MUNDO-5: lava do mapa (informação pura), ou `null`. */
    this.lavaInfo = buildLavaInfo(terrain && terrain.mapDef);

    // Collections for animations
    this.reedClumps = [];
    this.lotusEntities = [];

    // Multi-tiered Water System
    this.createDeepWaterBase();
    this.createWaterMesh();
    this.createShoreFoam();
    if (this._wantsReeds()) this.createReeds();
    /** MUNDO-5: malha de lava emissiva (só em mapa com `lavaGrid`), animada por `update`. */
    this.lava = this.lavaInfo ? new Lava(scene, this.lavaInfo) : null;
  }

  /** Há juncos/vitórias-régias neste mapa? Caminho antigo: flag do tileset; regional: se algum estilo tem plantas. */
  _wantsReeds() {
    if (!this.regions) return !!this.cfg.plants;
    return this.regions.styles.some((st) => st.def.water && st.def.water.plants);
  }

  /**
   * MUNDO-5: cores por vértice a partir das regiões — `styleValue(def)` devolve [r, g, b, a] do estilo (sRGB 0..255; a = alfa/escala);
   * o resultado é a média ponderada pela influência regional na água (campo largo) no ponto de cada vértice, gravada como atributo
   * `color` (RGBA, rgb em espaço linear) da malha.
   * @param {import('three').BufferGeometry} geo  malha plana em XZ (mundo)
   * @param {(def: object) => number[]} styleValue
   */
  _regionalColors(geo, styleValue) {
    const regions = this.regions;
    const pos = geo.attributes.position;
    const K = regions.styleCount;
    const W = new Float32Array(K);
    const out = new Float32Array(pos.count * 4);
    const tmp = new THREE.Color();
    const vals = regions.styles.map((st) => styleValue(st.def));
    for (let i = 0; i < pos.count; i++) {
      regions.waterWeightsAt(pos.getX(i), pos.getZ(i), W);
      let r = 0, g = 0, b = 0, a = 0;
      for (let k = 0; k < K; k++) {
        const v = vals[k];
        r += W[k] * v[0]; g += W[k] * v[1]; b += W[k] * v[2]; a += W[k] * v[3];
      }
      tmp.setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace);
      out[i * 4] = tmp.r; out[i * 4 + 1] = tmp.g; out[i * 4 + 2] = tmp.b; out[i * 4 + 3] = a;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(out, 4));
  }

  /**
   * M2-16: aplica o gradiente raso→fundo às cores por vértice (RGBA linear) de `geo`: a profundidade vem do terreno sob o vértice
   * (média de 5 amostras); perto da costa a cor vai para a tinta rasa do estilo e fica mais translúcida, longe dela escurece.
   */
  _applyDepthGradient(geo) {
    const terrain = this.terrain, regions = this.regions;
    const pos = geo.attributes.position;
    const col = geo.attributes.color;
    const tint = new THREE.Color();
    const tintCache = new Map();
    const tintOf = (def) => {
      const id = def.baseId || def.id;
      let v = tintCache.get(id);
      if (!v) {
        const cfg = SHALLOW_TINT[id] || SHALLOW_TINT.default;
        v = { c: new THREE.Color(cfg.color), amount: cfg.amount };
        tintCache.set(id, v);
      }
      return v;
    };
    const wl = this.waterLevel;
    const lava = this.lavaInfo;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      if (lava && lava.isLavaAt(x, z)) continue;
      const hMin = Math.min(
        terrain.getHeight(x, z), terrain.getHeight(x + 1.2, z), terrain.getHeight(x - 1.2, z),
        terrain.getHeight(x, z + 1.2), terrain.getHeight(x, z - 1.2)
      );
      const hAvg = (terrain.getHeight(x, z) + hMin) / 2;
      const depth = wl - hAvg;
      const shallow = 1 - smooth01(0.0, SHALLOW_END, depth);
      const deep = smooth01(DEEP_START, DEEP_END, depth);
      const t = tintOf(regions.styles[regions.waterStyleAt(x, z)].def);
      tint.copy(t.c).convertSRGBToLinear();
      const k = shallow * t.amount;
      let r = col.getX(i), g = col.getY(i), b = col.getZ(i), a = col.getW(i);
      r += (tint.r - r) * k; g += (tint.g - g) * k; b += (tint.b - b) * k;
      const dk = 1 - 0.28 * deep;
      col.setXYZW(i, r * dk, g * dk, b * dk, Math.min(1, a * (1 - 0.2 * shallow)));
    }
    col.needsUpdate = true;
  }

  /**
   * 1. Deep Water Base Plane (Abyssal sapphire / ocean navy foundation)
   */
  createDeepWaterBase() {
    // Estende bem além do mapa (±700 u) para que, com a câmera olhando para fora da área
    // jogável, a névoa de guerra escureça esse "oceano distante" em vez de mostrar o
    // scene.background azul do céu na borda (NEW-13). Os ±250 u da 1ª correção ainda deixavam triângulos de céu nos
    // cantos de cima com a câmera no canto do mapa e o zoom máximo (0,5 % do quadro; revisão visual 2026-10-11):
    // o alvo vai a ±55, a câmera fica a ~120 u dele e a borda de cima da tela alcança ~340 u no chão (FOV 32°, far 900).
    const geo = new THREE.PlaneGeometry(1400, 1400, 8, 8);
    geo.rotateX(-Math.PI / 2);

    const mat = new THREE.MeshStandardMaterial({
      color: this.cfg.deep, // Deep abyssal sapphire / navy blue (tileset)
      roughness: 0.92,
      metalness: 0.08,
      flatShading: true
    });
    markFogGround(mat);

    this.deepWaterMesh = new THREE.Mesh(geo, mat);
    this.deepWaterMesh.position.y = -1.8;
    this.deepWaterMesh.receiveShadow = true;
    this.deepWaterMesh.name = 'DeepWaterBase';
    this.scene.add(this.deepWaterMesh);
  }

  /**
   * 2. Translucent Animated Surface Mesh with Caustic Ripples & Low-Poly Wave Facets
   */
  createWaterMesh() {
    // M1-01: os 150 u fixos cobriam só o miolo dos mapas de 224 u (borda reta turquesa × azul-escuro à vista); agora a lâmina
    // acompanha o mapa (mesma densidade de vértices e a mesma escala da textura de ondas dos mapas de ≤ 150 u).
    // Só nos mapas com `biomeGrid` (224 u): os mapas antigos ficam byte a byte como antes (golden de regionalWorld.test.js).
    const def = this.terrain && this.terrain.mapDef;
    const size = def && def.biomeGrid ? Math.max(150, (def.size || 0) + 8) : 150;
    const segments = Math.round((64 * size) / 150);
    const geo = new THREE.PlaneGeometry(size, size, segments, segments);
    geo.rotateX(-Math.PI / 2);
    if (size > 150) {
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, ((uv.getX(i) - 0.5) * size) / 150 + 0.5, ((uv.getY(i) - 0.5) * size) / 150 + 0.5);
    }

    this.initialPositions = geo.attributes.position.array.slice();

    const surfaceTextures = getWaterSurfaceTextures();

    // MUNDO-5: cor e opacidade da água por região (RGBA por vértice: o plano tem ~2,3 u por vértice, então a mistura entre regiões
    // sai como gradiente). O material fica branco/opaco e o vértice manda; sem regiões é exatamente o material de antes.
    const regional = !!this.regions;
    if (regional) {
      this._regionalColors(geo, (def) => {
        const w = def.water, c = [(w.color >> 16) & 255, (w.color >> 8) & 255, w.color & 255];
        return [c[0], c[1], c[2], w.opacity];
      });
      this._applyDepthGradient(geo); // M2-16: raso turquesa → fundo escuro
    }

    this.surfaceMat = new THREE.MeshStandardMaterial({
      color: regional ? 0xffffff : this.cfg.color, // tint do tileset (padrão: ciano/turquesa)
      map: surfaceTextures.map,
      roughnessMap: surfaceTextures.roughnessMap,
      bumpMap: surfaceTextures.bumpMap,
      bumpScale: 0.06,
      roughness: 0.16,
      metalness: 0.20,
      transparent: true,
      opacity: regional ? 1 : this.cfg.opacity,
      vertexColors: regional,
      flatShading: true
    });

    this.mesh = new THREE.Mesh(geo, this.surfaceMat);
    this.mesh.position.y = this.waterLevel;
    this.mesh.receiveShadow = true;
    this.mesh.name = 'WaterSurface';
    this.scene.add(this.mesh);
  }



  /**
   * 3. F7-04 · Espuma de costa: UM plano (1 draw call) logo acima da água, com a altura relativa ao nível d'água
   * amostrada do terreno numa DataTexture 256² (R = (h − nível + 1)/3). O shader desenha uma frente de onda que avança e
   * recua + uma onda secundária mais fraca, quebradas por ruído. `?texq=low`: faixa estática simples (só pulsa a opacidade).
   */
  createShoreFoam() {
    const terrain = this.terrain;
    const size = terrain.width;
    const G = 256;
    const data = new Uint8Array(G * G * 4);
    for (let j = 0; j < G; j++) {
      const z = size / 2 - (j + 0.5) * (size / G); // linha 0 = v 0 = z positivo (rotateX(-90°) do plano)
      for (let i = 0; i < G; i++) {
        const x = -size / 2 + (i + 0.5) * (size / G);
        let hh = terrain.getHeight(x, z) - this.waterLevel;
        if (this.lavaInfo && this.lavaInfo.isLavaAt(x, z)) hh = 2; // MUNDO-5: a lava (h 0,4 < água) conta como terra: sem espuma na borda dela
        const o = (j * G + i) * 4;
        data[o] = Math.max(0, Math.min(255, Math.round(((hh + 1) / 3) * 255)));
        data[o + 3] = 255;
      }
    }
    const tex = new THREE.DataTexture(data, G, G, THREE.RGBAFormat);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.needsUpdate = true;

    const low = getTextureQuality() === 'low';
    const mat = new THREE.MeshBasicMaterial({
      map: tex, transparent: true, depthWrite: false, color: 0xffffff,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
    });
    const regional = !!this.regions;
    const uniforms = {
      uTime: { value: 0 },
      uSize: { value: size },
      uLow: { value: low ? 1 : 0 },
      // MUNDO-5: regional = a cor da espuma vem do vértice (cor × `uFoam` branco); sem regiões, a cor do tileset como sempre
      uFoam: { value: new THREE.Color(regional ? 0xffffff : this.cfg.foam) },
      uStrength: { value: this.cfg.foamStrength * (regional ? 1.25 : 1.6) } // M2-16: espuma regional mais discreta
    };
    const baseCompile = THREE.Material.prototype.onBeforeCompile; // inclui o patch da névoa de guerra
    mat.onBeforeCompile = function foamOnBeforeCompile(shader, renderer) {
      Object.assign(shader.uniforms, uniforms);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
uniform float uTime; uniform float uSize; uniform float uLow; uniform vec3 uFoam; uniform float uStrength;`)
        .replace('#include <map_fragment>', `
float hh = texture2D( map, vMapUv ).r * 3.0 - 1.0;
vec2 wp = vMapUv * uSize;
float a;
if ( uLow > 0.5 ) {
  a = ( 1.0 - smoothstep( 0.08, 0.3, abs( hh + 0.12 ) ) ) * 0.9;
} else {
  float swell = 0.5 + 0.5 * sin( uTime * 0.9 + wp.x * 0.11 + wp.y * 0.07 );
  float edge = -0.32 + swell * 0.38;
  float nz = 0.7 + 0.3 * sin( wp.x * 1.7 + uTime * 0.6 ) * sin( wp.y * 1.9 - uTime * 0.5 );
  float front = 1.0 - smoothstep( 0.10, 0.34, abs( hh - edge ) );
  float trail = ( 1.0 - smoothstep( 0.08, 0.30, abs( hh - ( edge - 0.38 ) ) ) ) * 0.5;
  float rim = ( 1.0 - smoothstep( 0.04, 0.14, abs( hh + 0.02 ) ) ) * 0.6;
  a = ( front + trail ) * nz + rim;
}
a *= step( -0.95, hh ) * uStrength;
diffuseColor = vec4( uFoam, clamp( a, 0.0, 1.0 ) );`);
      baseCompile.call(this, shader, renderer);
    };
    mat.customProgramCacheKey = function () {
      return 'wp-foam' + THREE.Material.prototype.customProgramCacheKey.call(this);
    };
    markFogGround(mat);

    // Regional: malha subdividida (2 304 triângulos, ainda 1 draw call) com cor/força da espuma por vértice; sem regiões, o quad de sempre.
    const foamSegs = regional ? 48 : 1;
    const geo = new THREE.PlaneGeometry(size, size, foamSegs, foamSegs);
    geo.rotateX(-Math.PI / 2);
    if (regional) {
      const baseStrength = this.cfg.foamStrength || 1;
      this._regionalColors(geo, (def) => {
        const w = def.water, c = [(w.foam >> 16) & 255, (w.foam >> 8) & 255, w.foam & 255];
        return [c[0], c[1], c[2], Math.max(0.25, Math.min(1.7, (w.foamStrength ?? baseStrength) / baseStrength))];
      });
      mat.vertexColors = true;
    }
    this.foamMesh = new THREE.Mesh(geo, mat);
    this.foamMesh.position.y = this.waterLevel + 0.16;
    this.foamMesh.renderOrder = 1;
    this.foamMesh.name = 'ShoreFoam';
    this.foamUniforms = uniforms;
    this.foamLow = low;
    this.scene.add(this.foamMesh);
  }

  /**
   * 4. Enhanced Cattails, Lotus Pads & Water Lilies
   */
  createReeds() {
    const reedGroup = new THREE.Group();
    reedGroup.name = 'WaterVegetationGroup';

    // NEW-52: moitas só em água rasa DESTE mapa (antes: 7 posições fixas do mapa antigo, que caíam em terra seca).
    // MUNDO-5: mapa regional só põe moitas na água de regiões com plantas (pântano, oásis…); sem plantas no tileset base, no máximo 2
    // moitas (≈ 8 malhas cada), para o orçamento de draw calls.
    const regions = this.regions;
    const reedLocations = regions
      ? pickReedLocations(this.terrain, this.waterLevel, this.cfg.plants ? 7 : 2, (x, z) => {
        const def = regions.styles[regions.waterStyleAt(x, z)].def;
        return !!(def.water && def.water.plants);
      })
      : pickReedLocations(this.terrain, this.waterLevel);

    const cattailTex = getCattailLotusTextures();

    // Materials
    const stemMat = new THREE.MeshStandardMaterial({
      map: cattailTex.cattailStemMap,
      roughness: 0.52,
      flatShading: true
    });

    const headMat = new THREE.MeshStandardMaterial({
      map: cattailTex.cattailHeadMap,
      roughnessMap: cattailTex.cattailHeadRoughness,
      roughness: 0.88,
      flatShading: true
    });

    const tipSpikeMat = new THREE.MeshStandardMaterial({
      color: 0x8a623a,
      roughness: 0.85,
      flatShading: true
    });

    const bladeMat = new THREE.MeshStandardMaterial({
      color: 0x4e933f,
      roughness: 0.6,
      side: THREE.DoubleSide,
      flatShading: true
    });

    const lotusLeafMat = new THREE.MeshStandardMaterial({
      map: cattailTex.lotusLeafMap,
      roughness: 0.28,
      side: THREE.DoubleSide
    });

    const lotusPetalMat = new THREE.MeshStandardMaterial({
      map: cattailTex.lotusPetalMap,
      roughness: 0.42,
      side: THREE.DoubleSide
    });

    const lotusCenterMat = new THREE.MeshStandardMaterial({
      color: 0xfbbf24,
      roughness: 0.35,
      flatShading: true
    });

    // Reusable Geometries
    const headCylinderGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.52, 7);
    const headCapGeo = new THREE.SphereGeometry(0.08, 7, 4);
    const spikeGeo = new THREE.CylinderGeometry(0.015, 0.02, 0.32, 4);
    const collarGeo = new THREE.CylinderGeometry(0.045, 0.055, 0.06, 6);

    reedLocations.forEach((loc, clumpIdx) => {
      const clump = new THREE.Group();
      clump.name = `ReedClump_${clumpIdx}`;
      const stalks = new THREE.Group(); // F7-00b: hastes/folhas (estático)
      const floaters = new THREE.Group(); // F7-00b: vitórias-régias e flores (sobem e descem juntas)

      // A. Cattail Stalks in Clump
      const stalkCount = 6 + Math.floor(Math.random() * 4);
      for (let s = 0; s < stalkCount; s++) {
        const stalk = new THREE.Group();

        const stemHeight = 1.9 + Math.random() * 0.8;
        const stemGeo = new THREE.CylinderGeometry(0.032, 0.052, stemHeight, 6);
        const stem = new THREE.Mesh(stemGeo, stemMat);
        stem.position.y = stemHeight * 0.5;
        stalk.add(stem);

        // Velvet brown cylindrical cattail head (with rounded top and bottom caps)
        const headGroup = new THREE.Group();
        const headCylinder = new THREE.Mesh(headCylinderGeo, headMat);
        headGroup.add(headCylinder);

        const headTopCap = new THREE.Mesh(headCapGeo, headMat);
        headTopCap.position.y = 0.26;
        headTopCap.scale.set(1, 0.6, 1);
        headGroup.add(headTopCap);

        const headBottomCap = new THREE.Mesh(headCapGeo, headMat);
        headBottomCap.position.y = -0.26;
        headBottomCap.scale.set(1, 0.6, 1);
        headGroup.add(headBottomCap);

        // Dried collar ring at base of cattail head
        const collar = new THREE.Mesh(collarGeo, tipSpikeMat);
        collar.position.y = -0.31;
        headGroup.add(collar);

        // Male flower spike needle protruding from apex
        const spike = new THREE.Mesh(spikeGeo, tipSpikeMat);
        spike.position.y = 0.44;
        headGroup.add(spike);

        headGroup.position.y = stemHeight - 0.2;
        stalk.add(headGroup);

        // Arching graceful reed blades around stalk base
        const bladeCount = 2 + Math.floor(Math.random() * 2);
        for (let b = 0; b < bladeCount; b++) {
          const bladeH = stemHeight * (0.6 + Math.random() * 0.35);
          const bladeGeo = new THREE.ConeGeometry(0.07, bladeH, 3);
          bladeGeo.translate(0, bladeH * 0.5, 0);
          const blade = new THREE.Mesh(bladeGeo, bladeMat);
          const bAngle = Math.random() * Math.PI * 2;
          blade.rotation.set(
            Math.sin(bAngle) * 0.3,
            bAngle,
            Math.cos(bAngle) * 0.3
          );
          blade.scale.set(0.4, 1, 1.2);
          stalk.add(blade);
        }

        // Stalk scatter within clump
        const ox = (Math.random() - 0.5) * 1.5;
        const oz = (Math.random() - 0.5) * 1.5;
        stalk.position.set(ox, 0, oz);
        stalk.rotation.z = (Math.random() - 0.5) * 0.16;
        stalk.rotation.x = (Math.random() - 0.5) * 0.16;

        stalks.add(stalk);
      }

      // B. Floating Lotus Leaves / Lily Pads around clump
      const padCount = 4 + Math.floor(Math.random() * 3);
      for (let p = 0; p < padCount; p++) {
        const padR = 0.45 + Math.random() * 0.4;
        // Slotted fan disc with notch
        const padGeo = new THREE.CircleGeometry(padR, 14, 0.35, Math.PI * 1.76);
        padGeo.rotateX(-Math.PI / 2);

        const pad = new THREE.Mesh(padGeo, lotusLeafMat);
        const pox = (Math.random() - 0.5) * 2.8;
        const poz = (Math.random() - 0.5) * 2.8;
        const pY = this.waterLevel + 0.012 + Math.random() * 0.005;

        pad.position.set(pox, pY, poz);
        pad.rotation.y = Math.random() * Math.PI * 2;
        pad.rotation.z = (Math.random() - 0.5) * 0.04;
        floaters.add(pad);
      }

      // C. Blooming Lotus Flowers / Water Lilies
      const flowerCount = 1 + Math.floor(Math.random() * 2);
      for (let f = 0; f < flowerCount; f++) {
        const flower = new THREE.Group();

        // 1. Green outer sepals
        const sepalCount = 4;
        for (let s = 0; s < sepalCount; s++) {
          const sAngle = (s / sepalCount) * Math.PI * 2;
          const sGeo = new THREE.ConeGeometry(0.06, 0.22, 3);
          sGeo.rotateX(Math.PI * 0.4);
          const sepal = new THREE.Mesh(sGeo, bladeMat);
          sepal.rotation.y = sAngle;
          sepal.position.y = 0.02;
          flower.add(sepal);
        }

        // 2. Layer 1: Outward cupped lotus petals (6 petals)
        const pet1Count = 6;
        for (let p = 0; p < pet1Count; p++) {
          const pAngle = (p / pet1Count) * Math.PI * 2;
          const petGeo = new THREE.PlaneGeometry(0.11, 0.24);
          petGeo.rotateX(Math.PI * 0.32);
          const pet = new THREE.Mesh(petGeo, lotusPetalMat);
          pet.rotation.y = pAngle;
          pet.position.y = 0.04;
          flower.add(pet);
        }

        // 3. Layer 2: Upright inner lotus petals (5 petals)
        const pet2Count = 5;
        for (let p = 0; p < pet2Count; p++) {
          const pAngle = (p / pet2Count) * Math.PI * 2 + 0.5;
          const petGeo = new THREE.PlaneGeometry(0.09, 0.20);
          petGeo.rotateX(Math.PI * 0.16);
          const pet = new THREE.Mesh(petGeo, lotusPetalMat);
          pet.rotation.y = pAngle;
          pet.position.y = 0.06;
          flower.add(pet);
        }

        // 4. Golden stamen center core
        const coreGeo = new THREE.SphereGeometry(0.07, 6, 4);
        coreGeo.scale(1, 0.7, 1);
        const core = new THREE.Mesh(coreGeo, lotusCenterMat);
        core.position.y = 0.08;
        flower.add(core);

        const fox = (Math.random() - 0.5) * 2.2;
        const foz = (Math.random() - 0.5) * 2.2;
        const fY = this.waterLevel + 0.02;
        flower.position.set(fox, fY, foz);
        flower.rotation.y = Math.random() * Math.PI * 2;
        floaters.add(flower);
      }

      // F7-00b: uma malha por material em vez de dezenas; o balanço da moita (clump) e a oscilação das folhas ficam
      const floatMerged = mergeByMaterial(floaters, 'ReedFloaters');
      floatMerged.userData = { baseY: 0, offset: Math.random() * 6 };
      clump.add(mergeByMaterial(stalks, 'ReedStalks'), floatMerged);
      this.lotusEntities.push(floatMerged);

      clump.position.set(loc.x, 0, loc.z);
      enableShadows(clump);
      reedGroup.add(clump);

      this.reedClumps.push(clump);
    });

    this.scene.add(reedGroup);
  }

  /**
   * Animation update called every frame
   * @param {number} time - Elapsed game time in seconds
   */
  update(time) {
    // 1. Oscillating Wave Displacement (Low-poly faceted water surface)
    if (this.mesh) {
      const pos = this.mesh.geometry.attributes.position;
      const init = this.initialPositions;

      for (let i = 0; i < pos.count; i++) {
        const x = init[i * 3];
        const z = init[i * 3 + 2];

        // Multi-frequency wave harmonics
        const w1 = Math.sin(x * 0.18 + time * 1.6) * 0.11;
        const w2 = Math.cos(z * 0.22 + time * 1.3) * 0.08;
        const w3 = Math.sin((x + z) * 0.14 + time * 2.0) * 0.05;

        pos.setY(i, w1 + w2 + w3);
      }

      pos.needsUpdate = true;
      this.mesh.geometry.computeVertexNormals();
    }

    // 1a. Lava emissiva (MUNDO-5): pulso do brilho e fluxo (só mapas com lavaGrid)
    if (this.lava) this.lava.update(time);

    // 1b. Espuma de costa (F7-04)
    if (this.foamUniforms) {
      this.foamUniforms.uTime.value = time;
      if (this.foamLow) this.foamMesh.material.opacity = 0.75 + 0.25 * Math.sin(time * 1.1);
    }

    // 2. Shifting Stylized Caustic Texture Offset (Drifting underwater light web)
    if (this.surfaceMat) {
      const ox = (time * 0.012) % 1;
      const oy = (time * 0.009) % 1;

      if (this.surfaceMat.map) {
        this.surfaceMat.map.offset.set(ox, oy);
      }
      if (this.surfaceMat.roughnessMap) {
        this.surfaceMat.roughnessMap.offset.set(ox, oy);
      }
      if (this.surfaceMat.bumpMap) {
        this.surfaceMat.bumpMap.offset.set(ox, oy);
      }
    }



    // 4. Gentle Breeze Sway on Cattails
    for (let c = 0; c < this.reedClumps.length; c++) {
      const clump = this.reedClumps[c];
      clump.rotation.z = Math.sin(time * 1.5 + clump.position.x * 0.4) * 0.035;
      clump.rotation.x = Math.cos(time * 1.2 + clump.position.z * 0.4) * 0.028;
    }

    // 5. Water Bobbing on Lotus Leaves & Water Lilies
    for (let l = 0; l < this.lotusEntities.length; l++) {
      const entity = this.lotusEntities[l];
      const bob = Math.sin(time * 2.2 + entity.userData.offset) * 0.014;
      entity.position.y = entity.userData.baseY + bob;
    }
  }
}
