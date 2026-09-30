# F3-03 — Modelo de combate WC2 (básico + perfurante, armadura, tipos de dano, RNG determinístico)

> **Status: ✅ PRONTA — DONE (2b345d6)**

> Leia antes: `CLAUDE.md`, `docs/specs/_COMUM.md`, `docs/08_GAME_DESIGN.md` §5 e §6. Executor: **sonnet**, worktree, porta do vite **5198**. **Rode depois da F3-04 estar mesclada** (ambas editam `Unit.js`, `Building.js`, `GameManager.js`, `src/ai/**`).

## Por quê
Hoje o dano é `max(2, ataque − armadura)`, sem variação, sem tipos e construções não têm armadura (B5). O design (§6) adota a fórmula do WC2 com aleatoriedade determinística (`gm.rng`), o que também dá base para cerco/magia (F4).

## Pronto quando (mensurável)
1. `src/sim/combat.js` (puro, sem three.js) exporta `computeDamage(damage, target, rng)` e `DAMAGE_TYPES = {NORMAL, PIERCING, SIEGE, MAGIC}`:
   - `dano = max(0, basic − armor_alvo) + piercing`; **MAGIC** ignora armadura (`armor = 0`); **SIEGE** ×1,5 se o alvo é construção, ×0,5 se unidade; multiplicador aleatório `0,5 + 0,5·rng.next()` (uniforme 0,5–1,0), depois `× DAMAGE_SCALE` (`src/data/combat.js`, inicial **1.333**, para manter o DPS médio próximo do atual — o balanceamento fino é a F3-11); resultado arredondado e **mínimo 1**.
   - Consome **exatamente 1** valor do RNG por golpe (contrato: mudar isso muda o checksum).
2. `src/data/units.js`: cada unidade ganha `damage: {basic, piercing, type}`. Migração (manter dano médio a armadura 0 ≈ valor atual):
   | tipo | attack atual | basic | piercing | type |
   |---|---|---|---|---|
   | villager / peon (trabalhadores) | 7 / 8 | 5 / 6 | 2 | normal |
   | knight (espadachim) / grunt | 26 / 28 | 20 / 22 | 6 | normal |
   | archer / axethrower | 18 / 19 | 6 / 7 | 12 | piercing |
   | ogre | 42 | 32 | 10 | normal |
   | bandit | 16 | 12 | 4 | normal |
   `attack` permanece como **getter derivado** (`basic + piercing`) para AI/HUD/legado; nenhum código novo lê `attack` para calcular dano.
3. Construções ganham `armor` em `src/data/buildings.js`: HQ 20, torres 20, muralhas 10 (quando existirem), demais 15 (design §6; corrige B5). Torres passam a ter `tower.damage` → `{basic, piercing, type}` (ex.: `18 → basic 6, piercing 12, piercing`; `19` idem com 7/12).
4. **Toda** aplicação de dano passa por `computeDamage`: golpe corpo a corpo (`Unit.js` ~l.1296), callback de projétil (`Unit.js` ~l.1284, `Building.js` ~l.696) e qualquer outro `takeDamage(...)` de origem de combate (grep `takeDamage(`). `Unit.takeDamage(amount)` e `Building.takeDamage(amount)` passam a receber **dano final já calculado** (Unit deixa de subtrair armadura e de forçar `max(2, …)`; Building idem). O RNG usado é `gm.rng.fork('combat')` criado em `GameManager` (nos dois lugares em que `this.rng` é criado, l.~82 e ~372) para não perturbar os outros consumidores.
5. Pesquisas da Forja (`src/core/GameManager.js` ~l.732–739 e `src/data/upgrades.js`): `attack` bônus soma em `damage.basic`; `defense` soma em `armor` (comportamento igual ao de hoje, agora no campo certo). Não mude valores/nomes de pesquisas (F3-07).
6. A HUD mostra dano como `basic+piercing` e armadura no card da unidade **e** da construção (mudança mínima em `UIManager`; a F3-01 da nuvem também edita este arquivo — localizada, sem reformatar).
7. Tabela de simulação em `docs/08_GAME_DESIGN.md` §6.1: para cada par (knight×grunt, archer×knight, grunt×archer, knight×castle, archer×castle, torre×knight) com 1000 golpes headless: dano médio, mín, máx, golpes para matar, e tempo para matar em duelo 1×1. Gerada por `tools/combat-table.mjs` (sem navegador); os testes unitários conferem os mesmos valores esperados.
8. Determinismo: `tests/unit/determinism.test.js` muda o baseline (o combate agora consome RNG). Regravar e justificar. Duas execuções com a mesma seed continuam idênticas; IA×IA de 10 min headless termina sem exceção e ainda há vencedor ou empate por tempo como antes.

## Contexto (confirme com grep)
- Dano atual: `Unit.takeDamage` l.534 (`Math.max(2, amount − armor)`), golpe l.1284–1296, `Building.takeDamage` l.481 (sem armadura), torre `Building.js` ~l.690–697, `Arrow.js` (projétil segue o alvo; callback recebe `dmg`).
- Dados: `src/data/units.js`, `buildings.js`, `data/index.js` l.~101–119 (deriva stats para o jogo: ajuste o mapeamento, não duplique números).
- RNG: `src/sim/rng.js` (`createRng`, `fork`), `GameManager` l.82/372.
- IA: `src/ai/AIMilitaryManager.js` usa poder/valor de unidades — mantenha a leitura via getter `attack`.

## Não fazer
- Sem cerco, magia, alcance mínimo, projéteis que erram nem bônus de altura (F4-02/F4-03; registre em `NEW-<n>` que o "errar alvo em movimento" ficou para a F4-02, pois não há cerco ainda). Sem mudar PV/velocidade/custos. Sem `Math.random` no combate. Sem alterar modelos.

## Testes
- `tests/unit/combat.test.js`: com RNG stub → limites 0,5/1,0; armadura ≥ básico ainda causa `piercing`; MAGIC ignora armadura; SIEGE ×1,5/×0,5; mínimo 1; um valor de RNG por golpe; mesma seed → mesma sequência.
- Migração: para cada unidade, `damage.basic + damage.piercing === attack` antigo (tabela do item 2).
- Construção com armadura 15 recebendo archer: `max(0, 6−15) + 12` × multiplicador.
- Ajustar testes existentes que assumiam `max(2, ataque − armadura)`.

## Verificação
```bash
npm test && npm run lint && npx vite build --outDir /tmp/claude-1000/warpoly-build-check
npm run smoke
node tools/combat-table.mjs
```
Visual (local): `?skipPreload&texq=low&play&faction=orc`, escaramuça; números de dano variam entre golpes; HUD mostra `básico+perfurante` e armadura.

## Docs
`docs/08_GAME_DESIGN.md` (§6.1 tabela), `docs/01_ARQUITETURA.md` (`sim/combat.js`, contrato do RNG). Não edite `docs/TASKS.md`.

## Entrega
Commits "F3-03 wip: …"; final `F3-03: combate WC2 (básico+perfurante, armadura de construções, RNG determinístico)` com Co-Authored-By de `_COMUM.md`. Relatório ≤ 25 linhas (baseline antigo→novo com justificativa, tabela resumida, desvios, `NEW-<n>`).
