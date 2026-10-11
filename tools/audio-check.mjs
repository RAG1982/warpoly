#!/usr/bin/env node
/**
 * F7-08: verificação do áudio de produção no navegador (sem ouvir nada: logs, contadores e renderização offline).
 *   bash tools/safe-run.sh --timeout 400 -- node tools/audio-check.mjs
 *
 * 1. Automação fica MUDA por padrão: sem `?audio=`, depois de clicar, nenhum AudioContext é criado.
 * 2. Com `?audio=med`: o AudioContext NÃO existe no carregamento e nasce no primeiro clique (log "[WarPoly áudio] …").
 * 3. Seleção/ordem falam (contador de falas), uma pequena batalha gera efeitos e intensidade de combate (música muda),
 *    ambiência e música da facção seguem o tileset (`?tileset=inverno&faction=orc`).
 * 4. Renderização OFFLINE (OfflineAudioContext, sem saída de som) de música, ambiência, fala e efeitos: pico/RMS por
 *    cenário, para conferir mixagem e limitador (nada passa de 1,0).
 * Falha com `pageerror` ou `console.error`. Chromium com GPU real (assertHardwareGpu) e `--mute-audio` (nada sai no alto-falante).
 */
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { assertHardwareGpu } from './lib/assertGpu.mjs';

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

async function openGame(query, errs, logs) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => errs.push(`pageerror: ${e}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errs.push(`console.error: ${m.text()}`);
    if (m.text().includes('[WarPoly áudio]')) logs.push(`${m.type()}: ${m.text()}`);
  });
  await page.goto(`${base}/?skipPreload&texq=low&play${query}`);
  await assertHardwareGpu(page);
  await page.waitForFunction('window.game && window.game.gameManager && window.game.inputManager && window.game.sound', null, { timeout: 90000 });
  await page.waitForTimeout(1200);
  return page;
}

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

    // batalha: efeitos posicionais e música adaptativa
    await page.evaluate(() => {
      const gm = window.game.gameManager;
      const hq = gm.buildings.find((b) => b.ownerId === 0);
      const cx = hq.mesh.position.x + 14, cz = hq.mesh.position.z + 14;
      gm.sceneManager.cameraTarget.set(cx, 0, cz);
      const mine = [], theirs = [];
      for (let i = 0; i < 8; i++) {
        mine.push(gm.spawnUnit(i % 2 ? 'archer' : 'knight', cx - 2, cz - 6 + i * 1.6, 0).id);
        theirs.push(gm.spawnUnit(i % 2 ? 'axethrower' : 'grunt', cx + 2, cz - 6 + i * 1.6, 1).id);
      }
      gm.issue({ type: 'attackMove', playerId: 0, unitIds: mine, x: cx + 3, z: cz });
      gm.issue({ type: 'attackMove', playerId: 1, unitIds: theirs, x: cx - 3, z: cz });
    });
    await page.waitForTimeout(7000);
    const battle = await page.evaluate(() => window.game.sound.stats());
    check('batalha: efeitos tocaram (e o resto foi atenuado/limitado)', battle.counters.played > 10, JSON.stringify(battle.counters));
    check('batalha: nunca passa do teto de vozes', battle.voices <= battle.maxVoices, `(${battle.voices}/${battle.maxVoices})`);
    check('batalha: intensidade de combate subiu e a música foi para o combate', battle.music.intensity > 0.5 || battle.music.state === 'combat', JSON.stringify(battle.music));
    console.log('     stats da batalha:', JSON.stringify({ counters: battle.counters, pool: battle.pool, music: battle.music, amb: battle.ambience }));

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
    const off = await page.evaluate(async () => {
      const { AudioEngine } = await import('/src/audio/AudioEngine.js');
      const { LINES, VOICE_PROFILES } = await import('/src/audio/speech/speechLines.js');
      const SR = 44100;
      const stat = (buf, t0, t1) => {
        let peak = 0, sum = 0, n = 0;
        for (let ch = 0; ch < buf.numberOfChannels; ch++) {
          const d = buf.getChannelData(ch);
          for (let i = Math.round(t0 * SR); i < Math.min(d.length, Math.round(t1 * SR)); i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; sum += d[i] * d[i]; n++; }
        }
        return { peak: +peak.toFixed(3), rmsDb: +(20 * Math.log10(Math.sqrt(sum / Math.max(1, n)) + 1e-9)).toFixed(1) };
      };
      const run = async (seconds, setup, level = 'high') => {
        const ctx = new OfflineAudioContext(2, Math.round(SR * seconds), SR);
        const clock = { t: 0 };
        const proxy = new Proxy(ctx, { get(t, p) { if (p === 'currentTime') return clock.t; const v = t[p]; return typeof v === 'function' ? v.bind(t) : v; } });
        const eng = new AudioEngine({ ctx: proxy, level, timers: null });
        setup(eng, clock);
        for (let t = 0; t < seconds; t += 0.15) { clock.t = t; eng.tick(); }
        const buf = await ctx.startRendering();
        return { buf, eng };
      };
      const out = {};
      for (const [id, faction, combat] of [['human_peace', 'human', false], ['human_combat', 'human', true], ['orc_peace', 'orc', false], ['orc_combat', 'orc', true]]) {
        const { buf } = await run(12, (e, c) => { e.beginMatch({ faction, tilesetId: 'verdejante' }); if (combat) for (let i = 0; i < 6; i++) e.noteCombat(1); });
        out[`musica ${id}`] = stat(buf, 3, 12);
      }
      for (const ts of ['verdejante', 'inverno', 'devastadas', 'pantano']) {
        const { buf } = await run(9, (e) => { e.setVolumes({ music: 0 }, true); e.sceneProbe = () => ({ timeOfDay: 'night' }); e.beginMatch({ faction: 'human', tilesetId: ts }); });
        out[`ambiencia ${ts}`] = stat(buf, 4, 9);
      }
      {
        const { buf } = await run(2.5, (e, c) => { e.setVolumes({ music: 0 }, true); c.t = 0.1; e.speak({ key: 'h.soldier.order.0', ph: LINES['h.soldier'].order[0].ph, voice: VOICE_PROFILES.h_soldier }); });
        out['fala (soldado, volume padrão)'] = stat(buf, 0, 2.5);
      }
      for (const [name, opts] of [['chop', {}], ['sword', {}], ['bow', {}], ['explosion', {}], ['alarm', {}], ['victory', {}], ['select', {}], ['collapse', {}]]) {
        const { buf } = await run(1.8, (e, c) => { e.setVolumes({ music: 0 }, true); c.t = 0.05; e.playSfx(name, opts); });
        out[`sfx ${name} (volume padrão)`] = stat(buf, 0, 1.8);
      }
      {
        // pior caso: música de combate + 30 efeitos/s + fala + explosões, tudo no volume máximo (limitador deve segurar)
        const { buf } = await run(8, (e, c) => {
          e.setVolumes({ master: 1, music: 1, sfx: 1, voice: 1 }, true);
          e.beginMatch({ faction: 'orc', tilesetId: 'devastadas' });
          for (let i = 0; i < 8; i++) e.noteCombat(1);
          for (let k = 0; k < 240; k++) {
            c.t = 0.5 + k * 0.03;
            e.playSfx(['sword', 'bow', 'arrowHit', 'death', 'stoneHit', 'explosion'][k % 6], { priority: 1 + (k % 3), pos: { x: (k % 7) * 3, z: (k % 5) * 3 } });
          }
          c.t = 1; e.speak({ key: 'o.soldier.order.0', ph: LINES['o.soldier'].order[0].ph, voice: VOICE_PROFILES.o_soldier });
        });
        out['pior caso (tudo no máximo)'] = stat(buf, 1, 8);
      }
      return out;
    });
    console.log('     renderização offline (pico / RMS dBFS):');
    for (const [k, v] of Object.entries(off)) console.log(`       ${k.padEnd(34)} pico ${String(v.peak).padEnd(6)} rms ${v.rmsDb} dB`);
    const worst = off['pior caso (tudo no máximo)'];
    check('limitador: nem o pior caso passa de 1,0 de pico', worst.peak <= 1.0001, `(pico ${worst.peak})`);
    check('música audível mas abaixo da fala (volumes padrão)', off['musica human_peace'].rmsDb > -60 && off['musica human_peace'].rmsDb < off['fala (soldado, volume padrão)'].rmsDb, `(${off['musica human_peace'].rmsDb} dB < ${off['fala (soldado, volume padrão)'].rmsDb} dB)`);
    check('ambiência de cada tileset é audível e discreta', ['verdejante', 'inverno', 'devastadas', 'pantano'].every((t) => off[`ambiencia ${t}`].rmsDb > -80 && off[`ambiencia ${t}`].rmsDb < -20));
    check('nenhum cenário gera valores inválidos (NaN) ou pico acima de 1', Object.values(off).every((v) => Number.isFinite(v.peak) && Number.isFinite(v.rmsDb) && v.peak <= 1.0001));
    await page.close();
  }

  // ------------------------------------------------------------------ tileset e facção seguem para a música/ambiência
  {
    const page = await openGame('&audio=med&tileset=inverno&faction=orc', errs, logs);
    await page.mouse.click(640, 400);
    await page.waitForTimeout(700);
    const s = await page.evaluate(() => window.game.sound.stats());
    check('facção orc: música de paz orc; inverno: vento + neve', s.music.track === 'orc_peace' && [...s.ambience].sort().join(',') === 'snow,wind', JSON.stringify({ music: s.music.track, amb: s.ambience }));
    await page.close();
  }

  check('sem pageerror/console.error', errs.length === 0, errs.join(' | '));
} finally {
  await browser.close().catch(() => {});
  await vite.close().catch(() => {});
}
process.exit(failed ? 1 : 0);
