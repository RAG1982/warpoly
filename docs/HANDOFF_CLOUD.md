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
- PRs mesclados: nenhum desde 2026-09-30 (BUGS-01, F1-07 e F6-03 estão no histórico).
- Branches remotas `cloud/*` antigas podem ser apagadas.
