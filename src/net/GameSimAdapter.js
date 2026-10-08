/**
 * GameSimAdapter.js — F9-01: liga o `LockstepSession` a um `GameManager` real.
 *
 * A sessão só precisa de `{ enqueue(cmd, tick), step(), checksum() }`. Aqui:
 * - `enqueue` agenda o comando no `CommandQueue` do gm direto no `tick` do turno (equivale a
 *   `gm.issue` com o atraso calculado pela sessão; `playerId` já foi validado contra o remetente);
 * - `step` = um `gm.simStep(SIM_DT)` (passo fixo de 20 Hz);
 * - `checksum` = `stateChecksum(gm)` (`src/sim/checksum.js`).
 */
import { makeCommand } from '../sim/commands.js';
import { SIM_DT } from '../sim/constants.js';
import { stateChecksum } from '../sim/checksum.js';

export function createGameSimAdapter(gm) {
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
      gm.simStep(SIM_DT);
    },
    checksum() {
      return stateChecksum(gm);
    }
  };
}
