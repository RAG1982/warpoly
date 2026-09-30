# NEW-19 — Ruínas / clareira onde uma construção caiu ou uma mina esgotou

> **Status: ⏳ A FAZER — fila da nuvem (item 6)**

> Leia antes: `CLAUDE.md`, `docs/specs/_COMUM.md` (na nuvem valem as regras de `docs/HANDOFF_CLOUD.md`: sem navegador/GPU). Executor: **sonnet**. Candidata à **nuvem** (só `src/render/**` + 1 linha de wiring). Porta do vite (local) 5197.

## Por quê
No WC2, construção destruída ou mina esgotada deixa uma **clareira** (mancha de terra queimada/escombros) no chão por um tempo. Hoje a construção só desaparece. A marca dá leitura do campo de batalha e "peso" à destruição.

## Pronto quando
1. Ao receber `EVT.BUILDING_DESTROYED { pos, buildingType }` surge no local uma **ruína**: decal escuro de terra queimada com raio proporcional ao `collisionRadius` do tipo (`getBuildingDef`), mais 4–8 pedaços de entulho low-poly (caixas/prismas achatados de madeira e pedra, cores da paleta da facção do edifício).
2. Se `EVT.RESOURCE_DEPLETED { pos, resource }` existir (criado na F3-04), a mina/pedreira esgotada deixa uma ruína "colapsada" (decal + rochas/vigas caídas). Se o evento ainda não existir, assine só quando `EVT.RESOURCE_DEPLETED` estiver definido e deixe nota no relatório.
3. A ruína **persiste 45 s** e desvanece em 5 s (opacidade do decal + entulho afundando); depois é removida e devolvida ao pool. Teto de **24 ruínas simultâneas**: a mais antiga começa a desvanecer ao passar do teto.
4. Ruínas são **puramente visuais**: não entram em `blockerGrid`/`Pathfinder`, não são selecionáveis, não afetam a simulação nem o checksum de determinismo, e **respeitam a névoa** (ruína em área não explorada não aparece; em área explorada-sem-visão aparece esmaecida como os fantasmas — use o mesmo mecanismo que `FogOfWar` expõe para VFX/fantasmas; se não houver API simples, ocultar fora de visão e registrar `NEW-<n>`).
5. Orçamento: ≤ 3 draw calls por ruína (decal 1 + entulho **mesclado em 1 geometria**); reutiliza geometria/material entre ruínas (pool); zero alocação por frame; `?quality=low` reduz entulho para 3 peças e desliga o desvanecimento animado (troca direta).
6. `npm test`, lint e build passam; teste unitário da lógica pura (ver abaixo).

## Contexto
- Eventos: `src/sim/events.js` (`BUILDING_DESTROYED` l.23, emitido em `src/entities/Building.js` ~l.511 com `{buildingId, ownerId, pos, buildingType}`). A simulação **não** chama VFX (regra F2-07): a ruína é reação de `src/render/`.
- Padrão de reação a eventos: `src/render/VfxEvents.js` (`createVfxEvents(gm, particleSystem)`, `on(EVT.X, ...)`). Crie `src/render/RuinsManager.js` (classe com `spawn(pos, radius, kind, factionColors)`, `update(dt)`, `dispose()`) e conecte no mesmo ponto em que `createVfxEvents` é criado (procure a chamada com grep; mudança mínima).
- Altura do terreno: `gm.terrain.getHeight(x, z)`; posicione o decal a `h + 0.03` com `polygonOffset` para não brigar com o terreno; `depthWrite:false`.
- Textura do decal: **gere por canvas** (mancha irregular escura com borda esfumada e alguns "cortes" claros de terra) 128², sem arquivo externo. Cores: terra `#2b2118`, cinza `#3a3632`, brasa opcional `#7a2f14` só nos 8 primeiros segundos (emissiva baixa).
- Partida nova/reset (`GameManager` reinicia sem reload): `RuinsManager.clear()` deve ser chamado no evento de fim/reinício de partida já existente (procure `MATCH_` em `events.js`).

## Implementação
1. `src/render/RuinsManager.js`: pool de N=24 slots `{group, decal, debris, age, state}`; `spawn` escolhe slot livre (ou o mais velho), sorteia forma do entulho com **RNG de apresentação** (`Math.random` é permitido aqui pois não afeta a simulação; NÃO use `gm.rng`).
2. Lógica pura separável em `src/render/ruinsLogic.js` (sem three.js): `ruinRadius(collisionRadius)`, `ruinAlpha(age)` (1 até 45 s, linear até 0 aos 50 s), `pickSlot(slots)`. Testável.
3. Ligar aos eventos (item 1–2 de "Pronto"); raio = `collisionRadius * 1.15` (mina: `3.4 * 1.15`).
4. Névoa (item 4) e `?quality=low` (item 5).
5. `dispose()` libera geometrias/materiais/texturas; chamar no teardown do jogo.

## Não fazer
- Não use Blender nem modelos GLB (arte final de ruína entra na fase ART; aqui é procedural). Não toque em `GameManager.js`, `Building.js`, `Unit.js`, `Pathfinder.js`. Não emita eventos novos. Não faça a ruína colidir nem ser alvo.

## Testes (`tests/unit/ruins-logic.test.js`)
`ruinAlpha`: 1 em 0 s e 45 s, 0,5 em 47,5 s, 0 em ≥ 50 s; `pickSlot`: prefere livre, senão o mais velho; `ruinRadius` proporcional e com mínimo 1,5.

## Verificação
Nuvem: `npm ci && npm test && npm run lint && npx vite build --outDir /tmp/build-check`.
**Pendente (local, GPU real)**: `?skipPreload&texq=low&play`, destruir uma construção do inimigo (console: `game.buildings[n].takeDamage(99999)`) → ruína aparece, some em ~50 s, não bloqueia unidades, some com `?quality=low` sem animação; conferir no inspetor que nada mudou.

## Entrega
Branch `cloud/NEW-19` (ou worktree local), commit `NEW-19: ruínas visuais para construções destruídas e minas esgotadas`, relatório ≤ 25 linhas.
