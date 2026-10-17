# NEW-14 · CPU de animação e simulação por unidade (o que falta depois da F1-09)

> **Status: SPEC (só documento).** Leia antes: `docs/specs/_COMUM.md`, `CLAUDE.md`, `docs/historico/HANDOFF_CLOUD.md` (seção 2), `docs/specs/F1-09-tick-fixo-lod-animacao.md`.
> Branch do executor: `task/NEW-14` (local) ou `cloud/NEW-14-<passo>` (passos "nuvem"). Porta do vite: **5192**.
> Conflito conhecido: `src/render/UnitView.js` está em edição local (NEW-53, `docs/historico/HANDOFF_CLOUD.md` §2). **Os passos que tocam o UnitView só começam depois que o NEW-53 for mesclado.**

## 1. Objetivo medido

Problema original (TASKS.md, NEW-14): `Unit.update` ~4,5 ms com 310 unidades (massa300); animação procedural de toda unidade todo frame.

**Métricas** (ms por quadro renderizado, médias da janela do bench, `?bench=` / `npm run bench`):
- `sim ms/frame` = tempo de `gm.advance` (já exposto como `gameUpdateMs.avg`, `src/debug/bench.js:280-282`). É a CPU de **simulação** (0..N ticks de 20 Hz por quadro).
- `views ms/frame` = tempo de `EntityViews.update` (UnitView + animator; chamado em `MatchSession._presentFrame`, `src/core/MatchSession.js:260`). É a CPU de **animação/render por unidade**. **Hoje NÃO é medida**: o bench só intercepta `advance` (`bench.js:222-233`). O passo 0 cria a métrica; sem ela nenhum outro passo pode ser aceito.
- Complementares: chamadas a `animator.update` por quadro, trocas de material do flash por quadro, FPS médio e 1% low.

**Números disponíveis** (`docs/TASKS.md`, `tools/bench/BASELINE.md`): massa300 `sim ms/frame` 5,3 → **3,6 ms** com a F1-09; massa300 ~17 FPS e combate100 ~54 FPS depois de F1-03b/NEW-38. No baseline de 2026-09-28 o frame de massa300 era 620 ms contra 7 ms de `update`: o gargalo global é a submissão de draw calls (NEW-15), não esta CPU. **Meta realista**: a fatia de CPU de animação+sim é de poucos ms num frame de ~58 ms (massa300); não prometa ganho de FPS maior que ~5% em massa300 e ~3% em combate100. Metas aceitáveis:
- `views ms/frame` massa300 (câmera zoom 1,8 do cenário) **−35%** sobre o valor medido no passo 0;
- `sim ms/frame` massa300 **não regride** (≤ 3,6 ms); ≤ 3,0 ms só se o passo 6 entregar;
- combate100 (quase tudo em tela e a < 60 u, LOD quase não atua): `views ms/frame` sem aumento; ganho vem dos passos 1, 5.

**A medição é LOCAL, com GPU real**: `bash /home/rafael/warpoly/tools/safe-run.sh --timeout 600 -- node tools/bench/run-bench.mjs --scenarios=combate100,massa300` (é o que `npm run bench` faz), 3 execuções antes e 3 depois, mediana; conferir `env.gpu.renderer` (abortar se SwiftShader/llvmpipe). A nuvem não mede nada disto.

## 2. Estado atual (levantado no código)

### 2.1 CPU de simulação (tick fixo 20 Hz) — entregue pela F1-09
- `MatchSession.update` → `gm.advance(delta)` (`src/core/MatchSession.js:229`): acumulador, `SIM_DT = 0,05`, `MAX_STEPS = 8` (`src/sim/constants.js`). `Unit.update` (`src/sim/Unit.js:1142`) é dado puro: não toca no animador (o estado só pede `_setAnim` → `u.anim`).
- O que ainda custa por tick, por unidade:
  - **Varredura de alvo em idle**: `updateIdle` (`Unit.js:1538`) chama `findNearestHostile(…, aggroRange)` **todo tick** para toda unidade de combate ociosa; cada chamada faz até 3 consultas ao grid (`findNearestHostileCombatUnit` `:2388`, `findNearestHostileUnit` `:2400`, torres e construções no `blockerGrid` `:2438-2447`) com closures alocadas por chamada. Idem `updateAttackMoving` (`:1586`), `updatePatrolling` (`:1604`), `updateHolding` (`:1566`, usa `attackRange`).
  - **Steering/separação** ao andar: `_steerStep` (`:1736`) faz `unitGrid.queryRadius` e monta `nb` com **um objeto novo por vizinho** por tick (`:1746`); `_settleSlack` (`:1718`) faz outra consulta.
  - **Pathfinding**: `requestPath` (`:521`) é assíncrono com orçamento de A* por passo (F1-07, `GameManager.js` ~1736); re-path por travamento (`_stuckT`, `:1655-1695`, máx. 8). Custo limitado e raro: **fora do escopo**.
  - Reaquisição em combate (`updateAttacking` `:2119`, `retargetRange`, `threatScanRange` `:2159`).
- O `SpatialGrid` (F1-06) já eliminou o O(N²).

### 2.2 CPU de animação/render (por quadro): `EntityViews` → `UnitView.update`
- `EntityViews.update` (`src/render/EntityViews.js:96-125`) monta o frustum **uma vez por quadro** e chama `UnitView.update(frameDelta, ctx)` para **todas** as views de `gm.allUnits` (`_sync`, linhas 80-85). Árvores/minas só ressincronizam a cada 30 quadros.
- `UnitView.update` (`src/render/UnitView.js:~264-410`), em ordem, **para toda unidade, inclusive fora da tela**:
  1. LOD (`:277-304`): fora do frustum/névoa → `lodStep = 0`, acumula `_animAcc` (≤ 0,5 s); dentro → `animationLodStep(dist, frameIndex, id)` (≤ 60 u todo quadro; 60-100 a cada 2; > 100 a cada 4), entregando o delta acumulado (`animDelta = frameDelta × k`): sem câmera lenta, só pose em degraus.
  2. `root.position.lerpVectors` + `lerpAngle` (`:307-308`): **sempre**.
  3. Invisibilidade, anel de seleção, `syncOutline` (`:329`), barras de vida/mana com `camera.quaternion` (`:331-353`), ferramenta/carga/resets, esteira de navio: tudo **antes** de decidir se anima, e a esteira usa `_shown()` (névoa), não o frustum.
  4. Morte (`:384-393`) e ataque contínuo (`:397-405`: `advanceBlend` + `setTime(t, true)`).
  5. Demais: `animator.update(animDelta * lodStep)` (`:407`).
- `UnitAnimator.update` (`src/animation/UnitAnimator.js:338`): `advanceBlend`, `_tickIdle`, `applyPose(time, true)`. **Custo por chamada** (`_applyPoseRaw` `:374`, `resetTransforms` `:205`, `_applyBlend` `:261`):
  - `resetTransforms` roda **a cada pose**: `Object.entries(this.meshParts)` (`:212`, **aloca um array e N pares por chamada**), `baseTransforms.get(key)` (Map) por parte, 3 `copy` por parte, `updateBowString(0)`, `setDamageFlash(false)` (retorno rápido se já falso).
  - O ramo de pose (`applyIdle/Walk/Fight/...`) refaz todas as rotações mesmo para idle; ainda `applyTentacles`, mochila e cajado.
  - `_applyBlend` (`:261`) sai na primeira linha quando `_blendT >= BLEND_DURATION` (0,14 s); `advanceBlend` (`:274`) é um `if`. Com w=1 o custo já é ~zero. O laço roda só nos 0,14 s após cada `setAnimation`, sobre `_blendObjs`/`_blendFrom` pré-alocados.
  - `setDamageFlash` (`:1584`) faz `model.traverse` + troca de material em todo mesh a cada transição. `applyHurt` liga o flash (`:~1424`), e o `resetTransforms` do quadro seguinte desliga: dois traversals por quadro durante o hurt (confirmar com o contador do passo 0).
- Matrizes: **nenhum `matrixAutoUpdate`** no `src/` (grep vazio). Com `SkinnedMesh` rígido (F1-03b), `scene.updateMatrixWorld` do renderer recompõe a matriz local de **todo** osso/parte de **toda** unidade, mesmo congelada. Esse custo está **dentro de `renderer.render`**, não em `EntityViews.update`: invisível ao "views ms".
- **Pose congelada para unidade parada e longe não existe**: idle a 70 u continua aplicando `applyIdle` a cada 2 quadros.

### 2.3 O que a F1-09 já fez (não repetir)
Tick fixo + `advance/simStep/renderUpdate`; interpolação prev→sim; LOD por frustum (esfera r=3), por `mesh.visible`/névoa e por distância (3 faixas espalhadas por id); `_animAcc`; ataque contínuo; morte. Testes: `tests/unit/fixedStep.test.js`, `animationLodStep` como função pura. **Não existe teste de contagem de chamadas a `animator.update`.**

## 3. Candidatos ordenados por ganho/risco

| Cand. | O quê | Ganho | Risco | Decisão |
|---|---|---|---|---|
| C0 | Métrica `views ms` + contadores | habilita o resto | nulo | fazer (passo 0) |
| C1 | `resetTransforms` sem alocação (item d) | médio: tira array e pares por pose | muito baixo | fazer (passo 1) |
| C2 | Taxa menor para idle + pose congelada longe (item a) | médio-alto em massa300 | médio (pop visual) | fazer (passos 2-3) |
| C3 | Curto-circuito fora da tela/névoa no `UnitView` (item b) | médio-alto com exército espalhado | baixo-médio (buracos 3.3) | fazer (passo 4) |
| C4 | Flash de dano sem traverse duplo | baixo (só combate) | baixo | fazer (passo 5) |
| C5 | Menos alocação nas consultas da sim (sem mudar semântica) | baixo-médio na sim | baixo (checksum igual) | fazer (passo 6) |
| C6 | `matrixAutoUpdate=false` em pose congelada (item c) | médio, só aparece em `renderer.render` | médio | local, atrás de flag (passo 7) |
| C7 | Blend F7-06 com w=1 (item e) | ~0 (já tem saída precoce) | — | **não fazer** |
| C8 | Varredura de alvo escalonada por id (item f) | médio na sim | **alto**: muda o checksum | opcional, só com decisão do dono (passo 8) |
| C9 | Worker/VAT (item g) | alto a longo prazo | muito alto | **descartar** |

### 3.1 C1: `resetTransforms` sem alocação
Em `UnitAnimator`, onde `storeBaseTransform` roda (`:172-178`), montar uma vez listas paralelas (`_resetObjs`, `_resetPos`, `_resetRot`, `_resetScale`) e iterar com `for` indexado; manter `baseTransforms` (Map) para quem o usa fora (inspetor, testes). Pose **bit a bit igual** à de antes (teste 4.1).

### 3.2 C2: idle em taxa menor e pose congelada longe
- Nova função pura em `src/sim/constants.js`, ao lado de `animationLodStep`: `animationLodStepV2(distance, frameIndex, id, anim)`:
  - `idle`: 0-60 u → 1 em cada 2 quadros; 60-100 → 1 em 4; 100-140 → 1 em 8; > 140 (`IDLE_FREEZE_DIST`) → 0 (congelada). O balanço de idle é lento, mas abaixo de ~30 Hz seria visível de perto: por isso só 15-30 Hz perto, mais longe só quando longe.
  - `walk|fight|gather|cast`: mantém as faixas da F1-09 (1/2/4): não alterar o ritmo de passos.
  - `die|hurt`: sempre 1.
- Pose congelada: sem `animator.update`/`applyPose`; ao voltar de > 140 u, entregar `_animAcc`.
- **Blend nunca pulado**: `advanceBlend` continua com o delta acumulado e, se `_blendT < BLEND_DURATION`, forçar `lodStep = 1` (0,14 s, custo trivial); senão o fade trava no meio.
- Parâmetros em `constants.js` (são de render, não balanceamento), flag `?animlod=0` volta ao comportamento da F1-09 para A/B.

### 3.3 C3: curto-circuito fora da tela/névoa em `UnitView.update`
Pular lerp, billboard, hp bars e outline quando `lodStep === 0` e a unidade já estava fora no quadro anterior (`_wasOffscreen`); ao reentrar, rodar o caminho completo no mesmo quadro (o lerp usa `_prevPos/_simPos`, sem estado acumulado: sem pop). **Buracos a tratar**:
1. Selecionada fora da tela: chamar `resetOutline` **na transição**, não a cada quadro.
2. Morte fora da tela: `_deathSinkOffset += animDelta*0.35` com `animDelta = 0` é no-op; ao reaparecer o `_animAcc` (≤ 0,5 s) cobre.
3. **Flash de dano**: se a unidade sai da tela com `isHurtFlashing`, o material fica em `hurtMat` até voltar: aceitável; conferir que não vaza.
4. Ferramentas/carga (`_applyTool/_applyCarry`, `:~356-366`): **manter fora** do curto-circuito (3 comparações), para não perder troca de modelo.
5. **Ferramentas e inspetor**: `ctx.lodFrustum` é `null` sem câmera (`EntityViews.js:~104-108`); nesse caso **nunca** curto-circuitar. Conferir `tools/capture-anim.mjs`, `tools/visual-regress.mjs`, inspetor e `?bench` (câmera livre).
6. **Navios**: a esteira (`:358-373`) testa só `_shown()` e emite partículas fora da tela; usar o mesmo flag (ganho pequeno de partículas).
7. Névoa (`fogHidden`): já é `lodStep = 0`.
8. **Sombras**: unidade fora do frustum principal pode projetar sombra visível; **não** esconder `root.visible` por frustum próprio (o three já faz culling). Só pular trabalho; a pose congelada continua visível na sombra.
O teste de frustum com `root.position` do quadro anterior é aceito pela F1-09; manter.

### 3.4 C4: flash de dano sem traverse duplo
Decidir o flash do quadro uma única vez (`_flashWanted` calculado em `applyHurt`, aplicado ao fim de `applyPose`) e guardar a lista de meshes do modelo no `bind` (junto de `origMaterial`, `:160-164`) em vez de `model.traverse`. Mesmo resultado visível; `flashSwaps` por golpe cai.

### 3.5 C5: alocação nas consultas da sim (sem mudar semântica)
Em `src/sim/Unit.js`: predicados estáticos em vez de closures por chamada (`:2394, 2409, 2438, 2445`) e pool de objetos para `nb.push({…})` (`:1746`). **Checksum idêntico** (`node tools/headless-match.js --seed 1` + `determinism.test.js`). Só se `sim ms/frame` massa300 continuar > 3,0 ms depois dos demais.

### 3.6 C6: `matrixAutoUpdate=false` (local, atrás de flag)
Para as partes de `_blendObjs` e o `model` de uma unidade com pose congelada: `updateMatrix()` uma vez, depois `matrixAutoUpdate = false`; reativar ao voltar a animar. A raiz do UnitView mantém `matrixAutoUpdate = true` (anda). Ganho aparece no frame time, não em `views ms`. **Descartar se ganho < 2% em massa300.** Risco: `matrixWorld` desatualizado nos ossos do `SkinnedMesh` quando o pai anda; testar movendo a raiz com partes congeladas.

### 3.7 C7: blend F7-06 com w=1 — não fazer
`_applyBlend` (`UnitAnimator.js:261`) já retorna quando `_blendT >= BLEND_DURATION`; `advanceBlend` é um `if`. Registrar no relatório e não mexer (há `tests/unit/unitAnimatorBlend.test.js`).

### 3.8 C8: varredura escalonada por id — ALTO RISCO, opcional
Em `updateIdle/AttackMoving/Patrolling/Holding` só chamar `findNearestHostile` quando `(tick + id) % K === 0` (K = 2 ou 3), com resposta imediata se houve dano recente. É a maior fatia que sobra na sim, mas **muda comportamento e checksum** (reação até K·50 ms mais tarde) e mexe em `src/sim/Unit.js`. Exige decisão do dono, nova baseline de checksum (diferente do atual e **igual entre duas execuções**), `determinism.test.js`, `simCommandsChecksum.test.js`, `headlessMatch.test.js` verdes. Não misturar com os outros passos.

### 3.9 C9: worker/VAT — descartar
- **Worker**: a pose escreve `position/rotation/scale` de objetos three.js na thread principal; mover exige `SharedArrayBuffer` (isolamento de origem no host) e copiar matrizes de volta todo quadro; com ~300 unidades × ~10 partes a sincronização consome o ganho.
- **VAT/instancing por tipo** pertence ao **NEW-15** (atlas de material + instancing, depois da migração Blender F7-00b); fazê-lo agora duplicaria trabalho e quebraria `UnitAnimator`/`rebindUserData` (nós nomeados). Reavaliar dentro do NEW-15.

## 4. Plano em passos pequenos (um commit cada: `NEW-14 passo N: …`)

Cada passo passa `npm test` e `npm run lint`.

| Passo | Cand. | Arquivos | Onde |
|---|---|---|---|
| 0 | C0 | `src/debug/bench.js`, `src/animation/UnitAnimator.js` (stats estáticos), `tools/bench/run-bench.mjs` (imprimir `viewsMs`), `tests/unit/animStats.test.js` | código na nuvem; baseline "antes" local |
| 1 | C1 | `src/animation/UnitAnimator.js`, `tests/unit/unitAnimatorReset.test.js` | nuvem |
| 2 | C2 (função pura + flag) | `src/sim/constants.js`, `tests/unit/animLod.test.js` | nuvem |
| 3 | C2 (uso no `UnitView`, blend nunca pulado) | `src/render/UnitView.js` (**após NEW-53**) | código na nuvem, visual local |
| 4 | C3 | `src/render/UnitView.js` (**após NEW-53**), `src/render/postfx/outlineLayer.js` se necessário | código na nuvem, visual local |
| 5 | C4 | `src/animation/UnitAnimator.js` | nuvem |
| 6 | C5 | `src/sim/Unit.js` | nuvem; checksum idêntico |
| 7 | C6 | `src/animation/UnitAnimator.js`, `src/render/UnitView.js` | só local |
| 8 | C8 | `src/sim/Unit.js` | só com aprovação do dono, local |

### 4.1 Testes Node possíveis (nuvem, Vitest)
- **Função pura** `animationLodStepV2`: tabela distância × animação; em 8 quadros consecutivos, idle 0-60 chama 4, 60-100 chama 2, 100-140 chama 1, > 140 chama 0; `walk/fight` iguais à F1-09; `die/hurt` 8/8; com 8 ids consecutivos, exatamente 1 chama por quadro nas faixas > 60 (carga espalhada).
- **Contagem de chamadas a `animator.update` por quadro com N unidades** (teste central): `EntityViews`/`UnitView` com N=300 entidades mínimas (`_prevPos/_simPos`, `anim`, `mesh`) e modelos de `THREE.Group`+`Mesh` (como em `unitAnimatorBlend.test.js`), `animator.update` espionado (`vi.fn`), câmera perspectiva, 120 quadros: (a) todas em tela e a < 60 u e andando → 300 chamadas/quadro; (b) metade atrás da câmera → 0 chamadas nelas e `_animAcc` cresce até 0,5 s; (c) idle a 150 u → 0 chamadas depois do primeiro quadro; (d) ao reaparecer, `animDelta = frameDelta + _animAcc` (≤ 0,5 s) e `_animAcc = 0`; (e) sem câmera (`lodFrustum = null`) → todas animam (caminho do inspetor).
- **Igualdade de pose após LOD**: duas cópias do animador por 2 s simulados, uma com `update(dt)` por quadro e outra com `update(2dt)` a cada 2 quadros: nos quadros em que ambas acabaram de animar, as transformações das partes são iguais (tolerância 1e-9) para walk/gather/fight e para idle com `setSeed` fixo.
- **Passo 1**: pose idêntica **bit a bit** à implementação antiga (cópia no teste) para todas as animações × tipos (aldeão, soldado, arqueiro, mago, ogro, aéreo, navio).
- **Blend**: `_blendT` chega a `BLEND_DURATION` mesmo se a unidade ficar fora da tela durante o fade; nenhum quadro de pose antiga ao reaparecer.
- **Flash**: `flashSwaps` ≤ 2 por golpe (antes ≥ 2 por quadro durante o hurt).
- **Determinismo** (passos 0-6, obrigatório): `npm test` (inclui `determinism.test.js`, `headlessMatch.test.js`, `simCommandsChecksum.test.js`) e `node tools/headless-match.js --seed 1` com o **mesmo** checksum antes e depois. Passos 0-5 não tocam `src/sim`/`src/ai` (exceção: função pura de render em `src/sim/constants.js`); o passo 6 toca `src/sim/Unit.js` e exige checksum idêntico.

### 4.2 Só se verifica local (GPU real)
- Bench (via `tools/safe-run.sh`): `viewsMs`, FPS e 1% low antes/depois para `combate100` e `massa300` (3 execuções, mediana); `inicial` sem regressão; `renderer.info.render.calls` **igual** (nenhum passo muda submissão).
- Visual (jogo **e** inspetor, regra do CLAUDE.md): idle perto sem gagueira; formação marchando sem pop ao cruzar 60/100 u; pan rápido da câmera (unidade que sai e volta não salta de pose); morte, flash, ataque contínuo, coleta e cajado do mago normais; barcaça com esteira só dentro da tela; contorno de seleção some/volta. Capturas em `tools/ui-captures/new14/` com `?animlod=0` × padrão.

### 4.3 Riscos
- **Pop de animação** ao congelar/baixar taxa: mitigar com delta acumulado (modelo da F1-09), nunca pular durante blend/hurt/die, flag `?animlod=0`.
- **Determinismo**: a animação usa `createRenderRng(seed)` próprio (`animMath.js`), fora do checksum; pular quadros só muda quando a variante de idle dispara (visual). Passos 0-5 não podem alterar o checksum; 6 idem; 8 muda (decisão do dono).
- **Conflitos de arquivo**: `UnitView.js` (NEW-53) e `src/ai/**` (NEW-44) em edição local.
- **Sombra/frustum**: ver 3.3 item 8.
- **Nuvem sem WebGL**: os testes usam `THREE.Group`/`Mesh` sem renderer.

## 5. Ordem recomendada
1. Passo 0 (métrica) e baseline local "antes".
2. Passos 1 e 5 (`UnitAnimator`, baixo risco), depois passo 2 (função pura + testes).
3. Passos 3 e 4 (`UnitView`) após o merge do NEW-53, medindo local a cada um.
4. Passo 6 se `sim ms/frame` massa300 ainda > 3,0 ms.
5. Passo 7 só se `renderer.render` justificar; descartar se < 2%.
6. Passo 8 só com aprovação explícita. C7 não fazer; C9 descartado.

## 6. Nuvem × local
- **Nuvem** (sem GPU/navegador, `docs/historico/HANDOFF_CLOUD.md` §2): código e testes dos passos 0-6 (`npm ci && npm test && npm run lint && npx vite build --outDir /tmp/build-check`). Tudo de desempenho/visual vai no relatório como **"Verificação pendente (local)"** com os comandos de 4.2. Branches `cloud/NEW-14-<passo>`, PR para `master`, sem merge.
- **Local**: baselines "antes"/"depois" do bench, conferência visual (jogo e inspetor), passo 7, decisão do passo 8, atualização de `docs/TASKS.md` (status/resultado) e `docs/01_ARQUITETURA.md` (LOD de animação: faixas por animação, `?animlod=0`, métrica `viewsMs`).

## 7. Não fazer
Não alterar `src/sim`/`src/ai` nos passos 0-5; não mudar números de jogo; não renomear nós (`Torso`, `ArmL`, `Sword`…); não mexer em `ModelFactory`/shaders; não introduzir worker/VAT; não esconder malha por frustum próprio.

## 8. Relatório esperado (≤ 25 linhas)
Branch e hash por passo; tabela antes/depois (`views ms`, `sim ms/frame`, FPS, 1% low, `animUpdates/frame`, `flashSwaps/frame`) em `combate100` e `massa300`, marcada **"Verificação pendente (local)"** quando feita na nuvem; resultado de `npm test`, `npm run lint`, `vite build`; checksum de `node tools/headless-match.js --seed 1` antes/depois (idêntico nos passos 0-6); passos feitos/pulados e por quê (C7, C9); capturas; riscos residuais (pop visual, sombra); desvios da spec.
