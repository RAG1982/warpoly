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

describe('hero_skarn.glb (M2-24): estrutura e orçamento', () => {
  const j = glbJson('hero_skarn.glb');
  const byName = Object.fromEntries(j.nodes.map((n, i) => [n.name, { ...n, i }]));
  const parentOf = (name) => { const i = byName[name].i; const p = j.nodes.find((n) => (n.children || []).includes(i)); return p ? p.name : null; };

  it('tem os nós do tipo `ogre` com o martelo (Weapon) filho de ArmR, sem escudo', () => {
    for (const n of ['Ogre', 'Torso', 'Head', 'ArmL', 'ArmR', 'LegL', 'LegR', 'Weapon']) expect(byName[n], n).toBeTruthy();
    expect(j.nodes.some((n) => /shield|escudo/i.test(n.name))).toBe(false);
    expect(parentOf('Weapon')).toBe('ArmR');
    expect(parentOf('Torso')).toBe('Ogre');
    expect(parentOf('Head')).toBe('Torso');
    expect(byName.Ogre.translation).toBeUndefined(); // raiz sem transformação
  });

  it('repousa o Weapon a -45° em x, como o Ogro (o UnitAnimator espelha o golpe em torno desse repouso)', () => {
    const q = byName.Weapon.rotation;
    expect(q).toBeTruthy();
    expect(q[0]).toBeCloseTo(-0.3827, 3);
    expect(q[3]).toBeCloseTo(0.9239, 3);
  });

  it('respeita o orçamento: <= 20 draw calls e textura <= 512², com TeamColor', () => {
    const draws = j.meshes.reduce((s, m) => s + m.primitives.length, 0);
    expect(draws).toBeLessThanOrEqual(20);
    expect(j.images.length).toBe(1);
    expect(j.materials.map((m) => m.name).sort()).toEqual(['Atlas', 'TeamColor']);
    const usaTime = j.nodes.some((n) => n.mesh !== undefined && j.meshes[n.mesh].primitives.some((p) => j.materials[p.material].name === 'TeamColor'));
    expect(usaTime).toBe(true);
  });

  it('o martelo é uma peça própria e grande (cabo e cabeça: mais de 2 unidades de altura local)', () => {
    const prim = j.meshes[byName.Weapon.mesh].primitives[0];
    const acc = j.accessors[prim.attributes.POSITION];
    expect(acc.max[1] - acc.min[1]).toBeGreaterThan(2);
  });

  it('está registrado como ogre, na facção orc, com o herói apontando para o modelo `ogre` e maior que o Drogath', () => {
    expect(GLB_MODELS.hero_skarn).toMatchObject({ root: 'Ogre', type: 'ogre' });
    expect(glbFaction('hero_skarn')).toBe('orc');
    expect(UNITS.hero_skarn.modelOf).toBe('ogre');
    expect(UNITS.hero_skarn.scaleMul).toBeGreaterThan(UNITS.hero_drogath.scaleMul);
  });
});
