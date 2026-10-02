import { describe, it, expect, vi } from 'vitest';
import { createMatchConfig, difficultyOf, validateMatchConfig } from '../../src/sim/MatchConfig.js';
import { SIM_DT } from '../../src/sim/constants.js';
import { EVT } from '../../src/sim/events.js';
import { CMD } from '../../src/sim/commands.js';
import { DIFFICULTY_PROFILES, getAIProfile } from '../../src/ai/AIProfile.js';
import { makeGm } from './helpers/aiWorld.js';

/** F5-03 — níveis de dificuldade (perfil, MatchConfig por jogador, orçamento de APM, bônus do Brutal). */

describe('F5-03: dificuldades', () => {
  it('perfis são monotônicos e só o Brutal ganha bônus/visão total', () => {
    const order = ['easy', 'normal', 'hard', 'brutal'].map(getAIProfile);
    for (let i = 1; i < order.length; i++) {
      expect(order[i].maxApm).toBeGreaterThan(order[i - 1].maxApm);
      expect(order[i].tickInterval).toBeLessThan(order[i - 1].tickInterval);
      expect(order[i].micro).toBeGreaterThanOrEqual(order[i - 1].micro);
    }
    expect(DIFFICULTY_PROFILES.easy.micro).toBe(0);
    expect(order.filter(p => p.resourceBonus > 0).map(p => p.id)).toEqual(['brutal']);
    expect(order.filter(p => p.cheatVision).map(p => p.id)).toEqual(['brutal']);
    expect(getAIProfile('xyz').id).toBe('normal');
  });

  it('MatchConfig: difficulty por jogador sobrepõe a da partida e é validada', () => {
    const cfg = createMatchConfig({ difficulty: 'easy' });
    expect(difficultyOf(cfg, 1)).toBe('easy');
    cfg.players[1].difficulty = 'brutal';
    expect(difficultyOf(cfg, 1)).toBe('brutal');
    expect(() => validateMatchConfig(cfg)).not.toThrow();
    cfg.players[1].difficulty = 'impossivel';
    expect(() => validateMatchConfig(cfg)).toThrow();
    const gm = makeGm({ difficulties: ['hard', 'easy'] });
    expect(gm.aiDirectors.map(d => d.difficulty)).toEqual(['hard', 'easy']);
    expect(gm.aiDirectors.map(d => d.TICK_INTERVAL)).toEqual([0.75, 2.5]);
    gm.dispose();
  });

  it('orçamento de APM: o balde esvazia e repõe maxApm/60 por segundo', () => {
    const gm = makeGm({ difficulties: ['easy', 'brutal'] });
    const easy = gm.aiDirectors[0];
    const brutal = gm.aiDirectors[1];
    const spy = vi.spyOn(gm, 'issue');
    const burst = d => {
      let ok = 0;
      for (let i = 0; i < 1000; i++) if (d.issue({ type: CMD.STOP, playerId: d.playerId, unitIds: [] })) ok++;
      return ok;
    };
    const e = burst(easy);
    const b = burst(brutal);
    expect(e).toBeLessThan(b);
    expect(e).toBe(Math.floor(easy._apmCap));
    expect(easy.commandsDropped).toBeGreaterThan(900);
    expect(spy).toHaveBeenCalledTimes(e + b);
    // reposição: 60 s => ~maxApm fichas (limitado pela capacidade do balde)
    easy.TICK_INTERVAL = 1e9; // só a reposição do balde, sem decisões
    for (let i = 0; i < 20 * 60; i++) easy.update(SIM_DT);
    expect(burst(easy)).toBe(Math.floor(easy._apmCap));
    gm.dispose();
  });

  it('bônus de recursos só no Brutal (+25 % por coleta)', () => {
    const gm = makeGm({ difficulties: ['normal', 'brutal'] });
    const before = gm.aiDirectors.map(d => d.player.resources.gold);
    for (const d of gm.aiDirectors) gm.events.emit(EVT.RESOURCE_GATHERED, { ownerId: d.playerId, type: 'gold', amount: 100, pos: { x: 0, y: 0, z: 0 } });
    gm.events.flush();
    const after = gm.aiDirectors.map(d => d.player.resources.gold);
    expect(after[0] - before[0]).toBe(0);
    expect(after[1] - before[1]).toBe(25);
    gm.dispose();
  });
});

