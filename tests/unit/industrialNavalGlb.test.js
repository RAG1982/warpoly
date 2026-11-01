import { describe, it, expect, vi } from 'vitest';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { GLB_MODELS, glbFaction } from '../../src/entities/glbModels.js';
import { BUILDINGS } from '../../src/data/index.js';

vi.hoisted(() => {
  const quiet = (orig) => (...a) => { if (typeof a[0] === 'string' && a[0].startsWith('[glbModels]')) return; orig(...a); };
  console.warn = quiet(console.warn.bind(console));
});

/** M5-04: Refinaria, Fundição, Fornalha Naval e Caldeirão de Cinzas (`tools/blender/build_{refinery,foundry,naval_forge,ash_cauldron}.py`). */
const MODELOS = {
  refinery: { root: 'Refinery', faction: 'human', anim: ['Anim_Banners', 'Anim_Crane', 'Anim_Smoke'] },
  foundry: { root: 'Foundry', faction: 'human', anim: ['Anim_Banners', 'Anim_Crane', 'Anim_Smoke'] },
  naval_forge: { root: 'NavalForge', faction: 'orc', anim: ['Anim_Banners', 'Anim_Crane', 'Anim_Smoke'] },
  ash_cauldron: { root: 'AshCauldron', faction: 'orc', anim: ['Anim_Banners', 'Anim_Crane', 'Anim_Smoke'] },
};

function readGlb(file) {
  const b = readFileSync(join(process.cwd(), 'public', 'models', file));
  const jsonLen = b.readUInt32LE(12);
  return { json: JSON.parse(b.toString('utf8', 20, 20 + jsonLen)), bin: b.subarray(20 + jsonLen + 8) };
}

/** Largura e altura de um WebP (VP8, VP8L ou VP8X). */
function webpSize(buf) {
  expect(buf.toString('ascii', 0, 4)).toBe('RIFF');
  const tipo = buf.toString('ascii', 12, 16);
  if (tipo === 'VP8 ') return [buf.readUInt16LE(26) & 0x3fff, buf.readUInt16LE(28) & 0x3fff];
  if (tipo === 'VP8L') {
    const v = buf.readUInt32LE(21);
    return [(v & 0x3fff) + 1, ((v >> 14) & 0x3fff) + 1];
  }
  if (tipo === 'VP8X') return [buf.readUIntLE(24, 3) + 1, buf.readUIntLE(27, 3) + 1];
  throw new Error('WebP desconhecido: ' + tipo);
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

describe('Refinaria/Fundição/Fornalha Naval/Caldeirão (M5-04): integridade dos .glb', () => {
  for (const [key, spec] of Object.entries(MODELOS)) {
    const file = `${key}.glb`;
    const { json: j, bin } = readGlb(file);
    const byName = Object.fromEntries(j.nodes.map((nd) => [nd.name, nd]));
    const b = bbox(j);

    it(`${key}: registrado em GLB_MODELS (raiz ${spec.root}) e da facção ${spec.faction}`, () => {
      expect(GLB_MODELS[key]).toBeTruthy();
      expect(GLB_MODELS[key].root).toBe(spec.root);
      expect(GLB_MODELS[key].url).toMatch(new RegExp(`models/${key}\\.glb$`));
      expect(glbFaction(key)).toBe(spec.faction);
      expect(BUILDINGS[key].faction).toBe(spec.faction);
    });

    it(`${key}: hierarquia (raiz, Static_Mesh, Anim_*, sockets); sem rig nem animações embutidas`, () => {
      for (const n of [spec.root, 'Static_Mesh', 'Socket_UnitSpawn', 'Socket_Rally', ...spec.anim]) expect(byName[n], n).toBeTruthy();
      expect(j.skins).toBeUndefined();
      expect(j.animations).toBeUndefined();
      expect(byName[spec.root].translation).toBeUndefined();
    });

    it(`${key}: <= 20 draw calls, < 400 KB, textura única WebP <= 512² e TeamColor`, () => {
      const prims = j.meshes.flatMap((m) => m.primitives);
      expect(prims.length).toBeLessThanOrEqual(20);
      expect(statSync(join(process.cwd(), 'public', 'models', file)).size).toBeLessThan(400 * 1024);
      expect(j.images.length).toBe(1);
      expect(j.images[0].mimeType).toBe('image/webp');
      const view = j.bufferViews[j.images[0].bufferView];
      const [w, h] = webpSize(bin.subarray(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength));
      expect(w).toBeLessThanOrEqual(512);
      expect(h).toBeLessThanOrEqual(512);
      const nomes = j.materials.map((m) => m.name);
      expect(nomes).toContain('Atlas');
      expect(nomes).toContain('TeamColor');
      const tris = prims.reduce((s, p) => s + j.accessors[p.indices].count / 3, 0);
      expect(tris).toBeGreaterThan(2000);
      expect(tris).toBeLessThanOrEqual(15000);
      for (const p of prims) expect(Object.keys(p.attributes).sort()).toEqual(['NORMAL', 'POSITION', 'TEXCOORD_0']);
    });

    it(`${key}: pegada e altura compatíveis com a construção anterior (raio de colisão ${BUILDINGS[key].collisionRadius})`, () => {
      // estacas do píer descem até ~-1; as peças Anim_* têm coordenadas locais ao pivô (podem ser mais negativas)
      expect(b.lo[1]).toBeGreaterThanOrEqual(-2.5);
      expect(b.h).toBeGreaterThanOrEqual(5);
      expect(b.h).toBeLessThanOrEqual(10);
      const r = BUILDINGS[key].collisionRadius;
      expect(b.w).toBeGreaterThanOrEqual(r * 1.6);
      expect(b.w).toBeLessThanOrEqual(r * 2.4);     // 6,6 de largura (plataforma em terra) como o procedural
      expect(b.d).toBeGreaterThanOrEqual(8);
      expect(b.d).toBeLessThanOrEqual(10);          // terra + píer voltado para o mar (+Z)
    });

    it(`${key}: sockets à frente (+Z), além da caixa do modelo`, () => {
      const sp = byName.Socket_UnitSpawn.translation;
      const ra = byName.Socket_Rally.translation;
      expect(sp[2]).toBeGreaterThan(b.hi[2]);
      expect(ra[2]).toBeGreaterThan(sp[2]);
    });
  }
});
