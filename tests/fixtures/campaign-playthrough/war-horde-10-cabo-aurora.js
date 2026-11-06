/**
 * Roteiro de playthrough da m10 da Horda "Desembarque no Cabo Aurora" (M4-10). Espelho da m10 da Aliança (war-alliance-10-desembarque-costa-ferrugem.js)
 * com os lados invertidos: a base do jogador é a ilha LESTE e a praia de Velmara fica a oeste. Tudo por comandos reais do jogador: Lacaios minam, cortam
 * madeira e constroem (Cercado de Javalis, Serraria, Acampamento, Doca do Clã na costa da ilha, Santuário das Cinzas); a Doca treina Galés de Guerra
 * (o petróleo vem da ajuda inicial da missão), que afundam a patrulha de fragatas do Farol (a esquadra só sai em grupo de 3). As Barcaças levam a
 * tropa (LOAD) à praia de Velmara (UNLOAD), uma de cada vez, em viagens de ida e volta: a "balsa" leva as unidades que esperam na ilha (Vozgul entre elas).
 * Drogath fica no Salão (herói único: sua morte é derrota). Na praia a tropa defende o Marco e, com o Marco de pé, ataca as 3 torres da guarda costeira.
 * Nada de teletransporte nem dano injetado.
 * `noArmy` (economia, nenhum soldado novo, nenhuma Barcaça embarcada) não vence; `rush` (só a tropa do início por terra, sem travessia) não vence;
 * `lose` (aniquilado) perde.
 */
import { BUILDINGS } from '../../../src/data/buildings.js';

export const campaignId = 'war-horde';
export const targetMinutes = 15; // ficha: 15–20 min (jogador humano); o harness aceita até 2×.

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const posOf = (e) => ({ x: e.mesh.position.x, z: e.mesh.position.z });
const nearest = (list, p) => list.slice().sort((a, b) => dist(posOf(a), p) - dist(posOf(b), p))[0];
const bot = (c) => (c.gm.__bot ||= { last: {}, ferry: {}, go: false });
const res = (c) => c.gm.getPlayer(0).resources;
const affordable = (c, cost) => Object.entries(cost).every(([k, v]) => (res(c)[k] || 0) >= v);
const count = (c, type) => c.gm.buildings.filter((x) => x.ownerId === 0 && x.type === type && !x.isDead).length;
const alive = (list) => list.filter((u) => u && !u.isDead);
/** O Salão da ilha (não o Marco da Colônia, que também é um `great_hall`). */
const hall = (c) => alive(c.tagged('home_hall'))[0];
const homeOf = (c) => posOf(hall(c));

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
/** Obras grandes (Santuário, Acampamento): anel mais largo, porque as casas ocupam o anel perto do Salão. */
const placeWide = (c, type, minR = 9) => placeAround(c, type, homeOf(c), minR, 64);

/** Papéis dos Lacaios, por ordem de id (2 de cada 3 no ouro; pedra só 1 em 9). Só os ociosos recebem tarefa nova. */
const ROLES = ['gold', 'wood', 'wood', 'gold', 'wood', 'gold', 'wood', 'stone', 'gold', 'wood', 'wood', 'gold', 'wood', 'gold', 'wood', 'wood', 'gold', 'wood'];
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
    if (role === 'stone' && res(c).stone > 260) role = 'wood';
    if (role === 'gold' && res(c).gold > 1500) role = 'wood';
    if (role === 'wood' && res(c).wood > 900) role = 'gold';
    const target = role === 'stone' ? stone : role === 'wood' ? tree : golds[i % Math.max(1, Math.min(golds.length, 2))];
    if (target) c.issue({ type: c.CMD.GATHER, unitIds: [u.id], targetId: target.id });
  });
}

/** Serraria junto da árvore mais próxima da base. */
function mill(c) {
  const home = c.anchor('playerStart');
  const tree = nearest(c.gm.trees.filter((t) => !t.isDead), home);
  return placeAround(c, 'orc_lumber_mill', posOf(tree), 5, 20);
}
/** Doca do Clã: a 5–12 u da água do ancoradouro (`shipyard1Water`), onde `getDockPoint` acha mar navegável para os navios saírem. */
function dock(c) {
  const w = c.anchor('shipyard1Water');
  const pts = [];
  for (let dz = -12; dz <= 12; dz += 1) for (let dx = -12; dx <= 12; dx += 1) {
    const r = Math.hypot(dx, dz);
    if (r >= 5 && r <= 12) pts.push({ x: w.x + dx, z: w.z + dz, r });
  }
  pts.sort((a, b) => Math.abs(a.r - 6.5) - Math.abs(b.r - 6.5));
  for (const p of pts) {
    if (c.gm.canPlaceBuilding('ship_dock', p.x, p.z, null, 0)) { c.issue({ type: c.CMD.PLACE_BUILDING, buildingType: 'ship_dock', x: p.x, z: p.z, unitIds: builders(c, 3, w) }); return true; }
  }
  return false;
}
// Fazenda e Acampamento primeiro (a Doca exige o Acampamento); a Doca antes das casas: os poucos pontos de costa somem quando a base se espalha.
const QUEUE = [
  { id: 'farm', type: 'pig_farm', done: (c) => count(c, 'pig_farm') > 0, go: (c) => place(c, 'pig_farm') },
  { id: 'mill', type: 'orc_lumber_mill', done: (c) => count(c, 'orc_lumber_mill') > 0, go: mill },
  { id: 'barracks', type: 'orc_barracks', done: (c) => count(c, 'orc_barracks') > 0, go: (c) => placeWide(c, 'orc_barracks') },
  { id: 'dock', type: 'ship_dock', done: (c) => count(c, 'ship_dock') > 0, go: dock },
  { id: 'den', type: 'ogre_den', done: (c) => count(c, 'ogre_den') > 0, go: (c) => placeWide(c, 'ogre_den') },
  { id: 'sanctum', type: 'ash_sanctum', done: (c) => count(c, 'ash_sanctum') > 0, go: (c) => placeWide(c, 'ash_sanctum') }
];

const GALLEYS_TARGET = 4;
const NECROS_TARGET = 3;
const ARMY_MAX = 40; // teto de tropa treinada: a população (Salão + casas) precisa sobrar para as Galés
const GO_MIN = 24; // só zarpa com o grupo todo: senão as levas matam a tropa aos poucos na praia

const isTroop = (u) => u.type !== 'peon' && u.type !== 'tanker' && u.type !== 'war_galley' && u.type !== 'barge' && u.type !== 'hero_drogath';
const enemyShips = (c, p, r) => c.gm.allUnits.filter((u) => !u.isDead && u.ownerId === 1 && u.layer === 'naval' && dist(posOf(u), p) < r);

function econ(c, { army = true, navy = true } = {}) {
  const b = bot(c);
  keepWorking(c);
  const unfinished = c.gm.buildings.find((x) => x.ownerId === 0 && !x.isDead && !x.isConstructed && x.role !== 'wall');
  if (unfinished) {
    const vs = builders(c);
    if (vs.length) c.issue({ type: c.CMD.BUILD, unitIds: vs, buildingId: unfinished.id });
  }
  const h = hall(c);
  if (h && c.mine('peon').length < 16 && h.queue.length === 0) c.issue({ type: c.CMD.TRAIN, buildingId: h.id, unitType: 'peon' });
  const popCap = c.gm.getPlayer(0).maxPopulation ?? 0;
  const pop = c.gm.getUnitsOf(0).filter((u) => !u.isDead).length;
  if (!unfinished && pop >= popCap - 6 && count(c, 'orc_house') < 14 && affordable(c, BUILDINGS.orc_house.cost) && c.seconds - (b.last.house ?? -99) > 10) { if (placeWide(c, 'orc_house', 16)) b.last.house = c.seconds; }
  const yard = c.bld('ship_dock');
  if (navy && yard) {
    // reposição de Barcaças afundadas (a travessia é o único caminho até a praia)
    if (c.mine('barge').length + yard.queue.length < 2 && affordable(c, { gold: 150, wood: 100, oil: 60 }) && yard.queue.length < 2) c.issue({ type: c.CMD.TRAIN, buildingId: yard.id, unitType: 'barge' });
    // Galés de Guerra: a esquadra que limpa o mar (a patrulha e a frota de reforço)
    const gal = c.mine('war_galley');
    if (gal.length + yard.queue.length < GALLEYS_TARGET && affordable(c, { gold: 200, wood: 100, oil: 100 }) && yard.queue.length < 2) c.issue({ type: c.CMD.TRAIN, buildingId: yard.id, unitType: 'war_galley' });
  }
  const q = QUEUE.find((x) => !x.done(c));
  if (q && !unfinished && affordable(c, BUILDINGS[q.type].cost) && c.seconds - (b.last[q.id] ?? -99) > 12) { if (q.go(c)) b.last[q.id] = c.seconds; }
  if (!army) return;
  const rt = c.gm.mission;
  const sanctum = c.bld('ash_sanctum');
  const navyReady = c.mine('war_galley').length >= 3 || res(c).gold > 800; // as Galés vêm antes dos Necromantes (o ouro é curto)
  if (sanctum && navyReady && sanctum.queue.length < 2 && c.mine('necromancer').length + sanctum.queue.length < NECROS_TARGET && affordable(c, { gold: 120 })) c.issue({ type: c.CMD.TRAIN, buildingId: sanctum.id, unitType: 'necromancer' });
  const den = c.bld('ogre_den');
  if (den && den.queue.length < 2 && res(c).gold > 200 && c.mine('ogre').length + den.queue.length < 8 && c.mine().filter((u) => isTroop(u)).length < ARMY_MAX) c.issue({ type: c.CMD.TRAIN, buildingId: den.id, unitType: 'ogre' });
  const barracks = c.bld('orc_barracks');
  if (barracks && barracks.queue.length < 3 && res(c).gold > 300 && c.mine().filter((u) => isTroop(u)).length < ARMY_MAX) {
    const n = rt.trainedCount(0, 'grunt') + rt.trainedCount(0, 'axethrower');
    c.issue({ type: c.CMD.TRAIN, buildingId: barracks.id, unitType: n % 3 === 2 ? 'axethrower' : 'grunt' });
  }
}

/** Tropa que espera na ilha (não embarcada, longe da praia de Velmara), por ordem de id. */
function waiting(c) {
  const land = c.anchor('landingZone');
  const home = c.anchor('playerStart');
  return c.mine().filter((u) => isTroop(u) && !u.transportedBy && dist(posOf(u), land) > 60 && dist(posOf(u), home) < 90).sort((a, b) => a.id - b.id);
}

/**
 * Balsa: cada Barcaça (`barge1`, `barge2`) embarca até 6 unidades que esperam na ilha, navega até a praia de Velmara e solta a carga; volta à sua
 * partida. Só zarpa quando a patrulha do Farol e as fragatas da frota de reforço estão afundadas.
 */
function ferry(c) {
  const b = bot(c);
  const land = c.anchor('landingZone');
  const patrol = alive(c.tagged('patrol_frigate')).length + enemyShips(c, c.anchor('unloadSea'), 90).length;
  const boats = c.mine('barge').sort((x, y) => x.id - y.id);
  for (const tag of ['barge1', 'barge2']) {
    const boat = boats[tag === 'barge1' ? 0 : 1];
    if (!boat) continue;
    const home = c.anchor(tag === 'barge1' ? 'bargeStart1' : 'bargeStart2');
    const st = (b.ferry[tag] ||= { mode: 'home' });
    if (st.mode === 'home') {
      if (dist(posOf(boat), home) > 8 && boat.state !== 'moving') { c.issue({ type: c.CMD.MOVE, unitIds: [boat.id], x: home.x, z: home.z }); continue; }
      const booked = Object.values(b.ferry).flatMap((s) => s.ids ?? []);
      const w = waiting(c).filter((u) => !booked.includes(u.id));
      if (!b.go && w.length + Object.values(b.ferry).reduce((n, f) => n + (f.n ?? 0) * (f.mode === 'home' ? 0 : 1), 0) >= GO_MIN) b.go = true;
      if (b.go && w.length >= 1 && boat.cargo.length === 0 && dist(posOf(boat), home) <= 8) {
        const take = w.slice(0, 6);
        c.issue({ type: c.CMD.LOAD, unitIds: take.map((u) => u.id), targetId: boat.id });
        st.mode = 'loading'; st.t = c.seconds; st.ids = take.map((u) => u.id); st.n = take.length;
      }
    } else if (st.mode === 'loading') {
      const full = boat.cargo.length >= st.n;
      if (!full && c.seconds - st.t < 40) continue;
      if (boat.cargo.length === 0) { st.mode = 'home'; continue; }
      if (patrol > 0) continue; // espera a esquadra limpar a rota
      // uma Barcaça de cada vez na margem: duas no mesmo ponto de água se travam e nenhuma solta a carga
      const other = tag === 'barge1' ? 'barge2' : 'barge1';
      const otherBoat = boats[other === 'barge1' ? 0 : 1];
      if (b.ferry[other]?.mode === 'sailing' && otherBoat && otherBoat.cargo.length > 0) continue;
      c.issue({ type: c.CMD.UNLOAD, unitId: boat.id, x: land.x, z: land.z });
      st.mode = 'sailing'; st.t = c.seconds;
    } else if (st.mode === 'sailing') {
      if (boat.cargo.length === 0) { st.mode = 'home'; st.ids = []; }
      else if (c.seconds - st.t > 30) { c.issue({ type: c.CMD.UNLOAD, unitId: boat.id, x: land.x, z: land.z }); st.t = c.seconds; }
    }
  }
}

/**
 * Tropa na praia: as unidades que chegaram ao desembarque atacam o que estiver a 50 u do Marco e, paradas, ficam perto do Marco. Com o Marco
 * de pé e 5 unidades, a tropa ataca a torre mais próxima (uma por vez), até as 3 caírem.
 */
function ground(c) {
  const colony = c.anchor('colonyMark');
  const front = c.mine().filter((u) => isTroop(u) && !u.transportedBy && dist(posOf(u), c.anchor('landingZone')) < 80);
  const enemies = c.gm.allUnits.filter((u) => !u.isDead && u.ownerId === 1 && u.layer !== 'naval' && u.type !== 'villager');
  const threats = enemies.filter((u) => dist(posOf(u), colony) < 50);
  if (threats.length) {
    const foe = nearest(threats, colony);
    c.issue({ type: c.CMD.ATTACK_MOVE, unitIds: front.map((u) => u.id), x: posOf(foe).x, z: posOf(foe).z });
    return;
  }
  const towers = alive(c.tagged('coast_tower'));
  const marco = alive(c.tagged('colony')).length > 0;
  if (towers.length && (marco ? front.length >= 5 : front.length >= 10)) {
    if (front.some((u) => u.state === 'idle')) c.issue({ type: c.CMD.ATTACK, unitIds: front.map((u) => u.id), targetId: nearest(towers, colony).id });
    return;
  }
  const idle = front.filter((u) => u.state === 'idle' && dist(posOf(u), colony) > 14);
  if (idle.length) c.issue({ type: c.CMD.ATTACK_MOVE, unitIds: idle.map((u) => u.id), x: colony.x, z: colony.z });
}

/** Esquadra: as Galés caçam a patrulha do Farol e depois as fragatas que saem para a praia; sem alvo, ficam no mar aberto (`patrolSea`). */
function fleet(c) {
  const ships = c.mine('war_galley');
  if (!ships.length) return;
  const park = c.anchor('patrolSea');
  const patrol = alive(c.tagged('patrol_frigate'));
  const raiders = c.gm.allUnits.filter((u) => !u.isDead && u.ownerId === 1 && u.layer === 'naval');
  // com menos de 3 Galés a esquadra espera reunida na água da Doca (sozinhas, as fragatas as afundam uma a uma)
  if (ships.length < 3) {
    const yardWater = c.anchor('shipyard1Water');
    const idle = ships.filter((u) => u.state === 'idle' && dist(posOf(u), yardWater) > 10);
    if (idle.length) c.issue({ type: c.CMD.MOVE, unitIds: idle.map((u) => u.id), x: yardWater.x, z: yardWater.z });
    return;
  }
  const foeSea = patrol.length ? nearest(patrol, park) : (raiders.length ? nearest(raiders, park) : null);
  if (foeSea) {
    const idle = ships.filter((u) => u.state !== 'attacking');
    if (idle.length) c.issue({ type: c.CMD.ATTACK_MOVE, unitIds: idle.map((u) => u.id), x: posOf(foeSea).x, z: posOf(foeSea).z });
    return;
  }
  const idle = ships.filter((u) => u.state === 'idle' && dist(posOf(u), park) > 14);
  if (idle.length) c.issue({ type: c.CMD.ATTACK_MOVE, unitIds: idle.map((u) => u.id), x: park.x, z: park.z });
}

const loop = (opts) => [
  {
    name: 'robo',
    every: 5,
    each: (c) => { econ(c, opts); ferry(c); ground(c); fleet(c); },
    until: (c) => c.gm.isGameOver,
    timeout: 2400
  }
];

export const makeLoop = loop;
export const win = loop({ army: true, navy: true });

/** Só a economia (sem exército, sem frota, sem Barcaça embarcada): o Marco nunca nasce e o roteiro não vence. */
export const noArmy = [
  {
    name: 'sem-desembarque',
    every: 5,
    each: (c) => econ(c, { army: false, navy: false }),
    until: (c) => c.seconds >= 900 || c.gm.isGameOver,
    timeout: 1000
  }
];

/**
 * Investida precoce: a tropa do início marcha por terra sobre a base de Aurelan; a ilha não tem caminho a pé até Velmara, então não chega e
 * a missão NÃO vence (as torres seguem de pé e o Marco não nasce).
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
