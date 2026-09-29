# F3-04 — Economia WC2 (mina com entrada/fila, florestas que bloqueiam, sem ouro passivo, requisito do Quartel)

> Leia antes: `CLAUDE.md`, `docs/specs/_COMUM.md`, `docs/08_GAME_DESIGN.md` §2 e §4, `docs/07_DECISOES.md` (D1, D5). Executor: **sonnet**, worktree, porta do vite **5196**.

## Por quê
Hoje o trabalhador minera "de fora", ouro cai de Fazenda/Chiqueiro sem esforço (`passiveIncome`), e qualquer construção é liberada de imediato. O design aprovado (D5) quer economia estilo WC2: ouro só de minas, mina como gargalo (1 por vez), Fazenda como requisito do Quartel, florestas como terreno.

## Pronto quando (mensurável)
1. Fazenda e Chiqueiro **não geram ouro** (`passiveIncome: null` em todos os edifícios; campo pode permanecer no schema). `Building.simUpdate` não muda de comportamento para os demais.
2. Trabalhador minerando ouro **entra na mina**: some (mesh invisível, sem colisão/seleção) por 1,5 s, sai com 10 de ouro. **Só 1 dentro por vez**; os demais esperam em fila junto à mina (ordem de chegada, determinística). Pedreira: até **2** simultâneos, 8 de pedra por viagem. Madeira: 10 por viagem (corte continua fora, sem entrar).
3. Mina/pedreira **esgotada** emite evento `RESOURCE_DEPLETED` (novo, em `src/sim/events.js`) e a UI mostra aviso em PT-BR ("Mina de ouro esgotada"); trabalhadores dentro/na fila procuram outra jazida do mesmo tipo (`findNearestResource`) ou ficam ociosos.
4. Árvores vivas **bloqueiam passagem** (já entram no `blockerGrid`/`Pathfinder.blockCircle` — verifique se florestas densas realmente fecham caminho) e **abrem** ao serem cortadas (a árvore morta já faz `blockCircle(..., -1)` em `GameManager` ~l.1160: confirme com teste que o caminho reabre e que unidades não atravessam árvore viva).
5. **Requisito**: campo novo `requires: ['farm']` (humano) / `['pig_farm']` (orc) em `barracks` e `orc_barracks` em `src/data/buildings.js`. Regra: o jogador precisa ter ≥1 construção **concluída** de cada tipo em `requires`. Validada em `GameManager.placeBuilding` (falha silenciosa + evento de erro/aviso já existente para "sem recursos", com mensagem "Requer: Fazenda de Trigo"), e o botão do card da HUD fica desabilitado com tooltip listando o que falta. Função pura reutilizável `missingRequirements(playerId, buildingType, gm)` em `src/sim/requirements.js` (sem three.js; testável).
6. Multiplicadores em dados (`src/data/economy.js`, novo): `CARRY = {gold:10, wood:10, stone:8}`, `MINE_ENTER_TIME = 1.5`, `MINE_SLOTS = {gold:1, stone:2}`, `RATE_BONUS = {wood:{lumber_lv2:1.25}, gold:{hq_lv2:1.10, hq_lv3:1.20}, stone:{quarry:1.20}}` — **apenas declarados e lidos por uma função `gatherMultiplier(playerId, resource, gm)` que hoje devolve 1** (níveis chegam na F3-06). `WORKER_STATS.carryCapacity` deixa de ser usado (remova ou aponte para `CARRY`).
7. IA (`src/ai/**`) continua funcional: constrói Fazenda/Chiqueiro antes do Quartel; não fica presa esperando ouro passivo; lida com fila da mina. Partida headless IA×IA de 10 min termina com ambos os lados com economia > 0 e sem exceção.
8. Determinismo: `tests/unit/determinism.test.js` provavelmente muda os checksums esperados → regrave o baseline e **justifique no relatório** (economia mudou de propósito). Duas execuções com mesma seed continuam idênticas.
9. `docs/08_GAME_DESIGN.md` ganha subseção "2.1 Curva de economia" com tabela medida em headless: ouro/min por nº de trabalhadores (1, 3, 5, 8, 12) com 1 mina, mostrando a saturação da mina.

## Contexto (caminho:linha aproximado; confirme com grep)
- Coleta: `src/entities/Unit.js` `updateGathering` (~1014), `depositResources` (~1078), `updateReturning` (~1111); carga `this.carrying` (~145) usa `WORKER_STATS`.
- Depósito: `src/entities/ResourceDeposit.js` (`mine()`, `resourcesRemaining`, 2500 iniciais).
- Ouro passivo: `src/entities/Building.js` `simUpdate` (~655) + `passiveIncome` em `src/data/buildings.js` (`farm` l.94, `pig_farm` l.210).
- Treino/pop: `Building.queueUnit` (~550); construção: `GameManager.placeBuilding` (~784) e `canPlaceBuilding` (~596); comandos: `src/sim/CommandExecutor.js` (`PLACE_BUILDING`, `TRAIN`).
- Grades/pathfinder: `GameManager.registerEntity/unregisterEntity` (~211–233), remoção de árvore (~1160), `Pathfinder.blockCircle` (~212).
- IA: `src/ai/AIEconomyManager.js` (ordem de construção ~236–280, atribuição de trabalhadores ~478).
- Eventos: `src/sim/events.js` (`EVT`); som/VFX/UI só reagem a eventos (regra F2-07).

## Implementação (passos)
1. `src/data/economy.js` + export em `src/data/index.js`. Ajuste `WORKER_STATS`/`carrying.max` por recurso (max = `CARRY[type]` ao começar a coletar).
2. Estado de mina no `ResourceDeposit`: `slots` (n. máx.), `inside: Unit[]`, `queue: Unit[]`. Métodos `requestEnter(unit)`, `release(unit)`. Tudo dentro do tick fixo (`simUpdate`), sem `Math.random`/`Date.now`; ordem da fila = ordem de chegada (desempate por `id`).
3. `Unit`: novos estados `waitingMine` (parado junto à mina) e `insideMine` (timer `MINE_ENTER_TIME`, `mesh.visible=false`, removido do `unitGrid` enquanto dentro e reinserido ao sair — use os hooks existentes de registro; alvo/seleção ignoram unidade dentro). Ao sair: `carrying = {type, amount: min(CARRY, restante)*gatherMultiplier}`, estado `returning`. Se a unidade dentro morrer/for comandada (stop/move), libere o slot e reexiba.
4. Ordem do jogador para trabalhador dentro da mina: cancela a espera e sai imediatamente sem carga.
5. Remover ouro passivo (dados + confirmar que o bloco em `simUpdate` vira código morto inofensivo; remova o bloco se nenhum edifício o usar, mantendo `RESOURCE_GATHERED` para entregas).
6. Evento `RESOURCE_DEPLETED { pos, resource, ownerId? }` emitido uma vez quando `resourcesRemaining` chega a 0; `UIManager` (mudança mínima, **F3-01 da nuvem mexe em UIManager/InputManager**) mostra o aviso via o mecanismo de mensagens que já existe (procure `showMessage`/toast) — não crie UI nova.
7. `src/sim/requirements.js` + uso em `placeBuilding` + `UIManager`/card (mudança mínima: só `disabled` + tooltip no botão de construir do trabalhador; F6-09 troca os nomes depois).
8. Verifique bloqueio por floresta: teste headless montando um anel de árvores; `pathfinder.findPath` deve falhar/contornar até cortar uma árvore. Se o orçamento de nós do pathfinder (F1-07) impedir "sem caminho" rápido, registre `NEW-<n>`, não reescreva o pathfinder.
9. IA: `AIEconomyManager` — construir `farm`/`pig_farm` antes de `barracks`/`orc_barracks` (use `missingRequirements`); retirar qualquer cálculo que conte com ouro passivo; limitar trabalhadores de ouro por mina a ~5 (excedente vai para madeira).
10. Regravar baseline de determinismo; adicionar a tabela de curva de economia (script `tools/eco-curve.mjs` usando o modo headless; sem navegador).

## Não fazer
- Não implemente níveis do Centro/Serraria (F3-06), reparo (F3-05), petróleo, nem renomeie construções (F6-09/NEW-3).
- Não mexa em `Pathfinder.js` além do necessário (registrar `NEW` se faltar recurso). Não altere modelos 3D. Não reformate arquivos.
- Não use `Math.random`, `Date.now` nem `performance.now` na simulação.

## Testes (novos, em `tests/unit/`)
- `economy-mine.test.js`: 3 trabalhadores, 1 mina ouro → nunca 2 dentro; ordem da fila; 10 de ouro por viagem; esgotamento emite `RESOURCE_DEPLETED` uma vez; pedreira aceita 2 simultâneos e entrega 8.
- `requirements.test.js`: Quartel sem Fazenda concluída → recusado (recursos não debitados); com Fazenda em construção → recusado; concluída → aceito; facção orc usa `pig_farm`.
- `no-passive-income.test.js`: Fazenda pronta por 60 s simulados → ouro do jogador inalterado.
- `forest-block.test.js` (item 8).
- Ajustar `determinism.test.js` (item 8) e qualquer teste de IA que assuma ouro passivo.

## Verificação
```bash
npm test && npm run lint && npx vite build --outDir /tmp/claude-1000/warpoly-build-check
npm run smoke
node tools/eco-curve.mjs      # imprime a tabela do item 9
```
Visual (local, GPU real): `?skipPreload&texq=low&play&faction=orc` — trabalhador some ao entrar na mina, fila visível, aviso de esgotamento, botão do Quartel desabilitado sem Chiqueiro.

## Docs
- `docs/08_GAME_DESIGN.md` (§2.1 curva), `docs/01_ARQUITETURA.md` (estado de mina, `requirements.js`, `economy.js`). **Não** edite `docs/TASKS.md`.

## Entrega
Commits "F3-04 wip: ..." por etapa; commit final `F3-04: economia WC2 (mina com fila, requisitos, sem ouro passivo)` com a linha Co-Authored-By de `_COMUM.md`. Relatório ≤ 25 linhas (inclua: baseline de determinismo antigo→novo com justificativa, tabela da curva, desvios, `NEW-<n>` sugeridos).
