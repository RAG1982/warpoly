/**
 * WarPoly — harness de benchmark de desempenho (F0-04).
 *
 * Ativado por `?bench=<cenario>` (import dinâmico em main.js; sem o parâmetro
 * este módulo nunca é carregado). Cenários: `inicial`, `combate100`, `massa300`.
 *
 * Mede 10 s após 2 s de aquecimento e publica o resultado em:
 *   - window.__bench
 *   - console.log('BENCH_RESULT', JSON)
 *   - overlay na tela
 *
 * Parâmetros opcionais de URL: `benchWarmup=<s>`, `benchDuration=<s>`.
 */

const BENCH_VERSION = 1;
const SEED = 0x5eed1234;

/** PRNG determinístico (usado só pelo bench para montar cenários). */
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Câmera fixa por cenário (alvo, zoom e ângulo). */
const CAMERAS = {
  inicial: { target: [32, 2.5, -30], zoom: 1.0, angle: Math.PI / 4 },
  combate100: { target: [0, 2.5, 0], zoom: 1.0, angle: Math.PI / 4 },
  massa300: { target: [0, 2.5, 0], zoom: 1.8, angle: Math.PI / 4 },
};

function unitTypes(gm) {
  const human = { melee: 'knight', ranged: 'archer' };
  const orc = { melee: 'grunt', ranged: 'axethrower' };
  const playerIsOrc = gm.playerFaction === 'orc';
  return { player: playerIsOrc ? orc : human, enemy: playerIsOrc ? human : orc };
}

function alive(list) {
  return list.filter((u) => !u.isDead && !u.isDying && u.state !== 'dying');
}

// ---------------------------------------------------------------------------
// Cenários
// ---------------------------------------------------------------------------

const SCENARIOS = {
  inicial: {
    description: 'Cena padrão do jogo (5 unidades por lado).',
    setup() {},
    tick() {},
  },

  combate100: {
    description: '50 unidades por lado em combate no vau central (0,0).',
    setup(gm, rng) {
      const types = unitTypes(gm);
      const perSide = 50;
      const spawnSide = (faction, cx, cz) => {
        const out = [];
        for (let i = 0; i < perSide; i++) {
          const kind = i % 10 < 7 ? 'melee' : 'ranged';
          const ang = rng() * Math.PI * 2;
          const r = Math.sqrt(rng()) * 6;
          out.push(gm.spawnUnit(types[faction][kind], cx + Math.cos(ang) * r, cz + Math.sin(ang) * r, faction));
        }
        return out;
      };
      // Jogador vem do lado da base humana (+x,-z); inimigo do lado orc (-x,+z).
      const p = spawnSide('player', 5, -5);
      const e = spawnSide('enemy', -5, 5);
      // Ordens de ataque cruzadas (par a par, com deslocamento determinístico).
      p.forEach((u, i) => u.orderAttack(e[(i * 7) % e.length]));
      e.forEach((u, i) => u.orderAttack(p[(i * 11) % p.length]));
    },
    tick(gm, rng, state) {
      // Mantém o combate: a cada 30 frames, unidades ociosas recebem um alvo vivo (escolha determinística por índice).
      state.t = (state.t || 0) + 1;
      if (state.t % 30 !== 0) return;
      const P = alive(gm.units);
      const E = alive(gm.enemies);
      if (!P.length || !E.length) return;
      P.forEach((u, i) => { if (u.state === 'idle') u.orderAttack(E[i % E.length]); });
      E.forEach((u, i) => { if (u.state === 'idle') u.orderAttack(P[i % P.length]); });
    },
  },

  massa300: {
    description: '150 unidades por lado espalhadas pelo mapa, em movimento.',
    setup(gm, rng, state) {
      const types = unitTypes(gm);
      const perSide = 150;
      const R = 50;
      state.rand = () => [(rng() * 2 - 1) * R, (rng() * 2 - 1) * R];
      for (const faction of ['player', 'enemy']) {
        for (let i = 0; i < perSide; i++) {
          const kind = i % 10 < 7 ? 'melee' : 'ranged';
          const [x, z] = state.rand();
          const u = gm.spawnUnit(types[faction][kind], x, z, faction);
          const [dx, dz] = state.rand();
          u.moveTo(dx, dz, gm);
        }
      }
    },
    tick(gm, rng, state) {
      // A cada ~1 s de frames, unidades paradas recebem novo destino aleatório (seed fixa).
      state.t = (state.t || 0) + 1;
      if (state.t % 60 !== 0) return;
      for (const u of [...gm.units, ...gm.enemies]) {
        if (u.isDead || u.isDying || u.state !== 'idle') continue;
        const [dx, dz] = state.rand();
        u.moveTo(dx, dz, gm);
      }
    },
  },
};

// ---------------------------------------------------------------------------
// Coleta de informações
// ---------------------------------------------------------------------------

function gpuInfo(renderer) {
  const info = { vendor: null, renderer: null, webgl: null };
  try {
    const gl = renderer.getContext();
    info.webgl = gl.getParameter(gl.VERSION);
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (ext) {
      info.vendor = gl.getParameter(ext.UNMASKED_VENDOR_WEBGL);
      info.renderer = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
    } else {
      info.vendor = gl.getParameter(gl.VENDOR);
      info.renderer = gl.getParameter(gl.RENDERER);
    }
  } catch (err) {
    info.error = String(err);
  }
  return info;
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

const round = (v, d = 2) => (Number.isFinite(v) ? Math.round(v * 10 ** d) / 10 ** d : v);
const avg = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);

// ---------------------------------------------------------------------------
// Overlay
// ---------------------------------------------------------------------------

function createOverlay() {
  const el = document.createElement('pre');
  el.id = 'bench-overlay';
  el.style.cssText = [
    'position:fixed', 'top:8px', 'left:8px', 'z-index:100000', 'margin:0',
    'padding:8px 10px', 'background:rgba(0,0,0,0.78)', 'color:#9f9',
    'font:12px/1.35 monospace', 'pointer-events:none', 'max-width:46vw',
    'white-space:pre-wrap', 'border:1px solid #4a4',
  ].join(';');
  document.body.appendChild(el);
  return el;
}

// ---------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------

export function startBench(app) {
  const params = new URLSearchParams(window.location.search);
  const name = params.get('bench') || 'inicial';
  const warmupS = Number(params.get('benchWarmup') || 2);
  const durationS = Number(params.get('benchDuration') || 10);
  const readyAt = performance.now(); // ms desde o início da navegação (timeOrigin)

  const overlay = createOverlay();
  const scenario = SCENARIOS[name];
  if (!scenario) {
    const msg = `Cenário de bench desconhecido: "${name}". Use: ${Object.keys(SCENARIOS).join(', ')}`;
    overlay.textContent = msg;
    const result = { ok: false, error: msg };
    window.__bench = result;
    console.log('BENCH_RESULT', JSON.stringify(result));
    return;
  }

  const gm = app.gameManager;
  const sm = app.sceneManager;
  const renderer = sm.renderer;
  const rng = mulberry32(SEED);
  const state = {};

  // 1. IA pausada para resultado estável.
  if (gm.aiDirector) gm.aiDirector.update = () => {};
  if (gm.enemyAI && gm.enemyAI !== gm.aiDirector) gm.enemyAI.update = () => {};

  // 2. Câmera fixa.
  const cam = CAMERAS[name];
  const applyCamera = () => {
    sm.cameraTarget.set(cam.target[0], cam.target[1], cam.target[2]);
    sm.zoomLevel = sm.targetZoomLevel = cam.zoom;
    sm.cameraAngle = sm.targetCameraAngle = cam.angle;
    sm.updateCamera(0);
  };
  applyCamera();

  // 3. Monta o cenário.
  const setupT0 = performance.now();
  scenario.setup(gm, rng, state);
  const setupMs = performance.now() - setupT0;

  // 4. Instrumenta gameManager.advance — só o tempo de simulação em tick fixo (F1-09), sem
  // renderUpdate (interpolação/LOD/VFX). `gm.update(delta)` (legado) chama advance internamente,
  // então basta interceptar advance para medir o "sim ms/frame" em qualquer chamador.
  const origAdvance = gm.advance.bind(gm);
  let updAcc = 0;
  let updCount = 0;
  let measuring = false;
  gm.advance = (frameDelta) => {
    scenario.tick(gm, rng, state);
    const t0 = performance.now();
    const alpha = origAdvance(frameDelta);
    if (measuring) {
      updAcc += performance.now() - t0;
      updCount++;
    }
    return alpha;
  };

  // 5. Loop de amostragem.
  const frameTimes = [];
  const calls = [];
  const tris = [];
  let firstFrameAt = null;
  let phaseStart = null;
  let last = null;
  let phase = 'warmup';

  const status = (extra = '') => {
    overlay.textContent = `BENCH ${name} · ${phase}${extra}`;
  };
  status();

  const finish = () => {
    measuring = false;
    const sorted = [...frameTimes].sort((a, b) => a - b);
    const meanFt = avg(frameTimes);
    const totalMs = frameTimes.reduce((s, v) => s + v, 0);
    const slowestCount = Math.max(1, Math.floor(sorted.length * 0.01));
    const slowest = sorted.slice(sorted.length - slowestCount);
    const mem = renderer.info.memory;
    const heap = performance.memory ? performance.memory.usedJSHeapSize : null;
    const nav = performance.getEntriesByType('navigation')[0];

    const result = {
      ok: true,
      version: BENCH_VERSION,
      scenario: name,
      description: scenario.description,
      seed: SEED,
      timestamp: new Date().toISOString(),
      warmupS,
      durationS,
      frames: frameTimes.length,
      fps: {
        avg: round(frameTimes.length / (totalMs / 1000), 1),
        p1Low: round(1000 / avg(slowest), 1), // média do 1% de frames mais lentos
        p99FrameMs: round(percentile(sorted, 99)),
        minFrameMs: round(sorted[0] || 0),
        maxFrameMs: round(sorted[sorted.length - 1] || 0),
      },
      frameTimeMs: { avg: round(meanFt), median: round(percentile(sorted, 50)) },
      // Chave JSON mantida como `gameUpdateMs` (lida por tools/bench/run-bench.mjs e
      // tools/fog-compare/profile.mjs); mede agora o tempo de `advance` — "sim ms/frame" (F1-09).
      gameUpdateMs: { avg: round(updCount ? updAcc / updCount : 0, 3), frames: updCount },
      render: {
        callsAvg: Math.round(avg(calls)),
        callsMax: calls.length ? Math.max(...calls) : 0,
        trianglesAvg: Math.round(avg(tris)),
        trianglesMax: tris.length ? Math.max(...tris) : 0,
      },
      memory: {
        geometries: mem.geometries,
        textures: mem.textures,
        programs: renderer.info.programs ? renderer.info.programs.length : null,
        jsHeapUsedMB: heap != null ? round(heap / 1048576, 1) : null,
      },
      load: {
        readyMs: Math.round(readyAt),
        firstFrameMs: firstFrameAt != null ? Math.round(firstFrameAt) : null,
        domContentLoadedMs: nav ? Math.round(nav.domContentLoadedEventEnd) : null,
        scenarioSetupMs: round(setupMs, 1),
      },
      entities: {
        playerUnits: gm.units.length,
        enemyUnits: gm.enemies.length,
        buildings: gm.buildings.length,
        sceneObjects: (() => { let n = 0; sm.scene.traverse(() => n++); return n; })(),
      },
      env: {
        gpu: gpuInfo(renderer),
        viewport: [window.innerWidth, window.innerHeight],
        drawingBuffer: [renderer.domElement.width, renderer.domElement.height],
        devicePixelRatio: window.devicePixelRatio,
        rendererPixelRatio: renderer.getPixelRatio(),
        userAgent: navigator.userAgent,
        hardwareConcurrency: navigator.hardwareConcurrency,
      },
    };

    window.__bench = result;
    console.log('BENCH_RESULT', JSON.stringify(result));
    phase = 'concluído';
    overlay.textContent =
      `BENCH ${name} · concluído\n` +
      `FPS médio ${result.fps.avg} · 1% low ${result.fps.p1Low}\n` +
      `frame ${result.frameTimeMs.avg} ms · sim ms/frame ${result.gameUpdateMs.avg} ms\n` +
      `draw calls ${result.render.callsAvg} (máx ${result.render.callsMax})\n` +
      `triângulos ${result.render.trianglesAvg.toLocaleString('pt-BR')}\n` +
      `geo ${result.memory.geometries} · tex ${result.memory.textures} · prog ${result.memory.programs}\n` +
      `heap ${result.memory.jsHeapUsedMB ?? 'n/d'} MB · load ${result.load.readyMs} ms\n` +
      `unidades ${result.entities.playerUnits}+${result.entities.enemyUnits}\n` +
      `GPU ${result.env.gpu.renderer}\n` +
      `${result.env.viewport.join('×')} @ DPR ${result.env.devicePixelRatio}`;
  };

  const loop = (now) => {
    if (firstFrameAt == null) firstFrameAt = performance.now();
    if (last == null) {
      last = now;
      phaseStart = now;
      requestAnimationFrame(loop);
      return;
    }
    const dt = now - last;
    last = now;

    if (phase === 'warmup') {
      if (now - phaseStart >= warmupS * 1000) {
        phase = 'medindo';
        phaseStart = now;
        applyCamera();
        measuring = true;
      } else {
        status(` ${((now - phaseStart) / 1000).toFixed(1)}s`);
      }
    } else if (phase === 'medindo') {
      frameTimes.push(dt);
      calls.push(renderer.info.render.calls);
      tris.push(renderer.info.render.triangles);
      if ((frameTimes.length & 15) === 0) status(` ${((now - phaseStart) / 1000).toFixed(1)}s`);
      if (now - phaseStart >= durationS * 1000) {
        finish();
        return;
      }
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
