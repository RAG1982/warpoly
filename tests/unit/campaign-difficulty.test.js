import { describe, it, expect } from 'vitest';
import { applyCampaignDifficulty, getCampaignDifficulty, setCampaignDifficulty, shiftDifficulty } from '../../src/campaign/difficulty.js';
import { memoryStorage } from '../../src/campaign/index.js';

const mk = () => ({ difficulty: 'normal', players: [
  { id: 0, isAI: false }, { id: 1, isAI: true, difficulty: 'easy' }, { id: 2, isAI: true, difficulty: 'normal' }, { id: 3, isAI: true }
] });

describe('M5-01 dificuldade da campanha', () => {
  it('Normal não altera a config', () => {
    expect(applyCampaignDifficulty(mk(), 'normal')).toEqual(mk());
  });
  it('Difícil sobe um degrau; Fácil desce um (limitado)', () => {
    const h = applyCampaignDifficulty(mk(), 'hard');
    expect(h.difficulty).toBe('hard');
    expect(h.players.map((p) => p.difficulty)).toEqual([undefined, 'normal', 'hard', undefined]);
    const e = applyCampaignDifficulty(mk(), 'easy');
    expect(e.difficulty).toBe('easy');
    expect(e.players.map((p) => p.difficulty)).toEqual([undefined, 'easy', 'easy', undefined]);
    expect(shiftDifficulty('brutal', 1)).toBe('brutal');
  });
  it('persiste e normaliza valores inválidos', () => {
    const st = memoryStorage();
    expect(getCampaignDifficulty(st)).toBe('normal');
    setCampaignDifficulty('hard', st);
    expect(getCampaignDifficulty(st)).toBe('hard');
    setCampaignDifficulty('brutal', st);
    expect(getCampaignDifficulty(st)).toBe('normal');
  });
});
