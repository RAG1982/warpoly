import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import {
  teamTint, getTeamMaterial, setTeamColor, hasTeamMask, teamMaterialCacheSize,
  clearTeamMaterialCache, TEAM_PALETTE
} from '../../src/render/teamColor.js';

function mkMat(name, hex = 0xffffff) {
  const m = new THREE.MeshStandardMaterial({ color: hex });
  m.name = name;
  return m;
}
function mkModel() {
  const root = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mkMat('Body', 0x888888));
  const cape = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mkMat('TeamColor'));
  root.add(body, cape);
  return { root, body, cape };
}

describe('teamTint (máscara -> cor)', () => {
  const base = [0.5, 0.5, 0.5];
  const team = [1, 0, 0.5];
  it('máscara 0 mantém a base', () => expect(teamTint(base, 0, team)).toEqual(base));
  it('máscara 1 multiplica pela cor de time', () => {
    expect(teamTint(base, 1, team)).toEqual([0.5, 0, 0.25]);
  });
  it('máscara intermediária interpola e fora de [0,1] é limitada', () => {
    expect(teamTint(base, 0.5, team)[1]).toBeCloseTo(0.25);
    expect(teamTint(base, 7, team)).toEqual(teamTint(base, 1, team));
    expect(teamTint(base, -3, team)).toEqual(base);
  });
});

describe('cache de materiais de time', () => {
  beforeEach(() => clearTeamMaterialCache());
  it('mesma (origem, cor) devolve o mesmo material', () => {
    const src = mkMat('TeamColor');
    const a = getTeamMaterial(src, '#ff0000');
    expect(getTeamMaterial(src, 0xff0000)).toBe(a);
    expect(a.color.getHexString()).toBe('ff0000');
    expect(a.name).toBe('TeamColor');
    expect(getTeamMaterial(src, '#00ff00')).not.toBe(a);
    expect(teamMaterialCacheSize()).toBe(2);
  });
  it('N instâncias do mesmo jogador compartilham 1 material; recolorir não cria materiais novos', () => {
    const tpl = mkModel();
    const clones = Array.from({ length: 5 }, () => {
      const c = tpl.root.clone(true);
      c.children[1].material = tpl.cape.material;
      return setTeamColor(c, TEAM_PALETTE[1]);
    });
    const mats = new Set(clones.map(c => c.children[1].material));
    expect(mats.size).toBe(1);
    for (let i = 0; i < 20; i++) clones.forEach(c => setTeamColor(c, TEAM_PALETTE[1]));
    expect(teamMaterialCacheSize()).toBe(1);
  });
});

describe('setTeamColor', () => {
  beforeEach(() => clearTeamMaterialCache());
  it('tinge só a máscara e recolore a partir do original', () => {
    const { root, body, cape } = mkModel();
    const bodyMat = body.material;
    setTeamColor(root, '#ff0000');
    expect(body.material).toBe(bodyMat);
    expect(cape.material.color.getHexString()).toBe('ff0000');
    setTeamColor(root, '#0000ff');
    expect(cape.material.color.getHexString()).toBe('0000ff');
    expect(cape.userData.teamSrcMaterial.color.getHexString()).toBe('ffffff'); // original intacto
  });
  it('mantém origMaterial do animador em sincronia', () => {
    const { root, cape } = mkModel();
    cape.userData.origMaterial = cape.material;
    setTeamColor(root, '#123456');
    expect(cape.userData.origMaterial).toBe(cape.material);
  });
  it('materiais em array', () => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), [mkMat('A'), mkMat('TeamColor')]);
    setTeamColor(m, '#ff00ff');
    expect(m.material[0].name).toBe('A');
    expect(m.material[1].color.getHexString()).toBe('ff00ff');
  });
  it('modelo sem máscara não quebra e fica intacto', () => {
    const g = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mkMat('Plain', 0x112233));
    g.add(mesh, new THREE.Group());
    const before = mesh.material;
    expect(() => setTeamColor(g, '#ff0000')).not.toThrow();
    expect(() => setTeamColor(null, '#ff0000')).not.toThrow();
    expect(() => setTeamColor(g, undefined)).not.toThrow();
    expect(mesh.material).toBe(before);
    expect(hasTeamMask(g)).toBe(false);
    expect(hasTeamMask(mkModel().root)).toBe(true);
  });
  it('paleta tem 8 cores distintas', () => {
    expect(TEAM_PALETTE.length).toBe(8);
    expect(new Set(TEAM_PALETTE).size).toBe(8);
  });
});
