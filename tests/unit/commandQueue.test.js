import { describe, it, expect } from 'vitest';
import { CommandQueue } from '../../src/sim/CommandQueue.js';
import { CMD, makeCommand } from '../../src/sim/commands.js';

function cmd(playerId, tick, extra = {}) {
  return makeCommand({ type: CMD.STOP, playerId, unitIds: [1], tick, ...extra });
}

describe('CommandQueue (F2-02)', () => {
  it('drain(tick) só devolve os comandos daquele tick', () => {
    const q = new CommandQueue();
    q.enqueue(cmd(0, 5));
    q.enqueue(cmd(0, 6));
    q.enqueue(cmd(0, 5));

    expect(q.drain(5)).toHaveLength(2);
    expect(q.drain(5)).toHaveLength(0); // já foi drenado
    expect(q.drain(6)).toHaveLength(1);
    expect(q.drain(7)).toHaveLength(0); // nunca teve nada
  });

  it('ordem determinística por (playerId, seqNo), não pela ordem de enqueue', () => {
    const q = new CommandQueue();
    q.enqueue(cmd(2, 0)); // seqNo 0
    q.enqueue(cmd(0, 0)); // seqNo 1
    q.enqueue(cmd(1, 0)); // seqNo 2
    q.enqueue(cmd(0, 0)); // seqNo 3

    const drained = q.drain(0);
    expect(drained.map(c => [c.playerId, c.seqNo])).toEqual([
      [0, 1],
      [0, 3],
      [1, 2],
      [2, 0]
    ]);
  });

  it('log acumula todo comando já drenado (executado), na ordem de execução', () => {
    const q = new CommandQueue();
    q.enqueue(cmd(1, 0));
    q.enqueue(cmd(0, 0));
    q.enqueue(cmd(0, 1));

    expect(q.log).toHaveLength(0); // nada executado ainda

    q.drain(0);
    expect(q.log).toHaveLength(2);
    q.drain(1);
    expect(q.log).toHaveLength(3);
    expect(q.log.map(c => c.tick)).toEqual([0, 0, 1]);
  });
});
