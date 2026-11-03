/**
 * Roteiro de playthrough da m12 "O Bastião do Cabo Ferrugem" (M3-13), a missão final. Tudo por comandos reais do jogador.
 * Ato I: o Marco do Bastião (Centro) é evoluído ao nível 3; 4 Torres de Vigia e 8 trechos de Muralha (2 linhas de 4, `PLACE_WALL`) fecham
 * os dois desfiladeiros da crista; a Oficina treina as Balistas. Ato II: o Estaleiro treina Fragatas, que guardam o estreito e, com a missão
 * no Ato II, destroem as 3 Docas orcs e voltam ao estreito para o contador de 90 s. Ato III: a tropa (Cavaleiros, Arqueiros, Magos, Balistas
 * e os três heróis) segura o Marco contra Skarn, a guarda e o assalto anfíbio. Nada de teletransporte nem dano injetado.
 * O roteiro `lose` (mesma economia, sem tropa nem frota) PERDE para as levas.
 */
export const campaignId = 'war-alliance';
export const targetMinutes = 20; // ficha: Muito difícil/GG; o harness aceita até 2×.

import { buildPathfinder, floodFill, isReached } from '../../../src/data/maps/generator.js';

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const posOf = (e) => ({ x: e.mesh.position.x, z: e.mesh.position.z });
const nearest = (list, p) => list.slice().sort((a, b) => dist(posOf(a), p) - dist(posOf(b), p))[0];
const bot = (c) => (c.gm.__bot ||= { last: {}, upgraded: false });
const res = (c) => c.gm.getPlayer(0).resources;
const affordable = (c, cost) => Object.entries(cost).every(([k, v]) => (res(c)[k] || 0) >= v);
const count = (c, type) => c.gm.buildings.filter((x) => x.ownerId === 0 && x.type === type && !x.isDead).length;
/** O Marco do Bastião (Centro atrás da crista, tag `bastion_hall`). */
const colonyHall = (c) => c.tagged('bastion_hall').find((b) => !b.isDead);
const castleAt = (c) => c.bld('castle'); // o Paço (primeiro Centro construído do jogador)

/** 3 Aldeões para obra: os mais próximos de `near` que não estejam construindo. */
function builders(c, n = 3, near = c.anchor('playerStart')) {
  return c.mine('villager').filter((u) => u.state !== 'building').sort((a, b) => dist(posOf(a), near) - dist(posOf(b), near)).slice(0, n).map((u) => u.id);
}

/** O ponto (x, z) é alcançável por terra a partir do Paço? (o Cabo tem lascas de costa que os aldeões não alcançam: a obra ficaria presa). */
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
const homeOf = (c) => posOf(castleAt(c));
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

/** Papéis dos aldeões, por ordem de id (ouro, madeira, pedra). Só os ociosos recebem tarefa nova. */
const ROLES = ['gold', 'wood', 'wood', 'gold', 'stone', 'gold', 'wood', 'stone', 'gold', 'wood', 'wood', 'gold', 'stone', 'gold', 'wood', 'wood', 'gold', 'wood'];
function keepWorking(c) {
  const home = c.anchor('playerStart');
  const golds = c.gm.resourceDeposits.filter((r) => r.type === 'gold' && !r.isDead).sort((a, b) => dist(posOf(a), home) - dist(posOf(b), home));
  const stone = nearest(c.gm.resourceDeposits.filter((r) => r.type === 'stone' && !r.isDead), home);
  const camp = c.gm.buildings.find((x) => x.ownerId === 0 && x.type === 'lumber_camp' && !x.isDead && x.isConstructed);
  const trees = c.gm.trees.filter((t) => !t.isDead);
  const tree = nearest(trees, camp ? posOf(camp) : home);
  // madeira é o gargalo da frota: com pouca madeira e ouro sobrando, metade dos coletores troca para as árvores (a cada 25 s)
  const bk = (c.gm.__wk ||= { t: -99 });
  const swap = res(c).wood < 200 && res(c).gold > 500 && c.seconds - bk.t > 25;
  if (swap) bk.t = c.seconds;
  c.mine('villager').sort((a, b) => a.id - b.id).forEach((u, i) => {
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

const OBRAS = {
  cottage: { wood: 50 }, farm: { wood: 60 }, barracks: { wood: 120, stone: 60 }, lumber_camp: { wood: 80 },
  arcane_tower: { gold: 250, wood: 80, stone: 80 }, shipyard: { gold: 250, wood: 100 }, refinery: { gold: 100, wood: 150, stone: 50 },
  workshop: { gold: 180, wood: 100, stone: 40 }, watchtower: { wood: 80, stone: 40 }, walls: { wood: 40, stone: 80 }
};
/** Evolução do Marco a nível 3 (tiers.js: HQ_UPGRADE_COST[3]). */
const MARCO_LV3 = { gold: 1333, wood: 533, stone: 400, oil: 133 };

/** Serraria junto da árvore mais próxima da base. */
function camp(c) {
  const home = c.anchor('playerStart');
  const tree = nearest(c.gm.trees.filter((t) => !t.isDead), home);
  return placeAround(c, 'lumber_camp', posOf(tree), 5, 20);
}
/** Estaleiro: na costa, ao lado do poço de petróleo da Liga (well1). */
const shipyard = (c) => placeGrid(c, 'shipyard', c.anchor('well1'), 34);
function refinery(c) {
  const yard = c.bld('shipyard');
  if (!yard) return false;
  return placeGrid(c, 'refinery', posOf(yard), 36);
}
/** Torre de Vigia no ponto livre mais perto de uma das âncoras tower{A,B}{1,2} ainda sem torre. */
const TOWERS = ['towerA1', 'towerA2', 'towerB1', 'towerB2'];
const towerCount = (c) => c.gm.buildings.filter((x) => x.ownerId === 0 && x.type === 'watchtower' && !x.isDead).length;
function tower(c) {
  const name = TOWERS.find((n) => !c.gm.buildings.some((x) => x.ownerId === 0 && x.type === 'watchtower' && !x.isDead && dist(posOf(x), c.anchor(n)) < 6));
  if (!name) return false;
  const p = c.anchor(name);
  for (let r = 0; r <= 8; r += 1.5) {
    for (let a = 0; a < 8; a++) {
      const x = p.x + Math.cos((a * Math.PI) / 4) * r, z = p.z + Math.sin((a * Math.PI) / 4) * r;
      if (c.gm.canPlaceBuilding('watchtower', x, z, null, 0)) { c.issue({ type: c.CMD.PLACE_BUILDING, buildingType: 'watchtower', x, z, unitIds: builders(c, 3, p) }); return true; }
    }
  }
  return false;
}
/** Blocos de muralha do jogador (vivos, mesmo em obra) a menos de 8 u do centro do desfiladeiro `L`. */
const wallCount = (c, L) => c.gm.buildings.filter((x) => x.ownerId === 0 && x.type === 'wall_human' && !x.isDead && dist(posOf(x), c.anchor(`pass${L}`)) < 8).length;
function wall(c, L) {
  const pts = [1, 2, 3, 4].map((k) => c.anchor(`wall${L}${k}`));
  c.issue({ type: c.CMD.PLACE_WALL, buildingType: 'wall_human', points: pts, unitIds: builders(c, 4, c.anchor(`pass${L}`)) });
  return true;
}

// Estaleiro e Refinaria vêm primeiro: os poucos pontos de costa somem assim que as casas e a Fazenda se espalham.
const QUEUE = [
  { id: 'farm', cost: 'farm', done: (c) => count(c, 'farm') > 0, go: (c) => place(c, 'farm') },
  { id: 'camp', cost: 'lumber_camp', done: (c) => count(c, 'lumber_camp') > 0, go: camp },
  { id: 'barracks', cost: 'barracks', done: (c) => count(c, 'barracks') > 0, go: (c) => placeWide(c, 'barracks') },
  { id: 'shipyard', cost: 'shipyard', done: (c) => count(c, 'shipyard') > 0, go: shipyard },
  { id: 'refinery', cost: 'refinery', done: (c) => count(c, 'refinery') > 0, go: refinery },
  { id: 'workshop', cost: 'workshop', done: (c) => count(c, 'workshop') > 0, go: (c) => placeWide(c, 'workshop') },
  { id: 'wallA', cost: 'walls', done: (c) => wallCount(c, 'A') >= 4, go: (c) => wall(c, 'A') },
  { id: 'wallB', cost: 'walls', done: (c) => wallCount(c, 'B') >= 4, go: (c) => wall(c, 'B') },
  { id: 'tower1', cost: 'watchtower', done: (c) => towerCount(c) >= 1, go: tower },
  { id: 'tower2', cost: 'watchtower', done: (c) => towerCount(c) >= 2, go: tower },
  { id: 'tower3', cost: 'watchtower', done: (c) => towerCount(c) >= 3, go: tower },
  { id: 'tower4', cost: 'watchtower', done: (c) => towerCount(c) >= 4, go: tower },
  { id: 'arcane', cost: 'arcane_tower', done: (c) => count(c, 'arcane_tower') > 0, go: (c) => placeWide(c, 'arcane_tower') }
];

const TROOPS_TARGET = 22;
const FRIGATES_TARGET = 8;
const BALLISTAS = 3;

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
  const castle = castleAt(c);
  if (castle && c.mine('villager').length < 24 && castle.queue.length === 0) c.issue({ type: c.CMD.TRAIN, buildingId: castle.id, unitType: 'villager' });
  const popCap = c.gm.getPlayer(0).maxPopulation ?? 0;
  const pop = c.gm.getUnitsOf(0).filter((u) => !u.isDead).length;
  if (!unfinished && pop >= popCap - 6 && count(c, 'cottage') < 10 && affordable(c, OBRAS.cottage) && c.seconds - (b.last.cottage ?? -99) > 10) { if (placeWide(c, 'cottage', 16)) b.last.cottage = c.seconds; }
  // Marco do Bastião: evolução a nível 3 (uma vez) assim que o ouro, a madeira, a pedra e o petróleo cobrem o custo
  const hall = colonyHall(c);
  if (hall && !b.upgraded && hall.tier < 3 && !hall.upgrading && affordable(c, MARCO_LV3) && !unfinished) {
    c.issue({ type: c.CMD.UPGRADE_HQ, buildingId: hall.id });
    b.upgraded = true;
  }
  // a primeira obra pendente que cabe no bolso e acha lugar (uma que não acha lugar não trava as demais)
  if (!unfinished) {
    for (const q of QUEUE.filter((x) => !x.done(c))) {
      if (!affordable(c, OBRAS[q.cost]) || c.seconds - (b.last[q.id] ?? -99) <= 8) continue;
      b.last[q.id] = c.seconds;
      if (q.go(c)) break;
    }
  }
  // Petróleo: Petroleiros erguem a Plataforma nos poços do mar perto do estreito (well5, well6) e depois coletam
  const yard = c.bld('shipyard');
  if (navy && yard) {
    const tankers = c.mine('tanker');
    if (tankers.length + yard.queue.length < 2 && affordable(c, { gold: 100, wood: 60 }) && yard.queue.length < 2) c.issue({ type: c.CMD.TRAIN, buildingId: yard.id, unitType: 'tanker' });
    tankers.forEach((t, i) => {
      const d = wellAt(c, i % 2 ? 'well6' : 'well5');
      if (!d || t.state !== 'idle') return;
      if (!d.platform) { if (affordable(c, { gold: 180, wood: 60 })) c.issue({ type: c.CMD.PLACE_BUILDING, buildingType: 'oil_platform', x: posOf(d).x, z: posOf(d).z, unitIds: [t.id] }); }
      else if (d.platform.isConstructed) c.issue({ type: c.CMD.GATHER, unitIds: [t.id], targetId: d.id });
    });
    const frig = c.mine('frigate');
    if (frig.length + yard.queue.length < FRIGATES_TARGET && res(c).oil >= 100 && affordable(c, { gold: 200, wood: 100 }) && yard.queue.length < 2) c.issue({ type: c.CMD.TRAIN, buildingId: yard.id, unitType: 'frigate' });
  }
  if (!army) return;
  const rt = c.gm.mission;
  const arcane = c.bld('arcane_tower');
  if (arcane && !(navy && rt.vars.act === 2 && c.mine('frigate').length < FRIGATES_TARGET) && arcane.queue.length < 2 && c.mine('mage').length + arcane.queue.length < 4 && affordable(c, { gold: 150 })) c.issue({ type: c.CMD.TRAIN, buildingId: arcane.id, unitType: 'mage' });
  const workshop = c.bld('workshop');
  if (workshop && workshop.queue.length < 1 && c.mine('ballista').length + workshop.queue.length < BALLISTAS && affordable(c, { gold: 90, wood: 200, stone: 40 })) c.issue({ type: c.CMD.TRAIN, buildingId: workshop.id, unitType: 'ballista' });
  const barracks = c.bld('barracks');
  // no Ato II o ouro vai primeiro para a frota (cascos custam o dobro de petróleo e a frota é o que abre o estreito)
  const navyFirst = navy && rt.vars.act === 2 && c.mine('frigate').length < FRIGATES_TARGET && res(c).oil >= 100 && res(c).gold < 600;
  if (barracks && !navyFirst && barracks.queue.length < 3 && res(c).gold > 150 && c.mine().filter(isTroop).length < TROOPS_TARGET) {
    const n = rt.trainedCount(0, 'knight') + rt.trainedCount(0, 'archer');
    c.issue({ type: c.CMD.TRAIN, buildingId: barracks.id, unitType: n % 3 === 0 ? 'knight' : 'archer' });
  }
}

const isTroop = (u) => u.type !== 'villager' && !u.type.startsWith('hero_') && u.type !== 'tanker' && u.type !== 'frigate' && u.type !== 'gryphon_rider' && u.type !== 'barge' && u.type !== 'ballista';

/**
 * Tropa defensiva: todas as tropas (não heróis) e as Balistas ficam atrás da linha (entre o Marco e os desfiladeiros); quando um inimigo
 * (não galé) chega a 55 u do Marco, a tropa e os heróis Oren/Dorian atacam o mais próximo. Brann fica perto do Marco, usa o grito de guerra
 * e a postura defensiva quando há inimigo perto.
 */
function ground(c, { attack = true } = {}) {
  const brann = c.tagged('brann')[0];
  const enemies = c.gm.allUnits.filter((u) => !u.isDead && u.ownerId === 1);
  const hallB = colonyHall(c);
  const hall = hallB ? posOf(hallB) : c.anchor('bastionHall');
  if (brann && !brann.isDead) {
    const home = c.anchor('bastionHall', 0, -6);
    const near = enemies.filter((u) => dist(posOf(u), posOf(brann)) < 12);
    if (brann.hp < brann.maxHp * 0.75 && near.length >= 1) { c.issue({ type: c.CMD.MOVE, unitIds: [brann.id], x: c.anchor('playerStart').x, z: c.anchor('playerStart').z }); }
    else if (near.length >= 1) {
      c.issue({ type: c.CMD.CAST, unitIds: [brann.id], abilityId: 'hero_war_cry' });
      c.issue({ type: c.CMD.CAST, unitIds: [brann.id], abilityId: 'hero_defensive_stance' });
    } else if (dist(posOf(brann), home) > 6 && brann.state !== 'moving') c.issue({ type: c.CMD.MOVE, unitIds: [brann.id], x: home.x, z: home.z });
  }
  const rally = c.anchor('bastionHall', 0, 4);
  const troops = c.mine().filter(isTroop).sort((a, b) => a.id - b.id);
  const balistas = c.mine('ballista');
  const heroes = c.mine().filter((u) => u.type === 'hero_oren' || u.type === 'hero_dorian').concat(c.mine('gryphon_rider'));
  const threats = enemies.filter((u) => u.type !== 'peon' && u.type !== 'war_galley' && u.type !== 'iron_leviathan' && dist(posOf(u), hall) < 55);
  if (attack && threats.length) {
    const foe = nearest(threats, hall);
    const group = troops.concat(heroes);
    if (group.length) c.issue({ type: c.CMD.ATTACK_MOVE, unitIds: group.map((u) => u.id), x: posOf(foe).x, z: posOf(foe).z });
    const bal = balistas.filter((u) => u.state === 'idle');
    if (bal.length && dist(posOf(foe), posOf(bal[0])) < 40) c.issue({ type: c.CMD.ATTACK_MOVE, unitIds: bal.map((u) => u.id), x: posOf(foe).x, z: posOf(foe).z });
    return;
  }
  troops.concat(balistas, heroes).forEach((u) => {
    if (u.state === 'idle' && dist(posOf(u), rally) > 10) c.issue({ type: c.CMD.MOVE, unitIds: [u.id], x: rally.x, z: rally.z });
  });
}

/**
 * Esquadra: guarda o estreito (sem alvo, fica na água dele). Com a missão no Ato II, 5+ Fragatas e nenhum navio inimigo a 80 u do estreito,
 * parte contra a doca viva mais próxima e volta ao estreito quando as 3 caíram. Galés inimigas a 85 u do estreito (ou a 60 u da doca
 * atacada) são o alvo prioritário.
 */
function fleet(c, { attack = true } = {}) {
  const ships = c.mine('frigate');
  if (!ships.length) return;
  const strait = c.anchor('strait');
  const rt = c.gm.mission;
  const foes = c.gm.allUnits.filter((u) => !u.isDead && u.ownerId === 1 && (u.type === 'war_galley' || u.type === 'iron_leviathan'));
  const docks = c.tagged('orc_dock').filter((d) => !d.isDead);
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
/** Mesma economia, mas SEM treinar tropa, balistas, magos nem frota, e sem atacar: tem de perder para as levas. */
export const noArmy = loop({ army: false, navy: false, attack: false });
/** Pós AI-NAVAL a IA terrestre é mais lenta e a base sem tropa nem sempre cai a tempo: depois do Ato III o Capitão Brann sai sozinho contra o inimigo (derrota por Brann caído). */
export const lose = [
  { ...noArmy[0], until: (c) => c.gm.isGameOver || (c.gm.mission.vars.act >= 3 && (c.gm.mission.vars.act3_clock ?? 0) >= 60) },
  {
    name: 'brann-suicida',
    every: 5,
    each: (c) => {
      const brann = c.tagged('brann')[0];
      const foes = c.gm.allUnits.filter((u) => !u.isDead && u.ownerId === 1 && u.type !== 'peon');
      if (brann && !brann.isDead && foes.length) c.issue({ type: c.CMD.ATTACK_MOVE, unitIds: [brann.id], x: posOf(nearest(foes, posOf(brann))).x, z: posOf(nearest(foes, posOf(brann))).z });
    },
    until: (c) => c.gm.isGameOver,
    timeout: 1200
  }
];
