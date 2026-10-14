#!/usr/bin/env node
/**
 * F7-08: verificação do áudio de produção no navegador (sem ouvir nada: logs, contadores e renderização offline).
 *   bash tools/safe-run.sh --timeout 400 -- node tools/audio-check.mjs
 *
 * 1. Automação fica MUDA por padrão: sem `?audio=`, depois de clicar, nenhum AudioContext é criado. Num navegador comum
 *    (`navigator.webdriver` falso) e sem `?audio=` o contexto também só nasce no primeiro clique, no nível do preset.
 * 2. Com `?audio=med`: o AudioContext NÃO existe no carregamento e nasce no primeiro clique (log "[WarPoly áudio] …").
 * 3. Seleção/ordem falam (contador de falas), uma pequena batalha gera efeitos e intensidade de combate (música muda).
 *    Cena visível (PR #38): com a câmera longe da batalha nenhum efeito posicional chega ao motor, e os que chegam estão
 *    dentro do frustum (conferido com as matrizes da câmera real, sem usar `attenuation.js`). Ambiência e música seguem o
 *    tileset e a facção (`?tileset=…&faction=…`: 4 tilesets, 2 facções).
 * 4. Renderização OFFLINE (OfflineAudioContext, sem saída de som) de música (4 faixas × 3 variações, volume máximo),
 *    ambiência, fala (com o ducking da música), todas as receitas de efeito e pisos de pior caso: pico/RMS por cenário, para
 *    conferir mixagem e limitador (nada passa de 1,0, nem 25 vozes no mesmo instante com tudo no volume máximo).
 * Falha com `pageerror` ou `console.error`. Chromium com GPU real (assertHardwareGpu) e `--mute-audio` (nada sai no alto-falante).
 */
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { assertHardwareGpu, readWebGLRenderer } from './lib/assertGpu.mjs';

const PORT = 5247;
const vite = await createServer({ server: { port: PORT, strictPort: true, host: '127.0.0.1' }, logLevel: 'warn', clearScreen: false });
await vite.listen();
const browser = await chromium.launch({
  headless: true,
  args: ['--use-angle=vulkan', '--enable-features=Vulkan', '--enable-gpu', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
    '--js-flags=--max-old-space-size=2048', '--renderer-process-limit=1', '--disable-dev-shm-usage', '--mute-audio']
});
let failed = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'OK   ' : 'FALHA'} ${name} ${extra}`); if (!ok) failed++; };
const base = `http://127.0.0.1:${PORT}`;
let gpuLogged = false;

/** `human`: finge um navegador comum (navigator.webdriver falso) em vez de automação. */
async function openGame(query, errs, logs, { human = false } = {}) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  if (human) await page.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => false }); });
  page.on('pageerror', (e) => errs.push(`pageerror: ${e}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errs.push(`console.error: ${m.text()}`);
    if (m.text().includes('[WarPoly áudio]')) logs.push(`${m.type()}: ${m.text()}`);
  });
  await page.goto(`${base}/?skipPreload&texq=low&play${query}`);
  await assertHardwareGpu(page);
  if (!gpuLogged) { gpuLogged = true; console.log(`     GPU: ${await readWebGLRenderer(page)} | Chromium ${browser.version()}`); }
  await page.waitForFunction('window.game && window.game.gameManager && window.game.inputManager && window.game.sound', null, { timeout: 90000 });
  await page.waitForTimeout(1200);
  return page;
}

// ---------------------------------------------------------------------------------------------------------------------
// Funções que rodam DENTRO da página (autossuficientes: o Playwright as serializa).
// ---------------------------------------------------------------------------------------------------------------------

/** Espiões da checagem de cena visível: toda chamada de `sound.playSfx` com posição e todo evento da sim com posição, com o NDC pela câmera real. */
const installSceneProbe = async () => {
  const { EVT } = await import('/src/sim/events.js');
  const { AUDIO_SCENE } = await import('/src/audio/audioConfig.js');
  const gm = window.game.gameManager;
  const sm = gm.sceneManager;
  const sound = window.game.sound;
  // clip = projeção × visão × ponto (matrizes do three.js, colunas-maiores); NDC = clip.xy / clip.w
  const ndc = (pos) => {
    const P = sm.camera.projectionMatrix.elements;
    const V = sm.camera.matrixWorldInverse.elements;
    const x = pos.x, y = typeof pos.y === 'number' ? pos.y : 0, z = pos.z;
    const vx = V[0] * x + V[4] * y + V[8] * z + V[12];
    const vy = V[1] * x + V[5] * y + V[9] * z + V[13];
    const vz = V[2] * x + V[6] * y + V[10] * z + V[14];
    const cx = P[0] * vx + P[4] * vy + P[8] * vz + P[12];
    const cy = P[1] * vx + P[5] * vy + P[9] * vz + P[13];
    const cw = P[3] * vx + P[7] * vy + P[11] * vz + P[15];
    return { w: cw, x: cx / cw, y: cy / cw };
  };
  const probe = { phase: 1, margin: AUDIO_SCENE.margin, calls: [], globals: [], events: [] };
  window.__audioProbe = probe;
  const orig = sound.playSfx.bind(sound);
  sound.playSfx = (name, opts) => {
    if (opts && opts.pos) {
      const n = ndc(opts.pos);
      probe.calls.push({ phase: probe.phase, name, w: n.w, x: n.x, y: n.y, margin: opts.margin ?? null });
    } else probe.globals.push({ phase: probe.phase, name });
    return orig(name, opts);
  };
  const types = [EVT.MELEE_HIT, EVT.PROJECTILE_FIRED, EVT.PROJECTILE_HIT, EVT.UNIT_DIED, EVT.EXPLOSION, EVT.WORKER_CHOP, EVT.WORKER_MINE, EVT.WORKER_HAMMER, EVT.BUILDING_DESTROYED];
  for (const t of types) {
    gm.events.on(t, (p) => {
      const pos = p.pos || p.from;
      if (!pos) return;
      const n = ndc(pos);
      probe.events.push({ phase: probe.phase, type: t, w: n.w, x: n.x, y: n.y });
    }, true);
  }
};

/** 8 × 8 (Aliança × Horda) perto do Centro do jogador local; com `focus`, a câmera vai para lá. Devolve o centro da batalha. */
const spawnBattle = (focus) => {
  const gm = window.game.gameManager;
  const hq = gm.buildings.find((b) => b.ownerId === 0);
  const cx = hq.mesh.position.x + 14, cz = hq.mesh.position.z + 14;
  if (focus) gm.sceneManager.cameraTarget.set(cx, 0, cz);
  const mine = [], theirs = [];
  for (let i = 0; i < 8; i++) {
    mine.push(gm.spawnUnit(i % 2 ? 'archer' : 'knight', cx - 2, cz - 6 + i * 1.6, 0).id);
    theirs.push(gm.spawnUnit(i % 2 ? 'axethrower' : 'grunt', cx + 2, cz - 6 + i * 1.6, 1).id);
  }
  gm.issue({ type: 'attackMove', playerId: 0, unitIds: mine, x: cx + 3, z: cz });
  gm.issue({ type: 'attackMove', playerId: 1, unitIds: theirs, x: cx - 3, z: cz });
  return { cx, cz };
};

/** Resumo por fase da checagem de cena visível. "Fora" = além de NDC 1,7 (nenhuma margem, nem a de 0,25, chega lá). */
const summarizeScene = () => {
  const p = window.__audioProbe;
  const lim = (m) => 1 + 2 * (m ?? p.margin);
  const sum = (phase) => {
    const calls = p.calls.filter((c) => c.phase === phase);
    const bad = calls.filter((c) => !(c.w > 0) || Math.abs(c.x) > lim(c.margin) + 0.01 || Math.abs(c.y) > lim(c.margin) + 0.01);
    const ev = p.events.filter((e) => e.phase === phase);
    const outside = ev.filter((e) => !(e.w > 0) || Math.abs(e.x) > 1.7 || Math.abs(e.y) > 1.7);
    return { events: ev.length, eventsOutsideFrustum: outside.length, positionalCalls: calls.length, callsOutsideFrustum: bad.length, globalCalls: p.globals.filter((g) => g.phase === phase).length };
  };
  const names = {};
  for (const c of p.calls) names[c.name] = (names[c.name] || 0) + 1;
  return { cameraOnBattle: sum(1), cameraAway: sum(2), sfxNames: names };
};

/** Renderização offline: mede pico/RMS e devolve linhas { group, name, peak, rmsDb, over } (+ notas numéricas). */
const offlineRender = async () => {
  const { AudioEngine } = await import('/src/audio/AudioEngine.js');
  const { SFX } = await import('/src/audio/sfxRecipes.js');
  const { LINES, VOICE_PROFILES } = await import('/src/audio/speech/speechLines.js');
  const { TRACK_FAMILIES, VARIANTS_PER_FAMILY } = await import('/src/audio/music/musicScores.js');
  const SR = 44100;
  /** pico, RMS (dBFS) e quantas amostras passam de 1,0, no intervalo [t0, t1] s. */
  const stat = (buf, t0, t1) => {
    let peak = 0, sum = 0, n = 0, over = 0;
    for (let ch = 0; ch < buf.numberOfChannels; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = Math.round(t0 * SR); i < Math.min(d.length, Math.round(t1 * SR)); i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; if (a > 1) over++; sum += d[i] * d[i]; n++; }
    }
    return { peak: +peak.toFixed(3), over, rmsDb: +(20 * Math.log10(Math.sqrt(sum / Math.max(1, n)) + 1e-9)).toFixed(1) };
  };
  const run = async (seconds, setup, level = 'high', volumes = null) => {
    const ctx = new OfflineAudioContext(2, Math.round(SR * seconds), SR);
    const clock = { t: 0 };
    const proxy = new Proxy(ctx, { get(t, p) { if (p === 'currentTime') return clock.t; const v = t[p]; return typeof v === 'function' ? v.bind(t) : v; } });
    const eng = new AudioEngine({ ctx: proxy, level, volumes, timers: null });
    const ret = setup(eng, clock);
    for (let t = 0; t < seconds; t += 0.15) { clock.t = t; eng.tick(); }
    const buf = await ctx.startRendering();
    return { buf, eng, ret };
  };
  const rows = [];
  const add = (group, name, s) => rows.push({ group, name, ...s });
  const notes = {};
  const sayLine = { key: 'h.soldier.order.0', ph: LINES['h.soldier'].order[0].ph, voice: VOICE_PROFILES.h_soldier };
  const MAX = { master: 1, music: 1, sfx: 1, voice: 1 };

  // --- música (volume padrão): 4 faixas; o início tem o crossfade a partir da música do menu, então mede a partir de 3 s
  for (const [id, faction, combat] of [['human_peace', 'human', false], ['human_combat', 'human', true], ['orc_peace', 'orc', false], ['orc_combat', 'orc', true]]) {
    const { buf } = await run(12, (e) => { e.beginMatch({ faction, tilesetId: 'verdejante' }); if (combat) for (let i = 0; i < 6; i++) e.noteCombat(1); });
    add('musica', `musica ${id}`, stat(buf, 3, 12));
  }
  // --- ambiência por tileset (música muda, à noite)
  for (const ts of ['verdejante', 'inverno', 'devastadas', 'pantano']) {
    const { buf } = await run(9, (e) => { e.setVolumes({ music: 0 }, true); e.sceneProbe = () => ({ timeOfDay: 'night' }); e.beginMatch({ faction: 'human', tilesetId: ts }); });
    add('ambiencia', `ambiencia ${ts}`, stat(buf, 4, 9));
  }
  // --- fala: mede só a janela da frase (a janela de 2,5 s tem silêncio no fim e diluía o RMS em ~3,5 dB)
  {
    const { buf, ret } = await run(2.5, (e, c) => { e.setVolumes({ music: 0 }, true); c.t = 0.1; return e.speak(sayLine); });
    notes.speechDur = +ret.toFixed(2);
    add('fala', 'fala (soldado, volume padrão)', stat(buf, 0.11, 0.11 + ret));
  }
  {
    const only = { ...MAX, music: 0 }; // só a fala (o construtor liga a música do menu se o volume dela não for 0)
    const { buf, ret } = await run(2.5, (e, c) => { e.setVolumes(only, true); c.t = 0.1; return e.speak(sayLine); }, 'high', only);
    add('fala', 'fala (soldado, volume máximo)', stat(buf, 0.11, 0.11 + ret));
  }
  // --- música × fala: a música sem e com o ducking (a voz fica muda só para medir a música) na mesma janela da frase
  {
    const T0 = 6;
    const W0 = T0 + 0.25, W1 = T0 + 0.01 + notes.speechDur; // pula os primeiros 0,25 s (ataque do ducking)
    const music = (e) => { e.beginMatch({ faction: 'human', tilesetId: 'verdejante' }); e.setVolumes({ sfx: 0 }, true); }; // sfx 0 cala a ambiência
    const plain = await run(10, (e) => music(e));
    add('mix', 'música sem ducking (janela da frase)', stat(plain.buf, W0, W1));
    const ducked = await run(10, (e, c) => {
      music(e);
      c.t = T0; e.speak(sayLine);
      e.buses.voice.gain.cancelScheduledValues(0); e.buses.voice.gain.value = 0;
    });
    add('mix', 'música sob a fala (ducking, voz muda)', stat(ducked.buf, W0, W1));
    const both = await run(10, (e, c) => { music(e); c.t = T0; e.speak(sayLine); });
    add('mix', 'música + fala juntas (como no jogo)', stat(both.buf, W0, W1));
  }
  // --- efeitos principais (volume padrão)
  for (const name of ['chop', 'sword', 'bow', 'explosion', 'alarm', 'victory', 'select', 'collapse']) {
    const { buf } = await run(1.8, (e, c) => { e.setVolumes({ music: 0 }, true); c.t = 0.05; e.playSfx(name, {}); });
    add('sfx', `sfx ${name} (volume padrão)`, stat(buf, 0, 1.8));
  }
  // --- música no volume MÁXIMO: 4 famílias × todas as variações (a faixa é forçada no tocador, sem o diretor)
  for (const id of TRACK_FAMILIES) {
    for (let v = 0; v < VARIANTS_PER_FAMILY; v++) {
      const { buf } = await run(8, (e) => { e.music.play(id, { variant: v, force: true, fade: 0.01 }); }, 'high', { ...MAX, sfx: 0, voice: 0 });
      add('musica-max', `música ${id} v${v} (volume máximo)`, stat(buf, 2, 8));
    }
  }
  // --- TODAS as receitas de efeito (e as variantes que mudam o som) no volume máximo, uma depois da outra
  {
    const jobs = [];
    for (const name of Object.keys(SFX)) {
      if (name === 'metalHit') jobs.push([name, { variant: 'steel' }], [name, { variant: 'iron' }]);
      else if (name === 'cast') for (const v of ['burst', 'ring', 'beam', 'aura']) jobs.push([name, { variant: v }]);
      else if (name === 'explosion') jobs.push([name, { size: 0.2 }], [name, { size: 1 }]);
      else jobs.push([name, {}]);
    }
    const slots = [];
    let t = 0.2;
    for (const [name] of jobs) { slots.push(t); t += SFX[name].dur + 0.5; }
    const refused = [];
    const { buf } = await run(t + 0.3, (e, c) => {
      e.setVolumes({ ...MAX, music: 0 }, true);
      jobs.forEach(([name, opts], i) => { c.t = slots[i]; if (!e.playSfx(name, { ...opts, priority: 3 })) refused.push(name); });
    }, 'high', { ...MAX, music: 0 });
    notes.recipes = jobs.length;
    notes.recipesRefused = refused;
    jobs.forEach(([name, opts], i) => {
      const tag = opts.variant ? ` ${opts.variant}` : opts.size !== undefined ? ` size ${opts.size}` : '';
      add('sfx-max', `sfx ${name}${tag}`, stat(buf, slots[i], slots[i] + SFX[name].dur + 0.4));
    });
  }
  // --- piores casos para o limitador
  {
    // golpes espaçados de 30 ms: música de combate + 30 efeitos/s + fala + explosões, tudo no volume máximo
    const { buf } = await run(8, (e, c) => {
      e.setVolumes(MAX, true);
      e.beginMatch({ faction: 'orc', tilesetId: 'devastadas' });
      for (let i = 0; i < 8; i++) e.noteCombat(1);
      for (let k = 0; k < 240; k++) {
        c.t = 0.5 + k * 0.03;
        e.playSfx(['sword', 'bow', 'arrowHit', 'death', 'stoneHit', 'explosion'][k % 6], { priority: 1 + (k % 3), pos: { x: (k % 7) * 3, z: (k % 5) * 3 } });
      }
      c.t = 1; e.speak({ key: 'o.soldier.order.0', ph: LINES['o.soldier'].order[0].ph, voice: VOICE_PROFILES.o_soldier });
    });
    add('pior', 'pior caso: golpes a cada 30 ms, tudo no máximo', stat(buf, 1, 8));
  }
  const loud = ['explosion', 'collapse', 'shipSink', 'mineStone', 'chop', 'metalHit', 'stoneHit', 'axeHit', 'treeFall', 'mineGold', 'hammer', 'catapult', 'bolt',
    'cast', 'buildPlace', 'anvil', 'bow', 'arrowHit', 'victoryFanfareOrc', 'victory', 'alarm', 'buildComplete', 'defeat', 'sword', 'death'];
  // vários efeitos + uma fala começam no MESMO instante (o AudioEvents despacha todos os eventos de um tick de uma vez): o compressor
  // sozinho não segura (silêncio antes = compressor sem redução de ganho = pior caso). Sem música = nem a do menu que o construtor liga.
  const together = async (music, level, volumes0) => {
    const volumes = music ? volumes0 : { ...volumes0, music: 0 };
    const { buf } = await run(8, (e, c) => {
      e.setVolumes(volumes, true);
      if (music) { e.beginMatch({ faction: 'orc', tilesetId: 'devastadas' }); e.music.play('orc_combat', { variant: 2, force: true, fade: 0.01 }); }
      for (const name of loud) { c.t = 4; e.playSfx(name, { priority: 3, variant: name === 'cast' ? 'ring' : undefined, size: 1 }); }
      c.t = 4; e.speak({ key: 'o.soldier.order.0', ph: LINES['o.soldier'].order[0].ph, voice: VOICE_PROFILES.o_soldier });
    }, level, volumes);
    return stat(buf, 4, 8);
  };
  const DEFAULT_VOL = { master: 1, music: 0.25, sfx: 0.5, voice: 0.8 };
  add('pior', `pior caso: ${loud.length} efeitos + fala no mesmo instante, música de combate, tudo no máximo`, await together(true, 'high', MAX));
  add('pior', `pior caso: ${loud.length} efeitos + fala no mesmo instante, sem música, tudo no máximo`, await together(false, 'high', MAX));
  add('pior', `pior caso: ${loud.length} efeitos + fala no mesmo instante, música de combate, nível med e volumes padrão`, await together(true, 'med', DEFAULT_VOL));
  add('pior', `pior caso: ${loud.length} efeitos + fala no mesmo instante, sem música, nível med e volumes padrão`, await together(false, 'med', DEFAULT_VOL));
  return { rows, notes };
};

// ---------------------------------------------------------------------------------------------------------------------
try {
  const errs = [];
  const logs = [];

  // ------------------------------------------------------------------ 1. automação muda por padrão
  {
    const page = await openGame('', errs, logs);
    const before = await page.evaluate(() => window.game.sound.stats());
    check('automação: nível de áudio "off" por padrão', before.level === 'off', JSON.stringify(before));
    await page.mouse.click(640, 400);
    await page.waitForTimeout(400);
    const after = await page.evaluate(() => ({ init: window.game.sound.initialized, ctx: !!window.game.sound.ctx, ...window.game.sound.stats() }));
    check('automação: o clique NÃO cria AudioContext', !after.init && !after.ctx, `(nível ${after.level})`);
    await page.close();
  }

  // ------------------------------------------------------------------ 1b. navegador comum (sem automação), sem ?audio=
  {
    const page = await openGame('', errs, logs, { human: true });
    const pre = await page.evaluate(() => ({ webdriver: navigator.webdriver, init: window.game.sound.initialized, ctx: window.game.sound.ctx, level: window.game.sound.level }));
    check('navegador comum sem ?audio=: nível do preset (texq=low => low) e nenhum AudioContext antes do clique', pre.webdriver === false && pre.level === 'low' && !pre.init && pre.ctx === null, JSON.stringify(pre));
    await page.mouse.click(640, 400);
    await page.waitForTimeout(600);
    const post = await page.evaluate(() => ({ init: window.game.sound.initialized, ...window.game.sound.stats() }));
    check('navegador comum sem ?audio=: o AudioContext nasce no primeiro clique e está "running"', post.init && post.state === 'running' && post.level === 'low', `(${post.state}, ${post.sampleRate} Hz, nível ${post.level})`);
    await page.close();
  }

  // ------------------------------------------------------------------ 2/3. ?audio=med: AudioContext só após o clique
  {
    const page = await openGame('&audio=med', errs, logs);
    const pre = await page.evaluate(() => ({ init: window.game.sound.initialized, ctx: window.game.sound.ctx, level: window.game.sound.level, quality: window.game.sound.stats().state }));
    check('?audio=med: antes do clique não há AudioContext (não bloqueia a inicialização)', !pre.init && pre.ctx === null, JSON.stringify(pre));
    await page.mouse.click(640, 400);
    await page.waitForTimeout(600);
    const post = await page.evaluate(() => ({ init: window.game.sound.initialized, ...window.game.sound.stats() }));
    check('depois do clique o AudioContext existe e está "running"', post.init && post.state === 'running', `(${post.state}, ${post.sampleRate} Hz, nível ${post.level})`);
    check('log "[WarPoly áudio] AudioContext iniciado" emitido no clique', logs.some((l) => /AudioContext iniciado: estado=running, nível=med/.test(l)), logs.join(' | '));
    check('música da partida começou (paz da facção) e ambiência do tileset', post.music.track === 'human_peace' && post.ambience.length > 0, JSON.stringify({ music: post.music.track, amb: post.ambience }));
    check('limitador (DynamicsCompressor) presente no mestre', typeof post.limiterReductionDb === 'number');

    await page.evaluate(installSceneProbe);

    // seleção e ordem falam
    const speech0 = post.counters.speech;
    await page.evaluate(() => {
      const gm = window.game.gameManager;
      const knight = gm.getUnitsOf(gm.localPlayerId).find((u) => u.type === 'knight');
      window.game.inputManager.selectUnits([knight]);
    });
    await page.waitForTimeout(500);
    const sel = await page.evaluate(() => window.game.sound.stats().counters.speech);
    check('selecionar uma unidade dispara uma fala', sel === speech0 + 1, `(${speech0} -> ${sel})`);
    await page.waitForTimeout(1500);
    await page.evaluate(() => {
      const gm = window.game.gameManager;
      const hq = gm.buildings.find((b) => b.ownerId === gm.localPlayerId);
      gm.issueOrder(null, { x: hq.mesh.position.x + 6, z: hq.mesh.position.z + 6 });
    });
    await page.waitForTimeout(500);
    const ord = await page.evaluate(() => window.game.sound.stats().counters.speech);
    check('dar uma ordem dispara uma fala', ord === sel + 1, `(${sel} -> ${ord})`);

    // batalha com a câmera em cima: efeitos posicionais e música adaptativa
    const battle1 = await page.evaluate(spawnBattle, true);
    await page.waitForTimeout(7000);
    const battle = await page.evaluate(() => window.game.sound.stats());
    check('batalha: efeitos tocaram (e o resto foi atenuado/limitado)', battle.counters.played > 10, JSON.stringify(battle.counters));
    check('batalha: nunca passa do teto de vozes', battle.voices <= battle.maxVoices, `(${battle.voices}/${battle.maxVoices})`);
    check('batalha: a música foi para a faixa de combate da facção (intensidade subiu, a faixa trocou)', battle.music.state === 'combat' && battle.music.track === 'human_combat' && battle.music.intensity > 0.5 && battle.music.switches >= 2, JSON.stringify(battle.music));
    console.log('     stats da batalha:', JSON.stringify({ counters: battle.counters, pool: battle.pool, music: battle.music, amb: battle.ambience }));

    // cena visível (PR #38): a câmera vai para o lado oposto do mapa (e afasta o zoom) e a batalha continua (e recomeça) fora da tela
    await page.evaluate(({ cx, cz }) => {
      const sm = window.game.gameManager.sceneManager;
      sm.cameraTarget.set(-cx, 0, -cz);
      sm.targetZoomLevel = 1.5;
      window.__audioProbe.phase = 2;
    }, battle1);
    await page.waitForTimeout(800);
    await page.evaluate(spawnBattle, false);
    await page.waitForTimeout(6000);
    const scene = await page.evaluate(summarizeScene);
    const s1 = scene.cameraOnBattle, s2 = scene.cameraAway;
    console.log('     cena visível:', JSON.stringify(scene));
    check('cena visível: com a câmera sobre a batalha os efeitos posicionais chegam ao motor, todos dentro do frustum (+ margem)', s1.positionalCalls > 0 && s1.callsOutsideFrustum === 0, JSON.stringify(s1));
    check('cena visível: com a câmera longe, o que acontece fora do frustum não chega ao motor (nenhuma chamada posicional fora da tela)', s2.eventsOutsideFrustum > 0 && s2.callsOutsideFrustum === 0 && s2.positionalCalls < s2.events, JSON.stringify(s2));
    const lis = await page.evaluate(() => {
      const L = window.game.sound.engine.listener;
      const sm = window.game.gameManager.sceneManager;
      return { x: +L.x.toFixed(3), z: +L.z.toFixed(3), zoom: +L.zoom.toFixed(3), frustum: !!(L.viewProj && L.viewProj.length === 16), camX: +sm.cameraTarget.x.toFixed(3), camZ: +sm.cameraTarget.z.toFixed(3), camZoom: +sm.zoomLevel.toFixed(3) };
    });
    check('ouvinte do áudio = alvo da câmera, com o zoom e o frustum da câmera real', Math.abs(lis.x - lis.camX) < 0.01 && Math.abs(lis.z - lis.camZ) < 0.01 && Math.abs(lis.zoom - lis.camZoom) < 0.05 && lis.zoom > 1.2 && lis.frustum, JSON.stringify(lis));

    // opções: volumes por canal e persistência real (localStorage)
    const vol = await page.evaluate(async () => {
      const { options } = await import('/src/ui/optionsStore.js');
      const { applyAudio } = await import('/src/ui/optionsApply.js');
      options.set('volumeVoice', 0.35); options.set('volumeMusic', 0.1); options.set('volumeSfx', 0.7); options.set('volumeMaster', 0.9);
      applyAudio(window.game.sound);
      const v = window.game.sound.engine.volumes;
      const saved = ['warpoly.volVoice', 'warpoly.volMusic', 'warpoly.volSfx', 'warpoly.volMaster'].map((k) => localStorage.getItem(k));
      options.resetTab('audio');
      applyAudio(window.game.sound);
      return { v, saved, after: window.game.sound.engine.volumes };
    });
    check('volume por canal: aplicado no mixer e gravado no localStorage', vol.v.voice === 0.35 && vol.v.music === 0.1 && vol.v.sfx === 0.7 && vol.v.master === 0.9 && vol.saved.join(',') === '0.35,0.1,0.7,0.9', JSON.stringify(vol));
    check('restaurar padrão da aba de áudio volta os canais', vol.after.voice === 0.8 && vol.after.music === 0.25 && vol.after.sfx === 0.5 && vol.after.master === 1, JSON.stringify(vol.after));

    // ------------------------------------------------------------------ 4. renderização offline (sem alto-falante)
    const { rows, notes } = await page.evaluate(offlineRender);
    console.log('     renderização offline (pico / amostras acima de 1,0 / RMS dBFS):');
    let group = '';
    const compact = (g) => g === 'sfx-max' || g === 'musica-max';
    let line = [];
    const flush = () => { if (line.length) console.log(`       ${line.join('  |  ')}`); line = []; };
    for (const r of rows) {
      if (r.group !== group) { flush(); group = r.group; if (compact(group)) console.log(`       -- ${group === 'sfx-max' ? 'todas as receitas de efeito, volume máximo (pico / RMS)' : 'músicas, volume máximo (pico / RMS)'}:`); }
      if (compact(group)) {
        line.push(`${r.name.replace(/ \(volume máximo\)/, '')} ${r.peak}/${r.rmsDb}`);
        if (line.length === 3) flush();
      } else console.log(`       ${r.name.padEnd(76)} pico ${String(r.peak).padEnd(6)} acima de 1: ${String(r.over).padEnd(3)} rms ${r.rmsDb} dB`);
    }
    flush();
    console.log(`     notas: frase do soldado dura ${notes.speechDur} s; ${notes.recipes} variantes de receita renderizadas; recusadas: ${JSON.stringify(notes.recipesRefused)}`);

    const row = (name) => rows.find((r) => r.name === name);
    const speechRow = row('fala (soldado, volume padrão)');
    const plainMusic = row('música sem ducking (janela da frase)');
    const duckedMusic = row('música sob a fala (ducking, voz muda)');
    const worst = row('pior caso: golpes a cada 30 ms, tudo no máximo');
    const sameInstant = rows.filter((r) => r.name.startsWith('pior caso:') && r.name.includes('no mesmo instante'));
    check('limitador: nem o pior caso passa de 1,0 de pico (golpes a cada 30 ms)', worst.peak <= 1.0001, `(pico ${worst.peak})`);
    check('limitador: efeitos que começam no MESMO instante (volume máximo e padrão, com e sem música) nunca passam de 1,0', sameInstant.length === 4 && sameInstant.every((r) => r.peak <= 1.0001 && r.over === 0), `(pico/amostras acima de 1: ${sameInstant.map((r) => `${r.peak}/${r.over}`).join(' ')})`);
    check('música audível (acima de -60 dB) e, sob a fala, abaixo da fala (volumes padrão)', plainMusic.rmsDb > -60 && duckedMusic.rmsDb < speechRow.rmsDb, `(fala ${speechRow.rmsDb} dB > música sob a fala ${duckedMusic.rmsDb} dB; sem ducking a música é ${plainMusic.rmsDb} dB)`);
    check('ducking: a música abaixa pelo menos 3 dB enquanto a fala toca', plainMusic.rmsDb - duckedMusic.rmsDb >= 3, `(${(plainMusic.rmsDb - duckedMusic.rmsDb).toFixed(1)} dB)`);
    check('ambiência de cada tileset é audível e discreta', ['verdejante', 'inverno', 'devastadas', 'pantano'].every((t) => row(`ambiencia ${t}`).rmsDb > -80 && row(`ambiencia ${t}`).rmsDb < -20));
    const musicMax = rows.filter((r) => r.group === 'musica-max');
    check('músicas: as 4 faixas × 3 variações no volume máximo ficam em 1,0 ou menos', musicMax.length === 12 && musicMax.every((r) => r.peak <= 1.0001 && r.over === 0 && r.rmsDb > -40), `(maior pico ${Math.max(...musicMax.map((r) => r.peak))})`);
    const sfxMax = rows.filter((r) => r.group === 'sfx-max');
    const silent = sfxMax.filter((r) => !(r.peak > 0.001)).map((r) => r.name);
    check('efeitos: todas as receitas (e variantes) renderizam, não ficam mudas e no volume máximo ficam em 1,0 ou menos', sfxMax.length === notes.recipes && notes.recipesRefused.length === 0 && silent.length === 0 && sfxMax.every((r) => r.peak <= 1.0001 && r.over === 0), `(${sfxMax.length} variantes, maior pico ${Math.max(...sfxMax.map((r) => r.peak))}; mudas: ${JSON.stringify(silent)})`);
    check('nenhum cenário gera valores inválidos (NaN) ou pico acima de 1', rows.every((r) => Number.isFinite(r.peak) && Number.isFinite(r.rmsDb) && r.peak <= 1.0001));
    await page.close();
  }

  // ------------------------------------------------------------------ tileset e facção seguem para a música/ambiência
  for (const [tileset, faction, track, layers] of [['inverno', 'orc', 'orc_peace', 'snow,wind'], ['devastadas', 'human', 'human_peace', 'rumble,wind'], ['pantano', 'orc', 'orc_peace', 'crickets,water,wind']]) {
    const page = await openGame(`&audio=med&tileset=${tileset}&faction=${faction}`, errs, logs);
    await page.mouse.click(640, 400);
    await page.waitForTimeout(700);
    const s = await page.evaluate(() => window.game.sound.stats());
    check(`facção ${faction} + tileset ${tileset}: música de paz ${track} e ambiência ${layers}`, s.music.track === track && [...s.ambience].sort().join(',') === layers, JSON.stringify({ music: s.music.track, amb: s.ambience }));
    if (faction === 'orc' && tileset === 'inverno') {
      // combate de verdade seria 7 s; o diretor de música recebe o mesmo peso pelo mesmo caminho do AudioEvents (`sound.noteCombat`)
      await page.evaluate(() => { for (let i = 0; i < 4; i++) window.game.sound.noteCombat(1.5); });
      await page.waitForTimeout(1000);
      const c = await page.evaluate(() => window.game.sound.stats().music);
      check('facção orc: com combate a música vai para orc_combat', c.track === 'orc_combat' && c.state === 'combat', JSON.stringify(c));
    }
    await page.close();
  }

  check('sem pageerror/console.error', errs.length === 0, errs.join(' | '));
} finally {
  await browser.close().catch(() => {});
  await vite.close().catch(() => {});
}
process.exit(failed ? 1 : 0);
