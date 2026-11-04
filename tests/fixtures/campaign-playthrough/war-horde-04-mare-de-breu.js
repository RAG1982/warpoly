/**
 * Roteiro de playthrough da m04 da Horda "Maré de Breu" (M4-04). Espelho da m04 da Aliança (war-alliance-04-baixio-do-breu.js), com os lados
 * invertidos: a base do jogador é a margem LESTE (âncora `enemyStart`), a Doca do Clã fica em `shipyard2`, e a esquadra de Aurelan sai do
 * Estaleiro do lado oeste. Tudo por comandos reais do jogador: Lacaios minam e constroem (Tocas, Doca, Caldeirão de Óleo, Salão extra no Posto do
 * Cabo), Petroleiros erguem 2 Plataformas e coletam, Galés de Guerra saem da Doca e patrulham o canal; Drogath fica no Salão. Nada de
 * teletransporte nem dano injetado. O robô só VENCE se construir a frota: o roteiro `noNavy` (mesma economia, sem navios) PERDE (as levas de
 * Aurelan encostam na costa e desembarcam tropas). A investida precoce (tropas iniciais) nem alcança o inimigo: não há ponte de terra.
 */
export const campaignId = 'war-horde';
export const targetMinutes = 13; // ficha: 15–20 min (jogador humano); o robô não pensa, não olha câmera e fecha mais rápido.

const HOME = 'enemyStart'; // base da Horda neste palco (margem leste)
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const posOf = (e) => ({ x: e.mesh.position.x, z: e.mesh.position.z });
const nearest = (list, p) => list.slice().sort((a, b) => dist(posOf(a), p) - dist(posOf(b), p))[0];
const bot = (c) => (c.gm.__bot ||= { last: {} });
const count = (c, type) => c.gm.buildings.filter((x) => x.ownerId === 0 && x.type === type && !x.isDead).length;
const res = (c) => c.gm.getPlayer(0).resources;
const affordable = (c, cost) => Object.entries(cost).every(([k, v]) => (res(c)[k] || 0) >= v);

function builders(c, n = 3) {
  const home = c.anchor(HOME);
  return c.mine('peon').filter((u) => u.state !== 'building').sort((a, b) => dist(posOf(a), home) - dist(posOf(b), home)).slice(0, n).map((u) => u.id);
}
/** Primeiro ponto em volta do Salão onde `canPlaceBuilding` aceita (anéis, ordem fixa). */
function place(c, type, minR = 10, toward = null) {
  const hq = c.bld('great_hall');
  const p = hq.mesh.position;
  const base = toward ? Math.atan2(toward.z - p.z, toward.x - p.x) : Math.PI / 2;
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
/** Constrói em volta de uma âncora do mapa (a árvore sorteada pode ocupar o ponto exato: varre uma espiral curta). */
function at(c, type, anchorName, n = 3) {
  const a = c.anchor(anchorName);
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
  const home = c.anchor(HOME);
  const golds = c.gm.resourceDeposits.filter((r) => r.type === 'gold' && !r.isDead).sort((a, b) => dist(posOf(a), home) - dist(posOf(b), home));
  const tree = nearest(c.gm.trees.filter((t) => !t.isDead), home);
  const outpost = c.gm.buildings.find((b) => b.ownerId === 0 && b.type === 'great_hall' && b.isConstructed && dist(posOf(b), home) > 30);
  c.mine('peon').sort((a, b) => a.id - b.id).forEach((u, i) => {
    if (u.state !== 'idle') return;
    // a esquadra come madeira e ouro na mesma conta: 1 em 3 fica no ouro; os demais cobrem o que estiver mais curto
    let role = i % 3 === 0 ? 'gold' : res(c).wood < res(c).gold + 200 ? 'wood' : 'gold';
    if (res(c).wood > 900 && role === 'wood') role = 'gold';
    let target = role === 'wood' ? tree : golds[0];
    if (role === 'gold' && outpost && i % 2) target = nearest(golds, posOf(outpost)) || target;
    if (target) c.issue({ type: c.CMD.GATHER, unitIds: [u.id], targetId: target.id });
  });
}

/** Economia comum aos dois roteiros (Tocas, Lacaios, ouro e madeira). */
function econ(c) {
  const b = bot(c);
  keepWorking(c);
  const unfinished = c.gm.buildings.find((x) => x.ownerId === 0 && !x.isDead && !x.isConstructed && x.role !== 'wall');
  if (unfinished) { const vs = builders(c); if (vs.length) c.issue({ type: c.CMD.BUILD, unitIds: vs, buildingId: unfinished.id }); }
  const hall = c.bld('great_hall');
  if (hall && c.mine('peon').length < 14 && hall.queue.length === 0 && affordable(c, { gold: 60 })) c.issue({ type: c.CMD.TRAIN, buildingId: hall.id, unitType: 'peon' });
  const popCap = c.gm.getPlayer(0).maxPopulation ?? 0;
  const pop = c.gm.getUnitsOf(0).filter((u) => !u.isDead).length;
  if (!unfinished && pop >= popCap - 3 && count(c, 'orc_house') < 8 && affordable(c, { wood: 50 }) && c.seconds - (b.last.house ?? -99) > 15) { if (place(c, 'orc_house', 10, c.anchor('shipyard2'))) b.last.house = c.seconds; }
  return unfinished;
}

/** Marinha: Doca, Caldeirão, Petroleiros (2 Plataformas e coleta), Galés de Guerra, Posto do Cabo. */
function navy(c, unfinished) {
  const b = bot(c);
  const yard = c.bld('ship_dock');
  if (!unfinished && !count(c, 'ship_dock') && affordable(c, { gold: 200, wood: 150 }) && c.seconds - (b.last.yard ?? -99) > 12) { if (at(c, 'ship_dock', 'shipyard2')) b.last.yard = c.seconds; }
  if (!unfinished && yard && !count(c, 'ash_cauldron') && affordable(c, { gold: 100, wood: 150, stone: 50 }) && c.seconds - (b.last.ref ?? -99) > 12) { if (at(c, 'ash_cauldron', 'refinery2')) b.last.ref = c.seconds; }
  if (!yard) return;
  const tankers = c.mine('tanker');
  const wells = ['well3', 'well2'].map((n) => c.anchor(n)); // well3: poço mais perto da Doca (~30 u); well2: poço do meio do canal, exposto
  const wellDeps = c.gm.resourceDeposits.filter((r) => r.type === 'oil');
  const depAt = (p) => wellDeps.find((d) => dist(posOf(d), p) < 2);
  if (tankers.length + yard.queue.length < 2 && affordable(c, { gold: 100, wood: 60 })) c.issue({ type: c.CMD.TRAIN, buildingId: yard.id, unitType: 'tanker' });
  // Plataforma no poço perto logo; a do poço do meio só quando a esquadra (5 Galés) limpou a patrulha e pode escoltar o Petroleiro
  const escort = c.mine('war_galley').length >= 5 && c.tagged('patrol').every((u) => u.isDead);
  tankers.forEach((t, i) => {
    const d = depAt(wells[i === 1 && escort ? 1 : 0]);
    if (!d || t.state !== 'idle') return;
    if (i === 1 && !escort) return;
    if (!d.platform || !d.platform.isConstructed) { if (!d.platform && affordable(c, { gold: 180, wood: 60 })) c.issue({ type: c.CMD.PLACE_BUILDING, buildingType: 'oil_platform', x: posOf(d).x, z: posOf(d).z, unitIds: [t.id] }); }
    else c.issue({ type: c.CMD.GATHER, unitIds: [t.id], targetId: d.id });
  });
  // Galés de Guerra (a primeira leva só depois de a economia de óleo andar)
  const gal = c.mine('war_galley');
  if (gal.length + yard.queue.length < (c.seconds < 330 ? 6 : 12) && res(c).oil >= 100 && affordable(c, { gold: 200, wood: 100 }) && yard.queue.length < 2) c.issue({ type: c.CMD.TRAIN, buildingId: yard.id, unitType: 'war_galley' });
  // guarnição: com a esquadra de 6 Galés pronta, o ouro que sobra vira Talhadores do Acampamento (as levas de Aurelan desembarcam tropas de verdade)
  const rax = c.bld('orc_barracks');
  if (rax && rax.isConstructed && gal.length >= 6 && rax.queue.length === 0 && c.mine('grunt').length < 10 && affordable(c, { gold: 400, wood: 60, stone: 5 })) c.issue({ type: c.CMD.TRAIN, buildingId: rax.id, unitType: 'grunt' });
  // Posto do Cabo (Salão extra) quando sobra ouro
  if (!unfinished && count(c, 'great_hall') < 2 && res(c).gold > 1000 && res(c).wood > 500 && res(c).stone >= 250 && c.seconds - (b.last.post ?? -99) > 30) { if (at(c, 'great_hall', 'outpost2', 4)) b.last.post = c.seconds; }
}

/** Esquadra: fica na água da Doca; com 5+ Galés caça a patrulha e depois volta. Com a Plataforma do poço do meio erguida, escolta-a. Intercepta quem chega perto do Salão. */
function fleet(c) {
  const ships = [...c.mine('war_galley')];
  const farPlat = c.gm.buildings.some((b) => b.ownerId === 0 && b.type === 'oil_platform' && !b.isDead && dist(posOf(b), c.anchor('well2')) < 3);
  const home = farPlat && ships.length >= 4 ? { x: (c.anchor('well3').x + c.anchor('well2').x) / 2, z: (c.anchor('well3').z + c.anchor('well2').z) / 2 } : c.anchor('shipyard2Water');
  const hunt = c.seconds > 150 && ships.length >= 5 && c.tagged('patrol').some((u) => !u.isDead);
  const live = c.tagged('patrol').filter((u) => !u.isDead);
  const raiders = c.gm.allUnits.filter((u) => !u.isDead && u.ownerId === 1 && u.layer === 'naval' && dist(posOf(u), c.anchor(HOME)) < 55);
  const target = raiders.length ? posOf(nearest(raiders, c.anchor(HOME))) : hunt && live.length ? posOf(nearest(live, home)) : home;
  ships.sort((a, b) => a.id - b.id).forEach((u) => {
    if ((u.state === 'idle' || raiders.length) && dist(posOf(u), target) > 10) c.issue({ type: c.CMD.ATTACK_MOVE, unitIds: [u.id], x: target.x, z: target.z });
  });
}

function drogath(c) {
  const hero = c.tagged('drogath')[0];
  if (!hero || hero.isDead) return;
  // Drogath não persegue desembarcados até a baía: volta ao Salão
  const home = c.anchor(HOME);
  if (dist(posOf(hero), home) > 16) c.issue({ type: c.CMD.MOVE, unitIds: [hero.id], x: home.x - 6, z: home.z });
  const enemies = c.gm.allUnits.filter((u) => !u.isDead && u.ownerId === 1 && u.layer !== 'naval');
  const near = enemies.filter((u) => dist(posOf(u), posOf(hero)) < 9);
  if (near.length) {
    c.issue({ type: c.CMD.CAST, unitIds: [hero.id], abilityId: 'hero_war_cry' });
    if (hero.hp < hero.maxHp * 0.6) c.issue({ type: c.CMD.CAST, unitIds: [hero.id], abilityId: 'hero_clan_fire' });
  }
  // tropa do Salão: ataca quem desembarca
  const land = enemies.filter((u) => dist(posOf(u), c.anchor(HOME)) < 40);
  const guards = c.mine().filter((u) => u.layer !== 'naval' && u.type !== 'peon' && u.type !== 'tanker');
  if (land.length) { const t = posOf(nearest(land, c.anchor(HOME))); const idle = guards.filter((u) => u.state === 'idle'); if (idle.length) c.issue({ type: c.CMD.ATTACK_MOVE, unitIds: idle.map((u) => u.id), x: t.x, z: t.z }); }
}

const loop = (withNavy, extra) => [{
  name: 'robo',
  every: 20,
  each: (c) => { const u = econ(c); if (withNavy) { navy(c, u); fleet(c); } drogath(c); if (extra) extra(c); },
  until: (c) => c.gm.isGameOver,
  timeout: 1500
}];
export const win = loop(true);
/** Mesma economia, sem Doca nem navios: as levas de Aurelan desembarcam e o Salão cai (ou Drogath morre). */
export const noNavy = loop(false);
export const makeLoop = loop;

/** Investida precoce: as tropas iniciais marcham para o Estaleiro de Aurelan; não há ponte de terra: ficam na margem e não vencem. */
export const rush = [{
  name: 'investida', wait: 1,
  run: (c) => { const p = c.anchor('playerStart'); c.issue({ type: c.CMD.ATTACK_MOVE, unitIds: c.mine().filter((u) => u.type !== 'peon').map((u) => u.id), x: p.x, z: p.z }); },
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
