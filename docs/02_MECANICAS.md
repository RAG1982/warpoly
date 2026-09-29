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
| Aldeão | Humano | 85 | 4.5 | 7 | 1.8 | 1.0 | 0 | 50/–/– | 7 | Castelo |
| Cavaleiro | Humano | 190 | 4.8 | 26 | 2.1 | 1.1 | 4 | 70/50/5 | 11 | Quartel |
| Arqueiro | Humano | 95 | 4.3 | 18 | 14.0 | 1.4 | 0 | 40/20/– | 9 | Quartel |
| Peão | Orc | 90 | 4.5 | 8 | 1.8 | 1.0 | 0 | 50/–/– | 7 | Grande Salão |
| Grunt | Orc | 205 | 4.7 | 28 | 2.1 | 1.15 | 4 | 70/50/5 | 11 | Quartel Orc |
| Lançador de Machado | Orc | 100 | 4.4 | 19 | 13.5 | 1.35 | 0 | 40/20/– | 9 | Quartel Orc |
| Ogro | Orc | 320 | 4.0 | 42 | 2.5 | 1.5 | 5 | 75/100/35 | 14 | Quartel Orc |
| Bandido | Neutro | 125 | 4.4 | 16 | 2.1 | 1.2 | 1 | — | — | (não usado no jogo) |

Dano efetivo em unidade = `max(2, dano − armadura)`. Construções **ignoram armadura**. Humanos têm 2 tipos militares; Orcs têm 3 (Ogro sem equivalente humano — IA humana usa Cavaleiro como "cerco").

## Construções

| Tipo | Facção | HP | Custo (madeira/pedra/ouro) | Função |
|---|---|---|---|---|
| Castelo | H | 1600 | — | HQ, treina aldeões, entrega tudo, +5 pop |
| Grande Salão | O | 1750 | — | HQ orc |
| Casa | H | 400 | 50 | +5 pop |
| Toca Orc | O | 450 | 50 | +5 pop |
| Serraria | H | 550 | 80 | Entrega de madeira |
| Serraria Orc | O | 580 | 85 | Entrega de madeira |
| Fazenda | H | 350 | 60 | +3 ouro / 6s (**não dá pop**) |
| Chiqueiro | O | 420 | 55 | +3 ouro / 6s **e +5 pop** (assimetria) |
| Quartel | H | 850 | 120 / 60 | Treina militares |
| Quartel Orc | O | 900 | 130 / 50 | Treina militares |
| Forja | H/O | 850 | 100 / 70 / 50 | Pesquisas |
| Torre de Vigia | H | 650 | 80 / 40 | Ataca: alcance 18, dano 18, cd 1.4 |
| Torre Orc | O | 700 | 85 / 40 | Alcance 18, dano 19 |

Fila de treino: até 6 itens; cancelar reembolsa 100%. Posicionamento: terreno seco, folga de 3,2 de outras construções, 3,5 de árvores, fora dos vaus.

## Pesquisas (Forja)

| ID | Efeito | Custo | Tempo |
|---|---|---|---|
| infantry_attack | +5 ataque (Cavaleiro/Grunt/Ogro) | 100 ouro, 50 madeira | 14s |
| infantry_defense | +3 armadura | 80 ouro, 70 pedra | 14s |
| ranged_attack | +4 ataque (Arqueiro/Lançador) | 90 ouro, 60 madeira | 14s |
| ranged_defense | +2 armadura | 70 ouro, 50 madeira | 14s |

Nível único, sem pré-requisitos, sem tiers.

## Comportamento das unidades

Estados: `idle, moving, gathering, returning, building, attacking, dying`.
- **Idle militar**: auto-aggro em raio 11 (corpo a corpo) / 14 (distância).
- **Ataque**: persegue a cada frame; ao matar alvo procura outro num raio 16; alvo prioritário = unidade de combate > trabalhador > torre > construção. Enquanto ataca construção, reescaneia ameaças a cada 0,35s.
- **Retaliação**: quando atingida, contra-ataca; aliados de combate ociosos num raio 14 ajudam.
- **Projéteis**: sempre acertam (teleguiados).
- **Movimento**: A* só desvia de água; construções/árvores resolvidas por empurrão de colisão. Formação = grade quadrada simples.

## Controles (F3-01)

Toda ordem passa por `gm.issue` (comandos F2-02). Lógica pura em `src/core/Hotkeys.js` e `src/core/ControlGroups.js`.

| Ação | Input |
|---|---|
| Selecionar / caixa (máx. `SELECTION_LIMIT`=24, as mais próximas do centro da caixa) | Clique esquerdo / arrastar |
| Alternar unidade / somar caixa | `Shift`+clique / `Shift`+caixa |
| Todas as unidades do mesmo tipo na tela | Duplo clique numa unidade própria |
| Ordem contextual (mover, atacar, coletar, construir, rally) | Clique direito |
| Enfileirar qualquer ordem | Segurar `Shift` (`queued: true`) |
| Grupos de controle | `Ctrl+1..9` grava · `1..9` seleciona · duplo toque (<350 ms) centraliza · `Shift+1..9` adiciona |
| Parar / Segurar posição | `S` / `H` (`CMD.STOP` / `CMD.HOLD`) |
| Atacar-movendo / Patrulhar | `A` / `P`, depois clique esquerdo (Esc ou clique direito cancela) |
| Atalhos do card (construir C/L/F/B/K/T, treinar Q/W/E, pesquisa R/A/S/D) | Letra mostrada no botão; vale com construção selecionada ou trabalhador (construir) |
| Trabalhador ocioso | `.` (cicla) |
| Último alerta / HQ | `Espaço` (construção sob ataque, senão HQ) / `Backspace` (seleciona o HQ) |
| Câmera | WASD/setas, borda da janela (≤8 px; desliga com `localStorage['warpoly.edgePan']='0'`), botão do meio arrasta, scroll zoom, Q/E rotaciona |
| Minimapa | Clique esquerdo move a câmera; clique direito com unidades selecionadas = `CMD.MOVE` |
| Cancelar | Esc (modo alvo → colocação → seleção → pausa) |

Prioridade de teclas: modo alvo bloqueia letras; com unidades e **sem** construção selecionada, `S/H/A/P` são comandos; com construção selecionada valem as letras do card. Teclas consumidas por comando não movem a câmera (ex.: `S` não recua a câmera). Q/E só rotacionam se não houver botão do card com essa letra.

**Ainda não existem**: seleção de inimigos para inspeção.

## IA (AIDirector)

Tick de 1s. Utilidades:
- `U_def`: intrusos a < 26 da base → todas as tropas ociosas atacam o intruso mais próximo.
- `U_housing/U_eco`: constrói casas perto do limite de pop; mantém 8–12 trabalhadores; emergência se < 3.
- `U_mil`: quando tropas prontas ≥ limiar (4 → 5 → 6 → 3 …) envia onda contra torre mais próxima > HQ > qualquer construção.
- Custos: a IA usa os **mesmos custos reais** de `src/data/` (bug B3 corrigido na F0-06; antes o arremessador custava 60 madeira/35 ouro para a IA contra 20/40 real, e o quartel/serraria/torre/chiqueiro orc e o "cerco" humano também estavam com valores próprios).
- A IA é **onisciente** (lê `gm.units` diretamente), sem níveis de dificuldade, sem micro, sem scout, sem pesquisar melhorias de forma estratégica.

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
