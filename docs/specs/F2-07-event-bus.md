# F2-07 · Barramento de eventos + animador fora do inspetor

> **Status: ✅ PRONTA — DONE (13fc992)**

Leia antes: `docs/specs/_COMUM.md`, `CLAUDE.md`, `docs/01_ARQUITETURA.md` (tick fixo, comandos, determinismo/headless).
Worktree: nova. **Primeiro `git merge master`** (precisa conter F2-03). Porta do vite: **5194**.

## Por quê
- A simulação chama áudio, partículas e UI diretamente: `soundManager.play*` em `src/entities/Unit.js` (~1041–1264), `src/entities/Building.js` (~463–716), `src/core/GameManager.js` (~893–1116); `uiManager.showNotification` em `GameManager`/IA; `particleSystem.spawn*` dentro de `takeDamage`, `chop`, `mine`, `construct`. Isso impede rodar a simulação headless limpa, dificulta replays (sons disparados ao reproduzir) e acopla camadas.
- `src/entities/Unit.js` importa `UnitAnimator` de `src/inspector/unitAnimator.js` (camada invertida).

## "Pronto"
- Nenhum arquivo de simulação (`src/entities/Unit.js`, `Building.js`, `Tree.js`, `ResourceDeposit.js`, `Arrow.js`, `src/core/GameManager.js` na parte `simStep`, `src/sim/**`, `src/ai/**`) chama `soundManager`, `uiManager` ou `particleSystem` diretamente; tudo sai como evento.
- Jogo soa/parece idêntico ao atual.
- `UnitAnimator` mora em `src/animation/UnitAnimator.js`; `src/inspector/unitAnimator.js` vira reexport de 1 linha.

## Implementação
1. `src/sim/EventBus.js` (puro): `on(type, fn) → off`, `emit(type, payload)`, `clear()`. Eventos são **enfileirados** durante o `simStep` e **despachados** no fim do passo (`flush()`), na ordem de emissão. Payloads só com dados (ids, tipo, posição `{x,y,z}` copiada, números) — nada de referência a objetos three.js.
2. Catálogo `src/sim/events.js` (constantes + JSDoc do payload): `UNIT_TRAINED, UNIT_DIED, UNIT_DAMAGED, BUILDING_PLACED, BUILDING_COMPLETED, BUILDING_DESTROYED, BUILDING_DAMAGED, RESEARCH_DONE, RESOURCE_GATHERED {type, amount, pos, ownerId}, RESOURCE_DEPLETED, WORKER_CHOP/MINE/HAMMER {pos, ownerId}, PROJECTILE_FIRED {kind: 'arrow'|'axe', from, ownerId}, PROJECTILE_HIT, MELEE_HIT, UNDER_ATTACK {ownerId, pos}, PLAYER_DEFEATED, MATCH_WON, MATCH_LOST, NOTIFY {ownerId, text}`.
3. `gm.events = new EventBus()`; `simStep` chama `this.events.flush()` no fim.
4. Converter as chamadas diretas da simulação em `gm.events.emit(...)` (grep `soundManager\.`, `particleSystem\.`, `uiManager\.` nos arquivos listados). Mantenha **os mesmos gatilhos e condições** (ex.: som de coleta só se `isLocal`, texto flutuante só se visível pela névoa — a condição de visibilidade fica no **ouvinte**, que recebe `pos`/`ownerId`).
5. Ouvintes (camada de apresentação), criados pela `MatchSession` (`src/core/MatchSession.js`):
   - `src/audio/AudioEvents.js` → `SoundManager` (tabela evento→som).
   - `src/render/VfxEvents.js` → `ParticleSystem` (faíscas, lascas, textos flutuantes), respeitando névoa (`fogOfWar.isVisible`) e `localStorage['warpoly.floatingText']` se existir.
   - `src/ui/UiEvents.js` → `UIManager.showNotification` (ataque, pesquisa concluída, construção concluída, derrota de jogador) — só para `ownerId === localPlayerId`.
   Em modo headless (`MatchConfig.headless`) nenhum ouvinte é criado.
6. Replays futuros: `EventBus` tem `muted` (ignora ouvintes) — sem uso agora, só a flag.
7. Mover `src/inspector/unitAnimator.js` → `src/animation/UnitAnimator.js` (git mv para preservar histórico); atualizar imports em `Unit.js`, `ModelFactory.js`, `glbModels.js`, `inspector.js` e onde mais o grep achar; deixar `src/inspector/unitAnimator.js` com `export * from '../animation/UnitAnimator.js';`.

## Não fazer
- Não mudar números, sons escolhidos, efeitos visuais, textos.
- Não mudar ordem de execução da simulação (checksum de determinismo deve continuar idêntico — o teste `tests/unit/determinism.test.js` precisa passar **sem alterar** os valores esperados, pois eventos não alteram estado).
- Arquivos em edição na nuvem (evite): `src/core/InputManager.js`, `src/ui/UIManager.js` (exceto a função chamada pelo ouvinte), `style.css`, `index.html`, `src/ui/screens/**`.

## Testes (Vitest)
- `eventBus.test.js`: fila durante passo, flush em ordem, `off`, payload congelado/serializável.
- `determinism.test.js` continua verde.
- Teste de integração headless: 2 000 ticks → contagens de `UNIT_TRAINED`, `RESOURCE_GATHERED`, `BUILDING_COMPLETED` > 0 e iguais entre duas execuções com mesma seed.

## Verificação
Comandos mínimos do `_COMUM.md` (`npm run smoke` já usa safe-run — não aninhe). No jogo (porta 5194, `?skipPreload&texq=low`, via safe-run): sons de coleta/construção/ataque, textos de dano, notificação "sob ataque" e "melhoria forjada" continuam aparecendo (liste no relatório como verificou). `grep -n "soundManager\.\|particleSystem\.\|uiManager\." src/entities src/sim src/ai` → zero (exceto construtores recebendo referências, se ainda necessário — justifique).

## Docs
`docs/01_ARQUITETURA.md`: seção "Eventos" (catálogo, fluxo sim → flush → ouvintes); remover o acoplamento "Unit importa de inspector" da lista de acoplamentos; B13 marcado corrigido em `docs/04_DIAGNOSTICO.md`.

## Entrega
Commit: `F2-07: barramento de eventos da simulação e UnitAnimator em src/animation`.
