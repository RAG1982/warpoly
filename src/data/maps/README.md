# Mapas orientados a dados (F2-05)

Cada mapa é um JSON em `src/data/maps/<id>.json`, registrado em `index.js` (`getMap(id)`,
`listMaps()`, `DEFAULT_MAP_ID`). Nenhuma coordenada ou tamanho de mapa fica hardcoded no motor
(`Terrain`, `Pathfinder`, `FogOfWar`, `GameManager`, `UIManager`, `MatchConfig`) — tudo vem daqui.

## Formato

```json
{
  "id": "continental-1v1", "name": "Vale do Rio", "size": 140, "playable": 110,
  "tileset": "verdejante", "waterLevel": 0.5, "maxPlayers": 3,
  "terrain": { "generator": "continental", "params": { "baseHeight": 2.6, "river": { ... }, "coast": { ... } } },
  "fords":  [ { "x": -16, "z": -16, "r": 7.5 }, ... ],
  "startSlots": [ { "x": 32, "z": -30, "mirror": [1, 1] }, ... ],
  "resources": [ { "type": "gold", "x": 30, "z": -46 }, ... ],
  "forests":   [ { "x": 12, "z": -54, "count": 6, "radius": 6, "species": "pine" }, ... ],
  "neutrals": [ { "kind": "camp", "x": 40, "z": 20, "guards": 4, "reward": { "gold": 300 }, "deposit": { "type": "gold", "amount": 3000 } }, ... ],
  "decorationDensity": 1.0
}
```

- **`size`**: lado do terreno (metros/unidades de mundo); `segments = round(size * 0.8)` na malha.
- **`playable`**: lado da área realmente navegável; `Pathfinder` usa `playable / 2` como limite.
- **`terrain.generator`**: chave em `TERRAIN_GENERATORS` (`src/world/terrainGenerators.js`).
  - `"continental"`: plataforma com rio diagonal e vaus. `params.baseHeight`, `params.river`
    (`bendAmp`, `bendFreq`, `halfWidth`) e `params.coast` (`start`, `falloff`, onde a faixa costeira
    desce até a água). Os vaus (posição + raio de terra seca) ficam em `fords`, não em `params`.
  - `"islands"`: soma de discos/elipses de terra (`params.islands`: `{x,z,rx,rz}`) e pontes
    retangulares (`params.bridges`: `{x1,z1,x2,z2,width}`), com suavização costeira
    (`params.coast.falloff`) na distância até a forma de terra mais próxima.
  - `"painted"` (F8-03): grade de alturas em décimos (Int8, base64) escrita pelo editor — `params.cell` (2), `params.nodes` (= size/cell + 1), `params.data`; interpolação bilinear (`painted.js`). Único gerador que guarda pincéis de altura/água/vau sem perda.
  - Suporte futuro (heightmap em PNG, sem uso): `"terrain": { "heightmap": "maps/x.png", "scale": 6 }` —
    `loadHeightmap(url)` faz só o carregamento (canvas → `Float32Array`, amostragem bilinear);
    nenhum mapa atual usa isso.
- **`fords`**: vaus/pontes de terra sobre rios — usados pelo gerador `continental` (altura),
  por `GameManager.canPlaceBuilding` (não bloquear a única passagem) e pelas florestas
  (não nascer em cima). Mapas sem rio (ex.: `islands`) deixam `fords: []`.
- **`startSlots`**: posições iniciais por índice (`player.startSlot`). `mirror: [mx, mz]` é o
  espelhamento do layout da base (`MatchConfig.layoutAt`) — se omitido, é calculado a partir do
  sinal de `x`/`z` (`slotMirror`). `maxPlayers` deve ser `>= startSlots.length` usados numa
  partida; `MatchConfig.validateMatchConfig` rejeita partidas com mais jogadores que o mapa aceita
  ou com `startSlot` fora do array.
- **`resources`**: jazidas fixas (`gold`/`stone`). Uma entrada com `"slot": N` só é criada se
  algum jogador da partida usar `startSlot === N` (jazidas extras de um slot de teste/FFA que não
  faz parte do 1×1 padrão do mapa — ver `continental-1v1.json`, slot 2).
- **`forests`**: clusters de árvores (`GameManager.spawnWoodlands`, usando `rngMap` — determinístico
  pela seed da partida). `species` (`oak`/`pine`/`autumn`/`birch`) é o tipo preferido (~65% das árvores do cluster); o resto
  sorteia entre `oak`/`pine`/`autumn` (a bétula só aparece como espécie preferida; o sorteio e o consumo do `rngMap` não mudam).
- **`neutrals`** (F3-10): entidades neutras, criadas por `GameManager.spawnNeutrals()` com RNG
  determinístico (`rng.fork('neutrals')`). Só quando o mapa tem alguma entrada existe o jogador
  neutro hostil (`NEUTRAL_HOSTILE_ID = 99`, time 99). `validateNeutrals` (MatchConfig.js) valida:
  - `{ "kind": "camp", "x", "z", "guards": 1..8, "reward": { "gold"?, "wood"?, "stone"? },
    "deposit": { "type": "gold"|"stone", "amount" } }` — 1 `bandit_camp` (PV 1400) + `guards`
    bandidos em círculo (raio 5, leash 22) + a jazida `deposit` a ~9 do acampamento. Destruir o
    acampamento credita `reward` a quem deu o último golpe (`EVT.CAMP_CLEARED`).
  - `{ "kind": "critters", "species": "sheep"|"pig", "x", "z", "count", "radius" }` — critters
    decorativos (no máximo 40 por mapa; `x`/`z` dentro de `playable`).
  Convenção: acampamentos em terra firme, ≥ 25 de qualquer `startSlot`; em mapas 1×1 os pares
  são espelhados (ponto → oposto).
- **`hidden`** (F6-09): `true` = não aparece em `listMaps()` (lista da Escaramuça); `getMap(id)` e `listMaps({ includeHidden: true })` ainda o devolvem. Usado por `tutorial`.
- **`tileset`** (F7-04): `verdejante` (Floresta, padrão; `ilhas` é alias legado), `inverno`, `devastadas` (Terras Devastadas) ou `pantano`
  (definições em `src/data/tilesets.js`: paleta/splat, água, espuma, névoa/céu, decoração e árvores). Só render — não afeta sim nem
  pathfinding. `?tileset=<id>` na URL força o tileset de qualquer mapa (depuração); a página `terrain-preview.html` mostra os 4 e compara.
  `verdejante` mantém exatamente o visual anterior; os demais pintam o terreno por splat map (grama/terra/areia/pedra/neve/lama por
  altura, declive e ruído). Mapas gerados: `generateMap({ theme })` aceita os mesmos ids e grava em `tileset`.
- **`roads`** (F7-04, opcional): estradas/trilhas pintadas na textura — `[{ "points": [[x, z], ...], "width": 2.2 }, ...]` (mundo; `width` opcional).
- **`splatMasks`** (F7-04, opcional): manchas forçadas no splat — `[{ "layer": "dirt"|"sand"|"rock"|"snow"|"mud"|"grass"|"road", "x", "z", "r", "strength"? }]`
  (uma mancha `dirt` r=6 já é criada sob cada `startSlot`). Ignorado pelo tileset `verdejante`.
- **`decorationDensity`**: reservado (decorações não-jogáveis); não usado ainda.

## Mapas

- **`continental-1v1`** ("Vale do Rio"): mapa histórico (1×1, 2 jogadores) — convertido de
  `Terrain.js`/`GameManager.js` sem mudar o resultado (checksum de determinismo idêntico ao
  master, seed 42). `maxPlayers: 3`: o slot 2 (−14, −46) não faz parte do 1×1 padrão — existe só
  para o teste/uso de FFA de 3 jogadores que já existia antes da F2-05 (`?ffa=1` no mapa padrão).
- **`ilhas-4p`** ("Ilhas Gêmeas"): novo mapa FFA (4 slots, 2 ilhas ligadas por 2 pontes de terra,
  128×128). Jogue com `?map=ilhas-4p&ffa=1`.

- **Pacote skirmish (F8-01)**, gerados com `tools/gen-map.mjs` e salvos como JSON estático (ids e nomes em PT-BR; nomes traduzidos em `src/i18n/*.json`, chave `map.<id>.name`). Testes em `tests/unit/mapsSkirmish.test.js`:
  - **`campos-1v1`** ("Campos Dourados"): 1×1, 160. `--seed 1 --players 2 --size 160 --forest 2`.
  - **`desfiladeiro-1v1`** ("Desfiladeiro"): 1×1, 144. `--seed 2 --players 2 --size 144`.
  - **`vales-2v2`** ("Vales Verdes"): 4 slots para 2v2, 144. `--seed 4 --players 4 --size 144`.
  - **`bosques-2v2`** ("Bosques Antigos"): 4 slots para 2v2, 160. `--seed 5 --players 4 --size 160`.
  - **`planalto-ffa-4p`** ("Planalto"): FFA de 4, 176. `--seed 3 --players 4 --size 176`.
  - **`arquipelago-naval-4p`** ("Arquipélago"): naval, 4 slots, 192 (poços de petróleo e costa para Estaleiro). `--seed 3 --players 4 --size 192 --naval --forest 2`.
  - Não há mapa 1×1 de 96: com a regra de bosques a ≥ 27 dos pátios, o gerador não acha lugar para árvores suficientes nessa área (a seed 1 de 96 tinha 0 árvores). Ver também a nota de bosques no gerador abaixo.
- **`tutorial`** ("Campo de Treino", F6-09, `hidden`): 104×104, uma ilha só (`islands`), 2 slots (jogador SW, rival passivo NE), 1 acampamento de bandidos (2 guardas) como alvo; ver `src/ui/tutorial.js`. Não é validado por `maps.test.js` (usa `listMaps()`); `tests/unit/tutorial.test.js` repete as checagens de terra seca.

## Adicionando um mapa

1. Crie `src/data/maps/<id>.json` seguindo o formato acima.
2. Registre em `index.js` (import estático + entrada em `MAPS`).
3. Rode `npm test` (valida em `tests/unit/maps.test.js`: campos obrigatórios, slots dentro da área
   jogável e em terra seca, recursos em terra, `maxPlayers >= startSlots.length`).

## Mapas gerados (F8-02)

`generateMap({ seed, players: 2..8, size: 96..192, naval, theme, forestDensity, symmetry })` (`generator.js`) devolve um mapa neste
mesmo formato (+ `generated: true`, `generator` com as opções efetivas), determinístico pela seed (PRNG, nunca `Math.random`) e
simétrico (rotacional de N dobras; `symmetry: 'mirror'` para N par). `size` é elevado a `minMapSize(players, naval)` se pequeno demais.
O gerador verifica o mapa antes de devolver (terra seca, conectividade terrestre por flood fill no `Pathfinder`; no naval, poços e
costa de cada base ligados pelo mar). Uso: `node tools/gen-map.mjs --seed 7 --players 4 --size 128 [--naval] --out mapa.json`, ou em
código `registerGeneratedMap(opts)` (`index.js`) para o mapa ficar disponível em `getMap`/`listMaps` e em `MatchConfig`.
Bosques (F8-01): o gerador só põe clusters com centro a ≥ 27 de qualquer base e com `max(|x|,|z|) + raio ≤ playable/2 − 1`
(antes 17 e raio 6 colado na borda, o que deixava árvores inalcançáveis e colava bosques nos pátios).

## Editor de mapas (F8-03)

`/editor.html` (`src/editor/`): pinta terreno (elevar/rebaixar/nivelar/suavizar/terra/água/vau), posiciona bases (`startSlots`), minas de ouro/pedreiras/poços,
bosques e neutros (acampamento/animais), com desfazer/refazer, prévia 3D (leve ou com o terreno/tileset do jogo), importar JSON (inclusive mapas do jogo, que
viram `<id>-editado`), exportar download (`<id>.json`) e salvar no `localStorage` (`warpoly.editor.maps.v1`, rascunho em `warpoly.editor.draft.v1`).
A exportação roda `validateMapDef` (`validate.js`: as checagens de `maps.test.js` + `validateNeutrals`/`validateOilWells` do `MatchConfig` + avisos de jogabilidade e
conectividade) e só baixa sem erros. Um mapa exportado **não** entra sozinho no registro: copie o JSON para `src/data/maps/` e registre em `index.js`
(ou use `registerMap(json)` em código). Modelo puro/testável em `src/editor/mapModel.js`; testes `tests/unit/mapEditor.test.js`; capturas
`node tools/capture-editor.mjs` (via safe-run) em `tools/ui-captures/editor/`.
