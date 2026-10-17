import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GLB_MODELS, glbFaction } from '../../src/entities/glbModels.js';
import { UNITS } from '../../src/data/units.js';

/** Lê o bloco JSON de um .glb (sem three nem navegador). */
function glbJson(file) {
  const b = readFileSync(join(process.cwd(), 'public', 'models', file));
  return JSON.parse(b.toString('utf8', 20, 20 + b.readUInt32LE(12)));
}

describe('hero_oren.glb (M2-21): estrutura e orçamento', () => {
  const j = glbJson('hero_oren.glb');
  const byName = Object.fromEntries(j.nodes.map((n, i) => [n.name, { ...n, i }]));
  const parentOf = (name) => { const i = byName[name].i; const p = j.nodes.find((n) => (n.children || []).includes(i)); return p ? p.name : null; };

  it('tem os nós do tipo `mage` com Weapon > ArmR e Crystal > Weapon, sem escudo', () => {
    for (const n of ['Mage', 'Torso', 'Head', 'ArmL', 'ArmR', 'LegL', 'LegR', 'Weapon', 'Crystal']) expect(byName[n], n).toBeTruthy();
    expect(j.nodes.some((n) => /shield|escudo/i.test(n.name))).toBe(false);
    expect(parentOf('Weapon')).toBe('ArmR');
    expect(parentOf('Crystal')).toBe('Weapon');
    expect(parentOf('Torso')).toBe('Mage');
    expect(byName.Mage.translation).toBeUndefined(); // raiz sem transformação
  });

  it('respeita o orçamento: <= 20 draw calls e textura <= 512², com TeamColor no pano', () => {
    const draws = j.meshes.reduce((s, m) => s + m.primitives.length, 0);
    expect(draws).toBeLessThanOrEqual(20);
    expect(j.images.length).toBe(1);
    expect(j.materials.map((m) => m.name).sort()).toEqual(['Atlas', 'TeamColor']);
    const torso = j.meshes[byName.Torso.mesh];
    expect(torso.primitives.map((p) => j.materials[p.material].name).sort()).toEqual(['Atlas', 'TeamColor']);
  });

  it('está registrado como mage, na facção humana, com o herói apontando para o modelo `mage`', () => {
    expect(GLB_MODELS.hero_oren).toMatchObject({ root: 'Mage', type: 'mage' });
    expect(glbFaction('hero_oren')).toBe('human');
    expect(UNITS.hero_oren.modelOf).toBe('mage');
  });
});
