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
  - `{ "kind": "critters", "species": "sheep"|"boar"|"pig", "x", "z", "count", "radius" }` — critters
    decorativos (no máximo 40 por mapa; `x`/`z` dentro de `playable`).
  Convenção: acampamentos em terra firme, ≥ 25 de qualquer `startSlot`; em mapas 1×1 os pares
  são espelhados (ponto → oposto).
- **`hidden`** (F6-09): `true` = não aparece em `listMaps()` (lista da Escaramuça); `getMap(id)` e `listMaps({ includeHidden: true })` ainda o devolvem. Usado por `tutorial`.
- **`tileset`** (F7-04 · MUNDO-TERRENO-MAPAS): `verdejante` (Floresta, padrão; `ilhas` é alias legado), `inverno`, `devastadas` (Terras Devastadas), `pantano`, e os novos biomas `exuberante`, `deserto`, `savana`, `vulcanico`, `pedregoso`
  (definições em `src/data/tilesets.js`: paleta/splat, água, espuma, névoa/céu, iluminação/atmosfera, decoração e árvores). Só render — não afeta sim nem
  pathfinding. `?tileset=<id>` na URL força o tileset de qualquer mapa (depuração); a página `terrain-preview.html` mostra a comparação visual.
  `verdejante` mantém exatamente o visual anterior; os demais pintam o terreno por splat map (grama/terra/areia/pedra/neve/lama por
  altura, declive e ruído). Mapas gerados: `generateMap({ theme })` aceita os mesmos ids e grava em `tileset`.
- **`biomeGrid`** (MUNDO-TERRENO-MAPAS §3.3): grade de biomas por célula para regiões com múltiplos biomas no mesmo mapa —
  `{ "cell": 1, "nodes": N, "data": "<base64 de Uint8[nodes*nodes]>" }` ou formato RLE `{ "cell": 1, "nodes": N, "encoding": "rle", "data": [[count, id], ...] }`.
  Ids canônicos: 0 mar, 1 areia, 2 grama, 3 savana, 4 deserto, 5 estepe, 6 rocha, 7 vulcânico, 8 lava, 9 neve, 10 pântano, 11 gelo, 12 floresta.
  **Render regional (MUNDO-5, só visual):** `tileset` segue sendo o estilo BASE do mapa (água, céu, grade de cor, e o que o `biomeGrid` herda:
  mar longe da costa); o `biomeGrid` escolhe por região a paleta e as regras do splat do terreno (mistura com fronteira irregular), a tinta das
  árvores, a decoração (onde fica cada categoria e a tinta) e a cor/opacidade da água, a cor/força da espuma e as moitas. Bioma → estilo
  (`src/data/biomeStyles.js`): grama→`exuberante`, savana→`savana`, deserto→`deserto`, estepe→`deserto` com palha, rocha→`pedregoso`,
  vulcânico e lava→`vulcanico`, neve→`inverno`, gelo→`inverno` azulado, pântano→`pantano`, floresta→`exuberante` escura; mar e areia herdam o
  estilo da terra vizinha. Mapa SEM `biomeGrid` = render idêntico ao de antes. `?regions=0` na URL desliga o render regional (comparação A/B);
  `?tileset=<id>` (tileset forçado) também o ignora. O `biomeGrid` não entra na sim nem no checksum. A textura do terreno de um mapa com `biomeGrid` (ou `lavaGrid`)
  é alinhada ao mundo (`flipY = false`); nos mapas sem eles ela segue como sempre (ver o achado do espelhamento em z em `src/models/environment/tilesetTextures.js`).
- **`lavaGrid`** (MUNDO-TERRENO-MAPAS §3.5): grade de células de lava — `{ "cell": 1, "nodes": N, "data": "<base64 de Uint8[nodes*nodes]>" }`, 1 = lava.
  Na sim a lava bloqueia como a água (terrestres e navais; aéreas atravessam), sem dano (`Terrain.isLava`). **Render (MUNDO-5, `src/world/Lava.js`):** um
  plano emissivo (1 draw call) a y = 0,8, acima da água (a lava assada tem altura 0,4), recortado pela grade; brilho 1,2–1,8 com pulso lento e duas camadas de
  fluxo em sentidos opostos; o terreno vizinho ganha borda incandescente (textura e cor de vértice) e a espuma/os juncos/as decorações evitam a lava.
  Vale com ou sem `biomeGrid`; `?lava=0` não desenha a lava emissiva.
- **`roads`** (F7-04, opcional): estradas/trilhas pintadas na textura — `[{ "points": [[x, z], ...], "width": 2.2 }, ...]` (mundo; `width` opcional).
- **`splatMasks`** (F7-04, opcional): manchas forçadas no splat — `[{ "layer": "dirt"|"sand"|"rock"|"snow"|"mud"|"grass"|"road", "x", "z", "r", "strength"? }]`
  (uma mancha `dirt` r=6 já é criada sob cada `startSlot`). Ignorado pelo tileset `verdejante`.
- **`decorationDensity`**: reservado (decorações não-jogáveis); não usado ainda.

## Mapas

- **`continental-1v1`** ("Vale do Rio"): mapa histórico (1×1, 2 jogadores) — convertido de
  `Terrain.js`/`GameManager.js` sem mudar o resultado (checksum de determinismo idêntico ao
  master, seed 42). `maxPlayers: 3`: o slot 2 (−14, −46) não faz parte do 1×1 padrão — existe só
  para o teste/uso de FFA de 3 jogadores que já existia antes da F2-05 (`?ffa=1` no mapa padrão).
- **`ilhas-4p`** ("Ilhas Gêmeas"): mapa FFA (4 slots, 2 ilhas ligadas por 2 pontes de terra,
  ampliado para 168×168, playable 156). Jogue com `?map=ilhas-4p&ffa=1`.
- **`estreito-1v1`** ("Estreito de Vaeloria"): mapa 1v1 naval (2 ilhas ligadas por ponte central, 2 poços de petróleo,
  ampliado para 168×168, playable 160).

- **Pacote skirmish (F8-01)**, gerados com `tools/gen-map.mjs` e salvos como JSON estático (ids e nomes em PT-BR; nomes traduzidos em `src/i18n/*.json`, chave `map.<id>.name`). Testes em `tests/unit/mapsSkirmish.test.js`:
  - **`campos-1v1`** ("Campos Dourados"): 1×1, 192 (era 160). Gerado com `--seed 1 --players 2 --size 160 --forest 2` e depois ampliado à mão/por script (ver "Ampliação e florestas densas").
  - **`desfiladeiro-1v1`** ("Desfiladeiro"): 1×1, 176 (era 144). Base: `--seed 2 --players 2 --size 144`.
  - **`vales-2v2`** ("Vales Verdes"): 4 slots para 2v2, 176 (era 144). Base: `--seed 4 --players 4 --size 144`.
  - **`bosques-2v2`** ("Bosques Antigos"): 4 slots para 2v2, 192 (era 160). Base: `--seed 5 --players 4 --size 160`.
  - **`planalto-ffa-4p`** ("Planalto"): FFA de 4, 208 (era 176). Base: `--seed 3 --players 4 --size 176`.
  - **`arquipelago-naval-4p`** ("Arquipélago"): naval, 4 slots, 224 (era 192; poços de petróleo e costa para Estaleiro). Base: `--seed 3 --players 4 --size 192 --naval --forest 2`.
  - Não há mapa 1×1 de 96: com a regra de bosques a ≥ 27 dos pátios, o gerador não acha lugar para árvores suficientes nessa área (a seed 1 de 96 tinha 0 árvores). Ver também a nota de bosques no gerador abaixo.
- **`tutorial`** ("Campo de Treino", F6-09, `hidden`): 104×104, uma ilha só (`islands`), 2 slots (jogador SW, rival passivo NE), 1 acampamento de bandidos (2 guardas) como alvo; ver `src/ui/tutorial.js`. Não é validado por `maps.test.js` (usa `listMaps()`); `tests/unit/tutorial.test.js` repete as checagens de terra seca.

## Regras de Design de Mapas (Tamanho Mínimo, Unidades e Serrarias)

1. **Tamanho Mínimo de 168×168 para Mapas Jogáveis**:
   - Todo mapa jogável de escaramuça / multiplayer DEVE ter no mínimo **168×168** (`size >= 168`, área jogável `playable >= 156`).
   - Mapas abaixo de 168×168 são pequenos demais para a escala tática do jogo, sufocando a expansão de bases, jazidas de ouro/pedra e áreas florestais.
   - `estreito-1v1` (era 140) e `ilhas-4p` (era 128) foram ampliados para 168×168 através de novos lobos e áreas costeiras, preservando 100% dos pontos de terra históricos das missões e canais navais.
   - O validador (`src/data/maps/validate.js`) emite o aviso `sizeBelowMinPlayable` caso um mapa público seja menor que 168×168.

2. **Posicionamento das Unidades Iniciais à Frente da Construção Principal**:
   - Quando o jogo se inicia, todas as unidades existentes da base inicial (trabalhadores, espadachins/grunts e arqueiros/lançadores) DEVEM nascer estritamente **à frente da construção principal** (`dz > 0` no referencial do slot, viradas para o centro do mapa/pátio).
   - Unidades posicionadas atrás do edifício principal ficam escondidas sob a malha 3D e colisão do prédio, atrapalhando a visibilidade, seleção e movimentação inicial do jogador.

3. **Posicionamento da Serraria Próxima a um Arvoredo e Livre de Obstruções**:
   - A serraria inicial (`lumber_camp` / `orc_lumber_mill`) DEVE estar posicionada **próxima de um arvoredo** (`forests`, distância recomendada $\le 12$ unidades), permitindo que os aldeões/peões coletem madeira imediatamente sem percorrer longas distâncias desérticas.
   - **Distância de Segurança contra Obstrução**: A serraria DEVE manter uma distância mínima de segurança ($\ge 9$ unidades) de qualquer mina de ouro, pedreira ou outra construção. Isso impede sobreposição de modelos e garante largura de passagem livre para que os trabalhadores e unidades transitem sem serem bloqueados por colisões de outros objetos.
   - Todos os mapas existentes foram revisados para posicionar a serraria e os bosques de modo alinhado, respeitando a zona de segurança do pátio central ($\ge 26$ u do centro do HQ para que as árvores floresçam normalmente).

## Ampliação e florestas densas (feedback da campanha, 2026-10-11)

Feedback do dono: mapas pequenos e madeira acabando cedo. Medição (`node tools/measure-wood.mjs`; critério de alcance = região conexa do `Pathfinder`, o mesmo de `src/ai/AIWood.js`) e correção:

- **Meta de madeira (`WOOD_TARGET` em `tools/lib/woodStats.mjs`)**: cada jogador alcança por terra, a **≤ 60 u** do pátio, **≥ 8000 de madeira** (~67 árvores de 120). Base: nos soaks a IA corta ~2300–3100 por jogador em 15–20 min (NEW-51: 59 árvores / 3 jogadores esgotaram em 15 min); 8000 dá ~2,5× de folga. Conferido por `tests/unit/mapsWood.test.js` (seeds 1–3).
- **Árvore = 120 de madeira** (`Tree.maxWood`, inalterado). As árvores só nascem a ≥ 26 u de qualquer pátio, ≥ 8,5 de jazidas, ≥ 9 de vaus e com espaçamento ≥ 4,4: mais madeira perto da base exige **mais terra** com bosques, não só mais `count`.
- **Mapas de `islands`**: o tamanho cresce **acrescentando terra** (nunca mudando as ilhas existentes): "lobos" (elipses `r` 12–18 em `terrain.params.islands`) ligados à ilha-mãe por uma ponte de largura 12 (`bridges`), em simetria (rot. 180° nos 1v1; grupo completo nos 4 slots) e fora de acampamentos, jazidas e pontos de missão; `size`/`playable` sobem ~+20 %. O centro/origem e todas as coordenadas antigas ficam válidas (o mapa só ganha terra). Os bosques novos são **anexados ao fim de `forests`** (os antigos consomem o `rngMap` primeiro) em órbitas simétricas, `count` 14–17, `radius` 7,5–9 e `species` rotativa (oak/pine/autumn/birch).
- **`continental-1v1`** (gerador `continental`): `coast.start` 54 → 66, `size` 140 → 168, `playable` 110 → 134. Dentro de |x|,|z| ≤ 54 a altura é idêntica à antiga (`terrainGenerators.test.js`); o rio só passa a existir até 68.
- **Ampliação de `estreito-1v1` e `ilhas-4p`**: ambos ampliados de 140 e 128 para 168×168, cumprindo a regra de tamanho mínimo jogável, com rotas navais e canais preservados.
- **Regra para novos ajustes**: `tests/fixtures/missionTerrainClasses.json` guarda a classe (terra/água) de **toda** coordenada x/z referenciada por missões da campanha e pelos `startSlots` no mapa original; `tests/fixtures/originalMapTerrain.json` guarda o terreno original (compara "nenhuma terra virou água" e a conectividade terrestre/naval). Se uma missão nova citar coordenadas, regenere a primeira fixture.
- Os JSON dos mapas ampliados foram gerados por script a partir dos originais e deixam de ser reproduzíveis por `tools/gen-map.mjs`.

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

## Gerador de costa irregular (MUNDO-1, `src/data/maps/coast/`)

Módulo de dados **puro** (sem three.js, sem DOM, sem `Math.random`; toda a aleatoriedade vem de semente `mulberry32`) que gera continentes e ilhas de
contorno natural (spec `docs/specs/MUNDO-TERRENO-MAPAS.md` §2–3). Promovido do protótipo `tools/lib/irregularCoast.mjs`, que virou um **shim**
(`export * from '../../src/data/maps/coast/index.js'`) para `tools/proto/irregular-coast.mjs`, `tools/gen-world-map.mjs` e os testes antigos.
O jogo **não** roda o gerador (o campo usa `sin/cos/exp`): ele roda em ferramenta/editor e o resultado é assado em JSON `painted`.

- **Geração:** `generateCoast(options)` (geral) e `generateIrregularCoast(options)` (API do protótipo, exige `islands >= 5`). Mesma entrada ⇒ mesmo mapa;
  com as opções padrão a saída é idêntica à do protótipo (conferido em 83 casos). Opções novas: `continents` (2 | 1 | 0), `continentDims`, `bigIslands`,
  `rivers`, `symmetry: 'rotate'` (rotação de 180° **exata** de terra, altura, bioma, rios e bases) e `grid`/`size`.
- **Partes exportadas:** `resolveLagoons` (lagoa com menos de `minLake` células vira terra; as grandes ficam como lagos), `generateLava` (córregos de §3.5),
  `generateRivers` (§2.2: nascem no interior, descem por caminho de menor custo com meandro, canal de 3,4–5 u com leito de −0,6 a −1,4, **vau** de 2,35 a cada
  ~25 u, delta alargado e nascente afilada; o rio é uma camada sobre a terra e `walkableMask` dá a terra caminhável), `analyzeMap` e `verifyCoastMap`
  (componentes, lagoas, rota naval, altura × máscara, lava, rios e simetria).
- **Presets** (`COAST_PRESETS`, tabela de §2.5): `dois-continentes` (224², 2 continentes com canal de ~92 u entre eles, 2 ilhas e 1 ilhota, lava, 1 rio por continente), `duelo-continental` (224², 1
  continente simétrico de 180°), `arquipelago-vivo` (256², 4 ilhas grandes nos cantos com canal de ~62 u, 2 ilhas, sem ilhotas, 4 jogadores), `ilha-unica` (224², uma ilha, 2 bases) e `mundo-campanha` (256²,
  continente alheio + cabeça de ponte). `grid = size` (1 célula = 1 u).
- **Mundo assado:** `buildCoastWorld(preset, { seed, tries })` gera a costa, confere a geografia, assa o terreno (`bakeTerrain`: `painted` `cell` 1 + `lavaGrid` +
  `biomeGrid` RLE), posiciona bases, ouro/pedra, bosques (simula `spawnWoodlands`: madeira ≥ 8000 por jogador a ≤ 60 u), serraria a ≤ 12 u de um bosque, vaus,
  poços de petróleo (naval) e critters (`planLayout`) e confere tudo com o `Pathfinder` real (`verifyCoastWorld`). Se algo falhar, **a semente é rejeitada** e
  tenta `seed+1…` (o resultado diz a `seed` usada e as `attempts`). `mapDef.meta` guarda preset e sementes; o id é `mundo-<preset>-<semente pedida>`.
- **CLI:** `node tools/gen-world-map.mjs --seed 1 --preset dois-continentes [--out mapa.json]` (stdout sem `--out`).
- **Testes:** `tests/unit/coast.test.js` (pureza, shim, determinismo, conectividade, lagoas, rota naval, simetria, ≤ 1 s por mapa), `coastRivers.test.js` (rios e
  vaus, travessia no Pathfinder) e `coastWorld.test.js` (presets, `validateMapDef` sem erros, madeira ≥ 8000 medida com o GameManager real, duelo simétrico,
  conectividade e rota naval, CLI). Mapas jogáveis do MUNDO-7 registrados em `index.js` (2026-10-16): `duelo-continental-1..3` (sementes 1, 2, 3), `ilha-unica-1..3` (sementes 1, 2, 3), `dois-continentes-1..3` (sementes 1, 2, 5) e `arquipelago-vivo-1..3` (sementes 1, 3, 4). Ouro de 7.500 por mina nos doze (a mina padrão de 2.500 esgotava no meio da partida). Estado do soak e travamentos aceitos: ver `docs/TASKS.md` (MUNDO-7).
