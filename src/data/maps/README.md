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
  pela seed da partida). `species` (`oak`/`pine`/`autumn`/`birch`/`broad`/`palm`/`acacia`; tabela em `src/data/treeSpecies.js`) é o tipo preferido (~65% das árvores do cluster); o resto
  sorteia numa lista de companhia (`treeMixFor`): `oak`/`pine`/`autumn` para as espécies antigas; `broad`, `palm` e `acacia` têm lista própria com elas mesmas (a bétula só aparece como preferida). O sorteio e o consumo do `rngMap` não mudam (espécie é só visual). `broad|palm|acacia` são `.glb` lazy: o jogo os baixa só quando o mapa os usa (`lazyTreeKeysOfMap` em `_loadMatch`); a palmeira tem a copa ~1,6 u ao lado do pé (impostor de LOD e hit-proxy acompanham). `coast/layout.js` escolhe a espécie pelo bioma (`speciesForBiome`: palmeira na costa/deserto/areia, acácia na savana, copa larga no exuberante).
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
- **`cliffHeight`** (M3-04, opcional): número (2–12) — todo ponto com altura >= `cliffHeight` é **crista/penhasco intransponível** para unidades terrestres e navais (`src/data/maps/cliff.js`, `Terrain.isCliff`): o `Pathfinder`, `canPlaceBuilding`, o passo da unidade (`Unit.stepTowards`, igual à água), o empurrão da colisão (`_pushDry`) e o nascimento de árvores respeitam; aéreas atravessam. É só terreno alto (o `TerrainView` já pinta a encosta íngreme como rocha), sem grade própria: a crista é escrita no `painted` por `tools/lib/cliffRidge.mjs` e os **desfiladeiros** são as aberturas onde a altura volta ao chão. Mapa sem o campo não muda em nada. `validateMapDef` confere o intervalo e recusa base/jazida sobre a crista (`slotCliff`, `resourceCliff`).
- **`anchors`** (M2-01, opcional): pontos nomeados para as missões — `{ "landingZone": { "x": -52, "z": -28 }, "well1": { "x": 70, "z": 10, "water": true } }`.
  Missões escrevem `{ "anchor": "landingZone", "dx"?: n, "dz"?: n }` no lugar de `{ x, z }` (ver `src/data/missions/README.md`, "Âncoras"), resolvido no
  carregamento da missão, antes da simulação (não entra no checksum). `validateMapDef` confere: nome `[a-zA-Z0-9_-]` (até 48), dentro da área jogável,
  terra seca e sem lava por padrão; `water: true` exige água (`altura < waterLevel`). Mapa sem `anchors` é válido e igual a antes (mapas antigos e campanha
  clássica não têm). Nomes padrão (`defaultAnchors`, `src/data/maps/anchors.js`; o assador `buildCoastWorld` os grava, entre `neutrals` e `meta`):
  `playerStart` (`startSlots[0]`) · `enemyStart` (`[1]`) · `ally1..n` (`[2..]`) · `goldMine1..n` · `stoneQuarry1..n` · `well1..n` (poços de petróleo, `water: true`) ·
  `forest1..n` · `neutralCamp1..n` (neutros `kind: "camp"`) · `ford1..n` · `landingZone` (praia de desembarque: terra seca com água a ≤ 4 u, a ≥ 30 u de
  `playerStart` e a mais próxima dele; ausente se o mapa não tem praia). Âncoras escritas à mão (ex.: `lighthouse`, `townSite`) convivem com as padrão e nunca são
  sobrescritas. Para gravar as padrão num JSON já assado sem regenerar o terreno: `node tools/add-map-anchors.mjs [arquivo…]` (idempotente; `--check` só confere).
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
  conectividade e rota naval, CLI). Mapas do MUNDO-7 registrados em `index.js` (2026-10-16): `duelo-continental-1..3` (sementes 1, 2, 3) e `ilha-unica-1..3` (sementes 1, 2, 3), com ouro de 7.500 por mina (a mina padrão de 2.500 esgotava no meio da partida). Os navais, `dois-continentes-1..3` (sementes 1, 2, 5) e `arquipelago-vivo-1..3` (sementes 1, 3, 4), ficam em `pendentes/`, fora do registro, até existir IA que ataque por mar (NEW-44): as bases estão em regiões de terra separadas por mar. Estado do soak e travamentos aceitos: ver `docs/TASKS.md` (MUNDO-7).

## Mapas de campanha (M2-03 e seguintes · `tools/gen-campaign-maps.mjs`)

**Carregamento sob demanda (M2-28):** os `camp-*.json` NÃO entram no bundle de boot. `campaignLoaders.js` tem a tabela `id → () => import('./<id>.json')` (um chunk por mapa; ao gerar um mapa `camp-*` novo, acrescente-o ali — `tests/unit/campaignLazy.test.js` falha se a tabela e a pasta divergirem). API em `index.js`: `await ensureMapLoaded(id)` (= `loadMap`; resolve na hora para mapas estáticos) antes de criar `Terrain`/`GameManager`; `getMap(id)` continua síncrono e **lança** um erro claro para um `camp-*` ainda não carregado; `peekMap(id)` nunca lança (devolve `undefined`); `hasMap(id)`/`isLazyMap(id)`/`isMapLoaded(id)` consultam o registro; `listMaps()` só traz os `camp-*` já carregados (`listMapIds({ includeHidden: true })` lista todos os ids); `loadAllCampaignMaps()` serve a testes e ferramentas Node. O jogo carrega o mapa em `main.js` (`_loadMatch`, funil de toda partida: menu, missão, save, replay, `?map=`) e o editor ao escolher "do jogo". Em testes e scripts Node, chame `await loadAllCampaignMaps()` (ou `ensureMapLoaded`) antes de usar `getMap('camp-…')`.

Os palcos da campanha são mapas `painted` com `biomeGrid` (e `hidden: true`: não aparecem na lista da Escaramuça; `getMap`/`listMaps({ includeHidden: true })` os devolvem depois de carregados). Saem do assador de costas (`buildCoastWorld`) com um preset por palco e uma etapa de pós-processamento que acrescenta o que a ficha da missão exige (acampamento neutro, minas extras, âncoras nomeadas). Receita em `tools/lib/campaignMaps.mjs` (`CAMPAIGN_PRESETS`, funções `postBaia`/`postPouso`/`postPedra`); CLI e prévia em `tools/gen-campaign-maps.mjs`:

```bash
node tools/gen-campaign-maps.mjs --id camp-02-pouso-do-encontro --scan 20-44 --preview-dir /tmp/prev   # uma prévia PNG por semente
node tools/gen-campaign-maps.mjs --id camp-02-pouso-do-encontro --seed 22 --tries 1 --preview docs/refs/mundo/previews/campanha/camp-02-pouso-do-encontro.png --write
```

A prévia mostra relevo e biomas, as bases (anel branco: azul = slot 0, vermelho = slot 1), minas (quadrado amarelo = ouro, cinza = pedra), bosques (círculo verde), vaus (círculo laranja), acampamentos (alvo vermelho) e as âncoras numeradas (cruz rosa = terra, azul claro = água; a lista sai no terminal). Todos têm ouro de 7.500 por mina e madeira ≥ 8.000 a ≤ 60 u de cada base. O assador ganhou a opção `mountain` (escala da cordilheira do continente `lush`, padrão 1 = como antes; `< 1` = colinas, sem neve junto às bases).

| id | Tamanho / semente | Tileset | Conteúdo |
|---|---|---|---|
| `camp-01-baia-de-aurelan` (A01) | 176 (jogável 164) · semente 1 (`mountain` 0,8) | `exuberante` | continente com 4 enseadas e 2 penínsulas; slot 0 a oeste (jogador), slot 1 a leste (livre); 1 acampamento da Irmandade da Maré (`neutralCamp1`, 4 guardas, +300 de ouro, jazida de 3.000); âncoras `muralFenda` (praia afastada), `shipHorizon` (água, a vela da cutscene) e `landingZone` |
| `camp-02-pouso-do-encontro` (A02 · H02) | 176 · semente 22 (`mountain` 0,35) | `verdejante` | ilha temperada com 1 rio e vaus; slot 0 = Liga (NO), slot 1 = Clãs (L); `pier1`/`pier1Water` (Cais da Liga) e `pier2`/`pier2Water` (barcaça dos Clãs); `logFort` (forte de troncos dos presos), `lighthouse` (Torre da Fenda, ponta de terra), `emissary1` (Emissário orc) e `emissary2` (Mensageiro humano), `patrol1..3` em volta do forte; `expansion1/2` (2ª mina de ouro de cada lado); `landingZone` = `pier1` |
| `camp-03-pedra-mae` (A03 · H03) | 176 · semente 188 | `pedregoso` | ilha rochosa cortada de costa a costa por UMA **crista intransponível** (`cliffHeight` 5, topo ~7,4) entre as bases, com **2 desfiladeiros** de ~7,5 u de passagem (`passA` ao norte, `passB` ao sul, a 26 u um do outro); `wallA1..3`/`wallB1..3` = as 6 muralhas que selam cada passagem (conferido no `Pathfinder`: cada linha de 3 blocos de 2,4 u fecha o desfiladeiro e as duas juntas partem a ilha), `towerA1/A2/B1/B2` = pontos de torre atrás da linha, `ridgeMidPlayer` (entre os desfiladeiros, lado do Paço), `orcMuster` (acampamento orc de onde saem as ondas). **Minas**: a inicial de cada base a ~32 u do Centro (não coladas; era ~15–18 u), do mesmo lado da crista (`goldMine1` = jogador, `goldMine2` = orcs); `colonyGold1` = o Veio, mina grande (12.000) logo atrás dos desfiladeiros, ao alcance das torres; `bridgeheadGold` = 2ª mina dos orcs. `shrine1` (santuário, exploração) e `captive1` (cativeiro dos mineiros) em cantos do platô do jogador. Mantém `beach1..3`/`seaLanding1..3`/`fort1..3`/`bridgehead`/`bridgeheadSea` (assalto da Horda) e `landingZone` = `beach1` |
| `camp-07-brejo-mudo` (A07 · H07) | 320 (jogável 308) · semente 1 | `pantano` | continente pantanoso (pântano/grama escura, chão lento é só visual) com 2 rios/canais e 2 vaus (`ford1/2`); bosques de base e mata extra a 22–46 u de cada Paço (M3-08). **2 bases** a ~151 u: slot 0 = jogador (noroeste) e slot 1 = aliado que trai aos 5:30 (leste; `allyStart` = slot 1, Mervane em A07; `enemyStart` pelo nome padrão). O Salão de Brakka `brakkaHall` fica no brejo a ~125 u de cada base (dono `bandits` na missão), com `boarPen1/2` (Cercados de Javalis) e a mina `brakkaGold`; `ironDepot` (Ferraria de contrabando do traidor, 40–56 u atrás da base do slot 1); `beach1/2` + `seaLanding1/2` (50–100 u das bases); `expansion1/2` a 50–80 u; `landingZone` = `beach1` |
| `camp-08-fornalha` (A08 · H08) | 140 (jogável 128) · semente 35 | `vulcanico` | ilha vulcânica com **um rio de lava norte-sul** (4–6 u) cortando-a em duas áreas, com **2 passagens de rocha** (`lavaPass1` ao norte, `lavaPass2` ao sul; mesma regra do `lavaGrid`: bloqueia terrestres e navais, sem dano); slot 0 = Liga (oeste), slot 1 = Clãs (leste: forja e santuário). Âncoras: `calderaPeak` (Monte Caldeira, ponto mais alto perto do centro), `forge` (Fornalha Naval, na costa) + `forgeWater` (água do oceano para o Estaleiro e os Leviatãs), `sanctum` (Santuário das Cinzas, entre a base dos Clãs e a lava), `captiveCamp` + `captive1..6` (prisioneiros), `lyraArrival` (mar a oeste, chegada dos grifos de Lyra, `water`), 4 poços de petróleo no mar (`well1..4`), `expansion1/2` (ouro; a pedra/obsidiana são as 2 pedreiras); `landingZone` padrão |
| `camp-09-miragem` (A09 · H09) | 176 · semente 34 | `deserto` | ilha deserta (deserto/estepe/rocha, sem manchas de pântano: opção `aridSwamp: false`) com dunas; **3 poços** `waterWell1..3` em zigue-zague no eixo entre as bases (≥ 24 u entre si, ≥ 30 u das bases; o poço 1 é o mais perto do slot 0), cada um com oásis de grama (só visual, raio 4 u + borda de estepe); `ruins1..4`; `fortSite1/2` (Forte Atalaia / Forte do Poço de cada lado); cabeça de ponte nos dois lados: `bridgehead1/2` (praia) + `bridgehead1Sea/2Sea` (água de onde chegam as barcaças e os reforços navais); `nestSite` (Ninho das Serpes, atrás da base do slot 1) e `aviarySite` (Aviário, atrás da base do slot 0); `expansion1/2`; `landingZone` = `bridgehead1` |
| `camp-04-baixio-do-breu` (A04 · H04) | 256 (jogável 244) · semente 5 | `exuberante` (base; `biomeGrid`: oeste grama/floresta, leste deserto/estepe com basalto e rocha) | **dois continentes SEM ligação por terra** (oeste = Liga, leste = Clãs; > 80 u de mar entre as costas) e **2 ilhotas** no meio (norte `islet1`, sul `islet2`: bosque + 2 pontos de torre cada, `isletTower1a/1b/2a/2b`, `isletWood1/2`). **6 poços** (`well1,2` costa da Liga; `well3,4` costa dos Clãs; `well5,6` = `wellMid1/2`, contestados no meio). `shipyard1/2` + `shipyard1Water/2Water`, `refinery1/2` (costa com água navegável, conferida pelo critério de `canPlaceBuilding`), `beach1/2` (praias de embarque da Barcaça), `fleetStart1/2`, `patrol1/2` (patrulha orca), `stellaArrival` (borda norte, água), `shipWreck1/2`, `captive1` (náufragos, ilhota 2), `ruins1` (ponta do continente da Liga). Minas: `goldMine1/2` a ~32 u do Centro, `expansion1/2` e a **mina grande** `farGold1/2` (9.000) a 60–90 u do Centro com o sítio do **Centro extra** `outpost1/2` ao lado dela (o ouro só entrega no Centro). Receita: `postBaixio` (preset `isolated: true`: âncoras de terra conferidas por terra a partir de qualquer um dos dois slots; bosques das ilhotas entram depois do afinar corredor) |
| `camp-05-cerne-verde` (A05 · H05) | 320 (jogável 308) · semente 1 | `verdejante` | ilha de floresta densa (bioma `forest`, 51 bosques) com clareiras, rio curto de 1 vau (`ford1`); `sacredGrove` (clareira cercada de bosques), `gryphonNest` (ponta de terra), `clearing1..3`, `lumberHall1/2` (Salão do Bosque de cada lado: o 2 é o alvo da Liga, o 1 o do assalto da Horda), `orenStart`. M3-06b: o mapa foi ampliado de 176 para 320 (limite de `SIZE_LIMITS` subiu de 256 para 320) e as bases ficaram a ~156 u uma da outra (antes ~85 u; `minSeparation` 155): Liga em (-43,-79), Clã em (80,17); ninho de grifos a leste (x ≥ 30, ≥ 60 u das bases), bosque sagrado 16 u ao sul do caminho entre as bases, clareiras a 62 u das bases, Salão do Bosque a ~40 u da base de cada lado, mata extra de 30 bosques, `riverFordSpacing` 90 (1 vau). M3-06: a missão põe o Salão do Bosque inimigo em `lumberHall2` (Salão do Clã + serraria + 3 torres via `spawnBuilding`), os lenhadores cativos em `clearing2` e o santuário (marco) em `sacredGrove`. Árvores novas (180 de madeira, 1 de cada 3 descartada): ≈ 90 árvores vivas = ≈ 16.000 de madeira |
| `camp-06-a-geada` (A06 · H06) | 208 (jogável 196) · semente 19 | `inverno` | continente gelado (neve, gelo, rocha), **4 vagas** (slot 0 jogador, 1 = Lanças Quebradas/Brumar inimigo principal, 2 = Sal Cinzento, 3 = aliado de IA); 3 **lagos congelados** (`lake1..3`, bioma gelo, altura 0,3) e 10 manchas de **banquisa** (mesmo critério): gelo NÃO navegável; `lighthouse` (Farol Boreal, o ponto mais central, ≥ 34 u de toda base), `enemy1Start/enemy2Start/allyStart`, `enemy1Fort`, `allyFort`, `allyHeroStart` (Dama Aurora/Zarruk), `convoyStart/convoyEnd` (entre o aliado e o jogador), `expansion1..4` (1 mina extra por base) |
| `camp-10-costa-ferrugem` (A10 · vista da Aliança) | 208 (jogável 196) · semente 9 | `deserto` | continente árido de Cinzara (costa irregular a oeste, terra até a borda leste), 5 ilhotas no mar; slot 0 = sítio do Marco da Colônia (`colonyMark`), slot 1 = guarnição de Skarn; `landingZone` (praia a 30–58 u do Marco, com mar aberto à frente, **escolhida pela receita**), `unloadSea` (água junto à praia: `UNLOAD` das Barcaças), `bargeStart1/2` (partida das 2 Barcaças, mar aberto ~70 u da praia), `coastTower1..3` (guarda costeira a 11–26 u da praia), `garrison`, `oldWell` (Poço Velho, objetivo opcional), `expansion1/2` |
| `camp-11-estepe-do-vento` (A11) | 208 (jogável 196) · semente 13 | `savana` | interior de savana e estepe (novo bioma de continente `steppe`: savana, estepe, manchas de deserto e arenito), **3 vagas** (0 = Marco/Porto Albor a oeste, 1 = Skarn a sudeste, 2 = Hurgan a nordeste); `colonyMark`, `skarnStart`, `hurganStart`, `landingZone` + `reinforceSea` (Barcaças de reforço), `convoyStart/convoyEnd` (praia → Marco), `raid1..3` (rotas das 3 incursões, a 56–74 u do Marco), `dissidentClan` (clã dissidente isolado), `expansion1..3` |
| `camp-12-cabo-ferrugem` (A12) | 224 (jogável 212) · semente 12 | `deserto` | continente árido com um promontório a sudoeste apontando para 3 ilhas (arenosa, rochosa, arenosa; canal de 12 u): o slot 0 (`bastion`) fica a 20–46 u da ponta; `strait` (água, ponto médio entre a ponta e a ilha mais próxima: zona de bloqueio de 90 s), `dock1..3` (3 docas orcs no litoral alcançável a 16–66 u do estreito), `fleetStart/fleetStart2` (frota da Liga, oeste), `bossStart` (Skarn, junto ao slot 1), `waveStart1/2` (ondas, a ~72 u do Bastião), `expansion1/2` |

**Afinar corredor (B-arvores-corredor, 2ª passada: `keepFrac` 0,2, `softFrac` 0,3, bosques da serraria VOLTADOS para o corredor também são afinados — os de trás/lado da base ficam —, piso de madeira da campanha 6000 × 1,05 = `CAMPAIGN_WOOD_FLOOR`, Fornalha 5000; `campos-1v1` também usa 6000; os demais mapas fixos seguem com 8000 × 1,05):** etapa final da receita (`finish` em `tools/lib/campaignMaps.mjs`, lógica em `tools/lib/corridorThin.mjs`; parâmetros em `CORRIDOR_PARAMS`/`CORRIDOR_DEFAULTS`). Define o corredor como a faixa de `width` = 44 u em volta das retas slot 0 → demais bases e slot 0 → acampamentos neutros e baixa o `count` dos bosques cujo centro cai nela para `keepFrac` ≈ 1/3, com pesos sorteados por `rng.fork('corredor:<id>')` (alguns bosquetes de cobertura ficam cheios, outros quase vazios; posição e ordem dos bosques não mudam, então as âncoras `forestN` valem). Bosques a ≤ 14 u da serraria do layout (floresta de coleta) ficam intocados; os a < 30 u de uma base só perdem até `softFrac` = 0,45. Uma garantia de madeira devolve árvores (`restoreStep` 2 por passo) ao bosque afinado mais próximo da base deficitária até o estimador passar de 8000 × 1,05. O resultado fica em `meta.corridorThin` (`trees: [antes, depois]` somando `count`, `cut` = índices afinados). Mapas fixos (não gerados pela receita) usam o script único `node tools/thin-corridor-maps.mjs --apply <ids>` (idempotente: guarda os `count` originais em `meta.corridorThin.original`); aplicado a `campos-1v1`, `duelo-continental-1..3`, `ilha-unica-1` e `ilha-unica-3`. `node tools/thin-corridor-maps.mjs --measure all --base-dir <JSONs antigos>` mede as árvores reais (GameManager) na faixa. A prévia PNG mostra os bosques afinados em verde-claro e o eixo do corredor pontilhado.

Convenção dos palcos compartilhados (2 e 3): o slot 0 é o lado da Liga de Aurelan e o slot 1 o dos Clãs do Cinzal; a missão da Horda escolhe o `startSlot` e as âncoras do outro lado (`pier2`, `emissary2`, `bridgehead`…). Testes: `tests/unit/campaignMaps.test.js` (formato, `validateMapDef` sem erros nem avisos, ouro, madeira, âncoras alcançáveis por terra/mar, reprodutibilidade da semente). Soak e tentativas de semente: `tools/soak-report/m2-03/` e `docs/TASKS.md`/relatório da M2-03.

Tentativas de semente (M2-03): o tamanho mínimo que entrega 8.000 de madeira por base em ilha única é 176 (160 rejeitava 14 de 16 sementes; 144, todas). Baía de Aurelan: sementes 1–20 varridas (9 válidas); escolhida a 1 por ter as duas bases em grama (as 9, 14, 17 e 19 colocavam a base sobre neve ou a cordilheira ocupava o centro mesmo com `mountain` 0,8). Pouso do Encontro: sementes 1–16 (com `mountain` 1: base na neve; a ilha da semente 1 era quase igual à da Baía) e depois 20–44; escolhida a 22 (rio com dois vaus, enseadas, sem neve). Pedra-Mãe: 50–69 (6 válidas; 52, 54, 65 e 68 sem lugar para a mina extra, 57, 61 e 69 sem a 3ª praia); escolhida a 62 (praias de pouso em três lados do Paço). Soak da 1ª rodada (`tools/soak-report/m2-03-tentativa1/`): 23/24, com o Pouso travando na semente 8 brutal por esgotar o ouro das 2 minas; resolvido com uma mina de expansão por lado (`expansion1/2`); rodada final (`tools/soak-report/m2-03/`): 24/24 (8 por mapa), determinismo conferido em 3 sementes.

**Lote M2-05 (palcos 7–9).** Testes em `tests/unit/campaignMapsM205.test.js` (arquivo próprio): além do formato/validador/madeira/âncoras do lote anterior, o da Fornalha prova que a lava bloqueia terrestres e navais, que as bases e tudo da ficha se alcançam pelas passagens e que, com a lava cobrindo as passagens, a ilha se parte em duas (cada lado com ≥ 2 minas de ouro). O gerador ganhou (sem mudar nenhum mapa antigo): `lavaTheta` (direção do córrego em radianos; a Fornalha usa π/2 para que as duas bases caiam em áreas diferentes), `aridSwamp` (false = deserto sem manchas de pântano) e `woodTarget` por preset (`buildCoastWorld(..., { woodTarget })`). Convenção: **slot 0 = lado da Liga/jogador, slot 1 = lado dos Clãs/traidor**; a missão que troca de dono usa o `startSlot` do seu lado. **Exceção de madeira (documentada): na geração, a Fornalha exige ≥ 5.000 de madeira PRÓPRIA por base** (`woodTarget` 5000 no preset: a ilha de 128 u jogáveis não comporta 8.000 por base com as bases em áreas separadas pela lava; 200 sementes com 8.000 deram 0 válidas, com 5.000 deram 12 em 80). A madeira só de um lado da lava é ~6.500 por jogador (109 árvores, 13.080 no total); como as passagens ligam as duas áreas, o `measureWood` (todas as árvores a ≤ 60 u e alcançáveis por terra) dá 8.880–10.560 por jogador, acima dos 8.000 do `WOOD_TARGET`, e o teste exige isso; a madeira do outro lado custa cruzar a passagem (ponto de defesa). Os palcos 7 e 9 cumprem os 8.000 por base na geração (≥ 10.000 medidos). Sementes: Brejo Mudo 1–40 (15 válidas no gerador, 7 com todas as âncoras; a 34 tem canal com dois vaus entre as bases e o Salão de Brakka ao sul), Fornalha 1–80 (a 35 tem 2 passagens; 46 e 49 caíam abaixo da meta de madeira na reverificação, 34/36/37/52/53/71 sem lugar para santuário, cativeiro ou mina extra), Miragem 1–80 (7 válidas; a 34 deixa os poços no centro-sul e o espaço entre as bases aberto). Soak 2 jogadores (`tools/soak-report/m2-05/<id>/`): 8/8 por mapa (24/24), determinismo conferido em 3 sementes por mapa; a IA atravessa as passagens da Fornalha e termina as partidas em 8–35 mil ticks. Prévias: `docs/refs/mundo/previews/campanha/<id>.png`.,
Gerador de costa (M2-04, tudo desligado por padrão: os mapas antigos saem byte a byte iguais): opções `scatterIslets` (ilhotas espalhadas), `lakes`/`frozenLakes` (lagos interiores, gelo raso), `shoals`/`shoalRadius`/`shoalBiome` (`shoals.js`: baixios que não cortam a rota naval, o "núcleo" de água funda continua um só pedaço), bioma de continente `forest` (surface.js) e `sides` em `layout.bases` (quadrantes). Preset com `woodTarget` opcional. As âncoras `lake*` (A Geada) são água interior: a receita só exige altura < linha d'água, não oceano. Palcos 4 e 6 são exceção do plano: a Baixio tem a ilha das bases ligada por terra (um mapa só de ilhotas separadas não termina no soak sem IA naval) e a Geada tem 4 vagas (3 + o aliado de IA); a ficha pede "bases em 2 ilhotas", mas 8.000 de madeira por base exige ilha de raio >= 45 u.

Tentativas de semente (M2-04): Baixio do Breu: 1ª configuração (continente 0,40 x 0,20, 26 baixios) válida nas sementes 1, 10, 11 e 12 (a 12 era uma ilha só, grande demais, "ilha com ilhotas"); com 0,35 x 0,18 e 34 baixios só a 10 passou nas sementes 1–60 (as demais: sem 14 u de terra seca ou sem 8.000 de madeira; a 49 e a 55 também sem espaço de Estaleiro; o critério de água aberta foi relaxado de 75 % para 55 % por isso) e foi a escolhida. Soak da 1ª rodada: 7/8 limpas e uma travada (semente 5 hard: sem ouro, 1 mina por base); resolvido com uma mina de expansão por lado. Cerne Verde: 1–16 (válidas 1, 2, 9, 10, 11, 14, 16); a 2 falhou no Salão do Bosque; escolhida a 1 (rio curto no sul, bosque sagrado ao centro). A Geada: 1–20 (só 16 e 19 válidas: os 4 quadrantes precisam de 14 u de terra seca e 8.000 de madeira cada); escolhida a 19 (3 lagos no centro; a 16 tinha 2). Soak final (`tools/soak-report/m2-04/camp-04|05|06/`): 8/8 por mapa, 0 falhas, determinismo conferido em 2 sementes.

Gerador de costa (M2-06): bioma de continente `steppe` (`continentBiome`, surface.js), `bigIslandBiomes` (biomas das ilhas grandes) e `bases[].where(x, z, map)` no layout (filtro livre do preset: o Bastião do Cabo Ferrugem usa `nearStrait`, o par mais próximo ponta-ilha). Tudo desligado por padrão: mapas antigos saem iguais. Palcos 10–12 são o continente de Cinzara: continente ocupa até a borda leste (terra até o limite, sem costa ali). Sementes (M2-06): Costa Ferrugem 1–20 (8 válidas; escolhida a 9, cabo de desembarque a sudoeste do Marco); Estepe do Vento 1–30 (5 válidas, 3 vagas exigem 8.000 de madeira no quadrante nordeste; escolhida a 13, costa a oeste com praia); Cabo Ferrugem 1–24 (13 válidas; escolhida a 12, promontório a sudoeste). Soak 2 jogadores `--count 8`: 8/8 nos três (`tools/soak-report/m2-06/`), determinismo conferido em 3 sementes cada.
