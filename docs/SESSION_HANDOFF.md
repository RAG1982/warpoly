# SESSION HANDOFF — como continuar o WarPoly numa sessão nova

> Escrito em 2026-09-29; atualizado em 2026-10-13. **Em 2026-10-13 o trabalho local do novo mundo foi mesclado no `master` e enviado ao `origin`; a nuvem entregou até o PR #51 (2026-10-12). Leia PRIMEIRO `docs/ESTADO_NUVEM.md` (estado atual) e `docs/CHANGELOG_NUVEM.md`; o que está abaixo pode estar desatualizado.** Leia este arquivo inteiro antes de agir.
> **Prompt para colar na sessão nova (local, Claude Code com Opus):**
> `Leia docs/SESSION_HANDOFF.md e continue a coordenação do projeto WarPoly a partir da seção "Próximos passos".`

---

## 1. O projeto em 5 linhas
- RTS 3D low-poly no navegador (three.js 0.186 + Vite 8, JS ES modules), inspirado em **Warcraft II**. Repositório: `/home/rafael/warpoly`, GitHub `RAG1982/warpoly` (**público**), branch `master`.
- Meta: paridade de recursos com o WC2 + qualidade AAA no navegador + rodar em hardware fraco (D3).
- Documentação (ler nesta ordem): `CLAUDE.md` → `docs/README.md` → `docs/TASKS.md` (fonte única de status) → `docs/07_DECISOES.md` → `docs/08_GAME_DESIGN.md` (design aprovado) → `docs/specs/_COMUM.md`.
- Dono do projeto: Rafael; responde em **PT-BR**; gosta de progresso rastreável em markdown e de agentes em paralelo.
- Máquina: 32 GB RAM, GPU AMD RX 7600 XT, Linux. Blender 5.2.1 em `/home/rafael/Downloads/blender-5.2.1-linux-x64/blender`.

## 2. Regras de trabalho (decididas pelo dono — obrigatórias)
1. **Sonnet 5.5 (a sessão coordenadora, decisão do dono 2026-09-30) planeja e escreve especificações.** Não implementa código (exceto correções operacionais de 1–3 linhas em ferramentas, ex. `tools/safe-run.sh`).
2. **Implementação sempre por agentes com modelo menor**, via ferramenta `Agent`:
   - `model: "sonnet"` para tarefas normais de código;
   - `model: "haiku"` para tarefas mecânicas/pequenas (ex.: F0-08, F7-00c funcionaram bem);
   - `subagent_type: "general-purpose"`, `isolation: "worktree"`, `run_in_background: true`.
   - Prompt curto padrão (funciona bem):
     ```
     Projeto WarPoly, em /home/rafael/warpoly. Você está numa git worktree isolada. Primeiro rode `git merge master` (confira que contém <ID-anterior> com `git log --oneline | grep <ID>`). Depois leia `CLAUDE.md`, `docs/specs/_COMUM.md` e `docs/specs/<ARQUIVO>.md` e execute a spec <ID> literalmente. Escreva em PT-BR. Faça commits intermediários ("<ID> wip: ...") a cada etapa concluída. Atenção: `npm run smoke` e `npm run bench` já chamam tools/safe-run.sh por dentro — rode-os direto, sem envolver em outro safe-run. Entregue commit final e relatório curto.
     ```
3. **Modelagem no Blender: Sonnet 5.5, nunca Haiku.** Liberada pelo dono em 2026-10-09 (antes adiada até o código estar pronto). Nota: `model: "haiku"` no `Agent` aponta para o **Haiku 4.5**; o Haiku 5.5 só aparece via `/model` na sessão local.
4. **Máximo 3 agentes em paralelo.** Evite dois agentes editando os mesmos arquivos (principalmente `GameManager.js`, `Unit.js`, `Building.js`, `UIManager.js`, `InputManager.js`).
5. **Recursos da máquina** (a máquina já travou por OOM): todo navegador/Playwright/Blender/bench roda via `tools/safe-run.sh` (trava global, 12 GB, sem swap). `tools/safe-run.sh` é **reentrante** (variável `WARPOLY_HEAVY_LOCK_HELD`). Scripts de navegador abortam sem GPU real (`tools/lib/assertGpu.mjs`). Nunca use `ALLOW_SOFTWARE_GL=1` em agentes.

## 3. Fluxo de uma tarefa (ciclo completo)
1. **Escrever a spec** `docs/specs/<ID>-<nome>.md` (formato: Leia antes → Por quê → "Pronto" mensurável → Contexto com caminho:linha → Implementação em passos → Não fazer → Testes → Verificação → Docs → Entrega). Colete o contexto com `grep`/`sed` antes (barato). Porta do vite exclusiva por spec (já usadas: 5174–5195; use 5196+).
2. Em `docs/TASKS.md`: status `DOING(sonnet, <data>)` e linha na tabela "Fluxo de execução atual". Commit + `git push origin master`.
3. **Disparar o agente** (prompt da seção 2).
4. Ao receber o relatório: `git merge --no-ff <branch-do-agente>` (nome da branch aparece no relatório ou em `git branch | grep worktree-agent`), depois:
   ```bash
   npm test && npm run lint && npx vite build --outDir /tmp/claude-1000/warpoly-build-check
   npm run smoke    # quando mexer em runtime/visual
   ```
   Olhe 1–2 capturas se a tarefa for visual (Read no PNG). Registre desvios aceitos e crie itens `NEW-<n>` no "Backlog descoberto" do TASKS para o que ficou pendente.
5. Em `docs/TASKS.md`: `DONE(<hash>)` + linha **Resultado**; atualize o "Quadro resumo". Commit + push.

### Armadilhas conhecidas
- **Worktree nasce de master antigo** às vezes → por isso o prompt manda `git merge master` primeiro.
- **Limite de uso (HTTP 429)** derruba agentes no meio: verifique a worktree (`git -C .claude/worktrees/agent-<id> log --oneline master..HEAD` e `status`), salve WIP com commit se necessário, e **retome com `SendMessage`** para o id do agente (mantém o contexto). Por isso pedimos commits "wip".
- **safe-run aninhado** travava (corrigido; reentrante agora).
- Agentes às vezes não batem a meta numérica: aceite o ganho real, registre `NEW-<n>` com o motivo e siga.

## 4. Trabalho na nuvem (Claude Code web)
- Roteiro e **fila atualizada**: `docs/HANDOFF_CLOUD.md` (seção 3: 11 tarefas com briefing; seção 4: o que fica no local e por quê). Prompt na nuvem: `Leia docs/HANDOFF_CLOUD.md e execute a próxima tarefa pendente da fila da nuvem, seguindo as regras do handoff.`
- **Pré-requisito**: `git push origin master` (ação do dono). O `origin/master` está em `a801c47`, defasado.
- Nuvem **não tem GPU nem Blender**: só `npm test`, lint e build; a verificação visual/benchmark fica "pendente local".
- Nuvem cria branch `cloud/<ID>` + PR; **o coordenador local faz o merge** (`git fetch origin && git merge --no-ff origin/cloud/<ID>`), verifica e registra no TASKS.

## 5. Estado atual (2026-10-13)
- Testes no `master` após a integração local: **149 arquivos / 1897 testes, 0 falhas**; lint 0 erros (53 avisos; 2 deles em `tools/ui-captures/revisao-2026-10-11/`, sem efeito); build ok. Smoke, bench, visual e áudio não foram vistos num navegador nesta rodada: roteiro em `docs/ESTADO_NUVEM.md` §6.
- Quadro e estados por tarefa: `docs/TASKS.md` (quadro atualizado em 2026-10-13; itens do novo mundo na seção "Novo mundo", com PARCIAL/DONE por passo).
- Integrado em 2026-10-13: `task/mundo-2026-10-13` (arte e decisões de mapa `cc0c505`; código e dados do novo mundo `b73fd57`; docs da nuvem `7497c72`; esta rodada de docs) e `task/revisao-visual-2026-10-11` (NEW-13 e NEW-19, verificados em 2026-10-11).
- Enviado ao `origin` **sem mesclar**: `task/F7-08-verificacao` (WIP de áudio; conflita com o motor de música). `cloud/F3-01` segue superado.
- Nada local ficou só no computador: as alterações não commitadas dos worktrees foram commitadas nas branches delas (ver §8).

## 6. Decisões do dono (resumo — detalhes em `docs/07_DECISOES.md`)
D1 pedra permanece; petróleo só com Centro nível 2 · D2 nomes próprios (nada Blizzard) · D3 hardware fraco sem perder qualidade · D4 facções **Coroa de Aldária** / **Clãs de Gorthak** · D5 Casa/Toca mantidas, **sem ouro passivo** nas fazendas · D6 heróis com reviver/XP pendentes.
Decisões de 2026-10-11/12 (todas tomadas): F7-02 fica como está (`TeamColor`); F8-03 `painted` fica em `src/sim`; F8-05 premissa "A Marcha da Aliança" aprovada; F9-03 `checkEvery = 10` em jogo; NEW-1 remover o loader; PR #6 fechado; **novo mundo** (Ondara, 2 campanhas espelhadas de 12 missões, 6 heróis, costas irregulares, lava que só bloqueia) — ver `docs/ESTADO_NUVEM.md` §5 e `docs/specs/MUNDO-*.md`. Ainda aberta: NEW-6 passo 2 (ORM à metade do lado em `high`).

Parâmetros de URL úteis: `?play&faction=orc`, `?skipPreload`, `?texq=low`, `?quality=`, `?merge=0`, `?skin=0`, `?glb=0`, `?ffa=1`, `?map=ilhas-4p`, `?bench=inicial|combate100|massa300`, `?online=1` (lockstep), `?vfx=`, `?fx=`, `?daynight=`, `?team=`, `?campaign=unlock`.

## 7. Próximos passos (atualizado 2026-10-13)
1. **Dono, local**: `git pull`, `npm ci`, `npm test` (esperado 149/1897), lint e build; depois **jogar e conferir**: tela de história, seletor de campanhas e trilha "Clássica (beta)", mapa-múndi, mina que desaba (NEW-54), as 8 missões da Aliança e o que a nuvem entregou sem ver (`docs/ESTADO_NUVEM.md` §6). Regravar baselines (`npm run perf -- --update`, `npm run visual -- --update`), rodar `tools/audio-check.mjs` e decidir sobre `task/F7-08-verificacao`.
2. **Novo mundo, passos locais** (`docs/TASKS.md`, "Novo mundo"): promover o gerador de costa a `src/data/maps/coast/` (MUNDO-1); render regional por bioma e da lava (MUNDO-1, MUNDO-5); mapas por ilha e por tipo (MUNDO-7); testes de cobertura e progressão das 24 missões (MUNDO-6); modelos 3D e retratos finais dos 6 heróis (Blender).
3. **Nuvem**: fila em `docs/HANDOFF_CLOUD.md` §3c. Os dados do novo mundo já estão feitos localmente; a nuvem pega só o que segue pendente (NEW-6 passos 1, 4, 5; NEW-14 passos 0–2 e 5–6; NEW-51). Ler `docs/ESTADO_NUVEM.md` antes.
4. **Local, desempenho**: F1-10c (bench massa300 ≥ 45 FPS, com e sem `?lod=0`), NEW-15/27/30. NEW-35 e NEW-52 com verificação incompleta.
5. **Blender (local)**: F7-01, F7-07, F7-00b remanescentes, F7-09, javali (ART-04), retratos e modelos dos 6 heróis, artes de vitória, ART-01..16 de terreno.
6. **Decisões do dono**: seção 6; perguntas abertas do novo mundo em `MUNDO-HISTORIA-CAMPANHA.md` §10 e `MUNDO-TERRENO-MAPAS.md` §8; faixas de música no inspetor (prioridade baixa); se a F8-06 (Horda de 8 missões, "Clássica (beta)") ainda será feita, já que a Horda do novo mundo é `war-horde`.

## 8. Estado operacional (2026-10-10; ainda válido, exceto o git)
- Agentes: nenhum em andamento. Dev server parado (subir com `npx vite --port 5173` em background se precisar mostrar algo).
- Git (2026-10-13): `origin/master` contém o trabalho desta rodada (ver §5). Confira `git status` e `git log origin/master..master` antes de começar.
- Worktrees de agentes em `.claude/worktrees/` (ignoradas pelo git, ~90): limpar com `git worktree prune` depois de remover as pastas das tarefas já mescladas. Antes de apagar uma, conferir `git -C <wt> status`. Em 2026-10-13 as alterações não commitadas de `agent-a1bf74ec9095ea73d` foram commitadas em `task/revisao-visual-2026-10-11` (mesclada) e as de `agent-a845b4e0a2ec7d5f7` em `task/F7-08-verificacao` (enviada, não mesclada). As capturas e scripts soltos de `agent-a810c4ef8a851f926` (NEW-17) foram commitados e enviados como `task/NEW-17-capturas`. Os worktrees `agent-a5e7948a43999d191`, `agent-ab6decfcb4ebfb5fc` e `agent-accf8e08d85e2392f` têm só `node_modules` (não versionado).
- Dev watcher: `vite.config.js` ignora `.claude/**`, `tools/ui-captures/**`, `tools/soak-report/**` e `tests/visual/**` (sem isso o inotify esgota com muitos worktrees).
- Limite de uso (HTTP 429) derruba agentes no meio: verifique a worktree, salve WIP com commit e **retome com `SendMessage`** para o id do agente (mantém o contexto).
- Memória do assistente: `~/.claude/projects/-home-rafael-warpoly/memory/` (objetivos, usuário, política de modelos).
