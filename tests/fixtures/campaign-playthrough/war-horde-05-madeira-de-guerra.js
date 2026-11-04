/**
 * Roteiro de playthrough da m05 da Horda "Madeira de Guerra" (M4-05, assalto ao bosque-forte). Tudo por comandos reais do jogador: Lacaios minam, cortam madeira e
 * constroem (Cercado de Javalis, Moinho de Madeira junto do bosque, Acampamento de Guerra, Santuário das Cinzas, Ninho das Serpes, Tocas), o Acampamento treina
 * Lanceiros-Machado e Talhadores (os Lanceiros respondem aos Grifos), o Santuário Necromantes e o Ninho Serpes de Guerra. A tropa defende a base contra as levas
 * (Grifos incluídos) e só depois marcha sobre o bosque-forte. Nada de teletransporte nem dano injetado. Drogath fica na retaguarda (reserva).
 * O robô só VENCE se montar o exército: o roteiro `noArmy` (mesma economia, nenhum soldado nem conjurador) PERDE para as levas; a investida precoce com as unidades
 * do início (`rush`) não derruba o bosque-forte.
 */
import { BUILDINGS } from '../../../src/data/buildings.js';

export const campaignId = 'war-horde';
export const targetMinutes = 14; // ficha: 18–22 min (jogador humano); o harness aceita até 2×. O robô não pensa nem olha a câmera.

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const posOf = (e) => ({ x: e.mesh.position.x, z: e.mesh.position.z });
const nearest = (list, p) => list.slice().sort((a, b) => dist(posOf(a), p) - dist(posOf(b), p))[0];
const bot = (c) => (c.gm.__bot ||= { last: {}, launched: false });
const res = (c) => c.gm.getPlayer(0).resources;
const affordable = (c, type) => Object.entries(BUILDINGS[type].cost).every(([k, v]) => (res(c)[k] || 0) >= v);
const count = (c, type, done = false) => c.gm.buildings.filter((x) => x.ownerId === 0 && x.type === type && !x.isDead && (!done || x.isConstructed)).length;
const homeOf = (c) => posOf(c.bld('great_hall'));

/** Lacaios para obra: os mais próximos do Salão que não estejam construindo. */
function builders(c, n = 3) {
  const h = homeOf(c);
  return c.mine('peon').filter((u) => u.state !== 'building').sort((a, b) => dist(posOf(a), h) - dist(posOf(b), h)).slice(0, n).map((u) => u.id);
}

/** Primeiro ponto em volta de `center` onde `canPlaceBuilding` aceita (varredura em anéis, ordem fixa). */
function placeAround(c, type, center, minR = 8, maxR = 44) {
  for (let r = minR; r < maxR; r += 2.5) {
    for (let a = 0; a < 16; a++) {
      const ang = (((a % 2 ? 1 : -1) * Math.ceil(a / 2)) * Math.PI) / 8;
      const x = center.x + Math.cos(ang) * r;
      const z = center.z + Math.sin(ang) * r;
      if (c.gm.canPlaceBuilding(type, x, z, null, 0)) { c.issue({ type: c.CMD.PLACE_BUILDING, buildingType: type, x, z, unitIds: builders(c) }); return true; }
    }
  }
  return false;
}
const place = (c, type, minR = 9) => placeAround(c, type, homeOf(c), minR, 44);

/** Moinho de Madeira junto do bosque mais próximo da base. */
function mill(c) {
  const tree = nearest(c.gm.trees.filter((t) => !t.isDead), c.anchor('playerStart'));
  return placeAround(c, 'orc_lumber_mill', posOf(tree), 5, 20);
}

/** Papéis dos Lacaios por ordem de id. Muita madeira: são 2.000 para colher e as obras arcanas comem pedra e ouro. */
const ROLES = ['gold', 'gold', 'wood', 'gold', 'wood', 'wood', 'stone', 'gold', 'wood', 'wood', 'gold', 'wood', 'stone', 'wood', 'gold', 'wood'];
function keepWorking(c) {
  const home = c.anchor('playerStart');
  const golds = c.gm.resourceDeposits.filter((r) => r.type === 'gold' && !r.isDead).sort((a, b) => dist(posOf(a), home) - dist(posOf(b), home));
  const stone = nearest(c.gm.resourceDeposits.filter((r) => r.type === 'stone' && !r.isDead), home);
  const lm = c.gm.buildings.find((x) => x.ownerId === 0 && x.type === 'orc_lumber_mill' && !x.isDead && x.isConstructed);
  const tree = nearest(c.gm.trees.filter((t) => !t.isDead), lm ? posOf(lm) : home);
  c.mine('peon').sort((a, b) => a.id - b.id).forEach((u, i) => {
    if (u.state !== 'idle') return;
    let role = ROLES[i % ROLES.length];
    if (role === 'stone' && res(c).stone > 260) role = 'wood';
    if (role === 'gold' && res(c).gold > 1500) role = 'wood';
    if (role === 'wood' && res(c).wood > 900) role = 'gold';
    const target = role === 'stone' ? stone : role === 'wood' ? tree : golds[0];
    if (target) c.issue({ type: c.CMD.GATHER, unitIds: [u.id], targetId: target.id });
  });
}

/** Fila de obras: o robô só passa à seguinte quando a atual já foi posta. */
const QUEUE = [
  { id: 'farm', type: 'pig_farm', done: (c) => count(c, 'pig_farm') > 0, go: (c) => place(c, 'pig_farm') },
  { id: 'mill', type: 'orc_lumber_mill', done: (c) => count(c, 'orc_lumber_mill') > 0, go: mill },
  { id: 'barracks', type: 'orc_barracks', done: (c) => count(c, 'orc_barracks') > 0, go: (c) => place(c, 'orc_barracks') },
  { id: 'sanctum', type: 'ash_sanctum', done: (c) => count(c, 'ash_sanctum') > 0, go: (c) => place(c, 'ash_sanctum'), when: (c) => count(c, 'orc_barracks', true) > 0 && c.seconds > 41 },
  { id: 'nest', type: 'serpent_nest', done: (c) => count(c, 'serpent_nest') > 0, go: (c) => place(c, 'serpent_nest'), when: (c) => count(c, 'ash_sanctum') > 0 }
];

const TROOPS_BEFORE_LAUNCH = 16;

function econ(c, { army = true } = {}) {
  const b = bot(c);
  keepWorking(c);
  const unfinished = c.gm.buildings.find((x) => x.ownerId === 0 && !x.isDead && !x.isConstructed && x.role !== 'wall');
  if (unfinished) { const vs = builders(c); if (vs.length) c.issue({ type: c.CMD.BUILD, unitIds: vs, buildingId: unfinished.id }); }
  const hall = c.bld('great_hall');
  const q = QUEUE.find((x) => !x.done(c));
  const qReady = q && (!q.when || q.when(c));
  const reserve = qReady ? (BUILDINGS[q.type].cost.gold || 0) : 0;
  if (hall && c.mine('peon').length < 16 && hall.queue.length < 2 && (res(c).gold - reserve >= 50 || c.mine('peon').length < 5)) c.issue({ type: c.CMD.TRAIN, buildingId: hall.id, unitType: 'peon' });
  const popCap = c.gm.getPlayer(0).maxPopulation ?? 0;
  const pop = c.gm.getUnitsOf(0).filter((u) => !u.isDead).length;
  if (!unfinished && pop >= popCap - 3 && count(c, 'orc_house') < 8 && affordable(c, 'orc_house') && c.seconds - (b.last.house ?? -99) > 20 && place(c, 'orc_house', 10)) b.last.house = c.seconds;
  if (q && !unfinished && qReady && affordable(c, q.type) && c.seconds - (b.last[q.id] ?? -99) > 12 && q.go(c)) b.last[q.id] = c.seconds;
  if (!army) return;
  const rt = c.gm.mission;
  const sanctum = c.bld('ash_sanctum');
  const nest = c.bld('serpent_nest');
  const bar = c.bld('orc_barracks');
  // conjuradores e serpe têm prioridade no ouro; o Acampamento treina com o que sobra (2 Lanceiros-Machado para 1 Talhador: os Grifos voam)
  if (sanctum && sanctum.queue.length < 2 && c.mine('necromancer').length + sanctum.queue.length < 6) c.issue({ type: c.CMD.TRAIN, buildingId: sanctum.id, unitType: 'necromancer' });
  if (nest && nest.queue.length < 1 && rt.trainedCount(0, 'war_serpent') + nest.queue.length < 3 && res(c).gold > 300) c.issue({ type: c.CMD.TRAIN, buildingId: nest.id, unitType: 'war_serpent' });
  const keep = sanctum && c.mine('necromancer').length < 4 ? 140 : 0;
  if (bar && bar.queue.length < 2 && res(c).gold > keep + 40) {
    const n = rt.trainedCount(0, 'grunt') + rt.trainedCount(0, 'axethrower');
    c.issue({ type: c.CMD.TRAIN, buildingId: bar.id, unitType: n % 3 === 0 ? 'grunt' : 'axethrower' });
  }
}

const isTroop = (u) => u.type !== 'peon' && u.type !== 'hero_drogath';

/** A tropa espera à frente da base; Drogath fica atrás e só usa as habilidades se o inimigo chega a ele. Marcha quando há tropa suficiente. */
function station(c, { attack = true } = {}) {
  const b = bot(c);
  const rally = c.anchor('playerStart', 6, 7);
  const drogath = c.tagged('drogath')[0];
  const enemies = c.gm.allUnits.filter((u) => !u.isDead && u.ownerId === 1);
  if (drogath && !drogath.isDead) {
    const near = enemies.filter((u) => dist(posOf(u), posOf(drogath)) < 10);
    const spot = c.anchor('playerStart', 4, 4);
    if (near.length >= 1) {
      c.issue({ type: c.CMD.CAST, unitIds: [drogath.id], abilityId: 'hero_war_cry' });
      if (dist(posOf(nearest(near, posOf(drogath))), posOf(drogath)) < 3) c.issue({ type: c.CMD.CAST, unitIds: [drogath.id], abilityId: 'hero_ember_strike', targetId: nearest(near, posOf(drogath)).id });
      if (drogath.hp < drogath.maxHp * 0.6) c.issue({ type: c.CMD.CAST, unitIds: [drogath.id], abilityId: 'hero_clan_fire' });
    } else if (dist(posOf(drogath), spot) > 6 && drogath.state !== 'moving') c.issue({ type: c.CMD.MOVE, unitIds: [drogath.id], x: spot.x, z: spot.z });
  }
  const troops = c.mine().filter(isTroop);
  const fort = c.tagged('grove_fort').filter((x) => !x.isDead)[0];
  const ready = attack && !b.launched && troops.length >= TROOPS_BEFORE_LAUNCH && c.mine('necromancer').length >= 2 && c.obj('p-wood').status === 'completed';
  if (ready) b.launched = true;
  if (b.launched && fort) {
    const t = posOf(fort);
    const idle = troops.filter((u) => u.state === 'idle' || (u.state !== 'attacking' && dist(posOf(u), t) > 40 && u.state !== 'moving'));
    if (idle.length) c.issue({ type: c.CMD.ATTACK_MOVE, unitIds: idle.map((u) => u.id), x: t.x, z: t.z });
    return;
  }
  const idle = troops.filter((u) => u.state === 'idle' && dist(posOf(u), rally) > 10);
  if (idle.length) c.issue({ type: c.CMD.MOVE, unitIds: idle.map((u) => u.id), x: rally.x, z: rally.z });
}

const loop = (opts) => [
  {
    name: 'robo',
    every: 20,
    each: (c) => { econ(c, opts); station(c, opts); },
    until: (c) => c.gm.isGameOver,
    timeout: 2400
  }
];

export const makeLoop = loop;
export const win = loop({ army: true, attack: true });
/** Mesma economia (e as mesmas obras), mas SEM treinar tropa nem conjuradores e sem marchar: tem de perder para as levas. */
export const noArmy = loop({ army: false, attack: false });

/**
 * Investida precoce: só as unidades do início (Drogath, 2 Talhadores, 1 Lanceiro-Machado) marcham para o bosque-forte; sem treinar ninguém.
 * Tem de terminar SEM vitória e sem derrubar o bosque-forte.
 */
export const rush = [
  {
    name: 'investida',
    wait: 1,
    run: (c) => {
      const p = c.anchor('lumberHall2');
      c.issue({ type: c.CMD.ATTACK_MOVE, unitIds: c.mine().filter((u) => u.type !== 'peon').map((u) => u.id), x: p.x, z: p.z });
    },
    each: () => {},
    until: (c) => c.seconds > 240 || c.mine().filter((u) => u.type !== 'peon').length === 0,
    timeout: 300
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
