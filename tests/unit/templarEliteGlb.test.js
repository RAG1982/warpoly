import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GLB_MODELS } from '../../src/entities/glbModels.js';

/** Lê o bloco JSON de um .glb (sem three nem navegador). */
function glbJson(file) {
  const b = readFileSync(join(process.cwd(), 'public', 'models', file));
  return JSON.parse(b.toString('utf8', 20, 20 + b.readUInt32LE(12)));
}

describe('templar.glb (Paladino de Elite): estrutura e orçamento', () => {
  const j = glbJson('templar.glb');
  const byName = Object.fromEntries(j.nodes.map((n, i) => [n.name, { ...n, i }]));
  const parentOf = (name) => { const i = byName[name].i; const p = j.nodes.find((n) => (n.children || []).includes(i)); return p ? p.name : null; };
  const acc = (nome) => j.accessors[j.meshes[byName[nome].mesh].primitives[0].attributes.POSITION];

  it('tem os nós do tipo `cavalier` e do cavalo articulado (sem capa); o cavaleiro fica aninhado no Torso', () => {
    for (const n of ['Templar', 'Horse', 'HorseLegFL', 'HorseLegFR', 'HorseLegBL', 'HorseLegBR', 'HorseHead', 'HorseTail', 'Torso', 'Head', 'Plume', 'ArmL', 'ArmR', 'Sword']) {
      expect(byName[n], n).toBeTruthy();
    }
    expect(byName.Cape).toBeUndefined();
    for (const n of ['Horse', 'HorseLegFL', 'HorseLegFR', 'HorseLegBL', 'HorseLegBR', 'HorseHead', 'HorseTail', 'Torso']) expect(parentOf(n), n).toBe('Templar');
    for (const n of ['Head', 'ArmL', 'ArmR']) expect(parentOf(n), n).toBe('Torso');
    expect(parentOf('Plume')).toBe('Head');
    expect(parentOf('Sword')).toBe('ArmR');
    expect(byName.Templar.translation).toBeUndefined();
    expect(j.skins).toBeUndefined();
    expect(j.animations).toBeUndefined();
    expect(byName.HandL).toBeUndefined();
    expect(byName.HandR).toBeUndefined();
  });

  it('respeita o orçamento: <= 20 draw calls, textura 512² (WebP) e TeamColor na pluma e no cavalo', () => {
    const draws = j.meshes.reduce((s, m) => s + m.primitives.length, 0);
    expect(draws).toBeLessThanOrEqual(20);
    expect(j.images.length).toBe(1);
    expect(j.images[0].mimeType).toBe('image/webp');
    expect(j.materials.map((m) => m.name).sort()).toEqual(['Atlas', 'TeamColor']);
    const usaTime = (nome) => j.meshes[byName[nome].mesh].primitives.some((p) => j.materials[p.material].name === 'TeamColor');
    for (const n of ['Plume', 'Horse']) expect(usaTime(n), n).toBe(true);
  });

  it('tem os cascos no chão, ~3 m de altura e o comprimento de um cavalo de guerra', () => {
    const pe = byName.HorseLegFL.translation[1] + acc('HorseLegFL').min[1];
    expect(Math.abs(pe)).toBeLessThan(0.03);
    const topo = byName.Torso.translation[1] + byName.Head.translation[1] + byName.Plume.translation[1] + acc('Plume').max[1];
    expect(topo).toBeGreaterThan(2.7);
    expect(topo).toBeLessThan(3.4);
    const comp = acc('Horse').max[2] - acc('Horse').min[2];
    expect(comp).toBeGreaterThan(2.0);
    expect(comp).toBeLessThan(3.4);
  });

  it('a espada corre em +Y e o nó traz o repouso x 0,5 rad / z -0,1 rad do animador', () => {
    const a = acc('Sword');
    const ext = [a.max[0] - a.min[0], a.max[1] - a.min[1], a.max[2] - a.min[2]];
    expect(ext[1]).toBeGreaterThan(ext[0]);
    expect(ext[1]).toBeGreaterThan(ext[2]);
    const [qx, , qz, qw] = byName.Sword.rotation;
    expect(qw).toBeGreaterThan(0.95);
    expect(qx).toBeGreaterThan(0.15);
    expect(qz).toBeLessThan(0);
  });

  it('o braço repousa reposado da T-pose (antebraço para a frente, como segurando as rédeas)', () => {
    for (const n of ['ArmL', 'ArmR']) {
      const a = acc(n);
      expect(a.max[0] - a.min[0], n).toBeLessThan(0.9);
      expect(a.max[2], n).toBeGreaterThan(0.25); // o punho vai bem à frente do ombro
    }
  });

  it('está registrado como cavalier (chave `templar`)', () => {
    expect(GLB_MODELS.templar).toMatchObject({ root: 'Templar', type: 'cavalier', url: expect.stringContaining('models/templar.glb') });
  });
});
