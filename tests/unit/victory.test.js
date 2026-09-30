import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { GameManager } from '../../src/core/GameManager.js';
import { Terrain } from '../../src/world/Terrain.js';
import { createMatchConfig, normalizeVictoryMode, matchConfigFromSearch } from '../../src/sim/MatchConfig.js';
import { isPlayerDefeated } from '../../src/sim/victory.js';
import { SIM_DT } from '../../src/sim/constants.js';
import { EVT } from '../../src/sim/events.js';
import { CMD } from '../../src/sim/commands.js';
import { getBuildingDef } from '../../src/data/index.js';

const b = (role, isDead = false) => ({ role, isDead });

describe('isPlayerDefeated (F3-09)', () => {
  it('conquest: sem construções vivas = derrotado; qualquer construção salva', () => {
    expect(isPlayerDefeated('conquest', [])).toBe(true);
    expect(isPlayerDefeated('conquest', [b('house')])).toBe(false);
    expect(isPlayerDefeated('conquest', [b('hq', true), b('house', true)])).toBe(true);
    expect(isPlayerDefeated('conquest', [b('hq', true), b('tower')])).toBe(false);
  });
  it('conquest: só muralha = derrotado; papel desconhecido conta', () => {
    expect(isPlayerDefeated('conquest', [b('wall'), b('wall')])).toBe(true);
    expect(isPlayerDefeated('conquest', [b('wall'), b('house')])).toBe(false);
    expect(isPlayerDefeated('conquest', [b('coisa_nova')])).toBe(false);
  });
  it('regicide: só o Centro importa', () => {
    expect(isPlayerDefeated('regicide', [b('house'), b('tower')])).toBe(true);
    expect(isPlayerDefeated('regicide', [b('house'), b('hq')])).toBe(false);
    expect(isPlayerDefeated('regicide', [b('hq', true)])).toBe(true);
  });
  it('modo inválido cai em conquest', () => {
    expect(isPlayerDefeated('xyz', [b('house')])).toBe(false);
  });
});

describe('MatchConfig.victoryMode (F3-09)', () => {
  it('normaliza valores inválidos para conquest', () => {
    expect(normalizeVictoryMode('regicide')).toBe('regicide');
    expect(normalizeVictoryMode('foo')).toBe('conquest');
    expect(normalizeVictoryMode(undefined)).toBe('conquest');
    expect(createMatchConfig({ victoryMode: 'nope' }).victoryMode).toBe('conquest');
    expect(createMatchConfig().victoryMode).toBe('conquest');
  });
  it('?victory=regicide', () => {
    expect(matchConfigFromSearch('?victory=regicide').victoryMode).toBe('regicide');
    expect(matchConfigFromSearch('').victoryMode).toBe('conquest');
  });
});

function makeGm(victoryMode, seed = 7) {
  const scene = new THREE.Scene();
  const terrain = new Terrain(scene);
  const cfg = createMatchConfig({ seed, headless: true, victoryMode });
  cfg.players.forEach(p => { p.isAI = true; }); // IA × IA (o jogador local também joga sozinho)
  return new GameManager(scene, terrain, null, null, cfg);
}
const run = (gm, n) => { for (let i = 0; i < n; i++) gm.simStep(SIM_DT); };
const isHq = x => getBuildingDef(x.type).role === 'hq';

describe('partida headless IA×IA (F3-09)', () => {
  it('conquest: só termina quando cai a última construção do jogador 1', () => {
    const gm = makeGm('conquest');
    const defeated = [];
    gm.events.on(EVT.PLAYER_DEFEATED, e => defeated.push(e.ownerId));
    run(gm, 20);
    gm.buildings.filter(x => x.ownerId === 1 && isHq(x)).forEach(x => x.takeDamage(1e6, { ownerId: 0 }));
    run(gm, 5);
    expect(gm.isGameOver).toBe(false); // ainda há outras construções
    gm.buildings.filter(x => x.ownerId === 1).forEach(x => x.takeDamage(1e6, { ownerId: 0 }));
    run(gm, 5);
    expect(gm.isGameOver).toBe(true);
    expect(gm.gameWon).toBe(true);
    expect(defeated).toEqual([1]);
    expect(gm.result).toBeTruthy();
    expect(gm.result.winnerTeam).toBe(0);
    expect(gm.result.players[0].buildingsDestroyed).toBeGreaterThanOrEqual(3);
    // unidades do derrotado continuam no mapa
    expect(gm.allUnits.some(u => u.ownerId === 1 && !u.isDead)).toBe(true);
    JSON.stringify(gm.result);
  }, 30000);

  it('regicide: cair o Centro termina a partida mesmo com outras construções', () => {
    const gm = makeGm('regicide');
    run(gm, 20);
    const hq = gm.buildings.find(x => x.ownerId === 1 && isHq(x));
    expect(gm.buildings.filter(x => x.ownerId === 1).length).toBeGreaterThan(1);
    hq.takeDamage(1e6, { ownerId: 0 });
    run(gm, 5);
    expect(gm.isGameOver).toBe(true);
    expect(gm.gameWon).toBe(true);
    expect(gm.buildings.some(x => x.ownerId === 1 && !x.isDead)).toBe(true);
    expect(gm.result.mode).toBe('regicide');
  }, 30000);

  it('derrotado não recebe ordens e não é removido', () => {
    const gm = makeGm('regicide');
    run(gm, 20);
    gm.getPlayer(1).defeated = true;
    const u = gm.allUnits.find(x => x.ownerId === 1);
    const x0 = u.mesh.position.x;
    gm.issue({ type: CMD.MOVE, playerId: 1, unitIds: [u.id], x: x0 + 30, z: u.mesh.position.z });
    run(gm, 60);
    expect(u.mesh.position.x).toBe(x0);
    expect(gm.allUnits).toContain(u);
  }, 30000);
});
