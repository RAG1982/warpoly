# BUGS-01 · Lote de correções pequenas do backlog

> **Status: ✅ PRONTA — DONE (PR #1, nuvem)**

Leia antes: `docs/specs/_COMUM.md` (na nuvem, veja também `docs/HANDOFF_CLOUD.md`), `CLAUDE.md`, seção "Backlog descoberto" de `docs/TASKS.md`.
Um commit por item (mensagens indicadas). Mudanças mínimas, sem reformatar arquivos.

## NEW-2 · Reembolso errado da IA
`src/ai/AIEconomyManager.js` ~linha 663: `const cost = this.director.costs[type] || this.director.costs.farm;` — `costs` é indexado por **papel** (`farm, house, barracks, lumber, tower, forge`), mas `type` é o tipo da construção (`orc_barracks`…), então sempre cai no custo da fazenda.
Correção: usar `getCost(type)` de `src/data/index.js` (fonte única de custos).
Teste: `tests/unit/aiRefund.test.js` com diretor fake — reembolso de `orc_barracks` = custo real do quartel orc.
Commit: `fix(ia): reembolso usa custo real da construção (NEW-2)`.

## NEW-11 · Avisos de deprecação do three r0.186
- `THREE.Clock` → `THREE.Timer` (`import { Timer } from 'three'`; API: `timer.update()` a cada frame, `timer.getDelta()`, `timer.getElapsed()`). Locais: `src/main.js` (~249 e onde usa `getDelta/getElapsedTime`), `src/inspector/inspector.js` (~611). Confira no changelog do pacote `three` instalado (`node_modules/three/src/core/Timer.js`) a assinatura exata.
- `THREE.PCFSoftShadowMap` foi removido (cai para PCF): em `src/inspector/inspector.js` ~678 e em `src/core/QualitySettings.js` (grep) usar `THREE.PCFShadowMap` e, se quiser suavidade, `shadow.radius` já suportado.
Commit: `chore(three): Clock→Timer e PCFSoftShadowMap→PCFShadowMap (NEW-11)`.

## NEW-5 · Materiais/texturas criados e nunca usados
`npm run lint` aponta `no-unused-vars` em: `src/models/buildings/OrcWatchtowerModel.js` (~50-51), `OrcLumberMillModel.js` (~51-52), `PigFarmModel.js` (~52), `src/models/environment/TreeModel.js` (~259), `src/models/units/ArcherModel.js` (~90). Remova as criações não usadas **só se** a variável não for referenciada em lugar nenhum (grep) — cada material/textura não usada custa VRAM. Não altere visual.
Commit: `perf(models): remove materiais e texturas não usados (NEW-5)`.

## NEW-13 (parte visual do céu) · Céu azul além da borda do mapa na névoa
Em área não explorada, a borda do mapa mostra o `scene.background` azul (`src/core/SceneManager.js`, `this.scene.background`/`scene.fog`). Correção simples: um plano/anel de "oceano distante" já coberto pela névoa **ou** usar `scene.fog` com cor escura quando a câmera olhar para fora do mapa. Implemente a mais simples: estender o plano de água/terra de fundo além de ±70 u (`src/world/Water.js` `createDeepWaterBase`) para ±250 u, marcado com `markFogGround` (de `src/render/fogOfWarShader.js`) para escurecer junto com a névoa.
Commit: `fix(visual): fundo além do mapa escurece com a névoa (NEW-13)`.

## Verificação
`npm test`, `npm run lint` (os avisos da NEW-5 devem sumir), `npx vite build`. Verificação visual da NEW-13 **pendente localmente**.
Não edite `docs/TASKS.md` (o coordenador atualiza no merge); liste no relatório os hashes de cada item.
