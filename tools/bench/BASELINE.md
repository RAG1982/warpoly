# Baseline de desempenho — F0-04 (2026-09-28)

Arquivo bruto: `tools/bench/results/baseline-2026-09-28.json` (commit base `9f6cb7d`).

## Condições

| Item | Valor |
|---|---|
| Navegador | Chromium 153.0.8010.12 (Playwright 1.63), **com janela** (headed, `DISPLAY=:0`) |
| Flags | `--enable-gpu --ignore-gpu-blocklist --use-angle=vulkan --enable-features=Vulkan --disable-vulkan-surface --disable-frame-rate-limit --disable-gpu-vsync` |
| GPU (WEBGL_debug_renderer_info) | ANGLE (AMD, Vulkan 1.4.318, **AMD Radeon RX 7600 XT** (RADV NAVI33)) — WebGL 2 |
| Resolução / DPR | viewport 1280×720, DPR 1 (drawing buffer 1280×720) |
| CPU | 28 threads lógicas (`navigator.hardwareConcurrency`) |
| Servidor | dev server Vite (`npx vite --port 5175 --strictPort`), cache de transformação aquecido por uma carga prévia |
| Janela de medição | 2 s de aquecimento + 10 s medidos, IA pausada, seed fixa `0x5eed1234`, câmera fixa por cenário |

## Resultados

| Métrica | inicial | combate100 | massa300 |
|---|---:|---:|---:|
| Unidades (jogador + inimigo) | 5 + 5 | 55 + 55 | 155 + 155 |
| **FPS médio** | **15,7** | **5,3** | **1,6** |
| FPS 1% low ¹ | 4,6 | 3,7 | 1,0 |
| Frame time médio (ms) | 63,9 | 189,4 | 620,3 |
| Frame time p99 (ms) | 100,9 | 272,8 | 966,7 |
| `gameManager.update` médio (ms/frame) | 0,28 | 4,82 | 7,29 |
| **Draw calls / frame** (médio) | **8 691** | **25 982** | **56 240** |
| Triângulos / frame (médio) | 4,91 M | 5,22 M | 5,76 M |
| Geometrias vivas | 2 652 | 2 816 | 2 689 |
| Texturas vivas | 289 | 446 ² | 371 |
| Programas de shader | 141 | 145 | 146 |
| Heap JS usado (MB) | 124,0 | 134,0 | 156,1 |
| Load: navegação → jogo pronto (ms) ³ | 7 725 | 7 603 | 6 725 |
| Setup do cenário (ms) | 0 | 96 | 370 |
| Objetos na cena (`scene.traverse`) | 5 890 | 14 934 | 32 005 |

¹ Média do 1 % de frames mais lentos, convertida em FPS. Com poucos frames na janela (157 / 53 / 17), o "1 %" é o(s) pior(es) frame(s) — em FPS baixos é pouco estável.
² Texturas crescem durante o combate: textos flutuantes criam `CanvasTexture` novas a cada acerto (item 6 do diagnóstico).
³ `performance.now()` no fim de `GameApp.init()` (inclui o preload procedural das texturas). Medido em dev server; o build de produção deve ser diferente.

### Leitura rápida
- O gargalo é **render/CPU de submissão**, não a simulação: em `massa300` o frame leva ~620 ms e `gameManager.update` só ~7 ms. Draw calls escalam ~170 por unidade (hierarquias não mescladas + passada de sombra).
- Triângulos quase não mudam entre cenários (a cena estática já tem ~4,9 M); o custo por unidade é de draw calls, não de geometria.
- Heap e texturas sobem com o combate (textos flutuantes e projéteis).

## Headless × com janela
Na mesma máquina, `npm run bench -- --headless` (arquivo local `headless-2026-09-28.json`, não versionado) também usou a GPU real via ANGLE/Vulkan e deu números equivalentes: FPS 15,6 / 5,0 / 1,6, draw calls 8 676 / 25 806 / 56 407, load ~5,0–5,3 s.

**Atenção**: em headless *sem GPU* (CI, containers, máquinas sem Vulkan) o Chromium cai para SwiftShader (render por software) — aí **FPS e frame time não são representativos**. Draw calls, triângulos, geometrias, texturas, programas, heap e load continuam válidos para comparação. Sempre confira `env.gpu.renderer` no JSON antes de comparar FPS.

## Como rodar
```bash
npm run bench                                   # todos os cenários, com janela se houver display
npm run bench -- --headless                     # headless
npm run bench -- --scenarios=combate100 --duration=10 --warmup=2 --screenshot
# manual: abra http://localhost:5175/?bench=massa300 e veja o overlay / window.__bench / console "BENCH_RESULT"
```
O runner sobe o dev server na porta 5175 se nada estiver respondendo e grava `tools/bench/results/<AAAA-MM-DD-HHMM>.json` (use `--out=<nome>` para fixar o nome; só `baseline-*.json` é versionado).

## Cenários
- **inicial**: cena padrão (câmera na base do jogador, zoom 1).
- **combate100**: 50 unidades por lado (70 % corpo a corpo, 30 % à distância) em disco de raio 6 em (5,−5) e (−5,5), ordens de ataque cruzadas; unidades ociosas recebem novo alvo a cada 30 frames. Câmera em (0,0), zoom 1.
- **massa300**: 150 por lado em posições aleatórias em [−50,50]², cada uma com destino aleatório; ociosas recebem novo destino a cada 60 frames. Câmera em (0,0), zoom 1,8 (máximo).

Limitações: a simulação ainda usa `Math.random()` (bug B14), então só o *setup* é determinístico; a névoa de guerra não é alterada (inimigos em área não explorada podem ficar ocultos).
