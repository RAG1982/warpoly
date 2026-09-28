# F1-03 · Unidades: mesclar partes rígidas por "osso"

Leia antes: `docs/specs/_COMUM.md`, `CLAUDE.md`, `docs/03_ASSETS_E_INSPETOR.md`.
Worktree: nova (isolada). Porta do vite: **5186**.

## Objetivo e "pronto"
Unidades procedurais custam 25–154 draw calls cada (arqueiro 154, aldeão 129, bandido 145, cavaleiro 83). Com 110 unidades o bench `combate100` roda a ~23 FPS / ~8 600 draw calls.
**Pronto quando**: toda unidade procedural ≤ 15 draw calls (sem contar anel de seleção e barra de vida), animações idênticas, e `combate100` ≥ 50 FPS na RX 7600 XT (informe também `massa300`).

## Contexto de código (reuse, não reinvente)
- `src/render/mergeStaticTemplate.js:36` — `mergeStaticTemplate(root, options)` já faz: agrupar por material × castShadow, `bakeGeometry` com matriz relativa à raiz, `unifyAttributes`, `pruneEmpty`, proteção por `keep`/`keepPrefixes`/`userDataRefs`. **Opera relativo à RAIZ** — para unidades você precisa mesclar **relativo a cada nó animado**.
- `src/render/staticTemplates.js` — config por tipo e flag `?merge=0` (`isStaticMergeEnabled()`).
- `src/entities/ModelFactory.js:162` — `getOrCreateModel(key, generatorFn, type)`: cria template (hoje chama `prepareStaticTemplate(key, ...)`, que ignora unidades), clona com `cloneModel` e chama `rebindUserData(clone, type)` (linha 94). `createUnit(type)` na linha 391.
- `src/inspector/unitAnimator.js:46` — `bindModel` pega nós por `userData` ou `getObjectByName`: `Torso, Head, ArmL, ArmR, LegL, LegR, Sword, ShieldGroup, Bow, Weapon, ToolGroup, Axe, Pickaxe, Hammer, Pack, WoodBundle, GoldSack, Plume, DrawnArrow, WeaponL, WeaponR, DrawnAxe, Horn, Mohawk` e `updateBowString` (cordas `BowStringTop/Bottom`). Linha 86: guarda `userData.origMaterial` de cada mesh; linha ~1125 `setDamageFlash` troca `child.material` inteiro (funciona com material array).
- `src/entities/Unit.js:263-291, 748-752` — alterna `visible` de `axe/pickaxe/hammer`; `updateCarryingVisuals` alterna `pack/woodBundle/goldSack`.
- Cabeças dos orcs (Peon/Grunt/Axethrower/Ogre `*Model.js`) usam **material array de 6** (rosto só na face +Z). `mergeStaticTemplate` hoje pula material array.
- `.glb` do Blender (`src/entities/glbModels.js`, `?glb=1`) já é otimizado: **não** processar.

## Implementação
1. Crie `src/render/mergeUnitTemplate.js` exportando `mergeUnitTemplate(root, { protectedNames })`:
   - Conjunto de **nós-pivô** = raiz + todo nó cujo nome esteja em `ANIMATED_NODE_NAMES` (lista acima, exporte-a) + nós referenciados em `root.userData`.
   - Para cada nó-pivô P: colete as malhas cujo **pivô mais próximo acima** (ancestral mais próximo que seja pivô) é P. Mescle-as por material × castShadow com a matriz relativa a P (`P.matrixWorld⁻¹ × mesh.matrixWorld`) e adicione o resultado como filho de P. Remova as originais.
   - Nós de visibilidade alternada (`Axe, Pickaxe, Hammer, Pack, WoodBundle, GoldSack, DrawnArrow, DrawnAxe, Plume`) **são pivôs** (mescla interna), para que `visible` continue funcionando no nó.
   - `BowStringTop/Bottom`: nunca mesclar (são reposicionados por `updateBowString`).
   - Material array: suporte mesclando **grupos** — use `mergeGeometries(geos, true)` com `groups` e mantenha o array de materiais, ou trate a malha com array como grupo próprio (1 draw call por material do array). Não pode perder o rosto só na frente.
   - Reutilize funções internas de `mergeStaticTemplate.js` (exporte `bakeGeometry`, `unifyAttributes`, `pruneEmpty` se necessário; não duplique código).
2. Em `ModelFactory.getOrCreateModel`, quando o template for de unidade (`type` informado) e `isStaticMergeEnabled()` e não vier de glb, aplique `mergeUnitTemplate` ao template **uma vez**, antes de cachear. Mudança máxima de ~5 linhas em ModelFactory.
3. `origMaterial`: como o `bindModel` roda por clone e grava `origMaterial` do clone, nada a fazer — mas verifique que o flash vermelho funciona e restaura corretamente (inclusive cabeças com array).
4. Inspetor (`src/inspector/inspector.js`): se ele cria unidades por caminho próprio (sem `getOrCreateModel`), aplique a mesma mescla para que "Componentes" reflita o custo real; `?merge=0` mostra o original.

## Não fazer
- Não editar `Unit.js`, `GameManager.js` (outro agente, F1-06, está neles). Se inevitável: ≤ 2 linhas, no relatório.
- Não editar `src/core/FogOfWar.js`, `src/world/**` (F1-05 em andamento).
- Não mudar poses, escalas, nomes de nós, materiais ou cores.

## Testes (Vitest, `tests/unit/mergeUnitTemplate.test.js`)
- Hierarquia sintética: raiz → Torso → (ArmR → Weapon com 3 malhas; 4 malhas soltas no Torso) → mescla resulta em 1 malha por material em cada pivô; pivôs mantêm `position/rotation` originais; `getObjectByName('Weapon')` ainda existe.
- Nó `Axe` com `visible=false` continua existindo e invisível após a mescla.
- Malha com material array (6 materiais) preserva `groups` e o array.
- Posição de mundo de um vértice conhecido idêntica antes/depois (tolerância 1e-5).

## Verificação (números obrigatórios no relatório)
1. Comandos mínimos do `_COMUM.md`.
2. Tabela draw calls por unidade antes/depois (knight, archer, villager, bandit, peon, grunt, axethrower, ogre) — medir contando malhas visíveis do clone.
3. Bench via safe-run: `npm run bench -- --scenarios=inicial,combate100,massa300` e `npm run bench -- --scenarios=combate100 "--query=merge=0"`.
4. Capturas no inspetor (via safe-run, porta 5186, `?texq=low`), `merge=0` vs mesclado, em `tools/merge-compare/units/`: knight (fight), archer (fight com arco tensionado), villager (gather + carregando madeira), grunt e ogre (fight e hurt/flash vermelho), peon (rosto só na frente). **Olhe as imagens**; nenhuma peça pode sumir, mudar de lugar ou deixar de animar.

## Docs
`docs/03_ASSETS_E_INSPETOR.md`: tabela de draw calls por unidade depois da F1-03.

## Entrega
Mensagem de commit: `F1-03: mesclagem de partes rígidas das unidades por osso`.
