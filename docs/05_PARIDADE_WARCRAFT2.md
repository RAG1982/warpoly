# 05 — Paridade com Warcraft II (referência de design)

> O WarPoly é inspirado em **Warcraft II: Tides of Darkness / Beyond the Dark Portal**: mesma temática (Aliança Humana × Horda Orc) e a meta é **ter os mesmos recursos de jogo**, em 3D low-poly no navegador, e depois ir além (qualidade AAA, multiplayer web).
>
> ⚠️ **Propriedade intelectual**: mecânicas não são protegidas, mas nomes próprios, lore, logos e arte da Blizzard são. Para um lançamento público, usar **nomes e arte originais** (ex.: "Paladino" ok; "Death Knight", "Gul'dan", "Troll Axethrower", "Goblin Zeppelin" — trocar por equivalentes próprios). A coluna "WarPoly" abaixo usa os nomes originais do jogo (glossário em `src/data/names.js`).
>
> **Reconferido em 2026-10-17 contra o código** (`src/data/units.js`, `buildings.js`, `abilities.js`, `upgrades.js`, `tiers.js`, `tilesets.js`, `maps/index.js`, `campaigns/`, `src/editor`, `src/net`). A versão anterior (que dizia faltar 55 % do WC2) está em [historico/05_PARIDADE_WARCRAFT2_ate_2026-10-17.md](historico/05_PARIDADE_WARCRAFT2_ate_2026-10-17.md). O plano do que falta está em [PLANO_FINAL.md](PLANO_FINAL.md).

Legenda: ✅ existe · 🟡 parcial · ❌ falta · ➕ diferencial do WarPoly · ⚪ removido por decisão do dono

## 1. Recursos econômicos

| WC2 | WarPoly hoje | Status |
|---|---|---|
| Ouro (trabalhador entra na mina, fila, esgota) | `src/data/economy.js`: entrada de 1,5 s, 1 minerador por vez (2 na pedreira), fila em `ResourceDeposit`; mina esgotada desaba e solta os trabalhadores (NEW-54) | ✅ |
| Madeira (florestas densas que bloqueiam passagem) | Árvores bloqueiam o pathfinder e abrem ao serem cortadas (F1-07/F3-04); Serraria com pesquisas (`woodcutting`, `ranged_ammo`) | ✅ |
| Petróleo (plataformas no mar, naval) | 4º recurso (`CARRY.oil`), Plataforma, Petroleiro, Refinaria/Caldeirão; cobrado no nível 3 do Centro (`tiers.js`) | ✅ |
| Comida (Fazendas, HQ) | Suprimento por Fazenda / Cercado de Javalis (+ Casa / Toca); Quartel exige uma delas (`requirements.js`) | ✅ |
| — | **Pedra** (não existe no WC2): mantida pela decisão D1 (`07_DECISOES.md`) | ➕ |

## 2. Construções

| WC2 Humano / Orc | WarPoly (`buildings.js`) | Status |
|---|---|---|
| Town Hall → Keep → Castle / Great Hall → Stronghold → Fortress | 3 níveis com upgrade no lugar: Paço Real → Fortaleza → Castelo de Aldária / Salão do Clã → Bastião → Cidadela de Ferro (`tiers.js`: PV, custo, bônus de ouro). O modelo 3D ainda é um só por facção (`HQ_TIER_MODEL` nulo) | 🟡 |
| Farm / Pig Farm | `farm`/`cottage` · `pig_farm`/`orc_house` | ✅ |
| Barracks | `barracks` · `orc_barracks` | ✅ |
| Lumber Mill (flechas/machados, bônus de madeira) | `lumber_camp` · `orc_lumber_mill` (`ranged_ammo` 2 níveis, `woodcutting`) | ✅ |
| Blacksmith (armas/armaduras e cerco) | `forge` · `orc_forge` (`melee_weapons`, `melee_armor`, `siege_damage`, 2 níveis cada) | ✅ |
| Scout Tower → Guard Tower / Cannon Tower | só `watchtower` / `orc_watchtower`, sem evolução para Guarda/Canhão | 🟡 |
| Stables / Ogre Mound | `stable` · `ogre_den` | ✅ |
| Gnomish Inventor / Goblin Alchemist | `workshop` · `orc_workshop` | ✅ |
| Church / Altar of Storms | `temple` · `storm_altar` | ✅ |
| Mage Tower / Temple of the Damned | `arcane_tower` · `ash_sanctum` | ✅ |
| Gryphon Aviary / Dragon Roost | `aviary` · `serpent_nest` | ✅ |
| Shipyard, Foundry, Oil Refinery, Oil Platform | `shipyard`/`ship_dock`, `foundry`/`naval_forge`, `refinery`/`ash_cauldron`, `oil_platform` | ✅ |
| Muralhas | `wall_human`, `wall_orc`: arrasto em grade, bloqueiam o pathfinder, destrutíveis (F3-08); sapadores as derrubam | ✅ |
| Dark Portal / Circle of Power / Runestone (neutros de mapa) | nenhum; o único neutro de mapa é o Acampamento de Bandidos (`bandit_camp`) | ❌ |

## 3. Unidades

| Papel | WC2 Humano / Orc | WarPoly (`units.js`) | Status |
|---|---|---|---|
| Trabalhador | Peasant / Peon | Camponês (`villager`) / Lacaio (`peon`) | ✅ |
| Infantaria | Footman / Grunt | Espadachim (`knight`) / Talhador (`grunt`) | ✅ |
| Distância | Archer → Ranger / Axethrower → Berserker | Arqueiro → Patrulheiro (`ranger`) / Lanceiro-Machado → Enfurecido (`berserker`), com as pesquisas de classe | ✅ |
| Cavalaria | Knight → Paladin / Ogre → Ogre-Mage | Cavaleiro (`cavalier`) → Templário (`templar`) / Ogro (`ogre`) → Ogro Feiticeiro (`ogre_mage`) | ✅ |
| Cerco | Ballista / Catapult | Balista (`ballista`) / Catapulta (`catapult`): dano em área, alcance mínimo, ataque no chão | ✅ |
| Conjurador | Mage / Death Knight | Mago Arcano (`mage`) / Necromante das Cinzas (`necromancer`, com Esqueleto) | ✅ |
| Sapadores | Dwarven Demolition Squad / Goblin Sappers | Sapadores de Pólvora (`sapper`) / Incendiários (`arsonist`) | ✅ |
| Aéreo batedor | Gnomish Flying Machine / Goblin Zeppelin | Planador de Engenho (`glider`) / Balão de Guerra (`war_balloon`) | ✅ |
| Aéreo de ataque | Gryphon Rider / Dragon | Cavaleiro Grifo (`gryphon_rider`) / Serpe de Guerra (`war_serpent`) | ✅ |
| Naval | Oil Tanker, Destroyer, Transport, Battleship, Submarine / Oil Tanker, Destroyer, Transport, Juggernaught, Turtle | `tanker`, `frigate`, `war_galley`, `barge`, `dreadnought`, `iron_leviathan`, `submersible`, `colossal_turtle` | ✅ |
| Heróis (BtDP) | Turalyon, Khadgar… / Grom, Deathwing… | 6 heróis únicos em `units.js` (Brann, Oren, Dorian / Drogath, Vozgul, Skarn) com 3 habilidades cada; **sem XP/níveis** e só o Brann tem modelo `.glb` | 🟡 |
| Neutros / critters | ovelhas, porcos, focas | `bandit` + `bandit_camp` (recompensa), critters `sheep` e `boar` (`critters.js`) | ✅ |

## 4. Habilidades e magias (mana)

Sistema de mana, habilidades com alvo (unidade/área/auto-cast), recarga e pesquisas que liberam magias existem (F4-03, `abilities.js`: 42 entradas, `RESEARCH` com 18 pesquisas `spell_*`).

| Humano | Orc | Status |
|---|---|---|
| Templário: `holy_vision`, `heal`, `exorcism` | Ogro Feiticeiro: `eye_of_watch`, `bloodlust`, `runes` | ✅ |
| Mago: `fireball`, `slow`, `flameshield`, `invisibility`, `polymorph`, `blizzard` | Necromante: `death_touch`, `haste_spell`, `raise_dead`, `unholy_armor`, `ash_cloud`, `whirlwind` | ✅ |
| Sapadores: explodem muralhas/rochas/construções | idem | ✅ |
| Habilidades de herói (`hero_*`, 22 entradas; 3 por herói) | idem | 🟡 (IA de chefes não as usa: M2-11) |

## 5. Pesquisas / upgrades

| WC2 | WarPoly (`upgrades.js`, `RESEARCH`) | Status |
|---|---|---|
| Armas e Escudos +2 níveis | `melee_weapons`, `melee_armor` (2 níveis) | ✅ |
| Flechas/Machados +2 níveis | `ranged_ammo` (2 níveis) | ✅ |
| Ranger/Berserker: Longbow, Scouting, Marksmanship / Regeneration… | `ranger_longbow`, `ranger_sight`, `ranger_marksman`, `berserker_range`, `berserker_regen`, `berserker_fury` + `ranged_class`, `cavalry_class` | ✅ |
| Ballista/Catapult +2 níveis | `siege_damage` (2 níveis) | ✅ |
| Upgrades navais | `naval_cannons`, `naval_hulls` (2 níveis) | ✅ |
| Upgrade de HQ libera tiers | comandos `UPGRADE_HQ`/`CANCEL_UPGRADE_HQ`; requisitos `{hq:N}` | ✅ |

## 6. Mapa e terreno

| WC2 | WarPoly | Status |
|---|---|---|
| Tilesets: Floresta, Inverno, Wasteland, Pântano | 9 em `tilesets.js`: `verdejante`, `inverno`, `devastadas`, `pantano` + `exuberante`, `deserto`, `savana`, `vulcanico`, `pedregoso` (biomas por `biomeGrid`) | ✅ |
| Água navegável, costa, rochas/montanhas intransponíveis | água navegável com pathfinder naval, costa irregular (`maps/coast`), lava que bloqueia (`lavaGrid`), penhascos e vaus | ✅ |
| Mapas de 32×32 a 128×128, 2–8 jogadores | 16 mapas registrados em `maps/index.js` (15 na Escaramuça + tutorial), 104–224 de lado, 1v1 a 4 jogadores; gerador procedural para 2–8 (`generator.js`). Mapas navais com IA de invasão em `pendentes/` | 🟡 |
| Editor de mapas (PUD) | `src/editor`: pinta terreno/água/florestas, posiciona minas, jogadores e neutros, exporta/importa JSON, prévia 3D. Faltam pincéis de lava, bioma e passagem (M2-09) | 🟡 |
| Fog of war + shroud | névoa por shader com 3 estados (preto, memória, visível), fantasmas de construções (F1-05) | ✅ |

## 7. Modos de jogo

| WC2 | WarPoly | Status |
|---|---|---|
| Campanha 14 missões por lado + expansão, briefings, objetivos variados | Motor de missões e gatilhos (F8-04: destruir, sobreviver, escoltar, resgatar, construir). 3 campanhas em `campaigns/`: `alliance` (8 missões jogáveis, "Clássica (beta)"), `war-alliance` e `war-horde` (12 + 12, só dados e registro testados; revisão e jogo pelo dono em M3/M4) | 🟡 |
| Skirmish / Custom Game | Tela da Escaramuça: facção com prévia 3D, mapa, 1–7 IAs, times, cores, dificuldade, recursos, vitória, seed (F6-02) | ✅ |
| Multiplayer LAN/Battle.net até 8 jogadores | Lockstep por WebRTC com lobby, checksum de desync, reconexão, chat, pings e replays (F9-01…05); mesclado, **falta verificar em navegador real** (M1-04) | 🟡 |
| Vitória: destruir tudo do inimigo | `conquest` (padrão) e `regicide` (`victory.js`) | ✅ |
| Tela de pontuação pós-jogo | `PostGameScreen` com `MatchStats` (unidades, construções, recursos, APM, gráficos) | ✅ |
| (IA em níveis de dificuldade) | perfis `easy/normal/hard/brutal`; meta Difícil × Normal ≥ 60 % não atingida (F5-03 parcial, adiada) | 🟡 |

## 8. Controles e interface

| WC2 | WarPoly | Status |
|---|---|---|
| Seleção de até 9 unidades, grupos Ctrl+1..9 | limite 24 (`SELECTION_LIMIT`), grupos Ctrl+1..9, duplo clique seleciona o tipo (F3-01) | ✅ |
| Card de comandos com atalhos (M, S, A, P, H, B…) | atalhos visíveis e remapeáveis (`Hotkeys.js`, Opções) | ✅ |
| Attack, Move, Stop, Patrol, Stand Ground, Attack Ground | A (atacar-movendo), S, H, P e `ATTACK_GROUND` (clique direito no chão: em REVIEW, NEW-35) | ✅ |
| Construir: B + letra; reparar construções | construir por botão/atalho; reparo (R) e cancelar obra com devolução de 75 % (F3-05) | ✅ |
| Minimapa com clique e ordens | minimapa do terreno real, ordens por clique direito, pings de ataque | ✅ |
| Falas de confirmação das unidades | removidas por decisão do dono (2026-10-11); ficam só os cliques de seleção/ordem | ⚪ |
| Mensagens "Seu território está sob ataque" | alertas de ataque, mina esgotada, pesquisa/obra concluída, sem comida; Espaço vai ao último alerta (F6-05) | ✅ |
| Velocidades de jogo, pausa, save/load | velocidades, pausa e save/load em slots no IndexedDB (F2-06) | ✅ |

## 9. Resumo de paridade

Contagem das linhas das seções 1 a 8 acima (as linhas ⚪ e ➕, e a linha de cabeçalho, ficam fora do cálculo):

- ✅ ~83 % · 🟡 ~16 % · ❌ ~2 % dos recursos do WC2 (48 ✅, 9 🟡 e 1 ❌ em 58 linhas).
- Em 2026-10-17 o que falta de verdade para a paridade é pequeno: **Torres Guarda/Canhão**, **portal/círculo/runas neutros**, **XP e níveis dos heróis**, **modelos 3D por nível do Centro**, **campanhas completas (24 missões polidas)**, **editor com lava/bioma/passagem**, **IA de dificuldade em níveis** e a **verificação do multiplayer em navegador**. Cada item vira tarefa em [PLANO_FINAL.md](PLANO_FINAL.md) §6.

A ordem de implementação está no [PLANO_FINAL](PLANO_FINAL.md) (execução atual) e no [ROADMAP](06_ROADMAP_AAA.md) (visão original). O texto integral do antigo `TASKS.md` está em [historico/TASKS_ate_2026-10-17.md](historico/TASKS_ate_2026-10-17.md).
