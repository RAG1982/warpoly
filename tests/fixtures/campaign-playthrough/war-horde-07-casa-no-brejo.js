/**
 * Roteiro de playthrough da m07 da Horda "Casa no Brejo" (M4-07, defesa + traição). Tudo por comandos reais do jogador: Lacaios minam e constroem
 * (3 Cercados de Javalis, 2 Torres de Vigia, Covil dos Ogros, Tocas), o Acampamento treina Talhadores e Lanceiros-Machado e o Covil Ogros. Até a traição
 * (330 s) e durante as levas de Aurelan o exército fica à frente do Salão, na direção da praia, e ataca tudo o que chega a menos de 50 u da base (Drogath
 * atrás da linha). Só depois de repelir as 3 levas e sobreviver 150 s à traição a tropa marcha sobre o Salão de Hurgan (um ponto de reunião antes do alvo)
 * e depois sobre a Forja de ferro. Nada de teletransporte nem dano injetado. `noArmy` (mesma economia, nenhum soldado) PERDE; `rush` (só as unidades do
 * início sobre o Salão de Hurgan) não vence.
 */
import { BUILDINGS } from '../../../src/data/buildings.js';

export const campaignId = 'war-horde';
export const targetMinutes = 14; // ficha: 18–22 min (jogador humano); o harness aceita até 2×

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const posOf = (e) => ({ x: e.mesh.position.x, z: e.mesh.position.z });
const nearest = (list, p) => list.slice().sort((a, b) => dist(posOf(a), p) - dist(posOf(b), p))[0];
const bot = (c) => (c.gm.__bot ||= { last: {}, launched: false, target: null, rally: null, rallySince: 0, go: false });
const res = (c) => c.gm.getPlayer(0).resources;
const affordable = (c, type) => Object.entries(BUILDINGS[type].cost).every(([k, v]) => (res(c)[k] || 0) >= v);
const count = (c, type, done = false) => c.gm.buildings.filter((x) => x.ownerId === 0 && x.type === type && !x.isDead && (!done || x.isConstructed)).length;
const home = (c) => posOf(c.bld('great_hall'));
/** Ponto de espera da tropa: entre o Salão e a praia dos desembarques (nordeste), colado à base. */
const post = (c) => c.anchor('playerStart', 12, 12);

/** Lacaios para obra: os mais próximos do Salão que não estejam construindo. */
function builders(c, n = 3) {
  const h = home(c);
  return c.mine('peon').filter((u) => u.state !== 'building').sort((a, b) => dist(posOf(a), h) - dist(posOf(b), h)).slice(0, n).map((u) => u.id);
}

/** Primeiro ponto em volta do Salão onde `canPlaceBuilding` aceita (varredura em anéis, ordem fixa, de preferência para o lado oposto à praia). */
function place(c, type, minR = 9, maxR = 52) {
  const p = home(c);
  for (let r = minR; r < maxR; r += 3) {
    for (let a = 0; a < 16; a++) {
      const ang = Math.PI * 1.15 + (((a % 2 ? 1 : -1) * Math.ceil(a / 2)) * Math.PI) / 8;
      const x = p.x + Math.cos(ang) * r;
      const z = p.z + Math.sin(ang) * r;
      if (c.gm.canPlaceBuilding(type, x, z, null, 0)) { c.issue({ type: c.CMD.PLACE_BUILDING, buildingType: type, x, z, unitIds: builders(c) }); return true; }
    }
  }
  return false;
}

/** Papéis dos Lacaios por ordem de id: ouro, madeira e um pouco de pedra. */
const ROLES = ['gold', 'gold', 'wood', 'gold', 'wood', 'stone', 'gold', 'wood', 'gold', 'gold', 'wood', 'gold', 'wood', 'gold', 'wood', 'gold'];
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
    if (role === 'wood' && res(c).wood > 700) role = 'gold';
    if (role === 'gold' && res(c).wood < 150 && res(c).gold > 300) role = 'wood';
    const target = role === 'stone' ? stone : role === 'wood' ? tree : golds[i % Math.max(1, Math.min(golds.length, 2))];
    if (target) c.issue({ type: c.CMD.GATHER, unitIds: [u.id], targetId: target.id });
  });
}

/** Fila de obras: uma de cada vez; o robô só passa à seguinte quando a atual já foi posta. */
const QUEUE = [
  { id: 'farm1', type: 'pig_farm', done: (c) => count(c, 'pig_farm') >= 1 },
  { id: 'farm2', type: 'pig_farm', done: (c) => count(c, 'pig_farm') >= 2 },
  { id: 'farm3', type: 'pig_farm', done: (c) => count(c, 'pig_farm') >= 3 },
  { id: 'tower1', type: 'orc_watchtower', done: (c) => count(c, 'orc_watchtower') >= 1 },
  { id: 'den', type: 'ogre_den', done: (c) => count(c, 'ogre_den') > 0 },
  { id: 'tower2', type: 'orc_watchtower', done: (c) => count(c, 'orc_watchtower') >= 2 },
  { id: 'house2', type: 'orc_house', done: (c) => count(c, 'orc_house') > 1 }
];

function econ(c, { withArmy = true } = {}) {
  const b = bot(c);
  keepWorking(c);
  const unfinished = c.gm.buildings.find((x) => x.ownerId === 0 && !x.isDead && !x.isConstructed && x.role !== 'wall');
  if (unfinished) { const vs = builders(c); if (vs.length) c.issue({ type: c.CMD.BUILD, unitIds: vs, buildingId: unfinished.id }); }
  const hall = c.bld('great_hall');
  const q = QUEUE.find((x) => !x.done(c));
  const reserve = q ? (BUILDINGS[q.type].cost.gold || 0) : 0;
  if (hall && c.mine('peon').length < 14 && hall.queue.length < 2 && (res(c).gold - reserve >= 50 || c.mine('peon').length < 5)) c.issue({ type: c.CMD.TRAIN, buildingId: hall.id, unitType: 'peon' });
  const popCap = c.gm.getPlayer(0).maxPopulation ?? 0;
  const pop = c.gm.getUnitsOf(0).filter((u) => !u.isDead).length;
  if (!unfinished && pop >= popCap - 3 && count(c, 'orc_house') < 8 && affordable(c, 'orc_house') && c.seconds - (b.last.house ?? -99) > 20 && place(c, 'orc_house', 9)) b.last.house = c.seconds;
  if (q && !unfinished && affordable(c, q.type) && c.seconds - (b.last[q.id] ?? -99) > 12 && place(c, q.type, q.type === 'orc_watchtower' ? 12 : 9)) b.last[q.id] = c.seconds;
  if (!withArmy) return;
  const den = c.bld('ogre_den');
  const bar = c.bld('orc_barracks');
  const have = (t) => c.mine(t).length + [den, bar].filter(Boolean).reduce((n, x) => n + x.queue.filter((e) => (e.unitType ?? e.type) === t).length, 0);
  if (den && den.queue.length < 2 && res(c).gold - reserve >= 75 && have('ogre') < 8) c.issue({ type: c.CMD.TRAIN, buildingId: den.id, unitType: 'ogre' });
  // infantaria: Talhadores e Lanceiros-Machado em ritmo contínuo (o ouro do Covil fica reservado só enquanto o Covil não existe)
  if (bar && bar.queue.length < 2 && res(c).gold - reserve >= 40 && have('grunt') + have('axethrower') < 26) {
    c.issue({ type: c.CMD.TRAIN, buildingId: bar.id, unitType: (have('grunt') + have('axethrower')) % 3 === 2 ? 'axethrower' : 'grunt' });
  }
}

const isArmy = (u) => u.type !== 'peon' && u.type !== 'hero_drogath' && u.type !== 'necromancer';
const hostiles = (c) => c.gm.allUnits.filter((u) => !u.isDead && u.ownerId !== 0 && c.gm.isHostile(0, u.ownerId));

/** Drogath: Grito de Guerra e Golpe de Brasa quando o combate chega perto; fica atrás da linha (no ponto de espera) e só segue a tropa na marcha. */
function hero(c, armyPos, targetPos) {
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
  const back = c.anchor('playerStart', 4, 6);
  if (b.heroHome || !armyPos) { if (dist(posOf(d), back) > 8 && d.state !== 'moving' && !near.length) c.issue({ type: c.CMD.MOVE, unitIds: [d.id], x: back.x, z: back.z }); return; }
  const L = Math.max(1, dist(armyPos, targetPos));
  const spot = { x: armyPos.x - ((targetPos.x - armyPos.x) / L) * 14, z: armyPos.z - ((targetPos.z - armyPos.z) / L) * 14 };
  if (dist(posOf(d), spot) > 6 && d.state !== 'moving') c.issue({ type: c.CMD.MOVE, unitIds: [d.id], x: spot.x, z: spot.z });
}

/** Defesa: a tropa espera no ponto de espera (em posição firme) e ataca o que chegar a menos de 55 u do Salão, sem perseguir longe. */
function defend(c) {
  const h = home(c);
  const pt = post(c);
  const troops = c.mine().filter(isArmy);
  const threats = hostiles(c).filter((u) => dist(posOf(u), h) < 55 && u.layer !== 'naval');
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
  hero(c, null, null);
}

/** Alvo da marcha: o Salão do traidor; depois a Forja de ferro. */
function pickTarget(c) {
  const hall = c.tagged('traitor_hall').filter((x) => !x.isDead);
  if (hall.length) return hall[0];
  const depot = c.tagged('iron_depot').filter((x) => !x.isDead);
  return depot.length ? depot[0] : null;
}

/** Marcha sobre Hurgan: reúne a ~30 u do alvo, depois ataca em bloco; quem fica parado avança. Defende a base se o inimigo chega a ela. */
function march(c) {
  const b = bot(c);
  const units = c.mine().filter(isArmy);
  if (units.length === 0) return;
  const pos = { x: units.reduce((t, u) => t + u.mesh.position.x, 0) / units.length, z: units.reduce((t, u) => t + u.mesh.position.z, 0) / units.length };
  const tgt = pickTarget(c);
  if (!tgt) return;
  const tp = posOf(tgt);
  const h = home(c);
  // incursão pesada na base (4+ a 35 u do Salão): a tropa que está perto dela volta e luta
  const raid = hostiles(c).filter((u) => dist(posOf(u), h) < 35 && u.layer !== 'naval');
  if (raid.length >= 4) {
    const t = nearest(raid, h);
    const homeTroops = units.filter((u) => dist(posOf(u), h) < 60);
    if (homeTroops.length) { c.issue({ type: c.CMD.ATTACK_MOVE, unitIds: homeTroops.map((u) => u.id), x: posOf(t).x, z: posOf(t).z }); }
  }
  if (b.target !== tgt.id) {
    b.target = tgt.id;
    const L = Math.max(1, dist(pos, tp));
    b.rally = L > 40 ? { x: tp.x + ((pos.x - tp.x) / L) * 30, z: tp.z + ((pos.z - tp.z) / L) * 30 } : null;
    b.rallySince = c.seconds;
    b.go = !b.rally;
    c.issue({ type: c.CMD.MOVE, unitIds: units.map((u) => u.id), x: (b.rally || tp).x, z: (b.rally || tp).z });
  }
  if (!b.go) {
    const arrived = units.filter((u) => dist(posOf(u), b.rally) < 14).length;
    if (arrived >= Math.ceil(units.length * 0.8) || c.seconds - b.rallySince > 150) b.go = true;
    else { const lost = units.filter((u) => (u.state === 'idle' || u.state === 'holding') && dist(posOf(u), b.rally) >= 14); if (lost.length) c.issue({ type: c.CMD.MOVE, unitIds: lost.map((u) => u.id), x: b.rally.x, z: b.rally.z }); }
  }
  if (b.go) {
    const idle = units.filter((u) => u.state === 'idle' || u.state === 'holding' || u.state === 'moving');
    if (idle.length) c.issue({ type: c.CMD.ATTACK_MOVE, unitIds: idle.map((u) => u.id), x: tp.x, z: tp.z });
  }
  hero(c, null, null); // Drogath fica em casa na marcha: sem ele a missão está perdida
}

/** Só marcha depois das 3 levas repelidas, dos 150 s de traição sobrevividos e com tropa de verdade (ou depois dos 13 min). */
const READY = (c) => {
  const b = bot(c);
  if (!b.launched && c.status('p-landings') === 'completed' && c.status('p-survive') === 'completed' && (c.mine().filter(isArmy).length >= 26 || c.seconds > 780)) b.launched = true;
  return b.launched;
};

const loop = (opts = {}) => [
  {
    name: 'robo',
    every: 20,
    each: (c) => {
      econ(c, opts);
      if (opts.withArmy === false) return;
      if (READY(c)) march(c); else defend(c);
    },
    until: (c) => c.gm.isGameOver,
    timeout: 2000
  }
];

export const makeLoop = loop;
export const win = loop({ withArmy: true });
/** Mesma economia, mas SEM tropa nenhuma além da inicial: tem de perder (as levas e a traição derrubam o Salão). */
export const noArmy = loop({ withArmy: false });

/**
 * Investida precoce: só as unidades do início (Drogath, Talhadores, Lanceiro-Machado, 2 Necromantes) marcham sobre o Salão de Hurgan sem treinar ninguém.
 * Tem de terminar SEM vitória (o traidor e as levas de Aurelan seguram).
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
