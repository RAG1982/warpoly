/**
 * Roteiro de playthrough da m06 "A Geada" (M3-07, Prova de Fogo). Tudo por comandos reais do jogador: Aldeões minam, cortam madeira e constroem (Fazenda, Serraria,
 * Quartel, Estábulo, Oficina, Torre Arcana, Aviário, Casas), o Quartel treina Espadachins/Arqueiros, o Estábulo Cavaleiros, a Oficina Balistas, a Torre Arcana Magos e
 * o Aviário um Grifo (armas combinadas); a tropa defende a base contra as levas e só depois marcha ao Farol Boreal, segura-o por 3 min e derruba o forte dos Lanças
 * Quebradas. Nada de teletransporte nem dano injetado. O Capitão Brann fica na retaguarda (reserva). O comboio, as ruínas e o resto das secundárias não são
 * necessários para vencer (têm testes próprios em tests/unit/campaignM06*.test.js).
 * O robô só VENCE se montar o exército: o roteiro `noArmy` (mesma economia, nenhuma tropa) PERDE para as levas; a investida precoce com as unidades do início (`rush`)
 * não derruba o forte.
 */
export const campaignId = 'war-alliance';
export const targetMinutes = 20; // ficha: 20–25 min (jogador humano); o harness aceita até 2×. O robô não pensa nem olha a câmera e fecha em ~17 min (4 jogadores, mapa de 320: ~2 min de relógio por execução).

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const posOf = (e) => ({ x: e.mesh.position.x, z: e.mesh.position.z });
const nearest = (list, p) => list.slice().sort((a, b) => dist(posOf(a), p) - dist(posOf(b), p))[0];
const bot = (c) => (c.gm.__bot ||= { last: {}, launched: false, field: new Set() });
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
const place = (c, type, minR = 9) => placeAround(c, type, homeOf(c), minR, 48);

/** Papéis dos aldeões, por ordem de id. Muito ouro: o arsenal completo come ouro, madeira e pedra. */
const ROLES = ['gold', 'gold', 'wood', 'gold', 'gold', 'wood', 'stone', 'gold', 'wood', 'gold', 'gold', 'wood', 'stone', 'gold', 'wood', 'gold', 'wood', 'gold'];
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
    if (role === 'stone' && res(c).stone > 320) role = 'wood';
    if (role === 'gold' && res(c).gold > 1800) role = 'wood';
    if (role === 'wood' && res(c).wood > 1000) role = 'gold';
    const target = role === 'stone' ? stone : role === 'wood' ? tree : golds[0];
    if (target) c.issue({ type: c.CMD.GATHER, unitIds: [u.id], targetId: target.id });
  });
}

const OBRAS = { watchtower: { wood: 80, stone: 40 }, cottage: { wood: 50 }, farm: { wood: 60 }, barracks: { wood: 120, stone: 60 }, lumber_camp: { wood: 80 }, stable: { gold: 200, wood: 60, stone: 40 }, workshop: { gold: 180, wood: 100, stone: 40 }, arcane_tower: { gold: 250, wood: 80, stone: 80 }, aviary: { gold: 300, wood: 150, stone: 60 } };

/** Fila de obras: o robô só passa à seguinte quando a atual já foi posta. Serraria junto do bosque mais próximo da base. */
function camp(c) {
  const home = c.anchor('playerStart');
  const tree = nearest(c.gm.trees.filter((t) => !t.isDead), home);
  return placeAround(c, 'lumber_camp', posOf(tree), 5, 20);
}
const tower = (n, dx, dz) => ({ id: `tower${n}`, cost: 'watchtower', done: (c) => count(c, 'watchtower') >= n, go: (c) => placeAround(c, 'watchtower', c.anchor('playerStart', dx, dz), 3, 16) });
// 3 Torres de Vigia na frente da base (rumo aos clãs): defesa fixa enquanto a tropa está no Farol
const QUEUE = [
  { id: 'farm', cost: 'farm', done: (c) => count(c, 'farm') > 0, go: (c) => place(c, 'farm') },
  { id: 'camp', cost: 'lumber_camp', done: (c) => count(c, 'lumber_camp') > 0, go: camp },
  { id: 'barracks', cost: 'barracks', done: (c) => count(c, 'barracks') > 0, go: (c) => place(c, 'barracks') },
  { id: 'arcane', cost: 'arcane_tower', done: (c) => count(c, 'arcane_tower') > 0, go: (c) => place(c, 'arcane_tower') },
  tower(1, 12, -8),
  { id: 'workshop', cost: 'workshop', done: (c) => count(c, 'workshop') > 0, go: (c) => place(c, 'workshop') },
  tower(2, 4, -16),
  { id: 'stable', cost: 'stable', done: (c) => count(c, 'stable') > 0, go: (c) => place(c, 'stable') },
  { id: 'aviary', cost: 'aviary', done: (c) => count(c, 'aviary') > 0, go: (c) => place(c, 'aviary') },
  tower(3, 18, 2)
];

function econ(c, { army = true } = {}) {
  const b = bot(c);
  keepWorking(c);
  const unfinished = c.gm.buildings.find((x) => x.ownerId === 0 && !x.isDead && !x.isConstructed && x.role !== 'wall');
  if (unfinished) {
    const vs = builders(c);
    if (vs.length) c.issue({ type: c.CMD.BUILD, unitIds: vs, buildingId: unfinished.id });
  }
  const castle = c.bld('castle');
  if (castle && c.mine('villager').length < 16 && castle.queue.length === 0) c.issue({ type: c.CMD.TRAIN, buildingId: castle.id, unitType: 'villager' });
  const popCap = c.gm.getPlayer(0).maxPopulation ?? 0;
  const pop = c.gm.getUnitsOf(0).filter((u) => !u.isDead).length;
  if (!unfinished && pop >= popCap - 3 && count(c, 'cottage') < 10 && affordable(c, OBRAS.cottage) && c.seconds - (b.last.cottage ?? -99) > 15) { if (place(c, 'cottage', 10)) b.last.cottage = c.seconds; }
  const q = QUEUE.find((x) => !x.done(c));
  if (q && !unfinished && affordable(c, OBRAS[q.cost]) && c.seconds - (b.last[q.id] ?? -99) > 12) { if (q.go(c)) b.last[q.id] = c.seconds; }
  if (!army) return;
  const rt = c.gm.mission;
  const arcane = c.bld('arcane_tower');
  if (arcane && arcane.queue.length < 2 && c.mine('mage').length + arcane.queue.length < 6 && res(c).gold > 130) c.issue({ type: c.CMD.TRAIN, buildingId: arcane.id, unitType: 'mage' });
  const aviary = c.bld('aviary');
  if (aviary && aviary.queue.length < 1 && rt.trainedCount(0, 'gryphon_rider') + aviary.queue.length < 1 && res(c).gold > 330) c.issue({ type: c.CMD.TRAIN, buildingId: aviary.id, unitType: 'gryphon_rider' });
  const workshop = c.bld('workshop');
  if (workshop && workshop.queue.length < 1 && rt.trainedCount(0, 'ballista') + workshop.queue.length < 3 && res(c).gold > 110 && res(c).wood > 230) c.issue({ type: c.CMD.TRAIN, buildingId: workshop.id, unitType: 'ballista' });
  const stable = c.bld('stable');
  if (stable && stable.queue.length < 1 && res(c).gold > 150) c.issue({ type: c.CMD.TRAIN, buildingId: stable.id, unitType: 'cavalier' });
  const barracks = c.bld('barracks');
  const reserve = !arcane ? 260 : c.mine('mage').length < 4 ? 130 : 0; // a Torre Arcana vem antes da tropa do Quartel: o ouro espera por ela
  if (barracks && barracks.queue.length < 2 && res(c).gold > reserve + 40) {
    const n = rt.trainedCount(0, 'knight') + rt.trainedCount(0, 'archer');
    c.issue({ type: c.CMD.TRAIN, buildingId: barracks.id, unitType: n % 3 === 0 ? 'knight' : 'archer' });
  }
}

const isTroop = (u) => u.type !== 'villager' && u.type !== 'hero_brann';
const TROOPS_BEFORE_LAUNCH = 22;
const LAUNCH_AFTER = 540; // depois da 1ª investida pesada dos clãs (a IA Difícil dos Lanças Quebradas chega à base por volta dos 7 min)
const STORM_TROOPS = 22; // tropa de campo (sem Aldeões nem Brann) para investir contra o forte dos Lanças
const GUARD_SIZE = 10; // tropa que fica em casa contra as levas depois da 1ª marcha

/**
 * A tropa espera à frente da base (rumo ao nordeste); Brann fica atrás dela e só entra com as habilidades se o inimigo chega a ele. Marcha ao Farol Boreal quando
 * há tropa suficiente (Magos incluídos), segura-o e, concluído o contador, segue para o forte dos Lanças Quebradas. Tropa nova fica em casa (guarda) até juntar GUARDA.
 */
function station(c, { attack = true } = {}) {
  const b = bot(c);
  const home = c.anchor('playerStart');
  const rally = c.anchor('playerStart', 12, -6);
  const brann = c.tagged('brann')[0];
  const enemies = c.gm.allUnits.filter((u) => !u.isDead && c.gm.isHostile(0, u.ownerId));
  if (brann && !brann.isDead) {
    const near = enemies.filter((u) => dist(posOf(u), posOf(brann)) < 10);
    if (near.length >= 1) {
      c.issue({ type: c.CMD.CAST, unitIds: [brann.id], abilityId: 'hero_war_cry' });
      c.issue({ type: c.CMD.CAST, unitIds: [brann.id], abilityId: 'hero_defensive_stance' });
    } else if (!b.launched && dist(posOf(brann), c.anchor('playerStart', 4, 4)) > 6 && brann.state !== 'moving') c.issue({ type: c.CMD.MOVE, unitIds: [brann.id], x: c.anchor('playerStart', 4, 4).x, z: c.anchor('playerStart', 4, 4).z });
  }
  const troops = c.mine().filter(isTroop);
  const homeThreat = enemies.filter((u) => dist(posOf(u), home) < 50);
  const ready = attack && !b.launched && c.seconds >= LAUNCH_AFTER && troops.length >= TROOPS_BEFORE_LAUNCH && c.mine('mage').length >= 2 && homeThreat.length === 0;
  if (ready) { b.launched = true; for (const u of troops.slice().sort((x, y) => x.id - y.id).slice(0, Math.max(0, troops.length - GUARD_SIZE))) b.field.add(u.id); }
  if (b.launched) {
    // reforços: a guarda de casa vira campo quando passa de GUARD_SIZE
    const guard = troops.filter((u) => !b.field.has(u.id));
    if (guard.length >= GUARD_SIZE + 6 && homeThreat.length === 0) for (const u of guard.slice().sort((x, y) => x.id - y.id).slice(0, guard.length - GUARD_SIZE)) b.field.add(u.id); // o excedente sobre a guarda vira reforço do campo
    const field0 = troops.filter((u) => b.field.has(u.id));
    const hall = c.tagged('fort_hall').filter((x) => !x.isDead)[0];
    const holdDone = c.status('p-hold') === 'completed';
    // prioridade: socorrer Brumar se o forte aliado está cercado; depois o Farol; concluído o contador, o forte dos Lanças
    const allyPos = c.anchor('allyFort');
    const siege = enemies.filter((u) => dist(posOf(u), allyPos) < 45).length;
    const storm = field0.length >= STORM_TROOPS; // só investe contra o forte com tropa grande
    const key = siege >= 4 ? 'ally' : holdDone && hall && (storm || (b.stormed && field0.length >= 12)) ? 'fort' : 'light';
    b.stormed = key === 'fort';
    const targetPos = key === 'ally' ? allyPos : key === 'fort' ? posOf(hall) : c.anchor('lighthouse', -4, 8);
    const field = troops.filter((u) => b.field.has(u.id));
    const changed = b.target !== key;
    b.target = key;
    const idle = changed ? field : field.filter((u) => u.state === 'idle' || (u.state !== 'attacking' && dist(posOf(u), targetPos) > 30 && u.state !== 'moving'));
    if (idle.length) c.issue({ type: c.CMD.ATTACK_MOVE, unitIds: idle.map((u) => u.id), x: targetPos.x, z: targetPos.z });
    // Brann acompanha o campo, SEMPRE atrás da tropa (vai ao centro do grupo, nunca à frente): o herói não fica sozinho na base nem corre na frente
    if (brann && !brann.isDead && field.length && brann.state !== 'attacking') {
      const cx = field.reduce((a, u) => a + posOf(u).x, 0) / field.length, cz = field.reduce((a, u) => a + posOf(u).z, 0) / field.length;
      const fx = posOf(field[0]); void fx;
      const back = { x: cx + (home.x - cx) * 0.12, z: cz + (home.z - cz) * 0.12 }; // um pouco do lado da base: atrás da linha
      if (dist(posOf(brann), back) > 10) c.issue({ type: c.CMD.MOVE, unitIds: [brann.id], x: back.x, z: back.z });
    }
    // a guarda de casa defende a base
    const gIdle = guard.filter((u) => u.state === 'idle' && dist(posOf(u), rally) > 10);
    if (homeThreat.length) { const t = posOf(homeThreat[0]); const gs = guard.filter((u) => u.state !== 'attacking'); if (gs.length) c.issue({ type: c.CMD.ATTACK_MOVE, unitIds: gs.map((u) => u.id), x: t.x, z: t.z }); }
    else if (gIdle.length) c.issue({ type: c.CMD.MOVE, unitIds: gIdle.map((u) => u.id), x: rally.x, z: rally.z });
    return;
  }
  // antes da 1ª marcha: se o inimigo chega à base, toda a tropa contra-ataca (ordem de ataque ao grupo mais próximo); passado o perigo, volta ao ponto de reunião
  if (homeThreat.length) {
    const t = posOf(nearest(homeThreat, home));
    const gs = troops.filter((u) => u.state !== 'attacking');
    if (gs.length) c.issue({ type: c.CMD.ATTACK_MOVE, unitIds: gs.map((u) => u.id), x: t.x, z: t.z });
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
    timeout: 3600
  }
];

export const makeLoop = loop;
export const win = loop({ army: true, attack: true });
/** Mesma economia (e as mesmas obras), mas SEM treinar tropa e sem marchar: tem de perder para as levas. */
export const noArmy = loop({ army: false, attack: false });

/**
 * Investida precoce: só as unidades do início (Brann, 2 Espadachins, 1 Arqueiro) marcham para o forte dos Lanças Quebradas; sem treinar ninguém.
 * Tem de terminar SEM vitória e sem derrubar o forte.
 */
export const rush = [
  {
    name: 'investida',
    wait: 1,
    run: (c) => {
      const p = c.anchor('enemy1Fort');
      c.issue({ type: c.CMD.ATTACK_MOVE, unitIds: c.mine().filter((u) => u.type !== 'villager').map((u) => u.id), x: p.x, z: p.z });
    },
    each: () => {},
    until: (c) => c.seconds > 300 || c.mine().filter((u) => u.type !== 'villager').length === 0,
    timeout: 360
  }
];

/** Derrota: o jogador local é aniquilado antes de qualquer objetivo. */
export const lose = [
  {
    name: 'aniquilado',
    wait: 5,
    run: (c) => {
      const killer = c.gm.allUnits.find((u) => u.ownerId === 2);
      for (const u of c.mine()) u.takeDamage(1e6, killer);
      for (const b of c.gm.buildings.filter((x) => x.ownerId === 0)) b.takeDamage(1e6, killer);
    }
  }
];
