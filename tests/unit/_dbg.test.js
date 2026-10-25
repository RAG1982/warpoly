import { it } from 'vitest';
import { CMD } from '../../src/sim/commands.js';
import pen1 from '../../src/data/maps/pendentes/dois-continentes-1.json';
import { makeMapGm, run, components, compAt, shoreNear } from './helpers/navalWorld.js';
it('dbg', () => {
  const gm = makeMapGm(pen1);
  const lc = components(gm.pathfinder);
  const sh = shoreNear(gm, lc, 0, 0, -33);
  const k = gm.spawnUnit('knight', sh.x - 1, sh.z, 0);
  const barge = gm.spawnUnit('barge', sh.x + 2, sh.z, 0);
  const enemy = gm.spawnUnit('axethrower', sh.x - 9, sh.z + 3, 1);
  gm.issue({ type: CMD.ATTACK, playerId: 1, unitIds: [enemy.id], targetId: k.id });
  gm.issue({ type: CMD.LOAD, playerId: 0, unitIds: [k.id], targetId: barge.id });
  for (let t = 0; t < 12; t++) { run(gm, 1); console.log(t, k.transportedBy, k.hp, enemy.state, enemy.attackTarget && enemy.attackTarget.type, enemy.mesh.position.x.toFixed(1), barge.mesh.position.x.toFixed(1)); }
});
