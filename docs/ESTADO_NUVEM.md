# Estado do projeto para a nuvem — pronto, com falha, não iniciado

> Atualizado em 2026-10-10. Documento para sessões do Claude Code na nuvem (`cloud/<ID>`). Complementa `docs/TASKS.md` (fonte de status) e `docs/HANDOFF_CLOUD.md` (fila e regras).
> Regra: **nada deste documento é verdade sem conferir no código** — ao começar, rode `npm test` e confirme.

## 0. Como começar
1. `git fetch origin && git checkout -b cloud/<ID> origin/master` (o `master` do GitHub está em `475e5d5` ou posterior).
2. Branches com trabalho parcial (seção 3) **não** estão no `master`. Para retomar uma delas: `git checkout -b cloud/<ID> origin/task/<nome>` e depois `git merge origin/master` (estão cerca de 60 commits atrás; sem conflito pelo teste de merge).
3. Verificação na nuvem: `npm ci`, `npm test`, `npm run lint`, `npx vite build --outDir /tmp/build-check`. Sem GPU, sem Blender, sem `safe-run.sh`.

## 1. PRONTO — no `master`
### 1.1 Fases (TASKS, status DONE)
- **Fundação e desempenho:** F0-01…F0-07; F1-01…F1-09 (F1-10 = LOD e culling, não iniciada).
- **Núcleo:** F2-01…F2-08 (comandos `gm.issue`, determinismo com RNG por seed, checksum, event bus, mapas em dados).
- **Jogabilidade base e expansão:** F3-00…F3-11 (economia WC2, combate, níveis do Centro, pesquisas, muralhas, reparo, neutros, vitória, balanceamento); F4-01…F4-08 (cavalaria, cerco, mana e magias, conjuradores, sapadores, aéreo, naval com petróleo, heróis únicos).
- **IA:** F5-01, F5-02, F5-04, F5-05, F5-06 (IA de campanha por dados: guarnição, ondas, ataques por gatilho).
- **HUD/UX:** F6-01…F6-09 (menu, opções, HUD responsiva, tutorial, i18n).
- **Arte:** F7-00 (PoC Blender), F7-03 (iluminação e pós-processamento), F7-04 (tilesets), F7-05 (VFX em GPU), F7-06 (animação de produção).
- **Conteúdo:** F8-01 (6 mapas skirmish), F8-02 (gerador de mapas), F8-04 (missões e gatilhos).
- **Multiplayer:** F9-01 (PoC lockstep), F9-02 (sinalização e lobby), F9-04 (reconexão, pausa votada, saída vira IA, chat, pings).
- **Qualidade:** F10-01 (76 testes da simulação), F10-02 (soak IA×IA), F10-03 (regressão visual; baseline fora do git).

### 1.2 Em REVIEW (código no `master`, falta verificação ou decisão)
| ID | Situação |
|---|---|
| F7-00b | Migração de modelos para Blender. Arte A e B concluídas; restam remanescentes procedurais (flora, rochas, terreno, água, machado) e revisão final. Local (Blender). |
| F7-09 | Ícones, retratos e artes 2D (`public/ui`, 3,4 MB). Faltam sprites de modelos sem `.glb` (Ovelha, Submersível, Tartaruga, Refinaria, Fundição, Forja Naval, Caldeirão). |
| F7-02 | Cores de time: **decisão do dono** (a spec pede máscara em canal/área e uniform; implementado: material `TeamColor`). |
| F8-03 | Editor de mapas: **decisão do dono** (gerador `painted` registrado em `src/sim/terrainGenerators.js`, contra a regra de não tocar `src/sim`). |
| F8-05 | Campanha Aliança (8 missões, premissa **provisória**): **decisão do dono** (aprovar premissa); verificar início de missão no jogo e carry-over. |
| F9-03 | Lockstep WebRTC: **decisão do dono** (checksum a cada 10 turnos em jogo vs "por turno" da spec). |
| F9-05 | Replays, inclusive online (`takeLog`, PR #11): falta verificar replay online no navegador. Local. |
| F10-05 | PWA, deploy, chunks por facção (PR #15): falta verificar carga por facção no navegador. Local. |

### 1.3 Backlog NEW já resolvido (DONE) e mesclado pela nuvem
- NEW-4 (testes de `hasLineOfSight`), NEW-31 (`check-data-parity` roda), NEW-41 (timeouts de 30 s; **causa do fogOfWar ainda aberta**), NEW-50 (lobby limpa aviso), NEW-2, NEW-3, NEW-5, NEW-8, NEW-10, NEW-11, NEW-12, NEW-16, NEW-17, NEW-18, NEW-21, NEW-22, NEW-23, NEW-28, NEW-32, NEW-33, NEW-36 a NEW-40, NEW-42, NEW-43, NEW-45 a NEW-48, NEW-53 (correção de m04: forte humano, `markColor`, `spawnBuilding`).
- Verificação visual pendente (local), status REVIEW: **NEW-13** (chamas sob névoa), **NEW-19** (ruínas/clareira, `src/render/RuinsManager.js`), **NEW-49** (golpe do Arremessador), **NEW-52** (juncos só em água rasa).

## 2. FALHA — o que hoje não está verde ou não está correto
- **Suíte de testes:** no `master` 1311 testes passam. Intermitência conhecida: `tests/unit/signaling.test.js` ("pronto / iniciar: só anfitrião…") falhou uma vez sob carga durante a validação do NEW-44 — passa isolado. Relacionado a NEW-41.
- **NEW-41** (aberto, DOING parcial): intermitência de `fogOfWar.test.js` ("dispose … uniform de textura trocado"). Suspeita: estado global `fogUniforms` compartilhado. **Causa não confirmada.**
- **Campanha Aliança:** premissa provisória. Início de missão pelo navegador não verificado até o fim.
- **Backlog aberto (auditoria `docs/AUDITORIA_BACKLOG.md`):**
  - NEW-1: `GLTFBuildingLoader` só usado por `src/render/buildings/orc/GreatHall.js:3`. Decisão: remover ou adotar.
  - NEW-6: sem ORM de texturas nem Worker/OffscreenCanvas (`grep` em `src/` vazio). Precisa de spec.
  - NEW-7: `src/world/TreeManager.js:7` `CAPACITY = 120` fixo por tipo; `:119` um `InstancedMesh` de 120 por tipo.
  - NEW-9: IA destrói HQ cedo (testes da F2-01). Depende de F5-03 e de balanceamento.
  - NEW-14: `Unit.update` domina a CPU (~4,5 ms com 310 unidades). LOD existe (`src/sim/constants.js:31`), falta medir.
  - NEW-15: 50 FPS em `combate100` não atingido (medição com GPU).
  - NEW-24: muralha sem portão; segmentos ausentes do minimapa (`UIManager.drawMinimap`).
  - NEW-26: `src/sim/GameManager.js:1388` `selectSingle` só seleciona entidades do jogador local; neutros sem card.
  - NEW-27: draw calls dos neutros vs master (medição com GPU).
  - NEW-29: `name:` em `src/data/buildings.js` ainda com nomes antigos (`'Castelo Real'`, `'Forja Real'`, `'Grande Salão Orc'`); nomes D7 existem em `src/data/tiers.js:15-16`.
  - NEW-30: repetir o lote de balanceamento (F3-11) quando F4/F5 estiverem em uso (ferramentas `tools/balance-sim.mjs`).
  - NEW-34: escolta de cerco pela IA e alvo dentro do alcance mínimo (`src/ai/AIMilitaryManager.js:368-372`).
  - NEW-35: sem ataque no chão do cerco (`src/sim/commands.js` sem `ATTACK_GROUND`).
  - NEW-44 e NEW-51: ver seção 3.

## 3. TRABALHO PARCIAL — branches no GitHub (não mesclados)
| Branch | O que está implementado | O que falha / falta | Estado de teste |
|---|---|---|---|
| `task/NEW-44` (2 commits) | `src/ai/AIWood.js` (leitura de madeira alcançável por terra), serraria avançada e reserva de madeira em `AIEconomyManager.js`, `AIDirector.js` e `AIMilitaryManager.js`; `tests/unit/ai-wood.test.js` (13 testes). | **1 teste falha**: "a reserva segura o treino que consumiria a madeira da serraria; sem reserva treina" (`expected +0 to be 1`). **Sem soak A/B** (seeds 1–20 em continental-1v1, estreito-1v1, ilhas-4p) e sem validação de que não piora a taxa de término (96–100% hoje). | 12/13 do arquivo; suíte completa com 1 falha de teste (+ 1 intermitente de sinalização). |
| `task/F7-08` (5 commits) | Motor de áudio: `src/audio/AudioEngine.js`, `VoicePool.js` (vozes com prioridade), `attenuation.js` (posicional), `musicDirector.js` + `music/` (trilha adaptativa paz/combate), `ambience.js`, `sfxRecipes.js`, `speech/` (falas por síntese de formantes, sem samples de terceiros), `audioMapping.js`, `audioConfig.js`, `SoundManager.js` reescrito; integração parcial em `main.js`, `QualitySettings.js`, `MatchSession.js`, `optionsApply/optionsStore/OptionsPanel` e i18n. `tools/audio-check.mjs` (verificação no navegador). | Integração não concluída de ponta a ponta. **`tools/audio-check.mjs` nunca rodou.** AudioContext só após gesto do usuário: não verificado no navegador. | Suíte completa da branch: **1327 passam** (104 arquivos). |
| `task/F10-04` (7 commits) | `tools/perf-budget.mjs` + `tools/lib/perfBudget.mjs` (comparador: draw calls e load sempre; FPS só com GPU real; limiar 10%), `tests/unit/perfBudget.test.js` (41 testes), `.github/workflows/perf.yml`, `npm run perf`, docs em `docs/10_DEPLOY.md`, `tests/perf/baseline.json`. | `baseline.json` foi medida no commit `475f874` (base `d769cd7`): **está desatualizada**, precisa regravar no master atual. Job de CI nunca rodou. Verificação com GPU (FPS) pendente — **local**. | 41/41 do arquivo. |

Para retomar: `git fetch origin && git checkout -b cloud/<ID> origin/task/<nome> && git merge origin/master`.

## 4. NÃO INICIADO
- **Sem código:** NEW-25 (IA ataca acampamentos neutros; depende de `src/ai`, faria conflito com NEW-44 — começar depois), NEW-34 (escolta de cerco pela IA; mesma restrição).
- **Depende de NEW-44:** NEW-51 (seed 82, `continental-1v1`, humano, brutal: não termina em 72000 ticks; mesma classe de NEW-46 — madeira esgotada).
- **Precisa de spec antes (Sonnet escreve em `docs/specs/`):** F1-10 (LOD e culling), NEW-6 (ORM e texturas), NEW-14 (CPU da animação).
- **Blender (local):** F7-01 (fidelidade dos orcs Peão, Grunt, Lançador, Ogro), F7-07 (modelos novos: faltam referências de Refinaria, Fundição, Submersível, Tartaruga, Forja Naval, Caldeirão).
- **Conteúdo:** F8-06 (campanha Horda, 8+ missões) — só depois de aprovar a premissa da Aliança (F8-05).
- **Adiado pelo dono:** F5-03 (níveis de dificuldade, DOING parcial: meta Difícil×Normal ≥ 60% não atingida); NEW-20 (teste intermitente, spec em `docs/specs/NEW-20-teste-intermitente.md`).

## 5. Decisões pendentes do dono (bloqueiam; não são de implementação)
1. F7-02: máscara de cor por canal/uniform, ou aceitar tinta por material?
2. F8-03: gerador `painted` fica em `src/sim`, ou move para `src/data`?
3. F8-05: aprova a premissa "A Marcha da Aliança" (provisória)?
4. F9-03: checksum a cada turno (custo baixo) ou a cada 10 (atual)?
5. NEW-1: remover `GLTFBuildingLoader` (recomendado) ou adotar em `GreatHall.js`?
6. PR #6 (`cloud/F3-01`, 29/09): fechar como superado (a F3-01 já está no master).

## 6. Verificações que só o dono pode fazer (GPU / navegador / Blender)
- Replay online e carga por facção (F9-05, F10-05).
- Capturas: NEW-13, NEW-19, NEW-49, NEW-52.
- Benchmarks: F1-10, NEW-14, NEW-15, NEW-27, regravar `tests/perf/baseline.json` (F10-04).
- Baseline visual: `npm run visual -- --update` após mudanças no inspetor (107 alvos).
- Áudio no navegador (F7-08): `tools/audio-check.mjs`.

## 7. Onde estão as coisas (mapa rápido)
- Simulação: `src/sim/` (missões em `src/sim/missions/`, comandos, transporte, checksum, RNG). Não usar `Math.random` nem `Date.now` aqui (`tests/unit/noMathRandom.test.js` vigia `src/sim` e `src/ai`).
- IA: `src/ai/` (AIDirector por jogador, economia, militar, percepção sob névoa).
- Render: `src/render/` (VFX em `src/render/vfx/`, `PostFX.js`, `RuinsManager.js`, `markRing.js`).
- Rede: `src/net/` (lockstep, WebRTC, lobby, sinalização), `server/` (servidor de sinalização), `src/replay/`.
- Campanha: `src/data/campaigns/alliance/` (8 missões), `src/campaign/`.
- Mapas: `src/data/maps/` (10 mapas JSON, incluindo `tutorial`, + gerador `generator.js`), editor em `src/editor/` (`editor.html`).
- Arte: `tools/blender/` (scripts), `public/models/` (GLB), `public/ui/` (ícones e retratos).
- Ferramentas: `tools/soak.mjs`, `tools/gen-map.mjs`, `tools/visual-regress.mjs`, `tools/online-check.mjs`, `tools/replay-check.mjs`, `tools/preview-check.mjs`.
- Backlog e status: `docs/TASKS.md`; auditoria: `docs/AUDITORIA_BACKLOG.md`; fila: `docs/HANDOFF_CLOUD.md`.
