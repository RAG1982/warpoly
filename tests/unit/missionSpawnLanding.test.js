import { describe, it, expect } from 'vitest';
import { validateMission } from '../../src/sim/missions/schema.js';
import { baseMission } from './helpers/missionWorld.js';

/** NAVAL-LANDING — validação da ação `spawnLanding` (a execução está em campaignM04.test.js). */
const errorsOf = (def) => validateMission(def).errors;
const has = (errs, text) => errs.some((e) => e.includes(text));
const landing = (over = {}) => ({
  type: 'spawnLanding', owner: 'enemy', x: 20, z: 10, unloadAt: { x: -10, z: 4 },
  units: [{ type: 'grunt', count: 4 }, { type: 'axethrower', count: 2 }],
  escort: [{ type: 'war_galley', count: 2 }], tag: 'landing', order: { kind: 'attackMove', x: -30, z: 0 }, ...over
});
const withSetup = (...a) => baseMission({ setup: a });

describe('schema: spawnLanding (NAVAL-LANDING)', () => {
  it('aceita um desembarque válido', () => {
    expect(errorsOf(withSetup(landing()))).toEqual([]);
  });
  it('exige unloadAt e tropa; recusa excesso de carga (> 6), tropa naval e escolta terrestre', () => {
    expect(has(errorsOf(withSetup(landing({ unloadAt: undefined }))), 'unloadAt')).toBe(true);
    expect(has(errorsOf(withSetup(landing({ units: [] }))), 'units')).toBe(true);
    expect(has(errorsOf(withSetup(landing({ units: [{ type: 'grunt', count: 7 }] }))), 'no máximo 6')).toBe(true);
    expect(has(errorsOf(withSetup(landing({ units: [{ type: 'war_galley', count: 1 }] }))), 'só unidades terrestres')).toBe(true);
    expect(has(errorsOf(withSetup(landing({ escort: [{ type: 'grunt', count: 1 }] }))), 'escolta deve ser de navios')).toBe(true);
  });
  it('recusa transporte que não é transportador e ordem inválida', () => {
    expect(has(errorsOf(withSetup(landing({ bargeType: 'war_galley' }))), 'bargeType')).toBe(true);
    expect(has(errorsOf(withSetup(landing({ order: { kind: 'stop' } }))), 'attackMove|move')).toBe(true);
  });
});
