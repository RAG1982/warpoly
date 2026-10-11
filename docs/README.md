# Documentação do WarPoly

RTS 3D low-poly para navegador (three.js + Vite), inspirado em **Warcraft II**. Meta: paridade de recursos com o WC2 e qualidade AAA no navegador.

| Doc | Conteúdo |
|---|---|
| [01_ARQUITETURA](01_ARQUITETURA.md) | Stack, diretórios, loop, modelo de dados, acoplamentos |
| [02_MECANICAS](02_MECANICAS.md) | Regras atuais: recursos, unidades, construções, pesquisas, IA, controles |
| [03_ASSETS_E_INSPETOR](03_ASSETS_E_INSPETOR.md) | Pipeline de modelos/texturas, inspetor, métricas por modelo |
| [04_DIAGNOSTICO](04_DIAGNOSTICO.md) | Medições de desempenho, bugs (B1–B17), lacunas AAA |
| [05_PARIDADE_WARCRAFT2](05_PARIDADE_WARCRAFT2.md) | Matriz de recursos do WC2: existe / parcial / falta |
| [06_ROADMAP_AAA](06_ROADMAP_AAA.md) | Visão, fases F0–F10, caminho crítico, decisões de arquitetura |
| [07_DECISOES](07_DECISOES.md) | Decisões do dono: recursos, nomes próprios, alvos de hardware |
| [08_GAME_DESIGN](08_GAME_DESIGN.md) | Design de jogo F3-00 (facções, economia, níveis, unidades, magias) — proposta v1 |
| [09_MULTIPLAYER](09_MULTIPLAYER.md) | Multiplayer lockstep (F9-01): turnos, checksum/desync, WebRTC, lobby, reconexão, replays, PoC |
| [SESSION_HANDOFF](SESSION_HANDOFF.md) | **Comece aqui numa sessão nova**: estado, regras, fluxo de agentes, próximos passos |
| [HANDOFF_CLOUD](HANDOFF_CLOUD.md) | Roteiro para executar tarefas no Claude Code online (nuvem) |
| [ESTADO_NUVEM](ESTADO_NUVEM.md) | Estado para a nuvem: pronto, com falha, não iniciado; branches com trabalho parcial |
| [CHANGELOG_NUVEM](CHANGELOG_NUVEM.md) | O que foi feito na nuvem (PRs mesclados e pendentes) e planos |
| [specs/](specs/README.md) | Especificações por tarefa com status (índice em `specs/README.md`) |
| [TASKS](TASKS.md) | **Lista de tarefas controlada**: protocolo, lanes/agentes, ondas paralelas, status |

Backups: `~/warpoly_backups/warpoly_full_2026-09-28.tar.gz` e branch `backup/pre-aaa-2026-09-28`.

## Regressão visual (F10-03)

`npm run visual` captura todos os modelos do catálogo do inspetor (`MODEL_CATALOG`, 107 alvos após a limpeza da F7-00b; a baseline antiga tem 127) e três telas da HUD (menu principal, escaramuça, partida curta) em 1280×720, 1920×1080 e 390×844. Compara com a baseline local em `tests/visual/baseline/` (os ~109 MB de PNG NÃO ficam no git — só o `manifest.json`; gere com `npm run visual -- --update` na primeira vez; sem baseline o script aborta com instrução) e gera `tools/visual-report/index.html` com diffs por imagem (pasta ignorada pelo git).

- Regravar a baseline (só depois de validar o master): `bash tools/safe-run.sh --timeout 1800 -- node tools/visual-regress.mjs --update`.
- Filtros para lotes: `--res 1280x720`, `--only <regex>` (ex.: `--only 'inspector/knight$'`). Rodada sem filtro reinicia o relatório.
- Limiar: um pixel conta como diferente se o maior delta entre canais passar de 24; a imagem falha se mais de 0,2 % dos pixels forem diferentes (`--pixel-tol`, `--max-ratio`). A partida curta usa 1 % (água, fogo e unidades animam em tempo real).
- Determinismo: `Math.random` vira PRNG com semente fixa em cada página; a prévia 3D do menu tem o laço de animação congelado no screenshot.
- Exige GPU real (aborta em SwiftShader/llvmpipe via `tools/lib/assertGpu.mjs`). Codec PNG e comparador em `tools/lib/` (sem dependência nova); testes em `tests/unit/visualCompare.test.js`.
- `tests/visual/baseline/manifest.json` registra Chromium e GPU da baseline; o script avisa se a GPU mudar. A baseline só vale para essa combinação GPU+Chromium.

## Orçamento de desempenho (F10-04)

`npm run perf` (`tools/perf-budget.mjs`, dentro do safe-run) mede draw calls, FPS, tempo de load e tamanho do bundle JS e compara com `tests/perf/baseline.json` (poucos KB, só números + manifesto de hardware/Chromium); sai com código 1 se qualquer métrica piorar mais de 10 %. Exige GPU real; `npm run perf -- --update` regrava a baseline. A CI (`.github/workflows/perf.yml`, sem GPU) roda `--ci`: só draw calls (determinísticos: `Math.random` semeado, preset fixo, sim congelada) e bundle — FPS e load saem como `null` com o motivo e são checados localmente. Protocolo, uso e como regravar a baseline: [10_DEPLOY](10_DEPLOY.md#orçamento-de-desempenho-f10-04).
