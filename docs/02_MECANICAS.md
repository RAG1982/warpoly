# 02 — Mecânicas e Regras de Jogo (estado atual)

> **Fonte de verdade: `src/data/`** (F0-06). Todos os números de balanceamento vivem em `src/data/units.js`, `buildings.js`, `upgrades.js` e `factions.js` (helpers em `src/data/index.js`). As tabelas abaixo são um resumo para leitura; em caso de divergência, vale o código em `src/data/`. Para mudar um valor, edite só ali. `tools/check-data-parity.mjs` compara os valores com o snapshot anterior à centralização.
>
> Valores extraídos do código em 2026-09-28.

## Visão geral

RTS no estilo Warcraft II: **Reino Humano** vs **Clãs Orcs**, jogador contra uma ou mais IAs. Mapas orientados a dados (F2-05, `src/data/maps/<id>.json`, escolha em `?map=` ou no menu de escaramuça):

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
- **Movimento (F3-02)**: A* contorna água, construções e árvores. Ordens de MOVE/ATTACK_MOVE com várias unidades formam uma **formação** em linhas voltadas para a marcha (largura:profundidade ≈ 1,6:1, espaçamento pelo raio médio, mín. 1,6 u); cada unidade recebe o lugar que preserva a ordem relativa em que já estava (sem cruzar caminhos). O **grupo anda na velocidade da unidade mais lenta** (cavalaria não se descola do cerco). Em marcha as unidades **desviam das vizinhas por steering** (separação suave) em vez de só serem empurradas; unidades parada(s) cedem menos que quem chega e a tolerância de chegada cresce com as vizinhas já assentadas — a formação não "dança". Grupos de 6+ unidades e unidades grandes (raio ≥ 1) usam caminho com folga (evitam frestas de ~1 u entre lago e mina). Unidade presa é detectada (sem progresso por ~0,7 s): perto do destino/waypoint ela assenta/avança, longe pede caminho novo (até 8 vezes). Empurrões de colisão nunca jogam unidades na água.

## Controles (F3-01)

Lógica pura em `src/core/Hotkeys.js` (`resolveKey`) e `src/core/ControlGroups.js`; execução em `InputManager` — tudo emite **comandos** (`gm.issue`). Testes: `tests/unit/hotkeys.test.js`, `controlGroups.test.js`.

| Ação | Input |
|---|---|
| Selecionar / caixa | Clique esquerdo / arrastar (máx. `SELECTION_LIMIT = 24`: as mais próximas do centro da caixa) |
| Alternar unidade / adicionar caixa | `Shift`+clique / `Shift`+caixa |
| Todas do mesmo tipo na tela | Duplo clique numa unidade própria (< 350 ms) |
| Ordem contextual (mover, atacar, coletar, construir, rally) | Clique direito; com `Shift` enfileira (`queued`) |
| Grupos de controle | `Ctrl+1..9` grava · `1..9` seleciona · duplo toque (< 350 ms) centraliza · `Shift+1..9` adiciona |
| Parar / Segurar posição | `S` / `H` (STOP / HOLD) |
| Atacar-movendo / Patrulhar | `A` / `P`, depois clique esquerdo (ATTACK_MOVE sobre o chão; ATTACK se clicar num inimigo; PATROL); Esc ou clique direito cancela |
| Atalhos do card | Letras exibidas nos botões (construir C/L/F/B/K/V/O/G/J/T/M, treinar Q/W/E, pesquisa R/A/S/D, reparar R, habilidades Z/X/C/V/B/N) acionam o botão visível |
| Trabalhador ocioso | `.` (próximo, em ciclo; centraliza) |
| Último alerta | `Espaço` (F6-05: alerta mais novo do `AlertCenter`; toques seguidos em ≤ 5 s percorrem os 8 anteriores; sem alertas, o último dano sofrido / HQ) — remapeável |
| Ir ao HQ | `Backspace` (antes era `H`) |
| Câmera | WASD/setas, scroll zoom, Q/E rotaciona, botão do meio arrasta, mouse a ≤ 8 px da borda (Opções > Controles: liga/desliga e velocidade) |
| Minimapa | Clique esquerdo move a câmera; clique direito com unidades selecionadas = MOVE (`Shift` enfileira) |
| Cancelar | Esc (modo-alvo → colocação → seleção → menu de pausa) |

**Prioridade de teclas**: com **unidades** selecionadas (sem construção) `S/H/A/P` são ordens e não movem a câmera (use as setas); as demais letras acionam o card se existir ali. Com **construção** selecionada valem as letras do card (`Q/W/E` treino, `R/A/S/D` pesquisa), então essas teclas não movem/rotacionam a câmera. Em modo-alvo (atacar-movendo, patrulhar, reparar, habilidade) ou colocação de construção, letras de ordem e do card ficam bloqueadas; grupos e Backspace continuam. Teclas são ignoradas com foco em campo de texto.

**Ainda não existem**: seleção de inimigos para inspeção. Rebind das ações de ordem/alerta: Opções > Controles (F6-08).

## IA (AIDirector) — F5-01..F5-05

Um `AIDirector` por jogador de IA (`gm.aiDirectors`); todas as decisões saem como comandos por `director.issue` (que respeita o orçamento de APM e chama `gm.issue`). Intervalo de decisão = atraso de reação da dificuldade (Normal 1,0 s). Funciona em FFA/times (cada IA vê como hostil o que `gm.isHostile` diz).

**Dificuldades** (`src/ai/AIProfile.js`; `MatchConfig.difficulty` e, por jogador, `players[i].difficulty`; `?difficulty=`):

| | Fácil | Normal | Difícil | Brutal |
|---|---|---|---|---|
| APM máx. (comandos/min; o uso real é ~25) | 20 | 60 | 120 | 240 |
| Reação (s entre decisões) | 2,5 | 1,0 | 0,75 | 0,5 |
| Micro (0–3) | 0 | 1 | 2 | 3 |
| Onda base · atraso da 1ª onda | 3 · 7 min | 6 · 6,5 min | 6 · 1,5 min | 7 · 0 |
| Avaliação de força (razão mín. · inimigo suposto) | cega | 1,0 · 0,8 | 1,2 · 0,9 | 1,2 · visão total |
| Limite de combatentes | 10 | — | — | — |
| Bônus de coleta | — | — | — | +25 % |
| Visão | névoa | névoa | névoa | mapa inteiro |
| Trabalhadores (vs. estratégia) | −2 | 0 | +2 | +4 |
| Pesquisa na Forja (ouro mínimo em caixa) | 400 | 400 | 120 | 60 |
| Conjuradores · muralha · scout | não · não · não | não · sim · sim | sim · sim · sim | sim · sim · sim |
| Estratégias sorteáveis | boom, turtle | rush, boom, turtle | rush, boom, turtle (+air) | idem |

Atraso da 1ª onda (`startDelay`) = segundos de partida antes da 1ª expedição; na estratégia *rush* vale `startDelay × rushDelayScale` (0,4 em Fácil/Difícil/Brutal; 1 no Normal, para o rush do Normal não abrir antes dos 6,5 min). M1-08/NEW-9: contra um jogador parado, o Centro só cai depois de 6,8 min no Normal (mín. em 24 partidas; antes: 2,5 min) e 7,6 min no Fácil (medido com `node tools/idle-hq-check.mjs`; Difícil/Brutal podem derrubar antes, de propósito).

O orçamento de APM é um balde de fichas (capacidade = APM/6, reposição APM/60 por segundo): comandos além dele são adiados para a decisão seguinte. A economia roda a no máximo 1 decisão por segundo e só realoca trabalhadores já ocupados a cada 6 s (reagir mais rápido não deve significar mexer mais nos peões — isso derrubava a produção de quem decidia a 0,75 s).

**Percepção (F5-02)**: a IA só conhece o que suas unidades/construções veem (`visionRadius`). Mantém memória de construções inimigas (fantasma até a posição ser revista sem elas) e de unidades (45 s). Alvos de ataque, direção da muralha e composição inimiga vêm só dessa memória. Sem alvo conhecido o exército marcha em attack-move ao slot de início mais plausível; um explorador (unidade ociosa reservada) visita os slots e as células inexploradas até a base inimiga ser conhecida. Só o Brutal "trapaceia" (vê tudo).

**Estratégias (F5-04, `AIStrategy.js`)**: sorteadas pelo RNG da IA (determinístico por seed + jogador, ponderado pela dificuldade): *rush* (2 quartéis, 1ª onda cedo, pouca economia), *boom* (mais trabalhadores, evolui o Centro cedo, cavalaria, tech), *turtle* (4 torres, onda tardia, cerco cedo) e *air* (**desligada** — `AI_FEATURES.air = false` até a F4-06). A mistura do exército é ajustada pela composição conhecida do inimigo (mais atiradores contra corpo a corpo, montarias/infantaria contra atiradores, +1 cerco contra torres/muralhas/Centro nível ≥ 2) e por facção.

**Micro (F5-05, `AIMicroManager.js`)**: nível 1: recua feridos (< 30 % PV, longe da base); nível 2: foca fogo (conjurador/suicida > atirador/cerco > corpo a corpo > trabalhador, menor PV efetivo), kiting de atiradores só contra alvos mais lentos (as infantarias e montarias são mais rápidas que os atiradores: fugir delas só perderia dano), escolta que acode o cerco ameaçado, reação total à invasão (as tropas da onda voltam se a defesa de casa é menor que os invasores), 2ª serraria junto de um bosque denso, quartéis extras com ouro parado, assédio a trabalhadores com 2 montarias (só com ≥ 3 montarias, depois de 4 min, volta se houver ≥ 3 soldados inimigos ou PV < 40 %), Torre Arcana + pesquisas + Mago/Necromante com magias por política (Bola de Fogo/Nevasca/Nuvem em aglomerados, Lentidão/Transmutação nos mais fortes, Toque da Morte em feridos, Pressa/Armadura Profana/Escudo de Chamas em infantaria em combate, Erguer Mortos com cadáveres); nível 3: flanco (montarias dão a volta por um waypoint lateral e só então atacam o alvo).

**Habilidades de herói na IA (M2-11, `AIMicroManager._planHeroCast`)**: nível de micro ≥ 2, só com inimigo visível a ≤ 20 do herói e fora de `casting`; determinístico (sem RNG; empate pela ordem de `foes`/`army`); `canCast` (mana, recarga, cadáveres) vale antes. A primeira habilidade da lista do herói cujo gatilho vale é lançada (1 por tique). Antes só a Cura (`hero_mend`) era coberta, pelo auto-cast do simulador (`Unit._autocastScan`, só ocioso/em marcha de ataque); o `_planCast` não tinha caso para nenhuma `hero_*`. Partidas padrão não têm heróis: checksum do `headless-match` inalterado.

| Herói | Habilidade | Condição de uso da IA |
|---|---|---|
| Brann | Grito de Guerra (`hero_war_cry`) | sem Sede de Batalha e inimigo a ≤ 10 (herói atacando ou inimigo a ≤ 6) |
| Brann | Golpe Transpassante (`hero_cleave_strike`; igual `hero_shield_bash`) | alvo a ≤ alcance+1,5 com ≥ 2 inimigos no raio 2,5 ou PV ≥ 1,5× dano (melhor aglomerado) |
| Brann | Postura Defensiva (`hero_defensive_stance`; igual `hero_revide_stance`) | sem Escudo de Chamas e inimigo corpo a corpo/montado a ≤ 5 |
| Drogath | Grito de Guerra | idem Brann |
| Drogath | Golpe de Brasa (`hero_ember_strike`) | idem Golpe Transpassante (raio 2,5; mágico) |
| Drogath | Fogo do Clã (`hero_clan_fire`) | faltam ≥ 120 PV ao herói |
| Oren | Raio Arcano (`hero_arcane_bolt`) | alvo no alcance+1,5 com ≥ 2 inimigos no raio 3 ou PV ≥ 90 |
| Oren | Restauro (`hero_mend`) | aliado (herói incluso) no alcance com < 60 % PV; escolhe o mais ferido |
| Oren | Tempestade Arcana (`hero_blizzard`; igual `hero_arcane_storm`) | canaliza: ≥ 3 inimigos num raio 5 dentro do alcance e NENHUM inimigo a ≤ 3 do herói |
| Dorian | Estandarte (`hero_banner`) | herói em combate e ≥ 3 aliados lutando a ≤ 9 sem Pressa |
| Dorian | Escudos Cerrados (`hero_shield_line`) | herói em combate e ≥ 3 aliados lutando a ≤ 7 sem Escudo de Chamas |
| Dorian | Carga do Marechal (`hero_marshal_charge`) | alvo a ≤ 11,5 com ≥ 2 inimigos no raio 3 ou PV ≥ 135 |
| Vozgul | Dreno de Alma (`hero_soul_drain`) | alvo a ≤ 12 com PV ≤ 70 (abate) ou, com herói ≤ 85 % PV, o inimigo de mais PV |
| Vozgul | Chamado dos Ancestrais (`hero_ancestors`) | ≥ 2 cadáveres no raio 8 |
| Vozgul | Véu de Cinzas (`hero_ash_veil`) | aliado lutando no alcance, visível, com < 40 % PV (o mais ferido) |
| Skarn | Rugido dos Clãs (`hero_horde_roar`) | herói em combate e ≥ 3 aliados lutando a ≤ 8 sem Sede de Batalha |
| Skarn | Pacto de Sangue (`hero_blood_pact`; igual `hero_ash_pact`) | herói < 50 % PV, sem o status, inimigo a ≤ 8 |
| Skarn | Impacto no Solo (`hero_ground_slam`; igual `hero_crown_hammer`) | alvo a ≤ 4,5 com ≥ 2 inimigos no raio 4 ou PV ≥ 165 |


**Economia/militar (base F3/F4)**
- `U_def`: intrusos a < 26 da base → tropas ociosas atacam o intruso (1 comando em lote).
- `U_housing/U_eco`: constrói casas perto do limite de pop; trabalhadores conforme a estratégia (+ bônus da dificuldade); emergência se < 3 (o ouro fica reservado para recriar peões).
- Muralha (F3-08): dificuldades Normal+, com ≥ 8 trabalhadores, Quartel, ≥ 1 torre e sobra de madeira/pedra, **uma** linha de 6 segmentos a ~16 unidades do Centro, perpendicular à direção do Centro inimigo conhecido.
- Ondas: o limiar cresce por onda e cai com o tempo (anti-impasse: depois de 15 min, −1 a cada 5 min, mín. 2); a onda nunca leva o exército todo (guarda de casa: 1 unidade no Normal, 20 % ≥ 2 no Difícil+, atiradores ficam); antes de sair a IA compara o valor do seu exército com o do inimigo conhecido/suposto (defensor com +25 %); unidades da onda sem progresso por ~16 s desviam por um waypoint lateral e voltam ao ataque (anti-travamento); sem alvo conhecido o exército varre os slots e depois as células inexploradas (e recomeça a varredura quando tudo foi visto).
- Custos: a IA usa os **mesmos custos reais** de `src/data/`.
- Calibragem: `tools/ai-ladder.mjs` (Difícil × Normal e Normal × Fácil, ≥ 10 seeds, lados alternados).

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

## Alertas e feedback (F6-05)

`ui/UiEvents.js` alimenta o `AlertCenter` (`ui/alerts.js`, anexado em `uiManager.alerts`) com os eventos da simulação do jogador **local**: **"Estamos sob ataque!"** (`UNIT_DAMAGED`/`BUILDING_DAMAGED` com `amount > 0` e `UNDER_ATTACK` da IA; recarga 10 s e supressão se o novo ataque estiver a ≤ 20 u do anterior; som de alarme), **"Mina/Pedreira esgotada"** (`RESOURCE_DEPLETED`), **"Pesquisa concluída: X"**, **"Construção concluída: X"** (recarga 1,5 s/8 u para muralhas) e **"Não há comida suficiente"** (cliques de treino com população cheia; recarga 4 s; som `playError`). O banner (`#notification-box`) ganha cor por severidade (`data-severity`: danger/warn/good). Alertas de ataque e mina esgotada geram **ping no minimapa** (anel pulsante por 4 s, `ui/minimapPings.js`). Todos os alertas com posição entram no anel de 8 usado pela tecla Espaço. Limitação: o payload de dano não traz o atacante, então dano de fogo amigo/perigos de chão também dispara "sob ataque". Testes: `tests/unit/alerts.test.js`.

## Minimapa (F6-04)

Terreno renderizado do mapa real (1×/partida), construções e unidades na **cor de cada jogador** (neutros em laranja; hostis só com visão/memória), névoa, pings de alerta e o **trapézio do frustum** da câmera projetado no chão. **Clique esquerdo** (ou arrastar) move a câmera; **clique direito** dá a ordem contextual do mundo (atacar unidade/construção hostil visível, coletar mina, construir/reparar obra própria, mover; sem unidades e com construção própria selecionada = ponto de reunião; Shift enfileira) e deixa um flash colorido no ponto. Lógica em `ui/minimapView.js` (`tests/unit/minimapView.test.js`).

## Cursores contextuais e contorno (F6-06)

O cursor sobre o mundo muda conforme a ordem que o clique direito daria (`ui/cursors.js`): **atacar** (hostil ou crítter), **coletar** (mina/árvore com trabalhador selecionado), **construir** (obra própria) e **reparar** (construção própria danificada) — os três últimos exigem trabalhador —, **alvo de magia** (modo habilidade/patrulhar), **inválido** (alvo de magia inválido, modo reparar em construção íntegra, posição de construção bloqueada). Cursores SVG embutidos (hotspot central, fallback para cursor CSS). A entidade sob o mouse ganha **colchetes de canto** (`ui/HoverOutline.js`: 1 `LineSegments`, 1 draw call, cor por relação: vermelho hostil, amarelo recurso, verde próprio, azul aliado). Opções: **Cursores contextuais** (aba Jogo, `warpoly.contextCursors`) e **Contorno sob o mouse** (aba Gráficos; ajuste de `QualitySettings`: padrão ligado, desligado no preset Baixo). Testes: `tests/unit/cursors.test.js`.

## Tela pós-jogo (F6-07)

Ao fim da partida o `#game-over-modal` mostra o relatório de `ui/screens/PostGameScreen.js` a partir de `ui/postGame.js` (modelo puro sobre `matchStats.snapshot()`): título e mensagem do modo (vitória/derrota), tempo, **tabela de pontuação** estilo WC2 (posição no ranking, jogador com cor/facção/tag Você·IA·Vencedor, pontos, unidades treinadas/mortas/perdidas, construções feitas/destruídas/perdidas, ouro/madeira/pedra coletados, APM, linha de totais) e **gráficos de evolução** (canvas 2D; abas Unidades, Construções, Abates, Recursos coletados; uma linha por jogador na cor dele, amostras a cada 10 s da F3-09; partida < 10 s mostra aviso). Vencedores = time do jogador local na vitória (ou o único time vivo). Botões **Jogar novamente** (nova semente) e **Menu principal** ligados pelo `main.js`. Testes: `tests/unit/postGame.test.js`.

## Escaramuça — configuração de partida (F6-02)

Painel "Novo Jogo" do menu: facção do jogador (cartões + prévia 3D), mapa (miniatura; limite de oponentes = `maxPlayers − 1` do mapa, hoje 2 e 3), oponentes IA (facção Humano/Orc/Aleatória, dificuldade Fácil/Normal/Difícil/Brutal → `players[i].difficulty`, time 1–8, cor única entre as 8 de `PLAYER_COLORS`), posição inicial do jogador, recursos iniciais por jogador (Poucos ½× · Padrão · Muitos 2× · Fartos 4× de `STARTING_RESOURCES` → `MatchConfig.startingResources`), condição de vitória e semente (vazio = aleatória; número ou texto). É preciso haver ≥ 2 times diferentes (senão "Iniciar" fica desabilitado). Facção "Aleatória" resolve-se pela semente (determinístico). Lógica e testes: `ui/skirmishSetup.js`, `tests/unit/skirmishSetup.test.js`.

## Idioma e tutorial (F6-09)

- **Idioma**: pt-BR (padrão/fallback) e English. Primeiro uso = idioma do navegador; trocar em Opções › Interface › Idioma ou no botão **EN/PT-BR** do
  rodapé do menu (vale na hora, inclusive no meio da partida e do tutorial). Todo texto de UI, nomes de unidades/construções/magias/pesquisas, mensagens
  e o guia do jogo vêm de `src/i18n/*.json` (ver `01_ARQUITETURA.md`). Nomes em inglês são originais (Villager, Swordsman, Horseman, Slasher, Axe Thrower…).
- **Tutorial** (menu principal › Tutorial, "missão 0"): mapa pequeno com rival passivo; 8 objetivos guiados (selecionar, coletar madeira e ouro, construir
  casa/fazenda/quartel, treinar 2 soldados, destruir o Acampamento de Bandidos) com painel, setas e botão Pular; leva ~2 min de jogo com um jogador
  roteirizado (meta humana ≤ 8 min).

## Opções

**F6-08** — diálogo único `ui/screens/OptionsPanel.js` (menu principal, menu de pausa e engrenagem da HUD; o antigo `#settings-panel` foi removido). Abas:
- **Gráficos**: predefinição (Baixo/Médio/Alto/Ultra, `QualitySettings.set`) + avançado (textura, sombras, resolução dinâmica, FPS alvo/limite, escala de resolução máx.) via `QualitySettings.setOverride` (persistido em `warpoly.qualityOverrides`; escolher um preset descarta os ajustes). Textura exige recarregar a página (aviso). Iluminação dia/pôr-do-sol/noite aparece só com partida ativa.
- **Áudio**: geral × efeitos / música (`warpoly.volMaster/volSfx/volMusic`; efetivo = canal × geral, `ui/optionsApply.js`).
- **Controles**: velocidade de rolagem 0,5–2× (`warpoly.panSpeed`), rolagem pela borda, **remapeamento** das ações `stop/hold/attackMove/patrol/idleWorker/lastAlert/hq` (`warpoly.keybinds`, JSON; `Hotkeys.setBindings`; conflitos e teclas reservadas — dígitos, Esc, Enter, Tab, setas, F-keys, W/D — são recusados). Letras do card e grupos 1–9 não são remapeáveis.
- **Interface**: idioma (F6-09, `warpoly.lang`), escala da UI 0,75–1,5× (`warpoly.uiScale`), modo daltônico (`warpoly.colorblind` + `data-colorblind` no `<html>`; paletas de time = F7-02).
- **Jogo**: velocidade padrão 1×/2×/3× (`warpoly.defaultSpeed`, aplicada a cada nova partida e à atual), textos de dano (`warpoly.floatingText`), guia do jogo.
Persistência pura em `ui/optionsStore.js` (valores inválidos → padrão; espelho `runtime` lido por `InputManager`/`ParticleSystem`); botão "Restaurar padrão" por aba. Testes: `tests/unit/optionsStore.test.js`.

## Reparo, cancelamento de obra e obra cooperativa (F3-05)

- **Reparo** (`CMD.REPAIR`, estado `repairing` do trabalhador): a cada 0,8 s restaura 5% do PV máximo (20 golpes = 100%) e cobra `ceil(custo × 0,5 × PV restaurado/PV máx.)` por recurso, por golpe (`src/sim/repair.js`). Sem recursos o trabalhador para e o dono local é avisado. Vale para toda construção própria concluída e danificada, muralhas incluídas. Só o próprio dono repara (aliados: fora do escopo). A IA repara construções com PV < 70% (1 ocioso por construção, sem ataque nos últimos 6 s); o jogador humano só por ordem (clique direito, botão/tecla R).
- **Cancelar obra** (`CMD.CANCEL_CONSTRUCTION`): devolve 75% do custo total (independe do progresso), libera população/bloqueio de caminho, os trabalhadores param e emite `BUILDING_CANCELLED` (não é baixa em combate). Construção concluída não pode ser cancelada.
- **Obra cooperativa**: cada trabalhador soma seu golpe (linear); máximo de 4 trabalhadores por construção (obra ou reparo) — o 5º é recusado com aviso e fica parado. `building.workerCount` é recalculado por tick.
- **PV da obra**: nasce com 10% do PV máximo e sobe proporcionalmente ao progresso até 100%.

## Mana, habilidades, status e auto-cast (F4-03)

- **Mana**: unidades com `maxMana > 0` (`src/data/units.js`; máx. 255) regeneram `manaRegen` (padrão 1/s) por passo fixo e nunca passam do teto; mana só muda em `simStep`. Barra azul sob a de vida (aparece com a unidade selecionada ou com mana incompleta) e "Mana: x / y" no painel de seleção.
- **Habilidades** (`src/data/abilities.js`, até 4 por unidade no card 3×3): alvo `none|self|unit|ally|enemy|ground`, `range`, `castTime`, `manaCost` (+ `manaPerHp` na cura), `cooldown` por unidade e `requires` (mesma sintaxe das construções). `CMD.CAST`: a unidade anda até o alcance, para, toca a animação de conjuração (`casting`, interrompível por qualquer ordem nova — cancelar antes do fim **não** gasta mana nem inicia recarga), aplica os efeitos, debita a mana e inicia a recarga. Nenhuma magia erra. Mana insuficiente, recarga ou requisito ausente geram aviso (NOTIFY) e o comando é descartado.
- **Multi-seleção**: habilidades com alvo lançam em **uma** unidade (a de maior mana com recarga pronta); `none/self` lançam em todas as capazes. O card usa as habilidades do tipo mais numeroso entre os selecionados.
- **Efeitos**: `damage` (mágico ignora armadura; 1 RNG por alvo em ordem de id; com `radius` reutiliza o dano em área do cerco, 100 % → 50 %, sem fogo amigo), `heal` (até o PV máx.), `status`, `dispel`, `summon` (stub para F4-04).
- **Status** (`src/sim/statuses.js`): `slow`, `haste`, `bloodlust`, `invulnerable` com efeito real (velocidade, cooldown de ataque, dano, dano zerado); `invisible`/`polymorph`/`shielded` declarados sem comportamento. 8 slots fixos por unidade, expiram em ordem de id.
- **Auto-cast**: habilidades com `autocast: true` podem ser ligadas por unidade (clique direito no botão; `CMD.SET_AUTOCAST`); a cada 1 s (escalonado por id) a unidade ociosa/em attack-move procura alvo válido no alcance e lança se houver mana/recarga. Desligado por padrão.
- **Modo-alvo**: clique no botão (ou tecla da habilidade) entra em mira (cursor `crosshair`); esquerdo confirma, direito/Esc cancelam; alvo inválido avisa e mantém o modo. As habilidades `debug_bolt`/`debug_heal` só existem com `?debug` na URL.

## Magias, canalização, invisibilidade, polimorfia e cadáveres (F4-04)
- **Conjuradores**: Mago Arcano (Torre Arcana) e Necromante das Cinzas (Santuário das Cinzas); exigem Centro nível 3; 255 de mana máx., 85 inicial, +1/s. Cada magia é liberada por uma pesquisa (`spell_*`, construção `role: 'arcane'`).
- **Mago**: Bola de Fogo (projétil balístico, até 3 alvos em linha de 4), Lentidão, Escudo de Chamas (8 de dano mágico por golpe corpo a corpo recebido), Invisibilidade, Transmutação, Nevasca. **Necromante**: Toque da Morte (cura 50% do dano), Pressa, Erguer Mortos, Armadura Profana (invulnerável 6 s, depois -50% do PV atual), Nuvem de Cinzas. Restantes na F4-04b.
- **Canalização** (`effect.kind 'channel'`): o conjurador fica em `casting`; cada onda (1 s) cobra `manaCost`, para sem mana; nova ordem cancela (onda paga não é reembolsada).
- **Invisibilidade** (`src/sim/detection.js`): não é alvo de auto-aquisição/ordem de ataque/torres de quem não detecta; detectam unidades com `detector`, Torre Arcana/Santuário (raio 12) e qualquer unidade a ≤ 2. Acaba ao atacar, lançar ou receber dano. Aliados veem a unidade semi-transparente; inimigos não detectados, nada.
- **Polimorfia**: `GameManager.polymorphUnit` — vira `sheep` (PV ≤ 20) para sempre, mantendo id/dono; não afeta heróis, cerco, suicidas.
- **Cadáveres** (`gm.corpses`, pool de 64, `src/sim/corpses.js`): registrados ao morrer unidades não-`corpseless`, por 30 s; Erguer Mortos consome os mais antigos em raio 6 (1 esqueleto por cadáver, até 2, `lifetime` 60 s, sem suprimento, sem cadáver nem baixa ao expirar).

## Templo/Altar, classe avançada da cavalaria e magias restantes (F4-04b)
- **Templo da Luz / Altar das Tempestades** (`role: 'temple'`, 900 PV, exigem Estábulo/Covil + Centro 3): só pesquisam. `cavalry_class` (1000 de ouro, 60 s; "Ordenação" / "Ritual das Tempestades") promove Cavaleiro → **Templário** (+15 % PV/dano) e Ogro → **Ogro Feiticeiro** (+10 % PV) via `effect.promote`: unidades vivas mantêm % de PV e bônus, ganham 255 de mana (85 inicial) e habilidades; Estábulo/Covil passam a treinar a classe nova (`modelOf`: reutilizam o modelo do cavaleiro/ogro; sem tinta própria — NEW).
- **Templário**: Vista Sagrada (70 mana, alcance 40, revela raio 10 por 20 s via `FogOfWar.revealArea(x,z,r,ttl)`), Cura (6 mana por PV, 5 PV/s, `repeat` até o alvo ficar cheio, auto-cast ligado por padrão em aliados < 60 % PV), Exorcismo (4 mana por PV, só contra `undead`, dano mágico até o PV do alvo). **Ogro Feiticeiro**: Olho Vigia (70, invoca `watching_eye` 60 s: `layer:'air'`, `immune`, `detector`, visão 30, controlável), Sede de Batalha (50, status `bloodlust` 20 s), Runas Explosivas (200, 6 runas em círculo de raio 2,5; invisíveis a inimigos; explodem a ≤ 1,2 de um hostil terrestre: 60 de dano mágico em raio 1,5; duram 60 s; máx. 12 por jogador, as mais antigas somem). **Necromante**: Redemoinho (100 mana, `whirlwind` vaga 12 s dentro de raio 6, 12 de dano/s em raio 2 a unidades terrestres, amigas também; pesquisa `spell_whirlwind` no Santuário). Pesquisas de magia: 500–1000 de ouro, exigem `cavalry_class`.
- **Camada aérea mínima** (`unit.layer`, F4-06 estende): `layer:'air'` não é atingível por corpo a corpo nem cerco (`Unit._canEngage`, ordem `ATTACK`); `unit.immune` ignora todo dano e nunca é escolhido como alvo.

## Unidades aéreas e camada de voo (F4-06)
- **Voo**: `layer:'air'` (`units.js`; `flyHeight` padrão 4,5, Olho Vigia 0). Aéreo não usa pathfinder (`moveTo`/`moveTowards`/`stepTowards` seguem em linha reta, sobre água e relevo), não colide com construções/árvores nem com terrestres (`GameManager.resolveBuildingCollisions/resolveUnitCollisions`; entre aéreos só repulsão leve de 25 % do overlap) e não bloqueia o pathfinder. Y = max(terreno, 0,65) + `flyHeight`, suavizado (`Unit._updateFlightHeight`). Ordem de grupo mista: terrestres e aéreos têm formações separadas (`CommandExecutor.moveInFormation`).
- **Alvo**: `canTarget(attacker, target)` em `src/sim/targeting.js` (puro). Alvo aéreo só por `canHitAir`; `canHitGround:false` impede atacar o solo. `canHitAir` da unidade = campo de `units.js` ou, se omitido, "à distância e não cerco balístico" (arqueiro, lançador, mago, necromante); torres: `tower.hitsAir` (só Torre de Vigia/Torre Orc); magias: `hitsAir:false` na habilidade veta alvo aéreo (`targetProblem`; padrão true). Usado por `Unit.orderAttack`/`_canEngage`, `CMD.ATTACK`, torres, `applySplashDamage` (cerco/sapadores não ferem aéreos) e retaliação.
- **Batedor aéreo** (Planador de Engenho / Balão de Guerra, Oficina, Centro 2): 110/60/20, PV 120, vel 7, visão 30, `detector`, sem ataque. **Ataque aéreo** (Cavaleiro Grifo / Serpe de Guerra, Aviário/Ninho, Centro 3): 250/100/0, PV 350, vel 6,2, armadura 2, 38 mágico (ignora armadura) em área de raio 1,2 (queda 100→50 %, `applySplashDamage` centrado no alvo), recarga 1,6, alcance 2,5; atinge solo e ar. Aviário/Ninho (`role:'aerie'`, tecla Y): 300/150/60, PV 900, exigem Quartel + Centro 3. Sem cadáver.

## Navios de guerra, transporte, Fundição e submerso (F4-07b)
- **Frota** (`src/data/units.js`, `layer:'naval'`; Estaleiro/Doca; custos com petróleo): Fragata/Galé (280 PV, alcance 12, perfurante 26, atinge navio, aéreo e costa; Centro 2), Barcaça de Transporte (220 PV, capacidade 6, sem ataque; Centro 2), Couraçado/Leviatã de Ferro (520 PV, alcance 22, mínimo 6, 90 siege em área de 1,8, balístico; Centro 3 + Fundição/Fornalha Naval), Submersível/Tartaruga Colossal (200 PV, alcance 9, 60 perfurante, só ataca navios; Centro 3 + Fundição). Navios têm escala visual própria (`NAVAL_MESH_SCALE`) e `collisionRadius` 2,0–3,0.
- **Alvos**: navio mira navio e terra/construção **a até `SHORE_REACH` (2) da margem** (`Unit._shoreOk`); melee nunca atinge navio; atiradores/cerco em terra atingem navio ao alcance; couraçado não ataca aéreo.
- **Submersível**: invisível permanente (status `invisible`, 1e9 s; `detector` o revela como na F4-04). Emerge ao atacar ou ser ferido e **volta a mergulhar após `SUBMERGE_DELAY` (4) s** sem atacar; some do minimapa para quem não o detecta.
- **Transporte** (`src/sim/transport.js`): `CMD.LOAD {unitIds, targetId}` (terrestres → barcaça própria; a barcaça em `unitIds` com alvo terrestre vai buscá-lo) e `CMD.UNLOAD {unitId, x?, z?}`. O terrestre anda até a margem junto ao barco e embarca a ≤ `BOARD_DISTANCE` (3) de borda; barco longe da costa = ordem expira com aviso. Passageiro: `transportedBy`, `visible=false`, fora do `unitGrid`, sem ordens/colisão, acompanha o barco; capacidade por tipo (6). Desembarque: o barco navega à água junto da margem mais próxima do ponto (padrão: onde está) e solta a carga em anel. A carga morre com a barcaça (um `UNIT_DIED` por passageiro, matador = dono do atacante, sem cadáver). UI: botão "Desembarcar" e contador "Carga n/6" no card; clique direito em barcaça aliada com terrestres = embarcar; clique direito em terra com barcaças carregadas = desembarcar no ponto.
- **Fundição / Fornalha Naval** (`role:'foundry'`, costeira, 800 PV, 180/100/60; requer Estaleiro/Doca + Centro 2): `naval_cannons` (+8 perfurante/nível, 2 níveis) e `naval_hulls` (+3 armadura/nível, 2 níveis; também barcaça e petroleiro), custam petróleo; nível 2 exige Centro 3.
- **IA**: não treina navios (F5); só trata os inimigos navais pelas regras de `canTarget`; barcaça cheia não trava a sim (teste headless 3000 ticks com frotas).

## Novo mundo (2026-10-13)

- **Lava:** divisor de áreas. Bloqueia unidades terrestres e navais, aéreas atravessam, **não causa dano**. Não é água navegável: estaleiro e plataforma não podem ser colocados nela, e nenhum slot inicial ou jazida pode estar sobre ela (validação em `src/data/maps/validate.js`).
- **Biomas:** só visuais (decisão P-4). Não mudam velocidade, custo nem bônus.
- **Minas e pedreiras esgotadas desabam:** saem da simulação, os trabalhadores que estavam dentro ou na fila são soltos e procuram outra jazida. Fica uma ruína no local (só visual). Poços de petróleo não desabam.
- **Fauna decorativa:** ovelha e javali por bioma (`src/data/critters.js`). O javali substitui o porco no deserto, na savana e no pântano.
- **Heróis:** 6 heróis de campanha, 3 por facção (Liga de Aurelan: Brann, Oren e Dorian; Clãs do Cinzal: Drogath, Vozgul e Skarn). Cada um é único na partida (`unique`/`isHero`) e tem habilidades próprias. Dados em `src/data/units.js` e `src/data/abilities.js`.
- **Mapas jogáveis:** no mínimo 168×168 (regra P-7). As unidades iniciais nascem à frente da construção principal (P-13). A serraria inicial fica perto de arvoredo (P-14), testado nos dois mapas ampliados (`ilhas-4p` e `estreito-1v1`).
- Regras de design e decisões: `docs/specs/MUNDO-HISTORIA-CAMPANHA.md` e `docs/specs/MUNDO-TERRENO-MAPAS.md` §8.
