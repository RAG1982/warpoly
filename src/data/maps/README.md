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
  - Suporte futuro (editor F8-03): `"terrain": { "heightmap": "maps/x.png", "scale": 6 }` —
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
  pela seed da partida). `species` é o tipo preferido (~65% das árvores do cluster); o resto
  sorteia entre `oak`/`pine`/`autumn`.
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
- **`decorationDensity`**: reservado (decorações não-jogáveis); não usado ainda.

## Mapas

- **`continental-1v1`** ("Vale do Rio"): mapa histórico (1×1, 2 jogadores) — convertido de
  `Terrain.js`/`GameManager.js` sem mudar o resultado (checksum de determinismo idêntico ao
  master, seed 42). `maxPlayers: 3`: o slot 2 (−14, −46) não faz parte do 1×1 padrão — existe só
  para o teste/uso de FFA de 3 jogadores que já existia antes da F2-05 (`?ffa=1` no mapa padrão).
- **`ilhas-4p`** ("Ilhas Gêmeas"): novo mapa FFA (4 slots, 2 ilhas ligadas por 2 pontes de terra,
  128×128). Jogue com `?map=ilhas-4p&ffa=1`.

## Adicionando um mapa

1. Crie `src/data/maps/<id>.json` seguindo o formato acima.
2. Registre em `index.js` (import estático + entrada em `MAPS`).
3. Rode `npm test` (valida em `tests/unit/maps.test.js`: campos obrigatórios, slots dentro da área
   jogável e em terra seca, recursos em terra, `maxPlayers >= startSlots.length`).
