/**
 * Roteiro de playthrough da m08 "A Fornalha" (M3-09). Tudo por comandos reais do jogador: Aldeões minam, cortam madeira e constroem (Fazenda,
 * Serraria, Quartel, Torre Arcana, Refinaria), Petroleiros erguem Plataformas nos poços do mar perto da base e bombeiam petróleo; o Estaleiro
 * (dado pela missão) treina Fragatas; Espadachins/Arqueiros no Quartel e Magos na Torre Arcana. Até 420 s a tropa junta forças em casa; depois
 * marcha pelas passagens de rocha até o Santuário das Cinzas (leste). A esquadra de Fragatas (a partir de 3) para na água da Forja Naval e a
 * destrói; em seguida limpa os guardas da ilhota dos Magos (os 5 magos são libertados por transferência). Brann fica atrás da linha.
 * O roteiro `lose` (mesma economia, sem tropa nem frota) PERDE para as levas. Nada de teletransporte nem dano injetado.
 */
export const campaignId = 'war-alliance';
export const targetMinutes = 22; // ficha: 20–25 min (jogador humano); o harness aceita até 2×. O robô fecha em ~12 min (710 s), com o Paço e Brann vivos.

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
    const target = role === 'stone' ? stone : role === 'wood' ? tree : golds[i % Math.max(1, Math.min(golds.length, 2))];
    if (target) c.issue({ type: c.CMD.GATHER, unitIds: [u.id], targetId: target.id });
  });
}

const OBRAS = { cottage: { wood: 50 }, farm: { wood: 60 }, barracks: { wood: 120, stone: 60 }, lumber_camp: { wood: 80 }, arcane_tower: { gold: 250, wood: 80, stone: 80 }, refinery: { gold: 100, wood: 150, stone: 50 } };

/** Serraria junto da árvore mais próxima da base. */
function camp(c) {
  const home = c.anchor('playerStart');
  const tree = nearest(c.gm.trees.filter((t) => !t.isDead), home);
  return placeAround(c, 'lumber_camp', posOf(tree), 5, 20);
}
/**
 * Varredura em grade (passo 1,5 u, do mais perto ao mais longe de `center`, até `R`) pelo primeiro ponto que `canPlaceBuilding` aceita:
 * as construções costeiras (Refinaria) só cabem em pontos exatos da costa, que o anel de `placeAround` pula.
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
/** Refinaria: na costa, perto do Estaleiro (recebe o petróleo dos petroleiros). */
function refinery(c) {
  const yard = c.bld('shipyard');
  if (!yard) return false;
  return placeGrid(c, 'refinery', posOf(yard), 34);
}
// A Refinaria vem primeiro: os poucos pontos de costa perto do Estaleiro somem assim que as casas e a Fazenda se espalham.
const QUEUE = [
  { id: 'refinery', cost: 'refinery', done: (c) => count(c, 'refinery') > 0, go: refinery },
  { id: 'farm', cost: 'farm', done: (c) => count(c, 'farm') > 0, go: (c) => place(c, 'farm') },
  { id: 'camp', cost: 'lumber_camp', done: (c) => count(c, 'lumber_camp') > 0, go: camp },
  { id: 'barracks', cost: 'barracks', done: (c) => count(c, 'barracks') > 0, go: (c) => placeWide(c, 'barracks') },
  { id: 'arcane', cost: 'arcane_tower', done: (c) => count(c, 'arcane_tower') > 0, go: (c) => placeWide(c, 'arcane_tower') }
];

const TROOPS_BEFORE_LAUNCH = 18;
const LAUNCH_AT = 600;
const FRIGATES_BEFORE_SEA = 3;

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
  if (!unfinished && pop >= popCap - 6 && count(c, 'cottage') < 12 && affordable(c, OBRAS.cottage) && c.seconds - (b.last.cottage ?? -99) > 10) { if (placeWide(c, 'cottage', 16)) b.last.cottage = c.seconds; }
  const q = QUEUE.find((x) => !x.done(c));
  if (q && !unfinished && affordable(c, OBRAS[q.cost]) && c.seconds - (b.last[q.id] ?? -99) > 12) { if (q.go(c)) b.last[q.id] = c.seconds; }
  // Petróleo: UM Petroleiro ergue a Plataforma no poço da costa da Liga (well1) e depois coleta; o petróleo sobra, o ouro é o gargalo
  const yard = c.bld('shipyard');
  if (navy && yard) {
    const tankers = c.mine('tanker');
    if (tankers.length + yard.queue.length < 2 && affordable(c, { gold: 100, wood: 60 }) && yard.queue.length < 2) c.issue({ type: c.CMD.TRAIN, buildingId: yard.id, unitType: 'tanker' });
    tankers.forEach((t) => {
      const d = wellAt(c, 'well1');
      if (!d || t.state !== 'idle') return;
      if (!d.platform) { if (affordable(c, { gold: 180, wood: 60 })) c.issue({ type: c.CMD.PLACE_BUILDING, buildingType: 'oil_platform', x: posOf(d).x, z: posOf(d).z, unitIds: [t.id] }); }
      else if (d.platform.isConstructed) c.issue({ type: c.CMD.GATHER, unitIds: [t.id], targetId: d.id });
    });
    // Fragatas: 4 na esquadra (a Forja pede 3); antes de qualquer tropa extra, porque sem frota a missão não anda
    const frig = c.mine('frigate');
    if (frig.length + yard.queue.length < 4 && res(c).oil >= 100 && affordable(c, { gold: 200, wood: 100 }) && yard.queue.length < 2) c.issue({ type: c.CMD.TRAIN, buildingId: yard.id, unitType: 'frigate' });
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

/** Alvo do ataque terrestre: o Santuário das Cinzas (leste, atrás dos rios). */
function target(c) {
  const alive = (tag) => c.tagged(tag).filter((x) => !x.isDead);
  const sanctum = alive('sanctum');
  if (sanctum.length) return sanctum[0];
  return null;
}

/** A tropa espera em casa; Brann atrás da linha. Marcha depois de 420 s com tropa e magos suficientes, e defende a base contra as levas. */
function station(c, { attack = true } = {}) {
  const b = bot(c);
  const rally = c.anchor('playerStart', 4, 8);
  const brann = c.tagged('brann')[0];
  const enemies = c.gm.allUnits.filter((u) => !u.isDead && u.ownerId !== 0 && u.ownerId !== -1);
  if (brann && !brann.isDead) {
    const near = enemies.filter((u) => dist(posOf(u), posOf(brann)) < 10);
    if (brann.hp < brann.maxHp * 0.4 && near.length >= 1) { c.issue({ type: c.CMD.MOVE, unitIds: [brann.id], x: c.anchor('playerStart', -6, -16).x, z: c.anchor('playerStart', -6, -16).z }); return; }
    if (near.length >= 1) {
      c.issue({ type: c.CMD.CAST, unitIds: [brann.id], abilityId: 'hero_war_cry' });
      c.issue({ type: c.CMD.CAST, unitIds: [brann.id], abilityId: 'hero_defensive_stance' });
    } else if (dist(posOf(brann), c.anchor('playerStart', -6, -16)) > 6 && brann.state !== 'moving') c.issue({ type: c.CMD.MOVE, unitIds: [brann.id], x: c.anchor('playerStart', -6, -16).x, z: c.anchor('playerStart', -6, -16).z });
  }
  const troops = c.mine().filter(isTroop);
  // defesa: quem chega a menos de 30 u do ponto de reunião (trabalhadores não contam) é atacado de frente, até acabar
  const threats = enemies.filter((u) => u.type !== 'peon' && dist(posOf(u), rally) < 30);
  if (threats.length && troops.length) {
    const foe = nearest(threats, rally);
    c.issue({ type: c.CMD.ATTACK_MOVE, unitIds: troops.map((u) => u.id), x: posOf(foe).x, z: posOf(foe).z });
    return;
  }
  // a marcha só sai depois da segunda leva (540 s): com a tropa em casa, os aldeões dos poços de ouro sobrevivem às levas
  const ready = attack && !b.launched && c.seconds >= LAUNCH_AT && troops.length >= TROOPS_BEFORE_LAUNCH;
  if (ready) b.launched = true;
  const t = attack ? target(c) : null;
  if (b.launched && t) {
    const p = posOf(t);
    const idle = troops.filter((u) => u.state === 'idle' || (u.state !== 'attacking' && dist(posOf(u), p) > 40 && u.state !== 'moving'));
    if (idle.length) c.issue({ type: c.CMD.ATTACK_MOVE, unitIds: idle.map((u) => u.id), x: p.x, z: p.z });
    return;
  }
  const idle = troops.filter((u) => u.state === 'idle' && dist(posOf(u), rally) > 10);
  if (idle.length) c.issue({ type: c.CMD.MOVE, unitIds: idle.map((u) => u.id), x: rally.x, z: rally.z });
}

/**
 * Esquadra: com 3+ Fragatas sai para a água da Forja (`isletForgeWater`) e ataca a Forja Naval; destruída, vai para a água da ilhota dos
 * Magos (`isletCaptiveWater`) e limpa os guardas. Antes disso, fica na água da base (poço 1), protegendo a plataforma.
 */
function fleet(c, { attack = true } = {}) {
  const ships = c.mine('frigate');
  if (!ships.length) return;
  const b = bot(c);
  const forge = c.tagged('naval_forge').filter((x) => !x.isDead)[0];
  const guards = c.tagged('captive_guard').filter((x) => !x.isDead);
  const forgeGuards = c.tagged('forge_guard').filter((x) => !x.isDead);
  const home = c.anchor('well1', 6, 4);
  if (attack && !b.fleetOut && ships.length >= FRIGATES_BEFORE_SEA && c.seconds >= 360) b.fleetOut = true;
  let dest = home;
  if (b.fleetOut) {
    if (forge) dest = c.anchor('isletForgeWater');
    else if (guards.length) dest = c.anchor('isletCaptiveWater');
  }
  const idle = ships.filter((u) => u.state === 'idle' || (u.state !== 'attacking' && u.state !== 'moving' && dist(posOf(u), dest) > 12));
  if (idle.length) c.issue({ type: c.CMD.ATTACK_MOVE, unitIds: idle.map((u) => u.id), x: dest.x, z: dest.z });
  void forgeGuards;
}

const loop = (opts) => [
  {
    name: 'robo',
    every: 20,
    each: (c) => { econ(c, opts); station(c, opts); fleet(c, opts); },
    until: (c) => c.gm.isGameOver,
    timeout: 2400
  }
];

export const makeLoop = loop;
export const win = loop({ army: true, navy: true, attack: true });
/** Mesma economia, mas SEM treinar tropa, magos nem frota, e sem marchar: tem de perder para as levas. */
export const noArmy = loop({ army: false, navy: false, attack: false });
export const lose = noArmy;
