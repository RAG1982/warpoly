# F2-02 · Sistema de comandos (única forma de alterar o estado do jogo)

Leia antes: `docs/specs/_COMUM.md`, `CLAUDE.md`, `docs/01_ARQUITETURA.md` (jogadores/IDs F2-01, `entitiesById`, loop de tick fixo da F1-09 se já mesclada).
Worktree: nova. **Primeiro `git merge master`.** Porta do vite: **5192**.
**Dependência**: só comece se o master já contiver a F1-09 (`git log master --oneline | grep F1-09`). Se não, pare e reporte.

## Por quê
Multiplayer lockstep (F9), replays (F9-05) e IA justa exigem que **toda** mudança de estado venha de um comando serializável, aplicado num tick de simulação conhecido. Hoje UI, input, IA e o próprio GameManager chamam métodos de entidades diretamente.

## Contrato
`src/sim/commands.js` (lógica pura, sem three.js/DOM):
```js
export const CMD = Object.freeze({
  MOVE: 'move', ATTACK: 'attack', ATTACK_MOVE: 'attackMove', GATHER: 'gather', BUILD: 'build',
  PLACE_BUILDING: 'placeBuilding', TRAIN: 'train', CANCEL_TRAIN: 'cancelTrain',
  RESEARCH: 'research', CANCEL_RESEARCH: 'cancelResearch', RALLY: 'rally',
  STOP: 'stop', HOLD: 'hold', PATROL: 'patrol'
});
// Formato (JSON puro; só números/strings/arrays; nada de referências de objeto):
// { tick, playerId, type, unitIds?: number[], targetId?: number, x?: number, z?: number,
//   buildingType?: string, buildingId?: number, unitType?: string, upgradeId?: string,
//   slot?: number, queued?: boolean }
export function makeCommand(fields)            // valida campos obrigatórios por tipo; retorna objeto congelado
export function validateCommand(cmd)           // { ok, reason }
export function serialize(cmd) / deserialize(str)
```
`src/sim/CommandQueue.js`: `enqueue(cmd)` (o tick de execução é `gm.currentTick + COMMAND_DELAY_TICKS`, com `COMMAND_DELAY_TICKS = 0` agora — lockstep usará > 0 depois); `drain(tick)` → comandos daquele tick **ordenados** por `(playerId, seqNo)`; `log` (array de todos os comandos executados, para replay).
`src/sim/CommandExecutor.js`: `execute(gm, cmd)` resolve IDs via `gm.entitiesById`, **verifica autoria** (a unidade/construção pertence a `cmd.playerId`; senão descarta com `console.warn` em dev), e chama os métodos atuais das entidades (`Unit.moveTo/orderAttack/orderGather/orderBuild/stop`, `Building.queueUnit/cancelQueuedUnit/startResearch/cancelResearch/setRallyPoint`, `gm.placeBuilding(...)`). Comandos para entidades mortas/inexistentes são ignorados silenciosamente.

## Integração
1. `GameManager`: `this.commands = new CommandQueue()`, `this.currentTick` (incrementa em `simStep`). No início de `simStep`: `for (cmd of this.commands.drain(this.currentTick)) CommandExecutor.execute(this, cmd)`. API pública `gm.issue(cmd)` = `commands.enqueue(makeCommand(...))`.
2. Converter para comandos (substituir chamadas diretas por `gm.issue(...)`):
   - `GameManager.issueOrder` (~linha 930–1005): vira um **tradutor** do clique direito → emite `MOVE` (com os destinos de formação calculados aqui: um comando por unidade ou `unitIds` + `x,z` e o executor calcula a formação — escolha **o executor calcula a formação**, para que o comando carregue só o ponto clicado), `ATTACK`, `GATHER`, `BUILD`, `RALLY`.
   - `GameManager.buildNewBuilding` (~831/845) e `InputManager.confirmPlacement` (~356): viram `PLACE_BUILDING {buildingType,x,z, unitIds: construtores}`; a dedução de recursos acontece **no executor** (validação de custo no tick de execução; se não puder pagar, descarta e notifica o jogador local).
   - `UIManager` (~283, 338, 361, 384, 395): `TRAIN`, `RESEARCH`, `CANCEL_RESEARCH`, `CANCEL_TRAIN`.
   - IA (`src/ai/AIEconomyManager.js` ~136, 193, 538, 582, 671–698; `AIMilitaryManager.js` ~84, 169, 171, 217): mesma conversão; a IA emite com o seu `playerId`. Em `placeBuilding` da IA (~671) substitua o `createBuilding`+`push` por `PLACE_BUILDING`.
   - `GameManager.spawnUnit` com `rallyPoint` (~712): mover para o rally é **efeito interno** da simulação (não é comando do jogador) — pode continuar chamando `unit.moveTo` diretamente. Documente essa exceção.
   - `src/debug/bench.js`: pode continuar chamando entidades diretamente (ferramenta de teste); documente.
3. Comandos novos que já passam a existir (sem UI ainda — a F3-01 fará teclas): `STOP` (`unit.stop()`), `HOLD` (novo estado `holding`: não se move, ataca só no alcance), `ATTACK_MOVE` (anda; ao ver hostil no raio de aggro, ataca; volta a andar ao limpar), `PATROL` (alterna entre ponto de origem e destino com comportamento de attack-move). Implemente os 3 estados em `Unit.js` com o menor código possível, reusando `findNearestHostile` e `moveTo`.
4. `queued: true` (shift): guardar em `unit.orderQueue` e executar o próximo quando a unidade ficar `idle`. Implementar só para MOVE, ATTACK_MOVE, GATHER, BUILD.

## Não fazer
- Não mudar números de jogo. Não mexer em modelos, render, névoa.
- Nenhum comando pode carregar objetos (só IDs/números/strings) — teste isso.

## Testes (Vitest)
- `commands.test.js`: `makeCommand` rejeita campos faltando por tipo; `serialize/deserialize` ida e volta idêntica.
- `commandQueue.test.js`: ordem determinística por `(playerId, seqNo)`; `drain` só do tick pedido; `log` acumula.
- `commandExecutor.test.js` (gm fake com `entitiesById`): comando de outro jogador é ignorado; unidade morta ignorada; `TRAIN` sem recursos descartado.
- **Replay**: gm headless fake — gravar comandos de uma sequência, reaplicar num gm novo com mesmo estado inicial → mesma sequência de chamadas de método (spy).

## Verificação
1. Comandos mínimos do `_COMUM.md` (`npm run smoke` já usa safe-run — não aninhe).
2. `grep -rn "\.\(moveTo\|orderAttack\|orderGather\|orderBuild\|queueUnit\|startResearch\|cancelResearch\|cancelQueuedUnit\|setRallyPoint\)(" src/ui src/core/InputManager.js src/ai` → **zero** resultados (exceto exceções documentadas).
3. Playwright via safe-run (GPU real, porta 5192, `?skipPreload&texq=low`): jogador treina trabalhador (TRAIN), manda coletar (GATHER), constrói casa (PLACE_BUILDING), ataca unidade inimiga (ATTACK); IA joga 120 s simulados e cresce (construções/unidades) como antes. `gm.commands.log.length > 0` e todos os itens são JSON puro (`JSON.parse(JSON.stringify(x))` igual).

## Docs
`docs/01_ARQUITETURA.md`: seção "Comandos" (formato, fila, executor, exceções).

## Entrega
Mensagem de commit: `F2-02: sistema de comandos (fila, executor, stop/hold/attack-move/patrol, shift-queue)`.
