# F1-09 · Simulação em tick fixo (20 Hz) + interpolação + LOD de animação

Leia antes: `docs/specs/_COMUM.md`, `CLAUDE.md`, `docs/01_ARQUITETURA.md` (loop, `MatchSession`, SpatialGrid), NEW-14 em `docs/TASKS.md`.
Worktree: nova. **Primeiro `git merge master`.** Porta do vite: **5191**.

## Por quê
- Hoje a simulação roda com o delta do frame (`src/main.js:266 _animate` → `MatchSession.update` (`src/core/MatchSession.js:81`) → `GameManager.update(delta)` (`GameManager.js` ~1057, `dt = delta * gameSpeed`)). Resultado varia com o FPS e impede determinismo (F2-03) e multiplayer.
- `Unit.update` custa ~4,5 ms com 310 unidades porque a animação procedural (`this.animator.update(delta)`, chamada ~12 vezes dentro dos estados em `src/entities/Unit.js`, linhas ~559–933) roda para **toda** unidade **todo** frame, inclusive fora da tela e sob a névoa.

## "Pronto" (medido)
- Simulação avança em passos fixos de `SIM_DT = 0.05 s`; o jogo se comporta igual a 30, 60 e 144 FPS (teste automatizado abaixo).
- Movimento de unidades e projéteis visualmente suave (interpolado) — sem "degraus" de 20 Hz.
- `npm run bench -- --scenarios=massa300`: custo de simulação por **frame renderizado** < 4 ms (média) e FPS maior que o master.

## Arquitetura
### 1. Loop (`src/core/MatchSession.js` e `src/core/GameManager.js`)
```
MatchSession.update(frameDelta, elapsed, simulate):
  input.update(frameDelta); camera.update(frameDelta); water.update(elapsed)
  if simulate:
     alpha = gameManager.advance(frameDelta)      // roda 0..N passos fixos, devolve alpha ∈ [0,1)
     gameManager.renderUpdate(frameDelta, alpha)   // interpolação + animação + visuais
     particleSystem.update(frameDelta)
  else:
     gameManager.renderUpdate(0, 1)                // pausado: mantém pose, billboards seguem a câmera
  ui.update(frameDelta)
```
- `GameManager.advance(frameDelta)`: `this._acc += frameDelta * this.gameSpeed`; `steps = 0`; `while (this._acc >= SIM_DT && steps < MAX_STEPS /*8*/) { this.simStep(SIM_DT); this._acc -= SIM_DT; steps++ }`; se atingiu `MAX_STEPS`, zere `_acc` (evita espiral). Retorna `this._acc / SIM_DT`.
- `GameManager.simStep(dt)`: é o corpo atual de `update(delta)` (vitória, árvores, projéteis, construções, unidades, colisões, IA, névoa, limpeza) com `dt` fixo — **sem** chamadas de animação/visual (ver itens 2–4). Mantenha `update(delta)` como wrapper legado que chama `advance` + `renderUpdate` (usado por testes/bench antigos).
- `SIM_DT` e `MAX_STEPS` exportados de `src/sim/constants.js` (novo).
- `gameTime` avança só em `simStep`.
- Bench (`src/debug/bench.js`) mede o tempo de `advance` (renomeie o rótulo para "sim ms/frame").

### 2. Interpolação de transform (Unit e Arrow)
Técnica não invasiva — a lógica continua escrevendo em `mesh.position`/`mesh.rotation.y`:
- No início de `advance`, se houver ≥1 passo: para cada unidade viva e projétil, **restaure** a pose de simulação (`mesh.position.copy(this._simPos)`, `mesh.rotation.y = this._simRotY`) caso a última renderização tenha interpolado.
- Antes de **cada** `simStep`: guarde `_prevPos/_prevRotY` = pose atual. Depois do último passo: `_simPos/_simRotY` = pose atual.
- Em `renderUpdate(alpha)`: `mesh.position.lerpVectors(_prevPos, _simPos, alpha)`; `rotation.y` = interpolação angular pelo menor arco. Barras de vida/anel acompanham (já são filhos ou reposicionados no render).
- Unidade recém-criada: `_prevPos = _simPos = posição inicial` (sem "voar" da origem).
- Vetores alocados **uma vez** por entidade (sem `new Vector3` por frame).

### 3. Animação fora da simulação (`src/entities/Unit.js`)
- Nos métodos de estado (`updateIdle`, `updateMoving`, `moveTowards`, `updateGathering`, `updateBuilding`, `updateAttacking`, hurt, dying): **remova** as chamadas `this.animator.update(delta)` e `this.animator.setTime(...)`; mantenha `this.animator.setAnimation(nome)` (troca de estado).
- Novo `Unit.renderUpdate(frameDelta, alpha, lodStep)`:
  - aplica interpolação (item 2);
  - se `this.animator` e `lodStep > 0`:
    - estado `attacking` com anim `fight`: `animator.setTime(min(1, (this.attackTimer + alpha*SIM_DT) / this.attackCooldown))` (mesma fórmula de hoje, agora contínua);
    - senão: `animator.update(frameDelta * lodStep)` (lodStep = nº de frames acumulados desde a última atualização, ver item 4);
  - morte (`isDying`): continua animando `die` e o afundamento (`mesh.position.y -= …`) — mova o afundamento visual para cá também, com `frameDelta`; a remoção (`canRemove`) continua na simulação por `deathTimer`.
  - billboard da barra de vida (hoje dentro de `Unit.update` ~linha 578 copiando `camera.quaternion`) → mover para `renderUpdate`.
- Garanta que `hurtTimer`/flash de dano continuam visíveis (o flash é aplicado por `animator` na anim `hurt`).

### 4. LOD de animação (em `GameManager.renderUpdate`)
Uma vez por frame: `frustum.setFromProjectionMatrix(camera.projectionMatrix × matrixWorldInverse)`; para cada unidade:
- invisível (`mesh.visible === false`, ex.: escondida pela névoa) **ou** fora do frustum (esfera centro `mesh.position`, raio 3): **não anima** (acumule `frameDelta` em `unit._animAcc`, limite 0,5 s, para não "saltar" quando reaparecer);
- distância à câmera-alvo (`sceneManager.cameraTarget`) ≤ 60: anima todo frame;
- 60–100: a cada 2 frames; > 100: a cada 4 frames (use `unit.id % k` para espalhar a carga). Passe o delta acumulado.

### 5. Construções (`src/entities/Building.js` `update`)
Separar em `simUpdate(dt)` (fila de treino, pesquisa, torre atirando, produção passiva, `underAttackTimer`) e `renderUpdate(frameDelta)` (billboard da barra ~linha 627, animação das chamas, fumaça de chaminé/incêndio, `updateCustomVFX` das subclasses — forjas, chiqueiro, serraria, bandeiras). Subclasses em `src/entities/buildings/**` não mudam de assinatura (`updateCustomVFX` passa a ser chamado do render).

### 6. Projéteis (`src/entities/Arrow.js`)
Lógica (progresso, acerto, dano) na simulação; pose interpolada no render (item 2).

## Não fazer
- Não mudar números de jogo (velocidades, cooldowns, dano) — o resultado da simulação deve ser equivalente.
- Não editar `src/render/**`, `ModelFactory.js`, `FogOfWar.js` (apenas ler `mesh.visible` que a névoa define).
- Não introduzir RNG determinístico (é a F2-03).

## Testes (Vitest)
- `tests/unit/fixedStep.test.js`: `advance` com deltas {1/30 ×60, 1/60 ×120, 1/144 ×288} (2 s) executa exatamente 40 passos em todos; `gameSpeed=2` → 80 passos; delta gigante → no máximo `MAX_STEPS` e `_acc` zerado; `alpha` ∈ [0,1).
- Interpolação: entidade fake com `_prevPos=(0,0,0)`, `_simPos=(10,0,0)`, alpha 0,25 → `mesh.position.x = 2.5`; rotação 350°→10° interpola pelo menor arco.
- LOD: função pura `animationLodStep(distance, frameIndex, id)` retorna 1/0 conforme as faixas.

## Verificação (números no relatório)
1. Comandos mínimos do `_COMUM.md` (`npm run smoke`/`npm run bench` já usam safe-run — não aninhe).
2. `npm run bench -- --scenarios=inicial,combate100,massa300` antes (master) e depois: FPS, frame time, sim ms/frame.
3. Script Playwright via safe-run (GPU real, porta 5191, `?skipPreload&texq=low`): mesma partida com seed de bench rodada 20 s simulados em taxa de frame limitada a ~30 FPS (use `page.evaluate` para chamar `advance` com deltas fixos) e a ~144 FPS → posição média das unidades e recursos da IA iguais (tolerância pequena, pois `Math.random` ainda existe; documente a diferença observada).
4. Capturas/vídeo curto (sequência de 5 frames) mostrando unidade andando sem "degraus"; animações de ataque, coleta, morte e flash de dano funcionando; chamas de forja/incêndio animando.

## Docs
`docs/01_ARQUITETURA.md`: loop com `advance`/`simStep`/`renderUpdate`, constantes, LOD de animação.

## Entrega
Mensagem de commit: `F1-09: simulação em tick fixo 20 Hz, interpolação e LOD de animação`.
