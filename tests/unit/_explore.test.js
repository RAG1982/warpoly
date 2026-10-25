import { it } from 'vitest';
import * as THREE from 'three';
import { GameManager } from '../../src/core/GameManager.js';
import { Terrain } from '../../src/world/Terrain.js';
import { createMatchConfig } from '../../src/sim/MatchConfig.js';
import { ensureMapLoaded } from '../../src/data/maps/index.js';

import pen from '../../src/data/maps/pendentes/dois-continentes-1.json';
import pen2 from '../../src/data/maps/pendentes/dois-continentes-2.json';
import { registerMap } from '../../src/data/maps/index.js';
for (const MID of ['camp-04-baixio-do-breu','estreito-1v1','dois-continentes-1','dois-continentes-2']) it('explore '+MID, async () => {
  const m = MID.startsWith('dois')? (MID.endsWith('1')?pen:pen2) : await ensureMapLoaded(MID); try{registerMap(m);}catch(e){}
  const cfg = createMatchConfig({ seed: 3, headless: true, mapId: m.id });
  const gm = new GameManager(new Terrain(m), null, null, cfg);
  const lpf = gm.pathfinder, npf = gm.navalPathfinder;
  // land components
  const comp = new Int32Array(lpf.numCells).fill(-1); let n = 0; const sizes = [];
  for (let i = 0; i < lpf.numCells; i++) {
    if (comp[i] !== -1 || !lpf.staticGrid[i]) continue;
    let s = 0; const st = [i]; comp[i] = n;
    while (st.length) { const k = st.pop(); s++; const c = k % lpf.cols, r = (k / lpf.cols) | 0;
      for (const [dc, dr] of [[1,0],[-1,0],[0,1],[0,-1]]) { const cc = c + dc, rr = r + dr; if (cc<0||rr<0||cc>=lpf.cols||rr>=lpf.rows) continue; const j = rr*lpf.cols+cc; if (lpf.staticGrid[j] && comp[j]===-1) { comp[j]=n; st.push(j);} } }
    sizes.push(s); n++;
  }
  console.log('land comps', sizes.map((s,i)=>[i,s]).filter(x=>x[1]>20));
  const ncomp = new Int32Array(npf.numCells).fill(-1); let nn = 0; const ns = [];
  for (let i = 0; i < npf.numCells; i++) {
    if (ncomp[i] !== -1 || !npf.staticGrid[i]) continue;
    let s = 0; const st = [i]; ncomp[i] = nn;
    while (st.length) { const k = st.pop(); s++; const c = k % npf.cols, r = (k / npf.cols) | 0;
      for (const [dc, dr] of [[1,0],[-1,0],[0,1],[0,-1]]) { const cc = c + dc, rr = r + dr; if (cc<0||rr<0||cc>=npf.cols||rr>=npf.rows) continue; const j = rr*npf.cols+cc; if (npf.staticGrid[j] && ncomp[j]===-1) { ncomp[j]=nn; st.push(j);} } }
    ns.push(s); nn++;
  }
  console.log('sea comps', ns.map((s,i)=>[i,s]).filter(x=>x[1]>20));
  const at = (pf, cm, x, z) => { const {c, r} = pf.toGrid(x, z); return cm[r*pf.cols+c]; };
  for (const [k, a] of Object.entries(m.anchors||{})) if (a.water) console.log(k, a, 'sea', at(npf, ncomp, a.x, a.z)); else if (['playerStart','enemyStart','landingZone','shipyard1','shipyard2','expansion1','expansion2'].includes(k)) console.log(k, a, 'land', at(lpf, comp, a.x, a.z));
  if(0)console.log(gm.players.map(p=>[p.id,p.factionId]), gm.buildings.map(b=>[b.type,b.ownerId,b.mesh.position.x|0,b.mesh.position.z|0]));
});
it('islets', () => {
  const m = pen;
  const cfg = createMatchConfig({ seed: 3, headless: true, mapId: 'x' });
  try{registerMap(m);}catch(e){}
  const cfg2 = createMatchConfig({ seed: 3, headless: true, mapId: m.id });
  const gm = new GameManager(new Terrain(m), null, null, cfg2);
  const lpf = gm.pathfinder;
  const comp = new Int32Array(lpf.numCells).fill(-1); let n = 0; const info = [];
  for (let i = 0; i < lpf.numCells; i++) {
    if (comp[i] !== -1 || !lpf.staticGrid[i]) continue;
    let s = 0, sx=0, sz=0; const st = [i]; comp[i] = n;
    while (st.length) { const k = st.pop(); s++; const c = k % lpf.cols, r = (k / lpf.cols) | 0; const w=lpf.toWorld(c,r); sx+=w.x; sz+=w.z;
      for (const [dc, dr] of [[1,0],[-1,0],[0,1],[0,-1]]) { const cc = c + dc, rr = r + dr; if (cc<0||rr<0||cc>=lpf.cols||rr>=lpf.rows) continue; const j = rr*lpf.cols+cc; if (lpf.staticGrid[j] && comp[j]===-1) { comp[j]=n; st.push(j);} } }
    if (s>20) info.push([n,s,(sx/s).toFixed(0),(sz/s).toFixed(0)]); n++;
  }
  console.log('ISLETS', JSON.stringify(info), gm.buildings.map(b=>[b.type,b.ownerId,b.mesh.position.x|0,b.mesh.position.z|0].join(',')).join(' '), gm.allUnits.length);
});
