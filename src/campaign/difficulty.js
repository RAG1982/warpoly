/**
 * src/campaign/difficulty.js (M5-01) — dificuldade GLOBAL da campanha (Fácil/Normal/Difícil), persistida em localStorage.
 *
 * As missões trazem a dificuldade "de projeto" de cada IA (`players[i].difficulty`, ou `cfg.difficulty` = normal). O seletor
 * desloca TODAS as IAs da missão pelo mesmo número de degraus em relação ao Normal (Fácil = −1, Difícil = +1), limitado
 * a Fácil..Brutal. Normal não altera nada (config idêntica à de projeto: replays e checksums não mudam).
 * Os números de balanceamento de cada nível vivem em `src/ai/AIProfile.js`; aqui só se escolhe o degrau.
 */
import { DIFFICULTIES, DEFAULT_DIFFICULTY } from '../sim/MatchConfig.js';

/** Níveis oferecidos na campanha (o Brutal fica só na escaramuça). */
export const CAMPAIGN_DIFFICULTIES = Object.freeze(['easy', 'normal', 'hard']);
export const CAMPAIGN_DIFFICULTY_KEY = 'warpoly.campaignDifficulty';

function store() { try { return globalThis.localStorage || null; } catch { return null; } }

export function normalizeCampaignDifficulty(d) {
  return CAMPAIGN_DIFFICULTIES.includes(d) ? d : DEFAULT_DIFFICULTY;
}

export function getCampaignDifficulty(storage = store()) {
  try { return normalizeCampaignDifficulty(storage && storage.getItem(CAMPAIGN_DIFFICULTY_KEY)); } catch { return DEFAULT_DIFFICULTY; }
}

export function setCampaignDifficulty(level, storage = store()) {
  const v = normalizeCampaignDifficulty(level);
  try { storage && storage.setItem(CAMPAIGN_DIFFICULTY_KEY, v); } catch { /* sem persistência: vale só nesta sessão */ }
  return v;
}

/** `id` deslocado `delta` degraus na escada, limitado às pontas. */
export function shiftDifficulty(id, delta) {
  const i = DIFFICULTIES.indexOf(id);
  const base = i < 0 ? DIFFICULTIES.indexOf(DEFAULT_DIFFICULTY) : i;
  return DIFFICULTIES[Math.max(0, Math.min(DIFFICULTIES.length - 1, base + delta))];
}

/** Aplica o nível da campanha ao `MatchConfig` (muta e devolve `cfg`). */
export function applyCampaignDifficulty(cfg, level = getCampaignDifficulty()) {
  const delta = DIFFICULTIES.indexOf(normalizeCampaignDifficulty(level)) - DIFFICULTIES.indexOf(DEFAULT_DIFFICULTY);
  if (!delta) return cfg;
  cfg.difficulty = shiftDifficulty(cfg.difficulty, delta);
  for (const p of cfg.players) if (p.isAI && p.difficulty) p.difficulty = shiftDifficulty(p.difficulty, delta);
  return cfg;
}
