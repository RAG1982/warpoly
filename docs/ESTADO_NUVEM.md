# Estado do projeto para a nuvem — pronto, com falha, não iniciado

> Atualizado em 2026-10-12, **estado de entrega para continuar localmente**: todo o trabalho da nuvem está mesclado no `master` (PRs até #50). Complementa `docs/TASKS.md` (fonte de status; o coordenador local o atualiza) e `docs/HANDOFF_CLOUD.md` (fila e regras).
> Regra: **nada deste documento é verdade sem conferir no código** — ao começar, rode `npm test` e confirme.

## 0. Como começar
1. `git fetch origin && git checkout -b cloud/<ID> origin/master` (o `master` do GitHub inclui TODOS os PRs da nuvem até a #50; nada pendente de merge — ver seção 3).
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
- Rodada 4 (PRs #44–#47, integração #46): **F8-05b** (campanha da Aliança com todas as categorias de unidade e liberação progressiva `unlocks`/`availableTech`/`techRestriction`), **remoção das falas** das unidades (`src/audio/speech/` apagado), **música**: catálogo de 41 faixas (`src/audio/music/catalog.js`), tema de abertura "Marcha da Tempestade" no menu, evolução por tempo de partida, **player de músicas no inspetor** (botão 🎵 Músicas ou `?panel=music`, seleção em `localStorage['warpoly.music.selection']`), `docs/MUSICA.md`; **exportação MIDI** (`tools/export-midi.mjs`, `src/audio/music/midiExport.js`).
- Rodada 5 (documentos, PRs #48–#50): briefing da Horda (`docs/specs/F8-06-campanha-horda.md`, preservado), briefing do dono do **novo mundo**, specs `MUNDO-HISTORIA-CAMPANHA.md`, `MUNDO-HEROIS.md`, `MUNDO-TERRENO-MAPAS.md`, protótipo de costas irregulares com lava (`tools/proto/irregular-coast.mjs`, `tools/lib/irregularCoast*.mjs`, 57 testes, prévias em `docs/refs/mundo/previews/`) e as 3 imagens de referência em `docs/refs/mundo/`.
- Já DONE antes: NEW-2, 3, 5, 8, 10, 12, 16, 17, 18, 21, 22, 23, 28, 32, 33, 36–40, 42, 43, 45–48, 53.
- Verificação visual ou de medição pendente (local, status REVIEW): NEW-7, 13, 19, 24, 25, 26, 34, 35, 44, 49, 52; F1-10; F7-08; F10-04.

## 2. FALHA — o que hoje não está verde ou não está correto
- **Suíte:** `master` após o PR #50: **142 arquivos / 1807 testes, 0 falhas**; lint 0 erros (50 avisos antigos); build ok. Intermitência conhecida: `tests/unit/signaling.test.js` falhou uma vez sob carga (passa isolado); no ambiente de nuvem exige `npm ci` (pacote `ws`).
- **CI de desempenho (`perf.yml`)** compara com baseline de draw calls antiga: **pode falhar até regravar** com GPU: `bash tools/safe-run.sh --timeout 900 -- npm run perf -- --update`.
- **NEW-41:** a causa real da intermitência do `fogOfWar.test.js` **não foi reproduzida** (10 execuções isoladas e 4 suítes completas sem falha); o teste foi endurecido. Se voltar, capturar a mensagem exata.
- **Soak sem cobertura da escolta de cerco:** a operação de cerco da NEW-34 disparou 0 vezes nas 30 partidas de soak; está coberta só por testes unitários.
- **Backlog ainda aberto:** NEW-6 (spec pronta, execução pendente), NEW-9 (IA destrói HQ cedo; depende de F5-03), NEW-14 (spec pronta), NEW-15/27/30 (medições com GPU/soak), NEW-51 (seed 82: terminou em 9106 ticks com a IA nova em `--count 1`; confirmar com amostra grande).

## 3. PENDENTE DE MERGE
**Nada.** Todo o trabalho da nuvem está no `master`. Única branch remota que NÃO está nele: `cloud/F3-01` (PR #6, fechado como superado; pode ser apagada). Branches `cloud/*` já mescladas podem ser apagadas à vontade.

## 4. NÃO INICIADO / PLANOS
### 4.1 Novo mundo (decisão do dono de 2026-10-11) — só especificado, NADA implementado
Specs no `master`: `docs/specs/MUNDO-BRIEFING-DONO.md` (fonte), `MUNDO-HISTORIA-CAMPANHA.md`, `MUNDO-HEROIS.md`, `MUNDO-TERRENO-MAPAS.md`. Resumo: planeta **Ondara**, continentes **Velmara** (humanos, OESTE, exuberante) e **Cinzara** (orcs, LESTE, desértico), **Mar Fendido** com 8 ilhas "Estilhaços" de terrenos distintos; **duas campanhas espelhadas de 12 missões** (`war-alliance`, `war-horde`; tutorial progressivo nas m1–6, tudo liberado a partir da m6; final = fortaleza no continente adversário bloqueando as ilhas; gancho aberto); **6 heróis** (capitão, mago e comandante por facção: Brann, Oren, Dorian / Drogath, Vozgul, Skarn); tela de abertura da história (7 painéis); mapa-múndi **só ilustrativo**; mapas de costa **irregular** (não mais "esferas interligadas"); biomas só visuais (10); **lava** como divisor sem dano (bloqueia como a água); javalis no lugar dos porcos (só visual). A campanha atual da Aliança + briefing da Horda ficam como **"Campanha Clássica (beta)"**.
**Ordem de execução sugerida** (cada passo é um commit; ver os passos nas specs): (1) gerador de mapas irregulares + `lavaGrid` + testes (nuvem); (2) tilesets/biomas (nuvem; arte local); (3) dados dos 6 heróis (`units.js`, `abilities.js`, extensão `status` com `radius`/`allies` em `src/sim/abilities.js`, i18n, retratos SVG provisórios); (4) seletor de campanhas e progresso por campanha; (5) tela de história; (6) mapas por ilha; (7) 12 missões × 2 em lotes; (8) testes de cobertura e progressão. Perguntas AINDA abertas (nenhuma muda o escopo): ver §10 de `MUNDO-HISTORIA-CAMPANHA.md` e §8 de `MUNDO-TERRENO-MAPAS.md`.
### 4.2 Outros
- **NEW-6** (ORM e texturas, spec no master): passos 1, 2, 4, 5 na nuvem; **o passo 2 exige decisão do dono** (reduzir ORM e bump à metade do lado em `high` para ficar < 300 MB; alternativa HRM).
- **NEW-14** (CPU de animação, spec no master): passos 0–2 e 5–6 na nuvem; 3 e 4 só depois do NEW-53 (`UnitView.js` em edição local); 7–8 opcionais.
- **F1-10c** (LOD): depende do bench local de massa300 (meta ≥ 45 FPS). **NEW-51**: confirmar a seed 82 com amostra grande (`--count 30 --recheck 3`).
- **Música:** escolher no inspetor as faixas que entram no jogo (as 3 de combate atuais ficam desligadas por padrão; o jogo cai nelas se nenhuma de combate for marcada); opcional: botão "Exportar MIDI" no player e importador `.mid`.
- **Mapas atuais:** `estreito-1v1` e `ilhas-4p` não cresceram (rotas navais); os JSON ampliados não são reproduzíveis por `tools/gen-map.mjs`.
- **Orcs no tamanho humano:** revisar visualmente os fatores do grunt (0,73) e do lançador (0,72).
- **Blender (local):** F7-01, F7-07, F7-00b remanescentes, F7-09; arte de vitória `victory_human.webp` e `victory_orc.webp` (1920×1080, WebP ≤ 500 kB, faixa inferior escura); tarefas ART-01..16 de terreno (`MUNDO-TERRENO-MAPAS.md` §6) e modelos/retratos dos 6 heróis.
- **Adiado pelo dono:** F5-03 (níveis de dificuldade), NEW-20.

## 5. Decisões do dono (2026-10-11) — todas tomadas
1. F7-02: **fica como está** (material `TeamColor`).
2. F8-03: **fica como está** (`painted` em `src/sim`).
3. F8-05: **premissa "A Marcha da Aliança" aprovada** (F8-06, campanha da Horda, liberada para briefing).
4. F9-03: **mantém `checkEvery = 10`** em jogo.
5. NEW-1: **remover** `GLTFBuildingLoader` (PR `cloud/NEW-1-remove-loader`).
6. PR #6 (`cloud/F3-01`): **fechado sem mesclar**.
7. Autorizado o uso das branches `task/F7-08` e `task/F10-04` e de `src/ai/**` (NEW-44, NEW-25, NEW-34 feitos; NEW-51 a confirmar).
8. Pedidos após jogar a campanha (2026-10-11), TODOS entregues e mesclados: próxima missão na tela final, tela final especial com imagem e epílogo, F8-05b (todas as unidades, liberação progressiva), mapas maiores e florestas, áudio melhor (só da cena visível, com zoom), orcs no tamanho humano — ver seção 3.

9. Novo mundo (2026-10-11/12): orcs a leste e humanos a oeste; campanhas espelhadas; mapa-múndi ilustrativo; bioma só visual; **lava sem dano, só bloqueia como a água**; nomes aprovados; **3 heróis por facção**; campanha atual + briefing da Horda preservados como "Clássica (beta)"; músicas: prioridade baixa, ficam como estão. Briefing da Horda (#48) e specs do mundo (#49, #50) mesclados.

## 6. Verificações que só o dono pode fazer (GPU / navegador / Blender)
Nada do que veio da nuvem foi visto ou ouvido num navegador. Roteiro por PR no corpo de cada PR (#9–#46).
- **Jogar:** as 8 missões da Aliança (liberação progressiva, UI de bloqueio, mapas novos, tela de próxima missão, tela final e epílogo, fanfarra); tamanho dos orcs (peão, guerreiro, lançador vs humanos); mapas ampliados e florestas (minimapa, desempenho, escoltas/cutscenes da m04); cerco atacando o chão; inspeção de neutros; portão da muralha; IA contra cerco e acampamentos neutros.
- **Áudio:** `bash tools/safe-run.sh --timeout 300 -- node tools/audio-check.mjs` (nunca rodou); som só do que está em vista, zoom; efeitos novos; música no inspetor (`/inspector.html` > Músicas): marcar as faixas que ficam e guardar o JSON; tema de abertura no menu; sem falas.
- **Desempenho:** `npm run bench` com e sem `?lod=0` (F1-10; meta massa300 ≥ 45 FPS); regravar a baseline: `bash tools/safe-run.sh --timeout 900 -- npm run perf -- --update` (o job `perf.yml` pode falhar até lá); baseline visual `npm run visual -- --update` (o cabeçalho do inspetor ganhou um botão).
- Replay online e carga por facção (F9-05, F10-05); capturas NEW-13, 19, 49, 52.

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

## 8. Como continuar localmente (resumo)
1. `git pull` no `master` (inclui tudo até o PR #50) → `npm ci` → `npm test` (esperado: 142 arquivos / 1807 testes) → `npm run lint` → `npx vite build --outDir /tmp/build-check`.
2. Ler, nesta ordem: `CLAUDE.md`, `docs/README.md`, este arquivo, `docs/CHANGELOG_NUVEM.md`, `docs/TASKS.md` (atualizar o status com o que está na §1.3 — a nuvem não editou o TASKS) e as specs `MUNDO-*`.
3. Regras de máquina: processos pesados (Playwright, Blender, bench, smoke, perf, audio-check) só via `tools/safe-run.sh`. Conflitos prováveis ao integrar trabalho local: `src/ui/UnitView.js`/`src/render/UnitView.js` (NEW-53), `src/sim/missions/` (F8-05b acrescentou a ação `setTier` e a condição `research`), `src/audio/*`.
4. Prompt sugerido para a sessão local: `Leia docs/ESTADO_NUVEM.md e docs/CHANGELOG_NUVEM.md; confira npm test; depois atualize docs/TASKS.md com o estado e continue pela seção 4 (novo mundo: começar pelo gerador de mapas irregulares).`
