# 05 — Paridade com Warcraft II (referência de design)

> O WarPoly é inspirado em **Warcraft II: Tides of Darkness / Beyond the Dark Portal**: mesma temática (Aliança Humana × Horda Orc) e a meta é **ter os mesmos recursos de jogo**, em 3D low-poly no navegador, e depois ir além (qualidade AAA, multiplayer web).
>
> ⚠️ **Propriedade intelectual**: mecânicas não são protegidas, mas nomes próprios, lore, logos e arte da Blizzard são. Para um lançamento público, usar **nomes e arte originais** (ex.: "Paladino" ok; "Death Knight", "Gul'dan", "Troll Axethrower", "Goblin Zeppelin" — trocar por equivalentes próprios). A coluna "Nome WarPoly" abaixo é uma sugestão.

Legenda: ✅ existe · 🟡 parcial · ❌ falta

## 1. Recursos econômicos

| WC2 | WarPoly hoje | Status | Decisão proposta |
|---|---|---|---|
| Ouro (minas, trabalhador entra na mina) | Ouro em depósitos, trabalhador bate do lado de fora | 🟡 | Trabalhador entra/some na mina ~1s, mina esgota, 1 minerador por vez com fila |
| Madeira (florestas densas que bloqueiam passagem) | Árvores esparsas em clusters | 🟡 | Florestas densas como **barreiras de terreno** que se abrem ao cortar |
| Petróleo (plataformas no mar, naval) | ❌ | ❌ | Adicionar com a fase naval |
| Comida (Fazendas +4, HQ +1) | Pop via Casa/Toca/Chiqueiro (+5) | 🟡 | Unificar em Fazenda/Chiqueiro = suprimento |
| — | **Pedra** (não existe no WC2) | ➕ | Manter como diferencial *ou* substituir por petróleo; decisão do produto (ver TASKS F3-00) |

## 2. Construções

| WC2 Humano / Orc | WarPoly | Status |
|---|---|---|
| Town Hall → Keep → Castle / Great Hall → Stronghold → Fortress (3 tiers) | Castelo / Grande Salão sem tiers | 🟡 |
| Farm / Pig Farm | Casa+Fazenda / Toca+Chiqueiro | 🟡 |
| Barracks | Quartel / Quartel Orc | ✅ |
| Lumber Mill (upgrades de ranged, bônus madeira) | Serraria (só entrega) | 🟡 |
| Blacksmith (armas/armaduras corpo a corpo e cerco) | Forja (4 pesquisas, 1 nível) | 🟡 |
| Scout Tower → Guard Tower / Cannon Tower | Torre de Vigia (1 nível) | 🟡 |
| Stables / Ogre Mound | ❌ | ❌ |
| Gnomish Inventor / Goblin Alchemist | ❌ | ❌ |
| Church / Altar of Storms | ❌ | ❌ |
| Mage Tower / Temple of the Damned | ❌ | ❌ |
| Gryphon Aviary / Dragon Roost | ❌ | ❌ |
| Shipyard, Foundry, Oil Refinery, Oil Platform | ❌ | ❌ |
| Muralhas (Walls) | ❌ | ❌ |
| Dark Portal / Circle of Power / Runestone (neutros de mapa) | ❌ | ❌ |

## 3. Unidades

| Papel | WC2 Humano | WC2 Orc | WarPoly | Status |
|---|---|---|---|---|
| Trabalhador | Peasant | Peon | Aldeão / Peão | ✅ |
| Infantaria | Footman | Grunt | Cavaleiro (papel de footman) / Grunt | 🟡 renomear Cavaleiro→Soldado e criar cavalaria real |
| Distância | Archer → Ranger | Axethrower → Berserker | Arqueiro / Lançador | 🟡 falta upgrade de classe |
| Cavalaria pesada | Knight → Paladin | Ogre → Ogre-Mage | — / Ogro | 🟡 |
| Cerco | Ballista | Catapult | ❌ | ❌ |
| Conjurador | Mage | Death Knight | ❌ | ❌ |
| Sapadores | Dwarven Demolition Squad | Goblin Sappers | ❌ | ❌ |
| Aéreo batedor | Gnomish Flying Machine | Goblin Zeppelin | ❌ | ❌ |
| Aéreo ataque | Gryphon Rider | Dragon | ❌ | ❌ |
| Naval | Oil Tanker, Destroyer, Transport, Battleship, Submarine | Oil Tanker, Destroyer, Transport, Juggernaught, Turtle | ❌ | ❌ |
| Heróis (BtDP) | Turalyon, Khadgar… | Grom, Deathwing… | ❌ | ❌ (campanha) |
| Neutros / critters | ovelhas, porcos, focas | — | Bandido e Acampamento (modelos prontos, sem uso) | 🟡 |

## 4. Habilidades e magias (mana)

| Humano | Orc | Status |
|---|---|---|
| Paladino: Holy Vision, Healing, Exorcism | Ogre-Mage: Eye of Kilrogg, Bloodlust, Runes | ❌ |
| Mago: Flame Shield, Slow, Invisibility, Polymorph, Blizzard | Death Knight: Death Coil, Haste, Raise Dead, Whirlwind, Unholy Armor | ❌ |
| Sapadores: explodir muralhas/rochas | idem | ❌ |

Requer: sistema de mana, habilidades com alvo (unidade/área/auto), pesquisas que liberam magias.

## 5. Pesquisas / upgrades

| WC2 | WarPoly | Status |
|---|---|---|
| Armas +2 níveis, Escudos +2 níveis (Blacksmith) | 1 nível ataque/defesa | 🟡 |
| Flechas/Machados +2 níveis (Lumber Mill) | 1 nível | 🟡 |
| Ranger/Berserker: Longbow, Scouting, Marksmanship / Regeneration… | ❌ | ❌ |
| Ballista/Catapult +2 níveis | ❌ | ❌ |
| Upgrades navais | ❌ | ❌ |
| Upgrade de HQ libera tiers | ❌ | ❌ |

## 6. Mapa e terreno

| WC2 | WarPoly | Status |
|---|---|---|
| Tilesets: Floresta, Inverno, Wasteland, Pântano | 1 bioma verde | 🟡 |
| Água navegável, costa, rochas/montanhas intransponíveis | Rio com vaus, borda oceânica | 🟡 |
| Mapas de 32×32 a 128×128, 2–8 jogadores | 1 mapa 1×1 fixo | ❌ |
| Editor de mapas (PUD) | ❌ | ❌ |
| Fog of war + shroud (preto não explorado, cinza visto) | Só shroud permanente, inimigos visíveis na memória | 🟡 (bug B1) |

## 7. Modos de jogo

| WC2 | WarPoly | Status |
|---|---|---|
| Campanha 14 missões por lado + expansão, briefings, objetivos variados (resgatar, escoltar, destruir X) | ❌ | ❌ |
| Skirmish / Custom Game (escolhe mapa, raça, recursos, oponentes) | 1×1 fixo via URL | 🟡 |
| Multiplayer LAN/Battle.net até 8 jogadores, times | ❌ | ❌ |
| Vitória: destruir tudo do inimigo | Destruir só o HQ | 🟡 |
| Tela de pontuação pós-jogo | ❌ | ❌ |

## 8. Controles e interface

| WC2 | WarPoly | Status |
|---|---|---|
| Seleção de até 9 unidades, grupos Ctrl+1..9 | caixa sem limite, sem grupos | 🟡 |
| Card de comandos com atalhos (M, S, A, P, H, B, …) | botões sem atalho | 🟡 |
| Attack, Move, Stop, Patrol, Stand Ground, Attack Ground | só ordem contextual | ❌ |
| Construir: B + letra; reparar construções (peões) | construir via botão; **sem reparo** | 🟡 |
| Minimapa com clique e ordens | só move câmera | 🟡 |
| Falas de confirmação das unidades ("Zug zug", "Yes, my lord") | SFX procedurais | 🟡 |
| Mensagens "Seu território está sob ataque" | só alerta de onda da IA | 🟡 |
| Velocidades de jogo, pausa, save/load | velocidade + pausa, **sem save** | 🟡 |

## 9. Resumo de paridade

- ✅ ~10% · 🟡 ~35% · ❌ ~55% dos recursos do WC2.
- Blocos grandes faltantes: **tiers de HQ + árvore tecnológica**, **magias/mana**, **cerco**, **aéreo**, **naval + petróleo**, **muralhas/reparo**, **campanha**, **editor de mapas**, **multiplayer 8 jogadores**.

A ordem de implementação está no [ROADMAP](06_ROADMAP_AAA.md) e cada item vira tarefa em [TASKS.md](TASKS.md) com prefixo `WC2-`.
