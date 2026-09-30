# 03 — Assets 3D, Texturas e Inspetor

## Inspetor 3D (`/inspector.html`)

- Catálogo de **37 modelos** com busca e filtros (Unidades, Edifícios, Orcs, Ambiente).
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


## Espadachim (Blender) — `knight.glb`
`tools/blender/build_knight.py` gera `public/models/knight.glb` a partir da referência `soldado.png` (armadura de placas com frisos dourados, elmo aberto, capa/mangas azuis em cor de time, espada longa). Rig **plana** idêntica à do `KnightModel.js` (Torso, Head, ArmL, ArmR, LegL, LegR, Sword; o `UnitAnimator` usa posições absolutas na raiz), sem escudo. 10 draw calls, ~4,2 mil tris, 213 KB, atlas 512². Ligado por padrão (`?glb=0` volta ao procedural); no inspetor: "Espadachim (Blender)". Capturas: `tools/blender/capture_knight.mjs` (GPU real).
