# F3-05 · Reparo de construções, cancelamento de obra e obra cooperativa

> **Status: ⏳ A FAZER** (spec pronta 2026-09-30; não disparada — dispare depois de F3-08 mesclada, pois ambas tocam `Unit.js`/`Building.js`/`UIManager.js`).
> Leia antes: `CLAUDE.md`, `docs/specs/_COMUM.md`, `docs/08_GAME_DESIGN.md` §5.1/§6.
> Executor: **sonnet**, worktree, porta do vite **5204**. Depende de F2-02 (comandos) e F3-03 (armadura/PV). Máquinas de cerco/navios não existem ainda: a spec cobre só construções (F4 estende `repairable`).

## Por quê
Hoje `Unit.updateBuilding` (`src/entities/Unit.js` ~l.1293) só serve para erguer construção nova (`construct(10)` a cada 0,8 s) e uma obra abandonada fica parada para sempre; não há como consertar dano nem desistir de uma obra e recuperar recursos. O WC2 tem reparo custando recursos proporcionais ao PV restaurado, e cancelar obra devolve parte do custo.

## Pronto quando (mensurável)
1. **Reparo** — novo comando `CMD.REPAIR` (`src/sim/commands.js`, campos `['unitIds','buildingId']`, aceita `queued`): trabalhadores (`isWorker()`) do dono viram estado `'repairing'` (novo, em `Unit.js`; adicione ao comentário de estados e ao despacho de `simUpdate`), vão até o contato (`collisionRadius + unit.collisionRadius + 0.25`, igual a `updateBuilding`) e a cada **0,8 s** restauram `repairAmount = hpMax × 0,05` PV da construção (20 golpes = 100 %; vários trabalhadores somam). Só constrói/repara alvo do próprio dono (ou aliado, se `isHostileTo` falso e mesmo time — siga `resolveOwnedBuilding`/`getOwner`; se aliado exigir mais código, restrinja ao próprio dono e registre).
2. **Custo do reparo**: `repairCostFor(def, hpRestored) = ceil(def.cost[r] × 0,5 × hpRestored/hpMax)` para cada recurso `r` (100 % de PV custa 50 % do custo original). Cobrado **por golpe**, do dono da construção; se faltar recurso, o trabalhador para (`stop()`) e o dono local recebe `EVT.NOTIFY` "⚠️ Recursos insuficientes para reparar". Função pura em `src/data/economy.js` (ou `src/sim/repair.js`) para ser testada isolada.
3. **Reparo automático (opcional por IA)**: a IA repara construções com PV < 70 % usando 1 aldeão ocioso por construção, sem ataque inimigo nos últimos 6 s (`underAttackTimer` de `Building`). Auto-reparo do jogador humano: **não** (só ordem).
4. **Interface**: com aldeão/peão selecionado, clique direito em construção **própria danificada** (`hp < hpMax`) → `CMD.REPAIR`; clique direito em própria **em obra** → `CMD.BUILD` (como hoje); própria com PV cheio e concluída → movimento (como hoje). Cursor/dica: mesma dica de texto do `UIManager` para construir ("Reparar (custa recursos)"); mensagens PT-BR. Botão "Reparar" (tecla `R`, confira conflito em `src/ui/hotkeys.js` e `tests/unit/hotkeys.test.js`) no card do aldeão entra em modo alvo: próximo clique numa construção própria emite `REPAIR`. Mudanças mínimas em `InputManager.js`/`UIManager.js` (F3-01 na nuvem pode tocar `InputManager`: se houver conflito no merge, o coordenador resolve; mantenha o diff pequeno e localizado).
5. **Cancelar obra**: novo comando `CMD.CANCEL_CONSTRUCTION` (`['buildingId']`): construção própria com `!isConstructed` é destruída **sem** disparar `BUILDING_DESTROYED` de combate: emite `EVT.BUILDING_CANCELLED {buildingId, ownerId, pos, buildingType}` (novo em `src/sim/events.js`, documentado no cabeçalho), devolve `floor(custo × 0,75 × ...)`: **75 % do custo total** (independente do progresso — regra do WC2 simplificada; registre em `docs/02_MECANICAS.md`), libera o bloqueio no pathfinder e a população, e todos os trabalhadores com `buildTarget` nela param. UI: card de construção em obra mostra botão "Cancelar obra (reembolsa 75 %)" (mesma área dos botões de cancelar treino/pesquisa em `UIManager.js` ~l.352–470) e a tecla `Esc` **não** cancela (evita acidente). Construções concluídas não podem ser canceladas por este comando (o comando é ignorado).
6. **Obra cooperativa**: cada trabalhador soma seu golpe (já ocorre por `construct(10)`); **explicite e teste**: 2 trabalhadores concluem em ~metade do tempo, 4 em ~1/4 (retorno decrescente **não**: linear, mas limite de **4** trabalhadores simultâneos por construção — o 5º espera em `idle` ao redor até vaga; escolha a implementação mais simples: rejeitar `orderBuild/orderRepair` além de 4 com `EVT.NOTIFY` "⚠️ Muitos trabalhadores nesta obra" e manter o trabalhador parado). Use um contador `building.workerCount` recalculado no `simStep` por varredura das unidades com `buildTarget/repairTarget` (determinístico, sem estado divergente).
7. **PV durante a obra**: verifique como `hp` evolui em `construct` (deve subir proporcionalmente ao `buildProgress`; se hoje a construção nasce com PV cheio, mude para `hp = hpMax × max(0,1, progresso/100)`, pois o cancelamento e o dano em obra ficam coerentes). Registre a decisão no relatório e cubra com teste.
8. **Determinismo e eventos**: `REPAIR`/`CANCEL_CONSTRUCTION` passam pela `CommandQueue` (nada de chamada direta da UI). Evento de golpe de reparo reutiliza `EVT.WORKER_HAMMER`. `determinism.test.js` verde.

## Contexto no código
`src/entities/Unit.js` (`orderBuild` ~l.428, `updateBuilding` ~l.1293, `isWorker`, `stop`, `_clearOrderModes`, despacho de ordens ~l.345); `src/entities/Building.js` (`construct` ~l.471, `takeDamage`, `hp`, `underAttackTimer`, `dispose` ~l.537); `src/sim/CommandExecutor.js` (~l.135 CMD.BUILD, `resolveOwnedBuilding`); `src/sim/commands.js`; `src/core/GameManager.js` (bloqueio pathfinder ~l.224/237, `recalculatePop`); `src/ui/UIManager.js`; `src/ai/AIEconomyManager.js`.

## Não fazer
Reparo de unidades/máquinas (F4), reparo automático do jogador humano, novo modelo 3D, mudança de custos de construção. Não altere `style.css` além de um estilo mínimo do botão, se inevitável.

## Testes (Vitest)
`repair.test.js`: `repairCostFor` (0 PV→0; 100 %→50 % do custo; arredondamento para cima); reparo restaura PV até `hpMax` e para; cobra por golpe e para sem recursos; 2 trabalhadores = 2× a taxa; 5º trabalhador recusado; `CANCEL_CONSTRUCTION` devolve 75 %, libera pop/bloqueio, trabalhadores param, emite `BUILDING_CANCELLED`; cancelar concluída é ignorado; comando de outro dono é ignorado. `commands.test.js`: novos comandos validam campos. IA: constrói/repara com PV < 70 % em simulação headless curta. `determinism.test.js` verde.

## Verificação
Mínimos do `_COMUM.md`. No jogo (porta 5204, `?skipPreload&texq=low&play`, safe-run): danificar Torre via `window.game`, reparar com 2 aldeões (PV sobe, recursos descem), cancelar obra e ver reembolso; capturas em `tools/ui-captures/repair/`.

## Docs
`docs/02_MECANICAS.md` (reparo 50 %, cancelar 75 %, 4 trabalhadores), `docs/01_ARQUITETURA.md` (novos comandos/evento, estado `repairing`), `docs/08_GAME_DESIGN.md`.

## Entrega
Commits `F3-05 wip: ...`; final `F3-05: reparo, cancelamento de obra e obra cooperativa`. Relatório ≤ 25 linhas.
