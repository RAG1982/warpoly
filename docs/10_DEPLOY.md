# 10 · Empacotamento e deploy estático (F10-05)

O jogo é 100% estático (`dist/`): nenhum servidor é necessário.

## Build

```bash
npm run build                 # base relativa './' — funciona em qualquer pasta/domínio
BASE=/warpoly/ npm run build  # base absoluta (opcional); GitHub Pages usa isto no workflow
```

O que o build faz (`vite.config.js`):

- **Code-splitting**: `three-vendor` (three.js, muda raramente → cache longo entre deploys), `vendor`, `models-human`, `models-orc` (modelos procedurais) e `main`. Os `.glb` (`public/models/`) já são baixados sob demanda por `ensureGlbLoaded`, não entram em chunks. Carregar facção/modelos 100% sob demanda exige mexer no preload (`AssetPreloader`/`ModelFactory`, lane PERF) — fica como evolução.
- **Compressão**: gera `.br` (brotli 11) e `.gz` ao lado de JS/CSS/HTML/SVG (`packagingPlugin`, só `node:zlib`, sem dependência extra).
- **Service worker versionado**: `dist/sw.js` recebe o hash do conteúdo dos assets e a lista de pré-cache.
- **Caminhos de ícones** (`'/icoOuro.png'` em strings JS) são reescritos para `BASE_URL + 'icoOuro.png'`, então o jogo funciona em subpasta.

## PWA offline

`public/manifest.webmanifest` + `public/sw.js`, registrado por `src/pwa.js` **só em produção** (`import.meta.env.PROD`, HTTPS ou localhost). Estratégia: pré-cache do shell (HTML, JS/CSS com hash); cache-first em runtime para `.glb`, ícones e demais arquivos da mesma origem; navegação rede-primeiro com fallback offline. Novo deploy ⇒ novo hash ⇒ caches antigos apagados no `activate`. As fontes do Google (style.css) não são cacheadas (origem cruzada): offline cai para a fonte do sistema. `npm run dev` não registra nada.

**Mapas de campanha sob demanda (M2-28):** os `camp-*` são chunks próprios (`assets/camp-*-<hash>.js`, ~55 kB cada), fora do JS de boot (não contam em `initialJsBytes`; só `ensureMapLoaded` os baixa). Como o pré-cache do `sw.js` pega todo `assets/*.js`, eles são baixados na instalação do service worker e funcionam offline; sem SW (ou antes dele ativar) carregam online na hora de abrir a partida.

## GitHub Pages

`.github/workflows/deploy.yml` (push em `master` ou manual): `npm ci` → lint → vitest → build com `BASE=/<nome-do-repo>/` → publica `dist/`. Ative em *Settings → Pages → Source: GitHub Actions*. Domínio próprio: troque `BASE` por `/`.

## Cloudflare Pages

1. *Workers & Pages → Create → Pages → Connect to Git*, escolha o repositório.
2. Build command: `npm run build`; output directory: `dist`; variável `NODE_VERSION=22`. Não defina `BASE` (usa './').
3. Cloudflare serve `.br` automaticamente. `public/_headers` já define cache imutável para `/assets/*` e `no-cache` para `/sw.js`.

Deploy manual: `npx wrangler pages deploy dist`.

## Verificação

```bash
BASE=/warpoly/ npm run build
BASE=/warpoly/ bash tools/safe-run.sh --mem 6G --timeout 240 -- node tools/preview-check.mjs /warpoly/
```

Sobe `vite preview`, abre `?skipPreload`, falha com qualquer erro de console/HTTP ≥ 400 e confirma o service worker ativo (e encerra servidor e navegador).

## Orçamento de desempenho (F10-04)

Guarda contra regressões de desempenho. O orçamento **falha** (exit ≠ 0) quando **draw calls, FPS, tempo de load ou o tamanho do bundle JS** pioram **mais de 10 %** em relação a `tests/perf/baseline.json` (só números + manifesto de hardware/Chromium, poucos KB, versionada). O limiar é estrito: exatamente 10 % ainda passa. Código: `tools/perf-budget.mjs` (medição/CLI) e `tools/lib/perfBudget.mjs` (comparador puro, testado em `tests/unit/perfBudget.test.js`).

### Quem confere o quê

| Métrica | Como é medida | CI (`perf.yml`, sem GPU) | `npm run perf` (com GPU) |
|---|---|---|---|
| **Draw calls** (`?bench=inicial` e `combate100`) | cenário montado, simulação avança 6 passos e congela, `Math.random` semeado, `quality=high&texq=low&skipPreload`; mediana de N; igual com ou sem GPU | confere | confere |
| **Bundle JS** | bytes de `assets/main-*.js` (bundle principal) e do JS de boot (entrada + `modulepreload`) do build de produção | confere | confere |
| **FPS** (`inicial`, `combate100`) | cenário ao vivo, 2 s de aquecimento + 10 s, melhor de N | `fps: null` + motivo → "pulado" | confere |
| **Tempo de load** | navegação até o jogo pronto **com** preload de texturas (`texq=low`, sem `skipPreload`), menor de N | `ms: null` + motivo → "pulado" | confere |

**FPS e load são checados localmente, não na CI.** O runner do GitHub não tem GPU (WebGL por software) e é outra máquina; FPS e load só são comparáveis com uma baseline medida na mesma máquina. Antes de mergear mudanças de render/sim/modelos, rode `npm run perf` numa máquina com GPU. Em runner sem GPU o relatório grava `fps: null` com o motivo (`fpsReason`) e o comparador mostra a linha como "pulado" com o motivo — nunca falha por causa disso, nunca esconde o motivo e **nunca usa SwiftShader como baseline** (`--update` recusa qualquer renderer de software).

### Uso

```bash
npm run perf                                   # GPU real: build de produção + preview + Chromium; compara com a baseline; exit 1 em regressão
npm run perf -- --runs 5                       # mais amostras (padrão 3)
npm run perf -- --threshold 5%                 # limiar mais apertado (padrão 10%)
npm run perf -- --calls-only                   # só draw calls + bundle (~40 s), sem FPS/load; bom para iterar em modelos/render
npm run perf -- --update                       # regrava tests/perf/baseline.json (só do master, na máquina de referência)
node tools/perf-budget.mjs --ci --dist dist    # runner SEM GPU (é o que a CI roda): draw calls + bundle
node tools/perf-budget.mjs --compare tools/perf-results/<arquivo>.json   # só compara um resultado já medido (sem navegador)
```

### Regravar a baseline (passo LOCAL, com GPU real)

A `tests/perf/baseline.json` versionada foi medida no commit `475f874` (base `d769cd7`) e **está desatualizada**: precisa ser regravada no master atual, numa máquina com GPU real (nunca em runner sem GPU nem com SwiftShader; `--update` recusa isso). Passo a passo:

```bash
git switch master && git pull
bash tools/safe-run.sh --timeout 900 -- npm run perf -- --update   # mede (GPU real) e regrava tests/perf/baseline.json
git diff tests/perf/baseline.json                                    # revise e commite (ex.: "F10-04: baseline regravada no master <commit>")
```

O `npm run perf` já passa pelo `safe-run`; o `bash tools/safe-run.sh` externo é reentrante (`WARPOLY_HEAVY_LOCK_HELD`), não trava nem mede duas vezes. Enquanto não for regravada, o comparador de draw calls contra a baseline antiga pode acusar variação falsa: confira o relatório antes de tratar como regressão. A CI (`perf.yml`) confere só draw calls e bundle; FPS e load ficam de fora dela.

`npm run perf` passa pelo `tools/safe-run.sh` (trava global, teto de RAM, timeout de 900 s) e leva alguns minutos. Cada execução grava o relatório completo (com as amostras de cada rodada) em `tools/perf-results/` (fora do git). Saída: tabela `métrica · baseline · atual · variação · limite · status` e o veredito; a CI também escreve o resumo em markdown no job (`GITHUB_STEP_SUMMARY`). Códigos de saída: **0** ok · **1** regressão (ou métrica sem medição) · **2** erro de uso/ambiente (sem GPU, sem baseline, build ausente…).

### Protocolo de medição

- **Build de produção** (`vite build` num diretório temporário, ou `--dist` para reaproveitar o `dist/` da CI) servido por `vite preview`; Chromium headless 1280×720, um contexto novo por execução, service worker bloqueado.
- **Draw calls determinísticos.** Três fontes de variação foram eliminadas: (1) `Math.random` com semente fixa (props/árvores mudavam a contagem em até 8 % entre cargas); (2) preset de qualidade fixo (`quality=high`; senão a detecção de GPU escolhe `low` no SwiftShader e `high` na GPU real); (3) simulação congelada: o `?bench=` monta o cenário, a simulação avança exatamente 6 passos (0,3 s de jogo) e para; só então 3 quadros são amostrados (`renderer.info.render.calls`). Sem congelar, a quantidade de combate dentro da janela de medição depende do FPS (o delta por quadro é limitado a 0,1 s, então no SwiftShader a luta anda ~10× mais devagar) e o `combate100` da CI seria outro cenário. O congelamento é feito pelo próprio script (`window.game` + `gameManager.simStep`, ativado só depois que o bench montou o cenário), sem alterar código do jogo; se a simulação não parar exatamente no passo 6 a execução falha em vez de medir algo diferente.
- **FPS e load** ficam ao vivo (a simulação roda) e usam o *melhor* de N (maior FPS, menor load): ruído de CPU só piora a medida, nunca melhora.
- **Bundle**: `mainJsBytes` = chunk de entrada do `index.html`; `initialJsBytes` = entrada + chunks pré-carregados (o que o jogo baixa para abrir); também grava o gzip (informativo) e os bytes de cada chunk, para a mensagem de falha apontar quem cresceu.
- Cobertura: o preset `texq=low` desliga o pós-processamento (bloom/GTAO); regressões só desse caminho não aparecem aqui.

### Baseline

@@BASELINE@@

### CI

`.github/workflows/perf.yml` (push em `master`, PRs e manual): `npm ci` → `npm run lint` → `npx vitest run` → `npm run build` → `playwright install chromium` → `node tools/perf-budget.mjs --ci --dist dist`. O Chromium usa SwiftShader só para contar chamadas; não mede FPS nem load. O job reprova a PR se um cenário tiver mais de 10 % de draw calls que a baseline ou se o `main` (ou o JS de boot) crescer mais de 10 % em bytes.

## Página de lançamento

`index.html` já abre o menu principal do jogo (F6-01); não foi criada landing separada.
