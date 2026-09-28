/**
 * Verificação de GPU real para testes de navegador (F0-08).
 *
 * SwiftShader e llvmpipe são renderers WebGL por software que colocam texturas na RAM.
 * Esta biblioteca detecta e aborta se o jogo tentar rodar nesses renderers sem permissão.
 *
 * Usa environment variable ALLOW_SOFTWARE_GL=1 para contornar (só para depuração).
 */

export const SOFTWARE_RENDERER = /swiftshader|llvmpipe|software|softpipe/i;

/**
 * Lê o renderer WebGL da página (UNMASKED_RENDERER_WEBGL).
 * Usa uma página about:blank para não ativar o contexto do jogo.
 *
 * @param {Page} page - página do Playwright
 * @returns {Promise<string>} string do renderer (ex: "ANGLE (Vulkan)")
 */
export async function readWebGLRenderer(page) {
  return await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return 'desconhecido (sem WebGL)';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (!ext) return 'desconhecido (sem WEBGL_debug_renderer_info)';
    return gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
  });
}

/**
 * Verifica se o renderer é GPU de verdade. Se for software (SwiftShader, llvmpipe, etc.),
 * lança erro a menos que ALLOW_SOFTWARE_GL=1.
 *
 * Deve ser chamado ANTES de navegar para o jogo, numa página about:blank, para que
 * o jogo nunca carregue com software.
 *
 * @param {Page} page - página do Playwright (idealmente about:blank ou vazia)
 * @throws {Error} se detectar software renderer e ALLOW_SOFTWARE_GL !== '1'
 */
export async function assertHardwareGpu(page) {
  const renderer = await readWebGLRenderer(page);
  if (SOFTWARE_RENDERER.test(renderer) && process.env.ALLOW_SOFTWARE_GL !== '1') {
    throw new Error(
      `GPU de software detectada: ${renderer}. Abortando para não estourar a RAM (ver docs/specs/F0-08).`
    );
  }
}
