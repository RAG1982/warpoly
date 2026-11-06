/**
 * Roteiro de playthrough da m08 da Horda "O Monte Caldeira" (M4-08, defesa do rito de Vozgul). Tudo por comandos reais do jogador: Lacaios minam, cortam
 * madeira e constroem (Casas, 3 Torres de Vigia, Covil dos Ogros); o Acampamento treina Talhadores e Lanceiros-Machado e o Covil, Ogros; o Petroleiro (da Doca
 * dada pela missão) ergue a Plataforma no poço do lago e bombeia para o Caldeirão; a Doca treina 2 Galés e depois os 2 Leviatãs de Ferro. A tropa fica entre
 * o Salão e a passagem de lava oeste e ataca tudo o que chega a menos de 70 u da base (Salão, Santuário ao norte, Fornalha Naval ao sul); os navios ficam no lago.
 * Drogath atrás da linha. Nada de teletransporte nem dano injetado. `noArmy` (mesma economia, nenhum soldado) PERDE; `rush` (só as unidades do início sobre a
 * base de Aurelan) não vence.
 */
import { BUILDINGS } from '../../../src/data/buildings.js';

export const campaignId = 'war-horde';
export const targetMinutes = 12; // ficha: 20–25 min (jogador humano); o rito dura 10 min e o robô vence aos 600 s; o harness aceita até 2×

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const posOf = (e) => ({ x: e.mesh.position.x, z: e.mesh.position.z });
const nearest = (list, p) => list.slice().sort((a, b) => dist(posOf(a), p) - dist(posOf(b), p))[0];
const bot = (c) => (c.gm.__bot ||= { last: {}, heroHome: false, levi: 0 });
const res = (c) => c.gm.getPlayer(0).resources;
const affordable = (c, type) => Object.entries(BUILDINGS[type].cost).every(([k, v]) => (res(c)[k] || 0) >= v);
const count = (c, type, done = false) => c.gm.buildings.filter((x) => x.ownerId === 0 && x.type === type && !x.isDead && (!done || x.isConstructed)).length;
const home = (c) => posOf(c.bld('great_hall'));
/** Ponto de espera da tropa: entre o Salão e a passagem de lava oeste (a leva de Aurelan vem por ali). */
const post = (c) => c.anchor('lavaPass4', 10, 0);

/** Lacaios para obra: os mais próximos do Salão que não estejam construindo. */
function builders(c, n = 3) {
  const h = home(c);
  return c.mine('peon').filter((u) => u.state !== 'building').sort((a, b) => dist(posOf(a), h) - dist(posOf(b), h)).slice(0, n).map((u) => u.id);
}

/** Primeiro ponto em volta de `center` onde `canPlaceBuilding` aceita (varredura em anéis, ordem fixa). */
function placeAround(c, type, center, minR = 6, maxR = 50) {
  for (let r = minR; r < maxR; r += 3) {
    for (let a = 0; a < 16; a++) {
      const ang = (((a % 2 ? 1 : -1) * Math.ceil(a / 2)) * Math.PI) / 8;
      const x = center.x + Math.cos(ang) * r;
      const z = center.z + Math.sin(ang) * r;
      if (c.gm.canPlaceBuilding(type, x, z, null, 0)) { c.issue({ type: c.CMD.PLACE_BUILDING, buildingType: type, x, z, unitIds: builders(c) }); return true; }
    }
  }
  return false;
}

/** Papéis dos Lacaios por ordem de id: ouro, madeira e um pouco de pedra. */
const ROLES = ['gold', 'wood', 'gold', 'wood', 'gold', 'stone', 'wood', 'gold', 'gold', 'wood', 'gold', 'wood', 'gold', 'wood', 'gold', 'wood'];
function keepWorking(c) {
  const h = home(c);
  const golds = c.gm.resourceDeposits.filter((r) => r.type === 'gold' && !r.isDead).sort((a, b) => dist(posOf(a), h) - dist(posOf(b), h));
  const stone = nearest(c.gm.resourceDeposits.filter((r) => r.type === 'stone' && !r.isDead), h);
  const mill = c.bld('orc_lumber_mill');
  const tree = nearest(c.gm.trees.filter((t) => !t.isDead), mill ? posOf(mill) : h);
  c.mine('peon').sort((a, b) => a.id - b.id).forEach((u, i) => {
    if (u.state !== 'idle') return;
    let role = ROLES[i % ROLES.length];
    if (role === 'stone' && res(c).stone > 300) role = 'wood';
    if (role === 'wood' && res(c).wood > 600) role = 'gold';
    if (role === 'gold' && res(c).wood < 150 && res(c).gold > 300) role = 'wood';
    const target = role === 'stone' ? stone : role === 'wood' ? tree : golds[0];
    if (target) c.issue({ type: c.CMD.GATHER, unitIds: [u.id], targetId: target.id });
  });
}

/** Fila de obras (uma de cada vez): Covil dos Ogros, 3 Torres (passagem oeste, Santuário, lago) e Casas. */
const QUEUE = [
  { id: 'den', type: 'ogre_den', center: (c) => home(c), minR: 9, done: (c) => count(c, 'ogre_den') > 0 },
  { id: 'tower1', type: 'orc_watchtower', center: (c) => c.anchor('lavaPass4', 14, 0), minR: 2, done: (c) => count(c, 'orc_watchtower') >= 1 },
  { id: 'tower2', type: 'orc_watchtower', center: (c) => c.anchor('sanctum', -8, -8), minR: 2, done: (c) => count(c, 'orc_watchtower') >= 2 },
  { id: 'tower3', type: 'orc_watchtower', center: (c) => c.anchor('enemyStart', -2, -18), minR: 2, done: (c) => count(c, 'orc_watchtower') >= 3 },
  { id: 'house2', type: 'orc_house', center: (c) => home(c), minR: 9, done: (c) => count(c, 'orc_house') > 1 }
];

function econ(c, { withArmy = true } = {}) {
  const b = bot(c);
  keepWorking(c);
  const unfinished = c.gm.buildings.find((x) => x.ownerId === 0 && !x.isDead && !x.isConstructed && x.role !== 'wall');
  if (unfinished) { const vs = builders(c); if (vs.length) c.issue({ type: c.CMD.BUILD, unitIds: vs, buildingId: unfinished.id }); }
  const hall = c.bld('great_hall');
  const q = QUEUE.find((x) => !x.done(c));
  const reserve = (q ? (BUILDINGS[q.type].cost.gold || 0) : 0) + (levWant(c) ? 420 : 0);
  if (hall && c.mine('peon').length < 14 && hall.queue.length < 2 && (res(c).gold - reserve >= 50 || c.mine('peon').length < 5)) c.issue({ type: c.CMD.TRAIN, buildingId: hall.id, unitType: 'peon' });
  const popCap = c.gm.getPlayer(0).maxPopulation ?? 0;
  const pop = c.gm.getUnitsOf(0).filter((u) => !u.isDead).length;
  if (!unfinished && pop >= popCap - 3 && count(c, 'orc_house') < 8 && affordable(c, 'orc_house') && c.seconds - (b.last.house ?? -99) > 20 && placeAround(c, 'orc_house', home(c), 9)) b.last.house = c.seconds;
  if (q && !unfinished && affordable(c, q.type) && c.seconds - (b.last[q.id] ?? -99) > 12 && placeAround(c, q.type, q.center(c), q.minR)) b.last[q.id] = c.seconds;
  navy(c, unfinished);
  if (!withArmy) return;
  const den = c.bld('ogre_den');
  const bar = c.bld('orc_barracks');
  const have = (t) => c.mine(t).length + [den, bar].filter(Boolean).reduce((n, x) => n + x.queue.filter((e) => (e.unitType ?? e.type) === t).length, 0);
  if (den && den.queue.length < 2 && res(c).gold - reserve >= 75 && have('ogre') < 8) c.issue({ type: c.CMD.TRAIN, buildingId: den.id, unitType: 'ogre' });
  if (bar && bar.queue.length < 2 && res(c).gold - reserve >= 40 && have('grunt') + have('axethrower') < 26) {
    c.issue({ type: c.CMD.TRAIN, buildingId: bar.id, unitType: (have('grunt') + have('axethrower')) % 3 === 2 ? 'axethrower' : 'grunt' });
  }
}

/** Os Leviatãs entram assim que a linha tem 12 soldados (depois de 4 min): o ouro fica reservado para eles, e a artilharia naval responde às Fragatas do lago. */
const levWant = (c) => c.seconds > 240 && c.mine().filter(isArmy).length >= 12 && c.status('p-leviathans') !== 'completed' && c.mine('iron_leviathan').length < 2;

/** Marinha: Petroleiro → Plataforma no poço do lago → óleo; Galés e, com óleo, os Leviatãs de Ferro. */
function navy(c) {
  const dock = c.bld('ship_dock');
  if (!dock) return;
  const tankers = c.mine('tanker');
  const well = c.anchor('well3');
  const dep = c.gm.resourceDeposits.find((r) => r.type === 'oil' && dist(posOf(r), well) < 2);
  if (tankers.length + dock.queue.filter((e) => (e.unitType ?? e.type) === 'tanker').length < 1 && res(c).gold >= 100 && res(c).wood >= 60) c.issue({ type: c.CMD.TRAIN, buildingId: dock.id, unitType: 'tanker' });
  tankers.forEach((t) => {
    if (!dep || t.state !== 'idle') return;
    if (!dep.platform || !dep.platform.isConstructed) { if (!dep.platform && res(c).gold >= 180 && res(c).wood >= 60) c.issue({ type: c.CMD.PLACE_BUILDING, buildingType: 'oil_platform', x: posOf(dep).x, z: posOf(dep).z, unitIds: [t.id] }); }
    else c.issue({ type: c.CMD.GATHER, unitIds: [t.id], targetId: dep.id });
  });
  const queued = (t) => dock.queue.filter((e) => (e.unitType ?? e.type) === t).length;
  const army = c.mine().filter(isArmy).length;
  const late = c.seconds > 240 && army >= 12; // o ouro vai primeiro para a tropa; os Leviatãs só depois da linha formada
  if (late && c.status('p-leviathans') !== 'completed' && c.mine('iron_leviathan').length + queued('iron_leviathan') < 2 && dock.queue.length === 0 && res(c).oil >= 240 && res(c).gold >= 300 + 120 && res(c).wood >= 200) {
    c.issue({ type: c.CMD.TRAIN, buildingId: dock.id, unitType: 'iron_leviathan' });
  } else if (late && c.mine('war_galley').length + queued('war_galley') < 2 && dock.queue.length === 0 && res(c).oil >= 100 && res(c).gold >= 500 && c.mine('iron_leviathan').length >= 1) {
    c.issue({ type: c.CMD.TRAIN, buildingId: dock.id, unitType: 'war_galley' });
  }
  // navios ficam no lago, perto do poço (intercepta quem entra)
  const lake = c.anchor('well3', -4, 6);
  const ships = [...c.mine('iron_leviathan'), ...c.mine('war_galley')];
  const raiders = c.gm.allUnits.filter((u) => !u.isDead && u.ownerId === 1 && u.layer === 'naval' && dist(posOf(u), lake) < 60);
  const target = raiders.length ? posOf(nearest(raiders, lake)) : lake;
  ships.forEach((u) => { if ((u.state === 'idle' || raiders.length) && dist(posOf(u), target) > 10) c.issue({ type: c.CMD.ATTACK_MOVE, unitIds: [u.id], x: target.x, z: target.z }); });
}

const isArmy = (u) => u.type !== 'peon' && u.type !== 'hero_drogath' && u.type !== 'necromancer' && u.layer !== 'naval' && u.type !== 'tanker' && u.type !== 'arsonist';
const hostiles = (c) => c.gm.allUnits.filter((u) => !u.isDead && u.ownerId !== 0 && c.gm.isHostile(0, u.ownerId));

/** Drogath: Grito de Guerra e Golpe de Brasa quando o combate chega perto; fica no ponto de espera. */
function hero(c) {
  const d = c.tagged('drogath')[0];
  if (!d || d.isDead) return;
  const near = hostiles(c).filter((u) => dist(posOf(u), posOf(d)) < 12);
  const b = bot(c);
  if (d.hp < d.maxHp * 0.7) b.heroHome = true;
  if (near.length) {
    c.issue({ type: c.CMD.CAST, unitIds: [d.id], abilityId: 'hero_war_cry' });
    const t = nearest(near, posOf(d));
    if (dist(posOf(t), posOf(d)) < 3) c.issue({ type: c.CMD.CAST, unitIds: [d.id], abilityId: 'hero_ember_strike', targetId: t.id });
    if (d.hp < d.maxHp * 0.6) c.issue({ type: c.CMD.CAST, unitIds: [d.id], abilityId: 'hero_clan_fire' });
  }
  const back = c.anchor('enemyStart', -6, 4);
  if (dist(posOf(d), back) > 10 && d.state !== 'moving' && !near.length) c.issue({ type: c.CMD.MOVE, unitIds: [d.id], x: back.x, z: back.z });
}

/** Defesa: a tropa espera no ponto de espera e ataca o que chegar a menos de 75 u do Salão (cobre o Santuário e a Fornalha), sem perseguir longe. */
function defend(c) {
  const h = home(c);
  const pt = post(c);
  const troops = c.mine().filter(isArmy);
  const threats = hostiles(c).filter((u) => dist(posOf(u), h) < 75 && u.layer !== 'naval');
  if (threats.length && troops.length) {
    const t = nearest(threats, pt);
    const p = posOf(t);
    c.issue({ type: c.CMD.ATTACK_MOVE, unitIds: troops.map((u) => u.id), x: p.x, z: p.z });
  } else {
    const far = troops.filter((u) => dist(posOf(u), pt) > 14);
    if (far.length) c.issue({ type: c.CMD.MOVE, unitIds: far.map((u) => u.id), x: pt.x, z: pt.z });
    const near = troops.filter((u) => dist(posOf(u), pt) <= 14 && u.state === 'idle');
    if (near.length) c.issue({ type: c.CMD.HOLD, unitIds: near.map((u) => u.id) });
  }
  hero(c);
}

const loop = (opts = {}) => [
  {
    name: 'robo',
    every: 20,
    each: (c) => {
      econ(c, opts);
      if (opts.withArmy === false) return;
      defend(c);
    },
    until: (c) => c.gm.isGameOver,
    timeout: 2000
  }
];

export const makeLoop = loop;
export const win = loop({ withArmy: true });
/** Mesma economia, mas SEM tropa nenhuma além da inicial: tem de perder (as levas derrubam o Santuário, a Fornalha ou o Salão). */
export const noArmy = loop({ withArmy: false });

/**
 * Investida precoce: só as unidades do início (Drogath, Talhadores, Lanceiros-Machado, Zarruk) marcham sobre a base de Aurelan sem treinar ninguém.
 * Tem de terminar SEM vitória (o rito dura 10 min e os Leviatãs não saem).
 */
export const rush = [
  {
    name: 'investida',
    wait: 1,
    run: (c) => {
      const p = c.anchor('playerStart');
      c.issue({ type: c.CMD.ATTACK_MOVE, unitIds: c.mine().filter((u) => u.type !== 'peon').map((u) => u.id), x: p.x, z: p.z });
    },
    each: () => {},
    until: (c) => c.seconds > 600 || c.gm.isGameOver,
    timeout: 700
  }
];

/** Derrota: o jogador local é aniquilado antes de qualquer objetivo. */
export const lose = [
  {
    name: 'aniquilado',
    wait: 5,
    run: (c) => {
      const killer = c.gm.allUnits.find((u) => u.ownerId === 1);
      for (const u of c.mine()) u.takeDamage(1e6, killer);
      for (const b of c.gm.buildings.filter((x) => x.ownerId === 0)) b.takeDamage(1e6, killer);
    }
  }
];
