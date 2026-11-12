import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GLB_MODELS, glbFaction } from '../../src/entities/glbModels.js';

/** Lê o bloco JSON de um .glb (sem three nem navegador). */
function glbJson(file) {
  const b = readFileSync(join(process.cwd(), 'public', 'models', file));
  return JSON.parse(b.toString('utf8', 20, 20 + b.readUInt32LE(12)));
}

describe('peon_v2.glb: estrutura e orçamento', () => {
  const j = glbJson('peon_v2.glb');
  const byName = Object.fromEntries(j.nodes.map((n, i) => [n.name, { ...n, i }]));
  const parentOf = (name) => { const i = byName[name].i; const p = j.nodes.find((n) => (n.children || []).includes(i)); return p ? p.name : null; };

  it('tem os nós do tipo `peon`; a picareta (ToolGroup) é filha de ArmR e não se chama Axe/Pickaxe/Hammer', () => {
    for (const n of ['Peon', 'Torso', 'Head', 'ArmL', 'ArmR', 'LegL', 'LegR', 'ToolGroup', 'Pack', 'WoodBundle', 'GoldSack']) expect(byName[n], n).toBeTruthy();
    expect(parentOf('ToolGroup')).toBe('ArmR');
    expect(byName.ToolGroup.mesh).not.toBeUndefined();
    for (const n of ['Axe', 'Pickaxe', 'Hammer']) expect(byName[n], n).toBeUndefined();
    expect(parentOf('Pack')).toBe('Peon');
    expect(parentOf('WoodBundle')).toBe('Pack');
    expect(parentOf('GoldSack')).toBe('Pack');
    expect(parentOf('Torso')).toBe('Peon');
    expect(byName.Peon.translation).toBeUndefined();
  });

  it('respeita o orçamento: <= 20 draw calls e textura 512², com TeamColor no torso', () => {
    const draws = j.meshes.reduce((s, m) => s + m.primitives.length, 0);
    expect(draws).toBeLessThanOrEqual(20);
    expect(j.images.length).toBe(1);
    expect(j.materials.map((m) => m.name)).toEqual(expect.arrayContaining(['Atlas', 'TeamColor']));
    const torso = j.meshes[byName.Torso.mesh];
    expect(torso.primitives.map((p) => j.materials[p.material].name).sort()).toEqual(['Atlas', 'TeamColor']);
  });

  it('tem a altura do Lacaio antigo (~2,285, base de VISUAL_SCALE.peon) com os pés no chão', () => {
    const acc = (nome) => j.accessors[j.meshes[byName[nome].mesh].primitives[0].attributes.POSITION];
    const topo = byName.Head.translation[1] + acc('Head').max[1];
    expect(topo).toBeGreaterThan(2.2);
    expect(topo).toBeLessThan(2.35);
    const pe = byName.LegL.translation[1] + acc('LegL').min[1];
    expect(Math.abs(pe)).toBeLessThan(0.02);
  });

  it('está registrado como peon (orc), com o peon antigo mantido', () => {
    expect(GLB_MODELS.peon_v2).toMatchObject({ root: 'Peon', type: 'peon' });
    expect(glbFaction('peon_v2')).toBe('orc');
    expect(GLB_MODELS.peon).toMatchObject({ root: 'Peon', type: 'peon' });
  });
});
