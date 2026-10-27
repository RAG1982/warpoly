import { it } from 'vitest';
import { appendFileSync } from 'node:fs';
const LOG = process.env.LOGF || '/tmp/zz.log';
const out = (...a) => appendFileSync(LOG, a.join(' ') + '\n');
import '../../src/data/campaigns/index.js';
import { playMission } from './helpers/campaignHarness.js';
import * as fx from '../fixtures/campaign-playthrough/war-alliance-06-a-geada.js';

const MODE = process.env.RUNMODE || 'win';
const MAXMIN = Number(process.env.MAXMIN || 40);
it('run', async () => {
  const base = fx[MODE];
  const step0 = base[0];
  let lastLog = -999;
  const wrap = [{
    ...step0,
    each: (c) => {
      step0.each(c);
      if (c.seconds - lastLog >= Number(process.env.EVERY || 60)) {
        lastLog = c.seconds;
        const gm = c.gm;
        const cnt = (o, f = () => true) => gm.allUnits.filter((u) => !u.isDead && u.ownerId === o && f(u)).length;
        const hold = gm.mission.vars.hold;
        const cas = (o, t) => gm.buildings.filter((b) => b.ownerId === o && !b.isDead && b.type === t).map((b) => Math.round(b.hp)).join('/');
        const br = c.tagged('brann')[0]; const home = c.anchor('playerStart'); const nearHome = gm.allUnits.filter((u) => !u.isDead && gm.isHostile(0, u.ownerId) && Math.hypot(u.mesh.position.x - home.x, u.mesh.position.z - home.z) < 50).length;
        out(`   brann hp=${br ? Math.round(br.hp) : 'x'} pos=${br ? Math.round(br.mesh.position.x) + ',' + Math.round(br.mesh.position.z) : ''} enemiesNearHome=${nearHome}`);
        { const t = {}; for (const u of gm.allUnits) if (!u.isDead && gm.isHostile(0, u.ownerId) && Math.hypot(u.mesh.position.x - home.x, u.mesh.position.z - home.z) < 50) t[u.type + '@' + u.ownerId] = (t[u.type + '@' + u.ownerId] || 0) + 1; if (nearHome) out('   near home:', JSON.stringify(t)); }
        { const mine = gm.getUnitsOf(0).filter((u) => !u.isDead && u.type !== 'villager'); const nh = mine.filter((u) => Math.hypot(u.mesh.position.x - home.x, u.mesh.position.z - home.z) < 40); const st = {}; for (const u of nh) st[u.state] = (st[u.state] || 0) + 1; out('   troops total', mine.length, 'nearHome', nh.length, JSON.stringify(st), 'field', gm.__bot ? gm.__bot.field.size : 0, 'launched', gm.__bot && gm.__bot.launched, 'target', gm.__bot && gm.__bot.target); }
        { const b = gm.__bot; if (b) { const f = gm.getUnitsOf(0).filter((u) => !u.isDead && b.field.has(u.id)); if (f.length) { const cx = f.reduce((a, u) => a + u.mesh.position.x, 0) / f.length, cz = f.reduce((a, u) => a + u.mesh.position.z, 0) / f.length; const st = {}; for (const u of f) st[u.state] = (st[u.state] || 0) + 1; out('   fieldN', f.length, 'centroid', Math.round(cx) + ',' + Math.round(cz), JSON.stringify(st), 'stormed', b.stormed); } } }
        const objs = [...gm.mission.objectives.values()].map((o) => `${o.id}:${o.status[0]}`).join(' ');
        out(`t=${Math.round(c.seconds)} me=${cnt(0)} (mage ${cnt(0, (u) => u.type === 'mage')} bal ${cnt(0, (u) => u.type === 'ballista')} cav ${cnt(0, (u) => u.type === 'cavalier')}) brumar=${cnt(1)} lan=${cnt(2)} sal=${cnt(3)} hold=${hold} castleMe=${cas(0, 'castle')} castleBr=${cas(1, 'castle')} hallL=${cas(2, 'great_hall')} hallS=${cas(3, 'great_hall')} | ${objs}`);
      }
    }
  }];
  const t0 = Date.now();
  const run = await playMission(fx.campaignId, 'war-alliance-06-a-geada', MODE === 'win' || MODE === 'noArmy' ? wrap : base, { maxSeconds: MAXMIN * 60 });
  out('RESULT', run.outcome, JSON.stringify(run.gm.mission.outcomeText), Math.round(run.seconds), 'wall', Math.round((Date.now() - t0) / 1000), 's');
}, 900000);
