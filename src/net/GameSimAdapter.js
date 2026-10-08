/**
 * GameSimAdapter.js — F9-01/F9-03: liga o `LockstepSession` a um `GameManager` real.
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
 */
import { makeCommand } from '../sim/commands.js';
import { SIM_DT } from '../sim/constants.js';
import { stateChecksum, stateChecksumDetail } from '../sim/checksum.js';

export function createGameSimAdapter(gm, { render = false } = {}) {
  return {
    gm,
    get tick() {
      return gm.currentTick;
    },
    enqueue(cmd, tick) {
      gm.matchStats.countCommand(cmd.playerId);
      gm.commands.enqueue(makeCommand({ ...cmd, tick }));
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
    }
  };
}
