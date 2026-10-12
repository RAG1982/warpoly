# HANDOFF — Execução no Claude Code online (nuvem)

> Roteiro para rodar parte do trabalho no **Claude Code na web** (claude.ai/code) sobre `github.com/RAG1982/warpoly`, em paralelo ao trabalho local do dono.
> **Prompt a colar na sessão online:**
> `Leia docs/HANDOFF_CLOUD.md e execute a próxima tarefa pendente da fila da nuvem, seguindo as regras do handoff.`
>
> Atualizado em 2026-10-10. Antes de qualquer sessão na nuvem: o `master` local precisa estar no GitHub (ver seção 0).

## 0. Pré-requisito: o `master` no GitHub
O `origin/master` está defasado (`a801c47`). A nuvem parte do `master` do GitHub, então **sem push, a nuvem trabalha sobre código velho**.
- Ação do dono: `git push origin master` (o repositório é **público**: antes de publicar, confirme que tudo que está no histórico pode ser público — inclui a baseline visual antiga de 109 MB, que continua no histórico).
- Depois do push, cada tarefa abaixo parte de `master` atualizado.

> **Leia também `docs/ESTADO_NUVEM.md`** (pronto / falha / não iniciado; branches `task/*` com trabalho parcial).

## 1. Contexto rápido
WarPoly: RTS 3D low-poly no navegador (three.js 0.186 + Vite 8, JS ES modules), inspirado em Warcraft II. Leia nesta ordem: `CLAUDE.md` → `docs/README.md` → `docs/TASKS.md` (seção da tarefa) → `docs/specs/_COMUM.md` (se houver spec) → o briefing desta fila.
Cada tarefa desta fila traz o briefing completo (objetivo, arquivos, aceite). Quando houver spec em `docs/specs/`, ela prevalece.

## 2. Regras específicas da nuvem
- **Sem GPU e sem navegador**: NÃO rode `npm run smoke`, `npm run bench`, `npm run visual`, Playwright, Blender nem `tools/safe-run.sh` (usa `systemd-run`, indisponível no container). NÃO use `ALLOW_SOFTWARE_GL=1`.
- **Processos Node puros** (ex.: `node tools/soak.mjs --count ≤ 10`) são permitidos, com tempo curto.
- **Verificação na nuvem** = somente:
  ```bash
  npm ci
  npm test
  npm run lint          # 0 erros
  npx vite build --outDir /tmp/build-check
  ```
  Tudo que o aceite pedir de verificação visual, desempenho ou navegador entra no relatório como **"Verificação pendente (local)"**, com o passo a passo para o dono rodar.
- **Branch e PR**: uma branch por tarefa, `cloud/<ID>`, a partir do `master` mais recente. Ao terminar: push e **Pull Request** para `master` com o relatório no corpo. **Não faça merge**; o coordenador local revisa e mescla.
- **Não edite** `docs/TASKS.md` nem `CLAUDE.md` (mudam localmente o tempo todo → conflitos). Status e resultado são registrados pelo coordenador ao mesclar.
- **Arquivos em edição local agora** (não toque; se a tarefa exigir, pare e relate): `src/ai/**` (NEW-44, trabalho não commitado), `src/sim/missions/**`, `src/data/campaigns/alliance/m04-*.json`, `src/render/UnitView.js` (NEW-53, correção de m04).
- Modelo recomendado: **Sonnet**. Commits terminam com `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Idioma: PT-BR em código de UI, docs e relatório.

## 3. Fila da nuvem (execute em ordem; pegue a primeira sem branch/PR `cloud/<ID>`)

> **Estado em 2026-10-10:** as 11 tarefas da fila foram executadas na nuvem e mescladas no `master` local (PRs #5 e #7–#16; NEW-19 entrou pela branch `cloud/NEW-19`). Verificação visual/navegador pendente (local) em NEW-13, NEW-19, NEW-49, NEW-52, F9-05 e F10-05. A fila abaixo fica como registro; para a próxima rodada, use a seção 4 e o TASKS.
Para saber o que já foi feito: `git ls-remote --heads origin 'cloud/*'` e o histórico do `master`.

| # | ID | Tarefa | Arquivos | Aceite |
|---|---|---|---|---|
| 1 | NEW-50 | `lobby.js`: aviso de erro (`#status`, ex.: "Nem todos estão prontos.") não é limpo ao receber `start`/`room` | `src/net/lobby.js` + teste | aviso some ao receber `start`/`room`; teste unitário |
| 2 | NEW-31 | `tools/check-data-parity.mjs` quebrado (`blockerGrid` indefinido no mock) | `tools/check-data-parity.mjs` | `node tools/check-data-parity.mjs` roda sem exceção |
| 3 | NEW-4 | `Pathfinder.hasLineOfSight` devolve `false` para pontos idênticos (0/0 = NaN em `t`) | `src/sim/Pathfinder.js` + teste | ponto idêntico tem resultado definido; determinismo intacto (`determinism.test.js`) |
| 4 | NEW-41 | Intermitência de testes (timeout de 5 s sob carga: `fogOfWar` dispose, `campaignPlaythrough` "03 Muralhas") | testes e, se preciso, causa | 3 rodadas completas de `npm test` sem falha de timeout |
| 5 | F9-05b | Replays de partida **online**: gravar `takeLog` (quedas/saídas viram IA) para o replay reproduzir a partida | `src/replay/**`, `src/net/GameSimAdapter.js` (só leitura se possível), testes | teste em Node com `MemoryTransport`: partida com queda gera replay que reproduz os checksums |
| 6 | F10-05b | Code-splitting por facção/modelos (pendência da F10-05) | `vite.config.js`, `src/entities/glbModels.js` (preload) | `npx vite build` gera chunks por facção; `npm test` verde; a verificação de carga fica pendente (local) |
| 7 | NEW-49 | Golpe do Arremessador: `applyAxethrowerFight` não define `weaponR.rotation.x` na fase 0,60–0,78 | `src/animation/UnitAnimator.js` + teste de amostragem | amostragem da fase sem salto; teste verde. Captura: pendente (local) |
| 8 | NEW-52 | Juncos (`Water.createReeds`) em terra seca no `continental-1v1`: posições fixas do mapa antigo | `src/world/Water.js` + teste de posição | juncos só em água rasa; teste verde. Captura: pendente (local) |
| 9 | NEW-13 | Névoa: chamas de construções inimigas na memória continuam animando (`Building.js` não checa visibilidade) | camada de render da névoa/construção | chamas de memória não animam; determinismo intacto |
| 10 | NEW-11 | Deprecações three 0.186 (`THREE.Clock`, `PCFSoftShadowMap`) | render | se já não existir no `src/`, feche com evidência (grep); senão troque |
| 11 | AUD-1 | **Auditoria do backlog** NEW-1…NEW-35 sem status registrado no TASKS | `docs/AUDITORIA_BACKLOG.md` (novo) | para cada item: FEITO (com commit), ABERTO (com arquivo:linha) ou OBSOLETO. **Só documento; não corrija.** |

Após a fila acima:
- **F8-06** (campanha Horda, 8+ missões, CONTENT): só depois que o dono aprovar a premissa da campanha Aliança (F8-05). Briefing será escrito nesse momento.
- **NEW-2** (IA reembolsa custo errado em `AIEconomyManager.placeBuilding`): depois do NEW-44 (mesmo arquivo, `src/ai/**`).
- **NEW-20** (teste intermitente, spec `docs/specs/NEW-20-teste-intermitente.md`): adiado pelo dono; só se ele reativar.

## 3b. Fila da nuvem — rodada 2 (atualizada 2026-10-10)
Mesmas regras da seção 2. Cada item tem briefing próprio; pegue o primeiro sem branch/PR `cloud/<ID>`.
Antes de iniciar um item que toca `src/sim/` ou `src/ai/`: confirme que o `master` no GitHub está atualizado.

| # | ID | Briefing (resumo) | Arquivos | Aceite na nuvem |
|---|---|---|---|---|
| 1 | NEW-41 | Descobrir a causa da intermitência de `tests/unit/fogOfWar.test.js` ("dispose … uniform de textura trocado"): suspeita de estado global `fogUniforms` compartilhado. Corrigir a causa, não só o timeout. | `src/render/fogOfWar*`, teste | 10 execuções isoladas e 3 da suíte completa sem falha |
| 2 | NEW-7 | `TreeManager` cria `InstancedMesh` de 120 instâncias por tipo (vagas com escala 0) e esfera de culling do mapa inteiro. Dimensionar pela contagem real e/ou dividir em chunks. | `src/world/TreeManager.js` + teste | teste de contagem e culling; sem mudança visual (captura local) |
| 3 | NEW-29 | Trocar `name:` de `src/data/buildings.js` ("Castelo Real", "Forja Real", "Grande Salão Orc"…) pelos nomes de nível de `src/data/tiers.js` (Paço Real, Salão do Clã, Ferraria Real…), com i18n pt-BR/en. | `src/data/buildings.js`, `src/i18n/*.json`, teste | teste de consistência nome ↔ tiers; sem chave ausente |
| 4 | NEW-35 | Ataque no chão do cerco (clique direito no chão): novo comando `ATTACK_GROUND` em `src/sim/commands.js` e `CommandExecutor`, input em `InputManager`. Determinístico. | `src/sim/commands.js`, `CommandExecutor.js`, `InputManager.js`, testes | `commands.test.js` cobre validação; `determinism.test.js` verde |
| 5 | NEW-26 | Card de inspeção para unidade/construção neutra (bandido): `GameManager.selectSingle` só aceita o jogador local hoje. Permitir inspeção (sem comandos) de neutros. | `src/sim/GameManager.js` (mínimo), `src/ui/UIManager.js` | teste de seleção de neutro; sem comando emitido |
| 6 | NEW-24 | Muralha: portão visual entre segmentos e segmentos no minimapa (`UIManager.drawMinimap`). | `src/render/**`, `src/ui/UIManager.js` | teste de posição do portão; captura pendente (local) |
| 7 | F9-03 *(decidido 2026-10-11: manter `checkEvery = 10`; nada a fazer)* | Sem mudança de código. | `src/net/LockstepSession.js` | `lockstepNet.test.js` verde |

Dependem de outra decisão ou de tarefa anterior (não lançar ainda):
- **NEW-44** (IA sem madeira/naval) e **NEW-25**, **NEW-34** (IA): mexem em `src/ai/**`. Só depois de o dono confirmar que o WIP local não será usado. Validação: soak Node com ≤ 10 partidas por configuração, A/B. Depois, **NEW-51** (seed 82).
- **F8-06** (campanha Horda): premissa da Aliança (F8-05) **aprovada em 2026-10-11**; o briefing da F8-06 ainda precisa ser escrito.
- **F8-03** (`painted`): decidido em 2026-10-11 — fica em `src/sim`; nada a fazer.
- **NEW-1** (`GLTFBuildingLoader`): decidido remover em 2026-10-11 (PR `cloud/NEW-1-remove-loader`).
- **F7-08** (áudio) e **F10-04** (CI de desempenho): branches `task/F7-08` e `task/F10-04` no GitHub, **uso autorizado em 2026-10-11** (retomar com `git checkout -b cloud/<ID> origin/task/<nome> && git merge origin/master`).
- **F1-10** (LOD e culling), **NEW-6** (ORM e texturas), **NEW-14** (CPU da animação): precisam de spec antes (Sonnet escreve em `docs/specs/`).

## 3c. Fila da nuvem — rodada 4 (2026-10-12; todo o trabalho anterior está mesclado)
Estado completo em [ESTADO_NUVEM](ESTADO_NUVEM.md). Pegue o primeiro item sem branch/PR.
| # | ID | Briefing | Depende de |
|---|---|---|---|
| 1 | MUNDO-1 | Gerador de mapas de costa irregular + `lavaGrid`/`Terrain.isLava` + testes (spec `MUNDO-TERRENO-MAPAS.md` §2–3; promover o protótipo `tools/lib/irregularCoast.mjs`). | — |
| 2 | MUNDO-2 | Dados dos 6 heróis (spec `MUNDO-HEROIS.md`): `units.js`, `abilities.js`, extensão `status` com `radius`/`allies` em `src/sim/abilities.js`, i18n, retratos SVG. | — |
| 3 | MUNDO-3 | Seletor de campanhas (principal + "Clássica (beta)"), progresso por campanha, registro de `war-alliance`/`war-horde` (spec `MUNDO-HISTORIA-CAMPANHA.md`). | — |
| 4 | MUNDO-4 | Tela de abertura da história (7 painéis, SVG procedural com slots de arte). | MUNDO-3 |
| 5 | MUNDO-5 | Biomas/tilesets (visual; arte final é local) e mapas por ilha. | MUNDO-1 |
| 6 | MUNDO-6 | 12 missões × 2 em lotes + testes de cobertura/progressão. | 1–5 |
| 7 | NEW-6 | Passos 1, 4, 5 da spec `NEW-6-orm-texturas.md` (o passo 2 exige decisão do dono). | — |
| 8 | NEW-14 | Passos 0–2, 5–6 da spec `NEW-14-cpu-animacao.md` (3–4 após o NEW-53). | — |
| 9 | NEW-51 | Confirmar a seed 82 com amostra grande (`--count 30 --recheck 3`). | — |
Não vão para a nuvem: benchmarks de FPS, regravar a baseline de desempenho/visual, áudio no navegador, Blender e toda verificação visual.

## 4. Tarefas que ficam no local (não vão para a nuvem)
Motivo: precisam de GPU, Blender, navegador ou de decisão do dono.

**Blender (Sonnet, local via safe-run):**
- **F7-01** fidelidade das unidades orcs (Peão, Grunt, Lançador, Ogro).
- **F7-07** modelos novos da árvore tecnológica. Faltam referências de arte para Refinaria, Fundição, Submersível/Tartaruga, Forja Naval e Caldeirão.
- **F7-00b** remanescentes (revisão do acampamento e itens procedurais listados no TASKS).
- **F7-09** ícones/retratos dos modelos sem `.glb` (Ovelha, Submersível, Tartaruga, Refinaria, Fundição, Forja Naval, Caldeirão) — depois de F7-07.

**Retomar localmente (trabalho já iniciado, com commits ou alterações não commitadas no seu computador):**
- **NEW-44** IA sem madeira e IA naval: alterações não commitadas em `src/ai/`. Validação por soak A/B.
- **NEW-51** seed 82 (`continental-1v1`, humano, brutal): depende de NEW-44.
- **F7-08** áudio: branch `task/F7-08` com 3 commits; falta integração em `main.js`, `QualitySettings`, `MatchSession`, opções e i18n, e verificação de `AudioContext` no navegador.
- **F10-04** orçamento de desempenho em CI: branch `task/F10-04` com commits; falta `tests/perf/` e a rodada com GPU.
- **NEW-53** correção de m04 (forte Atalaia humano e anel ciano dos carregadores): em andamento.

**Verificação com GPU / navegador:**
- **F10-03**: regravar a baseline visual (`npm run visual -- --update`) após as mudanças do inspetor (107 alvos hoje; a baseline antiga tem 127).
- **F1-10** LOD e culling: validação por benchmark.
- **NEW-14, NEW-15, NEW-27** desempenho (draw calls e CPU em `combate100`).
- **NEW-16** HUD < 1100 px esconde população (CSS): validação visual.

**Decisões do dono (bloqueiam; não são de implementação):**
- **F7-02** (cores de time): aceita máscara por material, ou exige canal de máscara / uniform?
- **F8-03** (editor): o gerador `painted` em `src/sim/terrainGenerators.js` contraria a regra de não tocar em `src/sim/`. Aceita ou move para `src/data`?
- **F8-05** (campanha Aliança): aprovar a premissa "A Marcha da Aliança" (provisória) e confirmar início de missão e carry-over no jogo.
- **F9-03** (lockstep): checksum a cada 10 turnos em jogo, ou por turno (spec)? Por turno custa pouco (O(entidades)); se confirmar, o `checkEvery` vira 1.
- **F5-03** (dificuldade): pausado a seu pedido.
- **NEW-9** (IA destrói HQ cedo): depende de F5-03 e de rodadas de balanceamento.

## 5. Relatório (corpo do PR, ≤ 25 linhas)
Branch, commits, o que foi feito, números e testes, desvios da spec, e **Verificação pendente (local)** com passos.

## 6. Estado da nuvem (preenchido pelo coordenador ao mesclar)
- Mesclados em 2026-10-10: `cloud/AUD-1` (PR #16), `cloud/F10-05b` (#15), `cloud/NEW-13` (#14), `cloud/NEW-49` (#13), `cloud/NEW-52` (#12), `cloud/F9-05b` (#11), `cloud/NEW-41` (#10), `cloud/NEW-4` (#9), `cloud/NEW-31` (#8), `cloud/NEW-50` (#7), `cloud/NEW-19` (#5), `cloud/ui-worker-build-grid` (sem PR).
- **Superado, não mesclado:** `cloud/F3-01` (PR #6, de 2026-09-29). A F3-01 foi feita localmente (`ee2fe9d`) e o NEW-16 já está no master.
- Branches remotas `cloud/*` mescladas podem ser apagadas depois que o push do `master` confirmar os PRs como mesclados.
- Antigos (já mesclados antes): `cloud/BUGS-01`, `cloud/F1-07`, `cloud/F6-03`.
