import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GLB_MODELS, glbFaction } from '../../src/entities/glbModels.js';
import { BUILDINGS } from '../../src/data/index.js';

function glbJson(file) {
  const b = readFileSync(join(process.cwd(), 'public', 'models', file));
  return JSON.parse(b.toString('utf8', 20, 20 + b.readUInt32LE(12)));
}

describe('forge_v2.glb: estrutura, orçamento e registro', () => {
  const j = glbJson('forge_v2.glb');
  const byName = Object.fromEntries(j.nodes.map((nd) => [nd.name, nd]));
  it('raiz Forge, Static_Mesh e sockets; sem rig; <= 20 draw calls; textura 512²; TeamColor', () => {
    for (const nd of ['Forge', 'Static_Mesh', 'Socket_UnitSpawn', 'Socket_Rally']) expect(byName[nd], nd).toBeTruthy();
    expect(j.skins).toBeUndefined();
    expect(j.meshes.reduce((s, m) => s + m.primitives.length, 0)).toBeLessThanOrEqual(20);
    expect(j.images.length).toBe(1);
    expect(j.materials.map((m) => m.name)).toEqual(expect.arrayContaining(['Atlas', 'TeamColor']));
  });
  it('pés no chão, altura 5,0 e pegada ~6,6', () => {
    const lo = [Infinity, Infinity, Infinity]; const hi = [-Infinity, -Infinity, -Infinity];
    for (const m of j.meshes) for (const p of m.primitives) {
      const a = j.accessors[p.attributes.POSITION];
      for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], a.min[i]); hi[i] = Math.max(hi[i], a.max[i]); }
    }
    expect(Math.abs(lo[1])).toBeLessThan(0.01);
    expect(hi[1]).toBeCloseTo(5.0, 1);
    expect(hi[0] - lo[0]).toBeGreaterThan(6);
    expect(hi[0] - lo[0]).toBeLessThan(7.2);
    expect(BUILDINGS.forge.healthBarHeight).toBeGreaterThan(hi[1]);
  });
  it('registrado como humano, com o forge antigo mantido', () => {
    expect(GLB_MODELS.forge_v2).toMatchObject({ root: 'Forge', type: null });
    expect(glbFaction('forge_v2')).toBe('human');
    expect(GLB_MODELS.forge).toMatchObject({ root: 'Forge' });
  });
});
