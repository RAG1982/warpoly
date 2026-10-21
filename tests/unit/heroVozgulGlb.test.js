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

describe('hero_vozgul.glb (M2-23): estrutura e orçamento', () => {
  const j = glbJson('hero_vozgul.glb');
  const byName = Object.fromEntries(j.nodes.map((n, i) => [n.name, { ...n, i }]));
  const parentOf = (name) => { const i = byName[name].i; const p = j.nodes.find((n) => (n.children || []).includes(i)); return p ? p.name : null; };
  const matsOf = (name) => [...new Set(j.meshes[byName[name].mesh].primitives.map((p) => j.materials[p.material].name))];

  it('tem os nós do tipo `necromancer`: Weapon (cajado) filho de ArmR e Crystal (chama) filho de Weapon, sem escudo', () => {
    for (const n of ['Necromancer', 'Torso', 'Head', 'ArmL', 'ArmR', 'LegL', 'LegR', 'Weapon', 'Crystal']) expect(byName[n], n).toBeTruthy();
    expect(j.nodes.some((n) => /shield|escudo/i.test(n.name))).toBe(false);
    expect(parentOf('Weapon')).toBe('ArmR');
    expect(parentOf('Crystal')).toBe('Weapon');
    expect(parentOf('Torso')).toBe('Necromancer');
    expect(byName.Necromancer.translation).toBeUndefined(); // raiz sem transformação
  });

  it('a chama é um nó próprio de material emissivo verde-limão (`Flame`)', () => {
    expect(matsOf('Crystal')).toEqual(['Flame']);
    const m = j.materials.find((x) => x.name === 'Flame');
    expect(m.emissiveFactor).toEqual([1, 1, 1]);
    expect(m.emissiveTexture).toBeTruthy();
    expect(matsOf('Weapon')).toEqual(['Atlas']);
  });

  it('respeita o orçamento: <= 20 draw calls e uma textura <= 512², com TeamColor', () => {
    const draws = j.meshes.reduce((s, m) => s + m.primitives.length, 0);
    expect(draws).toBeLessThanOrEqual(20);
    expect(j.images.length).toBe(1);
    expect(j.materials.map((m) => m.name).sort()).toEqual(['Atlas', 'Flame', 'TeamColor']);
    expect(matsOf('Torso')).toContain('TeamColor');
    expect(matsOf('ArmL')).toContain('TeamColor'); // as fitas fazem parte dos braços
  });

  it('está registrado como necromancer, na facção orc, com o herói apontando para o modelo `necromancer`', () => {
    expect(GLB_MODELS.hero_vozgul).toMatchObject({ root: 'Necromancer', type: 'necromancer' });
    expect(glbFaction('hero_vozgul')).toBe('orc');
    expect(UNITS.hero_vozgul.modelOf).toBe('necromancer');
  });
});
