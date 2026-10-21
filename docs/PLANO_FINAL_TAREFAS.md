# PLANO FINAL — fichas das tarefas (prontas para entregar a um agente)

> Companheiro de [`PLANO_FINAL.md`](PLANO_FINAL.md) (diagnóstico, decisões, marcos, quadro de status). Cada ficha abaixo é **autossuficiente**: o agente lê o **Preâmbulo**, a ficha e os arquivos que ela cita, e nada mais.
> Escrito em 2026-10-17 por Sonnet 5.5.

---

## Preâmbulo (vale para TODA tarefa)

### Prompt padrão (copie e troque `<ID>`)
```
Projeto WarPoly, em /home/rafael/warpoly. Você está numa git worktree isolada (branch task/<ID>).
Primeiro rode `git merge master`. Leia CLAUDE.md, docs/specs/_COMUM.md, o "Preâmbulo" de
docs/PLANO_FINAL_TAREFAS.md e a ficha da tarefa <ID> nesse mesmo arquivo. Execute SÓ essa tarefa,
literalmente. Escreva em PT-BR. Faça commits "<ID> wip: ..." a cada etapa concluída. Entregue o
commit final e um relatório de até 25 linhas.
```
Modelo: `sonnet` (Sonnet 5.5). `haiku` apenas nas fichas marcadas **H**. Modelagem 3D/Blender: sempre Sonnet 5.5, nunca Haiku. Agente com `isolation: worktree`.

### Regras fixas
1. **Leitura obrigatória:** `CLAUDE.md` (regras do projeto), `docs/specs/_COMUM.md` (ambiente, verificação, entrega) e a ficha. Docs de apoio ficam citados em cada ficha.
2. **Máquina:** todo navegador/Playwright/Blender/bench/smoke/visual/perf roda **só** por `bash /home/rafael/warpoly/tools/safe-run.sh [--mem 12G] [--timeout S] -- <comando>` (trava global de 1 processo pesado; 12 GB). Chromium sempre com GPU real (scripts abortam em SwiftShader/llvmpipe via `tools/lib/assertGpu.mjs`; novos scripts devem usá-lo). Use `?skipPreload&texq=low` quando não medir carga/textura. Dev server: `npx vite --port <livre ≥ 5300> --strictPort`; encerre vite e navegadores ao terminar (`pkill -f "vite --port <porta>"`). Se a worktree não tiver `node_modules`: `ln -s /home/rafael/warpoly/node_modules node_modules` (não commitar).
3. **Verificação mínima antes de entregar** (dispensável só em tarefa de docs pura):
   ```bash
   npm test && npm run lint && npx vite build --outDir /tmp/claude-1000/warpoly-build-check
   npm run smoke      # quando tocar em runtime/visual (já usa safe-run por dentro)
   ```
   Mudou `src/sim/**`, `src/ai/**` ou `src/data/**`: rodar também `node tools/headless-match.js --seed 1` e confirmar que o checksum só muda quando a tarefa pede (e explicar).
4. **Determinismo:** nada de `Math.random`, `Date.now` ou `performance.now` em `src/sim/**` e `src/ai/**` (`tests/unit/noMathRandom.test.js` vigia). RNG: `src/sim/rng.js`.
5. **Conteúdo:** textos de UI e de missão em **pt-BR e en** (`src/i18n/*.json`, textos bilíngues das missões). Nada de nomes/lore da Blizzard. Nomes aprovados do mundo: Ondara, Velmara, Cinzara, Mar Fendido, Estilhaços e as 8 ilhas (Pouso do Encontro, Pedra-Mãe, Baixio do Breu, Cerne Verde, A Geada, Brejo Mudo, Fornalha, Miragem).
6. **Modelos 3D** (Blender 5.2.1: `/home/rafael/Downloads/blender-5.2.1-linux-x64/blender -b --python tools/blender/<script>.py`, via safe-run): ≤ 20 draw calls e texturas ≤ 512² por modelo novo; `.glb` em `public/models/` (meshopt+WebP); nós nomeados exatamente como o `UnitAnimator`/`ModelFactory.rebindUserData` esperam (`Torso`, `Head`, `ArmL`, `ArmR`, `LegL`, `LegR`, `Sword`, `Cape`…: não renomear sem atualizar os dois); textura de rosto **só** na face frontal (+Z) da cabeça; armas com gume voltado a +Z; cor de time = material `TeamColor`; registrar em `src/entities/glbModels.js`; entrada no inspetor (`src/inspector/inspector.js`); conferir **no jogo e no inspetor**; regravar só os alvos novos da baseline visual (`npm run visual -- --only '<regex>' --update`).
7. **Git:** commits pequenos; mensagem final termina com `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. **Não edite** `docs/PLANO_FINAL.md` nem `docs/TASKS.md`: o coordenador atualiza o quadro depois do merge. Não faça `push --force`, não reescreva histórico, não apague branches com commits não mesclados.
8. **Relatório final (≤ 25 linhas):** branch, hash, o que foi feito, números pedidos pela ficha (antes/depois), resultado dos comandos da regra 3, desvios e pendências. Sem colar código.
9. **Se o "Pronto quando" não for atingível:** não declare pronto. Entregue o que funciona, explique o bloqueio com medições e proponha a próxima ficha.

### Escala usada nas fichas
**Dif.** Fácil / Média / Difícil / Muito difícil · **Esf.** P ≤ 2 h, M meio dia, G 1–2 dias, GG > 2 dias · **Exec.** S Sonnet · SB Sonnet+Blender · H Haiku · V você.

---

# M0 — Base limpa

### M0-01 · Higiene do git
**Dif.** Fácil · **Esf.** P · **Exec.** S · **Roda:** Node · **Dep.:** —
**Objetivo:** `master` único e limpo, sem perder nenhum trabalho.
**Contexto:** 34 branches locais, 6 remotas, 9 worktrees (3 externas em `/home/rafael/warpoly-f407`, `-navbld`, `-ships`; 5 em `.claude/worktrees/`). `task/ART-04-escala` tem 1 commit (escala ×1,4 do javali, decisão do dono). `task/F7-08-verificacao`, `task/NEW-55-*`, `task/diag-ilhas4p*` têm commits **não mesclados**. A worktree `agent-ae0a5fce9876d7cb9` (branch `task/P14-todos-mapas`) tem um teste **não commitado** (+35 linhas em `tests/unit/maps.test.js`) necessário para a M1-07.
**Fazer:**
1. `git fetch --all --prune`; confirme `master` limpo.
2. Mesclar `task/ART-04-escala` com `--no-ff`; rodar `npm test`.
3. Na worktree `agent-ae0a…`: `git add tests/unit/maps.test.js && git commit` ("wip(P-14): teste de serraria perto de bosque") e `git push origin task/P14-todos-mapas`.
4. Para cada branch local `task/*` e `worktree-agent-*`: se `git rev-list --count master..<b>` for 0, apagar a branch e, se houver worktree com `git -C <wt> status --porcelain` vazio, `git worktree remove`. Se > 0, **manter**, garantir que existe no `origin` (`git push origin <b>`) e listar no relatório.
5. Rodar `npm test` e registrar quantos arquivos/testes (esperado: 159 / 2185).
**Pronto quando:** `git branch` mostra `master` + só branches com trabalho não mesclado (todas listadas no relatório e presentes no `origin`); `git worktree list` curto; testes verdes; nada perdido (relatório lista cada branch apagada com o hash do topo).
**Não fazer:** apagar branch com commits não mesclados; `--force`; mexer em `backup/pre-aaa-2026-09-28`.

### M0-02 · Reorganizar a documentação
**Dif.** Média · **Esf.** M · **Exec.** S · **Roda:** Node · **Dep.:** M0-01
**Objetivo:** um plano só, histórico preservado, documentos de estado verdadeiros.
**Contexto:** `docs/TASKS.md` tem 662 linhas e quadro desatualizado; `docs/05_PARIDADE_WARCRAFT2.md` ainda diz que 55 % do WC2 falta; `SESSION_HANDOFF`, `ESTADO_NUVEM`, `HANDOFF_CLOUD`, `CHANGELOG_NUVEM` descrevem a nuvem; `docs/specs/README.md` tem uma lista "A FAZER" velha.
**Fazer:**
1. Criar `docs/historico/` e copiar `docs/TASKS.md` inteiro para `docs/historico/TASKS_ate_2026-10-17.md`; mover (`git mv`) `ESTADO_NUVEM.md`, `HANDOFF_CLOUD.md`, `CHANGELOG_NUVEM.md`, `AUDITORIA_BACKLOG.md` para lá com uma nota de 1 linha no topo ("histórico; fonte atual: docs/PLANO_FINAL.md").
2. Reescrever `docs/TASKS.md` com **< 150 linhas**: protocolo curto (aponta para `PLANO_FINAL.md` §2), tabela de lanes, e **uma linha por tarefa antiga** (ID, título, status final, link para a âncora no histórico). Primeira linha do arquivo: "A execução atual está em PLANO_FINAL.md".
3. Atualizar `docs/05_PARIDADE_WARCRAFT2.md` conferindo cada linha contra `src/data/units.js`, `buildings.js`, `abilities.js`, `upgrades.js`, `maps/`, `campaigns/`: marcar ✅/🟡/❌ com fatos; atualizar o resumo de percentuais; manter o aviso de propriedade intelectual.
4. Encurtar `docs/SESSION_HANDOFF.md` (estado atual em ≤ 60 linhas: regras de trabalho, comandos, ponteiro para o plano); o resto vai para o histórico.
5. `docs/specs/README.md`: trocar a lista "A FAZER" por uma tabela spec → status real (leia a linha `Status` de cada spec e o `TASKS` histórico).
6. `docs/README.md` e `CLAUDE.md`: acrescentar `docs/PLANO_FINAL.md` e `docs/PLANO_FINAL_TAREFAS.md` como entrada de execução; corrigir links.
7. Verificar links relativos quebrados com um `grep`/script simples e corrigir.
**Pronto quando:** nenhum link relativo quebrado nos `.md` alterados; `docs/README.md` lista o plano; `TASKS.md` < 150 linhas; paridade condiz com o código; `npm test` verde.
**Não fazer:** apagar conteúdo (só mover/copiar); alterar código.

---

# M1 — Fechar o que já existe

### M1-01 · Verificação visual do Novo Mundo no jogo
**Dif.** Média · **Esf.** M · **Exec.** S · **Roda:** GPU local · **Dep.:** M0-01
**Objetivo:** ver, pela primeira vez, no jogo real, tudo do Novo Mundo que hoje só tem teste unitário.
**Contexto:** itens `MUNDO-4/5/9`, `NEW-54`, `ART-P0` foram mesclados sem inspeção visual completa. Modelo de script: `tools/capture-art2d.mjs` + `tools/lib/assertGpu.mjs`; capturas em `tools/ui-captures/`. Mapas com `biomeGrid`: `duelo-continental-1..3`, `ilha-unica-1..3` (`src/data/maps/`). Render regional: `src/models/environment/{splatPaint,tilesetTextures,lavaTextures}.js`, `src/data/{biomeStyles,biomeRegions,decorPlan,lavaRender}.js`.
**Fazer:** criar `tools/ui-captures/novo-mundo/capture.mjs` (via safe-run, `?skipPreload&texq=low`, 1920×1080) que verifica e captura: (a) menu → Campanha: seletor main × beta, tela de história (7 painéis, sem fallback de imagem, saída com Esc); (b) escaramuça em cada um dos 6 mapas novos: biomas regionais (exuberante, deserto, savana, vulcânico, pedregoso), lava (emissiva), árvores/decoração por região, água/costa, minimapa, névoa; (c) javali e ovelha em campo; mina que desaba (NEW-54) e ruínas; (d) console sem erros; (e) draw calls e FPS por mapa. Abra as capturas (Read) e **julgue**: transições de bioma duras? texturas espelhadas? lava sem brilho? props flutuando? Corrija defeitos pequenos (≤ 30 linhas cada); os maiores viram lista no relatório com causa provável e arquivo.
**Pronto quando:** pasta de capturas + `resultado.json`; 0 erro de console; lista priorizada de defeitos (corrigidos × pendentes); veredito explícito se as texturas por bioma precisam da M2-19.
**Não fazer:** regravar baselines (isso é a M1-09); mudar mapas.

### M1-02 · Áudio: reconciliar a branch de verificação e rodar `audio-check`
**Dif.** Difícil · **Esf.** M · **Exec.** S · **Roda:** GPU/Chromium local · **Dep.:** M0-01
**Objetivo:** a ferramenta de verificação de áudio roda e passa; a branch deixa de ser órfã.
**Contexto:** `tools/audio-check.mjs` nunca rodou. A branch `task/F7-08-verificacao` (1 commit) reescreve `tools/audio-check.mjs` e ajusta `src/audio/AudioEngine.js`/`audioConfig.js`, mas **conflita** com o motor de música do `master` (`src/audio/music/*`, ver `docs/MUSICA.md`).
**Fazer:** branch a partir do `master`; `git merge task/F7-08-verificacao`; resolver conflitos mantendo o motor de música do `master` e aproveitando o que a verificação trouxe; rodar `bash tools/safe-run.sh --timeout 300 -- node tools/audio-check.mjs`; corrigir falhas pequenas; atualizar `docs/MUSICA.md` (seção de verificação) e `docs/01_ARQUITETURA.md` onde mudou.
**Pronto quando:** `audio-check` passa (ou cada falha restante tem causa documentada e ficha em `NEW-`); `npm test` verde; a parte **auditiva** fica marcada para o G1.
**Não fazer:** reescrever o motor de música; mudar o catálogo de faixas.

### M1-03 · Medições de desempenho pendentes
**Dif.** Média · **Esf.** M · **Exec.** S · **Roda:** GPU local · **Dep.:** M0-01
**Objetivo:** fechar F1-10c, NEW-15 e NEW-27 com números.
**Contexto:** `npm run bench` (`tools/bench/`, cenários `inicial|combate100|massa300`); `?lod=0` desliga o LOD (`src/render/lod.js`); NEW-27: 997→1387 draw calls com a câmera no acampamento neutro, não isolado.
**Fazer:** 3 execuções de cada cenário (aquecimento descartado) com e sem `?lod=0`; medir draw calls com a câmera sobre um acampamento neutro vs. sem neutros; registrar em `docs/04_DIAGNOSTICO.md` (nova seção "Baseline 2026-10" depois da seção 5 (Baseline oficial)) a tabela FPS médio/p1, draw calls, triângulos, heap, load.
**Pronto quando:** tabela no diagnóstico; veredito: massa300 ≥ 45 FPS **sim/não**, combate100 ≥ 50 FPS **sim/não**; se não, os 3 maiores custos medidos (alimentam a M5-03).
**Não fazer:** otimizar nesta ficha; regravar `tests/perf/baseline.json` (M1-09).

### M1-04 · Replay online, PWA/carga por facção e save/load em missão
**Dif.** Média · **Esf.** M · **Exec.** S · **Roda:** GPU local · **Dep.:** M0-01
**Objetivo:** fechar F9-05, F10-05 e F2-06 na prática.
**Contexto:** scripts `tools/replay-check.mjs`, `tools/online-check.mjs`, `tools/preview-check.mjs`, `tools/save-load-check.mjs`; docs `docs/09_MULTIPLAYER.md` §12 e `docs/10_DEPLOY.md`.
**Fazer:** rodar os 4 scripts via safe-run; corrigir falhas; **acrescentar** um cenário que salva e carrega no meio de uma missão de campanha (`alliance-03-muralhas-de-alvorada`) e outro que grava e reproduz o replay de uma missão, conferindo checksums.
**Pronto quando:** os 4 scripts passam; os 2 cenários novos passam; defeitos achados corrigidos ou registrados com ficha.

### M1-05 · Quatro correções pequenas
**Dif.** Média · **Esf.** P · **Exec.** S · **Roda:** GPU local · **Dep.:** M0-01
**Contexto e fazer:**
1. **NEW-35:** `src/render/UnitView.js` (~linha 417) sincroniza a animação de ataque só com `state === 'attacking'`; `attackingGround` (cerco atacando o chão, `CMD.ATTACK_GROUND`) roda solto. Sincronizar também nesse estado. Verificação: `tools/ui-captures/revisao-2026-10-11/NEW-35.mjs` (fase média do braço deve ficar próxima do controle).
2. **NEW-52:** `Water.createReeds` coloca juncos fora da área jogável em `continental-1v1`; restringir às posições de água rasa **dentro** da área (`pickReedLocations`). Teste existente: `waterVegetation`.
3. **m04:** `tools/ui-captures/m04-fix/capture.mjs` exige `hp === 1600` no Forte Atalaia, mas ele tem 2200 por `setTier 2` (`src/data/campaigns/alliance/m04-ponte-do-rio-turvo.json:34`); trocar por `hp === maxHp`.
4. **NEW-49:** o check de limiar de velocidade da pose do Arremessador no script do jogo (~22 rad/s) reprova na borda; ajustar o critério ao valor medido (documentar).
**Pronto quando:** cada item tem teste ou captura que passa; `npm test` verde.

### M1-06 · `ilhas-4p` termina em todas as seeds (NEW-55, opções 1 + 3)
**Dif.** Difícil · **Esf.** G · **Exec.** S · **Roda:** Node · **Dep.:** M0-01
**Objetivo:** soak de `ilhas-4p` 24/24 sem mascarar defeito.
**Contexto:** diagnóstico em `docs/TASKS.md` histórico (NEW-55) e nas branches `task/NEW-55-ilhas4p` (3 commits com resultados) e `task/NEW-55-finalizador-exp`. Causas: o mapa gera 45–52 árvores (capacidade ~106; meta de 8000 de madeira é inatingível) e a IA entra em portão de emergência sem recuperação possível (`src/ai/AIDirector.js:332` e `:365-367`).
**Fazer:** (1) **opção 1:** anexar ~100 árvores em florestas ao **fim** do array de `src/data/maps/ilhas-4p.json` (manter a ordem do `rngMap`; medir com `tools/measure-wood.mjs`); (2) **opção 3:** no `AIDirector`, o portão de emergência só dispara quando há recuperação possível (madeira alcançável ou 3 camponeses). **Não** aplicar pareamento de times no soak, nem `assessAttack` sem estimativa, nem regra de estagnação. Opção 5 (finalizador sem madeira) só se 1+3 não bastarem (usar o commit de `task/NEW-55-finalizador-exp`).
**Pronto quando:** `node tools/soak.mjs --count 24 --maps ilhas-4p` termina 24/24; outros mapas `--count 8` sem regressão; `determinism.test.js` e os testes de mapas (`maps.test.js`, `mapsWood.test.js`) verdes (regravar fixtures de checksum **só** do mapa alterado e explicar); relatório com antes/depois.
**Não fazer:** mexer em outros mapas; mudar balanceamento.

### M1-07 · P-14: serraria perto de bosque (NEW-56, opção A)
**Dif.** Fácil · **Esf.** P · **Exec.** S · **Roda:** Node · **Dep.:** M0-01
**Contexto:** a regra P-14 (serraria inicial ≤ 12 u de um bosque) reprova em 7 de 9 mapas pela métrica do **centro** do bosque; pela **borda**, só `bosques-2v2` falha (4 bases, 12,8 a 15,7 u). O teste está em `task/P14-todos-mapas` (salvo na M0-01).
**Fazer:** trazer o teste para `tests/unit/maps.test.js` medindo pela **borda** do bosque (raio do cluster); ajustar posições em `src/data/maps/bosques-2v2.json` (serraria ou bosque) até ≤ 12 u; `node tools/soak.mjs --count 8 --maps bosques-2v2`.
**Pronto quando:** teste novo verde nos 9 mapas; soak do mapa 8/8; checksum do mapa documentado.

### M1-08 · Soak grande, NEW-51 e agressividade inicial da IA (NEW-9)
**Dif.** Média · **Esf.** M · **Exec.** S · **Roda:** Node · **Dep.:** M1-06
**Contexto:** NEW-51: seed 82 (`continental-1v1`, human, brutal) não terminava; após NEW-44/25/34 precisa de amostra grande. NEW-9: a IA destruiu o HQ de um jogador parado em < 240 s nos testes da F2-01. `tools/soak.mjs`, `tools/ai-ladder.mjs`.
**Fazer:** `node tools/soak.mjs --count 30 --recheck 3 --seed-start 82 --maps continental-1v1`; soak amplo (100 partidas, todos os mapas jogáveis); medir o tempo mínimo até a primeira derrota por dificuldade; se Fácil/Normal destroem HQ antes de 6 min, reduzir a agressividade inicial por parâmetro de perfil em `src/ai/` (documentar).
**Pronto quando:** relatório consolidado (`tools/lib/soakConsolidate.mjs`): ≥ 97 % terminam, 0 exceções/NaN/vazamento/divergência; Fácil e Normal não derrubam HQ parado antes de 6 min (ou a causa está registrada).

### M1-09 · Gate M1: baselines e fechamento
**Dif.** Fácil · **Esf.** P · **Exec.** S · **Roda:** GPU local · **Dep.:** M1-01…M1-08
**Fazer:** suíte completa; `npm run smoke`; `bash tools/safe-run.sh --timeout 1800 -- node tools/visual-regress.mjs --update`; `bash tools/safe-run.sh --timeout 900 -- npm run perf -- --update`; `npm run visual` e `npm run perf` de novo (devem passar); relatório lista para o coordenador os itens `REVIEW` que podem virar `DONE`.
**Pronto quando:** tudo verde com a baseline nova; manifesto da baseline atualizado; resumo no relatório.

### M1-10 · G1 — sua passada nº 1 (≈ 1 h)
Lista (eu preparo no dia): tela de história e seletor de campanhas · uma partida em `duelo-continental-1` e outra em `ilha-unica-1` (biomas, lava, javali) · ouvir menu, partida, combate (som posicional, música) · ver o Brann no jogo e no inspetor (`?model=hero_brann_glb`) · jogar 5 min da missão clássica 1 · anotar o que incomoda.

### M1-11 · Renomear facções em UI e campanhas (D2 = b)
**Dif.** Média · **Esf.** M · **Exec.** S · **Roda:** Node · **Dep.:** M0-02 (deve terminar **antes** de M3-02)
**Objetivo:** nenhum texto visível ao jogador usa os termos "Horda" e "Aliança" (par que evoca a marca Warcraft). Nomes novos (escolha do coordenador, veto do dono): **Aliança → "Liga de Aurelan"** (a liga de reinos de Velmara da lore; humano: "Reino de Aurelan" quando for o povo), **Horda → "Clãs do Cinzal"** (a força unificada por Skarn: "a União dos Clãs").
**Contexto:** ocorrências em `src/i18n/pt-BR.json` e `en.json` (ex.: `building.ogre_den.desc`, `unit.hero_vozgul.desc`, `ability.hero_horde_roar.name` "Rugido da Horda", `menu.campaignHint` "Aliança"), regex em `src/ui/uiText.js:114` (mensagem da onda da IA), ~71 ocorrências em `src/data/campaigns/**/*.json` (clássica e novo mundo), `src/data/story/world.json`, `src/data/campaigns/README.md`, comentário em `src/ui/campaignVictoryArt.js`, comentário de crédito em `src/world/Water.js:79` ("Inspired by Warcraft 2": reescrever sem a marca), tests que conferem esses textos. Títulos aprovados mudam: "A Guerra do Mar Fendido: a Marcha da Aliança" → "…: a Marcha de Aurelan"; "o Caminho das Brasas" fica.
**Fazer:** substituir nos textos pt-BR **e** en (en: "Horde"/"Alliance" → "Cinzal Clans"/"Aurelan League"), mantendo ids internos (`war-alliance`, `war-horde`, `orc`, `human`, `grunt`, `peon`); ids de i18n como `ability.hero_horde_roar` ficam (só o valor muda; renomear a habilidade "Rugido da Horda" → "Rugido dos Clãs"); ajustar frases em que o plural/gênero muda; atualizar testes; varrer de novo com `grep -rniE "horda|aliança|horde|alliance"` em `src` e listar o que sobrar e por quê (ex.: ids).
**Pronto quando:** varredura só encontra ids internos e comentários explicativos; `npm test` verde; build ok; relatório com antes/depois da contagem.
**Não fazer:** renomear ids, arquivos de campanha ou chaves de i18n.

---

# M2 — Mundo jogável

## Código e dados

### M2-01 · Âncoras (pontos nomeados) em mapas e missões
**Dif.** Difícil · **Esf.** G · **Exec.** S · **Roda:** Node · **Dep.:** M0-01
**Objetivo:** missões escritas por nome (`landingZone`, `goldMine1`…), não por coordenada.
**Contexto:** mapas JSON em `src/data/maps/*.json`, validação `src/data/maps/validate.js`, gerador `src/data/maps/coast/` e `tools/gen-world-map.mjs`; missões: `src/sim/missions/{schema,actions,MissionRuntime}.js`, formato em `src/data/missions/README.md`; missão-demo `mission-demo`. Motivação: `docs/specs/MUNDO-HISTORIA-CAMPANHA.md` §3.2 (risco de coordenadas contra mapa provisório).
**Fazer:**
1. Campo opcional `anchors: { "<nome>": { "x": n, "z": n, "water"?: bool } }` no formato do mapa; `validateMapDef` confere: dentro da área jogável, terreno compatível (terra por padrão; `water:true` exige água), nome `[a-zA-Z0-9_-]`.
2. Em missões, todo ponto `{x,z}` (spawn, order, area, camera, spawnBuilding, reveal, escort, guard…) passa a aceitar `{ "anchor": "nome", "dx"?, "dz"? }`, resolvido de forma **determinística** no carregamento da missão (`createMissionConfig`/runtime), sem mudar o formato do checksum; âncora inexistente → erro de validação com a mensagem clara (nome, missão, mapa).
3. O gerador/assador exporta âncoras padrão a partir de `startSlots`, `resources`, `neutrals`, `fords`: `playerStart`, `enemyStart`, `ally1`, `goldMine1..n`, `stoneQuarry1..n`, `forest1..n`, `neutralCamp1..n`, `ford1..n`, `well1..n`, `landingZone`.
4. Atualizar `mission-demo` (ou criar `mission-anchors-demo`) usando âncoras; testes: schema, resolução, âncora faltando, mapa sem âncoras (campanha clássica continua igual); README de mapas e de missões.
**Pronto quando:** `npm test` verde; `determinism.test.js` e o checksum de `headless-match --seed 1` **inalterados** (âncora resolvida antes da sim); missão de teste usa âncoras de um mapa gerado; docs atualizados.
**Não fazer:** mudar coordenadas das missões clássicas; alterar o checksum.

### M2-02 · Segundo Centro (Marco da Colônia) e evolução
**Dif.** Média · **Esf.** M · **Exec.** S · **Roda:** Node · **Dep.:** M0-01
**Contexto:** as missões 10–12 criam um "Marco da Colônia" (Centro avançado) por `spawnBuilding` (`src/sim/missions/actions.js`) e o evoluem por `setTier`/`UPGRADE_HQ` (`src/data/tiers.js`, `src/sim/requirements.js` `{hq:N}`). Risco R3 em `MUNDO-HISTORIA-CAMPANHA.md` §8: nunca foi verificado com **dois** Centros do mesmo jogador.
**Fazer:** testes e correções para: jogador com 2 Centros (um criado por `spawnBuilding`); `{hq:N}` usa o maior nível dos Centros vivos; `UPGRADE_HQ` e cancelamento funcionam em qualquer um; população, entrega de recursos, rally e IA não quebram; vitória `regicide` e de missão com 2 Centros; perda de um Centro; HUD (card de evolução) mostra o Centro selecionado. Acrescentar uma missão sintética headless (em `tests/`) que faz o ciclo completo.
**Pronto quando:** testes novos verdes; nenhum comportamento mudou para 1 Centro (checksum de `headless-match --seed 1` inalterado).

### M2-29 · Revide inteligente (troca de alvo por proximidade e por colisão)
**Dif.** Difícil · **Esf.** M · **Exec.** S · **Roda:** Node · **Dep.:** M0-01 · **Origem:** pedido do dono (2026-10-20)
**Problema (relato do dono):** uma unidade atacada revida indo até o atacante. Quando o atacante é um arqueiro atrás de infantaria, a unidade corre até ele; se **outro arqueiro** a atinge no caminho, ela muda de alvo para o novo atacante; e, se houver infantaria à frente, fica **colidindo com a infantaria** tentando chegar ao arqueiro, às vezes até morrer sem atacar ninguém.
**Regras novas (decididas pelo dono):**
1. A unidade atacada **continua** indo revidar o atacante atual.
2. Se **outra** unidade inimiga a atacar, ela só **troca de alvo se o novo atacante estiver mais próximo** que o alvo atual (distância atual, não a de quando foi atingida).
3. Se, durante o deslocamento até o alvo, ela **colidir/ficar bloqueada por uma unidade inimiga**, o alvo passa a ser **essa unidade inimiga** (ela ataca a infantaria que bloqueia o caminho em vez de morrer tentando chegar ao arqueiro). Bloqueio por aliado ou por construção/árvore **não** troca o alvo (segue com a lógica de caminho existente).
**Contexto:** a lógica de revide/aggro está em `src/sim/Unit.js` (`takeDamage`, `lastAttacker`/alvo, `moveTowards`, estados `attacking`/`chasing`), `src/sim/targeting.js` (se existir; veja `docs/02_MECANICAS.md` "Alvos e aggro") e a grade espacial `src/sim/SpatialGrid.js` (colisões e empurrão determinístico por id, F1-06). A IA de micro (`src/ai/AIMicroManager.js`) usa foco de fogo e **não** deve ser afetada além do que esta regra mudar no `Unit`.
**Fazer:** (1) localizar onde o dano dispara o revide e o alvo é substituído; (2) aplicar as regras 2 e 3 de forma determinística (empates por id; sem `Math.random`); (3) a regra 3 usa o resultado da colisão unidade×unidade que a sim já calcula (inimigo na frente que impede o avanço), com um pequeno limiar de bloqueio (ex.: sem progresso por ≥ 0,25 s ou colisão com inimigo no raio de contato) para não oscilar; (4) respeitar ordens do jogador: **ordem explícita de ataque ou movimento nunca é substituída** por esta regra (só o revide automático e o aggro automático); `hold`/`stop` seguem como estão; (5) testes: arqueiro atrás de infantaria (alvo troca para a infantaria ao colidir), segundo arqueiro mais longe (não troca) e mais perto (troca), ordem do jogador preservada, determinismo (2 execuções, mesmo checksum); (6) atualizar `docs/02_MECANICAS.md`.
**Pronto quando:** os testes novos passam; `determinism.test.js` verde; o checksum de `node tools/headless-match.js --seed 1` **muda** (esperado, registre o valor novo) e permanece igual em 2 execuções; soak `--count 24` em 3 mapas sem aumento de partidas que não terminam; `npm run lint` e build ok. Se aparecer oscilação de alvo (ping-pong) nos soaks, ajuste o limiar e relate.
**Não fazer:** mexer em ordens do jogador, no `AIMicroManager` (exceto se um teste existente quebrar por esta regra: então relate), nem em números de balanceamento.

### M2-28 · Carregar mapas de campanha sob demanda
**Dif.** Difícil · **Esf.** M · **Exec.** S · **Roda:** GPU local (bundle/boot) · **Dep.:** M2-03 (deve terminar **antes** de M2-04)
**Objetivo:** os 16 mapas de campanha (97–135 KB de JSON cada, ~2 MB no total) não entram no bundle de boot nem no `perf`.
**Contexto:** `src/data/maps/index.js` importa cada mapa estaticamente (`import camp01 from './camp-01-baia-de-aurelan.json'`) e `getMap(id)` é síncrono; `MatchConfig`, `Terrain`, `MissionRuntime` e o menu dependem disso. Orçamento: `npm run perf` (bundle principal ≈ 530 kB, JS de boot ≈ 2,66 MB), `docs/10_DEPLOY.md`.
**Fazer:** (1) mapas com `campaignOnly`/prefixo `camp-` viram *chunks* carregados por `import()`/`import.meta.glob` (lazy) e registrados em `MAPS` só depois do carregamento; (2) uma função assíncrona `loadMap(id)`/`ensureMapLoaded(id)` chamada antes de criar a partida de campanha (`MissionController`/`createMissionConfig`) e pelo editor; (3) `getMap` continua síncrono para mapas já carregados e lança erro claro para um mapa lazy ainda não carregado; o menu de Escaramuça não os lista (já são `hidden`); (4) testes: carregar, erro quando não carregado, ids do registro; os testes que usam `getMap('camp-…')` chamam `await loadMap`; (5) medir `npm run perf` antes/depois: bundle principal e JS de boot devem **não crescer** com os mapas novos; PWA/Service Worker: confirmar que os chunks entram no pré-cache ou carregam online sem quebrar o offline (`tools/preview-check.mjs`).
**Pronto quando:** `npm test` verde; `headless-match` inalterado; bundle de boot sem os `camp-*`; a missão `mission-anchors-demo` e uma partida em `camp-03-pedra-mae` abrem no jogo; perf dentro de ±10 %.

### M2-03 … M2-07 · Mapas de campanha (16 mapas em 5 lotes)
**Dif.** Difícil · **Esf.** G cada · **Exec.** S · **Roda:** Node (prévias em PNG) · **Dep.:** M2-01 (M2-04…07 também M2-03)
**Objetivo:** os 16 palcos da campanha como mapas jogáveis, com contorno irregular, bioma certo, âncoras e recursos.
**Receita comum (vale para os 5 lotes):**
- **Ler:** `docs/specs/MUNDO-TERRENO-MAPAS.md` §2 (costa irregular), §3.5–3.6 (lava e **matriz ilha → bioma → divisores → bases**), §5 (fauna); `docs/specs/MUNDO-HISTORIA-CAMPANHA.md` §1.2/§1.6 (descrição de cada palco), §3.2 (tabela dos 12 palcos) e a **ficha da missão** (§3.6 Aliança, §3.7 Horda) para saber o que cada missão exige do mapa (recursos, ilhotas, petróleo, vaus, acampamentos, onde pousa o inimigo); `src/data/maps/README.md`; ferramentas `tools/gen-world-map.mjs`, `src/data/maps/coast/` (presets), `tools/measure-wood.mjs`, `tools/soak.mjs`; exemplos prontos: `duelo-continental-1.json`, `ilha-unica-1.json`.
- **Gerar** com o assador (sementes escolhidas a olho nas **prévias PNG**); tamanho 96–192 conforme a função (campanha é isenta do mínimo 168); `biomeGrid` e tileset conforme a matriz; lava (Fornalha) e rios como divisores com passagem; fauna por bioma.
- **Recursos:** ouro 7.500 por mina (padrão do MUNDO-7); madeira alcançável ≥ 8.000 por jogador ao alcance de 60 u (`measure-wood`) — exceção documentada nas ilhas pedregosa/gelada/deserta, onde a ficha pede pouca madeira (aí garantir o mínimo que a missão exige); petróleo onde a ficha pede (Baixio do Breu).
- **Âncoras:** padrão (M2-01) + as que a ficha da missão cita.
- **ids:** `camp-<palco 2 dígitos>-<slug>` (ex.: `camp-03-pedra-mae`, `camp-01-baia-de-aurelan`, `camp-10-costa-ferrugem`). `hidden: true` em `src/data/maps/index.js` (não aparecem na lista da Escaramuça).
- **Testes:** `validateMapDef` 0 erros e 0 avisos; flood fill terrestre e naval entre os pontos que a missão usa; estender `tests/unit/maps.test.js`/`mapsWood`; **soak** IA×IA de 2 jogadores `--count 8` termina 8/8 (nos mapas com ≥ 2 vagas); `npm run smoke` carrega cada mapa.
- **Prévias:** salvar PNG de cada mapa em `docs/refs/mundo/previews/campanha/<id>.png` (para o G2).
**Pronto quando:** os mapas do lote passam em tudo acima; prévias geradas; i18n `map.<id>.name` em pt-BR/en; README de mapas atualizado.
**Não fazer:** substituir mapas antigos (as 8 missões clássicas continuam neles); gerar mapas navais "dois-continentes/arquipélago-vivo".

| Lote | Palcos (ids) | Particularidades |
|---|---|---|
| **M2-03** | 1 Baía de Aurelan (Aliança, `camp-01-baia-de-aurelan`) · 2 Pouso do Encontro (`camp-02-pouso-do-encontro`) · 3 Pedra-Mãe (`camp-03-pedra-mae`) | 1: continental exuberante, costa turquesa, enseadas, acampamento neutro (bandidos). 2: temperada com praias, farol em ruínas ("Torre da Fenda"), forte de troncos para resgate, **Cais** para escolta. 3: pedregosa, ouro abundante, rochedos/platôs, 3 pontos de pouso no mar para as ondas |
| **M2-04** | 4 Baixio do Breu (`camp-04-baixio-do-breu`) · 5 Cerne Verde (`camp-05-cerne-verde`) · 6 A Geada (`camp-06-a-geada`) | 4: recifes (quase só água rasa e funda), **poços de petróleo**, naufrágios, espaço para Estaleiro. 5: florestal densa, clareiras, bosque sagrado, ninho de grifos. 6: gelada (gelo **não navegável**), lagos congelados, Farol Boreal, 3 vagas (jogador, 2 IAs) + base de aliado de IA |
| **M2-05** | 7 Brejo Mudo (`camp-07-brejo-mudo`) · 8 Fornalha (`camp-08-fornalha`) · 9 Miragem (`camp-09-miragem`) | 7: pantanosa (chão lento só visual), 2 bases (jogador/aliado traidor). 8: vulcânica 96–128 u, **rios de lava** com passagens de rocha, forja e santuário. 9: deserta, **3 poços**, ruínas, cabeça de ponte |
| **M2-06** | 10 Costa Ferrugem (`camp-10-costa-ferrugem`) · 11 Estepe do Vento (`camp-11-estepe-do-vento`) · 12 Cabo Ferrugem (`camp-12-cabo-ferrugem`) | **continente orc (Cinzara)**, vistos pela Aliança: 10: costa com praia de desembarque (`landingZone`) e barcaças; 11: interior seco/savana, espaço para o Marco da Colônia **Porto Albor** + hordas; 12: promontório com **estreito** entre o continente e as ilhas (zona de bloqueio de 90 s), 3 docas inimigas |
| **M2-07** | 1 Praia das Cinzas Vermelhas (Horda, `camp-01-praia-das-cinzas`) · 10 Cabo Aurora (`camp-10-cabo-aurora`) · 11 Savana de Âmbar (`camp-11-savana-de-ambar`) · 12 Cabo Aurora, ponta leste (`camp-12-cabo-aurora-leste`) | 1: continental desértico (casa dos clãs). 10–12: **continente humano (Velmara)** vistos pela Horda; mesma lógica de desembarque, colônia **Brasa-Alta** e estreito. Se o tempo apertar, propor na prévia reaproveitar a geometria dos lotes da Aliança com outro tileset (decisão do coordenador no G2) |

### M2-08 · Mapa-múndi ligado à tela de campanha
**Dif.** Média · **Esf.** M · **Exec.** S · **Roda:** GPU local · **Dep.:** M1-01
**Contexto:** `src/ui/worldMap.js` + `worldMap.css` + `src/data/campaigns/world-map.json` existem e têm testes, mas **nenhuma tela os importa**; `src/ui/screens/CampaignScreen.js` é a lista de missões; arte em `public/art/world/mapa-mundi.(png|jpg)` com **texto em inglês gravado** (decisão D5); o CSS usa `/art/world/…` fixo e o jogo roda em `/warpoly/` (usar `import.meta.env.BASE_URL`, como em `CampaignStory.js`). Spec: `MUNDO-TERRENO-MAPAS.md` §4.
**Fazer:** montar o mapa-múndi como fundo da lista de 12 missões, com marcador por missão (estados: concluída, atual, bloqueada) e nome da ilha; teclado e leitor de tela; responsivo 1024→4K; i18n; slot de arte final (se existir `public/art/world/mapa-mundi-clean.webp`, usar no lugar; senão, usar o atual com **cartela cobrindo a faixa de título**, ver D5); fonte serifada OFL (Cinzel) via Google Fonts ou local conforme regras do projeto.
**Pronto quando:** abrir Campanha mostra o mapa com os 12 marcadores certos nas duas campanhas; funciona em `/` e em `/warpoly/`; teste de modelo + captura em 3 resoluções; 0 erro de console.

### M2-09 · Editor: pincéis de lava, bioma e passagem
**Dif.** Média · **Esf.** M · **Exec.** S · **Roda:** GPU local · **Dep.:** M2-03
**Contexto:** `editor.html` + `src/editor/` (modelo puro `mapModel.js`); `lavaGrid` (`src/data/maps/lava.js`), `biomeGrid` (`src/data/maps/biome.js`); spec `MUNDO-TERRENO-MAPAS.md` §7 passo 7.
**Fazer:** pincéis de lava, passagem de rocha (vau na lava), bioma por região, "regenerar costa" a partir de preset+semente, export/import do `biomeGrid` e `lavaGrid`, avisos do validador na tela; desfazer/refazer; i18n; testes do modelo puro.
**Pronto quando:** abrir `camp-08-fornalha` no editor, pintar lava+passagem, exportar e reimportar sem diferença (round-trip testado).

### M2-10 · Espécies de árvore novas nos mapas (ART-02)
**Dif.** Média · **Esf.** M · **Exec.** S · **Roda:** GPU local · **Dep.:** M0-01
**Contexto:** `tree_broad.glb`, `tree_palm.glb`, `tree_acacia.glb` existem (`public/models/`, `lazy: true` em `src/entities/glbModels.js`) mas não são `species` válidas nos mapas. Referência de como a bétula foi ligada: `tests/unit/treeManagerBirch.test.js`, `src/world/TreeManager.js` (tipos criados sob demanda), `src/data/maps/validate.js`.
**Fazer:** aceitar `broad|palm|acacia` como `species` (validador, editor, i18n, `spawnCluster` do `generator.js`, `coast/layout`, `decorPlan` por bioma: palmeira na costa/deserto, acácia na savana, copa larga no exuberante); palmeira com copa fora do pé: ajustar LOD/impostor e o *hit-proxy* de seleção/colisão; teste análogo ao da bétula.
**Pronto quando:** teste novo verde; um mapa de bioma usa as espécies e aparecem no jogo; draw calls sobem ≤ +4 por tipo (medir com `?bench=inicial`); captura.

### M2-11 · IA de chefes: habilidades de herói na IA
**Dif.** Difícil · **Esf.** M · **Exec.** S · **Roda:** Node · **Dep.:** M0-01
**Contexto:** `src/ai/AIMicroManager.js` (`_castSpells` ~L403, `_planCast` ~L422) lança magias de conjuradores por tipo; os 6 heróis (`src/data/units.js` `hero_*`) têm 18 habilidades (`src/data/abilities.js`, efeitos em `src/sim/abilities.js`, incluindo `status` em área aliada `radius/allies` e `channel`). Chefes de missão (Skarn/Dorian/Drogath… do lado inimigo) serão criados por `spawn` com `guard`/ondas (F5-06). Não há `hero_` em `src/ai`.
**Fazer:** garantir que a IA usa as 18 habilidades de forma sensata (buff em área quando há ≥ 3 aliados em combate; dano em área em aglomerados; cura/estandarte com aliados feridos; canalização só sem inimigo adjacente); teste por herói: cenário simples em que a IA lança ≥ 1 vez; sem `Math.random`; documentar.
**Pronto quando:** testes verdes; `headless-match` sem exceção; relatório com a tabela herói → habilidade → condição de uso.

## Arte (Blender) — regras da regra 6 do Preâmbulo valem para todas

### M2-12 · Props de arenito e arbusto rolante enxuto
**Dif.** Média · **Esf.** M · **Exec.** SB · **Dep.:** M0-01
**Contexto:** ART-01 (arenito, 2 variantes com estratos) e ART-03 (redução de triângulos do `tumbleweed`). Script modelo: `tools/blender/build_props_rochas_cactos.py` (granito, cactos, ossada); doc `docs/reference/art-p0-*`.
**Fazer:** `rock_sandstone_a/b.glb` (estratos horizontais, topo mais claro, ≤ 1 draw call, ≤ 600 tris cada); reduzir `tumbleweed.glb` mantendo a silhueta; registrar (`lazy: true`), inspetor, baseline dos alvos novos.
**Pronto quando:** inspetor mostra os 3 modelos; capturas no jogo em mapa deserto; orçamento atendido.

### M2-13 · Javali completo, Cercado de Javalis e ícones de bioma
**Dif.** Média · **Esf.** G · **Exec.** SB · **Dep.:** M0-01 (ART-04-escala mesclado)
**Contexto:** `critter_boar.glb` existe (6 draw calls, ×1,4, decisões tomadas), mas o jogo usa `src/models/units/CritterModel.js` procedural via `src/render/CritterView.js`; `pig_farm` ainda tem modelo e nome de porco; ícone `public/icoJavali.png`. Spec: `MUNDO-TERRENO-MAPAS.md` §5/ART-04/ART-12.
**Fazer:** animações andar/pastar/correr no GLB (nós animáveis simples) e ligá-lo ao `CritterView` (procedural vira fallback); `pig_farm.glb` → **Cercado de Javalis** (modelo e nome pt-BR/en: "Cercado de Javalis"/"Boar Pen"; ids internos ficam); ícones `biome.*` para a UI de mapa/editor se existirem referências.
**Pronto quando:** javali com `.glb` animado em campo no jogo e no inspetor; cercado novo visível; testes de `critters` e de i18n verdes; draw calls do cercado ≤ 20.

### M2-14 · Props vulcânicos e material de lava
**Dif.** Média · **Esf.** G · **Exec.** SB · **Dep.:** M0-01
**Contexto:** ART-06. O **render** da lava (emissivo, UV animado) já foi mesclado (MUNDO-5: `src/models/environment/lavaTextures.js`, `src/data/lavaRender.js`); faltam os props.
**Fazer:** rocha de basalto colunar (2 variantes), cone/cratera pequeno, árvore queimada, fumarola (malha base; o vapor é da M2-18), obsidiana; `.glb` ≤ 4 draw calls cada; registro e inspetor.
**Pronto quando:** props aparecem em `camp-08-fornalha` (ou mapa de teste vulcânico) e no inspetor; coerentes com a paleta de `biomeStyles.js`.

### M2-15 · Props de gelo
**Dif.** Média · **Esf.** M · **Exec.** SB · **Dep.:** M0-01
**Fazer (ART-07):** bloco de gelo/iceberg (2 tamanhos), pinheiro nevado (reusar `tree_pine` com neve), rocha com neve; `.glb` leves; registro/inspetor.
**Pronto quando:** aparecem em mapa de inverno/gelado e no inspetor.

### M2-16 · Água, costa e praia
**Dif.** Média · **Esf.** G · **Exec.** S + SB · **Dep.:** M0-01
**Contexto:** ART-08/09. Código: `src/world/Water.js` (espuma já em 1 draw call; `texq=low` estática); props de costa.
**Fazer:** água turquesa por bioma com gradiente raso→fundo; espuma de onda discreta; lagoa de pântano; props de praia (conchas, estrela-do-mar, caniço, barco naufragado) como `.glb` leves e/ou instâncias; dentro do orçamento (`npm run perf`).
**Pronto quando:** capturas antes/depois em 2 biomas; draw calls +≤ 4; `texq=low` continua barato.

### M2-17 · Sub-bosque e pântano
**Dif.** Fácil · **Esf.** M · **Exec.** SB · **Dep.:** M0-01
**Fazer (ART-10):** samambaia, tronco caído, tronco afogado, raiz de mangue; leves; usados por `decorPlan` nos biomas exuberante/pântano.
**Pronto quando:** visíveis nos mapas respectivos; orçamento atendido.

### M2-18 · Efeitos ambientais
**Dif.** Média · **Esf.** M · **Exec.** S · **Dep.:** M2-14
**Contexto:** ART-11; `src/render/vfx/` (3 draw calls: solid/smoke/glow; níveis `off|low|med|high`).
**Fazer:** poeira (deserto), cinzas e brasas (vulcânico), vapor de fumarola, nevasca leve (gelo), vapor e luz da lava, **som** de lava (ambiência) e cor da lava no minimapa; só em `quality ≥ med`.
**Pronto quando:** efeitos visíveis nos mapas respectivos; FPS dentro de −3 % no bench; `?vfx=off` os desliga.

### M2-19 · Texturas de terreno por bioma (condicional)
**Dif.** Média · **Esf.** M · **Exec.** SB · **Dep.:** M1-01 (só executar se o relatório da M1-01 reprovar a pintura procedural)
**Fazer (ART-05):** texturas/ruídos de albedo para deserto, exuberante, savana e vulcânico (≤ 512²), integradas ao splat regional; comparação antes/depois.
**Pronto quando:** G2 aprova o visual dos biomas.

## Heróis (Blender; produção conforme D4)

Cada ficha M2-20…M2-24 tem a mesma estrutura:
**Dif.** Difícil · **Esf.** G · **Exec.** SB · **Dep.:** o dono entrega o `.blend` com rig em `docs/reference/heroi-<id>/` (D4 respondida: não há Tripo nem modelagem do zero)
**Contexto comum:** ficha de aparência/silhueta/paleta/arma/postura em `docs/specs/MUNDO-HEROIS.md` (§4 Oren, §5 Dorian, §6.1 Drogath, §6.2 Vozgul, §6.3 Skarn); dados em `src/data/units.js` (`hero_*`: `modelOf` provisório, `scaleMul`) e `src/data/heroes.js`; **modelo de referência já feito:** `tools/blender/build_hero_brann.py` + `docs/reference/heroi-brann-tripo.md` (FBX do Tripo → rig do jogo: ossos `Left*/Right*`→`ArmL/ArmR/LegL/LegR`, nós `Torso/Head/ArmL/ArmR/LegL/LegR/Sword/Cape`, pivôs, tampas, textura 4096²→512², `TeamColor` só em capa/estandarte, escala e origem); animações vêm do `UnitAnimator` por nós (tipo-base em `glbModels.js`: `knight`, `mage`, `grunt`, `ogre`). Retratos: `tools/blender/render_portraits.py` (+ `ui_specs.py`, `ui_sheet.py`) e ícones `render_icons.py`; retratos atuais são SVG provisórios `public/ui/heroes/<id>.svg`.
**Entrada do dono (analisada em 2026-10-17):** FBX do Tripo em `/home/rafael/Downloads/Oren/` e `/home/rafael/Downloads/Drogath/` (pasta `.fbm` com 4 mapas PBR). Cada um: 1 malha (Oren 18,5 mil tris e 1 ilha só; Drogath 18,8 mil tris e 2 ilhas) + armature Mixamo de 65 ossos sem ações; textura 1024² (Oren) e 512² (Drogath); frente em −Y do Blender (vira +Z no glTF). Oren está em T-pose, com cajado na mão direita anatômica e túnica longa que cola as pernas (a saia vai para o Torso e só botas viram `LegL/LegR`). **Drogath não está em T-pose:** machado sobre o ombro, braço direito levantado; é preciso **reposar pelo rig** (braço pendente) antes de cortar, e o machado, soldado à mão, é cortado por pesos/geometria. **A primeira ficha M2 de herói (a que o coordenador disparar primeiro) deve extrair de `build_hero_brann.py` uma biblioteca `tools/blender/hero_common.py`** (importar FBX, reposar por rig, segmentar por pesos, cortes planos com tampas, baixar textura, hierarquia plana, export, prévias) para que os demais heróis só tenham um arquivo curto de constantes.
**Fazer:** (1) converter o `.blend` do dono (mesh + armature + pesos) com um `build_hero_<id>.py` análogo ao do Brann: cortar a malha pelos pesos em nós rígidos nomeados, tampas, escala/origem/eixo (+Z frente), textura ≤ 512², `TeamColor`; pedir ao dono o que faltar (partes soltas de capa/arma/estandarte/coroa; nó novo `Banner`/`Crown` exige registro em `ModelFactory.rebindUserData` e `UnitAnimator`); (2) exportar `public/models/hero_<id>.glb`; (3) registrar em `src/entities/glbModels.js` (`root`/`type` do tipo-base) e trocar `modelOf` em `units.js` se necessário; (4) renderizar retrato (idle/ataque) e ícone e atualizar `public/ui/manifest.json`; remover o SVG provisório; (5) entrada no inspetor; (6) conferir pose de idle, andar, ataque e **lançar magia** (`cast`) sem fatias nem artefatos nos ombros; (7) baseline visual dos alvos novos.
**Pronto quando:** ≤ 20 draw calls, textura ≤ 512², rosto só em +Z, arma com gume para +Z, `TeamColor` funciona; capturas no jogo e no inspetor; retrato aparece na HUD (anel dourado); `heroes.test.js` e `uiSprites.test.js` verdes.
| Ficha | Herói | Tipo-base | Observações |
|---|---|---|---|
| M2-20 | **Dorian Vasques** (Comandante humano) | `knight` | armadura pesada; estandarte; aparece como **chefe** na campanha da Horda |
| M2-21 | **Oren** (Mestre Arcano) | `mage` | cajado/orbe; capa; silhueta simples |
| M2-22 | **Drogath Punho-de-Brasa** (Capitão orc) | `grunt` | machado/punho de brasa; primeira aparição na Horda m3 |
| M2-23 | **Vozgul, a Profetisa** | `mage`/`necromancer` | cajado de osso, véu; magos orcs |
| M2-24 | **Skarn** (chefe-de-brasa, Comandante orc) | `ogre` | martelo da Coroa; chefe final da Aliança |

### M2-25 · G2 — sua passada nº 2 (≈ 1 h)
Lista: **aprovar as prévias PNG dos 16 mapas** (`docs/refs/mundo/previews/campanha/`): legibilidade, equilíbrio de rotas, costa bonita? · ver os props novos e os 6 heróis no inspetor · escolher sementes alternativas se algo não agradar (eu regero).

---

# M3 — Campanha da Aliança

### M3-01 · Harness de qualidade das 24 missões
**Dif.** Difícil · **Esf.** M · **Exec.** S · **Roda:** Node · **Dep.:** M2-01
**Objetivo:** um piso de qualidade automático, antes de escrever os roteiros.
**Contexto:** hoje só o **registro** das 24 missões é testado (`tests/unit/campaignSelector.test.js`, `campaignAlliance.test.js` para a clássica). Esqueletos gerados por `tools/scaffold-campaigns.mjs`. Testes de jogo-completo da clássica: `tests/unit/campaignPlaythrough.test.js`. Spec: `MUNDO-HISTORIA-CAMPANHA.md` §7.6 e §8 passo 9.
**Fazer:** `tests/unit/campaignWorld.test.js` que, para cada missão de `war-alliance` e `war-horde`, verifica: `validateMission` sem erros; objetivos primário + secundário + oculto; ≥ 1 cutscene de abertura; ≥ 6 diálogos bilíngues; briefing + ≥ 2 dicas; mapa = `camp-…` (não um mapa antigo); posições por âncora (nenhuma coordenada solta em `spawn/order/area`); heróis só **depois** de liberados (`unlocks.heroes`); `unlocks` consistentes com a tabela de `MUNDO-HISTORIA-CAMPANHA.md` §4.2/4.3; carry-over; tamanho mínimo do JSON (≥ 6 KB) como cheiro de esqueleto. Um *marcador de pendência*: cada missão ainda esqueleto fica numa lista `PENDING` no teste (falha ao tentar remover da lista sem cumprir) — assim o teste passa hoje e endurece a cada missão. E um **harness de playthrough**: função que roda a missão headless com um roteiro de comandos (como `campaignPlaythrough.test.js`) e devolve vitória/derrota, ticks e checksum; documentado para ser reusado pelas fichas seguintes.
**Pronto quando:** `npm test` verde com as 24 na lista `PENDING`; documentação curta (`src/data/campaigns/README.md`, "Escrever uma missão do Novo Mundo").

### Template das missões (M3-02…M3-13 e M4-01…M4-12)
**Dif./Esf.:** na tabela da §7. **Exec.** S · **Roda:** Node (+ GPU local para a captura final)
**Objetivo:** transformar o esqueleto da missão numa missão **completa e jogável** conforme a ficha.
**Ler:** `src/data/missions/README.md` (formato e ações), `src/sim/missions/schema.js` (tipos válidos), `src/data/campaigns/README.md`; **exemplares completos** da campanha clássica: `src/data/campaigns/alliance/m04-ponte-do-rio-turvo.json` (escolta, `spawnBuilding`, `markColor`), `m06-ilhas-de-brasa.json` (2 IAs + aliado), `m07-traicao-presa-negra.json` (traição por `setTeam`), `m08-queda-do-cinzal.json` (chefe, ondas, cutscene final); **a ficha da missão**: `docs/specs/MUNDO-HISTORIA-CAMPANHA.md` §3.6 (Aliança) ou §3.7 (Horda); heróis: `docs/specs/MUNDO-HEROIS.md` §2 (quando entram e como aparecem do outro lado); liberação: `campaign.json` da campanha (já tem `unlocks`).
**Fazer:**
1. Sobrescrever `src/data/campaigns/<war-alliance|war-horde>/mNN-*.json` mantendo `id` e `title`; trocar `mapId` para o mapa `camp-…` da §7 e usar **âncoras** para toda posição.
2. Objetivos **primário, secundário e oculto** exatamente como a ficha; `failWhen` coerentes (herói âncora morto, Centro caído etc.).
3. **Cutscene de abertura** por keyframes de câmera (Esc pula), 3–5 diálogos de briefing/meio/fim em **pt-BR e en**, tom da spec (conflito nas ações, não violência explícita); "Novo nesta missão" (mecanismo F8-05b) quando a missão libera algo.
4. Inimigos por **dados** (IA de campanha F5-06: `guard`, ondas, ataques por gatilho). **Naval:** a IA não cruza o mar; frotas inimigas são **roteiros** (`spawn` + `order` em gatilhos de tempo). Heróis jogáveis: `spawn` quando liberados; chefes: `spawn` do herói inimigo com guarda.
5. `startingResources`, `setTier` e variáveis conforme a ficha; duração-alvo da ficha (10–25 min) — calibrar com ondas e recursos.
6. Registrar no teste da M3-01: **tirar a missão da lista `PENDING`** e acrescentar o roteiro de playthrough (vence; também um roteiro que perde).
7. Captura/verificação: abrir a missão no jogo via `?campaign=unlock` e checar briefing, cutscene, painel de objetivos e fim (script de `tools/ui-captures/` análogo ao `m04-fix/capture.mjs`).
**Pronto quando:** `validateMission` sem erros; harness M3-01 passa a missão **sem** `PENDING`; playthrough headless vence em ≤ 2× a duração-alvo e perde no roteiro de derrota; `determinism` e checksum estáveis em 2 execuções; textos bilíngues; captura OK; `npm test` verde.
**Não fazer:** usar mapa antigo; coordenadas soltas; `Math.random`; nomes/lore Blizzard; mexer em `campaign.json` (ordem/`unlocks`) sem registrar o motivo; alterar a campanha clássica.

### M3-14 · Textos finais, epílogo, retratos de NPC e arte de vitória (Aliança)
**Dif.** Média · **Esf.** M · **Exec.** S + SB · **Dep.:** M3-13
**Contexto:** epílogo rascunhado em `MUNDO-HISTORIA-CAMPANHA.md` §6.2 (já em `campaign.json`); tela `src/ui/screens/CampaignVictory.js` (slot `public/ui/art/victory_human.webp`, ver D5); diálogos usam emoji como retrato; retratos de herói/unidade em `public/ui/portraits/` (`tools/blender/render_portraits.py`).
**Fazer:** revisão de coerência e de ortografia pt-BR/en das 12 missões e do epílogo; **retratos de NPC** (Sevelin, Orsolo, Lyra, Mervane, Tomás Rocha, Elara Pinheiral, Brumar…) renderizados no Blender a partir dos modelos existentes (busto com variação de cor/adereço) e usados nos diálogos no lugar do emoji; integrar `victory_human.webp` se o dono já entregou (D5), senão manter o SVG procedural.
**Pronto quando:** diálogos mostram retrato (com fallback a emoji); tela final mostra o epílogo completo nos 2 idiomas; teste de i18n de paridade pt-BR/en verde.

### M3-15 · G3 — você joga as 12 missões (≈ 4–5 h)
Entrego uma planilha com: missão, duração-alvo, objetivos, o que observar. Você anota duração real, dificuldade (fácil/ok/difícil), bugs, texto confuso, momento de tédio.

### M3-16 · Ajustes pós-playtest da Aliança
**Dif.** Média · **Esf.** M · **Exec.** S · **Dep.:** M3-15
**Fazer:** transformar as anotações do G3 em correções (ondas, recursos, duração, textos, bugs); cada correção com teste de playthrough ajustado.
**Pronto quando:** todas as anotações têm resposta no relatório; suíte verde; você reconfirma só as missões mexidas.

---

# M4 — Campanha da Horda
O **Template** acima vale para M4-01…M4-12. Antes de começar: M3-13 `DONE` (padrão de qualidade provado), M2-07 (mapas da Horda) e M3-15 (lições do G3). **M4-13** = igual à M3-14 (epílogo da Horda em `MUNDO-HISTORIA-CAMPANHA.md` §6.2; retratos de Drogath/Vozgul/Skarn e NPCs: Ulma, Hurgan, Grok, Brakka…; arte `victory_orc.webp`). **M4-14** = G4 (você joga) + ajustes.

---

# §7 — Tabela das 24 missões (Template: M3-02…M3-13 Aliança · M4-01…M4-12 Horda)

**Aliança (`war-alliance`)**: ficha em `MUNDO-HISTORIA-CAMPANHA.md` §3.6
| Ficha | Missão | Mapa (M2) | Mecânica-chave a implementar | Herói | Dif./Esf. |
|---|---|---|---|---|---|
| M3-02 | 1 · Terra à Vista | `camp-01-baia-de-aurelan` (M2-03) | Quartel, treino 3 `knight` + 4 `archer`, destruir acampamento neutro, ouro 500, Mural da Fenda oculto, cutscene da vela | — | Média/M |
| M3-03 | 2 · O Pouso do Encontro | `camp-02-pouso-do-encontro` (M2-03) | `rescue` 4 pescadores + `escort` ao Cais, Ferraria + pesquisa, **poupar o Emissário** (honra), patrulha leve | — | Média/M |
| M3-04 | 3 · Ouro da Pedra-Mãe | `camp-03-pedra-mae` (M2-03) | `survive` 7 min contra ondas (Barcaças), 2 torres + 6 muralhas, 4 `cavalier`, pesquisa antes da 3ª onda, cerco inimigo | **Brann** | Difícil/G |
| M3-05 | 4 · O Baixio do Breu | `camp-04-baixio-do-breu` (M2-04) | Estaleiro, 2 Plataformas + Petroleiro, **frota inimiga roteirizada**, 3 Galés, aliado Estrela-d'Alva aos 5 min, não perder Fragata | Brann | Difícil/G |
| M3-06 | 5 · O Cerne Verde | `camp-05-cerne-verde` (M2-04) | 2000 madeira, destruir o Salão do Bosque, 2 `mage` + `gryphon_rider`, Templário oculto, cameo do Oren com 2 magos aliados | Brann | Média/M |
| M3-07 | 6 · A Geada (**Prova de Fogo**) | `camp-06-a-geada` (M2-04) | **árvore completa liberada**; 2 IAs + aliado de IA cujo forte não pode cair; gelo não navegável | Brann | Difícil/G |
| M3-08 | 7 · O Brejo Mudo | `camp-07-brejo-mudo` (M2-05) | **traição** do aliado Mervane/orc por `setTeam` aos 330 s (copiar o padrão da clássica m07), sobreviver e destruí-lo | Brann | Média/M |
| M3-09 | 8 · A Fornalha | `camp-08-fornalha` (M2-05) | resgate de magos cativos; **lava** como divisor com passagem; morte narrativa de Orsolo em diálogo; Vozgul cameo | Brann | Difícil/G |
| M3-10 | 9 · Miragem | `camp-09-miragem` (M2-05) | cabeça de ponte; controlar 3 poços; contra-ofensiva de Grok; frota roteirizada | Brann | Difícil/G |
| M3-11 | 10 · Desembarque na Costa Ferrugem | `camp-10-costa-ferrugem` (M2-06) | travessia por **Barcaças** (`LOAD/UNLOAD`), **Marco da Colônia** (`spawnBuilding`, M2-02) | Brann + **Oren** | Difícil/G |
| M3-12 | 11 · Porto Albor | `camp-11-estepe-do-vento` (M2-06) | colônia sob cerco; Marco evoluído; reforços por mar; economia sob ataque | Brann + Oren + **Dorian** | Difícil/G |
| M3-13 | 12 · O Bastião do Cabo Ferrugem | `camp-12-cabo-ferrugem` (M2-06) | **3 atos**: Centro → nível 3 + 4 torres + 8 muralhas + 2 balistas; **bloquear o estreito 90 s** destruindo 3 docas; ataque final do chefe **Skarn** com guarda (M2-11); epílogo | os três | Muito difícil/GG |

**Horda (`war-horde`)**: ficha em `MUNDO-HISTORIA-CAMPANHA.md` §3.7; mesmo mapa das ilhas (os palcos 2–9 são compartilhados), com lados invertidos
| Ficha | Missão | Mapa (M2) | Mecânica-chave a implementar | Herói | Dif./Esf. |
|---|---|---|---|---|---|
| M4-01 | 1 · Cinzas Vermelhas | `camp-01-praia-das-cinzas` (M2-07) | economia, Acampamento de Guerra, saqueadores neutros, mural, velas brancas | — | Média/M |
| M4-02 | 2 · Velas Brancas | `camp-02-pouso-do-encontro` (M2-03) | resgate de batedores + escolta, primeiro contato, Forja | — | Média/M |
| M4-03 | 3 · A Pedra que Brilha | `camp-03-pedra-mae` (M2-03) | **assalto** à colônia mineira (a Aliança defende); Ogros e cerco | **Drogath** | Difícil/G |
| M4-04 | 4 · Maré de Breu | `camp-04-baixio-do-breu` (M2-04) | Doca, petróleo, frota roteirizada | Drogath | Difícil/G |
| M4-05 | 5 · Madeira de Guerra | `camp-05-cerne-verde` (M2-04) | madeira; necromantes e serpes; cameo de Vozgul | Drogath | Média/M |
| M4-06 | 6 · Fogo no Gelo (**Prova de Fogo**) | `camp-06-a-geada` (M2-04) | árvore completa; 2 IAs + aliado | Drogath | Difícil/G |
| M4-07 | 7 · Casa no Brejo | `camp-07-brejo-mudo` (M2-05) | defender o brejo; **traição de Hurgan** | Drogath | Média/M |
| M4-08 | 8 · O Monte Caldeira | `camp-08-fornalha` (M2-05) | defender a forja até o rito de Vozgul; lava | Drogath | Difícil/G |
| M4-09 | 9 · O Último Poço | `camp-09-miragem` (M2-05) | cabeça de ponte; contra-ofensiva de Dorian; morte narrativa de Ulma | Drogath | Difícil/G |
| M4-10 | 10 · Cabo Aurora | `camp-10-cabo-aurora` (M2-07) | travessia por barcaças; Marco da Colônia **Brasa-Alta** | Drogath + **Vozgul** | Difícil/G |
| M4-11 | 11 · Brasa-Alta | `camp-11-savana-de-ambar` (M2-07) | colônia sob cerco | Drogath + Vozgul + **Skarn** | Difícil/G |
| M4-12 | 12 · A Cidadela de Brasa-Alta | `camp-12-cabo-aurora-leste` (M2-07) | cidadela nível 3 + bloqueio + chefe **Dorian** (que foge ferido no fim) | os três | Muito difícil/GG |

---

# M5 — Polimento

### M5-01 · IA: níveis de dificuldade e seletor (condicional à D3 = a)
**Dif.** Muito difícil · **Esf.** GG · **Exec.** S · **Roda:** Node · **Dep.:** M3-13
**Contexto:** `src/ai/` (perfis em `AIStrategy`/`AIDirector`; APM, atraso, bônus Brutal prontos); meta F5-03: **Difícil vence ≥ 60 % de partidas pareadas contra Normal**; hoje 48 % em 20 partidas. Falta vantagem estrutural da Difícil (expansão, economia). Ferramentas: `tools/ai-ladder.mjs`, `tools/balance-sim.mjs`, `tools/soak.mjs`.
**Fazer:** (1) escada de dificuldades mensurável: Fácil < Normal < Difícil < Brutal com ≥ 60 % de vitória de cada nível sobre o anterior em 40 partidas pareadas trocando de lado e de mapa; (2) alavancas honestas: tempo de expansão, número de trabalhadores, uso de pesquisas/tiers/heróis, micro, agressividade — **não** apenas bônus de recursos (reservar bônus ao Brutal); (3) seletor Fácil/Normal/Difícil na campanha (por missão ou global) e na escaramuça, i18n, persistência; (4) NEW-9: a Fácil não derruba HQ parado cedo.
**Pronto quando:** escada ≥ 60 % em 40 partidas por degrau; soak 99 %+ termina; `determinism` verde; seletor funcionando; relatório com a tabela de vitórias.
**Se não atingir em 2 rodadas:** reportar e aplicar o fallback (D3-b): rotular honestamente.

### M5-02 · Rebalanceamento da árvore completa e dos heróis
**Dif.** Difícil · **Esf.** G · **Exec.** S · **Roda:** Node · **Dep.:** M3-13
**Contexto:** `docs/BALANCEAMENTO.md` mediu só o nível 1 (humano 51,7 % / orc 48,3 %). Desde então entraram cavalaria, cerco, magia, aéreo, naval, heróis. Ferramentas: `tools/balance-sim.mjs`, `tools/balance-audit.mjs`, `tools/eco-curve.mjs`, `tools/combat-table.mjs`; dados em `src/data/`.
**Fazer:** 200+ partidas IA×IA com IA em tier 3 (agora que a IA evolui o Centro e pesquisa); medir taxa de vitória por facção, tempo médio, composição; ajustar PV/dano/custo/tempo em `src/data/` (única fonte); heróis: PV/dano/mana/recarga em campo (cenários 1v1 e contra horda); registrar em `docs/BALANCEAMENTO.md`.
**Pronto quando:** 45–55 % por facção em 200 partidas; nenhuma unidade com taxa de uso < 2 % ou dominante > 40 % nas composições da IA; checksum e testes atualizados com a nova tabela.

### M5-03 · Desempenho: ORM/texturas, CPU de animação, massa300
**Dif.** Difícil · **Esf.** G · **Exec.** S · **Roda:** GPU local · **Dep.:** M1-03
**Contexto:** specs `docs/specs/NEW-6-orm-texturas.md` (passos 1, 2, 4, 5; **passo 2 decidido**: ORM e bump à metade do lado **só em `high`**, `ultra` completo) e `docs/specs/NEW-14-cpu-animacao.md` (passos 0–2 e 5–6; 3–4 agora liberados, NEW-53 está feita); números da M1-03.
**Fazer:** executar as duas specs; atacar os 3 maiores custos medidos na M1-03 até **massa300 ≥ 45 FPS** e **combate100 ≥ 50 FPS** no preset alto da RX 7600 XT, e VRAM em `high` < 300 MB.
**Pronto quando:** metas atingidas com 3 execuções; `npm run perf` dentro de ±10 % depois de regravar a baseline com justificativa; sem regressão visual (`npm run visual`).

### M5-04 · Arte: Refinaria, Fundição, Forja Naval, Caldeirão
**Dif.** Média · **Esf.** G · **Exec.** SB · **Dep.:** M0-01
**Contexto:** `refinery`, `foundry`, `naval_forge` (humanos) e `ash_cauldron` (orc) ainda são procedurais (`src/render/buildings/…`/`models`); referência de estilo: `build_shipyard.py`, `build_ship_dock.py`, `build_oil_platform.py`.
**Fazer:** 4 `.glb` (≤ 20 draw calls, 512²), registro, inspetor, ícones/retratos (`render_icons.py`); remover o fallback procedural só depois de aprovado.
**Pronto quando:** modelos no jogo e no inspetor; ícones no manifesto; baseline dos alvos novos.

### M5-05 · Arte: Submersível, Tartaruga Colossal e Ovelha
**Dif.** Média · **Esf.** M · **Exec.** SB · **Dep.:** M0-01
**Fazer:** `submersible.glb`, `colossal_turtle.glb` (hoje herda `submersible` via `modelOf`) e `sheep.glb` (críter; ligar ao `CritterView`); ícones e retratos; mesmas regras.
**Pronto quando:** no jogo e no inspetor; ícones no manifesto.

### M5-06 · HUD nova (condicional à D6 = a)
**Dif.** Difícil · **Esf.** GG · **Exec.** S · **Dep.:** M3-14
**Contexto:** ART-14; referências em `docs/refs/mundo/`; HUD atual: `index.html`, `style.css`, `src/ui/UIManager.js`, minimapa `drawMinimap`; responsiva (F6-03, `uiScale.js`).
**Fazer em 3 etapas com aprovação:** (1) **maquete HTML estática** em `docs/refs/hud/maquete.html` (1920×1080 e 1280×720) para o dono aprovar; (2) implementação: minimapa circular com moldura de pedra/ferro e máscara, barra de recursos em placas, painel de comandos retangular com retratos acima e botões abaixo; i18n; escala de UI 1024→4K; (3) regravar baselines visuais (`npm run visual -- --update`) e conferir a HUD em 390×844.
**Pronto quando:** dono aprova a maquete **e** o resultado; nenhuma função da HUD antiga perdida (lista de verificação do `UIManager`); testes e smoke verdes.

### M5-07 · Música: seleção, tema da história e ambiência por bioma
**Dif.** Média · **Esf.** M · **Exec.** S + V · **Dep.:** M1-02
**Contexto:** `docs/MUSICA.md` (catálogo de 41 faixas, painel 🎵 no inspetor que grava `localStorage['warpoly.music.selection']`, botão "Copiar seleção (JSON)"); `src/audio/music/catalog.js` (`INFO.inGame/candidate`).
**Fazer:** (V) você escuta no inspetor e cola o JSON da seleção no chat; (S) aplicar como padrão em `catalog.js`; compor/ajustar **uma faixa** para a tela de história (~75 s, sem locução) e **ambiência** por bioma novo (deserto: vento seco; floresta: pássaros/folhas; gelo: vento; vulcânico: rumor e estalos; pântano: sapos/insetos) em `src/audio/ambience.js`; música de vitória/derrota por campanha se ainda faltar.
**Pronto quando:** `audio-check` passa; seleção aplicada; tela de história com faixa própria; ambiência audível por bioma (dono confirma no G5).

### M5-08 · Escala dos orcs e pendências de arte (NEW-32)
**Dif.** Fácil · **Esf.** P · **Exec.** SB · **Dep.:** M1-10
**Fazer:** revisar visualmente (lado a lado com humanos) os fatores do `grunt` (0,73) e do `axethrower` (0,72) e ajustar; tratar as pendências menores do NEW-32 (runas do troll, cicatrizes do Lacaio, face do Camponês) só se o G1 as apontar.
**Pronto quando:** capturas lado a lado aprovadas por você no G5.

### M5-09 · Lint, código morto e `check-data-parity` (H)
**Dif.** Fácil · **Esf.** M · **Exec.** **H** · **Dep.:** —
**Fazer:** zerar os ~53 avisos do `npm run lint` removendo variáveis/imports não usados sem mudar comportamento; `node tools/check-data-parity.mjs`: as 140 divergências "históricas" — para cada uma, decidir (documentando) se é legítima (lista de exceções) ou bug; sem mudar números de balanceamento.
**Pronto quando:** `npm run lint` com 0 erros e ≤ 5 avisos; `check-data-parity` sai com 0; `npm test` verde; sem diff de comportamento (`headless-match --seed 1` igual).

### M5-10 · Fauna decorativa extra (opcional)
**Dif.** Média · **Esf.** M · **Exec.** SB · **Dep.:** M2-13
**Fazer (ART-15):** veado, gaivota, lagarto, abutre, lobo-do-gelo como críters/animações leves por bioma (`src/data/critters.js`).
**Pronto quando:** aparecem por bioma; orçamento atendido.

### M5-11 · G5 — sua passada nº 5 (≈ 2 h)
HUD (se aprovada) · escuta de música e ambiência · seletor de dificuldade · escala dos orcs · um 1v1 completo contra cada dificuldade.

### M5-12 · Heróis com XP/níveis e escaramuça (condicional à D7 = b/c)
**Dif.** Muito difícil · **Esf.** GG · **Dep.:** D7
**Fazer:** só se você escolher: XP por abate, níveis 1–5, reviver no Altar/Templo, opção "Sem heróis" no setup, rebalanceamento. Ficha completa será escrita na hora.

---

# M6 — Lançamento

### M6-01 · Determinismo entre navegadores
**Dif.** Difícil · **Esf.** G · **Exec.** S · **Roda:** Node · **Dep.:** —
**Contexto:** `src/sim` e `src/ai` usam `Math.sin/cos/atan2/sqrt` (58 ocorrências em 10 arquivos: `transport.js`, `terrainGenerators.js`, `hazards.js`, `GameManager.js`, `Critter.js`, `Unit.js`, `projectiles.js`, `abilities.js`, `missions/actions.js`, `CommandExecutor.js`…). `sqrt` é exato pela IEEE, mas `sin/cos/atan2` podem diferir no último bit entre V8, SpiderMonkey e JavaScriptCore → **desync no lockstep** entre navegadores. Risco documentado em `docs/09_MULTIPLAYER.md` §4.
**Fazer:** criar `src/sim/fmath.js` com `sin/cos/atan2` determinísticos (tabela pré-computada de 4096 passos com interpolação linear, ou polinômios com aritmética estrita) e substituir as chamadas em `src/sim/**` e `src/ai/**` que afetam estado (render pode continuar com `Math.*`); teste que compara contra `Math.*` (erro < 1e-3 rad) e **vigia** (`tests/unit/noMathTrig.test.js`) que `src/sim`/`src/ai` não chamam `Math.sin/cos/atan2`; regravar fixtures de checksum e explicar; medir custo (bench `massa300`, ≤ +2 %).
**Pronto quando:** testes verdes; `headless-match --seed 1` estável em 2 execuções; documentação em `docs/09_MULTIPLAYER.md` §4 atualizada; (a validação **entre navegadores** reais é a M6-04).

### M6-02 · Auditoria de nomes/IP, créditos e licenças
**Dif.** Média · **Esf.** M · **Exec.** S + V · **Dep.:** M1-11
**Fazer (D2 = b; a renomeação principal já foi feita na M1-11, aqui é a auditoria final):** varrer UI, i18n, campanhas, ids visíveis, nomes de arquivo públicos, textos de documentação e README por termos suspeitos (lista em `docs/05_PARIDADE_WARCRAFT2.md` + "Horda/Aliança/Orc/Grunt/Peon/Goblin/Gryphon…" conforme D2); aplicar a opção escolhida em D2 (b: renomear em UI e campanhas — "Horda"→"Clãs do Cinzal", "Aliança"→"Reino de Aurelan"/"A Coroa", mantendo ids internos; a: aviso "projeto de fã"); tela **Créditos** completa (three.js, Vite, ws, fontes OFL, ferramentas de IA/arte, música sintetizada); `LICENSE`/`NOTICE` do projeto e das dependências; conferir licenças de fontes e de assets gerados (Tripo, imagens do dono).
**Pronto quando:** relatório da varredura (antes/depois); Créditos acessível no menu; licenças listadas; `npm test` verde (atualizar testes de texto).
**Aviso:** não é parecer jurídico.

### M6-03 · Hospedar o sinalizador multiplayer na Cloudflare (D9 = b)
**Dif.** Difícil · **Esf.** G · **Exec.** S + V · **Dep.:** M6-01
**Contexto:** hoje o sinalizador é Node + `ws` (`server/index.js`, `server/signaling.js`, `server/protocol.js`; `npm run signaling`), protocolo documentado em `server/README.md` (cliente→servidor `create/join/leave/list/ready/setup/config/kick/start/rejoin…`, servidor→cliente `hello/joined/room/rooms/peer-joined/peer-left/signal/chat/start…`; limites de mensagem, token bucket, 8 jogadores/sala, códigos de 5 caracteres). Cliente: `src/net/SignalingClient.js`, `src/net/lobby.js`, `src/net/OnlineLobby.js`. O README prevê "Cloudflare Worker + Durable Object (um DO por sala, WebSocket Hibernation API)" mas **nada foi escrito**.
**Fazer:** (1) extrair a lógica de sala de `signaling.js` para um módulo sem dependência de `ws` (`server/core/`), mantendo o servidor Node funcionando e os testes (`tests/unit/signaling.test.js`) verdes; (2) `server/worker/` com um Worker (roteia `GET /ws` e `GET /rooms`) e uma classe Durable Object **por sala** usando a WebSocket Hibernation API, reimplementando o mesmo protocolo e os mesmos limites; um DO "diretório" (ou KV) para a lista de salas públicas; (3) `wrangler.toml` e instruções (`docs/10_DEPLOY.md`): `wrangler dev` local, `wrangler deploy`, domínio `*.workers.dev`; (4) cliente: URL do sinalizador configurável (env/`BASE`), padrão de produção; (5) mensagem clara quando o P2P falha ("sua rede não permite conexão direta") e config de STUN público; TURN só documentado; (6) testes do Worker com `wrangler dev`/`miniflare` ou com a lógica extraída; (7) `tools/online-check.mjs` apontando para o servidor hospedado.
**Você:** criar a conta Cloudflare (plano gratuito), rodar `npx wrangler login` na sua máquina e informar o nome da conta/subdomínio; o agente não cria contas nem manipula credenciais.
**Pronto quando:** duas máquinas em redes diferentes criam e entram numa sala pelo link e jogam 5 min sem desync; o servidor Node local continua funcionando; testes verdes; docs atualizados.

### M6-04 · Compatibilidade (Firefox/Safari) e hardware mínimo
**Dif.** Média · **Esf.** M · **Exec.** S + V · **Dep.:** M5-03
**Contexto:** só Chromium foi testado; a regra do projeto aborta scripts em WebGL por software, então a verificação em outros navegadores é **manual com GPU real**. Alvos D3 em `docs/07_DECISOES.md`: preset **Baixo** ≥ 30 FPS em 1080p com GPU integrada, 200 unidades, load < 10 s.
**Fazer:** (agente) checklist de compatibilidade de APIs (OffscreenCanvas, `AudioContext`, IndexedDB, WebRTC, WebGL2, KTX/WebP, `structuredClone`) e *fallbacks*; se necessário, correções; teste de partida determinística gravada no Chromium e **reproduzida** no Firefox/Safari por você (replay `.warpolyreplay`: checksums finais iguais = determinismo entre motores confirmado). (**você**) abrir o jogo no Firefox e no Safari/Edge, uma partida de 10 min; num notebook/PC mais fraco com o preset Baixo, medir FPS e load e dizer a máquina.
**Pronto quando:** replay do Chromium reproduz no Firefox (e Safari, se disponível) com checksum igual; FPS/load do hardware fraco registrados em `docs/04_DIAGNOSTICO.md`; lista de problemas corrigidos ou registrados.

### M6-05 · Empacotamento: versão, notas, PWA, página de entrada
**Dif.** Média · **Esf.** M · **Exec.** S · **Dep.:** M6-04
**Fazer:** versão semântica visível no menu e no `manifest`; `CHANGELOG.md` de jogador; PWA offline conferido (`tools/preview-check.mjs`); página de entrada (o menu principal já serve; acrescentar `<meta>` Open Graph, favicon e captura social); `docs/10_DEPLOY.md` com o passo a passo de lançar uma versão; teste do `deploy.yml` em branch.
**Pronto quando:** build de produção em `/warpoly/` e em raiz funciona; offline funciona após a 1ª carga; versão e notas visíveis.

### M6-06 · Soak e regressão finais; release candidate
**Dif.** Média · **Esf.** M · **Exec.** S · **Roda:** GPU local · **Dep.:** M6-05
**Fazer:** soak 100 partidas (todos os mapas jogáveis); `npm run visual`; `npm run perf`; `npm run smoke`; `tools/online-check.mjs`; `tools/replay-check.mjs`; suíte completa; etiqueta `v1.0.0-rc1`.
**Pronto quando:** tudo verde; relatório consolidado com números; lista final de pendências conhecidas.

### M6-07 · Documentação de jogador e documentação técnica final
**Dif.** Fácil · **Esf.** M · **Exec.** S · **Dep.:** M6-06
**Fazer:** `README.md` da raiz para jogadores (o que é, como jogar, controles, capturas, requisitos, como relatar bugs); guia "Como jogar" curto in-game ou em `docs/`; `docs/01_ARQUITETURA.md` e `02_MECANICAS.md` conferidos contra o código (números do balanceamento apontam para `src/data/`); `docs/README.md` final.
**Pronto quando:** um leitor novo consegue rodar, jogar e entender a estrutura só pelos docs.

### M6-08 · G6 — sua passada final (≈ 2 h + partida online)
Dispositivo mais fraco · outro navegador · partida online com outra pessoa · uma missão de cada campanha do início ao fim na build de produção · aprovar o RC.
