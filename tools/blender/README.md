# Pipeline de arte com Blender headless (F7-00)

Modelos do WarPoly gerados **100% por script Python** no Blender 5.2 (sem arquivos `.blend`),
com bake de textura estilizada e export `.glb` otimizado. Os scripts são a fonte versionada;
os `.glb` em `public/models/` são artefatos reproduzíveis.

| Script | Saída | Resultado |
|---|---|---|
| `build_grunt.py` | `public/models/grunt.glb` | guerreiro orc: 7 partes rígidas, 4,4 mil tris, 8 draw calls, atlas 512² |
| `build_knight.py` | `public/models/knight.glb` | Espadachim humano (ref. `soldado.png`): 7 partes rígidas, 4,2 mil tris, 10 draw calls, atlas 512², 213 KB |
| `build_archer.py` | `public/models/archer.glb` | Arqueiro humano: capuz/manto/capa em cor de time, gibão de couro, aljava com flechas, arco composto + corda de 2 segmentos + flecha (`DrawnArrow`); rig plana, 6,8 mil tris, 12 draw calls, atlas 512² |
| `build_axethrower.py` | `public/models/axethrower.glb` | Lanceiro-Machado troll: pele verde-acinzentada com pintura de guerra, moicano, presas, bandoleira/cinturão de machadinhas, 2 machados de arremesso; rig aninhada, 6,9 mil tris, 12 draw calls, atlas 512² |
| `build_villager.py` | `public/models/villager.glb` | Camponês humano: rig plana (ToolGroup > Axe/Pickaxe/Hammer, Pack > WoodBundle/GoldSack), 6,0 mil tris, 14 draw calls no total (~10 visíveis), atlas 512², 278 KB |
| `build_peon.py` | `public/models/peon.glb` | Lacaio orc: rig aninhada (Torso > Head, ArmL, ArmR > ToolGroup; Pack no Torso), 5,6 mil tris, 14 draw calls no total, atlas 512², 267 KB |
| `worker_common.py` | — | helpers dos trabalhadores (painel de tecido, costuras, orçamento de bisel) |
| `build_castle.py` | `public/models/castle.glb` | castelo humano: 2 draw calls, 8,7 mil tris, atlas 1024² |
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
