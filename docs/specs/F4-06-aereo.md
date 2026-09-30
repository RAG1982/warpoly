# F4-06 · Unidades aéreas (Batedor aéreo e Ataque aéreo), camada de voo e detectores

> **Status: ⏳ A FAZER** (spec pronta 2026-09-30; não disparada — depois de F4-02 e F4-04b; se a F4-04b já introduziu `layer:'air'` mínimo, **estenda** em vez de recriar).
> Leia antes: `CLAUDE.md`, `docs/specs/_COMUM.md`, `docs/08_GAME_DESIGN.md` §3, §4 (Aviário de Grifos / Ninho das Serpes), §5.2, §6 (tabela de contras), `docs/specs/F4-02-cerco.md`, `docs/specs/F4-04b-templo-magias-restantes.md` (Olho Vigia usa `layer:'air'`/`detector`).
> Executor: **sonnet**, worktree, porta do vite **5213**. Depende de F4-02 (Oficina), F4-03, F4-04b.

## Por quê
Falta a **camada de voo**: unidades que ignoram terreno, água e colisão com o solo, só atingíveis por atiradores, torres, magias e navios (nunca corpo a corpo nem cerco). Design §5.2: **Batedor aéreo** (Planador de Engenho / Balão de Guerra: sem ataque, visão 30, detecta invisíveis, nível 2, Oficina) e **Ataque aéreo** (Cavaleiro Grifo / Serpe de Guerra: PV 350, dano mágico em área curta, nível 3, Aviário/Ninho).

## Pronto quando (mensurável)
1. **Camada** (`units.js` campo `layer: 'ground'|'air'` — padrão `ground`): unidade aérea **não usa pathfinder** (voo em linha reta), não colide com terreno/construções/unidades terrestres (fora do `blockerGrid`/separação de unidades terrestres; separa-se só de outras aéreas com repulsão leve), não bloqueia o pathfinder, altura de voo `flyHeight: 4.5` (Y = terreno + altura, com suavização), sombra projetada (reutilize a sombra de unidade; sem novo custo). Pode sobrevoar água e montanhas.
2. **Regras de alvo** (`Unit`/`combat.js`, helper puro `canTarget(attacker, target)` em `src/sim/targeting.js`): alvo `air` só por atacantes com `canHitAir:true` (atiradores `archer/axethrower/ranger/berserker`, torres com flag `hitsAir`, magias `damage`/`slow`/`bloodlust`... conforme `abilities.js` campo `hitsAir`, navios `Fragata/Galé` na F4-07b, e aéreas). Melee e cerco (`type:'siege'`) **não** atingem aéreos (a F4-02 já previu `layer==='air'` → falso). Aéreo atinge **terrestre e aéreo** conforme seu `canHitAir`/`canHitGround`. Auto-aquisição respeita `canTarget`. Projéteis (`Arrow`) seguem alvo em Y.
3. **Batedor aéreo**: `glider` "Planador de Engenho" (humano) e `war_balloon` "Balão de Guerra" (orc): `hp:120, speed:7.0, armor:0, layer:'air', visionRadius:30, detector:true, damage:{basic:0,piercing:0,type:'normal'}, attackRange:0, cost:{gold:110,wood:60,stone:20}, trainTime:14, requires:[{hq:2}], isCombat:false`. Treinados na Oficina. Modelos procedurais (`GliderModel.js`: planador de madeira com asas de pano; `BalloonModel.js`: balão + cesta com fogo), ≤ 14 draw calls; nós `Torso/Head/Rotor|Wings` e animação de balanço (novo ramo no `UnitAnimator` só para `layer:'air'`: bob senoidal; sem afetar demais).
4. **Ataque aéreo**: `gryphon_rider` "Cavaleiro Grifo" e `war_serpent` "Serpe de Guerra": `hp:350, speed:6.2, armor:2, layer:'air', canHitAir:true, canHitGround:true, attackRange:2.5, attackCooldown:1.6, damage:{basic:0,piercing:38,type:'magic'}, splashRadius:1.2, cost:{gold:250,wood:100,stone:0}, trainTime:22, requires:[{hq:3}]`. **Aviário de Grifos** `aviary` / **Ninho das Serpes** `serpent_nest` (`role:'aerie'`): `hp:900, armor:15, cost:{gold:300,wood:150,stone:60}, collisionRadius:3.4, requires:['barracks'|'orc_barracks',{hq:3}], trains:[...]`. Modelos procedurais (grifo com cavaleiro, serpe alada; aviário/ninho), ≤ 20 draw calls; animação de batida de asas (`WingL/WingR` — novo ramo condicional).
5. **Detecção** (reaproveita F4-04): `detector:true` já revela unidades `invisible`; declare o campo se ainda não existe.
6. **Pathfinder/física**: unidade aérea no `SpatialGrid` de unidades (alvo/seleção) mas **não** conta em `Pathfinder.blockCircle`; `moveTo` em linha reta ignora obstáculos; formação de grupo mista terrestre+aéreo move aéreos em linha reta (sem quebrar formação terrestre); `attackMove` funciona.
7. **Torres**: `watchtower`/`orc_watchtower` ganham `tower.hitsAir:true` (arqueiros); Torre de Canhão (F3-07/F4-02) **não**. A IA já as usa como sempre.
8. **HUD/IA**: cards com "Aéreo", ícones provisórios; a IA (F5) ainda não constrói aéreos; só garanta que não quebra quando o inimigo os tem e que **ataca aéreos com atiradores** (`canTarget`).
9. **Renderização**: unidades aéreas sempre visíveis acima do terreno (barra de vida em Y correto); minimapa as mostra; névoa normal.

## Contexto no código
`src/entities/Unit.js` (`stepTowards`, `moveTowards`, `findNearestHostile*`, projéteis, altura Y do terreno), `src/core/Pathfinder.js`, `src/core/GameManager.js` (`unitGrid`, `blockerGrid`), `src/sim/combat.js`, `src/data/units.js`/`buildings.js`/`factions.js`/`abilities.js`, `src/animation/UnitAnimator.js`, `ModelFactory`, inspetor, `AssetPreloader`.

## Não fazer
Aéreos da IA (F5), transporte aéreo, bombardeio em chão, modelos Blender (depois), mudar F4-02/F4-04. Não use `Math.random`.

## Testes (Vitest)
`air.test.js`: `canTarget` (melee/cerco não acertam aéreo; atirador/torre sim; aéreo acerta terrestre); aéreo cruza obstáculo/água/muralha em linha reta e não bloqueia `Pathfinder`; `detector` revela invisível; batedor sem ataque; Aviário exige Quartel + Centro 3; Grifo com dano em área; formação mista; `determinism.test.js` verde. Ajuste testes de pathfinder/ownership que assumam "toda unidade bloqueia".

## Verificação
Mínimos do `_COMUM.md`; jogo (porta 5213, safe-run, `?skipPreload&texq=low&play&debug`): grifos × arqueiros × cavaleiros; capturas em `tools/ui-captures/air/`; `?bench=combate100` sem regressão > 3 %.

## Docs
`docs/02_MECANICAS.md` (camada aérea, alvos), `docs/01_ARQUITETURA.md` (`layer`, `canTarget`, `flyHeight`), `docs/08_GAME_DESIGN.md` §5.2/§6.

## Entrega
Commits `F4-06 wip: ...`; final `F4-06: unidades aéreas e camada de voo`. Relatório ≤ 25 linhas.
