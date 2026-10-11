/**
 * src/campaign/index.js (F8-05) — fachada: config de missão de campanha, execução ativa e gancho de vitória.
 */
import { getCampaign } from '../data/campaigns/index.js';
import { getMission, createMissionConfig } from '../data/missions/index.js';
import { CampaignProgress } from './progress.js';
import { isUnlocked, techRestrictionFor, campaignEndPlan } from './campaign.js';

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
 * Lança se a missão está bloqueada (a menos que `unlockAll`). `techAll` ignora a restrição de árvore tecnológica (depuração).
 */
export function createCampaignMissionConfig(campaignId, missionId, { progress = getProgress(), lang = 'pt-BR', unlockAll = false, inline = false, techAll = false } = {}) {
  const def = getCampaign(campaignId);
  if (!def) throw new Error(`campanha desconhecida "${campaignId}"`);
  const mission = getMission(missionId);
  if (!mission || !def.missions.some((m) => m.id === missionId)) throw new Error(`missão "${missionId}" não pertence à campanha "${campaignId}"`);
  if (!isUnlocked(def, missionId, progress.completed(campaignId), { unlockAll })) throw new Error(`missão "${missionId}" ainda está bloqueada`);
  const cfg = createMissionConfig(mission, { lang, inline });
  cfg.startingResources = progress.startingResources(def, mission);
  // F8-05b: liberação progressiva — o jogador local só usa o que as missões 1..N liberaram (`techAll` = depuração: tudo liberado).
  // A IA inimiga/aliada não é restringida (usa o que a ordem de batalha da missão diz).
  if (!techAll) {
    const local = mission.players.find((p) => p.isLocal);
    const tech = techRestrictionFor(def, missionId, { players: [local ? local.id : 0] });
    if (tech) cfg.techRestriction = tech;
  }
  return cfg;
}

/**
 * Fluxo único de "iniciar missão de campanha" (botão da CampaignScreen e "Próxima missão" da tela final):
 * monta o MatchConfig (com carry-over) e marca a execução ativa, cuja vitória é gravada por `onMissionEnded`.
 */
export function prepareCampaignMission(campaignId, missionId, { lang = 'pt-BR', unlockAll = false, progress = getProgress() } = {}) {
  // `?campaign=unlock` (unlockAll) também libera toda a árvore tecnológica (depuração, F8-05b).
  const config = createCampaignMissionConfig(campaignId, missionId, { lang, unlockAll, progress, techAll: unlockAll });
  setActiveRun({ campaignId, missionId, unlockAll });
  return config;
}

/** Plano da tela final da missão em curso (ou `null` se não é missão de campanha). */
export function getCampaignEndPlan(missionId, outcome, progress = getProgress()) {
  const run = activeRun;
  if (!run || run.missionId !== missionId) return null;
  const def = getCampaign(run.campaignId);
  if (!def) return null;
  const plan = campaignEndPlan(def, missionId, outcome, progress.completed(run.campaignId), { unlockAll: !!run.unlockAll });
  return plan.inCampaign ? { ...plan, campaignId: run.campaignId } : null;
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
