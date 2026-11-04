/**
 * Roteiro de playthrough da m03 da Horda "A Pedra que Brilha" (M4-03, assalto). Tudo por comandos reais do jogador: Lacaios minam ouro, pedra e madeira e constroem
 * (Cercado de Javalis, Acampamento de Guerra, Covil dos Ogros, Oficina, Tocas, Torre de Vigia e Paliçada), o Covil treina Ogros, a Oficina Catapultas e o Acampamento
 * reforça com Talhadores e Lanceiros-Machado. A tropa marcha em bloco (ponto de reunião antes de cada alvo) sobre os 3 fortes e o Paço de Mervane, um alvo por vez, com
 * Drogath logo atrás da linha. Nada de teletransporte nem dano injetado. O robô só VENCE se montar o exército: o roteiro `noArmy` (mesma economia, nenhum soldado)
 * PERDE; a investida precoce com as unidades do início (`rush`) não derruba nenhum forte.
 */
import { BUILDINGS } from '../../../src/data/buildings.js';

export const campaignId = 'war-horde';
export const targetMinutes = 16; // ficha: 15–18 min; o harness aceita até 2×

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const posOf = (e) => ({ x: e.mesh.position.x, z: e.mesh.position.z });
const nearest = (list, p) => list.slice().sort((a, b) => dist(posOf(a), p) - dist(posOf(b), p))[0];
const bot = (c) => (c.gm.__bot ||= { last: {}, stage: 'build', target: null, rally: null, rallySince: 0, walls: false });
const res = (c) => c.gm.getPlayer(0).resources;
const affordable = (c, type) => Object.entries(BUILDINGS[type].cost).every(([k, v]) => (res(c)[k] || 0) >= v);
const count = (c, type, done = false) => c.gm.buildings.filter((x) => x.ownerId === 0 && x.type === type && !x.isDead && (!done || x.isConstructed)).length;
const home = (c) => posOf(c.bld('great_hall'));
/** Ponto de espera da tropa em casa: atrás do Salão, longe do alcance dos fortes (a cabeça de ponte fica a ~26 u da guarnição do forte leste). */
const post = (c) => c.anchor('enemyStart', 6, 8);

/** Lacaios para obra: os mais próximos do Salão que não estejam construindo. */
function builders(c, n = 3) {
  const h = home(c);
  return c.mine('peon').filter((u) => u.state !== 'building').sort((a, b) => dist(posOf(a), h) - dist(posOf(b), h)).slice(0, n).map((u) => u.id);
}

/** Primeiro ponto em volta do Salão onde `canPlaceBuilding` aceita (varredura em anéis, ordem fixa, de preferência do lado de casa). */
function place(c, type, minR = 9) {
  const p = home(c);
  for (let r = minR; r < 48; r += 3) {
    for (let a = 0; a < 16; a++) {
      const ang = Math.PI * 0.35 + (((a % 2 ? 1 : -1) * Math.ceil(a / 2)) * Math.PI) / 8; // lado leste/sul (longe do inimigo)
      const x = p.x + Math.cos(ang) * r;
      const z = p.z + Math.sin(ang) * r;
      if (c.gm.canPlaceBuilding(type, x, z, null, 0)) { c.issue({ type: c.CMD.PLACE_BUILDING, buildingType: type, x, z, unitIds: builders(c) }); return true; }
    }
  }
  return false;
}

/** Papéis dos Lacaios por ordem de id: ouro (2 minas do lado leste), pedra e madeira. */
const ROLES = ['gold', 'gold', 'wood', 'wood', 'gold', 'stone', 'wood', 'gold', 'wood', 'gold', 'wood', 'wood', 'gold', 'wood', 'gold', 'wood'];
function keepWorking(c) {
  const h = home(c);
  const golds = c.gm.resourceDeposits.filter((r) => r.type === 'gold' && !r.isDead).sort((a, b) => dist(posOf(a), h) - dist(posOf(b), h));
  const stone = nearest(c.gm.resourceDeposits.filter((r) => r.type === 'stone' && !r.isDead), h);
  const mill = c.bld('orc_lumber_mill');
  const tree = nearest(c.gm.trees.filter((t) => !t.isDead), mill ? posOf(mill) : h);
  c.mine('peon').sort((a, b) => a.id - b.id).forEach((u, i) => {
    if (u.state !== 'idle') return;
    let role = ROLES[i % ROLES.length];
    if (role === 'stone' && res(c).stone > 300) role = 'wood';
    if (role === 'wood' && res(c).wood > 600) role = 'gold';
    if (role === 'gold' && res(c).wood < 150 && res(c).gold > 300) role = 'wood';
    const target = role === 'stone' ? stone : role === 'wood' ? tree : golds[i % Math.max(1, Math.min(golds.length, 2))];
    if (target) c.issue({ type: c.CMD.GATHER, unitIds: [u.id], targetId: target.id });
  });
}

/** Fila de obras: o robô só passa à seguinte quando a atual já foi posta (uma obra de cada vez). */
const QUEUE = [
  { id: 'farm', type: 'pig_farm', done: (c) => count(c, 'pig_farm') > 0 },
  { id: 'barracks', type: 'orc_barracks', done: (c) => count(c, 'orc_barracks') > 0 },
  { id: 'den', type: 'ogre_den', done: (c) => count(c, 'ogre_den') > 0, when: (c) => c.seconds > 45 && count(c, 'orc_barracks', true) > 0 },
  { id: 'workshop', type: 'orc_workshop', done: (c) => count(c, 'orc_workshop') > 0, when: (c) => count(c, 'ogre_den', true) > 0 },
  { id: 'house2', type: 'orc_house', done: (c) => count(c, 'orc_house') > 1 }
];

function econ(c, { withArmy = true } = {}) {
  const b = bot(c);
  keepWorking(c);
  const unfinished = c.gm.buildings.find((x) => x.ownerId === 0 && !x.isDead && !x.isConstructed && x.role !== 'wall');
  if (unfinished) { const vs = builders(c); if (vs.length) c.issue({ type: c.CMD.BUILD, unitIds: vs, buildingId: unfinished.id }); }
  const hall = c.bld('great_hall');
  // próxima obra da fila: o ouro dela fica reservado (Lacaios e tropa não gastam o que falta para o Covil)
  const q = QUEUE.find((x) => !x.done(c));
  const qReady = q && (!q.when || q.when(c));
  const reserve = qReady ? (BUILDINGS[q.type].cost.gold || 0) : 0;
  if (hall && c.mine('peon').length < 16 && hall.queue.length < 2 && (res(c).gold - reserve >= 50 || c.mine('peon').length < 5)) c.issue({ type: c.CMD.TRAIN, buildingId: hall.id, unitType: 'peon' });
  // Toca quando a população aperta
  const popCap = c.gm.getPlayer(0).maxPopulation ?? 0;
  const pop = c.gm.getUnitsOf(0).filter((u) => !u.isDead).length;
  if (!unfinished && pop >= popCap - 3 && count(c, 'orc_house') < 8 && affordable(c, 'orc_house') && c.seconds - (b.last.house ?? -99) > 20 && place(c, 'orc_house', 9)) b.last.house = c.seconds;
  if (q && !unfinished && qReady && affordable(c, q.type) && c.seconds - (b.last[q.id] ?? -99) > 12 && place(c, q.type)) b.last[q.id] = c.seconds;
  if (!withArmy) return;
  // tropa: 4 Ogros + 2 Catapultas primeiro; depois mais Ogros (até 10) e infantaria
  const den = c.bld('ogre_den');
  const shop = c.bld('orc_workshop');
  const bar = c.bld('orc_barracks');
  const rt = c.gm.mission;
  // vivos + na fila (o objetivo de treino conta o total treinado; o robô repõe o que morre)
  const have = (t) => c.mine(t).length + [den, shop, bar].filter(Boolean).reduce((n, x) => n + x.queue.filter((e) => (e.unitType ?? e.type) === t).length, 0);
  const trained = (t) => rt.trainedCount(0, t);
  // prioridade do ouro: 4 Ogros, depois as 2 Catapultas, só então mais Ogros
  const siegeOk = trained('catapult') >= 2;
  if (den && den.queue.length < 2 && res(c).gold - reserve >= 75 && (have('ogre') < 4 || (siegeOk && have('ogre') < 10))) c.issue({ type: c.CMD.TRAIN, buildingId: den.id, unitType: 'ogre' });
  if (shop && shop.queue.length < 1 && (trained('catapult') < 2 || (have('catapult') < 2 && res(c).wood > 400))) c.issue({ type: c.CMD.TRAIN, buildingId: shop.id, unitType: 'catapult' });
  if (bar && bar.queue.length < 1 && trained('ogre') >= 4 && trained('catapult') >= 2 && res(c).gold > 200 && have('grunt') + have('axethrower') < 18) {
    c.issue({ type: c.CMD.TRAIN, buildingId: bar.id, unitType: (have('grunt') + have('axethrower')) % 3 === 0 ? 'grunt' : 'axethrower' });
  }
}

const isArmy = (u) => u.type !== 'peon' && u.type !== 'hero_drogath';
const isSiege = (u) => u.type === 'catapult';

/** Linha de Paliçada com ≥ 4 pontos válidos (passo de 2,4 u) a `dz` da cabeça de ponte; devolve os pontos ou null. */
function wallLine(c, bh) {
  for (const dz of [-4, -2, 0, 2, 4, -6, 6]) { // a margem é diagonal: o trecho válido fica a leste/sudeste do ponto
    const pts = [];
    for (let k = -3; k <= 6; k++) { const p = { x: bh.x + k * 2.4, z: bh.z + dz }; if (c.gm.canPlaceBuilding('wall_orc', p.x, p.z, null, 0)) pts.push(p); }
    if (pts.length >= 5) return pts.slice(-6);
  }
  return null;
}

/** Secundárias da cabeça de ponte (depois da Oficina): uma Torre de Vigia e uma linha de Paliçada. */
function bridgehead(c) {
  const b = bot(c);
  if (count(c, 'orc_workshop', true) < 1) return;
  const bh = c.anchor('bridgehead');
  if (count(c, 'orc_watchtower') < 1 && affordable(c, 'orc_watchtower') && c.seconds - (b.last.tower ?? -99) > 30) {
    for (const [dx, dz] of [[0, 0], [4, 3], [-4, 3], [0, 6], [6, -2], [-6, -2]]) {
      if (c.gm.canPlaceBuilding('orc_watchtower', bh.x + dx, bh.z + dz, null, 0)) { c.issue({ type: c.CMD.PLACE_BUILDING, buildingType: 'orc_watchtower', x: bh.x + dx, z: bh.z + dz, unitIds: builders(c) }); b.last.tower = c.seconds; break; }
    }
  }
  if (count(c, 'wall_orc') < 4 && count(c, 'orc_watchtower') > 0 && res(c).stone >= 100 && res(c).wood >= 80 && c.seconds - (b.last.walls ?? -99) > 40) {
    const pts = wallLine(c, bh);
    if (pts) { c.issue({ type: c.CMD.PLACE_WALL, buildingType: 'wall_orc', points: pts, unitIds: builders(c) }); b.last.walls = c.seconds; }
  }
}

/** Drogath: Grito de Guerra e Golpe de Brasa quando o combate começa; ferido (< 70%), recua para casa e fica lá (o herói é a reserva); senão segue atrás da tropa. */
function hero(c, armyPos, targetPos) {
  const d = c.tagged('drogath')[0];
  if (!d || d.isDead) return;
  const enemies = c.gm.allUnits.filter((u) => !u.isDead && u.ownerId === 1);
  const near = enemies.filter((u) => dist(posOf(u), posOf(d)) < 12);
  const pt = post(c);
  const b = bot(c);
  if (d.hp < d.maxHp * 0.7) b.heroHome = true;
  if (near.length) {
    c.issue({ type: c.CMD.CAST, unitIds: [d.id], abilityId: 'hero_war_cry' });
    const t = nearest(near, posOf(d));
    if (dist(posOf(t), posOf(d)) < 3) c.issue({ type: c.CMD.CAST, unitIds: [d.id], abilityId: 'hero_ember_strike', targetId: t.id });
    if (d.hp < d.maxHp * 0.6) c.issue({ type: c.CMD.CAST, unitIds: [d.id], abilityId: 'hero_clan_fire' });
  }
  if (b.heroHome) { if (dist(posOf(d), pt) > 8 && d.state !== 'moving') c.issue({ type: c.CMD.MOVE, unitIds: [d.id], x: pt.x, z: pt.z }); return; }
  if (!armyPos) return;
  if (dist(posOf(d), armyPos) > 25) { if (d.state !== 'moving') c.issue({ type: c.CMD.MOVE, unitIds: [d.id], x: armyPos.x, z: armyPos.z }); return; }
  // posição: 14 u atrás do centro da tropa, no eixo tropa → alvo
  const L = Math.max(1, dist(armyPos, targetPos));
  const spot = { x: armyPos.x - ((targetPos.x - armyPos.x) / L) * 14, z: armyPos.z - ((targetPos.z - armyPos.z) / L) * 14 };
  if (dist(posOf(d), spot) > 6 && d.state !== 'moving') c.issue({ type: c.CMD.MOVE, unitIds: [d.id], x: spot.x, z: spot.z });
}

/** Alvo atual: forte vivo mais próximo da tropa; sem fortes, o Paço (e o que sobrar). */
function pickTarget(c, pos) {
  const forts = c.tagged('fort').filter((x) => !x.isDead);
  if (forts.length) return nearest(forts, pos);
  const hall = c.tagged('enemy_base').filter((x) => !x.isDead);
  return hall.length ? hall[0] : null;
}

/** Tropa de combate: sai do ponto de reunião (a ~28 u do alvo) quando 80% dela chegou; Catapultas atacam de longe. */
function army(c) {
  const b = bot(c);
  const units = c.mine().filter(isArmy);
  const bh = c.anchor('bridgehead');
  b.peak = Math.max(b.peak ?? 0, units.length);
  // tropa reduzida a < 40% do pico: recua para a cabeça de ponte, reforça e só volta a marchar com tropa nova
  if (b.peak >= 8 && units.length < Math.max(4, b.peak * 0.4)) {
    b.launched = false; b.target = null; b.peak = 0; b.regroups = (b.regroups ?? 0) + 1;
    { const pt = post(c); if (units.length) c.issue({ type: c.CMD.MOVE, unitIds: units.map((u) => u.id), x: pt.x, z: pt.z }); }
    return;
  }
  if (units.length === 0) return;
  const pos = { x: units.reduce((t, u) => t + u.mesh.position.x, 0) / units.length, z: units.reduce((t, u) => t + u.mesh.position.z, 0) / units.length };
  const tgt = pickTarget(c, pos);
  if (!tgt) return;
  const tp = posOf(tgt);
  if (b.target !== tgt.id) {
    // alvo novo: reunir a ~28 u dele, no lado da tropa (se já está perto, ataca direto)
    b.target = tgt.id;
    const L = Math.max(1, dist(pos, tp));
    b.rally = L > 34 ? { x: tp.x + ((pos.x - tp.x) / L) * 28, z: tp.z + ((pos.z - tp.z) / L) * 28 } : null;
    b.rallySince = c.seconds;
    b.go = !b.rally;
    c.issue({ type: c.CMD.MOVE, unitIds: units.map((u) => u.id), x: (b.rally || tp).x, z: (b.rally || tp).z });
  }
  if (!b.go) {
    const arrived = units.filter((u) => dist(posOf(u), b.rally) < 12).length;
    if (arrived >= Math.ceil(units.length * 0.8) || c.seconds - b.rallySince > 120) b.go = true;
    else { const lost = units.filter((u) => (u.state === 'idle' || u.state === 'holding') && dist(posOf(u), b.rally) >= 12); if (lost.length) c.issue({ type: c.CMD.MOVE, unitIds: lost.map((u) => u.id), x: b.rally.x, z: b.rally.z }); }
  }
  if (b.go) {
    // a cada ciclo, quem está parado (chegou ao ponto de reunião, venceu o combate, acabou de ser treinado) avança; com incursão na cabeça de ponte, quem está em casa a rechaça
    const raid = c.gm.allUnits.filter((u) => !u.isDead && u.ownerId === 1 && dist(posOf(u), bh) < 40);
    const idle = units.filter((u) => u.state === 'idle' || u.state === 'moving' || u.state === 'holding');
    const home = idle.filter((u) => raid.length && dist(posOf(u), bh) < 30);
    const go = idle.filter((u) => !home.includes(u));
    if (go.length) c.issue({ type: c.CMD.ATTACK_MOVE, unitIds: go.map((u) => u.id), x: tp.x, z: tp.z });
    if (home.length) { const t = nearest(raid, bh); c.issue({ type: c.CMD.ATTACK_MOVE, unitIds: home.map((u) => u.id), x: posOf(t).x, z: posOf(t).z }); }
  }
  hero(c, pos, tp);
}

/** Defesa da cabeça de ponte enquanto a tropa não está pronta: quem for do exército fica perto do Salão. */
function guardHome(c) {
  const h = post(c);
  // quem está parado perto do ponto de espera fica em posição firme (não persegue Lacaios nem patrulhas até dentro dos fortes); quem está longe volta
  const idle = c.mine().filter((u) => u.type !== 'peon' && u.state === 'idle');
  const far = idle.filter((u) => dist(posOf(u), h) > 14);
  const near = idle.filter((u) => dist(posOf(u), h) <= 14);
  if (far.length) c.issue({ type: c.CMD.MOVE, unitIds: far.map((u) => u.id), x: h.x, z: h.z });
  if (near.length) c.issue({ type: c.CMD.HOLD, unitIds: near.map((u) => u.id) });
}

/** Só marcha com tropa de verdade: objetivo de treino cumprido E 8 Ogros + 2 Catapultas vivos (ou já passou dos 14 min). */
const READY = (c) => {
  const b = bot(c);
  if (!b.launched && c.status('p-army') === 'completed' && ((c.mine('ogre').length >= 8 && c.mine('catapult').length >= 2) || (b.regroups && (c.mine('ogre').length >= 6 || c.mine().filter(isArmy).length >= 14)) || c.seconds > 840)) b.launched = true;
  return b.launched;
};

const loop = (opts = {}) => [
  {
    name: 'robo',
    every: 20,
    each: (c) => {
      econ(c, opts);
      if (opts.withArmy === false) return;
      bridgehead(c);
      if (READY(c)) army(c); else guardHome(c);
    },
    until: (c) => c.gm.isGameOver,
    timeout: 2000
  }
];

export const makeLoop = loop;
export const win = loop({ withArmy: true });
/** Mesma economia, mas SEM tropa nenhuma além da inicial: tem de perder (ou, no mínimo, nunca vencer). */
export const noArmy = loop({ withArmy: false });

/**
 * Investida precoce: só as unidades do início (Drogath, 2 Talhadores, 1 Lanceiro-Machado) marcham sobre o forte mais próximo; sem treinar ninguém.
 * Tem de terminar SEM vitória (o forte e a guarnição seguram) e com Drogath morto (= derrota).
 */
export const rush = [
  {
    name: 'investida',
    wait: 1,
    run: (c) => {
      const p = c.anchor('fort2');
      c.issue({ type: c.CMD.ATTACK_MOVE, unitIds: c.mine().filter((u) => u.type !== 'peon').map((u) => u.id), x: p.x, z: p.z });
    },
    each: () => {},
    until: (c) => c.seconds > 240 || c.mine('grunt').length === 0,
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
