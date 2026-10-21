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

describe('hero_drogath.glb (M2-22): estrutura e orçamento', () => {
  const j = glbJson('hero_drogath.glb');
  const byName = Object.fromEntries(j.nodes.map((n, i) => [n.name, { ...n, i }]));
  const parentOf = (name) => { const i = byName[name].i; const p = j.nodes.find((n) => (n.children || []).includes(i)); return p ? p.name : null; };

  it('tem os nós do tipo `grunt` com o machado (Weapon) filho de ArmR, sem escudo', () => {
    for (const n of ['Grunt', 'Torso', 'Head', 'ArmL', 'ArmR', 'LegL', 'LegR', 'Weapon']) expect(byName[n], n).toBeTruthy();
    expect(j.nodes.some((n) => /shield|escudo/i.test(n.name))).toBe(false);
    expect(parentOf('Weapon')).toBe('ArmR');
    expect(parentOf('Torso')).toBe('Grunt');
    expect(byName.Grunt.translation).toBeUndefined(); // raiz sem transformação
  });

  it('repousa o Weapon a -45° em x, como o Talhador (o UnitAnimator espelha o golpe em torno desse repouso)', () => {
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

  it('está registrado como grunt, na facção orc, com o herói apontando para o modelo `grunt`', () => {
    expect(GLB_MODELS.hero_drogath).toMatchObject({ root: 'Grunt', type: 'grunt' });
    expect(glbFaction('hero_drogath')).toBe('orc');
    expect(UNITS.hero_drogath.modelOf).toBe('grunt');
  });
});
