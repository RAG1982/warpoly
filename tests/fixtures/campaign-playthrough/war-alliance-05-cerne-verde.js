/**
 * Roteiro de playthrough da m05 "O Cerne Verde" (M3-06). Tudo por comandos reais do jogador: Aldeões minam, cortam madeira e constroem (Fazenda, Quartel, Serraria,
 * Torre Arcana, Aviário, Casas), Espadachins/Arqueiros no Quartel, Magos na Torre Arcana e um Cavaleiro Grifo no Aviário; a tropa defende a base contra as levas
 * (serpes incluídas) e só depois marcha para o Salão do Bosque. Nada de teletransporte nem dano injetado. O Capitão Brann fica na retaguarda (reserva).
 * O robô só VENCE se montar o exército: o roteiro `noArmy` (mesma economia, nem tropa nem magos) PERDE para as levas; a investida precoce com as unidades do início
 * (`rush`) não derruba o Salão do Bosque.
 */
export const campaignId = 'war-alliance';
export const targetMinutes = 12; // ficha: 18–22 min (jogador humano); o harness aceita até 2×. O robô não pensa nem olha a câmera e fecha em ~16 min (M3-06b: mapa de 320, bases a ~156 u).

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const posOf = (e) => ({ x: e.mesh.position.x, z: e.mesh.position.z });
const nearest = (list, p) => list.slice().sort((a, b) => dist(posOf(a), p) - dist(posOf(b), p))[0];
const bot = (c) => (c.gm.__bot ||= { last: {}, launched: false, researched: false });
const res = (c) => c.gm.getPlayer(0).resources;
const affordable = (c, cost) => Object.entries(cost).every(([k, v]) => (res(c)[k] || 0) >= v);
const count = (c, type) => c.gm.buildings.filter((x) => x.ownerId === 0 && x.type === type && !x.isDead).length;
const done = (c, type) => c.gm.buildings.some((x) => x.ownerId === 0 && x.type === type && !x.isDead && x.isConstructed);

/** 3 Aldeões para obra: os mais próximos do Paço que não estejam construindo. */
function builders(c, n = 3) {
  const home = c.anchor('playerStart');
  return c.mine('villager').filter((u) => u.state !== 'building').sort((a, b) => dist(posOf(a), home) - dist(posOf(b), home)).slice(0, n).map((u) => u.id);
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
const homeOf = (c) => posOf(c.bld('castle'));
const place = (c, type, minR = 9) => placeAround(c, type, homeOf(c), minR, 44);

/** Papéis dos aldeões, por ordem de id. Muita madeira: são 2.000 para colher e os edifícios arcanos comem pedra e ouro. */
const ROLES = ['gold', 'gold', 'wood', 'gold', 'gold', 'wood', 'stone', 'gold', 'wood', 'wood', 'gold', 'wood', 'stone', 'wood', 'gold', 'wood'];
function keepWorking(c) {
  const home = c.anchor('playerStart');
  const golds = c.gm.resourceDeposits.filter((r) => r.type === 'gold' && !r.isDead).sort((a, b) => dist(posOf(a), home) - dist(posOf(b), home));
  const stone = nearest(c.gm.resourceDeposits.filter((r) => r.type === 'stone' && !r.isDead), home);
  const camp = c.gm.buildings.find((x) => x.ownerId === 0 && x.type === 'lumber_camp' && !x.isDead && x.isConstructed);
  const trees = c.gm.trees.filter((t) => !t.isDead);
  const tree = nearest(trees, camp ? posOf(camp) : home);
  c.mine('villager').sort((a, b) => a.id - b.id).forEach((u, i) => {
    if (u.state !== 'idle') return;
    let role = ROLES[i % ROLES.length];
    if (role === 'stone' && res(c).stone > 260) role = 'wood';
    if (role === 'gold' && res(c).gold > 1500) role = 'wood';
    if (role === 'wood' && res(c).wood > 900) role = 'gold';
    const target = role === 'stone' ? stone : role === 'wood' ? tree : golds[0];
    if (target) c.issue({ type: c.CMD.GATHER, unitIds: [u.id], targetId: target.id });
  });
}

const OBRAS = { cottage: { wood: 50 }, farm: { wood: 60 }, barracks: { wood: 120, stone: 60 }, lumber_camp: { wood: 80 }, arcane_tower: { gold: 250, wood: 80, stone: 80 }, aviary: { gold: 300, wood: 150, stone: 60 } };

/** Fila de obras: o robô só passa à seguinte quando a atual já foi posta. Serraria junto do bosque mais próximo da base. */
function camp(c) {
  const home = c.anchor('playerStart');
  const tree = nearest(c.gm.trees.filter((t) => !t.isDead), home);
  return placeAround(c, 'lumber_camp', posOf(tree), 5, 20);
}
const QUEUE = [
  { id: 'farm', cost: 'farm', done: (c) => count(c, 'farm') > 0, go: (c) => place(c, 'farm') },
  { id: 'camp', cost: 'lumber_camp', done: (c) => count(c, 'lumber_camp') > 0, go: camp },
  { id: 'barracks', cost: 'barracks', done: (c) => count(c, 'barracks') > 0, go: (c) => place(c, 'barracks') },
  { id: 'arcane', cost: 'arcane_tower', done: (c) => count(c, 'arcane_tower') > 0, go: (c) => place(c, 'arcane_tower') },
  { id: 'aviary', cost: 'aviary', done: (c) => count(c, 'aviary') > 0, go: (c) => place(c, 'aviary') }
];

const TROOPS_BEFORE_LAUNCH = 16;

function econ(c, { army = true } = {}) {
  const b = bot(c);
  keepWorking(c);
  const unfinished = c.gm.buildings.find((x) => x.ownerId === 0 && !x.isDead && !x.isConstructed && x.role !== 'wall');
  if (unfinished) {
    const vs = builders(c);
    if (vs.length) c.issue({ type: c.CMD.BUILD, unitIds: vs, buildingId: unfinished.id });
  }
  const castle = c.bld('castle');
  if (castle && c.mine('villager').length < 14 && castle.queue.length === 0) c.issue({ type: c.CMD.TRAIN, buildingId: castle.id, unitType: 'villager' });
  const popCap = c.gm.getPlayer(0).maxPopulation ?? 0;
  const pop = c.gm.getUnitsOf(0).filter((u) => !u.isDead).length;
  if (!unfinished && pop >= popCap - 3 && count(c, 'cottage') < 8 && affordable(c, OBRAS.cottage) && c.seconds - (b.last.cottage ?? -99) > 15) { if (place(c, 'cottage', 10)) b.last.cottage = c.seconds; }
  const q = QUEUE.find((x) => !x.done(c));
  if (q && !unfinished && affordable(c, OBRAS[q.cost]) && c.seconds - (b.last[q.id] ?? -99) > 12) { if (q.go(c)) b.last[q.id] = c.seconds; }
  if (!army) return;
  const rt = c.gm.mission;
  const arcane = c.bld('arcane_tower');
  if (arcane && arcane.queue.length < 2 && c.mine('mage').length + arcane.queue.length < 6) c.issue({ type: c.CMD.TRAIN, buildingId: arcane.id, unitType: 'mage' });
  const aviary = c.bld('aviary');
  if (aviary && aviary.queue.length < 1 && rt.trainedCount(0, 'gryphon_rider') + aviary.queue.length < 2 && res(c).gold > 330) c.issue({ type: c.CMD.TRAIN, buildingId: aviary.id, unitType: 'gryphon_rider' });
  const barracks = c.bld('barracks');
  // magos e grifo têm prioridade no ouro; o Quartel treina com o que sobra (2 arqueiros para 1 espadachim: as serpes voam)
  const reserve = arcane && c.mine('mage').length < 4 ? 130 : 0; // M3-06b: repõe Magos perdidos nas levas (o mapa maior alonga a marcha)
  if (barracks && barracks.queue.length < 2 && res(c).gold > reserve + 40) {
    const n = rt.trainedCount(0, 'knight') + rt.trainedCount(0, 'archer');
    c.issue({ type: c.CMD.TRAIN, buildingId: barracks.id, unitType: n % 3 === 0 ? 'knight' : 'archer' });
  }
}

const isTroop = (u) => u.type !== 'villager' && u.type !== 'hero_brann';

/** A tropa espera à frente da base (rumo ao leste); Brann fica atrás dela e só entra com as habilidades se o inimigo chega a ele. Marcha quando há tropa suficiente. */
function station(c, { attack = true } = {}) {
  const b = bot(c);
  const rally = c.anchor('playerStart', 6, 7);
  const brann = c.tagged('brann')[0];
  const enemies = c.gm.allUnits.filter((u) => !u.isDead && u.ownerId === 1);
  if (brann && !brann.isDead) {
    const near = enemies.filter((u) => dist(posOf(u), posOf(brann)) < 10);
    if (near.length >= 1) {
      c.issue({ type: c.CMD.CAST, unitIds: [brann.id], abilityId: 'hero_war_cry' });
      c.issue({ type: c.CMD.CAST, unitIds: [brann.id], abilityId: 'hero_defensive_stance' });
    } else if (dist(posOf(brann), c.anchor('playerStart', 4, 4)) > 6 && brann.state !== 'moving') c.issue({ type: c.CMD.MOVE, unitIds: [brann.id], x: c.anchor('playerStart', 4, 4).x, z: c.anchor('playerStart', 4, 4).z });
  }
  const troops = c.mine().filter(isTroop);
  const hall = c.tagged('grove_hall').filter((x) => !x.isDead)[0];
  const ready = attack && !b.launched && troops.length >= TROOPS_BEFORE_LAUNCH && c.mine('mage').length >= 2 && c.obj('p-wood').status === 'completed';
  if (ready) b.launched = true;
  if (b.launched && hall) {
    const t = posOf(hall);
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
/** Mesma economia (e as mesmas obras), mas SEM treinar tropa nem magos e sem marchar: tem de perder para as levas. */
export const noArmy = loop({ army: false, attack: false });

/**
 * Investida precoce: só as unidades do início (Brann, 2 Espadachins, 1 Arqueiro) marcham para o Salão do Bosque; sem treinar ninguém.
 * Tem de terminar SEM vitória e sem derrubar o Salão.
 */
export const rush = [
  {
    name: 'investida',
    wait: 1,
    run: (c) => {
      const p = c.anchor('lumberHall2');
      c.issue({ type: c.CMD.ATTACK_MOVE, unitIds: c.mine().filter((u) => u.type !== 'villager').map((u) => u.id), x: p.x, z: p.z });
    },
    each: () => {},
    until: (c) => c.seconds > 240 || c.mine().filter((u) => u.type !== 'villager').length === 0,
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
