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

## Fluxo de execução (histórico, 2026-09-28)
Sonnet 5.5 escreve a spec em `docs/specs/<ID>.md`; agente **Sonnet** executa; o coordenador revisa relatório + testes e faz o merge. Tarefas de arte no Blender (F7-*) **liberadas pelo dono em 2026-10-09**.

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
| `docs/specs/F7-00d-lacaio-blender.md` | F7-00d Lacaio no Blender — **liberada em 2026-10-09** (pendente; modelagem por Sonnet 5.5) | sonnet 5.5 |
| `docs/specs/F3-04-economia.md` | F3-04 economia WC2 — **DONE (5b8a72e)**; toca GameManager/Unit/Building/ai → não vai para a nuvem | sonnet (local) |
| `docs/specs/F3-03-combate.md` | F3-03 — spec pronta; **local, depois da F3-04** | sonnet (local) |
| `docs/specs/F3-07-pesquisas-niveis.md` | F3-07 — **DONE** | sonnet (local) |
| `docs/specs/F3-06-niveis-centro.md` | F3-06 — spec pronta; **local, depois da F3-04 (e F3-03)** | sonnet (local) |
| `docs/specs/NEW-19-ruinas.md` | NEW-19 ruínas — **nuvem** | sonnet (claude.ai/code) |
| `docs/specs/BUGS-01-pequenos.md` | NEW-2, NEW-11, NEW-5, NEW-13 — **nuvem** (ver `docs/HANDOFF_CLOUD.md`) | sonnet (claude.ai/code) |
| `docs/specs/F1-07-pathfinder.md` | F1-07 + B8 + NEW-4 — **nuvem** | sonnet (claude.ai/code) |
| `docs/specs/F6-03-hud-responsiva.md` | F6-03 + B11 — **nuvem** | sonnet (claude.ai/code) |
| `docs/specs/F1-03-unidades-por-osso.md` | F1-03 — **DONE parcial** | sonnet |
| `docs/specs/F1-03b-unidades-skinned.md` | F1-03b SkinnedMesh rígido — **DONE (38c013b)** | sonnet |
| `docs/specs/F1-06-grade-espacial.md` | F1-06 — **DONE parcial** | sonnet |

## Quadro resumo (atualizado 2026-10-11)

| Fase | Total | TODO | DOING | REVIEW | DONE |
|---|---|---|---|---|---|
| F0 Fundação | 7 | 0 | 0 | 0 | 7 |
| F1 Desempenho | 10 | 0 | 1 | 0 | 9 |
| F2 Núcleo | 8 | 0 | 0 | 0 | 8 |
| F3 Jogabilidade base | 12 | 0 | 0 | 0 | 12 |
| F4 Expansão | 9 | 0 | 0 | 0 | 9 |
| F5 IA | 6 | 0 | 1 | 0 | 5 |
| F6 HUD/UX | 9 | 0 | 0 | 0 | 9 |
| F7 Arte/Áudio | 11 | 2 | 0 | 3 | 6 |
| F8 Conteúdo | 6 | 1 | 0 | 1 | 4 |
| F9 Multiplayer | 5 | 0 | 0 | 1 | 4 |
| F10 Qualidade/Release | 5 | 0 | 0 | 2 | 3 |
| **Total** | **88** | **3** | **2** | **7** | **76** |

- **Backlog NEW** (2026-10-11): 32 DONE · 12 REVIEW · 2 TODO (NEW-6 e NEW-14, com spec no master) · 7 sem status (ver `docs/AUDITORIA_BACKLOG.md` e `docs/ESTADO_NUVEM.md`).
- **REVIEW** (verificação local): F7-00b, F7-08, F7-09, F8-05, F9-05, F10-04, F10-05. **TODO**: F7-01, F7-07 (Blender), F8-06 (campanha Horda, premissa aprovada).
- **Decisões do dono (2026-10-11)**: todas tomadas, ver `docs/ESTADO_NUVEM.md` §5. F7-02, F8-03 e F9-03 foram marcadas DONE conforme a decisão.
- **Sincronização**: este quadro reflete os merges da nuvem até `0095925`. A fonte atual de classificação é `docs/ESTADO_NUVEM.md`.

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
- **Status**: `DOING(parcial: itens 1–4 mesclados; F1-10c depende de medição local de massa300)` · Lane PERF · Onda 3 · Dep: F1-02, F1-03 — parcial da nuvem (ccf49ec): núcleo `src/render/lod.js` e decorações escondidas no zoom máximo; spec em `docs/specs/F1-10-lod-culling.md`; meta ≥ 45 FPS em massa300 pendente (medição local)
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
- **Status**: `DONE(2026-10-01)` · Lane CORE · Onda 3 · Dep: F2-01, F2-04
- **Fazer**: serializar estado da simulação (JSON compacto) em slots no IndexedDB; autosave opcional.
- **Aceite**: salvar no minuto 5, carregar e continuar sem diferenças visíveis.

### F2-07 · Barramento de eventos e desacoplamento
- **Status**: `DONE(13fc992)` · Lane CORE · Onda 2 · Dep: —
- **Fazer**: `EventBus` (unitDied, buildingCompleted, underAttack, researchDone, resourceDepleted…) consumido por UI, áudio, IA, estatísticas; mover `UnitAnimator` de `src/inspector/` para `src/animation/` (inspetor passa a importar de lá).
- **Aceite**: `Unit`/`Building` não referenciam `uiManager`/`soundManager` diretamente.
- **Resultado**: `src/sim/EventBus.js` + `events.js`; ouvintes `audio/AudioEvents.js`, `render/VfxEvents.js`, `ui/UiEvents.js` (não criados em headless); zero chamadas diretas de som/VFX/UI na simulação; `UnitAnimator` em `src/animation/`. Determinismo intacto. 197 testes. B13 corrigido.

### F2-08 · Separação sim/render
- **Status**: `DONE(2026-10-02)` — F2-08/08b/08c/08d: src/sim sem three.js/DOM/som/IA (aiRegistry), guardado por layers.test.js; headless-match com checksum estável (seed 1 = 839279722)
- **Fazer**: `src/sim/` sem import de three.js; `src/render/` com views por entidade; permitir rodar a simulação headless (Node) para testes e IA×IA.
- **Aceite**: `node tools/headless-match.js --seed 1` roda uma partida IA×IA até o fim.

---

## F3 — Jogabilidade WC2 (base)

### F3-00 · Documento de design de paridade (tabelas finais)
- **Status**: `DONE(aprovado 2026-09-29 — docs/08_GAME_DESIGN.md, D4–D7)` · Lane GAME · Onda 2 · Dep: F0-07
- **Fazer**: **glossário oficial de nomes próprios** (facções, unidades, construções, magias — decisão D2) e `docs/08_GAME_DESIGN.md` com a árvore tecnológica completa das 2 facções (tiers, construções, unidades, pesquisas, magias), stats iniciais e tabela de contra-unidades, baseado em [05_PARIDADE_WARCRAFT2](05_PARIDADE_WARCRAFT2.md) com nomes originais.
- **Aceite**: aprovado pelo dono do projeto.

### F3-01 · Controles RTS completos
- **Status**: `DONE(2026-10-01)` · Lane GAME · Onda 3 · Dep: F2-02
- **Fazer**: grupos Ctrl+1..9 (duplo toque centraliza), Shift adiciona/remove da seleção, duplo clique seleciona todos do tipo na tela, Shift+ordem enfileira, A=attack-move, S=stop, H=hold (HQ vira Backspace), P=patrol, pan pela borda, arrastar com botão do meio, clique direito no minimapa, tecla de trabalhador ocioso (`.`), barra de espaço vai ao último alerta, limite de seleção configurável (WC2 = 9; padrão sugerido 24).
- **Aceite**: checklist de controles testada manualmente e com teste de input automatizado.

### F3-02 · Movimento em grupo e formações
- **Status**: `DONE(2026-10-01)` · Lane GAME · Onda 3 · Dep: F1-07
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
- **Status**: `DONE(bad98e7)` (spec: docs/specs/F3-05-reparo-cancelamento.md) · Lane GAME · Onda 4 · Dep: F2-02
- **Fazer**: trabalhadores reparam construções/máquinas (custo proporcional); cancelar construção devolve 75%; vários trabalhadores aceleram a obra.
- **Aceite**: testes manuais + unidade.
- **Resultado**: `CMD.REPAIR`/`CANCEL_CONSTRUCTION`, `src/sim/repair.js` (reparo 50% do custo, cancelar 75%), máx. 4 trabalhadores por obra, obra nasce com 10% de PV, IA repara, botão Reparar (R) e Cancelar obra. Só o próprio dono repara. Verificação manual no jogo pendente → NEW-28. 360 testes.

### F3-06 · Tiers de HQ e árvore tecnológica
- **Status**: `DONE(369cc38)` · Lane GAME · Onda 4 · Dep: F3-00
- **Fazer**: HQ T1→T2→T3 (Salão→Fortaleza→Castelo / equivalentes orcs) com upgrade in-place e modelo novo por tier; requisitos de construção/unidade/pesquisa; UI mostra requisitos faltantes.
- **Aceite**: não é possível treinar/construir sem requisitos; IA respeita.
- **Resultado**: `src/data/tiers.js` (3 níveis, PV 1600/2200/2800, custos nv2/nv3, ouro ×1,0/1,1/1,2), comandos `UPGRADE_HQ`/`CANCEL_UPGRADE_HQ`, evento `HQ_TIER_CHANGED`, requisitos `{hq:N}` em construções/unidades/pesquisas, card "NÍVEL N — nome" com botão Evoluir e progresso, IA evolui o Centro. Grande Salão PV 1750→1600 (tabela única). Petróleo do nv3 declarado, cobrança fica para F4-07. 298 testes.

### F3-07 · Pesquisas em níveis
- **Status**: `DONE(15f7969)` (spec: docs/specs/F3-07-pesquisas-niveis.md) · Lane GAME · Onda 4 · Dep: F3-06
- **Fazer**: ataque/armadura corpo a corpo 2 níveis (Forja), projéteis 2 níveis (Serraria), cerco 2 níveis, upgrades de classe (Arqueiro→Patrulheiro, Lançador→Berserker), torres Guarda/Canhão.
- **Aceite**: dados em `src/data/upgrades.js`; UI da forja/serraria mostra níveis.
- **Resultado**: catálogo `RESEARCH` (11 pesquisas, 2 níveis, Forja/Serraria), `Player.researchLevels`, requisitos `{research}`, classe avançada (Patrulheiro/Enfurecido, modelo do atirador base), IA pesquisa, HUD com nível N/M. Cerco/naval ficam para F4. 312 testes, smoke ok.

### F3-08 · Muralhas
- **Status**: `DONE(db969c7)` (spec: docs/specs/F3-08-muralhas.md) · Lane GAME · Onda 4 · Dep: F1-07
- **Fazer**: colocação por arrasto em grade, segmentos que se conectam, bloqueiam pathfinding, podem ser destruídos.
- **Aceite**: IA encontra caminho alternativo ou ataca a muralha.
- **Resultado**: `wall_human/wall_orc`, `CMD.PLACE_WALL`, arrasto em 8 direções, `Wall`/`WallBatch` (InstancedMesh, +2 draw calls com 43 segmentos), pathfinder com `noPath` e correções, unidades atacam muralha que bloqueia, IA constrói linha de 6. 327 testes.

### F3-09 · Condições de vitória e estatísticas
- **Status**: `DONE(fcf0c73)` (spec: docs/specs/F3-09-vitoria-estatisticas.md) · Lane GAME · Onda 4 · Dep: F2-04, F2-07
- **Fazer**: modos "Destruir tudo" (padrão WC2) e "Regicídio (HQ)"; coleta de estatísticas (unidades treinadas/perdidas/mortas, construções, recursos coletados, APM, tempo).
- **Aceite**: dados alimentam a tela F6-07.
- **Resultado**: `victoryMode` conquest/regicide (menu + `?victory=`), `src/sim/victory.js`, `MatchStats` (kills via `killerOwnerId`, `RESOURCES_SPENT`, série 10 s, score, APM), `gm.result`, modal com resumo. Derrotado fica inerte. APM da IA = 0 (IA não usa `gm.issue`). 327 testes.

### F3-10 · Neutros e critters
- **Status**: `DONE(05b8740)` (spec: docs/specs/F3-10-neutros-critters.md) · Lane GAME · Onda 4 · Dep: F2-01
- **Fazer**: jogador neutro hostil com Acampamento de Bandidos (modelos prontos) que guarda recursos e dá recompensa; critters decorativos (ovelhas/porcos) que podem ser mortos.
- **Aceite**: mapa com 2 acampamentos neutros jogável.
- **Resultado**: `NEUTRAL_HOSTILE_ID=99`, `neutrals` validados nos mapas (2 acampamentos cada), `spawnNeutrals`, leash/regen dos bandidos, recompensa + `CAMP_CLEARED`, critters (ovelha/porco), minimapa laranja, card do acampamento. Pendências → NEW-25/26/27. 360 testes.

### F3-11 · Revisão de balanceamento base
- **Status**: `DONE(a048317)` (spec: docs/specs/F3-11-balanceamento-base.md) · Lane GAME + QA · Onda 5 · Dep: F3-03..F3-07, F8-? headless
- **Fazer**: simulações IA×IA headless (F2-08) em lote para medir taxa de vitória por facção; ajustar dados.
- **Aceite**: 45–55% de vitória por facção em 200 partidas IA Difícil × IA Difícil.
- **Resultado**: `tools/balance-sim.mjs` + `balance-audit.mjs` + `docs/BALANCEAMENTO.md`; 200 partidas IA×IA (continental-1v1): humano 51,7 % / orc 48,3 % das decididas, empates 14 %. Causa raiz do baseline 0/100: Fazenda humana com `popGranted` 0 (IA nunca construía Quartel) → 5. Ajustes de PV em Cavaleiro/Arqueiro/Grunt/Patrulheiro/Enfurecido. Mede só o nível 1 (a IA não evolui Centro/pesquisa/Ogro): repetir com a F5. 377 testes.

---

## F4 — Jogabilidade WC2 (expansão)

### F4-01 · Cavalaria (Estábulo / Covil de Ogros)
- `DONE(8f753cf)` (spec: docs/specs/F4-01-cavalaria.md) · GAME+ART · Dep: F3-06 · Cavaleiro real (humano) e ajuste do Ogro; Cavaleiro→Paladino com upgrade.

### F4-02 · Unidades de cerco (Balista / Catapulta)
- `DONE(f419963)` (spec: docs/specs/F4-02-cerco.md) · GAME+ART · Dep: F3-03, F3-06 · Oficina (Inventor/Alquimista); dano em área, alcance mínimo, projétil balístico visível.

### F4-03 · Sistema de mana e habilidades
- `DONE(19c7eae)` (spec: docs/specs/F4-03-mana-habilidades.md) · GAME · Dep: F2-02 · Mana com regeneração, habilidades com alvo (unidade/área/auto-cast), cooldown, pesquisa que libera magia, UI no card de comandos, VFX genéricos.

### F4-04 · Conjuradores e magias
- `DONE(48d6b14)` (spec: docs/specs/F4-04-conjuradores-magias.md) · GAME+ART · Dep: F4-03 · Humano: Mago (Bola de fogo/Lentidão/Invisibilidade/Polimorfia/Nevasca), Paladino (Cura/Visão sagrada/Exorcismo). Orc: equivalentes originais do Cavaleiro da Morte e Ogro-Mago (Sede de Sangue/Runas/Olho vigilante/Ressuscitar mortos/Redemoinho). Construções: Igreja/Altar, Torre de Magos/Templo.

### F4-04b · Templo/Altar, Templário e Ogro Feiticeiro, magias restantes
- **Status**: `DONE(ebb67e5)` (spec: docs/specs/F4-04b-templo-magias-restantes.md) — Templo/Altar, `cavalry_class` (Templário/Ogro Feiticeiro), 7 magias novas, `revealArea`, `hazards`, `layer:'air'` mínimo (F4-06 estende). 468 testes. Pendências: Templário/Ogro Feiticeiro sem arte própria; Olho Vigia usa pathfinder terrestre; sem capturas/bench · GAME · Dep: F4-01, F4-04

### F4-05 · Sapadores
- `DONE(19c7eae)` (spec: docs/specs/F4-05-sapadores.md) · GAME+ART · Dep: F3-08 · Unidade suicida que destrói muralhas/rochas/construções.

### F4-06 · Unidades aéreas
- `DONE(2026-10-01)` · GAME+ART · Dep: F3-06 · Batedor aéreo (máquina voadora/zepelim) e atacante aéreo (grifo/dragão); camada de voo ignora terreno; só atingível por distância/torres.

### F4-07 · Naval + Petróleo
- `DONE(2026-10-07)` · F4-07a (2026-10-02: petróleo, grade/pathfinder naval, Estaleiro/Doca, Petroleiro, Plataforma, Refinaria/Caldeirão, extração, mapa `estreito-1v1`) + **F4-07b (2026-10-07, branch task/F4-07: Fragata/Galé, Barcaça com `LOAD`/`UNLOAD`, Couraçado/Leviatã, Submersível/Tartaruga, Fundição/Fornalha Naval + pesquisas `naval_cannons`/`naval_hulls`, HUD, i18n PT-BR/en, IA não trava; GLBs por facção com procedurais de fallback; testes `ships.test.js`/`commands.test.js`; capturas em `tools/ui-captures/naval/`)** · GAME+ART+CONTENT · Dep: F2-05, F3-06 · **Petróleo só é liberado após o Centro da Cidade T2 (decisão D1).** Pendências: Submersível/Fundição sem .glb (procedurais); IA naval/anfíbia fica para a F5; cano de canhão usa o projétil `bolt`/`boulder` (sem sprite de bala própria).

### F4-08 · Heróis de campanha
- `DONE(2026-10-08)` (branch task/F4-08) · GAME · Dep: F8-04 · 3 heróis únicos (Brann, Drogath, Oren) em `units.js` (`unique`/`isHero`) + `src/data/heroes.js`; `spawnUnit` recusa o 2º (`gm.uniqueSpawned`); 3 habilidades `hero_*`; HUD (barra ×1,6, retrato dourado, ★); números em 08_GAME_DESIGN §5.3b; `tests/unit/heroes.test.js`. Pendências: níveis/XP/reviver (D6), aura, ícones/arte próprios.

---

## F5 — Inteligência Artificial

### F5-01 · Refatorar IA para jogadores + comandos
- `DONE(2026-10-02)` · AI · Onda 3 · Dep: F2-01 (F2-02 quando pronto) · Remover `EnemyAI.js`; `AIDirector` por `playerId`, emitindo comandos; várias IAs simultâneas (FFA/times).

### F5-02 · Percepção sob a névoa
- `DONE(2026-10-02)` · AI · Dep: F1-05, F5-01 · IA só "sabe" o que suas unidades viram (memória de última posição); scout ativo. Dificuldade Brutal pode trapacear (opcional).

### F5-03 · Níveis de dificuldade
- `DOING(parcial, 2026-10-02)` (perfis, APM e bônus Brutal prontos; meta Difícil×Normal ≥ 60 % NÃO atingida: 48 % em 20 partidas pareadas; falta vantagem estrutural da Difícil — expansão/economia; adiado a pedido do dono) · AI · Dep: F5-01 · Fácil / Normal / Difícil / Brutal: APM máximo, atraso de reação, qualidade de micro, bônus de recursos só no Brutal; configurado no setup da partida.

### F5-04 · Estratégias e build orders
- `DONE(2026-10-02)` · AI · Dep: F3-06 · Perfis (rush, boom econômico, tartaruga, tech aéreo) por facção; escolha aleatória por seed; adaptação à composição do inimigo (contra-unidades).

### F5-05 · Micro tático
- `DONE(2026-10-02)` · AI · Dep: F3-03 · Recuar feridos, focar fogo, kiting de ranged, proteger cerco, flanquear, atacar trabalhadores, usar magias (após F4-04).

### F5-06 · IA de campanha/gatilhos
- `DONE(2026-10-09, task/F5-06)` · AI+CONTENT · Dep: F8-04 · Ondas scriptadas, defensores fixos, ataques programados por gatilho.

---

## F6 — HUD / UX

### F6-01 · Menu principal
- `DONE(520dcc7)` · UI · Onda 1 (maquete) / Onda 2 (integração com F2-04) · Novo Jogo, Campanha, Multiplayer, Opções, Inspetor, Créditos; fundo 3D animado da cena; substitui parâmetros de URL.

### F6-02 · Tela de configuração de partida (Skirmish)
- `DONE(2026-10-02)` · UI · Dep: F2-04 · Escolha de facção (Aliança/Horda com prévia 3D), mapa (miniatura), 1–7 oponentes IA, times, cores, dificuldade, recursos iniciais, condição de vitória, seed.

### F6-03 · HUD responsiva estilo WC2 (corrige B11)
- `DONE(PR#3)` · UI · Dep: F0-06 · Layout que funciona de 1024×768 a 4K (escala de UI); painel de seleção com retrato; seleção múltipla em grade com barras de vida; card de comandos 3×3 com atalhos visíveis; tooltips com custo, requisitos e descrição.

### F6-04 · Minimapa de produção
- `DONE(2026-10-02)` · UI · Dep: F2-05, F1-05 · Renderizado a partir do mapa/terreno real, trapézio do frustum da câmera, pings de ataque, ordens por clique direito, cores de jogador.

### F6-05 · Alertas e feedback
- `DONE(2026-10-02)` · UI+AUDIO · Dep: F2-07 · "Estamos sob ataque", "Mina esgotada", "Pesquisa concluída", "Construção concluída", "Não há comida suficiente"; ping no minimapa; Espaço vai ao alerta.

### F6-06 · Cursores contextuais e destaque
- `DONE(2026-10-02)` · UI+PERF · Dep: F2-02 · Cursor de atacar/coletar/construir/inválido/alvo de magia; contorno (outline) na entidade sob o mouse.

### F6-07 · Tela pós-jogo
- `DONE(2026-10-02)` · UI · Dep: F3-09 · Pontuação estilo WC2 (unidades, construções, recursos, ranking), gráficos de evolução, botões Jogar de novo / Menu.

### F6-08 · Opções completas
- `DONE(2026-10-02)` · UI · Dep: F1-04, F1-01 · Gráficos (presets + avançado: sombras, texturas, DPR, pós-proc., FPS alvo), áudio por canal, remapeamento de teclas, velocidade de rolagem, escala de UI, modo daltônico para cores de time. Persistência em localStorage.

### F6-09 · Internacionalização + tutorial (corrige B12)
- `DONE(2026-10-02)` · UI · Dep: F6-03 · `src/i18n/{pt-BR,en}.json`, nenhum texto hardcoded; tutorial jogável (missão 0) ensinando coleta, construção, treino, combate.

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
- **Status**: `REVIEW` (arte A e arte B concluídas; ver remanescentes abaixo) — arte liberada pelo dono em 2026-10-09; Sonnet 5.5 modela. Feitos: unidades orcs/humanas base, cerco, conjuradores, cavalaria, Castelo, Estábulo, Covil, Torre Arcana, Santuário, Templo, Altar, Olho Vigia, Templário, Ogro Feiticeiro. Lote 1 (2026-10-02, mergeado): 4 aéreos, Aviário, Ninho, 6 construções humanas base (Quartel, Forja, Casa, Fazenda, Serraria, Torre de Vigia) e 7 orcs (Grande Salão, Quartel, Forja, Toca, Pocilga, Serraria, Torre de Vigia). Lote 2 (2026-10-02, mergeado): Balão refeito, Grande Salão/Quartel orc ajustados, healthBarHeight de 24 construções, Mina de Ouro, Pedreira, Acampamento Bandido, 3 árvores (oak/autumn/pine; a bétula veio depois, arte B), muralhas humana e orc. Arte A (2026-10-10, `task/F7-00b-arte-a`, aguardando merge): Acampamento Bandido 6,5 → ~7,8/10 (muro contínuo de toras com perfil de altura e trecho caído voltado para a câmera do jogo, portão com mourões-totem, torre de vigia, tenda de cumeeira, mastros; 12,4 mil tris, 2 draw calls), Balão de Guerra 7 → ~8/10 (gomos abaulados com costuras de couro, faixa serrilhada com crânio de presas, cesta com tripulantes, bombas e leme; 7,5 mil tris) com capturas EM VOO no ângulo da câmera do jogo e fileira de muralhas (`wall_human`/`wall_orc` refeitos: bloco = `WALL_STEP` 2,4, faces rentes, sem vão; antes 0,2–0,4 de vão entre blocos), tudo conferido no inspetor e no jogo com `?texq=low` (capturas e script em `tools/ui-captures/art-a/`; detalhes em `docs/03_ASSETS_E_INSPETOR.md`). Concluídos pela arte B em 2026-10-10 (ver Resultado abaixo): bétula, correções do Olho Vigia/Ogro Feiticeiro/Templário/Estábulo, remoção dos procedurais substituídos e aceite de desempenho
- **Fazer**: refazer os 37 modelos (prioridade: unidades orcs → construções grandes → ambiente), um agente por grupo de modelos em paralelo; remover `*Textures.js` procedurais substituídos. Substitui F1-02/F1-03/F1-01 para os modelos migrados.
- **Aceite**: load < 5 s; cena inicial < 400 draw calls.
- **Resultado (arte B, 2026-10-10, `task/F7-00b-arte-b`)**: (1) **Bétula** — `tools/blender/build_birch.py` → `public/models/tree_birch.glb` (padrão `tree_*.glb` das outras árvores, que `ModelFactory.createTree` exige; 816 tris, 1 draw call, atlas 512², 80 KB; autoavaliação 7,5/10); `GLB_MODELS.tree_birch`, 4º tipo no `TreeManager` criado sob demanda (sem bétula no mapa não há InstancedMesh), `species: 'birch'` válida (validador, editor, i18n), 2 bosques centrais da `continental-1v1` ((2,−26) e (−2,26): rendem 5 árvores por partida, ~3 bétulas cada; o par (±28,±26) cai no rio e rende só ~1,6 árvore) passaram a bétula (só visual: o checksum não inclui o tipo e o `rngMap` é consumido igual), "Bétula (Blender)" no inspetor, `tests/unit/treeManagerBirch.test.js`. (2) **Correções de arte** (autoavaliação 0–10): Olho Vigia 8 — tentáculos articulados (`Torso` > `Body`/`Fin`/`Anim_Tentacle0..5`, pivô na raiz de cada um, 6 em vez de 5) + `UnitAnimator.applyTentacles` (~20 linhas, só rotação x/z; **não precisou de NEW-xx**) + `tests/unit/unitAnimatorEye.test.js`; Ogro Feiticeiro 7,5 — colar de tempestade no peito (cordão em V, 6 presas, cristal grande), `build_ogre.NECKLACE = False` só no feiticeiro; Templário 8 — sol de 8 raios no escudo e no peitoral do cavalo, ambos para +Z (o do tabardo ficava atrás do pescoço do cavalo); Estábulo 8,5 — cavalos inteiros (anatomia do cavalo do Cavaleiro: castanho e ruço) em baias de 2,5 de profundidade com divisórias (cabeça, pescoço, crina, ombros, tronco, garupa e cauda; sem pernas, que a meia-porta esconde sempre). (3) **Limpeza dos procedurais** — removidos 49 arquivos (23 `*Textures.js` + 26 `*Model.js`, −35,7 mil linhas; bundle `models-human` 703 → 261 KB): Espadachim, Cavaleiro, Arqueiro, Camponês, Bandido, Lacaio, Grunt, Arremessador (o getter do machado de arremesso, usado por `ProjectileViews`, ficou em `axethrowerTextures.js`), Ogro; Castelo, Serraria, Casa, Quartel, Torre, Fazenda, Forja humanos; Grande Salão, Quartel, Chiqueiro, Serraria, Torre, Toca, Forja orcs (5 destes `*Textures.js` já não tinham importador); Mina de Ouro, Pedreira; 4 árvores (`TreeManager` cai numa árvore reserva de uma cor). Critério: `.glb` em uso por padrão desde a F7-00c, autoavaliação ≥ 7, nenhum teste/ferramenta dependente do procedural (busca de importadores). Sem o `.glb` (rede, `?glb=0`) o `ModelFactory._placeholder` entrega um bloco simples; inspetor com 107 entradas; capturas `_old` dos scripts de captura removidas. **Ficaram, e por quê:** `BanditCampModel.js` + `banditCampTextures.js` (Acampamento 6,5/10, em revisão pela arte A); `floraTextures.js`, `rockTextures.js` (decoração, sem .glb); `terrainTextures.js`, `tilesetTextures.js`, `waterTextures.js` (terreno/tilesets/água); `axethrowerTextures.js` (só o machado do projétil); os `*Model.js` sem arquivo de texturas (cerco, conjuradores, esqueleto, sapadores, Olho Vigia, aéreos, Aviário/Ninho, Torre Arcana/Santuário/Templo/Altar, Estábulo/Covil, Oficinas, navais/petróleo, críticos, flecha, muralha): `tests/unit/air.test.js` e `tools/f407b-check.mjs --noglb` dependem do fallback de aéreos/navais, alguns não têm .glb (Fundição, Forja Naval, Refinaria, Caldeirão, Submarino, poço) e nenhum gera texturas de canvas. (4) **Aceite de desempenho** — `?bench=inicial` (Chromium 153 headless com GPU real RX 7600 XT/ANGLE-Vulkan, 1280×720, via `safe-run`, 2 s de aquecimento + 10 s medidos, 3 execuções cada; resultados brutos descartados, só o resumo fica aqui). **Antes** (esta árvore, sem a fusão das plantas aquáticas; `?skipPreload&texq=low`): draw calls 701/716/677 (média 698), FPS 160/150/164, load 3,12/2,76/2,77 s (média 2,88 s). **Depois**: draw calls **241/243/241 (média 242 < 400)**, FPS 243/263/252 (média 253), load **2,78 s** (3,01/2,65/2,67) com `?skipPreload&texq=low`; no caminho real de carga (sem `skipPreload`, com o preload de modelos e texturas) o load é **3,94 s** com `texq=low` (4,09/3,86/3,86; 243 calls, FPS 241) e **4,07 s** na qualidade padrão (4,12/3,99/4,09; FPS 170; o `render.calls` do bench vale 1 com o composer ligado, pois só conta o último passe, então não é comparável). **Aceite atendido** (load < 5 s nos três caminhos; cena inicial 242 < 400 draw calls). Causa dos ~700 draw calls: `Water.createReeds` criava ~625 malhas soltas (7 moitas de hastes, lâminas, folhas e pétalas) = ~504 das 676 chamadas da cena (passe principal 366 + sombras 310; medido escondendo grupos da cena em `tools/ui-captures/art-b/drawcalls.mjs`); `mergeByMaterial` as funde numa malha por material (≈ 8 por moita; −633/−342/−370 chamadas nas 3 vistas de `18-jogo-juncos-*`), com o balanço da moita e a oscilação das folhas preservados e o visual equivalente. A bétula e a limpeza não mexem na cena inicial: o `InstancedMesh` da bétula é +2 chamadas só em mapas com bétula (já incluído), a limpeza tirou ~490 KB de JS do bundle (`models-human` 703 → 261 KB)

### F7-09 · Ícones, retratos e artes 2D renderizados no Blender
- **Status**: `REVIEW` (branch `task/F7-09`; sonnet, 2026-10-09/10; liberada pelo dono em 2026-10-09) · Lane ART+UI · Onda 2 · Dep: F7-00
- **Fazer**: script que renderiza (Eevee) ícones de comando, retratos animáveis de unidades para o painel de seleção, arte do menu principal e da tela de loading a partir dos mesmos `.glb`; sprites em `public/ui/`.
- **Aceite**: HUD usa os novos ícones; consistência visual com o jogo 3D.
- **Resultado**: `tools/blender/render_icons.py`, `render_portraits.py` e `render_art2d.py` (Eevee, mesmos `.glb`; apoio em `ui_common/ui_specs/ui_glyphs/ui_scene/ui_sheet.py`) geram `public/ui/` = **2,65 MiB** (teto 15): **140 ícones** 128² e 256² RGBA com fundo transparente (36 unidades — incl. classes/heróis com selo e navios `_orc` —, 33 construções, 17 comandos, 19 pesquisas, 21 magias, 14 atributos `stat_*`), **36 retratos × 2 estados** (idle/ataque, 128²) e as artes `art/menu.webp` e `art/loading.webp` (1920×1080, 131 e 107 KB), mais `manifest.json` (ids, aliases, bytes). As poses de ataque/lançamento vêm do **`UnitAnimator` real** (`node tools/dump-portrait-poses.mjs` → `portrait_poses.json`), não de fórmulas reescritas. HUD: `src/ui/uiSprites.js` (manifesto por `fetch`, ids/URLs, estado do retrato, `<img>` com fallback **sprite → ícone antigo → emoji**, inclusive para `<img>` estáticas que falharam antes do JS) + `UIManager` (botões de treino/construção/pesquisa/magia/parar/reparar/desembarcar/evoluir Centro, fila, grade da seleção múltipla, linha de atributos, ícone da construção no cabeçalho, **retrato animável** idle↔ataque com cross-fade por `Unit.anim`, herói com anel dourado), menu e loading com a arte (somem sozinhos se a imagem falhar). Verificação no jogo (`tools/capture-art2d.mjs`, GPU RX 7600 XT, `?skipPreload&texq=low`): 24 capturas em `tools/ui-captures/art-2d/` (+ folhas de contato dos sprites), 0 erro de console, 0 imagem quebrada, retrato trocou para ataque em combate real, e com `/ui/*` bloqueado a HUD continua com os ícones antigos/emoji. Gates: vitest 104 arquivos/1243 testes (16 novos em `tests/unit/uiSprites.test.js`: resolução/aliases/fallback e arquivos reais — tamanho, alfa, cobertura de todo o jogo, teto de 15 MiB), eslint 0 erros (68 avisos antigos), `npm run build` ok, `npm run smoke` ok. **Bundle JS**: nenhum asset/JSON embutido (manifesto e sprites por URL); o código novo soma +8,4 kB no chunk `main` (400,5 → 408,9 kB; +2,8 kB gzip), CSS +4,1 kB. Pendências: Ovelha, Submersível, Tartaruga Colossal, Refinaria, Fundição, Forja Naval e Caldeirão não têm `.glb` (seguem com o ícone antigo até a F7-00b); diálogos de missão seguem com retrato emoji (personagens); refinar a arte de menu/loading (nuvens, mais profundidade) se o dono pedir.

### F7-01 · Paridade de fidelidade das unidades orcs
- `TODO` · ART · Onda 1 · Dep: — · Peão, Grunt, Lançador e Ogro no nível de detalhe do Cavaleiro/Arqueiro (hoje 25–38 meshes vs 83–154), seguindo `modeloorcs.png` e `specs/`. Coordenar com F1-03 (fazer antes do merge por osso ou refazer o merge).

### F7-02 · Cores de time
- `DONE(decisão do dono 2026-10-11: fica como está; revisão visual local pendente)` · ART · Dep: F2-01 · Máscara de team color nas texturas (canal/área de estandartes, capas, escudos) + uniform por jogador; prévia no inspetor com seletor de cor.

- **Resultado**: bench `inicial` 176,8 fps / 627 calls (sem regressão; a tinta é feita só ao criar a instância). `src/render/teamColor.js` (extraído de `glbModels.js`, que reexporta `setTeamColor`). **Convenção de máscara**: a máscara de time de um modelo = malhas cujo material se chama `TeamColor` (estandartes, capas, escudos, faixas, velas); `material.color` multiplica o atlas só nessas áreas, o resto nunca é tocado. Materiais tintados cacheados por (material de origem, cor) via `getTeamMaterial`: N unidades/construções do mesmo jogador compartilham 1 material, sem draw call extra nem alocação por frame; suporta materiais em array e recolorir (usa o original em `userData.teamSrcMaterial`; mantém `origMaterial` do `UnitAnimator`). `teamTint(base, máscara, time)` = função pura de tingimento (testada); `hasTeamMask`; `TEAM_PALETTE` = `PLAYER_COLORS` (cor do jogador já definida em `MatchConfig`, balanceamento intacto). Jogo: `UnitView`/`BuildingView` já aplicam `owner.color`. Inspetor: painel "Cor de Time" (8 amostras + cor livre), recolore em tempo real, `?team=<0-7|hex>`; aviso quando o modelo não tem máscara (procedurais com cor assada, ex.: Quartel procedural). Testes: `tests/unit/teamColor.test.js`. Capturas: `tools/ui-captures/teamcolor/` (`tools/capture-teamcolor.mjs`). Limitação: não foi criado shader/uniform `uTeamColor` com canal de máscara; a máscara é por material (já exportada pelo pipeline Blender), suficiente sem novo draw call.
- **Revisão/fechamento (2026-10-09, task/close-a)**: **NÃO atende literalmente a spec.** Trecho da spec: "Máscara de team color nas texturas (canal/área de estandartes, capas, escudos) + uniform por jogador; prévia no inspetor com seletor de cor". Conferido no código: (1) máscara — não existe canal/região de máscara na textura; a "máscara" são as faces com o material `TeamColor` (índice de material por face em `tools/blender/common.py::finalize_materials`, exportado no `.glb`) e `setTeamColor` troca esse material em cada malha: área por geometria/material, não por textura; (2) "uniform por jogador" — não há `uTeamColor` nem shader próprio: a cor é o `material.color` de um clone cacheado por (material de origem, cor) (`getTeamMaterial`); (3) prévia no inspetor com seletor de cor — atendida (painel "Cor de Time": 8 amostras + cor livre, `?team=`; capturas conferidas em `tools/ui-captures/teamcolor/`). O efeito funcional existe: 60 dos 67 `.glb` de `public/models/` têm o material `TeamColor` (sem máscara: gold_mine, stone_quarry, 3 árvores, 2 muralhas) e os procedurais navais/petróleo também; `UnitView`/`BuildingView` aplicam `owner.color`; `teamColor.test.js` 10/10. Custo da forma escolhida: cada malha com área de time vira 2 primitivas (Atlas + TeamColor; ex.: `knight.glb` tem 2 das 10 primitivas em `TeamColor`) em vez de 1 com máscara em canal. **Pendente: decisão do dono** — aceitar a tinta por material como equivalente funcional (e reescrever a linha da spec) ou exigir máscara em canal de textura + uniform por jogador (retrabalho nos scripts Blender e no shader).

### F7-03 · Iluminação e pós-processamento
- `DONE` · ART+PERF · Dep: F1-04 · Ciclo dia/noite opcional, SSAO leve, bloom para fogo/magias, color grading por tileset, outline de seleção; tudo desligável nos presets.
- **Resultado**: `src/core/lighting.js` (puro, testado: curva dia/noite, `selectEffects`, parsers de `?fx=`/`?daynight=`/`?tod=`, `gradeOf`), `src/render/PostFX.js` (EffectComposer: GTAO, UnrealBloom por limiar HDR + `postfx/bloomTag.js`, contorno de seleção por máscara de meia resolução, grading, OutputPass), campos `bloom/ssao/colorGrading/selectionOutline` nos presets (low nenhum; med sem SSAO; high/ultra todos; `?texq=low` desliga tudo = sem composer), `grade` por tileset em `src/data/tilesets.js`, dia/noite opcional (desligado por padrão). Detalhes em `docs/01_ARQUITETURA.md` (F7-03); capturas em `tools/ui-captures/lighting/`. GTAO só em high/ultra (~8% fps; AO por vértice não cobre entidades dinâmicas).
- **Revisão/fechamento (2026-10-09)**: itens da spec conferidos (dia/noite off por padrão; GTAO só high/ultra; bloom por limiar + `userData.bloom`/`noBloom`; grade por tileset; contorno; presets e `?fx=`; `?texq=low` = sem composer, `postfx.active` falso, calls idênticos a `fx=0`). Correções: (1) névoa azul-escura com composer: causa = `fog_fragment` é o último include do three, então a mortalha/brilho da memória são valores em espaço de SAÍDA, mas com composer o `OutputPass` converte depois; `setFogLinearOutput` (fogOfWarShader.js, chamada pelo PostFX) entrega os valores já em linear e a névoa volta a ser preta; (2) contorno por trás de prédios: máscara agora em 2 passes (oclusores pretos camada 0 + selecionados brancos `LessEqualDepth`), só roda com seleção. Medições: bench `inicial` `?texq=low` 148,5 fps (131–163, 3 execuções) vs 149 fps pré-F7-03 (142–154, 3 execuções) = dentro do ruído; smoke OK (jogo+inspetor, GPU RX 7600 XT); vitest 1190/1190, lint 0 erros, build ok; capturas refeitas (+`07-outline-atras-do-predio`), sem erros de console. Limitação restante: com seleção ativa o passe de oclusores redesenha a cena em meia resolução (custo só enquanto há seleção).

### F7-04 · Terreno e tilesets
- `DONE(2026-10-09, task/close-b)` · ART+CONTENT · Dep: F2-05 · Splat map (grama, terra, areia, pedra, neve, lama), penhascos/elevação, estradas, 4 tilesets estilo WC2 (Floresta, Inverno, Terras Devastadas, Pântano), costa com espuma.
- **Resultado**: `src/data/tilesets.js` (4 tilesets + `splatWeights`), textura por splat em `src/models/environment/tilesetTextures.js` (≤ 2048² lógicos, `?texq=` escala), cliffs com estratos nas cores de vértice (`TerrainView`), `roads`/`splatMasks` opcionais no JSON do mapa, água/espuma/decoração/árvores/céu-névoa por tileset (`Water`, `Decorations`, `TreeManager`, `SceneManager.applyTileset`), espuma = 1 draw call (shader + DataTexture 256²; versão estática em `texq=low`). `verdejante` idêntico ao anterior (caminho legado). Prévia: `/terrain-preview.html` (seletor + comparar 4 + mapa); `?tileset=` força o tileset no jogo. Capturas em `tools/ui-captures/terrain/`. Bench `inicial`: 159,7 fps / 655 calls (antes 146,9 / 700; sem regressão). Limitação: árvores mortas/nevadas são tinta+neve por shader sobre os mesmos modelos (sem malhas novas — dependem de ART/Blender).
- **Revisão/fechamento (2026-10-09, task/close-b)**: **Resultado:** (1) desempenho — bench `inicial` com `?texq=low&skipPreload`, Chromium 153 headless com GPU real (ANGLE/Vulkan, RX 7600 XT), 3 execuções medidas por variante (+1 de aquecimento descartada), rodadas intercaladas (HEAD → pré → ponta) com um dev server por árvore: pré-F7-04 = `e928569` (pai do commit "F7-04: DOING") e ponta da F7-04 = `70856a2`, ambos extraídos com `git archive` em /tmp (removidos depois). FPS médio **157,4** (153,7–161,2) no HEAD `d769cd7` vs **158,9** (158,2–159,7) no pré-F7-04 = **−0,9 %** (limite 5 %); F7-04 isolada (`70856a2` vs `e928569`) 161,6 (156,6–171,5) = +1,7 %. Draw calls médios 692 vs 695 (−0,4 %; F7-04 isolada 684 = −1,6 %), triângulos ≈ 567 mil nos três, load 3,14 s vs 3,02 s (+3,9 %, com `skipPreload`), 0 erros de página; o ruído entre execuções da mesma árvore é ≈ ±5 %. (2) visual — as capturas de `tools/ui-captures/terrain/` foram abertas com Read e conferidas, e recapturadas no HEAD só para checar (`TERRAIN_OUT=<pasta>`, descartadas): no jogo real os 4 tilesets são visíveis e distintos (`game-verdejante/inverno/devastadas/pantano.png`: grama verde com estrada de terra; neve com manchas de lama e estrada de gelo azulada; terra laranja/marrom; lama escura com manchas verdes) e na prévia (`preview-compare-continental/ilhas.png`: Floresta, Inverno, Terras Devastadas e Pântano, cada um com céu/névoa, água e árvores próprios); a espuma da costa é discreta nas capturas `foam-*.png` (versão estática de `texq=low`). Gates do fechamento: ver F7-06.

### F7-05 · VFX
- `DONE(2026-10-09, task/close-a)` · ART+PERF · Dep: F1-08 · Partículas GPU em pool (instanced), destruição de construções com escombros, corpos que decaem, sangue/faíscas, pegadas de construção por estágio, magias.
- **Resultado**: `src/render/vfx/` (3 draw calls: solid/smoke/glow com bloom por `userData.bloom`; corpos em 1 InstancedMesh), mapeamento evento→efeito puro, níveis `off|low|med|high` por preset/`?texq=low`/`?vfx=`, `tests/unit/vfx.test.js`, capturas em `tools/ui-captures/vfx/`, botão no inspetor. Bench (3 execuções, GPU real, vs master): combate100 31,4 → 30,6 fps (−2,5%); inicial dentro do ruído (~95–100 fps). Doc em `01_ARQUITETURA.md` (F7-05). Limitações: o cadáver é um volume achatado genérico (sem malha por unidade); VFX fora da visão de névoa não são gerados.
- **Revisão/fechamento (2026-10-09, task/close-a)**: **Resultado:** itens da spec conferidos no código, nos testes e nas capturas (`tools/ui-captures/vfx/`, jogo + inspetor): pool circular em arrays tipados (`ParticleRing`, spawn sem alocação; o teste confere que os buffers não mudam) e instancing (3 `InstancedBufferGeometry` + 1 `InstancedMesh` de corpos); escombros (`building_collapse`: detritos de madeira/pedra, poeira, coluna de fumaça e brasas); corpos que decaem (`corpseDecay`: 0,9 s de queda, 9 s parado, 5 s afundando/encolhendo; testado); sangue e faíscas (`blood`/`hit_spark`; morto-vivo/cerco soltam ossos/faíscas); obra por estágio (`constructionStage` 0–3 + rastreador 4×/s: poeira, estacas/tábuas/pedras persistentes, brilho ao concluir); magia (`magic` burst/ring/beam/aura a partir de `ability.vfx`, aditivo com `userData.bloom`). Correção pequena feita no fechamento: `corpseDecay` devolvia um objeto novo por cadáver a cada quadro (~57 B/cadáver/quadro: 3,7 KB/quadro com 64 cadáveres, contra a promessa "sem alocação por quadro" do `CorpseDecals`); agora aceita um objeto de saída reutilizado (`CorpseDecals` passa um fixo) e o custo cai para ≈ 0,12–0,15 KB/quadro com os 3 pools cheios e 64 cadáveres (0,06 KB sem cadáveres; ≈ 1 B por cadáver/quadro, sem alocação proporcional a partículas ou cadáveres). Medição: Node com `--expose-gc --min-semi-space-size=512`, `VfxSystem.update` ×100 000 quadros, `heapUsed` antes/depois sem GC no meio; +1 teste em `vfx.test.js` (18/18). VFX fora do checksum: a F7-05 não alterou nada em `src/sim`/`src/ai` (diff só em `src/render`, `MatchSession`, `QualitySettings`, `main`, `inspector`); os efeitos são ouvintes de apresentação do `EventBus` com RNG de render próprio; `determinism.test.js` 2/2 verde. Bench combate100 −2,5 % (31,4 → 30,6 fps, dentro do teto de 5 %) é o já registrado acima (3 execuções, GPU real); não repetido neste fechamento (sem navegador).

### F7-06 · Animação de produção
- `DONE(2026-10-09, task/close-b)` · ART · Dep: F2-07 · Blend entre estados, variações de ataque, animação de morte por tipo de dano, animação de carregar recurso, idle variados.
- **Resultado**: `src/animation/animMath.js` (funções puras: variante estável por id, blend, estilo de morte, idle com rng) + `UnitAnimator` (cross-fade 0,14 s sem alocação por quadro, ataque v0/v1 por id, morte `cut|projectile|crush|magic` via `Unit.lastHitTag` — dica de render escrita em `takeDamage`, fora do checksum, `sim/hitTag.js` —, carga: tronco curvado/braços contidos/mochila balança (ouro/madeira já nas costas), idle olhar/alongar a cada 3,5–8 s). Testes `tests/unit/animMath.test.js`; capturas `tools/ui-captures/anim/` (`tools/capture-anim.mjs`). Bench combate100 52,2 vs 52,9 fps (−1,3%), inicial no ruído. Limitação: petróleo (petroleiro naval) sem animação de carga; magias de habilidade contam como projétil/magia pelo atacante.
- **Revisão/fechamento (2026-10-09, task/close-b)**: **Resultado:** capturas de `tools/ui-captures/anim/` abertas com Read, mais checagens numéricas no mesmo script (`tools/capture-anim.mjs`; saídas `crossfade.json`, `carga.json`, `jogo-dados.json`). (1) Ataque v0/v1: poses distintas nos 6 modelos (no Arqueiro a diferença é só o ponto do saque do arco, pois a variante 1 remapeia o progresso). (2) Morte cut/projectile/crush/magic: 4 poses finais distintas nos 6 modelos (inspetor) e no jogo real: 4 vítimas × 4 atacantes (Espadachim→cut, Arqueiro→projectile, Catapulta→crush, Mago→magic; `Unit.lastHitTag` e `animator.deathStyle` conferem) com a sequência `jogo-morte-1..4-t*.png` (t = 0,35/0,70/1,05/1,40 s). (3) Carregar recurso (Aldeão e Peão): braço 0,45× e tronco +0,16 rad em relação ao andar sem carga (`andar-sem-carga*.png` × `carga-*.png`) e mochila de ouro/madeira vista de costas (`*-costas.png`). (4) Idle: **as capturas antigas `idle-olhar`/`idle-alongar` eram idênticas** (bug do script: `_idleVar` era zerado pelo `setAnimation` chamado depois; e `olhar` usava t = 1,0, onde o seno da cabeça vale 0) — script corrigido e recapturado com a referência sem variante (`idle-base-t0.5/t1.0`): cabeça virada e braços abertos visíveis nos 6 modelos; no jogo real 10 unidades paradas trocaram de variante de idle (0→1/2 e de volta) em 17 s (2–4 mudanças cada) e as duas variantes de ataque por id aparecem (7 × 3). (5) Cross-fade sem pop: sequência `knight|grunt-crossfade-0..4` (golpe a 0,5 s → idle: quadro 1 ≈ pose antiga, meio, fim e o corte seco para comparar) + sonda numérica em 36 transições (6 modelos × idle/walk/fight, quadros de 1/60 s): nas 13 em que um corte seco seria visível (≥ 0,2 rad, até 2,2 rad num quadro) o 1º quadro fica em ≤ 4,2 % do salto e o pico por quadro em ≤ 26 %; a pose exibida é exatamente (1−w)·antiga + w·crua com w = smoothstep(t/0,14 s) (erro ≤ 1,1e-7) e converge à pose crua. **Bug achado e corrigido**: `UnitAnimator.bindModel` repetia em `_blendObjs` os nós referenciados por várias chaves de `meshParts` (Arremessador: `weapon`/`weaponR`/`drawnAxe` = o mesmo nó), então o machado era misturado 3× (peso w³; erro de até 0,98 rad contra a fórmula; sem salto, mas defasado do braço); agora sem repetidos + `tests/unit/unitAnimatorBlend.test.js` (falha sem a correção). Observação fora do critério (não é do blend): o golpe do Arremessador tem 2 saltos de 2,3 rad no machado de mão (`WeaponR`) em p = 0,60 e 0,78 → NEW-49. Gates do fechamento (árvore = master `ad72ff8` + estas mudanças): `npm run smoke` OK (jogo em 5,8 s e inspetor em 3,8 s, GPU RX 7600 XT), `npx vitest run` 103 arquivos / 1226 testes verdes (2 novos), `npx eslint src tests tools` 0 erros (68 avisos antigos), `npm run build` ok.

### F7-07 · Modelos novos (para F3/F4)
- `TODO` · ART · Dep: F3-00 · Todas as construções/unidades novas da árvore tecnológica, cada uma com entrada no inspetor e orçamento (≤ 20 draw calls pós-merge, texturas ≤ 512).

### F7-08 · Áudio de produção
- `REVIEW(mesclada na integração #35; verificação de áudio no navegador pendente)` · AUDIO · Dep: F2-07 · Áudio posicional (atenuação pela câmera), falas de confirmação por unidade (síntese de voz estilizada ou samples originais), música adaptativa (paz/combate) por facção, mixer com limitador, ambiência por tileset.

---

## F8 — Conteúdo

### F8-01 · Pacote de mapas skirmish
- `DONE` · CONTENT · Dep: F2-05 · 6 mapas: 2×1v1, 2×2v2, 1×FFA 4, 1×ilhas (naval, após F4-07); tamanhos 96–192.
  - Resultado: `campos-1v1` (1×1, 160), `desfiladeiro-1v1` (1×1, 144), `vales-2v2` (4 slots, 144), `bosques-2v2` (4 slots, 160), `planalto-ffa-4p` (FFA 4, 176), `arquipelago-naval-4p` (naval 4, 192, poços de petróleo) — JSON em `src/data/maps/`, registrados em `index.js`, testes `tests/unit/mapsSkirmish.test.js`, i18n `map.<id>.name`. Soak `--count 8` por mapa: 8/8 terminaram em todos. Sem 1×1 de 96: com bosques a ≥27 dos pátios não há área para madeira suficiente (seed 1 de 96: 0 árvores). Ajuste em `generator.js` (F8-02): bosques minSlot 17→27 e margem da borda 6→7 (regra NEW-45/46); teste de densidade de `mapGenerator.test.js` passou a usar size 160 e `>=`. Soak que reprovou antes e foi corrigido: campos @128 seed 3 (22 árvores, 4/8 terminaram); naval seeds 6 e 7 (1 partida de 8 sem fim na seed 2 orc/easy) — trocado para seed 3.
  - **Resultado:** 6 mapas × 8 seeds, 48/48 terminam, 0 issues. Confirmação (task/close-c, 2026-10-09, master d769cd7; `src/sim`, `src/ai`, `src/data` idênticos no master 40e83ff): `tools/safe-run.sh --timeout 1800 -- node tools/soak.mjs --count 8 --maps <id> --seed-start 1 --out tools/soak-report/maps/<id>` (consolidado em `tools/soak-report/maps/soak-report.md`) nos 6 mapas: campos-1v1 8/8 (ticks médios 18002, máx 39778), desfiladeiro-1v1 8/8 (10145 / 15773), vales-2v2 8/8 (12175 / 21394), bosques-2v2 8/8 (19540 / 31315), planalto-ffa-4p 8/8 (15916 / 36857), arquipelago-naval-4p 8/8 (22703 / 57179) = **48/48 terminam**; 0 janelas paradas, exceções, NaN ou vazamentos de entidades; determinismo ok (18 re-checadas, 0 divergentes). `tests/unit/mapsSkirmish.test.js` 32/32; os 6 mapas carregam via `getMap`, aparecem em `listMaps` e passam em `validateMapDef` (F8-03) com 0 erros e 0 avisos; nomes `map.<id>.name` presentes em pt-BR e en.

### F8-02 · Gerador procedural de mapas
- `DONE` · CONTENT · Dep: F2-05 · Seed → mapa simétrico balanceado para 2–8 jogadores. `src/data/maps/generator.js` (`generateMap`, determinístico, simetria rotacional/espelhada, minas/florestas/acampamentos/expansões, `naval:true` com poços e costa para Estaleiro, verificação por flood fill no Pathfinder), `registerGeneratedMap` em `maps/index.js`, CLI `tools/gen-map.mjs`, testes `tests/unit/mapGenerator.test.js`.

### F8-03 · Editor de mapas no navegador
- `DONE(decisão do dono 2026-10-11: painted fica em src/sim)` · CONTENT+UI · Dep: F2-05, F7-04 · Pintar terreno/água/florestas, posicionar minas/jogadores/neutros, exportar/importar JSON.
  - **Resultado**: `editor.html` + `src/editor/` (modelo puro `mapModel.js`, vista 2D, prévia 3D leve ou com terreno/tileset do jogo, `storage.js`), novo gerador de altura `painted` (`src/data/maps/painted.js`, registrado em `src/sim/terrainGenerators.js` — única linha de registro fora do escopo, necessária para o `getMap` carregar terreno pintado), validador compartilhado `src/data/maps/validate.js`. Exporta/importa JSON (round-trip exato), desfazer/refazer, salvar local, i18n pt-BR/en. Fora do menu principal (só `editor.html`). Testes `mapEditor.test.js`; capturas em `tools/ui-captures/editor/` (`tools/capture-editor.mjs`). Ver README de `src/data/maps/`.

### F8-04 · Sistema de missões e gatilhos
- `DONE(2026-10-09, task/close-a)` · CONTENT+CORE · Dep: F2-02, F2-07 · Objetivos (destruir, sobreviver X min, escoltar, resgatar, construir N), gatilhos (área, tempo, morte), diálogos/briefings, cutscenes simples de câmera.
  - **Resultado**: `src/sim/missions/` (MissionRuntime, TriggerEngine, 8 tipos de objetivo, 9 condições + all/any/not, 24 ações — as 23 da F8-04 mais `guard` da F5-06 —, schema validado e versionado) integrado a `victory.js`/`GameManager` como `victoryMode:'mission'`; determinístico, no checksum (parte `mission` só em missões), save/replay sem formato novo. Formato e exemplos em `src/data/missions/README.md`; missão `mission-demo` (mapa `tutorial`) cobre todos os tipos. UI: briefing no menu "Missões", painel de objetivos, diálogos com retrato emoji, cutscene por keyframes (Esc pula), tela de fim (`MissionController`/`MissionBriefing`, i18n pt-BR/en). Testes: `tests/unit/mission*.test.js` (+ `layers.test.js` agora resolve imports de subpastas de `src/sim`); captura/checagem de UI em `tools/ui-captures/mission/`. Fora do escopo: campanhas (F8-05/06), transferência de construções, música própria.
  - **Revisão/fechamento (2026-10-09, task/close-a)**: **Resultado:** spec "Objetivos (destruir, sobreviver X min, escoltar, resgatar, construir N), gatilhos (área, tempo, morte), diálogos/briefings, cutscenes simples de câmera" conferida contra o código (`src/sim/missions/`, `schema.js`) e os testes. Objetivos: os 8 tipos (`destroy`, `survive`, `escort`, `rescue`, `build` + `collect`, `eliminate`, `flag`), cada um com teste em `missionRuntime.test.js` (inclui `failWhen`, prioridades primário/secundário/oculto e derrota por aniquilação). Condições: as 9 (`time`, `every`, `area`, `dead`, `count`, `var`, `objective`, `resource`, `trigger`) + `all/any/not`, testadas (inclui `enableTrigger/disableTrigger`, `cooldown`, `once:false`). Ações: as 24 de `ACTION_TYPES`; 22 aparecem no `mission-demo` (conferido por `missionSchema.test.js`), `victory` é testada em `missionRuntime.test.js` e `guard` (F5-06) em `campaignAI.test.js`. Determinismo/checksum: mesma seed + mesmos comandos ⇒ mesmos checksums a cada 20 ticks (900 ticks), o estado da missão entra no checksum (variável diferente ⇒ hash diferente), partidas comuns não ganham a parte `mission`, save/load no meio da missão e replay reproduzem checksums e desfecho. `mission-demo` jogável até a vitória, em headless: `missionDemo.test.js` percorre quartel → ondas → resgate → ruínas ocultas → acampamento → escolta e termina com `gm.gameWon` e `outcome 'victory'` (+ derrota por morte do emissário, e checksums iguais em 2 execuções). Apresentação (briefing, painel, diálogo com retrato, cutscene com letterbox e Esc pula, tela de fim): lógica pura em `missionPresentation.test.js` (10) e capturas conferidas em `tools/ui-captures/mission/` (briefing, cutscene, diálogo, "Missão cumprida"); `capture-mission.mjs` (17 checagens) não foi reexecutado neste fechamento (sem navegador). Testes `mission*.test.js`: 67/67 (4 arquivos); `layers.test.js` verde (sim sem three/DOM, inclui `src/sim/missions`). Conteúdo da demo sem nomes/lore da Blizzard.

### F8-05 · Campanha da Aliança (8+ missões)
- `REVIEW(premissa aprovada 2026-10-11; verificação de jogo local pendente)` · CONTENT · Dep: F8-04 · História original inspirada na temática do WC2.
  - **Resultado**: campanha `alliance` ("A Marcha da Aliança") com 8 missões JSON em `src/data/campaigns/alliance/` (mapas campos, desfiladeiro, estreito, continental, bosques, ilhas-4p, vales, planalto; objetivos/gatilhos variados: construção, resgate, escolta, sobrevivência, economia, aliado que trai, chefe final) + índice `campaign.json` (ordem linear, `requires`, carry-over de recursos 25% com teto 300, heróis reservados para a F4-08). Lógica em `src/campaign/` (`campaign.js` puro; `progress.js` localStorage `warpoly.campaign.v1` por tentativa; gancho de vitória em `main.js`), tela `CampaignScreen` no menu principal (botão "Campanha", i18n pt-BR/en, `?campaign=unlock` libera tudo). **Premissa PROVISÓRIA — aguarda aprovação do dono** (ver `src/data/campaigns/README.md`). Testes: `campaignAlliance.test.js` (validador F8-04, bilíngue, terra firme, desbloqueio, carry-over, progresso) e `campaignPlaythrough.test.js` (simulação headless por missão até a vitória, derrotas, determinismo). Não toca `src/sim/missions`. Fora do escopo: heróis (F4-08), campanha da Horda (F8-06), cutscenes com arte própria.

### F8-06 · Campanha da Horda (8+ missões)
- `TODO(liberada: premissa aprovada; briefing pendente)` · CONTENT · Dep: F8-04.

---

## F9 — Multiplayer

### F9-01 · Arquitetura e prova de conceito
- `DONE(2026-10-09, task/close-b)` · NET · Dep: F2-02, F2-03 · Documento `docs/09_MULTIPLAYER.md`; PoC lockstep 1v1 em 2 abas via BroadcastChannel.
  - Resultado: `docs/09_MULTIPLAYER.md` (turnos, atraso, checksum/desync, WebRTC, lobby, reconexão, IA, replays, auditoria de determinismo) + `src/net/` (LockstepSession, Transport, BroadcastTransport, MemoryTransport, GameSimAdapter), `net-poc.html`, `tests/unit/lockstep.test.js`. Nenhuma mudança em `src/sim/`.
  - **Revisão/fechamento (2026-10-09, task/close-b)**: **Resultado:** `tools/ui-captures/net-poc/capture.mjs` (via `safe-run`, Chromium com GPU real, DUAS abas do mesmo contexto — o BroadcastChannel só cruza abas do mesmo perfil): criar sala na aba 0 (jogador 0) e entrar pela aba 1 (jogador 1); 24 cliques de mover/treinar nas duas abas; 498 turnos (0–497) comparados, cada um com o checksum gravado nas duas abas (a PoC checa todo turno): 0 divergentes, mesmo ouro/unidades/filas nas duas simulações (ouro 200 → 0 com treino; unidades 9 e 4) e as duas mostram "em sincronia"; o botão "Forçar desync" (+1 de ouro só na aba 1) foi detectado nas DUAS abas no turno 516 ("DESYNC — sim congelada", hashes local × remoto cruzados entre as abas, turnos congelados), sem erros de página. Capturas `aba0|aba1-sincronia.png` (linha extra com o checksum do turno 497, igual nas duas) e `aba0|aba1-desync.png`, mais `resultado.json`, em `tools/ui-captures/net-poc/`; o script está citado em `docs/09_MULTIPLAYER.md` §10.

### F9-02 · Servidor de sinalização + lobby
- `DONE(2026-10-09, task/close-b)` · NET · Dep: F9-01 · `server/` (Node + ws ou Cloudflare Worker), salas por código/link, lista de salas públicas.
  - Resultado: `server/` (`signaling.js`, `protocol.js`, `index.js`, `README.md`; `npm run signaling`), `src/net/SignalingClient.js` (reconexão com backoff), `src/net/WebRTCTransport.js` (malha DataChannel, menor id inicia), painel `lobby.html` + `src/net/lobby.js` (não altera o jogo). Testes: `signaling.test.js` (clientes `ws`, porta efêmera), `webrtcTransport.test.js` (RTC falso). Dependência nova: `ws`. Cloudflare Worker/DO só documentado.
  - **Revisão/fechamento (2026-10-09, task/close-b)**: **Resultado:** `tools/ui-captures/lobby/capture.mjs` (via `safe-run`): sobe `npm run signaling` (porta padrão 8787) e o Vite, abre 2 abas (contextos separados) e uma 3ª só para o link. Criar sala pública devolve o código (`VBZYW` na rodada registrada) e "Copiar link" coloca `…/lobby.html?sala=VBZYW` na área de transferência; a 3ª aba entra direto pelo link e sai; a 2ª aba vê a sala na lista pública (`VBZYW · Alice · 1/8`) e entra pelo código; facção (Bruno → Horda, visto por Alice), chat nos dois sentidos (botão e Enter) e mapa (só o anfitrião troca; a escolha chega ao outro, que perde o "pronto") funcionam; "Iniciar" é recusado com 1 jogador ("São necessários pelo menos 2 jogadores.") e com Bruno não pronto ("Nem todos estão prontos.", nenhuma aba recebe `start`); com todos prontos as duas abas recebem o mesmo `start` (seed, jogadores, mapa). **WebRTC**: DataChannel `lockstep` (ordered) aberto nas duas abas com os flags padrão do Chromium (ICE connected, par host/udp, RTT 1 ms), 20 + 20 mensagens trocadas íntegras e em ordem, canal ainda aberto 3 s depois. Servidor e Vite encerrados (portas livres), sem erros de página. Observação cosmética (não bloqueia): o aviso de erro de `lobby.js` não some depois de um `start` bem-sucedido ("Nem todos estão prontos." continua visível em `A-3-partida-iniciada-datachannel.png`) → NEW-50. Capturas e `resultado.json` em `tools/ui-captures/lobby/`; o script está citado em `docs/09_MULTIPLAYER.md` §10.

### F9-03 · Lockstep WebRTC
- `DONE(decisão do dono 2026-10-11: checkEvery=10 em jogo, 1 nos testes)` · NET · Dep: F9-02 · Turnos de comando, atraso de input adaptativo à latência, checksum por turno, detecção e relatório de desync, até 8 jogadores.
  - Pendente: decisão do dono. A spec pede "checksum por turno", mas o jogo real calcula a cada 10 turnos (`checkEvery`, docs/09 §3). Para DONE sem dúvida, ou fixar `checkEvery=1` em jogo (custo O(entidades), medir) ou alterar a spec.
  - Resultado: `?online=1` abre a sala dentro do jogo (`src/net/OnlineLobby.js`: sinalização → malha WebRTC → handshake de versão/hash da config → partida); `LockstepSession` ganhou RTT/jitter por par (ping/pong), atraso adaptativo por par ([2,6] turnos; sobe na hora, desce 1 a cada 30 turnos de folga), `pump()` em tempo real, `status()` e relatório de desync (maioria com ≥ 3 jogadores, categoria e unidades divergentes, `desyncDump()`); `gm.issue` desvia para a sessão em modo online (`gm.netIssue`, `_inStep`); `OnlineHud` (RTT, atraso, "aguardando X", aviso + download do relatório); `src/net/onlineMatch.js` (MatchConfig determinística a partir do `start`, mapa gerado se faltar vaga); `stateChecksumDetail` com ordens/árvores/jazidas/flechas/RNG (+`rng.state()`); `Math.random` removido de `Tree`/`Building` (lançam erro sem rng) + `noMathRandom.test.js`. Testes: `lockstepNet.test.js` (2/4/8 sims, 300 turnos, enlaces/jitter/perda distintos por par, adaptativo sobe/desce, par lento, desync). Navegador: `tools/online-check.mjs` (via safe-run). Fora de escopo (F9-04): reconexão, pausa votada, jogador que sai vira IA, reenvio/ack.
  - **Revisão/fechamento (2026-10-09, task/close-a)**: **Resultado:** critérios conferidos no código e nos testes. Atraso adaptativo por par (`_onPong`/`_retarget`/`_adapt`: RTT/jitter por EWMA, janela [2, 6], sobe na hora e desce 1 a cada 30 turnos de folga; ligado por padrão no `OnlineLobby`, `?adaptive=0` desliga): testes "atraso adaptativo sobe com a latência e desce quando ela cai" (2 → ≥ 5 → 2), "janela configurável", "par lento" e "ritmo em tempo real". Checksum por turno: `_execute` calcula o hash do turno e o compara com o de todos os pares; `checkEvery` = 1 nos testes (todo turno) e 10 em jogo (1 s, como em `docs/09_MULTIPLAYER.md` §3). Desync com relatório: maioria com ≥ 3 jogadores, categorias divergentes (`partsDiff`), unidades divergentes (`diffUnits`), `desyncDump()` e botão "Baixar relatório" na `OnlineHud`; 2 testes (gold adulterado no turno 20 em 1 de 4 sims: os 4 detectam entre os turnos 20 e 39; o relatório de um dos pares aponta o jogador divergente (por maioria) e a categoria `players`, e a sim congela; hp de unidade adulterado: o relatório lista a unidade). `Math.random` fora da sim: `Tree` e `Building` lançam erro sem rng; `grep` em `src/sim` + `src/ai` só acha comentários, o `MatchConfig.randomSeed` do lobby e o carimbo de data do `SaveGame`; `noMathRandom.test.js` (também proíbe `Date.now`/`performance.now`) verde. Até 8 jogadores: `lockstepNet.test.js` 11/11 com 2, 4 e 8 sims (300 turnos, latência/jitter/perda diferentes por par): checksums idênticos nos 8, sem violação e com o mesmo log de comandos; `lockstep`, `lockstepRobust` e `webrtcTransport` (malha de 3 pares com RTC falso) verdes. Navegador: `tools/online-check.mjs` (2 abas, WebRTC real) foi verificado antes pelo agente da F9-03/F9-04, conforme informado pelo coordenador; não reexecutado neste fechamento (sem navegador). Limites aceitos: WebRTC real só foi exercitado com 2 jogadores (8 só no protocolo/transporte em memória) e partidas entre motores diferentes seguem como risco documentado (`Math.sin/cos`, `docs/09_MULTIPLAYER.md` §4). Obs.: a dependência F9-02 segue em REVIEW.

### F9-04 · Robustez
- `DONE(2026-10-09)` · NET · Dep: F9-03 · Reconexão, pausa votada, jogador que sai vira IA, chat, pings no mapa entre aliados.
  - Resultado: `tools/online-check.mjs` em 2 Chromium com GPU real, sala criada pela UI: chat e ping chegaram; pausa votada congelou os ticks nos dois e retomou; B caiu, A passou B à IA e B voltou por snapshot com checksums reconvergindo (divergentes=0); desync forçado detectado nos dois. Verificação limpa em 2 execuções. Testes `lockstepRobust.test.js` (12) verdes.
  - Resultado: ver `docs/09_MULTIPLAYER.md` §12. `RoomState` (pausa votada, linha do tempo de atividade), reenvio/ack/NACK com histórico de 2 min, queda por timeout acordada por todos (`dropvote`) ou `leave`/`bye` → `GameManager.convertPlayerToAI` no mesmo tick; retorno por snapshot (`captureSnapshot/restoreSnapshot`, validado por checksum, em pedaços) + `rejoin` agendado; servidor de sinalização com `rejoin{code,token}`; lobby refaz a malha WebRTC e `?rejoin=1` retoma após recarregar; chat (`Enter`), pings de aliados (`Alt+clique`, minimapa + marca 3D), HUD de pausa/votação/avisos. Testes: `lockstepRobust.test.js` (12: perda curta, partição parcial, queda longa + retorno por snapshot após 60+ turnos, snapshot adulterado recusado, pausa votada/recusada, saída → IA, `bye`, 4 jogadores com 1 caindo, chat/ping fora do checksum), `mapPings`, rejoin no `signaling.test.js`; navegador: `tools/online-check.mjs` cobre chat, ping, pausa, queda + retorno. Ponto compartilhado com F9-05: `GameSimAdapter.humanLog/takeLog` (ver §12).

### F9-05 · Replays
- `REVIEW` · NET+UI · Dep: F2-02, F2-03 · Gravar log de comandos + seed; player de replay com velocidade e troca de visão por jogador.
  - Nota (2026-10-10): replay online grava humanLog/takeLog (cloud F9-05b, PR #11 mesclada; teste replayOnline). Replay online em navegador pendente (local).
  - Resultado: `src/replay/Replay.js` (formato `.warpolyreplay` versionado: config+seed+comandos humanos+checksums a cada 10 s; `parseReplay` rejeita versão errada; `attachReplay`/`replaySeek`/`verifyReplayProgress`), `ReplayStore` (IndexedDB, 30 máx.), gravação automática em toda partida (`ReplayService`, sem custo e sem tocar na sim), player (`ReplayController`+`ReplayBar`: 0,25×–8×, pausa, salto, visão por jogador/total, aviso de divergência), lista/importar/exportar/apagar no menu (i18n PT/en). Testes: `replay.test.js` (11) — gravar IA+humano, reproduzir = mesmo checksum final e intermediários, salto = simulação direta, divergência detectada; `tools/replay-check.mjs` no navegador. Sem snapshots de sim (salto p/ trás recria a partida). Ver `docs/09_MULTIPLAYER.md` §12.

---

## F10 — Qualidade e lançamento

### F10-01 · Testes da simulação
- `DONE(2026-10-09, task/close-a)` · QA · Dep: F0-05, F2-08 · Testes de combate, economia, pathfinding, comandos, determinismo.
  - Resultado: inventário de `src/sim`/`src/ai` sem teste direto: statuses, targeting, splash (falloff), Player (economia), ResourceDeposit, Building.queueUnit/cancel, checksum (sensibilidade), validação de comandos inválidos/ordem de execução, Pathfinder (ótimo/orçamento/determinismo). Novos (76 testes; a contagem "66" estava errada): `simStatusTargeting` (17), `simEconomy` (19), `simCombat` (10), `simCommandsChecksum` (18), `simPathfinder` (12). Sem mudança de produção; nenhum bug novo achado. Sem cobertura direta ainda: `abilities`, `hazards`, `corpses`, `transport`, `AIMilitaryManager/AIMicroManager` (cobertos só indiretamente por spells/ships/ai-*).
  - **Revisão/fechamento (2026-10-09, task/close-a)**: **Resultado:** spec "Testes de combate, economia, pathfinding, comandos, determinismo" conferida com testes diretos em `tests/unit/sim*.test.js` (76 testes, 5 arquivos, todos verdes; sem `skip`/`only`/`todo`; só testes, nenhum código de produção alterado pela F10-01). Combate (`simCombat`): morte/`UNIT_DIED` único/kills/invulnerável/população, dano por tipo e armadura com golpes reais, projétil do arqueiro, dano em área. Economia (`simEconomy`): `Player.canAfford/deduct/add`/reembolso, `ResourceDeposit` (fila FIFO, esgotamento), `Building.queueUnit/cancelQueuedUnit` (custo, população, requisitos de Centro). Pathfinding (`simPathfinder`): A* ótimo e com contorno (≤ 8 % do ótimo), sem caminho, orçamento de nós, `MinHeap`. Comandos (`simCommandsChecksum`): `validateCommand`/`makeCommand`, comando malformado lança, comando inválido no jogo é ignorado sem mudar o checksum, `PLACE_WALL`, ordem estável `(playerId, seqNo)`. Determinismo: sensibilidade e pureza do checksum (`simCommandsChecksum`, 10 testes), mesma seed + mesmos comandos ⇒ mesmos PV (`simCombat`) e mesmos checksums (`simCommandsChecksum`), mesma consulta ⇒ mesmo caminho (`simPathfinder`), mais `determinism.test.js` (2 execuções de 12000 ticks idênticas a cada 20 ticks; seed 43 diverge). Suíte completa (`npx vitest run`) na árvore final do fechamento: 102 arquivos, 1224/1224 em 55 s. Registro de carga (classe NEW-41): das 3 execuções completas deste fechamento, 1 teve 1 timeout por carga fora dos itens — `campaignPlaythrough.test.js` "03 Muralhas de Alvorada" estourou 5000 ms (5102 ms) com soak e capturas de outros agentes rodando em paralelo; o mesmo teste passa isolado (2,2 s; arquivo 13/13) e nas outras 2 execuções; os arquivos dos itens passam isolados (14 arquivos, 184/184; `vfx.test.js` 18/18 depois da correção). Lacunas fora da spec, só nota (não bloqueiam): `abilities`, `hazards`, `corpses`, `transport`, `AIMilitaryManager/AIMicroManager` seguem cobertos por testes de integração (spells/ships/ai-*), sem teste unitário direto.

### F10-02 · Soak test IA×IA headless
- `DONE` · QA · Dep: F2-08 · 100 partidas por noite, detecção de travamentos, partidas que não terminam, exceções.
  - Resultado: `npm run soak -- --count 100` (`tools/soak.mjs` + `tools/lib/soakDetector.mjs`, teste `tests/unit/soakDetector.test.js`; relatório em `tools/soak-report/`). Soak de 20 partidas (seeds 1–20, 3 mapas, 2 facções, 4 dificuldades): 19/20 terminam (95%), ticks médios até o fim 16905, 0 exceções/NaN/vazamentos, determinismo OK em 2 seeds re-rodadas; 2 achados (NEW-42, NEW-43). Reproduzir: `node tools/soak.mjs --count 1 --recheck 0 --seed-start S --maps M --faction F --difficulty D`.
  - Soak completo 100 partidas (seeds 1–100, 4 lotes de 25; consolidado por `node tools/lib/soakConsolidate.mjs` em `tools/soak-report/soak-report.md`): 96/100 terminam (96%), ticks médios 16007, máx 60618, 0 exceções/NaN/vazamentos, determinismo ok (12 re-checadas); achados NEW-46..48.
  - **Resultado:** 100 partidas, 99 terminam (99%), 0 exceções/NaN/vazamento; não-término listado em NEW-51 (seed 82). Confirmação final (task/close-c, 2026-10-09, master d769cd7 — `src/sim`, `src/ai`, `src/data` idênticos no master 40e83ff —, depois das correções de mapa/IA NEW-42..48): soak completo refeito, 100 partidas (seeds 1–100) em 4 lotes de 25 (`tools/safe-run.sh --timeout 1800 -- node tools/soak.mjs --count 25 --seed-start S --out tools/soak-report/cN`, S = 1/26/51/76), consolidado por `node tools/lib/soakConsolidate.mjs tools/soak-report '^c[0-9]+$'` em `tools/soak-report/soak-report.md` (os lotes `b*` são a rodada anterior, mantidos só para comparação). **99/100 terminam (99%; antes 96%)**; ticks médios 14889 (antes 16007), máx 54169 (antes 60618); partidas >40000 ticks: 2, ambas terminam (seeds 1 e 14; antes 8); **janelas paradas: 0 (antes 4)**; 0 exceções, 0 NaN, 0 vazamentos de entidades; determinismo ok (12 re-checadas, 0 divergentes). Única falha: seed 82 (`continental-1v1`/human/brutal) não termina em 72000 ticks — madeira esgotada, mesma classe do NEW-46/NEW-44, registrada como NEW-51 com comando de reprodução (não corrigida aqui). Critérios de DONE cumpridos (≥ 96%; zero exceção/NaN/vazamento/divergência; toda falha listada em NEW-xx com seed e comando). Gates: eslint 0 erros; vitest 1223/1223 (102 arquivos, suíte completa em d769cd7) e `tests/unit/soakDetector.test.js` verde após o rebase sobre 40e83ff.

### F10-03 · Regressão visual
- `DONE` · QA · Dep: F0-05 · Capturas Playwright de todos os modelos do inspetor e da HUD em 3 resoluções; diff em PR.
  - Resultado: `npm run visual` (`tools/visual-regress.mjs`): 130 alvos (127 modelos do inspetor + 3 telas HUD) × 3 resoluções = 390 PNGs; 0 falhas na rodada de conferência; ~5 min por rodada completa (GPU real RX 7600 XT). Baseline em `tests/visual/baseline/` (~110 MB). Comparador/PNG sem dependência nova (`tools/lib/`), teste unitário em `tests/unit/visualCompare.test.js`. Determinismo: `Math.random` semeado e prévia 3D congelada; partida curta com limiar de 1 %. Documentado em `docs/README.md`.
  - Revisão (task/F10-03-review): baseline antiga estava defasada (painel "Cor de time" do inspetor entrou no master depois; 1ª comparação falhou nos 127 modelos, diff legítimo) → baseline regravada no master atual e comparação refeita: 390/390 ok, 0 falhas (~302 s, GPU RX 7600 XT, Chromium 153). Decisão sobre o git: a baseline tem 109 MB; testes mostraram que PNG lossless reotimizado NÃO reduz (Chromium já comprime bem) e quantização para 256 cores estoura a tolerância (delta até 141 > 24); reduzir bits baixos de cor (erro ≤ 8) só chega a ~47 MB, acima do teto de ~25 MB. Portanto os PNGs saem do git (`git rm --cached` + `.gitignore`; histórico NÃO reescrito, os 109 MB antigos continuam no histórico) e ficam só `tests/visual/baseline/manifest.json` (Chromium, GPU, aviso de dependência de GPU real) e a instrução: `npm run visual -- --update`. Sem baseline o script aborta com mensagem clara (exit 2); WebGL de software já aborta via `assertHardwareGpu`. vitest 1190/1190 verde, lint 0 erros.


### F10-04 · Orçamento de desempenho em CI
- `REVIEW(mesclada na integração #35; baseline com GPU pendente)` · QA · Dep: F0-04 · Falha se draw calls/FPS/load piorarem > 10% vs baseline.

### F10-05 · Empacotamento e deploy
- `REVIEW` · QA · Dep: F1-01 · PWA offline, code-splitting por facção/modelos, compressão (brotli), deploy estático (GitHub Pages/Cloudflare Pages), página de lançamento.
  - Nota (2026-10-10): code-splitting por facção (cloud F10-05b, PR #15 mesclada). Verificação de carga no navegador pendente (local).
  - Resultado: chunks `three-vendor`(708 kB)/`vendor`/`models-human`(566 kB)/`models-orc`(46 kB)/`main`; antes three estava dentro de `game-models` (1.299 kB). `.br`/`.gz` no build, SW versionado + manifest (só em produção), `base` configurável (`BASE=`), ícones corrigidos p/ subpasta, workflow Pages e `docs/10_DEPLOY.md`. Validar: `tools/preview-check.mjs`. Não feito: GLB/facção 100% sob demanda (exige mexer no preload, lane PERF); landing = menu principal já existente.

---

## Backlog descoberto
_(agentes adicionam aqui: `NEW-<n> · título · lane · motivo`)_

- NEW-53 · `DONE(task/fix-m04)` Dono (teste da campanha, m04 "A Ponte do Rio Turvo"): (1) o "Forte Atalaia" não existia (objetivo de entrega era só uma área vazia em (-22,-6)) e o dono quer um forte HUMANO depois do forte dos orcs, onde se entregam os suprimentos; (2) os 4 carregadores têm o mesmo anel dourado das demais unidades do jogador, sem identificação. **Resultado (2026-10-10, task/fix-m04):** (A) ação de missão `spawnBuilding {owner, buildingType, x, z, tag?, facing?, markColor?}` (`src/sim/missions/actions.js` + `schema.js`; o tipo da construção é `buildingType` porque `type` já é o discriminador da ação): cria a construção já concluída (`gm.createBuilding` + `gm.buildings` + população), limpa as árvores vivas dentro da folga de construção (`collisionRadius` + 3,5, a de `canPlaceBuilding`) e o schema recusa tipo/dono/tag/cor/giro inválidos, plataforma de petróleo e pegada fora da área jogável (README de missões atualizado). **Forte Atalaia** = `castle` do jogador em **(-47, 4)**, de frente para o leste: a 25 un. do centro do acampamento neutro (-40,-20) e a 21 do guarda mais próximo (fora do alcance dos guardas: 11 + raio 5,5), 11,6 un. mais longe da base (24,-22) que o acampamento, em terra firme (centro e 4 amostras da pegada ≥ 1,8; passa em `canPlaceBuilding`), 6 árvores na clareira; objetivo `deliver` centrado nele (r 12), cutscene de 15 s (vau → acampamento → forte), briefing/dicas citam o anel ciano e o acampamento, o `reveal` do `blockade-cheer` passou a mostrar o acampamento (o forte tem visão própria); o acampamento neutro e o mapa ficaram intactos. (B) `markColor` (`#rrggbb`) em `spawn`/`spawnBuilding` grava `unit.markColor`/`building.markColor` (só render: fora do checksum, testado igual com e sem marca); `UnitView`/`BuildingView` usam um material de anel por cor (`src/render/markRing.js`, sem alocar por quadro); os 4 carregadores do m04 usam `#22d3ee`; os cativos do m02 seguem com o anel vermelho (teste + captura). (C) Testes: `missionSpawnBuilding.test.js` (12), `missionMarkColor.test.js` (11) e o m04 do `campaignPlaythrough.test.js` (+8): forte (castelo do jogador, depois do acampamento, longe dos guardas, terra firme) e o comboio chega ANDANDO, sem teletransporte, com 4/4 vivos pelo vau central (escolta à frente, emboscada abatida) e pelo vau noroeste passando pelo acampamento (escolta limpa ou lidera, combate real), determinístico. Capturas em `tools/ui-captures/m04-fix/` (`capture.mjs`, via safe-run: campanha → briefing → cutscene → forte depois do acampamento → anéis ciano × dourado → chegada → m02 vermelho; 9/9 verificações). **Achado fora do escopo (pré-existente, não corrigido):** ordenar as 14 unidades juntas a (-10,4), na margem oeste do vau central, deixa 1–2 presas entre a mina (8,-6) e o rio, perto de (10, -2,5) — acontece também no m04 original; com destino (-22,-6) não ocorre; no m04 novo o roteiro de teste solta a escolta antes do comboio.
- NEW-2 · `DONE(BUGS-01, PR #1)` IA reembolsa custo errado em `AIEconomyManager.placeBuilding` (usa `director.costs[tipoDaConstrução]`, mas `costs` é indexado por papel → devolve custo da fazenda) · AI · achado na F0-06 — AIEconomyManager sem local livre não deduz; reembolso errado eliminado (auditoria AUD-1).
- NEW-3 · (duplicado: ver a linha ✅ NEW-3 abaixo, DONE) Card de seleção ainda mostra nomes antigos em inglês (`entityName`: "Villager"…); unificar com nomes PT-BR/glossário · UI · depende de F3-00/F6-09
- NEW-4 · `DONE(PR #9)` devolve false para pontos idênticos (0/0 = NaN em `t`) · PERF · achado na F0-05 (`src/core/Pathfinder.js:157-175`) — correção já estava em src/sim/Pathfinder.js (dist < 1e-6); PR #9 acrescenta testes.
- NEW-5 · `DONE(BUGS-01, PR #1)` Remover materiais/texturas criados e não usados (OrcWatchtowerModel:50-51, OrcLumberMillModel:51-52, PigFarmModel:52, TreeModel:259, ArcherModel:90) · PERF/ART · lint da F0-05 — materiais/texturas não usados removidos (lint 32→25).
- NEW-6 · `TODO(spec no master; execução pendente; passo 2 exige decisão)` Completar F1-01: empacotar roughness+metalness (ORM) para High < 300 MB; pintura em Worker/OffscreenCanvas; cache IndexedDB; troca de qualidade sem recarregar · PERF
- NEW-7 · `REVIEW(7f6a565, da nuvem)` `TreeManager`: InstancedMesh desenha sempre 120 instâncias (vagas com escala 0) e a esfera de culling cobre o mapa (~700k tris por passada de sombra) → ajustar `count`, dividir em chunks, LOD · PERF · achado na F1-04 — chunks espaciais de 32 u e capacidade pela contagem real (treeManagerCapacity.test); bench de draw calls pendente (local)
- NEW-8 · ✅ Rosto dos orcs (Peão, Grunt, Arremessador, Ogro) repetia nas 6 faces da cabeça → corrigido: textura só na face frontal (+Z). Regra para TODOS os modelos novos (inclusive Blender): textura de rosto só na frente da cabeça · ART · pedido do dono
- NEW-9 · IA destruiu HQ de jogador parado em < 240 s nos testes da F2-01 — avaliar agressividade inicial ao criar dificuldades (F5-03) · AI
- ✅ NEW-10 · `DONE(944b6ee)` golpe corpo a corpo/arremesso agora termina à frente (+Z): eixo X do braço/arma espelhado em 6 animações + gather; verificado no inspetor (Grunt/Ogro: arma atrás no preparo, ~1,1–1,4 u à frente no impacto) · haiku
- NEW-11 · `DONE(BUGS-01, PR #1)` Avisos de deprecação three 0.186: `THREE.Clock` → `THREE.Timer`; `PCFSoftShadowMap` removido (cai para PCF) — ajustar QualitySettings/main · PERF — sem THREE.Clock/PCFSoftShadowMap no src (grep).
- ✅ F0-08 · `DONE(d17aaf5)` Scripts de navegador abortam sem GPU real (`tools/lib/assertGpu.mjs`); `safe-run.sh` agora reentrante (deadlock de safe-run aninhado corrigido)
- ✅ NEW-12/F7-00c · `DONE(7d6f712)` modelos .glb ligados por padrão (`?glb=0` desliga), carregam também com `?skipPreload` (verificado no navegador)
- NEW-13 · `REVIEW(PR #14 mesclada)` Névoa: chamas de construções inimigas na memória continuam animando (Building.js não checa visibilidade); céu azul aparece além da borda do mapa em área não explorada (fundo da cena deveria escurecer) · PERF/CORE — chamas/fumaça de construção sob a névoa não animam; teste buildingViewFogFlames. Verificação visual pendente (local).
- NEW-14 · `TODO(spec no master; passos 3–4 aguardam NEW-53, já concluído)` `Unit.update` domina a CPU (~4,5 ms com 310 unidades): animação procedural roda para toda unidade todo frame. Otimizar: animar só unidades visíveis no frustum/névoa, reduzir taxa de animação por distância (LOD de animação), simulação em tick fixo 20 Hz (F1-09) · PERF
- ✅ F1-03b · `DONE(38c013b)` unidades como SkinnedMesh rígido, 1 Skeleton por instância: knight 41→19, archer 54→25, grunt 25→12 draw calls; combate100 31→37,5 FPS, massa300 12→17 FPS. Aldeão 55→58 (nós de ferramenta)
- NEW-15 · Meta 50 FPS em combate100 ainda não atingida (37,5): restam ~20 draw calls/unidade por muitos materiais PBR. Caminho: atlas de material por unidade (1–2 materiais) — naturalmente resolvido pela migração das unidades para o pipeline Blender (F7-00b, adiada) — e depois instancing por tipo/VAT · PERF/ART
- ✅ BUGS-01 (PR#1, nuvem): NEW-2 reembolso IA, NEW-11 Clock→Timer/PCFShadowMap, NEW-5 materiais não usados (lint 32→25 avisos), NEW-13 fundo além do mapa escurece com a névoa
- NEW-16 · `DONE` HUD < 1100 px esconde o máximo de população (mostra "5" em vez de "5 / 10") · UI — master: `.pop-secondary` só nowrap em <1100 px; população sempre "atual / máx.".
- ✅ NEW-17 · `DONE(297a07e)` textura do terreno pintada pela altura em mapas não continentais (`getTerrainTexturesFromHeight`); continental inalterado · haiku. Obs.: o padrão "rachado" restante na água é a textura do `Water.js` (cáusticas), não do terreno
- ✅ NEW-18 · `DONE(640dff1)` guia rápido não estica sem seleção (grid-column fixo nos filhos de #bottom-bar) · haiku
- NEW-19 · `REVIEW(cloud/NEW-19 mesclada)` Ruínas/clareira ao destruir construção ou esgotar mina (como no WC2), procedural, só render · VFX · spec `docs/specs/NEW-19-ruinas.md` · **nuvem** (após F3-01/F6-08; parte da mina depende do evento `RESOURCE_DEPLETED` da F3-04) — ruínas/clareira (RuinsManager, ruinsLogic); integrado em MatchSession sobre master. Verificação visual pendente (local).
- ⏸ NEW-20 · **ADIADA pelo dono** (agente Haiku bloqueado sem permissão para `npx vitest`; spec pronta em `docs/specs/NEW-20-teste-intermitente.md`) · Teste intermitente: 1 falha na 1ª execução de `npm test` após o merge da F3-04 (5 execuções seguintes 264/264) — provável timeout de teste pesado (determinismo/headless) com cache frio; aumentar `testTimeout` desses testes · QA · haiku
- ✅ NEW-21 · `DONE(4b67cb1)` Pathfinder._searchAStar não atravessa bloqueios; sem caminho retorna até o ponto alcançável mais próximo (ou para se nenhum vizinho) · PERF/GAME · haiku
- ✅ NEW-22 · `DONE(3ed0b17)` Textos em inglês no card de seleção ("Carry: 0/10 gold") traduzidos para PT-BR; glossário de nomes em `src/data/names.js`; labels Atk→Ataque, Def→Defesa, Spd→Vel, Carry→Carga; tipos de recursos traduzidos · UI
- ✅ NEW-3 · `DONE(3ed0b17 — parte simples)` Card de seleção mostra nomes PT-BR unificados com `entityName` em `units.js` e `buildings.js`; tradução de labels e tipos de recursos. Parte de i18n completa fica para F6-09. · UI
- NEW-24 · `REVIEW(309fc71 + 94fe68e, da nuvem)` Muralha: portão e conexões visuais entre segmentos; segmentos no minimapa · GAME/ART — _(arte A, 2026-10-10: os blocos agora encostam rentes em fileira, sem vão visível; portão e minimapa seguem pendentes)_ — portão visual (WallGate) e muralha no minimapa (wallGate.test); captura pendente (local)
- NEW-25 · `REVIEW(mesclada, cloud/NEW-25-34)` IA ataca acampamentos neutros (dificuldade ≥ normal, ≥ 8 combatentes) · AI
- NEW-26 · `REVIEW(582dcbe, da nuvem)` Card/seleção de unidade neutra (bandido) · UI — inspeção somente-leitura de neutros e inimigos visíveis (inspectNeutral.test); captura pendente (local)
- NEW-27 · Medir draw calls dos neutros vs master (997→1387 com câmera no acampamento, não isolado) · PERF
- ✅ NEW-28 · `DONE` (bug do card preso corrigido; botão R+clique não testado) Verificar reparo/cancelar obra manualmente no jogo (2 aldeões reparando torre; capturas em tools/ui-captures/repair/) · QA
- NEW-29 · `DONE(1bcf87e, da nuvem)` Renomear construções existentes para os nomes D7 (Paço Real, Salão do Clã, Ferraria Real…) · UI/DATA · haiku — nomes das construções seguem os níveis e o design D7 (buildingNames.test)
- NEW-30 · (F5 pronta; F4 pronta) Repetir o lote de balanceamento (F3-11) quando a F5 (IA Difícil) e a F4 chegarem; paridade dos atiradores ficou +14,8 % (orc) · QA
- NEW-31 · `DONE(PR #8)` quebrado (`blockerGrid` indefinido no mock) · QA · haiku — check-data-parity roda sem exceção; sai com 1 por 140 divergências históricas legítimas.
- ✅ NEW-32 · `DONE(refino: Camponês, Lacaio, troll, Bandido, Arqueiro, Ogro; mão do arqueiro na corda)` — pendências menores: runas do troll leem como riscos, cicatrizes do Lacaio, face do Camponês simples, pose de tiro do arqueiro é compromisso · Arte: refino de pontos fracos (olhos do Camponês, pele do Lacaio, ombreira do troll, clava do Bandido) e poses do arqueiro (mão na corda, projétil da mão) · ART
- ✅ NEW-33 · `DONE` (Cavaleiro 7/10, Estábulo 8/10, Covil 7,5/10 — autoavaliação; pendências: cor de time não se aplica a .glb de construção → F7-02; cavalos das baias só cabeça → resolvido na F7-00b arte B: cavalos inteiros, Estábulo 8,5/10) Arte Blender: Cavaleiro montado, Estábulo Real, Covil dos Ogros (hoje procedurais provisórios; cavaleiro herda texturas 2048² do Espadachim procedural) · ART
- ✅ NEW-23 · `DONE(f419963)` projétil balístico com mira preditiva (F4-02) · GAME
- NEW-34 · `REVIEW(mesclada, cloud/NEW-25-34)` Escolta de cerco pela IA (o cerco, mais lento, chega depois do exército) e alvo colado dentro do alcance mínimo só resolvido via recuo · AI
- NEW-35 · `REVIEW(3e9b649, da nuvem)` Ataque no chão do cerco (clique direito no chão) · GAME/UI — CMD.ATTACK_GROUND no núcleo com testes em commands.test/siege.test; clique direito no chão no navegador pendente (local)
- ✅ NEW-37 · `DONE` (Espadachim 8/10, Cavaleiro 7,5/10) Refazer Espadachim e Cavaleiro (feedback do dono 2026-09-30: demasiado simples, sem força, elmo mais fechado, mais encorpado/rebuscado, conforme soldado.png) · ART
- ✅ NEW-36 · `DONE` (balista/oficina humana boas; oficina orc a mais fraca: telhado domina; concha da catapulta lembra maça) Arte Blender: Balista, Catapulta, Oficinas (hoje procedurais) · ART
- ✅ NEW-40 · `DONE` (Templo 8/10, Altar 7,5/10, Olho Vigia 7/10, Templário 7,5/10, Ogro Feiticeiro 7/10 — autoavaliação; pendências: tentáculos do Olho estáticos, colar do Ogro Feiticeiro escondido, emblema do Templário atrás da cabeça do cavalo → resolvidas na F7-00b arte B: Olho 8, Ogro Feiticeiro 7,5, Templário 8/10) Arte Blender: Templo da Luz, Altar das Tempestades, Olho Vigia; Templário e Ogro Feiticeiro com tinta/emblema próprio · ART
- ✅ NEW-38 · `DONE` (12 magias OK; bench combate100 54,5 FPS) Verificar manualmente as 6 magias do Mago/Necromante no jogo, capturas em tools/ui-captures/spells/, bench combate100; ícones de magia são emojis provisórios · QA/UI
- ✅ NEW-39 · `DONE` (Mago, Necromante, Torre Arcana fortes; pendências no UnitAnimator: esqueleto sem ramo `fight` (sugestão: mapear para applyKnightFight), Weapon do Mago/Necromante fixo na raiz) Arte Blender: Mago Arcano, Necromante, Esqueleto, Torre Arcana, Santuário das Cinzas, Sapadores/Incendiários (hoje procedurais) · ART
- NEW-41 · `DONE(99edfbb, da nuvem)` pathfinder MinHeap corrigido (teste usava doubles; heap guarda Float32 → `Math.fround`); fogOfWar ainda intermitente (visto 3× em ~8 execuções antes; 0 em 4 depois), causa não achada. Teste intermitente `tests/unit/fogOfWar.test.js` ("dispose() … uniform de textura trocado") e `pathfinder.test.js` (MinHeap): passam isolados, falham às vezes na suíte completa sob carga; suspeita de estado global `fogUniforms` compartilhado (F2-08b) · QA — timeouts de 30 s no vitest e no playthrough 03 (PR #10); causa do fogOfWar ainda não achada. — causa: singleton fogUniforms compartilhado entre testes; fogOfWar.test isola o singleton (3/3 isolados verdes; suíte completa verde)
- NEW-42 · `DONE` Soak F10-02: partida que não termina em 72000 ticks (1 h simulada): seed 10, `continental-1v1`, facção slot 0 orc, dificuldade easy (`--seed-start 10 --maps continental-1v1 --faction orc --difficulty easy`). Provável impasse de IA easy (sem ataque decisivo) · IA/QA · **Resultado:** 2 causas. (1) `Unit.moveTowards` mantinha para sempre um caminho velho (waypoint além de um canto de água) sem repedir: unidades (soldados e aldeões a caminho do depósito) ficavam presas na margem do rio e a economia/exército da IA congelavam; agora descarta o caminho após 1,5 s sem progresso e repede. (2) Com os inimigos sem construções conhecidas, `manageMilitaryExpedition` marchava em laço para a mesma célula/slot inalcançável (nunca "explorado"); agora a 3ª marcha repetida chama `AIPerception.markExploredAt` e a varredura segue adiante. Seed 10 termina (33317 ticks); soak seeds 1–10: 10/10 terminam; seed 5 (estreito/orc/hard) termina em 60570 mas com janela parada (mesma classe do NEW-43).
- NEW-43 · `DONE` Soak F10-02: janela >2 min sem nenhum movimento/recurso/HP alterado (tick ~49820–52220) em seed 15, `ilhas-4p` (4 jogadores), human, brutal (`--seed-start 15 --maps ilhas-4p --faction human --difficulty brutal`); a partida termina só em 66157 ticks — IA parada/aguardando? · IA/QA — **Causa raiz**: não era IA nem detector; `ilhas-4p` só gerava 12 árvores (os 4 clusters pequenos caíam a <26 un. dos pátios das bases e eram rejeitados em `spawnWoodlands`) = 1440 de madeira para 4 jogadores. Acabada a madeira (~tick 30000) toda unidade/construção ficava inviável (custa madeira): pesados com 8000+ ouro, peões ociosos, só ondas esporádicas até o último edifício cair (66157 ticks). **Correção**: +6 clusters (30 árvores) em `src/data/maps/ilhas-4p.json` (faixa central e margens, fora dos pátios; anexados ao fim para manter a ordem do rngMap) + teste em `tests/unit/maps.test.js`. Resultado: seed 15 termina em 5778 ticks; seeds 11–20 (ilhas-4p) 10/10 terminam, 0 falhas, determinismo ok. Resíduo: a IA não reage a escassez total de madeira nem usa frota/barcaça (F5 naval) — registrado como NEW-44.
- NEW-44 · `REVIEW(mesclada; soak e validação local pendentes)` IA sem madeira disponível (árvores esgotadas) segue acumulando ouro/peões ociosos sem alternativa (p.ex. evitar construções/unidades dependentes de madeira, ou explorar outras ilhas por barcaça); e IA naval (frota/transporte) ainda inexistente. Prioridade baixa. · IA
- NEW-45 · `DONE` Soak seed 5 (estreito-1v1/orc/hard) passou de 25910 para 60570 ticks com janela parada após o NEW-42 · IA/QA — **Causa raiz**: mesma classe do NEW-43 (não naval nem caminho): `estreito-1v1` só gerava 22 árvores (os bosques em (±25,∓30) caíam a <26 un. dos pátios e eram rejeitados; os demais eram poucos) → madeira esgotada por volta do tick 12000, IA com ouro acumulado e sem poder produzir/construir, exército parado até um edifício cair. **Correção**: bosques (±25,∓30) realocados para (±38,∓28) com 7 árvores e +6 clusters em `src/data/maps/estreito-1v1.json` (49 árvores) + teste em `tests/unit/maps.test.js`. Resultado: seed 5 termina em 25424 ticks sem janela parada; soak seeds 1–10 10/10 terminam, determinismo ok, vitest 817 verdes, lint 0 erros. Resíduo: NEW-44 (IA sem reação à escassez de madeira / sem IA naval).
- NEW-46 · `DONE` Soak F10-02 (100 partidas, seeds 1–100, 2026-10-08): 4 partidas NÃO terminam em 72000 ticks — seed 16 continental/orc/brutal (`node tools/soak.mjs --count 1 --recheck 0 --seed-start 16 --maps continental-1v1 --faction orc --difficulty brutal`); seed 64 estreito/human/hard, também com janela parada ~tick 36880 (`node tools/soak.mjs --count 1 --recheck 0 --seed-start 64 --maps estreito-1v1 --faction human --difficulty hard`); seed 72 continental/orc/hard (`node tools/soak.mjs --count 1 --recheck 0 --seed-start 72 --maps continental-1v1 --faction orc --difficulty hard`); seed 73 estreito/orc/brutal (`node tools/soak.mjs --count 1 --recheck 0 --seed-start 73 --maps estreito-1v1 --faction orc --difficulty brutal`). Investigar impasse (provável expedição/ataque sem alvo alcançável, como NEW-42; ver `tools/soak-report/soak-report.md`) · IA/QA **Resultado (re-verificado no master com NEW-43/45):** seeds 64 e 73 (estreito) já terminavam após NEW-45 (17841 e 10666 ticks); seeds 16 e 72 (continental) ainda falhavam. **Causa raiz:** `continental-1v1` tem `playable` 110 (limite ±55) mas 8 bosques ficavam em ±54 com raio 6: as árvores além de ~±55 eram inalcançáveis (peões ficavam parados "gathering" ao lado, sem cortar), a madeira acabava (~tick 12000, 3 jogadores nesse mapa com `maxPlayers` 3), a IA acumulava 8000+ de ouro sem poder construir/treinar e a partida só terminava por acaso. **Correção (dados):** bosques de borda movidos para ±46/47 (dentro da área jogável) + 3 bosques extras (-40,-34), (-46,-28), (40,34) em `src/data/maps/continental-1v1.json`; teste em `tests/unit/maps.test.js`. Seeds 16/72 terminam (8892 / 6226 ticks); soak seeds 1–20: 20/20 terminam, determinismo ok; vitest 840 verdes, lint 0 erros.
- NEW-47 · `DONE` Soak F10-02: janela >2400 ticks sem movimento/recurso/HP alterado em partidas que terminam depois: seed 23 estreito/orc/brutal, parada desde tick ~27540, termina em 42506 (`node tools/soak.mjs --count 1 --recheck 0 --seed-start 23 --maps estreito-1v1 --faction orc --difficulty brutal`); seed 83 estreito/human/brutal, parada desde ~26240, termina em 54615 (`node tools/soak.mjs --count 1 --recheck 0 --seed-start 83 --maps estreito-1v1 --faction human --difficulty brutal`). (Seed 5 estreito/orc/hard, parada desde ~43220, termina em 60570, é a mesma classe e já está com outro agente.) Concentrado em `estreito-1v1` nas dificuldades hard/brutal · IA/QA **Resultado:** seeds 23 e 83 (estreito) já não falham após NEW-45 (terminam em 18091 e 14183 ticks, sem janela parada); sem alteração adicional.
- NEW-48 · `DONE` Soak F10-02: partidas muito longas (>40000 ticks, terminam): seed 26 continental/human/easy 60618 (`node tools/soak.mjs --count 1 --recheck 0 --seed-start 26 --maps continental-1v1 --faction human --difficulty easy`); seed 45 estreito/human/normal 48235 (`node tools/soak.mjs --count 1 --recheck 0 --seed-start 45 --maps estreito-1v1 --faction human --difficulty normal`); seed 91 continental/orc/brutal 49998 (`node tools/soak.mjs --count 1 --recheck 0 --seed-start 91 --maps continental-1v1 --faction orc --difficulty brutal`); seed 39 estreito/human/hard 44266; seed 67 estreito/orc/easy 42459. Média geral é 16007 ticks; ver se há ataque tardio/exploração lenta (ajuda NEW-46/47) · IA/QA **Resultado:** estreito (45, 39, 67) caiu para 9534 / 32579 / 17161 ticks com NEW-45; continental (26, 91) era a mesma causa de NEW-46 (madeira inalcançável): 60618 -> 32928 e 49998 -> 24840 ticks. Resíduo: seed 14 estreito/human/hard ainda leva 54169 ticks (termina; não investigado); ilhas-4p tem 4 bosques em ±54 com `playable` 116 (parcialmente além do limite, 1/3 das árvores) — baixa prioridade, ver NEW-44.
- Soak F10-02: sem achados de exceção, NaN, vazamento de entidades ou divergência de determinismo (12 seeds re-rodadas, 0 divergentes).
- NEW-49 · `REVIEW(PR #13 mesclada)` Arremessador de Machados: `applyAxethrowerFight` não define `weaponR.rotation.x` na fase de follow-through (p 0,60–0,78), então o machado de mão salta 2,3 rad em p = 0,60 e volta em p = 0,78 (2 saltos dentro do golpe; anteriores à F7-06 e fora do cross-fade). Medido com salto por quadro > 0,5 rad num modelo falso com `weapon`/`weaponR`/`drawnAxe` = mesmo nó. Sugestão: manter o último valor do arremesso (ou interpolar até o repouso) e conferir no inspetor · ART · achado no fechamento da F7-06 — golpe do Arremessador sem saltos de pose; teste axethrowerFight. Captura visual pendente (local).
- NEW-50 · `DONE(PR #7)` `lobby.js`: o aviso de erro (`#status`, ex.: "Nem todos estão prontos.") não é limpo ao receber `start`/`room` — continua visível com a partida já iniciada (cosmético; o fluxo principal é o `?online=1` da F9-03) · NET/UI · achado no fechamento da F9-02 — lobby limpa o aviso de erro ao receber room/start (lobbyStatus.js + teste).
- NEW-51 · `REVIEW(cloud: terminou em 9106 ticks com a IA nova; confirmar com amostra grande)` Soak F10-02 (confirmação do grupo C, 2026-10-09): 1 das 100 partidas NÃO termina em 72000 ticks — seed 82, `continental-1v1`, facção do slot 0 human, dificuldade brutal (`node tools/soak.mjs --count 1 --recheck 0 --seed-start 82 --maps continental-1v1 --faction human --difficulty brutal`; checksum 180516962 em 72000 ticks; sem `stall` porque os peões seguem colhendo pedra e a assinatura de progresso muda) · IA/CONTENT/QA — **mesma classe do NEW-46 (`continental-1v1` sem madeira → impasse) e do resíduo NEW-44 (IA sem reação à madeira esgotada), não é classe nova; causa diferente da do NEW-46: aqui as árvores são alcançáveis e todas cortadas, falta oferta para 3 jogadores; não corrigida aqui.** **Diagnóstico** (partida reproduzida tick a tick, só leitura): o mapa (3 jogadores no soak) gera 59 das 98 árvores planejadas (mediana nas seeds 1–100: 61, mín 57, máx 69; estreito 45/74 e ilhas-4p 35/58 de mediana) = ~7000 de madeira, e todas as 59 são cortadas até o tick ~18000 (15 min). Nesse ponto P2 (aliado de P0) já perdeu castelo e todos os trabalhadores (restam quartel, chalé e 2 fazendas, que o mantêm vivo); depois P0 junta 5172 de ouro com 16 de madeira (5 arqueiros, 2 quase mortos, e 7 camponeses ociosos) e P1 (orc, turtle) fica com 2 peões e 4 combatentes. Como todo combatente (exceto os conjuradores, que exigem Centro nível 3 + Torre Arcana) e toda construção custam madeira, ninguém repõe tropas, as sobreviventes ficam paradas (limiar de ataque das ondas = 5) e a partida estagna até o limite. Antes das correções NEW-45/46 a mesma seed terminava em 13266 ticks (o `rngMap` mudou com as árvores novas). Caminhos: (a) dados — mais madeira em `continental-1v1` para 3 jogadores; (b) IA — NEW-44 (reagir à escassez: atacar antes de zerar a madeira, poupar madeira); (c) soak — detectar também "sem combate/destruição por N ticks" (o garimpo de pedra mantém a assinatura mudando).
- NEW-52 · `REVIEW(PR #12 mesclada)` `Water.createReeds` usa 7 posições fixas do mapa antigo (`(10,12)`, `(-10,-12)`…): em `continental-1v1` ficam em terra seca, então só os topos das hastes aparecem e as vitórias-régias/flores ficam enterradas sob o terreno; posicionar as moitas a partir do terreno (água rasa) ou do JSON do mapa (`decor`/`reeds`) e não criar a vegetação onde não há água economiza ~100 draw calls (≈ 56 do passe principal + sombras). A fusão por material da F7-00b já tirou ~500 chamadas, sem mudar o visual · PERF/CONTENT · achado no aceite de desempenho da F7-00b (arte B) — juncos só em água rasa (pickReedLocations). Teste waterVegetation. Captura visual pendente (local).
- NEW-1 · `DONE(cloud/NEW-1-remove-loader, mesclada)` Avaliar uso real de `GLTFBuildingLoader` em `GreatHall.js` e remover ou adotar no pipeline Blender (F7-00) · ART · ficou fora do escopo da F0-03

## Notas de integração
_(quando uma tarefa precisar tocar arquivo de outra lane, registrar aqui: `<ID>: arquivo — o que mudou`)_
- F8-04: `src/core/InputManager.js` — campo `cameraLocked` (trava o pan por teclado/borda na cutscene); `src/core/MatchSession.js`/`src/main.js`/`src/ui/UIManager.js`/`src/ui/screens/MainMenu.js` — ganchos do `MissionController`, eventos `warpoly:mission-retry/menu`, `showPostGame()` e botão "Missões"; `src/sim/MatchConfig.js`, `checksum.js`, `events.js`, `victory.js`, `GameManager.js` — modo `mission`, parte `mission` do checksum, eventos `MISSION_*`, `transferUnit`; `tests/unit/layers.test.js` — resolve caminhos relativos de subpastas de `src/sim`.
- F9-03 (registrado no fechamento de 2026-10-09): `src/sim/GameManager.js` — campos `netIssue`/`_inStep` (em partida online `gm.issue` entrega o comando da UI à sessão lockstep em vez da `CommandQueue`; a IA, dentro do passo, segue direta); `src/sim/checksum.js` — `stateChecksumDetail` (hash por categoria e por unidade; ordens, árvores, jazidas, projéteis, RNG); `src/sim/rng.js` — `state()`; `src/sim/Tree.js`/`src/sim/Building.js` — fallbacks `Math.random` removidos (lançam erro sem rng); `src/core/MatchSession.js`/`src/main.js` — `?online=1`, sessão `online` (proxy da sim, `pump` no laço de render, HUD online).
- F7-05 (registrado no fechamento de 2026-10-09): `src/core/MatchSession.js` — cria, atualiza e descarta o `VfxSystem` (só fora do headless); `src/core/QualitySettings.js` — campo `vfx` por preset; `src/main.js` — getter `vfx` (debug/capturas); `src/inspector/inspector.js` — botão "Efeito VFX". Nada em `src/sim`/`src/ai`.
- F7-09: `index.html` (retrato animável, ícones no cabeçalho de construção/botões, arte do loading), `style.css`, `src/main.js` (`installSpriteFallback`/`loadUiManifest`), `src/ui/UIManager.js` (sprites, retrato idle/ataque, dirty-check da fila/atributos), `src/ui/screens/MainMenu.js` + `mainMenu.css` (arte do menu), `public/_headers` (cache de `/ui/*`); novos `src/ui/uiSprites.js`, `public/ui/`, `tools/blender/{render_*,ui_*}.py`, `tools/dump-portrait-poses.mjs`, `tools/capture-art2d.mjs`. Nada em `src/sim`, `src/ai`, `src/models` nem nos `.glb`.
- F7-06 (registrado no fechamento de 2026-10-09, task/close-b): `src/animation/UnitAnimator.js` — `bindModel` monta `_blendObjs` sem repetidos (nós referenciados por várias chaves de `meshParts`, como o machado do Arremessador, eram misturados N vezes no cross-fade) + teste `tests/unit/unitAnimatorBlend.test.js`; `tools/capture-anim.mjs` (idle corrigido, seções `crossfade`/`carga`/`jogo-dados`, filtro `ANIM_ONLY`), `tools/ui-captures/terrain/capture.mjs` (`TERRAIN_OUT`) e novos `tools/ui-captures/net-poc/capture.mjs` e `tools/ui-captures/lobby/capture.mjs` — verificações em navegador (via `safe-run`) do fechamento do grupo B.
- F7-00b arte B (2026-10-10): `src/world/Water.js` (PERF) — plantas aquáticas fundidas por material (`mergeByMaterial`, de ~625 malhas para ~56; -500 draw calls da cena inicial); `src/world/TreeManager.js` (PERF) — bétula sob demanda e árvore reserva no lugar do procedural; `src/animation/UnitAnimator.js` — `applyTentacles` (nós `Anim_Tentacle*` do Olho Vigia); `src/entities/ModelFactory.js`, `src/models/index.js`, `src/entities/glbModels.js`, `src/inspector/inspector.js` — `_placeholder`, remoção dos procedurais substituídos, `tree_birch`; `src/data/maps/validate.js` + `continental-1v1.json` + `src/editor/preview3d.js` + `src/i18n/*` (CONTENT/UI) — espécie `birch`; `tests/unit/maps.test.js` (QA) — usa `FOREST_SPECIES`; `tools/blender/*`, `tools/capture-*.mjs`, `tools/ui-captures/art-b/` — scripts de captura sem as capturas `_old` dos procedurais removidos, `drawcalls.mjs` e `capture.mjs`.
- NEW-53 (m04, 2026-10-10): `src/sim/Unit.js`/`src/sim/Building.js` (CORE) — campo `markColor` (só render, fora do checksum); `src/render/UnitView.js`/`BuildingView.js` — anel de seleção com cor própria via novo `src/render/markRing.js`; `src/sim/missions/{actions,schema}.js` — ação `spawnBuilding` e `markColor` em `spawn`; `src/data/campaigns/alliance/m04-ponte-do-rio-turvo.json` (CONTENT).
