import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GLB_MODELS, glbFaction } from '../../src/entities/glbModels.js';
import { HQ_TIER_MODEL, HQ_TIER_VIEW_ORC, hqTierView } from '../../src/data/index.js';

function glbJson(file) {
  const b = readFileSync(join(process.cwd(), 'public', 'models', file));
  return JSON.parse(b.toString('utf8', 20, 20 + b.readUInt32LE(12)));
}
function bbox(j) {
  const lo = [Infinity, Infinity, Infinity]; const hi = [-Infinity, -Infinity, -Infinity];
  for (const m of j.meshes) for (const p of m.primitives) {
    const a = j.accessors[p.attributes.POSITION];
    for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], a.min[i]); hi[i] = Math.max(hi[i], a.max[i]); }
  }
  return { lo, hi };
}

describe('hq_orc_{1,2,3}.glb: estrutura, orçamento e registro', () => {
  for (const n of [1, 2, 3]) {
    const j = glbJson(`hq_orc_${n}.glb`);
    const byName = Object.fromEntries(j.nodes.map((nd) => [nd.name, nd]));
    it(`nível ${n}: raiz HqOrc${n}, Static_Mesh e sockets; sem rig; <= 20 draw calls; textura 512²; TeamColor`, () => {
      for (const nd of [`HqOrc${n}`, 'Static_Mesh', 'Socket_UnitSpawn', 'Socket_Rally']) expect(byName[nd], nd).toBeTruthy();
      expect(j.skins).toBeUndefined();
      expect(j.animations).toBeUndefined();
      expect(j.meshes.reduce((s, m) => s + m.primitives.length, 0)).toBeLessThanOrEqual(20);
      expect(j.images.length).toBe(1);
      expect(j.materials.map((m) => m.name)).toEqual(expect.arrayContaining(['Atlas', 'TeamColor']));
    });
    it(`nível ${n}: pés no chão, altura do HQ_TIER_VIEW_ORC e pegada dentro do raio de colisão (5,5)`, () => {
      const { lo, hi } = bbox(j);
      expect(Math.abs(lo[1])).toBeLessThan(0.01);
      expect(hi[1]).toBeCloseTo(HQ_TIER_VIEW_ORC[n].height, 1);
      expect(Math.hypot(hi[0], hi[2])).toBeLessThan(7.2);
      expect(hi[0]).toBeLessThan(5.5);
      expect(hi[2]).toBeLessThan(5.5);
    });
    it(`nível ${n}: registrado como orc e ligado em HQ_TIER_MODEL.orc`, () => {
      expect(GLB_MODELS[`hq_orc_${n}`]).toMatchObject({ root: `HqOrc${n}`, type: null });
      expect(glbFaction(`hq_orc_${n}`)).toBe('orc');
      expect(HQ_TIER_MODEL.orc[n]).toBe(`hq_orc_${n}`);
      expect(hqTierView('orc', n)).toBe(HQ_TIER_VIEW_ORC[n]);
    });
  }
  it('o great_hall antigo segue registrado como reserva', () => {
    expect(GLB_MODELS.great_hall).toBeTruthy();
  });
});
