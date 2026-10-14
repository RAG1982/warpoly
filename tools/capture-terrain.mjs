import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { writeFileSync } from 'fs';
import { assertHardwareGpu } from './lib/assertGpu.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = dirname(__dirname);

const VITE_PORT = 5199;
const BASE_URL = `http://127.0.0.1:${VITE_PORT}`;

async function captureMap(name, url) {
  console.log(`Capturando ${name}...`);

  const browser = await chromium.launch({
    args: ['--use-angle=vulkan', '--enable-gpu', '--js-flags=--max-old-space-size=2048']
  });

  try {
    const page = await browser.newPage();

    // Verificar GPU real
    await assertHardwareGpu(page);

    // Navegar
    await page.goto(`${BASE_URL}${url}`, { waitUntil: 'networkidle' });

    // Aguardar renderização
    await page.waitForTimeout(3000);

    // Capturar
    const screenshot = await page.screenshot({
      fullPage: false,
      path: join(projectRoot, `tools/ui-captures/maps/depois-new17-${name}.png`)
    });

    console.log(`✓ Capturado: depois-new17-${name}.png`);

    await page.close();
  } finally {
    await browser.close();
  }
}

async function main() {
  try {
    await captureMap('ilhas', '/?play&skipPreload&texq=low&map=ilhas-4p&ffa=1');
    await captureMap('continental', '/?play&skipPreload&texq=low');
    console.log('\n✓ Capturas concluídas!');
  } catch (err) {
    console.error('Erro na captura:', err.message);
    process.exit(1);
  }
}

main();
