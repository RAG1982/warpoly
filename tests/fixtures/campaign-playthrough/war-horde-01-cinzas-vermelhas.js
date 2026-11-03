/**
 * Roteiro de playthrough da m01 da Horda "Cinzas Vermelhas" (M4-01). Tudo por comandos reais do jogador: Cercado de Javalis,
 * Acampamento de Guerra e Toca construídos pelos Lacaios, 7 guerreiros treinados (3 Talhadores + 4 Lanceiros-Machado), marcha de
 * ataque aos 3 acampamentos da Irmandade da Maré, um por vez. Só o desfecho do combate é de verdade também (sem teletransporte
 * nem dano injetado). Espelha o roteiro da Aliança (war-alliance-01-terra-a-vista.js).
 */
export const campaignId = 'war-horde';
export const targetMinutes = 10; // ficha: 10–12 min; o harness aceita até 2×

const nearest = (list, p) => list.slice().sort((a, b) => Math.hypot(a.mesh.position.x - p.x, a.mesh.position.z - p.z) - Math.hypot(b.mesh.position.x - p.x, b.mesh.position.z - p.z))[0];

/** Primeiro ponto em volta do Salão onde `canPlaceBuilding` aceita (varredura em anéis, ordem fixa). */
function place(c, type, minR = 8) {
  const hq = c.bld('great_hall');
  const p = hq.mesh.position;
  for (let r = minR; r < 40; r += 3) {
    for (let a = 0; a < 16; a++) {
      const x = p.x + Math.cos((a * Math.PI) / 8) * r;
      const z = p.z + Math.sin((a * Math.PI) / 8) * r;
      if (c.gm.canPlaceBuilding(type, x, z, null, 0)) {
        c.issue({ type: c.CMD.PLACE_BUILDING, buildingType: type, x, z, unitIds: c.mine('peon').map((u) => u.id) });
        return true;
      }
    }
  }
  throw new Error(`sem lugar para ${type}`);
}

/** Lacaios ociosos voltam ao trabalho: o 1º no ouro, os demais na madeira (a mais próxima da base). */
function keepWorking(c) {
  const home = c.anchor('playerStart');
  const mine = nearest(c.gm.resourceDeposits.filter((r) => r.type === 'gold' && !r.isDead), home);
  const tree = nearest(c.gm.trees.filter((t) => !t.isDead), home);
  c.mine('peon').forEach((u, i) => {
    if (u.state === 'idle') c.issue({ type: c.CMD.GATHER, unitIds: [u.id], targetId: (i === 0 ? mine : tree).id });
  });
}

const QUEUE = ['grunt', 'grunt', 'grunt', 'axethrower', 'axethrower', 'axethrower', 'axethrower'];
const ARMY = 16;
const isArmy = (u) => u.type === 'grunt' || u.type === 'axethrower';

export const win = [
  { name: 'cercado', wait: 25, run: (c) => place(c, 'pig_farm'), each: () => {}, until: (c) => !!c.bld('pig_farm') },
  { name: 'acampamento', run: (c) => place(c, 'orc_barracks'), each: () => {}, until: (c) => c.status('build-barracks') === 'completed' },
  { name: 'toca', run: (c) => place(c, 'orc_house'), each: () => {}, until: (c) => !!c.bld('orc_house', true) && c.mine('peon').length > 0 },
  {
    name: 'treino',
    run: (c) => {
      keepWorking(c);
      // o objetivo seguinte só abre com o Acampamento pronto, e o contador começa em 0 (os guerreiros do início não contam)
      if (c.status('train-troops') !== 'active' || c.obj('train-troops').cur !== 0) throw new Error('train-troops devia estar ativo com 0/7');
    },
    every: 20,
    each: (c) => {
      keepWorking(c);
      const b = c.bld('orc_barracks');
      const rt = c.gm.mission;
      // guerreiros já treinados + na fila; o próximo da lista entra quando há dinheiro (o comando recusa sem debitar)
      const total = rt.trainedCount(0, 'grunt') + rt.trainedCount(0, 'axethrower') + b.queue.length;
      if (total < QUEUE.length) c.issue({ type: c.CMD.TRAIN, buildingId: b.id, unitType: QUEUE[total] });
    },
    until: (c) => c.status('train-troops') === 'completed',
    timeout: 480
  },
  {
    // o reduto (3 × 10 guardas) engole 7 guerreiros: erguer mais Tocas e treinar até 16 soldados antes de marchar
    name: 'reforco',
    run: (c) => { place(c, 'orc_house'); },
    every: 20,
    each: (c) => {
      keepWorking(c);
      if (c.gm.buildings.filter((x) => x.ownerId === 0 && x.type === 'orc_house' && !x.isDead).length < 3 && c.gm.getPlayer(0).resources.wood >= 100) place(c, 'orc_house');
      const b = c.bld('orc_barracks');
      const army = c.mine().filter(isArmy).length + b.queue.length;
      if (army < ARMY) c.issue({ type: c.CMD.TRAIN, buildingId: b.id, unitType: army % 3 === 0 ? 'grunt' : 'axethrower' });
    },
    until: (c) => c.mine().filter(isArmy).length >= ARMY,
    timeout: 600
  },
  {
    name: 'marcha',
    run: (c) => { if (c.status('destroy-camp') !== 'active') throw new Error('destroy-camp devia abrir com a tropa pronta'); },
    every: 40,
    each: (c) => {
      // um acampamento por vez: o mais próximo da tropa que ainda está de pé
      const army = c.mine().filter(isArmy);
      if (army.length === 0) return;
      const cx = army.reduce((t, u) => t + u.mesh.position.x, 0) / army.length;
      const cz = army.reduce((t, u) => t + u.mesh.position.z, 0) / army.length;
      const alive = c.tagged('smuggler_camp').filter((b) => !b.isDead);
      if (alive.length === 0) return;
      const camp = alive.sort((a, b) => Math.hypot(a.mesh.position.x - cx, a.mesh.position.z - cz) - Math.hypot(b.mesh.position.x - cx, b.mesh.position.z - cz))[0];
      c.issue({ type: c.CMD.ATTACK_MOVE, unitIds: army.map((u) => u.id), x: camp.mesh.position.x, z: camp.mesh.position.z });
      keepWorking(c);
    },
    until: (c) => c.status('destroy-camp') === 'completed',
    timeout: 600
  }
];

/**
 * Investida precoce: só os 3 guerreiros do início (2 Talhadores + 1 Lanceiro-Machado) marcham sobre o reduto sem treinar ninguém.
 * Tem de terminar SEM vitória (os Talhadores caem e o reduto continua de pé).
 */
export const rush = [
  {
    name: 'investida',
    wait: 1,
    run: (c) => {
      const p = c.anchor('banditCamp1');
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
      const killer = c.gm.allUnits.find((u) => u.ownerId === 99);
      for (const u of c.mine()) u.takeDamage(1e6, killer);
      for (const b of c.gm.buildings.filter((x) => x.ownerId === 0)) b.takeDamage(1e6, killer);
    }
  }
];
