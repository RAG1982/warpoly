# Pipeline de arte com Blender headless (F7-00)

Modelos do WarPoly gerados **100% por script Python** no Blender 5.2 (sem arquivos `.blend`),
com bake de textura estilizada e export `.glb` otimizado. Os scripts são a fonte versionada;
os `.glb` em `public/models/` são artefatos reproduzíveis.

| Script | Saída | Resultado |
|---|---|---|
| `build_grunt.py` | `public/models/grunt.glb` | guerreiro orc: 7 partes rígidas, 4,4 mil tris, 8 draw calls, atlas 512² |
| `build_knight.py` | `public/models/knight.glb` | Espadachim humano (ref. `soldado.png`), refeito mais forte: armet fechado com viseira em T, ombreiras de 3 lâminas com espigão, tabardo azul com brasão, gola de pele, capa longa, montante e escudo kite (`ShieldGroup`); 8 partes rígidas, 6,4 mil tris, 10 draw calls, atlas 512², 278 KB |
| `build_archer.py` | `public/models/archer.glb` | Arqueiro humano: capuz/manto/capa em cor de time, gibão de couro, aljava com flechas, arco composto + corda de 2 segmentos + flecha (`DrawnArrow`); rig plana, 6,8 mil tris, 12 draw calls, atlas 512² |
| `build_axethrower.py` | `public/models/axethrower.glb` | Lanceiro-Machado troll: pele verde-acinzentada com pintura de guerra, moicano, presas, bandoleira/cinturão de machadinhas, 2 machados de arremesso; rig aninhada, 6,9 mil tris, 12 draw calls, atlas 512² |
| `build_villager.py` | `public/models/villager.glb` | Camponês humano: rig plana (ToolGroup > Axe/Pickaxe/Hammer, Pack > WoodBundle/GoldSack), 6,0 mil tris, 14 draw calls no total (~10 visíveis), atlas 512², 278 KB |
| `build_peon.py` | `public/models/peon.glb` | Lacaio orc: rig aninhada (Torso > Head, ArmL, ArmR > ToolGroup; Pack no Torso), 5,6 mil tris, 14 draw calls no total, atlas 512², 267 KB |
| `worker_common.py` | — | helpers dos trabalhadores (painel de tecido, costuras, orçamento de bisel) |
| `build_ogre.py` | `public/models/ogre.glb` | Ogro orc: 7 partes rígidas (rig aninhada), 6,9 mil tris, 11 draw calls, atlas 512², 297 KB |
| `build_bandit.py` | `public/models/bandit.glb` | Bandido neutro: 7 partes rígidas (rig plana), 5,7 mil tris, 12 draw calls, atlas 512², 274 KB |
| `build_castle.py` | `public/models/castle.glb` | castelo humano: 2 draw calls, 8,7 mil tris, atlas 1024² |
| `build_cavalier.py` | `public/models/cavalier.glb` | Cavaleiro montado humano (F4-01/NEW-33): cavalo anatômico + tronco do Espadachim; rig plana com `HorseLegFL/FR/BL/BR`, 8,5 mil tris, 14 draw calls, atlas 512², 333 KB (reusa o novo cavaleiro-rider do Espadachim; escudo menor) |
| `build_stable.py` | `public/models/stable.glb` | Estábulo Real: celeiro de empena frontal, duas baias fundas com divisórias e meias-portas, cavalos de peito para cima espiando por cima delas (castanho e ruço; pescoço, cabeça, crina, ombros e peito reaproveitam a anatomia do cavalo do Cavaleiro de `build_cavalier.py`: antes só uma cabeça e um pescoço fino), 2 draw calls, 5,9 mil tris, atlas 1024², ~416 KB |
| `build_ogre_den.py` | `public/models/ogre_den.glb` | Covil dos Ogros: paliçada, teto de peles e costelas, portão e crânio, 2 draw calls, 8,6 mil tris, atlas 1024², 415 KB |
| `build_ballista.py` | `public/models/ballista.glb` | Balista humana (NEW-36): besta gigante laminada + carreta de 2 rodas raiadas; rig plana `Body`/`SiegeArm`/`WheelL`/`WheelR`, 6 draw calls, 5,1 mil tris, atlas 512², 250 KB |
| `build_catapult.py` | `public/models/catapult.glb` | Catapulta orc (NEW-36): toras, ossos, peles, contrapeso e concha com carga; mesma rig, 6 draw calls, 6,6 mil tris, atlas 512², 290 KB |
| `build_workshop.py` | `public/models/workshop.glb` | Oficina de Engenharia: enxaimel, engrenagens, guindaste, chaminé de tijolos, 2 draw calls, 7,3 mil tris, atlas 1024², 380 KB |
| `build_orc_workshop.py` | `public/models/orc_workshop.glb` | Oficina dos Engenhoqueiros: galpão de sucata, forja ardente, engrenagens toscas, 2 draw calls, 9,2 mil tris, atlas 1024², 430 KB |
| `build_mage.py` | `public/models/mage.glb` | Mago Arcano (NEW-39): chapéu pontudo, barba, túnica pesada, manto, capa/estola em time, cajado com `Crystal`; rig plana, 6,8 mil tris, 9 draw calls, atlas 512², ~290 KB |
| `build_necromancer.py` | `public/models/necromancer.glb` | Necromante das Cinzas orc: capuz chifrudo, ombreiras de crânios, ossos, manto esfarrapado, cajado de crânio com `Crystal` verde; 6,8 mil tris, 12 draw calls, ~300 KB |
| `build_skeleton.py` | `public/models/skeleton.glb` | Esqueleto de combate: ossos, couraça/elmo enferrujados, trapos em time, `Weapon` dentro de `ArmR`; 5,9 mil tris, 8 draw calls, ~280 KB |
| `build_sapper.py` | `public/models/sapper.glb` | Sapador humano: barril de pólvora, bandoleira de bombas, óculos, nó `Fuse` (filho do Torso); 5,1 mil tris, 8 draw calls, ~245 KB |
| `build_arsonist.py` | `public/models/arsonist.glb` | Incendiário orc: rack de 3 botijas, óculos de solda, nó `Fuse`; 5,7 mil tris, 8 draw calls, ~260 KB |
| `build_arcane_tower.py` | `public/models/arcane_tower.glb` | Torre Arcana: torre octogonal, escada em espiral, balcão, pavilhão com cristal e astrolábio (`Anim_Crystal`); 7,3 mil tris, atlas 1024², ~460 KB, altura ~9,6 |
| `build_ash_sanctum.py` | `public/models/ash_sanctum.glb` | Santuário das Cinzas: zigurate de basalto, totens de crânios, braseiro com gaiola de costelas, obelisco, `Anim_Flame` (chamas e fumaça); 8,1 mil tris, atlas 1024², ~440 KB |
| `build_temple.py` | `public/models/temple.glb` | Templo da Luz (NEW-40): capela cruciforme de mármore, pórtico de 4 colunas, telhado azul, vitrais, rosácea, cúpula dourada com lanterna e sol; 2 draw calls, 5,8 mil tris, atlas 1024², ~370 KB, altura ~9,4 |
| `build_storm_altar.py` | `public/models/storm_altar.glb` | Altar das Tempestades orc (NEW-40): praça de basalto com runas ciano, seis menires com crânios e cristais, altar com cristais em anel de ferro, pilão com chifres, raios congelados; 2 draw calls, 7,7 mil tris, atlas 1024², ~460 KB, altura ~8,5 |
| `build_watching_eye.py` | `public/models/watching_eye.glb` | Olho Vigia (NEW-40; tentáculos articulados na F7-00b): globo violeta flutuando a 2,4 u, íris dourada em +Z. Hierarquia `Torso` (nó no centro do globo, o `UnitAnimator` respira/balança o conjunto) > `Body`, `Fin` em time e `Anim_Tentacle0..5` (pivôs na raiz de cada tentáculo, com a malha `TentacleN` em coordenadas locais); o `UnitAnimator.applyTentacles` ondula `rotation.x/z` de cada pivô. 1,7 mil tris, 8 draw calls, ~112 KB |
| `build_templar.py` | `public/models/templar.glb` | Templário (NEW-40): reaproveita `build_cavalier.py` (`main('Templar','templar')`) com armadura branca/ouro, cavalo branco, crista de plumas e emblema de sol: o do tabardo fica atrás do pescoço do cavalo na câmera RTS, então o sol de 8 raios também está no escudo (cruz + 4 raios diagonais + núcleo luminoso) e no peitoral do cavalo, ambos voltados para +Z (F7-00b); mesma rig do Cavaleiro; 9,3 mil tris, 14 draw calls, ~365 KB |
| `build_ogre_mage.py` | `public/models/ogre_mage.glb` | Ogro Feiticeiro (NEW-40): reaproveita `build_ogre.py` (`main('OgreMage','ogre_mage')`) com pele azulada, tinta de raio luminosa, penacho e cajado de xamã em `Weapon`. Colar de tempestade (F7-00b): desliga o colar do Ogro base (`O.NECKLACE = False`) e leva o seu — cordão em V no peito, longe da mandíbula/gola/ombros, com 6 presas e um cristal grande preso por tampa de ferro; 6,8 mil tris, 11 draw calls, ~294 KB |
| `build_glider.py` | `public/models/glider.glb` | Planador de Engenho (F7-00b): casco de barco, hélice, mastro com cordame, asas de pano em `TeamColor`, piloto; rig `Torso` > `Head`, `WingL`, `WingR`; 2,9 mil tris, 7 draw calls, atlas 512², ~170 KB |
| `build_war_balloon.py` | `public/models/war_balloon.glb` | Balão de Guerra orc: envelope de gomos de couro, cesta, braseiro, vigia; `Torso` > `Head`, `Rotor`; 4,5 mil tris, 4 draw calls, ~211 KB (cesta maior) |
| `build_gryphon_rider.py` | `public/models/gryphon_rider.glb` | Cavaleiro Grifo: leão-águia com asas de penas e cavaleiro de aço; `Torso` > `Head`, `WingL`, `WingR`; 5,1 mil tris, 7 draw calls, ~270 KB |
| `build_war_serpent.py` | `public/models/war_serpent.glb` | Serpe de Guerra orc: escamas, couraça de ossos, asas de morcego em `TeamColor`; 2,1 mil tris, 8 draw calls, ~165 KB |
| `build_aviary.py` | `public/models/aviary.glb` | Aviário de Grifos: torre de pedra, escada em espiral, plataforma de pouso com ninho e dossel; 2 draw calls, 7,4 mil tris, atlas 1024², ~410 KB |
| `build_serpent_nest.py` | `public/models/serpent_nest.glb` | Ninho das Serpes: anel de basalto, ovos brilhantes, covil de costelas; 2 draw calls, 6,2 mil tris, ~345 KB |
| `air_common.py` | — | helpers dos aéreos (asa de pano, membrana em leque, pena) |
| `build_barracks.py` `build_forge.py` `build_cottage.py` `build_farm.py` `build_lumber_camp.py` `build_watchtower.py` | `public/models/{barracks,forge,cottage,farm,lumber_camp,watchtower}.glb` | construções base humanas (F7-00b): 2 draw calls cada, 3,3–6,3 mil tris, atlas 1024², 237–371 KB (helpers em `bld_house.py`) |
| `build_great_hall.py` `build_orc_barracks.py` `build_orc_forge.py` `build_orc_house.py` `build_pig_farm.py` `build_orc_lumber_mill.py` `build_orc_watchtower.py` | `public/models/{great_hall,orc_barracks,orc_forge,orc_house,pig_farm,orc_lumber_mill,orc_watchtower}.glb` | construções base orcs (F7-00b): 2–5 draw calls, 3,6–13,8 mil tris, atlas 1024², 241–557 KB; mantêm os nós `Anim_*` lidos por `src/entities/buildings/orc/*` (`Anim_SawBlade`, `Anim_TrainingDummy`, `Anim_WarBanner_*`); helpers em `bld_orc.py` |
| `build_gold_mine.py` `build_stone_quarry.py` `build_bandit_camp.py` | `public/models/{gold_mine,stone_quarry,bandit_camp}.glb` | jazidas neutras (usadas pelo `ResourceDepositView`) e Acampamento Bandido (F7-00b lote 2): Mina 1 draw call/5,4 mil tris/353 KB, Pedreira 1/2,7 mil/232 KB, Acampamento 2/6,2 mil/354 KB (`Anim_Banners` TeamColor); atlas 1024² |
| `build_trees.py` | `public/models/tree_{oak,pine,autumn}.glb` | árvores instanciadas pelo `TreeManager` (F7-00b lote 2): uma malha e atlas 512² por tipo, 1 draw call; carvalho/outono 568 tris, pinheiro 160 tris, 31–64 KB; `?glbtrees=0` usa a árvore reserva de uma cor (os procedurais foram removidos na F7-00b); bétula em `build_birch.py` |
| `build_birch.py` | `public/models/tree_birch.glb` | bétula do mapa (F7-00b, `species: "birch"`; instanciada sob demanda pelo `TreeManager`): tronco esguio em S de base alargada com lenticelas escuras horizontais (casca procedural própria só no bake), dez galhos e dez copas facetadas verde-limão; uma malha e atlas 512², 1 draw call, 816 tris, ~80 KB, altura ~6,8; tronco e copas são objetos separados (o tronco recebe mais área de textura) com margem de empacotamento maior; `BIRCH_DEBUG_DIR=<pasta>` salva closes fora do repositório |
| `build_walls.py` | `public/models/wall_{human,orc}.glb` | blocos de muralha instanciados pelo `WallBatch` (F7-00b lote 2): bloco 2,2 × 2,4 × 2,2, uma malha e atlas 512², 356 tris (pedra) e 468 tris (paliçada), 34–41 KB |
| `unit_common.py` | — | helpers dos humanoides de rig plana (painel de tecido, tubo, mão, pipeline de bake/export/render) |
| `siege_common.py` | — | helpers do cerco e das oficinas (rodas, correntes, engrenagens, proxy `Xf`) |
| `bld_common.py` | — | helpers das construções (viga/tubo/tora entre pontos, cabeça de cavalo, crânio de ogro, bbox) |
| `common.py` | — | helpers (primitivas bmesh, materiais de pintura, UV atlas, bake, export, render) |

## Como rodar

```bash
# tudo (modelos + renders em tools/blender/renders/)
tools/blender/build_all.sh
# só um modelo, sem renders
/home/rafael/warpoly/tools/safe-run.sh --timeout 600 -- \
  /home/rafael/Downloads/blender-5.2.1-linux-x64/blender -b --factory-startup \
  --python tools/blender/build_grunt.py -- --no-render
```

Variáveis: `BAKE_SAMPLES` (32), `RENDER_RES` (800), `ATLAS` (1024, castelo), `DEBUG_TRIS=1`
(mostra os triângulos de cada primitiva). Cada modelo leva ~10–40 s numa CPU comum.

Comparação no navegador (vite em `:5180`):

```bash
timeout 900 npx vite --port 5180 --strictPort &
/home/rafael/warpoly/tools/safe-run.sh --timeout 600 -- node tools/blender/capture_inspector.mjs
python3 tools/blender/compose_compare.py     # gera renders/compare_*.png (antigo × novo)
```

## Etapas do pipeline

1. **Modelagem por primitivas** (`MeshBuilder`): caixas com afunilamento, cilindros, cones,
   calotas/esferas, *loft* de anéis (tronco, cabeça, braços, chifres), polígonos extrudados
   (lâmina do machado, arcos de portão, estandartes). Cada primitiva recebe:
   - material de pintura (`skin`, `iron`, `stone`, `roof_cone`, `team`…) ou por face (`mat_fn`);
   - bisel opcional (`bevel`, só nas arestas duras > 50°, para não chanfrar cilindros);
   - ângulo de suavização próprio (`smooth=0` flat, `smooth=70` orgânico). As arestas entre
     primitivas e entre materiais ficam sempre duras.
   Toda a geometria é escrita em **coordenadas do jogo** (x direita, y cima, **+z frente**);
   `g()` converte para o Blender e o exportador glTF desfaz a conversão.
2. **Materiais de pintura** (`paint_material`): redes de nós que só servem para o bake —
   manchas de cor por ruído, ruído fino, padrões (tijolos com cor por pedra, telhas com
   sombreado por fileira, tábuas), degradê de altura (sujeira embaixo), luz de topo pintada,
   desgaste de borda (nó *Bevel*) e oclusão ambiente (nó *AO*, com um chão temporário para
   o contato). Mapeamento triplanar em mundo ou cilíndrico no espaço do objeto (torres/cones).
3. **UV atlas** (`uv_atlas`): *Smart UV Project* em todos os objetos juntos, reescala por área
   real × peso por objeto (ex.: cabeça ×1,55) e empacotamento côncavo num único 0..1.
   Peças repetidas podem **compartilhar UV** (as 4 torres do castelo usam as UVs de uma só;
   cópias "fantasma" entram no bake só para o AO ficar correto).
4. **Bake** (`bake_atlas`): Cycles CPU, tipo *EMIT*, 32 amostras, margem de 4–6 px.
5. **Materiais finais** (`finalize_materials`): `Atlas` (Principled + textura, rugosidade 0,78,
   metal 0) e `TeamColor` (mesma textura × cor do time via `baseColorFactor`). As áreas de
   time são pintadas em cinza médio quente para aceitar qualquer tint.
6. **Junção por material** (`join_objects`) para construções; unidades mantêm uma malha por
   parte animada.
7. **Export** (`export_glb`): GLB com `EXT_meshopt_compression` + texturas WebP
   (`EXT_texture_webp`). O three.js 0.186 carrega com `GLTFLoader.setMeshoptDecoder`.

## Convenções dos `.glb`

- Origem no centro da base, Y para cima, frente em +Z, 1 unidade = 1 m do jogo.
- **Unidades**: nós rígidos com os nomes do `UnitAnimator` / `ModelFactory.rebindUserData`
  (`Torso`, `Head`, `ArmL`, `ArmR`, `LegL`, `LegR`, `Weapon`…), pivôs nas articulações e
  rotação de repouso igual à do modelo procedural (braços 0; `Weapon.rotation.x = −45°`).
  O machado é modelado de pé e girado por `AXE_PRE` dentro do nó `Weapon`, para ficar quase
  vertical, **gume para +Z (frente)**, sem mudar as rotações que o animador aplica.
- **Rosto**: detalhes de rosto (olhos, sobrancelha, nariz, boca, presas) ficam só na face
  frontal (+Z) da cabeça; laterais, topo e nuca usam pele lisa.
- **Construções**: `Static_Mesh` (Atlas), `Anim_*` (peças animáveis/cor de time),
  `Socket_*` (empties para VFX, spawn, rally), conforme `specs/orc_buildings/00_...`.
- Materiais chamados `TeamColor` recebem a cor do jogador (`ModelFactory.setTeamColor(obj, cor)`).

## Integração no jogo

- `src/entities/glbModels.js`: lista `GLB_MODELS`, `loadGlbTemplates()` (GLTFLoader + meshopt)
  e `setTeamColor()`.
- `ModelFactory`: com `?glb=1`, `createGrunt()`/`createCastle()` devolvem clones do `.glb`
  (nomes preservados, `rebindUserData`, sombras ligadas); sem o parâmetro nada muda e, se o
  `.glb` falhar, o procedural é o fallback. `AssetPreloader` aguarda os `.glb` só com `?glb=1`.
- Arqueiro: `BowTipTop`/`BowTipBottom` (empties nas pontas do arco) definem os extremos da corda em `rebindUserData`; `BowStringTop`/`BowStringBottom` são cilindros de altura 1 centrados (o `updateBowString` os posiciona, escala e gira). Capturas de animação/jogo: `capture_ranged.mjs` (vite em `:5217`).
- Inspetor: entradas "Guerreiro Orc (Blender)" (`grunt_glb`, animações do `UnitAnimator`) e
  "Castelo (Blender)" (`castle_glb`), carregadas sempre, para comparar lado a lado.

## Próximo passo: esqueleto e animações (F7-00b)

1. Criar um `Armature` por arquétipo (humanoide, quadrúpede) com os mesmos nomes de ossos que
   hoje são nós (`Torso`, `Head`, `ArmL`…), mais `Hand_R` / `Hand_L` como sockets de arma.
2. Pesar as partes rígidas 100% no osso correspondente (sem deformação) e juntar tudo numa
   única malha → **1–2 draw calls por unidade** (`SkinnedMesh`), com as armas presas por socket.
3. Traduzir as poses procedurais do `UnitAnimator` em *actions* do Blender por script
   (`idle`, `walk`, `fight`, `gather`, `hurt`, `die`), com chaves nos mesmos tempos das funções
   atuais e exportar como `AnimationClip`s no mesmo `.glb`.
4. No jogo, trocar o `UnitAnimator` por `AnimationMixer` para modelos com clipes (crossfade
   entre estados, F7-06); em multidões, evoluir para instancing + textura de animação (VAT).
