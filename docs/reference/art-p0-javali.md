# ART-04 — Javali (`critter_boar`) e ícone `icoJavali`

Tarefa de arte P0 de `docs/specs/MUNDO-TERRENO-MAPAS.md` §5 e §6. Branch `task/ART-04-javali`. **Registrado em `GLB_MODELS` (lazy) e no inspetor na integração ART-P0; não ligado ao jogo** (`ModelFactory` e `CritterView` ficam para a integração; seções 8 e 9). Escala ×1,4 na geometria desde 2026-10-17 (seção 7). Sem animações nesta entrega (andar, pastar e correr vêm depois).

## 1. Entregas
| Arquivo | O que é | Números |
|---|---|---|
| `public/models/critter_boar.glb` | javali selvagem em pose de repouso, patas no chão, escala ×1,4 na geometria (seção 7) | **1 172 tris**, 2 486 vértices, **6 draw calls** (6 malhas, 1 material `Atlas`), textura **512²** WebP, **130 248 B (127,2 KB)**, sem cor de vértice (`POSITION`, `NORMAL`, `TEXCOORD_0`), `EXT_meshopt_compression` + `EXT_texture_webp` como os demais `.glb` |
| `public/icoJavali.png` | ícone, javali em ¾ virado para a direita | 128×128 RGBA, fundo transparente, contorno escuro de 1,5 px, 18 135 B |
| `tools/ui-captures/art-p0/critter_boar.png` | preview do modelo | 512×512 RGBA transparente, câmera fixa (az −38°, el 16°, fov 22°), 173 KB |
| `tools/blender/build_critter_boar.py` | script reproduzível (gera os três acima) | duas execuções seguidas geram arquivos idênticos (sha256 do `.glb`, do ícone e do preview) |
| `tools/ui-captures/art-p0/critter-boar-check.{mjs,html}` | conferência no three.js real (GPU, luz e câmera do jogo) | gera `critter_boar_game.png`, `critter_boar_poses.png`, `critter_boar_close.png` e `critter_boar_check.json` |

## 2. Como regenerar
```bash
bash tools/safe-run.sh --timeout 600 -- /home/rafael/Downloads/blender-5.2.1-linux-x64/blender -b --factory-startup \
  --python tools/blender/build_critter_boar.py            # ~40 s: .glb + preview + ícone
# opções depois de `--`: --no-render | --split | --dev-flat --dev-out <pasta> | --views --dev-out <pasta>
bash tools/safe-run.sh --timeout 300 --mem 8G -- node tools/ui-captures/art-p0/critter-boar-check.mjs [game] [poses] [close]
```
O script reimporta o `.glb` exportado antes de renderizar o preview e o ícone (valida o artefato, não a cena de trabalho), confere o orçamento e **aborta com código 1** se passar de 6 draw calls, 4 000 tris, atlas 512², se houver cor de vértice ou se faltar um dos 11 nós; imprime `STATS`, `GLB`, `ORCAMENTO`, `BBOX`. `--split` (insumo da animação futura) grava `tools/blender/build/critter_boar_split.glb` (ignorado pelo git; **não** vai para `public/`): `Snout`, `Tusk_L`, `Tusk_R` e `Tail` viram malhas próprias (10 malhas = 10 draw calls, 1 188 tris, 136 KB). A conferência no navegador não usa o jogo nem o inspetor (servidor estático mínimo + `GLTFLoader` + `MeshoptDecoder`) e usa `assertHardwareGpu`.

## 3. O modelo
Javali baixo e comprido de faces facetadas (sombreamento chapado), tronco em cunha (garupa estreita e baixa, cernelha larga e alta, peito fundo), crina de 12 pirâmides de cerdas inclinadas para trás (escura na raiz, areia nas pontas) e 3 tufos na testa, cabeça grande com focinho longo de disco rosado e narinas, mandíbula escura, **presas curtas de marfim** (~12 cm) curvas para cima, olhos pequenos âmbar com sobrancelha pesada, orelhas eretas de interior rosado, cerdas claras nas bochechas, pernas curtas e grossas de cascos escuros (as de trás com jarrete), rabo fino com penacho. Pelagem marrom-escura com riscas de cerda mais claras e **7 manchas claras de bordas irregulares** (5 nos flancos e 2 nas bochechas, assimétricas; lista `PATCH_BLOBS` no script), ventre mais claro. Tudo pintado por materiais procedurais e assado num atlas 512² (Cycles CPU, 48 amostras), como os outros modelos.
- **Medidas** (m; 1 u = 1 m), nativas antes da escala: comprimento do focinho à garupa **1,20** (z −0,60…+0,60; com a cauda 1,33); altura **0,60** no cume da crina (cernelha do tronco 0,54); largura 0,365. **No `.glb` entregue (×1,4):** 1,68 do focinho à garupa, **1,87 com a cauda**, altura **0,84**, largura **0,51**. Origem no chão, no centro da pegada (bbox em XZ sem a cauda); **frente +Z**; patas em y = 0. **L = −x, R = +x** (convenção do projeto, como `ArmL`/`ArmR`).
- **Tris por malha:** `Body` 458, `Head` 442, cada `Leg_*` 68.
- **Referências:** `docs/refs/mundo/terreno-orc-deserto.webp` (luz quente do alto-esquerda, fauna de deserto e pântano) e `terreno-humano-exuberante.webp` (materiais facetados e pintados); sem nomes nem lore da Blizzard.

## 4. Nós e pivôs
Hierarquia aninhada (como Ogro/Grunt): a cabeça e as pernas são filhas de `Body`, então o balanço do corpo as leva junto. Todas as rotações de repouso são 0. Posições em metros; pivôs nativos (antes da escala), e a coluna de translação já traz o ×1,4 do `.glb` entregue.
| Nó | Tipo | Pai | Pivô absoluto nativo (x; y; z) | Translação no `.glb` (relativa ao pai, ×1,4) | Conteúdo |
|---|---|---|---|---|---|
| `CritterBoar` | Object3D | — | (0; 0; 0) | — | raiz |
| `Body` | Mesh | `CritterBoar` | (0; 0,36; 0) | (0; 0,504; 0) | tronco, garupa, peito, coxas, crina, cauda com penacho |
| `Head` | Mesh | `Body` | (0; 0,43; 0,25) | (0; 0,098; 0,35) | crânio, focinho, nariz, mandíbula, presas, olhos, orelhas, bochechas, tufo da testa |
| `Snout` | Object3D | `Head` | (0; 0,365; 0,47) | (0; −0,091; 0,308) | âncora (sem geometria): base do focinho |
| `Tusk_L` / `Tusk_R` | Object3D | `Head` | (∓0,056; 0,29; 0,488) | (∓0,078; −0,196; 0,333) | âncoras: raiz de cada presa |
| `Leg_FL` / `Leg_FR` | Mesh | `Body` | (∓0,126; 0,34; 0,19) | (∓0,176; −0,028; 0,266) | pata dianteira + casco (pivô no ombro) |
| `Leg_BL` / `Leg_BR` | Mesh | `Body` | (∓0,108; 0,34; −0,34) | (∓0,151; −0,028; −0,476) | pata traseira + casco (pivô no quadril) |
| `Tail` | Object3D | `Body` | (0; 0,405; −0,575) | (0; 0,063; −0,805) | âncora (sem geometria): raiz da cauda |

**`Snout`, `Tusk_L`, `Tusk_R` e `Tail` são nós vazios.** O orçamento é de 6 draw calls e Body + Head + 4 pernas já fecham 6; por isso as geometrias do focinho, das presas e da cauda foram mescladas em `Head`/`Body` e os nós ficam como âncoras nos pivôs certos (girá-los não move nada). Para ter cauda, focinho e presas independentes use `--split` (10 malhas; no jogo o `skinUnitTemplate` volta a juntar tudo num draw call por material).
**Convenção de rotação testada** (three.js, eixo X): `rotation.x > 0` leva o pé de uma perna para trás (−z) e baixa o focinho; `< 0` faz o contrário. `critter_boar_poses.png` aplica nos pivôs: repouso, andar A/B (pernas ±0,45 rad em diagonais, `Head` ±0,05, `Body` ±0,02), correr (pernas −0,85/+0,7/+0,85/−0,7 em FL/FR/BL/BR, `Head` −0,12, `Body` +0,08 e subida de 3 cm) e pastar (`Head` +0,95 rad): sem fresta nem pata solta nos ombros e quadris.

## 5. Ícone e preview
Mesmo pipeline dos ícones de `public/ui/icons` (`ui_common.py`): render Eevee de 512 px com fundo transparente, luz de 3 pontos (chave quente, preenchimento frio, contraluz), contorno escuro de 6 px (na cena de 512) que vira 1,5 px após a redução por média de bloco para 128 px, cor do contorno `(0,045; 0,055; 0,085)`. O ícone usa câmera ¾ (az −40°, el 14°, fov 22°) e fica de frente para a direita. Para a pelagem não ficar envernizada o preview e o ícone usam rugosidade 0,88 e brilho 0,12 (os outros ícones usam 0,62/0,35). O preview é o render cru, sem contorno. Os dois são produzidos a partir do `.glb` reimportado.

## 6. Conferência no three.js (`critter-boar-check`)
Mesma luz, exposição (ACES 1,38) e câmera do jogo (`core/SceneManager.js`), `GLTFLoader` + `MeshoptDecoder` (o mesmo caminho de `glbModels.js`). O script confere o contrato e sai com código 1 se algo falhar: 11 nós por nome, ≤ 6 malhas, 1 material, ≤ 4 000 tris, textura ≤ 512², sem cor de vértice, patas em y = 0 e tamanho esperado.
**Resultado (2026-10-17, com a escala ×1,4): `VERIFICACAO OK`.** (Antes, no nativo de 2026-10-16: caixa 0,365 × 0,60 × 1,333.) Chromium 153.0.8010.12 com GPU real (ANGLE Vulkan, AMD Radeon RX 7600 XT, RADV): 6 `Mesh`, 1 material, 1 172 tris, textura 512×512, atributos `position`/`normal`/`uv`, 11 nós, caixa 0,511 × 0,84 × 1,866 (patas em y = 0), hierarquia e pivôs iguais à seção 4, sem erro de página nem de console (`critter_boar_check.json` guarda o relatório completo, a GPU e a versão do Chromium). Do lado do Blender, `ORCAMENTO OK` (6 draw calls, 1 172 tris, atlas 512²). **Tamanho em jogo** (`CritterView` aplica ×1,4; unidades ×1,62), largura × altura × comprimento em m:
| Modelo | Tamanho em jogo |
|---|---|
| javali `.glb` (asset ×1,4 + `CritterView` ×1,4) | 0,72 × 1,18 × 2,61 |
| javali procedural (×1,4) | 1,33 × 1,63 × 2,58 |
| ovelha procedural (×1,4) | 1,40 × 1,75 × 2,79 |
| Espadachim (×1,62, com escudo e espada) | 3,36 × 3,36 × 2,79 |
No `critter_boar_close.png` a pelagem aparece um pouco mais clara e quente que no preview do Blender, porque o jogo ilumina mais (sol 2,6 + hemisfério 1,2).

## 7. Decisões, limites e dúvidas
1. **Tamanho (decidido pelo dono em 2026-10-17: ×1,4 na geometria).** A tarefa pedia 1,2 m × 0,6 m (casa com `collisionRadius` 0,6 e com um javali de verdade). O procedural é **2,58 × 1,63 m em jogo** (`CritterView` ×1,4). Com ×1,0 no `.glb`, o javali ficaria com 1,87 m de comprimento em jogo. A opção ×2,0 no `.glb` daria ~3,7 m com o ×1,4 do `CritterView`, então foi descartada. Com ×1,4 no `.glb` e ×1,4 do `CritterView`, o javali fica com **2,61 m de comprimento** (igual ao procedural), 1,18 m de altura e 0,72 m de largura. A altura fica abaixo da do procedural (1,63) porque as proporções do `.glb` são mais baixas.
2. **Draw calls × nós.** Nós vazios para `Snout`/`Tusk_*`/`Tail` (seção 4) para fechar em 6; `--split` entrega a variante de 10 malhas se a animação pedir.
3. **Olhos nas laterais** da cabeça (anatomia), exceção à regra de rosto só na face frontal (precedente: o cavalo do Cavaleiro). O disco do nariz e as narinas estão na face +Z.
4. **Nomes dos nós** seguem a tarefa (`Body`, `Leg_FL`, `Tail`…); a spec de `MUNDO-TERRENO-MAPAS.md` §5 cita a rotina do `UnitAnimator` com `Torso`/`LegFL`: o animador de critters (ou um ramo novo no `UnitAnimator`) precisa mapear os nomes.
5. **Sem animação** nem variação por instância: todos os javalis têm as mesmas manchas (para variar, dá para tingir por instância depois).
6. **Atlas 512²** com muitas ilhas pequenas (pirâmides da crina e cerdas); de muito perto os detalhes miúdos ficam suaves.
7. Os ícones e o preview usam a luz do pipeline de arte 2D (Eevee), não a do jogo.
8. O `.glb` ainda não passou pelo `ModelFactory` nem pelo inspetor (não está registrado): a conferência da seção 6 usa o mesmo `GLTFLoader` com meshopt, mas numa página própria.

## 8. Trechos do registro (histórico; o código vigente está em `src/entities/glbModels.js` e `src/inspector/inspector.js`)
`src/entities/glbModels.js`, em `GLB_MODELS` (fora de `FACTION_OVERRIDES`/`UNITS`/`BUILDINGS`, então `glbFaction` devolve `'neutral'` e é sempre carregado; +123 KB no preload):
```js
  // ART-04: javali (critter neutro)
  critter_boar: { url: `${BASE}models/critter_boar.glb`, root: 'CritterBoar', type: null },
```
`src/inspector/inspector.js`, em `MODEL_CATALOG` (ao lado das outras entradas de `environment`):
```js
  {
    id: 'critter_boar_glb',
    name: 'Javali (Blender)',
    category: 'environment',
    faction: 'neutral',
    type: 'nature',
    icon: '\u{1F417}', // emoji de javali (as outras entradas usam o emoji literal)
    glb: 'critter_boar',
    sourceFile: 'tools/blender/build_critter_boar.py',
    create: createGlb('critter_boar'),
    description: 'Javali selvagem neutro gerado pelo pipeline Blender (public/models/critter_boar.glb): tronco em cunha, crina de cerdas, cabeça com focinho de disco rosado e presas curtas, orelhas eretas, pernas curtas com cascos, rabo fino. Pelagem marrom-escura com manchas claras. Pose de repouso (sem animação).',
    notes: '6 draw calls (Body, Head e 4 pernas; 1 material Atlas), 1 172 triângulos, atlas 512², ~121 KB, 1,20 × 0,60 × 0,37 m, frente em +Z. Nós: CritterBoar > Body > Head (Snout, Tusk_L, Tusk_R vazios), Leg_FL/FR/BL/BR, Tail (vazio). L = −x. Substituirá o critter procedural de CritterModel.js.'
  },
```
`tools/blender/README.md`, na tabela de scripts:
```
| `build_critter_boar.py` | `public/models/critter_boar.glb`, `public/icoJavali.png` | Javali selvagem neutro (ART-04): tronco em cunha, crina de cerdas, presas curtas, pelagem com manchas claras; rig aninhada `Body` > `Head`, `Leg_FL/FR/BL/BR` (+ âncoras `Snout`, `Tusk_L/R`, `Tail`); 6 draw calls, 1,2 mil tris, atlas 512², ~121 KB; `--split` gera a variante de 10 malhas; também renderiza o ícone 128 e o preview 512 |
```

## 9. O que falta para o GLB substituir o procedural no jogo (integração futura, não é desta entrega)
1. Registro em `GLB_MODELS`: feito na integração ART-P0 (`lazy: true`).
2. `ModelFactory.createCritter(species)` (`src/entities/ModelFactory.js`): para `boar` (e o alias `pig`, que já vira `boar`) usar `this._glbOr('critter_boar', procedural)`, mantendo o procedural como reserva (`?glb=0` ou falha de rede) e como modelo da ovelha. O `createUnit` já chama `createCritter` nos casos `sheep`/`boar`/`pig`.
3. `CritterView` (`src/render/CritterView.js`): mantém o ×1,4 para todas as espécies (o `.glb` já sai ×1,4, seção 7; não precisa de fator por espécie). `Critter.die()` tomba o corpo com `rotation.z = π/2` em torno da origem e sobe 0,25: com o `.glb` em ×1,96 sobre o nativo (×1,4 × ×1,4), a meia largura é 0,18 × 1,96 ≈ 0,36 e a carcaça afunda ~0,11 (0,36 menos 0,25). Ajustar o deslocamento na integração.
4. Draw calls: o `.glb` tem 6 por instância (12 com a sombra). Como os critters hoje não animam, as malhas do template podem ser mescladas por material (ex.: `mergeStaticTemplate(template, { keep: [] })` de `src/render/mergeStaticTemplate.js`; `prepareStaticTemplate` só roda para templates procedurais) e virar 1; com animação, `skinUnitTemplate`.
5. Animação (andar, pastar, correr/pânico): não há animador de critters (`CritterView` só copia a pose do corpo de simulação). Mapear `Critter.state` (`idle`, `walking`, `fleeing`, `dead`) em rotações nos nós da seção 4; amplitudes testadas na seção 4. Cauda/focinho/presas independentes exigem `--split`.
6. Ícone: `src/data/buildings.js` (`pig_farm`, `icon: '/icoPorco.svg'`) e `tools/check-data-parity.mjs` (linha do `pig_farm`) passam a `/icoJavali.png` junto com a mudança de nome para "Chiqueiro/Cercado de Javalis" (ART-12); manter o mesmo padrão de caminho dos outros ícones.
7. Inspetor: a entrada nova faz o `npm run visual` falhar com "sem baseline" até gravar o alvo: `bash tools/safe-run.sh --timeout 1800 -- node tools/visual-regress.mjs --update --only 'inspector/critter_boar_glb'`.
8. Docs: feito na integração ART-P0 (`docs/03_ASSETS_E_INSPETOR.md` e `docs/TASKS.md`).
