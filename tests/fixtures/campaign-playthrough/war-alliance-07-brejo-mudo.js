/**
 * Roteiro de playthrough da m07 "O Brejo Mudo" (M3-08). Tudo por comandos reais do jogador: Aldeões minam, cortam madeira e constroem (Fazenda,
 * Quartel, Serraria, Torre Arcana, Torres de Vigia, Casas), Espadachins/Arqueiros no Quartel e Magos na Torre Arcana. Até 330 s o exército junta
 * forças; de 330 a 430 s (traição e primeiras ondas) fica em casa, defende o Paço e mantém o Capitão Brann atrás da linha; a partir de 430 s marcha
 * para os Cercados de Javalis e o Salão de Brakka (24 soldados e 3 Magos) e depois para o Paço do traidor e a Ferraria (14 soldados). Nada de
 * teletransporte nem dano injetado. O roteiro `lose` (mesma economia, sem tropa nem magos) PERDE para a traição e as levas.
 */
export const campaignId = 'war-alliance';
export const targetMinutes = 16; // ficha: 18–22 min (jogador humano); o harness aceita até 2×. O robô fecha em ~9,5 min (566 s), com o Paço e Brann vivos.

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const posOf = (e) => ({ x: e.mesh.position.x, z: e.mesh.position.z });
const nearest = (list, p) => list.slice().sort((a, b) => dist(posOf(a), p) - dist(posOf(b), p))[0];
const bot = (c) => (c.gm.__bot ||= { last: {}, launched: false });
const res = (c) => c.gm.getPlayer(0).resources;
const affordable = (c, cost) => Object.entries(cost).every(([k, v]) => (res(c)[k] || 0) >= v);
const count = (c, type) => c.gm.buildings.filter((x) => x.ownerId === 0 && x.type === type && !x.isDead).length;

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
/** Obras grandes (Torre Arcana, Quartel, Torres): anel mais largo, porque as casas ocupam o anel perto do Paço. */
const placeWide = (c, type, minR = 9) => placeAround(c, type, homeOf(c), minR, 64);

/** Papéis dos aldeões, por ordem de id (2 de cada 3 no ouro; pedra só 1 em 9). Só os ociosos recebem tarefa nova. */
const ROLES = ['gold', 'gold', 'wood', 'gold', 'gold', 'gold', 'gold', 'stone', 'gold', 'gold', 'wood', 'gold', 'gold', 'gold', 'gold', 'wood', 'gold', 'gold'];
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
    // depois da traição, só as duas minas mais perto do Paço (as outras ficam em terra do traidor ou no caminho das ondas)
    const pool = c.seconds >= 330 ? golds.slice(0, 2) : golds;
    const target = role === 'stone' ? stone : role === 'wood' ? tree : pool[i % pool.length];
    if (target) c.issue({ type: c.CMD.GATHER, unitIds: [u.id], targetId: target.id });
  });
}

const OBRAS = { cottage: { wood: 50 }, farm: { wood: 60 }, barracks: { wood: 120, stone: 60 }, lumber_camp: { wood: 80 }, arcane_tower: { gold: 250, wood: 80, stone: 80 }, watchtower: { wood: 90, stone: 40 } };

/** Serraria junto da árvore mais próxima da base. */
function camp(c) {
  const home = c.anchor('playerStart');
  const tree = nearest(c.gm.trees.filter((t) => !t.isDead), home);
  return placeAround(c, 'lumber_camp', posOf(tree), 5, 20);
}
/** Torre de vigia: as duas que o objetivo pede, ao lado da base (na direção do brejo). */
const QUEUE = [
  { id: 'farm', cost: 'farm', done: (c) => count(c, 'farm') > 0, go: (c) => place(c, 'farm') },
  { id: 'camp', cost: 'lumber_camp', done: (c) => count(c, 'lumber_camp') > 0, go: camp },
  { id: 'barracks', cost: 'barracks', done: (c) => count(c, 'barracks') > 0, go: (c) => placeWide(c, 'barracks') },
  { id: 'arcane', cost: 'arcane_tower', done: (c) => count(c, 'arcane_tower') > 0, go: (c) => placeWide(c, 'arcane_tower') },
  { id: 'tower1', cost: 'watchtower', done: (c) => count(c, 'watchtower') >= 1, go: (c) => placeWide(c, 'watchtower', 12) },
  { id: 'tower2', cost: 'watchtower', done: (c) => count(c, 'watchtower') >= 2, go: (c) => placeWide(c, 'watchtower', 12) }
];

const TROOPS_BEFORE_LAUNCH = 24;

function econ(c, { army = true } = {}) {
  const b = bot(c);
  keepWorking(c);
  const unfinished = c.gm.buildings.find((x) => x.ownerId === 0 && !x.isDead && !x.isConstructed && x.role !== 'wall');
  if (unfinished) {
    const vs = builders(c);
    if (vs.length) c.issue({ type: c.CMD.BUILD, unitIds: vs, buildingId: unfinished.id });
  }
  const castle = c.bld('castle');
  if (castle && c.mine('villager').length < 18 && castle.queue.length === 0) c.issue({ type: c.CMD.TRAIN, buildingId: castle.id, unitType: 'villager' });
  const popCap = c.gm.getPlayer(0).maxPopulation ?? 0;
  const pop = c.gm.getUnitsOf(0).filter((u) => !u.isDead).length;
  if (!unfinished && pop >= popCap - 6 && count(c, 'cottage') < 12 && affordable(c, OBRAS.cottage) && c.seconds - (b.last.cottage ?? -99) > 10) { if (placeWide(c, 'cottage', 16)) b.last.cottage = c.seconds; }
  const q = QUEUE.find((x) => !x.done(c));
  if (q && !unfinished && affordable(c, OBRAS[q.cost]) && c.seconds - (b.last[q.id] ?? -99) > 12) { if (q.go(c)) b.last[q.id] = c.seconds; }
  if (!army) return;
  const rt = c.gm.mission;
  const arcane = c.bld('arcane_tower');
  if (arcane && arcane.queue.length < 2 && c.mine('mage').length + arcane.queue.length < 5) c.issue({ type: c.CMD.TRAIN, buildingId: arcane.id, unitType: 'mage' });
  const barracks = c.bld('barracks');
  // o ouro da Torre Arcana (250) fica guardado enquanto ela não existe; depois, reserva para repor Magos perdidos nas levas
  const reserve = (!arcane && count(c, 'barracks') > 0 ? OBRAS.arcane_tower.gold + 20 : 0) + (arcane && c.mine('mage').length < 3 ? 110 : 0);
  if (barracks && barracks.queue.length < 3 && res(c).gold > reserve + 40) {
    const n = rt.trainedCount(0, 'knight') + rt.trainedCount(0, 'archer');
    c.issue({ type: c.CMD.TRAIN, buildingId: barracks.id, unitType: n % 3 === 0 ? 'knight' : 'archer' });
  }
}

const isTroop = (u) => u.type !== 'villager' && u.type !== 'hero_brann';

/** Alvo do ataque, na ordem da missão: cercados, Salão de Brakka; depois da traição (330 s), Paço de Mervane e Ferraria. */
function target(c) {
  const alive = (tag) => c.tagged(tag).filter((x) => !x.isDead);
  const pens = alive('boar_pen');
  if (pens.length) return nearest(pens, posOf(c.tagged('brann')[0] || c.bld('castle')));
  const hall = alive('brakka_hall');
  if (hall.length) return hall[0];
  if (c.seconds >= 330) {
    const castle = alive('traitor_castle');
    if (castle.length) return castle[0];
    const depot = alive('iron_depot');
    if (depot.length) return depot[0];
  }
  return null;
}

/** A tropa espera à frente da base (rumo ao sul do brejo); Brann fica atrás e só entra com as habilidades se o inimigo chega a ele. Marcha quando há tropa suficiente. */
function station(c, { attack = true } = {}) {
  const b = bot(c);
  const rally = c.anchor('playerStart', 4, 8);
  const brann = c.tagged('brann')[0];
  const enemies = c.gm.allUnits.filter((u) => !u.isDead && u.ownerId !== 0 && u.ownerId !== -1);
  const defending = c.seconds >= 330 && c.seconds < 430; // janela de defesa: o bloco de Brann abaixo não o puxa para a frente
  if (brann && !brann.isDead && !defending) {
    const near = enemies.filter((u) => dist(posOf(u), posOf(brann)) < 10);
    // Brann com pouca vida recua para o Paço (sem curas, morre e a missão cai)
    if (brann.hp < brann.maxHp * 0.4 && near.length >= 1) { c.issue({ type: c.CMD.MOVE, unitIds: [brann.id], x: c.anchor('playerStart', -6, -16).x, z: c.anchor('playerStart', -6, -16).z }); return; }
    if (near.length >= 1) {
      c.issue({ type: c.CMD.CAST, unitIds: [brann.id], abilityId: 'hero_war_cry' });
      c.issue({ type: c.CMD.CAST, unitIds: [brann.id], abilityId: 'hero_defensive_stance' });
    } else if (dist(posOf(brann), c.anchor('playerStart', -6, -16)) > 6 && brann.state !== 'moving') c.issue({ type: c.CMD.MOVE, unitIds: [brann.id], x: c.anchor('playerStart', -6, -16).x, z: c.anchor('playerStart', -6, -16).z }); // Brann na retaguarda
  }
  const troops = c.mine().filter(isTroop);
  let t = attack ? target(c) : null;
  // 330–430 s: a traição e as primeiras ondas chegam à base; a tropa volta para casa e defende (mesmo quem luta longe)
  if (defending) {
    const threats = enemies.filter((u) => dist(posOf(u), rally) < 45);
    if (threats.length && troops.length) c.issue({ type: c.CMD.ATTACK_MOVE, unitIds: troops.map((u) => u.id), x: rally.x, z: rally.z }); // luta no lugar, sem perseguir
    else {
      const away = troops.filter((u) => dist(posOf(u), rally) > 12);
      if (away.length) c.issue({ type: c.CMD.MOVE, unitIds: away.map((u) => u.id), x: rally.x, z: rally.z });
    }
    // Brann fica atrás da linha: sem curas, ele é a derrota se morrer
    if (brann && !brann.isDead && dist(posOf(brann), c.anchor('playerStart', -6, -16)) > 6) c.issue({ type: c.CMD.MOVE, unitIds: [brann.id], x: c.anchor('playerStart', -6, -16).x, z: c.anchor('playerStart', -6, -16).z });
    return;
  }
  // depois da traição, o Paço e a Ferraria do traidor só com 18 soldados (a base aguenta as ondas até lá)
  if (t && c.seconds >= 330 && troops.length < 14 && (c.tagged('traitor_castle').includes(t) || c.tagged('iron_depot').includes(t))) t = null;
  // a marcha só sai depois da janela de defesa (430 s): a traição e as primeiras ondas são atendidas em casa
  const ready = attack && !b.launched && c.seconds >= 430 && troops.length >= TROOPS_BEFORE_LAUNCH && c.mine('mage').length >= 3;
  if (ready) b.launched = true;
  if (b.launched && t) {
    const p = posOf(t);
    const idle = troops.filter((u) => u.state === 'idle' || (u.state !== 'attacking' && dist(posOf(u), p) > 40 && u.state !== 'moving'));
    if (idle.length) c.issue({ type: c.CMD.ATTACK_MOVE, unitIds: idle.map((u) => u.id), x: p.x, z: p.z });
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
/** Mesma economia, mas SEM treinar tropa nem magos e sem marchar: tem de perder para a traição e as levas. */
export const noArmy = loop({ army: false, attack: false });
export const lose = noArmy;
