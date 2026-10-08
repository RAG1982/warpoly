import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * F9-03 — a sim e a IA não podem usar RNG/relógio não determinístico (quebraria o lockstep).
 * Comentários são ignorados. Exceções: `MatchConfig.randomSeed` (só o lobby, fora da sim) e o
 * carimbo de data do `SaveGame`.
 */
const ROOTS = ['src/sim', 'src/ai'];
const FORBIDDEN = /Math\.random\s*\(|Date\.now\s*\(|performance\.now\s*\(|new Date\s*\(/;
const ALLOW = new Map([
  ['src/sim/MatchConfig.js', /Math\.floor\(Math\.random\(\) \* 0x7fffffff\)/],
  ['src/sim/SaveGame.js', /Date\.now\s*\(/]
]);

function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.js')) out.push(p);
  }
  return out;
}

describe('sim/IA sem fontes não determinísticas (F9-03)', () => {
  it('nenhum Math.random/Date.now/performance.now fora de comentários', () => {
    const bad = [];
    for (const root of ROOTS) {
      for (const file of walk(root)) {
        const allow = ALLOW.get(file.replace(/\\/g, '/'));
        readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
          const code = line.replace(/\/\/.*$/, '').replace(/^\s*\*.*$/, '').replace(/\/\*.*?\*\//g, '');
          if (FORBIDDEN.test(code) && !(allow && allow.test(code))) bad.push(`${file}:${i + 1}: ${line.trim()}`);
        });
      }
    }
    expect(bad).toEqual([]);
  });
});
