import { describe, it, expect } from 'vitest';
import { CMD, makeCommand, validateCommand, serialize, deserialize } from '../../src/sim/commands.js';

describe('commands.js (F2-02)', () => {
  it('makeCommand rejeita campos faltando por tipo', () => {
    expect(() => makeCommand({ type: CMD.MOVE, playerId: 0 })).toThrow(); // falta unitIds/x/z
    expect(() => makeCommand({ type: CMD.ATTACK, playerId: 0, unitIds: [1] })).toThrow(); // falta targetId
    expect(() => makeCommand({ type: CMD.TRAIN, playerId: 0 })).toThrow(); // falta buildingId/unitType
    expect(() => makeCommand({ type: 'nao-existe', playerId: 0 })).toThrow(); // tipo inválido
    expect(() => makeCommand({ type: CMD.STOP, unitIds: [1] })).toThrow(); // falta playerId
  });

  it('makeCommand aceita quando todos os campos obrigatórios estão presentes', () => {
    const cmd = makeCommand({ type: CMD.MOVE, playerId: 0, unitIds: [1, 2], x: 5, z: -3, tick: 10 });
    expect(cmd).toEqual({ type: CMD.MOVE, playerId: 0, unitIds: [1, 2], x: 5, z: -3, tick: 10 });
    expect(Object.isFrozen(cmd)).toBe(true);
  });

  it('validateCommand não lança, devolve {ok, reason}', () => {
    expect(validateCommand({ type: CMD.STOP, playerId: 0, unitIds: [] })).toEqual({ ok: true });
    const bad = validateCommand({ type: CMD.STOP, playerId: 0 });
    expect(bad.ok).toBe(false);
    expect(typeof bad.reason).toBe('string');
  });

  it('todo comando é JSON puro (só números/strings/arrays)', () => {
    const cmd = makeCommand({
      type: CMD.PLACE_BUILDING,
      playerId: 1,
      buildingType: 'orc_barracks',
      x: 1.5,
      z: -2.25,
      unitIds: [3, 4],
      tick: 7
    });
    expect(JSON.parse(JSON.stringify(cmd))).toEqual(cmd);
  });

  it('serialize/deserialize ida e volta idêntica', () => {
    const cmd = makeCommand({
      type: CMD.ATTACK,
      playerId: 0,
      unitIds: [1, 2, 3],
      targetId: 99,
      tick: 42
    });
    const roundTripped = deserialize(serialize(cmd));
    expect(roundTripped).toEqual(cmd);
  });

  it('PLACE_WALL (F3-08): valida campos, formato dos pontos e o limite de 60', () => {
    const base = { type: CMD.PLACE_WALL, playerId: 0, buildingType: 'wall_human', unitIds: [1] };
    expect(validateCommand({ ...base, points: [{ x: 1, z: 2 }] })).toEqual({ ok: true });
    expect(validateCommand({ ...base }).ok).toBe(false); // falta points
    expect(validateCommand({ ...base, points: [] }).ok).toBe(false);
    expect(validateCommand({ ...base, points: [{ x: 1 }] }).ok).toBe(false);
    expect(validateCommand({ ...base, points: 'x' }).ok).toBe(false);
    const sixty = Array.from({ length: 60 }, (_, i) => ({ x: i, z: 0 }));
    expect(validateCommand({ ...base, points: sixty })).toEqual({ ok: true });
    expect(validateCommand({ ...base, points: [...sixty, { x: 99, z: 0 }] }).ok).toBe(false);
    expect(() => makeCommand({ ...base, points: [{ x: 1, z: 2 }], tick: 3 })).not.toThrow();
  });
});
