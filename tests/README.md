# Testes e ferramentas de qualidade

Pré-requisito: `npm install`. Para o smoke, também é preciso ter o Chromium do Playwright (`npx playwright install chromium`, uma vez só).

| Comando | O que faz |
|---|---|
| `npm run lint` | ESLint 9 (`eslint.config.js`, recommended + globals de browser). Sai com código 0 se não houver erros; os avisos (`no-unused-vars`) não falham. |
| `npm test` | Vitest (`vitest.config.js`): roda `tests/unit/**/*.test.js` em Node. |
| `npm run smoke` | Roda `tools/smoke.mjs` **dentro de `tools/safe-run.sh --mem 6G --timeout 240`**. O smoke sobe o Vite na porta 5176, abre `/?skipPreload` e depois `/inspector.html` no Chromium headless (uma página por vez) e espera `window.game` / `window.inspectorApp`. Falha em qualquer `pageerror` ou `console.error`. |
| `npm run format:check -- <arquivos>` | Prettier `--check` **só nos arquivos passados**. O código antigo ainda não foi formatado, então rode só nos arquivos que você tocou. |

## Smoke: segurança de memória
Em 2026-09-28 um chrome-headless chegou a 10,8 GB e travou a máquina. Por isso:
- **Nunca rode `node tools/smoke.mjs` direto.** Use `npm run smoke`, que passa pelo `tools/safe-run.sh`: trava global (um processo pesado por vez), teto de 6 GB sem swap, `nice`/`ionice` e timeout de 240 s.
- O Chromium roda com `--js-flags=--max-old-space-size=2048` e `--renderer-process-limit=1`. O jogo abre com `?skipPreload`, sem o preload de texturas 2048².
- **WebGL na GPU real (padrão, `SMOKE_GL=gpu`, ANGLE/Vulkan).** Medido: com a GPU, o jogo monta em cerca de 8 s e o Chromium fica abaixo de ~1 GB. Com `SMOKE_GL=swiftshader` (WebGL por software, típico de CI sem GPU), as texturas procedurais vão para a RAM: o Chromium passou de 6 GB em cerca de 45 s e foi morto pelo teto do safe-run. Por isso o smoke só é confiável numa máquina com GPU até a F1-01 reduzir o orçamento de texturas.
- A saída mostra qual renderer WebGL foi usado. Se aparecer `SwiftShader` sem você ter pedido, a GPU não foi detectada.
- Um browser novo por página (o anterior é fechado antes). Se a aba ou o browser morrerem, o smoke falha na hora, sem esperar o timeout.
- Browser e Vite são fechados em `finally` e também em SIGTERM/SIGINT (ex.: quando o safe-run estoura o timeout).

## Smoke: variáveis de ambiente
- `SMOKE_URL=http://localhost:4173`: reaproveita um servidor que já está rodando (ex.: `npx vite preview`) em vez de subir o Vite.
- `SMOKE_TIMEOUT_MS=90000`: tempo limite por página (padrão 90 s). Com WebGL por software, o jogo leva cerca de 20 s para montar a cena; a primeira execução pode demorar mais por causa do pré-bundle do Vite. O timeout total do safe-run (240 s) continua valendo.
- `SMOKE_HEADED=1`: abre o navegador com janela visível.
- `ALLOW_SOFTWARE_GL=1`: permite rodar scripts de teste com WebGL por software (SwiftShader/llvmpipe) — **só para depuração pontual**, nunca em agentes automáticos. Sem essa flag, o smoke e bench abortam se detectarem software renderer.

## Escrevendo testes unitários
- Arquivos em `tests/unit/<modulo>.test.js`, importando direto de `src/`.
- Prefira testar lógica pura, sem three.js nem DOM. Para dependências do mundo, use objetos falsos: por exemplo, um terreno `{ getHeight(x, z) }`, como em `pathfinder.test.js`.
