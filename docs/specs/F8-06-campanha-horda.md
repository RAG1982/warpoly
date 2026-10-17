# F8-06 · Campanha da Horda — "O Caminho das Brasas" (8 missões): BRIEFING

> **Status: SPEC (briefing; não iniciada)**. Escrita em 2026-10-11 por Sonnet 5.5 (**só documento: nenhum código, nenhum JSON de missão**). Os valores numéricos de balanceamento são iniciais (ajuste local). As **decisões narrativas e de escopo marcadas como "proposta" aguardam o dono** (§10).
> Leia antes: `CLAUDE.md`, `docs/historico/HANDOFF_CLOUD.md` (§2, regras da nuvem), `docs/specs/_COMUM.md`, `docs/historico/ESTADO_NUVEM.md`, `src/data/campaigns/README.md`, `src/data/campaigns/alliance/` (`campaign.json` + `m01`…`m08`, **modelo de forma e de nível de detalhe**), `src/data/missions/README.md` (schema, ações, condições), `src/campaign/campaign.js` (`validateCampaign`, `availableTech`, `techRestrictionFor`, `campaignEndPlan`), `src/ui/campaignVictoryModel.js`, `docs/08_GAME_DESIGN.md` (facção orc), `src/data/{units,buildings,upgrades,heroes,abilities,tiers}.js`, `src/data/maps/README.md`, `docs/05_PARIDADE_WARCRAFT2.md` (nomes), `tests/unit/campaignAlliance.test.js` e `tests/unit/campaignPlaythrough.test.js` (**modelos dos testes**).
> Executor: **sonnet** (agentes de nuvem), uma branch `cloud/F8-06-<passo>` por passo (§6), sem navegador/GPU. Arte final de vitória: **local** (Blender, Sonnet 5.5). Equilíbrio, leitura dos diálogos e HUD orc: **verificação pendente (local)**.
> Dependências: F8-04 (missões), F8-05 e F8-05b (campanha da Aliança + `unlocks`), F4-08 (heróis), F5-06 (IA de campanha por dados) — **todas já no `master`**.

---

## 0. Resumo para o dono (leitura de 1 minuto)

- **Campanha `horde`**, `factionId: 'orc'`, 8 missões, mesmo esquema da Aliança (`unlocks` por missão, `epilogue`, `victory_orc.webp`, carry-over 25 % / teto 300). Título: **O Caminho das Brasas** (*The Ember Road*).
- **História original** (nada da Blizzard): o povo dos Clãs do Cinzal fica sem água no Planalto; o chefe-de-brasa **Skarn** promete os vales verdes; o capitão de guerra **Drogath Punho-de-Brasa** (herói jogável em todas as missões) acredita nele. A conquista avança (travessia, estreito, vau, forja da coroa, mar) e **cada vitória custa mais** (cativos, celeiros queimados, aliados sacrificados, mortos erguidos). Quando a Aliança contra-ataca, Skarn se volta contra os próprios clãs; Drogath **desobedece, mata Skarn e fecha a paz**. Tema: sobrevivência × honra do clã × escalada de conquista. Virada: **a vitória final é salvar o povo, não vencer a guerra**.
- **As duas campanhas são a MESMA guerra vista por lados opostos**: a Horda ocupa **outras frentes e datas** nas missões 1–6 (não contradiz o que a Aliança vence) e **converge** com a Aliança nas missões 7 (o "falso aliado" Presa-Negra) e 8 (o Planalto) — tabela de cronologia em §1.6.
- **Presa-Negra** (decisão desta spec): **aliado coagido** da Horda. O "Cinzal paga bem pelo seu vale" que a Aliança ouve na m07 é a face humana de um **resgate de reféns**: Skarn ameaçou as famílias de Brakka. Na m07 da Horda o Presa-Negra luta ao lado do jogador; **Skarn então manda purgá-lo** e Drogath rompe com ele (virada do meio da campanha).
- **Liberação progressiva**: as 16 unidades treináveis, as 16 construções, as 27 fichas de pesquisa e os heróis orcs aparecem ao longo das 8 missões (§3); a cadeia de requisitos foi **verificada por script** contra `src/data`. **Lacunas reais**: o orc **só tem 1 herói** (Drogath; Vozgul e Grok existem só no design) e **não tem cavalaria/lobos** (o Ogro faz o papel) — §9.
- Plano em **10 passos/commits** (§6). Antes de começar: responder as perguntas do §10 (as 4 primeiras mudam o escopo).

---

## 1. Premissa e história original

### 1.1 Premissa (texto para `campaign.json`, `provisional: true` até o dono aprovar)

**pt-BR:** "Há três invernos os poços do Planalto do Cinzal secam e a cinza cobre o que restava de pasto. O chefe-de-brasa Skarn promete aos clãs os vales verdes além das Montanhas do Véu, e o capitão de guerra Drogath, do pequeno Clã Chama-Baixa, acredita nele. Da travessia da Garganta ao domínio do mar, a marcha parece imparável, até que a coroa de ferro de Skarn passa a custar mais do que a terra vale: cativos, celeiros queimados, aliados sacrificados, mortos que não descansam. Quando o Reino de Aurelan contra-ataca e o chefe se volta contra os próprios clãs, Drogath precisa escolher entre a obediência e a honra do povo que jurou proteger."

**en:** "For three winters the wells of the Cinzal Plateau have been running dry and ash covers what pasture was left. Ember-chief Skarn promises the clans the green valleys beyond the Veil Mountains, and war-captain Drogath of the small Low Flame Clan believes him. From the crossing of the Gorge to mastery of the sea, the march seems unstoppable, until Skarn's iron crown begins to cost more than the land is worth: captives, burned granaries, sacrificed allies, dead who will not rest. When the Kingdom of Aurelan strikes back and the chief turns on his own clans, Drogath must choose between obedience and the honor of the people he swore to protect."

Subtítulo: pt-BR "Campanha dos Clãs do Cinzal (premissa provisória)" · en "Cinzal Clans campaign (provisional premise)".

### 1.2 Tom e temas
- **Sobrevivência** (m01–m02): o motivo da guerra é fome e sede, não maldade. O jogador deve **entender** os orcs antes de ser levado a acompanhar seus erros.
- **Honra do clã** (todas): honra = manter acesa a chama do clã (o Fogo do Clã é um objeto narrativo: o braseiro que a Anciã Ulma carrega na travessia). Cada missão tem um objetivo oculto de **conduta** ("Honra do Clã": poupar Hurgan (m01, m03), dar água a um cativo (m02), poupar refugiados (m04), poupar um emissário (m05), poupar as vilas pesqueiras (m06), não abandonar Brakka (m07), poupar o arauto (m08)).
- **Escalada de conquista** (m03–m06): os métodos de Skarn pioram a cada vitória (isca sacrificial, fome como arma, a coroa, a frota que queima aldeias).
- **Dilema moral e virada** (m07–m08): Skarn trai quem o serviu. Drogath escolhe o povo.
- **Coerência interna do jogo**: o jogador orc aprende a mesma árvore tecnológica que o jogo oferece; o "lado sombrio" (Necromante, Erguer Mortos) é **ferramenta que Skarn abusa**, e Vozgul ensina a usá-la com respeito aos mortos.

### 1.3 Elenco (todos originais; nenhum nome da Blizzard)

| Personagem | Papel | Arco | Aparece em | Em jogo |
|---|---|---|---|---|
| **Drogath Punho-de-Brasa** | Capitão de guerra do Clã Chama-Baixa; **herói jogável** (`hero_drogath`) | Leal e crédulo → inquieto (m02–m04) → cúmplice relutante (m05–m06) → rebelde (m07) → mata Skarn e recusa a coroa (m08) | 1–8 | herói do jogador; **derrota se morrer** (§4.1) |
| **Skarn** | Chefe-de-brasa, ogro de coroa de ferro; unifica os clãs | Profeta da sobrevivência → tirano que "alimenta o fogo com o próprio povo" quando a coroa o consome | 1 (voz), 3, 5, 7, 8 | inimigo final (`ogre` na m08, como na Aliança) |
| **Vozgul, a Profetisa** | Necromante e guardiã da memória dos mortos | Vidente de Skarn → vê o que a coroa faz → revela a Drogath o sequestro das famílias de Brakka (m07) → guarda a memória no fim | 5–8 | **herói** (`hero_vozgul`, ver §9 G1) |
| **Grok Quebra-Muros** | Mestre de cerco e Ogro Feiticeiro; amigo e "irmão de lança" de Drogath | Piadista e prático → carrega a ordem de purgar o Presa-Negra e **a rasga** (m07) → reconstrói muros no fim | 4 (cerco), 7–8 | **herói** (`hero_grok`, §9 G1) |
| **Anciã Ulma** | Guardiã do Fogo do Clã (braseiro) | Guia a travessia; **morre na Garganta** (m02) e passa o fogo a Drogath (origem do apelido "Punho-de-Brasa") | 1–2 | só diálogo/cutscene |
| **Brakka Presa-Negra** | Chefe do Clã Presa-Negra (tratado no masculino, como "Chefe Brakka" da Aliança) | Orgulhoso, rompe com Skarn → é coagido (reféns) a fingir trégua com Aurelan e trair os humanos (m07 da Aliança) → Skarn manda purgá-lo → aliado de Drogath | 5 (aliado), 7, 8 | aliado de IA (m07) / unidades de reforço (m08) |
| **Hurgan Lança-Partida** | Chefe do Clã das Lanças Quebradas, rival | Inimigo em m01 → vassalo forçado → **sacrificado como isca** em Alvorada (m03) → ressentido, ainda leal por medo → pode virar de lado na m08 (objetivo secundário) | 1, 3, 8 | inimigo (m01), aliado coagido (m07, IA), inimigo/aliado (m08) |
| **Zarruk** | Mestre-ferreiro do Clã da Forja Negra | Forja a coroa a mando de Skarn; arrepende-se | 5 | aliado de IA (m05) |
| **Orvanna** | Capitã do Clã das Marés Negras | Mestra do mar; segue Skarn por orgulho, cobra a conta depois | 6 | aliada de IA (m06) |
| **Humanos vistos pelo outro lado** | Marechal Dorian Vasques, Capitã Lyra Ventosa, Mestre Orsolo, Rainha Sevelin, Capitão Brann, Mestre Arcano Oren | Os orcs os conhecem por nome e apelido ("a Capitã do Vento"); **aparecem como inimigos/emissários**, sem arco próprio | 2–8 | inimigos (heróis humanos só na m08) |

Gênero de Brakka: a Aliança não fixa. Esta spec o trata no masculino; se o dono preferir outro, é só troca de texto (§10).

### 1.4 Os clãs (quem é aliado, rival e inimigo)

| Clã | Lado nesta campanha | Nome em jogo (jogador de missão) | Onde |
|---|---|---|---|
| **Chama-Baixa** (de Drogath) | o jogador | "Clã Chama-Baixa" / "Coluna de Drogath" / "Vanguarda do Cinzal"… (varia por missão) | todas |
| **Horda do Cinzal** (de Skarn) | comandante supremo; **inimigo na m08** | "Horda do Cinzal" | 8 |
| **Lanças Quebradas** (Hurgan) | rival → vassalo → isca → inimigo reticente | "Clã das Lanças Quebradas" | 1, 3, 7, 8 |
| **Forja Negra** (Zarruk) | aliado | "Clã da Forja Negra" | 5 |
| **Marés Negras** (Orvanna) | aliado | "Clã das Marés Negras" | 6 |
| **Sal Cinzento** | aliado distante (citado; é quem segue a Orvanna até as Ilhas Gêmeas da m06 da Aliança) | — | citado em 6 |
| **Presa-Negra** (Brakka) | aliado coagido → traído por Skarn → aliado de Drogath | "Clã Presa-Negra" | 5 (citado), 7, 8 |

### 1.5 Arco em três atos

**Ato I — A Seca (m01–m02): sobrevivência.** O Planalto morre. Skarn reúne os clãs em torno de "uma só chama". Drogath derrota as Lanças Quebradas pelos últimos poços e as faz jurar a Skarn (m01); a caravana do clã atravessa a Garganta do Véu, a Anciã Ulma morre e Drogath recebe o fogo (m02). Primeira semente moral: os cativos humanos amarrados "como gado".

**Ato II — A Marcha (m03–m06): conquista que degenera.** A travessia vira invasão e cada triunfo é mais sujo: Skarn **sacrifica as Lanças como isca** para Drogath furar o Estreito (m03); a fome cerca o Forte Atalaia queimando celeiros (m04); a **coroa de ferro** é forjada e Vozgul avisa que "ela bebe" (m05); a frota toma o arquipélago e Skarn manda queimar as vilas pesqueiras (m06). No fim do Ato II, o auge: Aurelan começa a contra-atacar (o que a campanha da Aliança conta).

**Ato III — As Cinzas (m07–m08): queda e escolha.** Skarn usa os reféns de Brakka para forçar o falso tratado e depois manda purgá-lo. Drogath, Grok e Vozgul se voltam contra o chefe. No Planalto, entre o exército de Skarn e a Guarda Real, Drogath **mata Skarn**, os clãs livres seguram a linha e a **paz** é aceita com Aurelan. A "vitória" é ver o povo sobreviver.

### 1.6 Cronologia comum Aliança × Horda (coerência)

Princípio: **nenhuma missão da Horda desmente uma vitória da Aliança**. As missões 1–6 da Horda acontecem **em frentes ou datas diferentes**; as missões 7–8 **convergem** com a Aliança e mostram o mesmo evento do lado de dentro.

| Quando | Aliança | Horda |
|---|---|---|
| Fim do outono (antes) | — | **H1** Planalto seco: Chama-Baixa subjuga as Lanças. **H2** a Garganta do Véu: caravana e cativos. |
| Primeiras fumaças | **A1** vanguarda de 5 guerreiros com a bandeira de Skarn é esmagada; **A2** quatro famílias de camponeses, presas na Garganta, são libertadas | No fim de H1 Skarn manda cinco "arautos" aos vales (a vanguarda da A1); em H2 Drogath vê os cativos que a A2 depois liberta (acampamento já abandonado por Drogath) |
| Estreito | **A3** Alvorada resiste 5 min a ondas e é socorrida pelas legiões | **H3** o ataque frontal do Estreito é a **isca**: Skarn lança as Lanças contra a muralha enquanto a coluna de Drogath fura o outro lado; a investida falha onde a Aliança viu, e a coluna toma só a cabeça de ponte |
| Rio Turvo | **A4** o comboio rompe o bloqueio e abastece o Forte Atalaia | **H4** acontece **antes**: a Horda toma o vau e queima os celeiros que alimentam o forte (a "fome" que a A4 depois alivia). O forte **não cai** |
| Florestas Altas | **A5** os humanos queimam o salão da Forja Negra | **H5** acontece **antes**: o salão guarda a fundição da coroa de ferro; Drogath segura a forja até a coroa sair. Quando a A5 queima o salão, a coroa já está com Skarn |
| Ilhas | **A6** os humanos tomam as Ilhas Gêmeas dos clãs Marés Negras e Sal Cinzento | **H6** acontece **antes**: a Horda conquista o Arquipélago e dá aos dois clãs seus portos; dali partem as barcaças que a A6 encontra |
| Vale do Presa-Negra | **A7** "trégua" → traição aos 330 s → queda do Presa-Negra | **H7** é o **mesmo evento visto de dentro**: Brakka (coagido) cumpre o trato; depois Skarn o manda purgar e Drogath rompe com Skarn. O salão do Presa-Negra cai (como a Aliança viu), mas o **povo é evacuado** |
| Planalto | **A8** Skarn cai; a Rainha estende a mão aos clãs vencidos | **H8** é o **mesmo combate**: o golpe final é de Drogath (humanos creditam a si, clãs a Drogath: "os dois cantos estão certos pela metade") e a paz é aceita |

Nota de coerência a conferir (pedido de confirmação ao dono, §10): o epílogo da Aliança diz que a Rainha estendeu a mão "inclusive ao Clã Presa-Negra e a Brumar"; Brumar é uma **guarnição humana** na m06. Provável deslize de texto; não impede nada nesta campanha.

### 1.7 Decisão sobre o Presa-Negra
Proposta: **aliado coagido**. Em m05 é citado; em m07 luta ao lado do jogador (IA aliada); em m08 seus sobreviventes entram como **reforço** do jogador (aliados de roteiro). Isso (a) explica o "o Cinzal paga bem pelo seu vale" da Aliança, (b) dá à m07 uma **inversão simétrica** à da Aliança (lá o falso aliado trai; aqui o aliado verdadeiro, Skarn, trai quem o serviu), e (c) cria o dilema que vira Drogath.

### 1.8 Nomes, lore e coerência com o design
- Nada de nome próprio/lore da Blizzard. O teste da Horda reutiliza a expressão regular de nomes proibidos de `campaignAlliance.test.js` e a **amplia** (§7). "Horda" e "Clã" são palavras comuns, já usadas pela Aliança.
- **Divergência a registrar:** `docs/08_GAME_DESIGN.md` §1 chama a facção de "Clãs de Gorthak"; a Aliança (aprovada) usa "Clãs do Cinzal". Esta campanha segue **Cinzal** e propõe tratar "Gorthak" como o nome antigo do povo (os "Clãs de Gorthak" viram os "Clãs do Cinzal" quando perdem o Planalto); atualizar a nota do GDD é pergunta §10.

---

## 2. Missões

Todas com **objetivo primário, secundário e oculto**, cutscene de abertura, diálogos **bilíngues** (pt-BR/en), `speaker` e `portrait` (emoji, como na Aliança), 1ª missão disponível e as demais com `requires` linear e `carryOver` (25 %, teto 300 por recurso, de ouro/madeira/pedra) como na Aliança. Ids: `horde-NN-slug`; arquivos `src/data/campaigns/horde/mNN-slug.json`; subtítulo "Horda, missão N" / "Horde, mission N".

### 2.1 Tabela-resumo

| # | id | Título (pt-BR / en) | Mapa | Ideia central | Libera (resumo) | Tier | Herói(s) | Alvo |
|---|---|---|---|---|---|---|---|---|
| 1 | `horde-01-ultima-fogueira` | A Última Fogueira / The Last Campfire | `terras-secas-1v1`* (ou `campos-1v1`) | construir, defender dos saqueadores das Lanças e subjugá-las | Lacaio, Talhador, Lanceiro-Machado; Toca, Serraria do Clã, Chiqueiro, Acampamento de Guerra; **Drogath** | 1 | Drogath | 12–14 min |
| 2 | `horde-02-preco-da-passagem` | O Preço da Passagem / The Price of Passage | `passo-do-veu-1v1`* (ou `desfiladeiro-1v1`) | escoltar a caravana do clã pela Garganta, quebrar o pedágio e as torres da fronteira | Forja de Guerra; Lâminas de Guerra, Machados Balanceados | 1 | Drogath | 13–15 min |
| 3 | `horde-03-isca-de-alvorada` | A Isca de Alvorada / The Bait at Alvorada | `estreito-1v1` | furar a ponte enquanto as Lanças morrem de frente; segurar a cabeça de ponte | **Ogro**, Covil dos Ogros, Torre de Vigia, Paliçada de Ferro; Placas de Ferro | 2 | Drogath | 13–15 min |
| 4 | `horde-04-fome-no-rio-turvo` | Fome no Rio Turvo / Hunger on the Murky River | `continental-1v1` | tomar o vau com cerco e queimar os celeiros que alimentam o Forte Atalaia | Oficina dos Engenhoqueiros, **Catapulta**, **Incendiários**; Pedras Incendiárias | 2 | Drogath | 15–18 min |
| 5 | `horde-05-ferro-da-coroa` | O Ferro da Coroa / The Crown's Iron | `bosques-2v2` | economia + defesa da forja enquanto a coroa é fundida; reconhecimento aéreo | **Balão de Guerra**, **Enfurecido**; Ofício do Lenhador, Ritual do Enfurecido; **Vozgul** | 2 | Drogath, Vozgul | 17–20 min |
| 6 | `horde-06-mar-de-sal` | O Mar de Sal / The Salt Sea | `arquipelago-naval-4p` | frota orc: Doca, petróleo, quebrar a Armada de Brumar | Petroleiro, Barcaça, Galé, Leviatã, Tartaruga; Doca do Clã, Caldeirão, Fornalha, Plataforma; Bocas de Fogo, Cascos de Ferro | 3 | Drogath, Vozgul | 20–25 min |
| 7 | `horde-07-vale-de-vidro` | O Vale de Vidro / The Glass Valley | `vales-2v2` | o falso tratado visto de dentro; Skarn manda purgar Presa-Negra; evacuar | Necromante, Serpe, Ogro Feiticeiro; Santuário, Altar, Ninho; Ritual das Tempestades, magias, nível 2 de armas/placas/machados; **Grok** | 3 | Drogath, Vozgul, Grok (a partir do rompimento) | 18–22 min |
| 8 | `horde-08-ultima-brasa` | A Última Brasa / The Last Ember | `planalto-ffa-4p` | três lados no Planalto; matar Skarn; paz com Aurelan | resto das magias, classe do Enfurecido, nível 2 de cerco e naval | 3 | Drogath, Vozgul, Grok | 22–25 min |

\* Mapas novos opcionais, **só dados** (§2.3). Se o dono recusar, usar os mapas originais entre parênteses; nada na campanha depende do visual árido/invernal.

Total ≈ 2 h 10 min de jogo.

### 2.2 Convenções comuns às 8 fichas
- **Jogador local:** sempre `factionId: 'orc'`, time 0, cor vermelha (`#dc2626`, a cor orc usada pela Aliança do outro lado; os aliados orc usam `#9333ea` Presa-Negra, `#ea580c` Lanças, `#0ea5e9` Marés Negras, `#a16207` Forja Negra).
- **Inimigo "de roteiro"** (m01–m04): jogador com `isAI: false` e unidades criadas por `spawn`/`spawnBuilding` + `guard`/`order`, exatamente como m01–m04 da Aliança. **Inimigo de IA** (m05–m08): `isAI: true` + `difficulty` por jogador (F5-03) + ondas e guarnições por dados (F5-06).
- **Heróis:** Drogath é criado em `setup` na base do jogador (`spawn`, `unitType: 'hero_drogath'`); `failWhen: {dead:{select:{unitType:'hero_drogath'}}}` no principal "central" de cada missão (§4.1). Vozgul/Grok chegam por `spawn` com cutscene curta (cada herói em 2 a 4 missões; um por tipo por partida).
- **Tier do Centro:** `setTier` em `setup` conforme a tabela (§3), nunca depende de gastar pedra/petróleo.
- **Coordenadas:** as sugestões abaixo usam os pontos reais dos mapas (slots, jazidas, acampamentos neutros, vaus); **todas devem ser reconferidas** com o teste de terra/água (§7) porque os mapas foram ampliados.
- **Valores** (contagens, tempos, recompensas) são iniciais; recompensas de objetivo secundário/oculto em ouro/madeira/pedra/petróleo, no padrão 100–300 da Aliança.

---

### 2.3 Mapas novos opcionais (propostos; 2 clones de dados, sem gerador novo)

**Por que clones e não mapas gerados:** medido neste levantamento, `generateMap({players:2,size:176,theme:'devastadas',forestDensity:2})` produz só ~1800–2500 de madeira alcançável por jogador (meta do jogo: **8000**, `tools/lib/woodStats.mjs`); um mapa gerado novo **reprovaria** `mapsWood.test.js`. Clonar um mapa existente (que já cumpre a meta) e trocar só `id`/`name`/`tileset` mantém terreno, bosques e jazidas.

| Mapa novo | Cópia de | Mudanças | Missão |
|---|---|---|---|
| `terras-secas-1v1` ("Terras Secas") | `campos-1v1` (192, tem 2 acampamentos neutros) | `id`, `name`, `tileset: "devastadas"`, `hidden: true` | m01 (visual árido do Planalto) |
| `passo-do-veu-1v1` ("Passo do Véu") | `desfiladeiro-1v1` (176, 2 acampamentos neutros) | `id`, `name`, `tileset: "inverno"`, `hidden: true` | m02 (neve da montanha) |

`hidden: true` os esconde da lista de escaramuça (como `tutorial`). Registrar em `src/data/maps/index.js`, nome em `src/i18n/{pt-BR,en}.json` (`map.<id>.name`), e conferir `npm test` (testes que iteram mapas: `maps.test.js`, `mapsSkirmish.test.js`, `mapsWood.test.js`, `terrainGenerators.test.js`; **se algum assumir lista fixa, ajustar o teste, não o mapa**). Se qualquer coisa não passar sem esforço, **desistir dos clones** e usar `campos-1v1`/`desfiladeiro-1v1`.

O mapa `arquipelago-naval-4p` (224, 4 ilhas-base + ilha central ligada por pontes, 12 poços, 4 acampamentos) é o **único mapa existente não usado pela Aliança** e é o ideal para a m06 (a Aliança só usou `ilhas-4p`). Atenção: é o maior mapa; custo de teste/IA naval em §8.

---

### 2.4 Missão 1 — A Última Fogueira (`horde-01-ultima-fogueira`)
- **Cruzamento:** antecede a A1 (no fim, Skarn despacha os cinco arautos que a Aliança esmaga).
- **Mapa / jogadores:** `terras-secas-1v1` (ou `campos-1v1`). P0 "Clã Chama-Baixa" (local, orc, `startSlot` 1, lado sudoeste); P1 "Saqueadores das Lanças Quebradas" (orc, time 1, `isAI:false`, `startSlot` 0). Recursos iniciais 350 madeira / 300 ouro / 120 pedra (iguais à m01 da Aliança).
- **Resumo (briefing, Skarn):** os poços secaram; só resta o Poço de Cinza do vale seco. O Clã das Lanças Quebradas quer a mesma água. "Ou uma só chama, ou nenhuma." Construa um Acampamento de Guerra, defenda o poço e quebre os saqueadores.
- **Objetivos:**
  - *Primário:* `build` Acampamento de Guerra (`orc_barracks`); `destroy` tag `raiders` (saqueadores e guarnição do poço inimigo, **menos** Hurgan, que tem a tag própria `hurgan`) com `failWhen` Drogath morto.
  - *Secundário:* flag "4 Lanceiros-Machado" (+100 ouro); `collect` 600 de ouro; `destroy` o acampamento neutro de bandoleiros do mapa (recompensa do mapa, 300 ouro).
  - *Oculto:* `Honra do Clã` — **poupar Hurgan**: ao cair o tag `raiders`, Hurgan se rende (`transfer` para `neutral`, para a IA parar de atacá-lo) e o objetivo `flag` conclui se ele sobreviver aos 20 s seguintes (+100 madeira). Segundo oculto: achar o "Poço do Avô" (Drogath numa área do mapa seco, +150 pedra).
- **Gatilhos-chave:** `intro` (cutscene: a fogueira, Skarn e Ulma; câmera nos poços secos); `barracks-up` (diálogo "Treine; as Lanças vêm ao anoitecer"); `raid-1` aos 240 s; `raid-2` aos 420 s; `kneel` (ao destruir o tag `raiders`: Hurgan de joelhos, Skarn diz "uma só chama"); `heralds` (cena final: cinco guerreiros partem para os vales — **sem unidades jogáveis**, só diálogo/câmera, para casar com a A1).
- **Inimigos (ordem de batalha, normal):** onda 1 — 4 Talhadores + 2 Lanceiros-Machado; onda 2 — 6 Talhadores + 3 Lanceiros-Machado; guarnição do poço (`guard` r 8) — 6 Talhadores + 2 Lanceiros; 1 Ogro capitão aos 420 s (primeiro Ogro que o jogador vê, ainda travado para ele). Fácil: −30 % das contagens e +60 s nos relógios; difícil: +30 % e −60 s (referência para ajuste local).
- **Aliados:** nenhum. **Herói:** Drogath no `setup`.
- **Novidade: EXIGE/RECOMPENSA:** exige o Acampamento de Guerra (primário); recompensa Lanceiros-Machado (secundário). Dica de Drogath: "O Grito de Guerra dura 15 s: use quando as duas linhas se encontrarem".
- **Falas-chave:** Skarn — "Os poços beberam o último orvalho. Quem tem fôlego, anda."; Ulma — "Leve o fogo, Drogath. Fogo apagado não acende de novo."; Hurgan (rendido) — "Uma só chama. Que seja a sua."

### 2.5 Missão 2 — O Preço da Passagem (`horde-02-preco-da-passagem`)
- **Cruzamento:** antecede a A2 (os cativos que a Aliança liberta estão no acampamento que Drogath toma aqui e abandona).
- **Mapa / jogadores:** `passo-do-veu-1v1` (ou `desfiladeiro-1v1`). P0 "Caravana do Clã" (local, `startSlot` 1, sudoeste); P1 "Guarda da Fronteira de Aurelan" (humano, time 1, `isAI:false`, `startSlot` 0). Recursos 400/350/150 (m02 da Aliança).
- **Resumo (briefing, Ulma):** a caravana (6 Lacaios com as famílias e o braseiro do clã, tag `caravan`, anel `markColor` verde-limão `#a3e635`) precisa atravessar a Garganta do Véu. Saqueadores vendem passagem e prendem camponeses humanos como moeda; do outro lado há torres de fronteira.
- **Objetivos:**
  - *Primário:* `escort` tag `caravan` (≥ 5 de 6) até a saída da Garganta (área nas coordenadas do canto oposto ao slot do jogador, ex.: junto do slot 0); `destroy` o acampamento de saqueadores (neutro do mapa) e as 2 torres de fronteira (tag `border-towers`, humanas, criadas com `spawnBuilding`, dono `enemy`); Drogath vivo.
  - *Secundário:* pesquisar **Lâminas de Guerra** na Forja de Guerra (`research` flag, +150 ouro); derrotar a patrulha de Aurelan (tag `patrol`); nenhum Lacaio da caravana perdido (+100 ouro).
  - *Oculto:* `Honra do Clã` — dar água ao cativo (Drogath a ≤ 3 de um camponês cativo; o camponês sussurra "a Capitã do Vento não perdoa"; +100 ouro, `reveal` da saída). Segundo oculto: **Machados Balanceados** (+100 ouro +50 madeira).
- **Gatilhos-chave:** `intro` (cutscene da Garganta); `toll` (o chefe dos saqueadores exige "metade das crianças"; Drogath recusa); `captives-seen` (diálogo moral: Drogath vê camponeses amarrados "como gado"; Skarn, em mensagem: "levem-nos à forja"); `patrol` aos 360 s (4 Espadachins + 3 Arqueiros humanos, as unidades que a Aliança já usa); `ulma-falls` (ao final do escolta: Ulma morre, Drogath segura o braseiro; Skarn: "Punho-de-Brasa").
- **Inimigos (normal):** acampamento neutro (guardas do mapa) + 4 Espadachins + 3 Arqueiros na patrulha; 2 torres de vigia humanas guarnecidas por 2 Arqueiros cada. Fácil/difícil como na m01.
- **Aliados:** a caravana (propriedade do jogador). **Herói:** Drogath.
- **Novidade:** **exige** a Forja de Guerra só se o jogador quiser o secundário; recompensa: Lâminas de Guerra, Machados Balanceados. (Torres inimigas: o Lanceiro-Machado e o Talhador as quebram; não há cerco ainda.)
- **Falas-chave:** Ulma — "O fogo é do clã, não do chefe."; Drogath — "Amarrados como gado... isto não é honra."; Skarn — "Levem-nos à forja. Mão que não luta, trabalha."

### 2.6 Missão 3 — A Isca de Alvorada (`horde-03-isca-de-alvorada`)
- **Cruzamento:** **mesmo evento da A3** pelo outro lado: o ataque frontal que a Aliança aguenta por 5 min é a isca.
- **Mapa / jogadores:** `estreito-1v1` (140; duas ilhas ligadas por **uma ponte de 6 de largura em z = 0**, poços de petróleo em (0, ±26), sem uso nesta missão). P0 "Coluna de Drogath" (local, `startSlot` 1, ilha leste (34,16)); P1 "Milícia de Alvorada" (humano, time 1, `isAI:false`, `startSlot` 0, ilha oeste (-34,-16)). Recursos 500/400/200 (m03 da Aliança). `setTier` 2.
- **Resumo (briefing, Skarn):** "As Lanças marcham pela frente; é o que sabem fazer. Quando a muralha olhar para elas, a sua coluna cruza a ponte." Hurgan não sabe que é a isca.
- **Objetivos:**
  - *Primário:* `destroy` tag `landing-towers` (3 Torres de Vigia humanas na cabeça da ponte oeste, `spawnBuilding`); depois `survive` 150 s com a cabeça de ponte (`hold-landing`, ativado ao concluir o anterior); Drogath vivo.
  - *Secundário:* erguer 2 Torres de Vigia (`orc_watchtower`) e 6 trechos de Paliçada de Ferro (`wall_orc`) na cabeça de ponte (+150 ouro/pedra); flag "4 Ogros" (+200 ouro); `destroy` a balista da muralha (tag `wall-ballista`).
  - *Oculto:* pesquisar **Placas de Ferro** (+150 ouro); `Honra do Clã` — **resgatar Hurgan**: depois do `hurgan` (cena), o chefe ferido fica caído perto da ponte (1 Talhador neutro, tag `hurgan`); Drogath chega a ≤ 3 dele em 120 s e ele passa ao jogador (`transfer`, +100 ouro e o rival vira devedor).
- **Gatilhos-chave:** `intro` (cutscene: a muralha de Alvorada e os estandartes das Lanças); `charge-1/2/3` aos 90/210/330 s: 6 Talhadores + 2 Lanceiros-Machado **do jogador** (`spawn` dono `player`, tag `lancas`, `order attackMove` ao fim oeste da ponte; **não** é o exército controlado do jogador: servem de isca; o jogador pode retargetar, sem prejuízo); `bridge-open` (quando os guardas da ponte caem abaixo de metade, diálogo: "É agora, Drogath!"); `counter-1/2` ao concluir `landing-towers`; `hurgan` (cena: Hurgan ferido, "Skarn sabia"). `reveal` da muralha para mostrar o assalto.
- **Inimigos (normal):** guarnição da ponte (`guard` r 10): 6 Espadachins + 4 Arqueiros + 2 Balistas; contra-ataque 1 (30 s após as torres caírem): 6 Espadachins + 3 Arqueiros + 2 **Cavaleiros** (quebram o plano do jogador que não prepara Ogros); contra-ataque 2 (+90 s): 4 Espadachins + 4 Arqueiros + 1 Balista. Fácil: sem Balistas e −30 %; difícil: +30 % e 1 Cavaleiro a mais.
- **Aliados:** as cargas das Lanças (sacrificadas). **Herói:** Drogath.
- **Novidade: EXIGE/RECOMPENSA:** **exige o Covil dos Ogros e o Ogro** (as Balistas e os Cavaleiros humanos quebram Talhadores; só o Ogro aguenta a ponte) e **recompensa Torre de Vigia + Paliçada** (o contra-ataque exige segurar a cabeça de ponte). Placas de Ferro recompensa.
- **Falas-chave:** Hurgan — "Vamos abrir a muralha por vocês, Punho-de-Brasa."; Drogath (em voz baixa) — "Ele os conta como lenha."; Skarn — "A isca cumpriu."

### 2.7 Missão 4 — Fome no Rio Turvo (`horde-04-fome-no-rio-turvo`)
- **Cruzamento:** **antes da A4**: a Horda toma o vau e isola o Forte Atalaia. O forte (castelo humano em (-47, 4), como na A4) **permanece de pé**: não é objetivo, e tem a mesma regra de não ser tocado (o forte tem 4 Arqueiros de guarnição fora do alcance do vau).
- **Mapa / jogadores:** `continental-1v1` (168; rio diagonal, 3 vaus em (-16,-16), (0,0), (16,16); acampamentos neutros (40,20) e (-40,-20)). P0 "Hoste do Vau" (local, `startSlot` 0, margem leste (32,-30)); P1 "Guarnição do Rio Turvo" (humano, `isAI:false`, `startSlot` 1). Recursos 400/500/200. `setTier` 2.
- **Resumo (briefing, Grok):** o Forte Atalaia depende de celeiros na margem oeste. "Ninguém precisa derrubar pedra se dá para derrubar a barriga." Grok traz as primeiras catapultas.
- **Objetivos:**
  - *Primário:* `destroy` tag `ford-guard` (2 Torres de Vigia humanas nas cabeças do vau central + a guarnição); `destroy` tag `depots` (3 Fazendas, 2 Casas e 1 Serraria humanas, `spawnBuilding` dono `enemy`, perto do forte, fora do alcance do castelo); Drogath vivo.
  - *Secundário:* flag "3 Catapultas" (+150 ouro/madeira); flag "2 Incendiários" (+100 ouro); pesquisar **Pedras Incendiárias** (`research`, +100 ouro); `destroy` tag `sortie` (a surtida do forte, abaixo).
  - *Oculto:* `Honra do Clã` — **poupar os refugiados** (6 camponeses neutros `owner: neutral`, tag `refugees`, vagando entre os celeiros; `var refugees_lost` por `dead` + objetivo `flag` ativado ao fim); +200 ouro. Se algum morrer, o diálogo final muda de tom ("a fome não escolhe").
- **Gatilhos-chave:** `intro` (cutscene: o vau, a ponte, o forte à distância); `grok` (diálogo do Mestre de Cerco); `depots-down` (ao concluir `starve-fort`, aviso "o forte vai passar fome"); `sortie` aos 600 s (surtida do forte); `finish` (a Aliança, no futuro, rompe o bloqueio — sem mostrar).
- **Inimigos (normal):** guarnição do vau (`guard` r 10): 6 Espadachins + 4 Arqueiros + 2 Balistas; surtida aos 600 s: 4 Cavaleiros + 6 Espadachins + 2 Balistas com `order attackMove` ao vau; 4 Arqueiros fixos no forte. Fácil: sem Balistas, surtida de 4 Espadachins + 2 Cavaleiros; difícil: +30 %.
- **Aliados:** nenhum. **Herói:** Drogath. **NPC:** Grok (diálogo; vira herói na m07).
- **Novidade: EXIGE/RECOMPENSA:** **exige a Catapulta** (a torre humana alcança 18 e a Balista 20, contra 13,5 do Lanceiro-Machado; só a Catapulta, alcance 20, iguala a Balista e supera a torre) e **o Incendiário** (os celeiros: explosão em área r 2,2; recompensa de ouro pelo secundário); **recompensa Pedras Incendiárias**.
- **Falas-chave:** Grok — "Pedra no muro dá trabalho. Fome é mais barata."; Vozgul (por mensagem, voz) — "Cuidado com o que o chefe chama de honra."; Drogath — "Ao menos os camponeses saem vivos."

### 2.8 Missão 5 — O Ferro da Coroa (`horde-05-ferro-da-coroa`)
- **Cruzamento:** **antes da A5**. A Forja Negra do salão está fundindo a coroa de ferro; a Expedição de Aurelan chega para queimá-la. Na A5 os humanos queimam um salão que já entregou a coroa.
- **Mapa / jogadores:** `bosques-2v2` (192, 44 bosques, 4 acampamentos neutros). P0 "Guarda da Forja" (local, `startSlot` 0); P1 "Clã da Forja Negra" (**aliado**, orc, time 0, `isAI:true`, normal, `startSlot` 2); P2 "Expedição de Aurelan" (humano, time 1, IA normal); P3 "Companhia dos Bosques" (humano, time 1, IA fácil). Recursos 300/250/100 (m05 da Aliança, mapa de economia). `setTier` 2.
- **Resumo (briefing, Zarruk):** a Forja Negra funde a coroa de Skarn em dez minutos. Aurelan marcha sobre o salão. Construa uma base, ponha a coroa a salvo e **não deixe o salão cair antes do fim da fundição**.
- **Objetivos:**
  - *Primário:* `survive` 600 s ("A Fundição da Coroa"); o salão da Forja Negra (tag `forge-hall`, `great_hall` do P1) não cai (`failWhen` `dead` do tag); Drogath vivo.
  - *Secundário:* pesquisar o **Ritual do Enfurecido** (`ranged_class`, +300 ouro); flag "4 Enfurecidos" (+200 madeira); **sobrevoar o acampamento da Expedição com um Balão de Guerra** (`area` com `unitType: war_balloon`; revela a rota do ataque e **desativa** a emboscada do gatilho `ambush`, +150 ouro); coletar 3000 de madeira (com **Ofício do Lenhador**).
  - *Oculto:* `Honra do Clã` — poupar o **emissário humano** (um Espadachim neutro, tag `envoy`, chega aos 6 min com bandeira branca e segue a uma `area` de saída; `escort`/`failWhen` se morrer; +200 ouro; ele conta que "o Marechal Dorian marcha do sul").
- **Gatilhos-chave:** `intro` (cutscene: o salão e a fornalha; Zarruk, Skarn de passagem); `vozgul` aos 300 s (chega com Vozgul, que olha a fornalha: "Esta coroa vai beber"); `ambush` aos 450 s (emboscada humana; desativada pelo Balão); `expedition-wave` a cada 150 s a partir dos 180 s; `crown-done` aos 600 s (cena: Skarn recebe a coroa); `leave` (Zarruk: "Podem queimar o salão. Eu já fiz o pior").
- **Inimigos (normal):** IA humana normal (Expedição) + IA fácil (Companhia) + ondas de roteiro da Expedição: 4 Espadachins + 3 Arqueiros (180 s), +2 Balistas (330 s), 4 **Cavaleiros** + 4 Espadachins (510 s). Dificuldade: a IA faz o resto; fácil: Companhia sem ataques; difícil: Expedição `hard`.
- **Aliados:** IA da Forja Negra. **Herói:** Drogath + **Vozgul** (a partir dos 300 s).
- **Novidade: EXIGE/RECOMPENSA:** o **Balão de Guerra** (reconhecimento) é exigido pelo secundário e recompensado com a rota; o **Enfurecido** (Ritual 800 de ouro) é recompensado; **Ofício do Lenhador** só faz sentido neste mapa de bosques. Vozgul apresenta a cura/aura (`hero_mend`) para sustentar o salão.
- **Falas-chave:** Zarruk — "Mais ferro. Sempre mais ferro."; Vozgul — "A brasa dentro dela não é lenha. É memória."; Drogath — "E o que acontece com quem a veste?"

### 2.9 Missão 6 — O Mar de Sal (`horde-06-mar-de-sal`)
- **Cruzamento:** **antes da A6**: os Marés Negras e o Sal Cinzento ganham o Arquipélago e dali cruzam para as Ilhas Gêmeas, onde a A6 os encontra.
- **Mapa / jogadores:** `arquipelago-naval-4p` (224). P0 "Frota do Cinzal" (local, `startSlot` 0, NE (46,46)); P1 "Clã das Marés Negras" (**aliado**, time 0, IA normal, `startSlot` 1); P2 "Armada de Brumar" (humano, time 1, IA normal, `startSlot` 3); P3 "Companhia Pesqueira" (humano, time 1, IA fácil, `startSlot` 2). Recursos 500/500/200. `setTier` 3.
- **Resumo (briefing, Orvanna):** a Armada de Brumar guarda o arquipélago. "Sem navio, o Cinzal não passa do cais." Erga a Doca do Clã, o Caldeirão e a Fornalha, ponha um Petroleiro na Plataforma e quebre a frota inimiga.
- **Objetivos:**
  - *Primário:* `build` Doca do Clã (`ship_dock`) e Plataforma de petróleo (`oil_platform`); `destroy` os Estaleiros do P2 (`buildingType: shipyard`, dono P2, todos); Drogath vivo.
  - *Secundário:* `destroy` 4 Fragatas (`unitType: frigate`); flag "1 Leviatã de Ferro" (`count iron_leviathan ≥ 1`, +200 petróleo); erguer a Fornalha Naval.
  - *Oculto:* afundar o **Submersível** humano (`destroy unitType: submersible`, +300 de ouro) — **invisível; só revelado pelo Balão de Guerra da m05**; desembarcar 3 Talhadores no cais de Brumar pela Barcaça (`area`+`unitType: grunt`, +250); `Honra do Clã`: poupar as vilas pesqueiras (6 casas humanas neutras, tag `fishers`, que Skarn manda queimar; +200 de ouro, ou diálogo de arrependimento).
- **Gatilhos-chave:** `intro` (cutscene: oceano, Orvanna, o poço de petróleo); `dock-up` (Orvanna envia 150 de petróleo, madeira e ouro — padrão da A6 com Brumar); `platform-up`; `fleet` aos 300 s e 480 s (frota humana: 3 Fragatas + 1 Couraçado + 1 Submersível, `order attackMove` à Doca do jogador); `burn-order` (Skarn: "Queimem as vilas"; Drogath hesita — **escolha de conduta**); `armada-gone`; `tide` (a ponte central liga as 4 ilhas por terra: IA inimiga pode atacar por terra também).
- **Inimigos (normal):** IA humana normal (Armada) + IA fácil (Companhia) + 2 ondas de roteiro. Fácil: sem Couraçado; difícil: Armada `hard` + Couraçado já aos 300 s.
- **Aliados:** Marés Negras (IA). **Herói:** Drogath, Vozgul (mensagens), sem Grok.
- **Novidade: EXIGE/RECOMPENSA:** **exige a Doca do Clã** (primário), o **Petroleiro** e a **Plataforma**, e a **Fornalha Naval** para o Leviatã; **recompensa o Leviatã** (bombardeio de longo alcance), a **Tartaruga Colossal** (invisível; só ataca navios), **Cascos de Ferro** e **Bocas de Fogo**, e a **Barcaça** (desembarque oculto). O Submersível humano é invisível para quem não tem detector: o **Balão de Guerra** (m05, `detector`) ou, mais tarde, o Olho Vigia o revelam.
- **Falas-chave:** Orvanna — "O mar é um poço que não seca."; Vozgul — "O chefe pediu fogo nas vilas. O fogo pergunta pouco."; Drogath — "A frota é nossa. As vilas, não."

### 2.10 Missão 7 — O Vale de Vidro (`horde-07-vale-de-vidro`)
- **Cruzamento:** **mesmo evento da A7**, visto de dentro. A Aliança vê um falso aliado trair aos 330 s; aqui o jogador vê o motivo.
- **Mapa / jogadores:** `vales-2v2` (176; slots nos 4 cantos). P0 "Vanguarda de Drogath" (local, `startSlot` 2); P1 "Clã Presa-Negra" (**aliado** de IA, time 0, normal, `startSlot` 1; chefe Brakka); P2 "Vigias do Vale de Aurelan" (humano, time 1, IA normal, `startSlot` 0); P3 "Clã das Lanças Quebradas" (orc, time 0 no início, IA fácil, `startSlot` 3; **vira inimigo** por `setTeam` para um time novo 2). Recursos 450/450/200. `setTier` 3.
- **Resumo (briefing, Vozgul):** Brakka assinou uma trégua com os humanos do vale para sobreviver, e Skarn lhe deu uma escolha: trair os humanos ou ver as famílias presas. Drogath chega com a vanguarda para cumprir o trato; Vozgul sabe de algo pior.
- **Objetivos (a missão tem duas fases):**
  - *Fase 1 — primário:* `destroy` tag `human-hall` (o Paço Real do P2 no vale, `castle`, marcado com `tag` no `setup`). Secundário: 2 Necromantes, **Ninho das Serpes** com 1 Serpe de Guerra, 2 Ogros Feiticeiros, e 1 **Olho Vigia** vivo (`count watching_eye ≥ 1`). Oculto: pesquisar **Lâminas de Guerra 2**.
  - *Fase 2 — viram primários ao concluir `human-hall`* (`addObjective`/`setObjective`): `escort` tag `families` (≥ 6 das 8 famílias de Brakka, 8 Lacaios `owner player`, anel `#c084fc`) até a saída do vale; Brakka vivo (tag `brakka`, `failWhen` `dead`); Drogath vivo. Oculto (de conduta): `oath-kept` — Brakka chega à saída vivo.
- **Gatilhos-chave:** `intro` (cutscene: o vale e as duas bandeiras); `signal` aos 330 s (o sinal que a Aliança vê: o Presa-Negra ataca os humanos: unidades de roteiro do P1 com `order attackMove` ao forte humano); `human-hall-down` → **ordem de Skarn** (cena: Grok traz a mensagem do chefe, "purguem o Presa-Negra", e a rasga; **Grok chega como herói com 4 Ogros e 2 Catapultas**); `purge` (`setTeam` do P3 para o time 2 + `spawn` da Guarda de Ferro de Skarn: 8 Talhadores + 4 Lanceiros + 3 Ogros + 2 Necromantes + 2 Serpes de Guerra, `order release` rumo ao salão do Presa-Negra); `iron-guard` +120 s (4 Ogros); `hall-falls` (o salão do Presa-Negra **cai**, consistente com a A7; a evacuação continua); `escape` (diálogo: "Vamos para o Planalto; ali há quem fique conosco").
- **Inimigos (normal):** Fase 1: IA humana normal (Vigias). Fase 2: a Guarda de Ferro acima (aéreos! Serpes só caem para atiradores, torres e magias). Fácil: Guarda sem Serpes; difícil: +30 % e Necromantes erguendo mortos (Erguer Mortos é da IA).
- **Aliados:** Presa-Negra (IA), Lanças (IA, até o `purge`). **Heróis:** Drogath, Vozgul, **Grok** (a partir do rompimento).
- **Novidade: EXIGE/RECOMPENSA:** **exige atiradores/Enfurecidos e magias** contra as Serpes de Guerra inimigas e **o Santuário das Cinzas** (Necromante com Toque da Morte e Erguer Mortos) e **o Altar das Tempestades** (Ogro Feiticeiro: **Olho Vigia**, **Sede de Batalha**); **recompensa** os 4 objetivos secundários.
- **Falas-chave:** Brakka — "Fiz o que o chefe mandou. Minhas crianças, Drogath. Eu só queria as crianças de volta."; Grok — "Ele quer o Presa-Negra em cinzas. Eu li, e rasguei."; Drogath — "Eu jurei pelo clã. O clã não é Skarn."

### 2.11 Missão 8 — A Última Brasa (`horde-08-ultima-brasa`)
- **Cruzamento:** **mesmo combate da A8**. A Aliança vê "Skarn cai na cinza"; aqui vemos quem o derruba.
- **Mapa / jogadores:** `planalto-ffa-4p` (208). P0 "Chama-Baixa" (local, `startSlot` 0, NE (43.8,43.8)); P1 "Clã das Lanças Quebradas" (orc, time 1, IA fácil, `startSlot` 1, NO, Ninho das Serpes em (-30,34) como na A8); P2 "Horda do Cinzal" (Skarn; orc, time 1, IA normal, `startSlot` 2, SO; Skarn em (-40,-40) como na A8); P3 "Exército de Aurelan" (humano, **time 2**, IA normal, `startSlot` 3, SE; a Guarda Real chega aos 420 s). Recursos 600/600/300. `setTier` 3. **Clãs Livres**: reforço por roteiro do jogador (Brakka, Orvanna, Zarruk e o que sobrou do Presa-Negra: 6 Talhadores + 4 Lanceiros + 3 Ogros + 2 Serpes) aos 180 s.
- **Resumo (briefing, Drogath):** "O chefe não ouve mais o povo; ouve a coroa. Se ele sobreviver à Guarda Real, a guerra dura outra geração; se a Guarda Real vencer sozinha, o povo vira cinza."
- **Objetivos:**
  - *Primário:* `destroy` tag `skarn`; Drogath vivo.
  - *Secundário:* `rescue` os **6 Anciãos** (6 Lacaios neutros, tag `elders`, cativos em (4, 56) como os magos da A8; ao libertá-los, **Hurgan muda de lado**: `setTeam` do P1 para o time 0); `destroy` o **Ninho das Serpes** das Lanças (+300 ouro); `destroy` o Santuário das Cinzas de Skarn (tag `pit`, impede novos mortos erguidos).
  - *Oculto:* `Honra do Clã` — poupar o **arauto** de Aurelan (Espadachim neutro, tag `herald`, que aparece com bandeira branca depois da morte de Skarn; 60 s sem matá-lo; +ouro; é o que abre a paz); derrotar o **Capitão Brann** (`destroy` tag `brann`).
- **Gatilhos-chave:** `intro` (cutscene em três cantos: Skarn entre fogueiras, o Ninho, a bandeira do clã); `free-clans` aos 180 s; `elders-freed` (Hurgan vira aliado); `horde-wave` a cada 150 s a partir dos 210 s (ondas de Skarn: 2 Ogros + 4 Talhadores + 2 Lanceiros + 1 Necromante + 1 Serpe, `attackMove` à base do jogador); `royal-guard` aos 420 s (a Guarda Real de Aurelan: **Brann, Oren, 2 Cavaleiros Grifos, 4 Espadachins, 2 Balistas, 4 Arqueiros**, `order attackMove` ao centro — **herói humano como inimigo**); `skarn-falls` (ao `dead` do tag `skarn`: cutscene curta, a coroa rola; **`setTeam` do P3 para o time 0** — a Guarda Real ergue a bandeira branca — e `victory` depois de 12 s); `herald`.
- **Inimigos (normal):** Skarn: `ogre` tag `skarn` (como na Aliança) com `guard` na área do salão e uma **Guarda de Ferro** (6 Ogros + 2 Necromantes + 2 Serpes) em volta; ondas acima; Lanças com Ninho e 2 Serpes; Guarda Real aos 420 s. Dificuldade: Skarn `hard` se o teste local mostrar que a IA normal fica fácil (comparar com a m08 da Aliança, onde os dois inimigos orcs eram normal e fácil).
- **Aliados:** Clãs Livres (reforço), Hurgan (se os Anciãos forem libertados). **Heróis:** Drogath, Vozgul, Grok.
- **Novidade: EXIGE/RECOMPENSA:** **exige** as magias de apoio (**Pressa**, **Armadura Profana**, **Nuvem de Cinzas**, **Redemoinho**, **Runas Explosivas**) contra três exércitos; recompensa o **Enfurecido avançado** (Arremesso Longo, Regeneração, Fúria) e os níveis 2 de cerco/naval (só Catapultas aqui; o naval fica sem uso — o Planalto não tem mar — mas o nível 2 é liberado por completude).
- **Falas-chave:** Skarn — "Quem não arde, alimenta."; Drogath — "Eu ardo por quem não arde."; Vozgul — "A coroa está quebrada. Deixe os mortos descansarem."; Rainha Sevelin (arauto) — "A paz vale mais que a vitória."

---

## 3. Progressão de `unlocks` (cumulativa, verificada)

### 3.1 Tabela

`Tier` = valor de `setTier` do Centro (Salão do Clã = 1, Bastião = 2, Cidadela de Ferro = 3). Ids são os de `src/data`. Fichas de pesquisa `id` = nível 1, `id@2` = nível 2.

| # | `units` | `buildings` | `research` | `heroes` | Tier |
|---|---|---|---|---|---|
| 1 | `peon`, `grunt`, `axethrower` | `orc_house`, `orc_lumber_mill`, `pig_farm`, `orc_barracks` | — | `hero_drogath` | 1 |
| 2 | — | `orc_forge` | `melee_weapons`, `ranged_ammo` | — | 1 |
| 3 | `ogre` | `ogre_den`, `orc_watchtower`, `wall_orc` | `melee_armor` | — | 2 |
| 4 | `catapult`, `arsonist` | `orc_workshop` | `siege_damage` | — | 2 |
| 5 | `war_balloon`, `berserker` | — | `woodcutting`, `ranged_class` | `hero_vozgul`† | 2 |
| 6 | `tanker`, `barge`, `war_galley`, `iron_leviathan`, `colossal_turtle` | `ship_dock`, `ash_cauldron`, `naval_forge`, `oil_platform` | `naval_cannons`, `naval_hulls` | — | 3 |
| 7 | `necromancer`, `war_serpent`, `ogre_mage` | `ash_sanctum`, `storm_altar`, `serpent_nest` | `cavalry_class`, `spell_death_touch`, `spell_raise_dead`, `spell_eye`, `spell_bloodlust`, `melee_weapons@2`, `melee_armor@2`, `ranged_ammo@2` | `hero_grok`† | 3 |
| 8 | — | — | `berserker_range`, `berserker_regen`, `berserker_fury`, `spell_haste`, `spell_unholy_armor`, `spell_ash_cloud`, `spell_whirlwind`, `spell_runes`, `siege_damage@2`, `naval_cannons@2`, `naval_hulls@2` | — | 3 |

† `hero_vozgul` e `hero_grok` **não existem** em `src/data/units.js` (§9, G1). Sem o passo 0 (§6), `heroes` fica só com `hero_drogath` e Vozgul/Grok viram unidades comuns nomeadas (Necromante e Ogro Feiticeiro) só em diálogo.

Totais: **16 unidades** (todas as orcs treináveis e as duas neutras, Petroleiro e Barcaça), **16 construções** (todas, exceto o Centro e o acampamento de bandidos), **27 fichas de pesquisa** (todas as orcs, com os dois níveis), **1 a 3 heróis**. `skeleton` (Erguer Mortos) e `watching_eye` (Olho Vigia) são invocações (`cost: null`) e **não entram** em `unlocks`; ficam cobertas pelas pesquisas `spell_raise_dead` e `spell_eye`.

### 3.2 Verificação feita (script descartável, fora do repositório)
Para cada missão o script marcou o que está liberado (união cumulativa) e o `setTier` e conferiu, **contra `src/data`**, que: (a) todo id existe e é orc ou neutro; (b) nenhum item se repete; (c) os `requires` de construções, unidades e pesquisas (construção, `{hq:N}`, `{research}`, `{role}`) são satisfeitos por itens liberados **antes ou junto**, com o nível do Centro daquela missão; (d) cada unidade tem uma construção liberada que a treine (ou é promoção); (e) toda pesquisa tem a construção de pesquisa (`forge`/`lumber`/`arcane`/`temple`/`foundry`) liberada. Resultado: **0 problemas**; contagens 16 / 16 / 27. Cadeias confirmadas:

- `orc_barracks` ← `pig_farm` (m1). `ogre_den` ← `orc_barracks` + Centro 2 (m3). `orc_workshop`, `ship_dock` ← `orc_barracks` + Centro 2 (m4, m6). `naval_forge`, `ash_cauldron` ← `ship_dock` + Centro 2 (m6). `iron_leviathan`, `colossal_turtle` ← Centro 3 + `naval_forge` (m6, ok). `ash_sanctum`, `serpent_nest` ← `orc_barracks` + Centro 3 (m7). `storm_altar` ← `ogre_den` + Centro 3 (m7).
- `siege_damage` nível 1 exige uma construção com `role: 'workshop'` (m4, ok); `ranged_class` exige Centro 2 (m5, ok); `cavalry_class` exige Centro 3 e o Altar (m7); as magias do Altar (`spell_eye`, `spell_bloodlust`, `spell_runes`) exigem `cavalry_class`; as do Santuário (`spell_*` de Necromante) não exigem nada além do Santuário. `spell_runes` fica na m8 (depois de `cavalry_class` na m7). `melee_*@2` e `ranged_ammo@2` exigem Centro 2 (ok em m7); `naval_*@2` exigem Centro 3.
- `ogre_mage` é promoção de `ogre` por `cavalry_class` (mecanismo `promote`); `berserker` é promoção de `axethrower` por `ranged_class` (como o `ranger` na Aliança, entra em `units` por ser treinável após a pesquisa).

### 3.3 O que cada missão EXIGE ou RECOMPENSA (resumo; detalhes nas fichas)
| # | Exige | Recompensa |
|---|---|---|
| 1 | Acampamento de Guerra (primário) | Lanceiros-Machado (+100 ouro); Drogath (Grito de Guerra) |
| 2 | — (Forja é opcional) | Lâminas de Guerra (+150), Machados Balanceados (+100 ouro, +50 madeira) |
| 3 | **Ogro** + Covil (a ponte tem Balistas e Cavaleiros); Torre e Paliçada (segurar a cabeça de ponte) | 4 Ogros (+200), torres/paliçada (+150 ouro/pedra), Placas de Ferro (+150) |
| 4 | **Catapulta** (alcance), **Incendiários** (celeiros) | 3 Catapultas (+150), 2 Incendiários (+100), Pedras Incendiárias (+100) |
| 5 | **Balão de Guerra** (reconhecimento) para o secundário; salão da Forja Negra de pé | Enfurecido (Ritual +300), Ofício do Lenhador (3000 de madeira) |
| 6 | **Doca do Clã**, Petroleiro, Plataforma, Fornalha Naval (Leviatã); Balão (m5) vê o Submersível inimigo | Leviatã (+200 petróleo), Barcaça (desembarque +250), Submersível afundado (+300) |
| 7 | Atiradores/Enfurecidos/magias contra as Serpes inimigas; Santuário e Altar | 2 Necromantes, Ninho + Serpe, 2 Ogros Feiticeiros, Olho Vigia, Lâminas 2 |
| 8 | Magias de apoio (Pressa, Armadura Profana, Nuvem de Cinzas, Redemoinho, Runas); tropas de todas as categorias | Anciãos (Hurgan vira aliado), Ninho (+300), Enfurecido avançado |

### 3.4 Lacunas e substitutos (resumo; lista completa no §9)
- **Cavalaria/lobos:** o orc **não tem** cavalaria montada nem lobos em `src/data`. **Substituto:** o **Ogro** (`ogre`) e o **Ogro Feiticeiro** (`ogre_mage`) cumprem o papel de cavalaria (GDD §5.1: "Cavalaria ✅ F4-01: Ogro → Ogro Feiticeiro"). Na cobertura por categoria do teste, `cavalaria` vira `['cavalier','ogre']` (a Aliança) e o orc usa `ogre`/`ogre_mage`.
- **Heróis:** só `hero_drogath`; ver G1 e o passo 0.
- **Torres melhoradas** (Torre de Lanças/Petardo do GDD) **não existem** (só `orc_watchtower`, como na Aliança); nada a fazer.

---

## 4. Convenções transversais

### 4.1 Drogath em todas as missões
- `spawn` de `hero_drogath` em `setup` na base do jogador (ao lado do Salão do Clã). Quando a missão começa em território avançado (m03, m04), no ponto de partida da coluna.
- **Derrota se Drogath cai:** `failWhen: { dead: { select: { unitType: 'hero_drogath' } } }` no objetivo primário "central" de cada missão. É uma escolha de design (o herói é a história). **Risco de dificuldade**: a IA tende a focar heróis; mitigação em ajuste local (PV 540, armadura 6; Grito de Guerra). Alternativa (pergunta §10): só falhar em algumas missões ou usar uma cena de retirada.
- Os heróis humanos da Aliança (Brann, Oren) só aparecem como **inimigos** na m08 da Horda.

### 4.2 Honra do Clã (objetivo oculto de conduta em cada missão)
Padrão técnico: `var` de conduta (`incVar` quando uma unidade protegida morre) + objetivo `flag` com `active: false`, ativado quando os primários terminam (`autoVictory: false` e gatilho `final` com `victory` atrasado alguns segundos, como na m08 da Aliança). Recompensa pequena (+100–200) e uma fala diferente no fim. **Não há ramificação**: o conduto é só recompensa e tom (o motor não guarda variáveis entre missões); o cânone é fixo.

### 4.3 IA e dificuldade (ordem de batalha por dificuldade)
- Campanha **linear** com a rampa: roteiro fácil (m01–m02) → roteiro normal (m03–m04) → IA aliada normal + IA inimiga normal/fácil (m05–m06) → IA normal com ondas de roteiro (m07) → três lados (m08). Nada acima de `normal` (o máximo da Aliança), exceto o ajuste local de Skarn.
- Cada ficha dá a ordem de batalha **normal** (valor do JSON). As variações "fácil"/"difícil" dadas são **referência de ajuste**; a campanha da Aliança também tem uma única dificuldade por missão. Seletor de dificuldade na campanha é decisão do dono (§10) e exigiria código fora desta spec.
- Unidades de roteiro usam `guard` (F5-06) para não perseguir além da área e `order release` para soltar o ataque; ondas por `every`/`time`; ataques por gatilho `dead`. Inimigos de IA não são restringidos pela `techRestriction` (só o jogador local é).

### 4.4 Carry-over, derrota e rejogo
`carryOver` igual ao da Aliança: `{"resources": {"gold": 0.25, "wood": 0.25, "stone": 0.25}, "max": 300}` nas missões 2 a 8. Heróis não passam entre missões (cada partida cria Drogath/Vozgul/Grok de novo, via `spawn`). "Nova tentativa", progresso por tentativa e `?campaign=unlock` funcionam sem mudança.

### 4.5 Textos
- Tudo em `{ "pt-BR": …, "en": … }` (o teste exige `en` em todo objeto com `pt-BR`); sem texto fixo em PT na UI.
- `portrait` emoji provisório (🔥 Skarn, 🗡️ Drogath, 💀 Vozgul, 🔨 Grok, 🛡️ Brakka, 👁️ Ulma, ⚓ Orvanna, ⚒️ Zarruk); a arte de retratos é outra tarefa.
- Cada missão traz uma **dica bilíngue** nos diálogos de novidade ("Dica: …"), como as da Aliança, citando o recurso novo.

---

## 5. Epílogo, tela final e arte

### 5.1 Epílogo (rascunho; `faction: 'orc'`, 4 parágrafos)

**Título:** pt-BR "A Chama Baixa" · en "The Low Flame"

| # | pt-BR | en |
|---|---|---|
| 1 | Quando a coroa de ferro rolou nas cinzas do Planalto, o silêncio foi maior que qualquer grito de guerra. Skarn prometera vales verdes aos clãs, mas só soubera lhes dar fogo; e o fogo que devora tudo termina devorando quem o acendeu. | When the iron crown rolled into the ashes of the Plateau, the silence was louder than any war cry. Skarn had promised green valleys to the clans, but he had only known how to give them fire; and a fire that devours everything ends up devouring the one who lit it. |
| 2 | Os humanos dirão que foram eles a derrubá-lo. Os clãs cantarão que foi o punho de Drogath. Os dois cantos estão certos pela metade, e é por isso que ainda se pode conversar. Quando a Rainha Sevelin estendeu a mão, Drogath não a tomou como quem se rende nem como quem vence: tomou-a como quem acende uma segunda fogueira ao lado da primeira. | The humans will say they brought him down. The clans will sing that it was Drogath's fist. Both songs are half right, and that is why people can still talk. When Queen Sevelin held out her hand, Drogath did not take it as one who yields nor as one who wins: he took it as one who lights a second fire beside the first. |
| 3 | Brakka levou o povo do Presa-Negra de volta ao Planalto, onde a paz dividiu a água. Grok ergueu muros onde antes havia só tendas. Vozgul guardou a memória dos mortos sem erguê-los e quebrou o último fragmento da coroa. As Marés Negras e o Sal Cinzento ficaram com os portos; a Forja Negra, com as ferramentas e o juramento de nunca mais forjar coroas. | Brakka led the Blackfang people back to the Plateau, where peace had shared out the water. Grok raised walls where there had only been tents. Vozgul kept the memory of the dead without raising them and broke the last shard of the crown. The Black Tide and the Grey Salt clans kept the harbors; the Black Forge kept its tools and an oath never to forge crowns again. |
| 4 | Dizem os velhos que a honra de um clã não está na terra que ele toma, mas no fogo que ele mantém aceso. Drogath recusou a coroa de chefe-de-brasa e aceitou o título que ninguém quis: guardião da chama baixa. E a chama baixa, que parecia a mais fraca, foi a única que atravessou o inverno. | The old ones say a clan's honor is not in the land it takes but in the fire it keeps lit. Drogath refused the ember-chief's crown and accepted the title no one wanted: keeper of the low flame. And the low flame, which seemed the weakest, was the only one that crossed the winter. |

**Créditos:** pt-BR "Fim do Caminho das Brasas" · en "End of the Ember Road".

Nota: os personagens citados sobreviveram na narrativa mesmo que o jogador os perca em partida (heróis não têm continuidade entre missões).

### 5.2 Tela final (sem código novo)
`campaignEndPlan` já devolve `campaignComplete`, `epilogue` e `factionId` quando a última missão (`horde-08-ultima-brasa`) termina; `CampaignVictory.js` usa `epilogue.faction: 'orc'` para a ilustração procedural **orc** (`campaignVictoryArt.js`) e a fanfarra `victoryFanfareOrc` (já existem). Nada a alterar na tela; só conferir no jogo (local) que a campanha da Horda abre a tela orc com o texto certo e o botão "Rejogar a campanha" reinicia a **campanha da Horda** (usa `run.campaignId`).

### 5.3 Pedido de arte: `public/ui/art/victory_orc.webp`
- **Arquivo:** `public/ui/art/victory_orc.webp`, **1920×1080**, WebP **≤ 500 kB** (detectado por `Image` onload/onerror; sem código). Conferir tamanho com `ls -l`.
- **Composição (low-poly estilizado, coerente com o jogo; paleta vermelho e ferro):** crepúsculo vermelho-brasa sobre o Planalto do Cinzal; no terço central-esquerdo, **Drogath** (talhador alto de cicatriz no punho) de costas parcial/perfil, erguendo um **braseiro pequeno e baixo** aceso; aos seus pés, a **coroa de ferro quebrada** meio enterrada na cinza; atrás, **estandartes dos clãs** (Chama-Baixa, Presa-Negra, Marés Negras, Forja Negra) cruzados de forma que não se reconheça nenhuma heráldica real; à direita, **por trás da cordilheira do Véu, uma faixa de vales verdes** iluminada por luz quente (esperança).
- **Faixa inferior escura:** os ~22 % inferiores (≥ 240 px) com degradê para quase preto (`#0b0b0e`) para o texto do epílogo e dos botões; **sem texto, logos nem marcas d'água**; regiões de interesse acima de y = 800.
- **Direitos:** composição original; sem caveiras/emblemas conhecidos da Blizzard; sem nomes na arte.
- **Executor:** Blender headless (Sonnet 5.5, liberado pelo dono) via `tools/safe-run.sh` + `tools/blender/<script>.py`, **local**. Se a imagem não vier, o SVG procedural continua valendo. **Pendente (local).**

---

## 6. Plano de execução (agentes de nuvem; um passo = um commit; branch `cloud/F8-06-<n>`)

Regras da nuvem (`docs/historico/HANDOFF_CLOUD.md` §2): sem GPU/navegador/Blender/`safe-run.sh`; verificação = `npm ci`, `npm test`, `npm run lint` (0 erros), `npx vite build --outDir /tmp/build-check`; commits terminam com `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; **não** editar `docs/TASKS.md` nem `CLAUDE.md`; não tocar `src/ai/**` nem `src/sim/**` (esta campanha **não precisa**: todas as ações usadas já existem — `spawn`, `spawnBuilding`, `setTier`, `setTeam`, `guard`, `order`, `transfer`, `research` como condição, `addObjective`/`setObjective`).

| Passo | Commit | Arquivos a criar/alterar | Aceite (nuvem) |
|---|---|---|---|
| **0** (recomendado; **pergunta §10-1**) | `F8-06.0 heróis orcs Vozgul e Grok` | `src/data/units.js` (`hero_vozgul`, `hero_grok`, `unique:true`, `isHero:true`, `cost:null`, `modelOf` do Necromante e do Ogro Feiticeiro, `scaleMul` 1,15–1,2), `src/data/abilities.js` (só `hero_*` com efeitos que **já existem**: `damage`, `heal`, `status`, `summon`), `src/i18n/{pt-BR,en}.json` (`unit.hero_*.name/desc`), `tests/unit/heroes.test.js`, README de campanhas (frase "nenhum herói existe ainda" desatualizada) | `npm test` verde; `HERO_TYPES` ganha 2; o testes de heróis/parity de nomes passam. Stats iniciais (a conferir): Vozgul PV 260, mana 255, mágico 34 alc. 10, abilities `[hero_death_touch, hero_mend]`; Grok PV 560, armadura 6, 36+12 normal, abilities `[hero_war_cry]` (sem novas magias se o dono preferir) |
| **1** | `F8-06.1 campaign.json da Horda (não registrado)` | `src/data/campaigns/horde/campaign.json` (premissa, subtítulo, `provisional:true`, `epilogue`, `heroes:[]`, 8 entradas com `requires`, `carryOver`, `unlocks` do §3); `tests/unit/campaignHordeData.test.js` (valida **sem** `hasMission`: `validateCampaign`, `unlocks` cobre 16/16/27, cadeia de requisitos como o script do §3.2, epílogue bilíngue 3–5 parágrafos, nomes proibidos) | `npm test` verde; **não** registrar ainda (`index.js` exige as missões) |
| **2** | `F8-06.2 mapas novos opcionais` (se aprovados) | `src/data/maps/terras-secas-1v1.json`, `src/data/maps/passo-do-veu-1v1.json`, `src/data/maps/index.js`, `src/i18n/*.json` (`map.<id>.name`), `tests/unit/maps*.test.js` se precisarem aceitar mapa `hidden` | `npm test` verde; **ou pular o passo** e usar os originais |
| **3** | `F8-06.3 missões m01–m02` | `src/data/campaigns/horde/m01-ultima-fogueira.json`, `m02-preco-da-passagem.json` | `validateMission` sem erros, bilíngue, terra firme (teste do passo 8 cobre) |
| **4** | `F8-06.4 missões m03–m04` | `m03-isca-de-alvorada.json`, `m04-fome-no-rio-turvo.json` | idem; ponte e vau conferidos |
| **5** | `F8-06.5 missões m05–m06` | `m05-ferro-da-coroa.json`, `m06-mar-de-sal.json` | idem; navios na água navegável, doca na costa, poços alcançáveis |
| **6** | `F8-06.6 missões m07–m08` | `m07-vale-de-vidro.json`, `m08-ultima-brasa.json` | idem; `setTeam` e `order release` testados |
| **7** | `F8-06.7 registro e integração` | `src/data/campaigns/index.js` (importa `horde` e as 8 missões, `for (const c of [alliance, horde])`); `src/ui/screens/CampaignScreen.js` (**seletor de campanha**: abas "Aliança · Horda" com `listCampaigns()`, mantém `this.campaignId`, estilo existente `ms-brief-*`); `src/i18n/{pt-BR,en}.json` (`menu.campaignHint` → "Aliança · Horda" / "Alliance · Horde", rótulo das abas); README `src/data/campaigns/README.md` (seção Horda); testes de UI se existirem para a tela | `npm test` verde; `listCampaigns()` devolve 2; `prepareCampaignMission('horde', …)` monta `MatchConfig` com `techRestriction` do jogador local e carry-over; progresso por `campaignId` não colide |
| **8** | `F8-06.8 testes da campanha` | `tests/unit/campaignHorde.test.js` (espelha `campaignAlliance.test.js`), `tests/unit/campaignHordePlaythrough.test.js` (espelha `campaignPlaythrough.test.js`) | ver §7; `npm test` verde, sem estourar o tempo (timeouts 120–300 s só nas missões navais/m08, como na Aliança) |
| **9** | `F8-06.9 tela final e docs` | `src/data/campaigns/README.md`, `docs/specs/F8-06-campanha-horda.md` (status), `docs/specs/README.md`; verificação de que a tela final da campanha da Horda usa a ilustração orc (modelo puro em `campaignVictoryModel`, já coberto por `campaignVictory.test.js`: adicionar um caso `horde`) | `npm test`, lint, build verdes |
| **L** (local, não nuvem) | arte e balanceamento | `public/ui/art/victory_orc.webp`; ajuste de dificuldade; revisão de diálogos | §8 |

Ordem recomendada: **0 → 1 → (2) → 3 → 4 → 5 → 6 → 7 → 8 → 9**. Os passos 3–6 podem rodar em paralelo (máx. 3 agentes; cada um em arquivos próprios); o 7 só depois dos quatro. O teste de campanha do passo 8 pode ser **escrito junto de cada passo 3–6** (um arquivo por missão) se o agente preferir; o essencial é que o commit final traga tudo verde.

### 6.1 Como escrever cada missão (instrução ao agente)
1. Copie a **estrutura** da missão análoga da Aliança (m01→m01, m02→m02, m03→m03, m04→m04, m05→m05, m06→m06, m07→m07, m08→m08): `players`, `startingResources`, `vars`, `setup`, `objectives`, `triggers` (`intro`, relógios, ondas, `final`), cutscene de abertura e diálogos.
2. Ajuste o jogador para `factionId: 'orc'` e trate a Aliança como o **lado inimigo** (humanos como inimigos de roteiro ou de IA).
3. `setup`: `setTier`, `spawn` de Drogath (e demais heróis na hora marcada), `spawnBuilding` (torres, celeiros, forte, Ninho), `tag` dos alvos.
4. Toda tag citada precisa ser criada (o validador confere). Coordenadas: **dos mapas atuais** (slots, jazidas, acampamentos neutros, vaus); depois do rascunho, o teste de terra/água acusa o que cair em água.
5. Cada missão traz **dica bilíngue** em um diálogo e cutscene de abertura de 10–15 s.

---

## 7. Testes (nuvem; Vitest, nada de navegador)

**`tests/unit/campaignHorde.test.js`** (espelho de `campaignAlliance.test.js`):
1. **Dados:** `horde` registrada e válida (`validateCampaign` com `hasMission`), 8 missões, todas escondidas do menu "Missões", `factionId: 'orc'`; premissa e epílogo bilíngues; subtítulo "provisória".
2. **Bilíngue e nomes:** todo objeto com `pt-BR` tem `en`; regex de nomes proibidos da Aliança **ampliada** (`thrall|orgrim|durotan|uther|arthas|jaina|lothar|khadgar|gul'?dan|blackhand|grom|medivh|turalyon|azeroth|stormwind|warcraft|blizzard` + `doomhammer|hellscream|draenor|kilrogg|frostwolf|warsong|stormreaver|bleeding\s*hollow|dark\s*portal`). Fixture: `unlocks` ignorado.
3. **Terreno:** spawns, áreas, ordens, `spawnBuilding` em terra firme dentro da área jogável; navios na água navegável; doca na costa; poços alcançáveis pelo mar da doca do jogador (padrão `navalWorld`/`oilHelpers`).
4. **Liberação progressiva (espelho do bloco F8-05b):** a campanha libera **todas** as unidades orcs/neutras treináveis, construções e pesquisas (com seus dois níveis) e os heróis; cada missão libera algo novo; **requisitos alcançáveis** (script do §3.2 vira teste); nada entregue antes de liberado (spawns do jogador, construções e pesquisas de objetivos usam só o disponível na missão); cada missão **usa** suas novidades (objetivo, recompensa, herói ou inimigo) e traz uma "Dica" bilíngue; nomes de cada novidade em pt-BR e en (`unit.*`, `building.*`, `research.<id>.orc`).
5. **Heróis únicos:** Drogath em 1–8, Vozgul em 5–8 e Grok em 7–8 (se existirem); sempre depois de liberado; nunca duas ações do mesmo herói na mesma missão.
6. **Inimigos por tema** (como o teste de temas da Aliança): m01 Talhadores/Lanceiros; m02 Espadachins/Arqueiros humanos; m03 Cavaleiros e Balistas; m04 Balistas/Cavaleiros/castelo; m05 Cavaleiros/Balistas; m06 Fragata/Couraçado/Submersível; m07 Necromante, Serpe, Ogro; m08 Brann/Oren/Grifo + Skarn.
7. **Cobertura por categoria** (como `CAT`): `infantaria` (`peon,grunt,axethrower,berserker` + `villager,knight,archer,ranger`), `cavalaria` (`ogre,ogre_mage,cavalier`), `cerco` (`catapult,ballista`), `conjurador` (`necromancer,ogre_mage,mage,templar`), `sapador` (`arsonist,sapper`), `aerea` (`war_balloon,war_serpent,glider,gryphon_rider`), `naval` (`tanker,barge,war_galley,iron_leviathan,colossal_turtle,frigate,dreadnought,submersible`), `heroi` (`hero_drogath,hero_vozgul,hero_grok,hero_brann,hero_oren`): **o jogador usa pelo menos uma unidade de cada categoria orc** nas 8 missões; o inimigo traz as suas; todo tipo usado pertence a uma categoria (exceto `bandit`, `sheep`, `skeleton`, `watching_eye`).
8. **Campanha geral:** só a m01 começa disponível; `requires` linear; carry-over; progresso por tentativa gravado sob o id `horde` sem tocar o da Aliança.

**`tests/unit/campaignHordePlaythrough.test.js`** (espelho de `campaignPlaythrough.test.js`, `boot('horde', id)` com `unlockAll: true`; **não** generalizar o arquivo da Aliança para evitar conflitos):
- Uma simulação headless por missão do tick 0 à **vitória** (com teletransporte, dano e construção direta injetados), mais as **derrotas** previstas: m02 (perder 2 Lacaios da caravana), m03 (Drogath morre), m05 (cai o salão da Forja Negra), m07 (cai Brakka ou a evacuação falha), m08 (Drogath morre).
- **Roteiro de novidades** por missão (treina/pesquisa/ergue o que a missão libera): Acampamento + Lanceiros (m01); Forja + Lâminas (m02); Covil + Ogro + Torre + Paliçada + Placas (m03); Oficina + Catapulta + Incendiário (m04); Balão + Enfurecido (m05); Doca + Petroleiro + Plataforma + Fornalha + Leviatã/Tartaruga/Barcaça (m06); Santuário + Altar + Ninho + Necromante + Serpe + Ogro Feiticeiro + Olho Vigia (m07); magias (m08).
- **Cenas especiais:** m03 as cargas das Lanças e a cabeça de ponte; m07 o sinal aos 330 s, a ordem de Skarn, o `setTeam` do P3 e a evacuação; m08 Skarn morto → `setTeam` de Aurelan e vitória; Hurgan muda de lado ao libertar os Anciãos.
- **Determinismo:** mesmo roteiro ⇒ mesmos checksums (m07 e m08), como a Aliança.
- Usa os mesmos helpers (`tests/unit/helpers/missionWorld.js`, `navalWorld.js`, `oilHelpers.js`); os tempos das missões navais/m08 (240–300 s de timeout) vêm do padrão da Aliança.

Verificação da nuvem (somente): `npm ci`, `npm test`, `npm run lint`, `npx vite build --outDir /tmp/build-check`.

---

## 8. Riscos e o que só se verifica no jogo (pendente — local)

### 8.1 Riscos técnicos
- **Coordenadas em mapas ampliados:** os mapas cresceram 15–25 % e as florestas foram adensadas (`src/data/maps/README.md`). Usar slots, jazidas, acampamentos e vaus **atuais** e deixar o teste de terra/água acusar o resto; se uma missão citar ponto novo, acrescentar à fixture `tests/fixtures/missionTerrainClasses.json` (compara o terreno original) quando fizer sentido.
- **Pathfinder naval:** `arquipelago-naval-4p` (224) é o maior mapa e só agora ganha missão: a grade naval **acaba na área jogável**; garantir que a Doca fica numa costa ligada ao poço escolhido e à frota inimiga (usar `navalWorld.js`/`oilHelpers.js`). Na `estreito-1v1` (m03) o mar não é usado, só a ponte de 6 de largura (gargalo!).
- **Primeira campanha com jogador orc:** HUD de construções/treino do orc em missão (restrições `techRestriction` com ids orc), nomes de pesquisa `research.<id>.orc`, cartões e dicas "Disponível na missão N". Cobertos por teste, mas a leitura na tela é local.
- **Quatro jogadores + roteiro:** m05–m08 têm 3–4 jogadores com IA; o custo de teste/playthrough é alto (timeouts de 120–300 s como na Aliança; intermitência NEW-41: rodar a suíte completa 3 vezes). Evitar `eliminate` quando houver `setTeam` (os donos hostis mudam): usar `destroy` com tags.
- **`setTeam` para um time novo (m07, `purge`):** testar que um jogador de IA com `team: 2` ataca todos e que o objetivo/`victory` não conta o P3 como aliado depois da virada.
- **Heróis como defeito de derrota:** Drogath morto = derrota pode ser frustrante; ver §10.
- **Vozgul/Grok sem dados:** sem o passo 0, trocar por unidades comuns nomeadas em diálogo.
- **Tempo da suíte:** as 8 simulações novas somam ~2–3 min; manter cada uma < 60 s exceto naval/m08.

### 8.2 Só se verifica no jogo (local; relatório com "Verificação pendente")
1. **Equilíbrio** de cada missão (ondas, tempos, recompensas, Drogath como condição de derrota), principalmente m03 (ponte), m06 (frota) e m08 (três lados); duração real vs. alvo.
2. **Leitura dos diálogos** e das cutscenes (tempo de tela, enquadramento de câmera, quebra de linha em pt-BR e en) e do tom dos dilemas.
3. **Seletor de campanhas** e o fluxo menu → briefing → missão → tela final → "Rejogar" na **Horda**.
4. **Tela final orc** com texto do epílogo (4 parágrafos), fanfarra e, quando existir, `victory_orc.webp`.
5. **Mapas clonados** (visual árido/invernal) e `arquipelago-naval-4p` em desempenho (FPS) e em IA naval.
6. **Heróis orcs novos** (se o passo 0 for feito): modelos escalados, barra de vida, habilidades na HUD.
7. **Áudio/música** das missões (música ambiente procedural; nenhum arquivo novo).

---

## 9. Lacunas encontradas (e substitutos)

| # | Lacuna | Evidência | Substituto / ação |
|---|---|---|---|
| G1 | **Só 1 herói orc.** `heroes.js` deriva de `units.js`; só `hero_drogath` (orc), `hero_brann`, `hero_oren` existem. Vozgul e Grok são do design (`08_GAME_DESIGN.md` §5.3, `F4-08`) mas nunca foram implementados. | `src/data/units.js` | **Passo 0** (dados reaproveitando modelos e efeitos existentes) **ou** Vozgul/Grok como Necromante/Ogro Feiticeiro comuns nomeados em diálogo (sem mudança de código). Pergunta §10-1. |
| G2 | **Sem cavalaria/lobos orc.** | `UNITS` orc: sem unidade montada | O **Ogro** e o **Ogro Feiticeiro** (GDD: "Cavalaria ✅ F4-01"). |
| G3 | **Sem torres melhoradas** (Torre de Lanças/Petardo) nem Canteiro orc. | `BUILDINGS` orc | Só `orc_watchtower`; nada a fazer. |
| G4 | `skeleton` e `watching_eye` não são treináveis (invocações). | `cost:null` | Cobertos por `spell_raise_dead` e `spell_eye`; ficam na whitelist do teste de categorias. |
| G5 | `CampaignScreen` mostra **só** `listCampaigns()[0]`; `menu.campaignHint` fixo em "Aliança". | `CampaignScreen.js` L47, `i18n` | Passo 7 (seletor + hint). |
| G6 | Os testes da Aliança têm o id `'alliance'` fixo. | `campaignPlaythrough.test.js` `boot()` | Arquivos de teste novos para a Horda (passo 8). |
| G7 | `README` de campanhas diz que "nenhum herói existe ainda" (F4-08 já feita). | `src/data/campaigns/README.md` | Corrigir no passo 0 ou 9. |
| G8 | **Sem condição "usar magia"** nos gatilhos. Não dá para criar objetivo "lançar Olho Vigia". | `missions/README.md` (condições) | Objetivo por **contagem** (`count unitType: watching_eye ≥ 1`) e por pesquisa (`research`). |
| G9 | **Sem estado entre missões** (só recursos): a escolha moral não ramifica. | `carryOver` | O cânone é fixo; a conduta é só recompensa e tom (§4.2). |
| G10 | O boss final é um `ogre` comum (igual à Aliança). | `m08` da Aliança | Cercar Skarn de Guarda de Ferro (§2.11). Pergunta §10 sobre um `hero_skarn` próprio. |
| G11 | Mapas gerados novos reprovariam a meta de madeira (medido: ~1800–2500 de 8000). | `tools/lib/woodStats.mjs` | Clonar mapas existentes (§2.3). |
| G12 | **Nota de coerência da Aliança:** o epílogo cita "Brumar" entre os clãs vencidos (Brumar é guarnição humana). | `alliance/campaign.json` | Só aviso; pergunta §10. |

---

## 10. Perguntas em aberto para o dono (decisões que esta spec **não** toma sozinha)

1. **Heróis Vozgul e Grok:** criar `hero_vozgul` e `hero_grok` (passo 0, ~1 commit de dados, reaproveitando modelos e efeitos existentes) ou usar Necromante/Ogro Feiticeiro comuns só com nome no diálogo?
2. **Cânone das duas campanhas:** vale o princípio "mesma guerra, frentes e datas diferentes, convergindo nas m07–m08" (recomendado), ou o dono prefere **crônicas rivais** em que cada lado vence tudo (como no clássico), aceitando que as campanhas se contradigam?
3. **Desfecho:** Drogath mata Skarn e fecha a **paz** com Aurelan (recomendado), ou a Horda deve terminar **conquistando** (vitória total) ou com um final trágico (Drogath morre/exila-se)? Isso muda o epílogo e a m08.
4. **Escopo:** 8 missões (recomendado, igual à Aliança) ou 9–10 (por exemplo, uma missão extra de **êxodo** antes da m01, ou um interlúdio de **vingança** entre m06 e m07)?
5. **Drogath = derrota se morrer** em todas as missões, só em algumas, ou "retirada" (ele recua e a missão segue com penalidade)?
6. **Mapas novos** (`terras-secas-1v1`, `passo-do-veu-1v1`, clones de dados, §2.3): sim ou não? E o uso do `arquipelago-naval-4p` (224, o maior mapa) na m06, aceitando o custo de teste/IA naval?
7. **Tom e classificação:** cativos humanos amarrados, fome como arma, mortos erguidos por Skarn e a "purga" do Presa-Negra. Pode esse nível de dureza? (A spec evita violência explícita; o que aparece é implícito/diálogo.)
8. **Seletor de dificuldade** na campanha (fácil/normal/difícil escalando as ondas): fica fora de escopo (única dificuldade por missão, como a Aliança) ou vira uma tarefa de código separada?
9. **Brakka:** gênero (masculino aqui) e destino do **salão** do Presa-Negra (cai, como a A7 mostra, com o povo evacuado) estão aprovados? E a nota de Brumar no epílogo da Aliança (G12) é erro de texto?
10. **Nomes:** manter "Clãs do Cinzal" (campanha aprovada) e aposentar "Clãs de Gorthak" do GDD, ou usar Gorthak como nome antigo do povo (proposta do §1.8)? Os personagens novos (Ulma, Zarruk, Orvanna, Hurgan, Brakka, Vozgul, Grok, Skarn, Drogath) e os clãs (Chama-Baixa, Lanças Quebradas, Presa-Negra, Forja Negra, Marés Negras, Sal Cinzento) estão aprovados?
11. **Skarn como chefe real:** criar um `hero_skarn` (unidade única inimiga mais forte, com modelo próprio e escala) para a m08 da Horda (e, retroativamente, da Aliança), ou manter o `ogre` comum cercado de Guarda de Ferro?
12. **Arte de vitória:** gerar `victory_orc.webp` no Blender (local, Sonnet 5.5, prioridade?) ou manter só o SVG procedural da tela final por enquanto? E `victory_human.webp` entra junto?

---

## Docs
- Atualizar (passos 7 e 9): `src/data/campaigns/README.md` (seção "Campanha da Horda": premissa, tabela de missões, tabela de `unlocks`, nome dos mapas, observação de que a premissa é provisória), `docs/specs/README.md` (status), e **não** `docs/TASKS.md`/`CLAUDE.md` (o coordenador faz ao mesclar).
- Relatório do PR de cada passo: ≤ 25 linhas, com **Verificação pendente (local)** (§8.2).

## Entrega (briefing)
Este documento é o entregável da tarefa F8-06 (fase de briefing). Branch `cloud/F8-06-briefing`. Nenhum código nem JSON de missão foi alterado.
