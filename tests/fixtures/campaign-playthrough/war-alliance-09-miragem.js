/**
 * Roteiro de playthrough da m09 "Miragem" (M3-10). Tudo por comandos reais do jogador: Aldeões minam, cortam madeira e constroem (Fazenda,
 * Serraria, Quartel, Estaleiro na costa, Refinaria, Torre Arcana); Petroleiros erguem a Plataforma no poço do mar perto da base e bombeiam
 * petróleo; o Estaleiro treina Fragatas. Tropa dividida em três esquadras nos poços de água, que respondem a qualquer inimigo a 28 u; a
 * cabeça de ponte (barcaça de desembarque no início) é defendida pela tropa inteira quando a contra-ofensiva de Grok chega. As Fragatas
 * caçam a esquadra de Grok (8 galés, aos 660 e 840 s) e depois limpam os bandidos da ilhota dos Náufragos (os náufragos viram da Liga).
 * O roteiro `lose` (mesma economia, sem tropa nem frota) PERDE para as levas. Nada de teletransporte nem dano injetado.
 */
export const campaignId = 'war-alliance';
export const targetMinutes = 17; // ficha: Difícil/G; o harness aceita até 2×. O robô fecha em ~17 min (com o Paço e Brann vivos).

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const posOf = (e) => ({ x: e.mesh.position.x, z: e.mesh.position.z });
const nearest = (list, p) => list.slice().sort((a, b) => dist(posOf(a), p) - dist(posOf(b), p))[0];
const bot = (c) => (c.gm.__bot ||= { last: {}, launched: false, fleetOut: false });
const res = (c) => c.gm.getPlayer(0).resources;
const affordable = (c, cost) => Object.entries(cost).every(([k, v]) => (res(c)[k] || 0) >= v);
const count = (c, type) => c.gm.buildings.filter((x) => x.ownerId === 0 && x.type === type && !x.isDead).length;

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
    if (r >= 8 && r <= R) pts.push({ x: center.x + dx, z: center.z + dz, r });
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
/** Estaleiro: na costa, ao lado do poço de petróleo da Liga (well1), onde as Fragatas saem. */
const shipyard = (c) => placeGrid(c, 'shipyard', c.anchor('well1'), 30);
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

const TROOPS_TARGET = 18;
const FRIGATES_TARGET = 6;
const FRIGATES_BEFORE_SEA = 5; // uma fragata tem 280 de vida: quatro galés da primeira leva afundam três

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
  if (castle && c.mine('villager').length < 18 && castle.queue.length === 0) c.issue({ type: c.CMD.TRAIN, buildingId: castle.id, unitType: 'villager' });
  const popCap = c.gm.getPlayer(0).maxPopulation ?? 0;
  const pop = c.gm.getUnitsOf(0).filter((u) => !u.isDead).length;
  if (!unfinished && pop >= popCap - 6 && count(c, 'cottage') < 8 && affordable(c, OBRAS.cottage) && c.seconds - (b.last.cottage ?? -99) > 10) { if (placeWide(c, 'cottage', 16)) b.last.cottage = c.seconds; }
  const q = QUEUE.find((x) => !x.done(c));
  if (q && !unfinished && affordable(c, OBRAS[q.cost]) && c.seconds - (b.last[q.id] ?? -99) > 12) { if (q.go(c)) b.last[q.id] = c.seconds; }
  // Petróleo: UM Petroleiro ergue a Plataforma no poço perto da base (well1) e depois coleta; o petróleo vai à Refinaria
  const yard = c.bld('shipyard');
  if (navy && yard) {
    const tankers = c.mine('tanker');
    if (tankers.length + yard.queue.length < 1 && affordable(c, { gold: 100, wood: 60 }) && yard.queue.length < 2) c.issue({ type: c.CMD.TRAIN, buildingId: yard.id, unitType: 'tanker' });
    tankers.forEach((t) => {
      const d = wellAt(c, 'well1');
      if (!d || t.state !== 'idle') return;
      if (!d.platform) { if (affordable(c, { gold: 180, wood: 60 })) c.issue({ type: c.CMD.PLACE_BUILDING, buildingType: 'oil_platform', x: posOf(d).x, z: posOf(d).z, unitIds: [t.id] }); }
      else if (d.platform.isConstructed) c.issue({ type: c.CMD.GATHER, unitIds: [t.id], targetId: d.id });
    });
    // Fragatas: até 5 na esquadra (3 bastam para sair; a frota de Grok pede mais); petróleo tem de sobrar
    const frig = c.mine('frigate');
    if (frig.length + yard.queue.length < FRIGATES_TARGET && res(c).oil >= 50 && affordable(c, { gold: 200, wood: 100 }) && yard.queue.length < 2) c.issue({ type: c.CMD.TRAIN, buildingId: yard.id, unitType: 'frigate' });
  }
  if (!army) return;
  const rt = c.gm.mission;
  const arcane = c.bld('arcane_tower');
  if (arcane && arcane.queue.length < 2 && c.mine('mage').length + arcane.queue.length < 5 && affordable(c, { gold: 150 })) c.issue({ type: c.CMD.TRAIN, buildingId: arcane.id, unitType: 'mage' });
  const barracks = c.bld('barracks');
  if (barracks && barracks.queue.length < 3 && res(c).gold > 150) {
    const n = rt.trainedCount(0, 'knight') + rt.trainedCount(0, 'archer');
    c.issue({ type: c.CMD.TRAIN, buildingId: barracks.id, unitType: n % 3 === 0 ? 'knight' : 'archer' });
  }
}

const isTroop = (u) => u.type !== 'villager' && u.type !== 'hero_brann' && u.type !== 'tanker' && u.type !== 'frigate' && u.type !== 'gryphon_rider';

/**
 * Tropa concentrada: toda a tropa (exceto Brann) fica num ponto central entre os três poços; três unidades ficam de guarda, uma em cada poço.
 * Quando um inimigo (não galé, não aldeão) chega a 30 u de um poço ou a 35 u da cabeça de ponte, a tropa inteira ataca o mais próximo do
 * centro. Brann fica atrás da linha do Paço e age só perto dele.
 */
function ground(c, { attack = true } = {}) {
  const brann = c.tagged('brann')[0];
  const enemies = c.gm.allUnits.filter((u) => !u.isDead && u.ownerId === 1);
  if (brann && !brann.isDead) {
    const home = c.anchor('playerStart', 4, 12); // interior da ilha: fora do alcance das galés na praia
    const near = enemies.filter((u) => dist(posOf(u), posOf(brann)) < 10);
    if (brann.hp < brann.maxHp * 0.4 && near.length >= 1) { c.issue({ type: c.CMD.MOVE, unitIds: [brann.id], x: home.x, z: home.z }); return; }
    if (near.length >= 1) {
      c.issue({ type: c.CMD.CAST, unitIds: [brann.id], abilityId: 'hero_war_cry' });
      c.issue({ type: c.CMD.CAST, unitIds: [brann.id], abilityId: 'hero_defensive_stance' });
    } else if (dist(posOf(brann), home) > 6 && brann.state !== 'moving') c.issue({ type: c.CMD.MOVE, unitIds: [brann.id], x: home.x, z: home.z });
  }
  const troops = c.mine().filter(isTroop).sort((a, b) => a.id - b.id);
  if (!troops.length) return;
  const bh = c.anchor('bridgehead1');
  const wellsAt = ['waterWell1', 'waterWell2', 'waterWell3'].map((n) => c.anchor(n));
  const mid = { x: wellsAt.reduce((a, w) => a + w.x, 0) / 3, z: wellsAt.reduce((a, w) => a + w.z, 0) / 3 };
  const threats = enemies.filter((u) => u.type !== 'peon' && u.type !== 'war_galley' && (dist(posOf(u), bh) < 35 || wellsAt.some((w) => dist(posOf(u), w) < 30)));
  if (attack && threats.length) {
    const foe = nearest(threats, mid);
    c.issue({ type: c.CMD.ATTACK_MOVE, unitIds: troops.map((u) => u.id), x: posOf(foe).x, z: posOf(foe).z });
    return;
  }
  troops.forEach((u, i) => {
    const dest = i < 3 ? wellsAt[i] : mid; // três guardas nos poços; o resto no centro
    if (u.state === 'idle' && dist(posOf(u), dest) > 6) c.issue({ type: c.CMD.MOVE, unitIds: [u.id], x: dest.x, z: dest.z });
  });
}

/**
 * Esquadra: fica na água do poço de petróleo 1 até ter 5 Fragatas. A partir de 650 s (primeira leva de Grok) entra na água da cabeça de
 * ponte e ataca as galés à vista (a menos de 70 u); sem galés, patrulha a água. Quando a frota de Grok está afundada (ou aos 950 s), vai
 * à água da ilhota dos Náufragos e limpa os bandidos.
 */
function fleet(c, { attack = true } = {}) {
  const ships = c.mine('frigate');
  if (!ships.length) return;
  const b = bot(c);
  const galleys = c.gm.allUnits.filter((u) => !u.isDead && u.ownerId === 1 && u.type === 'war_galley');
  const bandits = c.gm.allUnits.filter((u) => !u.isDead && u.ownerId !== 0 && u.ownerId !== 1 && u.ownerId !== -1);
  const islet = c.anchor('isletCastawayWater');
  const bhSea = c.anchor('bridgehead1Sea');
  if (attack && !b.fleetOut && ships.length >= FRIGATES_BEFORE_SEA && c.seconds >= 650) b.fleetOut = true;
  if (!b.fleetOut) { // esperando a esquadra: parada na água do poço 1
    const home = c.anchor('well1', 6, 4);
    const idle = ships.filter((u) => u.state === 'idle' && dist(posOf(u), home) > 10);
    if (idle.length) c.issue({ type: c.CMD.MOVE, unitIds: idle.map((u) => u.id), x: home.x, z: home.z });
    return;
  }
  const near = galleys.filter((g) => dist(posOf(g), bhSea) < 70);
  if (near.length) { // caça: todas as fragatas no galé mais perto da praia
    const g = nearest(near, bhSea);
    const idle = ships.filter((u) => u.state !== 'attacking');
    if (idle.length) c.issue({ type: c.CMD.ATTACK_MOVE, unitIds: idle.map((u) => u.id), x: posOf(g).x, z: posOf(g).z });
    return;
  }
  const islandJob = galleys.length === 0 && (c.seconds >= 950 || b.fleetDone) && bandits.length > 0;
  if (galleys.length === 0 && c.gm.mission.objectives.get('p-fleet')?.status === 'completed') b.fleetDone = true;
  const dest = islandJob ? islet : bhSea;
  const idle = ships.filter((u) => u.state === 'idle' || (u.state !== 'attacking' && u.state !== 'moving' && dist(posOf(u), dest) > 12));
  if (idle.length) c.issue({ type: c.CMD.ATTACK_MOVE, unitIds: idle.map((u) => u.id), x: dest.x, z: dest.z });
}

const loop = (opts) => [
  {
    name: 'robo',
    every: 5,
    each: (c) => { econ(c, opts); ground(c, opts); fleet(c, opts); },
    until: (c) => c.gm.isGameOver,
    timeout: 2400
  }
];

export const makeLoop = loop;
export const win = loop({ army: true, navy: true, attack: true });
/** Mesma economia, mas SEM treinar tropa, magos nem frota, e sem atacar: tem de perder para as levas. */
export const noArmy = loop({ army: false, navy: false, attack: false });
export const lose = noArmy;
