// Depuração F1-05: lista malhas visíveis cuja origem está em área não explorada (deveriam ser recolhidas).
//   bash tools/safe-run.sh --timeout 200 -- node tools/fog-compare/debug-meshes.mjs http://localhost:5184 40 -8
import { chromium } from 'playwright';
const [base = 'http://localhost:5184', cx = '40', cz = '-8'] = process.argv.slice(2);
const browser = await chromium.launch({
  headless: true,
  args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=vulkan', '--enable-features=Vulkan', '--disable-vulkan-surface']
});
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', e => console.log('ERR', String(e)));
  await page.goto(`${base}/?skipPreload&texq=low`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.game && window.game.gameManager, null, { timeout: 90000 });
  await page.waitForTimeout(1500);
  const out = await page.evaluate(([x0, z0]) => {
    const fog = window.game.gameManager.fogOfWar;
    const v = window.game.sceneManager.camera.position.clone();
    const res = {};
    window.game.sceneManager.scene.traverse(o => {
      if (!o.isMesh || !o.visible || o.isInstancedMesh) return;
      o.getWorldPosition(v);
      if (fog.isExplored(v.x, v.z) || Math.hypot(v.x - x0, v.z - z0) > 25) return;
      const m = Array.isArray(o.material) ? o.material[0] : o.material;
      const key = `${o.parent?.parent?.name || '?'}/${o.parent?.name || '?'}/${o.name} ${m.type} ${m.customProgramCacheKey().slice(-10)}`;
      res[key] = (res[key] || 0) + 1;
    });
    const inst = [];
    const r = window.game.sceneManager.renderer;
    const M = window.game.sceneManager.camera.matrix.clone();
    window.game.sceneManager.scene.traverse(o => {
      if (!o.isInstancedMesh) return;
      let hidden = 0;
      for (let i = 0; i < o.count; i++) {
        o.getMatrixAt(i, M);
        v.setFromMatrixPosition(M).applyMatrix4(o.matrixWorld);
        if (!fog.isExplored(v.x, v.z) && Math.hypot(v.x - x0, v.z - z0) < 25) hidden++;
      }
      const m = Array.isArray(o.material) ? o.material[0] : o.material;
      const prog = r.properties.get(m).currentProgram;
      let src = '';
      if (prog) { const gl = r.getContext(); src = gl.getShaderSource(prog.vertexShader); }
      inst.push({ name: `${o.parent?.name}/${o.name}`, n: o.count, unexploredNear: hidden, type: m.type,
        key: m.customProgramCacheKey().slice(-10), hasFow: src.includes('fowO.b'), hasInst: src.includes('#define USE_INSTANCING'),
        visible: o.visible, programs: r.properties.get(m).programs ? r.properties.get(m).programs.size : null });
    });
    return { res, inst, fowParams: null };
  }, [Number(cx), Number(cz)]);
  console.log(JSON.stringify(out, null, 1));
} finally {
  await browser.close();
}
