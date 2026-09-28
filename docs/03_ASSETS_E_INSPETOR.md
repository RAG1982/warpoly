# 03 — Assets 3D, Texturas e Inspetor

## Inspetor 3D (`/inspector.html`)

- Catálogo de **37 modelos** com busca e filtros (Unidades, Edifícios, Orcs, Ambiente).
- Pedestal, grade, wireframe, presets de luz (Estúdio, Dia…), tela cheia.
- Unidades: animações `Idle, Caminhando, Lutando, Coletando, Recebendo Golpe, Caindo`, linha do tempo, velocidade 0.25×–2×.
- Construções: pré-visualização dos VFX customizados (forjas, chiqueiro etc.).
- Painel de estatísticas: triângulos, vértices, componentes, materiais, bounding box, arquivo-fonte.
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

### Ambiente
oak 16m/476t · pine 12m/208t · autumn 16m/476t · birch 29m/904t · flower_patch 185m · berry_bush 65m · mushroom_stump 37m · water_lily 35m · boulder 11m · pebbles 6m · grass_tuft 14m · arrow 4m.

## Conclusões técnicas

1. **Triângulos não são o problema** (modelos são leves). O problema é **quantidade de objetos**: um castelo = 487 draw calls (974 com passe de sombra). Nenhum template é mesclado (`mergeGeometries`) — deveria virar ~1 draw call por material (≈14).
2. **Texturas**: 498 canvases 2048² ⇒ cada textura RGBA com mipmaps ≈ 21 MB de VRAM; 289 texturas vivas na cena inicial ⇒ ordem de **~6 GB de VRAM teórica** + tempo de CPU para pintar no load (~30 s medidos). Em modelos low-poly de 1–3 m na tela, 256–512 px bastam. Mapas de roughness/metalness/bump separados poderiam ser empacotados em um único canal ORM.
3. Unidades são hierarquias de partes rígidas animadas proceduralmente pelo `UnitAnimator` (sem skinning). Para escalar a centenas de unidades: mesclar partes rígidas por "osso" (≈6–10 grupos por unidade) e, a longo prazo, **instancing + vertex animation texture (VAT)** ou `SkinnedMesh` com `InstancedMesh` por tipo.
4. Não há cor de time (team color): a identidade da facção está baked nas texturas. Multiplayer/FFA exige tint por jogador.
5. Modelo `bandit` e `bandit_camp` estão prontos mas não são usados em partida — oportunidade para creeps neutros.

## Convenções dos modelos (para agentes de arte)

- Nós que o `UnitAnimator`/`ModelFactory.rebindUserData` dependem (NÃO renomear sem atualizar ambos): `Torso, Head, ArmL, ArmR, LegL, LegR, Sword, ShieldGroup, Bow, Weapon, ToolGroup, Axe, Pickaxe, Hammer, Pack, WoodBundle, GoldSack, Plume, DrawnArrow, WeaponL, WeaponR, DrawnAxe, Horn, Mohawk, BowStringTop, BowStringBottom`.
- Escala em jogo: unidades ×1.62.
- Direção de arte orc: `specs/orc_buildings/00_ORC_ART_DIRECTION_PIPELINE.md`.
- Referências visuais do dono do projeto: `modelo.png`, `modeloorcs.png`, `hudmodelo.png`, `dialogoBarracs.png`, `forjaHumanos.png` (raiz).
