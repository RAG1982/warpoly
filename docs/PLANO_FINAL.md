# PLANO FINAL — do estado de 2026-10-17 ao WarPoly 1.0

> Escrito em 2026-10-17 por Sonnet 5.5 após revisão completa do repositório (docs, código, dados, ativos, branches e suíte de testes).
> **Este arquivo é a fonte de verdade da execução daqui para frente.** O `docs/TASKS.md` vira registro histórico (tarefa M0-02).
> As fichas detalhadas das tarefas, prontas para entregar a um agente, estão em [`PLANO_FINAL_TAREFAS.md`](PLANO_FINAL_TAREFAS.md).

---

## 0. Resumo de 1 minuto

- **O motor está pronto.** Simulação determinística, economia, combate, árvore tecnológica completa, magias, aéreo, naval, 6 heróis (dados), IA com percepção sob névoa, HUD, multiplayer lockstep, replays, editor de mapas, 81 modelos `.glb`, música sintetizada, regressão visual e orçamento de desempenho. Suíte verificada hoje: **159 arquivos / 2185 testes, 0 falhas**.
- **O jogo ainda não está completo como produto.** Falta o conteúdo que usa o motor: **as 24 missões do "Novo Mundo" são esqueletos** (≈1,9 KB cada, um briefing e um objetivo "destruir"; as 8 missões clássicas reais têm 7–14 KB), **os 16 mapas de campanha não existem** (as missões apontam para mapas antigos), **5 dos 6 heróis não têm modelo 3D**, o mapa-múndi não está ligado à tela de campanha e boa parte do que foi mesclado **nunca foi visto nem ouvido** num navegador.
- **Por que parece desorganizado:** 88 tarefas em 11 fases + 57 itens `NEW-` + 10 `MUNDO-` + 16 `ART-` num `TASKS.md` de 662 linhas com parágrafos de 3 000 palavras; status `REVIEW` que significa "falta alguém olhar" sem dono nem data; 34 branches e 9 worktrees; 20 documentos, vários desatualizados (a matriz de paridade ainda diz que 55 % do WC2 falta).
- **Solução deste plano:** 7 marcos com critério de saída (M0–M6), cada tarefa com ID único `M<marco>-<nn>`, dificuldade, executor, dependências e ficha autossuficiente; 6 *gates* em que **você** joga/ouve/aprova (≈ 15 h no total); 9 decisões suas, cada uma com recomendação e valor padrão (se você não responder, sigo a recomendação).
- **Tamanho:** 87 itens: 24 missões, ~17 de arte/Blender, 6 passadas suas (*gates*), o resto código e verificação. Estimativa grosseira de ponta a ponta com 2–3 agentes em paralelo: **8 a 11 semanas** (campanha da Aliança pronta em ~5; Horda +2; polimento e lançamento +2–3). É estimativa, não promessa: o gargalo real é a sua disponibilidade para os *gates*.

---

## 1. Diagnóstico

### 1.1 O que está pronto (verificado por testes; ● = também visto em navegador/GPU)

| Área | Estado |
|---|---|
| Fundação (F0), núcleo (F2), IDs/comandos/determinismo/save/headless | ● pronto. Duas execuções com mesma seed → mesmo checksum |
| Desempenho (F1) | ● cena inicial ~250 FPS / 242 draw calls; combate100 ~54 FPS. Aberto: massa300 ≥ 45 FPS (F1-10c), ORM/texturas (NEW-6), CPU de animação (NEW-14) |
| Jogabilidade WC2 (F3, F4) | pronto: economia, combate, tiers do Centro, pesquisas, muralhas+portão, reparo, neutros, cavalaria, cerco, magias, sapadores, aéreo, naval+petróleo. Balanceamento medido **só no nível 1** |
| IA (F5) | pronta: percepção sob névoa, build orders, micro, campanha por dados. **F5-03 (dificuldades) parcial**: Difícil só vence 48 % contra Normal (meta ≥ 60 %) |
| HUD/UX (F6) | ● pronta: menu, setup, HUD responsiva, minimapa, alertas, cursores, pós-jogo, opções, i18n pt-BR/en, tutorial |
| Arte (F7) | ● 81 `.glb` (todas as unidades e construções, exceto as da seção 1.2); terreno com 4 tilesets clássicos + 5 de bioma; VFX; animação de produção; 140 ícones e 36 retratos |
| Conteúdo (F8) | 6+ mapas skirmish, gerador, editor, sistema de missões/gatilhos (24 ações, 9 condições), **campanha clássica da Aliança (8 missões completas)** |
| Multiplayer (F9) | lockstep + WebRTC + lobby + reconexão + replays: ● verificado em 2 Chromium. Servidor de sinalização só em Node, sem hospedagem |
| Qualidade (F10) | testes, soak IA×IA (99/100 terminam), regressão visual (333 comparações), orçamento de desempenho, PWA/Pages |
| Novo Mundo (dados) | lava na sim, 5 biomas (dados + render regional mesclado), seletor main × beta, tela de história (7 painéis), 6 heróis (dados), javali, 6 mapas novos registrados (`duelo-continental-1..3`, `ilha-unica-1..3`), gerador de costa |

### 1.2 O que falta (e o `TASKS.md` esconde)

1. **Campanha do Novo Mundo (o maior buraco).** `src/data/campaigns/war-alliance/` e `war-horde/` têm 12 JSON cada, gerados por `tools/scaffold-campaigns.mjs`: briefing + 1 objetivo. Sem gatilhos, diálogos, cutscenes, ondas, IA de campanha, heróis em campo, traição, naval roteirizado, fortaleza final. O `TASKS.md` marca MUNDO-6 como "PARCIAL (dados)": é otimista.
2. **16 mapas de campanha** (8 ilhas compartilhadas + 8 continentais) **não existem**; as missões usam `campos-1v1`, `estreito-1v1` etc. Não há **âncoras** (pontos nomeados) para as missões escreverem posições sem coordenadas fixas.
3. **Heróis:** só o Brann tem modelo próprio. Oren, Dorian, Drogath, Vozgul e Skarn usam o modelo da unidade base. Retratos são monogramas SVG. A IA não tem tratamento explícito das 18 habilidades de herói (chefes de missão). Sem XP/níveis/reviver (D6 de 2026-09-29 nunca foi entregue).
4. **Arte de terreno e props do mundo** (`ART-05..16`): arenito, vulcânico, gelo, praia, sub-bosque, efeitos ambientais, cercado de javalis, fauna, HUD redesenhada. Espécies de árvore novas (broad/palm/acacia) existem como `.glb` mas **não estão ligadas aos mapas**. O javali `.glb` não está ligado ao jogo (`CritterModel.js` procedural). Sem modelo: Refinaria, Fundição, Forja Naval, Caldeirão, Submersível, Tartaruga Colossal, Ovelha.
5. **Arte 2D:** mapa-múndi traz texto em inglês gravado ("MAP OF ONDARA & HAR'AKIR") que contradiz os nomes aprovados; faltam `victory_human.webp`/`victory_orc.webp`; diálogos de missão usam emoji como retrato.
6. **Mapa-múndi** (`src/ui/worldMap.js`) não é importado por nenhuma tela.
7. **Nunca vistos/ouvidos:** áudio (`tools/audio-check.mjs` nunca rodou; branch `task/F7-08-verificacao` conflita com o motor de música), render regional de bioma em mapa real, tela de história, seletor de campanhas, mina que desaba, replay online, PWA por facção, F1-10c (bench de LOD).
8. **Defeitos conhecidos:** `ilhas-4p` não termina em 2 de 8 seeds (NEW-55); P-14 serraria longe de bosque em 7 de 9 mapas pela métrica do centro (NEW-56); NEW-35 (ataque ao chão do cerco sem sincronia de animação); NEW-52 (juncos fora da área); NEW-51 (seed 82), NEW-9 (IA destrói HQ parado cedo), `check-data-parity` com 140 divergências históricas, 53 avisos de lint.
9. **Sem IA naval/anfíbia.** Os mapas navais novos (`dois-continentes`, `arquipelago-vivo`) ficam escondidos em `src/data/maps/pendentes/` porque a IA não cruza o mar.
10. **Lançamento:** sem hospedagem do sinalizador multiplayer, sem teste fora do Chromium, sem validação de hardware mínimo (D3), sem determinismo garantido entre navegadores (58 usos de `Math.sin/cos/atan2/sqrt` em `src/sim` e `src/ai`; motores diferentes podem divergir no último bit), sem auditoria de nomes/IP, sem créditos/licenças.

### 1.3 Por que parece bagunçado, e o que muda

| Problema | Regra nova |
|---|---|
| Três esquemas de ID (F*, NEW-*, MUNDO-/ART-) | Tudo vira `M<marco>-<nn>`. Os IDs antigos aparecem só como "origem" |
| `REVIEW` sem dono | Verificação vira tarefa com executor (agente com GPU local ou você) e *gate* datado |
| `DONE` parcial com parágrafos enormes | Uma tarefa só é `DONE` quando cumpre o **"Pronto quando"** da ficha; o relatório fica no commit/PR, não no plano |
| Branches e worktrees mortos | M0-01 limpa; regra: branch `task/<ID>`, mescla `--no-ff`, apaga ao mesclar |
| Docs desatualizados | M0-02 move o histórico para `docs/historico/` e atualiza paridade/handoff |
| Escopo sem fim | Definição de 1.0 (§4, D1) e lista do que é **pós-1.0** (§9) |

---

## 2. Regras de execução (curtas)

1. **Uma tarefa = uma branch `task/<ID>` = uma ficha em `PLANO_FINAL_TAREFAS.md`.** Mesclo `--no-ff` no `master` sem perguntar (sua política de merge) depois de `npm test`, `npm run lint` e build.
2. **Status só no quadro da §6**, atualizado por mim após o merge: `TODO → DOING → REVIEW → DONE`. Agente não edita este arquivo.
3. **"Pronto quando" é objetivo e mensurável.** Se o agente não cumprir, devolve relatório com o motivo; não marca pronto.
4. **Executores:** Sonnet 5.5 para tudo; Haiku só nas tarefas marcadas `H` (mecânicas); **Blender/modelagem nunca Haiku**. No máximo 3 agentes em paralelo; só 1 processo pesado por vez (`tools/safe-run.sh`).
5. **Gates:** ao fim de cada marco eu paro, rodo a suíte completa + `smoke` + `visual` + `perf` (quando houver GPU) e entrego uma lista de verificação para você (§7). Só passo ao marco seguinte quando você aprova ou adia explicitamente.
6. **Conteúdo novo:** PT-BR e en; sem nomes/lore da Blizzard; determinismo (sem `Math.random`/`Date.now` em `src/sim`/`src/ai`); orçamento por modelo ≤ 20 draw calls, texturas ≤ 512².

---

## 3. Dificuldade, esforço e executor (legenda)

| Dificuldade | Significado |
|---|---|
| **Fácil** | mudança local, critério óbvio, pouco risco |
| **Média** | vários arquivos ou verificação visual, risco moderado |
| **Difícil** | mexe em simulação/IA/dados com efeito no checksum, ou exige julgamento de design/arte |
| **Muito difícil** | trabalho de pesquisa/ajuste iterativo com medição; pode não atingir a meta na 1ª rodada |

Esforço do agente: **P** ≤ 2 h · **M** meio dia · **G** 1–2 dias · **GG** > 2 dias ou vários agentes. Executor: **S** Sonnet 5.5 (código) · **SB** Sonnet 5.5 + Blender · **H** Haiku (mecânico) · **V** você.

---

## 4. Decisões

### 4.0 Decisões já respondidas pelo dono (2026-10-17)

| Decisão | Resposta | Efeito no plano |
|---|---|---|
| D1 | **Só a Aliança primeiro** | 1.0 = M0–M3, M5, M6. **M4 (Horda) vira 1.1**, logo depois |
| D3 | **Retomar a F5-03 depois da Aliança** | M5-01 confirmada (depois de M3-13) |
| D4 | **O dono entrega os 5 heróis em `.blend` já com rig**; o agente adiciona animações e integra no jogo e no inspetor | M2-20…24 passam a depender dos arquivos do dono (sem Tripo/`generate_3d`/modelagem do zero) |
| D6 | **HUD nova: sim**, o dono fornecerá imagens de referência | M5-06 confirmada; a maquete HTML nasce das imagens |
| D7 | **Cortar heróis com XP** (e em escaramuça) | M5-12 **DROPPED** |
| D8 | **Cancelar a Horda clássica (F8-06)** | F8-06 **DROPPED**; a Clássica fica com as 8 missões da Aliança |
| D2 | **(b) Público, nomes limpos** | nova tarefa **M1-11** (renomear facções em UI e campanhas **antes** de M3-02); M6-02 vira só auditoria final + créditos |
| D4 (formato) | Dono gera os heróis em **FBX/Blender** e informará o diretório | M2-20…24 esperam o diretório |
| D5 | Mapa-múndi **limpo**: mesmo desenho, sem nenhum texto (instruções na conversa); ilustração apenas, não gera mapa jogável | M2-08 espera a imagem; fallback = cartela sobre a atual |
| D9 | **(b) Cloudflare Worker + Durable Object** | M6-03 vira portar `server/` para Worker; o dono cria a conta Cloudflare e roda `wrangler login` |

### 4.1 Decisões suas (9) — texto original das opções

Cada uma tem uma **recomendação** e um **padrão**: se você não responder até o ponto indicado em "Bloqueia", sigo a recomendação.

**D1 · O que é "1.0"? (campanha completa ou em duas etapas)**
- *Contexto:* a campanha tem duas metades espelhadas (Aliança e Horda, 12 missões cada). Os 8 mapas de ilha são compartilhados; a Horda reaproveita mapas, mecânicas e testes, mas exige 12 roteiros novos, 4 mapas continentais e 3 heróis próprios.
- *Opções:* (a) **1.0 completo** = Aliança + Horda + skirmish + multiplayer; (b) **1.0 = Aliança** (12) e **1.1 = Horda**; (c) 1.0 só com a campanha clássica (8) e o Novo Mundo depois.
- *Impacto:* (b) antecipa o lançamento em ≈ 2 semanas e valida o formato da campanha antes de duplicar; (a) entrega a história inteira de uma vez; (c) lança já, mas sem o mundo que você desenhou.
- *Recomendação / padrão:* **(b)**: executo M0–M3, M5, M6 e deixo M4 (Horda) como 1.1 imediatamente depois. Se preferir (a), a ordem não muda: só o ponto de lançamento.
- *Bloqueia:* nada até M3; decide o corte do marco M6.

**D2 · Público ou pessoal? Nomes e propriedade intelectual**
- *Contexto:* a pergunta "lançamento público ou projeto pessoal" está aberta desde a F0-07. O repositório já é público (`RAG1982/warpoly`) e há deploy no GitHub Pages. As mecânicas copiadas do Warcraft II são permitidas, mas o par **Aliança × Horda**, humanos × orcs e papéis de unidade evocam a marca. Hoje: `factions.js` usa "Reino Humano"/"Clãs Orcs"; as campanhas usam "Aliança de Aurelan"/"Clãs do Cinzal"; 8 textos da interface ainda dizem "Horda"; os títulos aprovados por você incluem "a Marcha da Aliança". Ids internos (`grunt`, `peon`) não aparecem ao jogador.
- *Opções:* (a) **projeto pessoal/portfólio**: manter nomes, adicionar aviso "projeto de fã, sem afiliação" e créditos; (b) **público, nomes limpos**: trocar "Horda"→"Clãs do Cinzal" e "Aliança"→"Reino de Aurelan/Coroa" em UI e campanhas; (c) comercial: consultar advogado (fora do escopo deste plano).
- *Impacto:* (a) custa ~0; (b) custa ≈ 1 dia de agente (M6-02), mas é **muito mais barato se decidido antes de escrever os 24 roteiros** (os textos usam "Horda" e "Aliança" o tempo todo); (c) bloqueia lançamento até parecer jurídico.
- *Recomendação / padrão:* **(b)** se for compartilhar publicamente; **(a)** se for só portfólio. Padrão: (b).
- *Bloqueia:* escrita dos roteiros (M3-02). Responda antes.

**D3 · Retomar a IA com dificuldades (F5-03)?**
- *Contexto:* os níveis Fácil/Normal/Difícil/Brutal existem (APM, atraso, bônus no Brutal), mas **Difícil vence só 48 % contra Normal** (meta ≥ 60 %): falta vantagem estrutural (expansão, economia). Você adiou em 2026-10-12.
- *Opções:* (a) **retomar em M5** (Muito difícil, G–GG, medição iterativa com 20+ partidas); (b) manter e **rotular com honestidade** (Fácil / Normal / Brutal; "Difícil" vira alias), custo ≈ 1 h; (c) adiar para pós-1.0.
- *Impacto:* sem (a), a campanha terá dificuldade única e a escaramuça terá dois níveis quase idênticos. Com (a), a campanha ganha seletor (Fácil/Normal/Difícil) e o balanceamento fica mais honesto.
- *Recomendação / padrão:* **(a), só depois da Aliança estar jogável** (M5-01); fallback (b) se a meta não for atingida em 2 rodadas.
- *Bloqueia:* M5-01.

**D4 · Como produzir os modelos dos 5 heróis restantes**
- *Contexto:* o Brann foi feito com o **Tripo** (você gerou, o agente converteu para o rig do jogo com `tools/blender/build_hero_brann.py`: 10,9 mil tris, 8 draw calls, bom resultado). Os outros 5 usam hoje o modelo da unidade base (`knight`, `mage`, `grunt`, `ogre`). O MCP do Blender também oferece `generate_3d` (texto/imagem → modelo; 1–3 min; **pode consumir crédito seu**).
- *Opções:* (a) **você gera no Tripo** com as fichas de aparência de `MUNDO-HEROIS.md` e o agente converte (≈ 1–2 h suas + ≈ meio dia de agente por herói); (b) **`generate_3d` pelo agente**: sem trabalho seu, custo de crédito, qualidade a verificar; (c) **modelagem do zero em Blender** pelo Sonnet: grátis, qualidade de ~7–8/10 como as unidades atuais, herói fica menos "estrela".
- *Impacto:* não bloqueia nada jogável: as missões usam o modelo provisório até chegar o final. Só afeta o acabamento e o tempo das tarefas M2-20…M2-24.
- *Recomendação / padrão:* **(a)** para Drogath, Dorian e Skarn (os mais visíveis); **(b)** para Oren e Vozgul (magos, silhueta mais simples). Padrão: (c) se você não gerar nada até o M2 acabar.
- *Bloqueia:* M2-20…M2-24 (não bloqueia missões).

**D5 · Arte 2D que depende de você (3 imagens)**
- *Contexto:* (i) **mapa-múndi sem texto** (a imagem atual tem "MAP OF ONDARA & HAR'AKIR" e nomes em inglês gravados; os nomes aprovados são Ondara, Velmara, Cinzara, Mar Fendido, Estilhaços); (ii) `victory_human.webp` e (iii) `victory_orc.webp` (1920×1080, ≤ 500 kB, faixa inferior escura para o texto). Os 7 painéis da história você já gerou com uma ferramenta de imagem.
- *Opções:* (a) **você gera as 3** com a mesma ferramenta (prompts prontos na ficha M2-08/M3-14); (b) o agente desenha placas procedurais (SVG/Blender): funciona, fica genérico; (c) lançar com o SVG procedural já existente na tela final e com o mapa atual com a faixa de título coberta por uma cartela.
- *Impacto:* afeta só o visual da tela de campanha e da vitória. Não bloqueia.
- *Recomendação / padrão:* **(a)**. Padrão: (c) até chegar.
- *Bloqueia:* nada.

**D6 · HUD nova no estilo da sua referência (ART-14)**
- *Contexto:* sua referência (`docs/refs/mundo/`) mostra minimapa **circular** com moldura de pedra, barra de recursos em placas de pedra-metal e painel de comandos retangular. A HUD atual é responsiva e testada (F6-03), mas com cara diferente. Mudar mexe em `style.css`, `UIManager`, minimapa, i18n e **regrava todas as baselines visuais**.
- *Opções:* (a) **sim, depois da campanha**, com **maquete HTML estática aprovada por você antes de qualquer código**; (b) não; (c) agora (atrasa a campanha ≈ 2 semanas).
- *Recomendação / padrão:* **(a)**.
- *Bloqueia:* M5-05.

**D7 · Heróis com XP, níveis e escaramuça (a D6 original)**
- *Contexto:* em 2026-09-29 você decidiu heróis na campanha **e** na escaramuça, níveis 1–5, reviver no Altar, opção "Sem heróis". Foi entregue só: heróis únicos que entram por script de missão, sem XP/reviver. A spec do Novo Mundo pergunta de novo se evolução fica de fora.
- *Opções:* (a) **cortar para 1.0**: heróis só na campanha, sem XP (atualizo D6 em `docs/07_DECISOES.md`); (b) evolução simples por missão (+% de stats persistido no carry-over): Média; (c) tudo: escaramuça + XP + reviver: Muito difícil, rebalanceia o jogo.
- *Recomendação / padrão:* **(a)**; (b) como bônus pós-1.0.
- *Bloqueia:* M5-12 (só se escolher b/c).

**D8 · Campanha Clássica (beta) e a F8-06 (Horda de 8 missões)**
- *Contexto:* a Clássica são as 8 missões da Aliança **completas** (hoje a única campanha jogável de verdade). A F8-06 prevê 8 missões da Horda com o nome "O Caminho das Brasas", que a nova `war-horde` já usa.
- *Opções:* (a) **cancelar F8-06** e manter a Clássica como bônus de 8 missões da Aliança; (b) fazer as 8 da Horda (+1 semana); (c) remover a Clássica do menu depois que o Novo Mundo estiver pronto.
- *Recomendação / padrão:* **(a)**; a Clássica também serve de plano B e de referência de qualidade para os roteiros novos.
- *Bloqueia:* nada.

**D9 · Hospedagem do multiplayer**
- *Contexto:* o servidor de sinalização (`server/`, Node + `ws`) só roda local. Cloudflare Worker/Durable Object está só **documentado**. WebRTC com STUN público conecta ~80 % dos pares; o resto precisa de TURN.
- *Opções:* (a) **Node em VPS/Fly.io/Render** (≈ US$ 0–5/mês; zero portagem) + STUN gratuito; (b) Cloudflare Worker (grátis, exige portar o servidor e criar conta); (c) sem lobby público: só sala por link/código + aviso.
- *Impacto:* decide o que "multiplayer por link" significa para um jogador comum.
- *Recomendação / padrão:* **(a)** com TURN deixado para depois. Padrão: (c) até você criar a conta.
- *Bloqueia:* M6-03.

### 4.2 Decisões que eu já tomei (veto possível)

| # | Decisão | Por quê |
|---|---|---|
| 1 | **Mapas e âncoras antes dos roteiros; Aliança antes da Horda** | coordenadas escritas contra mapa provisório são refeitas; a Aliança reaproveita a base das 8 missões clássicas |
| 2 | Mapas de **campanha** ficam isentos do mínimo de 168 (P-7), com 96–192; o limite **256 não** é adotado | a Fornalha em escala de missão precisa de 96–128; 256 pesa no pathfinder e no soak |
| 3 | **NEW-55**: aplico as opções 1 (florestas anexadas ao fim do mapa, ~100 árvores) e 3 (IA: portão de emergência só com recuperação possível); **não** a 2 (mascara o defeito), 4, 6, 7 | foram as que o diagnóstico mediu melhor (24/24 e 22/24) |
| 4 | **NEW-56 (P-14)**: opção A, medir pela **borda** do bosque e ajustar `bosques-2v2` | menor custo; as bases de 14–21 u do centro do bosque ficam a poucos passos da borda |
| 5 | **NEW-6 passo 2**: ORM e bump à metade do lado **só em `high`**; `ultra` fica completo | `high` fica < 300 MB sem tocar nos tons de albedo que você vê |
| 6 | **TypeScript: não.** JS + JSDoc | custo/benefício; a suíte já protege contrato |
| 7 | **ART-04 javali**: escala ×1,4 (sua decisão no commit) e **6 draw calls** (cabe no orçamento de 20); mesclo `task/ART-04-escala` | — |
| 8 | **Brann**: martelo e capa ficam como vieram do Tripo, capa **estática** no 1.0 | capa animada exige rig novo; é polimento |
| 9 | `hero_war_cry` compartilhado, mas com **nome e ícone diferentes** por facção (só i18n/ícone) | custo ~0, identidade melhor |
| 10 | **Oren/Mago na m10, Dorian/Comandante na m11**; Vozgul "Profetisa" mantido | recomendação da spec |
| 11 | Rótulo da beta via **tabela em `campaigns/index.js`**, sem tocar nos arquivos da beta | menos risco |
| 12 | **Javalis só visual e de texto**; ids internos (`pig_farm`, espécie `pig`) ficam | evita migrar mapas e saves |
| 13 | **Tom:** mortes narrativas (Orsolo, Ulma), traidores (Mervane, Hurgan) e Horda como povo com fome: aceitos, só em diálogo | spec |
| 14 | **Gancho da campanha neutro** (um sinal do outro lado no horizonte, sem inclinar a expulsão ou a conquista) | preserva a continuação |
| 15 | **Colônia (segundo Centro)** por `spawnBuilding` de missão, sem mecânica nova de "construir 2º Centro" | M2-02 só garante que funciona |
| 16 | **Chefe da m12**: mesmo tipo do herói jogável + guarda e ondas (sem bônus de PV) | evita cheat de PV |
| 17 | Tela de história ~75 s, **sem locução**; mapa-múndi como fundo da lista de missões com 12 marcadores desde a v1; lava no mapa-múndi = ícone de fumaça | spec |
| 18 | **Dificuldade da campanha:** única por missão, a menos que D3 = (a) (aí vira seletor) | depende da D3 |
| 19 | P-5 Transmutação → ovelha para as duas facções · P-6 assimetria controlada fora da zona de jogo permitida · P-9 fonte OFL (Cinzel/IM Fell) autorizada · P-10 ordem mapas → biomas → mapa-múndi | spec |
| 20 | **IA naval fica fora do 1.0.** Mapas navais escondidos permanecem em `pendentes/`; a campanha usa frotas roteirizadas | trabalho Muito difícil e de pouco retorno no 1.0 |
| 21 | **Mobile fora do 1.0** (D3 de 2026-09-28: "desejável, não prioritário"); preset Baixo continua o piso | — |
| 22 | **Música:** o jogo toca as faixas atuais até você escolher no inspetor (baixa prioridade) | — |
| 23 | Idiomas: **pt-BR e en** apenas | — |
| 24 | **Retratos de NPC nos diálogos** (Sevelin, Orsolo, Mervane etc.): bustos renderizados no Blender a partir dos modelos existentes (`render_portraits.py`), em vez de emoji | M3-14 |
| 25 | Sem ranking/matchmaking online no 1.0 | — |

---

## 5. Marcos e ordem de execução

```
M0 Base limpa ──► M1 Fechar o existente ──► M2 Mundo jogável ──► M3 Campanha Aliança ──► [lançamento 1.0 se D1=b]
                        │ (paralelo)              │ arte+heróis                    ├──► M4 Campanha Horda (1.1 ou 1.0)
                        └─ gate G1                └─ gate G2                       └─ gates G3 / G4
                                                                      M5 Polimento ──► M6 Lançamento ──► gates G5 / G6
```

Paralelismo permitido (máx. 3 agentes, 1 processo pesado por vez):
- **M1** corre junto com o início de **M2** (código de âncoras e arte não conflitam com a verificação).
- Dentro de **M2**: faixa *Código* (M2-01, 02, 11, 10), faixa *Mapas* (M2-03…07, depende de M2-01) e faixa *Arte* (M2-12…24) rodam em paralelo.
- **M3** começa assim que existirem os mapas dos palcos 1–3 (M2-03). **M4** reaproveita os 8 mapas de ilha.
- **M5** e **M6** podem começar durante M3/M4 nas tarefas sem dependência de roteiro (M5-04, M5-06, M5-07, M6-01).

| Marco | Objetivo | Critério de saída |
|---|---|---|
| **M0** Base limpa (1–2 dias) | git e docs organizados; um único plano | `master` limpo, só branches com trabalho não mesclado restam e listadas; docs atualizados; suíte verde |
| **M1** Fechar o existente (3–5 dias) | tudo que está `REVIEW` vira `DONE` ou vira defeito com ficha | **G1**: áudio, bench, replay/PWA verificados; NEW-55/56/35/52 resolvidos; baselines regravadas; você viu o Novo Mundo no jogo |
| **M2** Mundo jogável (2–3 semanas) | mapas, âncoras, biomas, props e heróis prontos para a campanha | **G2**: 16 mapas passam nos testes e **você aprovou as prévias**; props e 6 heróis aparecem no jogo |
| **M3** Campanha Aliança (≈ 3 semanas) | 12 missões completas e jogáveis | **G3**: você jogou as 12 de ponta a ponta; testes de cobertura/progressão verdes |
| **M4** Campanha Horda (≈ 1,5–2 semanas) | espelho da M3 | **G4**: mesma verificação |
| **M5** Polimento (≈ 2 semanas, em paralelo) | dificuldade, balanceamento, desempenho, arte e áudio restantes | **G5**: HUD (se D6=a), música, dificuldade conferidos por você |
| **M6** Lançamento (≈ 1 semana) | multiplayer hospedado, compatibilidade, IP, deploy | **G6**: dispositivo fraco, outro navegador, partida online com outra pessoa; **release candidate** |

---

## 6. Quadro de tarefas (ordem de execução; status atualizado por mim)

Legenda de dependências: só IDs; "—" = pode começar já. **Dif.** = dificuldade; **Exec.** = executor. As fichas completas estão em [`PLANO_FINAL_TAREFAS.md`](PLANO_FINAL_TAREFAS.md).

### M0 — Base limpa
| ID | Tarefa | Dif. | Esf. | Exec. | Dep. | Origem | Status |
|---|---|---|---|---|---|---|---|
| M0-01 | Higiene do git (mesclar ART-04, preservar WIP, apagar o morto) | Fácil | P | S | — | — | DONE (2026-10-17) |
| M0-02 | Reorganizar a documentação (histórico, TASKS enxuto, paridade, handoff) | Média | M | S | M0-01 | — | DONE (2026-10-17) |

### M1 — Fechar o que já existe
| ID | Tarefa | Dif. | Esf. | Exec. | Dep. | Origem | Status |
|---|---|---|---|---|---|---|---|
| M1-01 | Verificação visual do Novo Mundo no jogo (GPU) | Média | M | S | M0-01 | MUNDO-4/5/9, NEW-54 | DONE (2026-10-17) |
| M1-02 | Áudio: reconciliar `task/F7-08-verificacao` e rodar `audio-check` | Difícil | M | S | M0-01 | F7-08 | DONE (2026-10-17; escuta no G1) |
| M1-03 | Medições: bench (F1-10c), draw calls de neutros, combate100 | Média | M | S | M0-01 | F1-10c, NEW-15, NEW-27 | TODO |
| M1-04 | Replay online, PWA/carga por facção, save/load em missão | Média | M | S | M0-01 | F9-05, F10-05, F2-06 | DONE (2026-10-17) |
| M1-05 | Correções pequenas (NEW-35, NEW-52, critério do m04, NEW-49) | Média | P | S | M0-01 | NEW-35/52/49, m04 | DONE (2026-10-17) |
| M1-06 | `ilhas-4p`: florestas + portão de emergência da IA (opções 1+3) | Difícil | G | S | M0-01 | NEW-55 | DONE parcial (23/24; NEW-58 seed 16 aceita) |
| M1-07 | P-14: serraria perto de bosque (opção A) | Fácil | P | S | M0-01 | NEW-56 | DONE (2026-10-17) |
| M1-08 | Soak grande, NEW-51 e agressividade inicial da IA (NEW-9) | Média | M | S | M1-06 | NEW-51, NEW-9 | TODO |
| M1-09 | Gate M1: regravar baselines, suíte completa, fechar `REVIEW` | Fácil | P | S | M1-01…08 | — | TODO |
| M1-10 | **G1 — sua passada nº 1** (≈ 1 h) | — | — | V | M1-09 | — | TODO |
| M1-11 | Renomear facções em UI e campanhas (D2 b): Aliança→Liga de Aurelan, Horda→Clãs do Cinzal | Média | M | S | M0-02 | D2 | DONE (2026-10-17) |

### M2 — Mundo jogável
| ID | Tarefa | Dif. | Esf. | Exec. | Dep. | Origem | Status |
|---|---|---|---|---|---|---|---|
| M2-01 | Âncoras (pontos nomeados) em mapas e missões | Difícil | G | S | M0-01 | MUNDO-HISTORIA §3.2 | TODO |
| M2-02 | Segundo Centro e `setTier`/`UPGRADE_HQ` com 2 Centros | Média | M | S | M0-01 | risco R3 | TODO |
| M2-03 | Mapas de campanha, lote 1: palcos 1 (Aliança), 2, 3 | Difícil | G | S | M2-01 | MUNDO-7 | TODO |
| M2-04 | Mapas, lote 2: palcos 4, 5, 6 | Difícil | G | S | M2-03 | MUNDO-7 | TODO |
| M2-05 | Mapas, lote 3: palcos 7, 8, 9 | Difícil | G | S | M2-03 | MUNDO-7 | TODO |
| M2-06 | Mapas, lote 4: continentais da Aliança (palcos 10, 11, 12) | Difícil | G | S | M2-03 | MUNDO-7 | TODO |
| M2-07 | Mapas, lote 5: continentais da Horda (palcos 1, 10, 11, 12) | Difícil | G | S | M2-03 | MUNDO-7 | TODO |
| M2-08 | Mapa-múndi ligado à tela de campanha | Média | M | S | M1-01 | MUNDO-9 | TODO |
| M2-09 | Editor: pincéis de lava, bioma e passagem | Média | M | S | M2-03 | MUNDO-1 p.7 | TODO |
| M2-10 | Espécies de árvore novas nos mapas (ART-02) | Média | M | S | M0-01 | ART-02 | TODO |
| M2-11 | IA de chefes: habilidades de herói na IA | Difícil | M | S | M0-01 | MUNDO-HEROIS R8 | TODO |
| M2-12 | Props de arenito e arbusto rolante enxuto | Média | M | SB | M0-01 | ART-01/03 | TODO |
| M2-13 | Javali completo + Cercado de Javalis + ícones de bioma | Média | G | SB | M0-01 | ART-04/12 | TODO |
| M2-14 | Props vulcânicos e material de lava | Média | G | SB | M0-01 | ART-06 | TODO |
| M2-15 | Props de gelo | Média | M | SB | M0-01 | ART-07 | TODO |
| M2-16 | Água, costa e praia | Média | G | S+SB | M0-01 | ART-08/09 | TODO |
| M2-17 | Sub-bosque e pântano | Fácil | M | SB | M0-01 | ART-10 | TODO |
| M2-18 | Efeitos ambientais (poeira, cinza, vapor, neve, lava) | Média | M | S | M2-14 | ART-11 | TODO |
| M2-19 | Texturas de terreno por bioma (rocha, vulcânico, pântano, gelo, neve; **confirmada pela M1-01**) | Média | G | SB | M1-01 | ART-05 | TODO |
| M2-20 | Herói Dorian: integração do `.blend` do dono (animações, jogo, inspetor, retrato) | Difícil | G | SB | `.blend` do dono | MUNDO-HEROIS | TODO |
| M2-21 | Herói Oren: integração do `.blend` do dono | Difícil | G | SB | `.blend` do dono | MUNDO-HEROIS | TODO |
| M2-22 | Herói Drogath: integração do `.blend` do dono | Difícil | G | SB | `.blend` do dono | MUNDO-HEROIS | TODO |
| M2-23 | Herói Vozgul: integração do `.blend` do dono | Difícil | G | SB | `.blend` do dono | MUNDO-HEROIS | TODO |
| M2-24 | Herói Skarn: integração do `.blend` do dono | Difícil | G | SB | `.blend` do dono | MUNDO-HEROIS | TODO |
| M2-26 | Biomas: neve solta no `biomeGrid` dos mapas MUNDO-7 e minimapa com cor de bioma | Média | M | S | M1-01 | achados M1-01 | TODO |
| M2-27 | Arte da história sem texto em inglês (painéis 3 e 5, cartão de título) | Média | M | V+S | D5 | achado M1-01 | TODO |
| M2-25 | **G2 — sua passada nº 2** (aprovar prévias dos 16 mapas, ≈ 1 h) | — | — | V | M2-03…07 | — | TODO |

### M3 — Campanha da Aliança (`war-alliance`)
| ID | Tarefa | Dif. | Esf. | Exec. | Dep. | Status |
|---|---|---|---|---|---|---|
| M3-01 | Harness de qualidade das 24 missões (cobertura + progressão + *playthrough* headless) | Difícil | M | S | M2-01 | TODO |
| M3-02 | Missão 1 · Terra à Vista | Média | M | S | M3-01, M2-03 | TODO |
| M3-03 | Missão 2 · O Pouso do Encontro | Média | M | S | M3-02, M2-03 | TODO |
| M3-04 | Missão 3 · Ouro da Pedra-Mãe (entra o Brann) | Difícil | G | S | M3-03, M2-03 | TODO |
| M3-05 | Missão 4 · O Baixio do Breu (naval roteirizado) | Difícil | G | S | M3-04, M2-04 | TODO |
| M3-06 | Missão 5 · O Cerne Verde | Média | M | S | M3-05, M2-04 | TODO |
| M3-07 | Missão 6 · A Geada (Prova de Fogo, árvore completa) | Difícil | G | S | M3-06, M2-04 | TODO |
| M3-08 | Missão 7 · O Brejo Mudo (traição) | Média | M | S | M3-07, M2-05 | TODO |
| M3-09 | Missão 8 · A Fornalha | Difícil | G | S | M3-08, M2-05, M2-14 | TODO |
| M3-10 | Missão 9 · Miragem | Difícil | G | S | M3-09, M2-05 | TODO |
| M3-11 | Missão 10 · Desembarque na Costa Ferrugem (entra o Oren) | Difícil | G | S | M3-10, M2-06, M2-02 | TODO |
| M3-12 | Missão 11 · Porto Albor (entra o Dorian) | Difícil | G | S | M3-11, M2-06, M2-02 | TODO |
| M3-13 | Missão 12 · O Bastião do Cabo Ferrugem (final) | Muito difícil | GG | S | M3-12, M2-06, M2-11 | TODO |
| M3-14 | Textos finais, epílogo, retratos de NPC, arte de vitória | Média | M | S+SB | M3-13 | TODO |
| M3-15 | **G3 — você joga as 12 missões** (≈ 4–5 h) | — | — | V | M3-14 | TODO |
| M3-16 | Ajustes pós-playtest da Aliança | Média | M | S | M3-15 | TODO |

### M4 — Campanha da Horda (`war-horde`) — **1.1** (D1: Aliança primeiro)
| ID | Tarefa | Dif. | Esf. | Exec. | Dep. | Status |
|---|---|---|---|---|---|---|
| M4-01 … M4-12 | Missões 1–12 da Horda (tabela na §7 de `PLANO_FINAL_TAREFAS.md`) | Média/Difícil | M–G | S | M3-13, M2-07 | TODO |
| M4-13 | Textos finais, epílogo, retratos de NPC | Média | M | S+SB | M4-12 | TODO |
| M4-14 | **G4 — você joga as 12 da Horda** (≈ 4 h) e ajustes | — | — | V+S | M4-13 | TODO |

### M5 — Polimento
| ID | Tarefa | Dif. | Esf. | Exec. | Dep. | Origem | Status |
|---|---|---|---|---|---|---|---|
| M5-01 | IA: níveis de dificuldade + seletor (D3 = a) | Muito difícil | GG | S | M3-13 | F5-03 | TODO |
| M5-02 | Rebalanceamento da árvore completa e dos heróis | Difícil | G | S | M3-13 | F3-11, NEW-30 | TODO |
| M5-03 | Desempenho: ORM/texturas, CPU de animação, massa300 | Difícil | G | S | M1-03 | NEW-6, NEW-14, F1-10 | TODO |
| M5-04 | Arte: Refinaria, Fundição, Forja Naval, Caldeirão | Média | G | SB | M0-01 | F7-00b | TODO |
| M5-05 | Arte: Submersível, Tartaruga Colossal, Ovelha | Média | M | SB | M0-01 | F7-00b | TODO |
| M5-06 | HUD nova (D6 = sim): maquete a partir das imagens do dono, aprovação, implementação | Difícil | GG | S | M3-14 | ART-14 | TODO |
| M5-07 | Música: seleção de faixas, tema da história, ambiência por bioma | Média | M | S+V | M1-02 | MUSICA | TODO |
| M5-08 | Escala dos orcs e pendências de arte (NEW-32) | Fácil | P | SB | M1-10 | — | TODO |
| M5-09 | Lint (53 avisos), código morto e `check-data-parity` | Fácil | M | H | — | F0-05, NEW-31 | TODO |
| M5-10 | Fauna decorativa extra (ART-15) | Média | M | SB | M2-13 | ART-15 | TODO (opcional) |
| M5-11 | **G5 — sua passada nº 5** (HUD, música, dificuldade, ≈ 2 h) | — | — | V | M5-01…07 | — | TODO |
| M5-12 | Heróis com XP/escaramuça | Muito difícil | GG | S | D7 | D6 | DROPPED (D7: cortado) |

### M6 — Lançamento
| ID | Tarefa | Dif. | Esf. | Exec. | Dep. | Origem | Status |
|---|---|---|---|---|---|---|---|
| M6-01 | Determinismo entre navegadores (trigonometria da sim) | Difícil | G | S | — | F9-03 risco | TODO |
| M6-02 | Auditoria final de nomes/IP, créditos e licenças | Média | M | S+V | M1-11 | D2 | TODO |
| M6-03 | Portar o sinalizador para Cloudflare Worker + Durable Object | Difícil | G | S+V | M6-01 | F9-02 | TODO |
| M6-04 | Compatibilidade (Firefox/Safari) e hardware mínimo (D3) | Média | M | S+V | M5-03 | D3 | TODO |
| M6-05 | Empacotamento: versão, notas, PWA, página de entrada | Média | M | S | M6-04 | F10-05 | TODO |
| M6-06 | Soak e regressão finais, release candidate | Média | M | S | M6-05 | F10-02/03/04 | TODO |
| M6-07 | Documentação de jogador e documentação técnica final | Fácil | M | S | M6-06 | — | TODO |
| M6-08 | **G6 — sua passada final** (≈ 2 h + partida online com outra pessoa) | — | — | V | M6-07 | — | TODO |

---

## 7. Suas verificações (os *gates*)

Tempo total estimado seu: **≈ 15 h** ao longo do projeto. Cada gate vem com uma lista curta que eu preparo no momento.

| Gate | Quando | O que você faz | Tempo |
|---|---|---|---|
| **G1** | fim da M1 | abre o jogo; vê tela de história, seletor de campanhas, uma partida em `duelo-continental-1` e outra em `ilha-unica-1` (biomas, lava, javali); ouve menu e jogo; confirma o Brann e o ícone do javali | 1 h |
| **G2** | fim da M2 | aprova as **prévias PNG** dos 16 mapas; vê props novos; vê os 6 heróis no inspetor (`?model=…`) | 1 h |
| **G3** | fim da M3 | joga as 12 missões da Aliança; marca: duração (10–25 min), dificuldade, texto, bugs | 4–5 h |
| **G4** | fim da M4 | idem para a Horda | 4 h |
| **G5** | fim da M5 | HUD (se aprovada), escuta de música (30–40 min para marcar as faixas no inspetor 🎵), dificuldade | 2 h |
| **G6** | M6 | testa em um computador/notebook mais fraco (D3), em outro navegador, e uma partida online com outra pessoa | 2 h |

---

## 8. Riscos e como o plano os trata

| Risco | Tratamento |
|---|---|
| Roteiros ficam fracos ou muito difíceis | M3-01 (harness) cria o piso de qualidade; as 8 missões clássicas são a régua; G3 antes de copiar o padrão para a Horda |
| 16 mapas = muita arte de mapa | gerador de costa + âncoras automáticas; se o tempo apertar, mapas continentais da Horda reaproveitam os da Aliança com outro tileset (decisão que tomo na M2-07 com sua prévia) |
| Heróis sem modelo final | missões usam o modelo provisório (`modelOf`); modelos finais entram sem mexer em roteiro |
| Mudanças em `src/sim`/`src/ai` quebram o determinismo | toda tarefa que mexe nelas roda `determinism.test.js` e `node tools/headless-match.js --seed 1` |
| Baselines visuais mudam em massa | só regravo no *gate* (M1-09, fim de cada marco), nunca no meio |
| Verificação visual depende da sua GPU | um processo pesado por vez com `safe-run.sh`; abort em WebGL por software |
| Falta de dono para `REVIEW` | gates com lista e prazo |
| Limite de uso (HTTP 429) derruba agentes | commits `wip` frequentes; retomo com `SendMessage` |

---

## 9. Fora do 1.0 (registrado, não esquecido)

IA naval/anfíbia (e os 6 mapas navais escondidos) · heróis com XP e em escaramuça (salvo D7 b/c) · capa animada do Brann · fauna extra (M5-10 é opcional) · mobile/tablet · ranking e matchmaking · idiomas além de pt-BR/en · modo espectador online · campanha da Horda de 8 missões (F8-06, se D8=a) · locução da tela de história · continuação da campanha (gancho aberto).
