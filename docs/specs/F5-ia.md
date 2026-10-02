# F5 — Inteligência Artificial (F5-01..F5-05) — spec curta

Worktree `task/F5-ia`. Código só em `src/ai/**` (+ `MatchConfig.js` para dificuldade por jogador, `GameManager.js` só para passar a config ao diretor, `tools/`, `tests/`). Sem tocar em `Unit.js`, `units.js`, `sim/targeting.js` (F4-06).
Regras duras: determinismo (RNG = `director.rng`, fork de `gm.rng`; nunca `Math.random`), `src/ai` sem three.js/DOM (`layers.test.js`), tudo via `gm.issue`.

## Estado de partida
`EnemyAI.js` já foi removido (F2-01/F2-02); existe `AIDirector` por `playerId` (um por IA, em `gm.aiDirectors`) que emite comandos. Gaps: seed 3 do `--ffa` não termina em 60 min; IA ignora dificuldade, névoa, estratégia e micro.

## F5-01 — Diretores por jogador
- Aceite: nenhuma referência a `EnemyAI`; `AIDirector(gm, playerId)` só lê/escreve via `Player` + `gm.issue`; `headless-match --ffa` (3 IAs) termina em < 60 min simulados em >= 8/10 seeds, checksum idêntico em 2 execuções; teste Vitest `ai.test.js` (3 diretores, nenhum compartilha estado; comandos têm `playerId` correto).
- Trabalho: mecanismo anti-impasse (escalada de agressão por tempo de partida), `director.issue()` único ponto de saída de comandos.

## F5-03 — Dificuldades
- `AIProfile.js`: `easy|normal|hard|brutal` -> `{maxApm, tickInterval (atraso de reação), micro (0..1), resourceBonus, cheatVision, attackBase, startDelay, workerCap, strategies permitidas}`. `normal` preserva o comportamento atual.
- `MatchConfig.players[i].difficulty` (opcional) sobrepõe `cfg.difficulty`; `headless-match --difficulties a,b,c`.
- Orçamento de APM: balde de fichas em `director.issue()`; comandos acima do limite são adiados (retornam null).
- Bônus de recursos só no Brutal (+25 % sobre cada coleta, via `RESOURCE_GATHERED`).
- Aceite: testes de perfil (monotonia, bônus só no Brutal, APM respeitado em partida simulada); `tools/ai-ladder.mjs`: Difícil vence Normal e Normal vence Fácil em >= 60 % de >= 10 seeds (lados alternados), nenhuma partida trava.

## F5-02 — Percepção sob a névoa
- `AIPerception.js`: fontes de visão = unidades/construções próprias (`visionRadius`); memória de construções e unidades hostis com `lastSeen`/última posição (unidades expiram em 60 s; construção só some quando a posição é revista e ela morreu); grade grossa de "explorado" própria; scout ativo (1 unidade barata visita slots de início e células inexploradas; reenvia se morrer). Alvos de ataque vêm só da memória; sem alvo conhecido o exército marcha (attack-move) ao slot não explorado mais próximo. `cheatVision` (Brutal) enxerga tudo.
- Aceite: teste — IA não conhece o HQ inimigo no tick 0 e passa a conhecê-lo só depois de uma unidade chegar ao alcance de visão; memória persiste quando a unidade sai; Brutal sabe desde o início.

## F5-04 — Estratégias
- `AIStrategy.js`: perfis `rush`, `boom`, `turtle`, `air` (flag `AIR_UNITS_ENABLED=false` até F4-06) com parâmetros por facção (alvo de trabalhadores, nº de quartéis, limite da 1ª onda, mistura de exército, torres, tempo de evolução do Centro, conjuradores). Escolha por `director.rng` (determinística, ponderada pela dificuldade). Contra-composição: lê `AIPerception.composition()` e ajusta a mistura (cavalaria contra atiradores, atiradores contra corpo a corpo, cerco contra construções/muralhas).
- Aceite: teste — mesma seed => mesma estratégia; `air` nunca é sorteado com a flag desligada; `rush` faz a 1ª onda sair mais cedo que `turtle` em partida headless; contra-unidade escolhe tipo esperado em cenários sintéticos.

## F5-05 — Micro tático (`AIMicroManager.js`)
- Recuar feridos (< 30 % PV, longe da base), focar fogo (menor PV efetivo; conjuradores/cerco/atiradores primeiro), kiting de ranged contra melee, proteger cerco (escolta reage a ameaça), flanquear (cavalaria/ogros por waypoint lateral), atacar trabalhadores (esquadrão de assédio de 2 montarias), magias do Mago/Necromante (política por habilidade; Torre Arcana + pesquisas no tech). Nível de micro por dificuldade liga recursos (fácil: nada; normal: recuar+focar; difícil: +kiting, escolta, assédio, magias; brutal: +flanco).
- Aceite: testes unitários com mundo sintético (cada tática emite o comando esperado); ladder mostra Difícil > Normal.

## Verificação
`npm test`, `npm run lint`, build em `/tmp/claude-1000/warpoly-build-check`, `npm run smoke`, `tools/ai-ladder.mjs`.
