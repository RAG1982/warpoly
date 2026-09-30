# F3-09 · Condições de vitória (Destruir tudo / Regicídio) e estatísticas da partida

> **Status: ⏳ A FAZER** (spec pronta 2026-09-30; não disparada).
> Leia antes: `CLAUDE.md`, `docs/specs/_COMUM.md`, `docs/08_GAME_DESIGN.md` §9, `docs/01_ARQUITETURA.md` (event bus, MatchConfig).
> Executor: **sonnet**, worktree, porta do vite **5205**. Depende de F2-04, F2-07 (mescladas). Alimenta F6-07 (tela pós-jogo, não incluída aqui).

## Por quê
`GameManager._updateVictoryConditions` (`src/core/GameManager.js` ~l.1025) só conhece uma regra: jogador sem Centro vivo está derrotado (na prática Regicídio). O design (§9) define **Destruir tudo** como padrão (perde quem fica sem construções) e **Regicídio** como opção. Também não há coleta de estatísticas para a tela pós-jogo (F6-07).

## Pronto quando (mensurável)
1. **Modo de vitória na config**: `MatchConfig` ganha `victoryMode: 'conquest' | 'regicide'` (`VICTORY_MODES`, `normalizeVictoryMode`, padrão `'conquest'`); `createMatchConfig({victoryMode})`; URL `?victory=regicide`; propagado por `MatchSession`/`GameManager`. Seletor no menu de escaramuça (`src/ui/screens/MainMenu.js`): dois botões de rádio "Destruir tudo" / "Regicídio (Centro)", persistido em localStorage como a dificuldade (chave `warpoly.victory`), `onStart({faction, difficulty, mapId, victoryMode})` — mudança **mínima** e localizada.
2. **Regras** (`src/sim/victory.js`, função pura `isPlayerDefeated(mode, ownedBuildings)` + `aliveTeams` já existente):
   - `conquest`: derrotado quando **não resta nenhuma construção viva** do jogador (contam também construções em obra; **muralhas não contam** — `role:'wall'`, prepare mesmo antes da F3-08 existir: ignore role desconhecido sem erro). Unidades sem construção **não** salvam o jogador (regra simples do design).
   - `regicide`: derrotado quando não resta Centro (`role:'hq'`) vivo (regra atual).
   - Ao ser derrotado: todas as unidades e construções restantes do jogador **continuam no mapa** e passam a ser inertes: a IA derrotada para (já existe), unidades ficam paradas e não recebem ordens; **nenhuma remoção** (decisão simples; registre). Mantenha `EVT.PLAYER_DEFEATED` para qualquer derrotado (hoje só sai quando a partida continua — emita sempre, uma vez por jogador), `EVT.MATCH_WON/MATCH_LOST` como hoje.
3. **Estatísticas** — novo `src/sim/MatchStats.js` (sem three.js/DOM, testável em Node), assinando o event bus do `GameManager`:
   - por jogador: `unitsTrained`, `unitsLost`, `unitsKilled`, `buildingsBuilt` (BUILDING_COMPLETED), `buildingsLost`, `buildingsDestroyed`, `resources{gold,wood,stone}` (RESOURCE_GATHERED), `spent{gold,wood,stone}` (soma de custos cobrados: assine um novo `EVT.RESOURCES_SPENT {ownerId, cost}` emitido por `Player.deduct` quando houver `events` disponível — se `Player` não tem acesso ao bus, emita no `GameManager` nos pontos de cobrança conhecidos: treino, construção, pesquisa, upgrade de Centro), `commands` (contador de comandos emitidos pelo jogador via `gm.issue`) → **APM = commands / minutos simulados** (calculado sob demanda), `score` (fórmula WC2 simplificada, função pura `computeScore(stats)`: `unitsKilled×10 + buildingsDestroyed×20 + (gold+wood+stone gathered)/10`), `elapsed` (`gameTime` em s, no `gm.matchStats.snapshot()`).
   - **Atribuição de kills**: `EVT.UNIT_DIED` e `EVT.BUILDING_DESTROYED` ganham `killerOwnerId?: number` (payload opcional; `null` se desconhecido — morte por reembolso/cancelamento/limpeza não conta). `Unit.takeDamage(amount, attacker)`/`Building.takeDamage(amount, attacker)` já recebem `attacker`: guarde `lastAttackerOwnerId` e use-o em `die()`. Atualize o cabeçalho de `src/sim/events.js` e o contrato em `tests/unit/eventBus.test.js`/`eventsHeadless.test.js` se necessário. Não conte mortes de aliados (mesmo time) nem de neutros como kill.
   - Séries temporais para os gráficos da F6-07: a cada **10 s simulados**, `snapshot` de `{t, gold/wood/stone acumulados, unidades vivas, construções vivas, kills}` por jogador (≤ 720 pontos por partida; guarde em arrays simples).
   - Exposição: `gm.matchStats.snapshot()` → objeto serializável `{elapsed, mode, winnerTeam, players:[{id,name,factionId,team,isAI,defeated,...stats,score,apm}], series:[...]}`; `window.game.gameManager.matchStats` para debug.
4. **Fim de partida**: ao `isGameOver`, o `GameManager` guarda `gm.result = matchStats.snapshot()` (congela); o modal atual do `UIManager` (~l.272) passa a mostrar 3 linhas de resumo (tempo, unidades mortas/perdidas, construções destruídas/perdidas, PT-BR) **sem** criar a tela completa (F6-07). Texto do modal segue o modo ("Todas as construções inimigas foram destruídas!" / "O Centro inimigo caiu!").
5. **IA e headless**: `MatchStats` funciona em partidas headless (F2-03); sem custo mensurável no `bench` (assinaturas são O(1) por evento; sem alocar por frame — reutilize objetos). Determinismo: `MatchStats` só **lê** eventos, nunca altera a simulação; checksum de `determinism.test.js` inalterado.
6. **Compatibilidade**: `?ffa=1` (3 times) e times continuam funcionando; vitória quando `aliveTeams().size <= 1`.

## Contexto no código
`src/core/GameManager.js` (`_updateVictoryConditions` ~l.1025, `_hasLivingHQ` ~l.1012, `gameTime` ~l.116/1164, `issue`, `isGameOver`/`gameWon`); `src/sim/events.js`; `src/sim/PlayerRegistry.js` (`aliveTeams`); `src/sim/MatchConfig.js`; `src/core/MatchSession.js`; `src/entities/Unit.js` (`die` ~l.645, `takeDamage` ~l.572), `src/entities/Building.js` (`die` ~l.521, `takeDamage` ~l.497, produção ~l.736/793); `src/ui/UIManager.js` (~l.272); `src/ui/UiEvents.js`; `src/main.js` (`matchConfigFromSearch`).

## Não fazer
Tela pós-jogo completa, gráficos (F6-07), modo Tempo, remover entidades de jogador derrotado, ranking persistente, mudar IA além de respeitar derrota.

## Testes (Vitest)
- `victory.test.js`: `isPlayerDefeated` nos dois modos (com/sem HQ, só muralha, só construção em obra); partida headless IA×IA em `conquest` termina com vencedor; em `regicide` termina quando um Centro cai.
- `matchStats.test.js`: contadores por evento (treino, morte com/sem killer, construção, coleta, gasto); aliados não contam kill; `computeScore`; série a cada 10 s; APM; `snapshot` serializável (`JSON.stringify` ok).
- `commands`/`MatchConfig`: `victoryMode` normaliza valores inválidos para `conquest`.
- `determinism.test.js`, `eventBus.test.js`, `eventsHeadless.test.js` verdes.

## Verificação
Mínimos do `_COMUM.md`. No jogo (porta 5205, `?skipPreload&texq=low&play&victory=regicide` e sem o parâmetro, safe-run): derrubar HQ inimigo por console e ver vitória conforme o modo; capturas do modal em `tools/ui-captures/victory/`. Headless: 5 partidas IA×IA por modo imprimindo `snapshot()` resumido (rode via `node`, sem navegador).

## Docs
`docs/02_MECANICAS.md` (modos, o que conta como construção), `docs/01_ARQUITETURA.md` (`MatchStats`, novos campos de evento), `docs/08_GAME_DESIGN.md` §9.

## Entrega
Commits `F3-09 wip: ...`; final `F3-09: modos de vitória e estatísticas da partida`. Relatório ≤ 25 linhas.
