import { it } from 'vitest';
import pen1 from '../../src/data/maps/pendentes/dois-continentes-1.json';
import { makeMapGm } from './helpers/navalWorld.js';
it('dbg', () => {
  const gm = makeMapGm(pen1);
  const npf = gm.navalPathfinder;
  const p = npf.findPath(0, -60, 3, 60, true);
  console.log('wide', JSON.stringify(p));
  const q = npf.findPath(0, -60, 3, 60, false);
  console.log('norm', JSON.stringify(q));
  npf._clear = true;
  console.log('los wide', npf.hasLineOfSight(-16.75,-40.75,-15.25,49.25));
  for (const x of [-18.25,-16.75,-15.25]) { const {c,r}=npf.toGrid(x,-34); console.log(x, npf.staticGrid[r*npf.cols+c], gm.terrain.getHeight(x,-34)); }
});
