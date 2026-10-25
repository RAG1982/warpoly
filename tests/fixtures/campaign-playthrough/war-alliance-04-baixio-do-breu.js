/**
 * Roteiro de playthrough da m04 "O Baixio do Breu" (M3-05). Tudo por comandos reais do jogador: Aldeões minam e constroem (Casas, Estaleiro, Refinaria,
 * Centro extra no Posto do Cabo), Petroleiros erguem 2 Plataformas e coletam, Fragatas saem do Estaleiro e patrulham o canal; o Capitão Brann fica no Paço.
 * Nada de teletransporte nem dano injetado. O robô só VENCE se construir a frota: o roteiro `noNavy` (mesma economia, sem navios) PERDE (as levas orcas
 * encostam na costa e desembarcam tropas). A investida precoce (tropas iniciais) nem alcança o inimigo: não há ponte de terra.
 */
export const campaignId = 'war-alliance';
export const targetMinutes = 13; // ficha: 15–20 min (jogador humano); o robô não pensa, não olha câmera e fecha mais rápido.

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const posOf = (e) => ({ x: e.mesh.position.x, z: e.mesh.position.z });
const nearest = (list, p) => list.slice().sort((a, b) => dist(posOf(a), p) - dist(posOf(b), p))[0];
const bot = (c) => (c.gm.__bot ||= { last: {}, tankers: [], launched: false });
const count = (c, type) => c.gm.buildings.filter((x) => x.ownerId === 0 && x.type === type && !x.isDead).length;
const res = (c) => c.gm.getPlayer(0).resources;
const affordable = (c, cost) => Object.entries(cost).every(([k, v]) => (res(c)[k] || 0) >= v);

function builders(c, n = 3) {
  const home = c.anchor('playerStart');
  return c.mine('villager').filter((u) => u.state !== 'building').sort((a, b) => dist(posOf(a), home) - dist(posOf(b), home)).slice(0, n).map((u) => u.id);
}
/** Primeiro ponto em volta do Centro onde `canPlaceBuilding` aceita (anéis, ordem fixa). */
function place(c, type, minR = 10, toward = null) {
  const hq = c.bld('castle');
  const p = hq.mesh.position;
  const base = toward ? Math.atan2(toward.z - p.z, toward.x - p.x) : -Math.PI / 2;
  for (let r = minR; r < 44; r += 3) {
    for (let a = 0; a < 16; a++) {
      const ang = base + (((a % 2 ? 1 : -1) * Math.ceil(a / 2)) * Math.PI) / 8;
      const x = p.x + Math.cos(ang) * r;
      const z = p.z + Math.sin(ang) * r;
      if (c.gm.canPlaceBuilding(type, x, z, null, 0)) { c.issue({ type: c.CMD.PLACE_BUILDING, buildingType: type, x, z, unitIds: builders(c) }); return true; }
    }
  }
  return false;
}
function at(c, type, anchorName, n = 3) {
  const a = c.anchor(anchorName);
  // a árvore sorteada pode ocupar o ponto exato da âncora: varre um espiral curto (passo 1,5 u, até 12 u) em volta dela
  for (let r = 0; r <= 12; r += 1.5) {
    for (let k = 0; k < (r === 0 ? 1 : 12); k++) {
      const ang = (k / 12) * Math.PI * 2;
      const x = a.x + Math.cos(ang) * r, z = a.z + Math.sin(ang) * r;
      if (c.gm.canPlaceBuilding(type, x, z, null, 0)) { c.issue({ type: c.CMD.PLACE_BUILDING, buildingType: type, x, z, unitIds: builders(c, n) }); return true; }
    }
  }
  return false;
}
function keepWorking(c) {
  const home = c.anchor('playerStart');
  const golds = c.gm.resourceDeposits.filter((r) => r.type === 'gold' && !r.isDead).sort((a, b) => dist(posOf(a), home) - dist(posOf(b), home));
  const tree = nearest(c.gm.trees.filter((t) => !t.isDead), home);
  const outpost = c.gm.buildings.find((b) => b.ownerId === 0 && b.type === 'castle' && b.isConstructed && dist(posOf(b), home) > 30);
  c.mine('villager').sort((a, b) => a.id - b.id).forEach((u, i) => {
    if (u.state !== 'idle') return;
    let role = ['gold', 'wood', 'gold', 'wood', 'gold', 'gold', 'wood', 'gold', 'gold', 'wood'][i % 10];
    if (res(c).wood > 700 && role === 'wood') role = 'gold';
    let target = role === 'wood' ? tree : golds[0];
    if (role === 'gold' && outpost && i % 2) target = nearest(golds, posOf(outpost)) || target;
    if (target) c.issue({ type: c.CMD.GATHER, unitIds: [u.id], targetId: target.id });
  });
}

/** Economia comum aos dois roteiros (Casas, aldeões, ouro e madeira). */
function econ(c) {
  const b = bot(c);
  keepWorking(c);
  const unfinished = c.gm.buildings.find((x) => x.ownerId === 0 && !x.isDead && !x.isConstructed && x.role !== 'wall');
  if (unfinished) { const vs = builders(c); if (vs.length) c.issue({ type: c.CMD.BUILD, unitIds: vs, buildingId: unfinished.id }); }
  const castle = c.bld('castle');
  if (castle && c.mine('villager').length < 9 && castle.queue.length === 0 && affordable(c, { gold: 60 })) c.issue({ type: c.CMD.TRAIN, buildingId: castle.id, unitType: 'villager' });
  const popCap = c.gm.getPlayer(0).maxPopulation ?? 0;
  const pop = c.gm.getUnitsOf(0).filter((u) => !u.isDead).length;
  if (!unfinished && pop >= popCap - 3 && count(c, 'cottage') < 8 && affordable(c, { wood: 50 }) && c.seconds - (b.last.cottage ?? -99) > 15) { if (place(c, 'cottage', 10, c.anchor('shipyard1'))) b.last.cottage = c.seconds; }
  return unfinished;
}

/** Marinha: Estaleiro, Refinaria, Petroleiros (2 Plataformas e coleta), Fragatas, Posto do Cabo e posto da esquadra. */
function navy(c, unfinished) {
  const b = bot(c);
  const yard = c.bld('shipyard');
  if (!unfinished && !count(c, 'shipyard') && affordable(c, { gold: 200, wood: 150 }) && c.seconds - (b.last.yard ?? -99) > 12) { if (at(c, 'shipyard', 'shipyard1')) b.last.yard = c.seconds; }
  if (!unfinished && yard && !count(c, 'refinery') && affordable(c, { gold: 100, wood: 150, stone: 50 }) && c.seconds - (b.last.ref ?? -99) > 12) { if (at(c, 'refinery', 'refinery1')) b.last.ref = c.seconds; }
  if (!yard) return;
  const tankers = c.mine('tanker');
  const wells = ['well1', 'well2', 'wellMid1', 'wellMid2'].map((n) => c.anchor(n));
  const wellDeps = c.gm.resourceDeposits.filter((r) => r.type === 'oil');
  const depAt = (p) => wellDeps.find((d) => dist(posOf(d), p) < 2);
  if (tankers.length + yard.queue.length < 2 && affordable(c, { gold: 100, wood: 60 })) c.issue({ type: c.CMD.TRAIN, buildingId: yard.id, unitType: 'tanker' });
  // Plataformas nos 2 poços da costa, um Petroleiro em cada; depois todos coletam
  tankers.forEach((t, i) => {
    const d = depAt(wells[i % 2]);
    if (!d || t.state !== 'idle') return;
    if (!d.platform || !d.platform.isConstructed) { if (!d.platform && affordable(c, { gold: 180, wood: 60 })) c.issue({ type: c.CMD.PLACE_BUILDING, buildingType: 'oil_platform', x: posOf(d).x, z: posOf(d).z, unitIds: [t.id] }); }
    else c.issue({ type: c.CMD.GATHER, unitIds: [t.id], targetId: d.id });
  });
  // Fragatas (a primeira leva só depois de a economia de óleo andar)
  const frig = c.mine('frigate');
  if (frig.length + yard.queue.length < (c.seconds < 330 ? 4 : 9) && res(c).oil >= 50 && affordable(c, { gold: 200, wood: 100 }) && yard.queue.length < 2) c.issue({ type: c.CMD.TRAIN, buildingId: yard.id, unitType: 'frigate' });
  // Posto do Cabo (Centro extra) quando sobra ouro
  if (!unfinished && count(c, 'castle') < 2 && res(c).gold > 1000 && res(c).wood > 500 && res(c).stone >= 250 && c.seconds - (b.last.post ?? -99) > 30) { if (at(c, 'castle', 'outpost1', 4)) b.last.post = c.seconds; }
}

/** Esquadra: fica no canal junto aos poços da costa; com 5+ Fragatas, caça a patrulha e depois volta. */
function fleet(c) {
  const stella = c.tagged('stella')[0];
  const ships = [...c.mine('frigate')];
  const home = c.anchor('well2', 8, -4);
  const hunt = c.seconds > 150 && ships.length >= 5 && c.tagged('patrol').some((u) => !u.isDead);
  const spots = [c.anchor('patrol2'), c.anchor('patrol1')];
  const live = c.tagged('patrol').filter((u) => !u.isDead);
  const target = hunt && live.length ? posOf(nearest(live, c.anchor('well2'))) : home;
  ships.sort((a, b) => a.id - b.id).forEach((u) => {
    if (u.state === 'idle' && dist(posOf(u), target) > 10) c.issue({ type: c.CMD.ATTACK_MOVE, unitIds: [u.id], x: target.x, z: target.z });
  });
  void spots; void stella;
}

function brann(c) {
  const brann = c.tagged('brann')[0];
  if (!brann || brann.isDead) return;
  const enemies = c.gm.allUnits.filter((u) => !u.isDead && u.ownerId === 1 && u.layer !== 'naval');
  const near = enemies.filter((u) => dist(posOf(u), posOf(brann)) < 9);
  if (near.length) {
    c.issue({ type: c.CMD.CAST, unitIds: [brann.id], abilityId: 'hero_war_cry' });
    c.issue({ type: c.CMD.CAST, unitIds: [brann.id], abilityId: 'hero_defensive_stance' });
  }
  // tropa do Paço: ataca quem desembarca
  const land = enemies.filter((u) => dist(posOf(u), c.anchor('playerStart')) < 40);
  const guards = c.mine().filter((u) => u.layer !== 'naval' && u.type !== 'villager' && u.type !== 'tanker');
  if (land.length) { const t = posOf(nearest(land, c.anchor('playerStart'))); const idle = guards.filter((u) => u.state === 'idle'); if (idle.length) c.issue({ type: c.CMD.ATTACK_MOVE, unitIds: idle.map((u) => u.id), x: t.x, z: t.z }); }
}

const loop = (withNavy, extra) => [{
  name: 'robo',
  every: 20,
  each: (c) => { const u = econ(c); if (withNavy) { navy(c, u); fleet(c); } brann(c); if (extra) extra(c); },
  until: (c) => c.gm.isGameOver,
  timeout: 1500
}];
export const win = loop(true);
/** Mesma economia, sem Estaleiro nem navios: as levas orcas desembarcam e o Paço cai (ou Brann morre). */
export const noNavy = loop(false);
export const makeLoop = loop;

/** Investida precoce: as tropas iniciais marcham para o acampamento orc; não há ponte de terra: ficam na margem e não vencem. */
export const rush = [{
  name: 'investida', wait: 1,
  run: (c) => { const p = c.anchor('enemyStart'); c.issue({ type: c.CMD.ATTACK_MOVE, unitIds: c.mine().filter((u) => u.type !== 'villager').map((u) => u.id), x: p.x, z: p.z }); },
  each: () => {}, until: (c) => c.seconds > 240, timeout: 300
}];

export const lose = [{
  name: 'aniquilado', wait: 5,
  run: (c) => {
    const killer = c.gm.allUnits.find((u) => u.ownerId === 1);
    for (const u of c.mine()) u.takeDamage(1e6, killer);
    for (const b of c.gm.buildings.filter((x) => x.ownerId === 0)) b.takeDamage(1e6, killer);
  }
}];
