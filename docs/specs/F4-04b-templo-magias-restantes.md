# F4-04b · Templo/Altar, Templário e Ogro Feiticeiro, e magias restantes

> **Status: ⏳ A FAZER** (spec pronta 2026-09-30; não disparada — depois de F4-04 e F4-01 mescladas).
> Leia antes: `CLAUDE.md`, `docs/specs/_COMUM.md`, `docs/08_GAME_DESIGN.md` §3, §4 (Templo da Luz / Altar das Tempestades), §5.1 ("Upgrades de classe"), §7 (Templo/Altar), §8, `docs/specs/F4-03-mana-habilidades.md`, `docs/specs/F4-04-conjuradores-magias.md`, `docs/specs/F4-01-cavalaria.md`.
> Executor: **sonnet**, worktree, porta do vite **5211**. Depende de F4-01, F4-03, F4-04.

## Por quê
F4-04 entregou o framework de conteúdo e as escolas do Mago/Necromante. Restam as **classes avançadas da cavalaria** (Cavaleiro→Templário, Ogro→Ogro Feiticeiro), o **Templo/Altar** que as libera e as magias que dependem de mecânicas ainda não existentes: **revelar área**, **Cura/Exorcismo**, **invocar batedor voador**, **runas** (armadilhas), **redemoinho** (entidade errante) e **Sede de Batalha**.

## Pronto quando (mensurável)
1. **Construções** (`role:'temple'`): `temple` "Templo da Luz" (humano) e `storm_altar` "Altar das Tempestades" (orc): `hp:900, armor:15, cost:{gold:250,wood:100,stone:80}, collisionRadius:3.4, visionRadius:24, healthBarHeight:7.6, requires:['stable'|'ogre_den',{hq:3}], trains:[]`; `buildList`; modelos procedurais (`TempleModel.js`: templo de colunas com cúpula dourada; `StormAltarModel.js`: altar de pedra com totens e relâmpagos estáticos), ≤ 20 draw calls, textura ≤ 512², em `ModelFactory`/inspetor/`AssetPreloader`.
2. **Classe avançada da cavalaria**: pesquisa `cavalry_class` (`building:'temple'`, 1 nível, 1000 ouro, 60 s, `requires:[{hq:3}]`; nomes "Ordenação" humano / "Ritual das Tempestades" orc) com `effect:{promote:{cavalier:'templar', ogre:'ogre_mage'}}` (mecanismo `promote` de F3-07): unidades vivas viram **Templário** / **Ogro Feiticeiro** (mantendo % de PV e bônus de pesquisa; ganham `maxMana:255, startMana:85`), e o Estábulo/Covil passam a treinar a classe nova. `templar` "Templário": base do `cavalier` +15 % PV/dano, `maxMana:255`, `abilities:['holy_vision','heal','exorcism']`; `ogre_mage` "Ogro Feiticeiro": base do `ogre` +10 % PV, `abilities:['eye_of_watch','bloodlust','runes']`; `modelOf: 'cavalier'|'ogre'` (arte nova é F7), com **tinta/emblema distinto** (material com cor de acento dourada/violeta aplicado como o `TeamColor`... se caro, só troque o nome exibido e registre NEW).
3. **Magias humanas**: **Vista Sagrada** (`ground`, 70 mana, range 40, revela raio 10 por 20 s: `FogOfWar.revealArea(x,z,r,ttl)` novo, sem alocar por frame; enquanto ativo, o dono enxerga unidades e construções na área), **Cura** (`ally`, 6 mana por PV curado, range 8, **auto-cast** ligado por padrão para aliados a < 60 % PV; cura 5 PV/s equivalente por 1 s e repete enquanto houver alvo e mana), **Exorcismo** (`enemy`, 4 mana por PV de dano, range 8, dano mágico **só contra `undead`**: causa até `min(PV do alvo, mana/4)`; alvo não-morto-vivo → NOTIFY "Alvo inválido").
4. **Magias orcs**: **Olho Vigia** (`ground`, 70, range 20: invoca `watching_eye` — unidade voadora invisível-a-ataques? **não**: unidade `layer:'air'`, `hp:1` (imune), sem ataque, visão 30, `lifetime:60`, velocidade 6, `detector:true`, controlável como unidade (mover) — depende de `layer` da F4-06; **se F4-06 ainda não existir**, implemente `layer:'air'` mínimo (campo + regra "não é atingível por corpo a corpo/cerco") e registre para F4-06 reaproveitar), **Sede de Batalha** (`ally`, 50, `bloodlust` 20 s), **Runas Explosivas** (`ground`, 200, range 10, cria 6 `rune` num círculo raio 2,5: entidades estáticas **invisíveis a inimigos** (mesma regra de detecção da F4-04), disparam quando um inimigo terrestre chega a ≤ 1,2: dano mágico 60 em raio 1,5 e somem; duram 60 s; podem ser destruídas por detectores — não precisa; máx. 12 runas ativas por jogador).
5. **Redemoinho** (Necromante das Cinzas — completar F4-04): `ground`, 100 mana, range 10, cria `whirlwind` (entidade `layer:'ground'` sem colisão) que **vaga** por 12 s (novo alvo aleatório a cada 2 s dentro de raio 6 do ponto, RNG da partida) causando dano mágico 12/s em raio 2 a **unidades terrestres** (amigas também: fogo amigo aceito); VFX espiral (`ring`+partículas).
6. **Restante do Necromante** (F4-04 deixou): confirmar as 6 magias completas; **Sede/Pressa/Armadura** etc. já feitas — só integre ícones/pesquisas faltantes no card do Santuário (`building:'arcane'`) e do Altar (`building:'temple'`: Sede de Batalha, Olho Vigia, Runas, Cura, Vista Sagrada, Exorcismo — cada uma como pesquisa de 1 nível com custo 500–1000 de ouro, `requires:[{research:'cavalry_class'}]`).
7. **HUD/IA**: cards de Templo/Altar com as pesquisas; Templário/Ogro Feiticeiro com botões de magia (F4-03); auto-cast de Cura (indicador). IA **não** usa (F5-05); só garanta que não quebra.
8. **Mana/heróis**: nenhuma mudança em heróis (F4-08).

## Contexto no código
Mesmos arquivos de F4-01/F4-03/F4-04 (`abilities.js`, `units.js`, `buildings.js`, `upgrades.js` — `promote` de F3-07 em `GameManager.promoteUnit`/`completeUpgrade`, `FogOfWar`, `VfxEvents`, modelos, inspetor).

## Não fazer
Heróis, IA conjuradora, aéreo completo (F4-06), Blender, mudar balanceamento de unidades existentes. Não criar sons/ícones novos.

## Testes (Vitest)
`spells2.test.js`: pesquisa `cavalry_class` promove cavaleiros/ogros vivos e muda o menu do Estábulo/Covil; Templo só com Estábulo + Centro 3; Vista Sagrada revela e expira; Cura por PV e auto-cast; Exorcismo só em `undead`; Olho Vigia tem `lifetime` e é `detector`; Runas: 6 criadas, invisíveis, disparam e somem, limite de 12; Redemoinho vaga deterministicamente e causa dano; Sede de Batalha altera cooldown/dano; requisitos de pesquisa; sem vazamento de pool/mesh; `determinism.test.js` verde.

## Verificação
Mínimos do `_COMUM.md`. Jogo (porta 5211, safe-run, `?skipPreload&texq=low&play&debug`): cadeia completa Centro 3 → Estábulo → Templo → pesquisar → promover → lançar cada magia; capturas em `tools/ui-captures/spells2/`; `?bench=combate100` sem regressão > 3 %.

## Docs
`docs/02_MECANICAS.md`, `docs/01_ARQUITETURA.md` (`revealArea`, `rune`, `whirlwind`, `layer`), `docs/08_GAME_DESIGN.md` §5.1/§7/§8.

## Entrega
Commits `F4-04b wip: ...`; final `F4-04b: Templo/Altar, classes avançadas da cavalaria e magias restantes`. Relatório ≤ 25 linhas.
