// src/ui/campaignSelectModel.js (M2-34) — modelo puro da tela de escolha de campanha (sem DOM).
import { localize } from '../sim/missions/text.js';

/** Quais campanhas aparecem: as `main`; as `beta` só com `?campaign=alliance|beta|unlock`. */
export function showBetaFor(param) {
  return param === 'alliance' || param === 'beta' || param === 'unlock';
}

/** Campanha "em breve" (flag `comingSoon`) só abre com `unlockAll` ou `?campaign=<id>` explícito. */
export function isCampaignPlayable(def, { unlockAll = false, param = null } = {}) {
  if (!def.comingSoon) return true;
  return !!unlockAll || param === def.id;
}

/**
 * @param {object[]} campaigns  `listCampaigns()`
 * @param {{completed:(id:string)=>object}} progress
 * @returns {{main:object[], beta:object[]}} cartões na ordem de exibição
 */
export function buildCampaignCards(campaigns, progress, { lang = 'pt-BR', unlockAll = false, param = null } = {}) {
  const showBeta = unlockAll || showBetaFor(param);
  const cards = campaigns
    .filter((c) => c.track !== 'beta' || showBeta)
    .map((c) => {
      const done = Object.keys(progress.completed(c.id) || {}).filter((id) => c.missions.some((m) => m.id === id)).length;
      return {
        id: c.id,
        beta: c.track === 'beta',
        faction: c.factionId || (c.id.includes('horde') ? 'orc' : 'human'),
        title: c.betaLabel ? localize(c.betaLabel, lang) : null, // null = usar i18n `campaign.select.name.<id>`
        fullTitle: localize(c.title, lang),
        subtitle: c.subtitle ? localize(c.subtitle, lang) : '',
        premise: localize(c.premise, lang),
        done,
        total: c.missions.length,
        comingSoon: !!c.comingSoon,
        playable: isCampaignPlayable(c, { unlockAll, param })
      };
    });
  return { main: cards.filter((c) => !c.beta), beta: cards.filter((c) => c.beta) };
}

/** Próximo índice de foco entre `count` cartões. Setas esquerda/cima = −1, direita/baixo = +1, Home/End; circular. */
export function nextFocusIndex(index, key, count) {
  if (count <= 0) return -1;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  if (key === 'ArrowLeft' || key === 'ArrowUp') return (index - 1 + count) % count;
  if (key === 'ArrowRight' || key === 'ArrowDown') return (index + 1) % count;
  return index;
}
