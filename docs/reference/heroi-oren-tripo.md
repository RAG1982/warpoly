# Mestre Arcano Oren (`hero_oren`): modelo do Tripo (M2-21)

Entrada: `~/Downloads/Oren/tripo_convert_b335f53a….fbx` (+ `.fbm`). Saída: `public/models/hero_oren.glb`, gerado por `tools/blender/build_hero_oren.py` (só constantes e ganchos do Oren) sobre a biblioteca **`tools/blender/hero_common.py`**, extraída do `build_hero_brann.py` (o `hero_brann.glb` regerado é **byte-idêntico**). Rodar via `tools/safe-run.sh`. Prévias em `tools/ui-captures/hero-oren/`; verificação no jogo e no inspetor: `tools/ui-captures/hero-oren/game-check.mjs` (11/11 PASS, 0 erros de console).

## 1. Avaliação do FBX (Blender 5.2.1)
| Ponto | Resultado |
|---|---|
| Malha | 1 objeto, 9224 vértices, 18 475 triângulos, **uma ilha só** (cajado, mochila e rolos soldados ao corpo); rig Mixamo de 65 ossos, 51 grupos de pesos, sem ações |
| Textura | 1 material Principled; só a cor base (`Oren_basecolor.JPEG`, 1024², sRGB) é usada; UV em 0–1, 35 % da área |
| Pose | **T-pose** (braços na horizontal), cajado na mão direita anatômica (−x), frente em −Y do Blender (+Z no jogo), túnica longa que cola as pernas |
| Cajado | haste de madeira + garras + cristal ciano, **sem face dentro do punho** (união): a haste são duas regiões separadas pelo punho |

## 2. O que foi feito
- **Repose por rig** (`hero_common.reposar`): ossos recebem rotações absolutas em coordenadas do jogo (braços em A a 50°; antebraço direito dobrado 90° para a frente com a mão em guinada de 90° em torno da vertical, então o punho continua fechado em torno do cajado em pé); a malha deformada vem do depsgraph (vértices movem até 0,34 m).
- **Espelho em x**, escala (capuz = 2,15; cabeça à altura do mago comum × 1,15 do `scaleMul`), origem entre os pés.
- **Segmentação** (pesos de pele + regras): botas = faces com peso de pé ou couro escuro abaixo de y = 0,10 (a saia vai para o `Torso`); cajado e cristal por cor e posição na T-pose (`Weapon` pode ter duas regiões); cabeça acima do plano y = 0,728 (emenda plana no pescoço); ombros por planos x = ±0,0875 (perpendiculares ao eixo de giro do braço), pivô no centro da seção cortada (a seção gira dentro de si mesma: sem fresta na `cast`). 8 peças, 15 tampas.
- **Hierarquia do tipo `mage`**: `Mage` > `Torso`, `Head`, `ArmL`, `ArmR` > `Weapon` > `Crystal`, `LegL`, `LegR` (o pedido citava `Staff`, mas o animador e o `ModelFactory.rebindUserData` procuram `Weapon` e `Crystal`). A haste foi nivelada (3,55°).
- **TeamColor por face**: faces inteiras de pano azul-petróleo (hue 165–215°, 10 pontos baricêntricos) viram cinza no atlas e usam o material `TeamColor`; faces de borda do acabamento claro ficam com a cor original (a pintura do acabamento atravessa a malha; classificar só pelo centro gerava dentes). Atlas 1024² → 512² (média 2×2 em luz linear), dilatação do rótulo de time limitada a 2 px e protegida de faces de outro material.
- Integração: `GLB_MODELS.hero_oren` (`root: 'Mage'`, `type: 'mage'`), `ModelFactory.createUnit` (caso `hero_oren`, cai no Mago sem o .glb), entrada `hero_oren_glb` no inspetor, `healthBarHeight` 4,3, retrato/ícone renderizados do novo .glb (`ui_specs.py`, `portrait_poses.json` só com a entrada nova), SVG provisório removido (`icon` aponta o `.webp` do manifesto).

## 3. Resultado
12 draw calls (Torso 2, Head 2, ArmL 2, ArmR 2, resto 1), **21 060 triângulos** (18 475 originais + tampas e cortes), atlas 512² WebP 129 KB, GLB 540 KB, materiais `Atlas` e `TeamColor`. Pivôs: Torso (0, 1,05, 0); Head (0, 1,64, −0,04); ArmL/ArmR (∓0,192, 1,38, −0,07); LegL/LegR (∓0,14, 0,184, −0,094); Weapon (0,229, 1,195, 0,234); Crystal (0,251, 1,683, 0,215).

## 4. Desvios e limites
- Triângulos acima dos 11 mil do Brann: a malha do Tripo é densa (robe, bolsas, rolos) e não foi decimada.
- Só as botas viram pernas (a saia fica no `Torso`): na caminhada a barra não balança, as botas giram sob ela em torno do tornozelo.
- `cast` (braços a −2,3 rad): o animador só contra-gira x e z do `Weapon`, então a haste se inclina até ~29° (igual ao mago comum). Sem fatias visíveis nos ombros nem no pescoço; restam dentes de 1–2 px na costura do capuz em close extremo.
- O `UnitAnimator` não tem golpe próprio para `mage` (o ataque é a `cast`).
- Rosto só em +Z (verificado em `oren_rosto.png`); óculos e rolos saem espelhados (o modelo foi espelhado em x).

## 5. Reaproveitar `hero_common.py` (Drogath, Dorian, Vozgul, Skarn)
Um `build_hero_<id>.py` define constantes (`NOME`, `RAIZ`, `FBX_PADRAO`, `TOPO`, `X0`/`Z0`, `PECAS`, `CORPO`, `CAPAS`, `PAIS`, `REPOUSO`, `POSE`, `REGIOES_LIVRES`…) e ganchos (`classificar`, `cortes`, `regras`, `finalizar`, `eh_time`, `cor_time`, `poses`) e termina com `HC.executar(sys.modules[__name__])`. O contrato completo está no docstring de `hero_common.executar`. Modelos de uso: `build_hero_brann.py` (ilhas soltas, martelo, capa) e `build_hero_oren.py` (uma ilha só, repose, peças por cor, hierarquia com pais).
