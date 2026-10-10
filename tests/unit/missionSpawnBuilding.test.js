import { describe, it, expect } from 'vitest';
import { validateMission } from '../../src/sim/missions/schema.js';
import { ACTION_TYPES } from '../../src/sim/missions/index.js';
import { stateChecksum } from '../../src/sim/checksum.js';
import { baseMission, makeMissionGm, runTicks, statusOf } from './helpers/missionWorld.js';

/**
 * NEW-52 — ação de missão `spawnBuilding {owner, buildingType, x, z, tag?, facing?, markColor?}`: construção já CONCLUÍDA
 * do dono (forte aliado, torre inimiga…), registrada como as construções iniciais das bases. O campo `type` já é o
 * discriminador da ação, por isso o tipo da construção se chama `buildingType` (como `unitType` no `spawn`).
 */
const errorsOf = (def) => validateMission(def).errors;
const has = (errs, text) => errs.some((e) => e.includes(text));
const PRIMARY = (o) => ({ priority: 'primary', title: 't', ...o });
const build = (over = {}) => ({ type: 'spawnBuilding', owner: 'player', buildingType: 'castle', x: 0, z: 0, ...over });
const withSetup = (actions, extra = {}) => baseMission({ autoVictory: false, objectives: [PRIMARY({ id: 'o', type: 'survive', seconds: 9999 })], setup: actions, ...extra });

/** Ponto livre para a construção no mapa `tutorial`, pelas mesmas regras do jogador (`canPlaceBuilding`), numa partida sem a ação. */
function freeSpot(type = 'castle', from = 0) {
  const probe = makeMissionGm(baseMission());
  let skipped = 0;
  for (let z = -30; z <= 30; z += 2) {
    for (let x = -30; x <= 30; x += 2) {
      if (probe.canPlaceBuilding(type, x, z, null, 0) && skipped++ >= from) return { x, z };
    }
  }
  throw new Error(`sem ponto livre para ${type}`);
}

describe('spawnBuilding: validação (schema)', () => {
  it('a ação existe e uma definição correta é válida', () => {
    expect(ACTION_TYPES).toContain('spawnBuilding');
    expect(errorsOf(withSetup([build({ tag: 'forte', facing: 90, markColor: '#22d3ee' })]))).toEqual([]);
    expect(errorsOf(withSetup([build({ owner: 'enemy', buildingType: 'watchtower', x: 10, z: -12 })]))).toEqual([]);
    expect(errorsOf(withSetup([build({ owner: 1, buildingType: 'great_hall', markColor: '#AABBCC' })]))).toEqual([]);
  });

  it('recusa tipo de construção inexistente, ausente ou plataforma de petróleo', () => {
    expect(has(errorsOf(withSetup([build({ buildingType: 'torre-de-marfim' })])), 'construção desconhecida')).toBe(true);
    expect(has(errorsOf(withSetup([build({ buildingType: undefined })])), 'informe buildingType')).toBe(true);
    expect(has(errorsOf(withSetup([build({ buildingType: 'knight' })])), 'construção desconhecida')).toBe(true); // unidade não é construção
    expect(has(errorsOf(withSetup([build({ buildingType: 'oil_platform' })])), 'poço')).toBe(true);
  });

  it('recusa dono inválido e coordenadas fora da área jogável (centro ou pegada)', () => {
    expect(has(errorsOf(withSetup([build({ owner: 'alienigena' })])), 'dono inválido')).toBe(true);
    expect(has(errorsOf(withSetup([build({ owner: undefined })])), 'dono inválido')).toBe(true);
    expect(has(errorsOf(withSetup([build({ x: 9999 })])), 'fora da área')).toBe(true);
    expect(has(errorsOf(withSetup([build({ z: -9999 })])), 'fora da área')).toBe(true);
    expect(has(errorsOf(withSetup([build({ x: 'oeste' })])), 'número finito')).toBe(true);
    // `tutorial`: playable 92 => metade 46. O centro em 44 cabe, mas o castelo (raio 5,5) sai da área.
    expect(has(errorsOf(withSetup([build({ x: 44, z: 0 })])), 'pegada')).toBe(true);
    expect(errorsOf(withSetup([build({ x: 42, z: 0, buildingType: 'cottage' })]))).toEqual([]); // a casa (raio 2,8) cabe
  });

  it('tag, cor de marcação e giro são conferidos; a tag criada pela ação vale para objetivos', () => {
    expect(has(errorsOf(withSetup([build({ tag: 'Forte!' })])), 'tag inválida')).toBe(true);
    for (const cor of ['azul', '#fff', '22d3ee', '#22d3eg', 42]) {
      expect(has(errorsOf(withSetup([build({ markColor: cor })])), 'cor inválida'), String(cor)).toBe(true);
    }
    expect(has(errorsOf(withSetup([build({ facing: 720 })])), 'fora do intervalo')).toBe(true);
    // a tag "forte" nasce na ação: o objetivo `destroy` que a cita é válido; sem a ação a tag "nunca é criada"
    const obj = PRIMARY({ id: 'd', type: 'destroy', select: { tag: 'forte' } });
    expect(errorsOf(withSetup([build({ tag: 'forte' })], { objectives: [obj] }))).toEqual([]);
    expect(has(errorsOf(withSetup([], { objectives: [obj] })), 'tag "forte" nunca é criada')).toBe(true);
  });

  it('também vale dentro de gatilhos e `spawn` ganha markColor validado', () => {
    const trig = (a) => baseMission({ triggers: [{ id: 't', when: { type: 'time', at: 3 }, actions: [a] }] });
    expect(errorsOf(trig(build({ buildingType: 'barracks', x: 10, z: 10 })))).toEqual([]);
    expect(has(errorsOf(trig(build({ buildingType: 'dragao' }))), 'construção desconhecida')).toBe(true);
    const spawn = (markColor) => withSetup([{ type: 'spawn', owner: 'player', unitType: 'villager', count: 2, x: 0, z: 0, markColor }]);
    expect(errorsOf(spawn('#22d3ee'))).toEqual([]);
    expect(errorsOf(spawn(undefined))).toEqual([]);
    expect(has(errorsOf(spawn('ciano')), 'cor inválida')).toBe(true);
  });
});

describe('spawnBuilding: execução (simulação)', () => {
  it('cria a construção CONCLUÍDA do dono no ponto, registrada como as das bases', () => {
    const { x, z } = freeSpot('castle');
    const gm = makeMissionGm(withSetup([build({ x, z, tag: 'forte' })]));
    const before = makeMissionGm(withSetup([]));
    const fort = gm.entitiesById.get(gm.mission.tags.get('forte')[0]);
    expect(fort).toBeTruthy();
    expect(fort.type).toBe('castle');
    expect(fort.ownerId).toBe(0);
    expect(fort.mesh.position.x).toBe(x);
    expect(fort.mesh.position.z).toBe(z);
    expect(fort.isConstructed).toBe(true);
    expect(fort.hp).toBe(fort.maxHp);
    expect(gm.buildings).toContain(fort);
    expect(gm.buildings.length).toBe(before.buildings.length + 1);
    expect(gm.getEntity(fort.id)).toBe(fort);
    expect(gm.commands.log.length).toBe(0); // direto na simulação: nada vai para o log de comandos (saves/replays)
    // bloqueia a navegação e a grade espacial como qualquer construção
    expect(gm.pathfinder.isWalkableWorld(x, z)).toBe(false);
    expect(gm.blockerGrid.queryRadius(x, z, 1, (e) => e === fort, []).length).toBe(1);
    // população: o castelo do forte soma o teto do dono
    expect(gm.getPlayer(0).maxPopulation).toBe(before.getPlayer(0).maxPopulation + fort.popGranted);
    // o seletor de missão o encontra por tag, por tipo+dono e por papel
    expect(gm.mission.select({ tag: 'forte' })).toEqual([fort]);
    expect(gm.mission.select({ buildingType: 'castle', owner: 'player', area: { x, z, r: 2 } })).toEqual([fort]);
    expect(gm.mission.select({ role: 'hq', owner: 'enemy' })).not.toContain(fort);
  });

  it('o dono pode ser o jogador, um rival numérico, o inimigo, o neutro ou os bandoleiros', () => {
    const { x, z } = freeSpot('watchtower');
    const owners = [['player', 0], ['enemy', 1], [1, 1], ['neutral', -1], ['bandits', 99]];
    for (const [owner, id] of owners) {
      const gm = makeMissionGm(withSetup([build({ owner, buildingType: 'watchtower', x, z, tag: 't' })]));
      const b = gm.entitiesById.get(gm.mission.tags.get('t')[0]);
      expect(b.ownerId, String(owner)).toBe(id);
      expect(b.isConstructed).toBe(true);
    }
  });

  it('funciona também a partir de um gatilho (durante a simulação) e conta em objetivos', () => {
    const { x, z } = freeSpot('farm');
    const gm = makeMissionGm(baseMission({
      autoVictory: false,
      vars: { n: 0 },
      objectives: [
        PRIMARY({ id: 'o', type: 'survive', seconds: 9999 }),
        { id: 'casa', type: 'build', priority: 'secondary', buildingType: 'farm', count: 1, title: 'Fazenda' },
        { id: 'cair', type: 'destroy', priority: 'secondary', select: { tag: 'casa' }, title: 'Derrubar' }
      ],
      triggers: [{ id: 'go', when: { type: 'time', at: 1 }, actions: [build({ buildingType: 'farm', x, z, tag: 'casa' })] }]
    }));
    const n0 = gm.buildings.length;
    runTicks(gm, 10);
    expect(gm.buildings.length).toBe(n0);
    expect(statusOf(gm, 'casa')).toBe('active');
    runTicks(gm, 15); // t = 1 s => tick 20
    expect(gm.buildings.length).toBe(n0 + 1);
    runTicks(gm, 10);
    expect(statusOf(gm, 'casa')).toBe('completed'); // `build` conta construções concluídas — a do script já nasce pronta
    // destruída por um inimigo => objetivo `destroy` por tag
    const house = gm.entitiesById.get(gm.mission.tags.get('casa')[0]);
    house.takeDamage(1e6, gm.getUnitsOf(1)[0]);
    runTicks(gm, 6);
    expect(statusOf(gm, 'cair')).toBe('completed');
    expect(gm.buildings).not.toContain(house);
  });

  it('giro em graus; árvores na folga de construção somem sem animação (as demais ficam)', () => {
    const probe = makeMissionGm(withSetup([]));
    const idx = probe.trees.findIndex((t) => Math.abs(t.mesh.position.x) < 38 && Math.abs(t.mesh.position.z) < 38);
    const tree = probe.trees[idx];
    const gm = makeMissionGm(withSetup([build({ buildingType: 'cottage', x: tree.mesh.position.x, z: tree.mesh.position.z, facing: 90, tag: 'c' })]));
    const house = gm.entitiesById.get(gm.mission.tags.get('c')[0]);
    expect(house.mesh.rotation.y).toBeCloseTo(Math.PI / 2, 9);
    const removed = gm.trees.filter((t) => t.isDisposed);
    expect(removed).toContain(gm.trees[idx]);
    // a mesma folga que `canPlaceBuilding` exige do jogador: raio da construção + 3,5 (+ raio da árvore)
    const gap = (t) => house.collisionRadius + 3.5 + t.collisionRadius;
    for (const t of removed) expect(Math.hypot(t.mesh.position.x - house.mesh.position.x, t.mesh.position.z - house.mesh.position.z)).toBeLessThanOrEqual(gap(t) + 1e-9);
    for (const t of removed) {
      expect(t.isDead).toBe(true);
      expect(t.fallProgress).toBe(1); // sem animação de queda nem toco
    }
    const stay = gm.trees.filter((t) => !t.isDisposed);
    expect(stay.length).toBeGreaterThan(removed.length); // só as que atrapalham; a floresta continua
    for (const t of stay) expect(Math.hypot(t.mesh.position.x - house.mesh.position.x, t.mesh.position.z - house.mesh.position.z)).toBeGreaterThan(house.collisionRadius + 3.5);
    expect(probe.trees.length).toBe(gm.trees.length); // a lista não muda de tamanho (índices e ids estáveis)
    // depois do passo, as árvores removidas saem da grade espacial e do mapa de navegação; as outras continuam
    const inGrid = (t) => gm.blockerGrid.queryRadius(t.mesh.position.x, t.mesh.position.z, 0.3, (e) => e === t, []).length > 0;
    expect(inGrid(gm.trees[idx])).toBe(true); // antes do passo ainda está na grade
    runTicks(gm, 3);
    expect(inGrid(gm.trees[idx])).toBe(false);
    expect(inGrid(stay[0])).toBe(true);
    // nenhuma árvore viva fica na folga: o ponto passa pela regra de árvores do `canPlaceBuilding`
    const hits = gm.blockerGrid.queryRadius(house.mesh.position.x, house.mesh.position.z, house.collisionRadius + 3.5, (e) => e.treeType !== undefined && !e.isDead && e.woodRemaining > 0, []);
    expect(hits.length).toBe(0);
  });
});

describe('spawnBuilding: determinismo e checksum', () => {
  const scripted = (over = {}) => {
    const { x, z } = freeSpot('castle');
    return withSetup([
      build({ x, z, tag: 'forte', ...over }),
      { type: 'spawn', owner: 'player', unitType: 'villager', count: 2, x: x + 14, z, tag: 'v', ...(over.unitMark ? { markColor: over.unitMark } : {}) }
    ]);
  };

  it('mesma missão => mesmos checksums a cada 20 ticks', () => {
    const a = makeMissionGm(scripted());
    const b = makeMissionGm(scripted());
    runTicks(a, 300);
    runTicks(b, 300);
    expect(a.checksums.length).toBeGreaterThan(10);
    expect(b.checksums).toEqual(a.checksums);
    expect(stateChecksum(b)).toBe(stateChecksum(a));
  });

  it('a construção entra no checksum, a cor de marcação não', () => {
    const plain = makeMissionGm(scripted());
    const marked = makeMissionGm(scripted({ markColor: '#22d3ee', unitMark: '#22d3ee' }));
    const without = makeMissionGm(withSetup([]));
    runTicks(plain, 60);
    runTicks(marked, 60);
    runTicks(without, 60);
    expect(stateChecksum(marked)).toBe(stateChecksum(plain)); // markColor é só render
    expect(marked.checksums).toEqual(plain.checksums);
    expect(marked.mission.hashString()).toBe(plain.mission.hashString());
    expect(stateChecksum(plain)).not.toBe(stateChecksum(without)); // a construção existe na simulação
    const fort = marked.entitiesById.get(marked.mission.tags.get('forte')[0]);
    expect(fort.markColor).toBe('#22d3ee');
  });

  it('save/load: restaurar no meio da missão com a construção reproduz o mesmo estado', async () => {
    const { captureSave, restoreSync, parseSave, serializeSave } = await import('../../src/sim/SaveGame.js');
    const a = makeMissionGm(scripted());
    runTicks(a, 120);
    const save = parseSave(serializeSave(captureSave(a, { name: 't' })));
    const b = makeMissionGm(save.config.mission, { seed: save.config.seed });
    const res = restoreSync(b, save);
    expect(res.ok).toBe(true);
    expect(b.buildings.length).toBe(a.buildings.length);
    runTicks(a, 200);
    runTicks(b, 200);
    expect(b.checksums.filter((c) => c.tick > 120)).toEqual(a.checksums.filter((c) => c.tick > 120));
  });
});
