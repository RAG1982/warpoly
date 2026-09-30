# F3-06 — Níveis do Centro da Cidade + requisitos (tiers)

> **Status: ✅ PRONTA — DONE (369cc38)**

> Leia antes: `CLAUDE.md`, `docs/specs/_COMUM.md`, `docs/08_GAME_DESIGN.md` §3, §4 e §10. Executor: **sonnet**, worktree, porta do vite **5199**. **Rode depois da F3-04** (reusa `src/sim/requirements.js`) e, de preferência, depois da F3-03 (mesmos arquivos: `Building.js`, `GameManager.js`, `UIManager.js`, `src/ai/**`).

## Por quê
O Centro evolui em 3 níveis (Paço Real → Fortaleza → Castelo de Aldária / Salão do Clã → Bastião → Cidadela de Ferro) e cada nível libera construções, unidades e pesquisas. Hoje só existe um Centro fixo. A árvore tecnológica inteira (F3-07, F4) depende disto.

## Pronto quando
1. `src/data/tiers.js` (novo) com, para cada facção: nomes por nível, `hp` por nível (1600/2200/2800), custo/tempo do upgrade (nível 2: 1000 ouro · 400 madeira · 300 pedra · 60 s; nível 3: 2000 · 800 · 600 · 90 s — **petróleo (200) fica declarado em `oil` mas ignorado até a F4-07**; registre `NEW-<n>`), `armor` 20 e multiplicador de ouro (`gold: 1.0/1.10/1.20`, consumido por `gatherMultiplier` da F3-04 — ligue essa função aqui).
2. Todo Centro (`role: 'hq'`) tem `tier` (começa em 1). Novo comando `CMD.UPGRADE_HQ {buildingId}` em `src/sim/commands.js` + `CommandExecutor` + `Building.startTierUpgrade(gm)`: valida dono, tier < 3, requisitos do próximo nível, recursos (debita), sem upgrade em andamento. **Durante o upgrade o Centro não treina** (fila pausa) mas continua sendo ponto de entrega. Cancelar devolve 100% (`CMD.CANCEL_UPGRADE_HQ`, ou reuse `CANCEL_RESEARCH` — escolha o mais simples e registre).
3. Ao concluir: `tier++`, PV máximo sobe para o valor do nível **preservando a proporção de PV atual**, evento `EVT.HQ_TIER_CHANGED {buildingId, ownerId, tier, pos}` (novo, `src/sim/events.js`), aviso na HUD "<Nome do nível> concluído". Modelo 3D **permanece o mesmo** (modelos por nível vêm na F7); deixe `modelByTier: {1:null,2:null,3:null}` em `tiers.js` para essa fase.
4. **Requisitos generalizados** (estende `src/sim/requirements.js` da F3-04): `requires` aceita ids de construção (`'farm'`, exige ≥1 concluída) e `{ hq: <tier> }` (exige Centro do dono com `tier` ≥ N e não em upgrade... basta `tier`). Aplicados em: `placeBuilding`, `Building.queueUnit` (campo `requires` em `UNIT_TRAIN_CONFIG`/`units.js`), `startResearch` (campo `requires` em `upgrades.js`). Validam também no `CommandExecutor` (falha silenciosa, sem debitar).
5. Aplicar os requisitos da tabela do design que **já existem no jogo**; o resto entra com as tarefas de cada construção (F4). Como hoje todas as construções existentes são de nível 1, nada existente fica bloqueado — mas os dados suportam `{hq:2}` e um **teste** usa um tipo fictício com `{hq:2}` para provar o bloqueio/desbloqueio.
6. HUD (mudança mínima em `UIManager`, coordene com F3-01/F3-03): card do Centro mostra nome/nível atual, botão "Evoluir para <próximo nome>" (custo no tooltip, desabilitado com lista "Requer: …" / "Recursos insuficientes"), barra de progresso do upgrade. Botões de construção/treino desabilitados mostram os requisitos faltantes no tooltip (via `missingRequirements`).
7. IA (`src/ai/**`): evolui para o nível 2 quando tem recursos sobrando após Quartel + Forja e ≥ 8 trabalhadores; respeita requisitos (usa `missingRequirements`); não trava a economia enquanto o Centro está em upgrade (não enfileira treino nele).
8. Determinismo: baseline pode mudar (IA evolui o Centro) → regravar e justificar. Duas execuções, mesma seed, idênticas.

## Contexto (confirme com grep)
- Centros atuais: `castle` (humano) e `great_hall` (orc) em `src/data/buildings.js`; `src/entities/buildings/orc/GreatHall.js`; `Building.js` (fila `queueUnit` ~l.550, pesquisa ~l.595, progresso em `simUpdate`).
- Comandos: `src/sim/commands.js`, `CommandExecutor.js`. Eventos: `src/sim/events.js`. Requisitos: `src/sim/requirements.js` (F3-04).
- Nomes: use `TIER_NAMES` local em `tiers.js` (F6-09/NEW-3 migra para `src/data/names.js`).

## Não fazer
- Sem novos modelos 3D, sem construções novas (Estábulo, Oficina… são F4), sem petróleo, sem pesquisas em níveis (F3-07), sem renomear o resto da UI. Sem `Math.random`.

## Testes
`tiers.test.js`: upgrade debita e leva o tempo certo; recursos insuficientes/requisito faltando → nada acontece e nada é debitado; PV proporcional após subir; fila pausada durante o upgrade e retomada depois; cancelar devolve; tier 3 não evolui mais; comando de jogador alheio ignorado; `requirements.test.js` estendido com `{hq:2}` (tipo fictício); mesma seed → mesmo checksum.

## Verificação
```bash
npm test && npm run lint && npx vite build --outDir /tmp/claude-1000/warpoly-build-check
npm run smoke
```
Visual (local): `?skipPreload&texq=low&play`; evoluir o Centro (use `game.players[…].add('gold', 5000)` no console), barra de progresso, aviso ao concluir, tooltip de requisitos.

## Docs
`docs/08_GAME_DESIGN.md` §3 (nota do que foi implementado), `docs/01_ARQUITETURA.md`. Não edite `docs/TASKS.md`.

## Entrega
Commits "F3-06 wip: …"; final `F3-06: níveis do Centro e requisitos de tecnologia` com Co-Authored-By de `_COMUM.md`. Relatório ≤ 25 linhas (baseline, desvios, `NEW-<n>`).
