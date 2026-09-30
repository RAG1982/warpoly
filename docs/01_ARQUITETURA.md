# 01 — Arquitetura do WarPoly

> Documento de referência para humanos e agentes. Estado analisado em **2026-09-28** (commit base `5f72bb8` + alterações não commitadas salvas na branch `backup/pre-aaa-2026-09-28`).
> Mantenha este arquivo atualizado sempre que uma tarefa do [TASKS.md](TASKS.md) mudar a arquitetura.

## Stack

| Item | Valor |
|---|---|
| Linguagem | JavaScript ES Modules (sem TypeScript, sem framework de UI) |
| Render | three.js `^0.186.0` (WebGLRenderer, PCFSoftShadowMap, ACES tone mapping) |
| Build | Vite `^8.3.0` — duas entradas: `index.html` (jogo) e `inspector.html` (inspetor 3D) |
| Áudio | Web Audio API 100% sintetizado (sem arquivos de som) |
| Assets | **Zero arquivos 3D/texturas externos**: todos os modelos são construídos em código (primitivas three.js) e todas as texturas são pintadas proceduralmente em `<canvas>` |
| Testes / lint | Nenhum |
| Dev server | `npx vite --port 5173` (config em `.claude/launch.json`, nome `warpoly-dev`) |

Parâmetros de URL úteis: `?skipPreload` (pula o preloader), `?glb=0` (desliga modelos Blender), `?faction=orc` (joga de Orc), `?ffa=1` (FFA de teste: você × 2 IAs, 3 times), `?seed=N` (seed da MatchConfig; ainda não usada pela simulação — F2-03), `?settings=1` (abre painel de config).
Debug: `window.game` expõe o `GameApp` (ex.: `game.gameManager`, `game.sceneManager.renderer.info`, `game.state`); `window.warpoly` é a mesma instância, disponível já no menu. No inspetor: `window.inspectorApp`.

## Mapa de diretórios

```
index.html / style.css        HUD completo em HTML/CSS (loading, top bar, settings, bottom bar, modais)
inspector.html                Inspetor 3D de modelos e animações
public/                       Ícones da HUD (png/svg)
specs/orc_buildings/          Specs de arte das construções orc (direção de arte)
src/
  main.js                     GameApp: máquina de estados, serviços da aplicação, preload único, loop rAF (F2-04)
  core/
    GameStateMachine.js       Estados Boot/MainMenu/MatchSetup/Loading/InGame/Paused/PostGame e transições válidas (F2-04)
    MatchSession.js           Uma partida descartável: cria mundo + GameManager/Input/UI a partir da MatchConfig; dispose completo
    GameManager.js            Estado do jogo, spawn, seleção, ordens, colisões, vitória/derrota (GOD OBJECT)
    SceneManager.js           Cena, renderer, luzes, câmera RTS (pan/zoom/rotação), dia/pôr-do-sol/noite
    InputManager.js           Mouse/teclado, raycast, caixa de seleção, fantasma de construção
    Pathfinder.js             Grade 1.5u, A* com heap binário (MinHeap) + camada dinâmica (dynamicBlock:
                              construções/árvores vivas, além da água), string-pulling, fila com orçamento
                              por frame (requestPath/processQueue) e cache de caminhos por par de células (F1-07)
    FogOfWar.js               Grade 128², canvas → textura num plano a y=5.2
    UpgradeConfig.js          reexporta UPGRADE_CONFIG/FORGE_UPGRADES (derivados de RESEARCH)
    AssetPreloader.js         Constrói e compila todos os modelos/texturas antes do jogo (~35 itens)
    SoundManager.js           SFX e música procedurais
    GLTFBuildingLoader.js     (importado só por entities/buildings/orc/GreatHall.js)
    (EnemyAI.js removido em F0-03; substituído por ai/AIDirector)
  data/                       FONTE ÚNICA de balanceamento (F0-06): units, buildings, upgrades, factions + helpers (index.js)
    maps/                     Mapas orientados a dados (F2-05): <id>.json (getMap/listMaps em index.js) — ver README.md
  sim/                        Estado puro da simulação, sem three.js/DOM (F2-01; testado em tests/unit)
    Player.js                 Jogador: facção, time, cor, recursos, população, pesquisas, derrota
    PlayerRegistry.js         players[], getPlayer, localPlayer, isHostile/isAlly por time (matriz)
    EntityIds.js              Contador monotônico, EntityRegistry (id → entidade), NEUTRAL_OWNER_ID = −1
    MatchConfig.js            {mapId, seed, difficulty, players[]}, layout da base inicial (layoutAt, slots vêm do mapa), withNewSeed
    SpatialGrid.js            Grade espacial (spatial hash) uniforme: insert/update/remove/clear, queryRadius,
                               queryRect, nearest (F1-06; testado em tests/unit/spatialGrid.test.js)
  ai/
    AIDirector.js             Utility AI (tick 1s): U_eco, U_housing, U_def, U_mil — um por jogador de IA (playerId)
    AIEconomyManager.js       Trabalhadores, construção, rebalanceamento de coleta
    AIMilitaryManager.js      Recrutamento, defesa, ondas de ataque (limiar 3–6 tropas)
  entities/
    Unit.js                   Máquina de estados da unidade + stats hardcoded
    Building.js               Construção, fila de treino, pesquisa, torre, chamas + UNIT_TRAIN_CONFIG / BUILDING_BUILD_CONFIG
    buildings/HumanForge.js, buildings/orc/*.js   Subclasses com VFX (initCustomVFX/updateCustomVFX)
    Tree.js, ResourceDeposit.js, Arrow.js, ParticleSystem.js
    ModelFactory.js           Cache de templates + clone; rebind de nós nomeados para animação
  animation/UnitAnimator.js  Animações procedurais (idle/walk/fight/gather/hurt/die) — F2-07: movido de src/inspector/
  sim/EventBus.js, sim/events.js   Barramento de eventos da simulação (F2-07: ver seção "Eventos")
  audio/AudioEvents.js       Ouvinte: eventos → SoundManager (F2-07)
  models/
    units/*Model.js + *Textures.js       8 unidades (4 humanas incl. bandido, 4 orcs)
    buildings/*Model.js + *Textures.js   17 construções
    environment/*                        árvores, rochas, flora, água, terreno, flecha
    materials.js, index.js
  world/
    Terrain.js                Orientado a dados (F2-05): tamanho/altura/vaus vêm de mapDef (src/data/maps)
    terrainGenerators.js      Geradores de altura puros (continental, islands) por mapDef.terrain.generator — testáveis em Node
    Water.js, Decorations.js (instanced), TreeManager.js (instanced, 6 draw calls)
  ui/UIManager.js             Atualiza HUD DOM, card de seleção, filas, minimapa; dispose() por sessão
  ui/minimapCoords.js         Conversão mundo↔minimapa por mapDef.size (F2-05)
  ui/terrainMinimapImage.js   Imagem do terreno (água/areia/grama/rocha) pré-renderizada 1×/partida para o minimapa e as miniaturas do menu (F2-05)
  ui/UiEvents.js              Ouvinte: eventos → UIManager.showNotification (F2-07)
  ui/screens/                 MainMenu (F6-01), PauseMenu + gameScreens.css (F2-04)
  render/sceneDisposal.js     Descarte de objetos da partida preservando os caches do ModelFactory (F2-04)
  render/VfxEvents.js         Ouvinte: eventos → ParticleSystem (F2-07)
  inspector/
    inspector.js              App do inspetor (catálogo de 37 modelos, luzes, wireframe, stats)
    unitAnimator.js           F2-07: reexport de 1 linha de `../animation/UnitAnimator.js` (compatibilidade)
```

## Loop principal (`src/main.js`) e estados do jogo (F2-04)

```
GameApp (vive a página inteira)
  GameStateMachine (src/core/GameStateMachine.js, lógica pura, testada em tests/unit/gameStateMachine.test.js)
    Boot → MainMenu ⇄ MatchSetup → Loading → InGame ⇄ Paused → PostGame → (MainMenu | Loading)
    Boot → Loading (atalhos de URL)   Paused → Loading (Reiniciar) | MainMenu (Menu Principal / Sair)
    Loading → MainMenu (falha ao criar a partida)
  serviços da aplicação, criados na 1ª partida: SoundManager, SceneManager (renderer, cena, luzes, câmera)
  AssetPreloader.preloadAll() roda UMA vez (1ª partida, exceto com ?skipPreload); templates/texturas ficam em cache
  MatchSession (src/core/MatchSession.js) — uma por partida, descartável:
     Terrain, Water, Decorations, ParticleSystem, GameManager(MatchConfig), InputManager, UIManager
     warmLiveScene() (compila shaders)
animate() [rAF da aplicação, delta máx 0.1s; sem sessão (menu/loading) não desenha]
  session.update(delta, elapsed, simulate = estado InGame):
    inputManager.update → sceneManager.updateCamera → water.update
    → [simulate] alpha = gameManager.advance(delta) → gameManager.renderUpdate(delta, alpha) → particleSystem.update
    → [!simulate] gameManager.renderUpdate(0, 1)   // pausado: sem avançar, billboards seguem a câmera
    → uiManager.update
  → sceneManager.render
  → InGame e gameManager.isGameOver ⇒ PostGame
```
- F1-09: a simulação em si roda em passos fixos de `SIM_DT = 0,05 s` (20 Hz) dentro de `advance`,
  independente do FPS de renderização — ver "Loop: tick fixo, interpolação e LOD de animação" abaixo.

- **Menu** (`ui/screens/MainMenu.js`): "Iniciar" chama `onStart({ faction, difficulty })`; a aplicação monta a
  `MatchConfig` (`createMatchConfig`, com `difficulty` e seed nova) e vai para `Loading`. Abrir/fechar o painel
  Escaramuça alterna `MainMenu ⇄ MatchSetup`. Nada recarrega a página.
- **URL (compatibilidade)**: `?play`, `?skipMenu`, `?bench`, `?skipPreload` pulam o menu (`Boot → Loading` com
  `matchConfigFromSearch`: `?faction`, `?ffa`, `?seed`, `?difficulty`); `?texq`, `?quality`, `?settings=1` e o bench
  funcionam como antes. `window.game` = a `GameApp`, exposta ao entrar na 1ª partida; `gameManager`, `inputManager`,
  `uiManager`, `terrain`… são getters da sessão atual (null fora de partida); `sceneManager` e `quality` são da
  aplicação. `window.warpoly` = a mesma instância, já disponível no menu (`warpoly.state`, `warpoly.matchCount`).
- **Pausa** (`ui/screens/PauseMenu.js`): Esc (quando não há colocação de construção nem seleção a limpar —
  `InputManager.onPauseRequest`) ou o botão ❚❚ da HUD (`#btn-pause-menu`). Continuar / Reiniciar (mesma config e
  seed) / Menu Principal / Sair (tenta `window.close()`, senão volta ao menu). Em `Paused` a simulação e as partículas
  param; câmera (WASD/setas, com `InputManager.suspended`), água, HUD e render continuam. O interruptor "Pausa" do
  painel de configurações continua sendo `gm.isPaused` (independente da máquina de estados).
- **Fim de jogo**: `#game-over-modal` (texto pelo `UIManager`) com "Jogar novamente" (`withNewSeed(config)`) e
  "Menu principal". Sem `location.reload()`.
- **Descarte da sessão** (`MatchSession.dispose`): `InputManager.dispose` e `UIManager.dispose` removem os listeners
  de window/DOM (AbortController) e o timer de notificação e devolvem a HUD estática ao estado inicial;
  `ParticleSystem.dispose` limpa partículas e textos flutuantes; todo objeto que a sessão pôs na cena (tudo o que não
  estava nela ao criar a sessão) é removido e suas geometrias/materiais descartados, exceto os dos caches do
  `ModelFactory` (`render/sceneDisposal.js`: templates, fantasmas e materiais compartilhados). Texturas só são
  descartadas por quem as cria por partida (névoa em `GameManager.dispose`, textos flutuantes); as texturas em cache
  por módulo (terreno, árvores, flora, água) sobrevivem. `GameManager.dispose` tira as IAs do loop e solta entidades.
  Teste de vazamento: `tools/ui-captures/state-flow.mjs` (patamar pós-dispose estável; ver relatório da F2-04).
- `GameManager.resetMap/startMatch/setPlayerFaction` continuam existindo (compatibilidade), mas reiniciar a partida
  agora é recriar a sessão — isso corrige o B7.

### Loop: tick fixo, interpolação e LOD de animação (F1-09)
- A simulação roda em passos fixos de `SIM_DT = 0.05 s` (20 Hz; `MAX_STEPS = 8` por chamada, evita
  espiral de morte em frames muito lentos — `src/sim/constants.js`), determinística em relação ao
  FPS de renderização. `MatchSession.update(frameDelta, elapsed, simulate)`:
  ```
  input.update(frameDelta); camera.updateCamera(frameDelta); water.update(elapsed)
  if simulate:
     alpha = gameManager.advance(frameDelta)      // roda 0..N passos fixos, devolve alpha ∈ [0,1)
     gameManager.renderUpdate(frameDelta, alpha)   // interpolação + animação + VFX
     particleSystem.update(frameDelta)
  else:
     gameManager.renderUpdate(0, 1)                // pausado (menu): mantém pose, billboards seguem a câmera
  ```
- `GameManager.advance(frameDelta)`: acumula `frameDelta * gameSpeed`; antes de rodar qualquer passo,
  restaura `mesh.position`/`mesh.rotation.y` de toda unidade e projétil para a última pose
  **simulada** (`_simPos`/`_simRotY`, desfazendo a interpolação visual do frame anterior); depois
  roda `simStep(SIM_DT)` em laço (capturando `_prevPos`/`_prevRotY` antes e `_simPos`/`_simRotY`
  depois de cada passo) até o acumulador ficar abaixo de `SIM_DT` ou atingir `MAX_STEPS` (nesse
  caso o acumulador é zerado). Devolve `alpha` = fração do próximo passo ainda não simulada.
- `GameManager.simStep(dt)` é o corpo antigo de `update(delta)`, com `dt` sempre igual a `SIM_DT`
  (sem chamadas de animação/visual):
  1. Vitória/derrota: jogador sem HQ (construção com `role: 'hq'`) fica `defeated`. Jogador local derrotado → derrota; só um time vivo → vitória.
  2. Árvores → projéteis (`Arrow.simStep`) → construções (`Building.simUpdate`) → remove construções mortas.
  3. Todas as unidades (`gm.allUnits`, ordem de spawn) (`Unit.update`).
  4. `resolveBuildingCollisions` (unidade × todas construções/depósitos/árvores) e `resolveUnitCollisions` (**O(n²)**).
  5. `aiDirectors[i].update(dt)` para cada IA não derrotada.
  6. `fogOfWar.update` (10 Hz) com as unidades/construções do jogador local e as hostis a ele.
  7. Limpeza de mortos (remove de `allUnits`, da lista do dono e de `entitiesById`).
- `GameManager.renderUpdate(frameDelta, alpha)` roda a cada quadro renderizado (não a cada passo de
  simulação): interpola a pose de projéteis (`Arrow.renderUpdate` — posição + quaternion completo,
  já que a trajetória balística usa `lookAt`/pitch), atualiza VFX/billboard de construções
  (`Building.renderUpdate`) e, para cada unidade, aplica o **LOD de animação** por
  frustum/visibilidade/distância antes de chamar `Unit.renderUpdate(frameDelta, alpha, lodStep)`:
  unidade invisível (névoa) ou fora do frustum da câmera não anima (acumula o delta perdido em
  `unit._animAcc`, até 0,5 s, entregue de uma vez quando ela reaparece); a ≤60 u da câmera-alvo
  anima todo quadro; 60–100 u, 1 a cada 2 quadros; >100 u, 1 a cada 4 (`animationLodStep(distance,
  frameIndex, id)` em `src/sim/constants.js`, testável isoladamente — usa `id % k` para espalhar a
  carga entre unidades em vez de todas animarem/pausarem no mesmo quadro).
- `Unit.renderUpdate` interpola `mesh.position`/`mesh.rotation.y` entre `_prevPos/_prevRotY` e
  `_simPos/_simRotY` (menor arco via `lerpAngle`), move o billboard da barra de vida e o
  afundamento visual pós-morte para fora do tick fixo, e sincroniza a animação `fight` com o
  cooldown de ataque de forma contínua (usa `alpha`) para não haver "degrau" a 20 Hz. `Unit.update`
  (chamado por `simStep`) só troca de animação (`setAnimation`) e avança timers — a reprodução
  (`animator.update`/`setTime`) é toda em `renderUpdate`. `Building.simUpdate` mantém fila de
  treino/pesquisa/tiro de torre/produção passiva; `Building.renderUpdate` move billboard, chamas de
  dano, fumaça de chaminé e o `updateCustomVFX` das subclasses (forjas, chiqueiro, bandeiras) para
  fora do tick fixo. `GameManager.update(delta)` continua existindo como wrapper legado
  (`advance` + `renderUpdate`) para chamadores antigos (testes, bench com delta variável).
- `src/debug/bench.js` mede o tempo de `advance` ("sim ms/frame" no rótulo; chave JSON
  `gameUpdateMs`, mantida por compatibilidade com `tools/bench/run-bench.mjs`/`tools/fog-compare`).

## Modelo de dados (F2-01)

### Jogadores
- `MatchConfig` (`src/sim/MatchConfig.js`): `{ mapId, seed, difficulty, players: [{ id, name, factionId, team, color, isAI, isLocal, startSlot }] }`.
  `main.js` monta a config a partir do menu (`createMatchConfig`) ou da URL (`matchConfigFromSearch`, agora também lê `?map=`) e a `MatchSession` a passa ao `GameManager`. `difficulty` (`easy|normal|hard|brutal`) é guardada na config (a IA ainda não a lê); `withNewSeed(cfg)` gera a config de "Jogar novamente". Padrão: 1×1, jogador local = `?faction` ou humano (id 0, time 0), IA = a outra facção (id 1, time 1). `?ffa=1` acrescenta a IA 2 (facção do jogador local, time 2, slot 2). `validateMatchConfig` (F2-05) valida contra o mapa: `players.length <= mapDef.maxPlayers` e todo `startSlot` existe em `mapDef.startSlots`.
- `Player` (`src/sim/Player.js`): `resources {wood, gold, stone}`, `population`, `maxPopulation`, `researchLevels: Map<id, nível>` (F3-07; `researchedUpgrades: Set` derivado, nível ≥ 1), `defeated`, `startPos`; métodos `canAfford`, `deduct`, `add` (tipo ou custo inteiro), `recalculatePop(gm)`.
- `PlayerRegistry`: `getPlayer(id)`, `localPlayer`, `isHostile(a, b)` (times diferentes; matriz pré-calculada, usada nas varreduras O(n²)), `isAlly(a, b)`, `aliveTeams()`. O dono neutro (−1) não é hostil nem aliado de ninguém.
- `GameManager` expõe `players`, `getPlayer`, `localPlayer`, `localPlayerId`, `isHostile`, `isAlly`, `aiDirectors[]` (um `AIDirector(gm, playerId, baseCenter)` por IA; `aiDirector` = o primeiro).
- A IA não tem cópia própria de recursos/população: `AIDirector.resources/population/maxPopulation` são getters do `Player`.
- Toda cobrança/crédito passa pelo dono: `Building.queueUnit/cancelQueuedUnit/startResearch/cancelResearch`, renda passiva, `Unit.depositResources`, construção concluída e `spawnUnit` usam `gm.getPlayer(ownerId)`. Pesquisas são por jogador (`Player.researchLevels`). F3-07: `RESEARCH` (`src/data/upgrades.js`) = `{building:'forge'|'lumber', faction?, levels:[{cost,time,bonus?,effect?,requires}], appliesTo?, name}`; `gm.completeUpgrade` aplica o bônus do nível às unidades vivas (`applyResearchLevelToUnit`), `applyUpgradeToUnit` aplica os níveis acumulados às treinadas depois, `effect.promote` troca o `type` (`promoteUnit`) e `gm.resolveTrainType` faz o Quartel treinar a classe avançada. Requisitos aceitam `{research:'id', level?}`.

### Entidades
- Toda `Unit`, `Building`, `Tree`, `ResourceDeposit` e projétil (`Arrow`) tem `id` numérico estável (contador monotônico, nunca reaproveitado na vida do `GameManager`) e `ownerId` (−1 = natureza/neutro). `gm.entitiesById` (Map) é mantido no spawn/criação e na remoção (morte, fim do projétil, `resetMap`).
- Hostilidade: `Unit` (aggro, busca de alvo, retaliação, pedido de ajuda a aliados) e `Building` (torres) usam `gm.isHostile(this.ownerId, outro.ownerId)` / `isAlly`. Entrega de recursos só em construções do **mesmo dono**.
- Listas: `gm.allUnits` é a lista única (fonte de verdade). `gm.getUnitsOf(ownerId)` (mantida em add/remove) e `gm.getHostileUnitsOf(ownerId)` (cache invalidado em add/remove) são visões derivadas. **Não modifique os arrays retornados.**
- Bases iniciais (F2-05): `initMapEntities` cria HQ + serraria + casa + 5 unidades por jogador a partir de `mapDef.startSlots[player.startSlot]` (`src/data/maps/<mapId>.json` — no mapa continental, slot 0 = NE (32,−30), slot 1 = SW (−32,30), slot 2 = (−14,−46), só usado em partidas FFA de teste). O layout (`START_LAYOUT`) é espelhado por `slot.mirror` (ou, se ausente, por `slotMirror`) e reproduz as posições antigas; os tipos vêm de `FACTIONS[f].startingBase`. Recursos do mapa com `resources[].slot === N` só são criados se algum jogador usar `startSlot === N`.

### Economia WC2 (F3-04): mina com fila, requisitos, sem ouro passivo
- `src/data/economy.js`: `CARRY {gold:10, wood:10, stone:8}` (carga por viagem — `Unit.carrying.max`
  passa a ser fixado por recurso ao começar a coletar, em vez do antigo `WORKER_STATS.carryCapacity`
  único, que deixou de ser lido), `MINE_ENTER_TIME` (1,5 s), `MINE_SLOTS {gold:1, stone:2}` e
  `RATE_BONUS` (multiplicadores por melhoria — só declarados; níveis chegam na F3-06) lidos por
  `gatherMultiplier(playerId, resource, gm)`, que hoje sempre devolve 1.
- `ResourceDeposit` (mina/pedreira) ganhou `slots`/`inside[]`/`queue[]` e `requestEnter(unit)`/
  `release(unit)` — gargalo real (1 ou 2 trabalhadores dentro por vez; fila por ordem de chegada,
  desempate implícito pela ordem de `gm.allUnits`, sem `Math.random`/relógio). `mine(amount)` marca
  `_justDepleted` na primeira vez que `resourcesRemaining` chega a 0; `consumeDepletedFlag()` é
  consumida uma única vez pelo chamador para emitir `EVT.RESOURCE_DEPLETED`.
- `Unit` ganhou os estados `waitingMine` (parado junto à jazida, tentando `requestEnter` a cada
  tick) e `insideMine` (`mesh.visible=false`, fora do `unitGrid` — `gm._removeFromGrid`/
  `_insertIntoGrid`, os mesmos hooks de registro — por `MINE_ENTER_TIME`; ao sair, carrega
  `min(CARRY[recurso], restante) * gatherMultiplier` e libera o slot). Madeira continua cortada
  "de fora" (sem entrar na árvore) — só ouro/pedra usam o mecanismo de mina. `Unit._exitMine()`
  (chamado por `_clearOrderModes`, e explicitamente por `stop`/`hold`, que não passam por ela)
  libera o slot/fila e reaparece sem carga quando uma nova ordem interrompe `waitingMine`/`insideMine`.
- Fazenda/Chiqueiro: `passiveIncome: null` no schema (campo mantido; o bloco em `Building.simUpdate`
  fica código morto, guardado por `passive &&`). Ouro só sai de mina/pedreira.
- `src/sim/requirements.js`: `missingRequirements(playerId, buildingType, gm)` (puro, só lê
  `gm.buildings`) — `BUILDINGS[type].requires` (ex.: `barracks.requires = ['farm']`,
  `orc_barracks.requires = ['pig_farm']`) exige construção **concluída** do dono. Validado em
  `GameManager.placeBuilding` (antes do custo; recusa sem debitar, `EVT.NOTIFY` "Requer: …") e no
  botão de construir do trabalhador (`UIManager.updateWorkerBuildCosts`, `disabled` + tooltip —
  sem UI nova).
- `EVT.RESOURCE_DEPLETED {resourceId, pos, resourceType}`: emitido por `Unit.updateInsideMine` ao
  esgotar; `UiEvents` mostra "Mina de ouro esgotada"/"Pedreira esgotada" via `showNotification`
  (mesmo mecanismo de `EVT.NOTIFY`, sem filtro de `ownerId` — jazida é neutra).
- `tools/eco-curve.mjs`: mede ouro/min por nº de trabalhadores numa mina de 1 vaga (headless);
  precisa de `node --import tools/lib/register-json-loader.mjs` (Node 22 exige atributo de tipo
  em import de `.json`; `src/data/maps/index.js` não usa esse atributo — funciona em Vite/Vitest,
  não em Node puro sem o loader). Ver curva medida em `docs/08_GAME_DESIGN.md` §2.1.

### Grade espacial (F1-06)
- `SpatialGrid` (`src/sim/SpatialGrid.js`, lógica pura sem three.js) indexa entidades por célula (posição do centro, clampada aos limites do mapa) e responde `queryRadius`/`queryRect`/`nearest` sem alocar (buffers reutilizados pelos chamadores). `queryRadius` inclui a entidade quando `distância-centro ≤ r + raio da entidade`; `nearest` usa distância pura (sem raio) e desempata por menor `id`. Resultados de `queryRadius`/`queryRect` vêm ordenados por `id` (determinismo).
- `gm.unitGrid` (unidades, dinâmica) é sincronizada **uma vez por tick**, em `GameManager.simStep` (F1-09), antes do loop `Unit.update` — colisão/alvo/picking do tick usam a posição do início do tick. `gm.blockerGrid` (Building/ResourceDeposit/Tree) é mantida em `registerEntity`/`unregisterEntity`; árvore cortada (`isDead`/`woodRemaining <= 0`) sai da grade no próprio loop de `trees.forEach` do `simStep`.
- Usos: `resolveBuildingCollisions`/`resolveUnitCollisions`/`_checkUnitBlockerCollision` (colisão), `Unit.findNearestHostile*`/`takeDamage` (alvo/aggro/ajuda), `Building` torre (`gm.unitGrid.nearest`), `AIDirector`/`AIMilitaryManager` (intrusos na base), `canPlaceBuilding`/`findNearestResource`/`findNearestDropoff` (colocação/coleta) e `InputManager.raycastScene` (picking do mouse, só as entidades perto do ponto do chão em vez de todas as meshes do jogo).
- `resolveUnitCollisions` resolve cada par uma única vez comparando `id` (só o de maior `id` processa o par), e o empurrão em colisão exata (`dist < 0.001`) usa um ângulo determinístico derivado dos ids das duas unidades em vez de `Math.random()`.
- DÍVIDA: o alcance efetivo de `queryRadius` cresce com o maior raio já visto pela grade (`SpatialGrid.maxRadius`, nunca diminui); em mapas com poucas construções grandes (castelo) isso alarga um pouco a busca em `resolveBuildingCollisions`/`canPlaceBuilding` — aceitável hoje, revisar se algum mapa futuro tiver construções muito maiores.

### Pathfinder (F1-07)
- Duas camadas por célula (grade 1,5u): `staticGrid` (água/bordas, do heightmap do terreno, imutável) e `dynamicBlock` (`Uint16Array`, contador de bloqueios sobrepostos); caminhável = `staticGrid===1 && dynamicBlock===0`. `GameManager._insertIntoGrid`/`_removeFromGrid` chamam `pathfinder.blockCircle(x, z, collisionRadius, ±1)` para Building/Tree viva (árvore cortada é desbloqueada no próprio loop de `trees.forEach`); `blockCircle` usa `radius - 0.3` para não fechar passagens estreitas e incrementa `version` (invalida o cache).
- A* usa `MinHeap` (heap binário, arrays tipados) em vez do antigo open set em array linear (O(log n) por push/pop em vez de O(n) por scan); entradas obsoletas (chave desatualizada) são descartadas via `closedSet` na hora do pop, sem precisar de decrease-key.
- Origem sempre tratada como caminhável (mesmo com `dynamicBlock` na própria célula — unidade encostada numa construção não fica sem caminho); destino bloqueado usa `findNearestWalkable` considerando as duas camadas. `hasLineOfSight` com pontos coincidentes (`dist ~0`) devolve o estado caminhável do próprio ponto em vez de `NaN` (NEW-4).
- Fila com orçamento por frame: `requestPath(unit, destX, destZ, callback)` enfileira; `GameManager.update` chama `processQueue(2)` uma vez por passo, resolvendo pedidos até estourar ~2 ms (`performance.now()`); o resto fica para o próximo frame. `Unit.moveTo`/`moveTowards` usam `requestPath` (nunca `findPath` direto); enquanto o pedido está pendente a unidade anda reto se tiver linha de visão e fica parada caso contrário (não cancela a ordem).
- Cache de caminhos por `(célula origem, célula destino, version)`, limite de 256 entradas (LRU simples via `Map`); só cobre a busca A* completa (o atalho de linha de visão direta já é O(passos), não precisa de cache).

### Dívidas registradas (F2-01)
- **Getter `faction`** em `Unit`/`Building`: `'player'` se o dono é o jogador local, `'enemy'` caso contrário. Mantido para `UIManager`, `InputManager` e o anel de seleção (destaque visual/picking — leitura, não altera estado). Lógica nova deve usar `ownerId` + `isHostile/isAlly`. A F2-02 migrou só os pontos que **alteravam** o estado do jogo (agora comandos, ver seção "Comandos" abaixo); esses usos de leitura continuam com `faction`. Remover quando a UI/Input migrarem.
- **Visões derivadas `gm.units` / `gm.enemies`**: `units` = unidades do jogador local; `enemies` = unidades hostis ao local (aliados não locais não aparecem em nenhuma das duas). Usadas por UI, minimapa, `InputManager`, névoa e bench. Escolhidas em vez de trocar tudo para `allUnits` de uma vez para não mexer nos arquivos das lanes UI/GAME/PERF.
- **API econômica legada no `GameManager`** (`resources`, `population`, `maxPopulation`, `canAfford`, `deductResources`, `addResource`, `playerFaction`, `researchedUpgrades {player, enemy}`, `enemyAI`): tudo delega ao jogador local (ou ao primeiro hostil, para `enemy`).
- **Lado legado aceito como dono**: `spawnUnit`/`createBuilding`/`isUpgradeResearched`… aceitam `'player'`/`'enemy'` (`gm.resolveOwnerId`), e os construtores de `Unit`/`Building` aceitam `'player'`→0 / `'enemy'`→1 (`legacyOwnerId`, usado pelo inspetor e pelo bench).
- **Rally no spawn só para jogadores não-IA**: a IA sempre ignorou o ponto de reunião ao treinar; mantido para a partida 1×1 ficar idêntica (revisar na F5).
- **Jogador derrotado** em FFA para de ser controlado pela IA, mas as unidades restantes continuam no mapa (no WC2 elas somem). Sem modo espectador: se o jogador local cai, a partida acaba.
- **Névoa** só considera a visão do jogador local (sem visão compartilhada com aliados). Cor do jogador (`Player.color`) ainda não é usada nos modelos/minimapa.
- `MatchConfig.seed` é gerada/lida mas a simulação ainda usa `Math.random` (F2-03).

### Mapas orientados a dados (F2-05)
- Cada mapa é um JSON em `src/data/maps/<id>.json` (formato e campos em `src/data/maps/README.md`),
  registrado em `index.js` (`getMap(id)`, `listMaps()`, `DEFAULT_MAP_ID`). Nenhuma coordenada/
  tamanho de mapa fica hardcoded em `Terrain`/`Pathfinder`/`FogOfWar`/`GameManager`/`UIManager`/
  `MatchConfig` — tudo vem de `mapDef`.
- `Terrain(scene, mapDef)`: tamanho, segmentos (`round(size*0.8)`) e altura (`getHeight`, delegado
  a `terrainGenerators.getHeightForMap`) vêm do mapa. `Pathfinder` usa `mapDef.playable/2` como
  meia-largura da área jogável (a grade física é um pouco maior, `+3`, para consultas na borda não
  grudarem numa célula válida). `FogOfWar` usa `mapDef.size + 20` (mesma margem que o mapa
  continental sempre teve).
- Dois mapas hoje: `continental-1v1` ("Vale do Rio", histórico — checksum de determinismo
  idêntico ao de antes da F2-05) e `ilhas-4p` ("Ilhas Gêmeas", novo: 4 slots, 2 ilhas ligadas por
  2 pontes de terra, gerador `"islands"`). Menu de escaramuça lista os mapas via `listMaps()`
  (miniatura = mesmo renderizador do minimapa, `terrainMinimapImage.js`); `?map=<id>` na URL.
- Minimapa (`UIManager.drawMinimap`): o terreno (água/areia/grama/rocha por altura) é renderizado
  **uma vez por partida** num canvas offscreen (`terrainMinimapImage.js`); por quadro só desenha
  essa imagem + entidades + névoa + câmera. Conversão mundo↔minimapa em `ui/minimapCoords.js`
  (`mapDef.size`, não mais `140` fixo).

## Comandos (F2-02)

Multiplayer lockstep (F9), replays (F9-05) e IA justa exigem que **toda** mudança de estado
do jogo venha de um comando serializável (JSON puro — só números/strings/arrays, nunca
referências a entidades), aplicado num tick de simulação conhecido. Desde a F2-02, UI, input
e IA não chamam mais `Unit`/`Building` diretamente — emitem comandos via `gm.issue(...)`.

- **Formato** (`src/sim/commands.js`): `{ tick, playerId, type, unitIds?, targetId?, x?, z?,
  buildingType?, buildingId?, unitType?, upgradeId?, slot?, queued? }`. `CMD` enumera os 13
  tipos (`move`, `attack`, `attackMove`, `gather`, `build`, `placeBuilding`, `placeWall`, `train`,
  `cancelTrain`, `research`, `cancelResearch`, `rally`, `stop`, `hold`, `patrol`).
  `makeCommand(fields)` valida os campos obrigatórios por tipo e congela o objeto;
  `validateCommand` faz o mesmo sem lançar (`{ok, reason}`); `serialize`/`deserialize` são
  `JSON.stringify`/`JSON.parse` (o formato já é JSON puro por construção).
- **Fila** (`src/sim/CommandQueue.js`): `enqueue(cmd)` guarda por `cmd.tick` e atribui
  `seqNo` (ordem de chegada); `drain(tick)` devolve e remove os comandos daquele tick,
  ordenados por `(playerId, seqNo)` — determinístico, independente da ordem de chegada
  pela rede (lockstep). `log` acumula todo comando já drenado (executado), na ordem de
  execução — é o que um replay (F9-05) reaplica. `COMMAND_DELAY_TICKS = 0` hoje (execução
  local); lockstep vai aumentar esse valor para dar tempo de os comandos de outros clientes
  chegarem antes do tick de execução.
- **Executor** (`src/sim/CommandExecutor.js`): resolve os ids via `gm.entitiesById`, verifica
  autoria (a unidade/construção precisa pertencer a `cmd.playerId`; senão descarta com
  `console.warn` e segue) e chama os métodos já existentes das entidades
  (`Unit.moveTo/orderAttack/orderGather/orderBuild/stop/hold/orderAttackMove/orderPatrol`,
  `Building.queueUnit/cancelQueuedUnit/startResearch/cancelResearch/setRallyPoint`,
  `gm.placeBuilding(...)`). Comandos para entidades mortas/inexistentes são ignorados. MOVE
  com várias unidades: o comando carrega só o ponto clicado — a formação (grade + offsets) é
  calculada aqui, não no tradutor.
- **`PLACE_WALL` / `WALL_STEP` (F3-08):** `{ buildingType, points: [{x,z}, …≤60], unitIds }`
  (`WALL_STEP = 2.4` e `WALL_MAX_POINTS = 60` em `src/data/buildings.js`). O executor chama
  `gm.placeWall(type, points, unitIds, ownerId)`: valida cada ponto (`canPlaceBuilding` com o
  `ownerId`, mais distância mínima entre os pontos do próprio comando), cobra n × custo só dos
  válidos (tudo ou nada), cria um `Wall` por ponto via o helper `_createPlacedBuilding`
  (compartilhado com `placeBuilding`; 1 `BUILDING_PLACED` por segmento) e enfileira as obras
  (`orderBuild` + `orderQueue`) nos aldeões escolhidos. `Wall` (`src/entities/Wall.js`) estende
  `Building`, mas o corpo visual vive num `InstancedMesh` por facção (`gm.getWallBatch`).
  `Pathfinder.findPath` marca `path.noPath` quando o destino é inalcançável (o caminho devolvido
  vai até o ponto alcançável mais próximo, ou `[]`); `Unit` usa isso para atacar a muralha
  bloqueadora (`_findBlockingWall`).
- **Integração no `GameManager`**: `gm.commands` (`CommandQueue`) e `gm.currentTick`
  (incrementa a cada `simStep`, 20 Hz). No início de `simStep`, `gm.commands.drain(tick)` é
  executado via `CommandExecutor` antes do resto do passo. `gm.issue(fields)` =
  `commands.enqueue(makeCommand({ ...fields, tick: currentTick + COMMAND_DELAY_TICKS }))` —
  API pública para emitir um comando.
- **`GameManager.issueOrder`** (clique direito) é só um tradutor: decide o tipo de comando
  (MOVE/ATTACK/GATHER/BUILD/RALLY) a partir da seleção e do que está sob o cursor, e emite um
  único comando com os ids envolvidos. `InputManager.confirmPlacement` e `UIManager` (treinar,
  cancelar treino, pesquisar, cancelar pesquisa, parar) fazem o mesmo — os checks de custo/fila
  que sobraram no lado do cliente são só feedback imediato de UI; a validação autoritativa
  (custo, fila, autoria) acontece no executor, no tick de execução.
- **IA**: `AIEconomyManager`/`AIMilitaryManager` emitem com o próprio `playerId` (mesmos tipos
  de comando do jogador humano — inclusive `PLACE_BUILDING`, que agora cobra o custo no
  executor em vez de `deduct`/refund locais no `AIEconomyManager`).
- **Estados novos em `Unit`** (ainda sem tecla — F3-01 adiciona os atalhos): `stop` (já
  existia), `holding` (não se move; ataca sozinha só dentro do próprio `attackRange`),
  `attackMoving` (anda ao destino via `moveTo`; ataca sozinha hostis em `aggroRange` e retoma
  a marcha ao limpar a área) e `patrolling` (alterna entre a posição de origem e o destino,
  com o mesmo comportamento de varredura do attack-move). `Unit._giveUpAttack()` decide, ao
  perder o alvo em combate, se a unidade volta a `idle`, `hold`, retoma o attack-move ou o
  trecho de patrulha.
- **Fila de ordens (`unit.orderQueue`, shift-queue)**: só para MOVE/ATTACK_MOVE/GATHER/BUILD.
  `CommandExecutor` empilha a ordem resolvida em `orderQueue` quando `cmd.queued`; sem
  `queued`, limpa a fila e executa direto (`Unit.runQueuedOrder`). `Unit.updateIdle` consome o
  próximo item da fila assim que a unidade fica `idle` (STOP/HOLD explícitos limpam a fila).
- **Exceções documentadas** (chamadas diretas às entidades, não convertidas para comando —
  não são ordens de jogador): `GameManager.spawnUnit` chama `unit.moveTo` direto para o ponto
  de reunião ao spawnar (efeito interno da simulação); `src/debug/bench.js` continua chamando
  `orderAttack`/`moveTo` direto (ferramenta de teste de performance, sem UI).

## Determinismo (F2-03)

Multiplayer lockstep (F9) e replays (F9-05) exigem que a mesma seed + o mesmo log de comandos
(F2-02) produzam sempre o mesmo estado, em qualquer máquina/motor JS.

- **RNG de simulação vs. visual**: `gm.rng` (`src/sim/rng.js`, `mulberry32(seed)`) é o único RNG
  que pode alterar estado de jogo — posição/tipo de árvore num cluster (`gm.rngMap =
  gm.rng.fork('map')`), spot/tipo de construção e recrutamento da IA (`director.rng =
  gm.rng.fork('ai:'+playerId)`), leve variação no ponto de spawn de unidade treinada
  (`gm.rng`). `Math.random` continua livre para tudo puramente visual (partículas, som,
  decoração, animação, `Tree.fallDir`) — comentado `// visual: não afeta o estado` nos
  pontos que ficaram em `Math.random` por decisão deliberada (ver spec F2-03 para a lista
  completa classificada). `RNG.fork(label)` deriva uma seed por hash (FNV-1a) da seed do pai +
  `label`: sub-RNGs não compartilham sequência entre si nem avançam o estado do pai.
- **Combate (F3-03)**: `gm.combatRng = gm.rng.fork('combat')` (criado junto de `gm.rngMap`, nos
  dois pontos em que `gm.rng` é atribuído — construtor e `startMatch`). `computeDamage(damage,
  target, rng)` (`src/sim/combat.js`, módulo puro — fórmula estilo WC2: `max(0, básico −
  armadura) + perfurante`, tipos `NORMAL/PIERCING/SIEGE/MAGIC`, `× DAMAGE_SCALE` de
  `src/data/combat.js`) consome **exatamente 1** valor de `rng.next()` por golpe — mudar isso
  muda o checksum. Golpe corpo a corpo chama `computeDamage` de imediato; flecha/machado e torre
  chamam no **impacto** (não no disparo), para a armadura/tipo do alvo valerem no instante do
  golpe. `Unit.takeDamage`/`Building.takeDamage` recebem o dano já calculado (não subtraem mais
  armadura nem forçam mínimo 2 — o mínimo 1 já vem de `computeDamage`).
- **Sem relógio na simulação**: `Pathfinder.processQueue(maxNodes = 4000)` orça por nós de
  grade expandidos pelo A* (`Pathfinder._lastNodesExpanded`), não por `performance.now()` —
  o mesmo orçamento produz o mesmo número de buscas resolvidas por tick em qualquer máquina.
  `_searchAStar` já usava um teto por iterações (determinístico) desde antes da F2-03; só o
  dreno da fila entre ticks usava relógio.
- **Ordem de iteração**: laços que alteram estado percorrem `allUnits`/`buildings`/`trees` em
  ordem de `id` (arrays mantidos em ordem de inserção; remoção via `splice`, nunca troca de
  posição). `SpatialGrid.queryRadius` já ordena por id (F1-06).
- **Checksum** (`src/sim/checksum.js`, `stateChecksum(gm)`): hash FNV-1a de 32 bits sobre, em
  ordem de id, unidades (`id, type, ownerId, x, z` arredondados a 1e-3, `hp`, `state`),
  construções (`id, type, ownerId, hp, buildProgress`, tamanho da fila) e recursos de cada
  jogador + `currentTick`. `GameManager.simStep` chama `recordChecksum(gm)` a cada 20 ticks;
  `gm.checksums` guarda os últimos 100 (`{tick, hash}`). Não inclui nada visual.
- **Modo headless** (`MatchConfig.headless`, testes de determinismo em Node sem DOM/WebGL):
  `GameManager` liga `ModelFactory.headless = true`, e `ModelFactory.getOrCreateModel` (usado
  por todo `createXxx()` de unidade/construção/mina/pedreira/flecha) devolve um
  `THREE.Group()` vazio em vez de rodar o gerador procedural (que pintaria texturas em
  `document.createElement('canvas')`, inexistente em Node). Não afeta a simulação:
  posição/estado/colisão de nenhuma entidade dependem da malha visual.
- **Ponto de atenção (não implementado — proposto para F9-03)**: `Math.sin/cos/exp` são
  determinísticos no mesmo motor/mesma versão do V8, mas podem divergir entre navegadores
  diferentes num multiplayer real (não entre replays da mesma máquina). Se isso importar para
  lockstep entre navegadores distintos, F9-03 deve avaliar uma tabela ou implementação própria
  de trigonometria fixa.

## Eventos (F2-07)

A simulação (`Unit`/`Building`/`Tree`/`ResourceDeposit`/`GameManager.simStep`/`src/ai/**`) não
chama `soundManager`/`particleSystem`/`uiManager` diretamente — emite eventos em `gm.events`
(`EventBus`, `src/sim/EventBus.js`), despachados só em `flush()` para os ouvintes de
apresentação. Isso permite rodar a simulação headless (testes de determinismo, F2-03) sem DOM/
Web Audio, e destrava replays futuros (F9-05): o log de comandos reproduz o estado, e os efeitos
visuais/sonoros nunca são "re-disparados" porque o `EventBus` tem `muted` (ainda sem uso).

- **`EventBus`** (`src/sim/EventBus.js`, puro): `on(type, fn) → off`, `off(type, fn)`,
  `emit(type, payload)` (enfileira; `payload` só dados — ids, `pos:{x,y,z}` copiada, números —
  nunca referências a objetos three.js; congelado em `emit`), `flush()` (despacha a fila para
  os ouvintes, na ordem de emissão, e a esvazia), `clear()`.
- **Catálogo** (`src/sim/events.js`, `EVT`): `UNIT_TRAINED`, `UNIT_DIED`, `UNIT_DAMAGED`,
  `BUILDING_PLACED`, `BUILDING_COMPLETED`, `BUILDING_DESTROYED`, `BUILDING_DAMAGED`,
  `RESEARCH_DONE`, `HQ_TIER_CHANGED` (F3-06: Centro concluiu upgrade de nível — ver
  `Building.startTierUpgrade`/`src/data/tiers.js`), `RESOURCE_GATHERED`, `RESOURCE_DEPLETED`, `WORKER_CHOP`/`WORKER_MINE`/
  `WORKER_HAMMER`, `PROJECTILE_FIRED`/`PROJECTILE_HIT`, `MELEE_HIT`, `UNDER_ATTACK`, `NOTIFY`,
  `PLAYER_DEFEATED`, `MATCH_WON`, `MATCH_LOST` — mais `BUILDING_VFX` (decisão da execução, ver
  `events.js`: cobre o VFX ambiente de construção — chaminé, faíscas de forja, serragem, boneco
  de treino orc — que não estava no catálogo original da spec mas também precisou sair da
  simulação). JSDoc do payload de cada um no próprio arquivo.
- **Fluxo**: `gm.events = new EventBus()` (construtor do `GameManager`); `simStep` chama
  `this.events.flush()` no fim (depois do checksum, para nunca influenciar o estado
  determinístico) — inclusive nos `return` antecipados (fim de partida). `renderUpdate`
  (VFX fora do tick fixo — fumaça de chaminé, faíscas) também chama `flush()` no fim do quadro,
  para não esperar até 50 ms pelo próximo `simStep`.
- **Ouvintes** (camada de apresentação, criados por `MatchSession` — nunca em modo headless):
  `src/audio/AudioEvents.js` → `SoundManager`; `src/render/VfxEvents.js` → `ParticleSystem`
  (respeitando névoa via `fogOfWar.isExplored` e `ownerId === localPlayerId` onde a simulação
  antiga já checava isso); `src/ui/UiEvents.js` → `UIManager.showNotification`. Cada um exporta
  `create*Events(gm, manager) → dispose`; `MatchSession.dispose()` chama os três `dispose` antes
  de desligar `InputManager`/`UIManager`.
- **`UnitAnimator`** mora em `src/animation/UnitAnimator.js` (F2-07; antes em
  `src/inspector/`, camada invertida — ver B13 em `04_DIAGNOSTICO.md`); `src/inspector/
  unitAnimator.js` é um reexport de 1 linha para compatibilidade.

## Pipeline de assets

- Cada `*Textures.js` tem funções `getXTextures()` memoizadas que pintam canvases (map, roughness, metalness, bump) — **498 chamadas `createCanvas(2048…)`**, 41 de 1024, 17 de 512.
- `*Model.js` monta um `THREE.Group` com dezenas/centenas de `Mesh` primitivos nomeados (`Torso`, `ArmL`, `Sword`…).
- `ModelFactory.createX()` cria um template uma vez e devolve `clone(true)` (geometria/material compartilhados), depois `rebindUserData` reconecta os nós usados pelo `UnitAnimator`.
- Construções orcs possuem specs de arte em `specs/orc_buildings/`.

## Pontos de acoplamento a conhecer antes de mexer

- `GameManager` recebe `uiManager` e `sceneManager` por atribuição posterior (`gm.uiManager = …`).
- `Building`/`Unit` precisam de `gameManager` (injetado em `createBuilding`/`spawnUnit`) para achar o `Player` dono e a diplomacia; sem ele caem em regras locais (dono igual/diferente).
- HUD depende de IDs fixos do `index.html`.
