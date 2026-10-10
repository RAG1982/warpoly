#!/usr/bin/env node
/**
 * F7-09 — extrai as POSES do `UnitAnimator` REAL (src/animation/UnitAnimator.js) para cada unidade com .glb
 * e grava `tools/blender/portrait_poses.json`. O Blender (render_icons.py / render_portraits.py) aplica essas
 * poses nos nós do mesmo .glb antes de renderizar: o ícone/retrato mostra exatamente a pose que o jogo exibe
 * (idle de verdade, golpe/lançamento no instante escolhido), sem reescrever fórmulas de animação em Python.
 *
 *   node tools/dump-portrait-poses.mjs            # escreve tools/blender/portrait_poses.json
 *   node tools/dump-portrait-poses.mjs --check    # só confere se o arquivo atual está em dia (exit 1 se não)
 *
 * Node puro (sem Vite/navegador/Blender): monta a hierarquia de nós a partir do JSON do .glb (nomes e TRS de
 * repouso; a malha não importa para a pose), religa `userData` com `ModelFactory.rebindUserData` e roda o animador.
 * Cada pose guarda, por nó, só o que difere do repouso: posição, quaternion (x,y,z,w), escala e visibilidade.
 */
import { register } from 'node:module';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// `src/data/maps/index.js` importa .json sem atributo (Vite aceita, Node 22 puro não).
register('./lib/jsonImportLoader.mjs', import.meta.url);

// Ruído conhecido em Node: o carregador de .glb tenta buscar URLs relativas do navegador.
const warn = console.warn.bind(console);
console.warn = (...a) => { if (typeof a[0] === 'string' && a[0].startsWith('[glbModels]')) return; warn(...a); };
const err = console.error.bind(console);
console.error = (...a) => { if (typeof a[0] === 'string' && a[0].startsWith('[glbModels]')) return; err(...a); };

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..');
const OUT = join(REPO, 'tools', 'blender', 'portrait_poses.json');

/** Instantes (progresso 0..1) amostrados do golpe ('fight', duração 1 s) — a spec do retrato escolhe um deles. */
export const FIGHT_SAMPLES = [0.15, 0.3, 0.45, 0.6, 0.75];
/** Instantes da habilidade ('cast', em laço de 1 s). */
export const CAST_SAMPLES = [0.5];
/** Instante do idle (pico da respiração = 0,5 s; 0,25 s fica entre o repouso e o pico). */
export const IDLE_TIME = 0.25;

/** Lê o bloco JSON de um .glb. */
function readGlbJson(path) {
  const buf = readFileSync(path);
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error(`${path}: não é um GLB`);
  const len = buf.readUInt32LE(12);
  return JSON.parse(buf.subarray(20, 20 + len).toString('utf8'));
}

const round = (v) => Math.round(v * 1e5) / 1e5;

async function main() {
  const check = process.argv.includes('--check');
  const THREE = await import('three');
  const { UnitAnimator, ANIMATION_DURATIONS } = await import('../src/animation/UnitAnimator.js');
  const { ModelFactory } = await import('../src/entities/ModelFactory.js');
  const { GLB_MODELS } = await import('../src/entities/glbModels.js');

  /** Hierarquia de Object3D com os nomes e o TRS de repouso do .glb (sem malhas). */
  function buildTree(gltf, rootName) {
    const nodes = gltf.nodes || [];
    const rootIdx = nodes.findIndex((n) => n.name === rootName);
    if (rootIdx < 0) throw new Error(`nó raiz ${rootName} não encontrado`);
    const mk = (idx) => {
      const n = nodes[idx];
      const o = new THREE.Object3D();
      o.name = n.name || `node${idx}`;
      if (n.matrix) {
        new THREE.Matrix4().fromArray(n.matrix).decompose(o.position, o.quaternion, o.scale);
      } else {
        if (n.translation) o.position.fromArray(n.translation);
        if (n.rotation) o.quaternion.fromArray(n.rotation);
        if (n.scale) o.scale.fromArray(n.scale);
      }
      for (const c of n.children || []) o.add(mk(c));
      return o;
    };
    return mk(rootIdx);
  }

  const snapshot = (root) => {
    const m = new Map();
    root.traverse((o) => {
      if (o === root) return;
      m.set(o.name, { p: o.position.toArray(), q: o.quaternion.toArray(), s: o.scale.toArray(), v: o.visible });
    });
    return m;
  };
  const differs = (a, b) => {
    for (let i = 0; i < 3; i++) if (Math.abs(a.p[i] - b.p[i]) > 1e-5 || Math.abs(a.s[i] - b.s[i]) > 1e-5) return true;
    for (let i = 0; i < 4; i++) if (Math.abs(a.q[i] - b.q[i]) > 1e-5) return true;
    return a.v !== b.v;
  };

  const result = {};
  for (const [key, def] of Object.entries(GLB_MODELS)) {
    if (!def.type) continue; // construções/ambiente não têm pose
    const file = join(REPO, 'public', 'models', `${key}.glb`);
    if (!existsSync(file)) continue;
    const root = buildTree(readGlbJson(file), def.root);
    ModelFactory.rebindUserData(root, def.type);
    const animator = new UnitAnimator(root, def.type);
    animator.isPlaying = true;
    animator._blendT = 99; // sem cross-fade pendente: queremos a pose crua de cada instante
    const rest = snapshot(root);

    const capture = (anim, t) => {
      animator.setAnimation(anim, true);
      animator._blendT = 99;
      animator.setTime(t * animator.getDuration());
      const cur = snapshot(root);
      const out = {};
      for (const [name, st] of cur) {
        const r = rest.get(name);
        if (r && !differs(st, r)) continue;
        out[name] = { p: st.p.map(round), q: st.q.map(round), s: st.s.map(round), v: st.v ? 1 : 0 };
      }
      return out;
    };

    const poses = { idle: capture('idle', IDLE_TIME / ANIMATION_DURATIONS.idle) };
    for (const p of FIGHT_SAMPLES) poses[`fight_${p}`] = capture('fight', p);
    for (const p of CAST_SAMPLES) poses[`cast_${p}`] = capture('cast', p);
    result[key] = { animType: def.type, poses };
  }

  const json = JSON.stringify(result);
  if (check) {
    const cur = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
    if (cur.trim() !== json.trim()) {
      console.error('portrait_poses.json desatualizado: rode node tools/dump-portrait-poses.mjs');
      process.exit(1);
    }
    console.log('portrait_poses.json em dia');
    return;
  }
  writeFileSync(OUT, json + '\n');
  const nodes = Object.values(result).reduce((s, u) => s + Object.values(u.poses).reduce((a, p) => a + Object.keys(p).length, 0), 0);
  console.log(`poses de ${Object.keys(result).length} modelos (${nodes} nós) -> ${OUT} (${(json.length / 1024).toFixed(1)} KB)`);
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
