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

Parâmetros de URL úteis: `?skipPreload` (pula o preloader), `?faction=orc` (joga de Orc), `?settings=1` (abre painel de config).
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
  ai/
    AIDirector.js             Utility AI (tick 1s): U_eco, U_housing, U_def, U_mil
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
1. Checa vitória/derrota (só pela existência do HQ: `castle` / `great_hall`).
2. Árvores → projéteis → construções (`Building.update`) → remove construções mortas.
3. Unidades do jogador e inimigas (`Unit.update`).
4. `resolveBuildingCollisions` (unidade × todas construções/depósitos/árvores) e `resolveUnitCollisions` (**O(n²)**).
5. `aiDirector.update(dt)`.
6. `fogOfWar.update` (10 Hz).
7. Limpeza de mortos.

## Modelo de dados atual

- **Somente dois lados**: strings `'player'` e `'enemy'`. Listas separadas `gm.units` / `gm.enemies`.
- Recursos do jogador em `GameManager.resources`; recursos da IA em `AIDirector.resources` (código duplicado com `if (faction === 'enemy')` espalhado em `Building` e `Unit`).
- Facção do jogador: `gm.playerFaction` (`'human'|'orc'`) — definida por URL, recria o mapa.
- Estatísticas **duplicadas em vários lugares** (fonte de bugs):
  - `Unit.getUnitStats()` (hp, dano, alcance…)
  - `Building.getBuildingStats()` + `BUILDING_BUILD_CONFIG` + `InputManager.getCost()` (custos repetidos 3×)
  - `UNIT_TRAIN_CONFIG` (custos de treino) vs `AIDirector.costs` (divergentes!)
  - `FogOfWar.visionRadii`, `Building.getBuildingHeight()`, `Unit.getHealthBarHeight()`
  - `UIManager.BUILDING_TRAINABLE_UNITS`, `WORKER_BUILD_LIST`
- Mapa: coordenadas de bases, depósitos, clusters de árvores e vaus **hardcoded** em `GameManager` e `Terrain`; minimapa redesenha o rio/vaus manualmente.

## Pipeline de assets

- Cada `*Textures.js` tem funções `getXTextures()` memoizadas que pintam canvases (map, roughness, metalness, bump) — **498 chamadas `createCanvas(2048…)`**, 41 de 1024, 17 de 512.
- `*Model.js` monta um `THREE.Group` com dezenas/centenas de `Mesh` primitivos nomeados (`Torso`, `ArmL`, `Sword`…).
- `ModelFactory.createX()` cria um template uma vez e devolve `clone(true)` (geometria/material compartilhados), depois `rebindUserData` reconecta os nós usados pelo `UnitAnimator`.
- Construções orcs possuem specs de arte em `specs/orc_buildings/`.

## Pontos de acoplamento a conhecer antes de mexer

- `Unit.js` importa `UnitAnimator` de `src/inspector/` (camada invertida).
- `GameManager` recebe `uiManager` e `sceneManager` por atribuição posterior (`gm.uiManager = …`).
- `Building`/`Unit` chamam `gameManager.aiDirector` diretamente para creditar/debitar recursos da IA.
- HUD depende de IDs fixos do `index.html`.
