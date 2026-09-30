# F7-00d · Lacaio (trabalhador orc) no pipeline Blender

> **Status: ⏸ ADIADA — modelagem só com Opus, depois do código pronto**

Leia antes: `docs/specs/_COMUM.md`, `CLAUDE.md` (regras de rosto só em +Z e gume para +Z; orçamento ≤ 20 draw calls, texturas ≤ 512²), `tools/blender/README.md` (pipeline F7-00), `tools/blender/build_grunt.py` (**modelo de referência — copie a estrutura**), `docs/08_GAME_DESIGN.md` (Lacaio = trabalhador dos Clãs de Gorthak), referências de arte `docs/reference/modeloorcs.png` e `specs/orc_buildings/00_ORC_ART_DIRECTION_PIPELINE.md`.
Executor: **Opus** (decisão do dono: modelagem 3D nunca com Sonnet/Haiku). Worktree isolada. Porta do vite **5201**. Blender: `/home/rafael/Downloads/blender-5.2.1-linux-x64/blender`.

## Objetivo
Substituir o trabalhador orc procedural (`src/models/units/PeonModel.js`, tipo interno `peon`, 38 meshes) por um `.glb` gerado por script no mesmo estilo e qualidade do Grunt aprovado pelo dono (`public/models/grunt.glb`). O Lacaio é mais baixo e magro que o guerreiro, costas curvadas, avental de couro, cinto de ferramentas, pele verde-oliva, presas pequenas, olhos âmbar, sem armadura pesada.

## "Pronto" (mensurável)
1. `tools/blender/build_peon.py` gera `public/models/peon.glb` (meshopt + WebP, como o Grunt) — ≤ 300 KB.
2. Hierarquia **compatível com o `UnitAnimator` e o `Unit`** (nomes exatos, pivôs nas articulações, repouso em pé com braços pendendo em −Y):
   `Peon > Torso > (Head, ArmL, ArmR > ToolGroup > (Axe, Pickaxe, Hammer)), LegL, LegR, Pack > (WoodBundle, GoldSack)`.
   - `Axe`, `Pickaxe`, `Hammer`, `Pack`, `WoodBundle`, `GoldSack` são nós separados porque o jogo alterna `visible` (veja `src/entities/Unit.js`, `orderGather`/`orderBuild`/`updateCarryingVisuals`, e `ModelFactory.rebindUserData`). Estado inicial igual ao procedural (confira em `PeonModel.js`: qual ferramenta começa visível; `Pack`/carga começam invisíveis).
   - Ferramentas com o **gume/ponta voltado para +Z** na mão direita.
3. **Rosto só na face frontal (+Z)** da cabeça (geometria de olhos/boca/presas na frente; laterais/topo/nuca em pele lisa).
4. ≤ **10 draw calls** no total (2 materiais: atlas + `TeamColor` no avental/faixa), atlas **512²** com cor e AO assados, 2 500–4 000 triângulos.
5. Integração: entrada `peon` em `GLB_MODELS` (`src/entities/glbModels.js`, igual à do `grunt`: `{ url, root: 'Peon', type: 'peon' }`); com `?glb` padrão ligado, o Lacaio do jogo usa o `.glb`; `?glb=0` volta ao procedural. Inspetor ganha "Lacaio (Blender)" ao lado de "Peon (Aldeão Orc)".
6. Todas as animações do `UnitAnimator` funcionam no inspetor (idle, walk, fight, gather com machado e picareta, hurt com flash vermelho, die) e o trabalhador no jogo coleta madeira/ouro mostrando a ferramenta e a carga certas.

## Passos
1. Copie `build_grunt.py` → `build_peon.py` e adapte proporções/partes; reutilize `common.py` (não duplique helpers; se precisar de um helper novo, adicione em `common.py`).
2. Renders Eevee (resolução ≤ 800, amostras ≤ 32) em `tools/blender/renders/peon_{34,front,side,game}.png` e comparação antigo × novo no inspetor (`capture_inspector.mjs`/`compose_compare.py` já existem) em `renders/compare_peon*.png`. **Olhe as imagens e itere** até ficar claramente melhor que o procedural e coerente com o Grunt (mesma paleta de pele, mesmo nível de detalhe).
3. Commits intermediários (`F7-00d wip: ...`) após o primeiro `.glb` válido e após a integração.
4. Atualize a tabela do `tools/blender/README.md` e `docs/03_ASSETS_E_INSPETOR.md`.

## Regras de recurso
- Todo Blender e navegador via `bash /home/rafael/warpoly/tools/safe-run.sh --timeout 600 -- ...` (um processo pesado por vez). Scripts Playwright usam `assertHardwareGpu` (`tools/lib/assertGpu.mjs`). Dev server `timeout 900 npx vite --port 5201 --strictPort`, encerrado ao final. `npm run smoke` já usa safe-run — não aninhe.

## Não fazer
Não editar `GameManager.js`, `UIManager.js`, `src/sim/**`, `src/ai/**`, `src/animation/UnitAnimator.js` (outros agentes: F3-04 economia e NEW-10 animação estão neles). Não mudar nomes de nós nem o modelo procedural.

## Verificação
`npm test`, `npm run lint`, `npx vite build --outDir /tmp/claude-1000/warpoly-build-check`, `npm run smoke`, mais as imagens acima.

## Entrega
Commit final: `F7-00d: Lacaio (trabalhador orc) no pipeline Blender`. Relatório ≤ 20 linhas com métricas antigo × novo (meshes/draw calls, tris, KB) e caminhos das imagens.
