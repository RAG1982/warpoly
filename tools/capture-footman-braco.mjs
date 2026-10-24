// B-footman-braco: quadros do ataque (antes/depois do acoplamento de cintura) no inspetor.
//   bash tools/safe-run.sh --timeout 300 -- node tools/capture-footman-braco.mjs
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';
import { assertHardwareGpu } from './lib/assertGpu.mjs';

const PORT = Number(process.env.CAPTURE_PORT || 5231);
const OUT = 'tools/ui-captures/B-footman-braco';
const MODELS = (process.env.MODELS || 'knight_v2,knight,archer_v2,villager_v2,hero_oren,hero_drogath,hero_dorian,hero_skarn,hero_vozgul,hero_brann').split(',');
mkdirSync(OUT, { recursive: true });
let vite, browser;
try {
  vite = await createServer({ server: { port: PORT, strictPort: true, host: '127.0.0.1' }, logLevel: 'warn', clearScreen: false });
  await vite.listen();
  browser = await chromium.launch({ headless: true, args: ['--use-angle=vulkan', '--enable-features=Vulkan', '--enable-gpu', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--renderer-process-limit=1', '--disable-dev-shm-usage'] });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${PORT}/inspector.html?skipPreload&texq=low`);
  await page.waitForFunction('window.inspectorApp', null, { timeout: 90000 });
  await assertHardwareGpu(page);
  const clip = { x: 340, y: 60, width: 640, height: 600 };
  for (const id of MODELS) {
    await page.evaluate((m) => window.inspectorApp.selectModel(m + '_glb'), id);
    await page.waitForTimeout(900);
    for (const mode of ['antes', 'depois']) {
      for (const t of [0.2, 0.55]) {
        await page.evaluate(([mode, t]) => {
          const an = window.inspectorApp.animator;
          const P = Object.getPrototypeOf(an);
          if (!P.__wf) P.__wf = P.applyWaistFollow;
          P.applyWaistFollow = mode === 'antes' ? () => {} : P.__wf;
          an.pause(); an.setAnimation('fight', true); an._blendT = 99; an.setTime(t * an.getDuration());
        }, [mode, t]);
        await page.waitForTimeout(200);
        await page.screenshot({ path: `${OUT}/${id}-${mode}-t${t}.png`, clip });
      }
    }
  }
  console.log('erros de pagina:', errors.length, errors.slice(0, 3));
} finally {
  if (browser) await browser.close();
  if (vite) await vite.close();
}
