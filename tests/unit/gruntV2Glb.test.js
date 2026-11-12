import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GLB_MODELS, glbFaction } from '../../src/entities/glbModels.js';

function glbJson(file) {
  const b = readFileSync(join(process.cwd(), 'public', 'models', file));
  return JSON.parse(b.toString('utf8', 20, 20 + b.readUInt32LE(12)));
}

describe('grunt_v2.glb: estrutura e orçamento', () => {
  const j = glbJson('grunt_v2.glb');
  const byName = Object.fromEntries(j.nodes.map((n, i) => [n.name, { ...n, i }]));
  const parentOf = (name) => { const i = byName[name].i; const p = j.nodes.find((n) => (n.children || []).includes(i)); return p ? p.name : null; };

  it('tem os nós do tipo `grunt` com a rig aninhada e o machado (Weapon) filho de ArmR', () => {
    for (const n of ['Grunt', 'Torso', 'Head', 'ArmL', 'ArmR', 'Weapon', 'LegL', 'LegR']) expect(byName[n], n).toBeTruthy();
    expect(parentOf('Weapon')).toBe('ArmR');
    expect(parentOf('ArmR')).toBe('Torso');
    expect(parentOf('ArmL')).toBe('Torso');
    expect(parentOf('Head')).toBe('Torso');
    expect(parentOf('Torso')).toBe('Grunt');
    expect(parentOf('LegL')).toBe('Grunt');
    expect(byName.Weapon.mesh).not.toBeUndefined();
    expect(byName.Grunt.translation).toBeUndefined();
    expect(j.skins).toBeUndefined();
  });

  it('respeita o orçamento: <= 20 draw calls, textura 512², TeamColor', () => {
    expect(j.meshes.reduce((s, m) => s + m.primitives.length, 0)).toBeLessThanOrEqual(20);
    expect(j.images.length).toBe(1);
    expect(j.materials.map((m) => m.name)).toEqual(expect.arrayContaining(['Atlas', 'TeamColor']));
  });

  it('tem a altura do Guerreiro antigo (~2,83) com os pés no chão', () => {
    const accOf = (nome) => j.accessors[j.meshes[byName[nome].mesh].primitives[0].attributes.POSITION];
    const torso = byName.Torso.translation[1];
    const topo = torso + byName.Head.translation[1] + accOf('Head').max[1];
    expect(topo).toBeGreaterThan(2.7);
    expect(topo).toBeLessThan(3.0);
    expect(Math.abs(byName.LegL.translation[1] + accOf('LegL').min[1])).toBeLessThan(0.02);
  });

  it('registrado como grunt (orc), com o antigo mantido', () => {
    expect(GLB_MODELS.grunt_v2).toMatchObject({ root: 'Grunt', type: 'grunt' });
    expect(glbFaction('grunt_v2')).toBe('orc');
    expect(GLB_MODELS.grunt).toMatchObject({ root: 'Grunt', type: 'grunt' });
  });
});
