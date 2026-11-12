import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GLB_MODELS, glbFaction } from '../../src/entities/glbModels.js';

function glbJson(file) {
  const b = readFileSync(join(process.cwd(), 'public', 'models', file));
  return JSON.parse(b.toString('utf8', 20, 20 + b.readUInt32LE(12)));
}

describe('axethrower_v2.glb: estrutura e orçamento', () => {
  const j = glbJson('axethrower_v2.glb');
  const byName = Object.fromEntries(j.nodes.map((n, i) => [n.name, { ...n, i }]));
  const parentOf = (name) => { const i = byName[name].i; const p = j.nodes.find((n) => (n.children || []).includes(i)); return p ? p.name : null; };

  it('tem os nós do tipo `axethrower` com a rig aninhada e o machado (WeaponR) filho de ArmR', () => {
    for (const n of ['Axethrower', 'Torso', 'Head', 'ArmL', 'ArmR', 'WeaponR', 'LegL', 'LegR']) expect(byName[n], n).toBeTruthy();
    expect(parentOf('WeaponR')).toBe('ArmR');
    expect(parentOf('ArmR')).toBe('Torso');
    expect(parentOf('ArmL')).toBe('Torso');
    expect(parentOf('Head')).toBe('Torso');
    expect(parentOf('Torso')).toBe('Axethrower');
    expect(parentOf('LegL')).toBe('Axethrower');
    expect(byName.WeaponR.mesh).not.toBeUndefined();
    expect(byName.Axethrower.translation).toBeUndefined();
    expect(j.skins).toBeUndefined();
  });

  it('respeita o orçamento: <= 20 draw calls, textura 512², TeamColor', () => {
    expect(j.meshes.reduce((s, m) => s + m.primitives.length, 0)).toBeLessThanOrEqual(20);
    expect(j.images.length).toBe(1);
    expect(j.materials.map((m) => m.name)).toEqual(expect.arrayContaining(['Atlas', 'TeamColor']));
  });

  it('tem a altura do Arremessador antigo (~2,75) com os pés no chão', () => {
    const accOf = (nome) => j.accessors[j.meshes[byName[nome].mesh].primitives[0].attributes.POSITION];
    const torso = byName.Torso.translation[1];
    const topo = torso + byName.Head.translation[1] + accOf('Head').max[1];
    expect(topo).toBeGreaterThan(2.6);
    expect(topo).toBeLessThan(2.9);
    expect(Math.abs(byName.LegL.translation[1] + accOf('LegL').min[1])).toBeLessThan(0.02);
  });

  it('registrado como axethrower (orc), com o antigo mantido', () => {
    expect(GLB_MODELS.axethrower_v2).toMatchObject({ root: 'Axethrower', type: 'axethrower' });
    expect(glbFaction('axethrower_v2')).toBe('orc');
    expect(GLB_MODELS.axethrower).toMatchObject({ root: 'Axethrower', type: 'axethrower' });
  });
});
