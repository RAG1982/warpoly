# F4-05 · Sapadores (Sapadores de Pólvora / Incendiários)

> **Status: ⏳ A FAZER** (spec pronta 2026-09-30; não disparada — depois de F4-02 mesclada: reutiliza Oficina e dano em área).
> Leia antes: `CLAUDE.md`, `docs/specs/_COMUM.md`, `docs/08_GAME_DESIGN.md` §5.1 (Sapadores), §6, `docs/specs/F4-02-cerco.md` (Oficina, dano em área, `splashRadius`).
> Executor: **sonnet**, worktree, porta do vite **5212**. Depende de F3-08 (muralhas) e F4-02.

## Por quê
Unidade suicida para abrir muralhas e fortificações sem ficar exposta ao alcance do cerco. Design §5.1: PV 60, dano 400 suicida em área, alcance 1, vel. 5,0, custo 70/25/0, 10 s, nível 2, Oficina.

## Pronto quando (mensurável)
1. **Dados** (`units.js`): `sapper` "Sapadores de Pólvora" (humano) e `arsonist` "Incendiários" (orc): `hp:60, speed:5.0, armor:0, collisionRadius:0.7, visionRadius:16, ...MELEE_SCAN, attackRange:1.2, attackCooldown:0.1, damage:{basic:400,piercing:0,type:'siege'}, splashRadius:2.2, suicide:true, cost:{gold:70,wood:25,stone:0}, trainTime:10, requires:[{hq:2}], isCombat:true` (campo novo `suicide` documentado no cabeçalho). Treinados na Oficina (`trains` ganha o tipo). Modelos procedurais (`SapperModel.js`: humano com barril de pólvora nas costas e pavio aceso; `ArsonistModel.js`: orc com botijas de óleo/chama), ≤ 12 draw calls, nós padrão; rosto só em +Z; animação `'fight'` = corrida acelerada + pavio piscando.
2. **Comportamento**: ao entrar em `attackRange` do alvo (construção, muralha, unidade), o sapador **detona**: `EVT.EXPLOSION {pos, radius, ownerId}`, dano `siege` (×1,5 contra construções, ×0,5 contra unidades — `computeDamage`) em **todas** as entidades **hostis** dentro do `splashRadius` com queda linear (100 % → 40 % na borda), **1 RNG por entidade em ordem de id**; a unidade morre **sem** cadáver e **conta como baixa** para o dono (`MatchStats.unitsLost`) mas o kill vai ao dono. Prioridade de alvo: construção/muralha mais próxima > unidade (não auto-adquire unidades isoladas; o design é "abrir caminho"). Ordem de ataque explícita em qualquer alvo hostil funciona. Sob `hold`, só explode em quem entrar no alcance.
3. **Muralhas**: dano contra `wall_*` = 250+ (mata 1–2 segmentos vizinhos): teste que 1 sapador abre ≥ 1 segmento e 3 sapadores derrubam a linha de 6 do IA.
4. **VFX/áudio**: explosão (flash + esfera de partículas + anel + tremor curto de câmera opcional `?shake` ligado por padrão, 0,15 s, sem alocação) via `VfxEvents`; som reaproveitado de impacto pesado.
5. **IA**: `FACTIONS.*.units.sapper`; a IA os produz quando o inimigo tem ≥ 4 muralhas ou Centro nível ≥ 2 e envia 3 junto do ataque, na frente. Simples; não bloqueia se faltar requisito.
6. **HUD**: botão na Oficina, card com "Suicida" e raio; nomes PT-BR; ícone provisório.

## Contexto no código
`src/data/units.js`, `src/entities/Unit.js` (`updateAttacking` ~l.1523, `die`), `src/sim/combat.js`, `src/sim/events.js`, `src/render/VfxEvents.js`, `src/core/GameManager.js` (`unitGrid`/`blockerGrid` para varrer o raio), `src/sim/MatchStats.js`, `src/ai/*`, `ModelFactory`, inspetor, `AssetPreloader`.

## Não fazer
Sapadores sem Oficina, ataque em cadeia de explosões, minas, mudar F4-02. Não use Blender.

## Testes (Vitest)
`sapper.test.js`: detona no alcance, morre, sem cadáver; dano em área com queda e só hostis; dano ×1,5 em construção e ×0,5 em unidade; 1 RNG por alvo em ordem de id (determinismo); abre muralha; conta em `MatchStats`; IA produz sapadores em headless; sob `hold` não persegue. `determinism.test.js` verde.

## Verificação
Mínimos do `_COMUM.md`; jogo (porta 5212, safe-run, `?skipPreload&texq=low&play`): 3 sapadores × linha de muralha; capturas em `tools/ui-captures/sappers/`; `?bench=combate100` sem regressão > 3 %.

## Docs
`docs/02_MECANICAS.md`, `docs/01_ARQUITETURA.md` (`suicide`, `EVT.EXPLOSION`), `docs/08_GAME_DESIGN.md` §5.1.

## Entrega
Commits `F4-05 wip: ...`; final `F4-05: sapadores`. Relatório ≤ 25 linhas.
