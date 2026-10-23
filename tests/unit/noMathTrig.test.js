import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Vigia do M6-01: a simulação (src/sim, src/ai) não pode chamar funções transcendentes de Math
// diretamente, porque Math.sin/cos/atan2/hypot/... podem diferir no último bit entre motores
// (V8, SpiderMonkey, JSC) e isso causa desync no lockstep. Use src/sim/fmath.js.
// Exceções: liste aqui "caminho/relativo.js" com a justificativa (hoje nenhuma).
const EXCEPTIONS = new Set([]);

// M6-04b: src/data também entra na cadeia de determinismo, mas só os arquivos que rodam NO CLIENTE durante a partida
// (mapa gerado pela seed em `registerGeneratedMap` → generator.js). Lista explícita.
const DATA_FILES = ['src/data/maps/generator.js'];
// Ficam com Math.* em src/data, de propósito (não rodam na partida, ou não afetam o estado da sim nem o mapa jogado):
// - src/data/maps/coast/** : assador offline (tools/gen-world-map.mjs, tools/gen-campaign-maps.mjs). O JSON assado é o dado que o
//   cliente lê; a partida nunca roda o assador.
// - src/data/maps/anchors.js : `defaultAnchors`/`findLandingZone` só rodam no assador offline (tools/, coast/world.js, testes); a sim
//   importa só `ANCHOR_NAME_RE`. Convertê-lo mudou a âncora `landingZone` de camp-04 (-66,-22 → -6,-12), então fica com Math.*.
// - src/data/maps/validate.js : validação do editor e dos testes; a sim não o importa.
// - src/data/decorPlan.js e src/data/lavaRender.js : só render (world/Decorations, Lava, Water, TerrainView, AmbientFx); nada volta
//   para a sim (props não bloqueiam caminho: sem colisão em Decorations).

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCOPES = ['src/sim', 'src/ai'];
const FORBIDDEN = /\bMath\.(sin|cos|tan|asin|acos|atan|atan2|pow|hypot|exp|log)\b/;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.js')) out.push(p);
  }
  return out;
}

/** Linhas de código (sem comentários de linha inteira). */
function codeLines(src) {
  return src.split('\n').map((text, i) => ({ n: i + 1, text })).filter(({ text }) => {
    const t = text.trim();
    return !(t.startsWith('//') || t.startsWith('*') || t.startsWith('/*'));
  });
}

describe('sim/ai não chamam Math trigonométrico (M6-01)', () => {
  const files = SCOPES.flatMap((s) => walk(join(ROOT, s)));

  it('encontra os arquivos da sim e da IA', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it('nenhum Math.sin/cos/atan2/hypot/... em src/sim e src/ai (fora de exceções)', () => {
    const hits = [];
    for (const f of files) {
      const rel = relative(ROOT, f).split('\\').join('/');
      if (EXCEPTIONS.has(rel)) continue;
      for (const { n, text } of codeLines(readFileSync(f, 'utf8'))) {
        if (FORBIDDEN.test(text)) hits.push(`${rel}:${n}: ${text.trim()}`);
      }
    }
    expect(hits, `use src/sim/fmath.js em vez de Math.* nestas linhas:\n${hits.join('\n')}`).toEqual([]);
  });
});

describe('src/data convertido (M6-04b): geração de mapa no cliente', () => {
  for (const rel of DATA_FILES) {
    it(`${rel} existe e não chama Math trigonométrico`, () => {
      const src = readFileSync(join(ROOT, rel), 'utf8');
      const hits = codeLines(src).filter(({ text }) => FORBIDDEN.test(text)).map(({ n, text }) => `${rel}:${n}: ${text.trim()}`);
      expect(hits, `use src/sim/fmath.js em vez de Math.* nestas linhas:\n${hits.join('\n')}`).toEqual([]);
    });
  }
});
