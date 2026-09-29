# F2-05 · Mapas orientados a dados

Leia antes: `docs/specs/_COMUM.md`, `CLAUDE.md`, `docs/01_ARQUITETURA.md` (MatchConfig, determinismo com `rngMap`, headless), `docs/05_PARIDADE_WARCRAFT2.md` §6.
Worktree: nova. **Primeiro `git merge master`** (precisa conter F2-07). Porta do vite: **5195**.

## Por quê
Tudo do mapa está hardcoded: `src/world/Terrain.js` (`width=140`, `getHeight` analítico com rio diagonal e 3 vaus em `landmarks`), `src/core/GameManager.js` (`initMapEntities` ~440 usa `MAP_START_SLOTS`, `spawnResourceDeposits`, `spawnWoodlands` com clusters fixos, vaus fixos em `canPlaceBuilding`), `src/sim/MatchConfig.js` (slots do mapa continental), `src/core/Pathfinder.js` (bounds 58), `src/core/FogOfWar.js` (140/160), `src/ui/UIManager.js` `drawMinimap` (~900; rio e vaus redesenhados à mão, `140` fixo; clique no minimapa ~189). Impede novos mapas, FFA real, editor e campanha (B16).

## "Pronto"
- Mapa atual convertido para `src/data/maps/continental-1v1.json` e o jogo **idêntico** (mesmo checksum de determinismo com seed 42 — ver Testes).
- Um segundo mapa jogável `src/data/maps/ilhas-4p.json` (4 slots, 2 ilhas ligadas por 2 pontes de terra, 128×128) funcionando com `?map=ilhas-4p&ffa=1`.
- Nenhuma coordenada/tamanho de mapa hardcoded em GameManager/Terrain/Pathfinder/FogOfWar/UIManager/MatchConfig (grep por `140`, `55`, `58`, `landmarks`, `fords`).

## Formato (`src/data/maps/<id>.json`, documentar em `src/data/maps/README.md`)
```json
{
  "id": "continental-1v1", "name": "Vale do Rio", "size": 140, "playable": 110,
  "tileset": "verdejante", "waterLevel": 0.5, "maxPlayers": 2,
  "terrain": { "generator": "continental", "params": { "baseHeight": 2.6, "river": { "bendAmp": 5.5, "bendFreq": 0.08, "halfWidth": 6.0 },
               "coast": { "start": 54, "falloff": 12 } } },
  "fords":  [ { "x": -16, "z": -16, "r": 7.5 }, { "x": 0, "z": 0, "r": 8.5 }, { "x": 16, "z": 16, "r": 7.5 } ],
  "startSlots": [ { "x": 32, "z": -30, "mirror": [1,1] }, { "x": -32, "z": 30, "mirror": [-1,-1] } ],
  "resources": [ { "type": "gold", "x": 30, "z": -46 }, ... ],
  "forests":   [ { "x": 12, "z": -54, "count": 6, "radius": 6, "species": "pine" }, ... ],
  "neutrals": [],
  "decorationDensity": 1.0
}
```
- `terrain.generator`: `"continental"` (função atual, parametrizada) e `"islands"` (novo: soma de discos/elipses de terra `{x,z,rx,rz}` + `bridges` retangulares `{x1,z1,x2,z2,width}` com suavização costeira). Registro de geradores em `src/world/terrainGenerators.js` (puro, testável em Node).
- Suporte futuro a heightmap (editor F8-03): aceite `"terrain": { "heightmap": "maps/x.png", "scale": 6 }` — **implemente só o carregamento** (canvas → Float32Array, bilinear) atrás de uma função `loadHeightmap(url)`; não é usado pelos 2 mapas desta tarefa.

## Implementação
1. `src/data/maps/index.js`: `getMap(id)` (import estático dos JSON), `listMaps()`, `DEFAULT_MAP_ID`.
2. `Terrain(scene, mapDef)`: tamanho/segmentos/`getHeight` vêm do mapa (`segments = round(size*0.8)`); `landmarks` substituído por `mapDef.fords`/slots; textura (`getTerrainTextures`) recebe os dados do mapa.
3. `Pathfinder(terrain)`: bounds = `playable/2`.
4. `FogOfWar`: tamanho do mapa vindo do Terrain/mapDef.
5. `MatchConfig`: `mapId` (padrão `DEFAULT_MAP_ID`; `?map=` na URL); validar `players.length <= maxPlayers`; slots vêm do mapa (remover `MAP_START_SLOTS`/`extraCandidates` hardcoded; o slot extra atual (−14,−46) vira o 3º slot do JSON continental — mantendo seus depósitos extras como `resources` com `slot: 2` que só são criados se o slot estiver em uso).
6. `GameManager.initMapEntities`: bases pelos `startSlots` (com `mirror` para o layout de base da facção), recursos de `resources`, florestas de `forests` via `rngMap` (mesma ordem de chamadas do código atual para preservar o checksum), vaus/`fords` de `mapDef` em `canPlaceBuilding`.
7. Minimapa (`UIManager.drawMinimap` e clique ~189): renderizar **uma vez** por partida uma imagem do terreno amostrando `terrain.getHeight` (água/areia/grama/rocha por altura) num canvas offscreen do tamanho do minimapa; por frame só desenhar essa imagem + entidades + névoa + câmera. Conversão mundo↔minimapa usa `mapDef.size`. **Atenção**: F3-01 (nuvem) pode estar mexendo no clique direito do minimapa — mantenha a função de conversão num helper exportado (`src/ui/minimapCoords.js`) para o merge ser trivial.
8. Menu de escaramuça (`src/ui/screens/MainMenu.js`): lista de mapas via `listMaps()` (nome, jogadores, miniatura gerada pelo mesmo renderizador do minimapa, em canvas), repassando `map` para a partida.

## Não fazer
- Não mudar balanceamento, modelos, névoa (além do tamanho), render.
- Arquivos da nuvem em andamento: `src/core/InputManager.js`, `style.css`, `src/ui/screens/OptionsPanel.js` — evite.

## Testes (Vitest)
- `terrainGenerators.test.js`: gerador `continental` com os params do JSON reproduz `getHeight` antigo em 2 000 pontos aleatórios (copie a função antiga para o teste, tolerância 1e-9).
- `maps.test.js`: todos os JSON validam (campos obrigatórios, slots dentro do jogável e em terra seca, recursos em terra, `maxPlayers == startSlots.length` sem contar extras).
- `determinism.test.js`: o checksum com seed 42 **não muda** em relação ao master (grave o valor do master antes de alterar e compare).
- Headless: partida FFA 4 jogadores em `ilhas-4p`, 2 000 ticks, sem exceção, IAs crescendo.

## Verificação
Comandos mínimos do `_COMUM.md` (`npm run smoke` já usa safe-run — não aninhe). Capturas via safe-run (porta 5195, `?texq=low&skipPreload`): `continental-1v1` (igual ao master) e `ilhas-4p` com `ffa=1`, e o minimapa de cada um em `tools/ui-captures/maps/`. Olhe as imagens.

## Docs
`docs/01_ARQUITETURA.md` (mapas por dados), `docs/02_MECANICAS.md` (mapas disponíveis), B16 corrigido em `docs/04_DIAGNOSTICO.md`.

## Entrega
Commit: `F2-05: mapas orientados a dados (continental-1v1, ilhas-4p), minimapa a partir do terreno`.
