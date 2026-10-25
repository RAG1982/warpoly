/**
 * Roteiro de playthrough da m02 "O Pouso do Encontro" (M3-03). Tudo por comandos reais do jogador: Fazenda, Quartel, Casas e Ferraria
 * construídos pelos Aldeões, pesquisa Armas Forjadas, tropa treinada no Quartel, marcha ao acampamento de bandidos 1 (SO) e 2 (N),
 * depois a volta pelo sul até as 4 prisões atrás da base orc. Cada batedor é solto ATACANDO a muralha do cercado (o ataque-em-movimento
 * até dentro do cercado faz as unidades quebrarem a muralha que bloqueia). Nada de teletransporte nem dano injetado no `win`.
 */
export const campaignId = 'war-alliance';
export const targetMinutes = 14; // ficha: 12–16 min humanos; o harness aceita até 2×. O robô fecha mais rápido (sem pensar, sem câmera).

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const posOf = (e) => ({ x: e.mesh.position.x, z: e.mesh.position.z });
const nearest = (list, p) => list.slice().sort((a, b) => dist(posOf(a), p) - dist(posOf(b), p))[0];

/** Primeiro ponto em volta do Centro onde `canPlaceBuilding` aceita (varredura em anéis, ordem fixa). */
function place(c, type, minR = 9, toward = null) {
  const hq = c.bld('castle');
  const p = hq.mesh.position;
  const base = toward ? Math.atan2(toward.z - p.z, toward.x - p.x) : 0;
  for (let r = minR; r < 44; r += 3) {
    for (let a = 0; a < 16; a++) {
      const ang = base + (((a % 2 ? 1 : -1) * Math.ceil(a / 2)) * Math.PI) / 8;
      const x = p.x + Math.cos(ang) * r;
      const z = p.z + Math.sin(ang) * r;
      if (c.gm.canPlaceBuilding(type, x, z, null, 0)) {
        c.issue({ type: c.CMD.PLACE_BUILDING, buildingType: type, x, z, unitIds: c.mine('villager').slice(0, 3).map((u) => u.id) });
        return true;
      }
    }
  }
  return false;
}

/** Aldeões ociosos voltam ao trabalho: o 1º no ouro, o 2º na pedra, os demais na madeira. */
function keepWorking(c) {
  const home = c.anchor('playerStart');
  const gold = nearest(c.gm.resourceDeposits.filter((r) => r.type === 'gold' && !r.isDead), home);
  const stone = nearest(c.gm.resourceDeposits.filter((r) => r.type === 'stone' && !r.isDead), home);
  const tree = nearest(c.gm.trees.filter((t) => !t.isDead), home);
  c.mine('villager').forEach((u, i) => {
    if (u.state !== 'idle') return;
    const target = i <= 3 ? gold : i === 4 && c.gm.getPlayer(0).resources.stone < 250 ? stone : tree;
    c.issue({ type: c.CMD.GATHER, unitIds: [u.id], targetId: target.id });
  });
}

/** Estado do robô, por partida (o módulo é reusado entre execuções). */
const bot = (c) => (c.gm.__bot ||= { phase: 'build', leg: 0, built: new Set(), researched: false, goAt: null });

/** Tropa de combate: os batedores resgatados (arqueiros do tag `scout`) ficam FORA, como um jogador cuidadoso os poria a salvo. */
const isScout = (c, u) => c.tagged('scout').includes(u);
const army = (c) => c.mine().filter((u) => (u.type === 'knight' || u.type === 'archer') && !isScout(c, u));
const center = (list) => ({ x: list.reduce((t, u) => t + u.mesh.position.x, 0) / list.length, z: list.reduce((t, u) => t + u.mesh.position.z, 0) / list.length });

/** Pontos de passagem da perna 3 (volta pelo sul): o vau da margem oeste e o sul da ilha, a seguir as 4 prisões atrás dos orcs. */
export const LEGS = [
  { name: 'bandidos-1', go: ['banditCamp1'], prison: 1 },
  { name: 'bandidos-2', go: ['banditCamp2'], prison: 2 },
  { name: 'atras-1', go: ['ford2', 'scoutPrison6'], prison: 6 },
  { name: 'atras-2', go: ['scoutPrison3'], prison: 3 },
  { name: 'atras-3', go: ['scoutPrison4'], prison: 4 },
  { name: 'atras-4', go: ['scoutPrison5'], prison: 5 }
];

export const TRAIN_ORDER = ['knight', 'knight', 'archer', 'knight', 'archer', 'knight', 'knight', 'archer', 'knight', 'archer', 'knight', 'knight', 'archer', 'knight', 'archer', 'knight'];
export const ARMY_GO = 14; // soldados (treinados + iniciais) antes de sair

function econ(c) {
  const b = bot(c);
  const res = c.gm.getPlayer(0).resources;
  keepWorking(c);
  // obra inacabada: 3 aldeões (os mais próximos) retomam a construção; nada novo é posto até ela terminar
  const unfinished = c.gm.buildings.find((x) => x.ownerId === 0 && !x.isDead && !x.isConstructed);
  if (unfinished) {
    const vs = c.mine('villager').filter((u) => u.state !== 'building').slice(0, 3);
    if (vs.length) c.issue({ type: c.CMD.BUILD, unitIds: vs.map((u) => u.id), buildingId: unfinished.id });
  }
  // ordem de obras: Fazenda → Quartel → Casa → Ferraria → 2ª Casa
  const step = ['farm', 'barracks', 'cottage', 'forge'].find((t) => !c.bld(t, true));
  if (step && (c.seconds - (b.lastPlace ?? -99) > 25 || b.lastType !== step)) {
    const cost = { farm: { wood: 60 }, barracks: { wood: 120, stone: 60 }, cottage: { wood: 50 }, forge: { gold: 50, wood: 100, stone: 70 } }[step];
    const ok = Object.entries(cost).every(([k, v]) => (res[k] || 0) >= v);
    const under = c.gm.buildings.some((x) => x.ownerId === 0 && x.type === step && !x.isDead && !x.isConstructed);
    if (ok && !unfinished && !under && place(c, step)) { b.lastPlace = c.seconds; b.lastType = step; }
  }
  const forge = c.bld('forge');
  if (forge && !b.researched && res.gold >= 200 && res.wood >= 100) { c.issue({ type: c.CMD.RESEARCH, buildingId: forge.id, upgradeId: 'melee_weapons' }); b.researched = true; }
  // 2 Torres de Vigia no lado do inimigo (defendem a base enquanto a tropa está fora)
  const towers = c.gm.buildings.filter((x) => x.ownerId === 0 && x.type === 'watchtower' && !x.isDead).length;
  if (b.researched && towers < 2 && !unfinished && res.wood >= 80 && res.stone >= 40 && c.seconds - (b.lastTower ?? -99) > 20) {
    if (place(c, 'watchtower', 14, c.anchor('enemyStart'))) b.lastTower = c.seconds;
  }
  // casas extras conforme a tropa cresce
  const cottages = c.gm.buildings.filter((x) => x.ownerId === 0 && x.type === 'cottage' && !x.isDead).length;
  const popCap = c.gm.getPlayer(0).popCap ?? 0;
  const pop = c.gm.getUnitsOf(0).filter((u) => !u.isDead).length;
  if (c.bld('barracks') && cottages < 6 && pop >= popCap - 2 && res.wood >= 50 && c.seconds - (b.lastHouse ?? -99) > 30 && !unfinished) {
    if (place(c, 'cottage')) b.lastHouse = c.seconds;
  }
  // mais 2 aldeões (castelo) e a tropa na fila do Quartel
  const castle = c.bld('castle');
  if (castle && c.mine('villager').length < 7 && castle.queue.length === 0) c.issue({ type: c.CMD.TRAIN, buildingId: castle.id, unitType: 'villager' });
  const barracks = c.bld('barracks');
  // a Ferraria e a pesquisa têm prioridade sobre a tropa (madeira curta); depois treina sem parar
  if (barracks && barracks.queue.length < 2 && (b.researched || c.seconds > 400)) {
    const trained = c.gm.mission.trainedCount(0, 'knight') + c.gm.mission.trainedCount(0, 'archer');
    c.issue({ type: c.CMD.TRAIN, buildingId: barracks.id, unitType: TRAIN_ORDER[trained % TRAIN_ORDER.length] });
  }
}

/** Batedor da prisão `k` (identificado pelo ponto de origem, antes de qualquer resgate). */
function scoutOf(c, k) {
  const b = bot(c);
  b.scouts ??= {};
  b.scouts[k] ??= nearest(c.tagged('scout'), c.anchor(`scoutPrison${k}`)).id;
  return c.gm.entitiesById.get(b.scouts[k]);
}

/** Marcha: um trecho por vez; quando o batedor do trecho passa a ser do jogador, segue para o próximo. */
function march(c) {
  const b = bot(c);
  let units = army(c).filter((u) => b.expedition.has(u.id)); // reforços que saem do Quartel depois ficam de guarda na base
  if (units.length < 6) { // expedição quase morta: uma nova sai quando houver tropa de novo (os reforços da base)
    if (army(c).length < ARMY_GO) return;
    b.expedition = new Set(army(c).map((u) => u.id));
    b.wp = 0;
    units = army(c);
  }
  const leg = LEGS[b.leg];
  if (!leg) return;
  if (scoutOf(c, leg.prison)?.ownerId === 0) { b.leg++; b.wp = 0; return; }
  const wps = [...leg.go.map((n) => c.anchor(n)), c.anchor(`scoutPrison${leg.prison}`)];
  b.wp ??= 0;
  if (b.wp < wps.length - 1 && dist(center(units), wps[b.wp]) < 14) b.wp++;
  const tgt = wps[b.wp];
  // perto do cercado e sem guardas à vista: clique direito na muralha (ataque direto ao trecho mais próximo)
  const pa = c.anchor(`scoutPrison${leg.prison}`);
  const walls = c.tagged(`prison${leg.prison}`).filter((w) => !w.isDead);
  const guards = c.gm.allUnits.filter((u) => !u.isDead && u.ownerId !== 0 && u.ownerId !== -1 && dist(posOf(u), pa) < 18);
  if (b.wp === wps.length - 1 && walls.length && guards.length === 0 && dist(center(units), pa) < 22) {
    const w = nearest(walls, center(units));
    c.issue({ type: c.CMD.ATTACK, unitIds: units.map((u) => u.id), targetId: w.id });
    return;
  }
  c.issue({ type: c.CMD.ATTACK_MOVE, unitIds: units.map((u) => u.id), x: tgt.x, z: tgt.z });
}

export const win = [
  {
    name: 'robo',
    run: (c) => { bot(c); for (let k = 1; k <= 6; k++) scoutOf(c, k); },
    every: 20,
    each: (c) => {
      const b = bot(c);
      econ(c);
      if (b.phase === 'build') {
        const total = army(c).length;
        // espera a tropa ficar pronta (e a pesquisa concluída) antes de sair; fica em guarda perto do Paço
        if (total >= ARMY_GO && c.status('research-weapons') === 'completed') { b.phase = 'march'; b.expedition = new Set(army(c).map((u) => u.id)); }
        else {
          const g = c.anchor('playerStart', 12, 4);
          const idle = army(c).filter((u) => u.state === 'idle' && dist(posOf(u), g) > 14);
          if (idle.length) c.issue({ type: c.CMD.MOVE, unitIds: idle.map((u) => u.id), x: g.x, z: g.z });
        }
      }
      if (b.phase === 'march') march(c);
      // batedores resgatados perto dos bandidos voltam ao Cais (atrás do Paço); os do leste ficam onde foram soltos
      const dock = c.anchor('landingZone', 2, 6);
      const away = [1, 2].map((k) => scoutOf(c, k)).filter((u) => u && !u.isDead && u.ownerId === 0 && u.state === 'idle' && dist(posOf(u), dock) > 12);
      if (away.length) c.issue({ type: c.CMD.MOVE, unitIds: away.map((u) => u.id), x: dock.x, z: dock.z });
    },
    until: (c) => c.status('rescue-scouts') === 'completed',
    timeout: 1500
  }
];

/**
 * Investida precoce: só os 3 soldados do início (2 Espadachins + 1 Arqueiro) marcham sobre o acampamento 1 sem treinar ninguém.
 * Tem de terminar SEM libertar o batedor 1 e SEM vitória (os Espadachins caem).
 */
export const rush = [
  {
    name: 'investida',
    wait: 1,
    run: (c) => {
      const p = c.anchor('banditCamp1');
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
      const killer = c.gm.allUnits.find((u) => u.ownerId === 99);
      for (const u of c.mine()) u.takeDamage(1e6, killer);
      for (const b of c.gm.buildings.filter((x) => x.ownerId === 0)) b.takeDamage(1e6, killer);
    }
  }
];
