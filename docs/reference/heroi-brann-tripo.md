# Capitão Brann (`hero_brann`): modelo do Tripo

Entrada: `tripo_convert_4dcab188….fbx` (+ pasta `.fbm`). Saída: `public/models/hero_brann.glb`, gerado por `tools/blender/build_hero_brann.py` (rodar via `tools/safe-run.sh`; imprime toda a avaliação abaixo). Prévias em `tools/ui-captures/hero-brann/`.

## 1. Avaliação do FBX (Blender 5.2.1)
| Ponto | Resultado | Evidência medida |
|---|---|---|
| Textura | **PRESENTE** | 1 material (Principled): Base Color ← Image Texture, imagem 4096×4096 JPG **externa** (`.fbm`, 3,3 MB, não empacotada), carregada, sRGB. Normal Map sem textura ligada. UV: 1 camada, 0 de 23 384 cantos fora de 0–1, **50,7 %** da área usada (soma das áreas 50,9 %). Aparece no render (`brann_fbx_frente.png`). |
| Capa | **SEPARADA como ilha de malha**; não é objeto próprio (mesmo objeto e material do corpo) | 237 faces, 0,586 m², **0 vértices compartilhados** com o corpo, distância mínima 0,5 cm (`brann_fbx_ilhas.png`). |
| Martelo | **SEPARADO como 2 ilhas** (cabeça + cabo), também no mesmo objeto e material | cabeça 477 faces, 0 vértices compartilhados, 18,8 cm do corpo; cabo 313 faces, 0 compartilhados, 0,6 cm (dentro do punho). |
| Rosto | **só na frente (+Z)** | 107 de 607 faces da cabeça são cor de pele, todas em x ±0,08, y 1,65–1,77; topo (88 faces) e nuca (36): 0; pele 0,077 u à frente do centro da cabeça (`brann_rosto.png`). |
| Escala/eixo/origem | altura 0,9995 m (penacho), base y = 0; up +Y; olha para +Z; **origem fora dos pés** | corpo em x = 0,151, quadris em z = −0,12 (o bbox só é simétrico em x pelo martelo). |
| Contagens | 2 objetos, 1 malha, 1 material | Armature (65 ossos Mixamo, sem ações) + 1 malha: 5270 vértices, 6533 polígonos (3785 quads + 2748 tris) = 10 318 tris, 52 grupos de pesos, 36 ilhas. |

## 2. O que foi feito
- **Espelho em x** (faces e normais junto): o martelo está na mão direita anatômica (−x); no jogo `ArmR`/`Sword` ficam em +x. Ossos `Left*`/`Right*` viram `ArmL`/`ArmR` e `LegL`/`LegR`. Escala ×2,051 (topo 2,05), origem entre os pés, base em y = 0.
- **Separação**: capa → `Cape`; martelo → `Sword`; botas → pernas; 30 ilhas pequenas (bolsas, correntes, fivela, placas do peito) → `Torso`. O corpo (1 ilha, 4018 faces) é rotulado pelos pesos do rig (suavizados) + regras (tabardo no Torso), cortado por planos: y = 0,687 nas pernas e x = ±0,299 nos ombros (perpendicular ao giro do braço, não abre fresta). Arcos de gola ficam no Torso.
- **Tampas**: 10 (pescoço, 2 ombros e 2 quadris, uma de cada lado do corte), laço triangulado com a cor da textura vizinha. **Martelo**: eixos por PCA (cabo → +Y, golpe → +Z, gema para +X), origem na empunhadura, repouso x 0,5 / z −0,1 como o Espadachim.
- **Textura**: 4096² → 512² (média 8×8 em luz linear); só as ilhas UV da capa viram cinza (`TeamColor`); `Atlas` no resto. 0 texels da capa compartilhados.
- **Verificação**: JSON do GLB lido com Python; reimportado no Blender; carregado numa página three.js fora do repositório com `GLTFLoader`, `ModelFactory.rebindUserData` e `UnitAnimator` reais (achou torso/head/armL/armR/legL/legR/sword; sem escudo; `TeamColor` recolore a capa: `brann_engine_*.png`).

## 3. Resultado
Nós: 9 (`Knight` + 8, sem transformação na raiz, sem `ShieldGroup`). Draw calls: 8. Triângulos: 10 953 (≤ 12 000). Textura: 512² WebP (92 KB). GLB: 358 KB (meshopt + WebP). Topo 2,05, base 0. Materiais `Atlas` e `TeamColor` (só a capa).
| Nó | Pivô obtido | Pivô pedido | Tris |
|---|---|---|---|
| Torso | (0, 1.05, 0) | (0, 1.05, 0) | 3637 |
| Head | (0, 1.65, −0.04) | (0, 1.62, 0) | 1016 |
| ArmL / ArmR | (∓0.268, 1.477, −0.078) | (∓0.5, 1.27, 0) | 1694 / 1614 |
| LegL / LegR | (∓0.201, 0.687, 0.053) | (∓0.22, 0.68, 0) | 637 / 623 |
| Sword | (0.460, 0.859, 0.053), rot (0.5, 0, −0.1) | (0.66, 0.72, 0.3) | 1306 |
| Cape | (0, 1.594, −0.349) | irmã do Torso | 426 |

## 4. Desvios e limites
- Pivôs de ombro e de empunhadura seguem o corpo do Tripo (ombro e mão reais), não os valores nominais do Espadachim.
- Pernas: o corte fica acima da joelheira (as coxas só se separam abaixo disso); coxa e cinto ficam no Torso e giram só joelheira, canela e bota.
- Ombros: no `cast` (braços a −2,3 rad) aparecem fatias escuras finas (tampas vistas de lado). Em caminhada e golpe não há fresta visível (`brann_pose_*.png`).
- Martelo: o punho do Tripo fecha em torno de um cabo diagonal; com o cabo na vertical o eixo do punho difere ~84° (só se nota em close-up). Cabeça grande (0,77 × 0,43 × 0,45 u): ajustável em `ESCALA_MARTELO`.
- A capa não é animada (`Cape` não está em `ANIMATED_NODE_NAMES`) e fica parada: no golpe o ombro a atravessa.
- 512² perde detalhe do 4096² e a UV usa só 53 % do atlas (reempacotar daria ~+35 % de resolução linear; a spec pede só reamostrar). Runas e brasões saem espelhados.
- Falta registrar `hero_brann: { url, root: 'Knight', type: 'knight' }` em `GLB_MODELS` (`src/`, fora da minha posse).
