/**
 * campaignVictoryModel.js — modelo PURO da tela final de campanha (sem DOM/three.js; testável em Node).
 * Monta { facção, título, parágrafos, botões, estatísticas } a partir da campanha, do plano `campaignEndPlan` e do progresso.
 * Sem `epilogue` na campanha, cai no texto genérico (`campaign.end.complete`) com a facção da campanha.
 */
import { localize } from '../sim/missions/text.js';

export const VICTORY_FACTIONS = Object.freeze(['human', 'orc']);

/** URL do slot de arte final (Blender): se o arquivo existir, a tela usa a imagem em vez do SVG procedural. */
export const victoryArtUrl = (faction, base = '/') => `${base}ui/art/victory_${faction}.webp`;

const fmtClock = (sec) => {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${m}:${r}`;
};

/** A tela especial vale quando a campanha acabou de ser concluída (vitória na última missão, sem próxima). */
export const isCampaignFinale = (plan) => !!(plan && plan.inCampaign && plan.outcome === 'victory' && plan.campaignComplete && !plan.hasNext);

/**
 * @param {object} o
 * @param {object} o.def  campanha (campaign.json)
 * @param {object} o.plan  campaignEndPlan
 * @param {Record<string,{seconds?:number}>} [o.completed]  progresso da tentativa atual
 * @param {string} [o.lang]
 * @returns {{ faction:string, generic:boolean, titleKey:string, epilogueTitle:string, paragraphs:string[], credits:string,
 *   actions:Array<{id:string,labelKey:string,primary:boolean}>, stats:null|{missions:number,total:number,time:string|null} }}
 */
export function buildCampaignVictoryModel({ def, plan, completed = null, lang = 'pt-BR' }) {
  const ep = (plan && plan.epilogue) || (def && def.epilogue) || null;
  const faction = VICTORY_FACTIONS.includes(ep && ep.faction) ? ep.faction : VICTORY_FACTIONS.includes(def && def.factionId) ? def.factionId : 'human';
  let stats = null;
  if (def && completed) {
    const done = def.missions.filter((m) => completed[m.id]);
    const secs = done.reduce((a, m) => a + (Number(completed[m.id].seconds) || 0), 0);
    if (done.length > 0) stats = { missions: done.length, total: def.missions.length, time: secs > 0 ? fmtClock(secs) : null };
  }
  return {
    faction,
    generic: !ep,
    titleKey: 'campaign.victory.title',
    epilogueTitle: ep ? localize(ep.title, lang) : '',
    paragraphs: ep ? ep.paragraphs.map((p) => localize(p, lang)) : [],
    credits: ep && ep.credits ? localize(ep.credits, lang) : '',
    actions: [
      { id: 'menu', labelKey: 'mission.menu', primary: true },
      { id: 'replay', labelKey: 'campaign.victory.replay', primary: false },
      { id: 'stats', labelKey: 'mission.stats', primary: false }
    ],
    stats
  };
}
