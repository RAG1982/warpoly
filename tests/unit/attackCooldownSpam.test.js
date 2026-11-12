import { describe, it, expect } from 'vitest';
import { getMap } from '../../src/data/maps/index.js';
import { GameManager } from '../../src/core/GameManager.js';
import { Terrain } from '../../src/world/Terrain.js';
import { createMatchConfig } from '../../src/sim/MatchConfig.js';
import { SIM_DT } from '../../src/sim/constants.js';

/**
 * Bug de jogo: clicar várias vezes para atacar fazia a unidade disparar a cada clique, ignorando o intervalo entre ataques.
 * `hasFiredThisAttack` é zerado por novos comandos; a trava agora olha o tempo desde o último disparo.
 */
function makeUnit(type = 'catapult') {
  const terrain = new Terrain(getMap('continental-1v1'));
  const gm = new GameManager(terrain, null, null, createMatchConfig({ mapId: 'continental-1v1', seed: 5, headless: true }));
  const u = gm.spawnUnit(type, 0, 0, 0);
  return u;
}

describe('trava do intervalo de ataque', () => {
  it('zerar hasFiredThisAttack logo depois de disparar não libera novo disparo antes do cooldown', () => {
    const u = makeUnit();
    u.hasFiredThisAttack = true; // disparou agora
    for (let i = 0; i < 30; i++) {
      u.hasFiredThisAttack = false; // cliques repetidos / novos comandos
      u._sinceFire += SIM_DT;
      u.attackTimer += SIM_DT;
      if (u._sinceFire < u.effAttackCooldown) expect(u.hasFiredThisAttack).toBe(true);
    }
  });

  it('libera de novo depois de passado o cooldown completo desde o último disparo', () => {
    const u = makeUnit();
    u.hasFiredThisAttack = true;
    u._sinceFire += u.effAttackCooldown + 0.01;
    u.hasFiredThisAttack = false;
    expect(u.hasFiredThisAttack).toBe(false);
  });

  it('unidade nova pode disparar de imediato (sem espera inicial)', () => {
    expect(makeUnit('grunt').hasFiredThisAttack).toBe(false);
  });
});
