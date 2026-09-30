# F1-06 · Grade espacial (spatial hash) para a simulação

> **Status: ✅ PRONTA — DONE parcial (bf87e23); gargalo restante em NEW-14/F1-09**

Leia antes: `docs/specs/_COMUM.md`, `CLAUDE.md`, `docs/01_ARQUITETURA.md` (modelo de jogadores F2-01: `gm.allUnits`, `ownerId`, `gm.isHostile`, `gm.entitiesById`).
Worktree: nova (isolada). Porta do vite: **5187**.

## Objetivo e "pronto"
Eliminar varreduras O(n²)/lineares da simulação. **Pronto quando**: `gm.update` médio < 4 ms no bench `massa300` (hoje ~7 ms), comportamento idêntico (mesmos raios, mesma prioridade de alvo, empates por `id`), picking do mouse sem montar lista de todas as meshes.

## API a criar — `src/sim/SpatialGrid.js` (lógica pura, sem three.js)
```js
export class SpatialGrid {
  constructor({ minX = -70, minZ = -70, maxX = 70, maxZ = 70, cellSize = 4 } = {})
  insert(entity, x, z, radius = 0)      // guarda célula(s) em entity._sg (ou WeakMap interno)
  update(entity, x, z, radius = 0)      // move só se mudou de célula
  remove(entity)
  clear()
  // Preenche e retorna outArray (reutilizado, sem alocar). Inclui entidades cuja distância centro-centro
  // ≤ r + raioDaEntidade. filter(entity) opcional. Resultado ORDENADO por id crescente (determinismo).
  queryRadius(x, z, r, filter = null, outArray = [])
  queryRect(minX, minZ, maxX, maxZ, filter = null, outArray = [])
  // Mais próxima com predicate, desempate por menor id. Retorna null se nenhuma em maxR.
  nearest(x, z, maxR, predicate = null)
}
```
Entidades são objetos com `id` (F2-01) e posição em `entity.mesh.position` — mas a grade recebe x/z explícitos (não leia three.js dentro dela).

## Integração no GameManager (`src/core/GameManager.js`)
- Crie `this.unitGrid` (dinâmica) e `this.blockerGrid` (construções, depósitos, árvores vivas) no construtor.
- Registro: `registerEntity` (linha ~145) / `unregisterEntity` (~149) inserem/removem na grade correta (unidade → `unitGrid`; Building/ResourceDeposit/Tree → `blockerGrid` com `collisionRadius`). Árvore cortada (`woodRemaining <= 0` ou `isDead`) sai do `blockerGrid`.
- `update` (linha ~1061): **uma vez por tick**, antes de atualizar unidades, `unitGrid.update` de todas as unidades vivas.
- `resolveBuildingCollisions` (~1199) / `_checkUnitBlockerCollision` (~1160): consultar só `blockerGrid.queryRadius(u.x, u.z, u.collisionRadius + 6)`.
- `resolveUnitCollisions` (~1228): para cada unidade, `unitGrid.queryRadius(x, z, r1 + maxUnitRadius)` e resolver só pares com `id` maior (evita dupla resolução). Mantenha o empurrão idêntico (inclusive o caso `dist < 0.001`; troque o `Math.random()` por ângulo derivado dos ids, ex. `(a.id*73856093 ^ b.id*19349663) % 360`, e registre).
- `canPlaceBuilding` (~565): árvores/construções/depósitos via `blockerGrid.queryRadius` com os mesmos raios de folga atuais.
- `findNearestResource` (~834) e `findNearestDropoff` (~855): `blockerGrid.nearest` com predicate equivalente ao filtro atual.
- `selectUnitsInBox` (~904): mantenha a projeção em tela (é por câmera), mas itere só `getUnitsOf(localPlayer)`.

## Integração em Unit (`src/entities/Unit.js`)
- `findNearestHostileCombatUnit` (~936), `findNearestHostileUnit` (~960), `findNearestHostile` (~986): usar `gm.unitGrid.queryRadius(x, z, maxDist, filtroHostil, buffer)` e `gm.blockerGrid` para construções; **preservar a prioridade**: combate > trabalhador > torre > construção, e a menor distância dentro de cada classe; empate por menor `id`.
- Chamada de ajuda em `takeDamage` (~373, `allUnits.forEach` com `helpRadius`): `unitGrid.queryRadius(..., helpRadius, aliadoDeCombate)`.
- Use buffers de módulo (`const _buf = []`) para não alocar.

## Integração em Building (`src/entities/Building.js` ~698)
Alvo da torre: `gm.unitGrid.nearest(x, z, attackRange, u => vivo && gm.isHostile(this.ownerId, u.ownerId))`.

## IA (`src/ai/AIDirector.js` ~166, `src/ai/AIMilitaryManager.js` ~49)
Intrusos a < 26 da base: `gm.unitGrid.queryRadius(baseX, baseZ, 26, hostil)` em vez de varrer `getHostileUnits()`.

## Picking (`src/core/InputManager.js` `raycastScene` ~252)
- Intersecte primeiro o terreno (já faz). Depois `gm.unitGrid.queryRadius(ground.x, ground.z, 6)` + `gm.blockerGrid.queryRadius(ground.x, ground.z, 8)`; faça o raycast fino (`intersectObjects(meshes, true)`) **só** nessas entidades. Buffer de meshes reutilizado.
- Se o raio do mouse não tocar o terreno (céu), mantenha `hoveredEntity = null`.
- Precisão: clicar em unidade alta (ogro) e em construção alta (torre) deve funcionar — se o ponto do chão ficar longe do topo, amplie o raio de busca para 12 em construções.

## Não fazer
- Não editar `src/models/**`, `ModelFactory.js`, `src/render/**` (F1-03 em andamento) nem `FogOfWar.js`, `src/world/**`, `UIManager.drawMinimap` (F1-05 em andamento).
- Não mudar raios/números (`src/data/`).

## Testes (Vitest, `tests/unit/spatialGrid.test.js`)
insert/queryRadius básico; entidade na borda de célula; `update` movendo entre células; `remove`; `queryRadius` com raio grande (atravessa várias células) retorna todos; ordenação por id; `nearest` com empate de distância retorna menor id; `outArray` reutilizado (mesma referência, `length` ajustado); entidade fora dos limites é "clampada" para a célula de borda.

## Verificação (números no relatório)
1. Comandos mínimos do `_COMUM.md`.
2. Bench via safe-run antes (master) e depois: `npm run bench -- --scenarios=combate100,massa300` — reportar `gm.update` médio (ms) e FPS.
3. Partida curta via safe-run (porta 5187, `?skipPreload&texq=low`), 120 s simulados acelerando `gameSpeed`: IA coleta, constrói, treina e ataca; unidades não se atravessam; `selectSingle` por `hoveredEntity` após mover o mouse sobre uma unidade e uma construção funciona.

## Docs
`docs/01_ARQUITETURA.md` (SpatialGrid) e `docs/04_DIAGNOSTICO.md` (item 5 da seção 1: marcar colisão/alvo/picking como resolvidos).

## Entrega
Mensagem de commit: `F1-06: grade espacial para colisão, alvo, colocação e picking`.
