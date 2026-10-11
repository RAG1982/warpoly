# Estado do projeto para a nuvem — pronto, com falha, não iniciado

> Atualizado em 2026-10-11 (após a integração #35 e a rodada de melhorias pedidas após jogar a campanha). Documento para sessões do Claude Code na nuvem (`cloud/<ID>`). Complementa `docs/TASKS.md` (fonte de status) e `docs/HANDOFF_CLOUD.md` (fila e regras).
> Regra: **nada deste documento é verdade sem conferir no código** — ao começar, rode `npm test` e confirme.

## 0. Como começar
1. `git fetch origin && git checkout -b cloud/<ID> origin/master` (o `master` do GitHub inclui os PRs da nuvem até a PR #35 "integração 2"; PRs #36–#40 e a F8-05b ainda NÃO estão mesclados — ver seção 3).
2. Branches pendentes (seção 3) **não** estão no `master`. Para continuar uma delas: `git checkout -b cloud/<ID> origin/cloud/<nome>` e depois `git merge origin/master`. As branches locais antigas `task/F7-08`, `task/F10-04` e `task/NEW-44` já foram retomadas e mescladas (PRs #29, #28, #30).
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
| F7-02 | Cores de time: **decidido (2026-10-11): fica como está** (material `TeamColor`); sem máscara/uniform. Falta só a revisão visual local. |
| F8-03 | Editor de mapas: **decidido (2026-10-11): `painted` fica em `src/sim/terrainGenerators.js`** (exceção à regra, aceita). |
| F8-05 | Campanha Aliança (8 missões): **premissa "A Marcha da Aliança" APROVADA (2026-10-11)**. Falta verificar início de missão no jogo e carry-over (local). Destrava a F8-06. |
| F9-03 | Lockstep WebRTC: **decidido (2026-10-11): `checkEvery = 10` em jogo** (1 s, como em `docs/09_MULTIPLAYER.md` §3); 1 só nos testes. Sem mudança de código. |
| F9-05 | Replays, inclusive online (`takeLog`, PR #11): falta verificar replay online no navegador. Local. |
| F10-05 | PWA, deploy, chunks por facção (PR #15): falta verificar carga por facção no navegador. Local. |

### 1.3 Backlog NEW resolvido e mesclado
- Rodada 1 da nuvem (PRs #5, #7–#16): NEW-4, NEW-31, NEW-50, NEW-11, NEW-13, NEW-49, NEW-52, AUD-1, F9-05b, F10-05b.
- Rodada 2 (PRs #17–#24, integração #25): NEW-41 (teste isolado), NEW-7 (chunks do `TreeManager`), NEW-29 (nomes D7), NEW-35 (`CMD.ATTACK_GROUND`), NEW-26 (inspeção de neutros), NEW-24 (portão e minimapa da muralha), correção de idioma nos testes (#23), F1-10 itens 1–2.
- Rodada 3 (integração #35): NEW-1 (remove `GLTFBuildingLoader`), decisões do dono (#27), F10-04 (CI de desempenho), F7-08 (áudio de produção), NEW-44 (IA com madeira alcançável), NEW-25 e NEW-34 (acampamentos neutros e escolta de cerco), F1-10 itens 3–4 (impostor de árvores, LOD de unidades e construções), specs NEW-6 e NEW-14.
- Já DONE antes: NEW-2, 3, 5, 8, 10, 12, 16, 17, 18, 21, 22, 23, 28, 32, 33, 36–40, 42, 43, 45–48, 53.
- Verificação visual ou de medição pendente (local, status REVIEW): NEW-7, 13, 19, 24, 25, 26, 34, 35, 44, 49, 52; F1-10; F7-08; F10-04.

## 2. FALHA — o que hoje não está verde ou não está correto
- **Suíte:** `master` após o PR #35: **129 arquivos / 1527 testes, 0 falhas**; lint 0 erros (50 avisos antigos); build ok. Intermitência conhecida: `tests/unit/signaling.test.js` falhou uma vez sob carga (passa isolado); no ambiente de nuvem exige `npm ci` (pacote `ws`).
- **CI de desempenho (`perf.yml`)** compara com baseline de draw calls antiga: **pode falhar até regravar** com GPU: `bash tools/safe-run.sh --timeout 900 -- npm run perf -- --update`.
- **NEW-41:** a causa real da intermitência do `fogOfWar.test.js` **não foi reproduzida** (10 execuções isoladas e 4 suítes completas sem falha); o teste foi endurecido. Se voltar, capturar a mensagem exata.
- **Soak sem cobertura da escolta de cerco:** a operação de cerco da NEW-34 disparou 0 vezes nas 30 partidas de soak; está coberta só por testes unitários.
- **Backlog ainda aberto:** NEW-6 (spec pronta, execução pendente), NEW-9 (IA destrói HQ cedo; depende de F5-03), NEW-14 (spec pronta), NEW-15/27/30 (medições com GPU/soak), NEW-51 (seed 82: terminou em 9106 ticks com a IA nova em `--count 1`; confirmar com amostra grande).

## 3. PENDENTE DE MERGE — PRs abertos (rodada pós-campanha, 2026-10-11)
Pedidos do dono após jogar a campanha. Todos verdes na nuvem (`npm test`, lint, build); **nada foi visto num navegador**.
| PR | Branch | O que entrega | Depende de |
|---|---|---|---|
| #36 | `cloud/campanha-proxima-missao` | Tela final de missão: Próxima missão / Repetir / Tentar novamente / Menu; `campaignEndPlan`, `prepareCampaignMission`. | — |
| #37 | `cloud/orcs-tamanho-humano` | `VISUAL_SCALE` (`src/data/visualScale.js`): peão, guerreiro e lançador de machado com a altura do aldeão, cavaleiro e arqueiro (±0,05 %). Ogros e cerco intocados. | — |
| #38 | `cloud/audio-melhorias` | Só soa o que está na cena (frustum + margem de 8 %), volume e alcance menores com zoom afastado, biblioteca de efeitos (`sfxLibrary.js`: metal, pedra, explosão, desabamento, afundamento, flecha, machado, picareta, martelo) e música militar (3 variações por faixa e facção). | — |
| #39 | `cloud/campanha-final-vitoria` | Tela final da campanha: ilustração procedural por facção (slot `public/ui/art/victory_<facção>.webp`), epílogo "A Aurora sobre Aurelan", fanfarra, Rejogar. | #36 |
| #40 | `cloud/mapas-florestas` | 6 mapas maiores (+15–25 %) e florestas densas (madeira alcançável ≥ 8000 por jogador); `tools/measure-wood.mjs`; prova de coordenadas das missões. `estreito-1v1` e `ilhas-4p` não crescem (rotas navais). | — |
| (em andamento) | `cloud/F8-05b` | Campanha com TODAS as categorias de unidade e liberação progressiva (`unlocks` por missão, `availableTech`). | #40 |

Ordem sugerida de merge: #36 → #39; #37, #38 e #40 independentes; F8-05b depois do #40.

## 4. NÃO INICIADO / PLANOS
- **F8-05b** (em andamento): ver seção 3. Depois: **F8-06** (campanha da Horda, 8+ missões): premissa da Aliança aprovada; falta o briefing (mesmo esquema de `unlocks`, `epilogue` e arte de vitória `victory_orc.webp`).
- **NEW-6** (ORM e texturas, spec no master): passos 1, 2, 4, 5 vão para a nuvem; **o passo 2 exige decisão do dono** (reduzir ORM e bump à metade do lado em `high` para ficar < 300 MB; alternativa HRM).
- **NEW-14** (CPU de animação, spec no master): passos 0–2, 5–6 na nuvem; **3 e 4 só depois do NEW-53** (`UnitView.js` em edição local); 7–8 opcionais.
- **F1-10c:** depende do bench local de massa300 (meta ≥ 45 FPS).
- **Mapas:** `estreito-1v1` e `ilhas-4p` precisam de terra nova para a meta de madeira (muda rotas navais; decisão do dono); os JSON ampliados não são reproduzíveis por `tools/gen-map.mjs`.
- **Orcs no tamanho humano:** revisar visualmente os fatores do grunt (0,73) e do lançador (0,72), medidos pela caixa que inclui moicano e cabeça grande.
- **Blender (local):** F7-01, F7-07, F7-00b remanescentes, F7-09 (sprites sem `.glb`) e arte de vitória `victory_human.webp`/`victory_orc.webp` (1920×1080, WebP ≤ 500 kB, faixa inferior escura).
- **Adiado pelo dono:** F5-03 (níveis de dificuldade), NEW-20.

## 5. Decisões do dono (2026-10-11) — todas tomadas
1. F7-02: **fica como está** (material `TeamColor`).
2. F8-03: **fica como está** (`painted` em `src/sim`).
3. F8-05: **premissa "A Marcha da Aliança" aprovada** (F8-06, campanha da Horda, liberada para briefing).
4. F9-03: **mantém `checkEvery = 10`** em jogo.
5. NEW-1: **remover** `GLTFBuildingLoader` (PR `cloud/NEW-1-remove-loader`).
6. PR #6 (`cloud/F3-01`): **fechado sem mesclar**.
7. Autorizado o uso das branches `task/F7-08` e `task/F10-04` e de `src/ai/**` (NEW-44, NEW-25, NEW-34 feitos; NEW-51 a confirmar).
8. Pedidos após jogar a campanha (2026-10-11): próxima missão na tela final, tela final especial com imagem e epílogo, F8-05b (todas as unidades, liberação progressiva), mapas maiores e florestas, áudio melhor (só da cena visível, com zoom), orcs no tamanho humano — ver seção 3.

## 6. Verificações que só o dono pode fazer (GPU / navegador / Blender)
- Replay online e carga por facção (F9-05, F10-05).
- Capturas: NEW-13, NEW-19, NEW-49, NEW-52.
- Benchmarks: F1-10, NEW-14, NEW-15, NEW-27, regravar `tests/perf/baseline.json` (F10-04).
- Baseline visual: `npm run visual -- --update` após mudanças no inspetor (107 alvos).
- Áudio no navegador (F7-08 e PR #38): `tools/audio-check.mjs`; ouvir som fora de vista, zoom, efeitos e música.
- Jogar as 8 missões da campanha (mapas novos #40, F8-05b, tela final #36/#39) e comparar o tamanho dos orcs (#37).

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
