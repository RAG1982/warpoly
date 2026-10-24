import { describe, it, expect } from 'vitest';
import { baseMission, makeMissionGm, runTicks, statusOf } from './helpers/missionWorld.js';
import { validateMission } from '../../src/sim/missions/schema.js';
import { CMD } from '../../src/sim/commands.js';
import { stateChecksum } from '../../src/sim/checksum.js';

/** M3-02 — objetivo `train`: conta unidades que SAEM do prédio de treino (n/N), não as que já existiam nem as criadas por script. */
const mission = (over = {}) => baseMission({
  startingResources: { gold: 2000, wood: 2000, stone: 500 },
  objectives: [
    { id: 'tr', type: 'train', priority: 'primary', units: [{ type: 'knight', count: 2 }, { type: 'archer', count: 1 }], title: 'Treinar 3 soldados' }
  ],
  ...over
});
const issue = (gm, c) => gm.issue({ playerId: 0, ...c });
const obj = (gm, id) => gm.mission.objectives.get(id);

describe('objetivo train (M3-02)', () => {
  it('valida: unidade desconhecida, contagem inválida e forma curta unitType+count', () => {
    expect(validateMission(mission()).ok).toBe(true);
    expect(validateMission(mission({ objectives: [{ id: 'a', type: 'train', unitType: 'archer', count: 2, title: 'x' }] })).ok).toBe(true);
    const bad = validateMission(mission({ objectives: [{ id: 'a', type: 'train', units: [{ type: 'dragao', count: 1 }], title: 'x' }] }));
    expect(bad.ok).toBe(false);
    expect(bad.errors.join(' ')).toContain('dragao');
    expect(validateMission(mission({ objectives: [{ id: 'a', type: 'train', title: 'x' }] })).ok).toBe(false);
    expect(validateMission(mission({ objectives: [{ id: 'a', type: 'train', unitType: 'archer', count: 0, title: 'x' }] })).ok).toBe(false);
  });

  it('o contador só sobe com unidade treinada de verdade e conclui na última', () => {
    const gm = makeMissionGm(mission());
    const hq = gm.buildings.find((b) => b.ownerId === 0 && b.type === 'castle');
    const b = gm.createBuilding('barracks', hq.mesh.position.x + 14, hq.mesh.position.z + 10, true, 0);
    gm.buildings.push(b);
    gm.recalculatePopCap();
    runTicks(gm, 25);
    expect(statusOf(gm, 'tr')).toBe('active');
    expect(obj(gm, 'tr').cur).toBe(0);
    issue(gm, { type: CMD.TRAIN, buildingId: b.id, unitType: 'knight' });
    runTicks(gm, 20 * 14);
    expect(obj(gm, 'tr').cur).toBe(1);
    expect(obj(gm, 'tr').max).toBe(3);
    issue(gm, { type: CMD.TRAIN, buildingId: b.id, unitType: 'knight' });
    issue(gm, { type: CMD.TRAIN, buildingId: b.id, unitType: 'knight' }); // o 3º Espadachim passa do pedido: não conta além de 2
    runTicks(gm, 20 * 30);
    expect(obj(gm, 'tr').cur).toBe(2);
    expect(statusOf(gm, 'tr')).toBe('active');
    issue(gm, { type: CMD.TRAIN, buildingId: b.id, unitType: 'archer' });
    runTicks(gm, 20 * 14);
    expect(statusOf(gm, 'tr')).toBe('completed');
    expect(obj(gm, 'tr').cur).toBe(3);
  });

  it('é determinístico (mesmo checksum em duas execuções)', () => {
    const run = () => {
      const gm = makeMissionGm(mission());
      const hq = gm.buildings.find((b) => b.ownerId === 0 && b.type === 'castle');
      const b = gm.createBuilding('barracks', hq.mesh.position.x + 14, hq.mesh.position.z + 10, true, 0);
      gm.buildings.push(b);
      gm.recalculatePopCap();
      issue(gm, { type: CMD.TRAIN, buildingId: b.id, unitType: 'archer' });
      runTicks(gm, 400);
      return stateChecksum(gm);
    };
    expect(run()).toBe(run());
  });
});
