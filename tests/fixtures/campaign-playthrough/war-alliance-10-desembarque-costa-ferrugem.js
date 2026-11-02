/**
 * Roteiro de playthrough da m10 "Desembarque na Costa Ferrugem" (M3-11). Tudo por comandos reais do jogador: Aldeões minam, cortam madeira e
 * constroem (Fazenda, Serraria, Quartel, Estaleiro na costa da ilha, Refinaria, Torre Arcana); Petroleiros erguem a Plataforma no poço do mar
 * e bombeiam petróleo; o Estaleiro treina Fragatas, que afundam a patrulha de galés do Farol (a esquadra só sai em grupo de 3). As Barcaças
 * levam a tropa (LOAD) à praia de Cinzara (UNLOAD), uma de cada vez, em viagens de ida e volta: a "balsa" leva as unidades que esperam na
 * ilha. Brann fica no Paço (herói único: não vai à praia); Oren vai com a balsa. Na praia, a tropa defende o Marco e, com o Marco de pé, ataca
 * as 3 docas dos Clãs. Nada de teletransporte nem dano injetado.
 * O roteiro `lose` (só a economia, sem desembarque) não vence e, ao chegar a 600 s, é aniquilado (precedente das m01, m04 e m05).
 */
export const campaignId = 'war-alliance';
export const targetMinutes = 15; // ficha: Difícil/G; o harness aceita até 2×. O robô venceu em ~9 min (522 s), com o Paço e Brann vivos.

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const posOf = (e) => ({ x: e.mesh.position.x, z: e.mesh.position.z });
const nearest = (list, p) => list.slice().sort((a, b) => dist(posOf(a), p) - dist(posOf(b), p))[0];
const bot = (c) => (c.gm.__bot ||= { last: {}, ferry: {}, docking: false });
const res = (c) => c.gm.getPlayer(0).resources;
const affordable = (c, cost) => Object.entries(cost).every(([k, v]) => (res(c)[k] || 0) >= v);
const count = (c, type) => c.gm.buildings.filter((x) => x.ownerId === 0 && x.type === type && !x.isDead).length;
const alive = (list) => list.filter((u) => u && !u.isDead);

/** 3 Aldeões para obra: os mais próximos de `near` que não estejam construindo. */
function builders(c, n = 3, near = c.anchor('playerStart')) {
  return c.mine('villager').filter((u) => u.state !== 'building').sort((a, b) => dist(posOf(a), near) - dist(posOf(b), near)).slice(0, n).map((u) => u.id);
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
const homeOf = (c) => posOf(c.bld('castle'));
const place = (c, type, minR = 9) => placeAround(c, type, homeOf(c), minR, 44);
/** Obras grandes (Torre Arcana, Quartel): anel mais largo, porque as casas ocupam o anel perto do Paço. */
const placeWide = (c, type, minR = 9) => placeAround(c, type, homeOf(c), minR, 64);

/**
 * Varredura em grade (passo 1,5 u, do mais perto ao mais longe de `center`, até `R`) pelo primeiro ponto que `canPlaceBuilding` aceita:
 * as construções costeiras (Estaleiro, Refinaria) só cabem em pontos exatos da costa, que o anel de `placeAround` pula.
 */
function placeGrid(c, type, center, R = 30, n = 3) {
  const pts = [];
  for (let dz = -R; dz <= R; dz += 1.5) for (let dx = -R; dx <= R; dx += 1.5) {
    const r = Math.hypot(dx, dz);
    if (r >= 6 && r <= R) pts.push({ x: center.x + dx, z: center.z + dz, r });
  }
  pts.sort((a, b) => a.r - b.r);
  for (const p of pts) {
    if (c.gm.canPlaceBuilding(type, p.x, p.z, null, 0)) { c.issue({ type: c.CMD.PLACE_BUILDING, buildingType: type, x: p.x, z: p.z, unitIds: builders(c, n, center) }); return true; }
  }
  return false;
}

/** Papéis dos aldeões, por ordem de id (2 de cada 3 no ouro; pedra só 1 em 9). Só os ociosos recebem tarefa nova. */
const ROLES = ['gold', 'wood', 'wood', 'gold', 'wood', 'gold', 'wood', 'stone', 'gold', 'wood', 'wood', 'gold', 'wood', 'gold', 'wood', 'wood', 'gold', 'wood'];
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
    const target = role === 'stone' ? stone : role === 'wood' ? tree : golds[i % Math.max(1, Math.min(golds.length, 2))];
    if (target) c.issue({ type: c.CMD.GATHER, unitIds: [u.id], targetId: target.id });
  });
}

const OBRAS = { cottage: { wood: 50 }, farm: { wood: 60 }, barracks: { wood: 120, stone: 60 }, lumber_camp: { wood: 80 }, arcane_tower: { gold: 250, wood: 80, stone: 80 }, shipyard: { gold: 200, wood: 150 }, refinery: { gold: 100, wood: 150, stone: 50 } };

/** Serraria junto da árvore mais próxima da base. */
function camp(c) {
  const home = c.anchor('playerStart');
  const tree = nearest(c.gm.trees.filter((t) => !t.isDead), home);
  return placeAround(c, 'lumber_camp', posOf(tree), 5, 20);
}
/** Estaleiro: na costa da ilha, ao lado do ancoradouro (`shipyard1`), onde as Fragatas saem. */
/** Estaleiro: a 5–12 u da água do ancoradouro (`shipyard1Water`), onde `getDockPoint` acha mar navegável para as Fragatas saírem. */
function shipyard(c) {
  const w = c.anchor('shipyard1Water');
  const pts = [];
  for (let dz = -12; dz <= 12; dz += 1) for (let dx = -12; dx <= 12; dx += 1) {
    const r = Math.hypot(dx, dz);
    if (r >= 5 && r <= 12) pts.push({ x: w.x + dx, z: w.z + dz, r });
  }
  pts.sort((a, b) => Math.abs(a.r - 6.5) - Math.abs(b.r - 6.5));
  for (const p of pts) {
    if (c.gm.canPlaceBuilding('shipyard', p.x, p.z, null, 0)) { c.issue({ type: c.CMD.PLACE_BUILDING, buildingType: 'shipyard', x: p.x, z: p.z, unitIds: builders(c, 3, w) }); return true; }
  }
  return false;
}
/** Refinaria: na costa, perto do Estaleiro (recebe o petróleo dos petroleiros). */
function refinery(c) {
  const yard = c.bld('shipyard');
  if (!yard) return false;
  return placeGrid(c, 'refinery', posOf(yard), 34);
}
// Estaleiro e Refinaria vêm primeiro: os poucos pontos de costa somem assim que as casas e a Fazenda se espalham.
const QUEUE = [
  { id: 'farm', cost: 'farm', done: (c) => count(c, 'farm') > 0, go: (c) => place(c, 'farm') },
  { id: 'camp', cost: 'lumber_camp', done: (c) => count(c, 'lumber_camp') > 0, go: camp },
  { id: 'barracks', cost: 'barracks', done: (c) => count(c, 'barracks') > 0, go: (c) => placeWide(c, 'barracks') },
  { id: 'shipyard', cost: 'shipyard', done: (c) => count(c, 'shipyard') > 0, go: shipyard },
  { id: 'refinery', cost: 'refinery', done: (c) => count(c, 'refinery') > 0, go: refinery },
  { id: 'arcane', cost: 'arcane_tower', done: (c) => count(c, 'arcane_tower') > 0, go: (c) => placeWide(c, 'arcane_tower') }
];

const FRIGATES_TARGET = 4;
const MAGES_TARGET = 2;
const ARMY_MAX = 22; // teto de tropa treinada: a população (Paço + casas) precisa sobrar para as Fragatas

/** Petróleo: depósito de poço mais perto de `anchorName` (a Plataforma nasce sobre ele). */
const wellAt = (c, name) => {
  const p = c.anchor(name);
  return c.gm.resourceDeposits.find((d) => d.type === 'oil' && !d.isDead && dist(posOf(d), p) < 2);
};

function econ(c, { army = true, navy = true } = {}) {
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
  if (!unfinished && pop >= popCap - 6 && count(c, 'cottage') < 8 && affordable(c, OBRAS.cottage) && c.seconds - (b.last.cottage ?? -99) > 10) { if (placeWide(c, 'cottage', 16)) b.last.cottage = c.seconds; }
  // Petróleo: UM Petroleiro ergue a Plataforma no poço do mar (`wellMid1`) e depois coleta; o petróleo vai à Refinaria
  const yard = c.bld('shipyard');
  if (navy && yard) {
    const tankers = c.mine('tanker');
    if (tankers.length + yard.queue.length < 2 && affordable(c, { gold: 100, wood: 60 }) && yard.queue.length < 2) c.issue({ type: c.CMD.TRAIN, buildingId: yard.id, unitType: 'tanker' });
    tankers.forEach((t) => {
      const d = wellAt(c, 'wellMid1');
      if (!d || t.state !== 'idle') return;
      if (!d.platform) { if (affordable(c, { gold: 180, wood: 60 })) c.issue({ type: c.CMD.PLACE_BUILDING, buildingType: 'oil_platform', x: posOf(d).x, z: posOf(d).z, unitIds: [t.id] }); }
      else if (d.platform.isConstructed) c.issue({ type: c.CMD.GATHER, unitIds: [t.id], targetId: d.id });
    });
    // Fragatas: a esquadra que limpa o mar (a patrulha e a frota de reforço)
    const frig = c.mine('frigate');
    if (frig.length + yard.queue.length < FRIGATES_TARGET && res(c).oil >= 100 && affordable(c, { gold: 200, wood: 100 }) && yard.queue.length < 2) c.issue({ type: c.CMD.TRAIN, buildingId: yard.id, unitType: 'frigate' });
  }
  const q = QUEUE.find((x) => !x.done(c));
  if (q && !unfinished && affordable(c, OBRAS[q.cost]) && c.seconds - (b.last[q.id] ?? -99) > 12) { if (q.go(c)) b.last[q.id] = c.seconds; }
  if (!army) return;
  const rt = c.gm.mission;
  const arcane = c.bld('arcane_tower');
  const navyReady = c.mine('frigate').length >= 3 || res(c).gold > 800; // as Fragatas vêm antes dos Magos (o ouro é curto)
  if (arcane && navyReady && arcane.queue.length < 2 && c.mine('mage').length + arcane.queue.length < MAGES_TARGET && affordable(c, { gold: 150 })) c.issue({ type: c.CMD.TRAIN, buildingId: arcane.id, unitType: 'mage' });
  const barracks = c.bld('barracks');
  if (barracks && barracks.queue.length < 3 && res(c).gold > 300 && c.mine().filter((u) => isTroop(u)).length < ARMY_MAX) {
    const n = rt.trainedCount(0, 'knight') + rt.trainedCount(0, 'archer');
    c.issue({ type: c.CMD.TRAIN, buildingId: barracks.id, unitType: n % 3 === 0 ? 'knight' : 'archer' });
  }
}

const isTroop = (u) => u.type !== 'villager' && u.type !== 'tanker' && u.type !== 'frigate' && u.type !== 'barge' && u.type !== 'gryphon_rider';
const galleysNear = (c, p, r) => c.gm.allUnits.filter((u) => !u.isDead && u.ownerId === 1 && u.type === 'war_galley' && dist(posOf(u), p) < r);

/** Tropa da Liga que espera na ilha (não embarcada, longe da praia de Cinzara), por ordem de id. */
function waiting(c) {
  const land = c.anchor('landingZone');
  const home = c.anchor('playerStart');
  return c.mine().filter((u) => isTroop(u) && u.type !== 'hero_brann' && !u.transportedBy && dist(posOf(u), land) > 60 && dist(posOf(u), home) < 90).sort((a, b) => a.id - b.id);
}

/**
 * Balsa: cada Barcaça (`barge1`, `barge2`) embarca até 6 unidades que esperam na ilha (heróis primeiro), navega até a praia de Cinzara e
 * solta a carga; volta à sua partida. Só zarpa quando a patrulha do Farol e as galés da frota de reforço estão afundadas.
 */
function ferry(c) {
  const b = bot(c);
  const land = c.anchor('landingZone');
  const patrol = alive(c.tagged('patrol_galley')).length + galleysNear(c, c.anchor('unloadSea'), 90).length;
  for (const tag of ['barge1', 'barge2']) {
    const boat = alive(c.tagged(tag))[0];
    if (!boat) continue;
    const home = c.anchor(tag === 'barge1' ? 'bargeStart1' : 'bargeStart2');
    const st = (b.ferry[tag] ||= { mode: 'home' });
    if (st.mode === 'home') {
      if (dist(posOf(boat), home) > 8 && boat.state !== 'moving') { c.issue({ type: c.CMD.MOVE, unitIds: [boat.id], x: home.x, z: home.z }); continue; }
      const booked = Object.values(b.ferry).flatMap((s) => s.ids ?? []);
      const w = waiting(c).filter((u) => !booked.includes(u.id));
      if (w.length >= 1 && boat.cargo.length === 0 && dist(posOf(boat), home) <= 8) {
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
      const otherBoat = alive(c.tagged(other))[0];
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
 * de pé e 5 unidades, a tropa ataca a doca mais próxima (uma por vez), até as 3 caírem. Brann usa o grito de guerra quando há inimigo perto.
 */
function ground(c) {
  const colony = c.anchor('colonyMark');
  const brann = alive(c.tagged('brann'))[0];
  const front = c.mine().filter((u) => isTroop(u) && !u.transportedBy && dist(posOf(u), c.anchor('landingZone')) < 80);
  const enemies = c.gm.allUnits.filter((u) => !u.isDead && u.ownerId === 1 && u.type !== 'peon' && u.type !== 'war_galley');
  const threats = enemies.filter((u) => dist(posOf(u), colony) < 50);
  if (brann && threats.some((u) => dist(posOf(u), posOf(brann)) < 12)) {
    c.issue({ type: c.CMD.CAST, unitIds: [brann.id], abilityId: 'hero_war_cry' });
  }
  if (threats.length) {
    const foe = nearest(threats, colony);
    c.issue({ type: c.CMD.ATTACK_MOVE, unitIds: front.map((u) => u.id), x: posOf(foe).x, z: posOf(foe).z });
    return;
  }
  const docks = alive(c.tagged('orc_dock'));
  const marco = c.gm.buildings.some((x) => x.ownerId === 0 && x.type === 'great_hall' && !x.isDead);
  if (docks.length && marco && front.length >= 5) {
    if (front.some((u) => u.state === 'idle')) c.issue({ type: c.CMD.ATTACK, unitIds: front.map((u) => u.id), targetId: nearest(docks, colony).id });
    return;
  }
  const idle = front.filter((u) => u.state === 'idle' && dist(posOf(u), colony) > 14);
  if (idle.length) c.issue({ type: c.CMD.ATTACK_MOVE, unitIds: idle.map((u) => u.id), x: colony.x, z: colony.z });
}

/**
 * Esquadra: as Fragatas caçam a patrulha do Farol (`patrol_galley`) e depois as galés que saem para a praia; sem alvo, ficam paradas na água
 * do ancoradouro da Liga ou junto da praia (protegendo as Barcaças).
 */
function fleet(c) {
  const ships = c.mine('frigate');
  if (!ships.length) return;
  const park = c.anchor('patrolSea'); // a esquadra fica no mar, longe da água da margem (as Barcaças precisam dela)
  const patrol = alive(c.tagged('patrol_galley'));
  const raiders = c.gm.allUnits.filter((u) => !u.isDead && u.ownerId === 1 && u.type === 'war_galley');
  // com menos de 3 Fragatas a esquadra espera reunida na água do estaleiro (sozinhas, as galés as afundam uma a uma)
  if (ships.length < 3) {
    const yardWater = c.anchor('shipyard1Water');
    const idle = ships.filter((u) => u.state === 'idle' && dist(posOf(u), yardWater) > 10);
    if (idle.length) c.issue({ type: c.CMD.MOVE, unitIds: idle.map((u) => u.id), x: yardWater.x, z: yardWater.z });
    return;
  }
  const foeSea = patrol.length ? nearest(patrol, c.anchor('patrolSea')) : (raiders.length ? nearest(raiders, park) : null);
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
/** Só a economia (sem exército, sem frota, sem barcaça): o Marco nunca nasce e o roteiro não vence; aniquilado aos 10 min. */
export const lose = [
  {
    name: 'sem-desembarque',
    every: 5,
    each: (c) => econ(c, { army: false, navy: false }),
    until: (c) => c.seconds >= 600,
    timeout: 700
  },
  {
    name: 'aniquilado',
    wait: 2,
    run: (c) => {
      const killer = c.gm.allUnits.find((u) => u.ownerId === 1);
      for (const u of c.mine()) u.takeDamage(1e6, killer);
      for (const b of c.gm.buildings.filter((x) => x.ownerId === 0)) b.takeDamage(1e6, killer);
    }
  }
];
