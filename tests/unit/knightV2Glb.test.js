import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GLB_MODELS, glbFaction } from '../../src/entities/glbModels.js';
import { ModelFactory } from '../../src/entities/ModelFactory.js';

/** Lê o bloco JSON de um .glb (sem three nem navegador). */
function glbJson(file) {
  const b = readFileSync(join(process.cwd(), 'public', 'models', file));
  return JSON.parse(b.toString('utf8', 20, 20 + b.readUInt32LE(12)));
}

describe('knight_v2.glb (M2-32): estrutura e orçamento', () => {
  const j = glbJson('knight_v2.glb');
  const byName = Object.fromEntries(j.nodes.map((n, i) => [n.name, { ...n, i }]));
  const parentOf = (name) => { const i = byName[name].i; const p = j.nodes.find((n) => (n.children || []).includes(i)); return p ? p.name : null; };
  const acc = (nome) => j.accessors[j.meshes[byName[nome].mesh].primitives[0].attributes.POSITION];

  it('tem os nós do tipo `knight`; Sword filha de ArmR e ShieldGroup filho de ArmL', () => {
    for (const n of ['Knight', 'Torso', 'Head', 'ArmL', 'ArmR', 'LegL', 'LegR', 'Sword', 'ShieldGroup']) expect(byName[n], n).toBeTruthy();
    expect(parentOf('Sword')).toBe('ArmR');
    expect(parentOf('ShieldGroup')).toBe('ArmL');
    for (const n of ['Torso', 'Head', 'ArmL', 'ArmR', 'LegL', 'LegR']) expect(parentOf(n)).toBe('Knight');
    expect(byName.Knight.translation).toBeUndefined(); // raiz sem transformação
    expect(j.skins).toBeUndefined();
    expect(j.animations).toBeUndefined();
  });

  it('respeita o orçamento: <= 20 draw calls, textura 512² (WebP) e TeamColor no tabardo e na crista', () => {
    const draws = j.meshes.reduce((s, m) => s + m.primitives.length, 0);
    expect(draws).toBeLessThanOrEqual(20);
    expect(j.images.length).toBe(1);
    expect(j.images[0].mimeType).toBe('image/webp');
    expect(j.materials.map((m) => m.name)).toEqual(expect.arrayContaining(['Atlas', 'TeamColor']));
    const nomes = (nó) => j.meshes[byName[nó].mesh].primitives.map((p) => j.materials[p.material].name);
    expect(nomes('Torso').sort()).toEqual(['Atlas', 'TeamColor']); // tabardo
    expect(nomes('Head')).toContain('TeamColor');                  // crista
  });

  it('tem a altura do espadachim antigo (~2,07) com os pés no chão', () => {
    const topo = byName.Head.translation[1] + acc('Head').max[1];
    expect(topo).toBeGreaterThan(2.0);
    expect(topo).toBeLessThan(2.12);
    const pe = byName.LegL.translation[1] + acc('LegL').min[1];
    expect(Math.abs(pe)).toBeLessThan(0.03);
  });

  it('a espada corre em +Y (lâmina para cima) e o nó traz o repouso x 0,5 / z -0,1 do animador', () => {
    const a = acc('Sword');
    const ext = [a.max[0] - a.min[0], a.max[1] - a.min[1], a.max[2] - a.min[2]];
    expect(ext[1]).toBeGreaterThan(ext[0]);
    expect(ext[1]).toBeGreaterThan(ext[2]);
    expect(a.max[1]).toBeGreaterThan(0.6);           // ponta bem acima da empunhadura (origem do nó)
    const [qx, , qz, qw] = byName.Sword.rotation;
    expect(qw).toBeGreaterThan(0.95);
    expect(qx).toBeGreaterThan(0.15);                // inclinada para a frente (~0,5 rad)
    expect(qz).toBeLessThan(0);
  });

  it('o escudo é um corpo próprio com a rotação de repouso do animador (y -0,3 rad)', () => {
    const q = byName.ShieldGroup.rotation;
    expect(q).toBeTruthy();
    expect(q[1]).toBeLessThan(-0.1);
    expect(Math.abs(q[0])).toBeLessThan(0.02);
    expect(Math.abs(q[2])).toBeLessThan(0.02);
  });

  it('está registrado como knight (humano), com o knight antigo e o Brann intactos', () => {
    expect(GLB_MODELS.knight_v2).toMatchObject({ root: 'Knight', type: 'knight' });
    expect(glbFaction('knight_v2')).toBe('human');
    expect(GLB_MODELS.knight).toMatchObject({ root: 'Knight', type: 'knight', url: expect.stringContaining('models/knight.glb') });
    expect(GLB_MODELS.hero_brann).toMatchObject({ root: 'Knight', type: 'knight', url: expect.stringContaining('hero_brann.glb') });
  });

  it('sem nenhum .glb carregado (headless), o Espadachim cai no bloco reserva', () => {
    expect(ModelFactory.createKnight().name).toBe('Placeholder_knight');
  });
});
