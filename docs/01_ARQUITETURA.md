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

Parâmetros de URL úteis: `?skipPreload` (pula o preloader), `?faction=orc` (joga de Orc), `?ffa=1` (FFA de teste: você × 2 IAs, 3 times), `?seed=N` (seed da MatchConfig; ainda não usada pela simulação — F2-03), `?settings=1` (abre painel de config).
Debug: `window.game` expõe o `GameApp` (ex.: `game.gameManager`, `game.sceneManager.renderer.info`). No inspetor: `window.inspectorApp`.

## Mapa de diretórios

```
index.html / style.css        HUD completo em HTML/CSS (loading, top bar, settings, bottom bar, modais)
inspector.html                Inspetor 3D de modelos e animações
public/                       Ícones da HUD (png/svg)
specs/orc_buildings/          Specs de arte das construções orc (direção de arte)
src/
  main.js                     GameApp: boot, preload, loop requestAnimationFrame
  core/
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
    MatchConfig.js            {mapId, seed, players[]}, slots iniciais do mapa, layout da base inicial
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
  ui/UIManager.js             Atualiza HUD DOM, card de seleção, filas, minimapa (desenhado à mão)
  inspector/
    inspector.js              App do inspetor (catálogo de 37 modelos, luzes, wireframe, stats)
    unitAnimator.js           Animações procedurais (idle/walk/fight/gather/hurt/die) — USADO PELO JOGO
```

## Loop principal (`src/main.js`)

```
GameApp.init()
  SoundManager → SceneManager → AssetPreloader.preloadAll() → new GameApp()
     Terrain, Water, Decorations, ParticleSystem, GameManager, InputManager, UIManager
     warmLiveScene() (compila shaders)
animate() [rAF, delta máx 0.1s, sem timestep fixo]
  inputManager.update → sceneManager.updateCamera → water.update
  → gameManager.update(delta*gameSpeed) → particleSystem.update → uiManager.update → render
```

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
- `MatchConfig` (`src/sim/MatchConfig.js`): `{ mapId, seed, players: [{ id, name, factionId, team, color, isAI, isLocal, startSlot }] }`.
  `main.js` monta a config a partir da URL (`matchConfigFromSearch`) e a passa ao `GameManager`. Padrão: 1×1, jogador local = `?faction` ou humano (id 0, time 0), IA = a outra facção (id 1, time 1). `?ffa=1` acrescenta a IA 2 (facção do jogador local, time 2, slot 2).
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
