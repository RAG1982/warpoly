/**
 * src/campaign/index.js (F8-05) — fachada: config de missão de campanha, execução ativa e gancho de vitória.
 */
import { getCampaign } from '../data/campaigns/index.js';
import { getMission, createMissionConfig } from '../data/missions/index.js';
import { CampaignProgress } from './progress.js';
import { isUnlocked } from './campaign.js';

export * from './campaign.js';
export { CampaignProgress, memoryStorage, PROGRESS_KEY } from './progress.js';

let progressSingleton = null;
/** Progresso compartilhado da página (localStorage). */
export function getProgress() {
  if (!progressSingleton) progressSingleton = new CampaignProgress();
  return progressSingleton;
}
/** Para testes: troca/zera o singleton. */
export function setProgress(p) { progressSingleton = p; }

/**
 * MatchConfig da missão `missionId` da campanha `campaignId`, com carry-over de recursos da tentativa atual.
 * Lança se a missão está bloqueada (a menos que `unlockAll`).
 */
export function createCampaignMissionConfig(campaignId, missionId, { progress = getProgress(), lang = 'pt-BR', unlockAll = false, inline = false } = {}) {
  const def = getCampaign(campaignId);
  if (!def) throw new Error(`campanha desconhecida "${campaignId}"`);
  const mission = getMission(missionId);
  if (!mission || !def.missions.some((m) => m.id === missionId)) throw new Error(`missão "${missionId}" não pertence à campanha "${campaignId}"`);
  if (!isUnlocked(def, missionId, progress.completed(campaignId), { unlockAll })) throw new Error(`missão "${missionId}" ainda está bloqueada`);
  const cfg = createMissionConfig(mission, { lang, inline });
  cfg.startingResources = progress.startingResources(def, mission);
  return cfg;
}

// ------------------------------------------------------------------ execução ativa (campanha em curso)
let activeRun = null;
/** Marca a missão que o jogador acabou de iniciar a partir da campanha (a vitória dela é gravada em `onMissionEnded`). */
export function setActiveRun(run) { activeRun = run ? { ...run } : null; }
export function getActiveRun() { return activeRun; }

/**
 * Chamada quando uma missão termina. Se for a missão da campanha em curso e foi vitória, grava o progresso.
 * @returns {boolean} true se gravou
 */
export function onMissionEnded({ missionId, outcome, seconds = 0, resources = null }, progress = getProgress()) {
  if (!activeRun || activeRun.missionId !== missionId || outcome !== 'victory') return false;
  progress.recordVictory(activeRun.campaignId, missionId, { seconds, resources });
  return true;
}
