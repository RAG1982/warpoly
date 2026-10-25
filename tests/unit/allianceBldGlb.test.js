import { describe, it, expect, vi } from 'vitest';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { GLB_MODELS, glbFaction } from '../../src/entities/glbModels.js';
import { BUILDINGS } from '../../src/data/index.js';

vi.hoisted(() => {
  const quiet = (orig) => (...a) => { if (typeof a[0] === 'string' && a[0].startsWith('[glbModels]')) return; orig(...a); };
  console.warn = quiet(console.warn.bind(console));
});

/** ART-ALI-3: Quartel, Casa e Serraria da Aliança (Tripo, `tools/blender/build_alliance_bld.py`). */
const MODELOS = {
  barracks: { root: 'Barracks', team: true, alturaMin: 5, alturaMax: 6.5 },
  cottage: { root: 'Cottage', team: false, alturaMin: 5, alturaMax: 6 },
  lumber_camp: { root: 'LumberCamp', team: true, alturaMin: 3, alturaMax: 4.5 },
};

function glbJson(file) {
  const b = readFileSync(join(process.cwd(), 'public', 'models', file));
  return JSON.parse(b.toString('utf8', 20, 20 + b.readUInt32LE(12)));
}

function bbox(j) {
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (const m of j.meshes) {
    for (const p of m.primitives) {
      const a = j.accessors[p.attributes.POSITION];
      for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], a.min[i]); hi[i] = Math.max(hi[i], a.max[i]); }
    }
  }
  return { lo, hi, w: hi[0] - lo[0], h: hi[1] - lo[1], d: hi[2] - lo[2] };
}

describe('Quartel/Casa/Serraria da Aliança (ART-ALI-3): orçamento e estrutura', () => {
  for (const [key, spec] of Object.entries(MODELOS)) {
    const file = `${key}.glb`;
    const j = glbJson(file);
    const byName = Object.fromEntries(j.nodes.map((nd) => [nd.name, nd]));
    const b = bbox(j);

    it(`${key}: raiz ${spec.root}, Static_Mesh e sockets; sem rig nem animações`, () => {
      for (const nd of [spec.root, 'Static_Mesh', 'Socket_UnitSpawn', 'Socket_Rally']) expect(byName[nd], nd).toBeTruthy();
      expect(j.skins).toBeUndefined();
      expect(j.animations).toBeUndefined();
      expect(byName[spec.root].translation).toBeUndefined();
    });

    it(`${key}: <= 2 draw calls, <= 8 mil triângulos, < 400 KB, textura única WebP`, () => {
      const prims = j.meshes.flatMap((m) => m.primitives);
      expect(prims.length).toBeLessThanOrEqual(2);
      const tris = prims.reduce((s, p) => s + j.accessors[p.indices].count / 3, 0);
      expect(tris).toBeGreaterThan(3000);
      expect(tris).toBeLessThanOrEqual(8000);
      expect(statSync(join(process.cwd(), 'public', 'models', file)).size).toBeLessThan(400 * 1024);
      expect(j.images.length).toBe(1);
      expect(j.images[0].mimeType).toBe('image/webp');
      const names = j.materials.map((m) => m.name);
      expect(names).toContain('Atlas');
      expect(names.includes('TeamColor')).toBe(spec.team);
      // sem atributos inúteis: só posição, normal e uv
      for (const p of prims) expect(Object.keys(p.attributes).sort()).toEqual(['NORMAL', 'POSITION', 'TEXCOORD_0']);
    });

    it(`${key}: pés em y=0, centrado, altura plausível e pegada compatível com o raio de colisão`, () => {
      expect(b.lo[1]).toBeCloseTo(0, 1);
      expect(b.h).toBeGreaterThanOrEqual(spec.alturaMin);
      expect(b.h).toBeLessThanOrEqual(spec.alturaMax);
      expect(Math.abs(b.lo[0] + b.hi[0])).toBeLessThan(0.3);
      expect(Math.abs(b.lo[2] + b.hi[2])).toBeLessThan(0.3);
      // mesma folga das construções base (ver tools/blender/README.md): a pegada visual não passa de ~2,2x o raio
      const r = BUILDINGS[key].collisionRadius;
      expect(Math.max(b.w, b.d) / 2).toBeLessThanOrEqual(r * 1.2 + 0.3);
    });

    it(`${key}: sockets à frente (+Z), fora da caixa do modelo, rally além do spawn`, () => {
      const sp = byName.Socket_UnitSpawn.translation;
      const ra = byName.Socket_Rally.translation;
      expect(sp[2]).toBeGreaterThan(b.hi[2]);
      expect(ra[2]).toBeGreaterThan(sp[2]);
      expect(Math.abs(sp[0])).toBeLessThan(0.01);
      expect(sp[1]).toBe(0);
    });
  }

  it('o registro continua apontando para os três .glb (humanos) e o inspetor usa o novo script', () => {
    for (const [key, spec] of Object.entries(MODELOS)) {
      expect(GLB_MODELS[key]).toMatchObject({ root: spec.root, type: null });
      expect(glbFaction(key)).toBe('human');
    }
    const src = readFileSync(join(process.cwd(), 'src', 'inspector', 'inspector.js'), 'utf8');
    expect(src.match(/build_alliance_bld\.py/g).length).toBeGreaterThanOrEqual(3);
  });

  it('a chaminé da fumaça da Casa fica sobre o lado +X da casa (dentro da caixa do modelo)', () => {
    const b = bbox(glbJson('cottage.glb'));
    const src = readFileSync(join(process.cwd(), 'src', 'render', 'BuildingView.js'), 'utf8');
    const m = src.match(/_chimneyOffsetCottage = new THREE\.Vector3\(([-\d.]+), ([-\d.]+), ([-\d.]+)\)/);
    expect(m).toBeTruthy();
    const [x, y, z] = m.slice(1).map(Number);
    expect(x).toBeGreaterThan(b.hi[0] - 0.8);
    expect(x).toBeLessThanOrEqual(b.hi[0]);
    expect(y).toBeLessThanOrEqual(b.hi[1]);
    expect(y).toBeGreaterThan(b.hi[1] * 0.8);
    expect(Math.abs(z)).toBeLessThan(0.7);
  });
});
