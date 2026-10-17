# MUNDO-TERRENO-MAPAS — terreno, biomas, mapas de contorno natural e mapa do mundo

> Spec da nuvem (2026-10-11; **revisão 2 de 2026-10-11** aplica as decisões do dono: orcs a leste/humanos a oeste, mapa-múndi só ilustrativo, bioma só visual, **lava como divisor de áreas** (§3.5, sem dano) e nomes aprovados (§3.6)). **Fonte:** `docs/specs/MUNDO-BRIEFING-DONO.md` (vale o texto do dono em caso de dúvida) e as 3 imagens de `docs/refs/mundo/`. Regras comuns: `docs/specs/_COMUM.md`. Companheira: `MUNDO-HISTORIA-CAMPANHA.md` (história e missões; esta spec só reserva os "encaixes" geográficos).
> **Escopo da nuvem:** especificar + protótipo Node (`tools/proto/irregular-coast.mjs`, `tools/lib/irregularCoast*.mjs`, `tests/unit/irregularCoast.test.js`, prévias em `docs/refs/mundo/previews/`). Nada em `src/` foi alterado. Arte (Blender/navegador) fica no **local** (§6). Protótipo da lava: `tools/lib/irregularCoast.mjs` (`generateLava`), prévias `docs/refs/mundo/previews/vulcanica-lava-seed-*.png`.

## 0. Resumo executivo
1. Os mapas atuais são uniões de **discos/elipses ligados por pontes retangulares** (gerador `islands`) ou um **quadrado com rio diagonal** (`continental`): o contorno é geometria de compasso, não costa. Medido: índice perímetro/disco **1,19** (`ilhas-4p`) e **1,07** (contorno externo do `continental-1v1`); dimensão fractal da costa ≈ **1,0** (curva lisa).
2. Proposta: **gerador `coastal`** (§2) = campo escalar por entidade (continente/ilha) com raio angular de Fourier + fBm de domínio deformado + enseadas/penínsulas explícitas + folga entre entidades + limpeza de lagoas; **assado** em grade (`painted`) para ser determinístico em rede/replay. O protótipo já gera 2 continentes + 6 ilhas (vulcânica, rochosa, gelo, pântano, tropical, atol) + ilhotas em **~0,3 s**: índice **1,69–1,83** e D **1,11–1,14**.
3. **Biomas** como camada visual (§3) por continente/ilha — deserto/pântano/estepe × exuberante/neve/savana + ilhas vulcânica/pedregosa/gelo —, **sem mudar balanceamento**: bioma é só visual (DECIDIDO). A **lava** (§3.5) é a única classe nova de célula na sim: bloqueio puro como a água, **sem dano**.
4. **Mapa-múndi** (§4): **só ilustrativo** (os dois continentes, Velmara a oeste e Cinzara a leste, e as ilhas Estilhaços entre eles; não jogável, sem rota navegável); pergaminho procedural com costas do mesmo gerador, rosa dos ventos, selo e marcadores opcionais de missão. As missões acontecem em mapas próprios.
5. **Javalis** no lugar dos porcos (orcs), ovelhas (humanos) (§5); lista de arte local priorizada (§6); plano em 10 passos (§7).

## 1. Imagens de referência (descrição detalhada)
Todas estão em `docs/refs/mundo/`. Câmera de jogo em ambas: **isométrica alta (~45–50°)**, HUD sobreposta.

### 1.1 `terreno-orc-deserto.webp` — terreno orc (desértico)
- **Relevo/solo:** canto superior esquerdo e topo = **grandes dunas** de areia clara (bege-dourado `~#e6cf9c`), cristas longas e macias, sombras suaves azul-acinzentadas entre elas, sem vegetação. O resto do chão é **capim seco** (palha dourada `~#c9a24a`, tufos altos e densos, quase trigal) em manchas grandes com areia entre elas; **trilhas de terra** tan-claras (`~#c4a574`) serpenteiam e se cruzam em frente ao castelo, bordas macias sem pintura dura.
- **Rochas:** blocos cinza-quente de granito/arenito (`~#8a8378`) com topos claros e lados sombreados, em **aglomerados** (um grande maciço na borda esquerda, outros 3–4 menores junto de casas e da mina); faces facetadas, sem musgo.
- **Vegetação arbórea:** pouca. **Poucas árvores decíduas verdes** de copa redonda e densa (`~#4a7a35`), em grupo de ~6 à direita e 3–4 isoladas; contraste forte verde × deserto.
- **Água/pântano:** na borda direita, **lagoa/pântano de água escura verde-azulada** (`~#2f5a58`), margens com **juncos/taboas** e **vitórias-régias** (folhas redondas verdes com flores), grama úmida verde nas margens. Nenhum mar visível.
- **Construções:** castelo de pedra cinza com torres de telhado cônico vermelho-escuro e bandeira azul; casas/celeiros de madeira desgastada com telhado de palha; cerca de madeira; mina de ouro (pilha dourada num anel de pedra); círculos verdes de seleção sob as unidades.
- **HUD (referência):** topo-centro, 3 placas de pedra-metal escura com ícone e texto "Gold / Wood / Supply"; **canto inferior esquerdo, minimapa CIRCULAR** com moldura de pedra/ferro cinza espessa (mostra capim seco e trilha); **canto inferior direito, painel de comandos** retangular em moldura de pedra com 5 retratos de heróis/unidades em cima e 5 botões de comando (ícones prateados) embaixo. → tarefa visual separada (§6, ART-14).
- **Paleta/luz:** quente e saturada, luz baixa vinda do alto-esquerda, sombras longas suaves; vinheta leve.

### 1.2 `terreno-humano-exuberante.webp` — terreno humano (exuberante)
- **Solo:** **pradaria verde viva** (`~#5fa43c`, variações mais escuras sob as árvores) com **manchas de terra marrom** (`~#7a5230`: roça/solo nu, montes de terra), **estradas de terra** curvas marrom-claras; gramado com textura pintada e variação de matiz (amarelado ao sol, azulado na sombra).
- **Costa irregular (o ponto-chave):** água **turquesa** nos baixios (`~#35b7c9`) esmaecendo para **azul-profundo** (`~#0d4a8c`) mar adentro; **faixa de areia clara** estreita e contínua (`~#e8d9a8`) entre grama e água; **linhas brancas de espuma** acompanhando a praia; **enseadas e baías** à direita e abaixo, **península** estreita no topo, **cabos** arredondados, pedras isoladas na água rasa e uma segunda massa de terra ao fundo (topo-direita). A costa muda de direção a cada ~10–20 u: nada de arco de círculo.
- **Rochas:** **maciços de granito** grandes (esquerda), rochas médias e pequenas espalhadas; faces cinza-claras, sombras azuladas.
- **Vegetação:** **árvores densas** de copa grande verde-escura (`~#2f6a2c`) em **bosques compactos** (centro-baixo, direita), isoladas pontuando a pradaria; arbustos baixos.
- **Construções/HUD:** mesmo castelo e celeiros de madeira (cercas, palha); mesma HUD (Gold/Wood/Supply, minimapa circular com moldura de pedra mostrando verde/marrom, painel 5×2). Unidades com anéis verdes.
- **Luz:** quente, difusa, alto contraste entre o verde e o turquesa; especular suave na água.

### 1.3 `mapa-mundi-referencia.png` — mapa-múndi antigo
- **Suporte:** **pergaminho** bege-oliva (`~#c9b48a`) manchado, mais escuro e "queimado" nas bordas (vinheta marrom), fibras e rugas discretas.
- **Geografia:** **continentes de contorno muito irregular** (caps, enseadas, golfos, uma península longa para o norte e um mar interno/enseada a leste), **uma massa grande ao sul curvando-se**, **uma faixa horizontal longa ao norte**, ilha isolada à esquerda e **ilhotas pequenas** no centro-direita; sombreado interno suave (sombra projetada junto à costa) e **linha de costa em tinta marrom-escura**; relevo sugerido por hachuras/sombras, sem cores saturadas.
- **Ornamentos:** **duas rosas dos ventos** pequenas (estrela de 8 pontas dentro de círculos duplos, tinta escura) uma no topo-centro e outra à direita; **selo de cera vermelho** (emblema gravado) à direita; **rótulos em serifa gótica** acompanhando a curvatura das massas; **moldura ornamental** (nós celtas, ferro negro) na base com a barra de carregamento; textos de dicas sobre o mapa (UI, não faz parte da arte).
- **Uso aqui:** referência de **forma** (continentes/ilhas irregulares), de **estilo** (tinta + pergaminho) e de **composição** da tela do mapa do mundo (§4). Não reutilizar nomes nem arte da imagem (regra de lore do CLAUDE.md).

## 2. Diagnóstico e geometria de continentes e ilhas

### 2.1 Diagnóstico dos mapas atuais
- **`islands` (`src/sim/terrainGenerators.js`, `islandsHeight`)**: união de elipses `{x,z,rx,rz}` + pontes retangulares `{x1,z1,x2,z2,width}`; altura = platô + `smoothstep` da **distância assinada** até a forma mais próxima (elipse tratada como círculo deformado). Resultado: **costas em arcos perfeitos** e pontes retas de largura constante = "esferas interligadas".
- **`generator.js` (F8-02)**: bases em círculo (simetria rotacional de N dobras ou espelho), **disco por base** (`rb` 17–27), **disco central (hub)** ligado a cada base por espinhas; platôs de expansão e anel de pontes; `README` §"Ampliação": mapas cresceram **acrescentando "lobos" (elipses r 12–18) presos por pontes de largura 12**. Fractal de esferas literal.
- **`continental`**: quadrado com `baseHeight` + rio diagonal senoidal + 3 vaus circulares; costa = `max(|x|,|z|)` > `coast.start` (reta, 4 lados iguais).
- **Simetria exata** (N dobras) torna os mapas **artificiais** além de previsíveis: o olho vê o padrão.
- Efeito medido (protótipo, mesma grade 256², limiar de terra 0,65 = `Terrain.isWalkable`; índice = perímetro/perímetro de disco de mesma área, estimador de Crofton, disco = 1,00, quadrado = 1,13):

| mapa | índice (ponderado por área) | contorno externo (rio fechado) | dimensão fractal da costa |
|---|---|---|---|
| `ilhas-4p` | **1,19** | 1,18 | 0,99 |
| `continental-1v1` | 2,02 (**inflado pelo rio**) | **1,07** | 1,06 |
| `arquipelago-naval-4p` | 3,10 (centenas de ilhotas de poucas células; rasterização) | 2,62 | 1,01 |
| **novo, seeds 1/2/3** | **1,69 / 1,75 / 1,83** (bruto 1,52–1,60; maior massa 1,78–1,90) | n/a | **1,11 / 1,14 / 1,13** |

Leitura honesta: o índice bruto é enganado por rio e por ilhotas pixeladas; por isso o teste usa **três** métricas (índice ponderado, contorno externo dos mapas atuais, dimensão fractal por contagem de caixas), todas a favor do gerador novo.
- **O que precisa mudar:** (a) costa por **campo ruidoso**, não por primitivas; (b) **formas-base diferentes por ilha** (alongada, atol, vulcão, serrilhada); (c) **enseadas, baías, penínsulas, lagoas/lagos**; (d) praia rasa e fundo mar com perfil de costa verdadeiro; (e) **rios** meandrados com vaus; (f) simetria só no que afeta jogo (§2.4); (g) tudo **assado** em dados (§2.5).

### 2.2 Algoritmo proposto (implementado no protótipo, `tools/lib/irregularCoast.mjs`)
Parâmetros: `seed, size (192), grid (256), roughness (0,4–1,6), islands (≥5), islets, bays, peninsulas, gap (5 u), minLake (60 células), symmetry ('none'|'mirror'), continentSpacing`.
1. **Entidades.** 2 continentes (elipses grandes, `rx≈0,135·size`, `rz≈0,34·size`, rotação aleatória) e N ilhas (`ISLAND_TYPES`: vulcânica, rochosa serrilhada, gelo alongada, pântano, tropical, atol em anel, …) posicionadas por **amostragem com rejeição** no corredor central (distância mínima a continentes/ilhas = raio×1,2 + `gap`), mais **ilhotas** (r 2,8–4,4 u) em arquipélago ao redor de uma ilha.
2. **Campo escalar por entidade** `f = base + ruído + enseadas/penínsulas`, terra = `f > 0`:
   - `base = 1 − r/R(θ)`, `r` = distância elíptica normalizada e **`R(θ) = 1 + Σ_{k=2..6} a_k cos(kθ+φ_k)`** (série de Fourier aleatória, `a_k ∝ rough/k^0,55`): quebra o círculo em formas orgânicas (lóbulos/cabos largos). Atol: `base = 1 − |r/R − 0,72|/0,3` (anel com lagoa).
   - **Ruído:** fBm de 5 oitavas com **domain warp** (duas fBm deslocam a coordenada antes da amostragem; `warp ≈ 0,3–0,5 R`) → baías e penínsulas sinuosas; **ridged** nas ilhas rochosas (costa serrilhada); mais **detalhe fino** (λ ≈ 4–8 u).
   - **Enseadas** (gaussianas anisotrópicas negativas, alongadas para dentro, fiorde/baía) e **penínsulas** (positivas alongadas para fora), ângulos sorteados com separação mínima.
   - Margem de oceano no contorno do mapa (`−3·smoothstep(0,86; 0,97; máx(|x|,|z|)/metade)`).
3. **Limpeza.** Filtro de maioria 3×3 (2 passadas) tira dentes de 1 célula; **recorte por folga** (células a < `gap` de terra já colocada viram mar → canal navegável garantido); fica só o **maior componente** da entidade; **lagoas** (água não ligada ao oceano) com `< minLake` células viram terra, as maiores ficam como **lagos** (oásis/lagoa); sem fragmentos soltos (teste: `#componentes = #entidades`).
4. **Superfície.** Transformada de distância (chanfro) → distância assinada `sd` à costa (suavizada) → **altura**: praia rasa `0,72 + 0,42·d` (até 2,6 no interior), mar `0,55 − 0,32·|d|` (até −3,6): baixio turquesa até ~3 u, profundo depois; + ondulação de ruído; **cone+cratera** no vulcão; **cordilheira** (ridged mascarada, só no norte do continente exuberante, até ~6) → rocha/neve por altura; dunas senoidais no árido.
5. **Bioma** por célula (`BIOME`: areia, grama, floresta densa, savana, deserto, estepe, rocha, vulcânico, lava, neve, pântano, gelo) segundo o tipo da entidade, `sd` (faixa de praia) e ruído.
6. **Verificação embutida** (`analyzeMap`): fração de terra, componentes por entidade, menor lago, **rota naval** (água a ≥ 2 células da terra forma um componente com ≥ 95 % e toda entidade o toca), irregularidade, D.
- **Rios (não implementados no protótipo; especificados):** a partir de máximos da máscara de montanha, descer pelo gradiente da altura com desvio de ruído (meandros) até a costa; sulcar canal de largura 3–5 u (altura −0,6…−1,4, como `continental`); a cada ~25 u inserir **vau** (platô 2,35, entra em `fords`); validar que o rio não parte a região das bases (flood fill com vaus como terra) — se partir, mover/adicionar vau. Delta: alargar nos últimos 8 u.
- **Costas jogáveis:** praia ≥ 1,5 u de largura (construções de costa/Estaleiro); `NAVAL_MAX_HEIGHT = 0,1` ⇒ navio só a partir de ~1,5 u mar adentro; poços de petróleo a ≥ 6 u da costa (profundidade ≥ 0,4 já garantida); enseadas com ≥ 8 u de boca são bom lugar de Estaleiro; nenhuma **árvore/construção/jazida** sobre `h < 1,8` (regra atual de terra seca).

### 2.3 Resultado do protótipo (3 sementes; ver `docs/refs/mundo/previews/`)
`seed-1.png`, `seed-2.png`, `seed-3.png` (768², cores: mar profundo/raso turquesa com espuma, areia, grama, floresta densa, savana, deserto/estepe, rocha, vulcânico/lava, neve/gelo, pântano; relevo sombreado), `mapa-antigo-seed-1.png` (pergaminho, costa em tinta, linhas de eco no mar, montanhas/árvores em hachura, rosa dos ventos, moldura) e `atual-*.png` (máscaras dos mapas atuais para comparar). `metrics.json` guarda os números. Tempo por mapa 256²: **0,22–0,39 s** (teste exige < 3 s). Terra 36–39 %. Comando: `node tools/proto/irregular-coast.mjs [--seeds 1,2,3] [--px 768]`.
**Limitações conhecidas** (aceitas no protótipo): (1) continentes ainda alongados/verticais (elipse-base); variar a razão e usar 2–3 elipses sobrepostas por continente; (2) sem rios, sem bases/recursos/florestas (só geografia); (3) biomas são manchas de ruído sem regras de transição (o jogo precisará de mistura/splat, §3); (4) ilhotas às vezes não encontram lugar (0–4 por semente); (5) grade 256² = 0,75 u/célula (aceitável para a prévia; o mapa jogável usa `painted` com `cell` 1); (6) `Math.sin/cos/exp` entram no campo ⇒ **não rodar em cada cliente** (ver §2.5).

### 2.4 Requisitos de jogo e simetria
- **Bases viáveis:** cada `startSlot` em platô de terra seca `h ≥ 1,95` com raio livre ≥ 14 u e acesso por terra às jazidas; **madeira alcançável ≥ 8000 por jogador** (`WOOD_TARGET`, `tools/measure-wood.mjs`/`tools/lib/woodStats.mjs`, árvores só a ≥ 26 u do pátio, ≥ 8,5 de jazidas, espaçamento ≥ 4,4); **ouro/pedra** (`resources`) e acampamentos neutros a ≥ 25 u das bases (README); **poços de petróleo** em água navegável ligados por mar à costa de cada base (mapas navais); **rotas navais** entre todas as costas de base.
- **Competitivo (1×1, 2×2):** a parte que afeta jogo é **exatamente simétrica** (rotação 180° ou espelho) **dentro de um raio R_jogo (~45 u) de cada base e ao longo da rota principal**: copiar a máscara de terra dessa região de uma base para a outra; **fora dela**, a costa e as ilhas usam ruído independente (a assimetria é só estética/rota secundária). Posicionar ouro/madeira/neutros depois, em coordenadas locais replicadas (como o `generator.js` atual) para manter distâncias e quantidades iguais. Teste: madeira alcançável por jogador com diferença ≤ 10 %.
- **Mapas livres/FFA e do mundo:** sem simetria (`symmetry: 'none'`), equidade verificada por métricas (madeira, ouro, área de base, distância ao centro) com tolerância e **semente rejeitada** se violar (o gerador tenta `seed+1…+9`).
- **Proibido:** terra sob água/água sob base (o `validateMapDef` já falha), árvore/jazida/base em `h < 1,8`, ilha de recurso sem rota naval, lago interior com poço, passagem única bloqueável por 1 construção (usar `fords`/largura ≥ 6 u).

### 2.5 Integração ao formato JSON/`generator` sem quebrar a campanha
- **Mapas e coordenadas existentes não mudam.** Os 10 JSON atuais, `tests/fixtures/missionTerrainClasses.json` e `originalMapTerrain.json` continuam valendo; as missões (coordenadas fixas) seguem neles. Novos mapas têm **novos ids** (`mundo-*`, `litoral-*`) e entram em `index.js` como os demais.
- **Novo gerador de dados `coastal`** — mas **assado**: `tools/gen-world-map.mjs` (novo, Node) roda o algoritmo e escreve JSON com `terrain: { generator: "painted", params: { cell: 1, nodes, data } }` (formato F8-03, já suportado por `Terrain`, `Pathfinder`, editor e `validateMapDef`) + `biomeGrid` (ver §3.3) + `startSlots/resources/forests/neutrals/fords/roads`. Motivo: **determinismo em rede/replay** — o campo usa `sin/cos/atan2/exp`, cujas últimas casas podem diferir entre motores/versões; assando em Int8 de décimos o runtime só lê bytes. Custo: ~ (size+1)² bytes em base64 (224 → 51 k nós ≈ 68 KB), aceitável.
  - Limite: `painted` guarda −12,8…12,7 em décimos; cume vulcânico/montanha ≤ 9. Quantização 0,1 não afeta o limiar 0,65 de forma perceptível, mas **fixar o limiar de terra do gerador em 0,72** (margem) para não criar células a 0,6/0,7 ambíguas.
  - `GEN_LIMITS` (96–192) é do gerador antigo; o novo aceita até 256 (custo do `Pathfinder`: 1,5 u/célula → 170² células, ok).
- **Tipos de mapa novos** (presets de `gen-world-map.mjs`, cada um vira 1+ JSON assado):
  | preset | uso | notas |
  |---|---|---|
  | `duelo-continental` | 1×1 / 2×2 | 1 continente com 2 costas, simetria de jogo em R_jogo, ilhas de recurso na costa |
  | `dois-continentes` | 1×1 naval / campanha | 2 continentes + ilhas no meio (protótipo atual), base em cada continente |
  | `arquipelago-vivo` | FFA/naval 4p | 4+ ilhas grandes irregulares + ilhotas, no lugar de `ilhas-4p` (que fica) |
  | `ilha-unica` | tutorial/missão | uma ilha irregular (para a campanha, §7 passo 8) |
  | `mundo-campanha` | missões 7–12 | continente alheio + cabeça de ponte + ilhas (§4/§7) |
- **`generator.js` atual fica intacto** (F8-02, testes `mapGenerator.test.js`, soak). O novo reaproveita **funções puras** dele (`buildPathfinder`, `floodFill`, `isReached`, geração de florestas/jazidas por órbitas, validação), extraídas para `src/data/maps/placement.js` (passo 3 do §7) sem mudar saída.
- **Editor (`src/editor/`)**: já importa/edita `painted`; falta (a) camada de **bioma** (pincel de bioma + sobrepõe `biomeGrid`), (b) botão "Regenerar costa (seed)" que chama o gerador, (c) exportar `biomeGrid`. `validateMapDef` ganha avisos: lagoa < N células, bioma sob base incompatível (lava), costa sem praia.

## 3. Novos tipos de terreno e bioma
**Princípio:** bioma é **só visual** (paleta, textura, decoração, partículas). Velocidade, custo e balanceamento **não mudam**. Única exceção (DECIDIDO pelo dono em 2026-10-11): a **lava** (§3.5), que **bloqueia** como a água, **sem dano**. `src/data/tilesets.js` hoje tem `verdejante` (legado, **não tocar**), `inverno`, `devastadas`, `pantano`, todos **por mapa**; os continentes novos precisam de **vários biomas no mesmo mapa**.

### 3.1 Catálogo de biomas (cores dos splats; água/atmosfera por tileset do mapa)
| bioma | paleta (hex) | textura (procedural × Blender) | vegetação/decoração | objetos novos (modelagem local) | efeitos | tileset |
|---|---|---|---|---|---|---|
| **Deserto** (continente orc) | areia `e6cf9c`/`d6b97c`, sombra duna `b9a47c`, trilha `c4a574`, rocha `8a8378` | splat procedural: dunas = `sin` de crista ruidosa deslocando o normal (sem geometria extra) + grão fino; **trilhas** por `roads` | capim seco (tufos `c9a24a`), arbustos secos, poucas árvores decíduas, juncos/vitórias-régias nas lagoas | **cacto** (2 variantes), **tufo de capim seco**, **arbusto rolante**, **ossada** (costelas/crânio de fera), **rocha de arenito** (estratos), **palmeira** (oásis), **tronco seco** | **poeira** rasteira (partículas, ≤ 40, só perto da câmera), turbilhão ocasional, névoa quente | novo `deserto` (derivado de `devastadas`, mas **claro**, sem rachaduras) |
| **Estepe** (borda do deserto) | palha `b8a45a`/`96873f`, terra `8a6a40` | splat: grama seca ruidosa + manchas de terra | capim alto `b8a45a`, flores secas, tufos | reutilizar tufos; **pedra baixa** | vento no capim (shader, só `high`) | `deserto` (regra `patch`) |
| **Oásis / pântano de vitórias-régias** | água `2f5a58`/profunda `142a2a`, lama `3d3524`, margem verde `5f7a3a` | splat `mud`+`grass` na margem; água com `plants: true` | **juncos/taboas** (já em `Water.createReeds`), **vitórias-régias** (já), flores de lótus, árvores mortas | **tronco afogado**, **raízes de mangue** | névoa baixa, vaga-lumes (noite, futuro) | `pantano` (ajustar) |
| **Exuberante** (continente humano) | grama `5fa43c`/`3f7e2e`, terra `7a5230`, areia `e8d9a8`, rocha `9b9a94` | splat 2 tons + **manchas de terra (roça)**; água **turquesa** `35b7c9`→`0d4a8c` com espuma forte | **bosques densos** (carvalho/pinheiro/bétula, `count` ↑), arbustos, flores, cogumelos, pedras | **árvore alta de copa larga** (variante), **maciço de granito** grande (já `getGraniteBoulderTextures`; falta mesh), **concha/estrela-do-mar** na areia, **caniço de praia** | espuma de ondas animada, gaivotas (decor voando) | **novo `exuberante`** (não legado; `verdejante` legado intacto) |
| **Floresta densa** | grama escura `2f6a2c`, folhedo `5a4a2c` | splat com `forest` (mais escuro, folhas) | `count` 2× e árvores menores no sub-bosque, samambaias, troncos caídos | **samambaia**, **tronco caído**, **toco** (já) | raios de luz (futuro), partículas de folha | `exuberante` (camada `forest`) |
| **Savana** | capim `b8a64a`/`9d8a3a`, terra `a5784a`, areia `d8c28a` | splat grama seca + terra avermelhada | **acácia** (copa achatada), capim alto, baobá (opcional), cupinzeiros | **acácia**, **cupinzeiro**, **rocha plana** | poeira, borboletas | novo `savana` |
| **Montanha nevada / gelo** | neve `ffffff`/`d5e4f1`, rocha azulada `7b8798`, gelo `bcdef0` | splat atual de `inverno` + **cume** por altura (neve acima de ~4,0) | pinheiros nevados (tint já existe), rochas com neve | **bloco de gelo/iceberg** (borda), **pinheiro nevado** (variante dedicada), **rocha com neve** | nevasca (partículas ≤ 60), brilho do gelo, respiração | `inverno` (mantém) + camada `ice` |
| **Ilha pedregosa** | rocha `7d7a72`, musgo `5d6b45`, areia `cdbf99` | splat `rock` dominante + `moss` por ruído e declive | pouca grama, arbustos de vento, gaivotas | **colunas/lajes de rocha**, **arcos**, **rochas na água** | espuma forte nas pedras | novo `pedregoso` |
| **Ilha vulcânica** | basalto `2b2528`, cinza `4a4244`, rocha rubra `6b2f22`, **lava `ff5a1a` (emissivo)**, fumaça `554c4c` | splat `ash`+`basalt`; **lava** como material emissivo com ruído de fluxo animado (UV scroll), **brilho nos vértices próximos** (cor de vértice) | árvores queimadas, pouca vegetação, campos de lava solidificada | **cone/cratera** (malha de relevo), **rocha vulcânica colunar (basalto)**, **árvore queimada**, **fumarola**, **rocha incandescente** | **cinzas** caindo, **vapor** nas fumarolas, **fumaça** na cratera, **centelhas**, leve tremor de câmera opcional | novo `vulcanico` (água escura `2a3a40`, céu `6a4a40`, grade quente) |
| **Atol / tropical** | areia `ecdca8`, água `49c6d4`, palmeira `3f8a3a` | splat areia dominante com faixa de grama | **palmeiras**, conchas, coqueiros | **palmeira** (a mesma do oásis), **concha**, **barco naufragado** | espuma, peixes (sombras) | `exuberante` (praia larga) |

### 3.2 Texturas: procedural × Blender
- **Procedural (nuvem, código):** paletas e regras de splat (`src/data/tilesets.js` + `src/models/environment/tilesetTextures.js`), ruído de dunas, manchas de terra, faixa de praia por `sd`, espuma/gradiente da água, estradas (`roads`).
- **Blender/pintura (local):** albedo de rochas, cacto, ossada, palmeira, acácia, gelo, basalto, javali (§5/§6). Cada modelo **≤ 20 draw calls, textura ≤ 512²**; `?texq=low` respeitado.

### 3.3 Mais de um bioma por mapa (mudança de render, sem tocar na sim)
- `mapDef.biomeGrid = { cell, nodes, data (base64 Uint8) }` (mesma convenção do `painted`) com ids: 0 mar, 1 areia, 2 grama, 3 savana, 4 deserto, 5 estepe, 6 rocha, 7 vulcânico, 8 lava, 9 neve, 10 pântano, 11 gelo, 12 floresta (`BIOME` do protótipo). `mapDef.tileset` continua sendo o **tileset base** (água, névoa, céu, grade de cor); o `biomeGrid` escolhe **a paleta/splat por região** e o **conjunto de árvores/decoração** (`TreeManager`, `Decorations`) por região. Sem `biomeGrid` = comportamento atual (mapas antigos intactos).
- Transição: a textura de terreno (`tilesetTextures.js`, splat 2048² lógicos) mistura 2 biomas com `smoothstep` + ruído na fronteira (como o protótipo faz por mistura bilinear com coordenada deformada).
- **Atmosfera por região** é pós-processamento global: o `grade` do tileset base manda; a região vulcânica só adiciona partículas locais (sem trocar céu).
- **Hash de determinismo:** `biomeGrid` NÃO entra na sim; porém é **dado do mapa** e vai no JSON/replay como o resto.

### 3.4 Impacto em jogabilidade
- **Nenhum** em velocidade/custo/vida. Efeitos visuais ≤ orçamento de partículas atual; poeira/cinzas/vapor só `quality ≥ med`.
- **Lava:** DECIDIDO (2026-10-11): obstáculo puro, **sem dano**, igual à água; detalhes, grade, pathfinder, IA, visual, som, minimapa, determinismo e editor em **§3.5**. Não afeta saves antigos (mapas sem lava não mudam).
- **Dunas** só visuais (normal map), **sem** relevo caminhável.

### 3.5 Lava como divisor de áreas (DECIDIDO: bloqueio sem dano)
**Decisão do dono (2026-10-11).** Em ilhas vulcânicas, **córregos/rios de lava** fazem o papel do rio dos outros mapas: **delimitam áreas**. A lava **não causa dano**: apenas **bloqueia a passagem, exatamente como a água** (terrestres não entram, como no rio/mar; navais também não entram, pois não é água; **aéreas atravessam**). **Passagens de rocha resfriada** fazem o papel dos vaus. Nada de dano/perigo entra na sim: sem `HazardPool`, sem tick de dano, sem efeito em balanceamento. Se um dia o dono quiser dano, é uma nova decisão (fora de escopo; não há opção parcialmente implementada).

**Regras de jogo**
| Quem | Lava | Passagem de rocha |
|---|---|---|
| Terrestre (inclusive construções, muros, tropas de cerco) | **bloqueada** (como água: `Terrain.isWalkable` falso) | caminhável como terra |
| Naval | **bloqueada** (não é água navegável) | n/a (é terra) |
| Aéreo (`layer: 'air'`) | **atravessa** (já ignora o pathfinder terrestre/naval) | atravessa |
| Edificação / jazida / árvore | **proibida** sobre lava (como sobre água) | permitida só se `h >= 1,8` e fora do vau (raio livre de 3 u para não fechar a passagem) |
| Mágicas/projéteis | passam (a lava não bloqueia linha de tiro nem visão); ataque à distância sobre o córrego funciona | idem |
| Transmutação (ovelha), Redemoinho etc. | sem interação | sem interação |
- **Largura:** 3–4 células do protótipo (grid 256 sobre 192 u = 0,75 u/célula, ou seja 2,25–3 u) servem para a prévia; **no mapa jogável (`painted`, `cell` 1) o córrego mede 4–6 u**, no mínimo **2 células inteiras do Pathfinder (3 u)**, senão unidades vazam na diagonal. O teste usa conectividade **8-conexa sem cortar quina** para garantir isso.
- **Passagens:** 1–2 por córrego, **~6 células ao longo do fluxo (≥ 4,5 u)**, localizadas fora das pontas (t entre 0,2 e 0,8) e distantes ≥ 20 % entre si. Largura útil ≥ 6 u no jogo (regra de "passagem única": ≥ 6 u, §2.4) para uma construção não a fechar sozinha. Visual: laje de basalto cinza com borda quente; no minimapa a mesma cor de terra (não de lava).
- **Número de áreas** = córregos + 1 (1 córrego = 2 áreas; 2 córregos paralelos = 3). Cada área tem **uma base/slot** (platô com folga ≥ 2,5 células do protótipo ≈ 14 u no jogo) e ≥ 60 células; fatias menores que 30 células entre lava e costa são absorvidas pela lava.
- **Papel nas missões:** a Fornalha (palco 8) usa os divisores como **frentes**: defender/atacar uma passagem é a decisão tática (equivalente aos vaus do `continental-1v1`). Mapas 1×1 competitivos: córregos e passagens **simétricos** dentro de R_jogo (§2.4).

**Representação na grade e no pathfinder (única mudança de sim; fica para a execução, nada em `src/` nesta spec)**
- **Nova classe de célula `lava`**: bit no terreno, não no `height`. Duas portas de entrada, em ordem de preferência:
  1. **Preferida:** `mapDef.lavaGrid` (mesmo formato do `biomeGrid`/`painted`: `{ cell, nodes, data base64 Uint8 }`, 1 = lava, 0 = não) lida por `Terrain.isLava(x, z)`. `Terrain.isWalkable` passa a `height >= 0,65 && !isLava`; `Terrain.isWater` devolve **falso** em lava (não é água: sem barco, sem Estaleiro, sem pesca/petróleo, sem render d'água).
  2. **Compat/retrocompat:** o JSON assado também grava `height = 0,4` nas células de lava (entre `NAVAL_MAX_HEIGHT` 0,1 e 0,65), de modo que **qualquer código que só olhe a altura já trata a lava como bloqueio para terrestres e navais**; o bit `lavaGrid` serve para render, minimapa, validação e para `isWater`.
- **`Pathfinder.buildGrid`**: `staticGrid = 0` em células de lava **nos dois modos** (terrestre `h >= 0,68` já falha; naval `h <= NAVAL_MAX_HEIGHT` já falha com 0,4; a checagem explícita de `isLava` documenta a regra e protege contra altura reescrita por editor). `_terrainBlocked`/`isWater` nas linhas de visada: lava bloqueia **movimento**, não **visão/tiro** (usar `isLava` só no movimento).
- **`isBlocked`** e a validação de colocação de edifícios (`Placement`) e de árvores/jazidas usam a mesma classe. `unitCanEnter` de aéreos não consulta a grade: sem mudança.
- **Dentro da lava não há unidade**: se uma unidade aparecer sobre lava (editor, spawn mal posicionado), `validateMapDef` falha em tempo de carga; em partida o `Pathfinder.findNearestWalkable` já a empurra para a margem (não há dano).
- **Determinismo:** a lava é **assada** no JSON (`painted` + `lavaGrid`); a sim só lê bytes (sem ruído, sem `sin/cos` em tempo de execução). O fluxo animado é **só render** (shader, sem estado de sim). `lavaGrid` entra no hash do mapa/replay como dado do mapa, **não** no checksum de estado (não muda durante a partida).
- **Teste de aceite da execução:** (a) terrestre e naval não atravessam lava (A* sem caminho entre áreas sem passagem); (b) com passagem, o caminho existe e é determinístico; (c) aéreo atravessa; (d) construção sobre lava rejeitada; (e) nenhum dano: `hp` inalterado após 120 s de unidade ao lado da lava.

**IA e pathfinder**
- A IA terrestre já raciocina por **região conexa do `Pathfinder`** (`AIWood`, expedições): lava só cria regiões desconectadas e, com passagem, um **gargalo**. Sem código novo de IA além de **(i) escolher a base-alvo/expedição por região e custo de caminho** (o `markExploredAt` do NEW-42 evita marchar em laço), **(ii) tratar a passagem como ponto de defesa** (torres/muralhas perto dela, `Placement` já evita o vau), **(iii) transporte aéreo/Grifos** para atravessar quando não há caminho.
- Recursos (ouro/madeira) em área sem passagem para a base da IA = **proibido** (regra de equidade §2.4): toda base alcança suas jazidas e ≥ 8000 de madeira **sem** atravessar lava; a **passagem** só leva a terreno extra/inimigo. Teste: `measure-wood` por região.
- `Pathfinder` terrestre/naval **não** ganha custo diferente: lava é só obstáculo (mesmo código de água).

**Visual (render; sem tocar na sim)**
- **Material de lava emissivo**: cor `ff5a1a` (núcleo `ffb347`, borda `8a1c0a`), textura de fluxo com **UV scroll** (2 camadas de ruído a velocidades opostas), **crosta escura** (placas de basalto `2b2528`) que se abrem; `emissiveIntensity` 1,2–1,8 com pulso lento. Sem sombra projetada; sem reflexo.
- **Brilho vizinho:** cor de vértice laranja no terreno a ≤ 3 u da lava (cinza/basalto aquecido) e **luz pontual fraca** a cada ~14 u ao longo do córrego (≤ 6 luzes por ilha, só `quality ≥ med`; em `low`, só cor de vértice).
- **Partículas** (orçamento F10-04, só perto da câmera): **brasas** subindo (≤ 40), **vapor** nas bordas e onde a lava toca o mar (≤ 30), **fumaça** fina; `quality ≥ med`. Nenhuma colide com a sim.
- **Margem de rocha:** a passagem resfriada tem textura de basalto liso com rachaduras brilhantes; as bordas da lava no mar soltam vapor (e a costa cria "obsidiana" cinza).
- **Atmosfera:** o bioma é visual: a ilha mantém `vulcanico` (água escura, céu quente); a lava não muda o `grade` global.

**Som (F7-08, só apresentação):** laço baixo de **lava borbulhando** posicional (distância ≤ 25 u da câmera, 1 emissor por trecho de ~20 u, máx. 3 simultâneos), **chiado** de vapor onde toca a água; sem sons de dano.

**Minimapa:** células de lava em **vermelho-laranja saturado `d9481c`** (`#ff6a2a` no pulso), passagens na cor de terra cinza do bioma, nunca vermelho; legenda i18n `minimap.lava`. No minimapa circular (ART-14) a lava mantém o contraste sobre o basalto `2b2528`. Fog of war aplica como no terreno (lava explorada fica visível).

**Editor (`src/editor/`)**: novo pincel **"Lava"** (liga o bit `lavaGrid` e grava `height 0,4`), **"Passagem de rocha"** (apaga lava e grava `height ≥ 1,05` no raio, como o pincel de vau grava platô 2,35) e botão **"Gerar córregos (seed)"** (chama o gerador abaixo). Avisos de `validateMapDef`: lava sem passagem entre bases (aviso), lava sobre base/jazida/árvore (erro), passagem < 4,5 u (aviso), córrego que não toca a costa em ambas as pontas (aviso: a área não se separa), células de lava isoladas (< 6 células, aviso).

**Geração (protótipo, `generateLava` em `tools/lib/irregularCoast.mjs`)**
1. Na ilha **vulcânica** (maior que 200 células), escolhe-se `S = 1` ou `2` córregos (45 % dois), ângulo `θ`, deslocamento transversal (um córrego: ±0,15·R do centro; dois: ±0,28–0,36·R, paralelos com jitter ±0,1 rad).
2. Para cada córrego, marcha-se do ponto base nos dois sentidos até a **primeira saída da terra** (+3 células para vazar no mar): isto fixa os extremos **costa a costa**.
3. O caminho é a corda A→B com **deslocamento por fBm** (`0,22·R`, envelope `sin(πt)^0,5`) e **largura 3–4 células** com variação ±8 % por ruído; carimba-se um disco por passo (sempre só sobre terra da ilha).
4. **Validação**: cada córrego é **um** componente 8-conexo; toca a costa em dois pontos separados por ≥ 0,9·R; terra restante = `S+1` áreas ≥ 60 células (fatias < 30 viram lava); então abrem-se **1–2 passagens por córrego** (disco de raio `largura/2 + 0,4` ao longo de ±0,5 célula do centro `t`; `t` em 0,38–0,62 para uma passagem, 0,20–0,36 e 0,64–0,80 para duas); com as passagens fechadas as áreas continuam `S+1`; abertas, são **uma massa**; cada passagem toca ≥ 2 áreas; uma **base por área** = célula de maior folga longe do cone do vulcão (≥ 2,5 células). Reprovou: novo sorteio (até 80 tentativas, deslocamento 100 % → 50 % → 0).
5. **Superfície:** lava `h = 0,4`, bioma `LAVA`; passagem `h ≥ 1,05`, bioma rocha; ≤ 3 células de lava = cinza/basalto. A cratera deixa de ser "lava" (vira basalto) para não parecer córrego.
Resultados (100 sementes): lava válida em **100 %**, quase sempre na 1ª tentativa; < 0,5 s por mapa completo.

### 3.6 Matriz ilha → bioma → divisores → bases e recursos
**Nomes aprovados (2026-10-11):** mundo **Ondara**; continentes **Velmara** (oeste, humanos/Liga de Aurelan; exuberante, montanhas nevadas, savana) e **Cinzara** (leste, orcs/Clãs do Cinzal; deserto, pântano, estepe); mar **Mar Fendido**; arquipélago **Os Estilhaços** (8 ilhas). Bioma é **só visual**; os **divisores** abaixo são o que muda a forma de jogar (rio e lava só nos mapas jogáveis, não no mapa-múndi). Os mapas jogáveis usam **tamanho de missão** (ilha em escala 2–3× o protótipo; a tabela diz o que cada um reserva).

| Ilha / continente | Bioma (visual) | Divisores | Bases e recursos (mapa jogável) | Missão / observação |
|---|---|---|---|---|
| **Velmara** (oeste) | exuberante: grama, floresta densa, savana ao sul, cordilheira nevada ao norte | **rio** meandrado com 2–3 vaus (§2.2); **costa** irregular com enseadas (estaleiro); sem lava | Liga de Aurelan: 1 base na baía + expansões; madeira ≥ 8000 por jogador, ouro/pedra no pé da cordilheira, ovelhas | palcos 1, 10–12 (campanha orc, lado de fora) |
| **Cinzara** (leste) | deserto, pântano nas lagoas, estepe | **rio seco/uádi** com vaus nos mapas de campanha; **lagoas** de pântano (lago interno, sem poço); sem lava | Clãs do Cinzal: base no planalto, ouro/pedra em afloramentos, javalis | palcos 1, 10–12 (campanha humana, lado de fora) |
| **Pouso do Encontro** | tropical/temperada: praia larga, grama, farol | **costa** (enseadas); sem rio nem lava | 2 bases opostas, madeira e ouro médios, ovelhas e javalis, neutro | palco 2 |
| **Pedra-Mãe** | pedregosa (granito, musgo) | **costa** e **penhasco** (declive, sem custo) ; sem rio/lava | colônia mineira da Liga de Aurelan; **ouro abundante**, pouca madeira (madeira 8000 vem de ilhota anexa) | palco 3 |
| **Baixio do Breu** | atol/recifes: areia + dezenas de ilhotas | **costa**/baixios (naval) | só mar: **poços de petróleo** em água navegável (≥ 6 u da costa), ruínas de naufrágio; bases em 2 ilhotas | palco 4 (frota) |
| **Cerne Verde** | floresta densa | **rio** curto com 1 vau no meio; costa | **madeira abundante**, ninho de grifos, bosque sagrado; base da Liga de Aurelan | palco 5 |
| **A Geada** | gelo: neve, gelo, rocha azulada | **lago congelado** (bloqueio como água, só visual) e **costa**; sem lava | pouco ouro, Farol Boreal, 2 bases | palco 6 |
| **Brejo Mudo** | pântano: juncos, lama, água rasa | **rio/canais** meandrados com vaus; **costa** | ferro de brejo, javalis, base dos Clãs do Cinzal; água rasa com vitórias-régias | palco 7 |
| **Fornalha** | vulcânica: basalto, cinza, **lava** | **LAVA**: 1–2 córregos costa a costa dividindo a ilha em 2–3 áreas; **1–2 passagens de rocha por córrego**; costa | **uma base por área** (platô, folga ≥ 14 u), ouro e obsidiana na área maior, Monte Caldeira no centro; forja/santuário dos Clãs do Cinzal numa área, passagem como ponto de defesa | palco 8 (forja e rito) |
| **Miragem** | deserto/oásis: dunas, ruínas | **costa**; sem rio/lava (os 3 poços são pontos de controle) | três poços (água), pouca coisa mais; cabeça de ponte | palco 9 |
Notas: (1) o protótipo mapeia `ISLAND_TYPES` assim: volcanic = Fornalha, rocky = Pedra-Mãe, ice = A Geada, swamp = Brejo Mudo, tropical = Pouso do Encontro, atoll+ilhotas = Baixio do Breu; Cerne Verde (floresta densa) e Miragem (deserto) entram como tipos novos `forest` e `desert` na execução (hoje a 7ª/8ª ilha repetem rocha/tropical). (2) Só a Fornalha tem lava; os demais divisores são **rio** (vaus, §2.2) e **costa**.

## 4. Mapa-múndi (ilustrativo; tela da campanha)
- **Estilo:** pergaminho antigo da referência (§1.3): fundo manchado, vinheta queimada, **costa em tinta** com sombra interna, **linhas de eco** no mar, hachuras de montanha/floresta, **duas rosas dos ventos**, **selo de cera** da facção, **moldura** ornamental, rótulos em serifa curva (texto em PT-BR/i18n, `textPath`).
- **Natureza (DECIDIDO 2026-10-11): o mapa-múndi é só uma ILUSTRAÇÃO.** Mostra **Velmara** (oeste, humanos) e **Cinzara** (leste, orcs) e **Os Estilhaços** entre eles, no **Mar Fendido**; **não é jogável** e não tem rota navegável. As missões acontecem em **mapas próprios** (jogáveis, menores) e, se ficar interessante, cada missão pode ser **marcada** sobre a ilustração por um **marcador opcional** (pino/selo) sem ligação com a sim.
- **Geografia:** os mesmos **dois continentes + as ilhas** do protótipo (assadas com **semente fixa**, p.ex. 1), escolhidas **uma vez** e congeladas em dado (`src/data/campaigns/world-map.json`: contornos como polilinhas simplificadas por marching squares + `entities` com bioma + **marcadores de missão opcionais** em coordenadas normalizadas 0–1). Atribuição **decidida**: oeste = Velmara (exuberante/nevado/savana, **Liga de Aurelan**), leste = Cinzara (deserto/pântano/estepe, **Clãs do Cinzal**); as 8 ilhas no meio recebem os nomes de §3.6 (sem rios nem lava na ilustração; a Fornalha ganha só um **ícone de fumaça**).
- **Formato (nuvem):** componente de UI em **SVG** (contornos, selos, rosas, rótulos) sobre **textura de pergaminho desenhada em canvas procedural** (a mesma rotina do `renderParchmentPreview`: ruído de manchas, fibras, vinheta). Marcadores de missão **opcionais** e clicáveis (concluída = selo; atual = pulsando; bloqueada = esmaecida), tooltip com título/descrição (i18n), botão "Iniciar" que abre o **mapa jogável** da missão. Acessível: foco por teclado, `aria-label`.
- **Slot de arte final (local):** se existir `public/art/world/mapa-mundi.webp` (+ `mapa-mundi-mask.png` com a costa para alinhamento), a tela usa a imagem no lugar do pergaminho procedural e mantém **pinos/rota/rosas** vindos do JSON; arte final é pintada sobre o contorno exportado (`tools/gen-world-map-art.mjs` exporta o contorno como PNG/SVG de guia).
- **Encaixes de missão (12; ids por ordem, a história define títulos; só marcadores):** palcos de `MUNDO-HISTORIA-CAMPANHA.md` §3.2: 1 = costa natal (oeste ou leste conforme a facção), 2 Pouso do Encontro, 3 Pedra-Mãe, 4 Baixio do Breu, 5 Cerne Verde, 6 A Geada, 7 Brejo Mudo, 8 Fornalha, 9 Miragem, 10–12 costa e interior do continente adversário. A campanha dos Clãs do Cinzal **espelha** a ordem (leste → oeste). Os marcadores podem ser movidos no JSON sem tocar em código; **a ilustração não depende deles**.
- **Rota decorativa (opcional):** ao abrir a tela ou concluir uma missão, um ícone de navio pode percorrer um **spline de Catmull-Rom** entre dois marcadores, com rastro pontilhado em tinta (`stroke-dashoffset`), 2,5 s, pulável (clique/Esc); com `prefers-reduced-motion` aparece direto. **É só animação**: não há viagem, combate nem escolha de rota (nada de jogo no mapa-múndi).
- **Selo:** selo de cera vermelho/azul por facção (SVG: círculo irregular com gotas, emblema gravado), usado como botão "Iniciar" e como carimbo nos pinos concluídos. **Rosa dos ventos:** SVG de estrela de 8 pontas + círculos duplos, rotação lenta (±2°) opcional.
- **Integração:** nova tela `src/ui/worldMap.js` (+ CSS) chamada entre missões pelo fluxo de campanha existente; dados em `src/data/campaigns/world-map.json`; i18n `worldmap.*`. Não toca `sim`. (A **tela de história inicial** é da spec `MUNDO-HISTORIA-CAMPANHA.md`.)

## 5. Fauna e flora por continente
- **Humanos (ovelhas):** `critters.species: 'sheep'` (já existe, `src/sim/Critter.js`, `CritterView`). Mantém o tipo `sheep` (também usado por Transmutação, `abilities.js`: **não mexer**).
- **Orcs (javalis no lugar dos porcos):** nova espécie `boar`. Mudanças:
  - **Dados:** `Critter.js`: `species: 'sheep' | 'boar'` (`'pig'` continua aceito como **alias legado** → renderiza `boar`; mapas/saves antigos não quebram); nome `Javali` (i18n `critter.boar`, en `Wild boar`); `MatchConfig.validateNeutrals` aceita `boar`; mapas e `editor` oferecem `boar`.
  - **Prédio:** `pig_farm` (id **estável**: saves/replays) passa a se chamar **"Chiqueiro de Javalis"/"Cercado de Javalis"** no nome de exibição e na i18n (coordenar com NEW-29: nomes de nível em `tiers.js`); ícone `public/icoPorco.svg` → `icoJavali.svg` (arte local, §6 ART-12).
  - **Modelo `critter_boar`:** baixo-poly, corpo atarracado cinza-marrom escuro, **juba de cerdas** eriçada, **presas** brancas, focinho; ≤ 6 draw calls, textura 256²; animações: andar, pastar, correr (pânico); mesma rotina `UnitAnimator`/nomes de nó (`Torso`, `Head`, `LegFL`…).
  - **Comportamento:** igual ao do porco atual (decorativo, vaga num raio). Sem combate.
- **Outros critters por bioma (decorativos, `species` extensível por tabela `CRITTER_SPECIES`):** exuberante = **veado**, coelho, gaivota (voando sobre a costa); deserto = **lagarto**, abutre (círculo no alto), escorpião; savana = **zebra/antílope** (genérico, sem lore) e javali; gelo = **lobo-do-gelo**, foca na praia; pântano = **sapo**, garça; vulcânico = **lagarto de lava**/nenhum. **Fase 1** (obrigatória): `boar`. As demais ficam como lista de arte (P3).
- **Flora por continente** (conjuntos em `src/data/tilesets.js` por bioma): exuberante = carvalho, pinheiro, bétula, arbustos com frutas, flores; deserto = capim seco, cacto, palmeira de oásis, árvore decídua rara, juncos; savana = acácia, capim alto; neve = pinheiro nevado; vulcânico = árvore queimada; pântano = mangue/tronco afogado, lótus. O `TreeManager` recebe a **região de bioma** (`biomeGrid`) para tingir/escolher espécie (`trees.tint` já existe por tileset).
- **i18n/ícones:** chaves `critter.<species>`, `biome.<id>`, `map.<id>.name` (PT-BR e en); ícones 64² (`icoJavali.svg`, `icoOvelha.svg` opcional). **Textura** de cada animal 256², paleta por espécie.

## 6. Tarefas de arte e visual (LOCAL: Blender/navegador) × nuvem
Regras: Sonnet 5.5 em Blender (nunca Haiku), tudo via `tools/safe-run.sh`, GPU real, **≤ 20 draw calls e textura ≤ 512² por modelo**, `.glb` em `public/models/`, nós nomeados conforme CLAUDE.md. Prioridade P0 (bloqueia o resto) … P3 (polimento).

| ID | P | Tarefa | Descrição | Referência |
|---|---|---|---|---|
| ART-01 | P0 | Pedra/rocha em maciço (granito) | 3 variantes (grande/média/pequena) com facetas e topo claro; 2 de arenito (estratos) | §1.1 esq., §1.2 esq. |
| ART-02 | P0 | Árvores: variante alta de copa larga + palmeira + acácia | 3 `.glb` (LOD já suportado pelo `TreeManager`) | §1.2 bosques; §3.1 |
| ART-03 | P0 | Cacto (×2), tufo de capim seco, arbusto rolante, ossada | props de deserto, ≤ 4 draw calls cada | §1.1 |
| ART-04 | P0 | Javali (`critter_boar`) + ícone `icoJavali` | ver §5; animações andar/pastar/correr | decisão do dono |
| ART-05 | P1 | Textura de terreno por bioma | albedo/ruído para deserto, exuberante, savana, vulcânico (se a pintura procedural não bastar; começar procedural) | §1.1/§1.2 |
| ART-06 | P1 | Rocha vulcânica colunar + cone/cratera + árvore queimada + fumarola | + material de lava (emissivo, UV animado) | §3.1 vulcânica |
| ART-07 | P1 | Bloco de gelo/iceberg + pinheiro nevado + rocha com neve | | §3.1 gelo |
| ART-08 | P1 | Água: turquesa/espuma e lagoa de pântano | ajustar `Water.js` (espuma de onda, gradiente raso→fundo, vitórias-régias/juncos já existem) | §1.2 costa; §1.1 lagoa |
| ART-09 | P1 | Praia: conchas, estrela-do-mar, caniço, barco naufragado | props de costa | §1.2 |
| ART-10 | P2 | Samambaia, tronco caído, tronco afogado, raiz de mangue | sub-bosque/pântano | §3.1 |
| ART-11 | P2 | Efeitos: poeira, cinzas, vapor, nevasca, **lava (material emissivo com fluxo, brasas, vapor, luz, som, cor do minimapa; sem dano)** | partículas ≤ orçamento; `quality ≥ med` | §3.1 |
| ART-12 | P2 | `pig_farm` → cercado de javalis (modelo/ícone) e ícones `biome.*` | | §5 |
| ART-13 | P2 | Mapa do mundo: arte final de pergaminho + selo + rosas + moldura | `public/art/world/mapa-mundi.webp`; fonte serifada OFL local | §1.3, §4 |
| ART-14 | P2 | **HUD de referência (tarefa visual separada):** minimapa **circular** com moldura de pedra/ferro espessa, barra de recursos Ouro/Madeira/Suprimento em placas de pedra-metal, painel de comandos retangular (retratos em cima, botões em baixo) em moldura de pedra | substitui o estilo atual; mexe em `style.css`/`UIManager` e minimapa (`drawMinimap` circular + máscara), i18n PT-BR; responsivo (F6-03) | §1.1/§1.2 HUD |
| ART-15 | P3 | Fauna decorativa (veado, gaivota, lagarto, abutre, lobo-do-gelo…) | | §5 |
| ART-16 | P3 | Revisão: capturas no jogo e no inspetor (`tools/capture-*`, `visual`) e bench de draw calls | | CLAUDE.md |

**Nuvem (código/dados/procedural, sem GPU):** gerador `coastal` + assador (`gen-world-map.mjs`), testes de conectividade/madeira/rota naval, `biomeGrid` (formato + validação), tilesets novos (paleta/regras/atmosfera/grade), regras de splat, i18n, tabela de critters, extração de `placement.js`, editor (camada bioma), componente SVG/canvas do mapa do mundo, `world-map.json`, docs.
**Local (GPU/Blender/navegador):** todos os `ART-*`, ajuste fino de cores/transições à vista, capturas, bench (FPS/draw calls), soak visual, validação do mapa do mundo em telas reais, decisões de estilo do dono.

## 7. Plano de execução (passos/commits; uma branch `cloud/<ID>` por passo)
Dependências: 1 → 2 → 3 → (4 ∥ 5) → 6 → 7 (+7b) → 8 → 9 → 10. Tarefas de arte (§6) correm em paralelo no local; o jogo funciona sem elas (props `placeholder` já existem).
1. **`irregularCoast` promovido a módulo de dados** (`src/data/maps/coast/` puro, sem `Math.random`; mantém `tools/proto`): rios (§2.2), presets, `analyzeMap` + testes (determinismo, conectividade, lagoas, madeira ≥ 8000/jogador, rota naval, 1 s/mapa). *Aceite:* `npm test` verde; seeds 1–50 sem falha de verificação.
2. **Assador `tools/gen-world-map.mjs`**: JSON `painted` (`cell` 1) + `startSlots`/`resources`/`forests`/`neutrals`/`fords`/`roads`, validação `validateMapDef` + `buildPathfinder`/`floodFill`. *Aceite:* mapa assado passa em `maps.test.js`/`mapsWood.test.js` (estendidos).
3. **Extrair `placement.js`** do `generator.js` (funções puras reutilizáveis) sem alterar a saída (`mapGenerator.test.js` e checksums idênticos).
4. **Tilesets/biomas (dados):** `exuberante`, `deserto`, `savana`, `vulcanico`, `pedregoso` em `tilesets.js`; `biomeGrid` (formato, `validate.js`, `README`); ainda sem render regional. *Aceite:* testes de paleta/regras (como F7-04), `verdejante` byte-idêntico.
5. **Render regional (pode usar GPU local para ver):** `tilesetTextures.js` mistura por região, `TreeManager`/`Decorations` por região, água turquesa/espuma, lava emissiva. Verificação visual pendente (local).
6. **Mapas novos por tipo** (`duelo-continental`, `dois-continentes`, `arquipelago-vivo`, `ilha-unica`), cada um com 3 sementes aprovadas; i18n; registro em `index.js`. *Aceite:* soak (`node tools/soak.mjs --count 8` por mapa, 8/8 terminam) e `measure-wood`.
7. **Editor:** pincel de bioma, regenerar costa, exportar `biomeGrid`, **pincéis de lava e passagem** (§3.5), avisos novos.
7b. **Lava na sim** (pequena, dados + pathfinder): `lavaGrid`, `Terrain.isLava`, `Pathfinder.buildGrid`, placement, `validateMapDef`, testes de §3.5; só depois render emissivo/partículas/som/minimapa (local).
8. **Fauna/javali:** `Critter.js` (`boar`, alias `pig`), validação, i18n, nome do prédio; modelo/ícone local (ART-04).
9. **Mapa-múndi ilustrativo:** `world-map.json` + `src/ui/worldMap.js` (SVG/canvas, marcadores opcionais, rota decorativa, selos) e ligação ao fluxo de campanha; slot de arte final.
10. **Migração e docs:** mapas antigos **ficam**; campanha atual segue neles; as 12 missões novas (spec `MUNDO-HISTORIA-CAMPANHA.md`) usam mapas novos (um por missão ou compartilhados) com as coordenadas fixas escritas **depois** de assados (fixture `missionTerrainClasses.json` regenerada para os mapas novos). Atualizar `src/data/maps/README.md`, `docs/TASKS.md` (coordenador) e `docs/01_ARQUITETURA.md`.

**Riscos e mitigação**
- *Determinismo:* gerar só em ferramenta e **assar**; o runtime lê bytes. Teste de hash do JSON assado por seed (mudança de motor detectada no CI).
- *Pathfinder:* costa ruidosa cria **gargalos e becos**; exigir largura de passagem ≥ 6 u (`gap`) e rodar flood fill terrestre/naval; custo da grade 1,5 u/célula em 256 u.
- *Soak/IA:* a IA (`AIWood`, naval) foi ajustada aos mapas simétricos; novos mapas exigem **soak A/B** (≤ 10 partidas por config) e métrica de madeira por jogador; NEW-44/NEW-51 pendentes interagem.
- *Desempenho:* `biomeGrid` + splat regional + partículas dentro do orçamento (F10-04); medir draw calls e FPS local.
- *Campanha:* coordenadas fixas nas missões antigas continuam; **não** substituir mapas antigos in place.
- *Estética × equidade:* ruído fora da zona de jogo pode favorecer um lado (rota mais curta): medir distâncias reais base→centro.
- *Tamanho do JSON:* `painted` ≈ 68 KB por mapa de 224; ok; maior que 256 exigiria `cell` 2 (perde detalhe).

**Verificação**
- Nuvem: `npm ci`, `npm test`, `npm run lint`, `npx vite build --outDir /tmp/build-check`, `node tools/measure-wood.mjs`, `node tools/soak.mjs --count ≤ 10` (Node puro, tempo curto), `node tools/proto/irregular-coast.mjs`.
- Local (pendente): capturas dos biomas no jogo e no inspetor, minimapa, `npm run perf`, `npm run visual -- --update` (baseline), mapa do mundo em 3 resoluções.
- Testes de conectividade novos: terra (cada base alcança suas jazidas e a madeira), mar (cada costa de base alcança cada poço e as costas inimigas), lagoas, lava sem passagem entre bases (BFS terrestre fechado, aberto pela passagem).

## 8. Decisões do dono e perguntas ainda abertas
**Decididas (2026-10-11):**
- **P-1 Atribuição:** orcs no **leste** (Cinzara, desértico), humanos no **oeste** (Velmara, exuberante).
- **P-2 Escala:** o mapa-múndi é **só ilustrativo** (dois continentes + ilhas); não é jogável; missões em mapas próprios, marcáveis na ilustração.
- **P-3 Lava:** **divisor de áreas, sem dano, bloqueio como a água** (terrestres e navais não entram, aéreas atravessam), com passagens de rocha como vaus (§3.5).
- **P-4 Bioma:** **só visual** (sem bônus/penalidade de velocidade).
- **P-7 Tamanho mínimo de mapas jogáveis (2026-10-12):** Todo mapa jogável de escaramuça / multiplayer precisa ter no mínimo **168×168** (`size >= 168`). Mapas abaixo disso (`ilhas-4p` 128 e `estreito-1v1` 140) eram pequenos demais e foram ampliados para no mínimo 168×168.
- **P-13 Posição de unidades iniciais (2026-10-12):** Unidades iniciais existentes devem nascer estritamente **à frente da construção principal** (`dz > 0`), nunca atrás ou escondidas sob a malha do prédio.
- **P-14 Posição da serraria (2026-10-12):** A serraria inicial (`lumber_camp` / `orc_lumber_mill`) deve ficar sempre **próxima a um arvoredo** (`forests`, distância recomendada $\le 12$ u). Todos os mapas existentes foram revistos.
- **Nomes:** Ondara, Velmara, Cinzara, Mar Fendido; ilhas Pouso do Encontro, Pedra-Mãe, Baixio do Breu, Cerne Verde, A Geada, Brejo Mudo, Fornalha, Miragem.

**Ainda abertas:**
1. **P-5 Javali:** manter também a ovelha para os orcs em mapas neutros? A Transmutação continua virando ovelha (humano e orc) ou vira javali para orcs?
2. **P-6 Simetria:** aceita assimetria controlada fora da zona de jogo nos mapas 1×1 competitivos (ranking futuro)? (Vale também para a posição dos córregos de lava fora de R_jogo.)
3. **P-7 Tamanhos:** mapas de campanha podem passar de 192 para até 256? (impacta pathfinder e soak; a Fornalha em escala de missão precisa de ~96–128 u.)
4. **P-8 HUD:** o redesenho do ART-14 (minimapa circular etc.) vale como tarefa do pacote "mundo" ou entra no F6?
5. **P-9 Fonte/arte do mapa-múndi:** autorizar uma fonte serifada OFL (ex.: IM Fell/Cinzel) e arte final pintada localmente?
6. **P-10 Ordem:** priorizar (a) mapas novos jogáveis, (b) render de biomas ou (c) mapa-múndi? A spec assume (a) → (b) → (c).
7. **P-11 Marcadores de missão no mapa-múndi:** quer marcar as 12 missões já na primeira versão ou deixar para depois, quando o mapa ilustrativo estiver pronto?
8. **P-12 Lava no mapa-múndi:** a Fornalha mostra só um ícone de fumaça (proposto) ou também um traço de lava na ilustração?
