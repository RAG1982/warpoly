/**
 * CommandQueue.js — F2-02: fila de comandos por tick de simulação.
 *
 * `enqueue(cmd)` guarda o comando na lista do tick em que ele já vem marcado para
 * (`cmd.tick`, calculado pelo chamador como `gm.currentTick + COMMAND_DELAY_TICKS`) e
 * atribui `seqNo` (ordem de chegada, monotônico). `drain(tick)` devolve e remove os
 * comandos daquele tick, ordenados deterministicamente por `(playerId, seqNo)` — mesma
 * ordem em todos os clientes de uma partida lockstep (F9), independente da ordem de
 * chegada pela rede. `log` acumula todo comando já drenado (executado), na ordem em que
 * foi executado — a trilha usada por replays (F9-05).
 */

/**
 * Ticks de atraso entre a emissão de um comando e o tick em que ele é executado.
 * 0 agora (execução local, sem rede): lockstep (F9) vai aumentar este valor para dar
 * tempo de os comandos dos outros clientes chegarem antes do tick de execução.
 */
export const COMMAND_DELAY_TICKS = 0;

export class CommandQueue {
  constructor() {
    this._seq = 0;
    /** @type {Map<number, object[]>} tick → comandos agendados para aquele tick */
    this._byTick = new Map();
    /** @type {object[]} todo comando já executado (drenado), na ordem de execução */
    this.log = [];
  }

  /**
   * @param {object} cmd  comando já validado (ver `commands.js#makeCommand`), com `cmd.tick`
   *   já preenchido pelo chamador.
   * @returns {object} o comando efetivamente guardado (com `seqNo` atribuído)
   */
  enqueue(cmd) {
    const withSeq = Object.freeze({ ...cmd, seqNo: this._seq++ });
    let list = this._byTick.get(cmd.tick);
    if (!list) {
      list = [];
      this._byTick.set(cmd.tick, list);
    }
    list.push(withSeq);
    return withSeq;
  }

  /**
   * Remove e devolve os comandos agendados para `tick`, ordenados por `(playerId, seqNo)`.
   * Acumula o resultado em `this.log`. Chamar duas vezes com o mesmo `tick` devolve `[]`
   * na segunda vez (a lista já foi drenada).
   */
  drain(tick) {
    const list = this._byTick.get(tick);
    this._byTick.delete(tick);
    if (!list || list.length === 0) return [];
    list.sort((a, b) => (a.playerId - b.playerId) || (a.seqNo - b.seqNo));
    for (let i = 0; i < list.length; i++) this.log.push(list[i]);
    return list;
  }
}
