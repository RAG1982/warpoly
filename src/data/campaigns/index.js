/**
 * src/data/campaigns/index.js (F8-05) — registro estático das campanhas (`src/data/campaigns/<id>/campaign.json`).
 * Registra as missões de cada campanha no registro de missões F8-04 (marcadas `hidden`: não aparecem no menu "Missões").
 */
import alliance from './alliance/campaign.json';
import a01 from './alliance/m01-fumaca-no-vale.json';
import a02 from './alliance/m02-cativos-da-garganta.json';
import a03 from './alliance/m03-muralhas-de-alvorada.json';
import a04 from './alliance/m04-ponte-do-rio-turvo.json';
import a05 from './alliance/m05-ferro-e-brasa.json';
import a06 from './alliance/m06-ilhas-de-brasa.json';
import a07 from './alliance/m07-traicao-presa-negra.json';
import a08 from './alliance/m08-queda-do-cinzal.json';
import { getMission, registerMission } from '../missions/index.js';
import { assertCampaign } from '../../campaign/campaign.js';

const CAMPAIGN_MISSIONS = [a01, a02, a03, a04, a05, a06, a07, a08];
const CAMPAIGNS = new Map();

for (const m of CAMPAIGN_MISSIONS) if (!getMission(m.id)) registerMission(m);
for (const c of [alliance]) {
  assertCampaign(c, { hasMission: (id) => !!getMission(id) });
  CAMPAIGNS.set(c.id, c);
}

/** @returns {object|undefined} índice da campanha. */
export const getCampaign = (id) => CAMPAIGNS.get(id);

/** @returns {object[]} campanhas, em ordem estável. */
export const listCampaigns = () => [...CAMPAIGNS.values()];
