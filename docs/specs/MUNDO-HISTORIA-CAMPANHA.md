# MUNDO-HISTORIA-CAMPANHA · O novo mundo, a história e as campanhas (12 missões por facção)

> **Status: SPEC revisada (decisões do dono de 2026-10-11 aplicadas; não iniciada)**. Escrita em 2026-10-11 por Sonnet 5.5. **Só documento: nenhum código, nenhum JSON de missão.** Fonte: [`MUNDO-BRIEFING-DONO.md`](MUNDO-BRIEFING-DONO.md) (em caso de dúvida, vale o briefing). Arquivos irmãos: `MUNDO-TERRENO-MAPAS.md` (mapas, terreno, ilhas como geografia jogável) e [`MUNDO-HEROIS.md`](MUNDO-HEROIS.md) (os 6 heróis: histórias, habilidades, aparência). Perguntas ainda abertas: §10.
> Leia antes: `CLAUDE.md`, `docs/historico/HANDOFF_CLOUD.md` (§2, regras da nuvem), `docs/specs/_COMUM.md`, `src/data/campaigns/README.md`, `docs/specs/F8-06-campanha-horda.md` (briefing da Horda; **preservado** como campanha "Clássica (beta)", §7), `src/data/missions/README.md`, `docs/specs/MUNDO-HEROIS.md`, `docs/05_PARIDADE_WARCRAFT2.md` (nada de nomes ou lore da Blizzard).
> Executores: agentes **sonnet** na nuvem (sem navegador/GPU), em lotes (§8). Arte, música, modelos 3D e tudo que exige jogar ficam **pendentes (local)**.
> Imagens de referência (em `docs/refs/mundo/`): `mapa-mundi-referencia.png` (pergaminho, contorno irregular, rosa dos ventos, selo de cera), `terreno-humano-exuberante.webp`, `terreno-orc-deserto.webp`.

---

## 0. Resumo para o dono (leitura de 1 minuto)

> **Revisão de 2026-10-11**: aplica as 7 decisões do dono (§0.1). O que mudou em relação à primeira versão: continentes confirmados, crônicas espelhadas confirmadas, mapa-múndi só ilustrativo, **3 heróis por facção em vez de 15 personagens novos** (ver [`MUNDO-HEROIS.md`](MUNDO-HEROIS.md)), liberação "tutorial nas missões 1–6, tudo liberado depois" e **duas entradas de campanha** (principal × "Clássica (beta)").

- **Mundo**: o planeta **Ondara**. Dois continentes isolados por milhões de anos pela **Fenda** (hoje o **Mar Fendido**): **Velmara** (**oeste**; montanhas nevadas, florestas, savanas; exuberante; casa dos **humanos**, o Reino de Aurelan e a **Aliança**) e **Cinzara** (**leste**; desertos, pântanos, estepes; casa dos **orcs**, os Clãs do Cinzal e a **Horda**). Entre eles, **Os Estilhaços**: oito ilhas de terrenos diferentes (pedregosa, vulcânica, pantanosa, gelada, deserta, florestal, recifes de petróleo e o ponto de encontro).
- **Estrutura**: **duas campanhas espelhadas** (principal: "A Guerra do Mar Fendido", facções `human` e `orc`, 12 missões cada) sobre **os mesmos 12 "palcos"** (oito ilhas compartilhadas, vistas de lados opostos; quatro palcos continentais diferentes por facção). Cada lado conta a guerra do seu ponto de vista e **vence na sua história**; o final de cada uma é uma **fortaleza no continente do adversário que bloqueia o acesso às ilhas**, com **gancho aberto** para uma campanha futura.
- **Mapa-múndi**: só **ilustrativo** (dois continentes e ilhas entre eles). **Não é jogável** nem navegável; as missões acontecem em mapas próprios que, se ficar interessante, podem ser **marcados** no mapa-múndi (§7.2).
- **Liberação**: tutorial **progressivo nas missões 1–6**; **a árvore completa (16 unidades, 16 construções, 27 fichas de pesquisa por facção) está liberada a partir da missão 6** ("Prova de Fogo"); 7–12 sem restrição. **Sem "personagem novo por missão"**.
- **Heróis (6 no total)**: por facção, um **Capitão, um Mago e um Comandante**. Aliança: **Brann** (m3), **Oren** (m10), **Dorian** (m11). Horda: **Drogath** (m3), **Vozgul** (m10), **Skarn** (m11). Na m12 os três atuam juntos. Só 3 tipos novos em `units.js` (Dorian, Vozgul, Skarn) e 14 habilidades novas (efeitos existentes; uma extensão mínima de código). Detalhes, histórias e fichas de aparência em [`MUNDO-HEROIS.md`](MUNDO-HEROIS.md).
- **Final**: a m12 é construir e defender uma **fortaleza** (o Centro evoluído ao nível 3 + torres + muralhas) no continente do adversário e **bloquear as rotas para as ilhas**. O chefe cai; um **sinal no horizonte** abre a continuação (expulsão ou conquista).
- **Migração (decisão 7)**: a campanha atual da Aliança (8 missões, `src/data/campaigns/alliance/`, id `alliance`) e o briefing da Horda (F8-06) **ficam intactos** numa entrada separada, rotulada **"Campanha Clássica (beta)"**; a campanha nova de 12 missões é a **principal**. O seletor de campanha tem duas entradas, o progresso é salvo **por campanha** e **nada da beta é apagado** (§7). Fauna: **javalis** no lugar de porcos (troca visual e de textos, §1.4).
- **Perguntas ainda abertas: §10** (nenhuma muda o escopo).

### 0.1 Decisões do dono (2026-10-11) e onde foram aplicadas
| # | Decisão | Onde |
|---|---|---|
| 1 | Orcs no **leste** (Cinzara, desértico); humanos no **oeste** (Velmara, exuberante) | §1.2, §2 painel 3 |
| 2 | Campanhas **espelhadas**; final = fortaleza no continente adversário bloqueando as ilhas; gancho aberto | §3.1, §6 |
| 3 | Mapa-múndi **só ilustrativo**; missões em mapas próprios, marcáveis no mapa-múndi se ficar interessante | §2, §7.2 |
| 4 | Bioma **só visual**; lava pode ser limite de passagem (como rios) | §1.6 (e `MUNDO-TERRENO-MAPAS.md`) |
| 5 | Todos os nomes propostos **aprovados** (Ondara, Velmara, Cinzara, Mar Fendido, Estilhaços, ilhas, Mervane, Hurgan…) | §1, §10 |
| 6 | **3 heróis por facção** (Capitão, Mago, Comandante), jogáveis conforme a história | §1.8, §3.4–§3.7, §4.5, §5, `MUNDO-HEROIS.md` |
| 7 | Campanha atual da Aliança + F8-06 preservadas como **"Campanha Clássica (beta)"**; a nova é a principal | §7 |

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

**Atribuição (decisão do dono, 2026-10-11)**: **orcs no LESTE (Cinzara, desértico)** e **humanos no OESTE (Velmara, exuberante)**. Os nomes `Aurelan`, `Cinzal`, `Brumar`, `Alvorada` e o rio `Turvo` já existem no jogo; os mantemos para reaproveitar texto e missões. O bioma é **só visual** (não muda regras de jogo); **lava** (Fornalha) pode ser **limite de passagem** em mapas, como os rios.

### 1.3 Os povos
**Aliança de Aurelan (humanos)**. O Reino de Aurelan (capital na Baía de Aurelan, Rainha **Sevelin**) é o mais antigo dos reinos de Velmara e liderou a **Aliança**: uma liga de reino e cidades-porto (entre elas **Brumar**, o porto-fortaleza do sul). Cultura de mercadores, cartógrafos e cavaleiros; a Academia de Cartografia Arcana (Mestre **Orsolo**) desenha o primeiro mapa do mar. Tecnologia: pedra, ferro, madeira naval, grifos domesticados, magia de torres.
**Horda do Cinzal (orcs)**. Os **Clãs do Cinzal** (Chama-Baixa, Lanças Quebradas, Presa-Negra, Forja Negra, Marés Negras, Sal Cinzento: nomes de F8-06) vivem em Cinzara e dividem poços e rebanhos. Cultura de **fogo, memória e clã**: cada clã guarda um braseiro (o **Fogo do Clã**). Tecnologia: ferro de forja, óleo, serpes, ritos de cinza. Quando a seca aperta, o chefe-de-brasa **Skarn** une os clãs numa **Horda**: o contrário da leitura simplista "orc = vilão": a Horda é um povo que **precisa** do mar.
O nome do povo orc antigo, "Gorthak" (do GDD), é **aposentado** (nomes aprovados pelo dono em 2026-10-11).

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
| **Fornalha** | **vulcânica**: basalto, fendas de lava, cinzas, fumarolas | ouro e obsidiana; o **Monte Caldeira**; **rios de lava** como limite de passagem (como rios de água) | Horda (forja e santuário) | 8 |
| **Miragem** | **deserta**: dunas, ruínas, **três poços** | água (poços), pouco mais | ninguém | 9 |

Convenções para os mapas (a spec irmã usa estes nomes): ilhas de **contorno irregular** (enseadas, penínsulas, ilhotas satélites), nada de "lobos circulares ligados por pontes". Os quatro palcos continentais: **Baía de Aurelan** / **Praia das Cinzas Vermelhas** (missão 1, "casa"), e **Costa Ferrugem**/**Cabo Aurora** (missão 10), **Estepe do Vento**/**Savana de Âmbar** (missão 11), **Cabo Ferrugem**/**Cabo Aurora** (missão 12), conforme a campanha. O bioma de cada ilha é **só visual**; as fronteiras de passagem (rios, lava) são decididas na spec de mapas. O **mapa-múndi** onde as ilhas aparecem é **apenas ilustrativo** (não jogável); as missões ocorrem nos mapas próprios de cada palco.

### 1.7 O conflito, a colônia e o ataque final
1. **Choque nas ilhas** (missões 2–9): cada ilha muda de mãos. Aliança ataca ou defende conforme a posição; cada lado tem **um traidor/rival** (Mervane na Aliança, Hurgan na Horda) e **um aliado leal** (Brumar / Presa-Negra).
2. **Cabeça de ponte** (missão 9): quem toma **Miragem** (a última ilha antes da costa inimiga) fecha o circuito de bases e abre a travessia.
3. **Colônia** (missões 10–11): desembarque numa costa hostil, um Marco da Colônia (Centro avançado: **Porto Albor**, humano; **Brasa-Alta**, orc), economia sob ataque e reforços por mar.
4. **Fortaleza e bloqueio** (missão 12): o Centro da colônia vira **Castelo de Aldária** (humano) / **Cidadela de Ferro** (orc) com torres e muralhas, e a frota/torres **fecham o estreito** entre o continente alheio e as ilhas.
5. **Gancho**: a ameaça imediata acaba, mas o inimigo **não foi vencido em casa** (§6.3).

### 1.8 Personagens (todos inventados)
**Os 6 heróis jogáveis** (fichas completas em [`MUNDO-HEROIS.md`](MUNDO-HEROIS.md)):
| Herói | Lado | Papel | Tipo no jogo | Entra (jogável) |
|---|---|---|---|---|
| **Capitão Brann** | Aliança | Capitão: tanque da guarnição | `hero_brann` (existe) | **m3** |
| **Mestre Arcano Oren** | Aliança | Mago: cartógrafo arcano, aprendiz de Orsolo | `hero_oren` (existe) | **m10** (cameo na m5) |
| **Marechal Dorian Vasques** | Aliança | Comandante: estrategista da Guarda Real | `hero_dorian` (**novo**) | **m11**; chefe final da Horda (m12) |
| **Drogath Punho-de-Brasa** | Horda | Capitão: capitão de guerra do Clã Chama-Baixa | `hero_drogath` (existe) | **m3** |
| **Vozgul, a Profetisa** | Horda | Mago: guardiã da memória dos mortos | `hero_vozgul` (**novo**) | **m10** (cameo na m5) |
| **Skarn, chefe-de-brasa** | Horda | Comandante: unificador dos clãs, ogro de coroa de ferro | `hero_skarn` (**novo**) | **m11**; chefe final da Aliança (m12) |

**NPCs** (só diálogo/cutscene; em campo usam **unidades comuns** nomeadas, **sem entrada nova em `units.js`**):
| Personagem | Lado | Papel | Aparece |
|---|---|---|---|
| **Rainha Sevelin** | Aliança | soberana de Aurelan; voz da campanha | 1–12 |
| **Mestre Orsolo** | Aliança | cartógrafo arcano e mentor de Oren; **morre libertando os magos presos na m8** | 2, 5, 8 |
| **Capitã Lyra Ventosa** | Aliança | comandante dos grifos (um `gryphon_rider` nomeado) | 8, 9, 11 |
| **Sgt. Tomás Rocha** / **Elara Pinheiral** | Aliança | sargento (Espadachim nomeado) e batedora (Arqueira nomeada) | 1 / 2 |
| **Dama Aurora** / caravela **Estrela-d'Alva** | Aliança | Cavaleiro nomeado aliado de IA / `frigate` nomeada | 6 / 4 |
| **Governador Aldric Mervane** | Aliança (**vilão interno**, cunhado de Dorian) | governador de Pedra-Mãe, explora a mina, vende ferro à Horda e trai | 3 (cutscene), aliado→inimigo na m7 |
| **Brumar** (porto) | Aliança | aliado leal de IA | 4, 6, 9 |
| **Anciã Ulma** | Horda | guardiã do Fogo do Clã; **morre ao fim da m9** e Drogath herda o fogo | 1–9 |
| **Grok Quebra-Muros** | Horda | mestre de cerco (`ogre_mage` nomeado; **deixa de ser herói**) | 9 (Aliança), 11 (Horda) |
| **Rurga Faro-Fino** / **Brakka Presa-Negra** | Horda | batedora lanceira / chefe do Clã Presa-Negra (Ogro nomeado) | 2 / 3 |
| **Orvanna Maré-Negra** / **Narga Asa-Rota** / **Zarruk Fornalha** | Horda | `war_galley`, `war_serpent` e `arsonist` nomeados | 4 / 5 / 6 |
| **Hurgan Lança-Partida** | Horda (**rival interno**) | chefe do Clã das Lanças Quebradas | m1–m2 rival; aliado→inimigo na m7 da Horda |
| **Irmandade da Maré** | neutro | contrabandistas e piratas que saqueiam as duas costas | jogador neutro (id 99) + `bandit_camp`, m1 |

**Nomear unidades comuns**: o nome vive no diálogo/briefing (a `speaker` da fala) e, se o dono quiser, no `title` do objetivo; a unidade em campo é um `knight`, `gryphon_rider` etc. do jogador ou da IA. Nenhum NPC é "único" (podem morrer sem efeito de regra). Os `hero_*` são os únicos com barra ampliada e habilidades próprias.

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

**Os heróis na abertura**: no painel 7a/7b as três silhuetas da facção aparecem ao fundo (Aliança: Brann, Oren, Dorian; Horda: Drogath, Vozgul, Skarn), sem fala, como promessa do que virá (ver [`MUNDO-HEROIS.md`](MUNDO-HEROIS.md)). O mapa dos painéis 1, 2, 4, 5 e 6 é a mesma ilustração do mapa-múndi ilustrativo (§7.2).

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
- **Ilustração procedural** `src/ui/campaignStoryArt.js` (SVG/canvas gerado por código, como `campaignVictoryArt.js`): pergaminho com ruído e manchas; **contornos de continente e ilha por ruído fractal radial/ruído de curva** (semente fixa) para parecerem naturais e irregulares, tracejado de tinta, hachuras do mar, rosa dos ventos, selo de cera, moldura ornamental, **rachadura** que separa o supercontinente (painel 2: translação das duas metades), rotas pontilhadas animadas (`stroke-dashoffset`) e veleiros (painéis 4–5), ilhas com miniatura de terreno (painel 6). O módulo de **formas** (`worldMapShapes.js`: contornos de Velmara, Cinzara e Estilhaços) é **compartilhado com a spec de mapas** (o mapa-múndi da `CampaignScreen`, §7.2) para que a história, o mapa-múndi e os mapas jogáveis falem do mesmo mundo.
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
- **Cânone (decisão do dono, 2026-10-11)**: **Crônicas espelhadas**: cada campanha é o relato do seu povo e vence em seu relato. O epílogo de cada lado termina com um **sinal do outro** no horizonte, que mantém aberto o gancho (§6.3) sem desmentir a outra campanha. Cada campanha termina com o estabelecimento de uma fortaleza no continente do adversário que bloqueia o acesso às ilhas, e deixa um gancho aberto.
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
- Elenco: a partir da missão N a missão pode criar (`spawn`) os **heróis já liberados** da facção (§4.5); NPCs nomeados são unidades comuns. Um herói morto fica fora da partida (regra de `heroes.js`), não da campanha.
- Honra (objetivo oculto de conduta) vale nas duas campanhas (poupar um emissário, não perder uma barcaça etc.).

### 3.4 Campanha da Aliança: `war-alliance` ("A Guerra do Mar Fendido: a Marcha da Aliança", `factionId: 'human'`)
Resumo: ids em `src/data/campaigns/war-alliance/mNN-*.json` (campanha **principal**; a campanha antiga `alliance` continua intacta como "Clássica (beta)", §7). Os ids de missão usam o prefixo `war-alliance-NN-`; abaixo, `alliance-NN-` é só abreviatura de leitura.

| # | id (slug) | Nome | Palco | Heróis jogáveis | Ideia |
|---|---|---|---|---|---|
| 1 | `…-01-terra-a-vista` | Terra à Vista | Baía de Aurelan | — | economia, Quartel, Irmandade da Maré; mural; vela estrangeira |
| 2 | `…-02-pouso-do-encontro` | O Pouso do Encontro | Pouso do Encontro | — | resgate e escolta; primeiro contato; Forja |
| 3 | `…-03-ouro-da-pedra-mae` | Ouro da Pedra-Mãe | Pedra-Mãe | **Brann** (Capitão) | segurar a mina; muralhas, cavalaria, cerco |
| 4 | `…-04-baixio-do-breu` | O Baixio do Breu | Baixio do Breu | Brann | Estaleiro, petróleo, batalha naval |
| 5 | `…-05-cerne-verde` | O Cerne Verde | Cerne Verde | Brann | madeira; magos e grifos (cameo de Oren) |
| 6 | `…-06-a-geada` | A Geada | A Geada | Brann | **Prova de Fogo**: árvore completa, 2 IAs, aliado |
| 7 | `…-07-brejo-mudo` | O Brejo Mudo | Brejo Mudo | Brann | traição do governador Mervane |
| 8 | `…-08-a-fornalha` | A Fornalha | Fornalha | Brann | resgate de magos; morte de Orsolo; Vozgul |
| 9 | `…-09-miragem` | Miragem | Miragem | Brann | cabeça de ponte; contra-ofensiva de Grok |
| 10 | `…-10-desembarque` | Desembarque na Costa Ferrugem | Costa Ferrugem | Brann + **Oren** (Mago) | travessia por Barcaças, Marco da Colônia |
| 11 | `…-11-porto-albor` | Porto Albor | Estepe do Vento | Brann + Oren + **Dorian** (Comandante) | colônia sob cerco; reforços |
| 12 | `…-12-bastiao-do-cabo-ferrugem` | O Bastião do Cabo Ferrugem | Cabo Ferrugem | Brann + Oren + Dorian (reunião) | fortaleza + bloqueio + Skarn; gancho |

### 3.5 Campanha da Horda: `war-horde` ("A Guerra do Mar Fendido: o Caminho das Brasas", `factionId: 'orc'`)
| # | id (slug) | Nome | Palco | Heróis jogáveis | Ideia |
|---|---|---|---|---|---|
| 1 | `…-01-cinzas-vermelhas` | Cinzas Vermelhas | Praia das Cinzas Vermelhas | — | economia, Acampamento de Guerra, saqueadores; mural; velas brancas |
| 2 | `…-02-velas-brancas` | Velas Brancas | Pouso do Encontro | — | resgate de batedores e escolta; primeiro contato; Forja |
| 3 | `…-03-a-pedra-que-brilha` | A Pedra que Brilha | Pedra-Mãe | **Drogath** (Capitão) | **assalto** à colônia mineira; Ogros, cerco |
| 4 | `…-04-mare-de-breu` | Maré de Breu | Baixio do Breu | Drogath | Doca, petróleo, batalha naval |
| 5 | `…-05-madeira-de-guerra` | Madeira de Guerra | Cerne Verde | Drogath | madeira; necromantes e serpes (cameo de Vozgul) |
| 6 | `…-06-fogo-no-gelo` | Fogo no Gelo | A Geada | Drogath | **Prova de Fogo** |
| 7 | `…-07-casa-no-brejo` | Casa no Brejo | Brejo Mudo | Drogath | defender o brejo; traição de Hurgan |
| 8 | `…-08-monte-caldeira` | O Monte Caldeira | Fornalha | Drogath | defender a forja até o rito de Vozgul |
| 9 | `…-09-ultimo-poco` | O Último Poço | Miragem | Drogath | cabeça de ponte; contra-ofensiva de Dorian; morte de Ulma |
| 10 | `…-10-cabo-aurora` | Desembarque no Cabo Aurora | Cabo Aurora | Drogath + **Vozgul** (Mago) | travessia, Marco da Colônia |
| 11 | `…-11-brasa-alta` | Brasa-Alta | Savana de Âmbar | Drogath + Vozgul + **Skarn** (Comandante) | colônia sob cerco |
| 12 | `…-12-cidadela-de-brasa-alta` | A Cidadela de Brasa-Alta | Cabo Aurora (ponta leste) | Drogath + Vozgul + Skarn (reunião) | cidadela + bloqueio + Dorian; gancho |

### 3.6 Fichas da campanha da Aliança
Formato: **P** primário · **S** secundário · **O** oculto · **IA** inimigos · **Al** aliados · **Per** personagens · **Min** duração · **Ensina**. As unidades usam ids de `src/data`.

**A01 · `war-alliance-01-terra-a-vista` · Terra à Vista** (Baía de Aurelan; verde, costa turquesa, enseadas) · Min 10–12.
- **P**: erguer um **Quartel** (`barracks`), treinar 3 Espadachins (`knight`) e 4 Arqueiros (`archer`); destruir o acampamento da Irmandade da Maré (`bandit_camp`).
- **S**: coletar 500 de ouro. **O**: achar o **Mural da Fenda** (ruína, área oculta): dá +100 ouro e o texto da Fenda.
- **IA**: nenhuma (neutros hostis, jogador 99: 4 guardas com leash). **Al**: nenhum. **Per**: Sgt. **Tomás Rocha** (NPC; um Espadachim nomeado em diálogo) conduz o esquadrão inicial; Brann e Dorian são citados na carta da Rainha.
- Fecho: cutscene com uma vela estranha no horizonte (gancho para a m2). **Ensina**: câmera, coleta, construção, treino, ordem de ataque.

**A02 · `war-alliance-02-pouso-do-encontro` · O Pouso do Encontro** (Pouso; praias e a Torre da Fenda em ruínas) · Min 12–15.
- **P**: libertar 4 pescadores presos num forte de troncos (`rescue`) e escoltá-los ao Cais (`escort`). **S**: pesquisar Armas Forjadas (`melee_weapons`) na **Ferraria** nova. **O**: **poupar o Emissário** (um orc que ergue pano branco; `Honra`) e ganhar +100 de ouro e um aviso de emboscada.
- **IA**: patrulha leve do Clã Chama-Baixa (`grunt`, `axethrower`). **Al**: nenhum. **Per**: **Elara Pinheiral** (NPC; Arqueira nomeada), batedora; **Drogath** (inimigo, só cutscene) comanda a patrulha.
- Cutscene: o incidente; ninguém sabe quem atirou. **Ensina**: Ferraria, Torre de Vigia (`watchtower`), pesquisas, escolta, névoa e reconhecimento.

**A03 · `war-alliance-03-ouro-da-pedra-mae` · Ouro da Pedra-Mãe** (Pedra-Mãe; rochedos, platôs, ouro) · Min 15–18.
- **P**: segurar o Paço 7 min contra ondas vindas do mar (Barcaças, `survive`). **S**: erguer 2 Torres e 6 trechos de Muralha de Pedra (`wall_human`); treinar 4 Cavaleiros (`cavalier`). **O**: pesquisar Escudos Reforçados (`melee_armor`) antes da 3ª onda (+150).
- **IA**: Clã Presa-Negra em ondas crescentes (Talhadores, Lanceiros-Machado, Ogros, 1 Catapulta; `ogre`, `catapult`). **Al**: nenhum. **Per**: **Capitão Brann** (`hero_brann`, **jogável a partir daqui**: primeiro herói) comanda a guarnição; o governador **Mervane** aparece em cutscene (arrogante, mais interessado no ouro que nos homens).
- **Ensina**: defesa em profundidade (muralha + torre), Estábulo, Oficina e cerco, heróis (mana, unicidade e as 3 habilidades do Capitão).

**A04 · `war-alliance-04-baixio-do-breu` · O Baixio do Breu** (recifes; ilhotas e água rasa) · Min 15–20.
- **P**: construir o **Estaleiro** (`shipyard`), erguer **2 Plataformas** (`oil_platform`) com o Petroleiro (`tanker`) e afundar a frota de patrulha orc. **S**: afundar 3 Galés (`war_galley`). **O**: não perder nenhuma Fragata (`frigate`).
- **IA**: frota de Orvanna (roteirizada; Galés, 1 Leviatã tardio). **Al**: **Porto de Brumar** envia um primeiro lote de petróleo. **Per**: a caravela **Estrela-d'Alva** (uma `frigate` nomeada, aliada de IA) chega aos 5 min.
- **Ensina**: petróleo, Estaleiro, Refinaria, Fundição, combate naval, transporte (Barcaça).

**A05 · `war-alliance-05-cerne-verde` · O Cerne Verde** (floresta densa, clareiras, bosque sagrado) · Min 18–22.
- **P**: coletar 2000 de madeira e destruir o posto madeireiro dos clãs (Salão do Bosque). **S**: treinar 2 Magos (`mage`) e 1 Cavaleiro Grifo (`gryphon_rider`). **O**: pesquisar Ordenação (`cavalry_class`) e treinar um Templário (`templar`) (+300).
- **IA**: Clã Forja Negra (Necromantes `necromancer`, Serpes `war_serpent`, Esqueletos). **Al**: nenhum. **Per**: Brann (jogável); **Oren** (NPC aqui; cameo: lidera 2 Magos de IA aliados e ensina a Bola de Fogo); **Vozgul** (inimiga; voz em diálogo) comanda os Necromantes.
- **Ensina**: Torre Arcana, Templo, Aviário, magias (Bola de Fogo, Lentidão), voo e visão.

**A06 · `war-alliance-06-a-geada` · A Geada (Prova de Fogo)** (gelada; geleiras e o Farol Boreal) · Min 20–25.
- **P**: tomar e manter o **Farol Boreal** (`area`) por 3 min e destruir o forte do Clã Lanças Quebradas (Hurgan). **S**: proteger o comboio de Brumar. **O**: terminar sem perder o Cavaleiro nomeado **Dama Aurora** (aliada de IA).
- **IA**: 2 IAs orcs (Lanças Quebradas, Sal Cinzento). **Al**: Brumar (IA, cujo forte não pode cair). **Per**: Brann (jogável); **Dama Aurora** (NPC; Cavaleiro nomeado aliado de IA); **Drogath** (chefe do forte dos Lanças Quebradas, inimigo).
- **Ensina**: armas combinadas, todas as categorias, transporte e naval juntos; primeira missão com a **árvore completa** (as últimas magias entram aqui).

**A07 · `war-alliance-07-brejo-mudo` · O Brejo Mudo** (pantanosa; juncos, lama) · Min 18–22.
- **P**: destruir o **Cercado de Javalis** e o Salão de Brakka (a base de abastecimento) **e sobreviver à traição**: aos 5:30 o governador Mervane (aliado de IA) vira inimigo (`setTeam`) e abre o brejo a Brakka. **S**: capturar o depósito de contrabando de ferro de Mervane. **O**: manter 4 Magos vivos.
- **IA**: Presa-Negra (Brakka) + traição. **Al**: Mervane (até 5:30). **Per**: Brann (jogável); Mervane (NPC) trai.
- **Ensina**: leitura de diplomacia, defesa contra aliado traidor, mobilidade lenta no brejo. Reaproveita `alliance-07-traicao-presa-negra`.

**A08 · `war-alliance-08-a-fornalha` · A Fornalha** (vulcânica; basalto, lava) · Min 20–25.
- **P**: destruir o **Santuário das Cinzas** (`ash_sanctum`) e a **Fornalha Naval** (`naval_forge`) e matar **Vozgul**; **S**: libertar 6 prisioneiros (magos de Orsolo, `rescue`). **O**: sem perder Grifos.
- **IA**: Vozgul (chefe) com Necromantes, Serpes e Ogros; Skarn só em voz. **Al**: o esquadrão de grifos da **Capitã Lyra** chega aos 8 min. **Per**: Brann (jogável); **Orsolo** (NPC), entre os cativos, **morre libertando os outros** (Oren herda os cadernos); **Vozgul** (chefe, inimiga).
- **Ensina**: ataque a um ponto fortificado com magias, ar e cerco. Reaproveita os magos cativos e o Ninho de `alliance-08-queda-do-cinzal`.

**A09 · `war-alliance-09-miragem` · Miragem (cabeça de ponte)** (deserta; três poços) · Min 20–25.
- **P**: tomar os 3 poços (`area`) e fincar o **Forte Atalaia** (Torres + Muralha) por 8 min contra a grande contra-ofensiva de **Grok** (Catapultas, Ogros Feiticeiros, Serpes). **S**: destruir o Ninho das Serpes (`serpent_nest`). **O**: poços intactos.
- **IA**: Horda (difícil). **Al**: reforços navais de Brumar. **Per**: Brann (jogável); **Grok** (`ogre_mage` nomeado, inimigo) comanda a contra-ofensiva; Skarn em cutscene.
- **Ensina**: defender em arco com muralha e torres; cerco adversário. Reaproveita `alliance-04` (forte Atalaia) e `alliance-03` (ondas).

**A10 · `war-alliance-10-desembarque` · Desembarque na Costa Ferrugem** (costa inimiga: dunas e foz de brejo) · Min 15–20.
- **P**: atravessar com 2 Barcaças (`barge`; 12 unidades), destruir a guarda costeira (3 torres) e fundar o **Marco da Colônia** (o Centro avançado é criado por `spawnBuilding` quando a área é segurada). **S**: perder no máximo uma Barcaça. **O**: achar o Poço Velho.
- **IA**: guarnição costeira de Skarn (IA terrestre). **Per**: **Mestre Oren** (`hero_oren`, **jogável a partir daqui**; herdou os cadernos de Orsolo) desenha o terreno (revela área); Brann lidera o desembarque.
- **Ensina**: operação anfíbia.

**A11 · `war-alliance-11-porto-albor` · Porto Albor** (Estepe do Vento; capim seco) · Min 20–25.
- **P**: evoluir o Marco ao **nível 2 (Fortaleza)**, juntar 3000 de ouro e resistir a 3 incursões (12 min). **S**: erguer Estábulo e Aviário na colônia. **O**: converter um clã dissidente (`transfer`) em aliado.
- **IA**: Skarn (difícil), Hurgan. **Al**: reforços por mar (Barcaças a cada 4 min). **Per**: **Marechal Dorian Vasques** (`hero_dorian`, **jogável a partir daqui**, chega com a 2ª onda); a Capitã **Lyra Ventosa** (NPC; Cavaleiro Grifo nomeado) traz o esquadrão; Brann e Oren.
- **Ensina**: economia remota, logística por mar. Reaproveita o comboio de `alliance-04-ponte-do-rio-turvo`.

**A12 · `war-alliance-12-bastiao-do-cabo-ferrugem` · O Bastião do Cabo Ferrugem** (Cabo Ferrugem; falésias, estreito) · Min 22–25.
- **P** (3 partes): (1) **construir o Bastião**: Centro no nível 3 (**Castelo de Aldária**), 4 Torres de Vigia, 8 trechos de Muralha e 2 Balistas na área; (2) **bloquear as rotas**: destruir as 3 Docas orcs (`ship_dock`) do litoral e manter 2 navios de guerra no estreito 90 s sem inimigos; (3) **sobreviver ao ataque final** de Skarn (chefe) até ele cair.
- **S**: matar Skarn pessoalmente. **O**: nenhum trecho de muralha cai.
- **IA**: Horda com todas as tropas, Skarn (boss), ondas. **Al**: a frota da Aliança. **Per**: os três heróis juntos (Brann, Oren, Dorian), mais Lyra (NPC) nos grifos; chefe inimigo **Skarn**.
- Cutscene final e gancho (§6).

### 3.7 Fichas da campanha da Horda
**H01 · `war-horde-01-cinzas-vermelhas` · Cinzas Vermelhas** (Praia das Cinzas Vermelhas; dunas, brejo no limite) · Min 10–12.
- **P**: construir o **Acampamento de Guerra** (`orc_barracks`), treinar 3 Talhadores (`grunt`) e 4 Lanceiros-Machado (`axethrower`), destruir o acampamento dos Saqueadores (`bandit_camp`, Irmandade da Maré). **S**: 500 de ouro. **O**: o **Mural da Fenda** (vista dos clãs; +100).
- **IA**: nenhuma (neutros). **Per**: **Drogath Punho-de-Brasa** é citado e aparece em cutscene (comanda a praia; ainda não jogável); a **Anciã Ulma** guarda o Fogo do Clã (diálogo).
- Fecho: velas brancas no horizonte. **Ensina**: o mesmo que A01, com o Cercado de Javalis (`pig_farm`) como fazenda.

**H02 · `war-horde-02-velas-brancas` · Velas Brancas** (Pouso do Encontro) · Min 12–15.
- **P**: resgatar 4 batedores presos pela patrulha humana e escoltá-los à barcaça. **S**: pesquisar Lâminas de Guerra (`melee_weapons`). **O**: **poupar um Mensageiro** humano (Honra; +100).
- **IA**: patrulha de Aurelan (Espadachins, Arqueiros). **Per**: **Rurga Faro-Fino** (NPC; Lanceiro-Machado nomeado). **Ensina**: Forja e Torre de Vigia (`orc_watchtower`).

**H03 · `war-horde-03-a-pedra-que-brilha` · A Pedra que Brilha** (Pedra-Mãe, **atacante**) · Min 15–18.
- **P**: destruir os 3 fortes da colônia mineira e o Paço do governador Mervane; **S**: capturar as 2 minas de ouro (coletar 1500) e erguer Torre e Paliçada (`wall_orc`) na cabeça de ponte; **O**: não perder nenhum Lacaio.
- **IA**: guarnição humana (Balistas, Cavaleiros) com o **Capitão Brann** como chefe. **Al**: Presa-Negra (IA). **Per**: **Drogath** (`hero_drogath`, **jogável a partir daqui**: primeiro herói) lidera o assalto; **Brakka** (NPC; Ogro nomeado) vem com o Presa-Negra. **Ensina**: Covil dos Ogros, Catapultas, ataque a base fortificada, muralhas.

**H04 · `war-horde-04-mare-de-breu` · Maré de Breu** (Baixio do Breu) · Min 15–20.
- **P**: construir a **Doca do Clã** (`ship_dock`), erguer 2 Plataformas e afundar a esquadra de Aurelan. **S**: afundar 3 Fragatas. **O**: nenhuma Galé perdida.
- **IA**: frota roteirizada humana (Fragatas, Couraçado). **Al**: Marés Negras. **Per**: Drogath (jogável); **Orvanna Maré-Negra** (NPC; `war_galley` nomeada, aliada de IA). **Ensina**: petróleo, Caldeirão, Fornalha Naval, naval.

**H05 · `war-horde-05-madeira-de-guerra` · Madeira de Guerra** (Cerne Verde, **assalto ao bosque**) · Min 18–22.
- **P**: coletar 2000 de madeira e destruir o bosque-forte de Aurelan; **S**: 2 Necromantes e 1 Serpe de Guerra (`war_serpent`); **O**: pesquisar Ritual das Tempestades (`cavalry_class`) e formar 1 Ogro Feiticeiro (`ogre_mage`).
- **IA**: Aurelan (Magos, Grifos, Arqueiros). **Per**: Drogath (jogável); **Narga Asa-Rota** (NPC; Serpe de Guerra nomeada); **Vozgul** (cameo: ensina o Erguer Mortos com respeito); inimigo: **Oren** (mago do Bosque). **Ensina**: Santuário, Altar, Ninho, magias.

**H06 · `war-horde-06-fogo-no-gelo` · Fogo no Gelo (Prova de Fogo)** (A Geada) · Min 20–25.
- **P**: tomar o Farol Boreal 3 min e destruir a base de Brumar; **S**: proteger o comboio de Marés Negras; **O**: terminar com **Zarruk** vivo.
- **IA**: 2 IAs humanas (Brumar, Guarda Real). **Al**: Marés Negras (IA). **Per**: Drogath (jogável); **Zarruk Fornalha** (NPC; Incendiário nomeado, aliado de IA); inimigo: **Brann** (comandante do forte de Brumar). **Ensina**: árvore completa; primeira missão com tudo.

**H07 · `war-horde-07-casa-no-brejo` · Casa no Brejo** (Brejo Mudo, **defensor**) · Min 18–22.
- **P**: segurar o Salão e os Cercados de Javalis contra a frota de Aurelan e **sobreviver à traição**: aos 5:30 **Hurgan** (aliado de IA, comprado com ferro de Mervane) vira inimigo (`setTeam`). **S**: destruir o depósito de ferro do traidor. **O**: manter 4 Necromantes vivos.
- **IA**: Aurelan + Hurgan. **Al**: Hurgan (até 5:30). **Per**: Drogath (jogável); **Hurgan** (NPC) trai. **Ensina**: diplomacia, defesa contra traidor.

**H08 · `war-horde-08-monte-caldeira` · O Monte Caldeira** (Fornalha, **defensor**) · Min 20–25.
- **P**: proteger a Forja e o Santuário por 10 min enquanto **Vozgul** conclui o rito, e concluir 2 Leviatãs de Ferro (`iron_leviathan`); **S**: libertar guardas presos; **O**: manter Zarruk vivo.
- **IA**: Aurelan (Magos, Grifos, cerco) com o esquadrão de Lyra. **Per**: Drogath (jogável); **Vozgul** (NPC aqui) conduz o rito; inimigos: **Oren** e o esquadrão de Lyra. **Ensina**: logística de produção sob pressão.

**H09 · `war-horde-09-ultimo-poco` · O Último Poço** (Miragem, cabeça de ponte) · Min 20–25.
- **P**: tomar os 3 poços e erguer o Forte do Poço por 8 min contra a contra-ofensiva do **Marechal Dorian** (Cavaleiros, Balistas, Grifos). **S**: destruir o Aviário (`aviary`) inimigo. **O**: poços intactos.
- **IA**: Aurelan (difícil). **Al**: reforços das Marés Negras. **Per**: Drogath (jogável); a **Anciã Ulma** morre ao fim da missão (cutscene) e Drogath herda o Fogo do Clã. **Ensina**: defesa em arco, antiaéreo (Lanceiros, Serpes).

**H10 · `war-horde-10-cabo-aurora` · Desembarque no Cabo Aurora** (Velmara; verde, costa irregular) · Min 15–20.
- **P**: atravessar com 2 Barcaças, destruir a guarda costeira (3 Torres) e fundar o Marco da Colônia (**Brasa-Alta**); **S**: perder no máximo uma Barcaça; **O**: achar o Bosque do Orvalho.
- **IA**: guarnição de Aurelan. **Per**: **Vozgul** (`hero_vozgul`, **jogável a partir daqui**) e Drogath.

**H11 · `war-horde-11-brasa-alta` · Brasa-Alta** (Savana de Âmbar; capim alto, rios) · Min 20–25.
- **P**: evoluir o Marco ao **nível 2 (Bastião)**, 3000 de ouro e resistir a 3 incursões; **S**: erguer Covil e Ninho na colônia; **O**: converter um posto avançado da Aliança (`transfer`).
- **IA**: Aurelan (difícil, Grifos). **Al**: reforços por mar. **Per**: **Skarn** (`hero_skarn`, **jogável a partir daqui**, chega com a 2ª onda), Drogath e Vozgul; **Grok** (NPC; Ogro Feiticeiro nomeado) comanda o cerco; inimiga: **Lyra** com grifos.

**H12 · `war-horde-12-cidadela-de-brasa-alta` · A Cidadela de Brasa-Alta** (Cabo Aurora, ponta leste; farol, estreito) · Min 22–25.
- **P**: (1) **Cidadela**: Centro no nível 3 (**Cidadela de Ferro**), 4 Torres, 8 Paliçadas e 2 Catapultas; (2) **bloquear as rotas**: destruir as 3 Docas humanas (incluindo Brumar) e manter 2 galés no estreito 90 s; (3) sobreviver ao ataque do **Marechal Dorian** (chefe) até ele cair ou fugir.
- **S**: destruir o Farol do Cabo (o último ponto de sinal da Aliança). **O**: nenhuma Paliçada cai.
- **Per**: os três heróis juntos (Drogath, Vozgul, Skarn), mais Grok (NPC) nos cercos; chefe inimigo **Dorian**. Gancho (§6).

> Os objetivos usam só tipos de condição que existem (`build`, `destroy`, `collect`, `rescue`, `escort`, `survive`, `flag`, `area`, `count`, `research`; não há "usar magia", G8 do F8-06). "Salvar uma Barcaça", "manter vivo" e "bloquear" são `count`/`dead`/`area` em gatilhos.

---

## 4. Progressão de liberação (`unlocks`)

### 4.1 Regra e posição exata
- **Regra do dono (revisão 2026-10-11)**: **tutorial progressivo nas missões 1–6** (da coisa mais simples à mais avançada); **da missão 7 em diante tudo liberado**. **Não há "personagem novo por missão"**: os heróis entram pela história (§4.5 e [`MUNDO-HEROIS.md`](MUNDO-HEROIS.md) §2).
- **Posição**: a árvore completa fecha **na missão 6** (6/12 = 50 %). A missão 6 ("Prova de Fogo") libera as últimas fichas de pesquisa avançadas (marcadas †) e é a **primeira jogada com a árvore completa**; as missões 1–5 distribuem o resto. (A primeira versão fechava na m5, 41,7 %; a regra nova do dono põe a conclusão no fim do tutorial, na m6. Se a playtest mostrar a m6 carregada, parte dos † volta para a m5 mudando só o JSON.)
- **Ordem de tutorial**: m1 economia e infantaria básica → m2 melhorias (Forja, Torre) → m3 nível 2 (cavalaria, cerco, muralha) e **o primeiro herói (Capitão)** → m4 naval e petróleo (nível 3) → m5 magia e ar (básico) → m6 magias e promoções avançadas (†) = tudo. Nas missões 7–12 **nada é restringido** (`unlocks` sem unidades/construções/pesquisas; só os heróis das m10 e m11).
- **Nível do Centro (`setTier`)**: m1–m2 nível 1, m3 nível 2, m4–m12 nível 3 (a campanha concede o nível que a tecnologia exige, como hoje). Nas missões 10–12 o Centro avançado (Marco da Colônia) nasce no nível 1 e **o jogador o evolui** (nível 2 na m11, nível 3 na m12); `setTier` não é aplicado a ele (§8, risco R3).

### 4.2 Tabela da Aliança (`human`, `factionId: 'human'`)
| # | `units` | `buildings` | `research` | `heroes` | Tier |
|---|---|---|---|---|---|
| 1 | `villager`, `knight`, `archer` | `cottage`, `lumber_camp`, `farm`, `barracks` | — | — | 1 |
| 2 | — | `forge`, `watchtower` | `melee_weapons`, `ranged_ammo`, `melee_armor` | — | 1 |
| 3 | `cavalier`, `ballista`, `sapper`, `ranger` | `stable`, `workshop`, `wall_human` | `siege_damage`, `woodcutting`, `ranged_class`, `melee_weapons@2`, `melee_armor@2`, `ranged_ammo@2`, `ranger_longbow` | `hero_brann` (Capitão) | 2 |
| 4 | `glider`, `tanker`, `barge`, `frigate`, `dreadnought`, `submersible` | `shipyard`, `refinery`, `foundry`, `oil_platform` | `naval_cannons`, `naval_hulls`, `naval_cannons@2`, `naval_hulls@2`, `siege_damage@2` | — | 3 |
| 5 | `mage`, `templar`, `gryphon_rider` | `arcane_tower`, `temple`, `aviary` | `cavalry_class`, `spell_fireball`, `spell_slow`, `spell_heal`, `spell_exorcism` | — | 3 |
| 6 | — | — | `ranger_sight`, `ranger_marksman`, `spell_flameshield`, `spell_invisibility`, `spell_polymorph`, `spell_blizzard`, `spell_holy_vision` (†) | — | 3 |
| 7–9 | — | — | — | — | 3 |
| 10 | — | — | — | `hero_oren` (Mago) | 3 |
| 11 | — | — | — | `hero_dorian` (Comandante) | 3 |
| 12 | — | — | — | — (reunião dos três) | 3 |

Totais: 16 unidades (14 + Petroleiro e Barcaça neutros), 16 construções (15 + a Plataforma), 27 fichas de pesquisa.

### 4.3 Tabela da Horda (`orc`, `factionId: 'orc'`)
| # | `units` | `buildings` | `research` | `heroes` | Tier |
|---|---|---|---|---|---|
| 1 | `peon`, `grunt`, `axethrower` | `orc_house`, `orc_lumber_mill`, `pig_farm`, `orc_barracks` | — | — | 1 |
| 2 | — | `orc_forge`, `orc_watchtower` | `melee_weapons`, `ranged_ammo`, `melee_armor` | — | 1 |
| 3 | `ogre`, `catapult`, `arsonist`, `berserker`, `war_balloon` | `ogre_den`, `orc_workshop`, `wall_orc` | `siege_damage`, `woodcutting`, `ranged_class`, `melee_weapons@2`, `melee_armor@2`, `ranged_ammo@2`, `berserker_range` | `hero_drogath` (Capitão) | 2 |
| 4 | `tanker`, `barge`, `war_galley`, `iron_leviathan`, `colossal_turtle` | `ship_dock`, `naval_forge`, `ash_cauldron`, `oil_platform` | `naval_cannons`, `naval_hulls`, `naval_cannons@2`, `naval_hulls@2`, `siege_damage@2` | — | 3 |
| 5 | `necromancer`, `war_serpent`, `ogre_mage` | `ash_sanctum`, `storm_altar`, `serpent_nest` | `cavalry_class`, `spell_death_touch`, `spell_raise_dead`, `spell_eye`, `spell_bloodlust` | — | 3 |
| 6 | — | — | `berserker_regen`, `berserker_fury`, `spell_haste`, `spell_unholy_armor`, `spell_ash_cloud`, `spell_whirlwind`, `spell_runes` (†) | — | 3 |
| 7–9 | — | — | — | — | 3 |
| 10 | — | — | — | `hero_vozgul` (Mago) | 3 |
| 11 | — | — | — | `hero_skarn` (Comandante) | 3 |
| 12 | — | — | — | — (reunião dos três) | 3 |

`skeleton` e `watching_eye` são invocações (`cost: null`): ficam cobertas pelas pesquisas `spell_raise_dead` e `spell_eye`, como no F8-06.

### 4.4 Verificação feita (script descartável, fora do repositório; sem alterar nada)
Importando `src/data/{units,buildings,upgrades,factions}.js`, para **cada** facção e cada missão, sobre as **tabelas 4.2 e 4.3 desta revisão** (lidas do próprio documento): (a) todo id (unidade, construção, ficha de pesquisa, herói) existe e é da facção ou neutro (`tanker`, `barge`, `oil_platform`); (b) nenhum item se repete entre missões; (c) os `requires` de construções, unidades e fichas de pesquisa (`{hq:N}` contra o `Tier` da missão, tipo de construção, `{research}`, `{role}`) são satisfeitos por itens liberados **antes ou junto**; (d) cobertura: **16 unidades, 16 construções e 27 fichas por facção**. O resultado e a lista de checagens de habilidades/efeitos (§11) estão no fim do documento. Cadeias de referência: `barracks`/`orc_barracks` ← `farm`/`pig_farm` (m1); `stable`/`ogre_den`, `workshop`/`orc_workshop` ← quartel + Centro 2 (m3); `shipyard`/`ship_dock` ← quartel + Centro 2 (m4); `dreadnought`, `submersible`, `iron_leviathan`, `colossal_turtle` ← Centro 3 + Fundição/Fornalha (m4); `arcane_tower`/`ash_sanctum`, `aviary`/`serpent_nest` ← quartel + Centro 3; `temple` ← `stable` + Centro 3; `storm_altar` ← `ogre_den` + Centro 3 (m5); `cavalry_class` exige o Templo/Altar; as fichas † da m6 dependem de `arcane`/`temple`/`forge` já liberados.

### 4.5 Heróis por missão (substitui "um personagem novo por missão")
| Missão | Aliança | Horda | Observação |
|---|---|---|---|
| 1–2 | — | — | heróis só citados/aparecendo em cutscene |
| **3** | **Brann** (Capitão) | **Drogath** (Capitão) | o primeiro herói; ensina Grito de Guerra, mana e unicidade |
| 4–9 | Brann | Drogath | (m5: cameo de Oren/Vozgul como NPC; m8: Oren perde o mentor / Vozgul faz o rito) |
| **10** | **Oren** (Mago) | **Vozgul** (Mago) | entra no desembarque |
| **11** | **Dorian** (Comandante) | **Skarn** (Comandante) | chega com a segunda onda por mar |
| 12 | os três | os três | reunião para fortaleza e bloqueio |

Ordem **Capitão → Mago → Comandante** (justificativa em `MUNDO-HEROIS.md` §2). Cada herói não-jogável ainda aparece como **chefe/capitão inimigo na campanha oposta** (tabela em `MUNDO-HEROIS.md` §2.1). As três últimas missões (10, 11, 12) concentram a entrada do Mago e do Comandante e a reunião; a m12 é a única em que os três jogam juntos.

### 4.6 Lacunas de dados encontradas e propostas
| # | Lacuna | Evidência | Proposta |
|---|---|---|---|
| L1 | **Só 3 heróis** (`hero_brann`, `hero_oren`, `hero_drogath`): faltam Dorian, Vozgul e Skarn. | `src/data/heroes.js` deriva de `units.js` (`unique: true`) | **3 tipos novos** em `src/data/units.js` ([`MUNDO-HEROIS.md`](MUNDO-HEROIS.md) §1), só dados |
| L2 | **O orc não tem cavalaria/lobos**; o Ogro (`ogre`) e o Ogro Feiticeiro (`ogre_mage`) fazem esse papel (`factions.js` `units.cavalry: 'ogre'`). | `UNITS` orc | aceitar (como no F8-06); a cobertura por categoria usa `ogre` |
| L3 | **O humano não tem "tropa pesada de brejo"**: nenhum (é decisão de design, não lacuna). | — | nenhuma |
| L4 | `skeleton`, `watching_eye` não são treináveis. | `cost: null` | cobertos por pesquisa; na lista de exceções do teste de cobertura |
| L5 | **Segundo Centro**: o jogador não pode construí-lo (`castle`/`great_hall` fora da `buildList`); o Marco da Colônia (m10) precisa nascer por `spawnBuilding`. | `src/data/factions.js` `buildList` | roteiro `spawnBuilding`; ver risco R3 (verificar `UPGRADE_HQ` e `setTier` com 2 Centros) |
| L6 | **Sem condição "usar magia"** nos gatilhos. | `missions/README.md` | objetivos por contagem/pesquisa |
| L7 | **IA naval** ainda não existe (NEW-44, local). | `docs/historico/HANDOFF_CLOUD.md` | frotas roteirizadas (§3.3) |
| L8 | Heróis imunes à Transmutação, únicos por partida. | `heroes.js` | aceitar; chefes inimigos usam o mesmo tipo (1 por missão) |
| L9 | Habilidades de herói: só `hero_war_cry`, `hero_arcane_bolt`, `hero_mend`. | `abilities.js` | **14 entradas novas** com efeitos existentes + **1 extensão** (status em área aliada), `MUNDO-HEROIS.md` §1.1/§8 |
| L10 | Retratos/ícones dos 3 heróis novos (`icon: '/icoEspada.png'` provisório). | `units.js` | SVG provisório gerado na nuvem; arte final local (F7-09) |
| L11 | `README` de campanhas diz "nenhum herói existe ainda" (F4-08 já feita). | `src/data/campaigns/README.md` | corrigir no passo de docs |
| L12 | O epílogo da Aliança (campanha beta) cita **Brumar entre os clãs vencidos** (Brumar é porto humano). | `alliance/campaign.json` | **não corrigir na beta** (preservada); a campanha nova tem epílogo próprio (§6.2) |

---

## 5. Dados novos (só `src/data`; sem código de jogo)

A versão anterior propunha 15 tipos novos (`champ_*`, `hero_*`). **Decisão do dono (2026-10-11): só 3 heróis por facção.** O resumo dos dados:

| Alteração | Arquivo | Detalhe |
|---|---|---|
| 3 tipos novos | `src/data/units.js` | `hero_dorian` (`modelOf: cavalier`), `hero_vozgul` (`modelOf: necromancer`), `hero_skarn` (`modelOf: ogre`); `unique`, `isHero`, `cost: null`, `trainTime: null`, ícone provisório |
| 3 tipos ajustados | `src/data/units.js` | `hero_brann`, `hero_drogath` (de 1 para 3 habilidades; mana 120 → 150), `hero_oren` (de 2 para 3 habilidades) — ids, `modelOf`, `scaleMul` e stats de combate **não mudam** |
| 14 habilidades novas | `src/data/abilities.js` | todas `requires: []`; 11 usam só efeitos existentes e 3 usam a **extensão A1** (status em área aliada) |
| 1 extensão de código | `src/sim/abilities.js` | `status` com `radius` + `allies: true` |
| i18n | `src/i18n/pt-BR.json`, `en.json` | nomes e descrições de 3 unidades e 14 habilidades |

`HEROES`/`HERO_TYPES` (derivados) passam de 3 para **6**. **Sem campeões nomeados (`champ_*`)**: os NPCs usam unidades comuns (§1.8). Os campos de camada (a base `cavalier`/`necromancer`/`ogre` é terrestre) não exigem verificação aérea/naval (a verificação de `flying`/água da versão anterior não se aplica mais). Stats sugeridos, habilidades (custo de mana, alcance, recarga, efeito) e fichas de aparência: [`MUNDO-HEROIS.md`](MUNDO-HEROIS.md).

---

## 6. Final: a fortaleza, o bloqueio e o gancho

### 6.1 Missão 12 (`alliance-12-bastiao-do-cabo-ferrugem` / `horde-12-cidadela-de-brasa-alta`)
Estrutura em **três atos** dentro da mesma partida (gatilhos por tempo e por objetivo):
1. **Construir (0–8 min)**: o Marco (Centro avançado, já em nível 2 pela m11) é evoluído ao **nível 3** (**Castelo de Aldária** / **Cidadela de Ferro**); 4 Torres de Vigia, 8 trechos de Muralha e 2 Balistas/Catapultas na área marcada ("o Bastião"). Os guarda-costas do inimigo atacam em ondas leves.
2. **Bloquear (8–16 min)**: o litoral entre o promontório e as ilhas tem 3 Docas inimigas (`ship_dock` na Aliança, **Estaleiro**/Docas humanas na Horda). Destruí-las e **manter 2 navios de guerra no estreito 90 s** sem inimigo na área → o mar fica **fechado**: ilustra a frase do briefing ("bloqueando o acesso às ilhas").
3. **Defender e chefe (16–25 min)**: o **ataque final** do chefe inimigo (Skarn na Aliança; Marechal Dorian na Horda), com ondas e o herói; cai o chefe (ou, na Horda, foge ferido: ver gancho) e o objetivo fecha.
- **Chefe**: um herói do inimigo (`hero_skarn`/`hero_dorian`) cercado de guarda. Se o dono preferir um chefe mais forte que o herói jogável, pergunta §10-11.
- **Derrota**: o Centro avançado cai ou o herói principal morre (padrão de campanha).

### 6.2 Tela final (reusa `CampaignVictory`)
`epilogue` no `campaign.json` (validado por `validateCampaign`, 3–5 parágrafos, `faction: 'human'|'orc'`, `credits`), arte `public/ui/art/victory_human.webp` / `victory_orc.webp` (slot; o SVG procedural atual cobre a falta), fanfarra `victoryFanfareHuman`/`Orc`. A tela mostra "VITÓRIA", o epílogo em sequência, estatísticas e botões Menu / Rejogar / Estatísticas (sem mudança de código).

**Epílogo da Aliança (rascunho; título "O Farol do Outro Lado" / "The Lighthouse on the Other Shore")**
1. pt-BR: "Quando a última torre do Bastião do Cabo Ferrugem foi coroada, o Mar Fendido ficou, pela primeira vez, do lado de Aurelan. As rotas dos clãs para os Estilhaços calaram-se, e os estaleiros da Horda arderam em silêncio." · en: "When the last tower of the Cape Rust Bastion was crowned, the Sundered Sea lay, for the first time, on Aurelan's side. The clans' routes to the Shards fell silent, and the Horde's shipyards burned without a sound."
2. pt-BR: "A Rainha Sevelin recebeu a notícia na Baía de Aurelan e não sorriu. O Mestre Oren redesenhou o mapa com os cadernos de Orsolo: onde havia vazio, agora havia uma fortaleza em terra alheia." · en: "Queen Sevelin heard the news at Aurelan Bay and did not smile. Master Oren redrew the map from Orsolo's notebooks: where there had been emptiness, there now stood a fortress on foreign soil."
3. pt-BR: "O Marechal Dorian e a Capitã Lyra juraram guardar a ponta do mundo. Brann e Oren ensinaram aos recrutas o nome de cada ilha que custou sangue; a Dama Aurora e a Estrela-d'Alva guardam o estreito." · en: "Marshal Dorian and Captain Lyra swore to guard the tip of the world. Brann and Oren taught the recruits the name of every island that cost blood; Dame Aurora and the Estrela-d'Alva keep the strait."
4. pt-BR: "Mas, nas noites de vento seco, da muralha se vê uma luz vermelha além das dunas: as fogueiras do Cinzal ainda ardem. Expulsá-los de vez, ou marchar sobre o que resta? Essa pergunta fica para o próximo inverno." · en: "But on nights of dry wind, a red light can be seen from the wall beyond the dunes: the Cinzal fires still burn. Drive them out for good, or march on what remains? That question waits for the next winter."
Créditos: "Fim da Marcha da Aliança" / "End of the Alliance March".

**Epílogo da Horda (rascunho; título "A Brasa que Não se Apaga" / "The Ember That Never Dies")**
1. pt-BR: "Quando a última torre da Cidadela de Brasa-Alta ergueu o estandarte, o Mar Fendido deixou de ser uma muralha e virou estrada. As Docas de Aurelan queimaram, e os navios dos reinos voltaram para casa." · en: "When the last tower of Highember Citadel raised the banner, the Sundered Sea stopped being a wall and became a road. Aurelan's docks burned, and the kingdoms' ships turned for home."
2. pt-BR: "Drogath acendeu o Fogo do Clã no meio da terra verde, e a lembrança da Anciã Ulma o abençoou. Pela primeira vez em três invernos, nenhum clã passou sede." · en: "Drogath lit the Clan Fire in the middle of the green land, and the memory of Elder Ulma blessed it. For the first time in three winters, no clan went thirsty."
3. pt-BR: "Vozgul guardou a memória dos mortos da guerra; Grok reergueu as muralhas; Skarn jurou que o Cinzal nunca mais seria fechado por ninguém." · en: "Vozgul kept the memory of the war's dead; Grok rebuilt the walls; Skarn swore the Cinzal would never be shut in by anyone again."
4. pt-BR: "Mas, no Mar Fendido, uma vela branca continua à vista: Aurelan ainda tem frota e memória. Fixar-se na terra verde, ou levar a guerra ao coração de Velmara? A brasa decide no próximo inverno." · en: "But on the Sundered Sea a white sail remains in sight: Aurelan still has a fleet and a memory. Settle the green land, or carry the war to the heart of Velmara? The ember will decide next winter."
Créditos: "Fim do Caminho das Brasas" / "End of the Ember Road".

### 6.3 O gancho em aberto (campanha futura)
Nada é decidido: o jogo guarda só um sinal no fim de cada campanha.
- **Expulsão** (campanha II "A Maré Vazante"): obrigar o outro lado a abandonar a costa, destruindo seus portos e retomando os Estilhaços que sobrarem; tom defensivo/de contra-ataque.
- **Conquista** (campanha II "O Coração de Velmara"/"O Coração do Cinzal"): marchar sobre a **capital** do adversário (Baía de Aurelan / Planalto do Cinzal), ainda **inexplorada** (as regiões "Terras Altas do Véu" e "Coração do Cinzal" aparecem no mapa-múndi como pergaminho em branco).
- Sementes já plantadas na campanha: um herói inimigo **escapa** (Dorian ferido, na Horda; Skarn em retirada, na Aliança, só em cutscene), a frota restante do outro lado, o selo de cera quebrado no mapa-múndi final. Estado persistido: apenas `completed.<missionId>` (sem ramificação), mais um campo opcional de "capítulo II disponível" quando existir.

---

## 7. Migração: campanha principal × "Campanha Clássica (beta)"

**Princípio (decisão 7 do dono):** **nada do que existe é apagado nem alterado.** A campanha atual da Aliança (8 missões, `src/data/campaigns/alliance/`, id `alliance`) e o briefing da Horda (`docs/specs/F8-06-campanha-horda.md`) passam a ser a **"Campanha Clássica (beta)"**. A nova campanha de 12 missões por facção é a **principal**.

### 7.1 Duas "trilhas" de campanha
| | **Principal** ("A Guerra do Mar Fendido") | **Clássica (beta)** |
|---|---|---|
| Ids de campanha | `war-alliance` (human), `war-horde` (orc) | `alliance` (human; **existente, intacta**) e, no futuro, `horde-beta` (orc; só se o F8-06 for implementado) |
| Missões | 12 por facção (24 JSONs), `src/data/campaigns/war-alliance/` e `war-horde/` | 8 (Aliança), as de hoje; Horda: **ainda é só briefing** |
| Rótulo no seletor | "A Guerra do Mar Fendido" | "Campanha Clássica (beta)" |
| História | tela de abertura (§2), mundo Ondara | a premissa antiga ("A Marcha da Aliança"), sem a tela de abertura |
| Heróis | 3 por facção (§4.5), conforme a história | os que as missões antigas já usam (`hero_brann`, `hero_oren`, `hero_drogath`) |
| Liberação | `unlocks` da §4 | `unlocks` de hoje (F8-05b), **sem mudança** |
| Progresso | `warpoly.campaign.v1` → `campaigns['war-alliance']` / `['war-horde']` | `campaigns['alliance']` (**o salvo atual continua válido**) |

**Metadados no `campaign.json`** (campos opcionais e aditivos; `validateCampaign` passa a aceitá-los): `track: 'main' | 'beta'`, `betaLabel?: { 'pt-BR', en }`, `order: number` (para ordenar o seletor). A beta ganha `track: 'beta'` e `betaLabel` (**única alteração no JSON da beta**, aditiva; não muda `missions`, `unlocks`, `epilogue`, `premise` nem os `mNN-*.json`). Se o dono preferir que **nenhum** arquivo da beta mude, o rótulo/trilha podem vir de uma tabela em `index.js` (`CAMPAIGN_TRACKS = { alliance: 'beta' }`): pergunta §10-2.

### 7.2 Seletor de campanha (`src/ui/screens/CampaignScreen.js`)
Hoje a tela usa `listCampaigns()[0]` e o texto fixo `menu.campaignHint` ("Aliança"). Mudança:
1. **Duas entradas** (cartões ou abas): **A Guerra do Mar Fendido** (principal; dentro dela, sub-escolha **Aliança | Horda**) e **Campanha Clássica (beta)** (hoje: só Aliança; selo "beta"; quando houver `horde-beta`, aparece também).
2. **Progresso por campanha**: o objeto `progress.campaigns[<id>]` já é por campanha (`progress.js`); basta o seletor ler/gravar o `id` escolhido (não o `[0]`). **Nada é migrado**: os ids de missão da beta não mudam, então o progresso salvo continua valendo; a campanha principal começa do zero. A tentativa atual (`attempt`) e o carry-over seguem separados.
3. `menu.campaignHint` vira genérico; novas chaves `campaign.track.main`, `campaign.track.beta`, `campaign.beta.badge` (pt-BR/en).
4. **Tela de abertura (§2)**: só para a trilha principal (e só em campanha nova). A beta abre direto no briefing da m1, como hoje.
5. `?campaign=unlock` (depuração) continua liberando missões e árvore em qualquer trilha.
6. **Fase seguinte (opcional)**: a lista de missões da trilha principal pode ganhar o **mapa-múndi ilustrativo** (pergaminho com os dois continentes e as ilhas, usando `worldMapShapes.js`) com **marcadores** nas ilhas já jogadas. **O mapa-múndi não é jogável nem navegável** (decisão 3): os marcadores só destacam a missão atual/concluída; clicar escolhe a missão, como hoje na lista. Fica para depois se o visual ficar bom.

### 7.3 Registro (`src/data/campaigns/index.js`)
- Importar as 24 missões novas (`war-*`) e registrar `[alliance, war-alliance, war-horde]` (hoje só `[alliance]`); `listCampaigns()` devolve em ordem estável por `order`; o registro de missões ganha ids novos (`war-alliance-NN-…`/`war-horde-NN-…`), sem colisão com os atuais (`alliance-NN-fumaca-no-vale` etc.).
- Todas as missões novas `"hidden": true` (fora do menu "Missões"), como as atuais.
- `validateCampaign` (`src/campaign/campaign.js`): aceitar `track`/`betaLabel`/`order`; o resto sem mudança (herói da facção, repetição, nível 2 após o 1).

### 7.4 O que se reaproveita das 8 missões atuais (por **cópia**, nunca por `git mv`)
As missões novas copiam estrutura/triggers das antigas e as reescrevem; as originais **ficam onde estão**. **Não tocar** em `m04-*.json` (correção local NEW-53).
| Antiga (mapa) | Serve de base para | O que se aproveita | O que se reescreve |
|---|---|---|---|
| `m01-fumaca-no-vale` (`campos-1v1`) | **A01** Terra à Vista | construir Quartel, destruir acampamento, 500 de ouro, santuário oculto | inimigo orc → Irmandade da Maré (neutros); santuário → Mural da Fenda; textos; unlocks |
| `m02-cativos-da-garganta` (`desfiladeiro-1v1`) | **A02** Pouso do Encontro | resgate de 4 + escolta; secundários de pesquisa | contexto (náufragos, emissário); Ferraria/Torre |
| `m03-muralhas-de-alvorada` (`estreito-1v1`) | **A03** Ouro da Pedra-Mãe | sobreviver a ondas; torres e muralha | Brann jogável aqui; Estábulo/Oficina/Cerco/Cavaleiro; Mervane |
| `m04-ponte-do-rio-turvo` (`continental-1v1`) | **A11** (comboio) e parte de **A09** (Forte Atalaia) | comboio de 4 carregadores; Forte Atalaia por `spawnBuilding`; emboscada | copiar só depois da NEW-53 mesclada |
| `m05-ferro-e-brasa` (`bosques-2v2`) | **A05** O Cerne Verde | economia, IA inimiga, reforços aos 8 min | magia e ar; cameo de Oren |
| `m06-ilhas-de-brasa` (`ilhas-4p`) | **A04** (naval) e **A06** (2 IAs + aliado) | Estaleiro/Plataforma/afundar; aliado Brumar | dividir em duas missões; `unlocks` redistribuídos |
| `m07-traicao-presa-negra` (`vales-2v2`) | **A07** O Brejo Mudo | `setTeam` aos 330 s, sobreviver, destruir o traidor | o traidor vira o **governador Mervane** |
| `m08-queda-do-cinzal` (`planalto-ffa-4p`) | **A08** (magos cativos, Ninho) e **A12** (chefe Skarn, ondas, cutscene final) | `rescue` de 6 magos; Ninho + Serpes; boss ogro; cena final | A12 passa à construção da fortaleza + bloqueio; epílogo novo |
| — | **A09, A10**; **A11** (parte nova) | — | escritas do zero |

### 7.5 O briefing F8-06 (Horda)
- **Fica como está** (`docs/specs/F8-06-campanha-horda.md` não é editado). Continua sendo a fonte da **Campanha Clássica (beta) da Horda**, se o dono mandar implementá-la (id sugerido `horde-beta`, mesmas regras da §7.1). A tabela de índice (`docs/specs/README.md`) já a lista; o rótulo "(beta)" entra no cartão do seletor.
- **Aproveita-se para a campanha principal** (por referência, sem editar o arquivo): elenco e clãs (Chama-Baixa, Lanças Quebradas, Presa-Negra, Forja Negra, Marés Negras, Sal Cinzento), **Honra do Clã** (objetivo oculto de conduta), os testes e passos de execução (adaptados), as lacunas G1–G12 e o tom. **Não** se usa o arco (conquista dos vales + rebelião de Drogath contra Skarn): na principal Skarn é o **comandante jogável** e a rebelião fica como **gancho possível** da campanha II.
- Os herdeiros do F8-06 que a principal **substitui**: 8 missões → 12; a tabela `unlocks` → §4.3; Grok e Vozgul como heróis → só Vozgul (Skarn entra como Comandante).

### 7.6 Testes
- `tests/unit/campaignAlliance.test.js` (existente, da beta): **não muda** (continua testando `alliance`). Novo `tests/unit/campaignMain.test.js` parametrizado (`describe.each(['war-alliance','war-horde'])`): 12 missões, objetivo primário/secundário/oculto, bilíngue, terra/água, ordem e desbloqueio, carry-over, `unlocks` completos (16/16/27 e heróis das m3/m10/m11), requisitos alcançáveis, nada entregue antes de liberado, cobertura por categoria (para o orc, `cavalry` = `ogre`).
- `tests/unit/campaignPlaythrough.test.js`: hoje há um roteiro de ações **por missão** (injetadas). Para as 24 novas: **roteiro por dados** (`tests/fixtures/campaign-playthrough/<id>.json`) + corredor genérico; manter a simulação headless até a vitória, derrotas e determinismo. Os roteiros das 8 antigas ficam como estão.
- `tests/unit/techRestriction.test.js`: sem mudança.
- Novos: `storyScreen.test.js` (modelo + validação de `world.json`), `heroesData.test.js` (6 heróis; estende `heroes.test.js`), `campaignSelector.test.js` (duas trilhas, progresso separado, beta intacta: o `campaigns['alliance']` salvo continua sendo lido).

---

## 8. Plano de execução (nuvem; um passo = um commit; branch `cloud/MUNDO-<n>`)
Todos os passos terminam com `npm test`, `npm run lint`, `npx vite build --outDir /tmp/build-check` (HANDOFF §2). No máximo 3 agentes em paralelo (uma branch por passo).

| Passo | Conteúdo | Depende de | Observação |
|---|---|---|---|
| **0** | **Decisões do dono** (feitas em 2026-10-11; restam as perguntas do §10) | — | nada bloqueia o início dos passos 1–4 |
| **1** | **Javalis (fase visual/textos)**: i18n, `buildings.js`, `Critter.js`, `CritterModel.js`/materiais, `AssetPreloader`, docs; ícone `/icoJavali.svg` provisório | pergunta 3 (ids internos) | teste de i18n; captura: **pendente (local)** |
| **2** | **Heróis (dados)**: 3 tipos novos + ajuste de 3 em `units.js`, **14 habilidades** em `abilities.js`, **extensão A1** (`status` em área aliada) em `src/sim/abilities.js`, i18n, retratos SVG provisórios, testes (`heroes.test.js`, `abilities.test.js`, `determinism.test.js` verde), ajuste do `README` de campanhas (L11) e do GDD §5.3 | — | detalhes em `MUNDO-HEROIS.md` §7.1; independente de mapas |
| **3** | **Tela de história**: `world.json`, `campaignStoryModel.js`, `CampaignStory.js`, `campaignStoryArt.js`, `worldMapShapes.js`, i18n, integração, testes | — | compartilhar formas com a spec de mapas |
| **4** | **Seletor de campanha (duas trilhas) + registro**: `CampaignScreen`, `menu.campaignHint`, `campaign.json` (`track`/`betaLabel`/`order`), `index.js`, `validateCampaign`, testes (`campaignSelector`) | 2 | a beta **não muda**; progresso separado já existe |
| **5** | **Lote A (m1–m3)** das duas campanhas principais: 6 JSON + `unlocks` + roteiros de teste | 2, 4; mapas provisórios | começa pela Aliança (copia de `m01`–`m03`); Capitão entra na m3 |
| **6** | **Lote B (m4–m6)**: naval, magia/ar, Prova de Fogo (árvore completa) | 5 | frotas roteirizadas (L7) |
| **7** | **Lote C (m7–m9)**: traição, forja, cabeça de ponte | 6 | `m04` congelada até a NEW-53 |
| **8** | **Lote D (m10–m12)** + epílogos + `victory_*` (slot); Mago na m10, Comandante na m11 | 7; spec de mapas (palcos continentais) | requer R3 (segundo Centro) verificado |
| **9** | **Testes de cobertura e progressão** (§7.6) e i18n completa (pt-BR/en; `campaign.unlock.*` já existe) | 5–8 | pode rodar em paralelo com cada lote |
| **10** | **Docs**: `src/data/campaigns/README.md` (duas trilhas), `docs/08_GAME_DESIGN.md` (lore e heróis), `docs/specs/README.md`; coordenador atualiza `TASKS.md` | tudo | |

**Dependências com a spec de mapas** (`MUNDO-TERRENO-MAPAS.md`): (a) os **16 mapas** (8 ilhas + 8 continentais) com os nomes e terrenos da §1.6; (b) **pontos nomeados** (`anchors`) para as missões; (c) `worldMapShapes.js` compartilhado (formas dos continentes e ilhas; o mapa-múndi é **ilustrativo**); (d) distribuição de **espécies de critters por bioma** (javalis × ovelhas); (e) o quanto de madeira o mapa precisa (a meta de madeira do F8-06 G11: mapas gerados novos podem reprovar em `tools/lib/woodStats.mjs`); (f) lava e rios como **limites de passagem** (decisão 4). Até lá, vale a tabela de mapas provisórios (§3.2).

**Riscos técnicos**: R1 `techRestriction` entra no checksum só quando presente (ok); R2 IA por dados nos mapas novos (F5-06); **R3** Centro avançado: `setTier` e `UPGRADE_HQ` com dois Centros ou com o Centro criado por `spawnBuilding` (verificar `GameManager`/`commands` antes do lote D; se faltar, restringir à evolução do Marco como único Centro "ativo"); R4 **naval**: sem IA naval até a NEW-44; R5 **dois idiomas** em 24 missões (volume de texto: ~300 linhas por campanha); R6 desempenho do SVG procedural da história (usar `will-change` e poucas camadas); R7 **escopo**: 24 missões é grande: entregar a Aliança primeiro (§3.1); **R8** heróis inimigos (chefes) criados para a IA com o mesmo `unitType` do herói jogável: confirmar que `spawnUnit` aceita 1 por partida por tipo mesmo com dono diferente (a regra atual é por partida: cada missão tem só um); **R9** a extensão A1 (status em área) toca `src/sim/abilities.js`: precisa do `determinism.test.js` verde.

**O que só se verifica jogando (pendente, local)**: duração de 10–25 min por missão e dificuldade (ondas, chefes); equilíbrio das IAs e dos heróis (PV/dano/mana/recarga); a entrada gradual do tutorial (m5 e m6 carregadas); legibilidade dos mapas (ilha irregular, terreno pantanoso/gelado/vulcânico); rotas navais e desembarques; chefes e **herói morto** na m12; ritmo, texto e música da tela de história; aparência dos javalis e dos 6 heróis; arte `victory_*`; leitura de diálogos; HUD com retratos de herói; se a campanha "pesa" em frames.

---

## 9. Riscos de roteiro
- **Crônicas espelhadas**: um jogador que faz as duas verá cada lado vencer; a ponte narrativa (o sinal do outro no fim) evita contradição explícita.
- **Tom**: a Horda não é "o mal": fome e orgulho. Sem violência explícita: conflito é nas ações de jogo; cativos, mortes de NPCs (Orsolo, Ulma) e traições aparecem em diálogo (pergunta §10-5).
- **Heróis inimigos**: Brann, Oren, Dorian, Drogath, Vozgul e Skarn aparecem como chefes na campanha oposta (`MUNDO-HEROIS.md` §2.1): a mesma pessoa é "aliada" numa campanha e "inimiga" na outra, coerente com as crônicas espelhadas.

---

## 10. Perguntas ainda abertas para o dono
**Respondidas em 2026-10-11 (fechadas):** continentes e facções (leste = orcs, oeste = humanos); cânone espelhado; nomes aprovados (inclui aposentar "Gorthak"); quantidade de personagens (3 heróis por facção); heróis × campeões (só heróis); posição da liberação (tutorial m1–6, tudo depois); heróis jogáveis (3 por facção); F8-06 (preservado como beta); mapa-múndi (ilustrativo); progresso salvo (separado por campanha; nada apagado).

**Ainda abertas:**
1. **Comandante na m11 (recomendado) ou na m12?** E o Mago na m10: ok? (`MUNDO-HEROIS.md` §9-1).
2. **Rótulo da beta**: "Campanha Clássica (beta)" no `campaign.json` da beta (alteração aditiva de 3 campos) ou numa tabela em `index.js` (nenhum arquivo da beta muda)?
3. **Javalis**: troca **só visual e de textos** (recomendada; "Cercado de Javalis"/"Boar Pen"; ids internos ficam) ou também renomear os ids (`pig_farm`, espécie `pig`) e migrar mapas e salvamentos?
4. **Itens/evolução de herói**: manter fora (MVP) ou adotar evolução por missão / XP? (`MUNDO-HEROIS.md` §9-3)
5. **Tom**: Mervane (traidor humano), Hurgan (traidor orc), contrabando, cativos, a morte narrativa de Orsolo e de Ulma e a Horda como povo com fome: aceitável (implícito/diálogo, sem violência explícita)?
6. **Gancho**: preferem sugerir mais **expulsão**, mais **conquista**, ou manter perfeitamente neutro?
7. **Colônia (segundo Centro)**: aceita o Marco da Colônia criado por script (`spawnBuilding`), ou quer uma **mecânica nova** (construir um segundo Centro; tarefa de código)?
8. **Tela de história**: aprovada a duração de ~75 s, a faixa nova de música e **sem locução** no MVP? Arte final por painel (local) com que prioridade? `victory_human/orc.webp` entram junto?
9. **Mapa-múndi ilustrativo na tela de campanha**: entra já como fundo da lista de missões (com marcadores opcionais) ou depois?
10. **Dificuldade**: única por missão (como hoje) ou seletor fácil/normal/difícil na campanha?
11. **Chefe da m12**: o chefe inimigo (mesmo tipo do herói jogável do outro lado) deve ser **mais forte** que a versão jogável (mais PV via script/guarda), ou igual?
12. **Brann e Drogath compartilham `hero_war_cry`**: ok, ou variação por facção (nome/ícone)? (`MUNDO-HEROIS.md` §9-5)

---

## 11. Verificação feita nesta spec
Script descartável (em `/tmp`, fora do repositório; nada no repositório foi alterado além deste documento, de `MUNDO-HEROIS.md` e da linha no índice): importou `src/data/{units,buildings,upgrades,factions,abilities}.js` e `src/sim/statuses.js` e conferiu (a) que **todos** os ids citados nas tabelas de `unlocks` (§4.2/§4.3) existem e são da facção correta, sem repetição, com cobertura 16/16/27 por facção e requisitos alcançáveis; (b) que existem `hero_brann`, `hero_oren`, `hero_drogath` e **não** existem `hero_dorian|vozgul|skarn`; (c) que as 14 habilidades novas não colidem com ids existentes e que todos os ids reaproveitados existem (`hero_war_cry`, `hero_arcane_bolt`, `hero_mend`; tipos de efeito `damage`, `heal`, `status`, `channel`, `raise_dead` em `EFFECT_KINDS`; status `slow`, `flameshield`, `haste`, `bloodlust`, `invisible`, `unholy_armor` em `STATUS_DEFS`; `skeleton` em `UNITS`; `modelOf` `cavalier`, `necromancer`, `ogre`, `knight`, `grunt`, `mage` em `UNITS`); (d) que `pig_farm`, `Critter` (`'pig'`), `CRITTER_SPECIES` e `icoPorco.svg` existem onde a §1.4 diz; (e) que `buildList` não contém o Centro (L5). **Resultado**: Aliança e Horda com 16 unidades, 16 construções e 27 fichas; 0 problemas de existência, facção, repetição ou requisito alcançável; as 14 habilidades novas não colidem e todos os ids/efeitos/status/unidades reaproveitados existem. Únicos achados (esperados): `hero_dorian`, `hero_vozgul` e `hero_skarn` ainda não existem em `UNITS` (são os 3 tipos novos do passo 2). Nada precisa de navegador.
