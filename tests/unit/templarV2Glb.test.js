import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as THREE from 'three';
import { GLB_MODELS, glbFaction } from '../../src/entities/glbModels.js';
import { ModelFactory } from '../../src/entities/ModelFactory.js';
import { UnitAnimator, ANIMATION_DURATIONS } from '../../src/animation/UnitAnimator.js';

/** Lê o bloco JSON de um .glb (sem three nem navegador). */
function glbJson(file) {
  const b = readFileSync(join(process.cwd(), 'public', 'models', file));
  return JSON.parse(b.toString('utf8', 20, 20 + b.readUInt32LE(12)));
}

describe('templar_v2.glb (Paladino): estrutura e orçamento', () => {
  const j = glbJson('templar_v2.glb');
  const byName = Object.fromEntries(j.nodes.map((n, i) => [n.name, { ...n, i }]));
  const parentOf = (name) => { const i = byName[name].i; const p = j.nodes.find((n) => (n.children || []).includes(i)); return p ? p.name : null; };
  const acc = (nome) => j.accessors[j.meshes[byName[nome].mesh].primitives[0].attributes.POSITION];

  it('tem os nós do tipo `cavalier` e os do cavalo articulado; o cavaleiro fica aninhado no Torso', () => {
    for (const n of ['Templar', 'Horse', 'HorseLegFL', 'HorseLegFR', 'HorseLegBL', 'HorseLegBR', 'HorseHead', 'HorseTail', 'Torso', 'Head', 'Plume', 'Cape', 'ArmL', 'ArmR', 'Sword']) {
      expect(byName[n], n).toBeTruthy();
    }
    for (const n of ['Horse', 'HorseLegFL', 'HorseLegFR', 'HorseLegBL', 'HorseLegBR', 'HorseHead', 'HorseTail', 'Torso']) expect(parentOf(n), n).toBe('Templar');
    for (const n of ['Head', 'ArmL', 'ArmR', 'Cape']) expect(parentOf(n), n).toBe('Torso');
    expect(parentOf('Plume')).toBe('Head');
    expect(parentOf('Sword')).toBe('ArmR');
    expect(byName.Templar.translation).toBeUndefined(); // raiz sem transformação
    expect(j.skins).toBeUndefined();
    expect(j.animations).toBeUndefined();
    // as mãos abertas só serviram de gabarito do corte do pulso: não vão para o jogo
    expect(byName.HandL).toBeUndefined();
    expect(byName.HandR).toBeUndefined();
  });

  it('respeita o orçamento: <= 20 draw calls, textura 512² (WebP) e TeamColor na capa, na pluma e na gualdrapa', () => {
    const draws = j.meshes.reduce((s, m) => s + m.primitives.length, 0);
    expect(draws).toBeLessThanOrEqual(20);
    expect(j.images.length).toBe(1);
    expect(j.images[0].mimeType).toBe('image/webp');
    expect(j.materials.map((m) => m.name).sort()).toEqual(['Atlas', 'TeamColor']);
    const usaTime = (nome) => j.meshes[byName[nome].mesh].primitives.some((p) => j.materials[p.material].name === 'TeamColor');
    for (const n of ['Cape', 'Plume', 'Horse']) expect(usaTime(n), n).toBe(true);
  });

  it('tem os cascos no chão e a altura do Templário antigo (~3 m) com o comprimento de um cavalo de guerra', () => {
    const pe = byName.HorseLegFL.translation[1] + acc('HorseLegFL').min[1];
    expect(Math.abs(pe)).toBeLessThan(0.03);
    const topo = byName.Torso.translation[1] + byName.Head.translation[1] + byName.Plume.translation[1] + acc('Plume').max[1];
    expect(topo).toBeGreaterThan(2.9);
    expect(topo).toBeLessThan(3.4);
    const comp = acc('Horse').max[2] - acc('Horse').min[2];
    expect(comp).toBeGreaterThan(2.0);
    expect(comp).toBeLessThan(3.2);
  });

  it('a espada corre em +Y (lâmina para cima) e o nó traz o repouso x 0,5 rad / z -0,1 rad do animador', () => {
    const a = acc('Sword');
    const ext = [a.max[0] - a.min[0], a.max[1] - a.min[1], a.max[2] - a.min[2]];
    expect(ext[1]).toBeGreaterThan(ext[0]);
    expect(ext[1]).toBeGreaterThan(ext[2]);
    const [qx, , qz, qw] = byName.Sword.rotation;
    expect(qw).toBeGreaterThan(0.95);
    expect(qx).toBeGreaterThan(0.15);
    expect(qz).toBeLessThan(0);
  });

  it('o braço repousa baixo: o ArmL/ArmR (reposados da T-pose na malha) não passam de ~1 m do ombro', () => {
    for (const n of ['ArmL', 'ArmR']) {
      const a = acc(n);
      expect(a.max[0] - a.min[0], n).toBeLessThan(0.9);
      expect(a.min[1], n).toBeLessThan(-0.2); // o punho fica bem abaixo do ombro
    }
  });

  it('está registrado como cavalier humano; o templar antigo segue como reserva', () => {
    expect(GLB_MODELS.templar_v2).toMatchObject({ root: 'Templar', type: 'cavalier', url: expect.stringContaining('templar_v2.glb') });
    expect(glbFaction('templar_v2')).toBe('human');
    expect(GLB_MODELS.templar).toMatchObject({ root: 'Templar', type: 'cavalier', url: expect.stringContaining('models/templar.glb') });
  });
});

/** Modelo falso com a hierarquia do Paladino (o animador só lê nomes e transformações). */
function fakePaladin() {
  const root = new THREE.Group();
  root.name = 'Templar';
  const mk = (name, x, y, z, pai = root) => { const g = new THREE.Group(); g.name = name; g.position.set(x, y, z); pai.add(g); return g; };
  const horse = mk('Horse', 0, 0, 0);
  const legs = [mk('HorseLegFL', -0.22, 0.6, 0.7), mk('HorseLegFR', 0.22, 0.6, 0.7), mk('HorseLegBL', -0.2, 0.6, -0.6), mk('HorseLegBR', 0.2, 0.6, -0.6)];
  const horseHead = mk('HorseHead', 0, 1.47, 0.86);
  const horseTail = mk('HorseTail', 0, 1.0, -0.82);
  const torso = mk('Torso', 0, 1.95, 0.25);
  const head = mk('Head', 0, 0.7, -0.18, torso);
  const plume = mk('Plume', 0, 0.18, 0, head);
  const cape = mk('Cape', 0, 0.6, -0.36, torso);
  const armL = mk('ArmL', -0.58, 0.47, -0.24, torso);
  const armR = mk('ArmR', 0.58, 0.47, -0.24, torso);
  const sword = mk('Sword', 0.04, -0.2, 0.2, armR);
  sword.rotation.set(0.5, 0, -0.1);
  ModelFactory.rebindUserData(root, 'cavalier');
  return { root, horse, legs, horseHead, horseTail, torso, head, plume, cape, armL, armR, sword };
}

describe('Paladino: cavalo articulado no UnitAnimator', () => {
  it('rebindUserData acha o cavalo articulado; os cavaleiros sem esses nós não ganham nada', () => {
    const p = fakePaladin();
    expect(p.root.userData.horseHead).toBe(p.horseHead);
    expect(p.root.userData.horseTail).toBe(p.horseTail);
    expect(p.root.userData.horseBody).toBe(p.horse);
    expect(p.root.userData.cape).toBe(p.cape);
    const an = new UnitAnimator(p.root, 'cavalier');
    expect(an.meshParts.horseHead).toBe(p.horseHead);
    const velho = new THREE.Group();
    const leg = (n) => { const g = new THREE.Group(); g.name = n; velho.add(g); };
    ['HorseLegFL', 'HorseLegFR', 'HorseLegBL', 'HorseLegBR', 'Torso'].forEach(leg);
    ModelFactory.rebindUserData(velho, 'cavalier');
    expect(velho.userData.horseHead).toBeFalsy();
    expect(new UnitAnimator(velho, 'cavalier').meshParts.horseHead).toBeNull();
  });

  it('todas as animações rodam sem NaN e o repouso volta exato (reset por quadro)', () => {
    const p = fakePaladin();
    const an = new UnitAnimator(p.root, 'cavalier');
    const todos = [p.horse, ...p.legs, p.horseHead, p.horseTail, p.torso, p.head, p.plume, p.cape, p.armL, p.armR, p.sword];
    const repouso = todos.map((o) => [o.position.toArray(), o.rotation.toArray().slice(0, 3)]);
    for (const nome of Object.keys(ANIMATION_DURATIONS)) {
      an.setAnimation(nome, true);
      for (let k = 0; k < 20; k++) {
        an.setTime((k / 20) * ANIMATION_DURATIONS[nome]);
        todos.forEach((o) => {
          expect(o.position.toArray().every(Number.isFinite), `${nome} ${o.name} pos`).toBe(true);
          expect(o.rotation.toArray().slice(0, 3).every(Number.isFinite), `${nome} ${o.name} rot`).toBe(true);
        });
      }
    }
    an.setAnimation('idle', true);
    an.resetTransforms();
    todos.forEach((o, i) => {
      expect(o.position.toArray()).toEqual(repouso[i][0]);
    });
  });

  it('no passo: trote em diagonais, corpo sobe e desce duas vezes por passada, cabeça, cauda e capa se mexem; ciclo sem emenda', () => {
    const p = fakePaladin();
    const an = new UnitAnimator(p.root, 'cavalier');
    an.setAnimation('walk', true);
    const dur = ANIMATION_DURATIONS.walk;
    let ymin = Infinity; let ymax = -Infinity; let nod = 0; let tail = 0; let cape = 0;
    for (let k = 0; k < 64; k++) {
      an.setTime((k / 64) * dur);
      const [fl, fr, bl, br] = p.legs;
      expect(fl.rotation.x).toBeCloseTo(br.rotation.x, 6);   // diagonal FL + BR
      expect(fr.rotation.x).toBeCloseTo(bl.rotation.x, 6);   // diagonal FR + BL
      expect(fl.rotation.x * fr.rotation.x).toBeLessThanOrEqual(1e-9); // diagonais em oposição
      ymin = Math.min(ymin, p.horse.position.y); ymax = Math.max(ymax, p.horse.position.y);
      nod = Math.max(nod, Math.abs(p.horseHead.rotation.x - 0.03));
      tail = Math.max(tail, Math.abs(p.horseTail.rotation.z));
      cape = Math.max(cape, p.cape.rotation.x);
      expect(p.torso.position.y - 1.95).toBeCloseTo(p.horse.position.y, 6); // a cintura acompanha o corpo do cavalo
    }
    expect(ymax - ymin).toBeGreaterThan(0.03);
    expect(nod).toBeGreaterThan(0.04);
    expect(tail).toBeGreaterThan(0.08);
    expect(cape).toBeGreaterThan(0.2);
    an.setTime(0);
    const a0 = p.horseHead.rotation.x;
    an.setTime(dur - 1e-6);
    expect(p.horseHead.rotation.x).toBeCloseTo(a0, 3);
  });

  it('no golpe o cavalo empina (corpo gira em torno dos cascos traseiros) e levanta as patas dianteiras; o tronco acompanha', () => {
    const p = fakePaladin();
    const an = new UnitAnimator(p.root, 'cavalier');
    an.setAnimation('fight', true);
    an.setTime(0.3);        // fim do preparo
    expect(p.horse.rotation.x).toBeLessThan(-0.05);
    expect(p.torso.rotation.x).toBeLessThan(-0.05);
    expect(p.horseHead.rotation.x).toBeLessThan(-0.1);
    expect(p.legs[0].rotation.x).toBeLessThan(-0.3);   // dianteira esquerda levantada para a frente
    expect(p.legs[2].rotation.x).toBeCloseTo(0, 6);     // as traseiras ficam plantadas
    expect(p.torso.position.y).toBeGreaterThan(1.95 - 0.1);
    an.setTime(0.95);       // recuperação: de volta ao repouso
    expect(Math.abs(p.horse.rotation.x)).toBeLessThan(0.02);
  });

  it('na morte os joelhos cedem e o cavalo afunda; sem os nós novos o cavalier continua igual', () => {
    const p = fakePaladin();
    const an = new UnitAnimator(p.root, 'cavalier');
    an.setAnimation('die', true);
    an.setTime(0.5);
    expect(p.horseHead.rotation.x).toBeGreaterThan(0.3);
    expect(p.horse.position.y).toBeLessThan(-0.1);
    expect(p.legs[0].rotation.x).toBeLessThan(-0.5);
  });
});
