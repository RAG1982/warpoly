# ART-02 e ART-03 (parte vegetação seca): três árvores, capim seco e arbusto rolante

Tarefas P0 de `docs/specs/MUNDO-TERRENO-MAPAS.md` §6. Cinco `.glb` em `public/models/`, gerados por **um** script, `tools/blender/build_vegetacao_seca_arvores.py` (Blender 5.2.1, 100 % por código; rodar sempre via `tools/safe-run.sh`). Prévias (Blender, fundo transparente, 512 px) e uma comparação com as árvores atuais no inspetor em `tools/ui-captures/art-p0/`. **Nada em `src/` foi alterado**: os trechos de registro estão na §5 e o que falta para aparecerem no mapa, na §6.

## 1. O que foi feito
| Arquivo | Raiz | O que é |
|---|---|---|
| `tree_broad.glb` | `TreeBroad` | Variante alta de copa larga: tronco de ~1,5 de diâmetro na base (quatro contrafortes), bifurcação a ~3,5 e cinco braços que sustentam uma copa de ~6,6 em quatro andares de massas facetadas (saia escura, miolo, andar superior, topo claro). Mais alta e mais larga que o carvalho (6,6 de altura, 5,4 de copa) e com a copa mais escura, como os bosques da referência exuberante. |
| `tree_palm.glb` | `TreePalm` | Palmeira: tronco curvo (inclina ~14° e volta a subir) com anéis de cicatriz pintados, "pescoço" verde, cacho de cocos, 16 frondes vivas (3 jovens quase de pé, 7 maduras em arco, 6 baixas caindo) e 2 secas penduradas. Cada fronde é uma fita larga com margem em dentes de serra e nervura central clara. |
| `tree_acacia.glb` | `TreeAcacia` | Acácia: tronco torto em S que se abre em cinco braços, copa achatada em guarda-chuva (22 massas de folhagem bem mais largas que altas, em três andares, borda recortada). Tom oliva-dourado, de savana. |
| `grass_dry.glb` | `GrassDry` | Tufo de capim seco em forma de fonte: 12 lâminas em cone (7 longas e arqueadas no anel de fora, 5 mais eretas no de dentro), ouro-palha `#c9a24a` com base escurecida, algumas pálidas e algumas mais escuras. |
| `tumbleweed.glb` | `Tumbleweed` | Arbusto rolante: esfera emaranhada de ~0,85 de galhos secos (74 arcos, 22 galhos radiais que furam a casca, 20 folhinhas), palha-escuro, interior escurecido pelo AO assado. |

`docs/refs/mundo/` serviu de referência: bosques densos de copa grande (`terreno-humano-exuberante.webp`) e capim seco, arbusto e decíduas esparsas (`terreno-orc-deserto.webp`). Sem nomes, marcas ou lore da Blizzard.

## 2. Números (lidos de volta do `.glb` gravado)
| Modelo | Tris | Vértices | Draw calls | Atlas | GLB | Caixa (x × y × z, m) | y mín. / máx. |
|---|---:|---:|---:|---|---:|---|---|
| `tree_broad` | 1 486 | 3 050 | **1** | 512² | 87,1 KB | 6,65 × 8,74 × 6,59 | −0,24 / 8,50 |
| `tree_palm` | 1 116 | 2 165 | **1** | 512² | 77,4 KB | 5,93 × 7,74 × 6,09 | −0,16 / 7,58 |
| `tree_acacia` | 1 344 | 2 818 | **1** | 512² | 86,7 KB | 6,76 × 6,62 × 6,67 | −0,32 / 6,31 |
| `grass_dry` | 168 | 360 | **1** | 256² | 15,7 KB | 1,77 × 0,91 × 1,78 | 0 / 0,91 |
| `tumbleweed` | 1 709 | 3 513 | **1** | 256² | 86,5 KB | 0,86 × 0,86 × 0,85 | 0,01 / 0,87 |

Para comparar: carvalho 568 tris/55,6 KB/6,6 de altura; bétula 816 tris/80,2 KB/6,8. Orçamentos da tarefa: árvores ≤ 15 mil tris, ≤ 20 draw calls (preferência ≤ 6), atlas ≤ 512², sem cor de vértice; props ≤ 2 mil tris e ≤ 4 draw calls. **Todos atendidos**, com folga (árvores: 1 draw call e 7–10 % do limite de triângulos). O script confere isso sozinho depois de exportar (`glb_report`/`check_report`; imprime `FALHA ORÇAMENTO` e a última linha é `RESULTADO ok`) e a conferência foi refeita **por fora do script**, lendo só o JSON dos `.glb` gravados: 8 critérios por modelo, todos ok (sem `COLOR_0` com a mesma lógica do teste do `TreeManager`, 1 malha, 1 material, 1 draw call, triângulos e textura dentro do limite, nós sem transformação, pé entre −0,32 e 0,01). Também conferi o **atlas**: nenhuma face de tronco ou galho amostra texel verde (0 de 108 na árvore larga, 0 de 184 na palmeira e 0 de 97 na acácia, amostrando o atlas do `.glb` no centro UV de cada face e em 4 pontos intermediários) e não há ilhas UV sobrepostas (0 pares de faces com texels em comum na árvore larga).
- Origem no pé, y para cima, 1 unidade = 1 m. O pé das árvores afunda 0,16–0,32 (como o carvalho, −0,08) para não aparecer fresta em terreno em desnível; a palmeira fica com a **copa ~1,6 ao lado do pé** (+x), pela inclinação do tronco. O arbusto rolante encosta no chão e o **centro de rotação é (0; 0,42; 0)**: para rolar, gire em torno desse ponto (matriz com translação) e não em torno da origem.
- Sem cor de vértice (só `POSITION`, `NORMAL`, `TEXCOORD_0`), exigência do `TreeManager` (a classe de tinta da região viaja no `instanceColor`, e `COLOR_0` a corromperia; `tests/unit/regionalWorld.test.js` confere isso nas quatro árvores atuais).
- Mesma estrutura de `tree_oak.glb`: raiz > `Static_Mesh` (uma malha, material `Atlas` com `doubleSided`, mesmo amostrador), `Socket_UnitSpawn`, `Socket_Rally`. Os dois props só têm `Static_Mesh`.
- **Uma malha e um material por árvore não é capricho**: `getGlbTreeSource` (`TreeManager`) pega só a **primeira** malha do `.glb` e o material dela e a clona para o `InstancedMesh`; uma árvore em várias malhas perderia as outras.

## 3. Como foi feito
Pipeline de `common.py`: peças em `MeshBuilder` → UV atlas (Smart UV + empacotamento) → bake Cycles de emissão (cor + AO + desgaste de borda de materiais de pintura) → material final `Atlas` → `Static_Mesh` único → export meshopt + WebP. Novidades do script (reaproveitáveis):
- `ribbon` + `add_sheet`: fitas largas articuladas ao longo de um caminho (frondes e lâminas), com perfil em telhado de duas águas, nervura central e dentes de serra inclinados para a ponta. O enrolamento sai já voltado para a frente (cima nas frondes, fora nas lâminas), porque o `recalc_face_normals` do `MeshBuilder` escolhe o lado ao acaso em malha aberta e a luz de topo pintada e o AO ficariam invertidos.
- `trunk_rings`: troncos com anéis perpendiculares ao eixo e lóbulos de raiz que somem com a altura. `lump` desloca os vértices de cada massa de folhas em até 9 % (tira a cara de balão). `twig` faz galhos de 3 lados com transporte paralelo do quadro (sem torções). `palm_bark` pinta os anéis de cicatriz da palmeira por seno da altura deformado por ruído.
- Pesos de UV por objeto (tronco ×2 na árvore larga e na acácia, ×1,3 na palmeira): o tronco ganha mais área de textura que as copas.
- Preview feito a partir do **próprio `.glb` exportado**, importado de volta (câmera fixa: azimute −28°, elevação 24°, FOV 24°; cada modelo é enquadrado para caber no quadro, então os tamanhos relativos estão na tabela e no `comparativo-inspetor.png`).
- Conferido no inspetor com um registro **provisório, já revertido e nunca commitado** (as mesmas chaves e raízes dos trechos da §5): o `GLTFLoader` carrega os cinco, a estatística da malha bate com a tabela e a luz do inspetor (sombras, tom) fecha com a família atual. `comparativo-inspetor.png`: cavaleiro (×1,62), carvalho, pinheiro, bétula, outono, árvore larga, palmeira e acácia, com tufos e arbustos à frente. Essa imagem é uma captura ad hoc do canvas do inspetor, não sai de nenhum script do repositório.

Regerar (os `.glb` saem **idênticos byte a byte**; os PNG do Eevee não):
```bash
bash tools/safe-run.sh --timeout 600 -- /home/rafael/Downloads/blender-5.2.1-linux-x64/blender -b --python tools/blender/build_vegetacao_seca_arvores.py
# um só / sem preview: ... --python tools/blender/build_vegetacao_seca_arvores.py -- palm acacia --no-render
```
Argumentos: `broad|palm|acacia|grass_dry|tumbleweed|all`, `--no-render`; variáveis `BAKE_SAMPLES` (32), `RENDER_RES` (512). O relatório numérico sai em `tools/blender/build/art-p0-report.json` (pasta ignorada pelo git). Leva ~1 min.

## 4. Limites conhecidos e dúvidas
- **"Tronco ~1,5 m"** foi lido como **diâmetro do tronco na base** (como o carvalho, raio 0,76); a copa só começa a ~3,7 de altura, para o tronco aparecer como nas referências. Se a intenção era 1,5 de comprimento de tronco, a copa precisa descer (`path` e andares em `build_broad`).
- **Tinta por tileset multiplica o albedo** (em espaço linear; não medi no jogo). Os albedos novos seguem a faixa de claridade das árvores atuais, mas `savana` (`0x8a9244`) e `deserto` (`0x7a9a50`) tendem a deixar acácia e palmeira bem mais escuras e oliva do que nas prévias, e `exuberante` (`0x2f6a2c`) escurece o verde da árvore larga. Revisar `trees.tint` (ou isentar as espécies novas) olhando o mapa.
- **LOD**: o impostor de longe (`buildImpostorGeometry`) é um cone centrado na origem da árvore. Na palmeira a copa está 1,6 ao lado: na troca de nível o conjunto "pula" um pouco; centrar o cone pela caixa resolve.
- **Seleção**: o hit-proxy da árvore (`TreeView`) é um cilindro fixo no pé (raio 0,85–1,1 × escala, altura 4,5 × escala). Ele cobre pouco da copa de 6,6 da árvore larga e dos 6,7 da acácia (o carvalho e a bétula já têm a mesma limitação) e erra de vez a copa da palmeira, a 7 m de altura e 1,6 ao lado. O raio de colisão `0,75 × escala` casa com o tronco da árvore larga (0,74) e é folgado nas outras.
- **Custo**: a árvore larga tem 2,6× os triângulos do carvalho (1,5 mil contra 568). Em florestas de centenas de árvores o impostor (LOD) segura; medir no `npm run bench` quando entrar no mapa.
- **Resolução da textura**: a copa da árvore larga tem ~19 px/m no atlas 512² (estimado pela área; muitas ilhas pequenas), então o pintado fica suave de perto; num zoom de jogo não aparece. Folhas e lâminas são superfícies abertas: de perfil ficam finas.
- **Fundo preto do atlas e margem de bake**: ~35 % dos texels do atlas das árvores são preto a poucos pixels das ilhas (como nas árvores atuais); nas mips altas isso escurece folhas e nervuras finas. Só importa fora do alcance real: o impostor entra a 110 u (`LOD_DISTANCES.tree`) e, a essa distância, a árvore larga ainda amostra a mip 0–1 (estimativa: ~12 px/m na tela contra ~19 px/m no atlas, FOV 30°, 720p). Tentei cobrir o fundo com margem de bake de 16 px e **não serve**: a margem passou do espaço entre ilhas (0,014 × 512 = ~7 px) e o Blender pintou a cor de ilhas de folha por cima das ilhas finas do tronco (7 faces do tronco da árvore larga com verde, contra 0 com 4 px). A margem fica em 4 px; para mudar, aumentar junto o espaço entre ilhas (perde resolução) ou preencher o fundo depois do bake, só fora das faces.
- **Arbusto rolante**: 1,7 mil tris é muito para um prop em número; para centenas de instâncias, reduzir os arcos (`range(74)` em `build_tumbleweed`, 19 triângulos cada) ou gerar uma variante leve. Os galhos têm ~2,5 cm: no zoom do `comparativo-inspetor.png` (~21 px/m) são subpixel e o que lê é a silhueta redonda e arrepiada; no inspetor, de perto, parecem tiras.
- **Capim**: 12 lâminas em fita, sem LOD de bilhete (billboard); ocupa ~40 px no zoom do `comparativo-inspetor.png`.
- Sem animação (vento nas frondes e no capim ficaria em shader, como o do capim da spec §3.1) e sem versões por LOD.
- Os previews do Eevee não são reproduzíveis byte a byte (ruído de amostragem); os `.glb` são.

## 5. Trechos prontos para registro (arquivos de outras lanes: não editei)
`src/entities/glbModels.js`, depois da linha de `tree_birch` (mesmo padrão de `tree_oak`; `type: null`):
```js
  // ART-02/03 (MUNDO-TERRENO-MAPAS §6): árvores novas e vegetação seca (tools/blender/build_vegetacao_seca_arvores.py)
  tree_broad: { url: `${BASE}models/tree_broad.glb`, root: 'TreeBroad', type: null },
  tree_palm: { url: `${BASE}models/tree_palm.glb`, root: 'TreePalm', type: null },
  tree_acacia: { url: `${BASE}models/tree_acacia.glb`, root: 'TreeAcacia', type: null },
  grass_dry: { url: `${BASE}models/grass_dry.glb`, root: 'GrassDry', type: null },
  tumbleweed: { url: `${BASE}models/tumbleweed.glb`, root: 'Tumbleweed', type: null },
```
(`ModelFactory.createTree('broad'|'palm'|'acacia')` já resolve `tree_<tipo>`; `glbFaction` devolve `'neutral'` para chaves fora das tabelas, então carregam sempre.)

`src/inspector/inspector.js`, depois da entrada `tree_birch_glb` (as árvores do catálogo não têm `faction`; `category: 'environment'`, `type: 'nature'`). Depende do registro acima: sem ele `createGlb` devolve o placeholder:
```js
  {
    id: 'tree_broad_glb',
    name: 'Árvore Larga (Blender)',
    category: 'environment',
    type: 'nature',
    icon: '🌳',
    glb: 'tree_broad',
    sourceFile: 'tools/blender/build_vegetacao_seca_arvores.py',
    create: createGlb('tree_broad'),
    description: 'Variante alta de copa larga gerada pelo pipeline Blender (public/models/tree_broad.glb): tronco grosso de contrafortes que se bifurca em cinco braços e sustenta uma copa de ~6,6 em quatro andares de massas facetadas (saia escura, miolo, andar superior e topo claro). `species: "broad"` nos mapas (depois da integração); instanciada pelo TreeManager.',
    notes: '1 draw call, ~1,5 mil triângulos, atlas 512², ~87 KB, ~8,5 de altura e ~6,6 de copa. Sem cor de vértice (o TreeManager tinge por região). Arquivo-fonte compartilhado com as outras quatro peças da tarefa.'
  },
  {
    id: 'tree_palm_glb',
    name: 'Palmeira (Blender)',
    category: 'environment',
    type: 'nature',
    icon: '🌴',
    glb: 'tree_palm',
    sourceFile: 'tools/blender/build_vegetacao_seca_arvores.py',
    create: createGlb('tree_palm'),
    description: 'Palmeira gerada pelo pipeline Blender (public/models/tree_palm.glb): tronco curvo com anéis de cicatriz pintados, cacho de cocos e 16 frondes largas de margem recortada e nervura clara (3 jovens, 7 maduras em arco, 6 caindo) mais 2 secas penduradas. Para oásis e atóis.',
    notes: '1 draw call, ~1,1 mil triângulos, atlas 512², ~77 KB, ~7,6 de altura. A copa fica ~1,6 ao lado do pé (tronco inclinado); o impostor de LOD e o hit-proxy cilíndrico do pé não a acompanham.'
  },
  {
    id: 'tree_acacia_glb',
    name: 'Acácia (Blender)',
    category: 'environment',
    type: 'nature',
    icon: '🌳',
    glb: 'tree_acacia',
    sourceFile: 'tools/blender/build_vegetacao_seca_arvores.py',
    create: createGlb('tree_acacia'),
    description: 'Acácia de savana gerada pelo pipeline Blender (public/models/tree_acacia.glb): tronco torto em S que se abre em cinco braços e copa achatada em guarda-chuva, de 22 massas de folhagem bem mais largas que altas em três andares, tom oliva-dourado.',
    notes: '1 draw call, ~1,3 mil triângulos, atlas 512², ~87 KB, ~6,3 de altura e ~6,7 de copa.'
  },
  {
    id: 'grass_dry_glb',
    name: 'Capim Seco (Blender)',
    category: 'environment',
    type: 'nature',
    icon: '🌾',
    glb: 'grass_dry',
    sourceFile: 'tools/blender/build_vegetacao_seca_arvores.py',
    create: createGlb('grass_dry'),
    description: 'Tufo de capim seco gerado pelo pipeline Blender (public/models/grass_dry.glb): 12 lâminas em fonte, longas e arqueadas, em ouro-palha (#c9a24a) com a base escurecida. Para deserto, estepe e savana.',
    notes: '1 draw call, 168 triângulos, atlas 256², ~16 KB, ~0,9 de altura e ~1,8 de largura. Instanciar (InstancedMesh) por bioma; escala 0,85–1,2 como os tufos atuais.'
  },
  {
    id: 'tumbleweed_glb',
    name: 'Arbusto Rolante (Blender)',
    category: 'environment',
    type: 'nature',
    icon: '🌿',
    glb: 'tumbleweed',
    sourceFile: 'tools/blender/build_vegetacao_seca_arvores.py',
    create: createGlb('tumbleweed'),
    description: 'Arbusto rolante gerado pelo pipeline Blender (public/models/tumbleweed.glb): esfera emaranhada de ~0,85 de galhos secos (arcos de círculo máximo, galhos radiais e folhinhas) em palha-escuro, com o interior escurecido pelo AO assado.',
    notes: '1 draw call, ~1,7 mil triângulos, atlas 256², ~87 KB. A origem está no chão; o centro de rotação é (0; 0,42; 0).'
  },
```
Linha sugerida para `tools/blender/README.md` (tabela de scripts): `build_vegetacao_seca_arvores.py` → `public/models/{tree_broad,tree_palm,tree_acacia,grass_dry,tumbleweed}.glb` (ART-02/03: 1 draw call cada, 168–1 709 tris, atlas 512² nas árvores e 256² nos props, 16–87 KB; confere os orçamentos e renderiza prévias em `tools/ui-captures/art-p0/`).

## 6. O que ainda falta para as árvores novas aparecerem no mapa (integração futura)
1. Registrar os `.glb` (§5).
2. **Espécies válidas**: `FOREST_SPECIES` em `src/data/maps/validate.js` (hoje `oak`, `pine`, `autumn`, `birch`) aceitar `broad`, `palm`, `acacia`; no editor, chaves `editor.species.broad|palm|acacia` em `src/i18n/pt-BR.json` e `en.json` e a cor por espécie de `src/editor/preview3d.js`; `src/terrainPreview.js` sorteia espécies na prévia.
3. **`src/world/TreeManager.js`**: `registerTree` só conhece `pine`, `autumn`, `birch` e cai em carvalho para qualquer outro tipo; incluir `broad|palm|acacia` → `tree_broad|tree_palm|tree_acacia`, os contadores (criados no construtor, zerados em `dispose`, lidos em `countOf`; cada tipo continua sob demanda, sem custo em mapas que não o usam) e `PLACEHOLDER_COLORS` (cor da árvore reserva e do impostor, que hoje cai no verde do carvalho). `Tree.treeType` já aceita qualquer texto; `TreeView` e a árvore caindo usam `ModelFactory.createTree(tipo)` sem mudança.
4. **Quem escolhe a espécie**: `GameManager.spawnCluster` mistura 35 % de `['oak', 'pine', 'autumn']` em todo bosque (só o `preferredType` = `f.species` pode ser espécie nova) e `src/data/maps/coast/layout.js` (`speciesOf`) escolhe pelo bioma (deserto/estepe/savana hoje dão `autumn`/`oak`). Para acácia na savana, palmeira no oásis/atol e árvore larga no exuberante é preciso mudar essas duas escolhas e **regerar os mapas assados** (`forests` mudam, logo checksums, fixtures e baseline visual também).
5. **Tinta e região** (`src/data/tilesets.js`, `trees.tint`): ver §4; o `biomeGrid` já escolhe a tinta por célula, mas não a espécie.
6. **Props**: `grass_dry` e `tumbleweed` não têm consumidor. `src/world/Decorations.js` cria os tufos de grama proceduralmente (`createInstancedGrassTufts`, 60 tufos); para usar o `.glb`, extrair geometria e material como `getGlbTreeSource` e criar `InstancedMesh` por bioma (capim em deserto/estepe/savana; arbusto rolante esparso, com rotação em torno de (0; 0,42; 0) se for rolar). Não precisam de mescla estática (`staticTemplates.js`): já são uma malha.
7. **Testes**: acrescentar `tree_broad`, `tree_palm`, `tree_acacia` à lista do teste "as .glb das árvores NÃO têm cor de vértice" em `tests/unit/regionalWorld.test.js` (as novas já cumprem o critério); `npm run visual -- --update` e `npm run bench` quando entrarem num mapa.
8. Opcional: entradas de pré-carga em `src/core/AssetPreloader.js` (como `Bétula Prateada Imperial`), ícones e nomes `biome.*` / espécie na i18n.

**Status**: ART-02 (três árvores) entregue; ART-03 entregue só na parte vegetação seca (capim e arbusto rolante). **Faltam do ART-03**: cacto (×2) e ossada. As linhas de `docs/TASKS.md` (`ART-01..16`) e de `tools/blender/README.md` ficam para a integração.
