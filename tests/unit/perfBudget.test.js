import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import {
  DEFAULT_THRESHOLD,
  SCHEMA_VERSION,
  best,
  chunkDeltas,
  chunkName,
  classifyRenderer,
  compareBudgets,
  formatReport,
  freezeInitScript,
  manifestDiff,
  median,
  normalizeRenderer,
  parseIndexHtml,
  randomInitScript,
  readBundleStats,
  reportProblems,
  toBaseline
} from '../../tools/lib/perfBudget.mjs';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const GPU = 'ANGLE (AMD, Vulkan 1.4.318 (AMD Radeon RX 7600 XT (RADV NAVI33)), radv)';
const SWIFTSHADER = 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)';

/** Relatório sintético no mesmo formato da baseline. */
function makeReport(over = {}) {
  return {
    version: SCHEMA_VERSION,
    createdAt: '2026-10-09T12:00:00.000Z',
    commit: 'abc1234',
    manifest: {
      mode: 'gpu',
      chromium: '153.0.8010.12',
      gpu: { renderer: GPU, hardware: true },
      cpu: 'Xeon',
      cores: 28,
      headless: true,
      viewport: [1280, 720]
    },
    scenarios: {
      inicial: { drawCalls: 1000, fps: 200 },
      combate100: { drawCalls: 2000, fps: 100 }
    },
    load: { ms: 1000 },
    bundle: {
      mainJsBytes: 400000,
      initialJsBytes: 2000000,
      chunks: { main: 400000, 'three-vendor': 760000, 'models-human': 700000 }
    },
    ...over
  };
}

/** Cópia profunda do relatório base com ajustes. */
function variant(fn) {
  const r = JSON.parse(JSON.stringify(makeReport()));
  fn(r);
  return r;
}

const row = (result, id) => result.rows.find((r) => r.id === id);

describe('compareBudgets · limiar de 10 %', () => {
  it('relatório idêntico passa sem regressões', () => {
    const r = compareBudgets(makeReport(), makeReport());
    expect(r.ok).toBe(true);
    expect(r.failures).toEqual([]);
    expect(r.threshold).toBe(DEFAULT_THRESHOLD);
    expect(row(r, 'drawCalls.inicial').status).toBe('ok');
  });

  it('draw calls: exatamente +10 % passa; um acima do limiar reprova', () => {
    const at = compareBudgets(makeReport(), variant((c) => (c.scenarios.inicial.drawCalls = 1100)));
    expect(row(at, 'drawCalls.inicial').status).toBe('ok');
    expect(at.ok).toBe(true);

    const over = compareBudgets(makeReport(), variant((c) => (c.scenarios.inicial.drawCalls = 1101)));
    expect(row(over, 'drawCalls.inicial').status).toBe('regression');
    expect(over.ok).toBe(false);
    expect(over.regressions.map((x) => x.id)).toEqual(['drawCalls.inicial']);
  });

  it('o limiar é exato também com números "feios" (sem erro de ponto flutuante)', () => {
    const base = makeReport();
    base.scenarios.combate100.drawCalls = 3204;
    const ok = compareBudgets(base, variant((c) => (c.scenarios.combate100.drawCalls = 3524.4)));
    expect(row(ok, 'drawCalls.combate100').status).toBe('ok'); // 3204 * 1.1 = 3524.4
    const no = compareBudgets(base, variant((c) => (c.scenarios.combate100.drawCalls = 3525)));
    expect(row(no, 'drawCalls.combate100').status).toBe('regression');
  });

  it('o limiar é configurável', () => {
    const cur = variant((c) => (c.scenarios.inicial.drawCalls = 1060));
    expect(compareBudgets(makeReport(), cur).ok).toBe(true);
    expect(compareBudgets(makeReport(), cur, { threshold: 0.05 }).ok).toBe(false);
    expect(() => compareBudgets(makeReport(), cur, { threshold: 0 })).toThrow(/limiar/);
  });

  it('melhora acima do limiar passa, é marcada e sugere regravar a baseline', () => {
    const r = compareBudgets(makeReport(), variant((c) => (c.scenarios.inicial.drawCalls = 700)));
    expect(r.ok).toBe(true);
    expect(row(r, 'drawCalls.inicial').status).toBe('improved');
    expect(r.warnings.join('\n')).toMatch(/regrave a baseline/);
  });

  it('load: +10 % passa, +10,1 % reprova', () => {
    expect(compareBudgets(makeReport(), variant((c) => (c.load.ms = 1100))).ok).toBe(true);
    const r = compareBudgets(makeReport(), variant((c) => (c.load.ms = 1101)));
    expect(row(r, 'load').status).toBe('regression');
    expect(r.ok).toBe(false);
  });

  it('FPS: queda de exatamente 10 % passa; abaixo disso reprova; subir nunca reprova', () => {
    const at = compareBudgets(makeReport(), variant((c) => (c.scenarios.combate100.fps = 90)));
    expect(row(at, 'fps.combate100').status).toBe('ok');
    const down = compareBudgets(makeReport(), variant((c) => (c.scenarios.combate100.fps = 89.9)));
    expect(row(down, 'fps.combate100').status).toBe('regression');
    expect(down.ok).toBe(false);
    const up = compareBudgets(makeReport(), variant((c) => (c.scenarios.combate100.fps = 150)));
    expect(row(up, 'fps.combate100').status).toBe('improved');
    expect(up.ok).toBe(true);
  });
});

describe('compareBudgets · FPS e load ausentes (sem GPU real)', () => {
  /** Atual medido num runner sem GPU: fps/load = null com motivo. */
  const ciCurrent = () =>
    variant((c) => {
      c.manifest = { mode: 'ci', chromium: '153.0.8010.12', gpu: { renderer: SWIFTSHADER, hardware: false } };
      for (const s of Object.values(c.scenarios)) {
        s.fps = null;
        s.fpsReason = 'modo --ci (WebGL por software): FPS não medido';
      }
      c.load = { ms: null, reason: 'modo --ci: load não é comparável com a baseline' };
    });

  it('fps: null não falha: vira "pulado" e o motivo aparece no relatório', () => {
    const r = compareBudgets(makeReport(), ciCurrent());
    expect(r.ok).toBe(true);
    expect(row(r, 'fps.inicial').status).toBe('skipped');
    expect(row(r, 'fps.inicial').note).toMatch(/FPS não medido/);
    expect(row(r, 'load').status).toBe('skipped');
    expect(r.skipped.map((x) => x.id)).toEqual(['load', 'fps.inicial', 'fps.combate100']);
    const text = formatReport(r);
    expect(text).toMatch(/FPS · inicial: modo --ci/);
    expect(text).toMatch(/OK:/);
  });

  it('sem GPU, draw calls e bundle continuam valendo', () => {
    const cur = ciCurrent();
    cur.scenarios.inicial.drawCalls = 1200;
    const r = compareBudgets(makeReport(), cur);
    expect(r.ok).toBe(false);
    expect(r.failures.map((x) => x.id)).toEqual(['drawCalls.inicial']);

    const big = ciCurrent();
    big.bundle.mainJsBytes = 440001;
    expect(compareBudgets(makeReport(), big).failures.map((x) => x.id)).toEqual(['bundle.mainJsBytes']);
  });

  it('baseline sem FPS (null com motivo) também pula em vez de falhar', () => {
    const base = variant((b) => {
      b.scenarios.inicial.fps = null;
      b.scenarios.inicial.fpsReason = 'baseline gerada sem GPU';
    });
    const r = compareBudgets(base, makeReport());
    expect(row(r, 'fps.inicial').status).toBe('skipped');
    expect(r.ok).toBe(true);
  });

  it('valor ausente SEM motivo é falha de medição (não passa em silêncio)', () => {
    const cur = variant((c) => {
      delete c.scenarios.inicial.fps; // esqueceram de medir/anotar o motivo
    });
    const r = compareBudgets(makeReport(), cur);
    expect(row(r, 'fps.inicial').status).toBe('missing');
    expect(r.ok).toBe(false);

    const noScenario = variant((c) => delete c.scenarios.combate100);
    expect(compareBudgets(makeReport(), noScenario).ok).toBe(false);
  });

  it('cenário novo sem baseline é só informado; baseline inválida (0) reprova', () => {
    const cur = variant((c) => (c.scenarios.massa300 = { drawCalls: 5000, fps: null, fpsReason: 'x' }));
    const r = compareBudgets(makeReport(), cur);
    expect(row(r, 'drawCalls.massa300').status).toBe('new');
    expect(r.ok).toBe(true);

    const zero = variant((b) => (b.scenarios.inicial.drawCalls = 0));
    expect(row(compareBudgets(zero, makeReport()), 'drawCalls.inicial').status).toBe('invalid');
  });
});

describe('compareBudgets · tamanho do bundle', () => {
  it('bundle principal: +10 % passa; acima reprova e aponta o chunk que cresceu', () => {
    const at = compareBudgets(makeReport(), variant((c) => (c.bundle.mainJsBytes = 440000)));
    expect(row(at, 'bundle.mainJsBytes').status).toBe('ok');

    const cur = variant((c) => {
      c.bundle.mainJsBytes = 440001;
      c.bundle.chunks.main = 440001;
      c.bundle.chunks.novo = 5000;
    });
    const r = compareBudgets(makeReport(), cur);
    expect(row(r, 'bundle.mainJsBytes').status).toBe('regression');
    expect(r.ok).toBe(false);
    expect(r.bundleDeltas[0]).toMatchObject({ name: 'main', delta: 40001 });
    expect(r.bundleDeltas.map((d) => d.name)).toContain('novo');
    const text = formatReport(r);
    expect(text).toMatch(/FALHOU/);
    expect(text).toMatch(/bundle principal \(main\)/);
    expect(text).toMatch(/main: 400000 → 440001 \(\+40001\)/);
  });

  it('JS de boot (main + pré-carregados) também é vigiado: crescer em outro chunk não escapa', () => {
    const cur = variant((c) => (c.bundle.initialJsBytes = 2200001));
    const r = compareBudgets(makeReport(), cur);
    expect(r.failures.map((x) => x.id)).toEqual(['bundle.initialJsBytes']);
  });

  it('bundle menor passa', () => {
    expect(compareBudgets(makeReport(), variant((c) => (c.bundle.mainJsBytes = 300000))).ok).toBe(true);
  });
});

describe('avisos de hardware', () => {
  it('FPS/load comparados com GPU/CPU diferentes geram aviso; draw calls sozinhos não', () => {
    const other = variant((c) => {
      c.manifest.gpu.renderer = 'ANGLE (NVIDIA, RTX)';
      c.manifest.cpu = 'Ryzen';
    });
    const r = compareBudgets(makeReport(), other);
    expect(r.warnings.join('\n')).toMatch(/hardware ou Chromium diferente/);
    expect(r.warnings.join('\n')).toMatch(/GPU: baseline/);
    expect(r.warnings.join('\n')).toMatch(/CPU: baseline "Xeon" × atual "Ryzen"/);

    const ci = variant((c) => {
      c.manifest.gpu = { renderer: SWIFTSHADER, hardware: false };
      for (const s of Object.values(c.scenarios)) {
        s.fps = null;
        s.fpsReason = 'sem GPU';
      }
      c.load = { ms: null, reason: 'sem GPU' };
    });
    expect(compareBudgets(makeReport(), ci).warnings).toEqual([]);
  });

  it('manifestDiff compara só a versão maior do Chromium', () => {
    const a = { chromium: '153.0.8010.12', cores: 4 };
    expect(manifestDiff(a, { chromium: '153.0.9999.1', cores: 4 })).toEqual([]);
    expect(manifestDiff(a, { chromium: '154.0.1.0', cores: 4 })).toHaveLength(1);
  });
});

describe('formatReport', () => {
  it('texto: tabela alinhada, limite por métrica e veredito', () => {
    const cur = variant((c) => (c.scenarios.inicial.drawCalls = 1500));
    const r = compareBudgets(makeReport(), cur);
    const text = formatReport(r, { baseline: makeReport(), current: cur, baselinePath: 'tests/perf/baseline.json' });
    expect(text).toMatch(/limiar de piora: 10%/);
    expect(text).toMatch(/draw calls · inicial\s+1000\s+1500\s+\+50\.0%\s+<= \+10%\s+REGRESSÃO/);
    expect(text).toMatch(/FPS · combate100.*>= -10%/);
    expect(text).toMatch(/FALHOU: 1 métrica\(s\) reprovada\(s\)/);
    expect(text).toMatch(/npm run perf -- --update/);
  });

  it('markdown: tabela com pipes para o resumo do GitHub Actions', () => {
    const r = compareBudgets(makeReport(), makeReport());
    const md = formatReport(r, { markdown: true });
    expect(md).toMatch(/^### Orçamento de desempenho/);
    expect(md).toMatch(/\| métrica \| baseline \| atual \| variação \| limite \| status \|/);
    expect(md).toMatch(/\*\*OK:/);
  });
});

describe('GPU, estatística e utilitários', () => {
  it('classifyRenderer: só GPU real conta; SwiftShader/llvmpipe/sem WebGL não', () => {
    expect(classifyRenderer(GPU)).toEqual({ hardware: true, reason: null });
    expect(classifyRenderer(SWIFTSHADER).hardware).toBe(false);
    expect(classifyRenderer('llvmpipe (LLVM 17.0.6, 256 bits)').hardware).toBe(false);
    expect(classifyRenderer('Mesa softpipe').hardware).toBe(false);
    expect(classifyRenderer('desconhecido (sem WebGL)').hardware).toBe(false);
    expect(classifyRenderer(null).hardware).toBe(false);
    expect(classifyRenderer('').reason).toMatch(/sem informação/);
  });

  it('normalizeRenderer tira caracteres fora do ASCII e espaços repetidos', () => {
    expect(normalizeRenderer('ANGLE (AMD, Vulkan (AMD Radeonâ¢ RX 7600 XT))')).toBe('ANGLE (AMD, Vulkan (AMD Radeon RX 7600 XT))');
    expect(normalizeRenderer('ANGLE (AMD, Vulkan (AMD Radeon\u2122  RX 7600 XT))')).toBe('ANGLE (AMD, Vulkan (AMD Radeon RX 7600 XT))');
    expect(normalizeRenderer(null)).toBe('');
  });

  it('median e best ignoram valores inválidos', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
    expect(median([NaN, 5, null])).toBe(5);
    expect(best([100, 120, 90], 'max')).toBe(120);
    expect(best([1500, 1200, 1800], 'min')).toBe(1200);
    expect(best([], 'min')).toBeNull();
  });

  it('chunkName remove o hash do Rollup (inclusive com "-" dentro do hash)', () => {
    expect(chunkName('assets/main-Dk3wyr-3.js')).toBe('main');
    expect(chunkName('assets/three-vendor-paN-p39D.js')).toBe('three-vendor');
    expect(chunkName('assets/models-human-Ci4MHYhP.js')).toBe('models-human');
    expect(chunkName('assets/modulepreload-polyfill-P2Xu9kJm.js')).toBe('modulepreload-polyfill');
    expect(chunkName('assets/semhash.js')).toBe('semhash');
  });

  it('chunkDeltas ordena os maiores crescimentos primeiro e ignora o que não mudou', () => {
    const d = chunkDeltas({ a: 10, b: 20, c: 5 }, { a: 10, b: 50, d: 7 });
    expect(d.map((x) => [x.name, x.delta])).toEqual([['b', 30], ['d', 7], ['c', -5]]);
  });
});

describe('scripts injetados na página (determinismo)', () => {
  /** Executa o script num contexto isolado com um `window` falso, como o addInitScript faria na página. */
  const inPage = (script, win = {}) => {
    const ctx = vm.createContext({ window: win });
    vm.runInContext(script, ctx);
    return { ctx, win };
  };

  it('randomInitScript: mesma semente = mesma sequência, valores em [0,1), semente diferente muda', () => {
    const seq = (seed) => {
      const { ctx } = inPage(randomInitScript(seed));
      return vm.runInContext('Array.from({ length: 50 }, () => Math.random())', ctx);
    };
    const a = seq(0x5eed1004);
    expect(seq(0x5eed1004)).toEqual(a);
    expect(a.every((v) => v >= 0 && v < 1)).toBe(true);
    expect(new Set(a).size).toBe(50);
    expect(seq(7)).not.toEqual(a);
  });

  it('freezeInitScript: a simulação para exatamente no tick pedido, qualquer que seja o ritmo de quadros', () => {
    const { win } = inPage(freezeInitScript(20));
    const gm = {
      currentTick: 0,
      executados: 0,
      simStep() {
        this.currentTick++; // como GameManager.simStep: o contador sobe no começo do passo
        this.executados++;
      }
    };
    win.game = { gameManager: gm }; // main.js atribui window.game depois de criar a sessão
    for (let i = 0; i < 500; i++) gm.simStep(0.05);
    expect(gm.currentTick).toBe(20);
    expect(gm.executados).toBe(20);
    expect(win.__perfFreeze).toEqual({ ticks: 20, applied: true });
    expect(win.game.gameManager).toBe(gm); // o getter devolve o mesmo objeto
  });

  it('freezeInitScript: tick 0 não executa nenhum passo; sem gameManager registra applied:false com o erro', () => {
    const zero = inPage(freezeInitScript(0));
    const gm = { currentTick: 0, simStep() { this.currentTick++; } };
    zero.win.game = { gameManager: gm };
    gm.simStep(0.05);
    expect(gm.currentTick).toBe(0);

    const broken = inPage(freezeInitScript(20));
    broken.win.game = { gameManager: null };
    expect(broken.win.__perfFreeze.applied).toBe(false);
    expect(broken.win.__perfFreeze.error).toMatch(/TypeError/);
  });
});

describe('bundle: leitura do dist/', () => {
  const INDEX = `<!doctype html><html><head>
<script>if (!/[?&](play)(=|&|$)/.test(location.search)) document.documentElement.classList.add('wp-menu');</script>
<script type="module" crossorigin src="__BASE__assets/main-Dk3wyr-3.js"></script>
<link rel="modulepreload" crossorigin href="__BASE__assets/modulepreload-polyfill-P2Xu9kJm.js">
<link rel="modulepreload" crossorigin href="__BASE__assets/three-vendor-paN-p39D.js">
<link rel="stylesheet" crossorigin href="__BASE__assets/main-o7pkNvnz.css">
</head><body></body></html>`;

  it('parseIndexHtml acha entrada e pré-carregados com qualquer base', () => {
    for (const base of ['./', '/', '/warpoly/']) {
      const p = parseIndexHtml(INDEX.replaceAll('__BASE__', base));
      expect(p.entry).toBe('assets/main-Dk3wyr-3.js');
      expect(p.preloads).toEqual(['assets/modulepreload-polyfill-P2Xu9kJm.js', 'assets/three-vendor-paN-p39D.js']);
    }
    expect(parseIndexHtml('<html></html>')).toEqual({ entry: null, preloads: [] });
  });

  it('readBundleStats soma entrada + pré-carregados e lista os chunks sem hash (ignora .br/.gz/.css)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'warpoly-perf-test-'));
    try {
      mkdirSync(join(dir, 'assets'));
      writeFileSync(join(dir, 'index.html'), INDEX.replaceAll('__BASE__', './'));
      writeFileSync(join(dir, 'assets/main-Dk3wyr-3.js'), 'a'.repeat(1000));
      writeFileSync(join(dir, 'assets/modulepreload-polyfill-P2Xu9kJm.js'), 'b'.repeat(200));
      writeFileSync(join(dir, 'assets/three-vendor-paN-p39D.js'), 'c'.repeat(5000));
      writeFileSync(join(dir, 'assets/lazy-AAAAAAAA.js'), 'd'.repeat(300)); // não pré-carregado
      writeFileSync(join(dir, 'assets/main-Dk3wyr-3.js.br'), 'x');
      writeFileSync(join(dir, 'assets/main-o7pkNvnz.css'), 'y');
      const s = readBundleStats(dir);
      expect(s.mainJsBytes).toBe(1000);
      expect(s.initialJsBytes).toBe(1000 + 200 + 5000);
      expect(s.mainJsGzipBytes).toBeGreaterThan(0);
      expect(s.mainJsGzipBytes).toBeLessThan(100); // 'aaaa…' comprime muito
      expect(s.chunks).toEqual({ main: 1000, 'modulepreload-polyfill': 200, 'three-vendor': 5000, lazy: 300 });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('dist sem entrada em assets/ dá erro claro', () => {
    const dir = mkdtempSync(join(tmpdir(), 'warpoly-perf-test-'));
    try {
      writeFileSync(join(dir, 'index.html'), '<html></html>');
      expect(() => readBundleStats(dir)).toThrow(/index\.html/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('formato do relatório', () => {
  it('reportProblems aceita o relatório válido e lista os defeitos', () => {
    expect(reportProblems(makeReport())).toEqual([]);
    expect(reportProblems(null)).toEqual(['não é um objeto JSON']);
    const bad = makeReport({ version: 99 });
    delete bad.bundle;
    bad.scenarios.inicial.drawCalls = 0;
    bad.scenarios.combate100.fps = undefined;
    const problems = reportProblems(bad).join('\n');
    expect(problems).toMatch(/version 99/);
    expect(problems).toMatch(/falta `bundle`/);
    expect(problems).toMatch(/scenarios\.inicial\.drawCalls/);
    expect(problems).toMatch(/scenarios\.combate100\.fps ausente/);
  });

  it('toBaseline tira as amostras brutas e não altera o original', () => {
    const rep = makeReport();
    rep.scenarios.inicial.samples = { drawCalls: [1, 2], fps: [3] };
    rep.load.samples = [1, 2, 3];
    const base = toBaseline(rep);
    expect(base.scenarios.inicial.samples).toBeUndefined();
    expect(base.load.samples).toBeUndefined();
    expect(base.scenarios.inicial.drawCalls).toBe(1000);
    expect(rep.scenarios.inicial.samples).toBeDefined();
  });
});

describe('tests/perf/baseline.json (versionada)', () => {
  const path = join(ROOT, 'tests/perf/baseline.json');
  const raw = () => readFileSync(path, 'utf8');
  const load = () => JSON.parse(raw());

  it('é pequena (só números) e tem o formato esperado', () => {
    expect(statSync(path).size).toBeLessThan(8 * 1024);
    expect(reportProblems(load())).toEqual([]);
    expect(Object.keys(load().scenarios)).toEqual(['inicial', 'combate100']);
    expect(raw()).not.toMatch(/"samples"/);
  });

  it('foi gerada com GPU real (nunca SwiftShader/software) e traz o manifesto', () => {
    const baseline = load();
    expect(baseline.manifest.gpu.hardware).toBe(true);
    expect(classifyRenderer(baseline.manifest.gpu.renderer).hardware).toBe(true);
    expect(baseline.manifest.chromium).toMatch(/^\d+\./);
    expect(baseline.manifest.cpu).toBeTruthy();
    for (const s of Object.values(baseline.scenarios)) {
      expect(s.drawCalls).toBeGreaterThan(0);
      expect(s.fps).toBeGreaterThan(0);
    }
    expect(baseline.load.ms).toBeGreaterThan(0);
  });

  it('a baseline passa contra ela mesma', () => {
    expect(compareBudgets(load(), load()).ok).toBe(true);
  });
});

describe('CLI: --compare (sem navegador)', { timeout: 30000 }, () => {
  /** Roda `node tools/perf-budget.mjs --compare ...` com arquivos temporários. */
  function run(baseline, current) {
    const dir = mkdtempSync(join(tmpdir(), 'warpoly-perf-cli-'));
    try {
      const b = join(dir, 'baseline.json');
      const c = join(dir, 'current.json');
      writeFileSync(b, JSON.stringify(baseline));
      writeFileSync(c, typeof current === 'string' ? current : JSON.stringify(current));
      return spawnSync(process.execPath, ['tools/perf-budget.mjs', '--compare', c, '--baseline', b], {
        cwd: ROOT,
        encoding: 'utf8',
        env: { ...process.env, GITHUB_STEP_SUMMARY: '' }
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  it('exit 0 quando nada piorou além do limiar', () => {
    const r = run(makeReport(), variant((c) => (c.scenarios.inicial.drawCalls = 1100)));
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/OK: nenhuma métrica piorou mais de 10%/);
  });

  it('exit 1 em regressão, com a métrica no relatório', () => {
    const r = run(makeReport(), variant((c) => (c.scenarios.combate100.drawCalls = 2300)));
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/FALHOU/);
    expect(r.stdout).toMatch(/draw calls · combate100/);
  });

  it('exit 2 (não 0, não 1) quando o arquivo atual é inválido', () => {
    const r = run(makeReport(), '{ isto não é json');
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/não é JSON válido|inválid/i);
  });
});
