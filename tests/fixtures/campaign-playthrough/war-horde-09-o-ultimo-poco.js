/**
 * Roteiro de playthrough da m09 da Horda "O Último Poço" (M4-09, cabeça de ponte + contra-ofensiva de Dorian + morte de Ulma). Espelho da m09 da
 * Aliança (war-alliance-09-miragem.js) com os lados invertidos: a base do jogador é a margem LESTE (âncora `enemyStart`; o jogador usa o slot 1) e a
 * Aurelan de Dorian fica em `playerStart`. Tudo por comandos reais do jogador: Lacaios minam e constroem (Covil dos Ogros, 3 Torres de Vigia no sítio do
 * Forte do Poço, Ninho das Serpes, Tocas), o Acampamento treina Talhadores e Lanceiros-Machado, o Covil Ogros e o Ninho Serpes de Guerra. Até os três
 * poços completarem 1 min a tropa se divide em guardas dos poços; depois fica no ponto de espera atrás do Forte do Poço e ataca tudo o que chega a menos
 * de 45 u dele ou a 55 u do Salão (Drogath atrás da linha). Nada de teletransporte nem dano injetado. `noArmy` (só economia, nenhuma torre, nenhum
 * soldado novo) PERDE; `rush` (só as unidades do início sobre o Castelo de Aurelan) não vence.
 */
import { BUILDINGS } from '../../../src/data/buildings.js';

export const campaignId = 'war-horde';
export const targetMinutes = 11; // ficha: 20–25 min (jogador humano); a missão dura 8 min de resistência + a última leva; o harness aceita até 2×.

const HOME = 'enemyStart'; // base da Horda neste palco (margem leste)
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const posOf = (e) => ({ x: e.mesh.position.x, z: e.mesh.position.z });
const nearest = (list, p) => list.slice().sort((a, b) => dist(posOf(a), p) - dist(posOf(b), p))[0];
const bot = (c) => (c.gm.__bot ||= { last: {} });
const res = (c) => c.gm.getPlayer(0).resources;
const affordable = (c, type) => Object.entries(BUILDINGS[type].cost).every(([k, v]) => (res(c)[k] || 0) >= v);
const count = (c, type, done = false) => c.gm.buildings.filter((x) => x.ownerId === 0 && x.type === type && !x.isDead && (!done || x.isConstructed)).length;
const home = (c) => posOf(c.bld('great_hall'));
/** Ponto de espera da tropa: atrás do Forte do Poço, entre as torres e o Salão. */
const post = (c) => c.anchor('fortSite2', 7, 9);

/** Lacaios para obra: os mais próximos de `near` que não estejam construindo. */
function builders(c, near, n = 3) {
  return c.mine('peon').filter((u) => u.state !== 'building').sort((a, b) => dist(posOf(a), near) - dist(posOf(b), near)).slice(0, n).map((u) => u.id);
}

/** Primeiro ponto em volta de `center` onde `canPlaceBuilding` aceita (anéis, ordem fixa). */
function placeAround(c, type, center, minR = 4, maxR = 40, from = center) {
  for (let r = minR; r < maxR; r += 3) {
    for (let a = 0; a < 16; a++) {
      const ang = Math.PI * 0.25 + (((a % 2 ? 1 : -1) * Math.ceil(a / 2)) * Math.PI) / 8;
      const x = center.x + Math.cos(ang) * r;
      const z = center.z + Math.sin(ang) * r;
      if (c.gm.canPlaceBuilding(type, x, z, null, 0)) { c.issue({ type: c.CMD.PLACE_BUILDING, buildingType: type, x, z, unitIds: builders(c, from) }); return true; }
    }
  }
  return false;
}
const placeHome = (c, type, minR = 9, maxR = 52) => placeAround(c, type, home(c), minR, maxR);
/** Torres do Forte do Poço: dentro do anel de 24 u de `fortSite2` (a missão conta as torres ali), em volta do sítio. */
const placeTower = (c) => placeAround(c, 'orc_watchtower', c.anchor('fortSite2'), 3, 18, c.anchor('fortSite2'));

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
  { id: 'tower1', type: 'orc_watchtower', done: (c) => count(c, 'orc_watchtower') >= 1, go: placeTower },
  { id: 'den', type: 'ogre_den', done: (c) => count(c, 'ogre_den') > 0, go: (c) => placeHome(c, 'ogre_den') },
  { id: 'tower2', type: 'orc_watchtower', done: (c) => count(c, 'orc_watchtower') >= 2, go: placeTower },
  { id: 'tower3', type: 'orc_watchtower', done: (c) => count(c, 'orc_watchtower') >= 3, go: placeTower },
  { id: 'house2', type: 'orc_house', done: (c) => count(c, 'orc_house') > 1, go: (c) => placeHome(c, 'orc_house') },
  { id: 'nest', type: 'serpent_nest', done: (c) => count(c, 'serpent_nest') > 0, go: (c) => placeHome(c, 'serpent_nest') }
];

function econ(c, { withArmy = true } = {}) {
  const b = bot(c);
  keepWorking(c);
  const unfinished = c.gm.buildings.find((x) => x.ownerId === 0 && !x.isDead && !x.isConstructed && x.role !== 'wall');
  if (unfinished) { const vs = builders(c, posOf(unfinished)); if (vs.length) c.issue({ type: c.CMD.BUILD, unitIds: vs, buildingId: unfinished.id }); }
  const hall = c.bld('great_hall');
  const q = withArmy ? QUEUE.find((x) => !x.done(c)) : null;
  const reserve = q ? (BUILDINGS[q.type].cost.gold || 0) : 0;
  if (hall && c.mine('peon').length < 14 && hall.queue.length < 2 && (res(c).gold - reserve >= 50 || c.mine('peon').length < 5)) c.issue({ type: c.CMD.TRAIN, buildingId: hall.id, unitType: 'peon' });
  const popCap = c.gm.getPlayer(0).maxPopulation ?? 0;
  const pop = c.gm.getUnitsOf(0).filter((u) => !u.isDead).length;
  if (!unfinished && pop >= popCap - 3 && count(c, 'orc_house') < 8 && affordable(c, 'orc_house') && c.seconds - (b.last.house ?? -99) > 20 && placeHome(c, 'orc_house', 9)) b.last.house = c.seconds;
  if (q && !unfinished && affordable(c, q.type) && c.seconds - (b.last[q.id] ?? -99) > 12 && q.go(c)) b.last[q.id] = c.seconds;
  if (!withArmy) return;
  const den = c.bld('ogre_den');
  const bar = c.bld('orc_barracks');
  const nest = c.bld('serpent_nest');
  const have = (t) => c.mine(t).length + [den, bar, nest].filter(Boolean).reduce((n, x) => n + x.queue.filter((e) => (e.unitType ?? e.type) === t).length, 0);
  if (nest && nest.queue.length < 1 && res(c).gold - reserve >= 120 && have('war_serpent') < 4) c.issue({ type: c.CMD.TRAIN, buildingId: nest.id, unitType: 'war_serpent' });
  if (den && den.queue.length < 2 && res(c).gold - reserve >= 75 && have('ogre') < 8) c.issue({ type: c.CMD.TRAIN, buildingId: den.id, unitType: 'ogre' });
  // infantaria: Talhadores e Lanceiros-Machado (2 de cada 3 são antiaéreos) em ritmo contínuo
  if (bar && bar.queue.length < 2 && res(c).gold - reserve >= 40 && have('grunt') + have('axethrower') < 30) {
    c.issue({ type: c.CMD.TRAIN, buildingId: bar.id, unitType: (have('grunt') + have('axethrower')) % 3 === 0 ? 'grunt' : 'axethrower' });
  }
}

const isArmy = (u) => u.type !== 'peon' && u.type !== 'hero_drogath' && u.type !== 'necromancer';
const hostiles = (c) => c.gm.allUnits.filter((u) => !u.isDead && u.ownerId !== 0 && c.gm.isHostile(0, u.ownerId));

/** Drogath: Grito de Guerra e Golpe de Brasa quando o combate chega perto; fica atrás da linha (no ponto de espera). */
function hero(c) {
  const d = c.tagged('drogath')[0];
  if (!d || d.isDead) return;
  const near = hostiles(c).filter((u) => dist(posOf(u), posOf(d)) < 12);
  if (near.length) {
    c.issue({ type: c.CMD.CAST, unitIds: [d.id], abilityId: 'hero_war_cry' });
    const t = nearest(near, posOf(d));
    if (dist(posOf(t), posOf(d)) < 3) c.issue({ type: c.CMD.CAST, unitIds: [d.id], abilityId: 'hero_ember_strike', targetId: t.id });
    if (d.hp < d.maxHp * 0.6) c.issue({ type: c.CMD.CAST, unitIds: [d.id], abilityId: 'hero_clan_fire' });
  }
  const back = c.anchor(HOME, -10, -6);
  if (dist(posOf(d), back) > 10 && d.state !== 'moving' && !near.length) c.issue({ type: c.CMD.MOVE, unitIds: [d.id], x: back.x, z: back.z });
}

/**
 * Tropa: enquanto os poços não completaram 1 min, três guardas (um por poço); o resto espera no ponto de espera. Depois de completos, e sempre que um inimigo
 * (não naval) chega a 45 u do ponto de espera ou a 55 u do Salão, a tropa inteira ataca o mais próximo.
 */
function ground(c) {
  const troops = c.mine().filter(isArmy).sort((a, b) => a.id - b.id);
  const pt = post(c);
  const h = home(c);
  const wellsDone = c.status('p-wells') === 'completed';
  const threats = hostiles(c).filter((u) => u.layer !== 'naval' && (dist(posOf(u), pt) < 45 || dist(posOf(u), h) < 55));
  if (threats.length && troops.length) {
    const t = nearest(threats, pt);
    const idle = troops.filter((u) => u.state !== 'attacking');
    if (idle.length) c.issue({ type: c.CMD.ATTACK_MOVE, unitIds: idle.map((u) => u.id), x: posOf(t).x, z: posOf(t).z });
  } else {
    const wells = ['waterWell1', 'waterWell2', 'waterWell3'].map((n) => c.anchor(n));
    troops.forEach((u, i) => {
      if (u.state !== 'idle' && u.state !== 'holding') return;
      const dest = !wellsDone && i < 3 ? wells[i] : pt;
      if (dist(posOf(u), dest) > 6) c.issue({ type: c.CMD.MOVE, unitIds: [u.id], x: dest.x, z: dest.z });
    });
  }
  hero(c);
}

const loop = (opts = {}) => [
  {
    name: 'robo',
    every: 10,
    each: (c) => {
      econ(c, opts);
      if (opts.withArmy === false) return;
      ground(c);
    },
    until: (c) => c.gm.isGameOver,
    timeout: 2000
  }
];

export const makeLoop = loop;
export const win = loop({ withArmy: true });
/** Mesma economia, mas SEM torres nem soldados novos (só a tropa inicial parada): tem de perder (Grifos e a última leva derrubam o Salão). */
export const noArmy = loop({ withArmy: false });

/**
 * Investida precoce: só as unidades do início (Drogath, tropa da Barcaça, guarnição) marcham sobre o Castelo de Aurelan sem treinar ninguém.
 * Tem de terminar SEM vitória (o Castelo fica a ~150 u e a contra-ofensiva de Dorian segue de pé).
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
