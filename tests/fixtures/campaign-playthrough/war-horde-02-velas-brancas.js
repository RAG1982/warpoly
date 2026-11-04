/**
 * Roteiro de playthrough da m02 da Horda "Velas Brancas" (M4-02). Tudo por comandos reais do jogador: Cercado de Javalis, Acampamento
 * de Guerra, Toca e Forja de Guerra construídos pelos Lacaios, pesquisa Lâminas de Guerra, 2 Torres de Vigia, tropa treinada no
 * Acampamento; marcha às 4 prisões (sul, depois leste), um trecho por vez (mata a guarda, chega perto, o batedor é solto), e a volta
 * com os 4 batedores ao cais. Só o desfecho do combate é de verdade (sem teletransporte nem dano injetado). Espelha o roteiro da
 * Aliança (war-alliance-02-pouso-do-encontro.js).
 */
export const campaignId = 'war-horde';
export const targetMinutes = 12; // ficha: 12–15 min; o harness aceita até 2×. O robô fecha em ~8,5 min (sem pensar, sem câmera).

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const posOf = (e) => ({ x: e.mesh.position.x, z: e.mesh.position.z });
const nearest = (list, p) => list.slice().sort((a, b) => dist(posOf(a), p) - dist(posOf(b), p))[0];

/** Primeiro ponto em volta do Salão onde `canPlaceBuilding` aceita (varredura em anéis, ordem fixa). */
function place(c, type, minR = 9, toward = null) {
  const hq = c.bld('great_hall');
  const p = hq.mesh.position;
  const base = toward ? Math.atan2(toward.z - p.z, toward.x - p.x) : 0;
  for (let r = minR; r < 44; r += 3) {
    for (let a = 0; a < 16; a++) {
      const ang = base + (((a % 2 ? 1 : -1) * Math.ceil(a / 2)) * Math.PI) / 8;
      const x = p.x + Math.cos(ang) * r;
      const z = p.z + Math.sin(ang) * r;
      if (c.gm.canPlaceBuilding(type, x, z, null, 0)) {
        c.issue({ type: c.CMD.PLACE_BUILDING, buildingType: type, x, z, unitIds: c.mine('peon').slice(0, 3).map((u) => u.id) });
        return true;
      }
    }
  }
  return false;
}

/** Lacaios ociosos voltam ao trabalho: o 1º no ouro, o 2º na pedra, os demais na madeira. */
function keepWorking(c) {
  const home = c.anchor('playerStart');
  const gold = nearest(c.gm.resourceDeposits.filter((r) => r.type === 'gold' && !r.isDead), home);
  const stone = nearest(c.gm.resourceDeposits.filter((r) => r.type === 'stone' && !r.isDead), home);
  const tree = nearest(c.gm.trees.filter((t) => !t.isDead), home);
  c.mine('peon').forEach((u, i) => {
    if (u.state !== 'idle') return;
    const target = i <= 3 ? gold : i === 4 && c.gm.getPlayer(0).resources.stone < 250 ? stone : tree;
    c.issue({ type: c.CMD.GATHER, unitIds: [u.id], targetId: target.id });
  });
}

/** Estado do robô, por partida (o módulo é reusado entre execuções). */
const bot = (c) => (c.gm.__bot ||= { phase: 'build', leg: 0, researched: false });

/** Tropa de combate: os batedores resgatados (Lanceiros-Machado do tag `scout`) ficam FORA, como um jogador cuidadoso os poria a salvo. */
const isScout = (c, u) => c.tagged('scout').includes(u);
const army = (c) => c.mine().filter((u) => (u.type === 'grunt' || u.type === 'axethrower') && !isScout(c, u));
const center = (list) => ({ x: list.reduce((t, u) => t + u.mesh.position.x, 0) / list.length, z: list.reduce((t, u) => t + u.mesh.position.z, 0) / list.length });

/** Trechos da marcha: o vau da margem oeste leva ao sul (prisão 6), depois as 3 prisões do leste. */
export const LEGS = [
  { name: 'sul', go: ['ford2'], prison: 6 },
  { name: 'leste-1', go: [], prison: 3 },
  { name: 'leste-2', go: [], prison: 4 },
  { name: 'leste-3', go: [], prison: 5 }
];

export const TRAIN_ORDER = ['grunt', 'axethrower', 'grunt', 'axethrower', 'grunt', 'grunt', 'axethrower', 'grunt', 'axethrower', 'grunt', 'axethrower', 'grunt', 'axethrower', 'grunt', 'axethrower', 'grunt'];
export const ARMY_GO = 14; // soldados (treinados + iniciais) antes de sair

function econ(c) {
  const b = bot(c);
  const res = c.gm.getPlayer(0).resources;
  keepWorking(c);
  // obra inacabada: 3 Lacaios (os mais próximos) retomam a construção; nada novo é posto até ela terminar
  const unfinished = c.gm.buildings.find((x) => x.ownerId === 0 && !x.isDead && !x.isConstructed);
  if (unfinished) {
    const vs = c.mine('peon').filter((u) => u.state !== 'building').slice(0, 3);
    if (vs.length) c.issue({ type: c.CMD.BUILD, unitIds: vs.map((u) => u.id), buildingId: unfinished.id });
  }
  // ordem de obras: Cercado → Acampamento → Toca → Forja
  const step = ['pig_farm', 'orc_barracks', 'orc_house', 'orc_forge'].find((t) => !c.bld(t, true));
  if (step && (c.seconds - (b.lastPlace ?? -99) > 25 || b.lastType !== step)) {
    const cost = { pig_farm: { wood: 55 }, orc_barracks: { wood: 130, stone: 50 }, orc_house: { wood: 50 }, orc_forge: { gold: 50, wood: 100, stone: 70 } }[step];
    const ok = Object.entries(cost).every(([k, v]) => (res[k] || 0) >= v);
    const under = c.gm.buildings.some((x) => x.ownerId === 0 && x.type === step && !x.isDead && !x.isConstructed);
    if (ok && !unfinished && !under && place(c, step)) { b.lastPlace = c.seconds; b.lastType = step; }
  }
  const forge = c.bld('orc_forge');
  if (forge && !b.researched && res.gold >= 200 && res.wood >= 100) { c.issue({ type: c.CMD.RESEARCH, buildingId: forge.id, upgradeId: 'melee_weapons' }); b.researched = true; }
  // 2 Torres de Vigia no lado do inimigo (defendem a base enquanto a tropa está fora)
  const towers = c.gm.buildings.filter((x) => x.ownerId === 0 && x.type === 'orc_watchtower' && !x.isDead).length;
  if (b.researched && towers < 2 && !unfinished && res.wood >= 85 && res.stone >= 40 && c.seconds - (b.lastTower ?? -99) > 20) {
    if (place(c, 'orc_watchtower', 14, c.anchor('enemyStart'))) b.lastTower = c.seconds;
  }
  // Tocas extras conforme a tropa cresce
  const houses = c.gm.buildings.filter((x) => x.ownerId === 0 && x.type === 'orc_house' && !x.isDead).length;
  const popCap = c.gm.getPlayer(0).popCap ?? 0;
  const pop = c.gm.getUnitsOf(0).filter((u) => !u.isDead).length;
  if (c.bld('orc_barracks') && houses < 6 && pop >= popCap - 2 && res.wood >= 50 && c.seconds - (b.lastHouse ?? -99) > 30 && !unfinished) {
    if (place(c, 'orc_house')) b.lastHouse = c.seconds;
  }
  // mais 2 Lacaios (Salão) e a tropa na fila do Acampamento
  const hall = c.bld('great_hall');
  if (hall && c.mine('peon').length < 7 && hall.queue.length === 0) c.issue({ type: c.CMD.TRAIN, buildingId: hall.id, unitType: 'peon' });
  const barracks = c.bld('orc_barracks');
  // a Forja e a pesquisa têm prioridade sobre a tropa (madeira curta); depois treina sem parar
  if (barracks && barracks.queue.length < 2 && (b.researched || c.seconds > 400)) {
    const trained = c.gm.mission.trainedCount(0, 'grunt') + c.gm.mission.trainedCount(0, 'axethrower');
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
  let units = army(c).filter((u) => b.expedition.has(u.id)); // reforços que saem do Acampamento depois ficam de guarda na base
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
  c.issue({ type: c.CMD.ATTACK_MOVE, unitIds: units.map((u) => u.id), x: tgt.x, z: tgt.z });
  // os batedores soltos (que perseguem inimigos sozinhos) seguem o centro da tropa por MOVE
  const c0 = center(units);
  const back = { x: c0.x, z: c0.z }; // no centro da tropa (o recuo para fora dela cruzava a patrulha da base humana)
  const freed = c.tagged('scout').filter((u) => !u.isDead && u.ownerId === 0);
  if (freed.length) c.issue({ type: c.CMD.MOVE, unitIds: freed.map((u) => u.id), x: back.x, z: back.z });
}

/** Volta: o mesmo caminho da ida (CONTORNA a base humana pelo sul e pelo vau); a tropa abre o caminho e os batedores seguem o centro dela. */
const BACK = ['scoutPrison4', 'scoutPrison6', 'ford2', 'playerStart'];
function escort(c) {
  const b = bot(c);
  const dock = c.anchor('landingZone', 2, 6);
  const exp = army(c).filter((u) => b.expedition.has(u.id)); // só quem saiu na expedição (os reforços ficam de guarda na base)
  const units = exp.length ? exp : army(c);
  const scouts = c.tagged('scout').filter((u) => !u.isDead && u.ownerId === 0);
  if (!units.length) { if (scouts.length) c.issue({ type: c.CMD.MOVE, unitIds: scouts.map((u) => u.id), x: dock.x, z: dock.z }); return; }
  const ctr = center(units);
  b.ewp ??= 0;
  while (b.ewp < BACK.length - 1 && dist(ctr, c.anchor(BACK[b.ewp])) < 16) b.ewp++;
  const tgt = c.anchor(BACK[b.ewp]);
  const home = b.ewp === BACK.length - 1 && dist(ctr, tgt) < 20;
  // a tropa espera o batedor retardatário (> 22 u do centro) antes de avançar: ninguém fica para trás no vau
  const lag = scouts.some((u) => dist(posOf(u), ctr) > 22);
  const go = lag && !home ? ctr : tgt;
  c.issue({ type: c.CMD.ATTACK_MOVE, unitIds: units.map((u) => u.id), x: go.x, z: go.z });
  // os batedores acompanham o centro da tropa; já em casa, seguem para o cais
  const to = home ? dock : ctr;
  // um comando por batedor; não reemite a ordem enquanto ele já anda para o mesmo destino (repetir a cada 0,5 s reinicia o caminho)
  b.last ??= {};
  b.detour ??= {};
  for (const u of scouts) {
    const here = posOf(u);
    const prev = b.last[u.id];
    const n = prev && dist(prev.p, here) < 0.8 ? prev.n + 1 : 0;
    // preso na margem do vau (acontece com um batedor): refaz o caminho passando pelo centro do vau 2, e só depois segue
    if (n >= 6 && !b.detour[u.id] && dist(here, to) > 14) b.detour[u.id] = true;
    const ford = c.anchor('ford2');
    if (b.detour[u.id] && dist(here, ford) < 3) b.detour[u.id] = false;
    const aim = b.detour[u.id] ? ford : to;
    const t = { x: Math.round(aim.x / 4) * 4, z: Math.round(aim.z / 4) * 4 }; // grade de 4 u: o centro da tropa vibra
    const keep = prev && dist(prev.t, t) < 1 && u.state === 'moving' && n < 6;
    b.last[u.id] = { t: keep ? prev.t : t, p: here, n: n >= 6 ? 0 : n };
    if (!keep) c.issue({ type: c.CMD.MOVE, unitIds: [u.id], x: aim.x, z: aim.z });
  }
}

export const win = [
  {
    name: 'robo',
    run: (c) => { bot(c); for (const k of [6, 3, 4, 5]) scoutOf(c, k); },
    every: 10,
    each: (c) => {
      const b = bot(c);
      econ(c);
      if (b.phase === 'build') {
        const total = army(c).length;
        // espera a tropa ficar pronta (e a pesquisa concluída) antes de sair; fica em guarda perto do Salão
        if (total >= ARMY_GO && c.status('research-weapons') === 'completed') { b.phase = 'march'; b.expedition = new Set(army(c).map((u) => u.id)); }
        else {
          const g = c.anchor('playerStart', 12, 4);
          const idle = army(c).filter((u) => u.state === 'idle' && dist(posOf(u), g) > 14);
          if (idle.length) c.issue({ type: c.CMD.MOVE, unitIds: idle.map((u) => u.id), x: g.x, z: g.z });
        }
      }
      if (b.phase === 'march') {
        if (c.status('rescue-scouts') === 'completed') b.phase = 'escort';
        else march(c);
      }
      if (b.phase === 'escort') escort(c);
    },
    until: (c) => c.status('escort-scouts') === 'completed',
    timeout: 1500
  }
];

/**
 * Investida precoce: só os 3 soldados do início (2 Talhadores + 1 Lanceiro-Machado) marcham sobre a prisão 6 sem treinar ninguém.
 * Tem de terminar SEM libertar o batedor e SEM vitória (os Talhadores caem).
 */
export const rush = [
  {
    name: 'investida',
    wait: 1,
    run: (c) => {
      const p = c.anchor('scoutPrison6');
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
