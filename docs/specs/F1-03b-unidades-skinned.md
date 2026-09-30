# F1-03b · Unidades: SkinnedMesh rígido (1 draw call por material na unidade inteira)

> **Status: ✅ PRONTA — DONE (38c013b); meta 50 FPS pendente em NEW-15**

Leia antes: `docs/specs/_COMUM.md`, `CLAUDE.md`, seção "Unidades depois da F1-03" em `docs/03_ASSETS_E_INSPETOR.md`.
Worktree: nova (isolada). Porta do vite: **5188**.

## Por quê
A F1-03 mesclou por osso: a mescla não pode cruzar ossos, então o piso é Σ(ossos × materiais por osso) — knight 41, archer 54, villager 55 draw calls. `combate100` = 32 FPS (meta 50).
Solução: **skinning rígido**. Todas as malhas da unidade que compartilham material viram **uma** `THREE.SkinnedMesh`, cujos "ossos" são os próprios nós-pivô existentes (`Torso`, `ArmL`, `Weapon`…). Cada vértice tem peso 1,0 no seu pivô. O `UnitAnimator` continua girando os mesmos nós — nada muda na animação. Draw calls por unidade ≈ nº de materiais distintos (knight ~14) + nós de visibilidade alternada.

## Contexto de código
- `src/render/mergeUnitTemplate.js` (F1-03): `mergeUnitTemplate(root, {protectedNames})`, `ANIMATED_NODE_NAMES`; reutiliza `bakeGeometry`, `unifyAttributes`, `pruneEmpty` exportados de `src/render/mergeStaticTemplate.js`.
- `src/entities/ModelFactory.js` `getOrCreateModel` (~linha 162) aplica `mergeUnitTemplate` em templates de unidade; `cloneModel(template)` clona com `template.clone(true)`; depois `rebindUserData(clone, type)` (~94).
- **Atenção a clones**: `SkinnedMesh.clone()` do three.js NÃO religa o `Skeleton` aos ossos do clone. Use `SkeletonUtils.clone` de `three/examples/jsm/utils/SkeletonUtils.js` para templates que tenham SkinnedMesh (ou religue manualmente: para cada SkinnedMesh do clone, montar `new THREE.Skeleton(bonesDoClone)` achando cada osso por `name`/uuid-map e chamar `mesh.bind(skeleton, mesh.bindMatrix)`).
- `src/inspector/unitAnimator.js` `bindModel` (~46) guarda `userData.origMaterial` e `setDamageFlash` (~1125) troca `child.material` — funciona em SkinnedMesh, mas o material de flash (`UnitAnimator.sharedHurtMat`) precisa ter suporte a skinning: em three r0.186 o `WebGLRenderer` compila variante skinned automaticamente para `MeshBasic/Standard` — confirme visualmente.
- Material com array (cabeças orc, rosto só em +Z) — trate cada material do array como material próprio ao agrupar (use `geometry.groups` para separar os triângulos por material antes de agrupar).

## Implementação
1. Crie `src/render/skinUnitTemplate.js` com `skinUnitTemplate(root, { toggleNames })`:
   - `bones` = lista ordenada de nós-pivô (raiz primeiro, depois ordem de `traverse`), mesmos critérios de pivô da F1-03 (`ANIMATED_NODE_NAMES` + referências em `root.userData`).
   - **Excluídos do skinning** (continuam malhas normais, filhas do seu nó): subárvores de `toggleNames` = `Axe, Pickaxe, Hammer, Pack, WoodBundle, GoldSack, DrawnArrow, DrawnAxe` (visibilidade alternada), `BowStringTop/Bottom`, malhas transparentes, `SelectionRing`/`HealthBar`.
   - Para cada malha restante: pivô = ancestral pivô mais próximo; geometria assada em **espaço da raiz** (bind pose atual); atributos `skinIndex` = índice do pivô (4 componentes, `[i,0,0,0]`), `skinWeight` = `[1,0,0,0]`.
   - Agrupe por material × castShadow; `mergeGeometries` por grupo → `new THREE.SkinnedMesh(geo, material)`; adicione à raiz; `mesh.bind(new THREE.Skeleton(bones), identidade)` com `bindMatrix` = identidade (geometria já está no espaço da raiz). Garanta `root.updateMatrixWorld(true)` antes do bind para `boneInverses` corretos.
   - `frustumCulled = false` nas SkinnedMesh (bounding sphere do bind pose não acompanha animação) **ou** calcule `computeBoundingSphere` com raio +30%. Preferir o raio ampliado.
   - Remova as malhas originais assadas; `pruneEmpty` sem remover os nós-pivô (eles são os ossos).
2. `ModelFactory.getOrCreateModel`: para templates de unidade com merge ligado, usar `skinUnitTemplate` **no lugar de** `mergeUnitTemplate`; clonar com `SkeletonUtils.clone` quando o template tiver SkinnedMesh. Flag nova `?skin=0` volta ao comportamento da F1-03 (mescla por osso) para comparação; `?merge=0` desliga tudo.
3. Inspetor: mesmo caminho (unidades via skin), respeitando as flags.
4. Não processar `.glb` do Blender.

## Não fazer
- Não editar `Unit.js`, `GameManager.js`, `src/core/FogOfWar.js`, `src/world/**` (outros agentes).
- Não alterar materiais, cores, poses, nomes de nós, animações do `UnitAnimator`.

## Testes (Vitest, `tests/unit/skinUnitTemplate.test.js`)
- Hierarquia sintética (raiz → Torso → ArmR → Weapon; malhas com 2 materiais) vira 2 SkinnedMesh; `skeleton.bones` contém Torso/ArmR/Weapon.
- Girar `ArmR.rotation.z = π/2`, `updateMatrixWorld`, aplicar skinning na CPU (use `mesh.applyBoneTransform(i, v)` do three r0.186) num vértice da mão: posição igual à da versão não-skinned com a mesma rotação (tolerância 1e-4).
- Nó `Axe` (toggle) permanece `Mesh` normal e alterna `visible`.
- Clone via caminho do ModelFactory: girar osso do **clone** move o clone e **não** move o template.
- Material array (6 materiais) → triângulos separados por material, rosto continua só nos triângulos +Z.

## Verificação (números no relatório)
1. Comandos mínimos do `_COMUM.md` (`npm run smoke`/`npm run bench` já usam safe-run — não aninhe).
2. Tabela draw calls por unidade: F1-03 (`?skin=0`) vs F1-03b.
3. `npm run bench -- --scenarios=inicial,combate100,massa300` e com `"--query=skin=0"`. Meta: `combate100` ≥ 50 FPS.
4. Capturas no inspetor (porta 5188, `?texq=low`) `skin=0` vs skin: knight fight, archer fight (corda do arco), villager gather + madeira, peon rosto, ogre hurt (flash vermelho), qualquer unidade em `die`. Pasta `tools/merge-compare/skinned/`. **Olhe as imagens**: nada pode "esticar", sumir ou ficar para trás durante as animações.
5. Jogo: 2 unidades do mesmo tipo animando fora de fase (uma andando, outra atacando) — confirme que não compartilham pose (bug clássico de clone de SkinnedMesh).

## Docs
`docs/03_ASSETS_E_INSPETOR.md`: tabela depois da F1-03b e explicação do skinning rígido.

## Entrega
Mensagem de commit: `F1-03b: unidades como SkinnedMesh rígido (1 draw call por material)`.
