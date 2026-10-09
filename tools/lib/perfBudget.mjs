/**
 * Orçamento de desempenho (F10-04) — lógica pura, sem navegador.
 * Usada por `tools/perf-budget.mjs` (medição) e testada em `tests/unit/perfBudget.test.js`.
 *
 * Um "relatório" (a baseline em `tests/perf/baseline.json` tem o mesmo formato) é só números:
 *
 *   { version, createdAt, commit, manifest: {...hardware/Chromium...},
 *     scenarios: { inicial: { drawCalls, fps, fpsReason? }, combate100: {...} },
 *     load:   { ms, reason? },
 *     bundle: { mainJsBytes, initialJsBytes, ...gzip, chunks: { nome: bytes } } }
 *
 * Métricas e regra de comparação (limiar padrão 10 %):
 *   - drawCalls  menor é melhor; determinístico (não depende de GPU) → sempre comparado;
 *   - load       menor é melhor; tempo até o jogo ficar pronto → comparado quando os dois lados têm o número;
 *   - fps        maior é melhor; só existe com GPU real (`fps: null` + `fpsReason` caso contrário) → comparado
 *                somente quando os dois lados têm GPU real, nunca falha por `null`;
 *   - bundle     menor é melhor; bytes do bundle principal de JS (chunk `main`) e do JS de boot.
 * "Piorar mais de 10 %" é estrito: exatamente 10 % ainda passa.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { SOFTWARE_RENDERER } from './assertGpu.mjs';

export const SCHEMA_VERSION = 1;
export const DEFAULT_THRESHOLD = 0.1;
/** Cenários do `?bench=` medidos pelo orçamento (ver src/debug/bench.js). */
export const SCENARIOS = ['inicial', 'combate100'];

/** Tolerância numérica na comparação com o limiar (evita 0.1 + ruído de ponto flutuante). */
const EPS = 1e-9;

// ---------------------------------------------------------------------------
// GPU
// ---------------------------------------------------------------------------

/** Renderer sem caracteres fora do ASCII imprimível (o Chromium devolve "Radeon™" como "Radeonâ¢"): texto estável no manifesto. */
export function normalizeRenderer(renderer) {
  return String(renderer ?? '').replace(/[^\x20-\x7e]/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Classifica a string UNMASKED_RENDERER_WEBGL. Só `hardware: true` conta como GPU real
 * (SwiftShader/llvmpipe/software e "sem WebGL" nunca servem para FPS nem para baseline).
 * @param {string|null|undefined} renderer
 * @returns {{hardware: boolean, reason: string|null}}
 */
export function classifyRenderer(renderer) {
  const r = String(renderer ?? '').trim();
  if (!r || /^desconhecido/i.test(r)) {
    return { hardware: false, reason: `WebGL sem informação de renderer (${r || 'vazio'})` };
  }
  if (SOFTWARE_RENDERER.test(r)) return { hardware: false, reason: `WebGL por software (${r})` };
  return { hardware: true, reason: null };
}

// ---------------------------------------------------------------------------
// Estatística das N execuções
// ---------------------------------------------------------------------------

/** Mediana (lista vazia → null). */
export function median(values) {
  const xs = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!xs.length) return null;
  const m = xs.length >> 1;
  return xs.length % 2 ? xs[m] : (xs[m - 1] + xs[m]) / 2;
}

/** Melhor valor da lista (`'max'` para FPS, `'min'` para tempos): ruído de CPU só piora, nunca melhora. */
export function best(values, mode) {
  const xs = values.filter(Number.isFinite);
  if (!xs.length) return null;
  return mode === 'max' ? Math.max(...xs) : Math.min(...xs);
}

// ---------------------------------------------------------------------------
// Scripts injetados na página antes do jogo (page.addInitScript) — sem tocar em src/
// ---------------------------------------------------------------------------

/**
 * Determinismo do cenário: props (flores, grama, pedras) e árvores são espalhadas com `Math.random`, e o layout muda a
 * contagem de objetos (e de draw calls, até ~8 % entre cargas). Troca `Math.random` por um PRNG (mulberry32) com semente
 * fixa antes de qualquer script da página; mesma técnica da regressão visual (tools/visual-regress.mjs).
 */
export function randomInitScript(seed) {
  return `(() => {
  let s = ${Number(seed) >>> 0} >>> 0;
  Math.random = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
})();`;
}

/**
 * Congela a simulação: o estado visual (e os draw calls) passa a depender só do cenário, não do FPS da máquina.
 *
 * `window.game` é atribuído uma vez, depois que a sessão existe; o setter troca `gameManager.simStep` por um passo
 * que NÃO FAZ NADA até o medidor chamar `window.__perfFreeze.go()` (o que ele só faz depois que o `?bench=` montou o
 * cenário) e, depois disso, executa exatamente `ticks` passos reais. Assim o cenário envelhece sempre os mesmos
 * `ticks` desde a montagem, em qualquer máquina e em qualquer ritmo de quadros (GPU a 170 FPS ou SwiftShader a 1 FPS).
 * O medidor lê `window.__perfFreeze = {ticks, applied, active, steps, error?}` para conferir.
 */
export function freezeInitScript(ticks) {
  const n = Math.max(0, Math.floor(Number(ticks)));
  return `(() => {
  let game;
  const state = { ticks: ${n}, applied: false, active: false, steps: 0, error: null, go() { state.active = true; } };
  window.__perfFreeze = state;
  Object.defineProperty(window, 'game', {
    configurable: true,
    get() { return game; },
    set(v) {
      game = v;
      try {
        const gm = v && v.gameManager;
        const step = gm.simStep.bind(gm);
        gm.simStep = (dt) => {
          if (!state.active || state.steps >= state.ticks) return;
          state.steps++;
          step(dt);
        };
        state.applied = true;
      } catch (e) {
        state.error = String(e);
      }
    }
  });
})();`;
}

// ---------------------------------------------------------------------------
// Bundle (tamanho do JS em dist/)
// ---------------------------------------------------------------------------

/** Nome do chunk sem o hash do Rollup: `three-vendor-paN-p39D.js` → `three-vendor`. */
export function chunkName(file) {
  const base = file.replace(/^.*\//, '');
  const m = /^(.*)-[A-Za-z0-9_-]{8}\.m?js$/.exec(base);
  return m ? m[1] : base.replace(/\.m?js$/, '');
}

/**
 * Lê o `index.html` do build e devolve o chunk de entrada (`<script type="module" src>`) e os chunks
 * pré-carregados (`<link rel="modulepreload" href>`), com caminhos relativos a `dist/` (`assets/x.js`).
 * Funciona com qualquer `base` (./, /, /warpoly/): só importa o trecho `assets/...js`.
 */
export function parseIndexHtml(html) {
  const asset = (url) => {
    const m = /(?:^|\/)(assets\/[^"'?#]+\.m?js)(?:[?#].*)?$/.exec(url);
    return m ? m[1] : null;
  };
  let entry = null;
  for (const tag of html.match(/<script\b[^>]*>/gi) ?? []) {
    if (!/\btype=["']module["']/i.test(tag)) continue;
    const src = /\bsrc=["']([^"']+)["']/i.exec(tag);
    const file = src && asset(src[1]);
    if (file) {
      entry = file;
      break;
    }
  }
  const preloads = [];
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    if (!/\brel=["']modulepreload["']/i.test(tag)) continue;
    const href = /\bhref=["']([^"']+)["']/i.exec(tag);
    const file = href && asset(href[1]);
    if (file && !preloads.includes(file)) preloads.push(file);
  }
  return { entry, preloads: preloads.filter((f) => f !== entry) };
}

/**
 * Tamanhos do JS de um build (`vite build`) lidos de `distDir`:
 *   mainJsBytes     chunk de entrada do index.html (o "bundle principal", porta de entrada do orçamento)
 *   initialJsBytes  entrada + chunks pré-carregados (tudo que o jogo baixa para abrir)
 *   *GzipBytes      o mesmo comprimido (gzip -9, informativo)
 *   chunks          bytes de cada .js em assets/ por nome sem hash (para apontar quem cresceu)
 */
export function readBundleStats(distDir) {
  const html = readFileSync(join(distDir, 'index.html'), 'utf8');
  const { entry, preloads } = parseIndexHtml(html);
  if (!entry) throw new Error(`index.html de ${distDir} não tem <script type="module"> apontando para assets/*.js`);

  const sizeOf = (rel) => {
    const buf = readFileSync(join(distDir, rel));
    return { bytes: buf.length, gzip: gzipSync(buf, { level: 9 }).length };
  };
  const main = sizeOf(entry);
  let initialBytes = main.bytes;
  let initialGzip = main.gzip;
  for (const f of preloads) {
    const s = sizeOf(f);
    initialBytes += s.bytes;
    initialGzip += s.gzip;
  }

  const chunks = {};
  for (const f of readdirSync(join(distDir, 'assets')).sort()) {
    if (!/\.m?js$/.test(f)) continue; // ignora .br/.gz/.css
    let name = chunkName(f);
    for (let i = 2; name in chunks; i++) name = `${chunkName(f)}#${i}`;
    chunks[name] = readFileSync(join(distDir, 'assets', f)).length;
  }
  return {
    mainJsBytes: main.bytes,
    mainJsGzipBytes: main.gzip,
    initialJsBytes: initialBytes,
    initialJsGzipBytes: initialGzip,
    chunks
  };
}

// ---------------------------------------------------------------------------
// Validação / baseline
// ---------------------------------------------------------------------------

/** Confere o formato mínimo; devolve a lista de problemas (vazia = ok). */
export function reportProblems(report) {
  const out = [];
  if (!report || typeof report !== 'object') return ['não é um objeto JSON'];
  if (report.version !== SCHEMA_VERSION) out.push(`version ${report.version} (esperado ${SCHEMA_VERSION})`);
  if (!report.scenarios || typeof report.scenarios !== 'object') out.push('falta `scenarios`');
  else {
    for (const [name, s] of Object.entries(report.scenarios)) {
      if (!s || typeof s !== 'object') out.push(`scenarios.${name} inválido`);
      else if (!(s.drawCalls > 0)) out.push(`scenarios.${name}.drawCalls ausente ou <= 0`);
      else if (s.fps === undefined) out.push(`scenarios.${name}.fps ausente (use null + fpsReason quando não medido)`);
    }
  }
  if (!report.bundle || typeof report.bundle !== 'object') out.push('falta `bundle`');
  else if (!(report.bundle.mainJsBytes > 0)) out.push('bundle.mainJsBytes ausente ou <= 0');
  return out;
}

/**
 * Parte versionável do relatório: o mesmo formato sem as amostras brutas (`samples`).
 * Só números e textos curtos; fica em poucos KB.
 */
export function toBaseline(report) {
  const copy = JSON.parse(JSON.stringify(report));
  for (const s of Object.values(copy.scenarios ?? {})) delete s.samples;
  if (copy.load) delete copy.load.samples;
  return copy;
}

// ---------------------------------------------------------------------------
// Comparador
// ---------------------------------------------------------------------------

const fmtInt = (v) => String(Math.round(v));
const fmtMs = (v) => `${Math.round(v)} ms`;
const fmtFps = (v) => `${v.toFixed(1)} fps`;
const fmtKb = (v) => `${(v / 1000).toFixed(1)} kB`;

/** Definição dos grupos de métricas: direção do "melhor" e formatação. */
export const GROUPS = {
  drawCalls: { label: 'draw calls', better: 'lower', format: fmtInt },
  load: { label: 'load', better: 'lower', format: fmtMs },
  fps: { label: 'FPS', better: 'higher', format: fmtFps },
  bundle: { label: 'bundle JS', better: 'lower', format: fmtKb }
};

const BUNDLE_METRICS = [
  ['mainJsBytes', 'bundle principal (main)'],
  ['initialJsBytes', 'JS de boot (main + pré-carregados)']
];

/** Estados que reprovam o orçamento. */
const FAILING = new Set(['regression', 'missing', 'invalid']);

/** Lista as medições comparáveis (baseline × atual) sem julgar. */
function collectSpecs(baseline, current) {
  const specs = [];
  const names = [...new Set([...Object.keys(baseline.scenarios ?? {}), ...Object.keys(current.scenarios ?? {})])];
  for (const name of names) {
    const b = baseline.scenarios?.[name];
    const c = current.scenarios?.[name];
    specs.push({
      id: `drawCalls.${name}`,
      group: 'drawCalls',
      label: `draw calls · ${name}`,
      base: b?.drawCalls,
      cur: c?.drawCalls
    });
  }
  specs.push({
    id: 'load',
    group: 'load',
    label: 'tempo de load',
    base: baseline.load?.ms,
    cur: current.load?.ms,
    baseReason: baseline.load?.reason,
    curReason: current.load?.reason
  });
  // FPS só vale se os DOIS lados foram medidos com GPU real: um número de FPS com o manifesto dizendo "software" é
  // ignorado (defesa extra; o medidor já grava `fps: null` nesses casos).
  const noGpu = (r) => (r.manifest?.gpu?.hardware === false ? `FPS ignorado: ${r.manifest.gpu.renderer ?? 'WebGL por software'} não é GPU real` : null);
  for (const name of names) {
    const b = baseline.scenarios?.[name];
    const c = current.scenarios?.[name];
    const baseSoft = noGpu(baseline);
    const curSoft = noGpu(current);
    specs.push({
      id: `fps.${name}`,
      group: 'fps',
      label: `FPS · ${name}`,
      base: baseSoft ? null : b?.fps,
      cur: curSoft ? null : c?.fps,
      baseReason: b?.fpsReason ?? baseSoft,
      curReason: c?.fpsReason ?? curSoft
    });
  }
  for (const [key, label] of BUNDLE_METRICS) {
    specs.push({
      id: `bundle.${key}`,
      group: 'bundle',
      label,
      base: baseline.bundle?.[key],
      cur: current.bundle?.[key]
    });
  }
  return specs;
}

/** Julga uma medição; devolve a linha do relatório. */
function judge(spec, threshold) {
  const g = GROUPS[spec.group];
  const row = { id: spec.id, group: spec.group, label: spec.label, baseline: null, current: null, change: null, status: 'ok', note: '' };
  const hasBase = Number.isFinite(spec.base);
  const hasCur = Number.isFinite(spec.cur);
  if (hasBase) row.baseline = spec.base;
  if (hasCur) row.current = spec.cur;

  if (!hasCur) {
    // `null` com motivo = não medido de propósito (sem GPU real, modo --ci…); sem motivo = falha de medição.
    if (spec.curReason) return { ...row, status: 'skipped', note: spec.curReason };
    if (!hasBase && spec.baseReason) return { ...row, status: 'skipped', note: `baseline: ${spec.baseReason}` };
    if (!hasBase) return { ...row, status: 'skipped', note: 'sem valor em nenhum dos lados' };
    return { ...row, status: 'missing', note: 'não medido nesta execução (a baseline tem o valor)' };
  }
  if (!hasBase) {
    if (spec.baseReason) return { ...row, status: 'skipped', note: `baseline sem este valor: ${spec.baseReason}` };
    return { ...row, status: 'new', note: 'sem baseline para comparar (regrave com --update)' };
  }
  if (spec.base <= 0) return { ...row, status: 'invalid', note: 'baseline <= 0' };

  const change = (spec.cur - spec.base) / spec.base;
  const worse = g.better === 'lower' ? change : -change; // > 0 = piorou
  row.change = change;
  if (worse > threshold + EPS) row.status = 'regression';
  else if (worse < -threshold - EPS) row.status = 'improved';
  return row;
}

/** Diferenças relevantes entre os manifestos (só importam para FPS/load). */
export function manifestDiff(a, b) {
  const diffs = [];
  if (!a || !b) return diffs;
  const major = (v) => String(v ?? '').split('.')[0];
  if (a.gpu?.renderer !== b.gpu?.renderer) diffs.push(`GPU: baseline "${a.gpu?.renderer ?? '?'}" × atual "${b.gpu?.renderer ?? '?'}"`);
  if (a.cpu !== b.cpu) diffs.push(`CPU: baseline "${a.cpu ?? '?'}" × atual "${b.cpu ?? '?'}"`);
  if (a.cores !== b.cores) diffs.push(`núcleos lógicos: baseline ${a.cores ?? '?'} × atual ${b.cores ?? '?'}`);
  if (major(a.chromium) !== major(b.chromium)) diffs.push(`Chromium: baseline ${a.chromium ?? '?'} × atual ${b.chromium ?? '?'}`);
  if (a.headless !== b.headless) diffs.push(`headless: baseline ${a.headless} × atual ${b.headless}`);
  if (JSON.stringify(a.viewport) !== JSON.stringify(b.viewport)) diffs.push(`viewport: baseline ${a.viewport} × atual ${b.viewport}`);
  return diffs;
}

/**
 * Compara o relatório atual com a baseline.
 * @param {object} baseline
 * @param {object} current
 * @param {{threshold?: number}} [opts] limiar relativo (padrão 0,10)
 * @returns {{ok: boolean, threshold: number, rows: object[], failures: object[], regressions: object[],
 *            skipped: object[], improved: object[], warnings: string[], bundleDeltas: object[]}}
 */
export function compareBudgets(baseline, current, opts = {}) {
  const threshold = opts.threshold ?? DEFAULT_THRESHOLD;
  if (!(threshold > 0)) throw new Error(`limiar inválido: ${threshold}`);
  const rows = collectSpecs(baseline, current).map((s) => judge(s, threshold));
  const failures = rows.filter((r) => FAILING.has(r.status));
  const warnings = [];

  // FPS/load só valem na mesma máquina: avisa quando foram comparados com hardware diferente.
  const timed = rows.some((r) => (r.group === 'fps' || r.group === 'load') && r.change !== null);
  if (timed) {
    const diffs = manifestDiff(baseline.manifest, current.manifest);
    if (diffs.length) {
      warnings.push(
        'FPS/load comparados com hardware ou Chromium diferente da baseline (os números podem não ser comparáveis; ' +
          'se a máquina mudou de propósito, regrave com `npm run perf -- --update`):'
      );
      for (const d of diffs) warnings.push(`  - ${d}`);
    }
  }
  if (rows.some((r) => r.status === 'improved')) {
    warnings.push('Há métricas que melhoraram mais que o limiar: regrave a baseline (`npm run perf -- --update`) para travar o ganho.');
  }

  return {
    ok: failures.length === 0,
    threshold,
    rows,
    failures,
    regressions: rows.filter((r) => r.status === 'regression'),
    skipped: rows.filter((r) => r.status === 'skipped'),
    improved: rows.filter((r) => r.status === 'improved'),
    warnings,
    bundleDeltas: chunkDeltas(baseline.bundle?.chunks, current.bundle?.chunks)
  };
}

/** Variação por chunk (maiores crescimentos primeiro), para apontar quem inflou o bundle. */
export function chunkDeltas(baseChunks = {}, curChunks = {}) {
  const names = new Set([...Object.keys(baseChunks), ...Object.keys(curChunks)]);
  return [...names]
    .map((name) => ({ name, baseline: baseChunks[name] ?? 0, current: curChunks[name] ?? 0, delta: (curChunks[name] ?? 0) - (baseChunks[name] ?? 0) }))
    .filter((d) => d.delta !== 0)
    .sort((a, b) => b.delta - a.delta);
}

// ---------------------------------------------------------------------------
// Relatório legível
// ---------------------------------------------------------------------------

const STATUS_LABEL = {
  ok: 'ok',
  improved: 'melhorou',
  regression: 'REGRESSÃO',
  skipped: 'pulado',
  new: 'novo',
  missing: 'FALTA',
  invalid: 'INVÁLIDO'
};

const pct = (v) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`;

/** Células da tabela: [métrica, baseline, atual, variação, limite, status]. */
function tableCells(result) {
  const head = ['métrica', 'baseline', 'atual', 'variação', 'limite', 'status'];
  const body = result.rows.map((r) => {
    const g = GROUPS[r.group];
    const lim = g.better === 'lower' ? `<= +${(result.threshold * 100).toFixed(0)}%` : `>= -${(result.threshold * 100).toFixed(0)}%`;
    const fmt = (v) => (v === null ? '-' : g.format(v));
    return [r.label, fmt(r.baseline), fmt(r.current), r.change === null ? '-' : pct(r.change), r.change === null ? '-' : lim, STATUS_LABEL[r.status]];
  });
  return [head, ...body];
}

/** "abc1234 sobre master d769cd7, 2026-10-09". */
function describeRun(report) {
  const base = report.base ? ` sobre master ${report.base}` : '';
  return `${report.commit ?? '?'}${base}, ${String(report.createdAt ?? '?').slice(0, 10)}`;
}

function describeManifest(m) {
  if (!m) return 'sem manifesto';
  const gpu = m.gpu?.renderer ? `${m.gpu.hardware ? 'GPU' : 'sem GPU real'}: ${m.gpu.renderer}` : 'GPU: ?';
  return `modo ${m.mode ?? '?'} · Chromium ${m.chromium ?? '?'} · ${gpu} · ${m.cpu ?? 'CPU ?'} (${m.cores ?? '?'} threads)`;
}

/**
 * Relatório de texto (ou markdown) da comparação.
 * @param {ReturnType<typeof compareBudgets>} result
 * @param {{baseline?: object, current?: object, markdown?: boolean, baselinePath?: string}} [ctx]
 * @returns {string}
 */
export function formatReport(result, ctx = {}) {
  const cells = tableCells(result);
  const lines = [];
  const limit = `${(result.threshold * 100).toFixed(0)}%`;
  const md = !!ctx.markdown;

  if (md) lines.push(`### Orçamento de desempenho (limiar ${limit})`, '');
  else lines.push(`Orçamento de desempenho (F10-04) — limiar de piora: ${limit}`);
  if (ctx.baseline) {
    lines.push(`${md ? '- ' : 'baseline: '}${ctx.baselinePath ?? 'baseline'} (${describeRun(ctx.baseline)}) — ${describeManifest(ctx.baseline.manifest)}`);
  }
  if (ctx.current) {
    const sameMachine =
      ctx.baseline &&
      ctx.baseline.manifest?.mode === ctx.current.manifest?.mode &&
      manifestDiff(ctx.baseline.manifest, ctx.current.manifest).length === 0;
    lines.push(
      `${md ? '- ' : 'atual:    '}${describeRun(ctx.current)} — ${sameMachine ? 'mesmo modo, hardware e Chromium da baseline' : describeManifest(ctx.current.manifest)}`
    );
  }
  lines.push('');

  if (md) {
    lines.push(`| ${cells[0].join(' | ')} |`, `|${cells[0].map(() => '---').join('|')}|`);
    for (const row of cells.slice(1)) lines.push(`| ${row.join(' | ')} |`);
  } else {
    const widths = cells[0].map((_, i) => Math.max(...cells.map((row) => [...row[i]].length)));
    cells.forEach((row, ri) => {
      lines.push(row.map((c, i) => (i === 0 || i === 5 ? c.padEnd(widths[i]) : c.padStart(widths[i]))).join('  ').trimEnd());
      if (ri === 0) lines.push(widths.map((w) => '-'.repeat(w)).join('  '));
    });
  }

  const notes = result.rows.filter((r) => r.note);
  if (notes.length) {
    lines.push('');
    for (const r of notes) lines.push(`${md ? '- ' : '  '}${r.label}: ${r.note}`);
  }
  for (const w of result.warnings) lines.push('', `${md ? '> ' : 'AVISO: '}${w}`);

  lines.push('');
  const checked = result.rows.filter((r) => r.change !== null).length;
  if (result.ok) {
    lines.push(`${md ? '**' : ''}OK: nenhuma métrica piorou mais de ${limit} (${checked} comparadas, ${result.skipped.length} puladas).${md ? '**' : ''}`);
  } else {
    lines.push(`${md ? '**' : ''}FALHOU: ${result.failures.length} métrica(s) reprovada(s) (piora > ${limit} ou sem medição):${md ? '**' : ''}`);
    for (const r of result.failures) {
      const g = GROUPS[r.group];
      const detail =
        r.change !== null
          ? `${g.format(r.baseline)} → ${g.format(r.current)} (${pct(r.change)})`
          : r.note;
      lines.push(`${md ? '- ' : '  - '}${r.label}: ${detail}`);
    }
    if (result.failures.some((r) => r.group === 'bundle') && result.bundleDeltas.length) {
      lines.push('', 'Chunks que mais mudaram (bytes):');
      for (const d of result.bundleDeltas.slice(0, 5)) {
        lines.push(`${md ? '- ' : '  '}${d.name}: ${d.baseline} → ${d.current} (${d.delta > 0 ? '+' : ''}${d.delta})`);
      }
    }
    lines.push('', 'Se a mudança é intencional, regrave a baseline na máquina de referência: `npm run perf -- --update`.');
  }
  return lines.join('\n');
}
