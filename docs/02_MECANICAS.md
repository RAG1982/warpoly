# 02 — Mecânicas e Regras de Jogo (estado atual)

> Valores extraídos do código em 2026-09-28. Quando o balanceamento for centralizado (tarefa **F0-06**), este documento deve apontar para `src/data/`.

## Visão geral

RTS 1×1 no estilo Warcraft II: **Aliança Humana** vs **Horda Orc**, jogador contra uma IA. Mapa único 140×140 (área jogável ±55): continente com rio diagonal e 3 vaus (norte −16,−16 / centro 0,0 / sul 16,16). Base humana em (32,−30), orc em (−32,30).

**Vitória**: destruir o HQ inimigo (Castelo / Grande Salão). **Derrota**: perder o seu HQ. Reinício = recarregar a página.

## Recursos

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
- `U_mil`: quando tropas prontas ≥ limiar (4 → 5 → 6 → 3 …) envia onda contra torre mais próxima > HQ > qualquer construção.
- A IA é **onisciente** (lê `gm.units` diretamente), sem níveis de dificuldade, sem micro, sem scout, sem pesquisar melhorias de forma estratégica.

## Névoa de guerra

Exploração permanente; unidades inimigas ficam visíveis em qualquer área **já explorada** (não há distinção entre "visível agora" e "memória"), o que anula boa parte da estratégia de informação.

## Opções

Velocidade 1×/2×/3×, pausa, volume SFX/música, iluminação (dia/pôr-do-sol/noite), guia, link para o inspetor.
