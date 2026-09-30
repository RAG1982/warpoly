# F0-08 · Bloquear testes de navegador sem GPU

> **Status: ✅ PRONTA — DONE (d17aaf5)**

Leia antes: `docs/specs/_COMUM.md`.
Worktree: nova (isolada), branch sugerida `task/F0-08`. Porta do vite: não precisa.

## Por quê
Às 14:41 de 2026-09-28 um `chrome-headless` rodando WebGL por software (SwiftShader) chegou a 12,15 GB e foi morto pelo `safe-run.sh`. Com SwiftShader as texturas do jogo ficam na RAM. Os scripts de teste precisam **abortar** quando não houver GPU real.

## Passos
1. Crie `tools/lib/assertGpu.mjs`:
   ```js
   export const SOFTWARE_RENDERER = /swiftshader|llvmpipe|software|softpipe/i;
   // Lê o renderer WebGL da página (UNMASKED_RENDERER_WEBGL). Retorna a string.
   export async function readWebGLRenderer(page) { /* page.evaluate com canvas + getContext('webgl2'||'webgl') + WEBGL_debug_renderer_info */ }
   // Lança Error('GPU de software detectada: <renderer>. Abortando para não estourar a RAM (ver docs/specs/F0-08).')
   // se SOFTWARE_RENDERER casar e process.env.ALLOW_SOFTWARE_GL !== '1'.
   export async function assertHardwareGpu(page) { ... }
   ```
   Use uma página `about:blank` para ler o renderer **antes** de navegar para o jogo (assim o jogo nunca carrega em software).
2. `tools/smoke.mjs`: logo após criar a página (perto da linha 74, `chromium.launch`), chamar `assertHardwareGpu(page)` antes de `page.goto`. O modo `SMOKE_GL=swiftshader` (linhas 28–34) só continua funcionando se `ALLOW_SOFTWARE_GL=1`; senão aborta com a mensagem acima.
3. `tools/bench/run-bench.mjs`: na função `launch` (linha ~83), a tentativa de fallback SwiftShader (linha ~89) só é incluída se `ALLOW_SOFTWARE_GL=1`. Depois de lançar, chamar `assertHardwareGpu` antes de abrir o cenário.
4. `CLAUDE.md`, seção "Regras de recursos da máquina": acrescentar o item
   `- Scripts de navegador abortam se o WebGL for de software (SwiftShader/llvmpipe) — use tools/lib/assertGpu.mjs em qualquer script Playwright novo.`
5. `tests/README.md`: uma linha explicando `ALLOW_SOFTWARE_GL=1` (só para depuração pontual, nunca em agentes).

## Não fazer
- Não alterar `tools/safe-run.sh` nem o código do jogo (`src/`).

## Verificação
- `npm run smoke` passa e imprime renderer AMD.
- `SMOKE_GL=swiftshader npm run smoke` falha rápido (< 10 s) com a mensagem de abortar, sem abrir o jogo.
- Comandos mínimos do `_COMUM.md`.

## Entrega
Mensagem de commit: `F0-08: scripts de navegador abortam sem GPU real`.
