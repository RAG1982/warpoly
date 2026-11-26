/**
 * Roteiro de playthrough da m11 da Horda "Brasa-Alta" (M4-11). Espelho da m11 da Aliança (war-alliance-11-porto-albor.js) com os lados invertidos:
 * os Clãs defendem a colônia (Marco = `great_hall` na praia, tag `colony`) e a economia do Salão do interior. Tudo por comandos reais do jogador:
 * Lacaios minam, cortam madeira e constroem (Cercado de Javalis, Serraria, Acampamento, Doca do Clã na costa, Caldeirão de Cinza, Covil, Ninho);
 * o Marco é evoluído a nível 2 com o ouro e a pedra da economia; um Petroleiro ergue a Plataforma no poço do mar perto da base e as Galés de Guerra da
 * Doca esperam na enseada dos reforços. A tropa defende a colônia (Marco + mina do interior) contra as três incursões; a esquadra de cerco (duas
 * levas de 4 fragatas, aos 480 e 720 s) é caçada pelas Galés. Drogath fica no Salão; Vozgul, Skarn e Grok acompanham a tropa.
 * `lose` (aniquilado) perde; `noArmy` (economia sem tropa nem frota) não vence; `rush` (a tropa do início ataca a base de Aurelan) não vence.
 * Nada de teletransporte nem dano injetado no `win`.
 */
import { BUILDINGS } from '../../../src/data/buildings.js';

export const campaignId = 'war-horde';
export const targetMinutes = 14; // ficha: Difícil/G, 20–25 min de jogador humano; o harness aceita até 2×.

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const posOf = (e) => ({ x: e.mesh.position.x, z: e.mesh.position.z });
const nearest = (list, p) => list.slice().sort((a, b) => dist(posOf(a), p) - dist(posOf(b), p))[0];
const bot = (c) => (c.gm.__bot ||= { last: {}, fleetOut: false, upgraded: false });
const res = (c) => c.gm.getPlayer(0).resources;
const affordable = (c, cost) => Object.entries(cost).every(([k, v]) => (res(c)[k] || 0) >= v);
const count = (c, type) => c.gm.buildings.filter((x) => x.ownerId === 0 && x.type === type && !x.isDead).length;
/** O Marco da Colônia (Salão na praia, tag `colony`). */
const colonyHall = (c) => c.tagged('colony').find((b) => !b.isDead);
/** O Salão do interior (não o Marco). */
const homeHall = (c) => c.tagged('home_hall').find((b) => !b.isDead);
const homeOf = (c) => posOf(homeHall(c));

/** 3 Lacaios para obra: os mais próximos de `near` que não estejam construindo. */
function builders(c, n = 3, near = c.anchor('playerStart')) {
  return c.mine('peon').filter((u) => u.state !== 'building').sort((a, b) => dist(posOf(a), near) - dist(posOf(b), near)).slice(0, n).map((u) => u.id);
}

/** Primeiro ponto em volta de `center` onde `canPlaceBuilding` aceita (varredura em anéis, ordem fixa). */
function placeAround(c, type, center, minR = 8, maxR = 44, n = 3) {
  for (let r = minR; r < maxR; r += 2.5) {
    for (let a = 0; a < 16; a++) {
      const ang = (((a % 2 ? 1 : -1) * Math.ceil(a / 2)) * Math.PI) / 8;
      const x = center.x + Math.cos(ang) * r;
      const z = center.z + Math.sin(ang) * r;
      if (c.gm.canPlaceBuilding(type, x, z, null, 0)) { c.issue({ type: c.CMD.PLACE_BUILDING, buildingType: type, x, z, unitIds: builders(c, n, center) }); return true; }
    }
  }
  return false;
}
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
    if (c.gm.canPlaceBuilding(type, p.x, p.z, null, 0)) { c.issue({ type: c.CMD.PLACE_BUILDING, buildingType: type, x: p.x, z: p.z, unitIds: builders(c, n, center) }); return true; }
  }
  return false;
}

/** Papéis dos Lacaios, por ordem de id (ouro, madeira, pedra). Só os ociosos recebem tarefa nova. */
const ROLES = ['gold', 'wood', 'gold', 'gold', 'wood', 'gold', 'gold', 'stone', 'gold', 'wood', 'gold', 'gold', 'wood', 'gold', 'gold', 'wood', 'gold', 'gold'];
function keepWorking(c) {
  const home = c.anchor('playerStart');
  const golds = c.gm.resourceDeposits.filter((r) => r.type === 'gold' && !r.isDead).sort((a, b) => dist(posOf(a), home) - dist(posOf(b), home));
  const stone = nearest(c.gm.resourceDeposits.filter((r) => r.type === 'stone' && !r.isDead), home);
  const mill = c.gm.buildings.find((x) => x.ownerId === 0 && x.type === 'orc_lumber_mill' && !x.isDead && x.isConstructed);
  const trees = c.gm.trees.filter((t) => !t.isDead);
  const tree = nearest(trees, mill ? posOf(mill) : home);
  c.mine('peon').sort((a, b) => a.id - b.id).forEach((u, i) => {
    if (u.state !== 'idle') return;
    let role = ROLES[i % ROLES.length];
    if (role === 'stone' && res(c).stone > 300) role = 'gold';
    if (role === 'gold' && res(c).gold > 1500) role = 'wood';
    if (role === 'wood' && res(c).wood > 900) role = 'gold';
    const target = role === 'stone' ? stone : role === 'wood' ? tree : golds[i % Math.max(1, Math.min(golds.length, 2))];
    if (target) c.issue({ type: c.CMD.GATHER, unitIds: [u.id], targetId: target.id });
  });
}

/** Evolução do Marco a nível 2 (tiers.js: HQ_UPGRADE_COST[2]). */
const MARCO_LV2 = { gold: 600, wood: 300, stone: 200 };

/** Serraria junto da árvore mais próxima da base. */
function mill(c) {
  const home = c.anchor('playerStart');
  const tree = nearest(c.gm.trees.filter((t) => !t.isDead), home);
  return placeAround(c, 'orc_lumber_mill', posOf(tree), 5, 20);
}
/** Doca do Clã: na costa perto da base (o poço well1 fica a ~30 u de navegação da doca, então o ponto da costa é fixo), onde as Galés saem. */
const dock = (c) => placeGrid(c, 'ship_dock', { x: -62, z: -86 }, 30);
/** Caldeirão de Cinza: na costa, perto da Doca (recebe o petróleo dos petroleiros). */
function cauldron(c) {
  const yard = c.bld('ship_dock');
  if (!yard) return false;
  return placeGrid(c, 'ash_cauldron', posOf(yard), 34);
}
// Doca e Caldeirão vêm primeiro: os poucos pontos de costa somem assim que as casas e a Fazenda se espalham.
const QUEUE = [
  { id: 'farm', type: 'pig_farm', done: (c) => count(c, 'pig_farm') > 0, go: (c) => place(c, 'pig_farm') },
  { id: 'mill', type: 'orc_lumber_mill', done: (c) => count(c, 'orc_lumber_mill') > 0, go: mill },
  { id: 'barracks', type: 'orc_barracks', done: (c) => count(c, 'orc_barracks') > 0, go: (c) => placeWide(c, 'orc_barracks') },
  { id: 'dock', type: 'ship_dock', done: (c) => count(c, 'ship_dock') > 0, go: dock },
  { id: 'den', type: 'ogre_den', done: (c) => count(c, 'ogre_den') > 0, go: (c) => placeWide(c, 'ogre_den') },
  { id: 'cauldron', type: 'ash_cauldron', done: (c) => count(c, 'ash_cauldron') > 0, go: cauldron },
  { id: 'nest', type: 'serpent_nest', done: (c) => count(c, 'serpent_nest') > 0, go: (c) => placeWide(c, 'serpent_nest') }
];

const TROOPS_TARGET = 22;
const GALLEYS_TARGET = 8;
const GALLEYS_BEFORE_SEA = 5;

/** Petróleo: depósito de poço mais perto de `anchorName` (a Plataforma nasce sobre ele). */
const wellAt = (c, name) => {
  const p = c.anchor(name);
  return c.gm.resourceDeposits.find((d) => d.type === 'oil' && !d.isDead && dist(posOf(d), p) < 2);
};

const isTroop = (u) => u.type !== 'peon' && !u.type.startsWith('hero_') && u.type !== 'tanker' && u.type !== 'war_galley' && u.type !== 'barge' && u.type !== 'ogre_mage';

function econ(c, { army = true, navy = true } = {}) {
  const b = bot(c);
  keepWorking(c);
  const unfinished = c.gm.buildings.find((x) => x.ownerId === 0 && !x.isDead && !x.isConstructed && x.role !== 'wall' && x.type !== 'oil_platform');
  if (unfinished) {
    const vs = builders(c);
    if (vs.length) c.issue({ type: c.CMD.BUILD, unitIds: vs, buildingId: unfinished.id });
  }
  // a Plataforma é obra do Petroleiro (Lacaios não chegam ao mar)
  const rig = c.gm.buildings.find((x) => x.ownerId === 0 && !x.isDead && !x.isConstructed && x.type === 'oil_platform');
  const idleTanker = c.mine('tanker').find((t) => t.state === 'idle');
  if (rig && idleTanker) c.issue({ type: c.CMD.BUILD, unitIds: [idleTanker.id], buildingId: rig.id });
  const hall = homeHall(c);
  if (hall && c.mine('peon').length < 18 && hall.queue.length === 0) c.issue({ type: c.CMD.TRAIN, buildingId: hall.id, unitType: 'peon' });
  const popCap = c.gm.getPlayer(0).maxPopulation ?? 0;
  const pop = c.gm.getUnitsOf(0).filter((u) => !u.isDead).length;
  if (!unfinished && pop >= popCap - 6 && count(c, 'orc_house') < 14 && affordable(c, BUILDINGS.orc_house.cost) && c.seconds - (b.last.house ?? -99) > 10) { if (placeWide(c, 'orc_house', 16)) b.last.house = c.seconds; }
  // Marco da Colônia: evolução a nível 2 assim que o ouro, a madeira e a pedra cobrem o custo (uma vez)
  const marco = colonyHall(c);
  if (marco && !b.upgraded && marco.tier < 2 && !marco.upgrading && (count(c, 'ship_dock') > 0 || !navy || c.seconds > 300) && affordable(c, MARCO_LV2) && !unfinished) {
    c.issue({ type: c.CMD.UPGRADE_HQ, buildingId: marco.id });
    b.upgraded = true;
  }
  const q = QUEUE.find((x) => !x.done(c));
  if (q && !unfinished && affordable(c, BUILDINGS[q.type].cost) && c.seconds - (b.last[q.id] ?? -99) > 12) { if (q.go(c)) b.last[q.id] = c.seconds; }
  // Petróleo: UM Petroleiro ergue a Plataforma no poço perto da base (well1) e depois coleta; o petróleo vai ao Caldeirão
  const yard = c.bld('ship_dock');
  if (navy && yard) {
    const tankers = c.mine('tanker');
    if (tankers.length + yard.queue.length < 1 && affordable(c, { gold: 100, wood: 60 }) && yard.queue.length < 2) c.issue({ type: c.CMD.TRAIN, buildingId: yard.id, unitType: 'tanker' });
    tankers.forEach((t) => {
      const d = wellAt(c, 'well1');
      if (!d || t.state !== 'idle') return;
      if (!d.platform) { if (affordable(c, { gold: 180, wood: 60 })) c.issue({ type: c.CMD.PLACE_BUILDING, buildingType: 'oil_platform', x: posOf(d).x, z: posOf(d).z, unitIds: [t.id] }); }
      else if (d.platform.isConstructed) c.issue({ type: c.CMD.GATHER, unitIds: [t.id], targetId: d.id });
    });
    const gal = c.mine('war_galley');
    if (gal.length + yard.queue.length < GALLEYS_TARGET && res(c).oil >= 100 && affordable(c, { gold: 200, wood: 100 }) && yard.queue.length < 2) c.issue({ type: c.CMD.TRAIN, buildingId: yard.id, unitType: 'war_galley' });
  }
  if (!army) return;
  const rt = c.gm.mission;
  const den = c.bld('ogre_den');
  if (den && den.queue.length < 1 && res(c).gold > 260 && c.mine('ogre').length < 8) c.issue({ type: c.CMD.TRAIN, buildingId: den.id, unitType: 'ogre' });
  const barracks = c.bld('orc_barracks');
  if (barracks && barracks.queue.length < 3 && res(c).gold > 150 && c.mine().filter(isTroop).length < TROOPS_TARGET) {
    const n = rt.trainedCount(0, 'grunt') + rt.trainedCount(0, 'axethrower');
    c.issue({ type: c.CMD.TRAIN, buildingId: barracks.id, unitType: n % 3 === 0 ? 'grunt' : 'axethrower' });
  }
}

/**
 * Tropa defensiva: todas as tropas (não heróis) ficam entre o Marco e a mina do interior; quando um inimigo (não navio, não aldeão) chega a 40 u do
 * Marco ou da mina `expansion1`, a tropa inteira (com Vozgul, Skarn e Grok) ataca o mais próximo do Marco. Drogath fica no Salão.
 */
function ground(c, { attack = true } = {}) {
  const drogath = c.tagged('drogath')[0];
  const enemies = c.gm.allUnits.filter((u) => !u.isDead && u.ownerId === 1);
  if (drogath && !drogath.isDead) {
    const home = c.anchor('playerStart', 4, 12);
    const near = enemies.filter((u) => dist(posOf(u), posOf(drogath)) < 10);
    if (drogath.hp < drogath.maxHp * 0.4 && near.length >= 1) { c.issue({ type: c.CMD.MOVE, unitIds: [drogath.id], x: home.x, z: home.z }); }
    else if (near.length === 0 && dist(posOf(drogath), home) > 6 && drogath.state !== 'moving') c.issue({ type: c.CMD.MOVE, unitIds: [drogath.id], x: home.x, z: home.z });
  }
  const colony = c.anchor('colonyMark');
  const mine = c.anchor('expansion1');
  const rally = { x: (colony.x + mine.x) / 2, z: (colony.z + mine.z) / 2 };
  const troops = c.mine().filter(isTroop).sort((a, b) => a.id - b.id);
  const heroes = c.mine().filter((u) => u.type === 'hero_vozgul' || u.type === 'hero_skarn' || u.type === 'ogre_mage');
  const threats = enemies.filter((u) => u.type !== 'villager' && u.layer !== 'naval' && (dist(posOf(u), colony) < 40 || dist(posOf(u), mine) < 40));
  if (attack && threats.length) {
    const foe = nearest(threats, colony);
    const group = troops.concat(heroes);
    if (group.length) c.issue({ type: c.CMD.ATTACK_MOVE, unitIds: group.map((u) => u.id), x: posOf(foe).x, z: posOf(foe).z });
    return;
  }
  troops.forEach((u) => {
    if (u.state === 'idle' && dist(posOf(u), rally) > 8) c.issue({ type: c.CMD.MOVE, unitIds: [u.id], x: rally.x, z: rally.z });
  });
  heroes.forEach((u) => {
    if (u.state === 'idle' && dist(posOf(u), colony) > 8) c.issue({ type: c.CMD.MOVE, unitIds: [u.id], x: colony.x, z: colony.z });
  });
}

/**
 * Esquadra: fica perto da enseada até ter 4 Galés; depois ataca as fragatas à vista (a menos de 90 u da enseada). Sem fragatas, patrulha a enseada.
 */
function fleet(c, { attack = true } = {}) {
  const ships = c.mine('war_galley');
  if (!ships.length) return;
  const b = bot(c);
  const frigates = c.gm.allUnits.filter((u) => !u.isDead && u.ownerId === 1 && u.type === 'frigate');
  const bay = c.anchor('reinforceSea');
  if (attack && !b.fleetOut && ships.length >= GALLEYS_BEFORE_SEA) b.fleetOut = true;
  if (!b.fleetOut) {
    const home = c.anchor('reinforceSea', 6, 4);
    const idle = ships.filter((u) => u.state === 'idle' && dist(posOf(u), home) > 10);
    if (idle.length) c.issue({ type: c.CMD.MOVE, unitIds: idle.map((u) => u.id), x: home.x, z: home.z });
    return;
  }
  const near = frigates.filter((g) => dist(posOf(g), bay) < 90);
  if (near.length) {
    const g = nearest(near, bay);
    const idle = ships.filter((u) => u.state !== 'attacking');
    if (idle.length) c.issue({ type: c.CMD.ATTACK_MOVE, unitIds: idle.map((u) => u.id), x: posOf(g).x, z: posOf(g).z });
    return;
  }
  const idle = ships.filter((u) => u.state === 'idle' || (u.state !== 'attacking' && u.state !== 'moving' && dist(posOf(u), bay) > 14));
  if (idle.length) c.issue({ type: c.CMD.ATTACK_MOVE, unitIds: idle.map((u) => u.id), x: bay.x, z: bay.z });
}

const loop = (opts) => [
  {
    name: 'robo',
    every: 5,
    each: (c) => { econ(c, opts); ground(c, opts); fleet(c, opts); },
    until: (c) => c.gm.isGameOver,
    timeout: 1500
  }
];

export const makeLoop = loop;
export const win = loop({ army: true, navy: true, attack: true });
/** Mesma economia, mas SEM treinar tropa nem frota e sem atacar: a colônia não evolui a tempo de vencer e a esquadra de cerco não afunda. */
export const noArmy = loop({ army: false, navy: false, attack: false });

/** Investida precoce: toda a tropa do início marcha sobre a base de Aurelan e abandona a colônia: não vence (a esquadra de cerco e as levas seguem). */
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
