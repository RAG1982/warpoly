import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * F2-08 — fronteira sim/render: as camadas puras (`src/sim`, `src/ai`, `src/data`) não podem importar
 * three.js nem camadas de apresentação/entidades-com-malha, nem tocar DOM/WebGL. É o que permite
 * `node tools/headless-match.js` (partida IA×IA em Node puro) e, no futuro, rodar a simulação num worker/servidor.
 */
const ROOT = new URL('../../src/', import.meta.url).pathname;
const PURE_DIRS = ['sim', 'ai', 'data'];
const FORBIDDEN_IMPORT = /^\s*import[^'"]*from\s+['"](three|three\/[^'"]*|(?:\.\.\/)+(?:entities|core|world|ui|render|audio|models|animation|inspector)\/[^'"]*)['"]/m;
const DOM_GLOBALS = /\b(document|window|navigator|localStorage|sessionStorage|HTMLCanvasElement|OffscreenCanvas|requestAnimationFrame|WebGLRenderer)\b/;

function listJs(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...listJs(p));
    else if (name.endsWith('.js')) out.push(p);
  }
  return out;
}

/** Código sem comentários de linha e de bloco, para não acusar menções em texto. */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

describe('camadas puras (F2-08)', () => {
  for (const dir of PURE_DIRS) {
    const files = listJs(join(ROOT, dir));
    it(`src/${dir} (${files.length} arquivos): sem three.js, sem entidades/render/UI e sem DOM`, () => {
      const offenders = [];
      for (const f of files) {
        const code = stripComments(readFileSync(f, 'utf8'));
        if (FORBIDDEN_IMPORT.test(code)) offenders.push(`${relative(ROOT, f)}: import proibido`);
        if (DOM_GLOBALS.test(code)) offenders.push(`${relative(ROOT, f)}: usa DOM/WebGL`);
      }
      expect(offenders).toEqual([]);
    });
  }

  // F2-08b/c: entidades migradas para src/sim (sem three.js; malha em src/render/*View.js).
  it('entidades de simulação migradas (Tree, ResourceDeposit, Critter, Unit, Building, Wall, Body, FogOfWar, FogGrid) não importam three.js nem usam Object3D', () => {
    const offenders = [];
    for (const name of ['Tree', 'ResourceDeposit', 'Critter', 'Unit', 'Building', 'Wall', 'Body', 'FogOfWar', 'FogGrid']) {
      const code = stripComments(readFileSync(join(ROOT, 'sim', `${name}.js`), 'utf8'));
      if (/\bTHREE\b|from\s+['"]three/.test(code)) offenders.push(`${name}.js: three.js`);
      if (/\b(scene\.(add|remove)|Object3D|ModelFactory)\b/.test(code)) offenders.push(`${name}.js: malha/cena`);
    }
    expect(offenders).toEqual([]);
  });

  it('src/sim só importa de src/sim e src/data', () => {
    const bad = [];
    for (const f of listJs(join(ROOT, 'sim'))) {
      const code = stripComments(readFileSync(f, 'utf8'));
      for (const m of code.matchAll(/from\s+['"](\.\.?\/[^'"]+)['"]/g)) {
        const target = m[1];
        if (!target.startsWith('./') && !target.startsWith('../data/')) bad.push(`${relative(ROOT, f)} → ${target}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
