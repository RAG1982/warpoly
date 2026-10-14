# AUD-1 · Auditoria do backlog NEW-1 … NEW-35

Auditoria **somente documental** (nenhum item foi corrigido aqui). Base: `origin/master` em 2026-10-10 (`bece3a9` e seguintes), leitura do código e do histórico. Itens que já têm status no `docs/TASKS.md` (✅ `DONE`) não foram reauditados: NEW-3, 8, 10, 12, 17, 18, 21, 22, 23, 28, 32, 33 e o ⏸ NEW-20.

> **Nota (2026-10-12):** fotografia de 2026-10-10. Desde então foram mesclados NEW-1 (removido), NEW-7, 24, 25, 26, 29, 34, 35 e 44 (todos em REVIEW, verificação local). Seguem abertos: NEW-6, 9, 14 (parcial), 15, 27, 30. Ver o quadro resumo de `docs/TASKS.md`.

Legenda: **FEITO** (com evidência), **ABERTO** (com `arquivo:linha`), **OBSOLETO**, **EM PR** (corrigido numa branch/PR da nuvem ainda não mesclada).

| ID | Estado | Evidência |
|---|---|---|
| NEW-1 | ABERTO (decisão) | `GLTFBuildingLoader` só é importado por `src/render/buildings/orc/GreatHall.js:3`; nenhum outro prédio o usa e os demais `.glb` entram por `glbModels.js`. Decidir: adotar (migrar GreatHall para `glbModels`) ou remover o loader. |
| NEW-2 | FEITO | BUGS-01 (PR #1). `src/ai/AIEconomyManager.js:~995`: sem local livre nada foi deduzido, "não há reembolso a fazer" (o reembolso errado deixou de existir). |
| NEW-3 | FEITO | Já `DONE(3ed0b17)` no TASKS (item duplicado do NEW-22). |
| NEW-4 | FEITO + EM PR (testes) | `src/sim/Pathfinder.js:343` trata `dist < 1e-6`; PR #9 só acrescenta testes. |
| NEW-5 | FEITO | BUGS-01 (PR #1): materiais/texturas não usados removidos (lint 32→25 avisos). |
| NEW-6 | ABERTO | Sem ORM (roughness+metalness empacotados), sem `OffscreenCanvas`/Worker (`grep` em `src/` vazio); `indexedDB` só em `src/replay/ReplayStore.js` e `src/core/SaveStore.js` (saves/replays), não cache de texturas. Troca de qualidade ainda sem recarregar não verificada. |
| NEW-7 | ABERTO | `src/world/TreeManager.js:7` `CAPACITY = 120` fixo por tipo; `:119` um `InstancedMesh` de 120 por tipo, sem chunks nem `count` ajustado. |
| NEW-9 | ABERTO | Sem evidência de ajuste da agressividade inicial; depende de F5-03/rodadas de balanceamento (HANDOFF_CLOUD §depois da fila). |
| NEW-11 | FEITO | BUGS-01 (PR #1). `grep` em `src` e `tools`: nenhum `THREE.Clock`/`PCFSoftShadowMap`; só `PCFShadowMap` (`src/core/SceneManager.js:46`, `QualitySettings.js:141,306`). |
| NEW-13 | FEITO (fundo) + EM PR (chamas) | Fundo além do mapa: BUGS-01 e `Water.createDeepWaterBase` (500×500). Chamas na memória da névoa: PR #14 (`BuildingView.update` exige `shown`). |
| NEW-14 | FEITO (parcial) | LOD de animação existe: `src/sim/constants.js:31` `animationLodStep`, usado em `src/render/UnitView.js:294`; simulação em tick fixo 20 Hz (F1-09). Falta medir se a meta de CPU foi atingida (bench local). |
| NEW-15 | ABERTO (medição) | Meta de 50 FPS em `combate100` depende da migração para Blender/instancing (F7-00b/F7-01); precisa de bench com GPU, fora da nuvem. |
| NEW-16 | FEITO | `style.css` na `master`: `.pop-secondary` só tem `white-space: nowrap` (sem `display:none` no `@media (max-width:1100px)`). |
| NEW-19 | EM PR/BRANCH | Branch `cloud/NEW-19` (`6faa3bb`) existe e não está na `master`; spec `docs/specs/NEW-19-ruinas.md`. Conferir/mesclar. |
| NEW-20 | (adiado pelo dono) | Parcialmente superado: NEW-41 (PR #10) sobe `testTimeout` para 30 s. |
| NEW-24 | ABERTO | Sem portão (`docs/specs/F3-08-muralhas.md:16,31` o excluem); segmentos não aparecem no minimapa (nenhuma referência a muralha em `UIManager.drawMinimap`). Conexões visuais: blocos rentes (arte A), sem peça de ligação. |
| NEW-25 | ABERTO | `src/ai/AIMilitaryManager.js` e `AIStrategy.js` não têm alvo "acampamento neutro" (`grep` por `bandit`/`neutral` vazio). |
| NEW-26 | ABERTO | `src/sim/GameManager.js:1388` `selectSingle` só seleciona entidades do jogador local (`ownerId === _localPlayerId`); bandido/neutro não gera card de inspeção. |
| NEW-27 | ABERTO (medição) | Comparação de draw calls dos neutros vs `master` precisa de bench com GPU (`npm run bench`), não é possível na nuvem. |
| NEW-29 | ABERTO (parcial) | Nomes por nível existem em `src/data/tiers.js:15-16` (Paço Real/Salão do Clã…), mas `name:` em `src/data/buildings.js` ainda é `'Castelo Real'` (:40), `'Forja Real'` (:141), `'Grande Salão Orc'` (:400) etc. Falta unificar com os nomes D7. |
| NEW-30 | ABERTO (medição) | F4 e F5 prontas segundo o TASKS; repetir o lote de balanceamento (F3-11) exige as ferramentas de soak locais (`tools/balance-sim.mjs`). |
| NEW-31 | EM PR | PR #8: `tools/check-data-parity.mjs` roda sem exceção (mas sai com 1: 140 divergências históricas legítimas — ver PR). |
| NEW-34 | ABERTO | `src/ai/AIMilitaryManager.js:368-372` só limita a quantidade de cerco (`siegeAt`); não há escolta/sincronização com a velocidade do exército nem tratamento do alvo dentro do alcance mínimo. |
| NEW-35 | ABERTO | `src/sim/commands.js` não tem ataque no chão (`CMD` sem `ATTACK_GROUND`); `docs/specs/F4-02-cerco.md:19` o remete a este item. |

## Resumo
- **FEITO**: NEW-2, 3, 4, 5, 11, 13 (fundo), 14 (parcial), 16.
- **EM PR/branch**: NEW-4 (testes, #9), NEW-13 (chamas, #14), NEW-19 (branch), NEW-31 (#8).
- **ABERTO**: NEW-1 (decisão), 6, 7, 9, 15, 24, 25, 26, 27, 29, 30, 34, 35.
- **OBSOLETO**: nenhum identificado.

## Atualização pós-merge (2026-10-10)
Os PRs da nuvem listados acima foram mesclados no `master` (merge local, testes 1311 verdes):
- **NEW-4** (PR #9): testes de ponto idêntico no `Pathfinder` — FEITO.
- **NEW-13** (PR #14): chamas de construção sob a névoa — FEITO em código e teste; verificação visual pendente (local) → REVIEW.
- **NEW-19** (`cloud/NEW-19`): ruínas/clareira — mesclado; verificação visual pendente (local) → REVIEW.
- **NEW-31** (PR #8): `check-data-parity` roda sem exceção — FEITO.
- **NEW-41** (PR #10): timeouts de 30 s — mitigação; causa do fogOfWar aberta → DOING(parcial).
- **NEW-49** (PR #13): golpe do Arremessador — FEITO em código e teste; captura pendente → REVIEW.
- **NEW-50** (PR #7): aviso do lobby — FEITO.
- **NEW-52** (PR #12): juncos em água rasa — FEITO em código e teste; captura pendente → REVIEW.
- **F9-05b** (PR #11) e **F10-05b** (PR #15): replay online e chunks por facção — mesclados; verificação no navegador pendente (local).
- **NEW-16**: confirmado no master (`.pop-secondary` só nowrap) — FEITO. O PR #6 (F3-01 da nuvem, de 2026-09-29) é superado pela F3-01 local já mesclada e não foi mesclado.
