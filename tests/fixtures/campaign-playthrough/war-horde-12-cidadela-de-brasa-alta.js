/**
 * Roteiro de playthrough da m12 da Horda "A Cidadela de Brasa-Alta" (M4-12), a missão final dos Clãs do Cinzal (espelho da M3-13). Tudo por comandos
 * reais do jogador. Ato I: o Marco da Cidadela (Centro) é evoluído ao nível 3; 4 Torres de Vigia e 8 trechos de Paliçada de Ferro (2 linhas de 4,
 * `PLACE_WALL`) fecham os dois desfiladeiros da crista; a Oficina dos Engenhoqueiros treina as Catapultas. Ato II: a Doca do Clã treina Galés de Guerra,
 * que guardam o estreito e, com a missão no Ato II, destroem as 3 Docas humanas e voltam ao estreito para o contador de 90 s. Ato III: a tropa (Talhadores,
 * Lanceiros-Machado, Ogros, Catapultas e os heróis) segura o Marco contra Dorian, a guarda e o assalto anfíbio; quebrada a guarda, Dorian foge ferido.
 * Nada de teletransporte nem dano injetado. O roteiro `lose` (mesma economia, sem tropa nem frota) PERDE para as levas.
 */
import { BUILDINGS } from '../../../src/data/buildings.js';
import { buildPathfinder, floodFill, isReached } from '../../../src/data/maps/generator.js';

export const campaignId = 'war-horde';
export const targetMinutes = 14; // ficha: 22–25 min (jogador humano); o robô fecha em ~11,5 min; o harness aceita até 2×.

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const posOf = (e) => ({ x: e.mesh.position.x, z: e.mesh.position.z });
const nearest = (list, p) => list.slice().sort((a, b) => dist(posOf(a), p) - dist(posOf(b), p))[0];
const bot = (c) => (c.gm.__bot ||= { last: {}, upgraded: false });
const res = (c) => c.gm.getPlayer(0).resources;
const affordable = (c, cost) => Object.entries(cost).every(([k, v]) => (res(c)[k] || 0) >= v);
const costOf = (type) => BUILDINGS[type].cost;
const count = (c, type) => c.gm.buildings.filter((x) => x.ownerId === 0 && x.type === type && !x.isDead).length;
/** O Marco da Cidadela (Centro atrás da crista, tag `bastion_hall`). */
const colonyHall = (c) => c.tagged('bastion_hall').find((b) => !b.isDead);
/** O Salão do Clã do cabo (primeiro Centro do jogador, o que não é o Marco). */
const hallAt = (c) => c.gm.buildings.find((b) => b.ownerId === 0 && b.type === 'great_hall' && !b.isDead && b.isConstructed && !c.tagged('bastion_hall').includes(b));

/** 3 Lacaios para obra: os mais próximos de `near` que não estejam construindo. */
function builders(c, n = 3, near = c.anchor('playerStart')) {
  return c.mine('peon').filter((u) => u.state !== 'building').sort((a, b) => dist(posOf(a), near) - dist(posOf(b), near)).slice(0, n).map((u) => u.id);
}

/** O ponto (x, z) é alcançável por terra a partir do Salão? (o Cabo tem lascas de costa que os Lacaios não alcançam: a obra ficaria presa). */
function reachable(c, x, z) {
  const r = (c.gm.__reach ||= (() => {
    const m = c.gm.terrain.mapDef, land = buildPathfinder(m, 'land');
    const seen = floodFill(land, m.startSlots[0].x, m.startSlots[0].z);
    return (px, pz) => isReached(land, seen, px, pz);
  })());
  return r(x, z);
}

/** Primeiro ponto em volta de `center` onde `canPlaceBuilding` aceita (varredura em anéis, ordem fixa). */
function placeAround(c, type, center, minR = 8, maxR = 44, n = 3) {
  for (let r = minR; r < maxR; r += 2.5) {
    for (let a = 0; a < 16; a++) {
      const ang = (((a % 2 ? 1 : -1) * Math.ceil(a / 2)) * Math.PI) / 8;
      const x = center.x + Math.cos(ang) * r;
      const z = center.z + Math.sin(ang) * r;
      if (reachable(c, x, z) && c.gm.canPlaceBuilding(type, x, z, null, 0)) { c.issue({ type: c.CMD.PLACE_BUILDING, buildingType: type, x, z, unitIds: builders(c, n, center) }); return true; }
    }
  }
  return false;
}
const homeOf = (c) => posOf(hallAt(c));
const place = (c, type, minR = 9) => placeAround(c, type, homeOf(c), minR, 44);
const placeWide = (c, type, minR = 9) => placeAround(c, type, homeOf(c), minR, 64);

/** Varredura em grade (passo 1,5 u, do mais perto ao mais longe de `center`) pelo primeiro ponto que `canPlaceBuilding` aceita. */
function placeGrid(c, type, center, R = 30, n = 3) {
  const pts = [];
  for (let dz = -R; dz <= R; dz += 1.5) for (let dx = -R; dx <= R; dx += 1.5) {
    const r = Math.hypot(dx, dz);
    if (r >= 8 && r <= R) pts.push({ x: center.x + dx, z: center.z + dz, r });
  }
  pts.sort((a, b) => a.r - b.r);
  for (const p of pts) {
    if (reachable(c, p.x, p.z) && c.gm.canPlaceBuilding(type, p.x, p.z, null, 0)) { c.issue({ type: c.CMD.PLACE_BUILDING, buildingType: type, x: p.x, z: p.z, unitIds: builders(c, n, center) }); return true; }
  }
  return false;
}

/** Papéis dos Lacaios, por ordem de id (ouro, madeira, pedra). Só os ociosos recebem tarefa nova. */
const ROLES = ['gold', 'wood', 'wood', 'gold', 'stone', 'gold', 'wood', 'stone', 'gold', 'wood', 'wood', 'gold', 'stone', 'gold', 'wood', 'wood', 'gold', 'wood'];
function keepWorking(c) {
  const home = c.anchor('playerStart');
  const golds = c.gm.resourceDeposits.filter((r) => r.type === 'gold' && !r.isDead).sort((a, b) => dist(posOf(a), home) - dist(posOf(b), home));
  const stone = nearest(c.gm.resourceDeposits.filter((r) => r.type === 'stone' && !r.isDead), home);
  const camp = c.gm.buildings.find((x) => x.ownerId === 0 && x.type === 'orc_lumber_mill' && !x.isDead && x.isConstructed);
  const trees = c.gm.trees.filter((t) => !t.isDead);
  const tree = nearest(trees, camp ? posOf(camp) : home);
  // madeira é o gargalo da frota: com pouca madeira e ouro sobrando, metade dos coletores troca para as árvores (a cada 25 s)
  const bk = (c.gm.__wk ||= { t: -99 });
  const swap = res(c).wood < 200 && res(c).gold > 500 && c.seconds - bk.t > 25;
  if (swap) bk.t = c.seconds;
  c.mine('peon').sort((a, b) => a.id - b.id).forEach((u, i) => {
    if (swap && i % 2 === 0 && tree && u.state !== 'building') { c.issue({ type: c.CMD.GATHER, unitIds: [u.id], targetId: tree.id }); return; }
    if (u.state !== 'idle') return;
    let role = ROLES[i % ROLES.length];
    if (res(c).wood < 250 && res(c).gold > 500) role = 'wood';
    if (role === 'stone' && res(c).stone > 500) role = 'wood';
    if (role === 'gold' && res(c).gold > 1500) role = 'wood';
    if (role === 'wood' && res(c).wood > 900) role = 'gold';
    const target = role === 'stone' ? stone : role === 'wood' ? tree : golds[i % Math.max(1, Math.min(golds.length, 2))];
    if (target) c.issue({ type: c.CMD.GATHER, unitIds: [u.id], targetId: target.id });
  });
}

/** Evolução do Marco a nível 3 (tiers.js: HQ_UPGRADE_COST[3]). */
const MARCO_LV3 = { gold: 1333, wood: 533, stone: 400, oil: 266 };

/** Serraria junto da árvore mais próxima da base. */
function camp(c) {
  const home = c.anchor('playerStart');
  const tree = nearest(c.gm.trees.filter((t) => !t.isDead), home);
  return placeAround(c, 'orc_lumber_mill', posOf(tree), 5, 20);
}
/** Doca do Clã: na costa do estreito. */
const dock = (c) => placeGrid(c, 'ship_dock', c.anchor('strait'), 60);
function cauldron(c) {
  const yard = c.bld('ship_dock');
  if (!yard) return false;
  return placeGrid(c, 'ash_cauldron', posOf(yard), 36);
}
/** Torre de Vigia no ponto livre mais perto de uma das âncoras tower{A,B}{1,2} ainda sem torre. */
const TOWERS = ['towerA1', 'towerA2', 'towerB1', 'towerB2'];
const towerCount = (c) => c.gm.buildings.filter((x) => x.ownerId === 0 && x.type === 'orc_watchtower' && !x.isDead).length;
function tower(c) {
  const name = TOWERS.find((n) => !c.gm.buildings.some((x) => x.ownerId === 0 && x.type === 'orc_watchtower' && !x.isDead && dist(posOf(x), c.anchor(n)) < 6));
  if (!name) return false;
  const p = c.anchor(name);
  for (let r = 0; r <= 8; r += 1.5) {
    for (let a = 0; a < 8; a++) {
      const x = p.x + Math.cos((a * Math.PI) / 4) * r, z = p.z + Math.sin((a * Math.PI) / 4) * r;
      if (c.gm.canPlaceBuilding('orc_watchtower', x, z, null, 0)) { c.issue({ type: c.CMD.PLACE_BUILDING, buildingType: 'orc_watchtower', x, z, unitIds: builders(c, 3, p) }); return true; }
    }
  }
  return false;
}
/** Blocos de paliçada do jogador (vivos, mesmo em obra) a menos de 8 u do centro do desfiladeiro `L`. */
const wallCount = (c, L) => c.gm.buildings.filter((x) => x.ownerId === 0 && x.type === 'wall_orc' && !x.isDead && dist(posOf(x), c.anchor(`pass${L}`)) < 8).length;
function wall(c, L) {
  const pts = [1, 2, 3, 4].map((k) => c.anchor(`wall${L}${k}`));
  c.issue({ type: c.CMD.PLACE_WALL, buildingType: 'wall_orc', points: pts, unitIds: builders(c, 4, c.anchor(`pass${L}`)) });
  return true;
}
const WALLS_COST = { wood: 40, stone: 80 };

// A Doca e o Caldeirão vêm primeiro: os poucos pontos de costa somem assim que as casas e as Pocilgas se espalham.
const QUEUE = [
  { id: 'farm', type: 'pig_farm', done: (c) => count(c, 'pig_farm') > 0, go: (c) => place(c, 'pig_farm') },
  { id: 'camp', type: 'orc_lumber_mill', done: (c) => count(c, 'orc_lumber_mill') > 0, go: camp },
  { id: 'barracks', type: 'orc_barracks', done: (c) => count(c, 'orc_barracks') > 0, go: (c) => placeWide(c, 'orc_barracks') },
  { id: 'dock', type: 'ship_dock', done: (c) => count(c, 'ship_dock') > 0, go: dock },
  { id: 'cauldron', type: 'ash_cauldron', done: (c) => count(c, 'ash_cauldron') > 0, go: cauldron },
  { id: 'workshop', type: 'orc_workshop', done: (c) => count(c, 'orc_workshop') > 0, go: (c) => placeWide(c, 'orc_workshop') },
  { id: 'den', type: 'ogre_den', done: (c) => count(c, 'ogre_den') > 0, go: (c) => placeWide(c, 'ogre_den') },
  { id: 'wallA', cost: WALLS_COST, done: (c) => wallCount(c, 'A') >= 4, go: (c) => wall(c, 'A') },
  { id: 'wallB', cost: WALLS_COST, done: (c) => wallCount(c, 'B') >= 4, go: (c) => wall(c, 'B') },
  { id: 'tower1', type: 'orc_watchtower', done: (c) => towerCount(c) >= 1, go: tower },
  { id: 'tower2', type: 'orc_watchtower', done: (c) => towerCount(c) >= 2, go: tower },
  { id: 'tower3', type: 'orc_watchtower', done: (c) => towerCount(c) >= 3, go: tower },
  { id: 'tower4', type: 'orc_watchtower', done: (c) => towerCount(c) >= 4, go: tower }
];

const TROOPS_TARGET = 24;
const GALLEYS_TARGET = 8;
const CATAPULTS = 3;

/** Petróleo: depósito de poço mais perto de `anchorName` (a Plataforma nasce sobre ele). */
const wellAt = (c, name) => {
  const p = c.anchor(name);
  return c.gm.resourceDeposits.find((d) => d.type === 'oil' && !d.isDead && dist(posOf(d), p) < 2);
};

function econ(c, { army = true, navy = true } = {}) {
  const b = bot(c);
  keepWorking(c);
  const unfinished = c.gm.buildings.find((x) => x.ownerId === 0 && !x.isDead && !x.isConstructed && x.role !== 'wall');
  if (unfinished) {
    const vs = builders(c);
    if (vs.length) c.issue({ type: c.CMD.BUILD, unitIds: vs, buildingId: unfinished.id });
  }
  const hall0 = hallAt(c);
  if (hall0 && c.mine('peon').length < 24 && hall0.queue.length === 0) c.issue({ type: c.CMD.TRAIN, buildingId: hall0.id, unitType: 'peon' });
  const popCap = c.gm.getPlayer(0).maxPopulation ?? 0;
  const pop = c.gm.getUnitsOf(0).filter((u) => !u.isDead).length;
  if (!unfinished && pop >= popCap - 6 && count(c, 'orc_house') < 10 && affordable(c, costOf('orc_house')) && c.seconds - (b.last.house ?? -99) > 10) { if (placeWide(c, 'orc_house', 16)) b.last.house = c.seconds; }
  // Marco da Cidadela: evolução a nível 3 (uma vez) assim que o ouro, a madeira, a pedra e o petróleo cobrem o custo
  const hall = colonyHall(c);
  if (hall && !b.upgraded && hall.tier < 3 && !hall.upgrading && affordable(c, MARCO_LV3) && !unfinished) {
    c.issue({ type: c.CMD.UPGRADE_HQ, buildingId: hall.id });
    b.upgraded = true;
  }
  // a primeira obra pendente que cabe no bolso e acha lugar (uma que não acha lugar não trava as demais)
  if (!unfinished) {
    for (const q of QUEUE.filter((x) => !x.done(c))) {
      if (!affordable(c, q.cost ?? costOf(q.type)) || c.seconds - (b.last[q.id] ?? -99) <= 8) continue;
      b.last[q.id] = c.seconds;
      if (q.go(c)) break;
    }
  }
  // Petróleo: Petroleiros erguem a Plataforma nos poços do mar perto do estreito (well2, well4) e depois coletam
  const yard = c.bld('ship_dock');
  if (navy && yard) {
    const tankers = c.mine('tanker');
    if (tankers.length + yard.queue.length < 2 && affordable(c, { gold: 100, wood: 60 }) && yard.queue.length < 2) c.issue({ type: c.CMD.TRAIN, buildingId: yard.id, unitType: 'tanker' });
    tankers.forEach((t, i) => {
      const d = wellAt(c, i % 2 ? 'well4' : 'well2');
      if (!d || t.state !== 'idle') return;
      if (!d.platform) { if (affordable(c, { gold: 180, wood: 60 })) c.issue({ type: c.CMD.PLACE_BUILDING, buildingType: 'oil_platform', x: posOf(d).x, z: posOf(d).z, unitIds: [t.id] }); }
      else if (d.platform.isConstructed) c.issue({ type: c.CMD.GATHER, unitIds: [t.id], targetId: d.id });
    });
    const gal = c.mine('war_galley');
    if (gal.length + yard.queue.length < GALLEYS_TARGET && res(c).oil >= 100 && affordable(c, { gold: 200, wood: 100 }) && yard.queue.length < 2) c.issue({ type: c.CMD.TRAIN, buildingId: yard.id, unitType: 'war_galley' });
  }
  if (!army) return;
  const rt = c.gm.mission;
  const workshop = c.bld('orc_workshop');
  if (workshop && workshop.queue.length < 1 && c.mine('catapult').length + workshop.queue.length < CATAPULTS && affordable(c, { gold: 90, wood: 200, stone: 40 })) c.issue({ type: c.CMD.TRAIN, buildingId: workshop.id, unitType: 'catapult' });
  // no Ato II o ouro vai primeiro para a frota (cascos custam o dobro de petróleo e a frota é o que abre o estreito)
  const navyFirst = navy && rt.vars.act === 2 && c.mine('war_galley').length < GALLEYS_TARGET && res(c).oil >= 100 && res(c).gold < 600;
  const den = c.bld('ogre_den');
  if (den && !navyFirst && den.queue.length < 2 && res(c).gold > 250 && c.mine('ogre').length + den.queue.length < 10) c.issue({ type: c.CMD.TRAIN, buildingId: den.id, unitType: 'ogre' });
  const barracks = c.bld('orc_barracks');
  if (barracks && !navyFirst && barracks.queue.length < 3 && res(c).gold > 150 && c.mine().filter(isTroop).length < TROOPS_TARGET) {
    const n = rt.trainedCount(0, 'grunt') + rt.trainedCount(0, 'axethrower');
    c.issue({ type: c.CMD.TRAIN, buildingId: barracks.id, unitType: n % 3 === 2 ? 'axethrower' : 'grunt' });
  }
}

const isTroop = (u) => u.type !== 'peon' && !u.type.startsWith('hero_') && u.type !== 'tanker' && u.type !== 'war_galley' && u.type !== 'iron_leviathan' && u.type !== 'barge' && u.type !== 'catapult' && u.type !== 'war_serpent' && u.type !== 'ogre_mage';

/**
 * Tropa defensiva: todas as tropas (não heróis) e as Catapultas ficam atrás da linha (entre o Marco e os desfiladeiros); quando um inimigo
 * (não navio) chega a 55 u do Marco, a tropa e os heróis Vozgul/Skarn atacam o mais próximo. Drogath fica perto do Marco, usa o grito de guerra
 * e vai para a retaguarda quando há muito inimigo ou no Ato III (se ele cair, a missão está perdida).
 */
function ground(c, { attack = true } = {}) {
  const dro = c.tagged('drogath')[0];
  const enemies = c.gm.allUnits.filter((u) => !u.isDead && u.ownerId === 1);
  const hallB = colonyHall(c);
  const hall = hallB ? posOf(hallB) : c.anchor('bastionHall');
  if (dro && !dro.isDead) {
    const home = c.anchor('bastionHall', 0, -6);
    const near = enemies.filter((u) => dist(posOf(u), posOf(dro)) < 12);
    const crowd = enemies.filter((u) => u.layer !== 'naval' && dist(posOf(u), posOf(dro)) < 30).length;
    const act3 = c.gm.mission.vars.act >= 3;
    if (act3 || (dro.hp < dro.maxHp * 0.75 && near.length >= 1) || crowd >= 4) { c.issue({ type: c.CMD.MOVE, unitIds: [dro.id], x: c.anchor('playerStart').x, z: c.anchor('playerStart').z }); }
    else if (near.length >= 1) {
      c.issue({ type: c.CMD.CAST, unitIds: [dro.id], abilityId: 'hero_war_cry' });
    } else if (dist(posOf(dro), home) > 6 && dro.state !== 'moving') c.issue({ type: c.CMD.MOVE, unitIds: [dro.id], x: home.x, z: home.z });
  }
  const rally = c.anchor('bastionHall', 0, 4);
  const troops = c.mine().filter(isTroop).sort((a, b) => a.id - b.id);
  const cats = c.mine('catapult');
  const heroes = c.mine().filter((u) => u.type === 'hero_vozgul' || u.type === 'hero_skarn').concat(c.mine('ogre_mage'), c.mine('war_serpent'));
  const threats = enemies.filter((u) => u.type !== 'peon' && u.type !== 'frigate' && u.type !== 'dreadnought' && u.type !== 'barge' && dist(posOf(u), hall) < 55);
  if (attack && threats.length) {
    const foe = nearest(threats, hall);
    const group = troops.concat(heroes);
    if (group.length) c.issue({ type: c.CMD.ATTACK_MOVE, unitIds: group.map((u) => u.id), x: posOf(foe).x, z: posOf(foe).z });
    const cat = cats.filter((u) => u.state === 'idle');
    if (cat.length && dist(posOf(foe), posOf(cat[0])) < 40) c.issue({ type: c.CMD.ATTACK_MOVE, unitIds: cat.map((u) => u.id), x: posOf(foe).x, z: posOf(foe).z });
    return;
  }
  troops.concat(cats, heroes).forEach((u) => {
    if (u.state === 'idle' && dist(posOf(u), rally) > 10) c.issue({ type: c.CMD.MOVE, unitIds: [u.id], x: rally.x, z: rally.z });
  });
}

/**
 * Esquadra: guarda o estreito (sem alvo, fica na água dele). Com a missão no Ato II, 5+ galés e nenhum navio inimigo a 80 u do estreito,
 * parte contra a doca viva mais próxima e volta ao estreito quando as 3 caíram. Fragatas inimigas a 85 u do estreito (ou a 60 u da doca
 * atacada) são o alvo prioritário.
 */
function fleet(c, { attack = true } = {}) {
  const ships = c.mine('war_galley');
  if (!ships.length) return;
  const strait = c.anchor('strait');
  const rt = c.gm.mission;
  const foes = c.gm.allUnits.filter((u) => !u.isDead && u.ownerId === 1 && (u.type === 'frigate' || u.type === 'dreadnought'));
  const docks = c.tagged('human_dock').filter((d) => !d.isDead);
  const act2 = rt.vars.act >= 2;
  const goDocks = attack && act2 && docks.length > 0 && ships.length >= 5 && !foes.some((u) => dist(posOf(u), strait) < 80);
  const target = goDocks ? nearest(docks, strait) : null;
  const near = foes.filter((u) => dist(posOf(u), target ? posOf(target) : strait) < (target ? 60 : 85));
  if (near.length) {
    const g = nearest(near, strait);
    const idle = ships.filter((u) => u.state !== 'attacking');
    if (idle.length) c.issue({ type: c.CMD.ATTACK_MOVE, unitIds: idle.map((u) => u.id), x: posOf(g).x, z: posOf(g).z });
    return;
  }
  if (target) {
    const idle = ships.filter((u) => u.state !== 'attacking');
    if (idle.length) c.issue({ type: c.CMD.ATTACK, unitIds: idle.map((u) => u.id), targetId: target.id });
    return;
  }
  const idle = ships.filter((u) => u.state === 'idle' || (u.state !== 'attacking' && u.state !== 'moving' && dist(posOf(u), strait) > 14));
  if (idle.length) c.issue({ type: c.CMD.ATTACK_MOVE, unitIds: idle.map((u) => u.id), x: strait.x, z: strait.z });
}

const loop = (opts) => [
  {
    name: 'robo',
    every: 5,
    each: (c) => { econ(c, opts); ground(c, opts); fleet(c, opts); },
    until: (c) => c.gm.isGameOver,
    timeout: 2700
  }
];

export const makeLoop = loop;
export const win = loop({ army: true, navy: true, attack: true });
/** Mesma economia, mas SEM treinar tropa, catapultas nem frota, e sem atacar: tem de perder para as levas. */
export const noArmy = loop({ army: false, navy: false, attack: false });
/** Depois do Ato III Drogath sai sozinho contra o inimigo (derrota por Drogath caído) se a base sem tropa ainda não caiu. */
export const lose = [
  { ...noArmy[0], each: (c) => { econ(c, { army: false, navy: false }); }, until: (c) => c.gm.isGameOver || (c.gm.mission.vars.act >= 3 && (c.gm.mission.vars.act3_clock ?? 0) >= 60) },
  {
    name: 'drogath-suicida',
    every: 5,
    each: (c) => {
      const dro = c.tagged('drogath')[0];
      const foes = c.gm.allUnits.filter((u) => !u.isDead && u.ownerId === 1 && u.type !== 'peon');
      if (dro && !dro.isDead && foes.length) c.issue({ type: c.CMD.ATTACK_MOVE, unitIds: [dro.id], x: posOf(nearest(foes, posOf(dro))).x, z: posOf(nearest(foes, posOf(dro))).z });
    },
    until: (c) => c.gm.isGameOver,
    timeout: 1200
  }
];

/**
 * Investida precoce: só as unidades do início (Drogath, Grok, as 2 Galés) marcham para a base humana sem treinar ninguém.
 * Tem de terminar SEM vitória (as levas, a guarda das docas e os Atos seguram).
 */
export const rush = [
  {
    name: 'investida',
    wait: 1,
    run: (c) => {
      const p = c.anchor('enemyStart');
      c.issue({ type: c.CMD.ATTACK_MOVE, unitIds: c.mine().filter((u) => u.type !== 'peon').map((u) => u.id), x: p.x, z: p.z });
    },
    each: () => {},
    until: (c) => c.seconds > 600 || c.gm.isGameOver,
    timeout: 700
  }
];
