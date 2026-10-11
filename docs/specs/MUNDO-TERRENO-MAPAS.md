# MUNDO-TERRENO-MAPAS — terreno, biomas, mapas de contorno natural e mapa do mundo

> Spec da nuvem (2026-10-11). **Fonte:** `docs/specs/MUNDO-BRIEFING-DONO.md` (vale o texto do dono em caso de dúvida) e as 3 imagens de `docs/refs/mundo/`. Regras comuns: `docs/specs/_COMUM.md`. Companheira: `MUNDO-HISTORIA-CAMPANHA.md` (história e missões; esta spec só reserva os "encaixes" geográficos).
> **Escopo da nuvem:** especificar + protótipo Node (`tools/proto/irregular-coast.mjs`, `tools/lib/irregularCoast*.mjs`, `tests/unit/irregularCoast.test.js`, prévias em `docs/refs/mundo/previews/`). Nada em `src/` foi alterado. Arte (Blender/navegador) fica no **local** (§6).

## 0. Resumo executivo
1. Os mapas atuais são uniões de **discos/elipses ligados por pontes retangulares** (gerador `islands`) ou um **quadrado com rio diagonal** (`continental`): o contorno é geometria de compasso, não costa. Medido: índice perímetro/disco **1,19** (`ilhas-4p`) e **1,07** (contorno externo do `continental-1v1`); dimensão fractal da costa ≈ **1,0** (curva lisa).
2. Proposta: **gerador `coastal`** (§2) = campo escalar por entidade (continente/ilha) com raio angular de Fourier + fBm de domínio deformado + enseadas/penínsulas explícitas + folga entre entidades + limpeza de lagoas; **assado** em grade (`painted`) para ser determinístico em rede/replay. O protótipo já gera 2 continentes + 6 ilhas (vulcânica, rochosa, gelo, pântano, tropical, atol) + ilhotas em **~0,3 s**: índice **1,69–1,83** e D **1,11–1,14**.
3. **Biomas** como camada visual (§3) por continente/ilha — deserto/pântano/estepe × exuberante/neve/savana + ilhas vulcânica/pedregosa/gelo —, **sem mudar balanceamento** (só arte, exceto lava, ver P-3).
4. **Mapa do mundo** (§4): pergaminho procedural (SVG/canvas) com costas vindas do mesmo gerador + slot de arte final; rota animada do navio, rosa dos ventos, selo.
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
| **novo, seeds 1/2/3** | **1,69 / 1,76 / 1,83** (bruto 1,52–1,60; maior massa 1,78–1,90) | n/a | **1,11 / 1,14 / 1,12** |

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
**Princípio:** bioma é **só visual** (paleta, textura, decoração, partículas). Velocidade, custo e balanceamento **não mudam**. Única exceção a decidir (P-3): **lava** como "água não navegável" (impede passagem). `src/data/tilesets.js` hoje tem `verdejante` (legado, **não tocar**), `inverno`, `devastadas`, `pantano`, todos **por mapa**; os continentes novos precisam de **vários biomas no mesmo mapa**.

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
- **Lava (P-3):** proposta = células de lava em altura `< 0,65` (comportam-se como água para `Terrain`), mas **fora de `fords`** e sem acesso naval (lago interno) ⇒ obstáculo permanente; o render pinta lava em vez de água (marcador `lavaCells` ou `biomeGrid=8`). Não afeta saves antigos.
- **Dunas** só visuais (normal map), **sem** relevo caminhável.

## 4. Mapa do mundo (tela da campanha)
- **Estilo:** pergaminho antigo da referência (§1.3): fundo manchado, vinheta queimada, **costa em tinta** com sombra interna, **linhas de eco** no mar, hachuras de montanha/floresta, **duas rosas dos ventos**, **selo de cera** da facção, **moldura** ornamental, rótulos em serifa curva (texto em PT-BR/i18n, `textPath`).
- **Geografia:** os mesmos **dois continentes + 6 ilhas** do protótipo (assadas com **semente fixa**, p.ex. 1), escolhida **uma vez** e congelada em dado (`src/data/campaigns/world-map.json`: contornos como polilinhas simplificadas por marching squares + `entities` com bioma + posição dos pinos de missão em coordenadas normalizadas 0–1). **Atribuição provisória (confirmar P-1):** oeste = continente exuberante/nevado/savana (**Aliança**); leste = desértico/pântano/estepe (**Horda**); ilhas no meio = pontes de recurso/cabeça de ponte (vulcânica, rochosa, gelo, pântano, tropical, atol), conforme a história do dono.
- **Formato (nuvem):** componente de UI em **SVG** (contornos, rota, selos, rosas — escala nítida em qualquer tela) sobre **textura de pergaminho desenhada em canvas procedural** (a mesma rotina do `renderParchmentPreview`: ruído de manchas, fibras, vinheta). Interativo: pinos clicáveis (missão concluída = selo; atual = pulsando; bloqueada = esmaecida), tooltip com título/descrição da missão (i18n), botão "Iniciar". Acessível: foco por teclado, `aria-label`.
- **Slot de arte final (local):** se existir `public/art/world/mapa-mundi.webp` (+ `mapa-mundi-mask.png` com a costa para alinhamento), a tela usa a imagem no lugar do pergaminho procedural e mantém **pinos/rota/rosas** vindos do JSON; arte final é pintada sobre o contorno exportado (`tools/gen-world-map-art.mjs` exporta o contorno como PNG/SVG de guia).
- **Encaixes de missão (12; ids por ordem, a história define títulos):** 1–2 = costa natal (oeste) e ilha tropical próxima (tutorial de coleta/construção); 3 = ilha rochosa (ouro/pedra, torres); 4 = ilha pantanosa (naval); 5 = ilha de gelo (frota, cerco); 6 = **ilha vulcânica** (primeira disputa de cabeça de ponte); 7 = atol/arquipélago central (poços de petróleo); 8 = desembarque na costa leste; 9–11 = interior do continente adversário (deserto/pântano/estepe); 12 = **fortaleza no continente adversário bloqueando o acesso às ilhas** (final do briefing). A campanha da Horda **espelha** a ordem (leste → oeste). Os pinos podem ser movidos no JSON sem tocar em código.
- **Rota dos navios animada:** ao concluir uma missão (ou ao abrir a tela), um **ícone de navio** percorre um **spline de Catmull-Rom** do pino anterior ao próximo, com **rastro pontilhado em tinta** desenhado progressivamente (`stroke-dashoffset`), pequena **esteira** (2–3 arcos que somem), balanço leve; duração 2,5 s, pulável (clique/Esc); com `prefers-reduced-motion` aparece direto. Som de ondas/corda opcional (F7-08).
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
| ART-11 | P2 | Efeitos: poeira, cinzas, vapor, nevasca, brilho de lava | partículas ≤ orçamento; `quality ≥ med` | §3.1 |
| ART-12 | P2 | `pig_farm` → cercado de javalis (modelo/ícone) e ícones `biome.*` | | §5 |
| ART-13 | P2 | Mapa do mundo: arte final de pergaminho + selo + rosas + moldura | `public/art/world/mapa-mundi.webp`; fonte serifada OFL local | §1.3, §4 |
| ART-14 | P2 | **HUD de referência (tarefa visual separada):** minimapa **circular** com moldura de pedra/ferro espessa, barra de recursos Ouro/Madeira/Suprimento em placas de pedra-metal, painel de comandos retangular (retratos em cima, botões em baixo) em moldura de pedra | substitui o estilo atual; mexe em `style.css`/`UIManager` e minimapa (`drawMinimap` circular + máscara), i18n PT-BR; responsivo (F6-03) | §1.1/§1.2 HUD |
| ART-15 | P3 | Fauna decorativa (veado, gaivota, lagarto, abutre, lobo-do-gelo…) | | §5 |
| ART-16 | P3 | Revisão: capturas no jogo e no inspetor (`tools/capture-*`, `visual`) e bench de draw calls | | CLAUDE.md |

**Nuvem (código/dados/procedural, sem GPU):** gerador `coastal` + assador (`gen-world-map.mjs`), testes de conectividade/madeira/rota naval, `biomeGrid` (formato + validação), tilesets novos (paleta/regras/atmosfera/grade), regras de splat, i18n, tabela de critters, extração de `placement.js`, editor (camada bioma), componente SVG/canvas do mapa do mundo, `world-map.json`, docs.
**Local (GPU/Blender/navegador):** todos os `ART-*`, ajuste fino de cores/transições à vista, capturas, bench (FPS/draw calls), soak visual, validação do mapa do mundo em telas reais, decisões de estilo do dono.

## 7. Plano de execução (passos/commits; uma branch `cloud/<ID>` por passo)
Dependências: 1 → 2 → 3 → (4 ∥ 5) → 6 → 7 → 8 → 9 → 10. Tarefas de arte (§6) correm em paralelo no local; o jogo funciona sem elas (props `placeholder` já existem).
1. **`irregularCoast` promovido a módulo de dados** (`src/data/maps/coast/` puro, sem `Math.random`; mantém `tools/proto`): rios (§2.2), presets, `analyzeMap` + testes (determinismo, conectividade, lagoas, madeira ≥ 8000/jogador, rota naval, 1 s/mapa). *Aceite:* `npm test` verde; seeds 1–50 sem falha de verificação.
2. **Assador `tools/gen-world-map.mjs`**: JSON `painted` (`cell` 1) + `startSlots`/`resources`/`forests`/`neutrals`/`fords`/`roads`, validação `validateMapDef` + `buildPathfinder`/`floodFill`. *Aceite:* mapa assado passa em `maps.test.js`/`mapsWood.test.js` (estendidos).
3. **Extrair `placement.js`** do `generator.js` (funções puras reutilizáveis) sem alterar a saída (`mapGenerator.test.js` e checksums idênticos).
4. **Tilesets/biomas (dados):** `exuberante`, `deserto`, `savana`, `vulcanico`, `pedregoso` em `tilesets.js`; `biomeGrid` (formato, `validate.js`, `README`); ainda sem render regional. *Aceite:* testes de paleta/regras (como F7-04), `verdejante` byte-idêntico.
5. **Render regional (pode usar GPU local para ver):** `tilesetTextures.js` mistura por região, `TreeManager`/`Decorations` por região, água turquesa/espuma, lava emissiva. Verificação visual pendente (local).
6. **Mapas novos por tipo** (`duelo-continental`, `dois-continentes`, `arquipelago-vivo`, `ilha-unica`), cada um com 3 sementes aprovadas; i18n; registro em `index.js`. *Aceite:* soak (`node tools/soak.mjs --count 8` por mapa, 8/8 terminam) e `measure-wood`.
7. **Editor:** pincel de bioma, regenerar costa, exportar `biomeGrid`, avisos novos.
8. **Fauna/javali:** `Critter.js` (`boar`, alias `pig`), validação, i18n, nome do prédio; modelo/ícone local (ART-04).
9. **Mapa do mundo:** `world-map.json` + `src/ui/worldMap.js` (SVG/canvas, rota animada, selos) e ligação ao fluxo de campanha; slot de arte final.
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
- Testes de conectividade novos: terra (cada base alcança suas jazidas e a madeira), mar (cada costa de base alcança cada poço e as costas inimigas), lagoas, lava sem ponte de acesso.

## 8. Perguntas em aberto ao dono
1. **P-1 Atribuição:** Aliança = continente exuberante/nevado/savana (oeste) e Horda = deserto/pântano/estepe (leste)? As referências (humano exuberante × orc desértico) sugerem que sim; o briefing cita ainda "montanhas nevadas" para os humanos. Confirmar posições (oeste/leste) e se a Horda joga a campanha "de fora para dentro".
2. **P-2 Escala:** o mapa do mundo é só **ilustração** (pinos) ou deve ser **também um mapa jogável** (continentes inteiros ~ 256 u)? A spec assume ilustração + mapas jogáveis menores por missão.
3. **P-3 Lava/vulcão:** lava deve ser **obstáculo** (como água) ou só visual? (Proposta: obstáculo.)
4. **P-4 Bioma e jogabilidade:** confirmar "só visual" (sem bônus/penalidade de velocidade por terreno).
5. **P-5 Javali:** manter também a ovelha para os orcs em mapas neutros? A Transmutação continua virando ovelha (humano e orc) ou vira javali para orcs?
6. **P-6 Simetria:** aceita assimetria controlada fora da zona de jogo nos mapas 1×1 competitivos (ranking futuro)?
7. **P-7 Tamanhos:** mapas de campanha podem passar de 192 para até 256? (impacta pathfinder e soak)
8. **P-8 HUD:** o redesenho do ART-14 (minimapa circular etc.) vale como tarefa do pacote "mundo" ou entra no F6?
9. **P-9 Fonte/arte do mapa do mundo:** autorizar uma fonte serifada OFL (ex.: IM Fell/Cinzel) e arte final pintada localmente?
10. **P-10 Ordem:** priorizar (a) mapas novos jogáveis, (b) render de biomas ou (c) mapa do mundo? A spec assume (a) → (b) → (c).
