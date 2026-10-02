import { describe, it, expect, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { stateChecksum } from '../../src/sim/checksum.js';
import { makeGm, run } from './helpers/aiWorld.js';

/** F5-01 — um AIDirector por jogador de IA, tudo por comandos; determinismo. */

describe('F5-01: um AIDirector por jogador, tudo por comandos', () => {
  it('EnemyAI.js não existe mais e cada jogador de IA tem seu diretor com Player próprio', () => {
    expect(existsSync(new URL('../../src/ai/EnemyAI.js', import.meta.url).pathname)).toBe(false);
    const gm = makeGm({ ffa: true });
    expect(gm.aiDirectors.length).toBe(3);
    const ids = gm.aiDirectors.map(d => d.playerId);
    expect(new Set(ids).size).toBe(3);
    const players = new Set(gm.aiDirectors.map(d => d.player));
    expect(players.size).toBe(3);
    gm.dispose();
  });

  it('comandos da IA carregam o playerId de quem os emitiu', () => {
    const gm = makeGm({ ffa: true });
    const spy = vi.spyOn(gm, 'issue');
    run(gm, 20 * 90);
    expect(spy.mock.calls.length).toBeGreaterThan(20);
    const seen = new Set(spy.mock.calls.map(c => c[0].playerId));
    expect(seen).toEqual(new Set([0, 1, 2]));
    gm.dispose();
  });

  it('determinismo: mesma seed => mesmo checksum', () => {
    const sums = [0, 1].map(() => {
      const gm = makeGm({ seed: 5, difficulties: ['hard', 'normal'] });
      run(gm, 20 * 150);
      const s = stateChecksum(gm);
      gm.dispose();
      return s;
    });
    expect(sums[0]).toBe(sums[1]);
  }, 60000);
});

