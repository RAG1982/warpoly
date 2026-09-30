# F3-10 · Neutros hostis (Acampamento de Bandidos) e critters

> **Status: ⏳ A FAZER** (spec pronta 2026-09-30; não disparada — depois de F3-09 mesclada, pois ambas mexem em `PlayerRegistry`/vitória).
> Leia antes: `CLAUDE.md`, `docs/specs/_COMUM.md`, `docs/08_GAME_DESIGN.md` §5.4, `src/data/maps/README.md` (campo `neutrals`), `docs/01_ARQUITETURA.md` (PlayerRegistry/ownerId).
> Executor: **sonnet**, worktree, porta do vite **5206**. Depende de F2-01/F2-05 (jogadores e mapas por dados) e F3-03 (combate). Modelos `bandit` e `bandit_camp` já existem (`src/models/…/BanditModel.js`, `BanditCampModel.js`) — **não** mexer em arte.

## Por quê
O mapa hoje só tem árvores/jazidas neutras (`NEUTRAL_OWNER_ID = -1`, nem hostil nem aliado). O design (§5.4) pede **bandoleiros** que guardam minas extras (recompensa) e **critters** decorativos. `src/data/units.js` já tem `bandit` (faction `neutral`) e `buildings.js` tem `bandit_camp` (role `camp`), mas nada os instancia; `neutrals: []` nos mapas está reservado.

## Pronto quando (mensurável)
1. **Jogador neutro hostil**: `PlayerRegistry` ganha um jogador especial **`NEUTRAL_HOSTILE_ID = 99`** (constante em `src/sim/EntityIds.js`), `team: 99`, `isNeutralHostile: true`, `factionId: 'human'` (irrelevante; sem HUD), **criado só quando o mapa/partida tem `neutrals`**. Regras: hostil a todos os jogadores de time ≠ 99 (a matriz de `rebuildDiplomacy` já dá isso por `team`); **excluído** de: `aliveTeams()`/`alivePlayers`, `_updateVictoryConditions` (nunca é derrotado nem conta para vitória), população/`recalculatePopCap`, lista de jogadores do HUD/minimapa (que só mostra jogadores normais), IA (`AIDirector` não é criado), estatísticas de F3-09 (se já mescladas: `MatchStats` ignora `isNeutralHostile`; se não, deixe TODO em código e relatório). Teste: `players.test.js`/`ownership.test.js` com jogador neutro hostil presente.
2. **Formato de mapa** (`neutrals` em `src/data/maps/*.json`, documentar em `maps/README.md`):
   ```json
   "neutrals": [
     { "kind": "camp", "x": 8, "z": -40, "guards": 4, "reward": { "gold": 300 }, "deposit": { "type": "gold", "amount": 3000 } },
     { "kind": "critters", "species": "sheep", "x": 40, "z": 10, "count": 5, "radius": 6 }
   ]
   ```
   `validateMatchConfig`/loader valida `kind ∈ {camp, critters}`, limites do mapa (`playable`), `guards 1..8`. `continental-1v1.json` e `ilhas-4p.json` ganham **2 acampamentos** cada (posições em terra firme, ≥ 25 de distância de qualquer `startSlot`, **simétricas** para 1×1: par espelhado por `mirror`), cada um com jazida de ouro própria guardada (`deposit`) e 1–2 grupos de critters. **Mudar o mapa muda a seed→estado**: atualize os checksums/golden de `determinism.test.js`/`mapsHeadless.test.js` se forem comparados a valores fixos e registre no relatório (o determinismo entre duas execuções da mesma seed **deve** continuar).
3. **Acampamento**: `GameManager.spawnNeutrals()` (chamado em `initMapEntities` após `spawnResourceDeposits`, antes de `spawnWoodlands`; usa `rngMap`/RNG determinístico da partida — nunca `Math.random`) cria: 1 construção `bandit_camp` (ownerId `NEUTRAL_HOSTILE_ID`, já concluída, PV 1400), `guards` unidades `bandit` em círculo (raio 5) ao redor, e a jazida `deposit` a ~9 unidades do acampamento. Bandidos: comportamento de guarda existente de `Unit` (auto-aquisição por `aggroRange`), mas com **leash**: se se afastarem > 22 do ponto de origem, voltam (`returnHome` — pequena máquina de estado/ordem `moveTo` até o spawn e `stop`, sem persegui-los além); ao voltar recuperam PV a 5 %/s. Não usam pathfinder pesado: orçamento de nós normal.
4. **Recompensa**: ao morrer o **último** `bandit_camp` de um cluster (ou quando o acampamento é destruído), emite `EVT.CAMP_CLEARED {campId, byOwnerId, pos, reward}` e credita `reward` ao dono do último golpe (`killerOwnerId` — usa o campo de F3-09 se mesclada; senão o `attacker` guardado em `Building.takeDamage`; registre qual). Texto de aviso PT-BR ("Acampamento de bandidos destruído! +300 de ouro" via `EVT.NOTIFY`). A jazida só pode ser minerada por quem tiver `ownerId` normal (nada muda em `ResourceDeposit`); os guardas ainda vivos atacam mineradores próximos.
5. **Critters** (`src/entities/Critter.js`, classe leve **sem** `Unit`): espécies `sheep`, `pig` (modelos procedurais mínimos em `src/models/units/CritterModel.js`: corpo caixa low-poly + cabeça, 1 material, ≤ 3 draw calls; reutilize `materials.js`). Vagam em passeio aleatório curto ao redor do ponto de origem (RNG da partida, passo a cada 2–6 s), fogem 4 s ao serem atingidos, `hp: 8`, `ownerId: NEUTRAL_OWNER_ID`, podem ser **alvo de ataque explícito** (clique direito) de qualquer jogador (não hostil por auto-aquisição) e, ao morrer, soltam carcaça 3 s e somam **+0** recursos (decorativos; sem comida no jogo). `EVT.UNIT_DIED` **não** conta para estatística de baixas. Registram-se no `SpatialGrid`/`entitiesById` para seleção, mas ficam fora de `getUnitsOf` de qualquer jogador. Orçamento: ≤ 40 critters por mapa; animação simples de balanço (sem esqueleto), LOD: parados fora da visão do jogador (`FogOfWar`/frustum) **não** atualizam movimento.
6. **Névoa e minimapa**: acampamento e bandidos só aparecem em área visível (regra padrão); minimapa mostra pontos neutros hostis em **laranja** somente quando visíveis; critters não aparecem no minimapa.
7. **IA**: `AIMilitaryManager` pode atacar acampamentos neutros quando `difficulty ≥ normal`, tiver ≥ 8 combatentes e o acampamento estiver a ≤ 60 do Centro (opcional e simples: escolhe `bandit_camp` vivo mais próximo como alvo de `attackMove` uma vez por partida antes de atacar o inimigo). Se ficar complexo, **não implemente** e registre `NEW-25` no backlog.
8. **Seleção/HUD**: clicar em bandido/acampamento mostra card apenas informativo (nome PT-BR, PV, sem comandos) — os cards de outras facções já mostram inimigos; verifique que não quebra em `UIManager` quando `ownerId` não pertence a nenhum jogador do registro (guardas de null).

## Contexto no código
`src/sim/PlayerRegistry.js` (`rebuildDiplomacy`, `aliveTeams`), `src/sim/EntityIds.js`, `src/sim/Player.js`, `src/core/GameManager.js` (`_createPlayers`, `initMapEntities` ~l.445, `spawnResourceDeposits`, `spawnWoodlands`, `isHostile` ~l.182, `getUnitsOf` ~l.310), `src/data/units.js` (`bandit`), `src/data/buildings.js` (`bandit_camp`), `src/data/maps/*.json` e `index.js`, `src/entities/Unit.js` (guarda/auto-aquisição ~l.940–990), `src/entities/ModelFactory.js` (`createBandit`, `createBanditCamp`), `src/entities/ResourceDeposit.js`.

## Não fazer
Arte nova no Blender (F7), unidades neutras que treinam ou constroem, mercenários/lojas, campanha, novos mapas. Não alterar o custo/PV dos modelos existentes. Não usar `Math.random` (só o RNG da partida).

## Testes (Vitest)
`neutrals.test.js`: mapa com `neutrals` cria jogador 99 hostil a todos; bandido ataca unidade próxima e volta ao spawn após leash; `aliveTeams` ignora o neutro; destruir acampamento credita recompensa ao último atacante e emite `CAMP_CLEARED` uma vez; critter é atacável por ordem, não por auto-aquisição, foge ao ser ferido; determinismo (mesma seed → mesmo checksum com neutros); validação do formato (`kind` inválido, fora dos limites). `mapsHeadless.test.js` atualizado. `determinism.test.js`, `players.test.js` verdes.

## Verificação
Mínimos do `_COMUM.md`. No jogo (porta 5206, `?skipPreload&texq=low&play`, safe-run): ver acampamento, aproximar um esquadrão e limpar, conferir recompensa, critters vagando; `game.sceneManager.renderer.info` antes/depois (draw calls +≤ 8). Capturas em `tools/ui-captures/neutrals/`.

## Docs
`docs/02_MECANICAS.md` (neutros, recompensa, leash), `docs/01_ARQUITETURA.md` (`NEUTRAL_HOSTILE_ID`, `Critter`, `CAMP_CLEARED`), `src/data/maps/README.md`, `docs/08_GAME_DESIGN.md` §5.4.

## Entrega
Commits `F3-10 wip: ...`; final `F3-10: bandoleiros, acampamentos neutros e critters`. Relatório ≤ 25 linhas.
