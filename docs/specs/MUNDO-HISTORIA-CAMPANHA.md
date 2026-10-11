# MUNDO-HISTORIA-CAMPANHA · O novo mundo, a história e as campanhas (12 missões por facção)

> **Status: SPEC (proposta; não iniciada)**. Escrita em 2026-10-11 por Sonnet 5.5. **Só documento: nenhum código, nenhum JSON de missão.** Fonte: [`MUNDO-BRIEFING-DONO.md`](MUNDO-BRIEFING-DONO.md) (em caso de dúvida, vale o briefing). Arquivo irmão (escrito em paralelo por outro agente): `MUNDO-TERRENO-MAPAS.md` (mapas, terreno, ilhas como geografia jogável). Os pontos marcados como **proposta** ou **decisão do dono** estão em §10.
> Leia antes: `CLAUDE.md`, `docs/HANDOFF_CLOUD.md` (§2, regras da nuvem), `docs/specs/_COMUM.md`, `src/data/campaigns/README.md`, `docs/specs/F8-06-campanha-horda.md` (PR #48, não mesclado), `src/data/missions/README.md`, `docs/05_PARIDADE_WARCRAFT2.md` (nada de nomes ou lore da Blizzard).
> Executores: agentes **sonnet** na nuvem (sem navegador/GPU), em lotes (§8). Arte, música, modelos 3D e tudo que exige jogar ficam **pendentes (local)**.
> Imagens de referência (em `docs/refs/mundo/`): `mapa-mundi-referencia.png` (pergaminho, contorno irregular, rosa dos ventos, selo de cera), `terreno-humano-exuberante.webp`, `terreno-orc-deserto.webp`.

---

## 0. Resumo para o dono (leitura de 1 minuto)

- **Mundo**: o planeta **Ondara**. Dois continentes isolados por milhões de anos pela **Fenda** (hoje o **Mar Fendido**): **Velmara** (montanhas nevadas, florestas, savanas; exuberante; casa dos **humanos**, o Reino de Aurelan e a **Aliança**) e **Cinzara** (desertos, pântanos, estepes; casa dos **orcs**, os Clãs do Cinzal e a **Horda**). Entre eles, **Os Estilhaços**: oito ilhas de terrenos diferentes (pedregosa, vulcânica, pantanosa, gelada, deserta, florestal, recifes de petróleo e o ponto de encontro).
- **Interpretação adotada do briefing** (a confirmar, §10-1): o texto diz que um continente tem "desertos, pântanos e estepes" e o outro "montanhas nevadas, florestas e savanas, onde se desenvolveram os humanos"; por exclusão, desertos/pântanos/estepes = orcs. Isso coincide com as imagens (humano = exuberante, orc = desértico) e com a lore já aprovada (os Clãs do Cinzal vêm de terras áridas). Alternativa: trocar os dois continentes.
- **Estrutura**: **duas campanhas espelhadas** (`alliance` e `horde`, 12 missões cada) sobre **os mesmos 12 "palcos"** (oito ilhas compartilhadas, vistas de lados opostos; quatro palcos continentais diferentes por facção). Cada campanha vence "em seu relato" (Crônicas espelhadas, §3.1); o gancho para uma campanha futura fica em aberto.
- **Liberação**: tutorial **acelerado**. Tudo (16 unidades, 16 construções, 27 fichas de pesquisa por facção) fica liberado **ao fim da missão 5 (41,7 %, a meta de ~40 %)**; a missão 6 é a primeira jogada com a árvore completa ("Prova de Fogo") e libera só um personagem; 7–12 sem restrição. **Um personagem novo por missão** nas missões 1–6; **missões 10, 11 e 12 liberam os três heróis da história**.
- **Final**: a missão 12 é construir e defender uma **fortaleza** (o Centro evoluído ao nível 3 + torres + muralhas) no continente do adversário e **bloquear as rotas para as ilhas**. O chefe cai; um **sinal no horizonte** abre a continuação (expulsão ou conquista).
- **Dados que faltam**: só existem 3 heróis (Brann, Oren, Drogath). Propomos **15 tipos novos** (7 humanos, 8 orcs) só em `src/data/units.js` (§5). Javalis no lugar de porcos: troca **visual e de textos** (ids internos ficam), §1.4.
- **Migração**: as 8 missões da Aliança são **reaproveitadas** (5 viram base de novas, 3 são reescritas); o briefing F8-06 vira fonte de elenco/clãs/tom, mas **não** do arco (§7). 10 passos de execução (§8). **Perguntas em aberto: §10** (as 5 primeiras mudam o escopo).

---

## 1. Mundo e lore (100 % original)

### 1.1 O planeta e a Fenda
**Ondara** é um mundo de um único oceano. Há milhões de anos havia **uma só terra**; a **Fenda** abriu um rio de mar no meio dela e os dois lados derivaram. O que ficou entre eles foram **Os Estilhaços**, cacos da ponte de terra que se desfez, cada um com o clima e o solo do pedaço de mundo de onde saiu. Os dois povos guardam a lembrança da Fenda em **murais de pedra** (um em cada continente, mesma cena vista de lados opostos; o objetivo oculto da missão 1 de cada campanha é encontrá-lo).
Convenção de datas: **AN** = "Anos da Navegação", contados desde a primeira vela que cruzou o mar (ano 0). Antes disso, "Era do Isolamento".

### 1.2 Os continentes
| | **Velmara** (continente dos humanos) | **Cinzara** (continente dos orcs) |
|---|---|---|
| Posição no mapa-múndi | oeste/noroeste (o maior, contorno de fiordes e baías) | leste/sudeste (contorno de penínsulas e golfos rasos) |
| Regiões | **Cordilheira Alva** (picos nevados; as Montanhas do Véu da lore antiga são a vertente sul), **Floresta de Orvalho** (mata densa), **Savana de Âmbar** (capim alto, savanas e rios), **Planície de Aurelan** (campos, vales e o rio Turvo) | **Planalto do Cinzal** (altiplano árido, poços raros), **Dunas Ruivas** (mar de dunas), **Brejo Negro** (pântanos com vitórias-régias), **Estepe do Vento** (campo seco, capim amarelo) |
| Cabos e portos | **Baía de Aurelan** (porto da capital), **Cabo Aurora** (ponta leste, farol), Estreito de Alvorada (passagem para a Planície) | **Praia das Cinzas Vermelhas** (porto dos clãs), **Cabo Ferrugem** (ponta oeste, falésias de ferro), **Garganta de Ulm** (desfiladeiro seco) |
| Clima/visual | verde, litoral turquesa, areia clara, costa **irregular** (referência `terreno-humano-exuberante.webp`) | areia e capim seco, rochas, pântano nas margens, trilhas de terra (referência `terreno-orc-deserto.webp`) |
| Recursos | madeira abundante, ouro nas montanhas, pedra | ouro nos afloramentos, **ferro**, pouca madeira, água escassa |
| Fauna | **ovelhas** (rebanhos nos campos), cavalos, **grifos** (ninhos nos picos, origem do Cavaleiro Grifo), cervos | **javalis** (rebanhos semi-selvagens do brejo e da estepe), lagartos de duna, **serpes** (serpes-de-cinza, origem da Serpe de Guerra), vultures |
| Flora | pinheiros, carvalhos, pradarias, flores alpinas | capim seco, arbustos espinhosos, juncos e vitórias-régias, árvores esparsas |

**Atribuição (decisão a confirmar)**: ver §0 e §10-1. Os nomes `Aurelan`, `Cinzal`, `Brumar`, `Alvorada` e o rio `Turvo` já existem no jogo; os mantemos para reaproveitar texto e missões.

### 1.3 Os povos
**Aliança de Aurelan (humanos)**. O Reino de Aurelan (capital na Baía de Aurelan, Rainha **Sevelin**) é o mais antigo dos reinos de Velmara e liderou a **Aliança**: uma liga de reino e cidades-porto (entre elas **Brumar**, o porto-fortaleza do sul). Cultura de mercadores, cartógrafos e cavaleiros; a Academia de Cartografia Arcana (Mestre **Orsolo**) desenha o primeiro mapa do mar. Tecnologia: pedra, ferro, madeira naval, grifos domesticados, magia de torres.
**Horda do Cinzal (orcs)**. Os **Clãs do Cinzal** (Chama-Baixa, Lanças Quebradas, Presa-Negra, Forja Negra, Marés Negras, Sal Cinzento: nomes de F8-06) vivem em Cinzara e dividem poços e rebanhos. Cultura de **fogo, memória e clã**: cada clã guarda um braseiro (o **Fogo do Clã**). Tecnologia: ferro de forja, óleo, serpes, ritos de cinza. Quando a seca aperta, o chefe-de-brasa **Skarn** une os clãs numa **Horda**: o contrário da leitura simplista "orc = vilão": a Horda é um povo que **precisa** do mar.
O nome do povo orc antigo, "Gorthak" (do GDD), é aposentado ou vira nome de uma região (pergunta §10-3).

### 1.4 Fauna: ovelhas e javalis (impacto nos dados e na interface)
Cada continente tem uma fauna própria: **ovelhas** em Velmara (já existe), **javalis** em Cinzara (substituem os porcos). **Proposta em duas fases**:
1. **Fase visual e de texto (recomendada, risco zero para a sim)**: ids internos **ficam** (`pig_farm`, espécie `'pig'`, `PigFarm`, `pig_farm.glb`, mapas com `"species": "pig"`), mudam só nomes e aparência.
   - `src/i18n/pt-BR.json`: `building.pig_farm.name` "Chiqueiro" → **"Cercado de Javalis"**; `building.pig_farm.desc` (continua "Alimento e +5 de capacidade populacional"); `editor.species.pig` "Porcos" → **"Javalis"**. `src/i18n/en.json`: "Pig Pen" → **"Boar Pen"**; "Pigs" → **"Boars"**.
   - `src/data/buildings.js` (`pig_farm`): `name` e `icon` `/icoPorco.svg` → **`/icoJavali.svg`** (arte nova: ícone local, SVG simples, regra de ícones do `public/`).
   - `src/sim/Critter.js:35` (`'Porco'` → `'Javali'`); `src/models/units/CritterModel.js` (a espécie `pig`: corpo mais escuro e cerdoso, crista dorsal e **presas**; materiais `critterPink`/`critterPinkDark` → `critterBoar`/`critterBoarDark` em `src/models/materials.js`); `PigFarm.js` cria os animais com o mesmo `CritterModel`, então os javalis aparecem sozinhos no cercado.
   - `src/core/AssetPreloader.js:54` (rótulo "Chiqueiro & Fazenda de Porcos" → "Cercado & Fazenda"); docs (`02_MECANICAS` critters, `03_ASSETS_E_INSPETOR` pig_farm, `08_GAME_DESIGN`). `05_PARIDADE_WARCRAFT2.md` mantém "Pig Farm" (é a referência de paridade).
2. **Fase de nomes internos (opcional, depois)**: adicionar `'boar'` a `CRITTER_SPECIES` (`src/sim/MatchConfig.js:191`) com `'pig'` como alias legado, migrar os 7 mapas e `generator.js` por script, e só então renomear ids. Só vale se o dono quiser; exige reconferir `determinism.test.js` e salvamentos.
**Impacto de jogabilidade: nenhum** (mesmo custo, mesmo +5 de população). Impacto em mapas: a spec de mapas distribui espécies por **bioma** (javalis em Cinzara/Brejo Mudo, ovelhas em Velmara/Cerne Verde, ambas no Pouso do Encontro). A ovelha continua como neutra (`sheep`).

### 1.5 A Era da Navegação e o primeiro encontro
- **Ano 0 AN**: Aurelan lança a caravela **Estrela-d'Alva**, do Cabo Aurora; descobre **Pedra-Mãe** e batiza o mar.
- **Ano 3 AN**: os clãs, sem chuva há três invernos, constroem **barcaças de cinza** (madeira de brejo calafetada com breu) e chegam a **Brejo Mudo** e **Fornalha**.
- **Ano 11 AN**: no **Pouso do Encontro**, a ilha temperada no centro do Mar Fendido, a Estrela-d'Alva e uma barcaça do Clã Chama-Baixa se avistam. O encontro começa em troca de gestos e termina em flechas (quem atirou primeiro é contado de dois jeitos: é o tema das missões 2 de cada campanha).
- **Anos 12–20 AN**: ambos descobrem que os Estilhaços escondem **ouro** (Pedra-Mãe), **madeira** (Cerne Verde), **petróleo** (Baixio do Breu) e **água** (poços de Miragem). Cada povo precisa do que o outro tem de sobra; **quem dominar as ilhas fecha o mar** ao outro e ganha uma **cabeça de ponte** militar.
- **Anos 20–30 AN**: a **Guerra do Mar Fendido** (campanhas, missões 3–9): combate pelas ilhas.
- **Ano 31 AN**: o lado que fixa as ilhas desembarca no continente alheio, funda uma **colônia** (missões 10–11) e ergue uma **fortaleza** (missão 12) que **bloqueia o acesso às ilhas**, eliminando a ameaça.

### 1.6 Os Estilhaços (as ilhas)
| Ilha | Terreno | Recursos/curiosidades | Começa com | Missão (palco) |
|---|---|---|---|---|
| **Pouso do Encontro** | temperada, praias, enseadas e um farol em ruínas (a "Torre da Fenda") | madeira e ouro médios, ovelhas e javalis | ninguém | 2 |
| **Pedra-Mãe** | **pedregosa**: rochedos, penhascos, platôs, pouca madeira | **ouro abundante** | Aliança (colônia mineira do governador Mervane) | 3 |
| **Baixio do Breu** | **recifes**: dezenas de ilhotas e baixios (quase só água rasa e funda) | **petróleo** (poços); ruínas de naufrágios | contestada | 4 |
| **Cerne Verde** | **florestal** densa, clareiras, bosque sagrado | **madeira** abundante; ninho de grifos | Aliança (bosque) | 5 |
| **A Geada** | **gelada**: neve, lagos congelados, geleiras (gelo não navegável), o **Farol Boreal** | pouco ouro; vista sobre o norte do mar | ninguém (disputada) | 6 |
| **Brejo Mudo** | **pantanosa**: juncos, lama, vitórias-régias, água rasa; chão lento | ferro de brejo, javalis selvagens | Horda (clãs do Presa-Negra) | 7 |
| **Fornalha** | **vulcânica**: basalto, fendas de lava, cinzas, fumarolas | ouro e obsidiana; o **Monte Caldeira** | Horda (forja e santuário) | 8 |
| **Miragem** | **deserta**: dunas, ruínas, **três poços** | água (poços), pouco mais | ninguém | 9 |

Convenções para os mapas (a spec irmã usa estes nomes): ilhas de **contorno irregular** (enseadas, penínsulas, ilhotas satélites), nada de "lobos circulares ligados por pontes". Os quatro palcos continentais: **Baía de Aurelan** / **Praia das Cinzas Vermelhas** (missão 1, "casa"), e **Costa Ferrugem**/**Cabo Aurora** (missão 10), **Estepe do Vento**/**Savana de Âmbar** (missão 11), **Cabo Ferrugem**/**Cabo Aurora** (missão 12), conforme a campanha.

### 1.7 O conflito, a colônia e o ataque final
1. **Choque nas ilhas** (missões 2–9): cada ilha muda de mãos. Aliança ataca ou defende conforme a posição; cada lado tem **um traidor/rival** (Mervane na Aliança, Hurgan na Horda) e **um aliado leal** (Brumar / Presa-Negra).
2. **Cabeça de ponte** (missão 9): quem toma **Miragem** (a última ilha antes da costa inimiga) fecha o circuito de bases e abre a travessia.
3. **Colônia** (missões 10–11): desembarque numa costa hostil, um Marco da Colônia (Centro avançado: **Porto Albor**, humano; **Brasa-Alta**, orc), economia sob ataque e reforços por mar.
4. **Fortaleza e bloqueio** (missão 12): o Centro da colônia vira **Castelo de Aldária** (humano) / **Cidadela de Ferro** (orc) com torres e muralhas, e a frota/torres **fecham o estreito** entre o continente alheio e as ilhas.
5. **Gancho**: a ameaça imediata acaba, mas o inimigo **não foi vencido em casa** (§6.3).

### 1.8 Personagens (todos inventados)
| Personagem | Lado | Papel | Tipo no jogo | Aparece / jogável |
|---|---|---|---|---|
| **Rainha Sevelin** | Aliança | soberana de Aurelan; voz da campanha | NPC (diálogo/cutscene) | 1–12 / não |
| **Marechal Dorian Vasques** | Aliança | veterano, comandante-geral | `hero_dorian` (novo) | cita-se desde a m1; **jogável na m12**; chefe inimigo na Horda m12 |
| **Capitã Lyra Ventosa** | Aliança | comandante dos grifos e navegadora | `hero_lyra` (novo) | cita-se desde a m6 (m8: esquadrão aliado); **jogável na m11** |
| **Mestre Orsolo** | Aliança | cartógrafo arcano e mentor; desenha o mundo | `hero_orsolo` (novo) | cita-se m2/m5; **jogável na m10** |
| **Capitão Brann** | Aliança | capitão de infantaria, cabeça da guarnição | `hero_brann` (existe) | **jogável a partir da m3** |
| **Mestre Oren** | Aliança | discípulo de Orsolo, mago de campo | `hero_oren` (existe) | **jogável a partir da m5** |
| **Sgt. Tomás Rocha** | Aliança | sargento da 1ª vela | `champ_tomas` (novo) | m1 |
| **Elara Pinheiral** | Aliança | batedora e arqueira | `champ_elara` (novo) | m2 |
| **Estrela-d'Alva** | Aliança | a caravela-capitânia lendária (navio nomeado) | `champ_estrela_dalva` (novo) | m4 |
| **Dama Aurora** | Aliança | campeã montada da Guarda Real | `champ_aurora` (novo) | m6 |
| **Governador Aldric Mervane** | Aliança (**vilão interno**) | governador de Pedra-Mãe, explora a mina, vende ferro à Horda e trai | NPC / unidades comuns (`knight`/`cavalier`) | m3 (cutscene), aliado→inimigo na m7 |
| **Brumar** (porto) | Aliança | aliado leal de IA | construções/IA aliada | m4, m6, m9 |
| **Chefe-de-brasa Skarn** | Horda | unificador dos clãs, ogro de coroa de ferro (**vilão da Aliança**) | `hero_skarn` (novo) | voz na m1; **jogável na m12 da Horda**; chefe na m12 da Aliança |
| **Drogath Punho-de-Brasa** | Horda | capitão de guerra do Clã Chama-Baixa | `hero_drogath` (existe) | **jogável desde a m1** |
| **Vozgul, a Profetisa** | Horda | necromante, guardiã da memória dos mortos | `hero_vozgul` (novo) | **jogável na m10**; chefe de Fornalha na m8 da Aliança |
| **Grok Quebra-Muros** | Horda | Ogro Feiticeiro e mestre de cerco | `hero_grok` (novo) | **jogável na m11**; comanda a contra-ofensiva de Miragem (m9 Aliança) |
| **Rurga Faro-Fino** | Horda | batedora lanceira | `champ_rurga` (novo) | m2 |
| **Brakka Presa-Negra** | Horda | chefe do Clã Presa-Negra (aliado leal da Horda) | `champ_brakka` (novo) | m3 |
| **Orvanna Maré-Negra** | Horda | capitã do mar, dona da galé-capitânia | `champ_orvanna` (novo) | m4 |
| **Narga Asa-Rota** | Horda | domadora de serpes | `champ_narga` (novo) | m5 |
| **Zarruk Fornalha** | Horda | mestre-ferreiro e incendiário | `champ_zarruk` (novo) | m6 |
| **Hurgan Lança-Partida** | Horda (**rival interno**) | chefe do Clã das Lanças Quebradas | NPC / unidades comuns | m1–m2 rival; aliado→inimigo na m7 da Horda |
| **Anciã Ulma** | Horda | guardiã do Fogo do Clã | NPC | m1–m2 |
| **Irmandade da Maré** | neutro | contrabandistas e piratas que saqueiam as duas costas | jogador neutro (id 99) + `bandit_camp` | m1 das duas campanhas |

**Heróis x campeões**: `hero_*` são heróis completos (barra ampliada, habilidades ativas existentes); `champ_*` são **campeões nomeados** (unidade `unique` única, mais forte que a base, sem habilidades; `isHero: false`). Ver §5.

### 1.9 Linha do tempo (para tela de abertura, briefings e epílogos)
Era do Isolamento (milhões de anos) → **0 AN** Estrela-d'Alva → **3 AN** barcaças de cinza → **11 AN** o Encontro → **12–20 AN** a corrida pelos Estilhaços → **21–30 AN** Guerra do Mar Fendido (m3–m9) → **31 AN** desembarques, colônia, fortaleza (m10–m12).

### 1.10 Originalidade e nomes
Nada de nomes, lugares ou personagens da Blizzard (ver `docs/05_PARIDADE_WARCRAFT2.md`). Termos como "Pig Farm" aparecem só na tabela de paridade. O mapa-múndi de referência (`mapa-mundi-referencia.png`) é **só estilo** (pergaminho, rosa dos ventos, selo de cera): **não copie os topônimos** da imagem; os contornos e nomes de Ondara são nossos.

---

## 2. Tela de abertura da história

Exibida **ao iniciar a campanha** (nova tentativa, antes do briefing da missão 1), uma vez por tentativa; pode ser revista pelo menu (§2.4). Duração total ≈ 75 s (7 painéis × ~10 s + título).

### 2.1 Roteiro cena a cena (texto pt-BR e en; narração = o próprio texto)
Os painéis 1–6 são **comuns às duas campanhas**; o 7 tem **variante por facção**; ao fim, cartão de título.

| # | Cena e imagem | pt-BR | en | Som/música |
|---|---|---|---|---|
| 1 | **Um só mundo.** Mapa-múndi de pergaminho: um único continente irregular, rosa dos ventos, selo de cera. Zoom lento. | "Antes de haver nomes, havia uma só terra, um só oceano e um só céu. Ondara era um mundo inteiro, e ninguém ainda o chamava de lar." | "Before there were names, there was one land, one ocean and one sky. Ondara was a whole world, and no one yet called it home." | Música: abertura calma, cordas graves (faixa `story` nova, derivada de `tracksTitle`); ondas distantes |
| 2 | **A Fenda.** Uma rachadura de tinta corta o continente; as duas metades se afastam, o mar (azul-desbotado) preenche. | "Então a terra se partiu. O mar entrou pela Fenda, e por milhões de anos dois continentes derivaram em silêncio, cada um sonhando o seu próprio mundo." | "Then the land split. The sea poured into the Rift, and for millions of years two continents drifted in silence, each dreaming its own world." | rumor grave de rocha, ondas |
| 3 | **Velmara e Cinzara.** Tela dividida: à esquerda montanhas nevadas, floresta, savana, ovelhas e grifos; à direita dunas, pântano, estepe, javalis e serpes. | "Em Velmara, entre montanhas nevadas, florestas e savanas, ergueram-se os homens, com seus rebanhos e seus grifos. Em Cinzara, entre dunas, pântanos e estepes, os clãs aprenderam a viver do pouco: javalis, brasas e vento." | "In Velmara, among snowy mountains, forests and savannas, humankind rose, with flocks and gryphons. In Cinzara, among dunes, marshes and steppes, the clans learned to live on little: boar, embers and wind." | tema humano (flauta/cordas) à esquerda, tambor e metais graves à direita (`tracksHuman`/`tracksOrc` em volume baixo) |
| 4 | **A Era das Velas.** Cartas náuticas se desenham; veleiros brancos de um lado e barcaças de cinza do outro avançam por rotas pontilhadas. | "Os povos cresceram, e a fome de terra, de ouro, de madeira e de breu os lançou ao mar. Aurelan traçou cartas; os clãs queimaram mastros de cinza. Cada um buscava o que faltava em casa." | "The peoples grew, and hunger for land, gold, timber and tar drove them to sea. Aurelan drew charts; the clans burned ash-wood masts. Each sought what home could not give." | vento, cordame; música sobe |
| 5 | **O Encontro.** As duas rotas se tocam no meio do mapa (Pouso do Encontro); duas velas se cruzam, uma flecha riscada em tinta vermelha. | "No meio do Mar Fendido, duas velas se avistaram. Ninguém sabe quem baixou o estandarte primeiro, nem de que lado partiu a primeira flecha. Só se sabe que o mar deixou de ser vazio." | "In the middle of the Sundered Sea, two sails sighted each other. No one knows who lowered the banner first, or whose arrow flew first. We only know the sea was empty no more." | **corneta** curta (sfx), silêncio, caixa de guerra |
| 6 | **Os Estilhaços.** As oito ilhas aparecem uma a uma, com seu terreno em miniatura e um ícone de ouro, madeira ou gota de petróleo. | "Entre os dois mundos jaziam os Estilhaços: ilhas de pedra, brejo, fogo, gelo e areia, com ouro, madeira e petróleo à beira da água. Quem as dominasse teria uma ponte de guerra e a chave do oceano." | "Between the two worlds lay the Shards: islands of stone, marsh, fire, ice and sand, with gold, timber and oil at the water's edge. Whoever held them would hold a bridge of war and the key to the ocean." | batida que cresce |
| 7a | **(Aliança)** O estandarte de Aurelan sobre a Baía; a Rainha Sevelin de costas, o mapa de Orsolo na mesa; um X marcado em Cinzara. | "Aurelan não queria a guerra, mas não cederia o mar. Na Baía de Aurelan, a Rainha Sevelin ergue o estandarte: tomar os Estilhaços e fincar uma fortaleza em terra inimiga, de onde o mar será nosso." | "Aurelan did not want war, but would not yield the sea. At Aurelan Bay, Queen Sevelin raises the banner: take the Shards and plant a fortress on enemy soil, from where the sea shall be ours." | fanfarra curta humana |
| 7b | **(Horda)** A pira do Planalto do Cinzal, Skarn de coroa de ferro diante dos clãs, o mapa riscado a carvão; um X em Velmara. | "Os clãs não pediram esta guerra, mas a terra seca não perdoa. Do Planalto do Cinzal, o chefe-de-brasa Skarn acende a pira: tomar os Estilhaços e fincar uma cidadela na terra verde, de onde ninguém mais nos fechará o mar." | "The clans did not ask for this war, but dry land forgives no one. From the Cinzal Plateau, ember-chief Skarn lights the pyre: take the Shards and plant a citadel in the green land, from where no one will ever shut us from the sea." | tambores orcs |
| T | **Título.** O mapa completo se funde ao logotipo; "A Guerra do Mar Fendido". | "A Guerra do Mar Fendido" | "The War of the Sundered Sea" | acorde final |

Cada painel tem legenda sobre faixa translúcida (sempre legível, também sem som); texto máximo ~40 palavras por idioma.

### 2.2 Comportamento
- **Início**: aparece quando o jogador inicia uma campanha **nova** (primeira vez, ou "Nova tentativa"/"Rejogar a campanha"), antes do briefing da missão 1. Ao continuar uma campanha em andamento, **não** reaparece.
- **Controles**: **Espaço/Enter/clique/→** avança (ou completa o texto, se ainda digitando); **←** volta ao painel anterior; **Esc** ou botão **"Pular"** encerra a qualquer momento (sem confirmação). Avanço automático opcional (≈ 10 s por painel; desligado por padrão se o jogador já interagiu). Indicadores de progresso (7 pontos). Botão de **idioma** herda a opção do jogo (pt-BR/en).
- **Rever**: botão **"Rever a história"** em `CampaignScreen` (por campanha) e no menu de **Opções > História** (a decidir); sempre pulável.
- **Acessibilidade**: `prefers-reduced-motion` troca os movimentos por fusões (crossfade); legendas sempre visíveis; sons respeitam os volumes das opções.
- **Estado**: marca "história vista" por tentativa em `localStorage` (campo aditivo no objeto da campanha em `warpoly.campaign.v1`; sem mudar `version`; falhas de armazenamento nunca lançam, como em `progress.js`).

### 2.3 Implementação (nuvem, sem navegador; a arte final é local)
- **Dados**: `src/data/story/world.json` (`format: "warpolystory"`, `version: 1`): `panels: [{ id, art: '<id da ilustração>', text: {pt-BR, en}, seconds, music?, sfx?, factionVariants?: { human: {...}, orc: {...} } }]` + `title`. Validação (`validateStory`, módulo puro) exige pt-BR **e** en em cada texto, 5 a 8 painéis. Textos de interface (Pular, Próximo, Rever a história) em `src/i18n/*.json` (`story.*`).
- **Modelo puro** `src/ui/campaignStoryModel.js` (testável em Node): monta a lista de painéis para a facção, índice atual, `next/prev/skip`, autoavanço, "primeira vez".
- **Tela** `src/ui/screens/CampaignStory.js` + `campaignStory.css` (mesmo estilo de `CampaignVictory.js`: sobreposição de tela cheia, `Esc` pula, `onAction('done'|'skip')`). Integração em `src/main.js` (`replayCampaign`/início de campanha) e `CampaignScreen.js` (botão "Rever a história").
- **Ilustração procedural** `src/ui/campaignStoryArt.js` (SVG/canvas gerado por código, como `campaignVictoryArt.js`): pergaminho com ruído e manchas; **contornos de continente e ilha por ruído fractal radial/ruído de curva** (semente fixa) para parecerem naturais e irregulares, tracejado de tinta, hachuras do mar, rosa dos ventos, selo de cera, moldura ornamental, **rachadura** que separa o supercontinente (painel 2: translação das duas metades), rotas pontilhadas animadas (`stroke-dashoffset`) e veleiros (painéis 4–5), ilhas com miniatura de terreno (painel 6). O módulo de **formas** (`worldMapShapes.js`: contornos de Velmara, Cinzara e Estilhaços) é **compartilhado com a spec de mapas** (o mapa-múndi da `CampaignScreen`, §7.5) para que a história, o mapa-múndi e os mapas jogáveis falem do mesmo mundo.
- **Slots de arte final**: `public/ui/art/story/panel-<n>.webp` (1920×1080, ≤ 500 kB, `n` = 1..7) e `public/ui/art/story/title.webp`; a tela detecta por `Image` `onload/onerror` (como `victory_<facção>.webp`) e usa o SVG procedural quando faltar.
- **Áudio**: faixa `story_0` (nova, em `src/audio/music/`, ver `catalog.js`; reaproveita o gerador de `tracksTitle.js`; compasso lento 4/4 em modo menor, ~84 bpm) e sfx `storyHorn` (`sfxRecipes.js`). **Sem locução** no MVP (legendas); slot opcional `public/audio/story/<lang>/panel-<n>.ogg` detectado igual à arte.
- **Testes** (nuvem): validação do JSON (idiomas, painéis, `art` conhecido), modelo (navegação, pular, autoavanço, primeira vez), paridade de i18n, geração do SVG determinística (mesma semente, mesmo markup). **Pendente (local)**: aparência, ritmo, volume e música.

---

## 3. Estrutura da campanha: duas campanhas espelhadas sobre palcos compartilhados

### 3.1 Decisão e justificativa
**Duas campanhas independentes** (`alliance`: Aliança/humanos; `horde`: Horda/orcs), **12 missões cada**, jogando a mesma guerra de **lados opostos** sobre **12 palcos** numerados:
- **Palcos 2–9: as oito ilhas, compartilhadas.** O mesmo mapa serve às duas campanhas (menos mapas a construir e a testar: 8 em vez de 16); o que muda é **quem ataca e quem defende**, as unidades inimigas, os objetivos e o texto. Isso também dá à Horda uma partida realmente diferente: onde a Aliança defende Pedra-Mãe, a Horda a **assalta**.
- **Palcos 1, 10, 11, 12: continentais, diferentes por facção** (casa na m1; costa, interior e promontório inimigos nas m10–12). Total: **16 mapas**.
- **Por que não uma estrutura única compartilhada** (um jogador, dois lados alternados): quebra a identidade da facção no tutorial de liberação (a árvore de cada lado é diferente) e dobra o texto por missão; o jogador quer jogar "o seu lado" do começo ao fim. **Por que não só espelhar o texto**: cada lado ocupa frentes diferentes (ver tabelas), então as missões ensinam o mesmo conteúdo com objetivos que dependem do lado.
- **Cânone**: **Crônicas espelhadas** (recomendado): cada campanha é o relato do seu povo e vence em seu relato. O epílogo de cada lado termina com um **sinal do outro** no horizonte, que mantém aberto o gancho (§6.3) sem desmentir a outra campanha. Alternativa (pergunta §10-2): cânone único com desfecho comum ("fortalezas gêmeas": as duas existem ao mesmo tempo e as ilhas ficam sem dono).
- **Ordem de lançamento recomendada**: Aliança primeiro (já tem 8 missões, base reaproveitável), Horda em seguida (§8).

### 3.2 Os 12 palcos
| Palco | Cenário (nome canônico) | Terreno | Função | Mapa existente provisório (até a spec irmã entregar o novo) |
|---|---|---|---|---|
| 1 | Baía de Aurelan / Praia das Cinzas Vermelhas | continental, costa | tutorial; primeira vela | `campos-1v1` |
| 2 | **Pouso do Encontro** | temperada | primeiro contato e incidente | `desfiladeiro-1v1` |
| 3 | **Pedra-Mãe** | pedregosa | ouro, defesa e cerco | `estreito-1v1` |
| 4 | **Baixio do Breu** | recifes | petróleo e frota | `ilhas-4p` (naval) |
| 5 | **Cerne Verde** | florestal | madeira, magia, ar | `bosques-2v2` |
| 6 | **A Geada** | gelada | "Prova de Fogo" (árvore completa) | `arquipelago-naval-4p` |
| 7 | **Brejo Mudo** | pantanosa | traição | `vales-2v2` |
| 8 | **Fornalha** | vulcânica | forja e rito | `continental-1v1` |
| 9 | **Miragem** | deserta | cabeça de ponte | `ilhas-4p` |
| 10 | Costa Ferrugem (Aliança) / Cabo Aurora (Horda) | costa inimiga | desembarque | `continental-1v1` |
| 11 | Estepe do Vento (Aliança) / Savana de Âmbar (Horda) | interior inimigo | colônia | `vales-2v2` |
| 12 | Cabo Ferrugem (Aliança) / Cabo Aurora, ponta leste (Horda) | promontório | fortaleza e bloqueio | `planalto-ffa-4p` |

Os mapas provisórios só servem para **escrever e testar** as missões na nuvem antes da spec de mapas; cada missão aponta `map: <id>` e coordenadas. **Risco**: coordenadas escritas contra um mapa provisório são refeitas quando o mapa novo chegar (§9). Mitigação: pedir à spec de mapas **pontos nomeados** (`anchors`: `playerStart`, `enemyStart`, `goldMine1`, `landingZone`, `well1`…) e resolver as coordenadas por nome no JSON da missão.

### 3.3 Convenções comuns
- Cada missão: objetivo **primário**, **secundário** e **oculto**; cutscene de abertura; diálogos pt-BR/en; briefing com "Novo nesta missão" (mecanismo F8-05b); duração-alvo **10–25 min**; carry-over como hoje (25 %, teto 300); `setTier` conforme a liberação (§4).
- IA e inimigos por dados (F5-06). **Naval**: a IA naval ainda é trabalho local (NEW-44, `src/ai/**`); até lá, as frotas inimigas das missões 4, 6, 9 e 12 são **roteiros** (`spawn` + `order` em gatilhos de tempo), com a IA só em terra.
- Elenco cumulativo: a partir da missão N a missão pode criar (`spawn`) os personagens já liberados (no máximo 4 em campo no início). Um herói morto fica fora da partida (regra de `heroes.js`), não da campanha.
- Honra (objetivo oculto de conduta) vale nas duas campanhas (poupar um emissário, não perder uma barcaça etc.).

### 3.4 Campanha da Aliança: `alliance` ("A Marcha da Aliança", `factionId: 'human'`)
Resumo: ids em `src/data/campaigns/alliance/mNN-*.json`.

| # | id | Nome | Palco | Personagem novo | Ideia |
|---|---|---|---|---|---|
| 1 | `alliance-01-terra-a-vista` | Terra à Vista | Baía de Aurelan | `champ_tomas` | economia, Quartel, Irmandade da Maré; mural; vela estrangeira |
| 2 | `alliance-02-pouso-do-encontro` | O Pouso do Encontro | Pouso do Encontro | `champ_elara` | resgate e escolta; primeiro contato; Forja |
| 3 | `alliance-03-ouro-da-pedra-mae` | Ouro da Pedra-Mãe | Pedra-Mãe | `hero_brann` | segurar a mina; muralhas, cavalaria, cerco |
| 4 | `alliance-04-baixio-do-breu` | O Baixio do Breu | Baixio do Breu | `champ_estrela_dalva` | Estaleiro, petróleo, batalha naval |
| 5 | `alliance-05-cerne-verde` | O Cerne Verde | Cerne Verde | `hero_oren` | madeira; magos e grifos |
| 6 | `alliance-06-a-geada` | A Geada | A Geada | `champ_aurora` | **Prova de Fogo**: árvore completa, 2 IAs, aliado |
| 7 | `alliance-07-brejo-mudo` | O Brejo Mudo | Brejo Mudo | (elenco) | traição do governador Mervane |
| 8 | `alliance-08-a-fornalha` | A Fornalha | Fornalha | (elenco) | resgate de magos; Vozgul |
| 9 | `alliance-09-miragem` | Miragem | Miragem | (elenco) | cabeça de ponte; contra-ofensiva de Grok |
| 10 | `alliance-10-desembarque` | Desembarque na Costa Ferrugem | Costa Ferrugem | `hero_orsolo` | travessia por Barcaças, Marco da Colônia |
| 11 | `alliance-11-porto-albor` | Porto Albor | Estepe do Vento | `hero_lyra` | colônia sob cerco; reforços |
| 12 | `alliance-12-bastiao-do-cabo-ferrugem` | O Bastião do Cabo Ferrugem | Cabo Ferrugem | `hero_dorian` | fortaleza + bloqueio + Skarn; gancho |

### 3.5 Campanha da Horda: `horde` ("O Caminho das Brasas", `factionId: 'orc'`)
| # | id | Nome | Palco | Personagem novo | Ideia |
|---|---|---|---|---|---|
| 1 | `horde-01-cinzas-vermelhas` | Cinzas Vermelhas | Praia das Cinzas Vermelhas | `hero_drogath` | economia, Acampamento de Guerra, saqueadores; mural; velas brancas |
| 2 | `horde-02-velas-brancas` | Velas Brancas | Pouso do Encontro | `champ_rurga` | resgate de batedores e escolta; primeiro contato; Forja |
| 3 | `horde-03-a-pedra-que-brilha` | A Pedra que Brilha | Pedra-Mãe | `champ_brakka` | **assalto** à colônia mineira; Ogros, cerco |
| 4 | `horde-04-mare-de-breu` | Maré de Breu | Baixio do Breu | `champ_orvanna` | Doca, petróleo, batalha naval |
| 5 | `horde-05-madeira-de-guerra` | Madeira de Guerra | Cerne Verde | `champ_narga` | madeira; necromantes e serpes |
| 6 | `horde-06-fogo-no-gelo` | Fogo no Gelo | A Geada | `champ_zarruk` | **Prova de Fogo** |
| 7 | `horde-07-casa-no-brejo` | Casa no Brejo | Brejo Mudo | (elenco) | defender o brejo; traição de Hurgan |
| 8 | `horde-08-monte-caldeira` | O Monte Caldeira | Fornalha | (elenco) | defender a forja até o rito |
| 9 | `horde-09-ultimo-poco` | O Último Poço | Miragem | (elenco) | cabeça de ponte; contra-ofensiva de Dorian |
| 10 | `horde-10-cabo-aurora` | Desembarque no Cabo Aurora | Cabo Aurora | `hero_vozgul` | travessia, Marco da Colônia |
| 11 | `horde-11-brasa-alta` | Brasa-Alta | Savana de Âmbar | `hero_grok` | colônia sob cerco |
| 12 | `horde-12-cidadela-de-brasa-alta` | A Cidadela de Brasa-Alta | Cabo Aurora (ponta leste) | `hero_skarn` | cidadela + bloqueio + Dorian; gancho |

### 3.6 Fichas da campanha da Aliança
Formato: **P** primário · **S** secundário · **O** oculto · **IA** inimigos · **Al** aliados · **Per** personagens · **Min** duração · **Ensina**. As unidades usam ids de `src/data`.

**A01 · `alliance-01-terra-a-vista` · Terra à Vista** (Baía de Aurelan; verde, costa turquesa, enseadas) · Min 10–12.
- **P**: erguer um **Quartel** (`barracks`), treinar 3 Espadachins (`knight`) e 4 Arqueiros (`archer`); destruir o acampamento da Irmandade da Maré (`bandit_camp`).
- **S**: coletar 500 de ouro. **O**: achar o **Mural da Fenda** (ruína, área oculta): dá +100 ouro e o texto da Fenda.
- **IA**: nenhuma (neutros hostis, jogador 99: 4 guardas com leash). **Al**: nenhum. **Per**: Sgt. **Tomás Rocha** (`champ_tomas`) conduz o esquadrão inicial.
- Fecho: cutscene com uma vela estranha no horizonte (gancho para a m2). **Ensina**: câmera, coleta, construção, treino, ordem de ataque.

**A02 · `alliance-02-pouso-do-encontro` · O Pouso do Encontro** (Pouso; praias e a Torre da Fenda em ruínas) · Min 12–15.
- **P**: libertar 4 pescadores presos num forte de troncos (`rescue`) e escoltá-los ao Cais (`escort`). **S**: pesquisar Armas Forjadas (`melee_weapons`) na **Ferraria** nova. **O**: **poupar o Emissário** (um orc que ergue pano branco; `Honra`) e ganhar +100 de ouro e um aviso de emboscada.
- **IA**: patrulha leve do Clã Chama-Baixa (`grunt`, `axethrower`). **Al**: nenhum. **Per**: **Elara Pinheiral** (`champ_elara`), batedora.
- Cutscene: o incidente; ninguém sabe quem atirou. **Ensina**: Ferraria, Torre de Vigia (`watchtower`), pesquisas, escolta, névoa e reconhecimento.

**A03 · `alliance-03-ouro-da-pedra-mae` · Ouro da Pedra-Mãe** (Pedra-Mãe; rochedos, platôs, ouro) · Min 15–18.
- **P**: segurar o Paço 7 min contra ondas vindas do mar (Barcaças, `survive`). **S**: erguer 2 Torres e 6 trechos de Muralha de Pedra (`wall_human`); treinar 4 Cavaleiros (`cavalier`). **O**: pesquisar Escudos Reforçados (`melee_armor`) antes da 3ª onda (+150).
- **IA**: Clã Presa-Negra em ondas crescentes (Talhadores, Lanceiros-Machado, Ogros, 1 Catapulta; `ogre`, `catapult`). **Al**: nenhum. **Per**: **Capitão Brann** (`hero_brann`) comanda a guarnição; o governador **Mervane** aparece em cutscene (arrogante, mais interessado no ouro que nos homens).
- **Ensina**: defesa em profundidade (muralha + torre), Estábulo, Oficina e cerco, heróis (Grito de Guerra).

**A04 · `alliance-04-baixio-do-breu` · O Baixio do Breu** (recifes; ilhotas e água rasa) · Min 15–20.
- **P**: construir o **Estaleiro** (`shipyard`), erguer **2 Plataformas** (`oil_platform`) com o Petroleiro (`tanker`) e afundar a frota de patrulha orc. **S**: afundar 3 Galés (`war_galley`). **O**: não perder nenhuma Fragata (`frigate`).
- **IA**: frota de Orvanna (roteirizada; Galés, 1 Leviatã tardio). **Al**: **Porto de Brumar** envia um primeiro lote de petróleo. **Per**: a **Estrela-d'Alva** (`champ_estrela_dalva`) chega aos 5 min.
- **Ensina**: petróleo, Estaleiro, Refinaria, Fundição, combate naval, transporte (Barcaça).

**A05 · `alliance-05-cerne-verde` · O Cerne Verde** (floresta densa, clareiras, bosque sagrado) · Min 18–22.
- **P**: coletar 2000 de madeira e destruir o posto madeireiro dos clãs (Salão do Bosque). **S**: treinar 2 Magos (`mage`) e 1 Cavaleiro Grifo (`gryphon_rider`). **O**: pesquisar Ordenação (`cavalry_class`) e treinar um Templário (`templar`) (+300).
- **IA**: Clã Forja Negra (Necromantes `necromancer`, Serpes `war_serpent`, Esqueletos). **Al**: nenhum. **Per**: **Mestre Oren** (`hero_oren`), o mago de campo.
- **Ensina**: Torre Arcana, Templo, Aviário, magias (Bola de Fogo, Lentidão), voo e visão.

**A06 · `alliance-06-a-geada` · A Geada (Prova de Fogo)** (gelada; geleiras e o Farol Boreal) · Min 20–25.
- **P**: tomar e manter o **Farol Boreal** (`area`) por 3 min e destruir o forte do Clã Lanças Quebradas (Hurgan). **S**: proteger o comboio de Brumar. **O**: terminar sem perder a **Dama Aurora**.
- **IA**: 2 IAs orcs (Lanças Quebradas, Sal Cinzento). **Al**: Brumar (IA, cujo forte não pode cair). **Per**: **Dama Aurora** (`champ_aurora`).
- **Ensina**: armas combinadas, todas as categorias, transporte e naval juntos; primeira missão com a **árvore completa**.

**A07 · `alliance-07-brejo-mudo` · O Brejo Mudo** (pantanosa; juncos, lama) · Min 18–22.
- **P**: destruir o **Cercado de Javalis** e o Salão de Brakka (a base de abastecimento) **e sobreviver à traição**: aos 5:30 o governador Mervane (aliado de IA) vira inimigo (`setTeam`) e abre o brejo a Brakka. **S**: capturar o depósito de contrabando de ferro de Mervane. **O**: manter 4 Magos vivos.
- **IA**: Presa-Negra (Brakka) + traição. **Al**: Mervane (até 5:30). **Per**: elenco (Brann, Oren, Aurora).
- **Ensina**: leitura de diplomacia, defesa contra aliado traidor, mobilidade lenta no brejo. Reaproveita `alliance-07-traicao-presa-negra`.

**A08 · `alliance-08-a-fornalha` · A Fornalha** (vulcânica; basalto, lava) · Min 20–25.
- **P**: destruir o **Santuário das Cinzas** (`ash_sanctum`) e a **Fornalha Naval** (`naval_forge`) e matar **Vozgul**; **S**: libertar 6 prisioneiros (magos de Orsolo, `rescue`). **O**: sem perder Grifos.
- **IA**: Skarn/Vozgul (Necromantes, Serpes, Ogros). **Al**: o esquadrão de grifos da **Capitã Lyra** chega aos 8 min. **Per**: elenco.
- **Ensina**: ataque a um ponto fortificado com magias, ar e cerco. Reaproveita os magos cativos e o Ninho de `alliance-08-queda-do-cinzal`.

**A09 · `alliance-09-miragem` · Miragem (cabeça de ponte)** (deserta; três poços) · Min 20–25.
- **P**: tomar os 3 poços (`area`) e fincar o **Forte Atalaia** (Torres + Muralha) por 8 min contra a grande contra-ofensiva de **Grok** (Catapultas, Ogros Feiticeiros, Serpes). **S**: destruir o Ninho das Serpes (`serpent_nest`). **O**: poços intactos.
- **IA**: Horda (difícil). **Al**: reforços navais de Brumar. **Per**: elenco.
- **Ensina**: defender em arco com muralha e torres; cerco adversário. Reaproveita `alliance-04` (forte Atalaia) e `alliance-03` (ondas).

**A10 · `alliance-10-desembarque` · Desembarque na Costa Ferrugem** (costa inimiga: dunas e foz de brejo) · Min 15–20.
- **P**: atravessar com 2 Barcaças (`barge`; 12 unidades), destruir a guarda costeira (3 torres) e fundar o **Marco da Colônia** (o Centro avançado é criado por `spawnBuilding` quando a área é segurada). **S**: perder no máximo uma Barcaça. **O**: achar o Poço Velho.
- **IA**: guarnição costeira de Skarn (IA terrestre). **Per**: **Mestre Orsolo** (`hero_orsolo`) desenha o terreno (revela área).
- **Ensina**: operação anfíbia.

**A11 · `alliance-11-porto-albor` · Porto Albor** (Estepe do Vento; capim seco) · Min 20–25.
- **P**: evoluir o Marco ao **nível 2 (Fortaleza)**, juntar 3000 de ouro e resistir a 3 incursões (12 min). **S**: erguer Estábulo e Aviário na colônia. **O**: converter um clã dissidente (`transfer`) em aliado.
- **IA**: Skarn (difícil), Hurgan. **Al**: reforços por mar (Barcaças a cada 4 min). **Per**: **Capitã Lyra Ventosa** (`hero_lyra`).
- **Ensina**: economia remota, logística por mar. Reaproveita o comboio de `alliance-04-ponte-do-rio-turvo`.

**A12 · `alliance-12-bastiao-do-cabo-ferrugem` · O Bastião do Cabo Ferrugem** (Cabo Ferrugem; falésias, estreito) · Min 22–25.
- **P** (3 partes): (1) **construir o Bastião**: Centro no nível 3 (**Castelo de Aldária**), 4 Torres de Vigia, 8 trechos de Muralha e 2 Balistas na área; (2) **bloquear as rotas**: destruir as 3 Docas orcs (`ship_dock`) do litoral e manter 2 navios de guerra no estreito 90 s sem inimigos; (3) **sobreviver ao ataque final** de Skarn (chefe) até ele cair.
- **S**: matar Skarn pessoalmente. **O**: nenhum trecho de muralha cai.
- **IA**: Horda com todas as tropas, Skarn (boss), ondas. **Al**: a frota da Aliança. **Per**: **Marechal Dorian Vasques** (`hero_dorian`), mais Brann, Oren, Orsolo, Lyra.
- Cutscene final e gancho (§6).

### 3.7 Fichas da campanha da Horda
**H01 · `horde-01-cinzas-vermelhas` · Cinzas Vermelhas** (Praia das Cinzas Vermelhas; dunas, brejo no limite) · Min 10–12.
- **P**: construir o **Acampamento de Guerra** (`orc_barracks`), treinar 3 Talhadores (`grunt`) e 4 Lanceiros-Machado (`axethrower`), destruir o acampamento dos Saqueadores (`bandit_camp`, Irmandade da Maré). **S**: 500 de ouro. **O**: o **Mural da Fenda** (vista dos clãs; +100).
- **IA**: nenhuma (neutros). **Per**: **Drogath Punho-de-Brasa** (`hero_drogath`); a **Anciã Ulma** guarda o Fogo do Clã (diálogo).
- Fecho: velas brancas no horizonte. **Ensina**: o mesmo que A01, com o Cercado de Javalis (`pig_farm`) como fazenda.

**H02 · `horde-02-velas-brancas` · Velas Brancas** (Pouso do Encontro) · Min 12–15.
- **P**: resgatar 4 batedores presos pela patrulha humana e escoltá-los à barcaça. **S**: pesquisar Lâminas de Guerra (`melee_weapons`). **O**: **poupar um Mensageiro** humano (Honra; +100).
- **IA**: patrulha de Aurelan (Espadachins, Arqueiros). **Per**: **Rurga Faro-Fino** (`champ_rurga`). **Ensina**: Forja e Torre de Vigia (`orc_watchtower`).

**H03 · `horde-03-a-pedra-que-brilha` · A Pedra que Brilha** (Pedra-Mãe, **atacante**) · Min 15–18.
- **P**: destruir os 3 fortes da colônia mineira e o Paço do governador Mervane; **S**: capturar as 2 minas de ouro (coletar 1500) e erguer Torre e Paliçada (`wall_orc`) na cabeça de ponte; **O**: não perder nenhum Lacaio.
- **IA**: guarnição humana (Balistas, Cavaleiros). **Al**: Presa-Negra (IA). **Per**: **Brakka** (`champ_brakka`, Ogro). **Ensina**: Covil dos Ogros, Catapultas, ataque a base fortificada, muralhas.

**H04 · `horde-04-mare-de-breu` · Maré de Breu** (Baixio do Breu) · Min 15–20.
- **P**: construir a **Doca do Clã** (`ship_dock`), erguer 2 Plataformas e afundar a esquadra de Aurelan. **S**: afundar 3 Fragatas. **O**: nenhuma Galé perdida.
- **IA**: frota roteirizada humana (Fragatas, Couraçado). **Al**: Marés Negras. **Per**: **Orvanna Maré-Negra** (`champ_orvanna`, galé-capitânia). **Ensina**: petróleo, Caldeirão, Fornalha Naval, naval.

**H05 · `horde-05-madeira-de-guerra` · Madeira de Guerra** (Cerne Verde, **assalto ao bosque**) · Min 18–22.
- **P**: coletar 2000 de madeira e destruir o bosque-forte de Aurelan; **S**: 2 Necromantes e 1 Serpe de Guerra (`war_serpent`); **O**: pesquisar Ritual das Tempestades (`cavalry_class`) e formar 1 Ogro Feiticeiro (`ogre_mage`).
- **IA**: Aurelan (Magos, Grifos, Arqueiros). **Per**: **Narga Asa-Rota** (`champ_narga`). **Ensina**: Santuário, Altar, Ninho, magias.

**H06 · `horde-06-fogo-no-gelo` · Fogo no Gelo (Prova de Fogo)** (A Geada) · Min 20–25.
- **P**: tomar o Farol Boreal 3 min e destruir a base de Brumar; **S**: proteger o comboio de Marés Negras; **O**: terminar com **Zarruk** vivo.
- **IA**: 2 IAs humanas (Brumar, Guarda Real). **Al**: Marés Negras (IA). **Per**: **Zarruk Fornalha** (`champ_zarruk`). **Ensina**: árvore completa; primeira missão com tudo.

**H07 · `horde-07-casa-no-brejo` · Casa no Brejo** (Brejo Mudo, **defensor**) · Min 18–22.
- **P**: segurar o Salão e os Cercados de Javalis contra a frota de Aurelan e **sobreviver à traição**: aos 5:30 **Hurgan** (aliado de IA, comprado com ferro de Mervane) vira inimigo (`setTeam`). **S**: destruir o depósito de ferro do traidor. **O**: manter 4 Necromantes vivos.
- **IA**: Aurelan + Hurgan. **Al**: Hurgan (até 5:30). **Per**: elenco. **Ensina**: diplomacia, defesa contra traidor.

**H08 · `horde-08-monte-caldeira` · O Monte Caldeira** (Fornalha, **defensor**) · Min 20–25.
- **P**: proteger a Forja e o Santuário por 10 min enquanto **Vozgul** conclui o rito, e concluir 2 Leviatãs de Ferro (`iron_leviathan`); **S**: libertar guardas presos; **O**: manter Zarruk vivo.
- **IA**: Aurelan (Magos, Grifos, cerco) com o esquadrão de Lyra. **Per**: elenco. **Ensina**: logística de produção sob pressão.

**H09 · `horde-09-ultimo-poco` · O Último Poço** (Miragem, cabeça de ponte) · Min 20–25.
- **P**: tomar os 3 poços e erguer o Forte do Poço por 8 min contra a contra-ofensiva do **Marechal Dorian** (Cavaleiros, Balistas, Grifos). **S**: destruir o Aviário (`aviary`) inimigo. **O**: poços intactos.
- **IA**: Aurelan (difícil). **Al**: reforços das Marés Negras. **Ensina**: defesa em arco, antiaéreo (Lanceiros, Serpes).

**H10 · `horde-10-cabo-aurora` · Desembarque no Cabo Aurora** (Velmara; verde, costa irregular) · Min 15–20.
- **P**: atravessar com 2 Barcaças, destruir a guarda costeira (3 Torres) e fundar o Marco da Colônia (**Brasa-Alta**); **S**: perder no máximo uma Barcaça; **O**: achar o Bosque do Orvalho.
- **IA**: guarnição de Aurelan. **Per**: **Vozgul** (`hero_vozgul`).

**H11 · `horde-11-brasa-alta` · Brasa-Alta** (Savana de Âmbar; capim alto, rios) · Min 20–25.
- **P**: evoluir o Marco ao **nível 2 (Bastião)**, 3000 de ouro e resistir a 3 incursões; **S**: erguer Covil e Ninho na colônia; **O**: converter um posto avançado da Aliança (`transfer`).
- **IA**: Aurelan (difícil, Grifos). **Al**: reforços por mar. **Per**: **Grok Quebra-Muros** (`hero_grok`).

**H12 · `horde-12-cidadela-de-brasa-alta` · A Cidadela de Brasa-Alta** (Cabo Aurora, ponta leste; farol, estreito) · Min 22–25.
- **P**: (1) **Cidadela**: Centro no nível 3 (**Cidadela de Ferro**), 4 Torres, 8 Paliçadas e 2 Catapultas; (2) **bloquear as rotas**: destruir as 3 Docas humanas (incluindo Brumar) e manter 2 galés no estreito 90 s; (3) sobreviver ao ataque do **Marechal Dorian** (chefe) até ele cair ou fugir.
- **S**: destruir o Farol do Cabo (o último ponto de sinal da Aliança). **O**: nenhuma Paliçada cai.
- **Per**: **Skarn** (`hero_skarn`, jogável), mais Drogath, Vozgul, Grok. Gancho (§6).

> Os objetivos usam só tipos de condição que existem (`build`, `destroy`, `collect`, `rescue`, `escort`, `survive`, `flag`, `area`, `count`, `research`; não há "usar magia", G8 do F8-06). "Salvar uma Barcaça", "manter vivo" e "bloquear" são `count`/`dead`/`area` em gatilhos.

---

## 4. Progressão de liberação (`unlocks`)

### 4.1 Princípio e posição exata
- **Meta do dono**: ~40 % da campanha já com todos os recursos do jogo; no máximo ao fim da missão 6. **Posição escolhida**: **ao fim da missão 5 (5/12 = 41,7 %)**; a missão 6 ("Prova de Fogo") é a **primeira jogada com a árvore completa** e libera só um personagem. Justificativa: 5/12 é o número inteiro mais próximo de 40 %; dá uma missão inteira (a 6) de "tudo liberado" antes da metade; e o teto de segurança (fim da m6, 50 %) fica de reserva: se a playtest mostrar a missão 5 carregada (12 pesquisas novas), as 7 pesquisas mais avançadas (marcadas †) passam para a missão 6 sem mudar nada além do JSON.
- **Ordem de tutorial**: m1 economia e infantaria básica → m2 melhorias (Forja, Torre) → m3 nível 2 (cavalaria, cerco, muralha) → m4 naval e petróleo (nível 3) → m5 magia e ar → m6 todos juntos. Nas missões 7–12 **nada é restringido** (campo `unlocks` vazio; nada novo a anunciar além dos personagens).
- **Nível do Centro (`setTier`)**: m1–m2 nível 1, m3 nível 2, m4–m12 nível 3 (a campanha concede o nível que a tecnologia exige, como hoje). Nas missões 10–12 o Centro avançado (Marco da Colônia) nasce no nível 1 e **o jogador o evolui** (nível 2 na m11, nível 3 na m12); `setTier` não é aplicado a ele (§8, risco R3).

### 4.2 Tabela da Aliança (`human`, `factionId: 'human'`)
| # | `units` | `buildings` | `research` | `heroes` (personagem) | Tier |
|---|---|---|---|---|---|
| 1 | `villager`, `knight`, `archer` | `cottage`, `lumber_camp`, `farm`, `barracks` | — | `champ_tomas` | 1 |
| 2 | — | `forge`, `watchtower` | `melee_weapons`, `ranged_ammo`, `melee_armor` | `champ_elara` | 1 |
| 3 | `cavalier`, `ballista`, `sapper`, `ranger` | `stable`, `workshop`, `wall_human` | `siege_damage`, `woodcutting`, `ranged_class`, `melee_weapons@2`, `melee_armor@2`, `ranged_ammo@2`, `ranger_longbow` | `hero_brann` | 2 |
| 4 | `glider`, `tanker`, `barge`, `frigate`, `dreadnought`, `submersible` | `shipyard`, `refinery`, `foundry`, `oil_platform` | `naval_cannons`, `naval_hulls`, `naval_cannons@2`, `naval_hulls@2`, `siege_damage@2` | `champ_estrela_dalva` | 3 |
| 5 | `mage`, `templar`, `gryphon_rider` | `arcane_tower`, `temple`, `aviary` | `cavalry_class`, `ranger_sight`†, `ranger_marksman`†, `spell_fireball`, `spell_slow`, `spell_flameshield`†, `spell_invisibility`†, `spell_polymorph`†, `spell_blizzard`†, `spell_heal`, `spell_exorcism`, `spell_holy_vision`† | `hero_oren` | 3 |
| 6 | — | — | — | `champ_aurora` | 3 |
| 7–9 | — | — | — | (elenco acumulado) | 3 |
| 10 | — | — | — | `hero_orsolo` | 3 |
| 11 | — | — | — | `hero_lyra` | 3 |
| 12 | — | — | — | `hero_dorian` | 3 |

Totais: 16 unidades (14 + Petroleiro e Barcaça neutros), 16 construções (15 + a Plataforma), 27 fichas de pesquisa. † = candidatas a mudar para a m6 (§4.1).

### 4.3 Tabela da Horda (`orc`, `factionId: 'orc'`)
| # | `units` | `buildings` | `research` | `heroes` | Tier |
|---|---|---|---|---|---|
| 1 | `peon`, `grunt`, `axethrower` | `orc_house`, `orc_lumber_mill`, `pig_farm`, `orc_barracks` | — | `hero_drogath` | 1 |
| 2 | — | `orc_forge`, `orc_watchtower` | `melee_weapons`, `ranged_ammo`, `melee_armor` | `champ_rurga` | 1 |
| 3 | `ogre`, `catapult`, `arsonist`, `berserker`, `war_balloon` | `ogre_den`, `orc_workshop`, `wall_orc` | `siege_damage`, `woodcutting`, `ranged_class`, `melee_weapons@2`, `melee_armor@2`, `ranged_ammo@2`, `berserker_range` | `champ_brakka` | 2 |
| 4 | `tanker`, `barge`, `war_galley`, `iron_leviathan`, `colossal_turtle` | `ship_dock`, `naval_forge`, `ash_cauldron`, `oil_platform` | `naval_cannons`, `naval_hulls`, `naval_cannons@2`, `naval_hulls@2`, `siege_damage@2` | `champ_orvanna` | 3 |
| 5 | `necromancer`, `war_serpent`, `ogre_mage` | `ash_sanctum`, `storm_altar`, `serpent_nest` | `cavalry_class`, `berserker_regen`†, `berserker_fury`†, `spell_death_touch`, `spell_raise_dead`, `spell_haste`†, `spell_unholy_armor`†, `spell_ash_cloud`†, `spell_whirlwind`†, `spell_eye`, `spell_bloodlust`, `spell_runes`† | `champ_narga` | 3 |
| 6 | — | — | — | `champ_zarruk` | 3 |
| 7–9 | — | — | — | (elenco acumulado) | 3 |
| 10 | — | — | — | `hero_vozgul` | 3 |
| 11 | — | — | — | `hero_grok` | 3 |
| 12 | — | — | — | `hero_skarn` | 3 |

`skeleton` e `watching_eye` são invocações (`cost: null`): ficam cobertas pelas pesquisas `spell_raise_dead` e `spell_eye`, como no F8-06.

### 4.4 Verificação feita (script descartável, fora do repositório; sem alterar nada)
Importando `src/data/{units,buildings,upgrades,factions}.js`, para **cada** facção e cada missão: (a) todo id existe e é da facção ou neutro (`tanker`, `barge`, `oil_platform`); (b) nenhum item se repete entre missões; (c) os `requires` de construções, unidades e fichas de pesquisa (`{hq:N}` contra o `Tier` da missão, tipo de construção, `{research}`, `{role}`) são satisfeitos por itens liberados **antes ou junto**; (d) cada unidade tem construção treinadora liberada (ou é promoção por pesquisa: `ranger`, `templar`, `berserker`, `ogre_mage`); (e) toda pesquisa tem a construção de pesquisa liberada (`forge`, `lumber`, `arcane`, `temple`, `foundry` por papel); (f) o nível 2 vem depois ou junto do nível 1; (g) cobertura: **16 unidades, 16 construções e 27 fichas por facção**, nada faltando. **Resultado: 0 problemas nas duas tabelas.** Cadeias conferidas: `barracks`/`orc_barracks` ← `farm`/`pig_farm` (m1); `stable`/`ogre_den`, `workshop`/`orc_workshop` ← quartel + Centro 2 (m3); `shipyard`/`ship_dock` ← quartel + Centro 2 (m4; a pesquisa naval exige Fundição/Fornalha Naval ← estaleiro); `dreadnought`, `submersible`, `iron_leviathan`, `colossal_turtle` ← Centro 3 + Fundição/Fornalha (m4); `arcane_tower`/`ash_sanctum`, `aviary`/`serpent_nest` ← quartel + Centro 3; `temple` ← `stable` + Centro 3; `storm_altar` ← `ogre_den` + Centro 3 (m5); `cavalry_class` exige o Templo/Altar.

### 4.5 Um personagem novo por missão (m1–m6) e os heróis da história (m10–m12)
| Missão | Aliança | Horda | Tipo |
|---|---|---|---|
| 1 | Sgt. Tomás Rocha | Drogath Punho-de-Brasa (já existe) | campeão / herói |
| 2 | Elara Pinheiral | Rurga Faro-Fino | campeão |
| 3 | Capitão Brann (já existe) | Brakka Presa-Negra | herói / campeão |
| 4 | Estrela-d'Alva (navio) | Orvanna Maré-Negra (galé) | campeão naval |
| 5 | Mestre Oren (já existe) | Narga Asa-Rota | herói / campeão |
| 6 | Dama Aurora | Zarruk Fornalha | campeão |
| 10 | Mestre Orsolo | Vozgul | herói (jogável) |
| 11 | Capitã Lyra Ventosa | Grok Quebra-Muros | herói (jogável) |
| 12 | Marechal Dorian Vasques | Skarn | herói (jogável) |

Os três heróis das m10–12 são os **citados pela história** nas missões anteriores (briefings e diálogos de 2 a 9 os mencionam; na m8/m9 aparecem como NPC ou chefe). Cada campanha libera também, nas missões 7–9, o **elenco acumulado** (sem personagem novo).

### 4.6 Lacunas de dados encontradas e propostas
| # | Lacuna | Evidência | Proposta |
|---|---|---|---|
| L1 | **Só 3 heróis** (`hero_brann`, `hero_oren`, `hero_drogath`): faltam 12 personagens da §4.5 e Dorian, Lyra, Orsolo, Skarn, Vozgul, Grok. | `src/data/heroes.js` deriva de `units.js` (`unique: true`) | **15 tipos novos** em `src/data/units.js` (§5), só dados |
| L2 | **O orc não tem cavalaria/lobos**; o Ogro (`ogre`) e o Ogro Feiticeiro (`ogre_mage`) fazem esse papel (`factions.js` `units.cavalry: 'ogre'`). | `UNITS` orc | aceitar (como no F8-06); a cobertura por categoria usa `ogre` |
| L3 | **O humano não tem "tropa pesada de brejo"**: nenhum (é decisão de design, não lacuna). | — | nenhuma |
| L4 | `skeleton`, `watching_eye` não são treináveis. | `cost: null` | cobertos por pesquisa; na lista de exceções do teste de cobertura |
| L5 | **Segundo Centro**: o jogador não pode construí-lo (`castle`/`great_hall` fora da `buildList`); o Marco da Colônia (m10) precisa nascer por `spawnBuilding`. | `src/data/factions.js` `buildList` | roteiro `spawnBuilding`; ver risco R3 (verificar `UPGRADE_HQ` e `setTier` com 2 Centros) |
| L6 | **Sem condição "usar magia"** nos gatilhos. | `missions/README.md` | objetivos por contagem/pesquisa |
| L7 | **IA naval** ainda não existe (NEW-44, local). | `HANDOFF_CLOUD.md` | frotas roteirizadas (§3.3) |
| L8 | Heróis imunes à Transmutação, únicos por partida; campeões novos seguem a regra `unique`. | `heroes.js` | aceitar |
| L9 | Habilidades de herói: só `hero_war_cry`, `hero_arcane_bolt`, `hero_mend`. | `abilities.js` | os heróis novos **reutilizam** essas; habilidades novas (ex.: aura de moral, mergulho) ficam fora do MVP |
| L10 | Retratos/ícones dos 15 novos (`icon: '/icoEspada.png'` provisório). | `units.js` | provisório na nuvem; arte local depois (F7-09) |
| L11 | `README` de campanhas diz "nenhum herói existe ainda" (F4-08 já feita). | `src/data/campaigns/README.md` | corrigir no passo de docs |
| L12 | O epílogo da Aliança cita **Brumar entre os clãs vencidos** (Brumar é porto humano). | `alliance/campaign.json` | corrigir ao reescrever (G12 do F8-06) |

---

## 5. Dados novos propostos (só `src/data`; sem código)

### 5.1 Regra
Cada tipo novo é uma entrada em `src/data/units.js` ao estilo de `hero_brann`/`hero_drogath`: `unique: true`, `cost: null`, `trainTime: null`, `modelOf: <unidade base>`, `scaleMul`, nome (`name`, `entityName`), `faction`, `abilities` (reuso), ícone provisório. **Números**: proporções, não valores (CLAUDE.md: números de balanceamento vivem em `src/data/`; não duplicar). **Campeão**: PV ≈ 1,8× e dano ≈ 1,4× da base, sem habilidades, `scaleMul` ≈ 1,1, `isHero: false`. **Herói**: PV ≈ 2,5× e dano ≈ 1,6× da base, `isHero: true`, `scaleMul` ≈ 1,2–1,5, uma habilidade reaproveitada.

### 5.2 Humanos (7)
| id | nome | `modelOf` | tipo | habilidade (reuso) |
|---|---|---|---|---|
| `champ_tomas` | Sgt. Tomás Rocha | `knight` | campeão | — |
| `champ_elara` | Elara Pinheiral | `archer` | campeão | — |
| `champ_estrela_dalva` | Estrela-d'Alva | `frigate` | campeão naval | — |
| `champ_aurora` | Dama Aurora | `cavalier` | campeão | — |
| `hero_orsolo` | Mestre Orsolo | `mage` | herói | `hero_mend` |
| `hero_lyra` | Capitã Lyra Ventosa | `gryphon_rider` | herói (aéreo) | `hero_war_cry` |
| `hero_dorian` | Marechal Dorian Vasques | `cavalier` | herói | `hero_war_cry` |

### 5.3 Orcs (8)
| id | nome | `modelOf` | tipo | habilidade (reuso) |
|---|---|---|---|---|
| `champ_rurga` | Rurga Faro-Fino | `axethrower` | campeão | — |
| `champ_brakka` | Brakka Presa-Negra | `ogre` | campeão | — |
| `champ_orvanna` | Orvanna Maré-Negra | `war_galley` | campeão naval | — |
| `champ_narga` | Narga Asa-Rota | `war_serpent` | campeão (aéreo) | — |
| `champ_zarruk` | Zarruk Fornalha | `arsonist` | campeão | — |
| `hero_vozgul` | Vozgul, a Profetisa | `necromancer` | herói | `hero_arcane_bolt` |
| `hero_grok` | Grok Quebra-Muros | `ogre_mage` | herói | `hero_war_cry` |
| `hero_skarn` | Skarn, chefe-de-brasa | `ogre` | herói (chefe) | `hero_war_cry` |

### 5.4 Efeitos esperados
Os campos de camada aérea/naval (`flying`, água) herdam da unidade base pela mesma via que `modelOf` herda stats; **verificar na execução** que `hero_lyra`/`champ_narga` voam e que `champ_estrela_dalva`/`champ_orvanna` flutuam (o criador é `GameManager.spawnUnit`; se algum campo não herdar, copiar explicitamente na entrada de dados). `HEROES`/`HERO_TYPES` passam a ter 3 + 15 = 18 itens. O validador de campanha já exige que cada `unlocks.heroes` exista em `UNITS` e seja da facção (L1). Os campeões `isHero: false` não ganham barra ampliada; se o dono quiser que **todos** tenham, basta `isHero: true` (pergunta §10-6).

---

## 6. Final: a fortaleza, o bloqueio e o gancho

### 6.1 Missão 12 (`alliance-12-bastiao-do-cabo-ferrugem` / `horde-12-cidadela-de-brasa-alta`)
Estrutura em **três atos** dentro da mesma partida (gatilhos por tempo e por objetivo):
1. **Construir (0–8 min)**: o Marco (Centro avançado, já em nível 2 pela m11) é evoluído ao **nível 3** (**Castelo de Aldária** / **Cidadela de Ferro**); 4 Torres de Vigia, 8 trechos de Muralha e 2 Balistas/Catapultas na área marcada ("o Bastião"). Os guarda-costas do inimigo atacam em ondas leves.
2. **Bloquear (8–16 min)**: o litoral entre o promontório e as ilhas tem 3 Docas inimigas (`ship_dock` na Aliança, **Estaleiro**/Docas humanas na Horda). Destruí-las e **manter 2 navios de guerra no estreito 90 s** sem inimigo na área → o mar fica **fechado**: ilustra a frase do briefing ("bloqueando o acesso às ilhas").
3. **Defender e chefe (16–25 min)**: o **ataque final** do chefe inimigo (Skarn na Aliança; Marechal Dorian na Horda), com ondas e o herói; cai o chefe (ou, na Horda, foge ferido: ver gancho) e o objetivo fecha.
- **Chefe**: um herói do inimigo (`hero_skarn`/`hero_dorian`) cercado de guarda. Se o dono preferir um chefe mais forte que o herói jogável, pergunta §10-6.
- **Derrota**: o Centro avançado cai ou o herói principal morre (padrão de campanha).

### 6.2 Tela final (reusa `CampaignVictory`)
`epilogue` no `campaign.json` (validado por `validateCampaign`, 3–5 parágrafos, `faction: 'human'|'orc'`, `credits`), arte `public/ui/art/victory_human.webp` / `victory_orc.webp` (slot; o SVG procedural atual cobre a falta), fanfarra `victoryFanfareHuman`/`Orc`. A tela mostra "VITÓRIA", o epílogo em sequência, estatísticas e botões Menu / Rejogar / Estatísticas (sem mudança de código).

**Epílogo da Aliança (rascunho; título "O Farol do Outro Lado" / "The Lighthouse on the Other Shore")**
1. pt-BR: "Quando a última torre do Bastião do Cabo Ferrugem foi coroada, o Mar Fendido ficou, pela primeira vez, do lado de Aurelan. As rotas dos clãs para os Estilhaços calaram-se, e os estaleiros da Horda arderam em silêncio." · en: "When the last tower of the Cape Rust Bastion was crowned, the Sundered Sea lay, for the first time, on Aurelan's side. The clans' routes to the Shards fell silent, and the Horde's shipyards burned without a sound."
2. pt-BR: "A Rainha Sevelin recebeu a notícia na Baía de Aurelan e não sorriu. O Mestre Orsolo redesenhou o mapa: onde havia vazio, agora havia uma fortaleza em terra alheia." · en: "Queen Sevelin heard the news at Aurelan Bay and did not smile. Master Orsolo redrew the map: where there had been emptiness, there now stood a fortress on foreign soil."
3. pt-BR: "O Marechal Dorian e a Capitã Lyra juraram guardar a ponta do mundo. Brann e Oren ensinaram aos recrutas o nome de cada ilha que custou sangue; a Dama Aurora e a Estrela-d'Alva guardam o estreito." · en: "Marshal Dorian and Captain Lyra swore to guard the tip of the world. Brann and Oren taught the recruits the name of every island that cost blood; Dame Aurora and the Estrela-d'Alva keep the strait."
4. pt-BR: "Mas, nas noites de vento seco, da muralha se vê uma luz vermelha além das dunas: as fogueiras do Cinzal ainda ardem. Expulsá-los de vez, ou marchar sobre o que resta? Essa pergunta fica para o próximo inverno." · en: "But on nights of dry wind, a red light can be seen from the wall beyond the dunes: the Cinzal fires still burn. Drive them out for good, or march on what remains? That question waits for the next winter."
Créditos: "Fim da Marcha da Aliança" / "End of the Alliance March".

**Epílogo da Horda (rascunho; título "A Brasa que Não se Apaga" / "The Ember That Never Dies")**
1. pt-BR: "Quando a última torre da Cidadela de Brasa-Alta ergueu o estandarte, o Mar Fendido deixou de ser uma muralha e virou estrada. As Docas de Aurelan queimaram, e os navios dos reinos voltaram para casa." · en: "When the last tower of Highember Citadel raised the banner, the Sundered Sea stopped being a wall and became a road. Aurelan's docks burned, and the kingdoms' ships turned for home."
2. pt-BR: "Drogath acendeu o Fogo do Clã no meio da terra verde, e a Anciã Ulma o abençoou à distância. Pela primeira vez em três invernos, nenhum clã passou sede." · en: "Drogath lit the Clan Fire in the middle of the green land, and Elder Ulma blessed it from afar. For the first time in three winters, no clan went thirsty."
3. pt-BR: "Vozgul guardou a memória dos mortos da guerra; Grok reergueu as muralhas; Skarn jurou que o Cinzal nunca mais seria fechado por ninguém." · en: "Vozgul kept the memory of the war's dead; Grok rebuilt the walls; Skarn swore the Cinzal would never be shut in by anyone again."
4. pt-BR: "Mas, no Mar Fendido, uma vela branca continua à vista: Aurelan ainda tem frota e memória. Fixar-se na terra verde, ou levar a guerra ao coração de Velmara? A brasa decide no próximo inverno." · en: "But on the Sundered Sea a white sail remains in sight: Aurelan still has a fleet and a memory. Settle the green land, or carry the war to the heart of Velmara? The ember will decide next winter."
Créditos: "Fim do Caminho das Brasas" / "End of the Ember Road".

### 6.3 O gancho em aberto (campanha futura)
Nada é decidido: o jogo guarda só um sinal no fim de cada campanha.
- **Expulsão** (campanha II "A Maré Vazante"): obrigar o outro lado a abandonar a costa, destruindo seus portos e retomando os Estilhaços que sobrarem; tom defensivo/de contra-ataque.
- **Conquista** (campanha II "O Coração de Velmara"/"O Coração do Cinzal"): marchar sobre a **capital** do adversário (Baía de Aurelan / Planalto do Cinzal), ainda **inexplorada** (as regiões "Terras Altas do Véu" e "Coração do Cinzal" aparecem no mapa-múndi como pergaminho em branco).
- Sementes já plantadas na campanha: um herói inimigo **escapa** (Dorian ferido, na Horda; Skarn em retirada, na Aliança, só em cutscene), a frota restante do outro lado, o selo de cera quebrado no mapa-múndi final. Estado persistido: apenas `completed.<missionId>` (sem ramificação), mais um campo opcional de "capítulo II disponível" quando existir.

---

## 7. Migração do que já existe

### 7.1 As 8 missões da Aliança
Estratégia: **mesmos ids de campanha** (`alliance`, `horde`), **novos ids de missão** (`alliance-NN-*`), arquivos antigos movidos com `git mv` (histórico preservado) e reescritos no passo correspondente. **Não tocar** em `m04-*.json` enquanto a correção local (NEW-53) não for mesclada (`HANDOFF_CLOUD.md`, "arquivos em edição local").

| Antiga (mapa) | Vira | O que se aproveita | O que se reescreve |
|---|---|---|---|
| `m01-fumaca-no-vale` (`campos-1v1`) | **A01** Terra à Vista | construir Quartel, destruir acampamento, 500 de ouro, santuário oculto | inimigo orc → Irmandade da Maré (neutros); santuário → Mural da Fenda; textos; unlocks |
| `m02-cativos-da-garganta` (`desfiladeiro-1v1`) | **A02** Pouso do Encontro | resgate de 4 + escolta; secundários de pesquisa | contexto (náufragos, emissário); Ferraria/Torre; Elara |
| `m03-muralhas-de-alvorada` (`estreito-1v1`) | **A03** Ouro da Pedra-Mãe | sobreviver a ondas; torres e muralha | Brann entra aqui; Estábulo/Oficina/Cerco/Cavaleiro passam para cá; Mervane |
| `m04-ponte-do-rio-turvo` (`continental-1v1`) | **A11** (comboio) e parte de **A09** (Forte Atalaia) | comboio de 4 carregadores; Forte Atalaia por `spawnBuilding`; emboscada | `m04` fica **congelada** até a NEW-53; o conteúdo é copiado para os novos arquivos depois |
| `m05-ferro-e-brasa` (`bosques-2v2`) | **A05** O Cerne Verde | economia, IA inimiga, reforços aos 8 min | Brann sai (vai à A03); entram magia e ar; Oren |
| `m06-ilhas-de-brasa` (`ilhas-4p`) | **A04** (naval) e **A06** (2 IAs + aliado) | Estaleiro/Plataforma/afundar; aliado Brumar | dividir em duas missões; `unlocks` redistribuídos |
| `m07-traicao-presa-negra` (`vales-2v2`) | **A07** O Brejo Mudo | `setTeam` aos 330 s, sobreviver, destruir o traidor | o traidor vira o **governador Mervane** (humano), não o Presa-Negra |
| `m08-queda-do-cinzal` (`planalto-ffa-4p`) | **A08** (magos cativos, Ninho) e **A12** (chefe Skarn, ondas, cutscene final) | `rescue` de 6 magos; Ninho + Serpes; boss ogro; cena final | A12 passa à construção da fortaleza + bloqueio; epílogo reescrito (G12) |
| — | **A09, A10** novas; **A11** (parte nova) | — | escritas do zero |

### 7.2 O briefing F8-06 (Horda; PR #48 ainda não mesclado)
- **Aproveita-se**: elenco e clãs (Drogath, Vozgul, Grok, Ulma, Brakka, Hurgan, Zarruk, Orvanna; Chama-Baixa, Lanças Quebradas, Presa-Negra, Forja Negra, Marés Negras, Sal Cinzento), **Honra do Clã** (objetivo oculto de conduta), a regra "Drogath derrota se morrer" (opcional), o método de verificação do §3.2 (script), os testes do §7 e os passos de execução do §6 (adaptados), as lacunas G1–G12, o tom (sobrevivência, honra, escalada).
- **Não se aproveita / muda**: o **arco** (a conquista dos vales da Aliança por Skarn e a rebelião de Drogath, §1.3/§1.5 do F8-06) é substituído pela Guerra do Mar Fendido; **8 missões → 12**; a tabela `unlocks` é **substituída** (§4.3); a tese "mesma guerra convergindo nas m07–m08" vira "crônicas espelhadas sobre palcos compartilhados"; Skarn deixa de ser um tirano a ser morto por Drogath e passa a **chefe-de-brasa unificador** (e boss na Aliança), com o desfecho de rebelião guardado como **gancho possível** da campanha II. Sugestão: **mesclar o PR #48 apenas como referência**, com uma nota no topo "substituída por `MUNDO-HISTORIA-CAMPANHA.md`", ou **fechá-lo** (decisão do dono, §10-12).

### 7.3 `campaign.json` e `unlocks`
- `alliance/campaign.json`: reescrever `missions` (12 entradas) e `unlocks` (§4.2), `epilogue` (§6.2), `premise` e `heroes` (lista dos novos), `provisional: true` até o dono aprovar. `horde/campaign.json`: novo, mesma forma.
- `src/data/campaigns/index.js`: importar as 24 missões (`CAMPAIGN_MISSIONS`) e registrar `[alliance, horde]` (hoje só `[alliance]`).
- `validateCampaign` (`src/campaign/campaign.js`): sem mudança (herói da facção, repetição, nível 2 após o 1). Verificar apenas se aceita `unique` com `isHero: false` em `unlocks.heroes` (lê `UNITS[id].faction`; sim).
- **Progresso salvo** (`warpoly.campaign.v1`): os ids de missão mudam, então o `completed` antigo **não conta** (ids desconhecidos são ignorados; conferir em `progress.js` e `nextMission`) e a campanha recomeça; aceitável (`provisional`), registrar no relatório. Opcional: mapa de migração `oldId → newId` (uma vez) para não perder progresso nas 5 missões equivalentes.

### 7.4 Testes
- `tests/unit/campaignAlliance.test.js`: **parametrizar por campanha** (`describe.each(['alliance','horde'])`): 12 missões, objetivo primário/secundário/oculto, bilíngue, terra/água, ordem e desbloqueio, carry-over, `unlocks` completos (16/16/27), requisitos alcançáveis, nada entregue antes de liberado, cobertura por categoria (para o orc, `cavalry` = `ogre`), personagens por missão (m1–6 um novo; m10–12 os heróis da história).
- `tests/unit/campaignPlaythrough.test.js`: hoje há um roteiro de ações **por missão** (injetadas). Para 24 missões: **roteiro por dados** (arquivo `tests/fixtures/campaign-playthrough/<id>.json` com ações e esperas) + um corredor genérico; manter a simulação headless até a vitória, derrotas e determinismo. Reescrever por lote (§8).
- `tests/unit/techRestriction.test.js`: sem mudança.
- Novos: `storyScreen.test.js` (modelo + validação de `world.json`), `heroesData.test.js` (15 tipos: unique, `modelOf` válido, facção, ícone), `campaignProgressMigration.test.js`.

### 7.5 Seletor de campanha (`src/ui/screens/CampaignScreen.js`)
Hoje usa `listCampaigns()[0]` e o texto `menu.campaignHint` fixo ("Aliança"). Mudar para **seletor de campanha** (abas ou cartões: Aliança | Horda) com progresso por campanha (já suportado: `progress.campaigns[<id>]`), `menu.campaignHint` genérico, botão "Rever a história" (§2). **Fase seguinte (opcional)**: a lista de missões vira o **mapa-múndi** (pergaminho com os continentes e as ilhas como nós clicáveis, usando `worldMapShapes.js`), com a ilha da missão destacada. Nenhuma dependência de rede.

---

## 8. Plano de execução (nuvem; um passo = um commit; branch `cloud/MUNDO-<n>`)
Todos os passos terminam com `npm test`, `npm run lint`, `npx vite build --outDir /tmp/build-check` (HANDOFF §2). No máximo 3 agentes em paralelo (uma branch por passo).

| Passo | Conteúdo | Depende de | Observação |
|---|---|---|---|
| **0** | **Decisões do dono** (§10, principalmente 1–5) | — | bloqueia 3–9 |
| **1** | **Javalis (fase visual/textos)**: i18n, `buildings.js`, `Critter.js`, `CritterModel.js`/materiais, `AssetPreloader`, docs; ícone `/icoJavali.svg` provisório | 0 (pergunta 4) | teste de i18n; captura: **pendente (local)** |
| **2** | **Dados de personagens**: 15 tipos em `units.js` + teste `heroesData` + ajuste do `README` de campanhas (L11) | 0 | independente de mapas |
| **3** | **Tela de história**: `world.json`, `campaignStoryModel.js`, `CampaignStory.js`, `campaignStoryArt.js`, `worldMapShapes.js`, i18n, integração, testes | 0 | compartilhar formas com a spec de mapas |
| **4** | **Seletor de campanha + progresso**: `CampaignScreen`, `menu.campaignHint`, migração de progresso, `index.js` (registro das duas campanhas), testes | 2, 3 | |
| **5** | **Lote A (m1–m3)** das duas campanhas: 6 JSON + `unlocks` + roteiros de teste | 2, 4; mapas provisórios | começa pela Aliança (reaproveita `m01`–`m03`) |
| **6** | **Lote B (m4–m6)**: naval, magia/ar, Prova de Fogo | 5 | frotas roteirizadas (L7) |
| **7** | **Lote C (m7–m9)**: traição, forja, cabeça de ponte | 6 | `m04` congelada até a NEW-53 |
| **8** | **Lote D (m10–m12)** + epílogos + `victory_*` (slot) | 7; spec de mapas (palcos continentais) | requer R3 (segundo Centro) verificado |
| **9** | **Testes de cobertura e progressão** (parametrizar, §7.4) e i18n completa (pt-BR/en; `campaign.unlock.*` já existe) | 5–8 | pode rodar em paralelo com cada lote |
| **10** | **Docs**: `src/data/campaigns/README.md`, `docs/08_GAME_DESIGN.md` (lore), `docs/specs/README.md`; coordenador atualiza `TASKS.md` | tudo | |

**Dependências com a spec de mapas** (`MUNDO-TERRENO-MAPAS.md`): (a) os **16 mapas** (8 ilhas + 8 continentais) com os nomes e terrenos da §1.6; (b) **pontos nomeados** (`anchors`) para as missões; (c) `worldMapShapes.js` compartilhado (formas dos continentes e ilhas); (d) distribuição de **espécies de critters por bioma** (javalis × ovelhas); (e) o quanto de madeira o mapa precisa (a meta de madeira do F8-06 G11: mapas gerados novos podem reprovar em `tools/lib/woodStats.mjs`). Até lá, vale a tabela de mapas provisórios (§3.2).

**Riscos técnicos**: R1 `techRestriction` entra no checksum só quando presente (ok); R2 IA por dados nos mapas novos (F5-06); **R3** Centro avançado: `setTier` e `UPGRADE_HQ` com dois Centros ou com o Centro criado por `spawnBuilding` (verificar `GameManager`/`commands` antes do lote D; se faltar, restringir à evolução do Marco como único Centro "ativo"); R4 **naval**: sem IA naval até a NEW-44; R5 **dois idiomas** em 24 missões (volume de texto: ~300 linhas por campanha); R6 desempenho do SVG procedural da história (usar `will-change` e poucas camadas); R7 **escopo**: 24 missões é grande: entregar a Aliança primeiro (§3.1).

**O que só se verifica jogando (pendente, local)**: duração de 10–25 min por missão e dificuldade (ondas, chefes); equilíbrio das IAs; escala do tutorial (a m5 carregada, †); legibilidade dos mapas (ilha irregular, terreno pantanoso/gelado/vulcânico); rotas navais e desembarques; chefes e **fogo amigo/herói morto** na m12; ritmo, texto e música da tela de história; aparência dos javalis e do ícone; arte `victory_*`; leitura de diálogos; HUD com campeões (retratos); se a campanha "pesa" em frames.

---

## 9. Riscos de roteiro
- **Crônicas espelhadas**: um jogador que faz as duas verá cada lado vencer; a ponte narrativa (o sinal do outro no fim) evita contradição explícita. Se o dono preferir cânone único, trocar só o epílogo e a m12 (§10-2).
- **Ambiguidade dos continentes** (§10-1): se trocar, as imagens e os nomes se invertem e as tabelas de regiões/missões trocam de lado, mas a estrutura não muda.
- **Tom**: a Horda não é "o mal": fome e orgulho. Sem violência explícita: conflito é nas ações de jogo; cativos e traições aparecem em diálogo (pergunta §10-9).

---

## 10. Perguntas em aberto para o dono
1. **Continentes e facções (ambiguidade do briefing)**: o texto não diz com todas as letras quem vive em qual continente; adotei **orcs = desertos/pântanos/estepes (Cinzara)** e **humanos = montanhas nevadas/florestas/savanas (Velmara)**, coerente com as imagens. Confirma, ou prefere trocar (humanos no deserto)?
2. **Cânone**: duas **crônicas espelhadas** em que cada lado vence em seu relato (recomendado) ou **um cânone único** (por exemplo, "fortalezas gêmeas" que se anulam)?
3. **Nomes**: Ondara, Velmara, Cinzara, Mar Fendido, Os Estilhaços e as ilhas (Pouso do Encontro, Pedra-Mãe, Baixio do Breu, Cerne Verde, A Geada, Brejo Mudo, Fornalha, Miragem), colônias (Porto Albor, Brasa-Alta), fortalezas e personagens novos estão aprovados? Aposentamos "Gorthak" do GDD?
4. **Javalis**: troca **só visual e de textos** (recomendada; "Cercado de Javalis"/"Boar Pen"; ids ficam) ou também renomear os ids internos (`pig_farm`, espécie `pig`) e migrar mapas e salvamentos?
5. **Quantidade de personagens**: 15 tipos novos (7 humanos, 8 orcs) são aceitáveis? Alternativa enxuta: só os 6 heróis da história e usar unidades comuns nomeadas em diálogo nas missões 1–6.
6. **Heróis x campeões**: os campeões (m1–m6) devem ter barra/retrato de herói (`isHero: true`) ou ficam como unidades únicas comuns? O chefe da m12 pode ser mais forte que o herói jogável?
7. **Liberação**: tudo liberado **ao fim da m5 (41,7 %)** com a m6 como "Prova de Fogo" (recomendado) ou ao fim da m6 (50 %)? E as magias avançadas (†) já na m5?
8. **Heróis jogáveis nas m10–12**: Orsolo, Lyra, Dorian (Aliança) e Vozgul, Grok, Skarn (Horda): aprovados? Skarn jogável na Horda?
9. **Tom**: Mervane (traidor humano), Hurgan (traidor orc), contrabando, cativos e a Horda como povo com fome: aceitável (implícito/diálogo, sem violência explícita)?
10. **Gancho**: preferem sugerir mais **expulsão**, mais **conquista**, ou manter perfeitamente neutro?
11. **Colônia (segundo Centro)**: aceita o Marco da Colônia criado por script (`spawnBuilding`), ou quer uma **mecânica nova** (construir um segundo Centro; tarefa de código)?
12. **F8-06 (PR #48)**: mesclar como referência (com nota "substituída") ou fechar? E a ordem: **Aliança completa (12) antes da Horda**?
13. **Tela de história**: aprovada a duração de ~75 s, a faixa nova de música e **sem locução** no MVP? Arte final por painel (local, Blender/ilustração) com que prioridade? `victory_human/orc.webp` entram junto?
14. **Mapa-múndi na tela de campanha** (nós clicáveis nas ilhas): faz parte do escopo agora ou depois?
15. **Progresso salvo**: aceita que o progresso antigo da campanha da Aliança (8 missões) seja descartado, ou quer migração dos ids equivalentes?
16. **Dificuldade**: única por missão (como hoje) ou seletor fácil/normal/difícil na campanha?

---

## 11. Verificação feita nesta spec
Script descartável (fora do repositório; nada no repositório foi alterado além deste documento e da linha no índice): importou `src/data/{units,buildings,upgrades,factions}.js` e conferiu (a) que **todos** os ids citados em backticks nas tabelas de `unlocks` existem e são da facção correta; (b) as cadeias de requisitos (§4.4: 0 problemas, 16/16/27 por facção); (c) que **não existem** hoje os 15 ids novos (`champ_*`, `hero_dorian|lyra|orsolo|skarn|vozgul|grok`) e que existem `hero_brann`, `hero_oren`, `hero_drogath`; (d) que `pig_farm`, `Critter` (`'pig'`), `CRITTER_SPECIES` e `icoPorco.svg` existem onde a §1.4 diz; (e) que `buildList` não contém o Centro (L5). Nada precisa de navegador.
