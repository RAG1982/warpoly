# F4-08 · Heróis (escaramuça e campanha — decisão D6)

> **Status: ⏳ A FAZER** (spec pronta 2026-09-30; não disparada — depois de F4-03, F4-04, F4-04b mescladas).
> Leia antes: `CLAUDE.md`, `docs/specs/_COMUM.md`, `docs/07_DECISOES.md` (D6, D2), `docs/08_GAME_DESIGN.md` §5.3 (Heróis), §8, `docs/specs/F4-03-mana-habilidades.md`, `docs/specs/F4-04b-templo-magias-restantes.md`, `docs/specs/F3-09-vitoria-estatisticas.md` (stats).
> Executor: **sonnet**, worktree, porta do vite **5216**. Depende de F4-01 (cavalaria/Templário), F4-03, F4-04, F4-04b, F3-06 (Centro nível 2). A campanha (F8-04) só **consome** os heróis definidos aqui.

## Por quê
Design §5.3/D6: **1 herói vivo por jogador**, escolhido entre 3 da facção, invocado no **Centro nível 2** (300 ouro · 100 madeira · 50 pedra · 5 suprimento · 45 s), níveis 1–5 por experiência, 3 habilidades (2 ativas + 1 aura, liberadas nos níveis 1, 3 e 5), revive no Centro por 50 % do custo em 30 s, opção "Sem heróis". Nomes D2/D7.

## Pronto quando (mensurável)
1. **Dados** `src/data/heroes.js` (novo; via `src/data/index.js`): `HEROES = { [id]: { id, faction, name, title, baseUnit, hp, damage, armor, speed, attackRange, attackCooldown, maxMana, manaRegen, xpPerLevel:[0,100,250,450,700], levelBonus:{hpPct:10, damagePct:10}, abilities:[{id, unlockLevel:1|3|5}], modelOf, cost, trainTime, supply:5 } }`. Humanos: **Rainha Elyra** (base Templário, "A Luz de Aldária"), **Mestre Arcano Oren** (base Mago), **Capitão Brann** (base Espadachim). Orcs: **Drogath Punho-de-Brasa** (base Talhador), **Vozgul a Profetisa** (base Necromante), **Grok Quebra-Muros** (base Ogro Feiticeiro). Stats base = unidade-base ×2 em PV e ×1,5 em dano (valores iniciais para F3-11), armadura +2, `maxMana:255` quando conjurador, `speed` igual à base.
2. **Habilidades** (em `abilities.js`, `heroOnly:true`; cada herói: **2 ativas + 1 aura**; reaproveite efeitos de F4-03/F4-04/F4-04b; crie só o que falta): 
   - Elyra: **Cura Divina** (`ally`, 10 mana/PV curado ×… reaproveita `heal`), **Martelo Sagrado** (`enemy`, 60 mana, dano mágico 90 + `slow` 4 s), aura **Presença Radiante** (aliados em raio 8: +2 armadura).
   - Oren: **Bola de Fogo Maior** (`ground`, 100, dano mágico 120 raio 2,5), **Barreira Arcana** (`ally`, 90, status `shielded`: absorve 150 de dano por 15 s — implemente `shielded` absorvendo em `takeDamage`), aura **Mente Aguçada** (aliados conjuradores em raio 10: `manaRegen +1`).
   - Brann: **Golpe Devastador** (`enemy`, 40, dano normal ×2 do herói), **Grito de Comando** (`self`/raio 8, 60, aliados: `haste` 10 s), aura **Estandarte** (aliados em raio 8: +10 % dano).
   - Drogath: **Chama Voraz** (`enemy`, 50, dano mágico 80 + queima 5/s por 4 s: status `burn`), **Sede de Sangue Maior** (`ally`, 60, `bloodlust` 25 s), aura **Fúria da Horda** (aliados em raio 8: +10 % velocidade de ataque).
   - Vozgul: **Drenar Vida** (`enemy`, 70, 40 dano/s canalizado 3 s, cura a heroína), **Maldição** (`enemy`, 80, `slow` + −25 % dano 20 s), aura **Aura Sombria** (inimigos em raio 8: −1 armadura).
   - Grok: **Onda de Choque** (`self`, 90, dano 60 raio 4 + empurra), **Pele de Pedra** (`self`, 70, `invulnerable` 5 s), aura **Terror** (inimigos em raio 6: −10 % velocidade).
   Auras: nova categoria `type:'aura'` em `abilities.js` (`radius`, `statusOnAllies|statusOnEnemies`, sem mana): aplicada no `simStep` a cada 0,5 s escalonado por id para unidades no raio (usa `unitGrid.queryRadius`; status com `duration:0.75` renovado, **sem alocar**); só ativa se o herói vivo estiver no nível de desbloqueio (`unlockLevel`).
3. **Invocação**: `CMD.SUMMON_HERO {buildingId, heroId}` no **Centro** (nível ≥ 2, `hq`): treinado pela fila do Centro como qualquer unidade (`Building.queueUnit` estendido: item `{heroId}`), **um único herói vivo por jogador** (`player.hero`: `{heroId, unitId|null, deadAtTick|null, revivesUsed}`); custo 300/100/50 (`cost` do `heroes.js`), 5 de suprimento, 45 s; cancelar reembolsa 100 %. Botões de herói no card do Centro **só** quando `matchConfig.heroes !== false`, Centro nível ≥ 2 e nenhum herói vivo/em fila. Escolha do herói no botão (3 opções da facção, ícones provisórios).
4. **Morte e reviver**: morto o herói, `player.hero.unitId=null`; botão "Reviver" no Centro (50 % do custo, 30 s, mesma fila) **mantém nível e XP**; nunca deixa cadáver (F4-04: `corpseless:true`); EVT `HERO_DIED`/`HERO_REVIVED`.
5. **Experiência e níveis**: `unit.xp`, `unit.level` (1–5); XP por abate próximo: quando uma unidade inimiga morre (`UNIT_DIED` com `killerOwnerId` do dono) **num raio 12 do herói** o herói ganha `xpValue(unitType)` = `floor(cost total / 10)` (cerco/muralhas contam 0; construções destruídas por unidades a ≤ 12: `floor(cost/20)`); ao subir de nível: `hp/damage +10 %` acumulado, **cura total** inicial de 25 % do PV faltante, `mana` cheia, e `EVT.HERO_LEVEL_UP` (VFX `ring` dourado + som existente). Nível 3 e 5 desbloqueiam habilidades (botões acendem). Sem "pontos de habilidade" (desbloqueio automático — decisão simples; registre).
6. **Opção "Sem heróis"**: `MatchConfig.heroes` (`true` padrão; `?heroes=0`), checkbox no menu de escaramuça (`warpoly.heroes`); com `false`, nenhum botão de herói, nenhuma IA de herói.
7. **Modelos**: procedurais provisórios — reutilize os modelos-base (`templar/mage/knight/grunt/necromancer/ogre_mage`) com **escala 1,25** e **elemento distintivo** (capa de cor/coroa/pauldron maior via `HeroModels.js` que embrulha o modelo-base e acrescenta 2–4 malhas: coroa dourada da Elyra, capuz arcano do Oren, elmo com crista do Brann, colar de ossos do Drogath, cajado de crânio do Vozgul, colar de presas do Grok), ≤ 20 draw calls; nomes de nós padrão. Arte final (Blender) é depois.
8. **HUD**: retrato do herói + barra de XP e nível no painel de seleção; botões de habilidade (F4-03) com cadeado até o nível; ícone do herói no minimapa; aviso de nível ("Rainha Elyra subiu para o nível 3!"). PT-BR.
9. **IA**: a IA (dificuldade ≥ normal, heróis ligados) invoca 1 herói quando o Centro é nível 2 e tem ouro > 500; escolhe por seed (RNG da partida); o herói acompanha o exército (mesmo grupo de ataque) e **não lança magias** (F5-05); se o herói morre, revive 1 vez por partida se tiver ouro.
10. **Stats**: `MatchStats` (F3-09) ganha `heroLevel` final e `heroDeaths`; herói morto pela IA conta kill normal.
11. **Campanha**: `heroes.js` aceita `fixedLevel` (aplica nível direto, sem XP) para F8-04; não implemente campanha.

## Contexto no código
`src/data/units.js`/`abilities.js`/`index.js`/`heroes.js`, `src/entities/Building.js` (`queueUnit`, fila do Centro), `src/entities/Unit.js`, `src/sim/commands.js`/`CommandExecutor.js`, `src/sim/MatchConfig.js` (+ `matchConfigFromSearch`), `src/ui/screens/MainMenu.js`, `src/ui/UIManager.js`, `src/sim/Player.js`, `src/sim/MatchStats.js`, `src/render/VfxEvents.js`, `ModelFactory`, inspetor, `AssetPreloader`, `src/ai/*`.

## Não fazer
Campanha, itens/inventário, mais de 1 herói por jogador, IA que usa magias, pontos de habilidade manuais, modelos Blender (depois). Não use `Math.random`.

## Testes (Vitest)
`heroes.test.js`: invocação exige Centro 2 e recursos, 1 herói por jogador (2º recusado), cancelar reembolsa; XP por abate em raio 12 e nível 1→5 com bônus +10 % cumulativo; habilidades bloqueadas antes do nível (`unlockLevel`); auras aplicam/expiram sem acúmulo e só com herói vivo; `shielded` absorve; `burn` causa 5/s; morte + reviver mantém nível/XP e custa 50 %; `?heroes=0` remove botões e recusa `SUMMON_HERO`; IA invoca herói; `MatchConfig.heroes` normaliza; `determinism.test.js` (checksum com `xp/level`) verde.

## Verificação
Mínimos do `_COMUM.md`; jogo (porta 5216, safe-run, `?skipPreload&texq=low&play&debug`): Centro 2 por console, invocar cada um dos 3 heróis, subir a nível 5 matando IA, usar habilidades e auras, morrer e reviver; capturas em `tools/ui-captures/heroes/`; `?bench=combate100` sem regressão > 3 %.

## Docs
`docs/02_MECANICAS.md` (heróis, XP, auras, reviver), `docs/01_ARQUITETURA.md` (`heroes.js`, `player.hero`, `type:'aura'`), `docs/08_GAME_DESIGN.md` §5.3 (marcar implementado).

## Entrega
Commits `F4-08 wip: ...`; final `F4-08: heróis (escaramuça), níveis, auras e reviver`. Relatório ≤ 25 linhas.
