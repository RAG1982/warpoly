import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as THREE from 'three';
import { GLB_MODELS, glbFaction, glbTemplates } from '../../src/entities/glbModels.js';
import { ModelFactory } from '../../src/entities/ModelFactory.js';
import { UnitAnimator } from '../../src/animation/UnitAnimator.js';

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
  const tipo = buf.toString('ascii', 12, 16);
  if (tipo === 'VP8 ') return [buf.readUInt16LE(26) & 0x3fff, buf.readUInt16LE(28) & 0x3fff];
  if (tipo === 'VP8L') {
    const v = buf.readUInt32LE(21);
    return [(v & 0x3fff) + 1, ((v >> 14) & 0x3fff) + 1];
  }
  if (tipo === 'VP8X') return [buf.readUIntLE(24, 3) + 1, buf.readUIntLE(27, 3) + 1];
  throw new Error('WebP desconhecido: ' + tipo);
}

/** Hierarquia de Object3D com nomes e TRS de repouso do .glb (sem malhas). */
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

describe('war_serpent_v2.glb (ART-SERPE): estrutura e orçamento', () => {
  const { json: j, bin } = readGlb('war_serpent_v2.glb');
  const byName = Object.fromEntries(j.nodes.map((n, i) => [n.name, { ...n, i }]));
  const parentOf = (name) => { const i = byName[name].i; const p = j.nodes.find((n) => (n.children || []).includes(i)); return p ? p.name : null; };

  it('tem a hierarquia que o animador aéreo espera: Torso > Head, WingL > WingTipL, WingR > WingTipR, Tail > TailTip', () => {
    for (const n of ['WarSerpent', 'Torso', 'Head', 'WingL', 'WingR', 'WingTipL', 'WingTipR', 'Tail', 'TailTip']) expect(byName[n], n).toBeTruthy();
    expect(parentOf('Torso')).toBe('WarSerpent');
    for (const n of ['Head', 'WingL', 'WingR', 'Tail']) expect(parentOf(n), n).toBe('Torso');
    expect(parentOf('WingTipL')).toBe('WingL');
    expect(parentOf('WingTipR')).toBe('WingR');
    expect(parentOf('TailTip')).toBe('Tail');
    expect(byName.WarSerpent.translation).toBeUndefined();
  });

  it('asas nos ombros (WingL em -x, WingR em +x), cabeça à frente (+z) e cauda atrás (-z)', () => {
    expect(byName.WingL.translation[0]).toBeLessThan(-0.2);
    expect(byName.WingR.translation[0]).toBeGreaterThan(0.2);
    expect(byName.WingL.translation[1]).toBeGreaterThan(0.6);
    expect(byName.Head.translation[2]).toBeGreaterThan(0.2);
    expect(byName.Tail.translation[2]).toBeLessThan(-0.5);
    expect(byName.TailTip.translation[2]).toBeLessThan(-0.3);
    // pontas das asas para fora dos ombros
    expect(byName.WingTipL.translation[0]).toBeLessThan(-0.4);
    expect(byName.WingTipR.translation[0]).toBeGreaterThan(0.4);
  });

  it('respeita o orçamento: <= 20 draw calls, 1 textura <= 512², materiais Atlas + TeamColor, poucos milhares de triângulos', () => {
    const draws = j.meshes.reduce((s, m) => s + m.primitives.length, 0);
    expect(draws).toBeLessThanOrEqual(20);
    expect(j.images.length).toBe(1);
    const view = j.bufferViews[j.images[0].bufferView];
    const [w, h] = webpSize(bin.subarray(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength));
    expect(w).toBeLessThanOrEqual(512);
    expect(h).toBeLessThanOrEqual(512);
    expect(j.materials.map((m) => m.name).sort()).toEqual(['Atlas', 'TeamColor']);
    // triângulos = índices / 3 (accessor de índices de cada primitiva)
    const tris = j.meshes.flatMap((m) => m.primitives).reduce((s, p) => s + j.accessors[p.indices].count / 3, 0);
    expect(tris).toBeGreaterThan(3000);
    expect(tris).toBeLessThan(12000);
  });

  it('está registrado como war_serpent (facção orc) e o glb antigo continua como reserva', () => {
    expect(GLB_MODELS.war_serpent_v2).toMatchObject({ root: 'WarSerpent', type: 'war_serpent' });
    expect(GLB_MODELS.war_serpent).toMatchObject({ root: 'WarSerpent', type: 'war_serpent' });
    expect(glbFaction('war_serpent_v2')).toBe('orc');
  });
});

describe('war_serpent_v2: fábrica e animação', () => {
  const { json } = readGlb('war_serpent_v2.glb');
  afterEach(() => { glbTemplates.delete('war_serpent_v2'); glbTemplates.delete('war_serpent'); });

  it('createUnit usa o v2 e cai no glb antigo sem ele', () => {
    glbTemplates.set('war_serpent', buildTree({ nodes: [{ name: 'WarSerpent', children: [1] }, { name: 'Torso' }] }, 'WarSerpent'));
    expect(ModelFactory.createUnit('war_serpent').getObjectByName('WingTipL')).toBeFalsy();
    glbTemplates.set('war_serpent_v2', buildTree(json, 'WarSerpent'));
    expect(ModelFactory.createUnit('war_serpent').getObjectByName('WingTipL')).toBeTruthy();
  });

  function pose(anim, t) {
    glbTemplates.set('war_serpent_v2', buildTree(json, 'WarSerpent'));
    const root = ModelFactory.createUnit('war_serpent');
    const an = new UnitAnimator(root, 'war_serpent');
    an.setAnimation(anim, true);
    an._blendT = 99;
    an.setTime(t);
    return { root, P: an.meshParts };
  }

  it('o animador acha as pontas das asas e a cauda e as asas batem em oposição (voo, movimento e ataque)', () => {
    for (const anim of ['idle', 'walk', 'fight']) {
      const { P } = pose(anim, 0.13);
      expect(P.wingTipL && P.wingTipR && P.tail && P.tailTip, anim).toBeTruthy();
      expect(P.wingL.rotation.z, anim).toBeCloseTo(-P.wingR.rotation.z, 6);
      expect(Math.abs(P.wingL.rotation.z), anim).toBeGreaterThan(0.01);
      expect(P.wingTipL.rotation.z, anim).toBeCloseTo(-P.wingTipR.rotation.z, 6);
    }
  });

  it('no ataque a cabeça dá o bote (avança em z e desce) e no pairar a ponta da cauda ondula', () => {
    const golpe = pose('fight', 0.45).P; // fase ~0.45 do ciclo de ataque
    const idle = pose('idle', 0.3).P;
    expect(golpe.head.position.z - idle.head.position.z).toBeGreaterThan(0.1);
    expect(golpe.head.rotation.x).toBeGreaterThan(0.2);
    expect(Math.abs(idle.tailTip.rotation.y)).toBeGreaterThan(0.02);
  });

  it('a cauda ondula e a batida é um laço (mesma pose no início e no fim do ciclo)', () => {
    const a = pose('idle', 0.3).P;
    const b = pose('idle', 0.9).P;
    expect(a.tail.rotation.y).not.toBeCloseTo(b.tail.rotation.y, 3);
    const c = pose('idle', 0).P;
    const d = pose('idle', 2.0 - 1e-9).P;
    expect(c.wingL.rotation.z).toBeCloseTo(d.wingL.rotation.z, 3);
    expect(c.tail.rotation.y).toBeCloseTo(d.tail.rotation.y, 3);
  });

  it('na morte as asas dobram para cima e o corpo desce até o chão (flyHeight 4,5) em espiral', () => {
    const fim = pose('die', 1.4).P;
    expect(fim.wingL.rotation.z).toBeLessThan(-0.8);
    expect(fim.wingR.rotation.z).toBeGreaterThan(0.8);
    expect(fim.torso.position.y).toBeLessThan(-3.5);
    expect(Math.abs(fim.torso.rotation.y)).toBeGreaterThan(3);
    const ini = pose('die', 0).P;
    expect(ini.torso.position.y).toBeCloseTo(0, 3);
  });
});
