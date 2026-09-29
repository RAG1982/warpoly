# SESSION HANDOFF — como continuar o WarPoly numa sessão nova

> Escrito em 2026-09-29 ao encerrar a sessão de coordenação. Leia este arquivo inteiro antes de agir.
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
1. **Opus (a sessão coordenadora) só planeja e escreve especificações.** Não implementa código (exceto correções operacionais de 1–3 linhas em ferramentas, ex. `tools/safe-run.sh`).
2. **Implementação sempre por agentes com modelo menor**, via ferramenta `Agent`:
   - `model: "sonnet"` para tarefas normais de código;
   - `model: "haiku"` para tarefas mecânicas/pequenas (ex.: F0-08, F7-00c funcionaram bem);
   - `subagent_type: "general-purpose"`, `isolation: "worktree"`, `run_in_background: true`.
   - Prompt curto padrão (funciona bem):
     ```
     Projeto WarPoly, em /home/rafael/warpoly. Você está numa git worktree isolada. Primeiro rode `git merge master` (confira que contém <ID-anterior> com `git log --oneline | grep <ID>`). Depois leia `CLAUDE.md`, `docs/specs/_COMUM.md` e `docs/specs/<ARQUIVO>.md` e execute a spec <ID> literalmente. Escreva em PT-BR. Faça commits intermediários ("<ID> wip: ...") a cada etapa concluída. Atenção: `npm run smoke` e `npm run bench` já chamam tools/safe-run.sh por dentro — rode-os direto, sem envolver em outro safe-run. Entregue commit final e relatório curto.
     ```
3. **Modelagem no Blender adiada** até todo o código estar pronto (F7-00b, F7-09 e demais ART em `ADIADA`). Quando voltar, Blender fica com Opus.
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
- Roteiro: `docs/HANDOFF_CLOUD.md`. Prompt na nuvem: `Leia docs/HANDOFF_CLOUD.md e execute a próxima tarefa pendente da fila da nuvem, seguindo as regras do handoff.`
- Nuvem **não tem GPU**: só `npm test`/lint/build; verificação visual fica "pendente local".
- Nuvem cria branch `cloud/<ID>` + PR; **o coordenador local faz o merge** (`git fetch origin && git merge --no-ff origin/cloud/<ID>`), verifica, fecha o PR se o GitHub não fechar sozinho, e atualiza `HANDOFF_CLOUD.md` (fila) e `TASKS.md`.
- Fila atual da nuvem (ainda **não iniciada**): **F3-01** controles RTS + NEW-16 (`docs/specs/F3-01-controles-rts.md`) → **F6-08** menu de opções (`docs/specs/F6-08-opcoes.md`). Mantenha a tabela "O que está rodando localmente" do handoff da nuvem atualizada para evitar conflitos.

## 5. Estado atual (master `e1ec049`, tudo no GitHub)
Quadro: F0 7/7 · F1 9/10 · F2 6/8 · F3 1/11 (F3-00 design aprovado) · F6 2/9 · F7 1/11 (Blender PoC aprovado) · demais 0.
Testes: **222** passando; lint 0 erros (~25 avisos antigos); build ok; smoke ok.

Entregas principais já no master:
- Desempenho: texturas por qualidade (`?texq=`), presets gráficos (`?quality=`), sombras seletivas, mesclagem estática (`?merge=0`), unidades SkinnedMesh rígido (`?skin=0`), pools/sem vazamentos, grade espacial, pathfinder com heap/obstáculos dinâmicos/orçamento por nós, **tick fixo 20 Hz** com interpolação e LOD de animação. Cena inicial ~120 FPS; combate100 ~37–43 FPS (meta 50 → NEW-15); massa300 ~19 FPS (limitado por draw calls das unidades).
- Núcleo: jogadores/IDs/`MatchConfig` (`?ffa=1`), máquina de estados + partidas sem reload + pausa, **comandos** (`gm.issue`, stop/hold/attack-move/patrol, shift-queue), **determinismo** (RNG com seed, checksum, modo headless — partida IA×IA de 10 min em ~1 s), **event bus** (simulação não chama som/VFX/UI), **mapas por dados** (`continental-1v1`, `ilhas-4p`, `?map=`).
- UX/arte: menu principal + escaramuça com lista de mapas, névoa de guerra por shader (3 estados + fantasmas), HUD responsiva com card 3×3/tooltips/seleção múltipla, modelos Blender Grunt e Castelo **ligados por padrão** (`?glb=0` desliga).

Parâmetros de URL úteis: `?play&faction=orc`, `?skipPreload`, `?texq=low`, `?quality=`, `?merge=0`, `?skin=0`, `?glb=0`, `?ffa=1`, `?map=ilhas-4p`, `?bench=inicial|combate100|massa300`.

## 6. Decisões do dono (resumo — detalhes em `docs/07_DECISOES.md`)
D1 pedra permanece; petróleo só com Centro nível 2 · D2 nomes próprios (nada Blizzard) · D3 hardware fraco sem perder qualidade · D4 facções **Coroa de Aldária** / **Clãs de Gorthak** · D5 Casa/Toca mantidas, **sem ouro passivo** nas fazendas · D6 heróis na campanha **e** escaramuça (1 por jogador, Centro nível 2, opção "Sem heróis") · D7 nomes de `08_GAME_DESIGN.md` aprovados.

## 7. Próximos passos (ordem recomendada)
1. **F3-04 Economia WC2** — o dono pediu para começar. Escrever `docs/specs/F3-04-economia.md` a partir de `08_GAME_DESIGN.md` §2/§4:
   - trabalhador **entra na mina** (~1,5 s, 1 por vez, fila; mina esgota com aviso); pedreira 2 simultâneos;
   - florestas densas **bloqueiam passagem** e abrem ao cortar (integrar com `Pathfinder.blockCircle` da F1-07 e `blockerGrid` da F1-06);
   - **remover ouro passivo** de Fazenda/Chiqueiro (`passiveIncome` em `src/data/buildings.js`); Casa/Toca mantidas;
   - Fazenda/Chiqueiro como **requisito do Quartel** (campo `requires` novo em `src/data/buildings.js`, validado no `CommandExecutor` e no card da HUD);
   - carga por viagem 10/10/8; bônus de Serraria/Centro previstos (deixar campos de multiplicador em dados);
   - manter determinismo (`tests/unit/determinism.test.js` pode mudar os valores esperados — regravar baseline e justificar);
   - IA (`src/ai/**`) adaptada às novas regras (esperar Fazenda antes do Quartel, lidar com fila da mina).
   Executor: **sonnet**. Evitar conflito com F3-01 da nuvem (InputManager/UIManager) — mudanças mínimas no card.
2. **F3-03 Combate** (fórmula básico+perfurante com `gm.rng`, tipos de dano, armadura em construções → B5).
3. **F3-06 Níveis do Centro + requisitos** e **NEW-3/F6-09**: nomes novos (`src/data/names.js`) na UI.
4. Em seguida: F3-07 pesquisas em níveis → F3-08 muralhas → F3-05 reparo → F3-09 vitória/estatísticas → F3-10 neutros → F4 (cavalaria, cerco, magias, aéreo, naval/petróleo, heróis) → F5 IA (dificuldades, build orders, micro, névoa) → F6 restante → F8 conteúdo → F9 multiplayer → F10 release. Blender (F7-00b…) só no fim.
5. Pendências pequenas boas para **haiku** ou nuvem: NEW-18 (card vazio esticado), NEW-17 (pintura do terreno por altura), NEW-10 (animação de ataque), NEW-1 (GLTFBuildingLoader), NEW-6 (ORM de texturas).

## 8. Estado operacional ao encerrar
- Nenhum agente rodando; dev server local parado (subir com `npx vite --port 5173` em background se precisar mostrar algo ao dono).
- PRs #1–#3 da nuvem já mesclados; branches `origin/cloud/{BUGS-01,F1-07,F6-03}` podem ser apagadas.
- Muitas worktrees antigas em `.claude/worktrees/` (ignoradas pelo git); podem ser limpas com `git worktree prune` após remover as pastas das tarefas já mescladas.
- Memória do assistente: `~/.claude/projects/-home-rafael-warpoly/memory/` (objetivos, usuário, política de modelos).
