# F3-11 · Revisão de balanceamento base (simulação IA×IA em lote)

> **Status: ⏳ A FAZER** (spec pronta 2026-09-30; não disparada — só depois de F3-05, F3-07, F3-08, F3-09, F3-10 mescladas, para medir o jogo completo da Onda 4).
> Leia antes: `CLAUDE.md`, `docs/specs/_COMUM.md`, `docs/08_GAME_DESIGN.md` §5–§8, `tools/eco-curve.mjs` e `tools/combat-table.mjs` (padrão de script headless em Node), `tests/unit/mapsHeadless.test.js`.
> Executor: **sonnet**, worktree. **Não usa navegador nem porta de vite** (só Node headless) — não precisa de safe-run, mas limite a 1 processo Node de simulação por vez (RAM).

## Por quê
Números iniciais (custos, dano, PV, pesquisas) foram escritos por design, sem medição. Com simulação headless determinística (F2-03: partida IA×IA de 10 min em ~1 s) dá para rodar centenas de partidas e ajustar `src/data/*` até nenhuma facção vencer sistematicamente. **Atenção**: a IA ainda não lê a dificuldade (`MatchConfig.difficulty` só é guardada; F5 implementa "Difícil"). Esta spec mede a IA **como está**; quando a F5 chegar, repita o lote.

## Pronto quando (mensurável)
1. **Runner** `tools/balance-sim.mjs` (Node, usa `tools/lib/register-json-loader.mjs`, sem DOM/WebGL): `node --import tools/lib/register-json-loader.mjs tools/balance-sim.mjs --games 200 --map continental-1v1 --minutes 20 --out tools/balance-report/`. Para cada partida: `createMatchConfig`-like com **os dois jogadores IA** (`isAI:true` ambos; o `isLocal` fica no id 0 mas ele **não** recebe comandos humanos), seeds `1..N`, **metade das partidas com facções trocadas de slot** (humano no slot NE e orc no SW e vice-versa) para cancelar viés de posição; roda `gm.simStep(SIM_DT)` até `isGameOver` ou limite de `--minutes` de tempo simulado (**empate** se estourar). Paralelismo: **sequencial** (1 processo).
2. **Saída**: `tools/balance-report/<data>-<mapa>.json` + `.md` com: vitórias por facção (%), por slot (%), empates (%), duração média/mediana/p90 (min simulados), unidades treinadas/perdidas por tipo, recursos coletados, **pesquisas concluídas** (quais/qtas), tempo médio até Centro nível 2/3, e "assinatura" da composição do exército aos 8/12/16 min por facção. Usa `MatchStats` da F3-09 (mesclada; se faltar algum campo, calcule dos eventos do event bus — não altere a simulação). Reprodutível: relatório traz `git rev-parse --short HEAD` e a lista de seeds.
3. **Auditoria de dados antes de ajustar** (`tools/combat-table.mjs`, já existe: rode e cole a tabela no relatório): DPS efetivo, PV, custo e "eficiência de custo" (`DPS×PV / custo`) por unidade; **paridade entre facções** (humano vs orc: unidade equivalente com ≤ ±10% de diferença de eficiência de custo, exceto onde o design §6 definiu assimetria).
4. **Ajuste iterativo dos dados** — somente em `src/data/*.js` (`units.js`, `buildings.js`, `upgrades.js`, `combat.js`, `economy.js`, `tiers.js`) e, se preciso, `MATCH_TUNING` da IA (parâmetros numéricos em `src/ai/*`, sem mudar a estrutura). **Nunca** alterar código de simulação/regras. Cada iteração = 1 lote de 200 partidas; registre no relatório `docs/BALANCEAMENTO.md` (novo): tabela iteração → mudança → % de vitória de cada facção. **Máximo 6 iterações**; mudanças pequenas (≤ ±15% de qualquer valor numérico por iteração; ≤ ±30% cumulativo em relação ao valor original — passando disso, pare e reporte).
5. **Meta**: em 200 partidas (100 por configuração de slots), **vitória de cada facção entre 45% e 55%** entre as partidas **decididas** e **empates ≤ 15%**. Se após 6 iterações não bater, entregue o melhor estado, com a tabela e a hipótese do que falta (provável: IA fraca demais ou sem uso de heróis/magias — F4/F5), e crie `NEW-<n>` no backlog descrevendo. **Não** force o número mudando a IA para "jogar melhor" (isso é F5).
6. **Guarda-corpos** (testes automáticos, `tests/unit/balance.test.js`): (a) invariantes de dados — todo custo/PV/dano ≥ 0 e inteiros/finitos, nenhuma unidade sem `armor` definido, `trainTime > 0`; (b) **sanidade de equilíbrio rápido**: 6 partidas curtas (3 min simulados) IA×IA com seeds fixas rodam sem exceção e sem `NaN` em recursos; (c) `tools/check-data-parity.mjs` continua passando. `determinism.test.js` e demais suites verdes (se um teste antigo fixa um número que o balanceamento mudou, ajuste o valor esperado **e** documente em `BALANCEAMENTO.md`).

## Contexto no código
`src/data/units.js`, `buildings.js`, `upgrades.js`, `combat.js` (tabela de dano/armadura F3-03), `economy.js`, `tiers.js`; `src/ai/AIDirector.js`, `AIEconomyManager.js`, `AIMilitaryManager.js`; `src/core/GameManager.js` (`simStep`, `isGameOver`); `src/sim/MatchConfig.js` (`createMatchConfig`, `validateMatchConfig`); `tools/eco-curve.mjs`/`tools/combat-table.mjs` (moldes de script Node headless); `tests/unit/mapsHeadless.test.js` (molde de partida headless).

## Não fazer
Mudar regras/estrutura de dados, adicionar unidades/pesquisas, mexer em arte/UI, otimizar a IA, tocar em mapas. Não rodar navegador. Não commitar relatórios brutos > 1 MB (guarde só o `.md` resumido e o `.json` compactado se ≤ 1 MB).

## Testes / Verificação
`npm test`, `npm run lint`, build (comandos do `_COMUM.md`; `npm run smoke` só se algum arquivo de UI mudar — não deve). Evidência: `docs/BALANCEAMENTO.md` com as tabelas e o comando exato para repetir. Tempo total do lote de 200 partidas deve ficar < 15 min (se passar, reduza `--minutes` ou use `--games 100` na iteração e o lote de 200 só no final).

## Docs
`docs/BALANCEAMENTO.md` (novo), `docs/02_MECANICAS.md` (números finais se citados), `docs/08_GAME_DESIGN.md` (tabelas §5–§7 atualizadas para bater com `src/data/`).

## Entrega
Commits `F3-11 wip: ...` por iteração; final `F3-11: balanceamento base por simulação IA×IA`. Relatório ≤ 25 linhas com a tabela final de vitórias.
