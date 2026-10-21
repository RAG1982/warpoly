import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as THREE from 'three';
import { GLB_MODELS, glbFaction, glbTemplates } from '../../src/entities/glbModels.js';
import { ModelFactory } from '../../src/entities/ModelFactory.js';
import { BuildingView } from '../../src/render/BuildingView.js';
import { Building } from '../../src/sim/Building.js';
import { BUILDINGS, HQ_TIER_MODEL, HQ_TIER_VIEW } from '../../src/data/index.js';

vi.hoisted(() => {
  const quiet = (orig) => (...a) => { if (typeof a[0] === 'string' && a[0].startsWith('[glbModels]')) return; orig(...a); };
  console.warn = quiet(console.warn.bind(console));
});

/** Lê o bloco JSON de um .glb (sem three nem navegador). */
function glbJson(file) {
  const b = readFileSync(join(process.cwd(), 'public', 'models', file));
  return JSON.parse(b.toString('utf8', 20, 20 + b.readUInt32LE(12)));
}

/** Caixa (min/max) dos acessores POSITION do .glb (os acessores guardam min/max mesmo com meshopt). */
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

const LEVELS = [1, 2, 3];

describe('hq_human_{1,2,3}.glb (M2-33): estrutura e orçamento', () => {
  for (const n of LEVELS) {
    const j = glbJson(`hq_human_${n}.glb`);
    const byName = Object.fromEntries(j.nodes.map((nd) => [nd.name, nd]));

    it(`nível ${n}: raiz HqHuman${n}, Static_Mesh e sockets; sem rig`, () => {
      for (const nd of [`HqHuman${n}`, 'Static_Mesh', 'Socket_UnitSpawn', 'Socket_Rally']) expect(byName[nd], nd).toBeTruthy();
      expect(j.skins).toBeUndefined();
      expect(j.animations).toBeUndefined();
      expect(byName[`HqHuman${n}`].translation).toBeUndefined();
    });

    it(`nível ${n}: <= 20 draw calls, textura única 512² (WebP) e material TeamColor`, () => {
      const draws = j.meshes.reduce((s, m) => s + m.primitives.length, 0);
      expect(draws).toBeLessThanOrEqual(20);
      expect(j.images.length).toBe(1);
      expect(j.images[0].mimeType).toBe('image/webp');
      expect(j.materials.map((m) => m.name)).toContain('TeamColor');
      expect(j.materials.map((m) => m.name)).toContain('Atlas');
      const tris = j.meshes.flatMap((m) => m.primitives).reduce((s, p) => s + j.accessors[p.indices].count / 3, 0);
      expect(tris).toBeGreaterThan(15000);
      expect(tris).toBeLessThan(21000);
    });

    it(`nível ${n}: pés em y=0, centrado e a altura/pegada da tabela HQ_TIER_VIEW`, () => {
      const b = bbox(j);
      const v = HQ_TIER_VIEW[n];
      expect(b.lo[1]).toBeCloseTo(0, 1);
      expect(b.h).toBeCloseTo(v.height, 1);
      expect(Math.abs(b.lo[0] + b.hi[0])).toBeLessThan(0.3);
      expect(Math.abs(b.lo[2] + b.hi[2])).toBeLessThan(0.3);
      expect(Math.max(b.w, b.d)).toBeLessThanOrEqual(v.footprint + 0.35);
      // o raio de colisão da simulação (5,5, o mesmo nos três níveis) cobre a pegada visual (± pontas das torres)
      expect(Math.hypot(b.w / 2, b.d / 2)).toBeLessThanOrEqual(BUILDINGS.castle.collisionRadius * 1.25);
    });
  }

  it('altura e pegada crescem do nível 1 ao 3', () => {
    const bs = LEVELS.map((n) => bbox(glbJson(`hq_human_${n}.glb`)));
    expect(bs[0].h).toBeLessThan(bs[1].h);
    expect(bs[1].h).toBeLessThan(bs[2].h);
    expect(Math.max(bs[0].w, bs[0].d)).toBeLessThan(Math.max(bs[1].w, bs[1].d));
    expect(Math.max(bs[1].w, bs[1].d)).toBeLessThan(Math.max(bs[2].w, bs[2].d));
    for (let i = 0; i < 3; i++) expect(HQ_TIER_VIEW[i + 1].healthBarHeight).toBeGreaterThan(HQ_TIER_VIEW[i + 1].height);
  });
});

describe('registro dos modelos do Centro humano (M2-33)', () => {
  it('GLB_MODELS tem os três níveis (humanos) e mantém o castle antigo', () => {
    for (const n of LEVELS) {
      expect(GLB_MODELS[`hq_human_${n}`]).toMatchObject({ root: `HqHuman${n}`, type: null });
      expect(glbFaction(`hq_human_${n}`)).toBe('human');
      expect(HQ_TIER_MODEL.human[n]).toBe(`hq_human_${n}`);
    }
    expect(GLB_MODELS.castle).toMatchObject({ root: 'Castle' });
    expect(HQ_TIER_MODEL.orc[1]).toBeNull(); // orcs: modelo único
  });

  it('o inspetor lista os três níveis e o castelo antigo', () => {
    const src = readFileSync(join(process.cwd(), 'src', 'inspector', 'inspector.js'), 'utf8');
    for (const id of ['castle_glb', 'hq_human_1_glb', 'hq_human_2_glb', 'hq_human_3_glb']) expect(src).toContain(`id: '${id}'`);
  });
});

/** Registra um modelo de teste por chave: um Group com uma malha e o nome do nível (para a troca ser observável). */
function fakeTemplates(keys) {
  for (const k of keys) {
    const g = new THREE.Group();
    g.name = `T_${k}`;
    const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    m.name = 'Static_Mesh';
    g.add(m);
    glbTemplates.set(k, g);
  }
}

function makeView(tier = 1, scene = new THREE.Scene()) {
  const b = new Building({ getHeight: () => 0 }, 'castle', 0, 0, true, 1);
  b.tier = tier;
  const view = new BuildingView(b, scene);
  const emit = vi.fn();
  const ctx = { gm: { events: { emit } }, camera: new THREE.PerspectiveCamera() };
  return { b, view, ctx, emit };
}

const modelName = (view) => view.fullMesh.name;

describe('BuildingView do Centro humano troca de modelo por nível (M2-33)', () => {
  it('nasce com o modelo do tier da entidade (partida carregada/replay) e troca quando o tier muda', () => {
    const saved = ['hq_human_1', 'hq_human_2', 'hq_human_3', 'castle'].map((k) => [k, glbTemplates.get(k)]);
    try {
      fakeTemplates(['hq_human_1', 'hq_human_2', 'hq_human_3', 'castle']);
      const from = (k) => glbTemplates.get(k);
      const { b, view, ctx } = makeView(1);
      expect(view.fullMesh.name).toBe(from('hq_human_1').name);
      expect(view.getBuildingHeight()).toBe(HQ_TIER_VIEW[1].healthBarHeight);

      b.tier = 2; // o que `Building.simUpdate` faz ao concluir o UPGRADE_HQ
      view.update(0.016, ctx);
      expect(modelName(view)).toBe(from('hq_human_2').name);
      expect(view.root.children).toContain(view.fullMesh);
      expect(view.getBuildingHeight()).toBe(HQ_TIER_VIEW[2].healthBarHeight);

      b.tier = 3;
      view.update(0.016, ctx);
      expect(modelName(view)).toBe(from('hq_human_3').name);
      expect(view.getBuildingHeight()).toBe(HQ_TIER_VIEW[3].healthBarHeight);
      // o modelo novo anima o crescimento e termina na escala 1
      for (let i = 0; i < 40; i++) view.update(0.05, ctx);
      expect(view.fullMesh.scale.y).toBe(1);
      // só um modelo de Centro na raiz (o antigo saiu)
      expect(view.root.children.filter((c) => c.name.startsWith('T_')).length).toBe(1);

      // 2 Centros: cada view mostra o seu nível
      const a = makeView(1);
      const c = makeView(3);
      expect(modelName(a.view)).toBe(from('hq_human_1').name);
      expect(modelName(c.view)).toBe(from('hq_human_3').name);
    } finally {
      for (const [k, v] of saved) { if (v) glbTemplates.set(k, v); else glbTemplates.delete(k); }
    }
  });

  it('um Centro já no nível 3 ao criar a view (carregar partida) usa o modelo 3 sem trocar depois', () => {
    const saved = ['hq_human_1', 'hq_human_3'].map((k) => [k, glbTemplates.get(k)]);
    try {
      fakeTemplates(['hq_human_1', 'hq_human_3']);
      const { view, ctx } = makeView(3);
      const first = view.fullMesh;
      view.update(0.016, ctx);
      expect(view.fullMesh).toBe(first);
      expect(modelName(view)).toBe(glbTemplates.get('hq_human_3').name);
    } finally {
      for (const [k, v] of saved) { if (v) glbTemplates.set(k, v); else glbTemplates.delete(k); }
    }
  });

  it('sem o .glb do nível cai no castle.glb antigo e, sem ele, no bloco provisório', () => {
    const saved = ['hq_human_1', 'hq_human_2', 'hq_human_3', 'castle'].map((k) => [k, glbTemplates.get(k)]);
    try {
      for (const k of ['hq_human_1', 'hq_human_2', 'hq_human_3']) glbTemplates.delete(k);
      fakeTemplates(['castle']);
      expect(ModelFactory.createCastle(2).name).toBe('T_castle');
      glbTemplates.delete('castle');
      ModelFactory.headless = true;
      expect(ModelFactory.createCastle(3).name).toBe('Placeholder_castle');
    } finally {
      ModelFactory.headless = false;
      for (const [k, v] of saved) { if (v) glbTemplates.set(k, v); else glbTemplates.delete(k); }
    }
  });

  it('a fumaça da chaminé só sai no nível 1 (o único com chaminé)', () => {
    const saved = ['hq_human_1', 'hq_human_2'].map((k) => [k, glbTemplates.get(k)]);
    try {
      fakeTemplates(['hq_human_1', 'hq_human_2']);
      const { b, view, ctx, emit } = makeView(1);
      for (let i = 0; i < 40; i++) view.update(0.1, ctx);
      const smoke1 = emit.mock.calls.filter((c) => c[1] && c[1].kind === 'chimney_smoke').length;
      expect(smoke1).toBeGreaterThan(3);
      b.tier = 2;
      view.update(0.016, ctx);
      for (let i = 0; i < 12; i++) view.update(0.1, ctx); // deixa o burst da troca passar
      emit.mockClear();
      for (let i = 0; i < 60; i++) view.update(0.1, ctx);
      expect(emit.mock.calls.filter((c) => c[1] && c[1].kind === 'chimney_smoke').length).toBe(0);
    } finally {
      for (const [k, v] of saved) { if (v) glbTemplates.set(k, v); else glbTemplates.delete(k); }
    }
  });
});
