# SESSION HANDOFF — como continuar o WarPoly numa sessão nova

> Escrito em 2026-09-29; **atualizado em 2026-10-10** (seções 2.3, 4, 5, 7 e 8). Leia este arquivo inteiro antes de agir.
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

## 5. Estado atual (2026-10-10)
- Quadro (`docs/TASKS.md`): 88 tarefas de fase — **73 DONE**, 8 REVIEW, 6 TODO, 1 DOING (F5-03, pausado). Backlog NEW: 22 DONE, 5 TODO, 1 DOING (NEW-41), 1 ADIADA (NEW-20), ~24 sem status (auditoria AUD-1 na fila da nuvem).
- Testes: **1311** passando; lint 0 erros (51 avisos antigos); build ok. Smoke: última rodada completa em F7-09; as mesclas da nuvem (2026-10-10) rodaram só `npm test`, lint e build.
- Nuvem: 11 tarefas da fila de `docs/HANDOFF_CLOUD.md` executadas e mescladas em 2026-10-10 (NEW-4/13/19/31/41/49/50/52, F9-05b, F10-05b, AUD-1). Verificação visual pendente (local) em NEW-13, NEW-19, NEW-49, NEW-52, F9-05 e F10-05.
- Entregas grandes desde 2026-09-30: F4 (cavalaria, cerco, mana/magias, sapadores, aéreo, naval com petróleo, heróis), F5 (IA por jogador, percepção sob a névoa, dificuldades), F7 (VFX, iluminação/pós-processamento, tilesets, animação de produção, team color, ícones e arte 2D, modelos Blender de navios/construções navais/acampamento/balão/muralhas/bétula), F8 (gerador de mapas, 6 mapas skirmish, missões e gatilhos, editor de mapas, campanha Aliança provisória), F9 (lockstep online com WebRTC, sinalização e lobby, reconexão e pausa votada, replays), F10 (testes da simulação, soak IA×IA com 100 partidas, regressão visual, empacotamento PWA e deploy).

## 6. Decisões do dono (resumo — detalhes em `docs/07_DECISOES.md`)
D1 pedra permanece; petróleo só com Centro nível 2 · D2 nomes próprios (nada Blizzard) · D3 hardware fraco sem perder qualidade · D4 facções **Coroa de Aldária** / **Clãs de Gorthak** · D5 Casa/Toca mantidas, **sem ouro passivo** nas fazendas · D6 heróis com reviver/XP pendentes.
Decisões pendentes (2026-10-10): F7-02 máscara de cor; F8-03 gerador `painted` em `src/sim`; F8-05 premissa da campanha Aliança; F9-03 checksum por turno ou a cada 10. Ver `docs/TASKS.md` e a seção 4 de `docs/HANDOFF_CLOUD.md`.

Parâmetros de URL úteis: `?play&faction=orc`, `?skipPreload`, `?texq=low`, `?quality=`, `?merge=0`, `?skin=0`, `?glb=0`, `?ffa=1`, `?map=ilhas-4p`, `?bench=inicial|combate100|massa300`, `?online=1` (lockstep), `?vfx=`, `?fx=`, `?daynight=`, `?team=`, `?campaign=unlock`.

## 7. Próximos passos (atualizado 2026-10-10)
1. **Dono**: decidir o push de `master` para o GitHub (repositório público) — pré-requisito da nuvem.
2. **Em andamento**: NEW-53 (correção de m04 "A Ponte do Rio Turvo": forte Atalaia humano e anel ciano dos carregadores). Ao concluir: merge, `npm test`, lint, build e captura em `tools/ui-captures/m04-fix/`.
3. **Local, retomar**: NEW-44 (IA sem madeira/naval, alterações não commitadas), F7-08 (áudio, branch `task/F7-08`), F10-04 (CI de desempenho, branch `task/F10-04`), F10-03 (regravar baseline visual).
4. **Local, Blender**: F7-01 e F7-07 (precisa de referências de arte para Refinaria, Fundição, Submersível, Tartaruga, Forja Naval e Caldeirão), revisão final da F7-00b.
5. **Nuvem**: fila de `docs/HANDOFF_CLOUD.md` seção 3 concluída. Próxima rodada: definir novas tarefas (ex.: os itens ABERTO da auditoria `docs/AUDITORIA_BACKLOG.md`) e lançar em `cloud/<ID>`.
6. **Decisões do dono**: seção 6 acima.

## 8. Estado operacional ao encerrar (2026-10-10)
- Agentes: nenhum em andamento. Dev server parado (subir com `npx vite --port 5173` em background se precisar mostrar algo).
- Git: `master` local com as últimas mesclagens; `origin/master` defasado (ver seção 4).
- Worktrees de agentes em `.claude/worktrees/` (ignoradas pelo git, ~90): limpar com `git worktree prune` depois de remover as pastas das tarefas já mescladas. Não apagar as que têm alterações não commitadas (NEW-44, F7-08, F10-04).
- Dev watcher: `vite.config.js` ignora `.claude/**`, `tools/ui-captures/**`, `tools/soak-report/**` e `tests/visual/**` (sem isso o inotify esgota com muitos worktrees).
- Limite de uso (HTTP 429) derruba agentes no meio: verifique a worktree, salve WIP com commit e **retome com `SendMessage`** para o id do agente (mantém o contexto).
- Memória do assistente: `~/.claude/projects/-home-rafael-warpoly/memory/` (objetivos, usuário, política de modelos).
