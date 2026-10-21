import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as THREE from 'three';
import { GLB_MODELS, glbFaction, glbTemplates } from '../../src/entities/glbModels.js';
import { ModelFactory } from '../../src/entities/ModelFactory.js';
import { UnitAnimator } from '../../src/animation/UnitAnimator.js';
import { UNITS } from '../../src/data/units.js';

/** Lê o bloco JSON e o binário de um .glb (sem navegador nem decodificar meshopt). */
function readGlb(file) {
  const b = readFileSync(join(process.cwd(), 'public', 'models', file));
  const jsonLen = b.readUInt32LE(12);
  const json = JSON.parse(b.toString('utf8', 20, 20 + jsonLen));
  const binStart = 20 + jsonLen + 8;
  return { json, bin: b.subarray(binStart) };
}

/** Largura e altura de um WebP (VP8, VP8L ou VP8X). */
function webpSize(buf) {
  expect(buf.toString('ascii', 0, 4)).toBe('RIFF');
  expect(buf.toString('ascii', 8, 12)).toBe('WEBP');
  const tipo = buf.toString('ascii', 12, 16);
  if (tipo === 'VP8 ') return [buf.readUInt16LE(26) & 0x3fff, buf.readUInt16LE(28) & 0x3fff];
  if (tipo === 'VP8L') {
    const v = buf.readUInt32LE(21);
    return [(v & 0x3fff) + 1, ((v >> 14) & 0x3fff) + 1];
  }
  if (tipo === 'VP8X') return [buf.readUIntLE(24, 3) + 1, buf.readUIntLE(27, 3) + 1];
  throw new Error('WebP desconhecido: ' + tipo);
}

/** Hierarquia de Object3D com nomes e TRS de repouso do .glb (sem malhas), como em tools/dump-portrait-poses.mjs. */
function buildTree(json, rootName) {
  const nodes = json.nodes;
  const mk = (idx) => {
    const n = nodes[idx];
    const o = new THREE.Object3D();
    o.name = n.name;
    if (n.translation) o.position.fromArray(n.translation);
    if (n.rotation) o.quaternion.fromArray(n.rotation);
    if (n.scale) o.scale.fromArray(n.scale);
    for (const c of n.children || []) o.add(mk(c));
    return o;
  };
  return mk(nodes.findIndex((n) => n.name === rootName));
}

describe('archer_v2.glb (M2-31): estrutura e orçamento', () => {
  const { json: j, bin } = readGlb('archer_v2.glb');
  const byName = Object.fromEntries(j.nodes.map((n, i) => [n.name, { ...n, i }]));
  const parentOf = (name) => { const i = byName[name].i; const p = j.nodes.find((n) => (n.children || []).includes(i)); return p ? p.name : null; };

  it('tem os nós do tipo `archer` e os dois cotovelos: ArmL > ForeArmL > Bow (+ corda e flecha), ArmR > ForeArmR', () => {
    for (const n of ['Archer', 'Torso', 'Head', 'ArmL', 'ForeArmL', 'ArmR', 'ForeArmR', 'LegL', 'LegR', 'Bow', 'BowTipTop', 'BowTipBottom',
      'BowStringTop', 'BowStringBottom', 'DrawnArrow']) expect(byName[n], n).toBeTruthy();
    expect(parentOf('ForeArmL')).toBe('ArmL');
    expect(parentOf('Bow')).toBe('ForeArmL');
    expect(parentOf('ForeArmR')).toBe('ArmR');
    for (const n of ['BowTipTop', 'BowTipBottom', 'BowStringTop', 'BowStringBottom', 'DrawnArrow']) expect(parentOf(n), n).toBe('Bow');
    for (const n of ['Torso', 'Head', 'ArmL', 'ArmR', 'LegL', 'LegR']) expect(parentOf(n), n).toBe('Archer');
    expect(byName.Archer.translation).toBeUndefined(); // raiz sem transformação
    expect(j.nodes.some((n) => /shield|escudo/i.test(n.name))).toBe(false);
  });

  it('o arco fica na mão esquerda do jogo (ArmL, lado -x) e o braço da corda no lado +x (malha espelhada como no Brann)', () => {
    expect(byName.ArmL.translation[0]).toBeLessThan(-0.15);
    expect(byName.ArmR.translation[0]).toBeGreaterThan(0.15);
    // pontas da corda no plano do arco, acima e abaixo do encaixe; cordas são cilindros centrados (o updateBowString as reposiciona)
    expect(byName.BowTipTop.translation[1]).toBeGreaterThan(0.2);
    expect(byName.BowTipBottom.translation[1]).toBeLessThan(-0.2);
  });

  it('respeita o orçamento: <= 20 draw calls, 1 textura <= 512² e materiais Atlas + TeamColor (tabardo no Torso)', () => {
    const draws = j.meshes.reduce((s, m) => s + m.primitives.length, 0);
    expect(draws).toBeLessThanOrEqual(20);
    expect(j.images.length).toBe(1);
    const view = j.bufferViews[j.images[0].bufferView];
    const [w, h] = webpSize(bin.subarray(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength));
    expect(w).toBeLessThanOrEqual(512);
    expect(h).toBeLessThanOrEqual(512);
    expect(j.materials.map((m) => m.name).sort()).toEqual(['Atlas', 'TeamColor']);
    const torso = j.meshes[byName.Torso.mesh];
    expect(torso.primitives.map((p) => j.materials[p.material].name).sort()).toEqual(['Atlas', 'TeamColor']);
  });

  it('está registrado como archer (facção humana), o antigo continua registrado e Arqueiro/Patrulheiro usam o modelo do arqueiro', () => {
    expect(GLB_MODELS.archer_v2).toMatchObject({ root: 'Archer', type: 'archer' });
    expect(GLB_MODELS.archer).toMatchObject({ root: 'Archer', type: 'archer' });
    expect(glbFaction('archer_v2')).toBe('human');
    expect(glbFaction('archer')).toBe('human');
    expect(UNITS.ranger.modelOf).toBe('archer');
  });
});

describe('archer_v2: fábrica de modelos, animador e disparo (M2-31)', () => {
  const { json } = readGlb('archer_v2.glb');
  afterEach(() => { glbTemplates.delete('archer_v2'); glbTemplates.delete('archer'); });

  it('createArcher usa o archer_v2 e cai no archer antigo sem ele', () => {
    glbTemplates.set('archer', buildTree({ nodes: [{ name: 'Archer', children: [1] }, { name: 'Torso' }] }, 'Archer'));
    const antigo = ModelFactory.createArcher();
    expect(antigo.getObjectByName('ForeArmL')).toBeFalsy();
    expect(antigo.getObjectByName('Torso')).toBeTruthy();
    glbTemplates.set('archer_v2', buildTree(json, 'Archer'));
    const novo = ModelFactory.createArcher();
    expect(novo.getObjectByName('ForeArmL')).toBeTruthy();
    expect(novo.userData.foreArmL.name).toBe('ForeArmL');
    expect(novo.userData.foreArmR.name).toBe('ForeArmR');
    expect(novo.userData.bow.parent.name).toBe('ForeArmL');
    expect(typeof novo.userData.updateBowString).toBe('function');
  });

  /** Mundo: direção de um eixo local de um nó. */
  const dir = (o, x, y, z) => { o.updateWorldMatrix(true, false); return new THREE.Vector3(x, y, z).transformDirection(o.matrixWorld); };
  const pos = (o, x = 0, y = 0, z = 0) => { o.updateWorldMatrix(true, false); return new THREE.Vector3(x, y, z).applyMatrix4(o.matrixWorld); };

  function disparo(t) {
    glbTemplates.set('archer_v2', buildTree(json, 'Archer'));
    const root = ModelFactory.createArcher();
    const an = new UnitAnimator(root, 'archer');
    an.setAttackVariant(0); // progresso linear
    an.setAnimation('fight', true);
    an._blendT = 99;
    an.setTime(t);
    root.updateMatrixWorld(true);
    return { root, an, P: an.meshParts };
  }

  it('em repouso o arco está em pé, com a barriga para +Z, e a flecha escondida', () => {
    glbTemplates.set('archer_v2', buildTree(json, 'Archer'));
    const root = ModelFactory.createArcher();
    root.updateMatrixWorld(true);
    const bow = root.userData.bow;
    expect(dir(bow, 0, 1, 0).y).toBeGreaterThan(0.99);
    expect(dir(bow, 0, 0, 1).z).toBeGreaterThan(0.99);
    expect(root.userData.drawnArrow.visible).toBe(false);
  });

  it('no disparo o braço do arco fica reto, o arco em pé e a flecha aparece só com a corda puxada', () => {
    for (const t of [0.4, 0.5, 0.62]) {
      const { P } = disparo(t);
      expect(dir(P.bow, 0, 1, 0).y, `arco em pé t=${t}`).toBeGreaterThan(0.97);
      expect(dir(P.bow, 0, 0, 1).z, `barriga para +Z t=${t}`).toBeGreaterThan(0.97);
      // ombro -> cotovelo -> arco quase colineares
      const sh = pos(P.armL), el = pos(P.foreArmL), bw = pos(P.bow);
      const ang = Math.acos(THREE.MathUtils.clamp(el.clone().sub(sh).normalize().dot(bw.clone().sub(el).normalize()), -1, 1)) * 180 / Math.PI;
      expect(ang, `braço reto t=${t}`).toBeLessThan(25);
      expect(P.drawnArrow.visible, `flecha t=${t}`).toBe(true);
    }
    expect(disparo(0.1).P.drawnArrow.visible).toBe(false);
    expect(disparo(0.85).P.drawnArrow.visible).toBe(false);
  });

  it('a ponta dos dedos do braço da corda chega ao encaixe (<= 12 cm) e o ForeArmL contra-gira o ArmL', () => {
    for (const t of [0.4, 0.5, 0.62]) {
      const { P } = disparo(t);
      const encaixe = pos(P.bow, 0, 0, P.drawnArrow.position.z);
      const dedos = pos(P.foreArmR, 0.012, -0.62, 0.01); // ponta dos dedos (locais do ForeArmR, medidos no Blender)
      expect(dedos.distanceTo(encaixe), `t=${t}`).toBeLessThan(0.12);
    }
    const { P } = disparo(0.5);
    const q = P.armL.quaternion.clone().multiply(P.foreArmL.quaternion);
    expect(Math.abs(q.w)).toBeGreaterThan(0.9999); // ArmL × ForeArmL = identidade: antebraço e arco mantêm a orientação de repouso
  });

  it('a pose volta ao repouso no fim do golpe (sem salto entre o fim e o início do ciclo)', () => {
    const fim = disparo(0.9999);
    const ini = disparo(0);
    for (const k of ['armL', 'armR', 'foreArmR']) {
      const a = fim.P[k].quaternion, b = ini.P[k].quaternion;
      expect(1 - Math.abs(a.dot(b)), k).toBeLessThan(0.02);
    }
  });
});
