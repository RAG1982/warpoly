# 03 — Assets 3D, Texturas e Inspetor

## Inspetor 3D (`/inspector.html`)

- Catálogo de **120 entradas** (F7-00b limpeza: as versões procedurais dos itens migrados saíram; ficam as "(Blender)" e os procedurais que restam) com busca e filtros (Unidades, Edifícios, Orcs, Ambiente).
- Pedestal, grade, wireframe, presets de luz (Estúdio, Dia…), tela cheia.
- Unidades: animações `Idle, Caminhando, Lutando, Coletando, Recebendo Golpe, Caindo`, linha do tempo, velocidade 0.25×–2×.
- Construções: pré-visualização dos VFX customizados (forjas, chiqueiro etc.).
- Painel de estatísticas: triângulos, vértices, componentes, materiais, bounding box, arquivo-fonte. "Componentes" conta as malhas já mescladas/skinadas (F1-02 construções/decorações, F1-03b unidades); `inspector.html?merge=0` mostra o modelo original, `?skin=0` mostra a mescla por osso da F1-03 (sem skinning). Para unidades com `SkinnedMesh`, a caixa (bounding box) exibida usa a geometria em bind pose — pode ficar levemente diferente da silhueta animada em poses fora do idle (cosmético, não afeta o desenho).
- API de debug: `inspectorApp.selectModel('<id>')`, `inspectorApp.currentModelObject`.

## Medição por modelo (2026-09-28)

`m` = meshes (≈ draw calls por instância, ×2 com sombra), `t` = triângulos, `mat` = materiais, `tex` = texturas.

### Unidades
| Modelo | Meshes | Tris | Mat | Tex |
|---|---|---|---|---|
| knight | 83 | 1 512 | 14 | 36 |
| archer | 154 | 3 188 | 16 | 32 |
| villager | 129 | 3 384 | 19 | 44 |
| bandit | 145 | 2 388 | 17 | 36 |
| peon | 38 | 652 | 11 | 27 |
| grunt | 35 | 492 | 9 | 16 |
| axethrower | 27 | 328 | 6 | 10 |
| ogre | 25 | 284 | 7 | 15 |

**Disparidade de fidelidade**: unidades orcs têm 3–5× menos detalhe que as humanas. O Ogro (unidade mais cara) é o modelo mais simples.

### Construções
| Modelo | Meshes | Tris | Mat | Tex |
|---|---|---|---|---|
| great_hall | 740 | 13 734 | 14 | 25 |
| castle | 487 | 7 708 | 14 | 33 |
| farm | 471 | 7 622 | 13 | 28 |
| orc_barracks | 411 | 4 774 | 13 | 24 |
| watchtower | 291 | 4 842 | 12 | 22 |
| bandit_camp | 285 | 5 476 | 35 | 14 |
| gold_mine | 221 | 5 502 | 17 | 22 |
| orc_house | 216 | 3 252 | 10 | 21 |
| lumber_camp | 212 | 3 628 | 14 | 31 |
| stone_quarry | 183 | 3 968 | 9 | 16 |
| orc_watchtower | 179 | 3 702 | 12 | 17 |
| pig_farm | 167 | 2 869 | 22 | 17 |
| barracks | 149 | 2 254 | 18 | 16 |
| cottage | 146 | 2 656 | 19 | 28 |
| orc_lumber_mill | 140 | 1 930 | 9 | 14 |
| orc_forge | 66 | 910 | 14 | 18 |
| forge | 52 | 1 214 | 8 | 10 |

### Construções depois da F1-02 (mesclagem estática, 2026-09-28)

Templates de construções, depósitos, acampamento e decorações não instanciadas são mesclados uma vez por tipo no `ModelFactory` (`src/render/mergeStaticTemplate.js` + configuração por tipo em `src/render/staticTemplates.js`); o inspetor aplica a mesma mescla. `?merge=0` desliga (jogo e inspetor) para comparar. Unidades, árvores, flecha e seixos **não** são mesclados.

`draw calls` = malhas da construção (`fullMesh`, sem anel de seleção/andaime/VFX criados em tempo de execução) = chamadas por instância no passe principal. Triângulos idênticos antes/depois.

| Modelo | Antes | Depois | Preservado (não mesclado) |
|---|---:|---:|---|
| great_hall | 733 | **20** | `Anim_WarBanners`, `Anim_WarBanner_0/1` (conteúdo de cada estandarte mesclado por material dentro do nó) |
| castle | 487 | **19** | — |
| farm | 471 | **16** | — |
| orc_barracks | 404 | **20** | `Anim_TrainingDummy`, `Anim_WarBanner_0/1` (mesclados por dentro) |
| watchtower | 291 | 16 | — |
| bandit_camp | 285 | 46 | grupo de chamas (`userData.flame`, com `onBeforeRender`) e `fireLight`; 35 materiais |
| gold_mine | 221 | 22 | lampião (PointLight) |
| lumber_camp | 212 | 19 | lampião (PointLight) |
| orc_house | 209 | 8 | — |
| stone_quarry | 183 | 15 | — |
| orc_watchtower | 170 | 12 | — |
| barracks | 149 | 21 | tochas (PointLight) |
| cottage | 146 | 25 | vidro/fumaça transparentes (19 materiais) |
| orc_lumber_mill | 133 | 10 | `Anim_SawBlade` (mesclada por material dentro do nó; continua girando) |
| pig_farm | 130 | 16 | porcos são criados em tempo de execução |
| orc_forge | 55 | 14 | chamas/luz criadas em tempo de execução |
| forge | 45 | 16 | `FurnaceFlames`, `AnvilFlames` (cones animados um a um) |

Decorações: berry_bush 67 → 5 · flower_patch ~190 → 9 · mushroom_stump 37 → 10 · water_lily 35 → 5 · boulder 11 → 2 · grass_tuft 16 → 2.

Regras da mescla: agrupa por material × `castShadow` (a regra de sombra por tamanho da F1-04 roda antes, no gerador); `receiveShadow` vira "OU" do grupo; peças sem sombra que somam ≤ 25 % dos triângulos do grupo com sombra do mesmo material entram nele (custo zero de draw call). Ficam de fora: nós da lista `keep`/prefixo `Anim_`, referências em `userData`, nós com `onBeforeRender`, luzes, sprites, InstancedMesh, `userData.noMerge`, material em array, morph targets, invisíveis e transparentes (salvo `mergeTransparent`, usado só nos braseiros do Grande Salão). Capturas e números: `tools/merge-compare/` (`capture.mjs`, `results.json`).

Cena (1280×720, `?texq=low`, RX 7600 XT): passe principal da cena inicial **2 500 → 945** draw calls (total com sombra 3 870 → 1 347); `npm run bench` inicial 3 907 → 1 339 calls e 47 → 108 FPS; combate100 10 843 → 8 584 calls e 18 → 23 FPS (o resto é das unidades — F1-03).

### Unidades depois da F1-03 (mesclagem por osso, 2026-09-28)

Cada unidade procedural é mesclada uma vez por tipo no `ModelFactory` (`src/render/mergeUnitTemplate.js`), relativa a cada "osso" (nó animado por `UnitAnimator`/`ModelFactory.rebindUserData`), não à raiz — braços, cabeça, pernas e armas continuam se movendo de forma independente. O inspetor aplica a mesma mescla; `?merge=0` desliga (jogo e inspetor) para comparar. `grunt_glb` (pipeline Blender) já é otimizado e não passa por aqui.

| Modelo | Antes | Depois |
|---|---:|---:|
| archer | 154 | 54 |
| bandit | 145 | 59 |
| villager | 129 | 55 |
| knight | 83 | 41 |
| peon | 38 | 21 |
| grunt | 35 | 25 |
| axethrower | 27 | **15** |
| ogre | 25 | **12** |

Redução de 45–66 % por unidade (triângulos idênticos antes/depois). **Não atinge a meta de ≤ 15 draw calls em todas as unidades** (só axethrower e ogre): cada "osso" precisa continuar com sua própria transformação, então malhas de ossos diferentes nunca podem ser mescladas entre si mesmo compartilhando material — o piso de draw calls por unidade é a soma, por osso, do número de materiais distintos usados nele. Cavaleiro/arqueiro/aldeão/bandido usam 9–12 ossos com vários materiais PBR dedicados por peça (couro, metal, ouro, tecido); reduzir mais sem violar "não mudar materiais/cores" exigiria consolidar materiais por osso (fora do escopo desta tarefa) ou reduzir o número de peças nos próprios modelos (F1-01, unidades orcs).

Impacto em cena: `npm run bench` combate100 (RX 7600 XT, `?texq=low`) **18 FPS / 10 538 calls → 32,3 FPS / 5 775 calls** (`?merge=0` vs. mesclado); ainda abaixo dos 50 FPS da meta da F1-03. Capturas comparativas (`merge=0` vs. mesclado) em `tools/merge-compare/units/` (`capture.mjs`, `results.json`): knight/fight, archer/fight-tensioned, villager/gather-wood, grunt e ogre/fight+hurt-flash, peon/idle-face — nenhuma peça some, muda de lugar ou deixa de animar.

Regras específicas de unidades: nós de visibilidade alternada (`Axe`, `Pickaxe`, `Hammer`, `Pack`, `WoodBundle`, `GoldSack`, `Plume`, `DrawnArrow`, `DrawnAxe`) são ossos (mescla interna, filhos do próprio nó — o toggle de `visible` continua funcionando); `BowStringTop/Bottom` nunca são mescladas (reposicionadas por `updateBowString`); malhas com material em array (cabeças dos orcs, rosto só na face frontal) ficam como estão (já são o mínimo: 1 draw call por material do array).

### Unidades depois da F1-03b (skinning rígido, 2026-09-28)

A F1-03 já não é o piso: cada "osso" só podia mesclar consigo mesmo, então o piso por unidade era
Σ(ossos × materiais por osso). A F1-03b substitui essa mescla por **skinning rígido**
(`src/render/skinUnitTemplate.js`): todas as malhas da unidade que compartilham material (e
`castShadow`) — de qualquer osso — viram **uma** `THREE.SkinnedMesh`, cujos "ossos" são os mesmos
nós-pivô de sempre (`Torso`, `ArmL`, `Weapon`…); cada vértice tem peso 1,0 no seu pivô (sem blend),
então a animação por `UnitAnimator` gira os mesmos nós e fica idêntica. Draw calls por unidade caem
para ≈ nº de materiais distintos + nós de visibilidade alternada (ferramentas/cargas/flecha puxada).
`ModelFactory.getOrCreateModel` aplica no template uma vez por tipo e clona com
`SkeletonUtils.clone` (`SkinnedMesh.clone()` nativo não religa o `Skeleton` aos ossos do clone); as
várias `SkinnedMesh` de uma unidade compartilham **um único** `Skeleton` (por template e por clone,
via `ModelFactory.unifySkeletons`) — sem isso, cada material recalcularia/enviaria sua própria bone
texture por quadro, anulando o ganho de FPS. `grunt_glb` (pipeline Blender) não passa por aqui.
`inspector.html?skin=0` e `?skin=0` no jogo voltam à mescla por osso da F1-03 (comparação); `?merge=0`
desliga tudo.

| Modelo | F1-03 (`?skin=0`) | F1-03b |
|---|---:|---:|
| archer | 54 | 25 |
| bandit | 59 | 24 |
| villager | 55 | 58 |
| knight | 41 | 19 |
| peon | 21 | 19 |
| grunt | 25 | 12 |
| axethrower | 15 | **9** |
| ogre | 12 | **7** |

Triângulos e materiais idênticos antes/depois em todos os casos. Redução adicional de 25–52 % na
maioria das unidades; **villager é uma exceção** (55 → 58, regressão pequena): tem 5 nós de
ferramenta/carga (`Pack`, `WoodBundle`, `GoldSack`, `Axe`, `Pickaxe`, `Hammer`) excluídos do
skinning por definição da spec — cada um recebe uma mescla rígida comum (não-skinada) só dentro do
próprio nó (`mergeStaticTemplate`), mas não mescla ferramentas/cargas de nós *diferentes* entre si
mesmo compartilhando material, e isso pesa mais que o ganho do skinning no corpo. Não investigado
mais a fundo (fora do escopo desta spec): exigiria mesclar os toggles entre si, o que quebraria a
independência de visibilidade de cada um.

Exclusões do skinning (mesmas de sempre, continuam `Mesh` normal): nós de visibilidade alternada
(`Axe`, `Pickaxe`, `Hammer`, `Pack`, `WoodBundle`, `GoldSack`, `DrawnArrow`, `DrawnAxe`);
`BowStringTop/Bottom` (reposicionadas por `updateBowString`); malhas transparentes;
`SelectionRing`/`HealthBar*`. Malhas com material em array (cabeças dos orcs, rosto só na face
frontal) são separadas por `geometry.groups` em uma peça por material antes de agrupar — cada peça
entra no grupo do seu material como qualquer outra malha, preservando o rosto só nos triângulos
corretos (testado com 6 materiais em `tests/unit/skinUnitTemplate.test.js`).

Impacto em cena: `npm run bench` (RX 7600 XT, `?texq=low`) combate100 **17,7 FPS / 11 037 calls**
(`?merge=0`) → **31,4 FPS / 5 942 calls** (F1-03, `?skin=0`) → **37,5 FPS / 3 596 calls** (F1-03b);
massa300 **11,7 FPS / 16 158 calls** (F1-03) → **16,5–17,8 FPS / ~8 500 calls** (F1-03b). Melhora
real sobre a F1-03 (+20 % combate100, +40–50 % massa300), mas **ainda abaixo da meta de 50 FPS em
combate100**: o skinning tem custo de GPU/CPU próprio (atualização de bone matrices/textura por
`Skeleton`, ainda que compartilhado por unidade) que consome parte do ganho de menos draw calls.
Consolidar materiais por unidade (reduzir a contagem de materiais distintos, não só agrupá-los) ou
instancing por tipo de unidade ficam fora do escopo desta tarefa.

Capturas comparativas (`skin=0` vs. skinado) em `tools/merge-compare/skinned/`
(`capture.mjs`, `results.json`): knight/fight, archer/fight-tensioned (corda do arco), villager/
gather-wood, peon/idle-face (rosto), ogre/hurt-flash (flash vermelho), knight/die — nenhuma peça
esticou, sumiu ou ficou para trás durante as animações. Verificado também no jogo: duas unidades do
mesmo tipo com animações fora de fase (`walk` vs. `fight`, tempos diferentes) têm rotações de osso e
objetos `Skeleton` distintos — não compartilham pose.

### Ambiente
oak 16m/476t · pine 12m/208t · autumn 16m/476t · birch 29m/904t · flower_patch 185m · berry_bush 65m · mushroom_stump 37m · water_lily 35m · boulder 11m · pebbles 6m · grass_tuft 14m · arrow 4m.

## Conclusões técnicas

1. **Triângulos não são o problema** (modelos são leves). O problema é **quantidade de objetos**: um castelo tinha 487 draw calls (974 com passe de sombra). Desde a F1-02 os templates estáticos são mesclados por material (castelo 19, Grande Salão 20); as unidades continuam hierarquias de partes (F1-03).
2. **Texturas**: 498 canvases 2048² ⇒ cada textura RGBA com mipmaps ≈ 21 MB de VRAM; 289 texturas vivas na cena inicial ⇒ ordem de **~6 GB de VRAM teórica** + tempo de CPU para pintar no load (~30 s medidos). Em modelos low-poly de 1–3 m na tela, 256–512 px bastam. Mapas de roughness/metalness/bump separados poderiam ser empacotados em um único canal ORM.
3. Unidades são hierarquias de partes rígidas animadas proceduralmente pelo `UnitAnimator`, agora com **skinning rígido** (F1-03b, `src/render/skinUnitTemplate.js`): 1 draw call por material da unidade inteira, com peso 1,0 por vértice (sem blend entre ossos). Para escalar a centenas de unidades e chegar às metas de FPS: consolidar materiais por unidade e, a longo prazo, **instancing + vertex animation texture (VAT)** ou `SkinnedMesh` com `InstancedMesh` por tipo.
4. Não há cor de time (team color): a identidade da facção está baked nas texturas. Multiplayer/FFA exige tint por jogador.
5. Modelo `bandit` e `bandit_camp` estão prontos mas não são usados em partida — oportunidade para creeps neutros.

## Convenções dos modelos (para agentes de arte)

- Nós que o `UnitAnimator`/`ModelFactory.rebindUserData` dependem (NÃO renomear sem atualizar ambos): `Torso, Head, ArmL, ArmR, LegL, LegR, Sword, ShieldGroup, Bow, Weapon, ToolGroup, Axe, Pickaxe, Hammer, Pack, WoodBundle, GoldSack, Plume, DrawnArrow, WeaponL, WeaponR, DrawnAxe, Horn, Mohawk, BowStringTop, BowStringBottom`.
- Escala em jogo: unidades ×1.62.
- Direção de arte orc: `specs/orc_buildings/00_ORC_ART_DIRECTION_PIPELINE.md`.
- Referências visuais do dono do projeto: `modelo.png`, `modeloorcs.png`, `hudmodelo.png`, `dialogoBarracs.png`, `forjaHumanos.png` (em `docs/reference/`; comentários no código citam só o nome do arquivo).


## Capitão Brann (Tripo) — `hero_brann.glb`
Herói humano `hero_brann` (MUNDO-2). Fonte: FBX do Tripo (`medieval+knight+3d+model`). `tools/blender/build_hero_brann.py` avalia, segmenta, gera o atlas e exporta `public/models/hero_brann.glb`: raiz `Knight` com 8 nós (`Torso`, `Head`, `ArmL`, `ArmR`, `LegL`, `LegR`, `Sword` = martelo, `Cape` = capa em `TeamColor`), sem escudo. 8 draw calls, 10.953 triângulos, atlas 512² WebP, 358 KB. Registro em `GLB_MODELS.hero_brann` (`type: 'knight'`, rig de cavaleiro) e `case 'hero_brann'` em `ModelFactory.createUnit`. Limites: pivôs de ombro e punho seguem o corpo do Tripo; capa estática; runas espelhadas; textura 512² perde detalhe. Relatório completo: `docs/reference/heroi-brann-tripo.md`. Inspetor: `?model=hero_brann_glb`.

## Espadachim (Blender) — `knight.glb`
`tools/blender/build_villager.py` (Camponês, rig plana como o `VillagerModel.js`) e `build_peon.py` (Lacaio orc, rig aninhada como o `PeonModel.js`) geram `villager.glb` (~6,0 mil tris, 278 KB) e `peon.glb` (~5,6 mil tris, 267 KB), atlas 512², 14 draw calls no total (~10 visíveis; ferramentas/carga alternam `visible`). O glTF não guarda `visible`: `ModelFactory._workerGlbDefaults` deixa só o machado visível e Pack/WoodBundle/GoldSack ocultos. Ligados por padrão (`?glb=0` volta ao procedural); no inspetor: "Camponês (Blender)" e "Lacaio (Blender)". Capturas: `tools/blender/capture_workers.mjs` (GPU real).

`tools/blender/build_knight.py` gera `public/models/knight.glb` a partir da referência `soldado.png` (armadura de placas com frisos dourados, elmo aberto, capa/mangas azuis em cor de time, espada longa). Rig **plana** idêntica à do `KnightModel.js` (Torso, Head, ArmL, ArmR, LegL, LegR, Sword; o `UnitAnimator` usa posições absolutas na raiz), sem escudo. 10 draw calls, ~4,2 mil tris, 213 KB, atlas 512². Ligado por padrão (`?glb=0` volta ao procedural); no inspetor: "Espadachim (Blender)". Capturas: `tools/blender/capture_knight.mjs` (GPU real).

## Arqueiro e Lanceiro-Machado (Blender) — `archer.glb`, `axethrower.glb`
`tools/blender/build_archer.py` e `build_axethrower.py` (Sonnet 5.5, 2026-09-30). **Arqueiro** (`archer`, também Ranger): rig plana como o `ArcherModel.js` (Torso, Head, ArmL, ArmR, LegL, LegR; `Bow` filho de `ArmL` com `BowStringTop/Bottom`, `BowTipTop/Bottom` e `DrawnArrow`); capuz, manto e capa em `TeamColor` (verde-oliva por padrão), gibão de couro, aljava com flechas, arco composto. `ModelFactory.rebindUserData` agora lê as pontas da corda dos empties `BowTipTop/Bottom` (fallback ±0,95 do procedural) e chama `updateBowString(0)` ao religar. **Lanceiro-Machado** (`axethrower`, também Berserker): rig aninhada como o `AxethrowerModel.js` (Torso > Head(>Mohawk)/ArmL/ArmR(>WeaponL/WeaponR); LegL/LegR na raiz); troll verde-acinzentado com pintura de guerra (faces/peito/braços assadas no atlas), moicano laranja, presas, bandoleira e cinturão de machadinhas, ombreira de pele; tanga/faixas em `TeamColor` (vermelho). Ambos ~6,9 mil tris, 12 draw calls, atlas 512², ≤ 310 KB; ligados por padrão (`?glb=0` volta ao procedural); no inspetor: "Arqueiro (Blender)" e "Lanceiro-Machado Troll (Blender)". Capturas: `tools/blender/capture_ranged.mjs` (GPU real, vite em :5217; modos `archer`, `axethrower`, `game`, `fight`). Observação: `Unit.js` origina o projétil em `mesh.position + (0, 1.68, 0)` (não da mão), então a origem do disparo não depende do modelo.
## Ogro e Bandido (Blender) — `ogre.glb` e `bandit.glb`
`tools/blender/build_ogre.py` gera `public/models/ogre.glb` (Ogro orc, cavalaria dos Clãs do Cinzal): rig **aninhada** como o `OgreModel.js`/Grunt (Torso > Head, ArmL, ArmR > Weapon; pernas na raiz), barrigão, ombros largos, cabeça pequena de mandíbula saliente com chifre, pele cinza-parda com cicatrizes, ombreiras de ferro, correntes, tanga/capa/braçadeiras e trapo da clava em cor de time, clava gigante com espigões. `tools/blender/build_bandit.py` gera `public/models/bandit.glb` (saqueador neutro): rig **plana** como o `BanditModel.js` (Weapon irmã dos braços, gume/pregos em +Z), capuz e bandana, colete de couro remendado, cinto com facas e bolsa, luvas sem dedos, porrete com pregos; o `TeamColor` guarda só os trapos (vermelho-sujo). Atlas 512² cada; métricas em `tools/blender/README.md`. Ligados por padrão (`?glb=0` volta ao procedural); no inspetor: "Ogro (Blender)" e "Bandido (Blender)". Capturas: `tools/blender/capture_ogre_bandit.mjs` (GPU real).

## Cavaleiro, Estábulo Real e Covil dos Ogros (Blender) — `cavalier.glb`, `stable.glb`, `ogre_den.glb` (NEW-33)
`tools/blender/build_cavalier.py` (reusa `build_knight.py` para tronco/cabeça/espada; ganchos `SKIRT`/`CAPE`/`CAPE_FOLD`) gera o **Cavaleiro montado**: cavalo de guerra low-poly anatômico (pescoço arqueado, crina, cauda, focinho com estrela, olhos nas laterais, ferraduras, sela, estribos, peitoral, rédeas, gualdrapa heráldica e penacho em `TeamColor`) com o cavaleiro de placas do Espadachim (elmo aberto, capa azul, frisos dourados, espada longa erguida, mão esquerda nas rédeas; **sem escudo**, para manter a silhueta limpa na câmera RTS). Rig plana: `Horse` (corpo + arreios + pernas do cavaleiro, estático), `HorseLegFL/FR/BL/BR` (pivô no ombro/quadril, y 0,95; o `UnitAnimator` faz o galope em diagonais), `Torso`, `Head`, `ArmL`, `ArmR` (antebraços dobrados para a frente, já no mesh), `Sword`. 14 draw calls, ~8 mil tris, atlas 512² (substitui a textura 2048² herdada do Espadachim procedural), ~320 KB. `build_stable.py` e `build_ogre_den.py` geram as construções como o castelo (`Static_Mesh` Atlas + `Anim_Banners` TeamColor + `Socket_UnitSpawn/Rally`): **Estábulo Real** (celeiro de empena frontal em madeira aparente/reboco sobre pé de pedra, baias com cavalos, portão central, sótão com talha, telhado azul com cúpula e cata-vento, pátio com cocho/cerca/fardos/rack de sela/lanternas/mastros; 2 draw calls, ~5,1 mil tris, atlas 1024², ~390 KB, altura ~6) e **Covil dos Ogros** (paliçada de toras pontiagudas, teto de peles sobre costelas de osso, portão largo de troncos aberto, crânio gigante com chifres, braseiros, totens com estandartes rasgados, peles esticadas; 2 draw calls, ~8,6 mil tris, atlas 1024², ~415 KB, altura ~5,4). Pegada ~7,3 x 7,3 (`collisionRadius` 3,6) como as construções procedurais; obra/`scaffold`/`updateConstructionState` funcionam como no castelo (o `fullMesh` cresce em Y com o progresso). Integração: `GLB_MODELS` (`cavalier`, `stable`, `ogre_den`), `ModelFactory.createCavalier/createStable/createOgreDen` via `_glbOr` (`?glb=0` volta aos procedurais), inspetor: "Cavaleiro Montado (Blender)", "Estábulo Real (Blender)", "Covil dos Ogros (Blender)". Capturas: `tools/blender/capture_cavalry.mjs` (GPU real, vite em :5220, inspetor + jogo).

## Balista, Catapulta e Oficinas (Blender) — `ballista.glb`, `catapult.glb`, `workshop.glb`, `orc_workshop.glb` (NEW-36)
`build_ballista.py` e `build_catapult.py` (helpers em `siege_common.py`: aro/roda raiada, roda maciça com espigões, corrente, amarra, pano recortado, engrenagem, proxy `Xf` para reutilizar peças com uma matriz) geram o cerco com rig **plana**: `Body`, `SiegeArm`, `WheelL`, `WheelR` (raiz = `Ballista`/`Catapult`). **Balista** humana: besta gigante de braços laminados (madeira + tendão + chifre) com pontas de ferro e corda em V, virote enorme com penas em `TeamColor`, carreta com 2 rodas raiadas de aro de ferro, perna de apoio, cabrestante com manivelas e catraca, escudo frontal com faixas azuis e brasão, estandarte; `SiegeArm` = coronha + braços + corda + virote, pivô (0; 1,47; 0) (o `UnitAnimator` o recua em −Z ao disparar). **Catapulta** orc: toras amarradas, cavaletes em A com peles, correntes, ossos, crânios, espigões, cabrestante de ossos, contrapeso em gaiola com pedras, braço longo com concha (rocha + crânios), faixas vermelhas em `TeamColor`; `SiegeArm` com pivô (0; 1,91; −0,085) no eixo do braço, repouso com a ponta 14° acima já na geometria (nó com rotação 0), o animador soma `rotation.x` (+ arma, − lança). Rodas giram em X no eixo (`WheelL/WheelR`). Escala final aplicada por `C.scale_parts` (0,8 / 0,85) para casar com `collisionRadius` 1,3 e com os procedurais. Métricas: Balista 6 draw calls, ~5,1 mil tris, atlas 512², ~250 KB, 2,7 x 3,3 x 2,4; Catapulta 6 draw calls, ~6,6 mil tris, atlas 512², ~290 KB, 3,0 x 3,9 x 2,9. `build_workshop.py` / `build_orc_workshop.py` geram as construções como o Estábulo/Covil (`Static_Mesh` Atlas + `Anim_Banners` TeamColor + `Socket_UnitSpawn/Rally`, atlas 1024², pegada ~7,3 x 7,3): **Oficina de Engenharia** (enxaimel e pé de pedra, telhado azul de duas águas com cata-vento de engrenagem, chaminé de tijolos, engrenagens na fachada, portão em arco com forja, projetos pendurados, guindaste, bancada com bigorna, balista inacabada; ~7,3 mil tris, ~380 KB, altura ~6,8) e **Oficina dos Engenhoqueiros** (galpão bruto de meia-água com chapas remendadas, peles e costelas, forja ardente com chaminé torta e chama, baia de chapas rebitadas com engrenagens toscas, engrenagem-troféu sobre o telhado, catapulta inacabada, sucata, totens com estandartes rasgados; ~9,2 mil tris, ~430 KB, altura ~7). Obra/`scaffold` como no Estábulo. Integração: `GLB_MODELS` (`ballista`, `catapult`, `workshop`, `orc_workshop`), `ModelFactory.createBallista/createCatapult/createWorkshop/createOrcWorkshop` via `_glbOr` (`?glb=0` volta aos procedurais da F4-02), inspetor: "Balista (Blender)", "Catapulta (Blender)", "Oficina de Engenharia (Blender)", "Oficina dos Engenhoqueiros (Blender)". Capturas: `tools/blender/capture_siege.mjs` (GPU real, vite em :5221, inspetor + jogo: construir Oficina, obra, treinar, andar, atacar).
### Refazer do Espadachim e do Cavaleiro (feedback do dono, 2026-10-01)
`build_knight.py` foi refeito para transmitir força: silhueta em V (peitoral e ombros bem mais largos, braços afastados em `ARM_PIVOT` x 0,50 e pernas em `LEG_PIVOT` x 0,22), armet fechado de aço com viseira em T (nenhum rosto visível; fenda só em +Z), crista dourada, ombreiras de 3 lâminas com espigão, cotoveleiras/joelheiras grandes, sabatões, gola de pele, cinto largo, tassetes em camadas, tabardo azul de time com brasão (cruz pattée dourada), capa longa e montante largo com guarda ornamentada. **Novo nó `ShieldGroup`** (escudo kite com brasão; pivô (−0,64; 0,95; 0,30), repouso rot y −0,3, animado pelo `UnitAnimator`; posição x levemente mais para fora que o procedural por causa dos ombros largos). Aço com mais contraste (`steel`/`steel_hi`/`steel_dark`), ouro quente, azul profundo (`TEAM_DEFAULT` #1f4ac8). Espadachim: 6,4 mil tris, 10 draw calls, 278 KB. O Cavaleiro reaproveita o rider via ganchos (`TAB`, `CAPE`, `CAPE_FOLD`, `ARM_PIVOT`, `SHIELD_PIVOT`, `build_arm(elbow, wrist)`, `build_shield(scale, pivot)`): 8,5 mil tris, 14 draw calls, escudo menor (0,62) no flanco esquerdo.

## Mago, Necromante, Esqueleto, Sapadores, Torre Arcana e Santuário (Blender) — NEW-39
Scripts `build_mage.py`, `build_necromancer.py`, `build_skeleton.py`, `build_sapper.py`, `build_arsonist.py` (helpers em `unit_common.py`) e `build_arcane_tower.py`, `build_ash_sanctum.py` geram `mage.glb`, `necromancer.glb`, `skeleton.glb`, `sapper.glb`, `arsonist.glb`, `arcane_tower.glb`, `ash_sanctum.glb`. Unidades: rig plana (`Torso`, `Head`, `ArmL/ArmR`, `LegL/LegR`); conjuradores têm `Weapon` (cajado, na raiz) com `Crystal` filho (pulsa na `cast`); o Esqueleto leva o `Weapon` dentro de `ArmR`; sapadores/incendiários têm `Fuse` filho do `Torso`. Métricas: 5–7 mil tris, 8–12 draw calls, atlas 512², 245–305 KB. Construções (`Static_Mesh` Atlas + `Anim_Crystal`/`Anim_Flame` Atlas + `Anim_Banners` TeamColor + sockets): Torre Arcana ~7,3 mil tris, ~460 KB, altura ~9,6; Santuário ~8,1 mil tris, ~440 KB, altura ~9; ambos atlas 1024², pegada ~6,3. Integração: `GLB_MODELS`, `ModelFactory` (`_glbOr`; `?glb=0` volta aos procedurais), inspetor "(Blender)". Capturas: `tools/blender/capture_casters.mjs` (vite :5223, GPU real). Pendência: o `UnitAnimator` não tem ramo `fight` para `skeleton` (ataque sem animação).

## Templo da Luz, Altar das Tempestades, Olho Vigia, Templário e Ogro Feiticeiro (Blender) — NEW-40
Scripts `build_temple.py`, `build_storm_altar.py`, `build_watching_eye.py`, `build_templar.py`, `build_ogre_mage.py` geram `temple.glb`, `storm_altar.glb`, `watching_eye.glb`, `templar.glb`, `ogre_mage.glb`. **Construções** (`Static_Mesh` Atlas + `Anim_Banners` TeamColor + sockets, atlas 1024², 2 draw calls): Templo da Luz humano (capela cruciforme de mármore, pórtico de 4 colunas com frontão e sol, nave/transepto de telhado azul, vitrais, rosácea, tambor octogonal com janelas, cúpula dourada, lanterna e flecha com sol; ~5,8 mil tris, ~370 KB, altura ~9,4) e Altar das Tempestades orc (praça de basalto com runas ciano, seis menires com crânios/chifres/cristais, altar com cristais de tempestade em anel de ferro, pilão com chifres e cristal-mestre, raios congelados luminosos, tambores, totens; ~7,7 mil tris, ~460 KB, altura ~8,5). **Olho Vigia**: sem rig humanoide, nós `Body`, `Tentacle0..4` e `Fin` (time), globo a 2,4 u, íris dourada só em +Z; 1,5 mil tris, 7 draw calls. **Templário e Ogro Feiticeiro** reaproveitam `build_cavalier.py` / `build_ogre.py` (agora `main(root_name, out_name)`; ganchos por monkeypatch de `MeshBuilder.build` e do `build_club`), com os MESMOS nós/rig do original: Templário 9 mil tris/14 draw calls, Ogro Feiticeiro 7 mil tris/11 draw calls. Integração: `GLB_MODELS` (`temple`, `storm_altar`, `watching_eye`, `templar` com `type:'cavalier'`, `ogre_mage` com `type:'ogre'`), `ModelFactory.createBuildingByType`/`createUnit` via `_glbOr` e `ModelFactory.visualType(type, def)`: `Unit` usa o .glb próprio da classe avançada quando carregado, mas o `UnitAnimator` continua com `def.modelOf` (mesma rig). `?glb=0` volta aos procedurais / modelo da unidade base. Inspetor: "(Blender)" para os cinco. Capturas: `tools/blender/capture_advanced.mjs` (vite :5225, GPU real).

## F7-00b lote 1, grupo 1: aéreos da F4-06, Aviário e Ninho (Blender)
`build_glider.py`, `build_war_balloon.py`, `build_gryphon_rider.py`, `build_war_serpent.py` (helpers em `air_common.py`) geram `glider.glb`, `war_balloon.glb`, `gryphon_rider.glb`, `war_serpent.glb` com os nós do `UnitAnimator.applyAir`: `Torso` (raiz do corpo, filho da raiz do modelo), `Head`, `WingL`/`WingR` (pivôs nas raízes das asas, batem em z) e `Rotor` (balão). Base em y ~ 0 (a simulação aplica `flyHeight`). Cor de time: pano das asas/leme do Planador, faixa do Balão, tabardo/manta/flâmula do Grifo, membranas da Serpe. Rostos só na face frontal (+Z). Métricas: Planador 2,9 mil tris/7 draw calls/170 KB; Balão 3,9 mil/4/195 KB (refeito na arte A: 7,5 mil/6/286 KB); Grifo 5,1 mil/7/270 KB; Serpe 2,1 mil/8/165 KB (atlas 512²). `build_aviary.py`/`build_serpent_nest.py` (como o Estábulo: `Static_Mesh` + `Anim_Banners` + sockets, atlas 1024², 2 draw calls, pegada ~7): Aviário (torre de pedra, escada, plataforma com ninho e dossel; 7,4 mil tris, 410 KB, altura 8,6) e Ninho (anel de basalto, ovos verdes, covil de costelas; 6,2 mil tris, 345 KB, altura 4,8). Integração: `GLB_MODELS`, `ModelFactory` via `_glbOr` (`?glb=0` volta aos procedurais), inspetor "(Blender)". Capturas: `tools/blender/capture_lote1.mjs` (`GROUP=1|2|3`, vite :5271, GPU real).

## F7-00b lote 1, grupo 2: construções base humanas (Blender)
`build_barracks.py`, `build_forge.py`, `build_cottage.py`, `build_farm.py`, `build_lumber_camp.py`, `build_watchtower.py` (helpers em `bld_house.py`: paredes/enxaimel/empena/telhado/janela/porta/chaminé) geram as construções humanas base no padrão do Estábulo (`Static_Mesh` + `Anim_Banners` TeamColor + sockets, atlas 1024², 2 draw calls, 3,3–6,3 mil tris, 237–371 KB), respeitando `collisionRadius` e as alturas de `src/data/buildings.js` (Torre: galeria em y 5,8, ~10 de altura). O Castelo Real já era Blender (o `great_hall` é o QG **orc**). Muralha (`wall_human`/`wall_orc`) não migrada: é `InstancedMesh` com cor por vértice (`WallBatch`), fora do padrão de `.glb`.

## F7-00b lote 1, grupo 3: construções base orcs (Blender)
`build_great_hall.py`, `build_orc_barracks.py`, `build_orc_forge.py`, `build_orc_house.py`, `build_pig_farm.py`, `build_orc_lumber_mill.py`, `build_orc_watchtower.py` (helpers em `bld_orc.py`) geram o QG e as construções orcs base. Contratos com `src/entities/buildings/orc/*`: `Anim_SawBlade` (serra, pivô (0;1,6;0,4), gira em X), `Anim_TrainingDummy` (boneco, pivô (2,8;3,8;1,4)), `Anim_WarBanner_0..3` (estandartes do Grande Salão, balançados em `rotation.y`), forno da Forja Orc em (−1,4;1,6;0,6) com chaminé até y ~9,5, braseiro da Torre em (0;8,4;0), Pocilga sem porcos (são criados por `PigFarm.js` dentro de x −1,7..2,1 / z −1,7..1,9). Métricas: ver README. Pendências: `healthBarHeight` de `src/data/buildings.js` não ajustado às novas alturas (Quartel orc ~5,3 vs 7,5).

## F7-00b lote 2, grupo 1: pendências do lote 1
Balão de Guerra refeito (depois refeito de novo na arte A, ver o fim deste doc; cesta de vime 1,9 × 1,9 de piso aberto com vigia debruçado, envelope menor, lastro/barril/estandarte proporcionais, hélice recuada; 4,5 mil tris, 4 draw calls, ~211 KB). Grande Salão: paliçada de meia-largura 4,2 e base reduzida (pegada 12,3 → ~10,9, coerente com `collisionRadius` 5,5; as referências do `GreatHall.js` — braseiro (2,4; 3,2; 3,6) e chaminé (−2,4; 9,8; −2,0) — não mudaram). Quartel orc: pegada encolhida por 0,88 em x/z (`bld_common.squash_xz`; 8,2 → 7,2, raio 3,6). `healthBarHeight` de todas as construções Blender em `src/data/buildings.js` agora = altura real do `.glb` (medida pelo bbox): ex. Quartel orc 5,3, Forja orc 9,7, Aviário 8,6, Ninho 4,8.

## F7-00b lote 2, grupo 2: jazidas e Acampamento Bandido (Blender)
`build_gold_mine.py`, `build_stone_quarry.py` e `build_bandit_camp.py` geram `gold_mine.glb`, `stone_quarry.glb` e `bandit_camp.glb`. Mina de Ouro (pegada ~7, altura ~4,6, 1 draw call, 5,4 mil tris, 353 KB): morro de rocha em ferradura com picos, veios e cristais de ouro, portal de vigas com dossel, trilhos, vagoneta com pepitas, lanterna. Pedreira (pegada ~6,4, altura ~4,7, 1 draw call, 2,7 mil tris, 232 KB): três patamares de calcário, penhasco, derrick com bloco em linga, blocos aparelhados, bloco rachado com cunhas, carrinho de mão. As jazidas são neutras (sem `TeamColor`) e não têm nós animados. Acampamento Bandido (versão do lote 2: raio 4,2, altura ~6,8, 2 draw calls, 6,2 mil tris, 354 KB, paliçada circular de estacas soltas; refeito na arte A, ver o fim deste doc); `Anim_Banners` em `TeamColor`. Integração: `GLB_MODELS` + `ModelFactory._glbOr` (`createGoldMine/createStoneQuarry/createBanditCamp`; `?glb=0` volta aos procedurais), inspetor "(Blender)". O fogo do procedural (`userData.flame/fireLight`) não era lido por nenhum sistema e não foi reproduzido. Capturas: `GROUP=4 node tools/blender/capture_lote1.mjs`.

## F7-00b lote 2, grupo 3: árvores e muralha instanciadas (Blender)
`build_trees.py` gera `tree_oak.glb`, `tree_pine.glb` e `tree_autumn.glb` (uma malha `Static_Mesh` por tipo, atlas 512², 1 draw call, carvalho/outono 568 tris, pinheiro 160 tris, 31–64 KB). O `TreeManager` (continua `InstancedMesh`, 1 por tipo) extrai geometria e material do .glb (`getGlbTreeSource`): em vez de 2 malhas por tipo (tronco + copa) e das texturas procedurais de 2048² geradas no carregamento, cada tipo usa 1 malha com atlas de 512². Mantidos `shakeTree`/`hideTree`/`resetTreeMatrix` e a árvore caindo (`ModelFactory.createTree` agora devolve o clone do .glb). `?glbtrees=0` volta às árvores procedurais (comparação); `?glb=0` desliga tudo. Bench (`inicial`, Vulkan/RX 7600 XT, 2 execuções de cada): .glb 159,2 e 156,0 FPS, 685–728 draw calls, ~561 mil tris; procedural 158,2 e 161,1 FPS, 666–719 draw calls, ~534 mil tris; load 4,25 s nos dois. Desempenho equivalente dentro do ruído (tris +5 %, FPS e draw calls sem diferença mensurável), com menos memória de textura e sem gerar texturas de 2048² no carregamento. O `birch` não é instanciado e segue procedural.
`build_walls.py` gera `wall_human.glb` e `wall_orc.glb`, blocos com atlas 512² (versão do lote 2: 2,2 × ~2,4 × 2,2, 356/468 tris; refeitos na arte A para encaixar em fileira de 2,4, ver o fim deste doc). `getWallGeometry/getWallMaterial` (`src/models/buildings/WallModel.js`) devolvem a geometria/material do .glb quando carregado, e o `WallBatch` segue sendo 1 `InstancedMesh` por facção (escala em y da obra, ocultação por instância, ghost de colocação e picking inalterados). Não existe malha de conexão entre segmentos (v2/NEW-24), então nada foi perdido. Pedra 4x e paliçada 5,5x os 84 tris do procedural: com o teto de 400 instâncias por facção, ~140–190 mil tris no pior caso.

## F7-00b arte A: Acampamento Bandido, Balão de Guerra e muralhas em fileira (Blender, 2026-10-10)
Scripts `build_bandit_camp.py`, `build_war_balloon.py` e `build_walls.py` refeitos; capturas (reproduzíveis) em `tools/ui-captures/art-a/` (`bash tools/safe-run.sh --timeout 1500 -- node tools/ui-captures/art-a/capture.mjs [camp|balloon|walls|inspector|all]`, vite :5311, GPU real, `?skipPreload&texq=low`, PNG do canvas sem HUD, reduzido a 256 cores) e renders de referência do Blender em `tools/blender/renders/`.

- **Acampamento Bandido** (6,5 → ~7,8/10, autoavaliação). O anel de estacas soltas ("copo de lápis") virou um muro contínuo de toras encostadas com perfil de altura (`wall_h`: baixo no quadrante da câmera do jogo, +x/+z, e alto nos fundos), um trecho caído com toras curtas inclinadas e vãos voltado para essa câmera (o pátio fica legível), travessas, crânios empalados e faixas de tinta; portão com dois mourões-totem, verga com dentes de osso, crânio de ogro com presas e batentes abertos para dentro; torre de vigia sobre quatro pernas inclinadas (escada, parapeito, teto carmesim com nervuras de osso); tenda de guerra de cumeeira com remendos, aba enrolada, mastro com crânio e cordas; abrigo de peles, fogueira com caldeirão e troncos de assento, baú de saque aberto, rack de armas, barris/caixas e dois mastros de estandarte que passam por cima do muro. Nós e sockets preservados (`Static_Mesh`, `Anim_Banners` em `TeamColor`, `Socket_UnitSpawn`, `Socket_Rally`); 2 draw calls, ~12,4 mil tris, atlas 1024² (convenção das construções), ~530 KB, pegada ~8,4 (raio de colisão 4,2), altura ~6,6. Vistas extras do Blender: `bandit_camp_top/inside/inside_back`. No jogo (mapa `continental-1v1`, dono neutro: faixas laranja) o muro caído mostra a tenda e a fogueira por cima do muro; ver `camp-jogo-*.png`. Limite: o atlas fica com muitas ilhas pequenas (crânios e adereços), então detalhes miúdos ficam suaves ao dar zoom.
- **Balão de Guerra** (7 → ~8/10). Envelope de 12 gomos abaulados (4 segmentos por gomo, sombreamento suave dentro do gomo e aresta dura na costura), alternando couro claro e ferrugem, saia escura, remendos (lajes fechadas), costuras com tiras de couro e rebites, faixa de guerra serrilhada em `TeamColor` com o crânio de presas na frente (+Z), coroa de ferro com espinhos de osso. A cesta é a malha `Basket` (filha do `Torso`, para ganhar mais área de textura): vime com cintas, escada de corda, bombas com pavio, sacos, barril, leme com listra de time, segundo tripulante com elmo de chifres e o vigia com luneta; `Head` e `Rotor` como antes (o `UnitAnimator.applyAir` só mexe em `Torso`/`Head`/`Rotor`; `Basket` acompanha o `Torso`). 7,5 mil tris, 6 draw calls, atlas 512², ~286 KB. O defeito do gomo "quebrado" do modelo anterior vinha de `mat_fn` classificar o centro da face exatamente na fronteira do gomo (erro de ponto flutuante); agora o centro cai a 1/8, 3/8, 5/8, 7/8 do gomo. Capturas em voo, no ângulo da câmera do jogo e voando em direção a ela (a frente do balão aparece): `balao-voo-*.png`.
- **Muralhas em fileira** (`wall_human`/`wall_orc`). Verificação: o jogo posiciona segmentos a cada `WALL_STEP` = 2,4, mas os blocos antigos tinham pegada 2,2 (corpo humano 2,0): cada emenda deixava 0,2 de vão no pé/cornija e 0,4 no corpo, e as ameias formavam um ritmo irregular (vão de 0,8 e 0,4 alternados); o bloco orc (pé e cintas de 2,25, toras só em 10 pontos do anel) deixava 0,15 de vão e um ritmo de toras irregular. Correção: o bloco passa a ter exatamente 2,4 × 2,4 com as faces rentes à célula (relevos — cordão, mísulas, seteiras, cintas — ficam dentro de cada face e os biséis de 0,02–0,03 desenham a emenda); mísulas em ±0,6, toras de 0,8 em 0,8 (grade 3×3 de octógonos) e ameias de 0,6 nos cantos (duas ameias vizinhas = ameia de 1,2 com vão de 1,2): todos os períodos dividem 2,4, então o padrão continua entre blocos; o pé desce 0,55 abaixo do solo para o relevo em desnível não mostrar frestas. Humano 616 tris, 49 KB; orc 432 tris, 39 KB (toras sem tampas escondidas, faixa de tinta de guerra na tora do meio de cada face). Fileiras de 5 blocos: renders do Blender `wall_<tipo>_row_game/_seam/rowL_game` e no jogo (`WallBatch` real, `placeWall`): `muralha-<humana|orc>-fileira-{jogo,frente,perto,padrao,z,diagonal}.png`. Em fileiras na diagonal (8 direções) os blocos, sem rotação por instância, se sobrepõem em escada (comportamento já existente do `WallBatch`).
- **Pipeline**: `uv_atlas` é chamado com ângulo de 66–70° nos scripts do acampamento e do balão (monkeypatch local de `C.uv_atlas`; `finish_building` fixa 50°) para cada tora/gomo virar uma ilha só. `RenderRig` cria sol/chão/câmera a cada instância: renders múltiplos na mesma cena precisam remover os anteriores (`clear_rig` em `build_walls.py`).


## F7-00b arte B (2026-10-10): bétula, correções de arte, limpeza dos procedurais e aceite de desempenho
**Bétula.** `tools/blender/build_birch.py` → `public/models/tree_birch.glb` (padrão `tree_*.glb` das outras árvores, que o `ModelFactory.createTree` exige): tronco esguio em S com base de três lóbulos, casca branco-giz com lenticelas escuras horizontais (material de pintura próprio, só no bake), dez galhos e dez copas facetadas verde-limão; 1 draw call, 816 tris, atlas 512², 80 KB, ~6,8 u. Tronco e copas são objetos separados (o tronco recebe mais área de textura) e o empacotamento tem margem maior que o `finish_building` (as ilhas verdes vazavam para dentro da casca branca). O `TreeManager` ganhou o quarto tipo, criado sob demanda (sem bétula registrada não existe InstancedMesh); `species: "birch"` é válida nos mapas (validador, editor, i18n) e dois bosques centrais do mapa-base (`continental-1v1`, (2,−26) e (−2,26)) usam bétula (só visual: o checksum não inclui o tipo e o consumo do `rngMap` não muda).

**Correções.** *Olho Vigia* (8/10): hierarquia `Torso` (centro do globo) > `Body`, `Fin`, `Anim_Tentacle0..5` (pivô na raiz de cada tentáculo, malha `TentacleN` em coordenadas locais; seis tentáculos pendurados sob o globo); `UnitAnimator.applyTentacles` ondula `rotation.x/z` de cada pivô (ciclo inteiro por loop, mais amplo e arrastando para trás ao se mover) e o `Torso` leva o conjunto na respiração/balanço. *Ogro Feiticeiro* (7,5/10): o colar antigo nascia sob a mandíbula e se somava ao do Ogro base; agora `build_ogre.NECKLACE = False` no feiticeiro e o colar de tempestade (cordão em V no peito, 6 presas, cristal grande com tampa de ferro) é o único. *Templário* (8/10): o sol do tabardo ficava atrás do pescoço do cavalo na câmera RTS; o sol de 8 raios agora também está no escudo (cruz + 4 raios + núcleo luminoso) e no peitoral do cavalo, ambos para +Z. *Estábulo* (8,5/10): cavalos inteiros (anatomia do cavalo do Cavaleiro: pescoço arqueado, crina, blaze, ombros, tronco, garupa, cauda; um castanho e um ruço) em baias de 2,5 de profundidade com divisórias; só as pernas ficam de fora (a meia-porta as esconde). Capturas e autoavaliação em `tools/ui-captures/art-b/` (`capture.mjs`).

**Limpeza dos procedurais.** Removidos 49 arquivos (23 `*Textures.js` + 26 `*Model.js`, −35,7 mil linhas; `models-human` 703 → 261 KB e `models-orc` 46 → 5 KB no bundle): Espadachim, Cavaleiro, Arqueiro, Camponês, Bandido, Lacaio, Grunt, Arremessador de Machados, Ogro; Castelo, Serraria, Casa, Quartel, Torre de Vigia, Fazenda e Forja humanos; Grande Salão, Quartel, Chiqueiro, Serraria, Torre, Toca e Forja orcs; Mina de Ouro, Pedreira; as 4 árvores (`treeTextures.js`/`TreeModel.js`). Critério: `.glb` em uso por padrão desde a F7-00c, autoavaliação ≥ 7/10, nenhum teste ou ferramenta dependente do procedural (conferido por busca de importadores). `ModelFactory._placeholder` (bloco simples, nó `Torso` nas unidades) entra se um desses `.glb` não carregar (rede, `?glb=0`) e o `TreeManager` cai numa árvore reserva de uma cor (`?glbtrees=0`). O inspetor passou a 107 entradas (sem as versões procedurais dos itens migrados; ficam as "(Blender)"); os scripts de captura que comparavam "antes × depois" perderam as capturas `_old`. **Ficaram:** `BanditCampModel.js` + `banditCampTextures.js` (Acampamento 6,5/10, em revisão pela arte A); `floraTextures.js`, `rockTextures.js` (decoração, sem `.glb`); `terrainTextures.js`, `tilesetTextures.js`, `waterTextures.js` (terreno, tilesets e água); `axethrowerTextures.js` (só o machado de arremesso, usado pelo `ProjectileViews`); e os `*Model.js` sem arquivo de texturas (cerco, conjuradores, esqueleto, sapadores, Olho Vigia, aéreos, Aviário/Ninho, Torre Arcana/Santuário/Templo/Altar, Estábulo/Covil, Oficinas, navais/petróleo, críticos, flecha, muralha): `tests/unit/air.test.js` e `tools/f407b-check.mjs --noglb` dependem do fallback de aéreos e navais, alguns não têm `.glb` (Fundição, Forja Naval, Refinaria, Caldeirão, Submarino, poço) e nenhum gera texturas de canvas.

**Aceite de desempenho.** `?bench=inicial` (Chromium 153 headless com GPU real RX 7600 XT/ANGLE-Vulkan, 1280×720, via `safe-run`, 2 s de aquecimento + 10 s medidos, 3 execuções cada; resultados brutos descartados, só o resumo fica aqui). **Antes** (esta árvore, sem a fusão das plantas aquáticas; `?skipPreload&texq=low`): draw calls 701/716/677 (média 698), FPS 160/150/164, load 3,12/2,76/2,77 s (média 2,88 s). **Depois**: draw calls **241/243/241 (média 242 < 400)**, FPS 243/263/252 (média 253), load **2,78 s** (3,01/2,65/2,67) com `?skipPreload&texq=low`; no caminho real de carga (sem `skipPreload`, com o preload de modelos e texturas) o load é **3,94 s** com `texq=low` (4,09/3,86/3,86; 243 calls, FPS 241) e **4,07 s** na qualidade padrão (4,12/3,99/4,09; FPS 170; o `render.calls` do bench vale 1 com o composer ligado, pois só conta o último passe, então não é comparável). **Aceite atendido** (load < 5 s nos três caminhos; cena inicial 242 < 400 draw calls). Causa dos ~700 draw calls: `Water.createReeds` criava ~625 malhas soltas (7 moitas de hastes, lâminas, folhas e pétalas) = ~504 das 676 chamadas da cena (passe principal 366 + sombras 310; medido escondendo grupos da cena em `tools/ui-captures/art-b/drawcalls.mjs`); `mergeByMaterial` as funde numa malha por material (≈ 8 por moita; −633/−342/−370 chamadas nas 3 vistas de `18-jogo-juncos-*`), com o balanço da moita e a oscilação das folhas preservados e o visual equivalente. A bétula e a limpeza não mexem na cena inicial: o `InstancedMesh` da bétula é +2 chamadas só em mapas com bétula (já incluído), a limpeza tirou ~490 KB de JS do bundle (`models-human` 703 → 261 KB).

As 7 posições das moitas são fixas (do mapa antigo): em `continental-1v1` ficam em terra seca, com pads e flores enterrados sob o terreno (NEW-52).

## Arte 2D renderizada (F7-09): ícones, retratos e artes de menu/loading

Tudo sai dos **mesmos `.glb`** (nenhum modelo 3D novo ou alterado) com Eevee, por scripts em `tools/blender/` (rodar sempre via `tools/safe-run.sh`, um Blender por vez, `--timeout 1200`). Saída em `public/ui/` (**2,65 MiB**, teto 15 MiB; `tests/unit/uiSprites.test.js` confere o teto e que o total do manifesto bate com o disco).

| Script | Saída | Números |
|---|---|---|
| `render_icons.py` | `icons/128|256/<id>.webp`, RGBA, fundo transparente, contorno escuro de 1,5–2 px | 140 ícones: 36 unidades (incl. variantes `_orc` dos navios neutros e as classes/heróis, com selo de patente/estrela), 33 construções (muralha em 3 blocos; inclui as jazidas), 17 comandos (parar, mover, atacar, atacar-mover, patrulhar, manter, coletar, construir, reparar, cancelar, reunir, treinar, pesquisar, carregar, desembarcar, evoluir o Centro `_orc`), 19 pesquisas (equipamento: espada/machado, escudos, bomba/pedra em chamas, canhão, casco, flechas…; as magias e classes usam `aliases`) 21 magias e 14 atributos do card (`stat_*`: ataque, defesa, velocidade, alcance, carga, mana, aéreo, naval, suicida, área, submerso, obra, população, torre); ~5 KB (128) e ~13 KB (256) por ícone, 2,15 MiB no total |
| `render_portraits.py` | `portraits/<tipo>_idle.webp` e `_attack.webp`, 128² opaco | 36 retratos × 2 estados = 272 KB; fundo em degradê da facção (azul/vermelho/verde), ataque com fundo quente e risco de luz |
| `render_art2d.py` | `art/menu.webp`, `art/loading.webp` (1920×1080) | cena de pôr do sol com os `.glb` do jogo (castelo, Grande Salão, exércitos em pose real, árvores), céu/terreno/montanhas procedurais, perspectiva atmosférica por passe de profundidade (EXR), DOF leve, bloom/contraste/vignette em numpy; 131 KB e 107 KB |

- **Suporte**: `ui_common.py` (cena Eevee de ícone: luz de 3 pontos + mundo em degradê, enquadramento por projeção dos vértices em forma fechada, contorno/redução/WebP em numpy, manifesto), `ui_specs.py` (tabelas: id → `.glb`/glifo, ângulo, busto), `ui_glyphs.py` (glifos 3D procedurais — espada, escudo, caveira, redemoinho… — só para o que não existe como modelo: comandos, pesquisas, magias), `ui_scene.py` (céu, terreno, instâncias), `ui_sheet.py` (folhas de contato com Pillow, no Python do sistema).
- **Poses reais**: `node tools/dump-portrait-poses.mjs` roda o `UnitAnimator` verdadeiro sobre a hierarquia de nós do `.glb` e grava `tools/blender/portrait_poses.json` (idle, `fight` em 5 instantes, `cast`); o Blender aplica a pose por nó (conversão `C·M·C⁻¹` do importador glTF, verificada com erro 0). Os ícones de unidade mostram a pose idle do jogo; o retrato de ataque usa o instante escolhido em `ui_specs.PORTRAITS` (`attack=('fight'|'cast', progresso)`) e a câmera acompanha a cabeça. `--check` confere se o JSON está em dia depois de mexer no animador.
- **Adicionar uma unidade/construção nova**: entrada em `ui_specs.UNITS`/`BUILDINGS`/`PORTRAITS` (e `ui_glyphs.py` se for magia/pesquisa nova) → `node tools/dump-portrait-poses.mjs` → os três scripts (cada um aceita `--only id1,id2` e `--out <pasta>` para provas fora de `public/ui/`) → `python3 tools/blender/ui_sheet.py icons <png>` para conferir → `npx vitest run tests/unit/uiSprites.test.js` (falha se uma unidade/construção/pesquisa/magia do jogo ficar sem sprite, exceto os tipos sem `.glb`).
- **Estilo**: stylized como o jogo — mesma paleta dos modelos, cor de time original do `.glb` (azul humano, vermelho orc), luz quente de cima-esquerda + contraluz frio, contorno escuro para ler sobre o azulejo escuro da HUD; efeitos mágicos com emissão e halo radial que cabe no quadro.
- **Pendências**: ícones/retratos de Ovelha, Submersível, Tartaruga Colossal, Refinaria, Fundição, Forja Naval e Caldeirão (sem `.glb`; usam o ícone antigo até F7-00b); o diálogo de missão segue com retrato emoji (personagens, não unidades).

## Arte do novo mundo (2026-10-13)

- `public/art/story/panel-1` a `panel-6` e `panel-7`, mais `panel-7-alliance` e `panel-7-horde` (variantes por facção): PNG com fallback JPG (o código tenta `.png` e depois `.jpg`). Os caminhos partem de `BASE_URL` (o deploy de Pages roda em `/warpoly/`; caminho absoluto `/art/...` quebra ali). **`panel-7.png/jpg` é cópia byte a byte de `panel-7-alliance` e não é usada** (a facção sempre tem variante); pode sair. Os dois formatos estão no repositório; escolher um e remover o outro é uma limpeza pendente.
- `public/art/world/mapa-mundi.{png,jpg}`: mapa-múndi **ilustrativo**. Não é jogável e não mede distância. Usado hoje como arte do cartão de título da história. Tem título e nomes em inglês gravados na imagem ("Ondara", "Har'Akir"), que contradizem os nomes aprovados (Velmara e Cinzara): precisa de versão sem texto.
- `public/ui/heroes/hero_*.svg`: 6 retratos SVG **provisórios** (um por herói). Os retratos finais e os modelos 3D são arte local (Blender).
- `docs/refs/herois/*_tpose.png`: referências T-pose dos heróis para o modelador. `docs/refs/menu_original.webp`: menu anterior, como referência. `public/ui/art/menu.webp` foi atualizado.
- Pendências de arte (local): ART-05 a ART-16 de terreno (`docs/specs/MUNDO-TERRENO-MAPAS.md` §6; ART-01 a ART-04 em P0 na seção abaixo), modelos e retratos dos 6 heróis, artes de vitória `victory_human/orc.webp`.

## Arte P0 de bioma: rochas, cactos, árvores, vegetação seca e javali (2026-10-16)

Scripts Blender (Sonnet 5.5, lotes ART-01 a ART-04), integrados em `task/ART-P0-integracao`. Cada `.glb` tem 1 draw call, salvo o javali (6). Atlas 512², exceto onde indicado.

- `tools/blender/build_props_rochas_cactos.py`: `rock_granite_large` (661 triângulos, 3,9 × 3,4 m), `rock_granite_medium` (203), `rock_granite_small` (83, atlas 256²), `cactus_1` (colunar com dois braços, 1 260 triângulos, 3,3 m de altura), `cactus_2` (baixo, um braço, 712, 1,8 m) e `bones` (ossada, 1 694).
- `tools/blender/build_vegetacao_seca_arvores.py`: `tree_broad` (copa larga, variante alta, 1 486 triângulos), `tree_palm` (1 116), `tree_acacia` (copa achatada, 1 344), `grass_dry` (capim seco, 168, atlas 256²) e `tumbleweed` (arbusto rolante, 1 709, atlas 256²).
- `tools/blender/build_critter_boar.py`: `critter_boar` (javali neutro; `Body`, `Head` e 4 pernas; 1 172 triângulos, escala ×1,4 na geometria: 0,51 × 0,84 × 1,87 m (L × A × P), frente em +Z, sem animação; no jogo, `CritterView` aplica mais ×1,4, ~2,61 m de comprimento) e o ícone `public/icoJavali.png`. Com `--split`, o script grava uma variante de 10 draw calls em `tools/blender/build/critter_boar_split.glb`, fora de `public/`, como insumo para a animação.
- Registro: as 12 chaves têm `lazy: true` em `GLB_MODELS`. A carga padrão (boot e preload) não as baixa; `loadGlbTemplates(factions, { includeLazy: true })` carrega. O inspetor usa essa opção no boot. Os mapas de bioma vão precisar dela ao consumir os props.
- Inspetor: 12 entradas no catálogo, com `sourceFile` apontando para os scripts. Baseline visual gravada para os 12 alvos em 1280×720, 1920×1080 e 390×844 (`npm run visual -- --update --only …`).
- Fora do jogo: nenhum mapa usa estas espécies, e o javali segue procedural (`src/models/units/CritterModel.js`). Relatórios de cada lote: `docs/reference/art-p0-rochas-cactos.md`, `docs/reference/art-p0-arvores-vegetacao.md`, `docs/reference/art-p0-javali.md`.
- Pendências: arenito (ART-01, 2 variantes); copa da palmeira deslocada do pé, que o impostor de LOD e o hit-proxy do `TreeManager` não acompanham; arbusto rolante pesado para muitas instâncias; javali sem animação de andar, pastar e correr, com 6 ou 10 draw calls a decidir (a escala ficou em ×1,4).
