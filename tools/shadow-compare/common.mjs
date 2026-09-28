import { chromium } from 'playwright';

export const GPU_ARGS = [
  '--enable-gpu', '--ignore-gpu-blocklist', '--enable-gpu-rasterization',
  '--use-angle=vulkan', '--enable-features=Vulkan', '--disable-vulkan-surface',
  '--disable-frame-rate-limit', '--disable-gpu-vsync',
  '--js-flags=--max-old-space-size=2048'
];

export async function withBrowser(fn) {
  const browser = await chromium.launch({ headless: true, args: GPU_ARGS });
  try {
    return await fn(browser);
  } finally {
    await browser.close().catch(() => {});
  }
}
