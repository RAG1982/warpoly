# F1-07 · Pathfinder de produção

Leia antes: `docs/specs/_COMUM.md` (na nuvem, veja também `docs/HANDOFF_CLOUD.md`), `CLAUDE.md`, bug B8 em `docs/04_DIAGNOSTICO.md`.

## Por quê
`src/core/Pathfinder.js` (grade 1,5 u, A*):
- open set é array linear com `includes`/`splice` (O(n²));
- a grade só marca **água** como bloqueada → unidades não contornam construções e ficam sendo empurradas pela colisão (B8);
- `hasLineOfSight(x0,z0,x1,z1)` retorna `false` para pontos idênticos (dist 0 ⇒ `steps=0` ⇒ `t = 0/0 = NaN`) — NEW-4;
- sem orçamento: muitas ordens no mesmo frame fazem vários A* completos.

## "Pronto"
- A* com heap binário; 50 ordens de movimento simultâneas atravessando o rio não passam de 4 ms de CPU por frame (orçamento).
- Unidades contornam construções (inclusive recém-construídas) e árvores vivas; ao destruir construção/cortar árvore, a célula volta a ser livre.
- `hasLineOfSight` com pontos iguais retorna `true` se a célula é caminhável.
- Testes existentes (`tests/unit/pathfinder.test.js`) + novos passam.

## Implementação
1. `src/core/Pathfinder.js`:
   - Camadas: `this.staticGrid` (água/bordas, como hoje `grid`) e `this.dynamicBlock` (`Uint16Array`, contador de bloqueios por célula). Caminhável = `staticGrid===1 && dynamicBlock===0`.
   - `blockCircle(x, z, radius, delta)` incrementa/decrementa `dynamicBlock` nas células cujo centro está dentro de `radius` (use `radius - 0.3` para não fechar passagens estreitas entre casas). Incrementar `this.version`.
   - `MinHeap` interno (arrays tipados; chave = fScore) substituindo `openSet`; `inOpen` como `Uint8Array` em vez de `includes`.
   - Se **origem** estiver dentro de célula bloqueada (unidade encostada numa construção), trate a célula de origem como livre. Se **destino** bloqueado, use `findNearestWalkable` considerando a camada dinâmica.
   - `hasLineOfSight`: `if (dist < 1e-6) return this.isWalkableWorld(x0, z0)`; também respeitar `dynamicBlock`.
   - **Orçamento**: `requestPath(unit, destX, destZ, callback)` coloca numa fila; `processQueue(maxMs = 2)` resolve pedidos até estourar o orçamento (medido com `performance.now()`), o resto fica para o próximo frame. Enquanto aguarda, a unidade anda em linha reta se `hasLineOfSight`, senão fica parada.
   - Cache opcional: mesmo par (célula origem, célula destino, `version`) devolve o caminho anterior (Map com limite 256).
2. Integração **mínima** (até 6 linhas no total) em `src/core/GameManager.js`:
   - em `registerEntity`: se for Building ou Tree viva → `this.pathfinder.blockCircle(x, z, collisionRadius, +1)`;
   - em `unregisterEntity` e quando a árvore for cortada/esgotada (onde a F1-06 remove do `blockerGrid`) → `blockCircle(..., -1)`;
   - no loop de simulação, chamar `this.pathfinder.processQueue(2)` uma vez por passo.
   **Atenção**: `GameManager.js` está sendo alterado em paralelo no computador do dono (tick fixo F1-09 e comandos F2-02). Mude só essas linhas, sem reformatar, para o merge ser trivial.
3. `src/entities/Unit.js` `moveTo`/`moveTowards`: trocar a chamada direta `findPath` por `requestPath` com callback que preenche `waypoints` — **só** essas chamadas, sem refatorar o resto (o arquivo também está sendo alterado em paralelo).

## Testes (Vitest, estenda `tests/unit/pathfinder.test.js`)
- `hasLineOfSight` com pontos iguais → true (terreno seco).
- Construção (`blockCircle`) entre origem e destino → caminho contorna (nenhum waypoint dentro do círculo); remover o bloqueio → caminho reto.
- Origem dentro de bloqueio → ainda encontra caminho.
- Heap: 1000 inserções aleatórias saem ordenadas.
- Orçamento: 200 `requestPath` com `processQueue(maxMs)` resolvem ao longo de várias chamadas; nenhum callback perdido.

## Verificação
- `npm test`, `npm run lint`, `npx vite build` (na nuvem: sem smoke/bench — ver handoff).
- Registrar no relatório o tempo médio de `findPath` num teste de 200 caminhos longos (antes/depois, medido no Vitest com `performance.now()`).

## Docs
`docs/01_ARQUITETURA.md` (Pathfinder: camadas, heap, orçamento) e marcar B8/NEW-4 como corrigidos em `docs/04_DIAGNOSTICO.md`/`docs/TASKS.md` (backlog).

## Entrega
Commit: `F1-07: pathfinder com heap, obstáculos dinâmicos e orçamento por frame`.
