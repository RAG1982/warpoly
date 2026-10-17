# Campanhas (`src/data/campaigns/<id>/`) — F8-05

Uma campanha é um índice `campaign.json` + as missões F8-04 (`mNN-*.json`, formato em `src/data/missions/README.md`).
`index.js` importa tudo, valida (`validateCampaign`, `src/campaign/campaign.js`) e registra as missões no registro de missões
(com `"hidden": true`: não aparecem no menu "Missões"). Nova missão de campanha = JSON + `import` em `index.js` + entrada em `missions[]`.

## Premissa da campanha clássica (Liga de Aurelan) — **PROVISÓRIA (aguarda aprovação do dono)**

História 100% original (nomes, lugares e personagens inventados; sem lore da Blizzard). O Reino de Aurelan vive em paz há três
gerações quando os Clãs do Cinzal, expulsos de suas terras áridas além das Montanhas do Véu, se unem sob o chefe-de-brasa Skarn
e descem sobre os vales. O Marechal Dorian Vasques, a Capitã Lyra Ventosa, o Mestre Orsolo e a Rainha Sevelin conduzem a resistência:
deter a vanguarda, libertar cativos, segurar o Estreito de Alvorada, reabrir o Rio Turvo, armar-se, retomar as ilhas, sobreviver à
traição do Clã Presa-Negra e marchar sobre o Planalto do Cinzal. Se a premissa mudar, só os textos (briefing/diálogos) e o campo
`premise` precisam ser reescritos; objetivos, mapas e gatilhos independem dela.

## Missões (ordem de desbloqueio linear)

| # | id | Mapa | Ideia |
|---|---|---|---|
| 1 | `alliance-01-fumaca-no-vale` | campos-1v1 | construir quartel, destruir vanguarda, santuário oculto, acampamento neutro |
| 2 | `alliance-02-cativos-da-garganta` | desfiladeiro-1v1 | resgate de 4 cativos + escolta de volta à base sob patrulha |
| 3 | `alliance-03-muralhas-de-alvorada` | estreito-1v1 | sobreviver 5 min a ondas crescentes, torres (reforço) |
| 4 | `alliance-04-ponte-do-rio-turvo` | continental-1v1 | romper bloqueio no vau, comboio de 4 carregadores (anel ciano, ≥ 3 vivos) até o Forte Atalaia — castelo humano em (-47, 4), depois do acampamento neutro (-40,-20) em relação à base, criado por `spawnBuilding` —, emboscada; Estábulo e Cavaleiros |
| 5 | `alliance-05-ferro-e-brasa` | bosques-2v2 | economia (ferraria, 1500 de ouro), IA inimiga, reforços aos 8 min, queimar o salão |
| 6 | `alliance-06-ilhas-de-brasa` | ilhas-4p | 2 IAs orcs, aliado de IA (Brumar) cujo forte não pode cair |
| 7 | `alliance-07-traicao-presa-negra` | vales-2v2 | aliado orc vira inimigo aos 330 s (`setTeam`), sobreviver e destruí-lo |
| 8 | `alliance-08-queda-do-cinzal` | planalto-ffa-4p | duas IAs, chefe Skarn (ogro), ondas, magos cativos, cutscene final |

Todas têm objetivo primário, secundário e oculto, cutscene de abertura e diálogos (pt-BR/en).

## Índice (`campaign.json`)

`{ format:"warpolycampaign", version:1, id, factionId, provisional?, title, subtitle?, premise, heroes?:[], missions:[…] }`.
Cada entrada de `missions`: `{ id, requires?: [missionId…] (anteriores), carryOver?: { from?, resources:{gold,wood,stone: fração 0..1}, max?, heroes?:[] } }`.

- **Epílogo (tela final)**: `epilogue?: { faction:'human'|'orc', title:{pt-BR,en}, paragraphs:[{pt-BR,en} × 3–5], credits?:{pt-BR,en} }`
  (validado por `validateCampaign`; pt-BR **e** en obrigatórios). Ao vencer a última missão, `campaignEndPlan` devolve `campaignComplete`, `epilogue`
  e `factionId`, e o `MissionController` abre `src/ui/screens/CampaignVictory.js` (modelo puro em `src/ui/campaignVictoryModel.js`, SVG em
  `campaignVictoryArt.js`) no lugar do cartão simples: ilustração da facção, "VITÓRIA", epílogo em sequência, estatísticas, fanfarra
  (`victoryFanfareHuman|Orc` em `sfxRecipes.js`) e botões Menu / Rejogar a campanha (nova tentativa a partir da m01) / Estatísticas.
  Sem `epilogue`, a tela usa o texto genérico `campaign.end.complete` com a facção da campanha.
- **Slot de arte final**: se existir `public/ui/art/victory_human.webp` / `victory_orc.webp` (1920×1080, WebP ≤ 500 kB), a tela usa a imagem
  no lugar do SVG procedural (detectado por `Image` onload/onerror; nenhuma mudança de código é necessária).
- **Desbloqueio**: missão disponível quando todas as `requires` estão concluídas na tentativa atual. `?campaign=unlock` na URL libera tudo (depuração).
- **Carry-over de recursos**: `startingResources` da missão + `min(max, floor(fração × saldo final))` do resultado da missão `from` (padrão: 1ª de `requires`), por recurso.
  Nas missões 2 a 8: 25% do saldo, com teto de 300 por recurso.
- **Liberação progressiva (F8-05b)**: ver a seção "Liberação progressiva" abaixo (`unlocks` por missão).
- **Heróis**: reservados (`heroes`, `carryOver.heroes`) para a F4-08; nenhum herói existe ainda.

## Liberação progressiva (F8-05b) — `unlocks`

Cada entrada de `missions` pode ter `unlocks: { units:[], buildings:[], research:[], heroes:[] }` = o que **aquela missão LIBERA** (ids de `src/data`;
o validador confere existência, facção, repetição entre missões e que o nível 2 de uma pesquisa — ficha `"id@2"` — venha depois/junto do nível 1).
O conjunto **disponível** na missão N é a união cumulativa dos `unlocks` das missões 1..N: `availableTech(campanha, índice0 | idMissão) → {units, buildings, research, heroes}` (`Set`s;
`research` usa `"id"` = nível 1 e `"id@2"` = nível 2; promoções valem pela unidade base: Patrulheiro/Templário dependem da pesquisa).

- A partida de campanha leva `MatchConfig.techRestriction` (`techRestrictionFor`): `{ players:[jogador local], units, buildings, research, heroes, later, mission, unlocks }`.
  **Só o jogador local** é restringido; IA inimiga/aliada não (a ordem de batalha da missão manda). Menu "Missões", escaramuça e rede: sem restrição. `?campaign=unlock` (depuração) libera missões **e** árvore.
- A sim recusa (comando ignorado, sem debitar nada) `TRAIN`, `PLACE_BUILDING`/`PLACE_WALL` e `RESEARCH` fora do liberado: `requirements.js` acrescenta a exigência travada `{locked, kind, id, mission}` a `missingRequirements/missingUnitRequirements/missingUpgradeRequirements`
  (nenhum ponto novo de checagem). A HUD desabilita o botão com a dica "Disponível na missão N" (`requirementsLine`). Evoluir o Centro de nível não é restringido (as missões concedem o nível com a ação `setTier`).
- Entra no checksum (`parts.tech`) **só quando presente**; sem `techRestriction` o checksum é idêntico ao anterior (fixado em `tests/unit/techRestriction.test.js`).
- Anúncio: o briefing da campanha mostra "Novo nesta missão" e, no início da missão (depois da abertura), toast + diálogo "Novo: Unidades: …" (`src/ui/techText.js`, i18n `campaign.unlock.*`).

### Tabela de liberação (`unlocks`) e uso da novidade em cada missão

| # | Libera (cumulativo) | Nível do Paço (`setTier`) | A missão EXIGE / RECOMPENSA o uso | Inimigos novos |
|---|---|---|---|---|
| 1 | Aldeão, Espadachim, Arqueiro; Casa, Serraria, Fazenda, Quartel | 1 | exige Quartel; secundário "4 Arqueiros" (+100 ouro) | Talhadores |
| 2 | Ferraria; Armas Forjadas, Flechas de Aço | 1 | secundário "Armas Forjadas" (+150), oculto "Flechas de Aço" (+100 ouro, +50 madeira) | + Lanceiros-Machado |
| 3 | Torre de Vigia, Muralha de Pedra; Escudos Reforçados | 1 | secundários torres (reforço) e 6 trechos de muralha (+100 ouro/pedra), oculto "Escudos" (+150) | Ogros e Incendiários na onda final |
| 4 | Estábulo Real, Cavaleiro | 2 | o vau livre manda 2 Cavaleiros; secundário "4 Cavaleiros" (+150 ouro, +50 madeira) | Ogro na emboscada |
| 5 | Oficina, Balista, Sapador; Munição Explosiva, Ofício do Lenhador; herói **Capitão Brann** | 2 | a Oficina rende 2 Sapadores; secundário "derrubar 2 torres de guarda" (+250), oculto "detonar um Sapador" (+150); Brann chega aos 8 min | Torres de vigia, Catapulta, Incendiários (ataque aos 6 min) |
| 6 | Estaleiro, Refinaria, Plataforma, Fundição; Petroleiro, Barcaça, Fragata, Couraçado, Submersível; Canhões Reforçados, Cascos Blindados | 3 | **exige Estaleiro**; secundários Plataforma (rende Couraçado + Submersível), "afundar 3 Galés" (+300); oculto desembarque de 3 Espadachins na Praia Norte pela Barcaça (+250) e "afundar o Leviatã" (+200 ouro, +100 petróleo); aos 5 min: Brann, Barcaça e 2 Fragatas | Galés de Guerra, Leviatã de Ferro (aos 8 min) |
| 7 | Torre Arcana, Templo, Aviário; Mago, Templário, Planador, Cavaleiro Grifo; Ordenação, Bola de Fogo, Lentidão, Cura, Exorcismo, nível 2 de Armas/Escudos/Flechas; herói **Mestre Arcano Oren** | 3 | secundários "2 Magos" (+200), Aviário (rende um Grifo), Planador sobre o forte inimigo (+150); ocultos Ordenação (+300) e Armas Forjadas 2 (+200); Oren vem do forte | Necromantes, Balão de Guerra, Ogro (a traição) |
| 8 | Patrulheiro; Treinamento de Patrulheiro, Arco Longo, Visão Aguçada, Pontaria, Escudo de Chamas, Invisibilidade, Transmutação, Nevasca, Vista Sagrada, nível 2 de Munição/Canhões/Cascos | 3 | Brann + Oren + 2 Grifos aos 7 min; secundário "derrubar o Ninho das Serpes" (+300), oculto Patrulheiros (+200) | Ninho + 2 Serpes de Guerra, Necromante e Serpe nas ondas |

Notas de desenho: o Submersível e o Couraçado ficam na m06 porque o Planalto da m08 não tem mar; o transporte (Barcaça) acompanha a frota na m06 (a "ponte" da m04 é o comboio). O mar do norte e o do sul de `ilhas-4p` não se ligam
(a grade naval acaba na área jogável): o Estaleiro do norte alcança o poço nordeste, o do sul, o poço de Brumar. Os pontos de desembarque válidos ficam nos cantos da ilha leste (a costa reta não tem água navegável encostada).
Heróis: Brann (m05, m06, m08) e Oren (m07, m08); `unique` — um por partida, nunca duplicados.

## Progresso (`src/campaign/progress.js`)

`localStorage["warpoly.campaign.v1"]`: `{ version, campaigns:{ <id>:{ current, attempts:{ N:{ startedAt, completed:{ <missionId>:{ seconds, resources, at } } } } } } }`.
"Nova tentativa" abre a tentativa N+1 vazia (as anteriores ficam gravadas). A vitória é gravada por `main.js` (`_hookCampaign`, evento `MISSION_ENDED`),
só para a missão iniciada pela tela de campanha. Falhas de armazenamento nunca lançam. Tela: `src/ui/screens/CampaignScreen.js` (menu principal > Campanha).

## Testes

`tests/unit/campaignAlliance.test.js` (validador F8-04 por missão, bilíngue, terra firme/água dos navios, ordem/desbloqueio, carry-over, progresso, i18n; F8-05b: a campanha libera TUDO,
requisitos alcançáveis, nada entregue antes de liberado, uso das novidades, heróis, inimigos por tema e **cobertura de unidades por categoria**),
`tests/unit/campaignPlaythrough.test.js` (uma simulação headless por missão até a vitória, com ações injetadas; derrotas; determinismo; F8-05b: o roteiro treina/pesquisa/ergue as novidades de cada missão, inclusive combate
naval, desembarque pela Barcaça, Fireball, Ordenação → Templário e Grifos contra o Ninho) e `tests/unit/techRestriction.test.js` (mecanismo de liberação: `availableTech`, recusa de comandos, checksums).

## Novo mundo (2026-10-13): trilhas e campanhas espelhadas

- `campaign.json` tem `track`: `main` (campanha principal, com tela de história) ou `beta` (a campanha clássica da Liga de Aurelan atual, "Clássica (beta)"; a trilha `beta` não tem tela de história e usa `betaLabel` como rótulo). O seletor está em `src/ui/screens/CampaignScreen.js`.
- `war-alliance/` (`factionId: 'human'`) e `war-horde/` (`factionId: 'orc'`): 12 missões cada (`m01`–`m12`), espelhadas. Foram geradas a partir de `tools/scaffold-campaigns.mjs`. As missões **ainda usam os mapas atuais** (por exemplo `campos-1v1`, `continental-1v1`, `ilhas-4p`); mapas próprios entram no MUNDO-7 (`docs/specs/MUNDO-TERRENO-MAPAS.md`).
- `world-map.json` (`format: warpolyworldmap`): mapa-múndi **ilustrativo** (Velmara a oeste, Cinzara a leste, ilhas Estilhaços). Não é campanha nem é jogável. Renderizado por `src/ui/worldMap.js`.
- A tela de abertura da história lê `src/data/story/world.json` (7 painéis, pt-BR e en; arte em `public/art/story/`).
- Os testes de registro estão em `tests/unit/campaignSelector.test.js` e `tests/unit/campaignStory.test.js`. **Não há teste de jogabilidade nem de cobertura das 24 missões novas** (MUNDO-6).
