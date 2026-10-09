# Missões (`src/data/missions/<id>.json`) — F8-04

Missões e gatilhos orientados a dados e **determinísticos**: o `MissionRuntime` (`src/sim/missions/`) roda dentro de
`simStep`, sem `Math.random`/`Date.now`, e entra no checksum — saves, replays e lockstep funcionam sem tratamento
especial (a missão é função de definição + seed + comandos dos jogadores). Validação: `validateMission(def)`
(`src/sim/missions/schema.js`) devolve **todos** os erros; `assertMission` lança `MissionError`. Nova missão = novo
JSON + `import` em `index.js` (ou `registerMission` em runtime). `docs/01_ARQUITETURA.md` ("Missões") descreve a integração.

Uma partida de missão é uma `MatchConfig` com `missionId` (ou `mission` inline, para saves/replays autocontidos) e
`victoryMode: 'mission'` — `createMissionConfig(id)` monta tudo. Nesse modo a derrota por regra (`conquest`/`regicide`)
não se aplica: o runtime decide a vitória/derrota (ver "Desfecho").

## Formato (versão 1)

```jsonc
{
  "format": "warpolymission", "version": 1,     // formato e versão (rejeita outras)
  "id": "mission-demo",                          // a-z 0-9 _ - (até 48)
  "title": "texto", "subtitle": "texto?",
  "briefing": { "text": "texto", "speaker": "texto?", "portrait": "🧙", "hints": ["texto"] },
  "mapId": "tutorial", "seed": 1996,
  "players": [ { "id": 0, "name": "texto", "factionId": "human", "team": 0, "isLocal": true, "startSlot": 0, "color": "#2563eb?", "isAI": false } ],
  "startingResources": { "wood": 330, "gold": 260, "stone": 120 },
  "vars": { "waves": 0, "flag": false },         // variáveis da missão (número | booleano | texto) — declare todas aqui
  "autoVictory": true,                           // padrão: vence quando todos os objetivos primários forem concluídos
  "defeatWhenWiped": true,                       // padrão: derrota se o jogador local ficar sem unidades e construções
  "setup": [ ação, … ],                          // rodam antes do 1º tick (tags, spawns iniciais)
  "objectives": [ objetivo, … ],
  "triggers": [ gatilho, … ]
}
```

**Textos** (`texto`) são `"string"` (todos os idiomas) ou `{"pt-BR": "...", "en": "..."}` (`pt-BR` obrigatório = base/fallback).
Retratos são emoji/ícone provisório. Coordenadas são de mundo (x, z) dentro da área jogável do mapa.

### Donos, áreas, seletores, tags

- **Dono**: id inteiro ou `"player"` (local), `"enemy"` (hostil ao local; em `spawn`/recursos = 1º inimigo normal), `"ally"`, `"neutral"` (-1: não hostil a ninguém, ideal para cativos), `"bandits"` (99, neutros hostis do mapa).
- **Área**: `{x, z, r}` (círculo) ou `{x1, z1, x2, z2}` (retângulo).
- **Seletor** de entidades vivas: `{tag?, owner?, unitType?, buildingType?, role?, kind?: "unit"|"building"|"any", area?}`. Seletor de **mortes** (`destroy`, `dead`) exige `tag`, `unitType`, `buildingType` ou `role`, aceita `killedBy` (dono do último golpe) e não aceita `area`.
- **Tags**: nomes dados a entidades por `spawn`/`tag`/`transfer` (`"tag": "x"`). Toda tag citada precisa ser criada em algum lugar (o validador confere).

### Objetivos (`objectives[]`)

Comuns: `id`, `type`, `priority` (`primary` | `secondary` | `hidden`; padrão primary), `title`, `description?`, `active?` (padrão true; `false` espera `setObjective`), `failWhen?` (condição que falha o objetivo). Primários decidem a vitória; **hidden** só aparece no painel depois de concluído/falhado ou de `revealObjective` e nunca decide a vitória.

| `type` | Parâmetros | Conclui quando |
|---|---|---|
| `destroy` | `select` (mortes), `count?` | mortes que casam com `select` ≥ `count` (padrão: nº de entidades da tag, ou 1) |
| `survive` | `seconds` | `seconds` desde a ativação do objetivo |
| `escort` | `tag`, `area`, `count?`=1 | ≥ `count` unidades da tag vivas dentro da área; **falha** se sobrarem menos que `count` vivas |
| `rescue` | `tag`, `count?`, `owner?`="player" | ≥ `count` unidades da tag vivas e do dono (combine com `transfer`); falha se sobrarem menos vivas |
| `build` | `buildingType` ou `role`, `count`, `owner?` | construções **concluídas** vivas ≥ `count` |
| `collect` | `resource`, `amount`, `mode?`="gathered", `owner?` | `gathered`: total coletado desde o início (evento `RESOURCE_GATHERED`); `stock`: saldo atual |
| `eliminate` | `owners?` (padrão: jogadores hostis), `include?`="all"/"buildings"/"units" | nenhuma unidade/construção viva (exceto muralhas/plataformas) dos donos. Cuidado: se os inimigos ainda não existem, completa na hora |
| `flag` | `condition` | a condição é verdadeira (objetivos de variável/bônus) |

### Gatilhos (`triggers[]`)

`{ id, when, actions, once = true, enabled = true, cooldown = 0 (s) }`. Avaliados a cada tick, na ordem do JSON; ações rodam em ordem. `once:false` dispara toda vez que `when` é verdadeira (use `every` ou `cooldown`).

**Condições** (`when`, `condition`, `failWhen`): `{all:[…]}` · `{any:[…]}` · `{not:c}` · e:
`time {at}` (s) · `every {seconds, start?}` · `area {owner?, area, count?, unitType?, tag?}` · `dead {select, count?}` · `count {select, op?, value}` (vivos; construções só concluídas) · `var {name, op?="==", value}` · `objective {id, status}` · `resource {owner?, resource, op?, value}` · `trigger {id}` (já disparou). `op` ∈ `== != > >= < <=` (padrão de `count`/`resource`: `>=`).

**Ações**: `spawn {owner, x, z, unitType+count | units:[{type,count}], tag?, spread?, guard?, order?}` · `giveResources`/`takeResources {owner?, gold/wood/stone/oil}` · `setObjective {id, status}` · `addObjective {objective}` · `revealObjective {id}` · `reveal {x, z, radius | all:true}` (névoa) · `setTeam {player, team}` (diplomacia, inclusive `"bandits"`) · `transfer {select, to, tag?}` (unidades mudam de dono — resgate/captura) · `dialog {speaker?, portrait?, text, duration?}` · `message {text}` · `victory`/`defeat {text?}` · `music {id: on|off}` · `sound {id}` · `camera {x, z, zoom?}` · `cutscene {id?, duration, skippable?, steps:[{at, x?, z?, zoom?, dialog?}]}` · `setVar {name, value}` · `incVar {name, by?}` · `enableTrigger`/`disableTrigger {id}` · `tag {select, tag}` · `order {select, kind: move|attackMove|stop, x, z}`.

As ações mexem na simulação **direto** (nunca `gm.issue`, que seria regravado nos saves/replays); diálogo, câmera, cutscene, música e som saem como eventos `EVT.MISSION_*` (só apresentação).

### Desfecho

Vitória = todos os primários concluídos (`autoVictory`) ou ação `victory`. Derrota = algum primário falhou, ação `defeat`, ou jogador local aniquilado (`defeatWhenWiped`). Vitória → `gm.gameWon`; derrota → jogador local `defeated`. A tela de fim (`MissionController`) mostra objetivos e tempo.

### Apresentação (UI)

Briefing no menu "Missões" (`MissionBriefing`), painel de objetivos, diálogos com retrato, avisos e cutscenes de câmera por keyframes (letterbox, input travado, **Esc pula**; a câmera é render e não entra no checksum) em `src/ui/MissionController.js`; lógica pura em `src/ui/missionPresentation.js`. Textos de UI em `mission.*` (i18n pt-BR/en).

### Limites conhecidos

`transfer` só troca o dono de unidades (não de construções). Não há campanhas (F8-05/06) nem editor de missões. A música é a ambiente procedural do `SoundManager` (`music` só liga/desliga).
