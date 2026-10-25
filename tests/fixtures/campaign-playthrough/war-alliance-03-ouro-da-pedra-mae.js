/**
 * Roteiro de playthrough da m03 "Ouro da Pedra-Mãe" (M3-04). Tudo por comandos reais do jogador: Aldeões minam e constroem (Casa, Ferraria, Fazenda, Quartel, Estábulo), pesquisa Escudos Reforçados, 4+ Cavaleiros no Estábulo, 2 Torres de Vigia e 6 trechos de Muralha de Pedra nos DOIS desfiladeiros
 * (comando `placeWall` com os pontos das âncoras `wallA1..3` e `wallB1..3`), o Capitão Brann e a tropa atrás da linha. Nada de teletransporte nem
 * dano injetado. O robô só VENCE se construir as defesas: o roteiro `noDefense` (mesma economia, sem torres nem muralhas) PERDE.
 */
export const campaignId = 'war-alliance';
export const targetMinutes = 12; // ficha: 12–15 min; o harness aceita até 2×. O robô fecha mais rápido (sem pensar, sem câmera).

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const posOf = (e) => ({ x: e.mesh.position.x, z: e.mesh.position.z });
const nearest = (list, p) => list.slice().sort((a, b) => dist(posOf(a), p) - dist(posOf(b), p))[0];

/** Estado do robô, por partida (o módulo é reusado entre execuções). */
const bot = (c) => (c.gm.__bot ||= { placed: new Set(), last: {}, researched: false });

/** Primeiro ponto em volta do Centro onde `canPlaceBuilding` aceita (varredura em anéis, ordem fixa). */
function place(c, type, minR = 9, toward = null) {
  const hq = c.bld('castle');
  const p = hq.mesh.position;
  const base = toward ? Math.atan2(toward.z - p.z, toward.x - p.x) : Math.PI / 2;
  for (let r = minR; r < 44; r += 3) {
    for (let a = 0; a < 16; a++) {
      const ang = base + (((a % 2 ? 1 : -1) * Math.ceil(a / 2)) * Math.PI) / 8;
      const x = p.x + Math.cos(ang) * r;
      const z = p.z + Math.sin(ang) * r;
      if (c.gm.canPlaceBuilding(type, x, z, null, 0)) {
        c.issue({ type: c.CMD.PLACE_BUILDING, buildingType: type, x, z, unitIds: builders(c) });
        return true;
      }
    }
  }
  return false;
}

/** 3 Aldeões para obra: os mais próximos do Paço que não estejam construindo. */
function builders(c) {
  const home = c.anchor('playerStart');
  return c.mine('villager').filter((u) => u.state !== 'building').sort((a, b) => dist(posOf(a), home) - dist(posOf(b), home)).slice(0, 3).map((u) => u.id);
}

/** Papéis dos aldeões, por ordem de id: ouro (a mina inicial), pedra, madeira, ouro (o Veio). */
const ROLES = ['gold', 'gold', 'stone', 'wood', 'stone', 'gold', 'wood', 'gold', 'stone'];
function keepWorking(c) {
  const home = c.anchor('playerStart');
  const golds = c.gm.resourceDeposits.filter((r) => r.type === 'gold' && !r.isDead).sort((a, b) => dist(posOf(a), home) - dist(posOf(b), home));
  const stone = nearest(c.gm.resourceDeposits.filter((r) => r.type === 'stone' && !r.isDead), home);
  const tree = nearest(c.gm.trees.filter((t) => !t.isDead), home);
  c.mine('villager').sort((a, b) => a.id - b.id).forEach((u, i) => {
    if (u.state !== 'idle') return;
    const res = c.gm.getPlayer(0).resources;
    let role = ROLES[i % ROLES.length];
    if (role === 'stone' && res.stone > 250) role = 'gold'; // pedra de sobra: vai ao ouro
    if (role === 'gold' && res.wood < 60 && i % 2) role = 'wood';
    const target = role === 'stone' ? stone : role === 'wood' ? tree : golds[i >= 7 ? Math.min(1, golds.length - 1) : 0];
    c.issue({ type: c.CMD.GATHER, unitIds: [u.id], targetId: target.id });
  });
}

const OBRAS = { cottage: { wood: 50 }, farm: { wood: 60 }, forge: { gold: 50, wood: 100, stone: 70 }, stable: { gold: 200, wood: 60, stone: 40 }, barracks: { wood: 120, stone: 60 }, watchtower: { wood: 80, stone: 40 }, walls: { wood: 30, stone: 60 } };
const affordable = (c, cost) => Object.entries(cost).every(([k, v]) => (c.gm.getPlayer(0).resources[k] || 0) >= v);
const count = (c, type) => c.gm.buildings.filter((x) => x.ownerId === 0 && x.type === type && !x.isDead).length;

/** Fila de obras na ordem de prioridade: o robô só passa à seguinte quando a atual já foi posta. */
const QUEUE = [
  { id: 'forge', cost: 'forge', done: (c) => count(c, 'forge') > 0, go: (c) => place(c, 'forge', 9, c.anchor('colonyGold1')) },
  { id: 'farm', cost: 'farm', done: (c) => count(c, 'farm') > 0, go: (c) => place(c, 'farm', 9, c.anchor('colonyGold1')) },
  { id: 'barracks', cost: 'barracks', done: (c) => count(c, 'barracks') > 0, go: (c) => place(c, 'barracks', 9, c.anchor('colonyGold1')) },
  { id: 'tower1', cost: 'watchtower', done: (c) => count(c, 'watchtower') > 0, go: (c) => tower(c) },
  { id: 'wallA', cost: 'walls', done: (c) => wallCount(c, 'A') >= 3, go: (c) => wall(c, 'A') },
  { id: 'stable', cost: 'stable', done: (c) => count(c, 'stable') > 0, go: (c) => place(c, 'stable', 9, c.anchor('colonyGold1')) },
  { id: 'wallB', cost: 'walls', done: (c) => wallCount(c, 'B') >= 3, go: (c) => wall(c, 'B') },
  { id: 'tower2', cost: 'watchtower', done: (c) => count(c, 'watchtower') > 1, go: (c) => tower(c) }
];

/** Torre no primeiro dos pontos `tower*` (atrás da linha) onde `canPlaceBuilding` aceita (uma árvore sorteada pode ocupar um deles). */
function tower(c) {
  for (const n of ['towerB2', 'towerA1', 'towerB1', 'towerA2']) {
    const a = c.anchor(n);
    const taken = c.gm.buildings.some((x) => x.ownerId === 0 && x.type === 'watchtower' && !x.isDead && dist(posOf(x), a) < 6);
    if (taken || !c.gm.canPlaceBuilding('watchtower', a.x, a.z, null, 0)) continue;
    c.issue({ type: c.CMD.PLACE_BUILDING, buildingType: 'watchtower', x: a.x, z: a.z, unitIds: builders(c) });
    return true;
  }
  return false;
}

/** Blocos de muralha do jogador (vivos, mesmo em obra) a menos de 6 u do centro do desfiladeiro `L`. */
const wallCount = (c, L) => c.gm.buildings.filter((x) => x.ownerId === 0 && x.type === 'wall_human' && !x.isDead && dist(posOf(x), c.anchor(`pass${L}`)) < 6).length;

function wall(c, L) {
  const pts = [1, 2, 3].map((k) => c.anchor(`wall${L}${k}`));
  c.issue({ type: c.CMD.PLACE_WALL, buildingType: 'wall_human', points: pts, unitIds: builders(c) });
  return true;
}

function econ(c, { defenses = true } = {}) {
  // `defenses: false` = o jogador que só cuida de economia e de Cavaleiros (nada de torres, muralhas nem infantaria em massa)
  const b = bot(c);
  const res = c.gm.getPlayer(0).resources;
  keepWorking(c);
  const unfinished = c.gm.buildings.find((x) => x.ownerId === 0 && !x.isDead && !x.isConstructed && x.role !== 'wall');
  if (unfinished) {
    const vs = builders(c);
    if (vs.length) c.issue({ type: c.CMD.BUILD, unitIds: vs, buildingId: unfinished.id });
  }
  // aldeões: até 9
  const castle = c.bld('castle');
  if (castle && c.mine('villager').length < 9 && castle.queue.length === 0) c.issue({ type: c.CMD.TRAIN, buildingId: castle.id, unitType: 'villager' });
  // casa só quando a população trava (e a madeira sobra)
  const popCap = c.gm.getPlayer(0).maxPopulation ?? 0;
  const pop = c.gm.getUnitsOf(0).filter((u) => !u.isDead).length;
  const needHouse = pop >= popCap - 2 && count(c, 'cottage') < 6;
  if (!unfinished && needHouse && affordable(c, OBRAS.cottage) && c.seconds - (b.last.cottage ?? -99) > 18) { if (place(c, 'cottage', 9, c.anchor('colonyGold1'))) b.last.cottage = c.seconds; }
  // próxima obra da fila (sem as defesas, o robô ainda ergue Ferraria, Fazenda, Quartel e Estábulo)
  const q = QUEUE.filter((x) => defenses || !/^(tower|wall)/.test(x.id)).find((x) => !x.done(c));
  if (q && !unfinished && affordable(c, OBRAS[q.cost]) && c.seconds - (b.last[q.id] ?? -99) > 12) {
    if (q.go(c)) b.last[q.id] = c.seconds;
  }
  // pesquisa Escudos Reforçados assim que a Ferraria sair
  const forge = c.bld('forge');
  if (forge && !b.researched && res.gold >= 150 && res.wood >= 100 && res.stone >= 80) { c.issue({ type: c.CMD.RESEARCH, buildingId: forge.id, upgradeId: 'melee_armor' }); b.researched = true; }
  // tropa: 4 Cavaleiros primeiro, depois Espadachins e Arqueiros no Quartel
  const stable = c.bld('stable');
  const rt = c.gm.mission;
  if (stable && stable.queue.length < 2 && rt.trainedCount(0, 'cavalier') + stable.queue.length < 5) c.issue({ type: c.CMD.TRAIN, buildingId: stable.id, unitType: 'cavalier' });
  const barracks = c.bld('barracks');
  // o ouro vai primeiro para as obras da fila (Estábulo e muralhas); só depois a tropa do Quartel (ou se sobra ouro)
  // (os 4 Cavaleiros têm prioridade sobre o ouro: o Quartel só treina com 130 de reserva até eles saírem)
  const reserve = stable && rt.trainedCount(0, 'cavalier') < 4 ? 130 : 0;
  if (defenses && barracks && barracks.queue.length < 2 && res.gold > reserve + 40 && (QUEUE.every((x) => x.done(c)) || res.gold > 330)) {
    const n = rt.trainedCount(0, 'knight') + rt.trainedCount(0, 'archer');
    c.issue({ type: c.CMD.TRAIN, buildingId: barracks.id, unitType: n % 3 === 0 ? 'knight' : 'archer' });
  }
}

/** Tropa de combate do robô fica ATRÁS da linha, entre os dois desfiladeiros; Brann junto dela e com as 3 habilidades em uso. */
function station(c, { split = false } = {}) {
  const g = c.anchor('ridgeMidPlayer', -5, 0);
  const brann = c.tagged('brann')[0];
  const enemies = c.gm.allUnits.filter((u) => !u.isDead && u.ownerId === 1);
  if (brann && !brann.isDead) {
    // o Capitão é a RESERVA: espera na retaguarda (fora do alcance de aquisição de alvos de quem está na muralha) em posição firme e só
    // entra, com as 3 habilidades, se o inimigo chega até ele (a linha furou)
    const post = c.anchor('ridgeMidPlayer', -15, 2);
    const near = enemies.filter((u) => dist(posOf(u), posOf(brann)) < 9);
    if (near.length >= 1) {
      c.issue({ type: c.CMD.CAST, unitIds: [brann.id], abilityId: 'hero_war_cry' });
      c.issue({ type: c.CMD.CAST, unitIds: [brann.id], abilityId: 'hero_defensive_stance' });
      const t = nearest(near, posOf(brann));
      if (dist(posOf(t), posOf(brann)) < 3) c.issue({ type: c.CMD.CAST, unitIds: [brann.id], abilityId: 'hero_cleave_strike', targetId: t.id });
    } else if (dist(posOf(brann), post) > 5 && brann.state !== 'moving') c.issue({ type: c.CMD.MOVE, unitIds: [brann.id], x: post.x, z: post.z });
    else if (brann.state === 'idle') c.issue({ type: c.CMD.HOLD, unitIds: [brann.id] });
  }
  // a tropa fica reunida entre os dois desfiladeiros, atrás da linha (e dentro do alcance das duas torres)
  if (split) {
    const posts = [c.anchor('passAPlayer', -3, 0), c.anchor('passBPlayer', -3, 0)];
    c.mine().filter((u) => u.type !== 'villager' && u !== brann).sort((x, y) => x.id - y.id).forEach((u, i) => {
      if (u.state === 'idle' && dist(posOf(u), posts[i % 2]) > 7) c.issue({ type: c.CMD.MOVE, unitIds: [u.id], x: posts[i % 2].x, z: posts[i % 2].z });
    });
    return;
  }
  const idle = c.mine().filter((u) => u.type !== 'villager' && u.state === 'idle' && dist(posOf(u), g) > 10 && u !== brann);
  if (idle.length) c.issue({ type: c.CMD.MOVE, unitIds: idle.map((u) => u.id), x: g.x, z: g.z });
}

const loop = (opts) => [
  {
    name: 'robo',
    every: 20,
    each: (c) => { econ(c, opts); station(c, opts); },
    until: (c) => c.gm.isGameOver,
    timeout: 1500
  }
];

export const makeLoop = loop;
export const win = loop({ defenses: true });
/** Mesma economia e a mesma tropa, mas SEM torres nem muralhas: tem de perder. */
export const noDefense = loop({ defenses: false });

/**
 * Investida precoce: só as unidades do início (Brann, 2 Espadachins, 1 Arqueiro) marcham para o acampamento orc; sem treinar ninguém.
 * Tem de terminar SEM vitória (os orcs não deixam).
 */
export const rush = [
  {
    name: 'investida',
    wait: 1,
    run: (c) => {
      const p = c.anchor('enemyStart');
      c.issue({ type: c.CMD.ATTACK_MOVE, unitIds: c.mine().filter((u) => u.type !== 'villager').map((u) => u.id), x: p.x, z: p.z });
    },
    each: () => {},
    until: (c) => c.seconds > 240 || c.mine('knight').length === 0,
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
