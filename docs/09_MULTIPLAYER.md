# 09 — Multiplayer (F9-01)

Arquitetura **lockstep determinístico** para até 8 jogadores humanos (mais IAs), sem servidor de jogo: cada cliente roda a simulação inteira e só **comandos** trafegam. Este documento é o desenho; a prova de conceito 1v1 está em `src/net/` (ver "PoC" no fim). Tarefas seguintes: F9-02 (sinalização/lobby), F9-03 (WebRTC), F9-04 (robustez), F9-05 (replays).

## 1. Por que lockstep e o que já existe

A sim já foi preparada para isso (F2-02/F2-03/F2-08):

| Peça existente | Papel no lockstep |
|---|---|
| `src/sim/commands.js` (`CMD`, `makeCommand`, `validateCommand`, `serialize`) | formato do que trafega: JSON puro, só números/strings/ids (nunca referências). `validateCommand` valida comandos vindos da rede sem lançar. |
| `src/sim/CommandQueue.js` | `enqueue(cmd)` por `cmd.tick`; `drain(tick)` ordena por `(playerId, seqNo)` — mesma ordem em todos os pares. `log` = trilha para replay. `COMMAND_DELAY_TICKS` (hoje 0) é o ponto onde entra o atraso de input. |
| `src/sim/CommandExecutor.js` | resolve ids e **valida autoria** (unidade/construção precisa ser do `cmd.playerId`) — comando forjado em nome de outro jogador é ignorado. |
| `GameManager.simStep(dt)` | passo fixo 20 Hz (`SIM_DT`); drena a fila do tick, ignora jogador derrotado, roda IA, grava `gm.checksums` a cada 20 ticks. |
| `src/sim/checksum.js` | `stateChecksum(gm)` FNV-1a 32 bits (unidades, construções, hazards, recursos, `currentTick`). |
| `src/sim/rng.js` | `mulberry32` + `fork(label)`; `gm.rng`, `gm.rngMap`, forks da IA. |
| `MatchConfig.headless` + `tools/headless-match.js` | sim sem DOM/WebGL em Node/aba — base da PoC e dos testes. |

Regra de ouro: **todo efeito sobre o estado passa por `CommandQueue`**. Hoje o cliente local usa `gm.issue()` (tick = `currentTick + COMMAND_DELAY_TICKS`); em rede, `issue()` passa a **entregar o comando à sessão lockstep** (`LockstepSession.queueCommand`) em vez de enfileirar direto — o comando só entra no `CommandQueue` quando o turno é executado (inclusive o do próprio jogador, para não haver caminho local diferente do remoto).

## 2. Modelo de turnos

- **Turno** = `turnTicks` ticks (padrão 2 = 100 ms; 5 Hz de pacotes). Comandos do turno `T` são enfileirados no tick `T·turnTicks` e a sim avança `turnTicks` passos.
- **Atraso de input** = `delayTurns` (padrão 2 = 200 ms): comandos emitidos enquanto o turno `T` é o próximo a executar vão no pacote do turno `T + delayTurns`. Os primeiros `delayTurns` turnos são pacotes vazios enviados no `start()`.
- **Pacote por turno e por jogador**, sempre enviado mesmo vazio (serve de "heartbeat" e prova que o jogador chegou ao turno):
  `{ k:'turn', from, turn, cmds:[...], sum:{turn,hash}|null }`.
- O turno `T` executa quando existem pacotes de **todos** os jogadores humanos ativos. Faltando um → **stall** (a sim espera; a UI mostra "aguardando jogador X"). Execução: para cada `playerId` crescente, enfileira seus comandos (na ordem de emissão) com `tick = T·turnTicks`; depois `turnTicks × simStep`.
- **Atraso adaptativo** (F9-03): cada par mede RTT por pacote (eco do turno recebido); `delayTurns = ceil((RTTmax/2 + jitter) / turnMs) + 1`, limitado a 1..6. Mudanças valem para um turno futuro anunciado no pacote (`delayChange:{atTurn,n}`) para que todos mudem juntos. O PoC usa valor fixo.
- **Render desacoplado**: a sim avança em rajadas quando há turnos prontos; o render (interpolação, `alpha`) continua a 60 fps. Se o relógio local fica mais de N turnos atrás, `update(maxTurns)` executa vários por quadro (catch-up) com teto de tempo por quadro.
- **Velocidade do jogo**: igual para todos (decidida no lobby; muda só via comando de sala no mesmo mecanismo de `delayChange`). Pausa local não existe em rede (F9-04: pausa votada).

## 3. Checksum e detecção de desync

- A cada `checkEvery` turnos (PoC: 1; jogo real: **10 turnos = 1 s**) cada par calcula `stateChecksum(gm)` ao fim do turno e o anexa (`sum`) aos pacotes seguintes. Receber `sum` de turno `t` e já ter o local de `t` → compara; diferente ⇒ **desync**: a sessão congela (`desync = {turn, tick, local, remote, playerId}`) e chama `onDesync`.
- Relatório (F9-03): ao detectar, cada par envia ao anfitrião um **dump detalhado** do turno (checksum por categoria: unidades/construções/recursos/árvores/rng + lista `id:hash` das unidades) para apontar a primeira entidade divergente; salvar também o log de comandos (`gm.commands.log`) como arquivo de replay de diagnóstico.
- **Cobertura do checksum a ampliar** (hoje não cobre): estado do RNG (`gm.rng`/`rngMap`: expor `state()` em `rng.js`), árvores e quantidade de depósitos de recurso, projéteis em voo, `gameTime`, corpos/`corpses`, filas de ordens (`orderQueue`), alvo/ordem atual de cada unidade e `fog`. Quanto mais coberto, mais cedo o desync aparece (hoje só aparece quando afeta posição/hp/recursos). Mudar o checksum não quebra nada: ele é local à partida.
- Checksum por turno não é caro o bastante para ser problema (O(entidades)), mas em partidas grandes use `checkEvery` ≥ 10.
- Quem diverge: com ≥ 3 jogadores, a maioria define o "estado verdadeiro"; o minoritário é desconectado ou ressincronizado (ver reconexão). Com 2 jogadores só se sabe que divergiram: a partida termina como "desync" (sem vencedor).

## 4. O que a sim precisa garantir (auditoria do código em 2026-10-08)

Requisito: dado o mesmo estado inicial (seed + `MatchConfig`) e a mesma sequência de comandos por tick, o estado é idêntico bit a bit em todos os clientes.

| Item | Situação verificada |
|---|---|
| Sem `Math.random`/`Date.now`/`performance.now` na sim | `grep` em `src/sim`, `src/ai`, `src/data`: só restam (a) fallbacks `rng ? rng.next() : Math.random()` em `Tree.js:27-28` (sempre chamado com `gm.rngMap`) e `Building.js:561` (sempre com `gm.rng`); (b) `MatchConfig.randomSeed()` (só no lobby, fora da sim); (c) `SaveGame.js:42` (`Date.now` só como carimbo). **Ação F9-03**: remover os fallbacks (lançar erro se faltar `rng`) e um teste que falhe se aparecer `Math.random` em `src/sim`/`src/ai`. O A* orça por nós expandidos, não por relógio (`Pathfinder.js`). |
| RNG | tudo que muda estado usa `gm.rng` ou fork nomeado (`ai:<id>`, `map`); RNG visual (partículas, som, decoração) continua `Math.random` — **proibido** ler resultado visual de volta na sim. A ordem de consumo do RNG depende da ordem de execução: qualquer mudança de ordem (ver abaixo) é mudança de protocolo. |
| Ordem estável de entidades | `gm.allUnits`, `gm.buildings`, `gm.trees`… são arrays em ordem de criação; `ids` por `EntityIds.js` (contador monotônico da partida); `entitiesById` é `Map` (ordem de inserção). `CommandQueue.drain` ordena por `(playerId, seqNo)`. **Regra**: nunca iterar `Set`/`Map` cujo conteúdo dependa de ordem de chegada de rede, nunca usar `Array.sort` sem desempate por `id`, nunca `Object.keys` de objetos montados a partir de dados externos. |
| Passo fixo | `simStep(SIM_DT)` constante; `gameTime += dt`. O laço de render não pode chamar `simStep` com `dt` variável (já garantido por F1-09; em rede, quem decide quantos passos é a sessão). |
| Ponto flutuante | JS usa doubles IEEE-754 (+, −, ×, ÷, `sqrt` exatos) ⇒ iguais entre máquinas no mesmo tipo de motor. **Risco**: `Math.sin/cos/atan2/pow/hypot/exp` não são exigidos bit a bit idênticos entre motores (V8 × SpiderMonkey × JSC). Há ~100 usos em `src/sim` (Unit, GameManager, transport, Critter, hazards…). Plano: (1) v1 só garante partidas entre navegadores Chromium (mesmo V8; checksum acusa se falhar); (2) F9-04: tabelas/aproximações próprias (`sinD`, `cosD`, `atan2D` em `src/sim/mathDet.js`) para o que entra no estado; o checksum arredonda a 1e-3 mas o estado não. `Math.fround`/inteiros não são necessários. |
| Dependências do estado de apresentação | `gm.localPlayer`/`_localPlayerId` só podem afetar UI. Verificar (F9-03) usos na sim: `issueOrder` e atalhos de input usam o jogador local por design (são UI); a névoa (`FogOfWar`) é por jogador e **não** deve decidir estado de sim (IA usa visão do próprio jogador, igual em todos os clientes). |
| IA | `AIDirector` por jogador IA usa `rng.fork('ai:'+id)` e roda dentro de `simStep`: roda idêntica em todos os pares (nenhum comunica nada). Uma IA que emite comando entra pelo mesmo `CommandQueue` (`gm.issue`) **dentro** do passo, com `tick = currentTick` — igual em todos. |
| Cargas assíncronas | nada da sim pode esperar `await`/carga de modelo/textura. `headless` evita malhas; no jogo real as views são criadas por diff após o passo. |
| Eventos | `gm.events.flush()` acontece depois do checksum e só alimenta áudio/VFX/UI — nenhum ouvinte pode escrever na sim. Já vigiado por `layers.test.js` (sim sem DOM/three). |
| Configuração inicial idêntica | `MatchConfig` (mapa, seed, facções, times, cores, dificuldade, modo de vitória, slots) é serializada e enviada pelo anfitrião a todos antes de começar; **hash do `MatchConfig` + versão do protocolo + versão de dados (`src/data`)** comparados no handshake — versões diferentes não entram na sala. |
| Save/Load | `SaveGame` fica desabilitado em rede (ressincronização futura pode usar snapshot, ver §7). |

## 5. Topologia e sinalização

- **Malha completa (full mesh) WebRTC DataChannel** (`ordered:true`, confiável) entre todos os humanos; até 8 jogadores = 28 canais, tráfego trivial (poucos bytes por turno). Sem relay de jogo: o servidor só faz sinalização.
- **Sinalização** (F9-02): servidor mínimo Node + `ws` (ou Cloudflare Worker + Durable Object) com salas por código/link. Troca de `offer/answer/ICE`; depois da malha formada o servidor sai do caminho. STUN público; **TURN** opcional (configurável) para NATs simétricos — sem TURN ~10-15 % das conexões falham, avisar na UI.
- **Anfitrião da sala** (jogador de menor id vivo): dono da configuração da partida, do relógio de "iniciar" e do relatório de desync; **não** é autoridade de simulação (todos são iguais no lockstep). Se o anfitrião sai, o próximo id assume (eleição determinística).
- **Anti-trapaça (limites)**: lockstep sem servidor autoritativo é vulnerável a *maphack* (todo cliente tem o estado completo). Mitigações v1: comandos sempre revalidados no `CommandExecutor` (autoria, recursos, requisitos) e na sessão (`validateCommand` + `playerId === remetente`); desync identifica clientes que alteram a sim local. Fora de escopo: fog autoritativo.
- **Ordem de mensagens**: a sessão não assume ordem entre pacotes (guarda por `turn`), duplicatas são ignoradas, pacotes de turnos já executados descartados. Testado com reordenação via jitter.

## 6. Lobby

Fluxo (F9-02, UI em `src/ui/screens/`): criar sala (código curto + link) → configurar (mapa, seed, modo de vitória, slots 2–8: Humano/IA/Aberto/Fechado, facção, time, cor) → convidados entram, escolhem slot/facção, marcam "pronto" → anfitrião inicia → todos recebem `{matchConfig, protocolVersion, dataHash, startAt}` → contagem regressiva → `LockstepSession.start()` com `playerIds` = slots humanos. Slots IA rodam como IA normal dentro da sim (idênticas em todos). Lista de salas públicas no servidor de sinalização. Chat do lobby via mesma conexão.

## 7. Reconexão, saída e jogador que vira IA

- **Queda breve**: o canal reconecta (novo ICE) e o par reenvia os pacotes que o outro não confirmou. Cada pacote carrega `ack` (último turno recebido contínuo de cada jogador); pacotes ficam num buffer de reenvio até o `ack` (hoje a sessão guarda só o necessário para a PoC; F9-03 adiciona o buffer). Enquanto isso a sim dos outros **stall** com timeout (padrão 10 s) e UI "aguardando X (votar para expulsar)".
- **Timeout/saída**: após o timeout (ou saída voluntária) o anfitrião anuncia `{k:'drop', pid, atTurn}`; é um comando de sala aplicado em turno futuro (`atTurn = turno atual + delay + 2`), igual para todos. No `atTurn`, `playerIds` deixa de exigir pacote de `pid` e a sim troca `pid` para **IA** (`player.isAI = true` + criação do `AIDirector` com dificuldade normal e `rng.fork('ai:'+pid)`) — mudança determinística aplicada por todos no mesmo tick. Pontuação/recursos/unidades permanecem. Saída de todos os humanos de um time = derrota normal por `victory.js`.
- **Retorno do mesmo jogador** (opcional, F9-04): o par que volta pede estado; um par saudável envia **snapshot** (formato de `SaveGame` + estado do RNG + `CommandQueue.pending()`) com o turno `T`; o retornante carrega, recebe os pacotes dali em diante e assume o slot no próximo `join` agendado. Exige o checksum cobrir o RNG/fila (§3).
- **Desync**: ver §3; em ≥ 3 jogadores o minoritário é derrubado/ressincronizado por snapshot.
- **Pausa votada** (F9-04): comando de sala `pause`/`resume` agendado em turno futuro; durante a pausa os pacotes continuam (vazios) mas a sim não avança.

## 8. Replays (F9-05)

Um replay é **`{protocolVersion, dataHash, matchConfig, turnTicks, delayTurns, turns:[{t, cmds:[...]}...], checksums:[{turn,hash}]}`** — exatamente o que passa pela sessão. Reproduzir = criar a sim com o `matchConfig` e alimentar `CommandQueue` com os comandos de cada turno (sem rede), o mesmo laço da `LockstepSession`. `gm.commands.log` (comandos já executados, com `tick` e `playerId`) é a mesma informação e vale para partidas locais (replay também sai do jogo solo/IA). Checksums gravados validam a reprodução e detectam replay incompatível com a versão. Controle de velocidade/seek (reiniciar do zero e avançar rápido; keyframes por snapshot a cada ~1 min) e câmera livre ficam a cargo da UI.

## 9. Mapeamento nas classes do jogo

| Hoje | Em rede |
|---|---|
| `InputManager`/UI → `gm.issue(fields)` | `gm.issue` delega a `session.queueCommand(fields)` quando há sessão. |
| `CommandQueue.enqueue` com `tick = currentTick + COMMAND_DELAY_TICKS` | a sessão chama `enqueue` com `tick = turno·turnTicks` ao executar o turno (`GameSimAdapter.enqueue`). `COMMAND_DELAY_TICKS` segue 0 (o atraso vive na sessão). |
| laço do jogo (`MatchSession.update`, acumulador de `SIM_DT`) | quando há sessão: `ran = session.update(maxTurnsPorQuadro)`; `alpha` de interpolação a partir do tempo desde o último turno. Sem sessão: comportamento atual. |
| `AIDirector` | continua dentro de `simStep`, só nos slots IA. |
| `gm.checksums` (a cada 20 ticks) | independente; a sessão usa `stateChecksum` direto por turno. |
| `GameStateMachine`/vitória | idêntico em todos os pares (determinístico); fim de partida sem mensagem de rede. |

## 10. PoC (F9-01) — o que foi entregue

- `src/net/Transport.js` (interface), `BroadcastTransport.js` (2 abas), `MemoryTransport.js` (rede simulada com latência/jitter/reordenação e `tamper`), `LockstepSession.js` (turnos, atraso, stall, checksum, desync, validação/anti-forja), `GameSimAdapter.js` (liga a um `GameManager` real), `poc.js`.
- **Página** `net-poc.html` (dev: `http://localhost:5173/net-poc.html` em duas abas; uma clica "Criar", outra "Entrar"). Sim headless em cada aba (sem render), botões para mover/treinar e para forçar um desync; mostra turno, tick, stalls e checksum.
- **Teste** `tests/unit/lockstep.test.js`: 2 sims independentes + rede em memória (120 ms ± 90 ms, reordenação), 150 turnos com comandos de ambos ⇒ mesmos checksums e mesmo log de comandos; adulteração de estado local ⇒ desync detectado pelos dois em < 10 turnos e sim congelada; pacote forjado ⇒ violação e sem execução.
- **Fora do escopo da PoC**: WebRTC/sinalização, ≥ 3 jogadores com votação, reenvio/ack, saída de jogador, atraso adaptativo, replays. Nenhuma mudança em `src/sim/` foi necessária; a única alteração de build é a entrada `net-poc.html` em `vite.config.js`.

## 11. F9-03 — lockstep integrado ao jogo (o que mudou em relação ao desenho)

- **Entrada**: `/?online=1[&signal=ws://host:8787][&sala=COD][&nome=X][&stun=0][&delay=N][&adaptive=0]` → `OnlineLobby` (painel DOM) → ao `start`, monta `buildOnlineMatchConfig` (ids de rede ordenados viram playerIds 0..n-1; times iguais viram "cada um por si"; mapa gerado pela seed se o escolhido não comporta o número de jogadores), cria o `WebRTCTransport` e a `LockstepSession` JÁ (a sim é ligada depois por um proxy: pacotes que chegam durante o carregamento não se perdem), espera todos os canais abrirem e trocar `hello {versão, hash da config}` e só então carrega a partida pelo fluxo normal (`MatchSession({online})`). Single-player não importa nada disso.
- **Atraso adaptativo POR PAR, sem anúncio**: o atraso é só "quantos turnos à frente eu mando pacote" e cada par exige um pacote por turno de cada outro; mudar o próprio atraso não altera o estado. Logo `delayChange{atTurn}` do §2 foi dispensado. `delay = ceil((RTTmax/2 + 2·jitter)/turnMs) + 1` em [2, 6], RTT/jitter por EWMA de ping/pong a cada 500 ms; sobe na hora, desce 1 depois de 30 turnos seguidos com alvo menor. Um par lento faz subir o atraso de quem o mede; os demais seguem normais e só esperam o pacote dele (stall visível na HUD), sem corromper estado.
- **Ritmo**: `session.pump(dtMs)` — 1 turno por 100 ms, até 4 por quadro para recuperar atraso; stall não acumula rajada. Sem pausa/velocidade local em rede (`simulate` fica ligado mesmo com o menu de pausa aberto; pausa votada = F9-04).
- **Comandos**: `gm.issue` → `gm.netIssue` (sessão) quando `!gm._inStep`; a IA (dentro do `simStep`) continua direta. Pose para interpolação é gravada por TURNO (`beginTurn/endTurn` do adaptador).
- **Checksum** a cada 10 turnos (1 s) em jogo (1 nos testes); `stateChecksumDetail` devolve o hash por categoria (`core, units, orders, hazards, buildings, players, trees, deposits, projectiles, rng`) + hash por unidade. Ampliação feita (O(entidades), strings só do que mudou); `corpses` e névoa ficam fora (apresentação/derivados). Saves antigos que gravaram o checksum anterior mostram o aviso de "checksum não bate" uma vez (esperado).
- **Desync**: ao divergir, a sessão congela, difunde `{k:'desync', turn, hash, parts, units}`; cada par monta `desync = {turn, tick, local, remote, playerId, hashes{pid}, divergent[], majority, parts, partsDiff{pid:[categorias]}, diffUnits{pid:[ids]}}` (com ≥ 3 jogadores a maioria estrita define o estado verdadeiro; com 2 só se sabe que divergiram). `desyncDump()` inclui os últimos 100 turnos de comandos; a HUD tem "Baixar relatório" (JSON) e o `console.error`.
- **Determinismo**: removidos os fallbacks `Math.random` (`Tree`, `Building`: lançam erro sem rng) e `tests/unit/noMathRandom.test.js` vigia `src/sim` e `src/ai` (exceções: `randomSeed` do lobby e carimbo do `SaveGame`). `Math.sin/cos/atan2` entre motores continua como risco documentado no §4 (v1 = só Chromium).
- **Não feito (F9-04)**: reenvio/ack e reconexão, pausa votada, saída → IA, chat em jogo, eleição de novo anfitrião durante a partida.
