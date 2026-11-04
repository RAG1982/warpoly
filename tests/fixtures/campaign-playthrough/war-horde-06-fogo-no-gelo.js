/**
 * Roteiro de playthrough da m06 da Horda "Fogo no Gelo" (M4-06, Prova de Fogo). Espelho da m06 da Aliança (war-alliance-06-a-geada.js) com os lados trocados: o jogador
 * (Clãs do Cinzal) ocupa o mesmo palco a oeste, o aliado de IA é o Clã Marés Negras (leste) e os inimigos são Brumar (nordeste, com Brann) e a Guarda Real (noroeste).
 * Tudo por comandos reais do jogador: Lacaios minam, cortam madeira e constroem (Cercado de Javalis, Serraria, Acampamento de Guerra, Covil dos Ogros, Oficina, Santuário
 * das Cinzas, Ninho das Serpes, Tocas, torres), o Acampamento treina Talhadores/Lanceiros, o Covil Ogros, a Oficina Catapultas, o Santuário Necromantes e o Ninho uma Serpe
 * (armas combinadas); a tropa defende a base contra as levas e só depois marcha ao Farol Boreal, segura-o por 3 min e derruba o forte de Brumar. Nada de teletransporte nem
 * dano injetado. Drogath fica na retaguarda (reserva). O comboio, as ruínas e o resto das secundárias não são necessários para vencer (têm testes próprios em
 * tests/unit/campaignHordeM06.test.js). O robô só VENCE se montar o exército: o roteiro `noArmy` (mesma economia, nenhuma tropa) PERDE para as levas; a investida precoce
 * com as unidades do início (`rush`) não derruba o forte.
 */
export const campaignId = 'war-horde';
export const targetMinutes = 20; // ficha: 20–25 min (jogador humano); o harness aceita até 2×. O robô não pensa nem olha a câmera e, pós-merge, fecha em ~30 min (1825 s; 4 jogadores, mapa de 320: ~2 min de relógio por execução).

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const posOf = (e) => ({ x: e.mesh.position.x, z: e.mesh.position.z });
const nearest = (list, p) => list.slice().sort((a, b) => dist(posOf(a), p) - dist(posOf(b), p))[0];
const bot = (c) => (c.gm.__bot ||= { last: {}, launched: false, field: new Set() });
const res = (c) => c.gm.getPlayer(0).resources;
const affordable = (c, cost) => Object.entries(cost).every(([k, v]) => (res(c)[k] || 0) >= v);
const count = (c, type) => c.gm.buildings.filter((x) => x.ownerId === 0 && x.type === type && !x.isDead).length;

/** 3 Lacaios para obra: os mais próximos do Salão que não estejam construindo. */
function builders(c, n = 3) {
  const home = c.anchor('playerStart');
  return c.mine('peon').filter((u) => u.state !== 'building').sort((a, b) => dist(posOf(a), home) - dist(posOf(b), home)).slice(0, n).map((u) => u.id);
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
const homeOf = (c) => posOf(c.bld('great_hall'));
const place = (c, type, minR = 9) => placeAround(c, type, homeOf(c), minR, 48);

/** Papéis dos aldeões, por ordem de id. Muito ouro: o arsenal completo come ouro, madeira e pedra. */
const ROLES = ['gold', 'gold', 'wood', 'gold', 'gold', 'gold', 'stone', 'gold', 'wood', 'gold', 'gold', 'wood', 'stone', 'gold', 'gold', 'gold', 'wood', 'gold']; // pós-merge: o ouro é o gargalo (a madeira sobrava), menos lenhadores
function keepWorking(c) {
  const home = c.anchor('playerStart');
  const golds = c.gm.resourceDeposits.filter((r) => r.type === 'gold' && !r.isDead).sort((a, b) => dist(posOf(a), home) - dist(posOf(b), home));
  const stone = nearest(c.gm.resourceDeposits.filter((r) => r.type === 'stone' && !r.isDead), home);
  const camp = c.gm.buildings.find((x) => x.ownerId === 0 && x.type === 'orc_lumber_mill' && !x.isDead && x.isConstructed);
  const trees = c.gm.trees.filter((t) => !t.isDead);
  const tree = nearest(trees, camp ? posOf(camp) : home);
  c.mine('peon').sort((a, b) => a.id - b.id).forEach((u, i) => {
    if (u.state !== 'idle') return;
    let role = ROLES[i % ROLES.length];
    if (role === 'stone' && res(c).stone > 320) role = 'wood';
    if (role === 'gold' && res(c).gold > 1800) role = 'wood';
    if (role === 'wood' && res(c).wood > 1000) role = 'gold';
    const target = role === 'stone' ? stone : role === 'wood' ? tree : golds[i % Math.max(1, Math.min(golds.length, 2))]; // 2 minas mais perto do Salão
    if (target) c.issue({ type: c.CMD.GATHER, unitIds: [u.id], targetId: target.id });
  });
}

const OBRAS = { orc_watchtower: { wood: 85, stone: 40 }, orc_house: { wood: 50 }, pig_farm: { wood: 55 }, orc_barracks: { wood: 130, stone: 50 }, orc_lumber_mill: { wood: 85 }, ogre_den: { gold: 200, wood: 60, stone: 40 }, orc_workshop: { gold: 180, wood: 100, stone: 40 }, ash_sanctum: { gold: 250, wood: 80, stone: 80 }, serpent_nest: { gold: 300, wood: 150, stone: 60 } };

/** Fila de obras: o robô só passa à seguinte quando a atual já foi posta. Serraria junto do bosque mais próximo da base. */
function camp(c) {
  const home = c.anchor('playerStart');
  const tree = nearest(c.gm.trees.filter((t) => !t.isDead), home);
  return placeAround(c, 'orc_lumber_mill', posOf(tree), 5, 20);
}
const tower = (n, dx, dz) => ({ id: `tower${n}`, cost: 'orc_watchtower', done: (c) => count(c, 'orc_watchtower') >= n, go: (c) => placeAround(c, 'orc_watchtower', c.anchor('playerStart', dx, dz), 3, 16) });
// 3 Torres de Vigia na frente da base (rumo aos clãs): defesa fixa enquanto a tropa está no Farol
const QUEUE = [
  { id: 'pig_farm', cost: 'pig_farm', done: (c) => count(c, 'pig_farm') > 0, go: (c) => place(c, 'pig_farm') },
  { id: 'camp', cost: 'orc_lumber_mill', done: (c) => count(c, 'orc_lumber_mill') > 0, go: camp },
  { id: 'orc_barracks', cost: 'orc_barracks', done: (c) => count(c, 'orc_barracks') > 0, go: (c) => place(c, 'orc_barracks') },
  { id: 'arcane', cost: 'ash_sanctum', done: (c) => count(c, 'ash_sanctum') > 0, go: (c) => place(c, 'ash_sanctum') },
  tower(1, 12, -8),
  { id: 'orc_workshop', cost: 'orc_workshop', done: (c) => count(c, 'orc_workshop') > 0, go: (c) => place(c, 'orc_workshop') },
  tower(2, 4, -16),
  { id: 'ogre_den', cost: 'ogre_den', done: (c) => count(c, 'ogre_den') > 0, go: (c) => place(c, 'ogre_den') },
  { id: 'serpent_nest', cost: 'serpent_nest', done: (c) => count(c, 'serpent_nest') > 0, go: (c) => place(c, 'serpent_nest') },
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
  const castle = c.bld('great_hall');
  if (castle && c.mine('peon').length < 16 && castle.queue.length === 0) c.issue({ type: c.CMD.TRAIN, buildingId: castle.id, unitType: 'peon' });
  const popCap = c.gm.getPlayer(0).maxPopulation ?? 0;
  const pop = c.gm.getUnitsOf(0).filter((u) => !u.isDead).length;
  if (!unfinished && pop >= popCap - 3 && count(c, 'orc_house') < 10 && affordable(c, OBRAS.orc_house) && c.seconds - (b.last.orc_house ?? -99) > 15) { if (place(c, 'orc_house', 10)) b.last.orc_house = c.seconds; }
  const q = QUEUE.find((x) => !x.done(c));
  if (q && !unfinished && affordable(c, OBRAS[q.cost]) && c.seconds - (b.last[q.id] ?? -99) > 12) { if (q.go(c)) b.last[q.id] = c.seconds; }
  if (!army) return;
  const rt = c.gm.mission;
  const arcane = c.bld('ash_sanctum');
  if (arcane && arcane.queue.length < 2 && c.mine('necromancer').length + arcane.queue.length < 6 && res(c).gold > 130) c.issue({ type: c.CMD.TRAIN, buildingId: arcane.id, unitType: 'necromancer' });
  const aviary = c.bld('serpent_nest');
  if (aviary && aviary.queue.length < 1 && rt.trainedCount(0, 'war_serpent') + aviary.queue.length < 1 && res(c).gold > 330) c.issue({ type: c.CMD.TRAIN, buildingId: aviary.id, unitType: 'war_serpent' });
  const workshop = c.bld('orc_workshop');
  if (workshop && workshop.queue.length < 1 && rt.trainedCount(0, 'catapult') + workshop.queue.length < 3 && res(c).gold > 110 && res(c).wood > 230) c.issue({ type: c.CMD.TRAIN, buildingId: workshop.id, unitType: 'catapult' });
  const stable = c.bld('ogre_den');
  if (stable && stable.queue.length < 1 && res(c).gold > 150) c.issue({ type: c.CMD.TRAIN, buildingId: stable.id, unitType: 'ogre' });
  const barracks = c.bld('orc_barracks');
  const reserve = !arcane ? 260 : c.mine('necromancer').length < 4 ? 130 : 0; // o Santuário das Cinzas vem antes da tropa do Acampamento: o ouro espera por ela
  if (barracks && barracks.queue.length < 2 && res(c).gold > reserve + 40) {
    const n = rt.trainedCount(0, 'grunt') + rt.trainedCount(0, 'axethrower');
    c.issue({ type: c.CMD.TRAIN, buildingId: barracks.id, unitType: n % 3 === 0 ? 'grunt' : 'axethrower' });
  }
}

const isTroop = (u) => u.type !== 'peon' && u.type !== 'hero_drogath';
const TROOPS_BEFORE_LAUNCH = 34; // pós-merge (cura dos Magos inimigos, planadores à distância): marcha com mais tropa
const LAUNCH_AFTER = 720; // depois da 1ª investida pesada dos clãs (a IA de Brumar chega à base por volta dos 7 min)
const STORM_TROOPS = 28; // tropa de campo (sem Lacaios nem Drogath) para investir contra o forte de Brumar
const GUARD_SIZE = 10; // tropa que fica em casa contra as levas depois da 1ª marcha

/**
 * A tropa espera à frente da base (rumo ao nordeste); Drogath fica atrás dela e só entra com as habilidades se o inimigo chega a ele. Marcha ao Farol Boreal quando
 * há tropa suficiente (Necromantes incluídos), segura-o e, concluído o contador, segue para o forte de Brumar. Tropa nova fica em casa (guarda) até juntar GUARDA.
 */
function station(c, { attack = true } = {}) {
  const b = bot(c);
  const home = c.anchor('playerStart');
  const rally = c.anchor('playerStart', 12, -6);
  const drogath = c.tagged('drogath')[0];
  const enemies = c.gm.allUnits.filter((u) => !u.isDead && c.gm.isHostile(0, u.ownerId));
  if (drogath && !drogath.isDead) {
    const near = enemies.filter((u) => dist(posOf(u), posOf(drogath)) < 10);
    if (near.length >= 1) {
      c.issue({ type: c.CMD.CAST, unitIds: [drogath.id], abilityId: 'hero_war_cry' });
      c.issue({ type: c.CMD.CAST, unitIds: [drogath.id], abilityId: 'hero_clan_fire' });
    } else if (dist(posOf(drogath), c.anchor('playerStart', 4, 4)) > 6 && drogath.state !== 'moving') c.issue({ type: c.CMD.MOVE, unitIds: [drogath.id], x: c.anchor('playerStart', 4, 4).x, z: c.anchor('playerStart', 4, 4).z });
  }
  const troops = c.mine().filter(isTroop);
  const homeThreat = enemies.filter((u) => dist(posOf(u), home) < 50);
  const ready = attack && !b.launched && c.seconds >= LAUNCH_AFTER && troops.length >= TROOPS_BEFORE_LAUNCH && c.mine('necromancer').length >= 2 && homeThreat.length === 0;
  if (ready) { b.launched = true; for (const u of troops.slice().sort((x, y) => x.id - y.id).slice(0, Math.max(0, troops.length - GUARD_SIZE))) b.field.add(u.id); }
  if (b.launched) {
    // reforços: a guarda de casa vira campo quando passa de GUARD_SIZE
    const guard = troops.filter((u) => !b.field.has(u.id));
    if (guard.length >= GUARD_SIZE + 6 && homeThreat.length === 0) for (const u of guard.slice().sort((x, y) => x.id - y.id).slice(0, guard.length - GUARD_SIZE)) b.field.add(u.id); // o excedente sobre a guarda vira reforço do campo
    const field0 = troops.filter((u) => b.field.has(u.id));
    const hall = c.tagged('fort_hall').filter((x) => !x.isDead)[0];
    const holdDone = c.status('p-hold') === 'completed';
    // prioridade: socorrer o Salão aliado se o forte está cercado; depois o Farol; concluído o contador, o forte de Brumar
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
    // Drogath fica em casa com a guarda (reserva): sozinho no campo ele cai para as levas que cruzam o meio
    if (drogath && !drogath.isDead && drogath.state === 'idle' && dist(posOf(drogath), c.anchor('playerStart', 4, 4)) > 6) c.issue({ type: c.CMD.MOVE, unitIds: [drogath.id], x: c.anchor('playerStart', 4, 4).x, z: c.anchor('playerStart', 4, 4).z });
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
 * Investida precoce: só as unidades do início (Drogath e a tropa do início) marcham para o forte de Brumar; sem treinar ninguém.
 * Tem de terminar SEM vitória e sem derrubar o forte.
 */
export const rush = [
  {
    name: 'investida',
    wait: 1,
    run: (c) => {
      const p = c.anchor('enemy1Fort');
      c.issue({ type: c.CMD.ATTACK_MOVE, unitIds: c.mine().filter((u) => u.type !== 'peon').map((u) => u.id), x: p.x, z: p.z });
    },
    each: () => {},
    until: (c) => c.seconds > 300 || c.mine().filter((u) => u.type !== 'peon').length === 0,
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
