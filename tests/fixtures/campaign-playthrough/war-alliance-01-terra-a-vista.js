/**
 * Roteiro de playthrough da m01 "Terra à Vista" (M3-02). Tudo por comandos reais do jogador: Fazenda, Quartel e Casa
 * construídos pelos Aldeões, 7 soldados treinados no Quartel (3 Espadachins + 4 Arqueiros), marcha de ataque ao acampamento
 * da Irmandade da Maré. Só o desfecho do combate é de verdade também (sem teletransporte nem dano injetado).
 */
export const campaignId = 'war-alliance';
export const targetMinutes = 10; // ficha: 10–12 min; o harness aceita até 2×

const nearest = (list, p) => list.slice().sort((a, b) => Math.hypot(a.mesh.position.x - p.x, a.mesh.position.z - p.z) - Math.hypot(b.mesh.position.x - p.x, b.mesh.position.z - p.z))[0];

/** Primeiro ponto em volta do Centro onde `canPlaceBuilding` aceita (varredura em anéis, ordem fixa). */
function place(c, type, minR = 8) {
  const hq = c.bld('castle');
  const p = hq.mesh.position;
  for (let r = minR; r < 40; r += 3) {
    for (let a = 0; a < 16; a++) {
      const x = p.x + Math.cos((a * Math.PI) / 8) * r;
      const z = p.z + Math.sin((a * Math.PI) / 8) * r;
      if (c.gm.canPlaceBuilding(type, x, z, null, 0)) {
        c.issue({ type: c.CMD.PLACE_BUILDING, buildingType: type, x, z, unitIds: c.mine('villager').map((u) => u.id) });
        return true;
      }
    }
  }
  throw new Error(`sem lugar para ${type}`);
}

/** Aldeões ociosos voltam ao trabalho: o 1º no ouro, os demais na madeira (a mais próxima da base). */
function keepWorking(c) {
  const home = c.anchor('playerStart');
  const mine = nearest(c.gm.resourceDeposits.filter((r) => r.type === 'gold' && !r.isDead), home);
  const tree = nearest(c.gm.trees.filter((t) => !t.isDead), home);
  c.mine('villager').forEach((u, i) => {
    if (u.state === 'idle') c.issue({ type: c.CMD.GATHER, unitIds: [u.id], targetId: (i === 0 ? mine : tree).id });
  });
}

const QUEUE = ['knight', 'knight', 'knight', 'archer', 'archer', 'archer', 'archer'];

export const win = [
  { name: 'fazenda', wait: 3, run: (c) => place(c, 'farm'), each: () => {}, until: (c) => !!c.bld('farm') },
  { name: 'quartel', run: (c) => place(c, 'barracks'), each: () => {}, until: (c) => c.status('build-barracks') === 'completed' },
  { name: 'casa', run: (c) => place(c, 'cottage'), each: () => {}, until: (c) => !!c.bld('cottage', true) && c.mine('villager').length > 0 },
  {
    name: 'treino',
    run: (c) => {
      keepWorking(c);
      // o objetivo seguinte só abre com o Quartel pronto, e o contador começa em 0 (os soldados do início não contam)
      if (c.status('train-troops') !== 'active' || c.obj('train-troops').cur !== 0) throw new Error('train-troops devia estar ativo com 0/7');
    },
    every: 20,
    each: (c) => {
      keepWorking(c);
      const b = c.bld('barracks');
      const rt = c.gm.mission;
      // soldados já treinados + na fila; o próximo da lista entra quando há dinheiro (o comando recusa sem debitar)
      const total = rt.trainedCount(0, 'knight') + rt.trainedCount(0, 'archer') + b.queue.length;
      if (total < QUEUE.length) c.issue({ type: c.CMD.TRAIN, buildingId: b.id, unitType: QUEUE[total] });
    },
    until: (c) => c.status('train-troops') === 'completed',
    timeout: 480
  },
  {
    name: 'marcha',
    run: (c) => { if (c.status('destroy-camp') !== 'active') throw new Error('destroy-camp devia abrir com a tropa pronta'); },
    every: 40,
    each: (c) => {
      const camp = c.anchor('neutralCamp1');
      const army = c.mine().filter((u) => u.type === 'knight' || u.type === 'archer');
      c.issue({ type: c.CMD.ATTACK_MOVE, unitIds: army.map((u) => u.id), x: camp.x, z: camp.z });
      keepWorking(c);
    },
    until: (c) => c.status('destroy-camp') === 'completed',
    timeout: 400
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
