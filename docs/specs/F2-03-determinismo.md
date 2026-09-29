# F2-03 · Simulação determinística (seed, sem relógio, checksum)

Leia antes: `docs/specs/_COMUM.md`, `CLAUDE.md`, `docs/01_ARQUITETURA.md` (tick fixo F1-09, comandos F2-02, `MatchConfig.seed`).
Worktree: nova. **Primeiro `git merge master`** (precisa conter F2-02). Porta do vite: **5193**.

## "Pronto"
Duas execuções headless com a mesma `seed` e o mesmo log de comandos produzem o **mesmo checksum** a cada 20 ticks durante 12 000 ticks (10 min simulados) — teste automatizado. Visual (partículas, sons, decoração, animação) pode continuar aleatório.

## Regra central
Separar **RNG de simulação** (determinístico, `gm.rng`) de **RNG visual** (`Math.random`, livre). Tudo que altera estado de jogo usa `gm.rng`; nada da simulação lê relógio de parede.

## Implementação
1. `src/sim/rng.js`: `mulberry32(seed)` → objeto `{ next() /*[0,1)*/, int(n), range(a,b), pick(arr), fork(label) }`; `fork(label)` cria sub-RNG derivado por hash de string (para a geração do mapa não mudar a sequência da IA).
2. `GameManager`: `this.rng = createRng(config.seed)`; sub-RNGs: `this.rngMap = rng.fork('map')`, por IA `rng.fork('ai:'+playerId)`.
3. Substituir `Math.random` **da simulação** (lista levantada no master atual):
   - `src/core/GameManager.js` ~566–604 (clusters de árvores: ângulo, distância, tipo) → `rngMap`.
   - `src/entities/Tree.js` ~17–22 (`fallDir`, `rotY`, escala): são visuais **mas** afetam posição/colisão? `rotY`/escala são só visuais → podem usar `rngMap` para o mapa ser idêntico visualmente entre jogadores (recomendado); `fallDir` é visual → `Math.random` ok.
   - `src/entities/Building.js` ~687 (`spawnX` da unidade treinada) → `gm.rng`. ~766 (cluster de fumaça) → visual, pode ficar.
   - `src/ai/AIEconomyManager.js` ~224, 265, 659–660 e `src/ai/AIMilitaryManager.js` ~156 → RNG da própria IA (`director.rng`).
   - `src/sim/MatchConfig.js` ~90 (gerar seed nova) → pode continuar `Math.random` (acontece fora da partida), mas a seed resultante fica gravada na config.
   - Faça um `grep -rn "Math.random" src/core src/entities src/ai src/sim` e classifique **cada** ocorrência no relatório (sim → trocado / visual → mantido com comentário `// visual: não afeta o estado`).
4. `src/core/Pathfinder.js` ~482–488: orçamento por `performance.now()` → trocar por **orçamento de nós expandidos** (`maxNodes = 4000` por passo). Mesmo limite em todas as máquinas.
5. Ordem de iteração: garantir que laços que alteram estado percorram entidades em ordem de `id` (arrays mantidos ordenados na inserção — `allUnits`, `buildings`, `trees` já são por ordem de criação; confirme que remoções usam `splice` e não trocam ordem). `SpatialGrid.queryRadius` já ordena por id (F1-06). Evite `for...in`/`Object.keys` em estruturas de estado.
6. Ponto flutuante: não usar `Math.hypot` em caminhos críticos de decisão? — **não precisa** (JS é IEEE-754 determinístico no mesmo motor); **mas** registre no relatório que multiplayer entre navegadores diferentes pode divergir em `Math.sin/cos/exp` e proponha (não implemente) tabela/implementação própria para trigonometria em F9-03.
7. `src/sim/checksum.js`: `stateChecksum(gm)` — hash FNV-1a de 32 bits sobre, em ordem de id: unidades (`id, type, ownerId, x,z` arredondados a 1e-3, `hp`, `state`), construções (`id, type, ownerId, hp, buildProgress, fila`), recursos de cada jogador, `currentTick`. Chamado a cada 20 ticks; guarda em `gm.checksums` (últimos 100).
8. **Headless**: garantir que `GameManager` + `simStep` rodam em Node sem DOM/WebGL para o teste — se criar entidades exige three.js/ModelFactory, crie um modo `headless: true` na `MatchConfig` em que `ModelFactory.createUnit/createBuilding` retornam `new THREE.Group()` vazio (three.js roda em Node) e texturas/canvas não são criados. Mudanças mínimas e isoladas (`if (gm.headless)`).

## Não fazer
- Não mudar balanceamento nem comportamento percebido da IA (só a fonte de aleatoriedade).
- Não mexer em render/shaders/modelos além do modo headless.

## Testes (Vitest)
- `rng.test.js`: mesma seed → mesma sequência; `fork('a') ≠ fork('b')`; distribuição razoável (média ~0,5 em 10k).
- `determinism.test.js` (headless): partida 1×1 IA×IA, seed 42, 12 000 ticks (10 min), duas execuções → arrays de checksum idênticos; seed 43 → diferente. Tempo do teste < 60 s (se passar, reduza para 6 000 ticks e documente).
- `pathfinder.test.js`: orçamento por nós — 200 pedidos resolvidos em N chamadas, independente do relógio.

## Verificação
Comandos mínimos do `_COMUM.md` (`npm run smoke` já usa safe-run — não aninhe). Registre tempo do teste de determinismo e a tabela de classificação dos `Math.random`.

## Docs
`docs/01_ARQUITETURA.md`: seção "Determinismo" (RNGs, checksum, headless). Marcar B14 corrigido em `docs/04_DIAGNOSTICO.md`.

## Entrega
Commit: `F2-03: simulação determinística (RNG com seed, orçamento por nós, checksum, modo headless)`.
