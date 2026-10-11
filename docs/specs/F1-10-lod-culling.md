# F1-10 · LOD e culling

> **Status: 📝 SPEC (nuvem escreve; execução = parte código na nuvem, parte medição local)**

Leia antes: `CLAUDE.md`, `docs/HANDOFF_CLOUD.md` (seção 2), `docs/specs/_COMUM.md`, `docs/specs/F1-09-tick-fixo-lod-animacao.md` (LOD de **animação** já feito — não repetir), `tools/bench/BASELINE.md`, NEW-7 em `docs/TASKS.md`.

## Objetivo ("pronto")
`npm run bench -- --scenarios=massa300`: **≥ 45 FPS** (hoje ≈ 17 FPS após F1-03b; meta original da tarefa) sem mudança visível em zoom normal (`zoomLevel` 0,5–1,8, ver `SceneManager.minZoom/maxZoom`). Medido **só no local** (GPU real, `tools/safe-run.sh`). Na nuvem o aceite é: testes de lógica pura verdes + `vite build`.

## O que já existe (não refazer)
- LOD de animação de unidades por frustum/névoa/distância: `src/sim/constants.js: animationLodStep`, `src/render/UnitView.js` (~l. 275-300).
- Frustum culling padrão do three por objeto (`Object3D.frustumCulled = true`); unidades são `SkinnedMesh` rígidos (F1-03b) — culling usa a esfera do **bind pose**, cuidado ao reduzir.
- Árvores/decorações são `InstancedMesh` (`src/world/TreeManager.js`, `src/world/Decorations.js`). **NEW-7 (PR de chunking das árvores) é pré-requisito** para culling de árvores; se ainda não estiver no `master`, apenas dependa da API `TreeManager` por chunk.

## Escopo (4 itens, em ordem; cada um é um commit)

### 1. Núcleo puro de LOD (`src/render/lod.js`, testável em Node)
Funções puras, sem three/DOM:
- `lodLevelForDistance(dist, thresholds, hysteresis)` → 0 (perto) | 1 (longe) com **histerese** (±8 %) para não piscar na fronteira; `thresholds` por categoria em `LOD_DISTANCES` (exportado): `unit: 90`, `building: 130`, `tree: 110`, `decoration: 70` (unidades de mundo, distância ao **alvo da câmera** — a mesma referência do LOD de animação).
- `zoomHidesDecorations(zoomLevel)` → true se `zoomLevel > 1.45` (zoom máximo afastado esconde decorações pequenas).
Teste `tests/unit/lod.test.js`: níveis, histerese (não alterna dentro da banda), limiar de decoração.

### 2. Decorações pequenas (grama, seixos, cogumelos, flores)
`src/world/Decorations.js`: cada `InstancedMesh` pequeno recebe `userData.lodCategory = 'decoration'`. Método `Decorations.applyLod(zoomLevel, cameraTarget)`: com `zoomHidesDecorations` → `mesh.visible = false` nos tufos/seixos/cogumelos/flores (**não** pedras grandes e arbustos, que são referência de navegação). Chamado 1×/frame de `MatchSession` (ou onde a água/decorações já atualizam). Sem custo extra quando visível (nenhum `setMatrixAt` novo).

### 3. Árvores distantes → impostor
Pressupõe o chunking do NEW-7 (um `InstancedMesh` por tipo × chunk de 32 u). Para chunks cuja distância ao alvo > `LOD_DISTANCES.tree`: trocar a geometria por uma versão simplificada **pré-gerada uma vez por tipo** (`lodGeometry`: cone de 6 lados para copa + cilindro de 4 lados para tronco, ou o `.glb` decimado se existir; mesma cor/atlas via UV simples) em vez de billboard (billboards exigem tratamento de sombra/rotação e foram descartados nesta spec). Implementar como segundo `InstancedMesh` por chunk **criado sob demanda** e alternado por `visible` (nunca recriar matrizes por quadro: ambos compartilham o mesmo `instanceMatrix`). Sombras: o impostor **não** projeta sombra (`castShadow = false`) além da distância de sombra. Teste: `TreeManager` com chunks a duas distâncias → só o chunk longe usa o impostor; derrubar árvore no chunk longe atualiza os dois meshes.

### 4. Construções e unidades distantes
- **Construções**: o `.glb` já é mesclado (poucos draw calls). Em `BuildingView.update`, acima de `LOD_DISTANCES.building`, ocultar partes marcadas como detalhe (`userData.lodDetail = true`: bandeiras, fumaça, chamas, anel de rally) — só `visible`, sem mexer na malha principal. Não criar segundo modelo.
- **Unidades**: acima de `LOD_DISTANCES.unit` desligar `castShadow` das malhas da unidade (a sombra de unidade pequena e distante é o maior custo de draw calls: ~2× por unidade na passada de sombra) e ocultar peças marcadas `userData.lodDetail` (armas decorativas, plumas). Reativar com histerese ao voltar. Estado guardado em `UnitView._lodLevel` (render, fora do checksum).

## Restrições
- Só `src/render/**`, `src/world/**` e o novo `src/render/lod.js`. **Nada em `src/sim/**`** (checksum/determinismo intactos; `determinism.test.js` verde).
- Zoom normal sem mudança visível; troca de nível nunca pisca (histerese).
- `?lod=0` na URL desliga todo o LOD (comparação A/B no bench). Leitura via o mesmo helper de parâmetros usado por `?glb=0`.
- Orçamento: nenhuma alocação por quadro (reusar vetores/arrays).

## Testes e verificação
- Nuvem: `tests/unit/lod.test.js`, `decorationsLod.test.js` (zoom alto esconde só as pequenas), teste do impostor de árvores, `npm test`, `npm run lint` (0 erros), `npx vite build`.
- **Verificação pendente (local)**: `npm run bench` (via `tools/safe-run.sh`) com e sem `?lod=0` em `combate100` e `massa300`: registrar FPS, 1% low, draw calls, triângulos; capturas em zoom 0,5 / 1,0 / 1,8 comparando com `?lod=0` (sem diferença perceptível a zoom ≤ 1,0). Meta: massa300 ≥ 45 FPS; se não atingir, relatar o gargalo restante (`renderer.info`) para a F1-10b.

## Relatório (≤ 25 linhas)
Branch, commits, o que mudou por item, testes, o que depende de medição local e os números esperados vs obtidos (só local).
