import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GLB_MODELS, glbFaction } from '../../src/entities/glbModels.js';
import { UNITS } from '../../src/data/units.js';
import * as THREE from 'three';
import { UnitAnimator, ANIMATION_DURATIONS } from '../../src/animation/UnitAnimator.js';
import { ModelFactory } from '../../src/entities/ModelFactory.js';

/** Lê o bloco JSON de um .glb (sem three nem navegador). */
function glbJson(file) {
  const b = readFileSync(join(process.cwd(), 'public', 'models', file));
  return JSON.parse(b.toString('utf8', 20, 20 + b.readUInt32LE(12)));
}

describe('hero_dorian.glb (M2-20): estrutura e orçamento', () => {
  const j = glbJson('hero_dorian.glb');
  const byName = Object.fromEntries(j.nodes.map((n, i) => [n.name, { ...n, i }]));
  const parentOf = (name) => { const i = byName[name].i; const p = j.nodes.find((n) => (n.children || []).includes(i)); return p ? p.name : null; };

  it('tem os nós do tipo `cavalier` (4 patas, Torso, Head, braços, Sword) mais o Banner filho do Torso', () => {
    for (const n of ['Cavalier', 'Horse', 'HorseLegFL', 'HorseLegFR', 'HorseLegBL', 'HorseLegBR', 'Torso', 'Head', 'ArmL', 'ArmR', 'Sword', 'Banner']) expect(byName[n], n).toBeTruthy();
    expect(parentOf('Banner')).toBe('Torso');
    for (const n of ['Horse', 'HorseLegFL', 'HorseLegFR', 'HorseLegBL', 'HorseLegBR', 'Torso', 'Head', 'ArmL', 'ArmR', 'Sword']) expect(parentOf(n), n).toBe('Cavalier');
    expect(byName.Cavalier.translation).toBeUndefined(); // raiz sem transformação
    expect(j.nodes.some((n) => /shield/i.test(n.name))).toBe(false);
  });

  it('as patas têm o pivô na altura da bainha da barda e o Sword repousa a x = 0,5 rad / z = -0,1 rad como o cavalier', () => {
    for (const n of ['HorseLegFL', 'HorseLegFR', 'HorseLegBL', 'HorseLegBR']) {
      expect(byName[n].translation[1], n).toBeGreaterThan(0.3);
      expect(byName[n].translation[1], n).toBeLessThan(0.7);
    }
    const q = byName.Sword.rotation;
    expect(q).toBeTruthy();
    expect(q[0]).toBeCloseTo(0.2471, 3);
    expect(q[2]).toBeCloseTo(-0.0484, 3);
  });

  it('o Banner pivota na base da haste (translação local logo acima da cintura do Torso) e repousa sem rotação', () => {
    const t = byName.Banner.translation;
    expect(t).toBeTruthy();
    expect(t[1]).toBeLessThan(0.5);
    expect(byName.Banner.rotation).toBeUndefined(); // repouso sem rotação: o animador escreve x/z absolutos
  });

  it('respeita o orçamento: <= 20 draw calls e textura <= 512², com TeamColor', () => {
    const draws = j.meshes.reduce((s, m) => s + m.primitives.length, 0);
    expect(draws).toBeLessThanOrEqual(20);
    expect(j.images.length).toBe(1);
    expect(j.materials.map((m) => m.name).sort()).toEqual(['Atlas', 'TeamColor']);
    const usaTime = (nome) => { const n = byName[nome]; return j.meshes[n.mesh].primitives.some((p) => j.materials[p.material].name === 'TeamColor'); };
    for (const n of ['Horse', 'Torso', 'Banner']) expect(usaTime(n), n).toBe(true);   // barda, capa e pano do estandarte
    for (const n of ['Head', 'ArmL', 'ArmR', 'Sword']) expect(usaTime(n), n).toBe(false);
  });

  it('está registrado como cavalier, na facção humana, com o herói apontando para o modelo `cavalier`', () => {
    expect(GLB_MODELS.hero_dorian).toMatchObject({ root: 'Cavalier', type: 'cavalier' });
    expect(glbFaction('hero_dorian')).toBe('human');
    expect(UNITS.hero_dorian.modelOf).toBe('cavalier');
    expect(UNITS.hero_dorian.icon).toBe('ui/icons/128/unit_hero_dorian.webp');
  });
});

describe('UnitAnimator: estandarte do Marechal Dorian (`Banner`)', () => {
  function fakeDorian() {
    const root = new THREE.Group();
    root.name = 'Cavalier';
    const mk = (n, p) => { const g = new THREE.Group(); g.name = n; if (p) g.position.set(...p); return g; };
    const torso = mk('Torso', [0, 1.4, 0]);
    const banner = mk('Banner', [-0.2, 0.24, 0.02]);
    torso.add(banner);
    root.add(mk('Horse'), mk('Head', [0, 1.9, 0]), mk('ArmL', [-0.3, 1.7, 0]), mk('ArmR', [0.3, 1.7, 0]), torso);
    ModelFactory.rebindUserData(root, 'cavalier');
    return { root, banner };
  }

  it('rebindUserData acha o Banner e o animador o coloca em meshParts', () => {
    const { root, banner } = fakeDorian();
    expect(root.userData.banner).toBe(banner);
    const an = new UnitAnimator(root, 'cavalier');
    expect(an.meshParts.banner).toBe(banner);
  });

  it('balança por seno em x/z (amplitude pequena), mais vivo ao andar, e fecha o ciclo sem emenda', () => {
    const { root, banner } = fakeDorian();
    const an = new UnitAnimator(root, 'cavalier');
    an.isPlaying = true;
    an._blendT = 99;
    an.setAnimation('idle', true);
    an._blendT = 99;
    let maxIdle = 0;
    for (let t = 0; t < ANIMATION_DURATIONS.idle; t += 0.05) { an.setTime(t); maxIdle = Math.max(maxIdle, Math.abs(banner.rotation.x), Math.abs(banner.rotation.z)); }
    an.setTime(0);
    const x0 = banner.rotation.x; const z0 = banner.rotation.z;
    an.setTime(ANIMATION_DURATIONS.idle - 1e-6);
    expect(banner.rotation.x).toBeCloseTo(x0, 3);
    expect(banner.rotation.z).toBeCloseTo(z0, 3);
    an.setAnimation('walk', true);
    an._blendT = 99;
    let maxWalk = 0;
    for (let t = 0; t < ANIMATION_DURATIONS.walk; t += 0.02) { an.setTime(t); maxWalk = Math.max(maxWalk, Math.abs(banner.rotation.x), Math.abs(banner.rotation.z)); }
    expect(maxIdle).toBeGreaterThan(0.01);
    expect(maxWalk).toBeGreaterThan(maxIdle);
    expect(maxWalk).toBeLessThan(0.1);
  });
});
