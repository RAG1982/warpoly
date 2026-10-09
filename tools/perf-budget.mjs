#!/usr/bin/env node
/**
 * F10-04 · Orçamento de desempenho: mede draw calls, FPS, tempo de load e tamanho do bundle JS e compara
 * com a baseline versionada (`tests/perf/baseline.json`). Falha (exit 1) se alguma métrica piorar mais de 10 %.
 *
 *   npm run perf                          máquina COM GPU: mede tudo e compara (roda dentro do safe-run)
 *   npm run perf -- --update              regrava a baseline (GPU real obrigatória; só do estado atual do master)
 *   node tools/perf-budget.mjs --ci       runner SEM GPU (CI): draw calls + tamanho do bundle; FPS e load = null com motivo
 *   node tools/perf-budget.mjs --compare atual.json   só compara um relatório já medido (sem navegador)
 *
 * Opções: --baseline <arq>  --out <arq>  --dist <pasta do build>  --runs <n>  --threshold <0.10|10%>
 *         --timeout <ms por página>  --port <n>
 *
 * Códigos de saída: 0 ok · 1 regressão (ou métrica sem medição) · 2 erro de uso/ambiente (sem GPU, sem baseline…).
 *
 * Protocolo (ver docs/10_DEPLOY.md): build de produção servido por `vite preview`, Chromium headless 1280×720,
 * `?bench=<cenário>` (src/debug/bench.js) com `quality=high&texq=low`, uma página por vez:
 *   - draw calls: simulação congelada no tick FREEZE_TICKS (independe de FPS e de GPU → igual em CI/SwiftShader);
 *     mediana de N execuções;
 *   - FPS: cenário ao vivo (2 s de aquecimento + 10 s), melhor de N (só com GPU real);
 *   - load: `?bench=inicial` COM o preload de texturas (sem `skipPreload`), menor de N (só com GPU real);
 *   - bundle: bytes do chunk `main` e do JS de boot lidos de dist/.
 * Rode SOMENTE via safe-run quando houver navegador (`npm run perf` já faz). Sem GPU real o script nunca mede FPS
 * nem grava baseline.
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import os from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertHardwareGpu, readWebGLRenderer } from './lib/assertGpu.mjs';
import {
  DEFAULT_THRESHOLD,
  SCENARIOS,
  SCHEMA_VERSION,
  best,
  classifyRenderer,
  compareBudgets,
  formatReport,
  median,
  readBundleStats,
  reportProblems,
  toBaseline
} from './lib/perfBudget.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_BASELINE = resolve(ROOT, 'tests/perf/baseline.json');
const RESULTS_DIR = resolve(ROOT, 'tools/perf-results');

/** Protocolo de medição (registrado no manifesto da baseline). */
const PROTOCOL = {
  viewport: [1280, 720],
  /** Parâmetros fixos de URL: preset de qualidade fixo (senão a detecção de GPU muda o preset entre máquinas). */
  query: 'quality=high&texq=low',
  freezeTicks: 20,
  callsWarmupS: 1,
  callsDurationS: 2,
  fpsWarmupS: 2,
  fpsDurationS: 10,
  loadDurationS: 1
};

// ---------------------------------------------------------------------------
// Argumentos
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const o = {
    ci: false,
    update: false,
    compare: null,
    baseline: DEFAULT_BASELINE,
    out: null,
    dist: null,
    runs: null,
    threshold: DEFAULT_THRESHOLD,
    timeout: 240000,
    port: 0,
    help: false
  };
  const needValue = (flag, i) => {
    if (i + 1 >= argv.length) usageError(`${flag} precisa de um valor`);
    return argv[i + 1];
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const eq = a.indexOf('=');
    const [flag, inline] = a.startsWith('--') && eq > 0 ? [a.slice(0, eq), a.slice(eq + 1)] : [a, null];
    const val = () => {
      if (inline !== null) return inline;
      const v = needValue(flag, i);
      i++;
      return v;
    };
    switch (flag) {
      case '--ci': o.ci = true; break;
      case '--update': o.update = true; break;
      case '--help': case '-h': o.help = true; break;
      case '--compare': o.compare = resolve(val()); break;
      case '--baseline': o.baseline = resolve(val()); break;
      case '--out': o.out = resolve(val()); break;
      case '--dist': o.dist = resolve(val()); break;
      case '--runs': o.runs = Number(val()); break;
      case '--threshold': o.threshold = parseThreshold(val()); break;
      case '--timeout': o.timeout = Number(val()); break;
      case '--port': o.port = Number(val()); break;
      default: usageError(`opção desconhecida: ${a}`);
    }
  }
  if (o.runs !== null && !(Number.isInteger(o.runs) && o.runs >= 1 && o.runs <= 15)) usageError('--runs deve ser um inteiro entre 1 e 15');
  if (!(o.timeout >= 1000)) usageError('--timeout em ms (>= 1000)');
  if (o.ci && o.update) usageError('--update exige GPU real: não combine com --ci (nunca use SwiftShader como baseline)');
  return o;
}

/** `0.1`, `10` ou `10%` → 0.1. */
function parseThreshold(text) {
  const n = Number(String(text).replace('%', ''));
  if (!(n > 0)) usageError(`--threshold inválido: ${text}`);
  return String(text).includes('%') || n >= 1 ? n / 100 : n;
}

/** Erro que encerra o script com um código de saída (depois de fechar navegador, servidor e dist temporário). */
class ExitError extends Error {
  constructor(message, code = 2) {
    super(message);
    this.exitCode = code;
  }
}

function usageError(msg) {
  throw new ExitError(`${msg}\nUso: node tools/perf-budget.mjs [--ci | --update | --compare atual.json] [--baseline arq] [--out arq] [--dist pasta] [--runs n] [--threshold 10%]`);
}

// ---------------------------------------------------------------------------
// Utilitários
// ---------------------------------------------------------------------------

const log = (msg) => console.log(`[perf] ${msg}`);
const round1 = (v) => Math.round(v * 10) / 10;

function readJson(path, what) {
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch (err) {
    fail(`não consegui ler ${what} (${path}): ${err.message}`);
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    fail(`${what} (${path}) não é JSON válido: ${err.message}`);
  }
}

function fail(msg, code = 2) {
  throw new ExitError(msg, code);
}

function gitCommit() {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

function freePort() {
  return new Promise((res, rej) => {
    const srv = createServer();
    srv.on('error', rej);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => res(port));
    });
  });
}

function stamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

// ---------------------------------------------------------------------------
// Build e servidor
// ---------------------------------------------------------------------------

async function buildDist(outDir) {
  const { build } = await import('vite');
  const t0 = Date.now();
  await build({ root: ROOT, base: './', logLevel: 'warn', build: { outDir, emptyOutDir: true, reportCompressedSize: false } });
  log(`build de produção pronto em ${round1((Date.now() - t0) / 1000)} s`);
}

async function startPreview(distDir, port) {
  const { preview } = await import('vite');
  const server = await preview({
    root: ROOT,
    base: './',
    logLevel: 'warn',
    build: { outDir: distDir },
    preview: { host: '127.0.0.1', port, strictPort: true, open: false }
  });
  return { baseUrl: `http://127.0.0.1:${port}`, close: () => server.close() };
}

// ---------------------------------------------------------------------------
// Navegador
// ---------------------------------------------------------------------------

const MEMORY_ARGS = ['--js-flags=--max-old-space-size=2048', '--renderer-process-limit=1', '--disable-dev-shm-usage', '--disable-extensions'];
const GPU_ARGS = [
  '--enable-gpu',
  '--ignore-gpu-blocklist',
  '--enable-gpu-rasterization',
  '--use-angle=vulkan',
  '--enable-features=Vulkan',
  '--disable-vulkan-surface',
  '--disable-frame-rate-limit',
  '--disable-gpu-vsync',
  '--autoplay-policy=no-user-gesture-required',
  ...MEMORY_ARGS
];
// Só no modo --ci (runner sem GPU): WebGL por software, apenas para CONTAR draw calls.
const SOFTWARE_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', ...MEMORY_ARGS];

/**
 * Determinismo do cenário: props (flores, grama, pedras) e árvores são espalhadas com `Math.random`, e o layout muda a
 * contagem de objetos (e de draw calls, até ~8 % entre cargas). Troca `Math.random` por um PRNG com semente fixa
 * antes de qualquer script da página (mesma técnica da regressão visual, tools/visual-regress.mjs).
 */
const RANDOM_SEED = 0x5eed1004;
const randomInitScript = `(() => {
  let s = ${RANDOM_SEED} >>> 0;
  Math.random = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
})();`;

/**
 * Antes de qualquer lógica do jogo: congela a simulação em `ticks` passos (sem tocar em src/).
 * `window.game` é atribuído uma vez, depois que a sessão existe; o setter troca `gameManager.simStep` por um
 * passo que não faz nada a partir do tick pedido. Assim o estado visual (e os draw calls) não depende do FPS.
 */
const freezeInitScript = (ticks) => `(() => {
  let game;
  Object.defineProperty(window, 'game', {
    configurable: true,
    get() { return game; },
    set(v) {
      game = v;
      try {
        const gm = v && v.gameManager;
        const step = gm.simStep.bind(gm);
        gm.simStep = (dt) => { if (gm.currentTick < ${ticks}) step(dt); };
        window.__perfFreeze = { ticks: ${ticks}, applied: true };
      } catch (e) {
        window.__perfFreeze = { ticks: ${ticks}, applied: false, error: String(e) };
      }
    }
  });
})();`;

/**
 * Uma execução do bench numa página nova (contexto isolado, sem service worker).
 * @returns {Promise<{bench: object, tick: number|null, errors: string[], wallS: number}>}
 */
async function benchRun(browser, baseUrl, { scenario, skipPreload, warmupS, durationS, freezeTicks = null, timeout }) {
  const context = await browser.newContext({
    viewport: { width: PROTOCOL.viewport[0], height: PROTOCOL.viewport[1] },
    deviceScaleFactor: 1,
    serviceWorkers: 'block'
  });
  const errors = [];
  let abort;
  const aborted = new Promise((_, reject) => (abort = reject));
  aborted.catch(() => {});
  const onDisconnect = () => abort(new Error('o navegador desconectou (morto por OOM?)'));
  browser.on('disconnected', onDisconnect);
  try {
    const page = await context.newPage();
    page.on('crash', () => abort(new Error('a aba travou (memória?)')));
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => m.type() === 'error' && errors.push(`console.error: ${m.text()}`));
    await page.addInitScript(randomInitScript);
    if (freezeTicks !== null) await page.addInitScript(freezeInitScript(freezeTicks));
    const url = `${baseUrl}/?bench=${scenario}&${PROTOCOL.query}${skipPreload ? '&skipPreload' : ''}&benchWarmup=${warmupS}&benchDuration=${durationS}`;
    const t0 = Date.now();
    const run = async () => {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
      await page.waitForFunction(() => window.__bench, null, { timeout, polling: 250 });
      const bench = await page.evaluate(() => window.__bench);
      const tick = await page.evaluate(() => window.game?.gameManager?.currentTick ?? null);
      const freeze = await page.evaluate(() => window.__perfFreeze ?? null);
      return { bench, tick, freeze };
    };
    const { bench, tick, freeze } = await Promise.race([run(), aborted]);
    if (!bench.ok) throw new Error(`bench ${scenario} falhou: ${bench.error}`);
    if (freezeTicks !== null && (!freeze?.applied || tick !== freezeTicks)) {
      throw new Error(`a simulação não congelou no tick ${freezeTicks} (tick=${tick}, freeze=${JSON.stringify(freeze)}): o ganho de determinismo se perdeu`);
    }
    return { bench, tick, errors, wallS: round1((Date.now() - t0) / 1000) };
  } finally {
    browser.off('disconnected', onDisconnect);
    await context.close().catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Medição
// ---------------------------------------------------------------------------

async function measure(opts, baseUrl, browser, gpuInfo) {
  const runs = opts.runs ?? (opts.ci ? 2 : 3);
  const scenarios = {};
  const pageErrors = new Set();
  const note = (r) => r.errors.forEach((e) => pageErrors.add(e));

  for (const name of SCENARIOS) {
    // 1) draw calls: simulação congelada (determinístico).
    const calls = [];
    for (let i = 0; i < runs; i++) {
      const r = await benchRun(browser, baseUrl, {
        scenario: name,
        skipPreload: true,
        warmupS: PROTOCOL.callsWarmupS,
        durationS: PROTOCOL.callsDurationS,
        freezeTicks: PROTOCOL.freezeTicks,
        timeout: opts.timeout
      });
      note(r);
      calls.push(r.bench.render.callsAvg);
      log(`${name} · draw calls #${i + 1}/${runs}: ${r.bench.render.callsAvg} (máx ${r.bench.render.callsMax}; ${r.bench.entities.sceneObjects} objetos, ${r.bench.memory.geometries} geometrias; ${r.bench.frames} quadros, ${r.wallS} s)`);
    }
    const entry = { drawCalls: Math.round(median(calls)), fps: null, samples: { drawCalls: calls } };

    // 2) FPS: ao vivo, só com GPU real.
    if (opts.ci || !gpuInfo.hardware) {
      entry.fpsReason = opts.ci
        ? `modo --ci: WebGL por software (${gpuInfo.renderer}); FPS só é medido com GPU real (npm run perf)`
        : `sem GPU real: ${gpuInfo.reason}`;
    } else {
      const fps = [];
      for (let i = 0; i < runs; i++) {
        const r = await benchRun(browser, baseUrl, {
          scenario: name,
          skipPreload: true,
          warmupS: PROTOCOL.fpsWarmupS,
          durationS: PROTOCOL.fpsDurationS,
          timeout: opts.timeout
        });
        note(r);
        fps.push(r.bench.fps.avg);
        log(`${name} · FPS #${i + 1}/${runs}: ${r.bench.fps.avg} (1% low ${r.bench.fps.p1Low}, ${r.bench.frames} quadros, draw calls ao vivo ${r.bench.render.callsAvg}, ${r.wallS} s)`);
      }
      entry.fps = round1(best(fps, 'max'));
      entry.samples.fps = fps;
    }
    scenarios[name] = entry;
  }

  // 3) load: com o preload de texturas (sem skipPreload), só com GPU real.
  let load;
  if (opts.ci || !gpuInfo.hardware) {
    load = { ms: null, reason: opts.ci ? 'modo --ci: tempo de load não é comparável entre máquinas (runner sem GPU)' : `sem GPU real: ${gpuInfo.reason}` };
  } else {
    const ms = [];
    for (let i = 0; i < runs; i++) {
      const r = await benchRun(browser, baseUrl, {
        scenario: 'inicial',
        skipPreload: false,
        warmupS: 0,
        durationS: PROTOCOL.loadDurationS,
        timeout: opts.timeout
      });
      note(r);
      ms.push(r.bench.load.readyMs);
      log(`load #${i + 1}/${runs}: ${r.bench.load.readyMs} ms (navegação até o jogo pronto, com preload)`);
    }
    load = { ms: Math.round(best(ms, 'min')), samples: ms };
  }
  return { scenarios, load, runs, pageErrors: [...pageErrors] };
}

function buildManifest({ opts, browserVersion, gpuInfo, runs }) {
  let playwright = null;
  try {
    playwright = JSON.parse(readFileSync(resolve(ROOT, 'node_modules/playwright/package.json'), 'utf8')).version;
  } catch { /* sem playwright instalado */ }
  const cpus = os.cpus();
  return {
    mode: opts.ci ? 'ci' : 'gpu',
    chromium: browserVersion,
    playwright,
    gpu: { renderer: gpuInfo.renderer, hardware: gpuInfo.hardware },
    cpu: cpus[0]?.model?.trim() ?? null,
    cores: cpus.length,
    memGB: Math.round(os.totalmem() / 2 ** 30),
    os: `${os.platform()} ${os.release()} ${os.arch()}`,
    node: process.version,
    headless: true,
    viewport: PROTOCOL.viewport,
    runs,
    protocol:
      `build de produção + vite preview; ?bench=<cenário>&${PROTOCOL.query}; draw calls com sim congelada no tick ${PROTOCOL.freezeTicks} (mediana); ` +
      `FPS ao vivo ${PROTOCOL.fpsWarmupS}+${PROTOCOL.fpsDurationS} s (melhor); load sem skipPreload (menor)`
  };
}

// ---------------------------------------------------------------------------
// Saída
// ---------------------------------------------------------------------------

function printComparison(baselineReport, currentReport, opts) {
  const result = compareBudgets(baselineReport, currentReport, { threshold: opts.threshold });
  const ctx = { baseline: baselineReport, current: currentReport, baselinePath: opts.baseline.replace(`${ROOT}/`, '') };
  console.log(`\n${formatReport(result, ctx)}`);
  // Resumo do GitHub Actions (quando existir).
  if (process.env.GITHUB_STEP_SUMMARY) {
    try {
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${formatReport(result, { ...ctx, markdown: true })}\n`);
    } catch { /* sem resumo */ }
  }
  return result;
}

function loadBaseline(path) {
  if (!existsSync(path)) fail(`baseline não encontrada: ${path}\n  Gere uma numa máquina com GPU: npm run perf -- --update`);
  const baseline = readJson(path, 'a baseline');
  const problems = reportProblems(baseline);
  if (problems.length) fail(`baseline inválida (${path}):\n  - ${problems.join('\n  - ')}`);
  return baseline;
}

// ---------------------------------------------------------------------------
// Principal
// ---------------------------------------------------------------------------

let cleanups = [];
async function cleanupAll() {
  const list = cleanups;
  cleanups = [];
  for (const fn of list.reverse()) await Promise.resolve().then(fn).catch(() => {});
}
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    console.error(`\n[perf] ${sig} recebido, encerrando navegador e servidor…`);
    cleanupAll().finally(() => process.exit(130));
  });
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0].replace(/^#!.*\n/, ''));
    return 0;
  }

  // Só comparar um relatório já medido.
  if (opts.compare) {
    const baseline = loadBaseline(opts.baseline);
    const current = readJson(opts.compare, 'o relatório atual');
    const problems = reportProblems(current);
    if (problems.length) fail(`relatório atual inválido (${opts.compare}):\n  - ${problems.join('\n  - ')}`);
    return printComparison(baseline, current, opts).ok ? 0 : 1;
  }

  // Falha cedo se vai comparar e não há baseline (evita medir 3 minutos à toa).
  let baseline = null;
  if (opts.update) {
    // Baseline anterior só serve para mostrar o que mudou; se estiver ausente ou ilegível, regrava do zero.
    try {
      if (existsSync(opts.baseline)) {
        const old = JSON.parse(readFileSync(opts.baseline, 'utf8'));
        if (reportProblems(old).length === 0) baseline = old;
      }
    } catch { /* regrava do zero */ }
  } else {
    baseline = loadBaseline(opts.baseline);
  }

  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    fail('Playwright não instalado. Rode: npm ci && npx playwright install chromium');
  }

  // 1. Build (ou o dist/ já existente do CI).
  let distDir = opts.dist;
  if (distDir) {
    if (!existsSync(join(distDir, 'index.html'))) fail(`--dist ${distDir} não tem index.html (rode npm run build antes)`);
    log(`usando o build existente em ${distDir}`);
  } else {
    distDir = mkdtempSync(join(os.tmpdir(), 'warpoly-perf-dist-'));
    cleanups.push(() => rmSync(distDir, { recursive: true, force: true }));
    await buildDist(distDir);
  }
  const bundle = readBundleStats(distDir);
  log(`bundle: main ${(bundle.mainJsBytes / 1000).toFixed(1)} kB · JS de boot ${(bundle.initialJsBytes / 1000).toFixed(1)} kB (${Object.keys(bundle.chunks).length} chunks)`);

  // 2. Servidor de preview + navegador.
  const server = await startPreview(distDir, opts.port || (await freePort()));
  cleanups.push(() => server.close());
  log(`preview em ${server.baseUrl}`);
  const browser = await chromium.launch({ headless: true, args: opts.ci ? SOFTWARE_ARGS : GPU_ARGS });
  cleanups.push(() => browser.close());

  try {
    // 3. GPU: o modo normal exige hardware; --ci aceita software, mas registra e nunca mede FPS.
    const probe = await (await browser.newContext()).newPage();
    let renderer;
    if (opts.ci) {
      renderer = await readWebGLRenderer(probe);
    } else {
      try {
        await assertHardwareGpu(probe);
      } catch (err) {
        fail(`${err.message}\n  Sem GPU real não há FPS nem baseline: em runner sem GPU use \`node tools/perf-budget.mjs --ci\` (só draw calls + bundle).`);
      }
      renderer = await readWebGLRenderer(probe);
    }
    await probe.context().close();
    const gpuInfo = { renderer, ...classifyRenderer(renderer) };
    log(`Chromium ${browser.version()} · WebGL: ${renderer} (${gpuInfo.hardware ? 'GPU real' : 'software'})`);
    if (opts.ci && gpuInfo.hardware) log('aviso: --ci com GPU real: FPS e load continuam sem medição neste modo');

    // 4. Medição.
    const m = await measure(opts, server.baseUrl, browser, gpuInfo);
    const current = {
      version: SCHEMA_VERSION,
      createdAt: new Date().toISOString(),
      commit: gitCommit(),
      manifest: buildManifest({ opts, browserVersion: browser.version(), gpuInfo, runs: m.runs }),
      scenarios: m.scenarios,
      load: m.load,
      bundle
    };
    if (m.pageErrors.length) {
      log(`aviso: ${m.pageErrors.length} erro(s) de console durante a medição (não reprovam o orçamento):`);
      for (const e of m.pageErrors.slice(0, 5)) log(`  - ${e.slice(0, 200)}`);
    }

    // 5. Saída: arquivo completo (com amostras) + baseline/comparação.
    const outFile = opts.out ?? join(RESULTS_DIR, `${stamp()}.json`);
    mkdirSync(dirname(outFile), { recursive: true });
    writeFileSync(outFile, `${JSON.stringify(current, null, 2)}\n`);
    log(`resultado completo salvo em ${outFile.replace(`${ROOT}/`, '')}`);

    if (opts.update) {
      if (!current.manifest.gpu.hardware) fail('recusado: a baseline só pode ser gerada com GPU real (nunca SwiftShader/software)');
      if (baseline) printComparison(baseline, current, opts); // mostra o que mudou em relação à baseline antiga (informativo)
      mkdirSync(dirname(opts.baseline), { recursive: true });
      writeFileSync(opts.baseline, `${JSON.stringify(toBaseline(current), null, 2)}\n`);
      log(`baseline regravada em ${opts.baseline.replace(`${ROOT}/`, '')} — revise o diff e commite`);
      return 0;
    }
    return printComparison(baseline, current, opts).ok ? 0 : 1;
  } finally {
    await cleanupAll();
  }
}

main().then(
  async (code) => {
    await cleanupAll();
    process.exit(code);
  },
  async (err) => {
    await cleanupAll();
    if (err instanceof ExitError) {
      console.error(`[perf] ERRO: ${err.message}`);
      process.exit(err.exitCode);
    }
    console.error('[perf] erro inesperado:', err);
    process.exit(2);
  }
);
