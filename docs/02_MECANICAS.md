# 02 — Mecânicas e Regras de Jogo (estado atual)

> **Fonte de verdade: `src/data/`** (F0-06). Todos os números de balanceamento vivem em `src/data/units.js`, `buildings.js`, `upgrades.js` e `factions.js` (helpers em `src/data/index.js`). As tabelas abaixo são um resumo para leitura; em caso de divergência, vale o código em `src/data/`. Para mudar um valor, edite só ali. `tools/check-data-parity.mjs` compara os valores com o snapshot anterior à centralização.
>
> Valores extraídos do código em 2026-09-28.

## Visão geral

RTS no estilo Warcraft II: **Aliança Humana** vs **Horda Orc**, jogador contra uma ou mais IAs. Mapas orientados a dados (F2-05, `src/data/maps/<id>.json`, escolha em `?map=` ou no menu de escaramuça):

- **`continental-1v1`** ("Vale do Rio", padrão, 1×1): 140×140 (área jogável ±55), continente com rio diagonal e 3 vaus (norte −16,−16 / centro 0,0 / sul 16,16). Base humana em (32,−30), orc em (−32,30). Slot extra (−14,−46) só usado em partidas FFA de teste (`?ffa=1`).
- **`ilhas-4p`** ("Ilhas Gêmeas", novo): 128×128, FFA de 4 jogadores — 2 ilhas ligadas por 2 pontes de terra, 2 slots por ilha. Jogue com `?map=ilhas-4p&ffa=1`.

**Vitória**: ser o último time com HQ (Castelo / Grande Salão) de pé. **Derrota**: perder o seu HQ (o jogador fica `defeated`; em FFA a partida segue até restar um time). Reinício = recarregar a página.

## Recursos

Tabela para `continental-1v1` (jazidas/florestas vêm de `mapDef.resources`/`mapDef.forests` — F2-05; `ilhas-4p` tem sua própria contagem, ver `src/data/maps/ilhas-4p.json`).

| Recurso | Fonte | Entrega |
|---|---|---|
| Madeira | Árvores (70 no mapa, clusters) | HQ ou Serraria |
| Ouro | 4 minas (1 perto de cada base + 1 extra + 1 central) | HQ |
| Pedra | 3 pedreiras | HQ |
| Ouro passivo | Fazenda / Chiqueiro: +3 ouro a cada 6s | — |

Recursos iniciais (ambos): 240 madeira, 200 ouro, 120 pedra. Trabalhador carrega até 15; extrai 3 a cada 0,9s. Constrói +10% a cada 0,8s.

População: soma de `popGranted` (HQ 5, Casa/Toca 5, Chiqueiro 5). Início = 10 de cap, 5 unidades.

## Unidades

| Tipo | Facção | HP | Vel | Dano | Alcance | Cooldown | Armadura | Custo (ouro/madeira/pedra) | Tempo | Treina em |
|---|---|---|---|---|---|---|---|---|---|---|
| Camponês | Humano | 85 | 4.5 | 7 | 1.8 | 1.0 | 0 | 50/–/– | 7 | Castelo |
| Espadachim (`knight`) | Humano | 200 | 4.8 | 27 | 2.1 | 1.1 | 4 | 70/50/5 | 11 | Quartel |
| Cavaleiro (`cavalier`, cavalaria — F4-01) | Humano | 300 | 6.2 | 34 | 2.3 | 1.2 | 4 | 120/60/20 | 14 | Estábulo Real (Centro nível 2) |
| Arqueiro | Humano | 97 | 4.3 | 18 | 14.0 | 1.4 | 0 | 40/20/– | 9 | Quartel |
| Lacaio | Orc | 90 | 4.5 | 8 | 1.8 | 1.0 | 0 | 50/–/– | 7 | Grande Salão |
| Talhador (`grunt`) | Orc | 198 | 4.7 | 28 | 2.1 | 1.15 | 4 | 70/50/5 | 11 | Quartel Orc |
| Lanceiro-Machado | Orc | 100 | 4.4 | 19 | 13.5 | 1.35 | 0 | 40/20/– | 9 | Quartel Orc |
| Ogro (cavalaria orc — F4-01) | Orc | 320 | 5.4 | 42 | 2.5 | 1.5 | 5 | 75/100/35 | 14 | Covil dos Ogros (Centro nível 2) |
| Bandido | Neutro | 125 | 4.4 | 16 | 2.1 | 1.2 | 1 | — | — | (não usado no jogo) |

Dano efetivo em unidade = `max(2, dano − armadura)`. Construções **ignoram armadura**. **Cavalaria (F4-01):** Cavaleiro (humano) e Ogro (orc) são treinados no **Estábulo Real / Covil dos Ogros**, que exigem Quartel + Centro nível 2 (`requires: [quartel, {hq: 2}]`; a unidade também exige `{hq: 2}`). Dano normal, sem bônus; `melee_weapons`/`melee_armor` valem para Espadachim/Talhador/Cavaleiro/Ogro. O cerco (F4-02) sai da **Oficina** (ver abaixo). O Quartel não treina cavalaria (`Building.queueUnit` só aceita o que está em `trains`, e só em construção concluída). Suprimento: 1 por unidade como as demais (o jogo não tem custo de suprimento por unidade). Nomes D7 nos dados: Espadachim, Talhador, Lanceiro-Machado, Camponês, Lacaio (ids internos inalterados). A IA usa `FACTIONS.*.units.cavalry` e `FACTIONS.*.units.siege` (`ballista`/`catapult`, F4-02).

## Construções

| Tipo | Facção | HP | Custo (madeira/pedra/ouro) | Função |
|---|---|---|---|---|
| Castelo | H | 1600 | — | HQ, treina aldeões, entrega tudo, +5 pop |
| Grande Salão | O | 1750 | — | HQ orc |
| Casa | H | 400 | 50 | +5 pop |
| Toca Orc | O | 450 | 50 | +5 pop |
| Serraria | H | 550 | 80 | Entrega de madeira |
| Serraria Orc | O | 580 | 85 | Entrega de madeira |
| Fazenda | H | 350 | 60 | +5 pop (F3-11: era 0; sem ouro passivo) |
| Chiqueiro | O | 420 | 55 | +5 pop |
| Quartel | H | 850 | 120 / 60 | Treina militares |
| Quartel Orc | O | 900 | 130 / 50 | Treina militares |
| Forja | H/O | 850 | 100 / 70 / 50 | Pesquisas |
| Oficina de Engenharia / dos Engenhoqueiros (`role:'workshop'`, F4-02) | H / O | 700 (armadura 15) | 100 / 40 / 180 | Treina Balista/Catapulta; exige Quartel + Centro nível 2. IA: constrói com Centro nível 2 e ≥ 8 combatentes; mantém 1–3 cercos (mais com mais tropas de linha) e os manda junto do exército no mesmo ATTACK (escolta melhor: NEW-30) |
| Estábulo Real / Covil dos Ogros (`role:'stable'`) | H / O | 900 (armadura 15) | 60 / 40 / 200 | Treina cavalaria; exige Quartel + Centro nível 2 (F4-01). IA: constrói com Centro nível 2, ≥ 600 de ouro e ≥ 6 combatentes; recruta 1 cavaleiro para cada 3 combatentes de linha |
| Torre de Vigia | H | 650 | 80 / 40 | Ataca: alcance 18, dano 18, cd 1.4 |
| Torre Orc | O | 700 | 85 / 40 | Alcance 18, dano 19 |
| Muralha de Pedra / Paliçada de Ferro | H / O | 250 (armadura 10) | 10 / 20 por segmento | Segmento de muralha (F3-08): bloqueia o caminho até ser destruído; disponível no nível 1 |

### Muralhas (F3-08)
- **Colocação por arrasto:** escolha "Muralha de Pedra" (humano) / "Paliçada de Ferro" (orc) no painel do aldeão/peão (tecla M), pressione o botão esquerdo no ponto A e arraste; o traço segue a linha reta A→B (8 direções, um segmento a cada `WALL_STEP` = 2,4 unidades) e soltar confirma **todos os segmentos válidos** (custo n × 10 madeira / 20 pedra, só dos válidos; sem recursos para todos, nada é criado). Clique simples = 1 segmento; Esc/botão direito cancela. Segmentos vermelhos (terreno, árvore, outra construção, vau) são ignorados. Máximo de 60 segmentos por comando (`PLACE_WALL`).
- **Regras de posição:** o afastamento de 3,2 entre construções não vale entre muralhas do mesmo dono (passo 2,4 permitido) e cai para 0,5 contra torre/Centro do mesmo dono; contra as demais construções vale como sempre.
- **Bloqueio:** segmento em obra ou concluído bloqueia o pathfinder (raio 1,5; uma fileira com passo 2,4 não deixa fresta, inclusive na diagonal); destruir um segmento reabre a passagem. **Não há portão** nesta versão: a lacuna é uma abertura que o jogador deixa de propósito (não coloca segmento ali). Portão e conexões visuais entre segmentos ficam para NEW-24.
- **Unidades e muralha inimiga:** ordem direta de ataque (clique direito) funciona; muralhas **não** são alvo de auto-aquisição (unidades ociosas, em patrulha, em hold ou em attack-move não as escolhem por conta própria). Quando o caminho ao alvo/destino fica fechado por muralha (pathfinder marca `path.noPath`), a unidade em **ataque** ou **attack-move** ataca a muralha hostil mais próxima do ponto alcançável mais próximo e retoma o objetivo quando ela cair; em ordem de **movimento** ela vai até o ponto alcançável mais próximo.
- **Visual:** modelo procedural (bloco de pedra clara / madeira escura com ferro), desenhado por um `InstancedMesh` por facção (`Wall`/`WallBatch` em `src/entities/Wall.js`, teto de 400 instâncias): 40 segmentos custam +2 draw calls (principal + sombra) em vez de 40.

Fila de treino: até 6 itens; cancelar reembolsa 100%. Posicionamento: terreno seco, folga de 3,2 de outras construções, 3,5 de árvores, fora dos vaus.

## Cerco (F4-02)

- **Balista** (humana) e **Catapulta** (orc): PV 220, vel. 3,0, armadura 0, dano `siege` 80, alcance 20, **alcance mínimo 4**, recarga 3,2 s, **área r 1,5**, 90 ouro/200 madeira/40 pedra, 18 s, exigem `{hq: 2}` e saem da **Oficina**. Mesmos números; só o projétil muda (`bolt`: rápido e raso, 22 u/s; `boulder`: pedra em arco alto, 14 u/s).
- **Dano em área**: no impacto, toda entidade **hostil** (unidades e construções) com o centro a ≤ `splashRadius` do ponto sofre `computeDamage` × queda linear (100 % no centro → 50 % na borda). Sem fogo amigo. Contrato de RNG: 1 valor por entidade atingida, em ordem crescente de `id`. `siege` = ×1,5 contra construções e ×0,5 contra unidades.
- **Sapadores / Incendiários (F4-05, suicidas):** PV 60, vel. 5,0, 70/25/0, 10 s, Centro nível 2, treinados na Oficina. Ao chegar ao alcance (1,2 + raio do alvo) **detonam**: dano `siege` 400 (×1,5 construção, ×0,5 unidade, armadura do alvo aplicada) em raio 2,2 medido até a **superfície** das entidades hostis (queda 100 % → 40 %; 1 RNG por entidade em ordem de `id`; sem fogo amigo), e morrem sem cadáver (contam em `unitsLost`; sem kill para o inimigo). Não auto-adquirem unidades: preferem a construção/muralha mais próxima; ordem explícita de ataque em qualquer hostil funciona; em `hold` só explodem em quem entra no alcance. 1 sapador costuma abrir 1–3 segmentos de muralha (250 PV, armadura 10); a IA manda até 3 junto do ataque quando o inimigo tem ≥ 4 muralhas ou Centro nível ≥ 2.
- **Projétil balístico** (`BallisticProjectile`): não persegue; mira a **posição prevista** (posição + velocidade × tempo de voo; a velocidade de cada unidade é medida a cada tick em `GameManager`). Parábola com pico `clamp(dist × 0,35, 2, 9)`. Se o alvo saiu do raio antes do impacto, o míssil erra (e atinge quem estiver na área).
- **Alcance mínimo**: alvo a menos de `minAttackRange` (distância de borda) não é atacável; a unidade troca para outro alvo dentro da janela [min, max] ou **recua** até `min + 0,5`. A auto-aquisição só escolhe alvos dentro da janela. Cerco não ataca alvos aéreos (`layer === 'air'`, F4-06) e não ataca em movimento.
- **Pesquisa** `siege_damage` (Forja, 2 níveis): +15 dano básico por nível; nível 1 exige a Oficina construída (`{role:'workshop'}`). Nomes: "Munição Explosiva" / "Pedras Incendiárias".
- Medições (F4-02, `tools/combat-table.mjs`): Catapulta × Grande Salão ≈ 81 s na simulação (contra 290 s do Cavaleiro × Castelo); ver §6.1 do design.

## Pesquisas (Forja e Serraria) — F3-07

Catálogo `RESEARCH` em `src/data/upgrades.js`; nível por jogador em `Player.researchLevels`. Pesquisa-se o **próximo nível** na construção de `role` correspondente (Forja/Forja de Guerra = `forge`; Serraria/Serraria do Clã = `lumber`); uma pesquisa por construção e nunca a mesma em duas construções do jogador. Nível 2 exige Centro nível 2 (`{hq:2}`). Cancelar reembolsa 100%.

| ID (onde) | Níveis | Efeito por nível | Custo nv1 / nv2 | Tempo |
|---|---|---|---|---|
| melee_weapons (Forja) | 2 | +2 dano básico (Cavaleiro/Grunt/Ogro) | 200o 100m · 400o 200m | 30 / 45 s |
| melee_armor (Forja) | 2 | +2 armadura | 150o 100m 80p · 300o 200m 160p | 30 / 45 s |
| siege_damage (Forja; nv1 exige Oficina) | 2 | +15 dano básico (Balista/Catapulta) | 300o 300m · 600o 500m | 40 / 60 s |
| ranged_ammo (Serraria) | 2 | +1 perfurante (atiradores e classe avançada) | 200o 100m · 400o 200m | 30 / 45 s |
| woodcutting (Serraria) | 1 | +25% madeira entregue | 300o 150m | 40 s |
| ranged_class (Serraria, Centro 2) | 1 | promove Arqueiro→Patrulheiro / Lanceiro→Enfurecido (vivos e novos; Quartel passa a treinar a classe avançada) | 800o | 60 s |
| ranger_longbow / ranger_sight / ranger_marksman (humano) | 1 cada | +2 alcance / +4 visão / +3 perfurante | 500o / 1500o / 2500o | 40 / 50 / 60 s |
| berserker_range / berserker_regen / berserker_fury (orc) | 1 cada | +2 alcance / regenera 1 PV/s / +3 perfurante | 500o / 1500o / 2500o | 40 / 50 / 60 s |

Classe avançada exige `ranged_class`. Patrulheiro/Enfurecido (`src/data/units.js`, `modelOf`) = atirador +10% PV, +1 perfurante, com o modelo 3D do atirador base (arte nova é F7). Cerco e naval ficam para F4. IA: `AIEconomyManager.considerResearch`.

## Comportamento das unidades

Estados: `idle, moving, gathering, returning, building, attacking, dying`.
- **Idle militar**: auto-aggro em raio 11 (corpo a corpo) / 14 (distância).
- **Ataque**: persegue a cada frame; ao matar alvo procura outro num raio 16; alvo prioritário = unidade de combate > trabalhador > torre > construção. Enquanto ataca construção, reescaneia ameaças a cada 0,35s.
- **Retaliação**: quando atingida, contra-ataca; aliados de combate ociosos num raio 14 ajudam.
- **Projéteis**: sempre acertam (teleguiados).
- **Movimento**: A* só desvia de água; construções/árvores resolvidas por empurrão de colisão. Formação = grade quadrada simples.

## Controles existentes

| Ação | Input |
|---|---|
| Selecionar / caixa | Clique esquerdo / arrastar |
| Ordem contextual (mover, atacar, coletar, construir, rally) | Clique direito |
| Câmera | WASD/setas, scroll zoom, Q/E rotaciona |
| Ir ao HQ | H |
| Cancelar | Esc |
| Minimapa | Clique move câmera |

**Não existem**: grupos de controle, shift-queue, attack-move, stop/hold/patrol, duplo clique por tipo, atalhos do card de comandos, pan pela borda da tela, seleção de inimigos para inspeção.

## IA (AIDirector)

Tick de 1s. Utilidades:
- `U_def`: intrusos a < 26 da base → todas as tropas ociosas atacam o intruso mais próximo.
- `U_housing/U_eco`: constrói casas perto do limite de pop; mantém 8–12 trabalhadores; emergência se < 3.
- Muralha (F3-08): nas dificuldades normal/difícil/brutal, com ≥ 8 trabalhadores, Quartel, ≥ 1 torre e sobra de madeira/pedra, a IA constrói **uma** linha de 6 segmentos a ~16 unidades do Centro, perpendicular à direção do Centro inimigo. Suas tropas derrubam a muralha inimiga que fechar o caminho (comportamento da unidade, ver "Muralhas").
- `U_mil`: quando tropas prontas ≥ limiar (4 → 5 → 6 → 3 …) envia onda contra torre mais próxima > HQ > qualquer construção.
- Custos: a IA usa os **mesmos custos reais** de `src/data/` (bug B3 corrigido na F0-06; antes o arremessador custava 60 madeira/35 ouro para a IA contra 20/40 real, e o quartel/serraria/torre/chiqueiro orc e o "cerco" humano também estavam com valores próprios).
- A IA é **onisciente** (lê `gm.units` diretamente), sem níveis de dificuldade, sem micro, sem scout, sem pesquisar melhorias de forma estratégica.

## Condições de vitória (F3-09)

`MatchConfig.victoryMode` (`?victory=regicide`, seletor no menu de escaramuça, chave `warpoly.victory`):
- **Destruir tudo** (`conquest`, padrão): o jogador é derrotado quando não resta nenhuma construção viva dele. Contam construções em obra e torres; **muralhas (`role:'wall'`) não contam**. Unidades sem construção não salvam o jogador.
- **Regicídio** (`regicide`): derrotado quando não resta Centro (`role:'hq'`) vivo.
- Vitória quando `aliveTeams().size <= 1`; derrota se o jogador local cair. Um jogador derrotado emite `PLAYER_DEFEATED` uma vez; suas unidades e construções **permanecem no mapa, inertes** (não recebem ordens, não atacam, não produzem) e podem ser destruídas.
- O modal de fim de jogo mostra a mensagem do modo, tempo, unidades mortas/perdidas e construções destruídas/perdidas.

## Neutros hostis e critters (F3-10)
- Mapas com `neutrals` criam o jogador neutro hostil (`NEUTRAL_HOSTILE_ID = 99`, time 99): hostil a todos, mas fora de vitória/derrota, população, HUD, IA e estatísticas.
- **Acampamento de bandidos**: `bandit_camp` (PV 1400) com 4 bandidos em círculo (raio 5) e uma jazida de ouro própria (3000) a ~9 unidades. Os bandidos guardam por auto-aquisição (`aggroRange`) e têm **leash de 22** da origem: ao se afastarem mais que isso largam o alvo, voltam (`Unit._updateGuardLeash`) e recuperam 5 % do PV máximo por segundo. A jazida só é minerada por jogadores normais; guardas vivos atacam os mineradores próximos.
- **Recompensa**: destruir o (último) acampamento do cluster credita `reward` (300 de ouro nos mapas atuais) a quem deu o último golpe e emite `EVT.CAMP_CLEARED` + aviso "Acampamento de bandidos destruído! +300 de ouro".
- **Critters** (ovelha/porco, `src/entities/Critter.js`): decorativos, `hp 8`, vagam ao redor da origem, fogem 4 s ao serem feridos, só são atacados por ordem explícita (clique direito), deixam carcaça por 3 s e não dão recursos nem contam em estatísticas. Não aparecem no minimapa; parados fora da visão não se movem.
- Névoa/minimapa: bandidos e acampamento só aparecem em área visível; no minimapa os pontos neutros hostis são laranja. Clicar no acampamento mostra um card informativo (sem comandos).
- A IA não ataca acampamentos (NEW-25 no backlog).

## Névoa de guerra

Névoa no estilo Warcraft II (F1-05), aplicada no próprio shader dos materiais do mundo (sem plano sobreposto — nada "atravessa" a névoa). Grade lógica 128² sobre o mapa, recalculada a 10 Hz, com 3 estados por célula:
- **Não explorado**: preto.
- **Memória** (já explorado, sem visão agora): terreno/água/árvores/construções escurecidos e dessaturados; unidades inimigas **não aparecem** (nem no minimapa).
- **Visível agora**: normal.

Regras por tipo de entidade:
- **Unidades inimigas**: só desenham (mesh + barra de vida) com visão atual sobre a posição; somem ao saírem da visão. Unidades e construções aliadas/próprias são sempre visíveis.
- **Construções inimigas**: uma vez vistas, ficam na memória (malha visível, escurecida; barra de vida oculta). Se destruídas fora da visão, um **fantasma** (clone do template, escurecido) permanece no lugar até a área ser revista — então some, revelando que a construção não existe mais.
- **Minimapa**: mesmos 3 estados; inimigos só aparecem com visão atual; fantasmas de construção desenhados como construções.

Nova partida (F2-04, sem recarregar a página) começa com a névoa zerada (`FogOfWar.dispose()` + `reset()`).

## Opções

Velocidade 1×/2×/3×, pausa, volume SFX/música, iluminação (dia/pôr-do-sol/noite), guia, link para o inspetor.

## Reparo, cancelamento de obra e obra cooperativa (F3-05)

- **Reparo** (`CMD.REPAIR`, estado `repairing` do trabalhador): a cada 0,8 s restaura 5% do PV máximo (20 golpes = 100%) e cobra `ceil(custo × 0,5 × PV restaurado/PV máx.)` por recurso, por golpe (`src/sim/repair.js`). Sem recursos o trabalhador para e o dono local é avisado. Vale para toda construção própria concluída e danificada, muralhas incluídas. Só o próprio dono repara (aliados: fora do escopo). A IA repara construções com PV < 70% (1 ocioso por construção, sem ataque nos últimos 6 s); o jogador humano só por ordem (clique direito, botão/tecla R).
- **Cancelar obra** (`CMD.CANCEL_CONSTRUCTION`): devolve 75% do custo total (independe do progresso), libera população/bloqueio de caminho, os trabalhadores param e emite `BUILDING_CANCELLED` (não é baixa em combate). Construção concluída não pode ser cancelada.
- **Obra cooperativa**: cada trabalhador soma seu golpe (linear); máximo de 4 trabalhadores por construção (obra ou reparo) — o 5º é recusado com aviso e fica parado. `building.workerCount` é recalculado por tick.
- **PV da obra**: nasce com 10% do PV máximo e sobe proporcionalmente ao progresso até 100%.
