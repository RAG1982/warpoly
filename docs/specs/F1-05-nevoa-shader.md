# F1-05 · Névoa de guerra por shader (continuação)

Leia antes: `docs/specs/_COMUM.md`, `CLAUDE.md`, seção "Névoa de guerra" de `docs/02_MECANICAS.md`, bugs B1/B2 em `docs/04_DIAGNOSTICO.md`.

## Onde trabalhar
- **Worktree existente**: `/home/rafael/warpoly/.claude/worktrees/agent-a0b7570c117baa26c`, branch `worktree-agent-a0b7570c117baa26c`.
- O último commit `dd57a03` ("F1-05 wip") contém ~70% do trabalho feito por outro agente numa sessão interrompida. **Não recomece do zero.**
- Porta do vite: **5184**.

## Passo 0 — atualizar a base
A branch parte de um master antigo (`9cd1863`). Rode `git rebase master` (o master mudou com F2-01 jogadores/IDs e F2-04 máquina de estados/`MatchSession`).
Conflitos esperados e como resolver:
- `src/ui/UIManager.js`: o master adicionou `, this._listenOpts` em todos os `addEventListener` e um `dispose()` no fim; a WIP mudou só `drawMinimap`. Mantenha as duas coisas.
- `src/core/InputManager.js`: idem (master: listeners com AbortController; WIP: 5 linhas). Mantenha as duas.
- `GameManager.dispose()` (master) já chama `this.fogOfWar.dispose()` se existir — a WIP criou `dispose()` em `FogOfWar`; confira que ele remove textura/uniforms e não quebra a 2ª partida.
Depois do rebase: `npm test` e `npx vite build` precisam passar antes de continuar.

## O que já existe na WIP (confira, não reescreva)
- `src/core/FogGrid.js`: grade lógica 128², estados `FOG_UNEXPLORED=0 / FOG_MEMORY=1 / FOG_VISIBLE=2`, `beginVision/revealArea/endVision`, `writeTexture(out, scale, blur)`, `writeMinimap`, `BuildingMemory` (fantasmas). Testes em `tests/unit/fogGrid.test.js`.
- `src/render/fogOfWarShader.js`: `fogUniforms`, `fogAppliesTo`, `markFogGround`, `excludeFromFog`, `patchShaderForFog`, `patchDepthShaderForFog`, `installFogOfWarShader()`. Teste em `tests/unit/fogShader.test.js`.
- `src/core/FogOfWar.js` reescrito com API: `update(dt, playerUnits, playerBuildings, enemyUnits, enemyBuildings)`, `isExplored`, `isVisible`, `revealArea`, `isBuildingKnown`, `forEachGhostBuilding`, `drawMinimapFog`, `reset`, `dispose`, `applyQuality(preset)`, `FOG_QUALITY` por preset.
- `UIManager.drawMinimap` já usa `isBuildingKnown` e `forEachGhostBuilding`.
- `tools/fog-compare/`: capturas "antes-*" e `capture.mjs`. **Faltam as "depois-*".**

## O que falta (checklist obrigatório)
1. **Instalar o shader**: `installFogOfWarShader()` não é chamado em lugar nenhum. Chame-o uma vez no boot da aplicação em `src/main.js`, **antes** do preload/compilação de materiais (o patch precisa existir quando os programas forem compilados). Garanta que HUD/sprites/anéis de seleção/barras de vida/fantasma de colocação/textos flutuantes são excluídos (`excludeFromFog` ou `fogAppliesTo` retornando false para `MeshBasicMaterial` com `depthTest:false`, `SpriteMaterial`, e materiais do ghost do `ModelFactory`).
2. **Cache de programas**: cada material com patch deve ter `customProgramCacheKey` estável (ex.: `'fog1'`) para não multiplicar programas. Meça `renderer.info.programs.length` antes/depois: aumento ≤ +2 programas por tipo de material.
3. **InstancedMesh** (árvores `TreeManager`, `Decorations`): a posição de mundo no shader precisa incluir `instanceMatrix`. Verifique visualmente que árvores escurecem na memória e somem no não explorado.
4. **Terreno e água**: marque com `markFogGround` (a WIP tem `FogOfWar.markGroundMeshes`); o chão não explorado deve ficar **preto**, memória **escurecida e dessaturada** (fator sugerido: luminância × 0,45, saturação × 0,3), visível **normal**.
5. **Unidades inimigas**: renderizadas somente com `isVisible` no centro da unidade (ou `isAreaVisible` com raio 0,6). Barras de vida seguem a mesma regra. Aliados/próprias sempre visíveis.
6. **Construções inimigas**: visíveis se `isVisible`; se já vistas e agora fora da visão → mostrar o último estado conhecido (a malha real fica visível mas escurecida pelo shader; **não** atualizar HP/chamas na memória). Se destruída fora da visão → fantasma (clone do template via `ModelFactory`, material escurecido) até a área ser revista; então some.
7. **Minimapa**: preto = não explorado, escurecido = memória, inimigos só com visão atual, fantasmas desenhados como construções.
8. **Qualidade**: `applyQuality` chamado com o preset de `QualitySettings.current` ao criar a névoa. `low`: sem blur, scale 1.
9. **Uso com múltiplos jogadores (F2-01)**: a visão é do jogador local (`gm.localPlayer`); unidades de aliados (`gm.isAlly`) também revelam. Use `gm.getUnitsOf`/`gm.buildings` filtrando por `ownerId` — **não** edite `GameManager.js` além de, no máximo, 2 linhas na chamada `fogOfWar.update` (registre no relatório).
10. **Remover o plano antigo** (`shroudMesh` a y=5,2) se ainda existir.

## Não fazer
- Não editar `Unit.js`, `Building.js`, `src/models/**`, `ModelFactory.js` (exceto ler templates), `SceneManager.js`.
- Não mudar números de balanceamento (`src/data/`).

## Testes a garantir
- `tests/unit/fogGrid.test.js` passa (revelar, visão atual some no próximo tick, memória persiste, fantasma criado ao destruir fora da visão e removido ao rever).
- Acrescente 1 teste: `FogOfWar.dispose()` seguido de nova instância não compartilha estado (uniform de textura trocado).

## Verificação
1. Comandos mínimos do `_COMUM.md`.
2. `bash /home/rafael/warpoly/tools/safe-run.sh --timeout 600 -- node tools/bench/run-bench.mjs --scenarios=inicial,combate100` antes (master) e depois. Aceite: frame time ≤ +5%, draw calls iguais (±2%).
3. Capturas "depois-*" com `tools/fog-compare/capture.mjs` (via safe-run, porta 5184, `?skipPreload&texq=low`): borda da névoa sem objetos atravessando; memória escurecida; inimigo visível → some ao sair da visão; fantasma de construção; minimapa. **Olhe as imagens**; se algo atravessar a névoa ou o mundo inteiro ficar preto/claro, corrija.
4. Jogue 2 partidas seguidas via menu (F2-04) no mesmo script: a névoa da 2ª partida começa zerada.

## Docs
- `docs/02_MECANICAS.md` seção "Névoa de guerra": descrever os 3 estados e fantasmas.
- `docs/04_DIAGNOSTICO.md`: marcar B1 e B2 como corrigidos (F1-05).

## Entrega
Mensagem de commit: `F1-05: névoa de guerra por shader com memória e fantasmas`. No relatório: números do bench antes/depois, programas antes/depois, lista das capturas.
