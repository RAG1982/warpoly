/**
 * GameSimAdapter.js — F9-01/F9-03/F9-04: liga o `LockstepSession` a um `GameManager` real.
 *
 * A sessão só precisa de `{ enqueue(cmd, tick), step(), checksum() }`. Aqui:
 * - `enqueue` agenda o comando no `CommandQueue` do gm direto no `tick` do turno (equivale a
 *   `gm.issue` com o atraso calculado pela sessão; `playerId` já foi validado contra o remetente);
 * - `step` = um `gm.simStep(SIM_DT)` (passo fixo de 20 Hz) com `gm._inStep` ligado, para que
 *   `gm.issue` chamado de dentro da sim (IA) não seja desviado para a rede;
 * - `checksum` = `stateChecksum(gm)` (`src/sim/checksum.js`); `detail(true)` = hash por categoria +
 *   hash por unidade (relatório de desync);
 * - `beginTurn/endTurn` (só com `render: true`, jogo real) registram a pose antes/depois do TURNO
 *   para a interpolação visual.
 *
 * F9-04:
 * - `humanLog` = comandos que a sessão enfileirou (os dos humanos), `takeLog` = trocas humano<->IA com o tick;
 *   `captureSnapshot()` os devolve com a config e o checksum (formato de replay/save), e
 *   `restoreSnapshot(snap)` reproduz TUDO numa partida NOVA (tick 0) e confere o checksum;
 * - `takeover(pid)`/`release(pid)`: o jogador vira IA / volta a ser humano neste tick (antes do passo do turno).
 */
import { makeCommand, validateCommand } from '../sim/commands.js';
import { SIM_DT } from '../sim/constants.js';
import { stateChecksum, stateChecksumDetail } from '../sim/checksum.js';

export function createGameSimAdapter(gm, { render = false } = {}) {
  const humanLog = [];
  const takeLog = [];
  const adapter = {
    gm,
    humanLog,
    takeLog,
    ready: () => true,
    get tick() {
      return gm.currentTick;
    },
    enqueue(cmd, tick) {
      gm.matchStats.countCommand(cmd.playerId);
      const c = makeCommand({ ...cmd, tick });
      humanLog.push(c);
      gm.commands.enqueue(c);
    },
    step() {
      gm._inStep = true;
      try {
        gm.simStep(SIM_DT);
      } finally {
        gm._inStep = false;
      }
    },
    checksum() {
      return stateChecksum(gm);
    },
    detail(wantUnits = false) {
      return stateChecksumDetail(gm, wantUnits);
    },
    beginTurn() {
      if (render) gm._snapshotPrevPose();
    },
    endTurn() {
      if (render) gm._snapshotSimPose();
    },
    takeover(pid) {
      if (gm.convertPlayerToAI(pid)) takeLog.push({ tick: gm.currentTick, pid, ai: true });
    },
    release(pid) {
      if (gm.convertPlayerToHuman(pid)) takeLog.push({ tick: gm.currentTick, pid, ai: false });
    },
    /** Estado reproduzível (JSON puro): config + comandos humanos + trocas humano/IA + checksum no tick atual. */
    captureSnapshot() {
      const cfg = JSON.parse(JSON.stringify(gm.matchConfig));
      for (const p of cfg.players) p.isLocal = false;
      return {
        version: 1,
        tick: gm.currentTick,
        checksum: stateChecksum(gm),
        config: cfg,
        commands: humanLog.map((c) => {
          const { seqNo: _s, ...rest } = c; // eslint-disable-line no-unused-vars
          return rest;
        }),
        takes: takeLog.map((e) => ({ ...e }))
      };
    },
    /** Reproduz o snapshot numa partida recém-criada (tick 0). @returns {{ok:boolean, expected:number, actual:number}} */
    restoreSnapshot(snap) {
      if (gm.currentTick !== 0) throw new Error('restoreSnapshot: a partida precisa estar zerada (tick 0)');
      if (!snap || snap.version !== 1 || !Number.isInteger(snap.tick) || !Array.isArray(snap.commands) || !Array.isArray(snap.takes)) throw new Error('snapshot inválido');
      const sig = (cfg) => JSON.stringify([cfg.seed, cfg.mapId, cfg.players.map((p) => [p.id, p.factionId, p.team, p.startSlot])]);
      if (sig(snap.config) !== sig(gm.matchConfig)) throw new Error('snapshot de outra partida');
      for (const c of snap.commands) {
        const v = validateCommand(c);
        if (!v.ok || !Number.isInteger(c.tick)) throw new Error(`snapshot inválido: ${v.reason || 'tick'}`);
      }
      gm.events.presentationMuted = true;
      const poses = typeof gm._snapshotSimPose === 'function';
      for (const c of snap.commands) {
        const cmd = makeCommand(c);
        gm.commands.enqueue(cmd);
        humanLog.push(cmd);
        gm.matchStats.countCommand(c.playerId);
      }
      let ti = 0;
      const applyTakes = () => {
        while (ti < snap.takes.length && snap.takes[ti].tick <= gm.currentTick) {
          const e = snap.takes[ti++];
          if (e.ai) adapter.takeover(e.pid);
          else adapter.release(e.pid);
        }
      };
      while (gm.currentTick < snap.tick) {
        applyTakes();
        if (poses) gm._snapshotPrevPose();
        adapter.step();
        if (poses) gm._snapshotSimPose();
      }
      applyTakes();
      gm.events.presentationMuted = false;
      gm.events.flush();
      if (poses) {
        gm._snapshotPrevPose();
        gm._snapshotSimPose();
      }
      gm._acc = 0;
      gm._lastAlpha = 0;
      const actual = stateChecksum(gm);
      return { ok: actual === snap.checksum, expected: snap.checksum, actual };
    }
  };
  return adapter;
}
