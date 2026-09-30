# F4-07b · Navios de guerra, transporte, desembarque, Fundição e submerso

> **Status: ⏳ A FAZER** (spec pronta 2026-09-30; não disparada — depois de F4-07a; usa `layer:'naval'`, `oil`, Estaleiro).
> Leia antes: `CLAUDE.md`, `docs/specs/_COMUM.md`, `docs/08_GAME_DESIGN.md` §3, §4 (Fundição / Fornalha Naval), §5.2 (Destróier, Transporte, Pesado, Submerso), §6, `docs/specs/F4-07a-petroleo-estaleiro.md`, `docs/specs/F4-06-aereo.md` (`canTarget`, `layer`), `docs/specs/F4-02-cerco.md` (dano em área/projétil balístico).
> Executor: **sonnet**, worktree, porta do vite **5215**.

## Por quê
Com a economia do petróleo e a navegação prontas (F4-07a) faltam as forças navais: destróier anti-navio/anti-ar, barcaça de transporte com embarque/desembarque, navio pesado de longo alcance, submerso invisível e a **Fundição** (pesquisas navais).

## Pronto quando (mensurável)
1. **Unidades** (`units.js`, `layer:'naval'`, treinadas no Estaleiro/Doca, custos incluem `oil`): 
   - `frigate` "Fragata" / `war_galley` "Galé de Guerra": `hp:280, speed:5.5, armor:3, attackRange:12, attackCooldown:1.3, damage:{basic:0,piercing:26,type:'piercing'}, canHitAir:true, canHitGround:true` (costa/terra até 2 de margem), `cost:{gold:200,wood:100,stone:0,oil:50}, trainTime:16, requires:[{hq:2}]`.
   - `barge` "Barcaça de Transporte": `hp:220, speed:4.6, armor:2, transportCapacity:6, cost:{gold:150,wood:100,stone:0,oil:30}, trainTime:14, sem ataque`.
   - `dreadnought` "Couraçado" / `iron_leviathan` "Leviatã de Ferro": `hp:520, speed:3.6, armor:6, attackRange:22, minAttackRange:6, attackCooldown:3.4, damage:{basic:90,piercing:0,type:'siege'}, splashRadius:1.8` (projétil balístico de F4-02; **destrói costa**: atinge construções/unidades em terra até 2 da margem), `cost:{gold:300,wood:200,stone:0,oil:120}, trainTime:24, requires:[{hq:3},'foundry'|'naval_forge']`.
   - `submersible` "Submersível" / `colossal_turtle` "Tartaruga Colossal": `hp:200, speed:4.4, armor:0, attackRange:9, attackCooldown:2.0, damage:{basic:0,piercing:60,type:'piercing'}, canHitGround:false` (só navios), `invisible` **permanente** (mecânica da F4-04: revelada por `detector` — Planador/Balão/Fragata? **só** batedores aéreos e torres com `detector`, como no design), `cost:{gold:300,wood:150,stone:0,oil:100}, trainTime:22, requires:[{hq:3},'foundry'|'naval_forge']`; some (`visible=false`) para inimigos sem detecção e **emerge** por 2 s ao atacar (revela-se, como F4-04 `invisible` "acaba ao atacar", mas volta sozinho após 4 s sem atacar).
   Modelos **procedurais** para todos (`FrigateModel.js`, `BargeModel.js`, `DreadnoughtModel.js`, `SubmersibleModel.js` e versões orcs: velas/ossos/ferro), ≤ 16 draw calls cada, cor de time em velas/faixas, casco com balanço de ondas (ramo `layer:'naval'` do `UnitAnimator`: bob + inclinação), esteira de espuma (partículas do pool `ParticleSystem`, sem alocação por frame).
2. **Fundição** (`foundry` "Fundição" / `naval_forge` "Fornalha Naval", `role:'foundry'`): `hp:800, armor:15, cost:{gold:180,wood:100,stone:60}, collisionRadius:3.4, requires:['shipyard'|'ship_dock',{hq:2}]`, em costa. Pesquisas (`RESEARCH`, `building:'foundry'`, 2 níveis, custam petróleo): `naval_cannons` (+dano naval: `bonus.piercing +8`/nível, `appliesTo` navios de ataque), `naval_hulls` (+armadura naval `+3`/nível). Modelos procedurais (`FoundryModel.js`, `NavalForgeModel.js`).
3. **Transporte**: `CMD.LOAD {unitIds, targetId}` (unidade terrestre ordena entrar na barcaça: anda até a **margem** mais próxima do barco e embarca se o barco estiver a ≤ 3 da margem; senão a barcaça se aproxima da margem quando a ordem parte da barcaça) e `CMD.UNLOAD {unitId, x?, z?}` (todos desembarcam na **margem** mais próxima do ponto, ordem dada à barcaça: navega até célula navegável adjacente a uma célula terrestre livre e libera até 6 unidades em anel). Unidades embarcadas: `unit.transportedBy = boatId`, `visible=false`, fora do `unitGrid` de alvos, não recebem ordens, não ocupam pathfinder; morrem com o barco (cada uma emite `UNIT_DIED`, `killerOwnerId` do barco atacante) — sem cadáver. Limite 6 (capacidade por tipo). UI: botão "Desembarcar" no card do barco + contador de carga; clique direito em barco aliado com terrestres selecionados = `LOAD`.
4. **Regras de alvo** (usa `canTarget` de F4-06): navio ataca navio e terrestre à margem; fragata/galé atacam aéreo; submerso só ataca navio; couraçado ataca navio e costa (não aéreo); terrestres à distância (arqueiros/cerco) atacam navios adjacentes à costa dentro do alcance; melee **não** atinge navio.
5. **Combate/limites**: navios têm `collisionRadius` e separação entre si; embarque de terrestres não colide com a água. `unitGrid` de navios usa a mesma grade (alvo/seleção normal).
6. **IA**: **não** usa navios nem transporte (F5); ataca navios inimigos próximos com atiradores; não quebra com barcaça cheia.
7. **HUD**: cards de navios (nível de carga, alcance, "Naval"), botões de Estaleiro (treinar `frigate/barge/dreadnought/submersible`) e Fundição (pesquisas), tooltips PT-BR com petróleo faltante; minimapa mostra navios.

## Contexto no código
Tudo de F4-07a, mais `src/sim/CommandExecutor.js`/`commands.js` (novos `LOAD/UNLOAD`), `src/entities/Unit.js`, `src/sim/targeting.js` (F4-06), `src/animation/UnitAnimator.js`, `src/render/VfxEvents.js`, `ParticleSystem`.

## Não fazer
IA naval/anfíbia, transporte aéreo, minas marítimas, mudar F4-06/F4-07a, Blender.

## Testes (Vitest)
`ships.test.js`: treino exige Estaleiro + Centro 2 (Couraçado/Submerso: Centro 3 + Fundição) e petróleo; navio ataca aéreo (fragata) e não é atingido por melee; couraçado acerta costa e respeita alcance mínimo; submerso invisível até `detector` e emerge ao atacar; `LOAD/UNLOAD` (capacidade 6, embarque só perto, desembarque em margem, morrem com o barco sem cadáver); pesquisas da Fundição aplicam bônus; `commands.test.js` valida `LOAD/UNLOAD`; simulação headless `estreito-1v1` 3000 ticks com navios criados por teste sem exceção; `determinism.test.js` verde.

## Verificação
Mínimos do `_COMUM.md`; jogo (porta 5215, safe-run, `?skipPreload&texq=low&play&map=estreito-1v1&debug`): batalha naval 3×3, desembarque de 6 espadachins, submerso; capturas em `tools/ui-captures/ships/`; `?bench=combate100` sem regressão > 3 %.

## Docs
`docs/02_MECANICAS.md`, `docs/01_ARQUITETURA.md` (`transportedBy`, `LOAD/UNLOAD`), `docs/08_GAME_DESIGN.md` §5.2.

## Entrega
Commits `F4-07b wip: ...`; final `F4-07b: navios de guerra, transporte, Fundição e submerso`. Relatório ≤ 25 linhas.
