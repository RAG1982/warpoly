/**
 * Replay.js (src/replay/, fora de src/sim: usa relógio e Math.random só em metadados) — F9-05: gravação e reprodução de partidas (lógica pura, sem three.js/DOM; testável em Node).
 *
 * Um replay é o mesmo princípio do save (`SaveGame.js`): a simulação é determinística, então basta a
 * `MatchConfig` (com a seed), os comandos dos jogadores HUMANOS por tick e checksums periódicos para
 * reproduzir a partida inteira. As IAs regeneram os próprios comandos. Formato (JSON compacto, versionado):
 *
 *   { format:'warpolyreplay', version:1, simVersion, id, name, createdAt,
 *     config, mapGen, localPlayerId, ticks, cmds:[…], checks:[[tick,hash]…], final:{tick,hash}, summary }
 *
 * - `version` = versão do FORMATO (rejeitada se diferente); `simVersion` = versão das REGRAS da sim
 *   (`REPLAY_SIM_VERSION`; suba quando uma mudança alterar o resultado de partidas já gravadas).
 *   Diferença de `simVersion` não bloqueia: os checksums gravados dizem se a reprodução diverge.
 * - `takes` (opcional, F9-05b, partidas online) = trocas humano↔IA `{tick,pid,ai}` (queda/saída => IA assume;
 *   volta => humano). Na reprodução são aplicadas antes do passo do `tick`, como no `GameSimAdapter`. Nas partidas
 *   online `cmds` vem do `humanLog` do adaptador (só o que os humanos enviaram; a IA que assume regenera o resto).
 * - `cmds` = comandos humanos executados (`commands.log`) + agendados (`pending`), na ordem de execução, sem `seqNo`.
 *   Reenfileirá-los nessa ordem reproduz a ordem `(playerId, seqNo)` original.
 * - `checks` = checksum do estado a cada `checkEvery` ticks (múltiplos de 20, vindos de `gm.checksums`).
 * - A gravação não altera a sim: `ReplayRecorder.poll()` só LÊ `gm.checksums`/`gm.commands`.
 */
import { stateChecksum } from '../sim/checksum.js';
import { SIM_DT } from '../sim/constants.js';
import { validateCommand } from '../sim/commands.js';
import { getMap, hasMap, peekMap, registerGeneratedMap } from '../data/maps/index.js';

export const REPLAY_FORMAT = 'warpolyreplay';
/** Versão do formato do arquivo. */
export const REPLAY_VERSION = 1;
/** Versão das regras da simulação com que os replays são gravados (ver cabeçalho). */
export const REPLAY_SIM_VERSION = 5; // 5: desembarque anfíbio de missão (spawnLanding, m04 NAVAL-LANDING); 4: projétil 'cannonball' dos navios (tempo de voo e alcance contra terra); 2: trigonometria da sim via src/sim/fmath.js (M6-01); 3: fila de pesquisas (RES-QUEUE: RESEARCH com construção ocupada enfileira; CANCEL_RESEARCH aceita `slot`)
/** Intervalo (ticks) entre checksums gravados: 200 ticks = 10 s. Múltiplo de 20 (cadência de `gm.checksums`). */
export const CHECK_EVERY = 200;
export const REPLAY_EXT = '.warpolyreplay';
/** Partidas mais curtas que isto (ticks, 20 s) não geram replay automático. */
export const MIN_RECORD_TICKS = 400;

/** Velocidades do player (0,25× … 8×). */
export const REPLAY_SPEEDS = Object.freeze([0.25, 0.5, 1, 2, 4, 8]);
/** `viewPlayerId` especial: visão total (sem névoa). */
export const VIEW_ALL = -1;

/** Comandos de jogadores humanos (config original) já executados ou agendados, sem `seqNo`. */
export function replayCommands(gm) {
  const aiIds = new Set(gm.matchConfig.players.filter((p) => p.isAI).map((p) => p.id));
  const out = [];
  const keep = (c) => {
    if (aiIds.has(c.playerId)) return;
    const { seqNo: _seq, ...rest } = c; // eslint-disable-line no-unused-vars
    out.push(rest);
  };
  gm.commands.log.forEach(keep);
  gm.commands.pending().forEach(keep);
  return out;
}

/**
 * F9-05b: comandos de partida online = o que o adaptador enfileirou (`humanLog`, só os humanos). Os comandos que a IA
 * emite depois de assumir um jogador que caiu NÃO entram (estariam duplicados: a IA os regenera na reprodução).
 */
function adapterCommands(adapter) {
  return adapter.humanLog.map((c) => {
    const { seqNo: _seq, ...rest } = c; // eslint-disable-line no-unused-vars
    return rest;
  });
}

/** Grava checksums periódicos lendo `gm.checksums` (alimentado pela própria sim a cada 20 ticks). */
export class ReplayRecorder {
  /**
   * @param {object} gm
   * @param {object} [o]
   * @param {number} [o.checkEvery]
   * @param {string} [o.id]
   * @param {boolean} [o.online]
   * @param {{humanLog:object[], takeLog:object[]}|null} [o.adapter]  `GameSimAdapter` da partida online (F9-05b)
   */
  constructor(gm, { checkEvery = CHECK_EVERY, id = null, online = false, adapter = null } = {}) {
    this.gm = gm;
    this.adapter = adapter;
    this.checkEvery = checkEvery;
    this.online = online;
    this.createdAt = Date.now();
    this.id = id || `r${this.createdAt.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
    /** @type {Array<[number, number]>} */
    this.checks = [];
    this._last = -1;
    this.poll();
  }

  /** Copia os checksums novos (tick múltiplo de `checkEvery`). Barato: chamar a cada quadro. */
  poll() {
    const list = this.gm.checksums;
    if (!list || list.length === 0) return;
    // `gm.checksums` guarda os últimos 100; percorre do fim até o último já gravado.
    let i = list.length - 1;
    while (i > 0 && list[i - 1].tick > this._last) i--;
    for (; i < list.length; i++) {
      const c = list[i];
      if (c.tick > this._last && c.tick > 0 && c.tick % this.checkEvery === 0) {
        this.checks.push([c.tick, c.hash]);
        this._last = c.tick;
      }
    }
  }

  /** Quantos ticks já foram jogados. */
  get ticks() {
    return this.gm.currentTick;
  }

  /** Monta o objeto de replay do estado atual (chame ao fim da partida, ao sair ou periodicamente). */
  snapshot({ name = '', now = Date.now() } = {}) {
    this.poll();
    return captureReplay(this.gm, { id: this.id, name, createdAt: this.createdAt, savedAt: now, checks: this.checks, online: this.online, adapter: this.adapter });
  }
}

/** Resumo exibido na lista de replays (sem carregar o replay inteiro). */
function summarize(gm, { online }) {
  const cfg = gm.matchConfig;
  return {
    mapId: cfg.mapId,
    seconds: Math.round(gm.currentTick * SIM_DT),
    seed: cfg.seed,
    online: !!online,
    victoryMode: cfg.victoryMode || null,
    over: !!gm.isGameOver,
    localWon: gm.isGameOver ? !!gm.gameWon : null,
    players: cfg.players.map((p) => ({ id: p.id, name: p.name, factionId: p.factionId, team: p.team, color: p.color, isAI: !!p.isAI }))
  };
}

/**
 * Captura o replay da partida em `gm`. `checks` (opcional) = checksums já coletados pelo `ReplayRecorder`;
 * sem ele, usa o que `gm.checksums` ainda guarda.
 */
export function captureReplay(gm, { id = null, name = '', createdAt = Date.now(), savedAt = Date.now(), checks = null, online = false, checkEvery = CHECK_EVERY, adapter = null } = {}) {
  const cfg = JSON.parse(JSON.stringify(gm.matchConfig));
  const mapDef = getMap(cfg.mapId);
  const list = checks || (gm.checksums || []).filter((c) => c.tick > 0 && c.tick % checkEvery === 0).map((c) => [c.tick, c.hash]);
  return {
    format: REPLAY_FORMAT,
    version: REPLAY_VERSION,
    simVersion: REPLAY_SIM_VERSION,
    id: id || `r${createdAt.toString(36)}`,
    name,
    createdAt,
    savedAt,
    config: cfg,
    mapGen: mapDef && mapDef.generated ? JSON.parse(JSON.stringify(mapDef.generator)) : null,
    localPlayerId: gm.localPlayerId,
    ticks: gm.currentTick,
    cmds: adapter ? adapterCommands(adapter) : replayCommands(gm),
    takes: adapter ? adapter.takeLog.map((e) => ({ tick: e.tick, pid: e.pid, ai: !!e.ai })) : [],
    checks: list.map((c) => [c[0], c[1]]),
    final: { tick: gm.currentTick, hash: stateChecksum(gm) },
    summary: summarize(gm, { online })
  };
}

export function serializeReplay(replay) {
  return JSON.stringify(replay);
}

/** Erro de replay com `code` (`json|format|version|invalid`) para a UI traduzir. */
function fail(code, msg) {
  const e = new Error(msg);
  e.code = code;
  return e;
}

/** Valida e devolve o replay; lança `Error` (PT-BR, com `code`) se o JSON/versão/estrutura for inválido. */
export function parseReplay(json) {
  let r;
  try {
    r = typeof json === 'string' ? JSON.parse(json) : json;
  } catch {
    throw fail('json', 'Replay corrompido (JSON inválido).');
  }
  if (!r || typeof r !== 'object' || r.format !== REPLAY_FORMAT) throw fail('format', 'Arquivo não é um replay do WarPoly.');
  if (r.version !== REPLAY_VERSION) throw fail('version', `Versão de replay incompatível (${r.version}; esperada ${REPLAY_VERSION}).`);
  if (!Number.isInteger(r.ticks) || r.ticks < 0) throw fail('invalid', 'Replay inválido: duração.');
  if (!r.config || typeof r.config !== 'object' || !Array.isArray(r.config.players) || r.config.players.length < 2) throw fail('invalid', 'Replay inválido: configuração da partida.');
  if (!Array.isArray(r.cmds)) throw fail('invalid', 'Replay inválido: comandos.');
  for (const c of r.cmds) {
    const check = validateCommand(c);
    if (!check.ok || !Number.isInteger(c.tick) || c.tick < 0) throw fail('invalid', `Replay inválido: ${check.reason || 'tick do comando'}.`);
  }
  if (r.takes !== undefined) {
    if (!Array.isArray(r.takes)) throw fail('invalid', 'Replay inválido: trocas humano/IA.');
    for (const t of r.takes) if (!t || !Number.isInteger(t.tick) || t.tick < 0 || !Number.isInteger(t.pid) || typeof t.ai !== 'boolean') throw fail('invalid', 'Replay inválido: trocas humano/IA.');
  }
  if (!Array.isArray(r.checks)) throw fail('invalid', 'Replay inválido: checksums.');
  for (const c of r.checks) if (!Array.isArray(c) || !Number.isInteger(c[0]) || !Number.isInteger(c[1])) throw fail('invalid', 'Replay inválido: checksums.');
  if (!r.final || !Number.isInteger(r.final.tick) || !Number.isInteger(r.final.hash)) throw fail('invalid', 'Replay inválido: checksum final.');
  if (!r.summary || typeof r.summary !== 'object') throw fail('invalid', 'Replay inválido: resumo.');
  return r;
}

/**
 * Garante que o mapa do replay exista (mapas gerados são registrados a partir de `mapGen`). Lança se não der.
 * M2-28: mapa de campanha ainda não carregado conta como existente (devolve `undefined`); o `main.js` o carrega
 * (`ensureMapLoaded`) antes de criar a partida.
 */
export function ensureReplayMap(replay) {
  const id = replay.config.mapId;
  if (!hasMap(id)) {
    if (!replay.mapGen) throw fail('map', `Mapa desconhecido "${id}".`);
    const def = registerGeneratedMap(replay.mapGen);
    if (def.id !== id) throw fail('map', `Mapa gerado não confere ("${def.id}" ≠ "${id}").`);
  }
  return peekMap(id);
}

/** Checksum gravado exatamente em `tick` (ou undefined). */
export function checksumAt(replay, tick) {
  if (tick === replay.final.tick) return replay.final.hash;
  for (let i = 0; i < replay.checks.length; i++) if (replay.checks[i][0] === tick) return replay.checks[i][1];
  return undefined;
}

/**
 * Prepara uma `gm` recém-criada (tick 0, config do replay) para reproduzir: reenfileira todos os comandos
 * nos seus ticks. Também protege o fim de partida: a vitória/derrota continua sendo decidida pelo jogador
 * LOCAL ORIGINAL, mesmo que a visão mude (ver `setReplayView`). Não altera nada da sim em si.
 */
export function attachReplay(gm, replay) {
  const baseLocal = gm.playerRegistry.localPlayer;
  const orig = gm._updateVictoryConditions.bind(gm);
  gm._replay = { replay, verified: -1, mismatch: null, baseLocal, view: baseLocal.id };
  gm._updateVictoryConditions = () => {
    const cur = gm.playerRegistry._local;
    gm.playerRegistry._local = baseLocal;
    try {
      return orig();
    } finally {
      gm.playerRegistry._local = cur;
    }
  };
  for (const c of replay.cmds) {
    gm.commands.enqueue(Object.freeze({ ...c }));
    gm.matchStats.countCommand(c.playerId);
  }
  // Espectador: comandos da UI (fora de `simStep`) são engolidos (`netIssue`); a IA (dentro do passo) segue
  // direto — por isso o passo marca `_inStep`, como o `GameSimAdapter` faz em partidas online.
  gm.netIssue = () => null;
  const step = gm.simStep.bind(gm);
  // F9-05b: quedas/saídas do jogo online — o jogador vira IA (ou volta a humano) no tick gravado, antes do passo.
  const takes = Array.isArray(replay.takes) ? replay.takes : [];
  let ti = 0;
  gm.simStep = (dt) => {
    while (ti < takes.length && takes[ti].tick <= gm.currentTick) {
      const e = takes[ti++];
      if (e.ai) gm.convertPlayerToAI(e.pid);
      else gm.convertPlayerToHuman(e.pid);
    }
    gm._inStep = true;
    try {
      step(dt);
    } finally {
      gm._inStep = false;
    }
  };
}

/**
 * Muda a visão (HUD/névoa) para o jogador `playerId`, ou `VIEW_ALL` (visão total, sem névoa). Só apresentação:
 * a memória de exploração do novo jogador começa vazia — para tê-la exata, recrie a partida já com a visão
 * desejada (`createReplayView` na construção) e avance até o tick.
 */
export function setReplayView(gm, playerId) {
  const reg = gm.playerRegistry;
  if (playerId === VIEW_ALL) {
    gm.fogOfWar?.setEnabled(false);
    if (gm._replay) gm._replay.view = VIEW_ALL;
    return;
  }
  const p = reg.getPlayer(playerId);
  if (!p || p.isNeutralHostile) return;
  gm.fogOfWar?.setEnabled(true);
  reg._local = p;
  gm._localPlayerId = p.id;
  gm.fogOfWar?.reset?.();
  if (gm._replay) gm._replay.view = p.id;
}

/**
 * Avança `gm` até `tick`, no máximo `maxSteps` passos por chamada (repartir em vários quadros).
 * Apresentação muda durante o avanço; chame `finishReplaySeek` ao terminar. @returns ticks que faltam.
 */
export function replaySeek(gm, tick, maxSteps = Infinity) {
  gm.events.presentationMuted = true;
  const poses = typeof gm._snapshotSimPose === 'function';
  let n = 0;
  while (gm.currentTick < tick && n < maxSteps && !gm.isGameOver) {
    if (poses) gm._snapshotPrevPose();
    gm.simStep(SIM_DT);
    if (poses) gm._snapshotSimPose();
    n++;
  }
  return gm.isGameOver ? 0 : tick - gm.currentTick;
}

/** Fecha o salto: reativa a apresentação e alinha as poses. */
export function finishReplaySeek(gm) {
  gm.events.presentationMuted = false;
  gm.events.flush();
  if (typeof gm._snapshotPrevPose === 'function') {
    gm._snapshotPrevPose();
    gm._snapshotSimPose();
  }
  gm._acc = 0;
  gm._lastAlpha = 0;
}

/**
 * Confere os checksums que a `gm` já calculou (cada 20 ticks) com os gravados. Chame a cada quadro.
 * @returns {null | {tick:number, expected:number, actual:number}} primeira divergência (guardada em `gm._replay.mismatch`)
 */
export function verifyReplayProgress(gm) {
  const st = gm._replay;
  if (!st) return null;
  if (st.mismatch) return st.mismatch;
  const list = gm.checksums;
  if (!list || list.length === 0) return null;
  if (!st.byTick) st.byTick = new Map(st.replay.checks.map((c) => [c[0], c[1]]));
  let i = list.length - 1;
  while (i > 0 && list[i - 1].tick > st.verified) i--;
  for (; i < list.length; i++) {
    const c = list[i];
    if (c.tick <= st.verified) continue;
    st.verified = c.tick;
    const exp = st.byTick.get(c.tick);
    if (exp !== undefined && exp !== c.hash) {
      st.mismatch = { tick: c.tick, expected: exp, actual: c.hash };
      return st.mismatch;
    }
  }
  return null;
}

/**
 * Atalho síncrono (testes/headless): reproduz o replay em `gm` até `tick` (padrão: o fim) conferindo os checksums.
 * @returns {{ok:boolean, tick:number, checksum:number, mismatch:object|null, finalOk:boolean|null}}
 */
export function playReplaySync(gm, replay, tick = replay.ticks, { verify = true } = {}) {
  if (!gm._replay) attachReplay(gm, replay);
  while (gm.currentTick < tick && !gm.isGameOver) {
    gm.simStep(SIM_DT);
    if (verify) verifyReplayProgress(gm);
  }
  const checksum = stateChecksum(gm);
  const exp = checksumAt(replay, gm.currentTick);
  return {
    ok: !gm._replay.mismatch && (exp === undefined || exp === checksum),
    tick: gm.currentTick,
    checksum,
    mismatch: gm._replay.mismatch,
    finalOk: exp === undefined ? null : exp === checksum
  };
}

/** `m:ss` / `h:mm:ss` a partir de ticks. */
export function formatTicks(ticks) {
  const total = Math.floor(ticks * SIM_DT);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

/** Nome de arquivo seguro para exportar. */
export function replayFileName(replay) {
  const d = new Date(replay.createdAt || 0);
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
  const map = String(replay.config.mapId).replace(/[^\w-]+/g, '_');
  return `warpoly-${map}-${stamp}${REPLAY_EXT}`;
}
