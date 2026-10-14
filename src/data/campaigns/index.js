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

import warAlliance from './war-alliance/campaign.json';
import wa01 from './war-alliance/m01-terra-a-vista.json';
import wa02 from './war-alliance/m02-pouso-do-encontro.json';
import wa03 from './war-alliance/m03-ouro-da-pedra-mae.json';
import wa04 from './war-alliance/m04-baixio-do-breu.json';
import wa05 from './war-alliance/m05-cerne-verde.json';
import wa06 from './war-alliance/m06-a-geada.json';
import wa07 from './war-alliance/m07-brejo-mudo.json';
import wa08 from './war-alliance/m08-a-fornalha.json';
import wa09 from './war-alliance/m09-miragem.json';
import wa10 from './war-alliance/m10-desembarque-costa-ferrugem.json';
import wa11 from './war-alliance/m11-porto-albor.json';
import wa12 from './war-alliance/m12-bastiao-do-cabo-ferrugem.json';

import warHorde from './war-horde/campaign.json';
import wh01 from './war-horde/m01-cinzas-vermelhas.json';
import wh02 from './war-horde/m02-velas-brancas.json';
import wh03 from './war-horde/m03-a-pedra-que-brilha.json';
import wh04 from './war-horde/m04-mare-de-breu.json';
import wh05 from './war-horde/m05-madeira-de-guerra.json';
import wh06 from './war-horde/m06-fogo-no-gelo.json';
import wh07 from './war-horde/m07-casa-no-brejo.json';
import wh08 from './war-horde/m08-o-monte-caldeira.json';
import wh09 from './war-horde/m09-o-ultimo-poco.json';
import wh10 from './war-horde/m10-cabo-aurora.json';
import wh11 from './war-horde/m11-brasa-alta.json';
import wh12 from './war-horde/m12-cidadela-de-brasa-alta.json';

import { getMission, registerMission } from '../missions/index.js';
import { assertCampaign } from '../../campaign/campaign.js';

const CAMPAIGN_MISSIONS = [
  a01, a02, a03, a04, a05, a06, a07, a08,
  wa01, wa02, wa03, wa04, wa05, wa06, wa07, wa08, wa09, wa10, wa11, wa12,
  wh01, wh02, wh03, wh04, wh05, wh06, wh07, wh08, wh09, wh10, wh11, wh12
];
const CAMPAIGNS = new Map();

for (const m of CAMPAIGN_MISSIONS) if (!getMission(m.id)) registerMission(m);
for (const c of [warAlliance, warHorde, alliance]) {
  assertCampaign(c, { hasMission: (id) => !!getMission(id) });
  CAMPAIGNS.set(c.id, c);
}

/** @returns {object|undefined} índice da campanha. */
export const getCampaign = (id) => CAMPAIGNS.get(id);

/** @returns {object[]} campanhas, em ordem estável por order. */
export const listCampaigns = () => [...CAMPAIGNS.values()].sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
