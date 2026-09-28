# 04 — Diagnóstico Profundo (2026-09-28)

Medições feitas no navegador embutido, 1024×768, DPR 1, GPU **AMD Radeon RX 7600 XT**, cena inicial (5 unidades por lado, 7 construções, 70 árvores).

## 1. Desempenho — CRÍTICO

| Métrica | Medido | Meta AAA-browser |
|---|---|---|
| FPS | **~10** | 60 (144 em GPU boa) |
| Draw calls / frame | **8 253 – 9 572** | < 500 com 200 unidades |
| Triângulos / frame (c/ sombra) | 4,9 M | < 1,5 M |
| Meshes na cena | 5 555 (5 358 projetam sombra) | < 800 objetos |
| Programas de shader | 139 | < 40 |
| Texturas vivas | 289 (quase todas 2048²) | < 80, ≤ 512² |
| Tempo de carregamento | ~30 s (pintura procedural) | < 5 s |

Causas raiz, em ordem de impacto:
1. **Hierarquias não mescladas** — cada parafuso/tábua é um `Mesh` (castelo 487, Grande Salão 740). Com sombra, cada um custa 2 draw calls.
2. **Sombras em tudo** — `enableShadows` liga cast/receive em todo filho; shadow camera fixa 180×180.
3. **Texturas 2048² procedurais** pintadas na thread principal durante o load, 4 mapas por material.
4. **Materiais demais** (14–35 por modelo, muitos quase idênticos) ⇒ 139 programas e trocas de estado.
5. **CPU**: ~~colisão unidade×unidade O(n²), unidade×(todas construções+árvores+depósitos) por frame; alvo/aggro faz varredura linear de todas as unidades por unidade (O(n²)); `raycastScene` reconstrói lista e faz raycast recursivo em ~5 000 meshes a cada mousemove~~ **Resolvido na F1-06**: `SpatialGrid` (`src/sim/SpatialGrid.js`, `gm.unitGrid`/`gm.blockerGrid`) substitui as varreduras lineares em colisão, alvo/aggro, colocação de construção e picking do mouse — ver `docs/01_ARQUITETURA.md`. A* com open set em array + `includes` (O(n²)) continua em aberto (fora do escopo da F1-06).
6. **Alocações por frame**: `new THREE.Vector3` em loops quentes, canvas+`CanvasTexture` novo por texto flutuante (cada acerto), projétil de machado cria material/geometria novos e nunca os descarta (vazamento de GPU).
7. **Sem timestep fixo** — simulação acoplada ao FPS; em 10 FPS a física e a IA ficam imprecisas.

## 2. Bugs e inconsistências de lógica

| # | Problema | Onde |
|---|---|---|
| B1 | ~~Névoa: inimigos ficam visíveis para sempre em área já explorada (usa `isExplored`, não `activeVision`)~~ **Corrigido na F1-05**: `cullHiddenEnemies` usa `activeVision` (visão atual), não memória | `FogOfWar.cullHiddenEnemies` |
| B2 | ~~Névoa é um plano a y=5,2: árvores/torres atravessam a névoa, unidades sob a névoa aparecem nas bordas~~ **Corrigido na F1-05**: névoa aplicada no shader dos materiais (sem plano sobreposto), objetos escondidos por origem no vertex shader | `src/render/fogOfWarShader.js` |
| B3 | ~~Custos da IA divergem da tabela real (ranged IA: 60 madeira/35 ouro vs real 20/40) — IA decide com base errada~~ **Corrigido na F0-06**: `AIDirector.costs` agora é derivado de `src/data/` | `AIDirector.costs` vs `UNIT_TRAIN_CONFIG` |
| B4 | ~~Custos de construção duplicados 3× (`BUILDING_BUILD_CONFIG`, `getBuildingStats`, `InputManager.getCost`)~~ **Corrigido na F0-06**: fonte única em `src/data/buildings.js` | vários |
| B5 | Construções ignoram armadura; upgrades de defesa não afetam construções/torres | `Building.takeDamage` |
| B6 | Assimetria: Chiqueiro dá +5 pop e ouro, Fazenda humana só ouro; humanos sem 3ª unidade militar | configs |
| B7 | ~~`resetMap` não reseta pesquisas, projéteis, `gameTime`, filas; reinício real exige `location.reload()`~~ **Corrigido (F2-04)**: cada partida é uma `MatchSession` descartável criada do zero a partir da `MatchConfig`; Reiniciar/Jogar novamente/Menu não recarregam a página | `GameManager.resetMap`, `UIManager` |
| B8 | Pathfinding ignora construções e árvores → unidades "deslizam" empurradas e travam em bases | `Pathfinder.buildGrid` |
| B9 | IA onisciente (lê posições reais do jogador ignorando névoa) | `ai/*` |
| B10 | Não é possível selecionar/inspecionar unidades inimigas | `GameManager.selectSingle` |
| B11 | HUD inferior cortada em 1024×768 (card de seleção sai da tela, minimapa sobreposto) | `style.css` |
| B12 | Textos misturados PT/EN ("Constructed!", "GLORIOUS VICTORY", "+3 Gold", nomes de unidades em inglês) | vários |
| B13 | `EnemyAI.js` e `GLTFBuildingLoader.js` mortos; `Unit.js` importa animador de `src/inspector/` | core |
| B14 | `Math.random()` usado em 69 pontos da simulação — impossibilita replays/multiplayer determinístico | core/entities/ai |
| B15 | Barra de vida HTML inicial "5 / 15" diverge do cap real 10 até o 1º update | `index.html` |
| B16 | Minimapa desenha rio/vaus com fórmula própria (difere do terreno real) e retângulo de câmera fixo | `UIManager.drawMinimap` |
| B17 | `dist/` versionado no git e dezenas de screenshots/PNGs de referência soltos na raiz | repo |

## 3. Lacunas frente a um RTS AAA

**Jogabilidade**: sem grupos de controle, attack-move, stop/hold/patrol, shift-queue, habilidades, tiers de tecnologia, unidades de cerco reais, cavalaria, curandeiros/magos, muralhas/portões, creeps neutros, heróis, tipos de dano/armadura, contra-unidades claras, veterania.

**Conteúdo**: 1 mapa fixo, 1 modo (1×1 vs IA), sem campanha, sem missões/objetivos, sem progressão.

**IA**: 1 nível, sem estratégias/build orders, sem micro, sem scout, sem FFA/aliados.

**Menus/UX**: sem menu principal, escolha de facção só por URL, sem tela de lobby/setup, sem opções gráficas, sem remapeamento de teclas, sem tela de estatísticas pós-jogo, sem tutorial jogável, sem cursores contextuais, sem alertas "sob ataque" com ping, sem i18n.

**Tecnologia**: sem IDs de entidade, sem sistema de comandos, sem N jogadores, sem save/load, sem determinismo, sem testes, sem lint, sem métricas de desempenho automatizadas.

**Multiplayer**: inexistente; a arquitetura atual (2 lados hardcoded, simulação não determinística, ordens executadas diretamente) precisa das tarefas CORE antes.

## 4. Pontos fortes a preservar

- Direção de arte stylized low-poly coesa e bonita (vide `docs/reference/modelo.png`), UI dourada com identidade.
- Zero dependência de assets externos → build pequeno e totalmente versionável.
- Inspetor 3D excelente como ferramenta de produção — deve virar parte do pipeline (perf, team color, LOD).
- IA utilitária já modular (Director + Economy + Military) — boa base para dificuldades.
- Áudio procedural leve.
- Instancing já aplicado a árvores e decorações (padrão a replicar).

## 5. Baseline oficial (F0-04, `npm run bench`)

Chromium 153 com janela, RX 7600 XT via ANGLE/Vulkan, 1280×720, DPR 1, dev server. Detalhes: `tools/bench/BASELINE.md`.

| Métrica | inicial | combate100 | massa300 |
|---|---:|---:|---:|
| Unidades | 5+5 | 55+55 | 155+155 |
| FPS médio | 15,7 | 5,3 | 1,6 |
| Frame time médio (ms) | 63,9 | 189,4 | 620,3 |
| `gm.update` médio (ms) | 0,28 | 4,82 | 7,29 |
| Draw calls/frame | 8 691 | 25 982 | 56 240 |
| Triângulos/frame | 4,91 M | 5,22 M | 5,76 M |
| Texturas | 289 | 446 | 371 |
| Heap JS (MB) | 124 | 134 | 156 |
| Load (ms) | 7 725 | 7 603 | 6 725 |

Conclusão: o gargalo é **draw call** (~170 por unidade), não a simulação (`gm.update` ≈ 7 ms com 310 unidades). As texturas crescem em combate por causa dos textos flutuantes (item 6).
