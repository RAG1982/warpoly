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
| B8 | ~~Pathfinding ignora construções e árvores → unidades "deslizam" empurradas e travam em bases~~ **Corrigido na F1-07**: camada dinâmica (`dynamicBlock`) marcada por `GameManager` em `blockCircle`; A* contorna construções e árvores vivas | `Pathfinder.blockCircle` |
| B9 | IA onisciente (lê posições reais do jogador ignorando névoa) | `ai/*` |
| B10 | Não é possível selecionar/inspecionar unidades inimigas | `GameManager.selectSingle` |
| B11 | ~~HUD inferior cortada em 1024×768 (card de seleção sai da tela, minimapa sobreposto)~~ **Corrigido na F6-03** (validação visual pendente localmente): `#bottom-bar` virou grid de 3 colunas (`minmax(0,1fr)` no card) em vez de 3 blocos com `position:fixed`/`left` absolutos; `--ui-scale` e `@media (max-width: 1100px)` | `style.css`, `src/ui/uiScale.js` |
| B12 | ~~Textos misturados PT/EN ("Constructed!", "GLORIOUS VICTORY", "+3 Gold", nomes de unidades em inglês)~~ **Corrigido na F6-09**: todo texto da UI/HUD/menus/guia/alertas/textos flutuantes vem de `src/i18n` (pt-BR + en, seletor em Opções); teste de guarda impede PT-BR literal na UI. Fora do escopo: o inspetor 3D (`inspector.html`), `BINDING_LABELS` (core) e os literais PT da própria `src/sim` (traduzidos na exibição) | `src/i18n/`, `src/ui/uiText.js` |
| B13 | ~~`EnemyAI.js` e `GLTFBuildingLoader.js` mortos; `Unit.js` importa animador de `src/inspector/`~~ **Corrigido na F2-07**: `EnemyAI.js` já não existe (removido na F0-03); `UnitAnimator` mora em `src/animation/UnitAnimator.js`, `Unit.js`/`inspector.js` importam de lá (`src/inspector/unitAnimator.js` é reexport de 1 linha). `GLTFBuildingLoader.js` continua vivo (usado por `GreatHall.js`) — não estava morto, a nota original é que estava desatualizada | core |
| B14 | ~~`Math.random()` usado em 69 pontos da simulação — impossibilita replays/multiplayer determinístico~~ **Corrigido na F2-03**: RNG de simulação com seed (`gm.rng`/`fork`, `src/sim/rng.js`) separado do RNG visual; `Math.random` só sobra onde comentado `// visual: não afeta o estado`; checksum (`src/sim/checksum.js`) + testes de determinismo (`tests/unit/determinism.test.js`, 12 000 ticks) provam a paridade entre execuções | core/entities/ai |
| B15 | Barra de vida HTML inicial "5 / 15" diverge do cap real 10 até o 1º update | `index.html` |
| B16 | ~~Minimapa desenha rio/vaus com fórmula própria (difere do terreno real)~~ **Corrigido na F2-05**: o terreno do minimapa é renderizado a partir da altura real (`terrain.getHeight`, mesma fonte da malha 3D), num canvas offscreen pré-renderizado 1×/partida (`terrainMinimapImage.js`). Retângulo de câmera de tamanho fixo (16×12 px) não mudou — fora do escopo da F2-05 | `UIManager.drawMinimap` |
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

## Baseline 2026-10 (M1-03, `tools/bench/m1-03.mjs`)

Medição de 2026-10-17, máquina quieta (nenhum soak nem outro agente; só o Chrome do dono aberto), RX 7600 XT via ANGLE/Vulkan (RADV), Chromium 153 **com janela**, vite próprio na porta 5301 (dev server), mapa padrão `continental-1v1`, `?quality=high` (bloom + SSAO + color grading + contorno de seleção ligados, sombras 2048, textura `high`), IA pausada, seed fixa do bench. **Resolução dinâmica desligada** (override `dynamicResolution:false`, pixelRatio fixo 1,0) para o FPS ser comparável; a parte B repete com o padrão do preset. Cada configuração: 1 execução descartada + **3 medidas** (cada uma com 3 s de aquecimento descartados e 10 s medidos). Brutos versionados: `tools/bench/results/baseline-2026-10-{A..I}.json`. `tests/perf/baseline.json` **não** foi regravada (M1-09).

> **Correção do instrumento.** Com pós-processamento ligado um quadro tem várias chamadas a `renderer.render` e `renderer.info.render.calls` guardava só a última: o bench lia "1 draw call" (era o `drawCalls:1` das capturas da M1-01). `src/debug/bench.js` (versão 2) agora **soma as passadas** do quadro e registra preset/efeitos/pixelRatio e o tempo de CPU em `renderer.render`. Os draw calls abaixo valem para o quadro inteiro (sombras + passada principal + passada de normais do SSAO + efeitos); não são comparáveis com a tabela da seção 5 (dev server, antes das otimizações da F1, sem pós-processamento).

### Tabela principal (1280×720, preset high, dynRes desligada, média de 3 execuções)

| Cenário | LOD | FPS médio (mín–máx) | 1% low | frame ms (p99) | sim ms | draw calls | triângulos | heap MB | load ms |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| inicial | ligado | 160,5 (155,8–165,0) | 124,5 | 6,2 (7,3) | 0,04 | 533 | 0,86 M | 123 | 4 426 |
| inicial | `?lod=0` | 154,7 (151,6–157,4) | 114,9 | 6,5 (7,8) | 0,04 | 541 | 0,86 M | 118 | 4 348 |
| combate100 | ligado | **42,6** (41,5–43,9) | 24,6 | 23,5 (36,2) | 0,78 | 4 406 | 2,82 M | 130 | 4 454 |
| combate100 | `?lod=0` | 42,0 (41,0–42,9) | 27,0 | 23,8 (35,0) | 0,79 | 4 492 | 2,84 M | 132 | 4 482 |
| massa300 | ligado | **16,2** (16,0–16,4) | 9,8 | 61,7 (86,3) | 3,68 | 12 693 | 7,61 M | 131 | 4 461 |
| massa300 | `?lod=0` | 16,4 (16,4–16,4) | 10,4 | 60,9 (87,2) | 3,45 | 12 719 | 7,72 M | 140 | 4 368 |

Com a resolução dinâmica **ligada** (padrão do preset; o pixelRatio caiu para 0,95): combate100 41,7 FPS (40,3–43,1), massa300 15,9 FPS (15,3–16,4): sem diferença útil. Texturas vivas 72 / 106 / 110 e geometrias 155 / 258 / 340 (inicial / combate100 / massa300). Load = tempo de navegação até o jogo pronto (dev server, cache do vite quente).

**Vereditos (F1-10c).** massa300 ≥ 45 FPS: **NÃO** (16,2; com ou sem LOD). combate100 ≥ 50 FPS: **NÃO** (42,6; sem SSAO passa: 70,5). O LOD **não** mudou nada mensurável (diferenças dentro do ruído: ±0,2 % em draw calls, FPS 16,2×16,4 e 42,6×42,0). Hipótese (não verificada): o enquadramento do bench (zoom 1,0–1,8) mantém as unidades a menos de 90 u do alvo da câmera, abaixo do limiar do LOD de unidades (`LOD_DISTANCES.unit`); um bench com a câmera mais afastada diria se o LOD ajuda. A meta de 55 FPS do preset não é atingida em combate.

### Decomposição do frame (1280×720, high, 3 execuções cada; "render CPU" = tempo dentro de `renderer.render`)

| Cenário | Variante | FPS | frame ms | sim ms | render CPU ms | draw calls | triângulos |
|---|---|---:|---:|---:|---:|---:|---:|
| massa300 | padrão | 16,4 | 61,2 | 3,6 | 47,8 | 12 652 | 7,6 M |
| massa300 | `?fx=-ssao` | 28,4 | 35,2 | 2,1 | 25,0 | 6 328 | 3,8 M |
| massa300 | `?fx=0` (sem pós-proc.) | 28,2 | 35,4 | 2,1 | 25,2 | 6 354 | 3,8 M |
| massa300 | sombras desligadas | 24,9 | 40,2 | 2,3 | 29,1 | 6 816 | 3,9 M |
| massa300 | 640×360 | 16,4 | 60,9 | 3,5 | 47,6 | 12 657 | 7,6 M |
| combate100 | padrão | 42,8 | 23,3 | 0,76 | 17,7 | 4 394 | 2,8 M |
| combate100 | `?fx=-ssao` | 70,5 | 14,2 | 0,46 | 9,4 | 2 147 | 1,4 M |
| combate100 | `?fx=0` | 71,8 | 13,9 | 0,45 | 9,3 | 2 203 | 1,4 M |
| combate100 | sombras desligadas | 60,3 | 16,6 | 0,53 | 11,5 | 2 514 | 1,4 M |
| combate100 | 640×360 | 41,1 | 24,4 | 0,80 | 18,6 | 4 526 | 2,9 M |
| massa300 | `?fx=-ssao` + sombras desligadas | 40,5 | 24,7 | 1,4 | 15,8 | 3 403 | 1,9 M |
| combate100 | `?fx=-ssao` + sombras desligadas | 95,3 | 10,5 | 0,33 | 6,0 | 1 259 | 0,7 M |

Leitura: o frame é **limitado pela CPU de submissão** (massa300: 47,8 ms de 61,2 ms dentro de `renderer.render`; baixar a resolução para 640×360 não muda o FPS; a simulação custa só 3,6 ms). Ao tirar o SSAO o frame de massa300 cai de 61 para 35 ms e o de combate100 de 23 para 14 ms, porque o SSAO **renderiza a cena inteira uma segunda vez** (passada de normais: os draw calls caem pela metade). Bloom/color grading/contorno juntos custam ~0 (`fx=0` ≈ `fx=-ssao`).

**Os 3 maiores custos medidos (alimentam a M5-03):**
1. **Quantidade de draw calls por unidade** (~40 por unidade: 12,7 k em massa300, 4,4 k em combate100; inicial 533): submissão de CPU, 78 % do frame de massa300. Só cai com menos objetos por unidade (atlas/mesclagem, instancing, VAT: NEW-15/NEW-14).
2. **Passada de normais do SSAO** (duplica a geometria): −26 ms em massa300 (61→35), −9 ms em combate100 (23→14). Um SSAO barato (depth-only/baixa resolução) ou só em `ultra` passa combate100 de 43 para ~70 FPS.
3. **Passada de sombras** (as sombras também redesenham todas as unidades): −21 ms em massa300 (61→40, 16→25 FPS), −7 ms em combate100 (23→17, 43→60 FPS). Candidatos: `shadowUpdateInterval`, sombra só para unidades próximas/LOD de sombra, instancing dos casters.
Fora do pódio: simulação (6 % do frame de massa300), resolução (irrelevante), LOD atual (sem efeito no enquadramento do bench). Medido somando (2) e (3): sem SSAO **e** sem sombras massa300 chega a 40,5 FPS (ainda < 45) e combate100 a 95,3 FPS; portanto combate100 ≥ 50 se resolve só com SSAO barato ou sombras mais baratas, e massa300 ≥ 45 exige também atacar (1).

### SSAO a 1920×1080, `?texq=high` (insumo da M5-03)

| Cenário | Efeitos | FPS médio (mín–máx) | frame ms | draw calls | triângulos |
|---|---|---:|---:|---:|---:|
| inicial | padrão (com SSAO) | 159,6 (155,5–164,2) | 6,3 | 545 | 0,84 M |
| inicial | `?fx=-ssao` | 224,6 (215,9–229,8) | 4,5 | 276 | 0,44 M |
| inicial | `?fx=0` | 236,6 (235,0–238,8) | 4,2 | 262 | 0,43 M |
| combate100 | padrão (com SSAO) | 41,8 (39,5–43,3) | 24,0 | 4 501 | 2,85 M |
| combate100 | `?fx=-ssao` | 71,0 (69,4–73,0) | 14,1 | 2 197 | 1,40 M |
| combate100 | `?fx=0` | 71,6 (71,0–72,3) | 14,0 | 2 212 | 1,41 M |

O SSAO custa **1,8 ms** em cena leve e **~10 ms** em combate100 (+70 % de FPS ao desligá-lo), e quase todo esse custo é a segunda passada de geometria; a 1080p o custo de resolução é desprezível (1280×720 deu os mesmos 42,6→70,5 FPS).

**Os 13,5 FPS da M1-01 não se reproduzem.** Réplica (`duelo-continental-1`, 1080p, `texq=high`, jogo "vivo" com IA e névoa, câmera na base e panorama, 3 execuções, `tools/bench/results/baseline-2026-10-G.json`): com janela e sem limite de quadros, base 111,1 FPS (109,8–112,4) com SSAO × 136,4 (135,2–138,7) com `?fx=-ssao`; panorama 108,4 × 133,6. Em headless com as flags da M1-01 (vsync ligado) os dois dão 60 FPS cravados. Portanto os 13,5 FPS da captura da M1-01 vieram do estado daquela sessão (35 quadros em 3,5 s, logo após screenshots/mina desabando/trocas de câmera, inclui compilação de shaders) e **não** do SSAO em regime; o SSAO custa ~19 % do tempo de quadro no mapa de duelo e ~40 % em combate pesado. Para a M5-03: não há "13,5 FPS" a corrigir; há uma passada duplicada de geometria a tornar barata.

### Draw calls dos neutros (NEW-27; 1280×720, high, 3 amostras de 180 quadros por ponto, névoa desligada para revelar o acampamento)

"Ocultos" = as views de neutros (8 bandidos, 2 acampamentos `bandit_camp`, 18 critters, 2 jazidas) com `visible=false` só durante o `render`; mesma câmera, mesma cena.

| Vista (câmera zoom 1,0) | neutros visíveis | neutros ocultos | custo dos neutros |
|---|---:|---:|---:|
| acampamento neutro 1 (40, 20) | 1 103 | 711 | **+392** (+55 %) |
| acampamento neutro 2 (−40, −20) | 815 | 437 | +378 |
| controle: base do jogador (32, −30) | 921 | 587 | +334 |
| controle: centro (0, 0) | 1 066 | 646 | +420 |
| mesmos pontos com `?lod=0` | 1 132 / 826 / 904 / 1 056 | 739 / 449 / 590 / 648 | +393 / +377 / +314 / +408 |

Confirma o NEW-27 (997→1 387 = +390): o custo é de ~330–420 draw calls **com a câmera em qualquer lugar**, mesmo longe dos neutros, ou seja, não é só "o acampamento na tela". Decomposição no acampamento 1 (calls ocultando só o grupo): bandidos −219 (8 unidades, ~27 calls cada), critters −146 (18, ~8 cada), acampamentos −8, jazidas −5; na base: bandidos −147, critters −139. Origem: com sombras e SSAO desligados o custo dos neutros cai para +69 (acampamento) / +39 (base); só sem sombras, +145 / +88. Ou seja, a maior parte vem das **passadas de sombra e de normais do SSAO**, que desenham os neutros mesmo fora do enquadramento da câmera. Os neutros têm ~27 calls por bandido e ~8 por ovelha/porco (instanciar critters e mesclar o bandido são os ganhos baratos).

### Reproduzir
```bash
bash tools/safe-run.sh --timeout 1500 -- node tools/bench/m1-03.mjs --part=A   # A..J (ver cabeçalho do script)
```
