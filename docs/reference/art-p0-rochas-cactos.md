# Props de terreno P0: rochas de granito, cactos e ossada (ART-01 / ART-03)

Entrega de arte (Blender headless) dos props prioritários de `docs/specs/MUNDO-TERRENO-MAPAS.md` §6: **ART-01** (rocha/maciço de granito em três tamanhos) e a parte **cacto + ossada** do **ART-03**. Os seis `.glb` saem de **um único script**, `tools/blender/build_props_rochas_cactos.py`, sem arquivos `.blend`. **Nenhum código de jogo foi alterado**: `src/entities/glbModels.js` e `src/inspector/inspector.js` ficam para a integração (trechos prontos nas seções 8 e 9).

Referências visuais: `docs/refs/mundo/terreno-orc-deserto.webp` (maciço na borda esquerda e rochas junto das casas) e `docs/refs/mundo/terreno-humano-exuberante.webp` (maciços de granito, rochas médias e pequenas). Paleta: spec §3.1 (granito `~#8a8378`, cacto verde-acinzentado, osso branqueado).

## 1. Resumo

| Modelo | O que é |
|---|---|
| `rock_granite_large.glb` | Maciço de granito de 3,9 × 3,4 m: três monólitos facetados com capitéis deslocados (beiral de pedra sobreposta), blocos de apoio e cascalho no pé |
| `rock_granite_medium.glb` | Rocha de 1,6 × 1,5 m: matacão facetado com um vizinho e duas lascas |
| `rock_granite_small.glb` | Rocha de 0,6 × 0,55 m: pedra facetada com uma lasca encostada |
| `cactus_1.glb` | Cacto colunar de dois braços (3,3 m), tronco de 10 nervuras com leve curva em S, braços de alturas diferentes em cotovelo, três flores creme no alto |
| `cactus_2.glb` | Cacto colunar baixo de um braço (1,8 m), tronco largo de 12 nervuras levemente abaulado, uma flor |
| `bones.glb` | Ossada de fera de 2,4 × 2,9 m: crânio de chifres com órbitas e narinas escuras, mandíbula solta, coluna que desce até o crânio, 12 arcos de costela (dois quebrados), uma costela caída, ossos longos e vértebras soltas |

Estilo: low-poly facetado (flat shading em tudo), topo claro e quente, lados mais frios e sombreados, estratos horizontais sutis e trincas sinuosas pintadas no atlas, **sem musgo**. As rochas nascem **enterradas** (ver §3).

Prévias (512 px, fundo transparente, câmera fixa de 35° de azimute e 38° de elevação, sol e preenchimento do `SceneManager`): `tools/ui-captures/art-p0/<nome>.png`.

## 2. Números (medidos nos próprios arquivos)

Validação feita direto no binário de cada `.glb` (JSON do glTF + atlas WebP embutido): 1 nó de malha, 1 primitiva, 1 material, atributos `POSITION`/`NORMAL`/`TEXCOORD_0` e **nenhum `COLOR_0`**.

| Arquivo | Raiz | Pegada x × z (m) | Altura acima do chão (m) | Enterrado (m) | Triângulos | Vértices | Draw calls | Atlas | Tamanho |
|---|---|---|---|---|---|---|---|---|---|
| `rock_granite_large.glb` | `RockGraniteLarge` | 3,88 × 3,39 | 2,57 | 0,30 | 661 | 1035 | 1 | 512² | 52,2 KB |
| `rock_granite_medium.glb` | `RockGraniteMedium` | 1,64 × 1,47 | 0,75 | 0,18 | 203 | 319 | 1 | 512² | 27,0 KB |
| `rock_granite_small.glb` | `RockGraniteSmall` | 0,62 × 0,55 | 0,32 | 0,08 | 83 | 133 | 1 | 256² | 11,0 KB |
| `cactus_1.glb` | `Cactus1` | 2,06 × 0,73 | 3,29 | 0,15 | 1260 | 2600 | 1 | 512² | 83,4 KB |
| `cactus_2.glb` | `Cactus2` | 1,22 × 0,77 | 1,76 | 0,12 | 712 | 1474 | 1 | 512² | 56,5 KB |
| `bones.glb` | `Bones` | 2,38 × 2,87 | 1,09 | 0,02 | 1694 | 3524 | 1 | 512² | 135,0 KB |

Total: 4613 triângulos e 365 KB. Orçamento pedido: rocha ≤ 2 draw calls e ~3 mil triângulos (usa 1 e no máximo 661); cacto e ossada ≤ 4 draw calls e ~2 mil triângulos (usam 1 e no máximo 1694); atlas ≤ 512² (todos). A rocha pequena usa atlas de 256² porque 0,6 m na tela não pede mais.

Albedo médio dos atlas (texels usados, sRGB): granito `#837c6f` (grande), `#837b6d` (média), `#827a6d` (pequena), com topos até ~`#bcb3a1` e fundos de fresta ~`#544e44` (a referência é `~#8a8378`; a média do atlas inclui a faixa enterrada, que é escura por oclusão); cacto `#7a846a` (cacto 1) e `#727d64` (cacto 2); osso `#9a9179`. Rugosidade glTF: 0,92 (rochas), 0,85 (cactos), 0,90 (ossada); metálico 0. Compressão: `EXT_meshopt_compression` + `EXT_texture_webp`, como os demais `.glb` do projeto.

## 3. Contrato dos `.glb` (para integrar)

- **Estrutura**: cena com uma raiz (empty com o nome da coluna "Raiz" da tabela da seção 2, sem transformação) e **um filho `Static_Mesh`** com um único material `Atlas`. Serve ao mesmo padrão das árvores: `ModelFactory.createGlbModel(key)` clona o nó, ou o jogo extrai a primeira malha (geometria + material) para `InstancedMesh`, como o `getGlbTreeSource` do `TreeManager`. Não há nós animados nem sockets.
- **Unidades e origem**: 1 unidade = 1 m; x direita, y cima, +z frente. **Origem no chão (y = 0)**. Só a ossada tem frente: crânio e focinho voltados para +z; rochas e cactos não têm frente (use giro aleatório em y e escala uniforme por instância, 0,8–1,2 sem problema).
- **Base enterrada**: as rochas passam de y = 0 para baixo (0,30 / 0,18 / 0,08 m) e a base fica **aberta** (sem face de baixo, para não gastar atlas). Isso esconde frestas quando o terreno é inclinado; **não** posicione pelo `min y` da caixa e não use sobre água sem terreno por baixo. Cacto 1 e 2 entram 0,15 / 0,12 m no chão; a ossada praticamente apoia no chão (−0,02).
- **Sem cor de vértice**: a tinta por instância (regional/bioma) fica por conta do jogo (o teste `regionalWorld.test.js` já exige isso das árvores). O material exporta `doubleSided: true` (padrão do exportador); se quiser, use `FrontSide` nas instâncias (as rochas são fechadas por cima e a base aberta fica sob o terreno).
- **Pegada para colisão/ocupação** (sugestões, os valores de simulação ficam em `src/data`): maciço ~1,8 de raio médio; rocha média ~0,8; pequena ~0,3; cacto 1 e 2 ~0,35 no tronco (os braços chegam a 1,0 e 0,9 do eixo); ossada decorativa (sem colisão, ~1,3 de raio médio).
- **Custo de carga**: `loadGlbTemplates()` baixa **todas** as chaves de `GLB_MODELS` na importação (as neutras sempre). Os seis somam 365 KB; se preferir, carregue estes só para mapas com `biomeGrid` de deserto/exuberante. O pré-cache do service worker não inclui `.glb` (cache em runtime).

## 4. Como regenerar

```bash
# um Blender por vez (trava global); ~1 min para três modelos, ~3 min para os seis com prévias
bash tools/safe-run.sh --timeout 600 -- /home/rafael/Downloads/blender-5.2.1-linux-x64/blender -b --factory-startup \
  --python tools/blender/build_props_rochas_cactos.py -- all
# só um modelo, sem prévia:
bash tools/safe-run.sh --timeout 600 -- /home/rafael/Downloads/blender-5.2.1-linux-x64/blender -b --factory-startup \
  --python tools/blender/build_props_rochas_cactos.py -- cactus_1 --no-render
```

Argumentos depois de `--`: nomes dos modelos (`rock_granite_large|rock_granite_medium|rock_granite_small|cactus_1|cactus_2|bones|all`), `--no-render` (sem prévia), `--no-shadow` (prévia sem sombra de contato) e `--draft` (não assa nem exporta; renderiza a pintura e um "clay" em três azimutes em `tools/blender/build/art_p0_draft/`, para iterar na forma). Variáveis: `BAKE_SAMPLES` (32), `ATLAS_PX`, `ART_P0_DRAFT_DIR`. Depois de exportar, o script relê o `.glb` e **aborta** se ele tiver mais de uma malha ou material, tiver `COLOR_0`, atlas acima de 512² ou passar do orçamento de draw calls e triângulos (a linha `STATS` de cada modelo traz os números). A geração é **determinística**: reconstruir `rock_granite_small` e `cactus_1` do zero devolveu `.glb` com o mesmo SHA-256 dos commitados. Atlas intermediários ficam em `tools/blender/build/` (fora do git).

## 5. Como foram feitos

- **Rochas**: cada rocha é a **união booleana (EXACT)** de blocos convexos calculados como interseção de semi-espaços, o que dá faces grandes e planas e arestas vivas (as facetas marcadas das referências). Há dois tipos de bloco: *monólito* (caixa de faces giradas e inclinadas, telhado de duas águas no topo, chanfros nas arestas verticais e do topo, fraturas oblíquas e lascas) e *matacão* (polítopo circunscrito a um elipsoide, topo achatado). O maciço empilha três monólitos com capitéis deslocados sobre um bloco de trás e dois matacões na frente, mais cascalho; a base é cortada em y < 0 e fica aberta. Cada bloco tem o seu próprio sorteio (`seed`), então mexer num bloco não muda os outros.
- **Pintura (só para o bake)**: manchas largas entre dois tons de granito (a escala acompanha o tamanho da rocha), estratos horizontais em coordenadas de mundo (faixas largas e linhas finas), trincas sinuosas (curvas de nível de um ruído), grão e mica, **tom por faceta** (ruído da normal), luz de topo pintada (topo claro e quente, lados mais frios), poeira no pé, desgaste de borda (nó Bevel) e oclusão ambiente com o chão em y = 0. Tudo assado num atlas único (Cycles, 32 amostras).
- **Cactos**: anéis de nervuras (cristas e vales alternados) ao longo do tronco e dos braços, braço com cotovelo em arco de quatro a cinco segmentos, cúpula no ápice, flores de seis pétalas com miolo amarelo. Espinhos são pontos claros pintados nas cristas (máscara de AO), verde mais novo no alto, areia no pé.
- **Ossada**: 12 arcos de costela de seção retangular achatada em quatro trechos (duas quebradas, todas tombadas um pouco para fora) e uma costela caída no chão, coluna de vértebras pentagonais com processo espinhoso seguindo a curva até o crânio (passo por comprimento de arco), crânio de chifres (calota, testa, focinho em loft, dentes, órbitas e narinas escuras em material `dark`), mandíbula solta, dois ossos longos e vértebras no chão. Osso branqueado com manchas amareladas, trincas finas e poeira no contato.
- **Prévias**: o script importa de volta o `.glb` exportado (verifica o arquivo de verdade), corta visualmente a parte enterrada, ilumina como o `SceneManager` (sol quente atrás-à-esquerda, preenchimento frio à direita-frente) e faz um segundo passe só com o sol para uma sombra de contato suave sob o modelo, composta por baixo do render (o shadow catcher do Eevee devolve alfa opaco, por isso o segundo passe).

## 6. Limites conhecidos e pendências

- **Fora do pedido**: as duas rochas de arenito com estratos (ART-01), o tufo de capim seco e o arbusto rolante (ART-03) **não** foram feitos.
- **Formas convexas unidas**: não há balanços fundos nem cavernas; o maciço lê como blocos empilhados (capitéis dão o beiral). Em câmera RTS isso funciona; de perto, as faces verticais são lisas e a pintura carrega o detalhe.
- **Resolução**: o atlas de 512² num maciço de 3,9 m dá ~1,5–2 cm por texel; grão, mica e trincas finas só aparecem de perto. É sutil de propósito.
- **Poeira no pé** é pintada em tom areia (`~#8a7a5e`) na base das rochas: em chão verde ou neve pode destoar um pouco; a tinta por instância (ou uma versão sem poeira) resolve se incomodar.
- **Flores e espinhos** estão no atlas e na malha: uma tinta global por instância (como a das árvores) também os tinge.
- **Ossada fina**: as costelas têm 4–6 cm de espessura por 7–11 cm de largura; no zoom padrão do jogo (~77 m) leem como silhueta de esqueleto. Se faltar leitura, instancie com escala ~1,2.
- **Sem LOD**: os modelos são leves o bastante (≤ 1,7 mil triângulos).
- **Verificação no jogo e no inspetor pendente** (regra do `CLAUDE.md`): as prévias são do Blender. Foi feita uma checagem provisória no three.js (página temporária já removida, com as luzes e o tone mapping do `SceneManager`): os seis carregam com meshopt e WebP, cada um com 1 malha e 1 material e os triângulos esperados, e ficam corretos sobre areia e grama a 20–60 m de câmera, ao lado do camponês como escala (cacto 2 um pouco mais baixo que o camponês, de ~1,9 m; cacto 1 ≈ 1,7× a altura dele). Falta ver nos mapas reais depois do registro.
- **Albedo**: a primeira versão ficou escura sob a luz do jogo; o granito foi clareado (lados 0,87, AO mais leve). Se ainda parecer escuro no jogo, o ajuste é a paleta de `granite_paint` (`dark`/`light`) no script.

## 7. Arquivos

- Script: `tools/blender/build_props_rochas_cactos.py`
- Modelos: `public/models/{rock_granite_large,rock_granite_medium,rock_granite_small,cactus_1,cactus_2,bones}.glb`
- Prévias: `tools/ui-captures/art-p0/{rock_granite_large,rock_granite_medium,rock_granite_small,cactus_1,cactus_2,bones}.png`

## 8. Registro em `src/entities/glbModels.js` (a aplicar na integração)

Dentro de `GLB_MODELS`, depois das árvores (as chaves não existem em `UNITS`/`BUILDINGS`, então `glbFaction` as trata como neutras: sempre carregadas):

```js
  // ART-01/03 (props de terreno P0): rochas de granito, cactos e ossada (Blender; tools/blender/build_props_rochas_cactos.py)
  rock_granite_large: { url: `${BASE}models/rock_granite_large.glb`, root: 'RockGraniteLarge', type: null },
  rock_granite_medium: { url: `${BASE}models/rock_granite_medium.glb`, root: 'RockGraniteMedium', type: null },
  rock_granite_small: { url: `${BASE}models/rock_granite_small.glb`, root: 'RockGraniteSmall', type: null },
  cactus_1: { url: `${BASE}models/cactus_1.glb`, root: 'Cactus1', type: null },
  cactus_2: { url: `${BASE}models/cactus_2.glb`, root: 'Cactus2', type: null },
  bones: { url: `${BASE}models/bones.glb`, root: 'Bones', type: null },
```

## 9. Registro em `src/inspector/inspector.js` (a aplicar na integração)

Em `MODEL_CATALOG`, logo depois de `tree_birch_glb` (mesmo padrão das árvores: `category: 'environment'`, `type: 'nature'`, `create: createGlb(...)`). Props neutros não definem `faction` (o campo só é lido para o filtro "Orcs"); se quiser marcar, `faction: 'neutral'` é inócuo.

```js
  {
    id: 'rock_granite_large_glb',
    name: 'Maciço de Granito (Blender)',
    category: 'environment',
    type: 'nature',
    icon: '⛰️',
    glb: 'rock_granite_large',
    sourceFile: 'tools/blender/build_props_rochas_cactos.py',
    create: createGlb('rock_granite_large'),
    description: 'Maciço de granito gerado pelo pipeline Blender (public/models/rock_granite_large.glb): três monólitos facetados com capitéis deslocados, blocos de apoio e cascalho no pé. Faces planas marcadas, topo claro e quente, lados frios, estratos horizontais sutis e trincas pintadas no atlas; sem musgo.',
    notes: '1 draw call (uma malha Static_Mesh, atlas 512²), 661 triângulos, 52 KB. Pegada 3,9 × 3,4 m, 2,6 m de altura; base enterrada até −0,3 m e aberta (sem face de baixo). Origem no chão, sem frente (gire em y por instância).'
  },
  {
    id: 'rock_granite_medium_glb',
    name: 'Rocha de Granito Média (Blender)',
    category: 'environment',
    type: 'nature',
    icon: '🪨',
    glb: 'rock_granite_medium',
    sourceFile: 'tools/blender/build_props_rochas_cactos.py',
    create: createGlb('rock_granite_medium'),
    description: 'Rocha média de granito gerada pelo pipeline Blender (public/models/rock_granite_medium.glb): matacão facetado com um vizinho e duas lascas, topo claro, lados sombreados e trincas finas pintadas no atlas.',
    notes: '1 draw call, 203 triângulos, atlas 512², 27 KB. 1,6 × 1,5 m, 0,75 m de altura; base enterrada até −0,18 m e aberta. Origem no chão.'
  },
  {
    id: 'rock_granite_small_glb',
    name: 'Rocha de Granito Pequena (Blender)',
    category: 'environment',
    type: 'nature',
    icon: '🪨',
    glb: 'rock_granite_small',
    sourceFile: 'tools/blender/build_props_rochas_cactos.py',
    create: createGlb('rock_granite_small'),
    description: 'Rocha pequena de granito gerada pelo pipeline Blender (public/models/rock_granite_small.glb): pedra facetada com uma lasca encostada, mesma paleta das maiores.',
    notes: '1 draw call, 83 triângulos, atlas 256², 11 KB. 0,6 × 0,55 m, 0,32 m de altura; base enterrada até −0,08 m e aberta. Origem no chão.'
  },
  {
    id: 'cactus_1_glb',
    name: 'Cacto Colunar (Blender)',
    category: 'environment',
    type: 'nature',
    icon: '🌵',
    glb: 'cactus_1',
    sourceFile: 'tools/blender/build_props_rochas_cactos.py',
    create: createGlb('cactus_1'),
    description: 'Cacto colunar de dois braços gerado pelo pipeline Blender (public/models/cactus_1.glb): tronco de 10 nervuras com leve curva em S, braços de alturas diferentes em cotovelo, cúpula no ápice, espinhos em pontos claros sobre as cristas e três flores creme no alto. Verde-acinzentado, mais novo para cima.',
    notes: '1 draw call, 1260 triângulos, atlas 512², 83 KB. 2,1 m de largura (com os braços) × 0,7 m, 3,3 m de altura; tronco entra 0,15 m no chão. Origem no chão, sem frente.'
  },
  {
    id: 'cactus_2_glb',
    name: 'Cacto Baixo (Blender)',
    category: 'environment',
    type: 'nature',
    icon: '🌵',
    glb: 'cactus_2',
    sourceFile: 'tools/blender/build_props_rochas_cactos.py',
    create: createGlb('cactus_2'),
    description: 'Cacto colunar baixo de um braço gerado pelo pipeline Blender (public/models/cactus_2.glb): tronco largo de 12 nervuras levemente abaulado, um braço em cotovelo e uma flor creme com miolo amarelo.',
    notes: '1 draw call, 712 triângulos, atlas 512², 57 KB. 1,2 × 0,8 m, 1,8 m de altura; tronco entra 0,12 m no chão. Origem no chão, sem frente.'
  },
  {
    id: 'bones_glb',
    name: 'Ossada de Fera (Blender)',
    category: 'environment',
    type: 'nature',
    icon: '🦴',
    glb: 'bones',
    sourceFile: 'tools/blender/build_props_rochas_cactos.py',
    create: createGlb('bones'),
    description: 'Ossada de animal gerada pelo pipeline Blender (public/models/bones.glb): crânio de chifres com órbitas e narinas escuras, mandíbula solta, coluna de vértebras que desce até o crânio, 12 arcos de costela (dois quebrados), uma costela caída, ossos longos e vértebras espalhadas. Osso branqueado com manchas amareladas e poeira no contato.',
    notes: '1 draw call, 1694 triângulos, atlas 512², 135 KB. 2,4 × 2,9 m, 1,1 m de altura; crânio e focinho voltados para +Z. Origem no chão, decorativa (sem colisão).'
  },
```

## 10. Linha para a tabela de `tools/blender/README.md` (a aplicar na integração)

```md
| `build_props_rochas_cactos.py` | `public/models/{rock_granite_large,rock_granite_medium,rock_granite_small,cactus_1,cactus_2,bones}.glb` | props de terreno P0 (ART-01/03): maciço de granito (3,9 × 3,4 m, 661 tris), rochas média (203) e pequena (83), cactos colunares de dois braços (1260) e de um braço (712) e ossada de fera (1694); 1 draw call e 1 malha por `.glb`, atlas 512² (256² na pequena), 365 KB no total; rochas enterradas e abertas na base; `--draft` para iterar na forma, prévias transparentes em `tools/ui-captures/art-p0/` |
```
