# SESSION HANDOFF — como continuar o WarPoly numa sessão nova

> Reescrito em 2026-10-17 (M0-02). **A execução atual está em [PLANO_FINAL.md](PLANO_FINAL.md)** (marcos M0–M6, decisões, quadro) e as fichas em [PLANO_FINAL_TAREFAS.md](PLANO_FINAL_TAREFAS.md). A versão longa deste arquivo (nuvem, armadilhas, estado de 2026-10-16) está em [historico/SESSION_HANDOFF_ate_2026-10-17.md](historico/SESSION_HANDOFF_ate_2026-10-17.md).
> Prompt para colar numa sessão nova: `Leia docs/SESSION_HANDOFF.md e docs/PLANO_FINAL.md e continue a coordenação do WarPoly a partir do primeiro item não concluído do quadro da §6.`

## 1. O projeto
- RTS 3D low-poly no navegador (three.js 0.186 + Vite 8, JS ES modules), inspirado em **Warcraft II**. Repositório `/home/rafael/warpoly`, GitHub `RAG1982/warpoly`, branch `master`.
- Meta: paridade de recursos com o WC2 ([05_PARIDADE_WARCRAFT2](05_PARIDADE_WARCRAFT2.md), ~83 % ✅) + qualidade AAA + hardware fraco (D3).
- Dono: Rafael; responde em **PT-BR**; quer progresso rastreável em markdown e agentes em paralelo.
- Máquina: 32 GB RAM, GPU AMD RX 7600 XT, Linux. Blender 5.2.1 em `/home/rafael/Downloads/blender-5.2.1-linux-x64/blender`.
- Leitura, nesta ordem: `CLAUDE.md` → `docs/README.md` → `docs/PLANO_FINAL.md` → `docs/07_DECISOES.md` → `docs/specs/_COMUM.md`.

## 2. Regras de trabalho (decididas pelo dono)
1. **Sonnet 5.5** planeja, escreve especificações/fichas e coordena; a execução de código vai para agentes `sonnet` (ou `haiku` só em tarefas marcadas **H**). **Modelagem 3D/Blender: Sonnet 5.5, nunca Haiku.**
2. Agentes via ferramenta `Agent`: `subagent_type: general-purpose`, `isolation: worktree`, em segundo plano. **No máximo 3 em paralelo**; evite dois agentes nos mesmos arquivos (`GameManager.js`, `Unit.js`, `Building.js`, `UIManager.js`, `InputManager.js`).
3. **Uma tarefa = uma branch `task/<ID>` = uma ficha.** O coordenador mescla `--no-ff` no `master` sem perguntar, depois de `npm test`, `npm run lint` e o build; o agente não edita `PLANO_FINAL.md` nem `TASKS.md`.
4. **Máquina (OOM já travou em 2026-09-28):** navegador, Playwright, Blender, `bench`, `smoke`, `visual`, `perf` só por `bash tools/safe-run.sh [--mem 12G] [--timeout S] -- <comando>` (trava global de 1 processo pesado, teto de 12 GB). `smoke` e `bench` já chamam o safe-run: rode direto. Scripts de navegador abortam sem GPU real (`tools/lib/assertGpu.mjs`); nunca use `ALLOW_SOFTWARE_GL=1`. Encerre vite e navegadores ao terminar.
5. Conteúdo novo em **pt-BR e en**; sem nomes/lore da Blizzard; sem `Math.random`/`Date.now` em `src/sim` e `src/ai`.

## 3. Comandos
- Dev: `npx vite --port 5173` (jogo em `/`, inspetor em `/inspector.html`; `?skipPreload`, `?texq=low`, `?faction=orc`, `?map=<id>`, `?bench=…`, `?online=1`).
- Verificação mínima: `npm test && npm run lint && npx vite build --outDir /tmp/claude-1000/warpoly-build-check` (+ `npm run smoke` se mexer em runtime/visual).
- Partida IA×IA headless: `node tools/headless-match.js --seed 1`. Soak: `node tools/soak.mjs`. Visual: `npm run visual`. Desempenho: `npm run perf`.
- Console do navegador: `window.game`, `window.inspectorApp`, `game.sceneManager.renderer.info`.

## 4. Como disparar uma tarefa
Prompt padrão (está no Preâmbulo de `PLANO_FINAL_TAREFAS.md`): worktree isolada em `task/<ID>`, `git merge master`, ler `CLAUDE.md`, `docs/specs/_COMUM.md`, o Preâmbulo e a ficha, executar só aquela ficha, commits `"<ID> wip: ..."`, relatório de até 25 linhas. Ao receber o relatório: `git merge --no-ff task/<ID>`, rodar a verificação mínima, olhar 1 ou 2 capturas se for visual e atualizar o quadro da §6 do `PLANO_FINAL.md`.

## 5. Estado do git (após M0-01, 2026-10-17)
- `master` único para o trabalho concluído. Branches locais restantes são só as com trabalho **não mesclado** (todas também no `origin`): `task/F7-08-verificacao` (WIP de áudio), `task/NEW-55-*` e `task/diag-ilhas4p*` (diagnóstico de `ilhas-4p`), `task/P14-todos-mapas` (teste P-14, necessário para a M1-07) e `backup/pre-aaa-2026-09-28` (não mexer).
- Worktrees: o principal, as do diagnóstico/NEW-55/P-14 e a de cada agente em execução. Para limpar de novo, remova só worktrees sem alterações (`git worktree remove`, sem `--force`) cujas branches estejam mescladas no `master`.
- Estado de testes na M0: 159 arquivos / 2185 testes, 0 falhas; lint 0 erros; build ok.
- `vite.config.js` ignora `.claude/**`, `tools/ui-captures/**`, `tools/soak-report/**` e `tests/visual/**` (evita esgotar o inotify com muitos worktrees).

## 6. Armadilhas conhecidas
- Worktree às vezes nasce de `master` antigo: sempre `git merge master` primeiro.
- Limite de uso (HTTP 429) derruba agentes no meio: confira a worktree (`git log --oneline master..HEAD`, `git status`), salve WIP em commit e retome com `SendMessage` para o id do agente.
- Agentes às vezes não batem a meta numérica: aceite o ganho real, registre o motivo no relatório e abra a próxima ficha (regra 9 do Preâmbulo).
- Memória do assistente: `~/.claude/projects/-home-rafael-warpoly/memory/`.
