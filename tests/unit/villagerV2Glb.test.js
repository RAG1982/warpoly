import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GLB_MODELS, glbFaction } from '../../src/entities/glbModels.js';

/** Lê o bloco JSON de um .glb (sem three nem navegador). */
function glbJson(file) {
  const b = readFileSync(join(process.cwd(), 'public', 'models', file));
  return JSON.parse(b.toString('utf8', 20, 20 + b.readUInt32LE(12)));
}

describe('villager_v2.glb (M2-30): estrutura e orçamento', () => {
  const j = glbJson('villager_v2.glb');
  const byName = Object.fromEntries(j.nodes.map((n, i) => [n.name, { ...n, i }]));
  const parentOf = (name) => { const i = byName[name].i; const p = j.nodes.find((n) => (n.children || []).includes(i)); return p ? p.name : null; };

  it('tem os nós do tipo `villager`; a picareta (ToolGroup) é filha de ArmR e não se chama Axe/Pickaxe/Hammer', () => {
    for (const n of ['Villager', 'Torso', 'Head', 'ArmL', 'ArmR', 'LegL', 'LegR', 'ToolGroup', 'Pack', 'WoodBundle', 'GoldSack']) expect(byName[n], n).toBeTruthy();
    expect(parentOf('ToolGroup')).toBe('ArmR');
    expect(byName.ToolGroup.mesh).not.toBeUndefined();
    for (const n of ['Axe', 'Pickaxe', 'Hammer']) expect(byName[n], n).toBeUndefined(); // o setVillagerTool do inspetor esconderia a única ferramenta
    expect(parentOf('Pack')).toBe('Villager');
    expect(parentOf('WoodBundle')).toBe('Pack');
    expect(parentOf('GoldSack')).toBe('Pack');
    expect(parentOf('Torso')).toBe('Villager');
    expect(byName.Villager.translation).toBeUndefined(); // raiz sem transformação
  });

  it('respeita o orçamento: <= 20 draw calls e textura 512², com TeamColor na túnica', () => {
    const draws = j.meshes.reduce((s, m) => s + m.primitives.length, 0);
    expect(draws).toBeLessThanOrEqual(20);
    expect(j.images.length).toBe(1);
    expect(j.materials.map((m) => m.name)).toEqual(expect.arrayContaining(['Atlas', 'TeamColor']));
    const torso = j.meshes[byName.Torso.mesh];
    expect(torso.primitives.map((p) => j.materials[p.material].name).sort()).toEqual(['Atlas', 'TeamColor']);
  });

  it('tem a altura do camponês antigo (~1,95) com os pés no chão', () => {
    const acc = (nome) => j.accessors[j.meshes[byName[nome].mesh].primitives[0].attributes.POSITION];
    const head = acc('Head');
    const topo = byName.Head.translation[1] + head.max[1];
    expect(topo).toBeGreaterThan(1.9);
    expect(topo).toBeLessThan(2.0);
    const pe = byName.LegL.translation[1] + acc('LegL').min[1];
    expect(Math.abs(pe)).toBeLessThan(0.02);
  });

  it('está registrado como villager (humano), com o villager antigo mantido', () => {
    expect(GLB_MODELS.villager_v2).toMatchObject({ root: 'Villager', type: 'villager' });
    expect(glbFaction('villager_v2')).toBe('human');
    expect(GLB_MODELS.villager).toMatchObject({ root: 'Villager', type: 'villager' });
  });
});
