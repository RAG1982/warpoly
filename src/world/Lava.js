import * as THREE from 'three';
import { LAVA_STYLE, buildLavaInfo, lavaPulse, lavaFlowOffsets } from '../data/lavaRender.js';
import { getLavaTextures } from '../models/environment/lavaTextures.js';
import { markFogGround } from '../render/fogOfWarShader.js';

/**
 * Lava emissiva (MUNDO-5 · MUNDO-TERRENO-MAPAS §3.5, "Visual"). SÓ VISUAL: a lava já bloqueia como a água na sim
 * (`Terrain.isLava`, `Pathfinder`), sem dano; este objeto não escreve nada na sim e nada daqui entra no checksum.
 *
 * UM plano (1 draw call, 2 triângulos) a `LAVA_STYLE.surfaceY` sobre a caixa que contém a lava. O plano é recortado pela máscara de
 * células de lava (`alphaMap` + `alphaTest`; a máscara é a `lavaGrid` ampliada com filtro bilinear, então o contorno sai suave) e
 * pintado por duas camadas de fluxo tileáveis que correm em sentidos opostos (`emissiveMap` laranja/núcleo claro, `map` de crosta).
 * O brilho (`emissiveIntensity`, 1,2–1,8) pulsa devagar. Sem sombra projetada nem recebida, sem reflexo (rugosidade 1).
 *
 * Por que um plano acima da água e não só o material do terreno: a lava assada tem altura 0,4, ABAIXO do nível d'água (0,5), então a
 * água translúcida (≤ 0,74 com as ondas) cobriria um brilho no próprio terreno. A 0,8 a lava fica por cima da água e o teste de
 * profundidade a esconde onde a lava existe, sem tocar no `Water`.
 */
export class Lava {
  /**
   * @param {import('three').Scene} scene
   * @param {import('../data/lavaRender.js').LavaInfo} info
   */
  constructor(scene, info) {
    this.scene = scene;
    this.info = info;
    const n = info.nodes;
    const b = info.bounds;

    // Geometria: a caixa da lava (poupa fragmentos). UV 0 = máscara (centro do texel no nó), mesmo mapeamento do `Terrain`.
    const uOf = (x) => ((x + info.half) / info.cell + 0.5) / n;
    const vOf = (z) => ((z + info.half) / info.cell + 0.5) / n;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([b.minX, 0, b.minZ, b.maxX, 0, b.minZ, b.maxX, 0, b.maxZ, b.minX, 0, b.maxZ], 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([uOf(b.minX), vOf(b.minZ), uOf(b.maxX), vOf(b.minZ), uOf(b.maxX), vOf(b.maxZ), uOf(b.minX), vOf(b.maxZ)], 2));
    geo.setIndex([0, 2, 1, 0, 3, 2]); // face para cima (+Y)

    // Máscara das células de lava (G = alfa para o `alphaMap`); o filtro bilinear dá o contorno suave.
    this.maskTexture = new THREE.DataTexture(info.maskRGBA(), n, n, THREE.RGBAFormat);
    this.maskTexture.magFilter = THREE.LinearFilter;
    this.maskTexture.minFilter = THREE.LinearFilter;
    this.maskTexture.generateMipmaps = false;
    this.maskTexture.wrapS = this.maskTexture.wrapT = THREE.ClampToEdgeWrapping;
    this.maskTexture.needsUpdate = true;

    // Fluxo: cópias das texturas tileáveis; `repeat` pelo tamanho do mapa (uma repetição a cada `tileWorld` u).
    const tex = getLavaTextures();
    const rep = info.size / LAVA_STYLE.tileWorld;
    tex.emissiveMap.repeat.set(rep, rep);
    tex.map.repeat.set(rep * 0.8, rep * 0.8); // escalas diferentes: as camadas não se alinham nunca
    this.emissiveMap = tex.emissiveMap;
    this.map = tex.map;

    this.material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: this.map,
      emissive: 0xffffff,
      emissiveMap: this.emissiveMap,
      emissiveIntensity: lavaPulse(0),
      alphaMap: this.maskTexture,
      alphaTest: 0.5,
      alphaToCoverage: true, // com MSAA o contorno do recorte fica suave (sem MSAA é o mesmo que alphaTest)
      roughness: 1,
      metalness: 0
    });
    this.material.userData.isLava = true;
    markFogGround(this.material); // a névoa de guerra escurece por fragmento; a origem do plano (0,0) não pode recolhê-lo
    // As texturas desta instância saem com o material (MatchSession.dispose descarta os materiais da cena, não as texturas).
    this.material.addEventListener('dispose', () => {
      this.maskTexture.dispose();
      this.emissiveMap.dispose();
      this.map.dispose();
    });

    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.name = 'LavaSurface';
    this.mesh.position.y = LAVA_STYLE.surfaceY;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.userData.isLava = true;
    scene.add(this.mesh);

    /** Brilho atual (`emissiveIntensity`), para depuração e testes. */
    this.pulse = this.material.emissiveIntensity;
  }

  /** Cria a lava do mapa, ou `null` se ele não tem `lavaGrid` (ou `?lava=0`): nada é criado e o render fica como antes. */
  static create(scene, mapDef) {
    const info = buildLavaInfo(mapDef);
    return info ? new Lava(scene, info) : null;
  }

  /** Um quadro (tempo `time` em s, o mesmo relógio da água): pulso do brilho e fluxo das duas camadas em sentidos opostos. */
  update(time) {
    this.pulse = lavaPulse(time);
    this.material.emissiveIntensity = this.pulse;
    const o = lavaFlowOffsets(time);
    this.emissiveMap.offset.set(o.emissive[0], o.emissive[1]);
    this.map.offset.set(o.map[0], o.map[1]);
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.material.dispose(); // o ouvinte 'dispose' solta as texturas
  }
}
