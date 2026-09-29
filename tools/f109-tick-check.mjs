#!/usr/bin/env node
/**
 * F1-09 — verificação manual (não faz parte do `npm test`): confirma que a simulação em
 * tick fixo se comporta igual independente do FPS de renderização.
 *
 * Sobe o jogo, congela o loop de render (`requestAnimationFrame`) logo após o boot e conduz a
 * simulação manualmente chamando `gameManager.advance(dt)` — uma vez com `dt = 1/30` (600
 * chamadas = 20s simulados) e outra com `dt = 1/144` (2880 chamadas = 20s simulados). Compara a
 * posição média das unidades vivas e os recursos dos jogadores no final: devem ficar muito
 * próximos, já que ambos os FPS produzem o mesmo número de passos de `SIM_DT` (400 passos).
 *
 * `Math.random()` ainda existe na IA (bug conhecido, fora do escopo da F1-09) — só o estado
 * inicial (spawn de unidades/construções) é determinístico; a partir do primeiro `advance()` a
 * IA pode decidir coisas diferentes entre os dois FPS por causa disso. O script imprime a
 * diferença observada em vez de travar num limiar fixo.
 *
 * Roda via `tools/safe-run.sh` (GPU real obrigatória — ver tools/lib/assertGpu.mjs).
 * Uso: bash tools/safe-run.sh --timeout 180 -- node tools/f109-tick-check.mjs
 */
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { assertHardwareGpu } from './lib/assertGpu.mjs';

const PORT = 5191;
const CHROMIUM_ARGS = [
  '--use-angle=vulkan',
  '--enable-features=Vulkan',
  '--enable-gpu',
  '--ignore-gpu-blocklist',
  '--js-flags=--max-old-space-size=2048',
  '--disable-dev-shm-usage'
];

async function startServer() {
  const vite = await createServer({
    server: { port: PORT, strictPort: true, host: '127.0.0.1' },
    logLevel: 'warn',
    clearScreen: false
  });
  await vite.listen();
  return { baseUrl: `http://127.0.0.1:${PORT}`, close: () => vite.close() };
}

/** Roda 20s simulados manualmente a `fps` quadros/seg e devolve um snapshot do estado final. */
async function runAt(baseUrl, browser, fps) {
  const context = await browser.newContext({ viewport: { width: 1024, height: 640 } });
  const page = await context.newPage();
  await assertHardwareGpu(page);
  await page.goto(`${baseUrl}/?skipPreload&texq=low`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction('!!(window.game && window.game.gameManager && window.game.gameManager.allUnits.length > 0)', null, { timeout: 60000 });

  const snapshot = await page.evaluate(async (fps) => {
    // Congela o loop de render do jogo: sem isso, o rAF real continuaria chamando
    // session.update() concorrentemente com os advance() manuais abaixo.
    window.requestAnimationFrame = () => 0;

    const gm = window.game.gameManager;
    const dt = 1 / fps;
    const totalSimSeconds = 20;
    const frames = Math.round(totalSimSeconds / dt);
    for (let i = 0; i < frames; i++) {
      gm.advance(dt);
    }

    const alive = gm.allUnits.filter((u) => !u.isDead);
    let sx = 0, sz = 0;
    for (const u of alive) { sx += u.mesh.position.x; sz += u.mesh.position.z; }
    const avgPos = alive.length ? { x: sx / alive.length, z: sz / alive.length } : { x: 0, z: 0 };

    const resources = gm.players.map((p) => ({ id: p.id, ...p.resources }));

    return {
      frames,
      gameTime: gm.gameTime,
      aliveCount: alive.length,
      avgPos,
      resources
    };
  }, fps);

  await context.close();
  return snapshot;
}

async function main() {
  let server = null;
  let browser = null;
  try {
    server = await startServer();
    browser = await chromium.launch({ headless: false, args: CHROMIUM_ARGS });

    console.log('Rodando 20s simulados a 30 FPS...');
    const at30 = await runAt(server.baseUrl, browser, 30);
    console.log('Rodando 20s simulados a 144 FPS...');
    const at144 = await runAt(server.baseUrl, browser, 144);

    console.log('\n--- Resultado ---');
    console.log(`30 FPS  : frames=${at30.frames} gameTime=${at30.gameTime.toFixed(3)} vivos=${at30.aliveCount} posMédia=(${at30.avgPos.x.toFixed(3)}, ${at30.avgPos.z.toFixed(3)})`);
    console.log(`144 FPS : frames=${at144.frames} gameTime=${at144.gameTime.toFixed(3)} vivos=${at144.aliveCount} posMédia=(${at144.avgPos.x.toFixed(3)}, ${at144.avgPos.z.toFixed(3)})`);
    console.log(`Δ gameTime: ${Math.abs(at30.gameTime - at144.gameTime).toFixed(6)} s (deve ser ~0: mesmo número de passos de SIM_DT)`);
    console.log(`Δ posição média: dx=${Math.abs(at30.avgPos.x - at144.avgPos.x).toFixed(3)} dz=${Math.abs(at30.avgPos.z - at144.avgPos.z).toFixed(3)}`);
    console.log('Recursos 30 FPS :', JSON.stringify(at30.resources));
    console.log('Recursos 144 FPS:', JSON.stringify(at144.resources));
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (server) await server.close().catch(() => {});
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
