import { it } from 'vitest';
import { CMD } from '../../src/sim/commands.js';
import { ensureMapLoaded } from '../../src/data/maps/index.js';
import pen1 from '../../src/data/maps/pendentes/dois-continentes-1.json';
import pen2 from '../../src/data/maps/pendentes/dois-continentes-2.json';
import { makeMapGm, makeNavalGm, run } from './helpers/navalWorld.js';

function rng(seed){ let s=seed>>>0; return ()=> (s=(s*1664525+1013904223)>>>0)/4294967296; }
const MAPS = { camp4: async()=>ensureMapLoaded('camp-04-baixio-do-breu'), pen1: async()=>pen1, pen2: async()=>pen2 };
for (const k of Object.keys(MAPS)) for (const type of ['frigate','barge','dreadnought']) it('stress '+k+' '+type, async () => {
  const m = await MAPS[k]();
  const gm = makeMapGm(m);
  const npf = gm.navalPathfinder;
  const r = rng(7);
  const spots = [];
  while (spots.length < 40) { const x=(r()-0.5)*m.playable*0.9, z=(r()-0.5)*m.playable*0.9; if (npf.isWalkableWorld(x,z)) spots.push({x,z}); }
  let fails = 0, total = 0; const bad=[];
  let u = gm.spawnUnit(type, spots[0].x, spots[0].z, 0);
  for (let i = 1; i < spots.length; i++) {
    const a = {x:u.mesh.position.x, z:u.mesh.position.z}, b = spots[i];
    const d = Math.hypot(a.x-b.x, a.z-b.z);
    gm.issue({ type: CMD.MOVE, playerId: 0, unitIds: [u.id], x: b.x, z: b.z });
    run(gm, d / u.speed * 3.5 + 15);
    total++;
    const left = Math.hypot(u.mesh.position.x-b.x, u.mesh.position.z-b.z);
    if (left > 6) { fails++; bad.push([a.x.toFixed(0),a.z.toFixed(0),'->',b.x.toFixed(0),b.z.toFixed(0),'left',left.toFixed(0), u.state].join(' ')); }
  }
  console.log('STRESS', k, type, 'fails', fails, '/', total, bad.slice(0,6).join(' || '));
}, 120000);
