import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import { paintedNodes } from '../../src/data/maps/painted.js';
import { encodeLavaGrid } from '../../src/data/maps/lava.js';
import {
  LAVA_STYLE, LAVA_EMBER, LavaInfo, buildLavaInfo, lavaPulse, lavaFlowOffsets, lavaEnabled
} from '../../src/data/lavaRender.js';
import { generateLavaPixels } from '../../src/models/environment/lavaTextures.js';
import { Terrain } from '../../src/sim/Terrain.js';
import { makeRegionalMap } from './helpers/regionalMap.js';

// As texturas de água são pintadas em <canvas> (sem DOM no Node): mapas vazios bastam para o `Water`.
vi.mock('../../src/models/environment/waterTextures.js', () => ({
  getWaterSurfaceTextures: () => ({ map: null, roughnessMap: null, bumpMap: null }),
  getCattailLotusTextures: () => ({
    cattailStemMap: null, cattailHeadMap: null, cattailHeadRoughness: null, lotusLeafMap: null, lotusPetalMap: null
  })
}));
const { Lava } = await import('../../src/world/Lava.js');
const { Water } = await import('../../src/world/Water.js');

/**
 * MUNDO-5 · lava emissiva (§3.5, só visual): informação pura (células, calor), pulso/fluxo, texturas procedurais e a malha `Lava`.
 * Fixture: córrego de lava em z = 29..31, x ∈ [-11, 11] com passagem de rocha em x ∈ [-1, 1] (20 colunas × 3 linhas = 60 células).
 */

afterEach(() => { delete globalThis.location; });

describe('LavaInfo · células de lava → flags', () => {
  const map = makeRegionalMap({ id: 'fixture-lava' });
  const info = buildLavaInfo(map);

  it('conta as células de lava e acha a caixa que as contém', () => {
    expect(info).toBeInstanceOf(LavaInfo);
    expect(info.count).toBe(60);
    expect(info.bounds.minX).toBeLessThanOrEqual(-11);
    expect(info.bounds.maxX).toBeGreaterThanOrEqual(11);
    expect(info.bounds.minZ).toBeLessThanOrEqual(29);
    expect(info.bounds.maxZ).toBeGreaterThanOrEqual(31);
    expect(info.bounds.maxX - info.bounds.minX).toBeLessThan(30); // só o córrego, não o mapa inteiro
  });

  it('isLavaAt: lava = sim; passagem de rocha, terra e mar = não (mesma regra do nó mais próximo de Terrain.isLava)', () => {
    const terrain = new Terrain(map);
    expect(info.isLavaAt(-8, 30)).toBe(true);
    expect(info.isLavaAt(8, 30)).toBe(true);
    expect(info.isLavaAt(0, 30)).toBe(false); // passagem
    expect(info.isLavaAt(0, 24)).toBe(false);
    expect(info.isLavaAt(-30, -10)).toBe(false);
    expect(info.isLavaAt(500, 0)).toBe(false);
    for (let x = -14; x <= 14; x += 0.7) for (let z = 26; z <= 34; z += 0.7) expect(info.isLavaAt(x, z), `${x},${z}`).toBe(terrain.isLava(x, z));
  });

  it('só a lavaGrid manda: sem ela (ou sem células, ou inválida, ou ?lava=0) não há lava', () => {
    expect(buildLavaInfo(makeRegionalMap({ withLava: false }))).toBeNull();
    const m = makeRegionalMap({ id: 'fixture-lava-vazia' });
    const nodes = paintedNodes(m.size, 1);
    m.lavaGrid = { cell: 1, nodes, data: encodeLavaGrid(new Uint8Array(nodes * nodes)) };
    expect(buildLavaInfo(m)).toBeNull();
    const bad = makeRegionalMap({ id: 'fixture-lava-ruim' });
    bad.lavaGrid = { cell: 1, nodes: 10, data: encodeLavaGrid(new Uint8Array(100)) };
    expect(buildLavaInfo(bad)).toBeNull();
    expect(buildLavaInfo(undefined)).toBeNull();
    expect(lavaEnabled('?lava=0')).toBe(false);
    expect(lavaEnabled('?quality=low')).toBe(true);
    globalThis.location = { search: '?lava=0' };
    expect(buildLavaInfo(makeRegionalMap({ id: 'fixture-lava-url' }))).toBeNull();
  });

  it('memoriza por lavaGrid e a assinatura muda com o conteúdo', () => {
    expect(buildLavaInfo(map)).toBe(info);
    const m2 = makeRegionalMap({ id: 'fixture-lava-2' });
    const nodes = paintedNodes(m2.size, 1);
    const data = new Uint8Array(nodes * nodes);
    data[nodes * 40 + 40] = 1;
    m2.lavaGrid = { cell: 1, nodes, data: encodeLavaGrid(data) };
    expect(buildLavaInfo(m2).signature).not.toBe(info.signature);
  });

  it('máscara RGBA: 255 nas células de lava, 0 no resto', () => {
    const rgba = info.maskRGBA();
    expect(rgba.length).toBe(info.nodes * info.nodes * 4);
    let on = 0;
    for (let i = 0; i < rgba.length; i += 4) {
      expect(rgba[i]).toBe(rgba[i + 1]);
      expect(rgba[i + 1]).toBe(rgba[i + 3]);
      if (rgba[i] === 255) on++; else expect(rgba[i]).toBe(0);
    }
    expect(on).toBe(60);
  });
});

describe('calor da lava (brilho no terreno vizinho)', () => {
  const info = buildLavaInfo(makeRegionalMap({ id: 'fixture-lava-heat' }));

  it('1 na lava, cai suavemente e some a glowRadius da borda', () => {
    expect(info.heatAt(-8, 30)).toBe(1);
    expect(info.distAt(-8, 30)).toBe(0);
    let prev = 1;
    for (let d = 0; d <= 5; d += 0.25) { // andando para o sul a partir do centro do córrego (x = -8, z = 30)
      const h = info.heatAt(-8, 31 + d); // borda sul da lava ≈ z = 31,5
      expect(h).toBeLessThanOrEqual(prev + 1e-9);
      prev = h;
    }
    expect(info.heatAt(-8, 31.5 + LAVA_STYLE.glowRadius + 0.5)).toBe(0);
    expect(info.heatAt(-30, -10)).toBe(0); // longe
    expect(info.heatAt(-8, 33)).toBeGreaterThan(0.3); // 1,5 u da borda: ainda quente
  });

  it('a distância só depende da lava (simétrica norte/sul) e é limitada', () => {
    expect(info.distAt(-8, 27)).toBeCloseTo(info.distAt(-8, 33), 5);
    expect(info.distAt(-40, -40)).toBeLessThanOrEqual(8);
    expect(info.distAt(0, 30)).toBeGreaterThan(0); // passagem: perto da lava, mas não é lava
    expect(info.heatAt(0, 30)).toBeGreaterThanOrEqual(0.5); // a 1,5 u da borda da lava: meio calor
  });
});

describe('material emissivo: pulso e fluxo', () => {
  it('o brilho pulsa devagar entre emissiveMin e emissiveMax (1,2–1,8), com o período do §3.5', () => {
    let lo = 9, hi = 0;
    for (let t = 0; t <= LAVA_STYLE.pulsePeriod; t += 0.05) {
      const v = lavaPulse(t);
      lo = Math.min(lo, v); hi = Math.max(hi, v);
      expect(v).toBeGreaterThanOrEqual(1.2 - 1e-9);
      expect(v).toBeLessThanOrEqual(1.8 + 1e-9);
    }
    expect(lo).toBeCloseTo(1.2, 2);
    expect(hi).toBeCloseTo(1.8, 2);
    expect(lavaPulse(0)).toBeCloseTo(1.5, 6);
    expect(lavaPulse(LAVA_STYLE.pulsePeriod)).toBeCloseTo(lavaPulse(0), 6);
    expect(Math.abs(lavaPulse(0.1) - lavaPulse(0))).toBeLessThan(0.1); // lento, sem tremedeira
  });

  it('as duas camadas de fluxo correm em sentidos opostos e o offset fica em [0, 1)', () => {
    const a = lavaFlowOffsets(10), b = lavaFlowOffsets(20);
    expect(LAVA_STYLE.flowEmissive[0] * LAVA_STYLE.flowMap[0]).toBeLessThan(0);
    for (const v of [...a.emissive, ...a.map, ...b.emissive, ...b.map]) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); }
    expect(lavaFlowOffsets(0)).toEqual({ emissive: [0, 0], map: [0, 0] });
    expect(b.emissive[0]).not.toBe(a.emissive[0]);
  });

  it('cores do §3.5: laranja ff5a1a, núcleo ffb347, borda 8a1c0a, crosta 2b2528; sem lava no minimapa/estilo aqui', () => {
    expect(LAVA_STYLE.mid).toBe(0xff5a1a);
    expect(LAVA_STYLE.core).toBe(0xffb347);
    expect(LAVA_STYLE.edge).toBe(0x8a1c0a);
    expect(LAVA_STYLE.crust).toBe(0x2b2528);
    expect(LAVA_EMBER.rim).toBe(0xd9481c);
  });
});

describe('texturas procedurais da lava', () => {
  const px = generateLavaPixels(128);
  const lum = (arr, i) => 0.2126 * arr[i] + 0.7152 * arr[i + 1] + 0.0722 * arr[i + 2];

  it('é determinística e tileável (a borda esquerda continua na direita)', () => {
    const again = generateLavaPixels(128);
    expect(Array.from(again.emissive)).toEqual(Array.from(px.emissive));
    expect(Array.from(again.albedo)).toEqual(Array.from(px.albedo));
    const S = px.size;
    // diferença entre a última e a primeira coluna ≈ diferença entre colunas vizinhas (sem emenda)
    let seam = 0, inner = 0;
    for (let y = 0; y < S; y++) {
      seam += Math.abs(lum(px.emissive, (y * S + S - 1) * 4) - lum(px.emissive, (y * S) * 4));
      inner += Math.abs(lum(px.emissive, (y * S + 60) * 4) - lum(px.emissive, (y * S + 61) * 4));
    }
    expect(seam / S).toBeLessThan((inner / S) * 2 + 4);
    let seamV = 0, innerV = 0;
    for (let x = 0; x < S; x++) {
      seamV += Math.abs(lum(px.emissive, ((S - 1) * S + x) * 4) - lum(px.emissive, x * 4));
      innerV += Math.abs(lum(px.emissive, (60 * S + x) * 4) - lum(px.emissive, (61 * S + x) * 4));
    }
    expect(seamV / S).toBeLessThan((innerV / S) * 2 + 4);
  });

  it('o emissivo tem rachaduras claras (laranja/núcleo) sobre placas escuras; o albedo é basalto escuro', () => {
    let bright = 0, dark = 0, orange = 0, maxL = 0;
    for (let i = 0; i < px.emissive.length; i += 4) {
      const l = lum(px.emissive, i);
      maxL = Math.max(maxL, l);
      if (l > 150) bright++;
      if (l < 60) dark++;
      if (px.emissive[i] > 200 && px.emissive[i + 1] > px.emissive[i + 2]) orange++; // vermelho forte, verde > azul: laranja
      expect(px.emissive[i + 3]).toBe(255);
    }
    const n = px.size * px.size;
    expect(bright / n).toBeGreaterThan(0.01);
    expect(bright / n).toBeLessThan(0.45);
    expect(dark / n).toBeGreaterThan(0.1);
    expect(orange / n).toBeGreaterThan(0.01);
    expect(maxL).toBeGreaterThan(180);
    let mean = 0;
    for (let i = 0; i < px.albedo.length; i += 4) mean += lum(px.albedo, i);
    expect(mean / n).toBeLessThan(90); // crosta escura
  });
});

describe('Lava (malha emissiva)', () => {
  const map = makeRegionalMap({ id: 'fixture-lava-mesh' });

  it('mapa sem lavaGrid: nada é criado', () => {
    const scene = new THREE.Scene();
    expect(Lava.create(scene, makeRegionalMap({ withLava: false }))).toBeNull();
    expect(scene.children).toHaveLength(0);
  });

  it('cria UM plano (1 draw call) acima da água, emissivo, sem sombra, recortado pela máscara', () => {
    const scene = new THREE.Scene();
    const lava = Lava.create(scene, map);
    expect(scene.children).toHaveLength(1);
    const mesh = scene.getObjectByName('LavaSurface');
    expect(mesh).toBe(lava.mesh);
    expect(mesh.isMesh).toBe(true);
    expect(mesh.geometry.index.count).toBe(6); // 2 triângulos
    // acima da onda mais alta (0,5 + 0,24) e da lava assada (0,4)
    expect(mesh.position.y).toBe(LAVA_STYLE.surfaceY);
    expect(mesh.position.y).toBeGreaterThan(0.5 + 0.11 + 0.08 + 0.05);
    expect(mesh.castShadow).toBe(false);
    expect(mesh.receiveShadow).toBe(false);
    const m = mesh.material;
    expect(m.emissive.getHex()).not.toBe(0);
    expect(m.emissiveIntensity).toBeGreaterThanOrEqual(1.2);
    expect(m.emissiveIntensity).toBeLessThanOrEqual(1.8);
    expect(m.emissiveMap).toBeTruthy();
    expect(m.map).toBeTruthy();
    expect(m.alphaMap).toBeTruthy();
    expect(m.alphaTest).toBeGreaterThan(0);
    expect(m.transparent).toBe(false);
    expect(m.roughness).toBe(1);
    expect(m.metalness).toBe(0);
    expect(m.userData.fogGround).toBe(true); // a névoa de guerra escurece por fragmento (não recolhe o plano)
    expect(m.userData.isLava).toBe(true);
    // só cobre a caixa da lava
    const pos = mesh.geometry.attributes.position;
    const xs = Array.from({ length: pos.count }, (_, i) => pos.getX(i));
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(30);
    expect(mesh.geometry.attributes.normal.getY(0)).toBe(1);
    lava.dispose();
  });

  it('a face aponta para cima (+Y) e a máscara, amostrada no UV de uma célula de lava, vale 255', () => {
    const scene = new THREE.Scene();
    const lava = new Lava(scene, buildLavaInfo(map));
    const g = lava.mesh.geometry;
    const p = g.attributes.position;
    const idx = g.index.array;
    for (let t = 0; t < idx.length; t += 3) {
      const a = new THREE.Vector3().fromBufferAttribute(p, idx[t]);
      const b = new THREE.Vector3().fromBufferAttribute(p, idx[t + 1]);
      const c = new THREE.Vector3().fromBufferAttribute(p, idx[t + 2]);
      const n = new THREE.Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a));
      expect(n.y).toBeGreaterThan(0);
    }
    // UV do canto (minX, minZ) → texel do nó correspondente
    const uv = g.attributes.uv;
    const info = lava.info;
    const texel = (u, v) => [Math.floor(u * info.nodes), Math.floor(v * info.nodes)];
    // o centro do nó (-8, 30) mapeia para o texel (i, j) = (40, 78) com esta convenção
    const u = (-8 + info.half + 0.5) / info.nodes, v = (30 + info.half + 0.5) / info.nodes;
    const [ti, tj] = texel(u, v);
    expect(lava.maskTexture.image.data[(tj * info.nodes + ti) * 4 + 1]).toBe(255); // canal G = alfa do alphaMap
    const u2 = (0 + info.half + 0.5) / info.nodes; // passagem de rocha
    const [pi, pj] = texel(u2, v);
    expect(lava.maskTexture.image.data[(pj * info.nodes + pi) * 4 + 1]).toBe(0);
    expect(uv.count).toBe(4);
    lava.dispose();
  });

  it('update: o brilho pulsa e as duas camadas de fluxo se deslocam em sentidos opostos', () => {
    const scene = new THREE.Scene();
    const lava = Lava.create(scene, map);
    lava.update(0);
    const i0 = lava.material.emissiveIntensity;
    lava.update(LAVA_STYLE.pulsePeriod / 4);
    const i1 = lava.material.emissiveIntensity;
    expect(i1).toBeGreaterThan(i0);
    expect(lava.pulse).toBe(i1);
    lava.update(0);
    const e0 = lava.emissiveMap.offset.clone(), m0 = lava.map.offset.clone();
    lava.update(7);
    const e1 = lava.emissiveMap.offset.clone(), m1 = lava.map.offset.clone();
    expect(e1.x).not.toBe(e0.x);
    expect(m1.x).not.toBe(m0.x);
    // sentidos opostos: o deslocamento (não normalizado) das duas camadas tem sinais contrários em x
    const raw = (o) => (o > 0.5 ? o - 1 : o);
    expect(Math.sign(raw(e1.x - e0.x)) * Math.sign(raw(m1.x - m0.x))).toBeLessThan(0);
    lava.dispose();
  });

  it('dispose do material solta as texturas desta instância (a cena descarta materiais, não texturas)', () => {
    const scene = new THREE.Scene();
    const lava = Lava.create(scene, map);
    const disposed = [];
    for (const t of [lava.maskTexture, lava.emissiveMap, lava.map]) t.addEventListener('dispose', () => disposed.push(t));
    lava.material.dispose();
    expect(disposed).toHaveLength(3);
    lava.mesh.geometry.dispose();
  });

  it('cada instância tem o próprio repeat/offset (cópias das texturas compartilhadas)', () => {
    const a = Lava.create(new THREE.Scene(), map);
    const b = Lava.create(new THREE.Scene(), map);
    expect(a.emissiveMap).not.toBe(b.emissiveMap);
    a.update(30);
    b.update(0);
    expect(a.emissiveMap.offset.x).not.toBe(b.emissiveMap.offset.x);
    expect(a.emissiveMap.repeat.x).toBeCloseTo(map.size / LAVA_STYLE.tileWorld, 6);
    a.dispose(); b.dispose();
  });
});

describe('Water + lava', () => {
  const countMeshes = (scene) => { let n = 0; scene.traverse((o) => { if (o.isMesh) n++; }); return n; };

  it('mapa com lavaGrid ganha exatamente 1 malha a mais (a lava) e a Water a anima; sem lavaGrid, nada muda', () => {
    const withLava = makeRegionalMap({ id: 'fixture-water-lava', withBiomes: false });
    const without = makeRegionalMap({ id: 'fixture-water-nolava', withBiomes: false, withLava: false });
    const sA = new THREE.Scene(), sB = new THREE.Scene();
    const wA = new Water(sA, new Terrain(withLava), { tileset: 'vulcanico' });
    const wB = new Water(sB, new Terrain(without), { tileset: 'vulcanico' });
    expect(wB.lava).toBeNull();
    expect(wA.lava).toBeTruthy();
    expect(sA.getObjectByName('LavaSurface')).toBe(wA.lava.mesh);
    expect(sB.getObjectByName('LavaSurface')).toBeUndefined();
    expect(countMeshes(sA)).toBe(countMeshes(sB) + 1);
    wA.update(0);
    const i0 = wA.lava.material.emissiveIntensity;
    wA.update(LAVA_STYLE.pulsePeriod / 4);
    expect(wA.lava.material.emissiveIntensity).not.toBe(i0);
  });

  it('a espuma trata a lava (altura 0,4, abaixo da água) como terra: sem espuma nas bordas dela', () => {
    const withLava = makeRegionalMap({ id: 'fixture-foam-lava', withBiomes: false });
    const without = makeRegionalMap({ id: 'fixture-foam-nolava', withBiomes: false, withLava: false });
    const wA = new Water(new THREE.Scene(), new Terrain(withLava), { tileset: 'vulcanico' });
    const wB = new Water(new THREE.Scene(), new Terrain(without), { tileset: 'vulcanico' });
    const G = 256;
    const dataA = wA.foamMesh.material.map.image.data, dataB = wB.foamMesh.material.map.image.data;
    const texel = (x, z) => ((Math.floor(((48 - z) / 96) * G)) * G + Math.floor(((x + 48) / 96) * G)) * 4; // linha 0 = z positivo
    expect(dataA[texel(-8, 30)]).toBe(255); // lava = terra alta: sem espuma
    expect(dataB[texel(-8, 30)]).toBeLessThan(255); // sem lavaGrid, a célula de 0,4 é água rasa (h - 0,5 = -0,1)
    // longe da lava, igual
    expect(dataA[texel(-30, -10)]).toBe(dataB[texel(-30, -10)]);
  });
});
