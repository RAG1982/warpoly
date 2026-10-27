import { it } from 'vitest';
import { appendFileSync } from 'node:fs';
import '../../src/data/campaigns/index.js';
import { playMission } from './helpers/campaignHarness.js';
const log = (...a) => appendFileSync('/tmp/zz_dbg.log', a.map((x) => typeof x === 'string' ? x : JSON.stringify(x)).join(' ') + '\n');
it('dbg', async () => {
  const run = await playMission('war-alliance', 'war-alliance-06-a-geada', [{ name: 'w', wait: 605 }], { maxSeconds: 606 });
  const gm = run.gm;
  log('tags', [...gm.mission.tags.keys()].join(','));
  const barges = gm.allUnits.filter((u) => u.type === 'barge');
  log('barges', barges.map((b) => [b.ownerId, b.isDead, Math.round(b.mesh.position.x), Math.round(b.mesh.position.z)]));
  log('outcome', run.outcome, run.seconds);
});
