# Campanhas (`src/data/campaigns/<id>/`) — F8-05

Uma campanha é um índice `campaign.json` + as missões F8-04 (`mNN-*.json`, formato em `src/data/missions/README.md`).
`index.js` importa tudo, valida (`validateCampaign`, `src/campaign/campaign.js`) e registra as missões no registro de missões
(com `"hidden": true`: não aparecem no menu "Missões"). Nova missão de campanha = JSON + `import` em `index.js` + entrada em `missions[]`.

## Premissa da campanha da Aliança — **PROVISÓRIA (aguarda aprovação do dono)**

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
| 4 | `alliance-04-ponte-do-rio-turvo` | continental-1v1 | romper bloqueio no vau, comboio de 4 carregadores (anel ciano, ≥ 3 vivos) até o Forte Atalaia — castelo humano em (-47, 4), depois do acampamento neutro (-40,-20) em relação à base, criado por `spawnBuilding` —, emboscada |
| 5 | `alliance-05-ferro-e-brasa` | bosques-2v2 | economia (ferraria, 1500 de ouro), IA inimiga, reforços aos 8 min, queimar o salão |
| 6 | `alliance-06-ilhas-de-brasa` | ilhas-4p | 2 IAs orcs, aliado de IA (Brumar) cujo forte não pode cair |
| 7 | `alliance-07-traicao-presa-negra` | vales-2v2 | aliado orc vira inimigo aos 330 s (`setTeam`), sobreviver e destruí-lo |
| 8 | `alliance-08-queda-do-cinzal` | planalto-ffa-4p | duas IAs, chefe Skarn (ogro), ondas, magos cativos, cutscene final |

Todas têm objetivo primário, secundário e oculto, cutscene de abertura e diálogos (pt-BR/en).

## Índice (`campaign.json`)

`{ format:"warpolycampaign", version:1, id, factionId, provisional?, title, subtitle?, premise, heroes?:[], missions:[…] }`.
Cada entrada de `missions`: `{ id, requires?: [missionId…] (anteriores), carryOver?: { from?, resources:{gold,wood,stone: fração 0..1}, max?, heroes?:[] } }`.

- **Desbloqueio**: missão disponível quando todas as `requires` estão concluídas na tentativa atual. `?campaign=unlock` na URL libera tudo (depuração).
- **Carry-over de recursos**: `startingResources` da missão + `min(max, floor(fração × saldo final))` do resultado da missão `from` (padrão: 1ª de `requires`), por recurso.
  Nas missões 2 a 8: 25% do saldo, com teto de 300 por recurso.
- **Heróis**: reservados (`heroes`, `carryOver.heroes`) para a F4-08; nenhum herói existe ainda.

## Progresso (`src/campaign/progress.js`)

`localStorage["warpoly.campaign.v1"]`: `{ version, campaigns:{ <id>:{ current, attempts:{ N:{ startedAt, completed:{ <missionId>:{ seconds, resources, at } } } } } } }`.
"Nova tentativa" abre a tentativa N+1 vazia (as anteriores ficam gravadas). A vitória é gravada por `main.js` (`_hookCampaign`, evento `MISSION_ENDED`),
só para a missão iniciada pela tela de campanha. Falhas de armazenamento nunca lançam. Tela: `src/ui/screens/CampaignScreen.js` (menu principal > Campanha).

## Testes

`tests/unit/campaignAlliance.test.js` (validador F8-04 por missão, bilíngue, terra firme, ordem/desbloqueio, carry-over, progresso, i18n) e
`tests/unit/campaignPlaythrough.test.js` (uma simulação headless por missão até a vitória, com ações injetadas; derrotas; determinismo).
