import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { critterGlbKeysOfMap } from '../../src/data/critters.js';
import { CritterAnimator } from '../../src/render/critterAnimator.js';
import { GLB_MODELS } from '../../src/entities/glbModels.js';
import { ModelFactory } from '../../src/entities/ModelFactory.js';
import { BUILDINGS } from '../../src/data/buildings.js';
import { getMap } from '../../src/data/maps/index.js';

/** Raiz mínima com os nós do `critter_boar.glb` (hierarquia da seção 4 de art-p0-javali.md). */
function fakeBoar() {
  const root = new THREE.Group();
  root.name = 'CritterBoar';
  const body = new THREE.Object3D();
  body.name = 'Body';
  body.position.y = 0.5;
  root.add(body);
  const head = new THREE.Object3D();
  head.name = 'Head';
  body.add(head);
  for (const n of ['Leg_FL', 'Leg_FR', 'Leg_BL', 'Leg_BR']) {
    const l = new THREE.Object3D();
    l.name = n;
    body.add(l);
  }
  return root;
}

describe('M2-13: javali .glb', () => {
  it('critterGlbKeysOfMap só pede o .glb em mapas com javali/porco', () => {
    expect(critterGlbKeysOfMap(null)).toEqual([]);
    expect(critterGlbKeysOfMap({})).toEqual([]);
    expect(critterGlbKeysOfMap({ neutrals: [{ kind: 'critters', species: 'sheep' }, { kind: 'camp' }] })).toEqual([]);
    expect(critterGlbKeysOfMap({ neutrals: [{ kind: 'critters', species: 'boar' }] })).toEqual(['critter_boar']);
    expect(critterGlbKeysOfMap({ neutrals: [{ kind: 'critters', species: 'pig' }] })).toEqual(['critter_boar']);
  });

  it('a chave pedida existe em GLB_MODELS e continua lazy', () => {
    expect(GLB_MODELS.critter_boar).toBeTruthy();
    expect(GLB_MODELS.critter_boar.lazy).toBe(true);
  });

  it('mapas existentes: os que têm javali pedem o .glb, o resto não', () => {
    expect(critterGlbKeysOfMap(getMap('ilhas-4p'))).toEqual(['critter_boar']);
    expect(critterGlbKeysOfMap(getMap('tutorial'))).toEqual([]);
  });

  it('sem o .glb carregado, createCritter devolve o procedural (reserva)', () => {
    const m = ModelFactory.createCritter('boar');
    expect(m.userData.glbCritter).toBeFalsy();
    expect(m.getObjectByName('Body')).toBeTruthy();
  });

  it('CritterAnimator gira pernas ao andar, baixa a cabeça ao pastar e congela em repouso', () => {
    const root = fakeBoar();
    const a = new CritterAnimator(root, 0);
    expect(a.valid).toBe(true);
    a.setState('walk');
    for (let i = 0; i < 30; i++) a.update(1 / 30);
    const fl = root.getObjectByName('Leg_FL').rotation.x;
    const fr = root.getObjectByName('Leg_FR').rotation.x;
    expect(Math.abs(fl)).toBeGreaterThan(0.05);
    expect(Math.sign(fl) * Math.sign(fr)).toBeLessThanOrEqual(0); // diagonais em oposição
    a.setState('graze');
    for (let i = 0; i < 60; i++) a.update(1 / 30);
    expect(root.getObjectByName('Head').rotation.x).toBeGreaterThan(0.7);
    a.setState('run');
    for (let i = 0; i < 30; i++) a.update(1 / 30);
    expect(Math.max(...['Leg_FL', 'Leg_BL'].map(n => Math.abs(root.getObjectByName(n).rotation.x)))).toBeGreaterThan(0.1);
    a.freeze();
    expect(root.getObjectByName('Head').rotation.x).toBe(0);
    expect(root.getObjectByName('Body').position.y).toBe(0.5);
  });

  it('CritterAnimator em modelo sem os nós fica inválido e não lança', () => {
    const a = new CritterAnimator(new THREE.Group());
    expect(a.valid).toBe(false);
    expect(() => a.update(0.1)).not.toThrow();
  });

  it('Cercado de Javalis: ícone novo e nome pt-BR (id interno pig_farm)', () => {
    expect(BUILDINGS.pig_farm.name).toBe('Cercado de Javalis');
    expect(BUILDINGS.pig_farm.icon).toBe('/icoJavali.png');
  });
});
