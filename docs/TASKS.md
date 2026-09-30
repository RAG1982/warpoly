# TASKS — Lista de tarefas controlada do WarPoly AAA

> **Fonte única de verdade da execução.** Todo agente (humano ou IA) lê este arquivo antes de começar e o atualiza ao iniciar/terminar uma tarefa.
> Contexto obrigatório: [01_ARQUITETURA](01_ARQUITETURA.md) · [02_MECANICAS](02_MECANICAS.md) · [03_ASSETS](03_ASSETS_E_INSPETOR.md) · [04_DIAGNOSTICO](04_DIAGNOSTICO.md) · [05_PARIDADE_WC2](05_PARIDADE_WARCRAFT2.md) · [06_ROADMAP](06_ROADMAP_AAA.md)

---

## Protocolo de execução

**Status**: `TODO` → `DOING(<agente>, <AAAA-MM-DD>)` → `REVIEW` → `DONE(<commit>)` · também `BLOCKED(<motivo>)`.

1. **Pegar tarefa**: só pegue uma tarefa `TODO` cujas dependências estejam todas `DONE` e cuja **lane** não tenha outra tarefa `DOING` que toque os mesmos arquivos (ver matriz de posse). Troque o status para `DOING(...)` e faça commit só dessa linha *antes* de começar.
2. **Isolamento**: trabalhe numa branch/worktree `task/<ID>` (ex.: `task/F1-02`). Nunca edite arquivos de outra lane sem registrar em "Notas de integração" ao final.
3. **Verificar**: rode `npm run build` (e `npm run lint`/`npm test`/`npm run bench` quando existirem — F0-04/F0-05). Para mudanças visuais, abra o jogo e o inspetor e compare. Registre números de antes/depois quando a tarefa tiver meta mensurável.
4. **Entregar**: status → `REVIEW`, descreva em 1–3 linhas no campo *Resultado*. Após merge em `master`, status → `DONE(<hash>)`.
5. **Docs**: se mudou arquitetura, mecânica ou assets, atualize o doc correspondente no mesmo commit.
6. **Nunca** remova tarefas; se for descartada, marque `DROPPED(<motivo>)`. Tarefas novas descobertas vão para a seção "Backlog descoberto" com ID provisório.

### Lanes (trilhas paralelas) e agentes

| Lane | Agente | Escopo / arquivos que "possui" |
|---|---|---|
| **FOUND** | agente-fundacao | raiz do repo, `package.json`, configs, `docs/`, `tools/`, `src/data/` (na F0) |
| **PERF** | agente-perf | `src/models/**`, `ModelFactory.js`, `AssetPreloader.js`, `SceneManager.js`, `FogOfWar.js`, `Pathfinder.js`, `ParticleSystem.js`, `Arrow.js`, `world/**` |
| **CORE** | agente-core | `GameManager.js`, `Unit.js`, `Building.js`, `main.js`, novo `src/sim/**`, `src/data/**` (após F0) |
| **GAME** | agente-gameplay | `InputManager.js`, novos sistemas em `src/sim/systems/**`, `src/data/**` (conteúdo de unidades/construções) |
| **AI** | agente-ia | `src/ai/**` |
| **UI** | agente-ui | `index.html`, `style.css`, `src/ui/**`, novos `src/ui/screens/**` |
| **ART** | agente-arte | `src/models/**` (modelos novos/fidelidade), `src/inspector/**`, `specs/**` |
| **AUDIO** | agente-audio | `SoundManager.js`, novo `src/audio/**` |
| **CONTENT** | agente-conteudo | `src/data/maps/**`, `src/data/campaign/**`, editor de mapas |
| **NET** | agente-rede | `src/net/**`, `server/**` |
| **QA** | agente-qa | `tests/**`, `tools/bench/**`, CI |

> PERF e ART compartilham `src/models/**`: nunca rodar tarefas das duas lanes no **mesmo arquivo de modelo** ao mesmo tempo.
> Agentes recomendados: tarefas de pesquisa/levantamento → `Explore`; desenho de arquitetura → `Plan`; implementação → `general-purpose` com `isolation: worktree`.

### Ondas de paralelismo (o que pode rodar ao mesmo tempo)

| Onda | Tarefas em paralelo | Pré-condição |
|---|---|---|
| **1** | F0-03, F0-04, F0-05, F0-06 · F1-01 · F1-04 · **F7-00 (PoC Blender)** · F6-01(maquete) | F0-01, F0-02 feitas |
| **2** | F7-00b, F7-09 · F1-02, F1-03, F1-05, F1-06, F1-07, F1-08 · F2-01, F2-04, F2-07 · F6-02 · F3-00 (decisões de design) | F0-04, F0-06 |
| **3** | F2-02, F2-03, F2-05, F2-06 · F1-09, F1-10 · F3-01, F3-02 · F5-01 · F6-03..F6-05 · F7-02..F7-04 | F2-01 |
| **4** | F3-03..F3-10 · F5-02..F5-05 · F6-06..F6-09 · F8-01, F8-02 · F9-01 · F7-05..F7-08 | F2-02, F2-03 |
| **5** | F4-* · F5-06 · F8-03..F8-06 · F9-02..F9-05 · F10-* | F3 base |

---

## Fluxo de execução atual (2026-09-28)
Sonnet 5.5 escreve a spec em `docs/specs/<ID>.md`; agente **Sonnet** executa; o coordenador revisa relatório + testes e faz o merge. Tarefas de arte no Blender (F7-*) **adiadas até o código estar pronto**.

| Spec pronta | Tarefa | Executor |
|---|---|---|
| `docs/specs/F0-08-anti-swiftshader.md` | F0-08 bloquear navegador sem GPU — **DONE** | haiku |
| `docs/specs/F1-05-nevoa-shader.md` | F1-05 — **DONE** | sonnet |
| `docs/specs/F7-00c-glb-padrao.md` | NEW-12 glb ligado por padrão — **DONE** | haiku |
| `docs/specs/F1-08-alocacoes-vazamentos.md` | F1-08 — **DONE** | sonnet |
| `docs/specs/F1-09-tick-fixo-lod-animacao.md` | F1-09 + NEW-14 (após F1-08, mesmos arquivos) | sonnet |
| `docs/specs/F2-02-sistema-comandos.md` | F2-02 — **DONE** | sonnet |
| `docs/specs/F2-03-determinismo.md` | F2-03 + B14 — **DONE** | sonnet (local) |
| `docs/specs/F2-07-event-bus.md` | F2-07 + B13 — **DONE** | sonnet (local) |
| `docs/specs/F2-05-mapas-dados.md` | F2-05 + B16 — **DONE** | sonnet (local) |
| `docs/specs/F3-01-controles-rts.md` | F3-01 + NEW-16 — **nuvem** | sonnet (claude.ai/code) |
| `docs/specs/F6-08-opcoes.md` | F6-08 — **nuvem**, após F3-01 | sonnet (claude.ai/code) |
| `docs/specs/F7-00d-lacaio-blender.md` | F7-00d Lacaio no Blender — **ADIADA** (modelagem por Sonnet 5.5 no fim) | sonnet 5.5 (futuro) |
| `docs/specs/F3-04-economia.md` | F3-04 economia WC2 — **DONE (5b8a72e)**; toca GameManager/Unit/Building/ai → não vai para a nuvem | sonnet (local) |
| `docs/specs/F3-03-combate.md` | F3-03 — spec pronta; **local, depois da F3-04** | sonnet (local) |
| `docs/specs/F3-07-pesquisas-niveis.md` | F3-07 — spec pronta, **DOING** (sonnet, 2026-09-30) | sonnet (local) |
| `docs/specs/F3-06-niveis-centro.md` | F3-06 — spec pronta; **local, depois da F3-04 (e F3-03)** | sonnet (local) |
| `docs/specs/NEW-19-ruinas.md` | NEW-19 ruínas — **nuvem** | sonnet (claude.ai/code) |
| `docs/specs/BUGS-01-pequenos.md` | NEW-2, NEW-11, NEW-5, NEW-13 — **nuvem** (ver `docs/HANDOFF_CLOUD.md`) | sonnet (claude.ai/code) |
| `docs/specs/F1-07-pathfinder.md` | F1-07 + B8 + NEW-4 — **nuvem** | sonnet (claude.ai/code) |
| `docs/specs/F6-03-hud-responsiva.md` | F6-03 + B11 — **nuvem** | sonnet (claude.ai/code) |
| `docs/specs/F1-03-unidades-por-osso.md` | F1-03 — **DONE parcial** | sonnet |
| `docs/specs/F1-03b-unidades-skinned.md` | F1-03b SkinnedMesh rígido — **DONE (38c013b)** | sonnet |
| `docs/specs/F1-06-grade-espacial.md` | F1-06 — **DONE parcial** | sonnet |

## Quadro resumo

| Fase | Total | TODO | DOING | DONE |
|---|---|---|---|---|
| F0 Fundação | 7 | 0 | 0 | 7 |
| F1 Desempenho | 10 | 1 | 0 | 9 |
| F2 Núcleo | 8 | 2 | 0 | 6 |
| F3 Jogabilidade WC2 base | 11 | 7 | 0 | 4 |
| F4 Jogabilidade WC2 expansão | 8 | 8 | 0 | 0 |
| F5 IA | 6 | 6 | 0 | 0 |
| F6 HUD/UX | 9 | 7 | 0 | 2 |
| F7 Arte/Áudio | 11 | 10 | 0 | 1 |
| F8 Conteúdo | 6 | 6 | 0 | 0 |
| F9 Multiplayer | 5 | 5 | 0 | 0 |
| F10 Qualidade/Release | 5 | 5 | 0 | 0 |

---

## F0 — Fundação

### F0-01 · Backup completo do projeto
- **Status**: `DONE(1cebb82)` · Lane FOUND
- **Resultado**: tarball `~/warpoly_backups/warpoly_full_2026-09-28.tar.gz` (38 MB, sem node_modules) + branch git `backup/pre-aaa-2026-09-28`. Árvore de trabalho do `master` preservada com as alterações não commitadas.

### F0-02 · Documentação de conhecimento + plano
- **Status**: `DONE(onda1-base)` · Lane FOUND
- **Resultado**: `docs/01..06`, este `TASKS.md`, `CLAUDE.md` na raiz.

### F0-03 · Limpeza do repositório
- **Status**: `DONE(48aa304)` · Lane FOUND · Onda 1 · Dep: —
- **Fazer**: mover PNGs de referência (`modelo*.png`, `hudmodelo.png`, `dialogoBarracs.png`, `forjaHumanos.png`) para `docs/reference/`; apagar `screenshot_*.png`, `scratch_icon.html`, `temp_render.html` (já estão no backup); ícones duplicados da raiz (existem em `public/`); adicionar `dist/` ao `.gitignore` e removê-lo do índice; remover `src/core/EnemyAI.js` e `GLTFBuildingLoader.js` se não referenciados.
- **Aceite**: `npm run build` ok; jogo e inspetor abrem; raiz só com arquivos de projeto.
- **Resultado**: 37 screenshots e 23 ícones duplicados removidos, referências em `docs/reference/`, `dist/` fora do git, `EnemyAI.js` removido. `GLTFBuildingLoader.js` mantido (importado por `GreatHall.js`) → ver NEW-1.

### F0-04 · Harness de benchmark de desempenho
- **Status**: `DONE(b4112e5)` · Lane QA · Onda 1 · Dep: —
- **Fazer**: `?bench=<cenário>` que monta cenários fixos (inicial; 100 unidades em combate; 300 unidades) com seed fixa, câmera fixa, mede 10 s: FPS médio/p1, draw calls, triângulos, geometrias, texturas, programas, heap JS, tempo de load; imprime JSON e salva em `window.__bench`. Script `npm run bench` com Playwright que roda e grava em `tools/bench/results/<data>.json`.
- **Aceite**: baseline registrada em `docs/04_DIAGNOSTICO.md` (seção Baseline).
- **Resultado**: `?bench=inicial|combate100|massa300` + `npm run bench` (Playwright, GPU real). Baseline: 15,7 / 5,3 / 1,6 FPS; 8,7k / 26k / 56k draw calls.

### F0-05 · Ferramentas de qualidade
- **Status**: `DONE(c673a16)` · Lane QA · Onda 1 · Dep: —
- **Fazer**: ESLint (flat config) + Prettier (sem reformatar tudo em massa — só `--check` em arquivos tocados), Vitest com 1 teste de exemplo (Pathfinder), `jsconfig.json` com `checkJs` opcional, scripts `lint`, `test`, `smoke` (Playwright abre `/` e `/inspector.html` sem erros de console).
- **Aceite**: `npm run lint && npm test && npm run smoke` passam.
- **Resultado**: ESLint 9 (0 erros, avisos de código morto), Prettier, Vitest (9 testes do Pathfinder), `npm run smoke` via safe-run com GPU real. Smoke em WebGL por software ainda estoura 6 GB até a F1-01.

### F0-06 · Centralizar dados de balanceamento
- **Status**: `DONE(8e913f1)` · Lane FOUND→CORE · Onda 1 · Dep: —
- **Fazer**: criar `src/data/units.js`, `buildings.js`, `upgrades.js`, `factions.js` como fonte única (stats, custos, tempo, visão, altura da barra de vida, colisão, quem treina o quê, lista de construção por trabalhador, ícones, nomes PT-BR). Refatorar `Unit.getUnitStats`, `Building.getBuildingStats`, `UNIT_TRAIN_CONFIG`, `BUILDING_BUILD_CONFIG`, `InputManager.getCost`, `AIDirector.costs`, `FogOfWar.visionRadii`, `getBuildingHeight`, `getHealthBarHeight`, `BUILDING_TRAINABLE_UNITS` para ler dali. Corrige bugs B3, B4.
- **Aceite**: nenhum número de balanceamento duplicado (grep); jogo idêntico ao anterior exceto a correção de custos da IA; `02_MECANICAS.md` aponta para `src/data/`.
- **Resultado**: `src/data/{units,buildings,upgrades,factions,index}.js`; 446 checagens de paridade OK (`node tools/check-data-parity.mjs`); B3 corrigido (7 custos da IA estavam errados, não só 1) e B4 corrigido.

### F0-07 · Registrar decisões de produto pendentes
- **Status**: `DONE(ver docs/07_DECISOES.md)` · Lane FOUND · Dep: — · **Requer o dono do projeto**
- **Resultado**: D1 pedra fica + petróleo só após Centro da Cidade T2; D2 nomes próprios; D3 hardware mínimo = GPU integrada, sem perder qualidade AAA nos presets altos. TypeScript ainda pendente.
- **Decidir**: (a) Pedra fica ou vira Petróleo? (b) Nomes originais vs nomes WC2 (PI); (c) plataforma alvo mínima (GPU integrada? mobile?); (d) público: lançamento público ou projeto pessoal; (e) TypeScript sim/não.
- **Aceite**: respostas registradas em `docs/07_DECISOES.md`.

---

## F1 — Desempenho (meta: 60 FPS cena inicial, 45 FPS com 200 unidades, load < 8 s)

### F1-01 · Texturas procedurais: resolução e empacotamento
- **Status**: `DONE(9102693)` · Lane PERF · Onda 1 · Dep: —
- **Fazer**: parametrizar `createCanvas` por um `TEXTURE_QUALITY` global (Low 256 / Med 512 / High 1024); empacotar roughness+metalness(+AO) num mapa ORM; trocar `bumpMap` por nada em Low/Med; mover a pintura para `OffscreenCanvas` em Web Worker quando disponível; cache opcional em IndexedDB.
- **Aceite**: VRAM de texturas estimada < 300 MB em High; load < 8 s; diferença visual aprovada no inspetor (capturas antes/depois).
- **Resultado**: `src/models/textureQuality.js` (`?texq=` / localStorage). VRAM estimada: antes 7,3 GB → med 399 MB (padrão) / low 100 MB / high 1,94 GB. Load 11 s → 5,5 s. Visual med ≈ ultra (capturas em `tools/texture-compare/`). Pendente → NEW-6.

### F1-02 · Mesclar geometrias dos templates estáticos
- **Status**: `DONE(2772628)` · Lane PERF · Onda 2 · Dep: F0-04
- **Fazer**: utilitário `mergeStaticTemplate(group, {keepNamed:[...]})` que agrupa meshes por material via `BufferGeometryUtils.mergeGeometries`, preservando nós animados/VFX (bandeiras, rodas, chamas, portas) listados por modelo. Aplicar a todas as construções, depósitos e decorações.
- **Aceite**: castelo ≤ 20 draw calls, Grande Salão ≤ 20; cena inicial < 1 500 draw calls; VFX das forjas/chiqueiro funcionam no inspetor e no jogo.
- **Resultado**: `src/render/mergeStaticTemplate.js` + `staticTemplates.js` (`?merge=0` desliga). Castelo 487→19, Grande Salão 733→20. Cena inicial 3 907→1 339 draw calls; bench inicial 47→108 FPS. Unidades ainda dominam o combate (F1-03).

### F1-03 · Unidades: mesclar partes rígidas por "osso"
- **Status**: `DONE(3fd7fc2 — parcial, meta via F1-03b)` · Lane PERF · Onda 2 · Dep: F0-04
- **Fazer**: mesclar filhos de cada nó animado (`Torso, Head, ArmL…`) em um mesh por material; manter os nomes que o `UnitAnimator` usa. Meta ≤ 15 draw calls por unidade.
- **Aceite**: animações idênticas no inspetor; bench 100 unidades ≥ 50 FPS.
- **Resultado**: `src/render/mergeUnitTemplate.js`; draw calls archer 154→54, knight 83→41, villager 129→55, ogre 25→12; combate100 18→32 FPS. Meta ≤15/unidade e 50 FPS não atingida (mescla não cruza ossos) → **F1-03b** (SkinnedMesh rígido, spec pronta).

### F1-04 · Sombras e renderer
- **Status**: `DONE(f4fa447)` · Lane PERF · Onda 1 · Dep: —
- **Fazer**: `castShadow` só em meshes com volume relevante (flag por modelo ou por tamanho da bbox); shadow camera ajustada ao frustum visível; `shadowMap.autoUpdate` com atualização a cada N frames para estáticos; presets de qualidade; limitar DPR por preset; resolução dinâmica se FPS < alvo.
- **Aceite**: redução ≥ 50% de draw calls de sombra; sem artefatos visíveis.

### F1-05 · Névoa de guerra via shader (corrige B1, B2)
- **Status**: `DONE(e33d40e)` · Lane PERF · Onda 2 · Dep: —
- **Fazer**: substituir o plano a y=5,2 por uma textura de visibilidade (2 canais: explorado / visível agora) amostrada no shader do terreno e dos objetos (`onBeforeCompile`) ou num passe de pós-processamento com reconstrução de posição; estados: preto (não explorado), cinza dessaturado (memória), claro (visível). Inimigos só aparecem em "visível agora"; construções inimigas vistas ficam como "fantasma" na memória (como no WC2).
- **Aceite**: nenhum objeto atravessa a névoa; unidades inimigas somem ao sair da visão.
- **Resultado**: `FogGrid.js` + `render/fogOfWarShader.js` (patch `onBeforeCompile`, instancing, chão/água); 3 estados, inimigos só com visão atual, fantasmas de construções, minimapa, visão de aliados. Bench: +1,9% frame time, +3–4 programas. B1/B2 corrigidos. Pendente → NEW-13.

### F1-06 · Grade espacial (spatial hash) para a simulação
- **Status**: `DONE(bf87e23 — parcial, meta via NEW-14)` · Lane PERF (arquivo novo) + CORE (integração) · Onda 2 · Dep: —
- **Fazer**: `src/sim/SpatialGrid.js`; usar em colisões unidade×unidade, unidade×bloqueadores, busca de alvo/aggro, torres, seleção. Elimina O(n²).
- **Aceite**: bench 300 unidades: tempo de `gameManager.update` < 4 ms.
- **Resultado**: `src/sim/SpatialGrid.js`; colisões, alvo, torre, IA, colocação, recursos e picking migrados; empurrão determinístico por id; 114 testes. `gm.update` massa300 7,19→6,85 ms (meta <4 ms não atingida: gargalo real é `Unit.update` ~4,5 ms, animação procedural por unidade) → NEW-14. Efeitos colaterais aceitos: tocos não selecionáveis; alcance de aggro/ajuda +raio da unidade-alvo (~0,6–1,2 u).

### F1-07 · Pathfinder de produção
- **Status**: `DONE(PR#2)` · Lane PERF · Onda 2 · Dep: —
- **Fazer**: heap binário no open set; construções/florestas marcadas na grade (dinâmico ao construir/cortar); orçamento de N buscas por frame com fila; flow field para ordens de grupo grandes; cache de caminhos.
- **Aceite**: unidades contornam construções sem "deslizar" (B8); 50 ordens simultâneas sem queda de FPS.
- **Resultado**: Nuvem. Heap binário, camada de bloqueio dinâmico (construções/árvores), `requestPath` com orçamento por frame, cache; B8 e NEW-4 corrigidos. Obs.: orçamento usa `performance.now()` → não determinístico; trocar por limite de nós na F2-03.

### F1-08 · Eliminar alocações e vazamentos
- **Status**: `DONE(70fea77)` · Lane PERF · Onda 2 · Dep: —
- **Fazer**: pool de textos flutuantes (atlas de dígitos ou sprites reutilizáveis); projétil de machado usar template compartilhado (vazamento atual); remover `new Vector3` em loops quentes; `raycastScene` com lista cacheada e raycast em bounding volumes/proxies em vez de 5 000 meshes.
- **Aceite**: heap estável em 10 min de partida (sem crescimento contínuo); hover sem custo perceptível.
- **Resultado**: `FloatingTextPool.js` (pool 64 + cache LRU de texturas), pools de partículas/fumaça, template do machado compartilhado, vetores reutilizados. 10 min de combate: texturas/geometrias constantes, heap sem crescimento. combate100 36→39 FPS (1% low 11→18).

### F1-09 · Timestep fixo e interpolação
- **Status**: `DONE(5dca95c)` · Lane CORE · Onda 3 · Dep: F2-01
- **Fazer**: simulação a 20 Hz fixos (acumulador), render interpola posições/rotações; `gameSpeed` altera ticks por segundo.
- **Aceite**: comportamento idêntico a 30, 60 e 144 FPS.
- **Resultado**: `src/sim/constants.js` (SIM_DT 0,05, MAX_STEPS 8); `GameManager.advance/simStep/renderUpdate`; interpolação de unidades/projéteis; animação e VFX fora da simulação; LOD de animação por frustum/névoa/distância. Sim ms/frame massa300 5,3→3,6 ms; gameTime idêntico a 30 e 144 FPS.

### F1-10 · LOD e culling
- **Status**: `TODO` · Lane PERF · Onda 3 · Dep: F1-02, F1-03
- **Fazer**: `THREE.LOD` com 2 níveis para construções/unidades; impostores para árvores distantes; frustum culling por grupo; esconder decorações pequenas em zoom máximo.
- **Aceite**: bench 300 unidades ≥ 45 FPS.

---

## F2 — Núcleo do motor

### F2-01 · Modelo de jogadores e IDs de entidade
- **Status**: `DONE(7c7860a)` · Lane CORE · Onda 2 · Dep: F0-06
- **Fazer**: `Player {id, name, faction, color, team, resources, pop, isAI, isLocal}`; toda entidade com `id` numérico estável e `ownerId`; substituir `'player'/'enemy'`, `gm.units/gm.enemies`, recursos duplicados em `AIDirector`; helper `isHostile(a,b)` por time.
- **Aceite**: partida 1×1 idêntica; partida 1×2 IA (FFA) funciona via config de teste.
- **Resultado**: `src/sim/{Player,PlayerRegistry,EntityIds,MatchConfig}.js`; `gm.allUnits` fonte única (`units`/`enemies` derivadas); IA por `playerId`; `?ffa=1` (3 jogadores) funcional; 40 testes. Dívidas em 01_ARQUITETURA (getter `faction`, API econômica legada, cor do jogador não usada).

### F2-02 · Sistema de comandos
- **Status**: `DONE(b5ca827)` · Lane CORE · Onda 3 · Dep: F2-01
- **Fazer**: `Command {tick, playerId, type, entityIds, target, queued}`; `CommandQueue`; toda ação de jogador/IA/UI passa por comandos (mover, atacar, attack-move, coletar, construir, treinar, pesquisar, cancelar, rally, stop, hold, patrol, habilidade).
- **Aceite**: nenhum chamada direta `unit.moveTo/orderAttack` fora do executor de comandos; log de comandos reproduz a partida.
- **Resultado**: `src/sim/{commands,CommandQueue,CommandExecutor}.js`; UI/input/IA emitem comandos (custo cobrado no executor); estados hold/attack-move/patrol; shift-queue; log de comandos JSON puro (replay). 174 testes. Teclas ficam para F3-01.

### F2-03 · Determinismo
- **Status**: `DONE(32b5fa9)` · Lane CORE · Onda 3 · Dep: F2-01, F1-09
- **Fazer**: RNG com seed (`mulberry32`) em `src/sim/rng.js`; remover `Math.random` da simulação (69 ocorrências — visuais podem manter); iteração em ordem de ID; evitar dependência de ordem de `Set`/objetos; checksum de estado por tick.
- **Aceite**: duas execuções com mesma seed e mesmos comandos → mesmo checksum após 10 min (teste automatizado).
- **Resultado**: `src/sim/rng.js` (mulberry32 + fork), RNGs de mapa/IA, Pathfinder com orçamento por nós, `src/sim/checksum.js`, modo headless (`MatchConfig.headless`). Teste: 2 partidas IA×IA de 10 min com seed 42 → checksums idênticos (~1 s de simulação). B14 corrigido. Trigonometria entre navegadores: proposta para F9-03.

### F2-04 · Máquina de estados do jogo
- **Status**: `DONE(ee1c289)` · Lane CORE · Onda 2 · Dep: —
- **Fazer**: `Boot → MainMenu → MatchSetup → Loading → InGame ⇄ Paused → PostGame`; criar/destruir partida sem recarregar (dispose completo de cena, listeners, timers); `MatchConfig {mapId, players[], startingResources, victoryCondition, seed}`. Corrige B7.
- **Aceite**: jogar 3 partidas seguidas sem reload; heap volta ao patamar inicial.
- **Resultado**: `GameStateMachine.js` + `MatchSession.js` + `PauseMenu.js`; menu → partida → pausa → fim → jogar de novo sem reload; teste de vazamento (5 partidas) estável; 2ª partida carrega em ~2,6 s; B7 corrigido.

### F2-05 · Mapas orientados a dados
- **Status**: `DONE(110c125)` · Lane CORE + CONTENT · Onda 3 · Dep: F2-01
- **Fazer**: formato `src/data/maps/<id>.json` (tamanho, tileset, heightmap ou parâmetros, água, vaus/pontes, posições iniciais 2–8, minas, florestas, neutros, decorações). `Terrain`, `Pathfinder`, minimapa e spawns leem do mapa. Converter o mapa atual em `continental-1v1.json`.
- **Aceite**: nenhuma coordenada de mapa hardcoded em `GameManager`/`Terrain`/`UIManager` (B16).
- **Resultado**: `src/data/maps/{continental-1v1,ilhas-4p}.json`, `world/terrainGenerators.js`, minimapa pré-renderizado do terreno real, lista de mapas com miniatura no menu. Checksum de determinismo idêntico ao master. 222 testes. B16 corrigido. Pendências visuais → NEW-17, NEW-18.

### F2-06 · Save / Load
- **Status**: `TODO` · Lane CORE · Onda 3 · Dep: F2-01, F2-04
- **Fazer**: serializar estado da simulação (JSON compacto) em slots no IndexedDB; autosave opcional.
- **Aceite**: salvar no minuto 5, carregar e continuar sem diferenças visíveis.

### F2-07 · Barramento de eventos e desacoplamento
- **Status**: `DONE(13fc992)` · Lane CORE · Onda 2 · Dep: —
- **Fazer**: `EventBus` (unitDied, buildingCompleted, underAttack, researchDone, resourceDepleted…) consumido por UI, áudio, IA, estatísticas; mover `UnitAnimator` de `src/inspector/` para `src/animation/` (inspetor passa a importar de lá).
- **Aceite**: `Unit`/`Building` não referenciam `uiManager`/`soundManager` diretamente.
- **Resultado**: `src/sim/EventBus.js` + `events.js`; ouvintes `audio/AudioEvents.js`, `render/VfxEvents.js`, `ui/UiEvents.js` (não criados em headless); zero chamadas diretas de som/VFX/UI na simulação; `UnitAnimator` em `src/animation/`. Determinismo intacto. 197 testes. B13 corrigido.

### F2-08 · Separação sim/render
- **Status**: `TODO` · Lane CORE · Onda 4 · Dep: F2-02, F2-03
- **Fazer**: `src/sim/` sem import de three.js; `src/render/` com views por entidade; permitir rodar a simulação headless (Node) para testes e IA×IA.
- **Aceite**: `node tools/headless-match.js --seed 1` roda uma partida IA×IA até o fim.

---

## F3 — Jogabilidade WC2 (base)

### F3-00 · Documento de design de paridade (tabelas finais)
- **Status**: `DONE(aprovado 2026-09-29 — docs/08_GAME_DESIGN.md, D4–D7)` · Lane GAME · Onda 2 · Dep: F0-07
- **Fazer**: **glossário oficial de nomes próprios** (facções, unidades, construções, magias — decisão D2) e `docs/08_GAME_DESIGN.md` com a árvore tecnológica completa das 2 facções (tiers, construções, unidades, pesquisas, magias), stats iniciais e tabela de contra-unidades, baseado em [05_PARIDADE_WARCRAFT2](05_PARIDADE_WARCRAFT2.md) com nomes originais.
- **Aceite**: aprovado pelo dono do projeto.

### F3-01 · Controles RTS completos
- **Status**: `TODO` · Lane GAME · Onda 3 · Dep: F2-02
- **Fazer**: grupos Ctrl+1..9 (duplo toque centraliza), Shift adiciona/remove da seleção, duplo clique seleciona todos do tipo na tela, Shift+ordem enfileira, A=attack-move, S=stop, H=hold (HQ vira Backspace), P=patrol, pan pela borda, arrastar com botão do meio, clique direito no minimapa, tecla de trabalhador ocioso (`.`), barra de espaço vai ao último alerta, limite de seleção configurável (WC2 = 9; padrão sugerido 24).
- **Aceite**: checklist de controles testada manualmente e com teste de input automatizado.

### F3-02 · Movimento em grupo e formações
- **Status**: `TODO` · Lane GAME · Onda 3 · Dep: F1-07
- **Fazer**: steering com separação (em vez de empurrão rígido), grupo anda na velocidade do mais lento, formação preserva forma relativa, chegada sem "dança".
- **Aceite**: 40 unidades atravessam um vau sem travar.

### F3-03 · Modelo de combate
- **Status**: `DONE(2b345d6)` · Lane GAME · Onda 4 · Dep: F0-06
- **Fazer**: fórmula estilo WC2 (dano básico − armadura + dano perfurante, variação 50–100%); armadura em construções; tipos de dano (normal/perfurante/cerco/mágico); projéteis podem errar alvo em movimento; alcance mínimo para cerco; bônus de altura opcional.
- **Aceite**: tabela de simulações em `docs/08_GAME_DESIGN.md` bate com testes unitários.
- **Resultado**: `src/sim/combat.js` (`computeDamage`: básico−armadura + perfurante, tipos NORMAL/PIERCING/SIEGE/MAGIC, ×0,5–1,0 via `gm.combatRng`, `DAMAGE_SCALE` 1,333), `damage:{basic,piercing,type}` em `src/data/units.js`, armadura em construções (B5 corrigido), card mostra básico+perfurante. Tabela de simulação em `08_GAME_DESIGN.md` §6.1. 281 testes. Projéteis que erram → NEW-23.

### F3-04 · Economia WC2
- **Status**: `DONE(5b8a72e)` · spec `docs/specs/F3-04-economia.md` · Lane GAME · Onda 4 · Dep: F2-05
- **Fazer**: trabalhador entra na mina (some ~1 s, 1 por vez, fila); florestas densas bloqueiam e abrem ao cortar; pedra permanece (D1); comida = suprimento de Fazenda/Chiqueiro; Serraria melhora rendimento de madeira; HQ upgrade melhora rendimento de ouro; minas esgotam com aviso.
- **Aceite**: curva de economia documentada; IA continua funcional.
- **Resultado**: `src/data/economy.js` (carga 10/10/8, entrada na mina 1,5 s, 1 slot ouro / 2 pedra), fila de mina em `ResourceDeposit`, estados `waitingMine/insideMine`, sem ouro passivo, Quartel requer Fazenda/Chiqueiro (`src/sim/requirements.js`, botão desabilitado com motivo), `RESOURCE_DEPLETED` + aviso PT-BR, IA constrói Fazenda antes do Quartel. Curva: 1 mina satura com ~3 trabalhadores (~385 ouro/min). 264 testes.

### F3-05 · Reparo e cancelamento de construção
- **Status**: `TODO` · Lane GAME · Onda 4 · Dep: F2-02
- **Fazer**: trabalhadores reparam construções/máquinas (custo proporcional); cancelar construção devolve 75%; vários trabalhadores aceleram a obra.
- **Aceite**: testes manuais + unidade.

### F3-06 · Tiers de HQ e árvore tecnológica
- **Status**: `DONE(369cc38)` · Lane GAME · Onda 4 · Dep: F3-00
- **Fazer**: HQ T1→T2→T3 (Salão→Fortaleza→Castelo / equivalentes orcs) com upgrade in-place e modelo novo por tier; requisitos de construção/unidade/pesquisa; UI mostra requisitos faltantes.
- **Aceite**: não é possível treinar/construir sem requisitos; IA respeita.
- **Resultado**: `src/data/tiers.js` (3 níveis, PV 1600/2200/2800, custos nv2/nv3, ouro ×1,0/1,1/1,2), comandos `UPGRADE_HQ`/`CANCEL_UPGRADE_HQ`, evento `HQ_TIER_CHANGED`, requisitos `{hq:N}` em construções/unidades/pesquisas, card "NÍVEL N — nome" com botão Evoluir e progresso, IA evolui o Centro. Grande Salão PV 1750→1600 (tabela única). Petróleo do nv3 declarado, cobrança fica para F4-07. 298 testes.

### F3-07 · Pesquisas em níveis
- **Status**: `DOING(sonnet, 2026-09-30)` (spec: docs/specs/F3-07-pesquisas-niveis.md) · Lane GAME · Onda 4 · Dep: F3-06
- **Fazer**: ataque/armadura corpo a corpo 2 níveis (Forja), projéteis 2 níveis (Serraria), cerco 2 níveis, upgrades de classe (Arqueiro→Patrulheiro, Lançador→Berserker), torres Guarda/Canhão.
- **Aceite**: dados em `src/data/upgrades.js`; UI da forja/serraria mostra níveis.

### F3-08 · Muralhas
- **Status**: `TODO` · Lane GAME · Onda 4 · Dep: F1-07
- **Fazer**: colocação por arrasto em grade, segmentos que se conectam, bloqueiam pathfinding, podem ser destruídos.
- **Aceite**: IA encontra caminho alternativo ou ataca a muralha.

### F3-09 · Condições de vitória e estatísticas
- **Status**: `TODO` · Lane GAME · Onda 4 · Dep: F2-04, F2-07
- **Fazer**: modos "Destruir tudo" (padrão WC2) e "Regicídio (HQ)"; coleta de estatísticas (unidades treinadas/perdidas/mortas, construções, recursos coletados, APM, tempo).
- **Aceite**: dados alimentam a tela F6-07.

### F3-10 · Neutros e critters
- **Status**: `TODO` · Lane GAME · Onda 4 · Dep: F2-01
- **Fazer**: jogador neutro hostil com Acampamento de Bandidos (modelos prontos) que guarda recursos e dá recompensa; critters decorativos (ovelhas/porcos) que podem ser mortos.
- **Aceite**: mapa com 2 acampamentos neutros jogável.

### F3-11 · Revisão de balanceamento base
- **Status**: `TODO` · Lane GAME + QA · Onda 5 · Dep: F3-03..F3-07, F8-? headless
- **Fazer**: simulações IA×IA headless (F2-08) em lote para medir taxa de vitória por facção; ajustar dados.
- **Aceite**: 45–55% de vitória por facção em 200 partidas IA Difícil × IA Difícil.

---

## F4 — Jogabilidade WC2 (expansão)

### F4-01 · Cavalaria (Estábulo / Covil de Ogros)
- `TODO` · GAME+ART · Dep: F3-06 · Cavaleiro real (humano) e ajuste do Ogro; Cavaleiro→Paladino com upgrade.

### F4-02 · Unidades de cerco (Balista / Catapulta)
- `TODO` · GAME+ART · Dep: F3-03, F3-06 · Oficina (Inventor/Alquimista); dano em área, alcance mínimo, projétil balístico visível.

### F4-03 · Sistema de mana e habilidades
- `TODO` · GAME · Dep: F2-02 · Mana com regeneração, habilidades com alvo (unidade/área/auto-cast), cooldown, pesquisa que libera magia, UI no card de comandos, VFX genéricos.

### F4-04 · Conjuradores e magias
- `TODO` · GAME+ART · Dep: F4-03 · Humano: Mago (Bola de fogo/Lentidão/Invisibilidade/Polimorfia/Nevasca), Paladino (Cura/Visão sagrada/Exorcismo). Orc: equivalentes originais do Cavaleiro da Morte e Ogro-Mago (Sede de Sangue/Runas/Olho vigilante/Ressuscitar mortos/Redemoinho). Construções: Igreja/Altar, Torre de Magos/Templo.

### F4-05 · Sapadores
- `TODO` · GAME+ART · Dep: F3-08 · Unidade suicida que destrói muralhas/rochas/construções.

### F4-06 · Unidades aéreas
- `TODO` · GAME+ART · Dep: F3-06 · Batedor aéreo (máquina voadora/zepelim) e atacante aéreo (grifo/dragão); camada de voo ignora terreno; só atingível por distância/torres.

### F4-07 · Naval + Petróleo
- `TODO` · GAME+ART+CONTENT · Dep: F2-05, F3-06 · **Petróleo só é liberado após o Centro da Cidade T2 (decisão D1).** Estaleiro, Fundição, Refinaria, Plataforma em poço de petróleo; petroleiro, destróier, transporte, encouraçado, submarino/tartaruga; navegação em água (grade separada), desembarque.

### F4-08 · Heróis de campanha
- `TODO` · GAME · Dep: F8-04 · Unidades únicas com stats maiores usadas em missões.

---

## F5 — Inteligência Artificial

### F5-01 · Refatorar IA para jogadores + comandos
- `TODO` · AI · Onda 3 · Dep: F2-01 (F2-02 quando pronto) · Remover `EnemyAI.js`; `AIDirector` por `playerId`, emitindo comandos; várias IAs simultâneas (FFA/times).

### F5-02 · Percepção sob a névoa
- `TODO` · AI · Dep: F1-05, F5-01 · IA só "sabe" o que suas unidades viram (memória de última posição); scout ativo. Dificuldade Brutal pode trapacear (opcional).

### F5-03 · Níveis de dificuldade
- `TODO` · AI · Dep: F5-01 · Fácil / Normal / Difícil / Brutal: APM máximo, atraso de reação, qualidade de micro, bônus de recursos só no Brutal; configurado no setup da partida.

### F5-04 · Estratégias e build orders
- `TODO` · AI · Dep: F3-06 · Perfis (rush, boom econômico, tartaruga, tech aéreo) por facção; escolha aleatória por seed; adaptação à composição do inimigo (contra-unidades).

### F5-05 · Micro tático
- `TODO` · AI · Dep: F3-03 · Recuar feridos, focar fogo, kiting de ranged, proteger cerco, flanquear, atacar trabalhadores, usar magias (após F4-04).

### F5-06 · IA de campanha/gatilhos
- `TODO` · AI+CONTENT · Dep: F8-04 · Ondas scriptadas, defensores fixos, ataques programados por gatilho.

---

## F6 — HUD / UX

### F6-01 · Menu principal
- `DONE(520dcc7)` · UI · Onda 1 (maquete) / Onda 2 (integração com F2-04) · Novo Jogo, Campanha, Multiplayer, Opções, Inspetor, Créditos; fundo 3D animado da cena; substitui parâmetros de URL.

### F6-02 · Tela de configuração de partida (Skirmish)
- `TODO` · UI · Dep: F2-04 · Escolha de facção (Aliança/Horda com prévia 3D), mapa (miniatura), 1–7 oponentes IA, times, cores, dificuldade, recursos iniciais, condição de vitória, seed.

### F6-03 · HUD responsiva estilo WC2 (corrige B11)
- `DONE(PR#3)` · UI · Dep: F0-06 · Layout que funciona de 1024×768 a 4K (escala de UI); painel de seleção com retrato; seleção múltipla em grade com barras de vida; card de comandos 3×3 com atalhos visíveis; tooltips com custo, requisitos e descrição.

### F6-04 · Minimapa de produção
- `TODO` · UI · Dep: F2-05, F1-05 · Renderizado a partir do mapa/terreno real, trapézio do frustum da câmera, pings de ataque, ordens por clique direito, cores de jogador.

### F6-05 · Alertas e feedback
- `TODO` · UI+AUDIO · Dep: F2-07 · "Estamos sob ataque", "Mina esgotada", "Pesquisa concluída", "Construção concluída", "Não há comida suficiente"; ping no minimapa; Espaço vai ao alerta.

### F6-06 · Cursores contextuais e destaque
- `TODO` · UI+PERF · Dep: F2-02 · Cursor de atacar/coletar/construir/inválido/alvo de magia; contorno (outline) na entidade sob o mouse.

### F6-07 · Tela pós-jogo
- `TODO` · UI · Dep: F3-09 · Pontuação estilo WC2 (unidades, construções, recursos, ranking), gráficos de evolução, botões Jogar de novo / Menu.

### F6-08 · Opções completas
- `TODO` · UI · Dep: F1-04, F1-01 · Gráficos (presets + avançado: sombras, texturas, DPR, pós-proc., FPS alvo), áudio por canal, remapeamento de teclas, velocidade de rolagem, escala de UI, modo daltônico para cores de time. Persistência em localStorage.

### F6-09 · Internacionalização + tutorial (corrige B12)
- `TODO` · UI · Dep: F6-03 · `src/i18n/{pt-BR,en}.json`, nenhum texto hardcoded; tutorial jogável (missão 0) ensinando coleta, construção, treino, combate.

---

## F7 — Arte e Áudio

### F7-00 · Pipeline de arte com Blender (headless) — PoC
- **Status**: `DONE(76d5d9e — aprovado pelo dono em 2026-09-28)` · Lane ART · Onda 1 · Dep: — · Blender: `/home/rafael/Downloads/blender-5.2.1-linux-x64/blender` (5.2.1 LTS, glTF ok, verificado 2026-09-28)
- **Fazer**: `tools/blender/` com scripts Python (`blender -b --python build_<modelo>.py`) que modelam em bmesh (ou importam blocagem), aplicam materiais stylized, **bake** de cor/AO em atlas 512², juntam malhas por material, criam armature + actions (idle/walk/attack/gather/hurt/die) para unidades e exportam `.glb` (Draco/meshopt, KTX2 opcional) para `public/models/`. Máscara de team color no atlas. `ModelFactory` carrega `.glb` via `GLTFLoader` quando existir, com fallback para o modelo procedural atual. Inspetor lista as duas versões lado a lado.
- **PoC**: 1 unidade (Grunt — hoje a mais pobre, 35 meshes) + 1 construção (Castelo — 487 meshes).
- **Aceite**: Grunt ≤ 3 draw calls com animações por `AnimationMixer`; Castelo ≤ 6 draw calls; visual aprovado pelo dono comparando no inspetor; `npm run build` ok.
- **Resultado**: Nuvem. `uiScale.js`, `hotkeys.js`, `Tooltip.js`, card 3×3 com atalhos, seleção múltipla. Validado em 1024×768: card cabe, sem cortes (B11 ok). Regressão: população mostra só o atual ("5"), sem o máximo, abaixo de 1100 px → NEW-16.
- **Resultado**: `tools/blender/` (common.py, build_grunt.py, build_castle.py), `public/models/{grunt,castle}.glb` (meshopt+WebP), `src/entities/glbModels.js`, `?glb=1`. Grunt 35→8 draw calls, atlas 512²; Castelo 487→2 draw calls, atlas 1024². Inspetor: "Guerreiro Orc (Blender)" / "Castelo (Blender)". Aprovado pelo dono (visual e machado ok).

### F7-00b · Migração de todo o catálogo para o pipeline Blender
- **Status**: `ADIADA(até o código estar pronto — decisão do dono)` · Lane ART · Onda 2 · Dep: F7-00 aprovado
- **Fazer**: refazer os 37 modelos (prioridade: unidades orcs → construções grandes → ambiente), um agente por grupo de modelos em paralelo; remover `*Textures.js` procedurais substituídos. Substitui F1-02/F1-03/F1-01 para os modelos migrados.
- **Aceite**: load < 5 s; cena inicial < 400 draw calls.

### F7-09 · Ícones, retratos e artes 2D renderizados no Blender
- **Status**: `ADIADA(até o código estar pronto — decisão do dono)` · Lane ART+UI · Onda 2 · Dep: F7-00
- **Fazer**: script que renderiza (Eevee) ícones de comando, retratos animáveis de unidades para o painel de seleção, arte do menu principal e da tela de loading a partir dos mesmos `.glb`; sprites em `public/ui/`.
- **Aceite**: HUD usa os novos ícones; consistência visual com o jogo 3D.

### F7-01 · Paridade de fidelidade das unidades orcs
- `TODO` · ART · Onda 1 · Dep: — · Peão, Grunt, Lançador e Ogro no nível de detalhe do Cavaleiro/Arqueiro (hoje 25–38 meshes vs 83–154), seguindo `modeloorcs.png` e `specs/`. Coordenar com F1-03 (fazer antes do merge por osso ou refazer o merge).

### F7-02 · Cores de time
- `TODO` · ART · Dep: F2-01 · Máscara de team color nas texturas (canal/área de estandartes, capas, escudos) + uniform por jogador; prévia no inspetor com seletor de cor.

### F7-03 · Iluminação e pós-processamento
- `TODO` · ART+PERF · Dep: F1-04 · Ciclo dia/noite opcional, SSAO leve, bloom para fogo/magias, color grading por tileset, outline de seleção; tudo desligável nos presets.

### F7-04 · Terreno e tilesets
- `TODO` · ART+CONTENT · Dep: F2-05 · Splat map (grama, terra, areia, pedra, neve, lama), penhascos/elevação, estradas, 4 tilesets estilo WC2 (Floresta, Inverno, Terras Devastadas, Pântano), costa com espuma.

### F7-05 · VFX
- `TODO` · ART+PERF · Dep: F1-08 · Partículas GPU em pool (instanced), destruição de construções com escombros, corpos que decaem, sangue/faíscas, pegadas de construção por estágio, magias.

### F7-06 · Animação de produção
- `TODO` · ART · Dep: F2-07 · Blend entre estados, variações de ataque, animação de morte por tipo de dano, animação de carregar recurso, idle variados.

### F7-07 · Modelos novos (para F3/F4)
- `TODO` · ART · Dep: F3-00 · Todas as construções/unidades novas da árvore tecnológica, cada uma com entrada no inspetor e orçamento (≤ 20 draw calls pós-merge, texturas ≤ 512).

### F7-08 · Áudio de produção
- `TODO` · AUDIO · Dep: F2-07 · Áudio posicional (atenuação pela câmera), falas de confirmação por unidade (síntese de voz estilizada ou samples originais), música adaptativa (paz/combate) por facção, mixer com limitador, ambiência por tileset.

---

## F8 — Conteúdo

### F8-01 · Pacote de mapas skirmish
- `TODO` · CONTENT · Dep: F2-05 · 6 mapas: 2×1v1, 2×2v2, 1×FFA 4, 1×ilhas (naval, após F4-07); tamanhos 96–192.

### F8-02 · Gerador procedural de mapas
- `TODO` · CONTENT · Dep: F2-05 · Seed → mapa simétrico balanceado para 2–8 jogadores.

### F8-03 · Editor de mapas no navegador
- `TODO` · CONTENT+UI · Dep: F2-05, F7-04 · Pintar terreno/água/florestas, posicionar minas/jogadores/neutros, exportar/importar JSON.

### F8-04 · Sistema de missões e gatilhos
- `TODO` · CONTENT+CORE · Dep: F2-02, F2-07 · Objetivos (destruir, sobreviver X min, escoltar, resgatar, construir N), gatilhos (área, tempo, morte), diálogos/briefings, cutscenes simples de câmera.

### F8-05 · Campanha da Aliança (8+ missões)
- `TODO` · CONTENT · Dep: F8-04 · História original inspirada na temática do WC2.

### F8-06 · Campanha da Horda (8+ missões)
- `TODO` · CONTENT · Dep: F8-04.

---

## F9 — Multiplayer

### F9-01 · Arquitetura e prova de conceito
- `TODO` · NET · Dep: F2-02, F2-03 · Documento `docs/09_MULTIPLAYER.md`; PoC lockstep 1v1 em 2 abas via BroadcastChannel.

### F9-02 · Servidor de sinalização + lobby
- `TODO` · NET · Dep: F9-01 · `server/` (Node + ws ou Cloudflare Worker), salas por código/link, lista de salas públicas.

### F9-03 · Lockstep WebRTC
- `TODO` · NET · Dep: F9-02 · Turnos de comando, atraso de input adaptativo à latência, checksum por turno, detecção e relatório de desync, até 8 jogadores.

### F9-04 · Robustez
- `TODO` · NET · Dep: F9-03 · Reconexão, pausa votada, jogador que sai vira IA, chat, pings no mapa entre aliados.

### F9-05 · Replays
- `TODO` · NET+UI · Dep: F2-02, F2-03 · Gravar log de comandos + seed; player de replay com velocidade e troca de visão por jogador.

---

## F10 — Qualidade e lançamento

### F10-01 · Testes da simulação
- `TODO` · QA · Dep: F0-05, F2-08 · Testes de combate, economia, pathfinding, comandos, determinismo.

### F10-02 · Soak test IA×IA headless
- `TODO` · QA · Dep: F2-08 · 100 partidas por noite, detecção de travamentos, partidas que não terminam, exceções.

### F10-03 · Regressão visual
- `TODO` · QA · Dep: F0-05 · Capturas Playwright de todos os modelos do inspetor e da HUD em 3 resoluções; diff em PR.

### F10-04 · Orçamento de desempenho em CI
- `TODO` · QA · Dep: F0-04 · Falha se draw calls/FPS/load piorarem > 10% vs baseline.

### F10-05 · Empacotamento e deploy
- `TODO` · QA · Dep: F1-01 · PWA offline, code-splitting por facção/modelos, compressão (brotli), deploy estático (GitHub Pages/Cloudflare Pages), página de lançamento.

---

## Backlog descoberto
_(agentes adicionam aqui: `NEW-<n> · título · lane · motivo`)_

- NEW-2 · IA reembolsa custo errado em `AIEconomyManager.placeBuilding` (usa `director.costs[tipoDaConstrução]`, mas `costs` é indexado por papel → devolve custo da fazenda) · AI · achado na F0-06
- NEW-3 · Card de seleção ainda mostra nomes antigos em inglês (`entityName`: "Villager"…); unificar com nomes PT-BR/glossário · UI · depende de F3-00/F6-09
- NEW-4 · `Pathfinder.hasLineOfSight` devolve false para pontos idênticos (0/0 = NaN em `t`) · PERF · achado na F0-05 (`src/core/Pathfinder.js:157-175`)
- NEW-5 · Remover materiais/texturas criados e não usados (OrcWatchtowerModel:50-51, OrcLumberMillModel:51-52, PigFarmModel:52, TreeModel:259, ArcherModel:90) · PERF/ART · lint da F0-05
- NEW-6 · Completar F1-01: empacotar roughness+metalness (ORM) para High < 300 MB; pintura em Worker/OffscreenCanvas; cache IndexedDB; troca de qualidade sem recarregar · PERF
- NEW-7 · `TreeManager`: InstancedMesh desenha sempre 120 instâncias (vagas com escala 0) e a esfera de culling cobre o mapa (~700k tris por passada de sombra) → ajustar `count`, dividir em chunks, LOD · PERF · achado na F1-04
- NEW-8 · ✅ Rosto dos orcs (Peão, Grunt, Arremessador, Ogro) repetia nas 6 faces da cabeça → corrigido: textura só na face frontal (+Z). Regra para TODOS os modelos novos (inclusive Blender): textura de rosto só na frente da cabeça · ART · pedido do dono
- NEW-9 · IA destruiu HQ de jogador parado em < 240 s nos testes da F2-01 — avaliar agressividade inicial ao criar dificuldades (F5-03) · AI
- ✅ NEW-10 · `DONE(944b6ee)` golpe corpo a corpo/arremesso agora termina à frente (+Z): eixo X do braço/arma espelhado em 6 animações + gather; verificado no inspetor (Grunt/Ogro: arma atrás no preparo, ~1,1–1,4 u à frente no impacto) · haiku
- NEW-11 · Avisos de deprecação three 0.186: `THREE.Clock` → `THREE.Timer`; `PCFSoftShadowMap` removido (cai para PCF) — ajustar QualitySettings/main · PERF
- ✅ F0-08 · `DONE(d17aaf5)` Scripts de navegador abortam sem GPU real (`tools/lib/assertGpu.mjs`); `safe-run.sh` agora reentrante (deadlock de safe-run aninhado corrigido)
- ✅ NEW-12/F7-00c · `DONE(7d6f712)` modelos .glb ligados por padrão (`?glb=0` desliga), carregam também com `?skipPreload` (verificado no navegador)
- NEW-13 · Névoa: chamas de construções inimigas na memória continuam animando (Building.js não checa visibilidade); céu azul aparece além da borda do mapa em área não explorada (fundo da cena deveria escurecer) · PERF/CORE
- NEW-14 · `Unit.update` domina a CPU (~4,5 ms com 310 unidades): animação procedural roda para toda unidade todo frame. Otimizar: animar só unidades visíveis no frustum/névoa, reduzir taxa de animação por distância (LOD de animação), simulação em tick fixo 20 Hz (F1-09) · PERF
- ✅ F1-03b · `DONE(38c013b)` unidades como SkinnedMesh rígido, 1 Skeleton por instância: knight 41→19, archer 54→25, grunt 25→12 draw calls; combate100 31→37,5 FPS, massa300 12→17 FPS. Aldeão 55→58 (nós de ferramenta)
- NEW-15 · Meta 50 FPS em combate100 ainda não atingida (37,5): restam ~20 draw calls/unidade por muitos materiais PBR. Caminho: atlas de material por unidade (1–2 materiais) — naturalmente resolvido pela migração das unidades para o pipeline Blender (F7-00b, adiada) — e depois instancing por tipo/VAT · PERF/ART
- ✅ BUGS-01 (PR#1, nuvem): NEW-2 reembolso IA, NEW-11 Clock→Timer/PCFShadowMap, NEW-5 materiais não usados (lint 32→25 avisos), NEW-13 fundo além do mapa escurece com a névoa
- NEW-16 · HUD < 1100 px esconde o máximo de população (mostra "5" em vez de "5 / 10") · UI
- ✅ NEW-17 · `DONE(297a07e)` textura do terreno pintada pela altura em mapas não continentais (`getTerrainTexturesFromHeight`); continental inalterado · haiku. Obs.: o padrão "rachado" restante na água é a textura do `Water.js` (cáusticas), não do terreno
- ✅ NEW-18 · `DONE(640dff1)` guia rápido não estica sem seleção (grid-column fixo nos filhos de #bottom-bar) · haiku
- NEW-19 · Ruínas/clareira ao destruir construção ou esgotar mina (como no WC2), procedural, só render · VFX · spec `docs/specs/NEW-19-ruinas.md` · **nuvem** (após F3-01/F6-08; parte da mina depende do evento `RESOURCE_DEPLETED` da F3-04)
- ⏸ NEW-20 · **ADIADA pelo dono** (agente Haiku bloqueado sem permissão para `npx vitest`; spec pronta em `docs/specs/NEW-20-teste-intermitente.md`) · Teste intermitente: 1 falha na 1ª execução de `npm test` após o merge da F3-04 (5 execuções seguintes 264/264) — provável timeout de teste pesado (determinismo/headless) com cache frio; aumentar `testTimeout` desses testes · QA · haiku
- ✅ NEW-21 · `DONE(4b67cb1)` Pathfinder._searchAStar não atravessa bloqueios; sem caminho retorna até o ponto alcançável mais próximo (ou para se nenhum vizinho) · PERF/GAME · haiku
- ✅ NEW-22 · `DONE(3ed0b17)` Textos em inglês no card de seleção ("Carry: 0/10 gold") traduzidos para PT-BR; glossário de nomes em `src/data/names.js`; labels Atk→Ataque, Def→Defesa, Spd→Vel, Carry→Carga; tipos de recursos traduzidos · UI
- ✅ NEW-3 · `DONE(3ed0b17 — parte simples)` Card de seleção mostra nomes PT-BR unificados com `entityName` em `units.js` e `buildings.js`; tradução de labels e tipos de recursos. Parte de i18n completa fica para F6-09. · UI
- NEW-23 · Projéteis de cerco balísticos que podem errar alvo em movimento — implementar junto com a F4-02 (cerco) · GAME
- NEW-1 · Avaliar uso real de `GLTFBuildingLoader` em `GreatHall.js` e remover ou adotar no pipeline Blender (F7-00) · ART · ficou fora do escopo da F0-03

## Notas de integração
_(quando uma tarefa precisar tocar arquivo de outra lane, registrar aqui: `<ID>: arquivo — o que mudou`)_
