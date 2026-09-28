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
    Pathfinder.js             Grade 1.5u, A* (open set em array linear), string-pulling; só considera ÁGUA
    FogOfWar.js               Grade 128², canvas → textura num plano a y=5.2
    UpgradeConfig.js          4 pesquisas da forja
    AssetPreloader.js         Constrói e compila todos os modelos/texturas antes do jogo (~35 itens)
    SoundManager.js           SFX e música procedurais
    GLTFBuildingLoader.js     (importado só por entities/buildings/orc/GreatHall.js)
    (EnemyAI.js removido em F0-03; substituído por ai/AIDirector)
  data/                       FONTE ÚNICA de balanceamento (F0-06): units, buildings, upgrades, factions + helpers (index.js)
  sim/                        Estado puro da simulação, sem three.js/DOM (F2-01; testado em tests/unit)
    Player.js                 Jogador: facção, time, cor, recursos, população, pesquisas, derrota
    PlayerRegistry.js         players[], getPlayer, localPlayer, isHostile/isAlly por time (matriz)
    EntityIds.js              Contador monotônico, EntityRegistry (id → entidade), NEUTRAL_OWNER_ID = −1
    MatchConfig.js            {mapId, seed, difficulty, players[]}, slots iniciais do mapa, layout da base inicial, withNewSeed
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
  models/
    units/*Model.js + *Textures.js       8 unidades (4 humanas incl. bandido, 4 orcs)
    buildings/*Model.js + *Textures.js   17 construções
    environment/*                        árvores, rochas, flora, água, terreno, flecha
    materials.js, index.js
  world/
    Terrain.js                Altura = função analítica fixa (continente 140×140, rio diagonal, 3 vaus)
    Water.js, Decorations.js (instanced), TreeManager.js (instanced, 6 draw calls)
  ui/UIManager.js             Atualiza HUD DOM, card de seleção, filas, minimapa (desenhado à mão); dispose() por sessão
  ui/screens/                 MainMenu (F6-01), PauseMenu + gameScreens.css (F2-04)
  render/sceneDisposal.js     Descarte de objetos da partida preservando os caches do ModelFactory (F2-04)
  inspector/
    inspector.js              App do inspetor (catálogo de 37 modelos, luzes, wireframe, stats)
    unitAnimator.js           Animações procedurais (idle/walk/fight/gather/hurt/die) — USADO PELO JOGO
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
animate() [rAF da aplicação, delta máx 0.1s, sem timestep fixo; sem sessão (menu/loading) não desenha]
  session.update(delta, elapsed, simulate = estado InGame):
    inputManager.update → sceneManager.updateCamera → water.update
    → [simulate] gameManager.update(delta*gameSpeed) → particleSystem.update
    → uiManager.update
  → sceneManager.render
  → InGame e gameManager.isGameOver ⇒ PostGame
```

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

`GameManager.update(dt)`:
1. Vitória/derrota: jogador sem HQ (construção com `role: 'hq'`) fica `defeated`. Jogador local derrotado → derrota; só um time vivo → vitória.
2. Árvores → projéteis → construções (`Building.update`) → remove construções mortas.
3. Todas as unidades (`gm.allUnits`, ordem de spawn) (`Unit.update`).
4. `resolveBuildingCollisions` (unidade × todas construções/depósitos/árvores) e `resolveUnitCollisions` (**O(n²)**).
5. `aiDirectors[i].update(dt)` para cada IA não derrotada.
6. `fogOfWar.update` (10 Hz) com as unidades/construções do jogador local e as hostis a ele.
7. Limpeza de mortos (remove de `allUnits`, da lista do dono e de `entitiesById`).

## Modelo de dados (F2-01)

### Jogadores
- `MatchConfig` (`src/sim/MatchConfig.js`): `{ mapId, seed, difficulty, players: [{ id, name, factionId, team, color, isAI, isLocal, startSlot }] }`.
  `main.js` monta a config a partir do menu (`createMatchConfig`) ou da URL (`matchConfigFromSearch`) e a `MatchSession` a passa ao `GameManager`. `difficulty` (`easy|normal|hard|brutal`) é guardada na config (a IA ainda não a lê); `withNewSeed(cfg)` gera a config de "Jogar novamente". Padrão: 1×1, jogador local = `?faction` ou humano (id 0, time 0), IA = a outra facção (id 1, time 1). `?ffa=1` acrescenta a IA 2 (facção do jogador local, time 2, slot 2).
- `Player` (`src/sim/Player.js`): `resources {wood, gold, stone}`, `population`, `maxPopulation`, `researchedUpgrades: Set`, `defeated`, `startPos`; métodos `canAfford`, `deduct`, `add` (tipo ou custo inteiro), `recalculatePop(gm)`.
- `PlayerRegistry`: `getPlayer(id)`, `localPlayer`, `isHostile(a, b)` (times diferentes; matriz pré-calculada, usada nas varreduras O(n²)), `isAlly(a, b)`, `aliveTeams()`. O dono neutro (−1) não é hostil nem aliado de ninguém.
- `GameManager` expõe `players`, `getPlayer`, `localPlayer`, `localPlayerId`, `isHostile`, `isAlly`, `aiDirectors[]` (um `AIDirector(gm, playerId, baseCenter)` por IA; `aiDirector` = o primeiro).
- A IA não tem cópia própria de recursos/população: `AIDirector.resources/population/maxPopulation` são getters do `Player`.
- Toda cobrança/crédito passa pelo dono: `Building.queueUnit/cancelQueuedUnit/startResearch/cancelResearch`, renda passiva, `Unit.depositResources`, construção concluída e `spawnUnit` usam `gm.getPlayer(ownerId)`. Pesquisas (`researchedUpgrades`) são por jogador.

### Entidades
- Toda `Unit`, `Building`, `Tree`, `ResourceDeposit` e projétil (`Arrow`) tem `id` numérico estável (contador monotônico, nunca reaproveitado na vida do `GameManager`) e `ownerId` (−1 = natureza/neutro). `gm.entitiesById` (Map) é mantido no spawn/criação e na remoção (morte, fim do projétil, `resetMap`).
- Hostilidade: `Unit` (aggro, busca de alvo, retaliação, pedido de ajuda a aliados) e `Building` (torres) usam `gm.isHostile(this.ownerId, outro.ownerId)` / `isAlly`. Entrega de recursos só em construções do **mesmo dono**.
- Listas: `gm.allUnits` é a lista única (fonte de verdade). `gm.getUnitsOf(ownerId)` (mantida em add/remove) e `gm.getHostileUnitsOf(ownerId)` (cache invalidado em add/remove) são visões derivadas. **Não modifique os arrays retornados.**
- Bases iniciais: `initMapEntities` cria HQ + serraria + casa + 5 unidades por jogador a partir do slot (`MAP_START_SLOTS`: 0 = NE (32,−30), 1 = SW (−32,30); slots ≥ 2 = primeira posição candidata em que a base inteira passa em `canPlaceBuilding` e fica a ≥ 40 u das outras — hoje (−14,−46), já que (−32,−30) e (32,30) caem no rio). O layout (`START_LAYOUT`) é espelhado por slot e reproduz as posições antigas; os tipos vêm de `FACTIONS[f].startingBase`. Slots extras ganham 1 mina de ouro e 1 pedreira próprias.

### Dívidas registradas (F2-01)
- **Getter `faction`** em `Unit`/`Building`: `'player'` se o dono é o jogador local, `'enemy'` caso contrário. Mantido para `UIManager`, `InputManager` e o anel de seleção. Lógica nova deve usar `ownerId` + `isHostile/isAlly`. Remover quando a UI/Input migrarem (F6/F2-02).
- **Visões derivadas `gm.units` / `gm.enemies`**: `units` = unidades do jogador local; `enemies` = unidades hostis ao local (aliados não locais não aparecem em nenhuma das duas). Usadas por UI, minimapa, `InputManager`, névoa e bench. Escolhidas em vez de trocar tudo para `allUnits` de uma vez para não mexer nos arquivos das lanes UI/GAME/PERF.
- **API econômica legada no `GameManager`** (`resources`, `population`, `maxPopulation`, `canAfford`, `deductResources`, `addResource`, `playerFaction`, `researchedUpgrades {player, enemy}`, `enemyAI`): tudo delega ao jogador local (ou ao primeiro hostil, para `enemy`).
- **Lado legado aceito como dono**: `spawnUnit`/`createBuilding`/`isUpgradeResearched`… aceitam `'player'`/`'enemy'` (`gm.resolveOwnerId`), e os construtores de `Unit`/`Building` aceitam `'player'`→0 / `'enemy'`→1 (`legacyOwnerId`, usado pelo inspetor e pelo bench).
- **Rally no spawn só para jogadores não-IA**: a IA sempre ignorou o ponto de reunião ao treinar; mantido para a partida 1×1 ficar idêntica (revisar na F5).
- **Jogador derrotado** em FFA para de ser controlado pela IA, mas as unidades restantes continuam no mapa (no WC2 elas somem). Sem modo espectador: se o jogador local cai, a partida acaba.
- **Névoa** só considera a visão do jogador local (sem visão compartilhada com aliados). Cor do jogador (`Player.color`) ainda não é usada nos modelos/minimapa.
- `MatchConfig.seed` é gerada/lida mas a simulação ainda usa `Math.random` (F2-03). Slots e jazidas extras ainda são código (F2-05 move para `src/data/maps`).

### Ainda duplicado / hardcoded
- Mapa: coordenadas de depósitos, clusters de árvores e vaus **hardcoded** em `GameManager` e `Terrain`; minimapa redesenha o rio/vaus manualmente (F2-05).

## Pipeline de assets

- Cada `*Textures.js` tem funções `getXTextures()` memoizadas que pintam canvases (map, roughness, metalness, bump) — **498 chamadas `createCanvas(2048…)`**, 41 de 1024, 17 de 512.
- `*Model.js` monta um `THREE.Group` com dezenas/centenas de `Mesh` primitivos nomeados (`Torso`, `ArmL`, `Sword`…).
- `ModelFactory.createX()` cria um template uma vez e devolve `clone(true)` (geometria/material compartilhados), depois `rebindUserData` reconecta os nós usados pelo `UnitAnimator`.
- Construções orcs possuem specs de arte em `specs/orc_buildings/`.

## Pontos de acoplamento a conhecer antes de mexer

- `Unit.js` importa `UnitAnimator` de `src/inspector/` (camada invertida).
- `GameManager` recebe `uiManager` e `sceneManager` por atribuição posterior (`gm.uiManager = …`).
- `Building`/`Unit` precisam de `gameManager` (injetado em `createBuilding`/`spawnUnit`) para achar o `Player` dono e a diplomacia; sem ele caem em regras locais (dono igual/diferente).
- HUD depende de IDs fixos do `index.html`.
