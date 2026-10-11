/**
 * techText.js (F8-05b) — textos localizados da liberação progressiva da campanha ("Novo: …"): briefing, anúncio no início
 * da missão. Sem DOM; roda em Node (testável). Os nomes saem do i18n (`unit.*`, `building.*`, `research.*`).
 */
import { t, unitName, buildingName, researchName } from '../i18n/index.js';
import { UNITS } from '../data/units.js';
import { BUILDINGS } from '../data/buildings.js';
import { RESEARCH } from '../data/upgrades.js';
import { TECH_KINDS, parseResearchToken } from '../sim/techRestriction.js';

/** Nome localizado de um item liberado (`kind`: units | buildings | research | heroes). */
export function techItemName(kind, id, factionId = 'human') {
  if (kind === 'buildings') return buildingName(id, BUILDINGS[id]);
  if (kind === 'research') {
    const { id: rid, level } = parseResearchToken(id);
    const base = researchName(rid, factionId, RESEARCH[rid]);
    return level > 1 ? `${base} (${t('campaign.unlock.level', { n: level })})` : base;
  }
  return unitName(id, UNITS[id]);
}

/** `{units:[nome…], buildings:[…], research:[…], heroes:[…]}` só com as categorias não vazias. */
export function unlockNames(unlocks, factionId = 'human') {
  const out = {};
  for (const kind of TECH_KINDS) {
    const list = (unlocks && unlocks[kind]) || [];
    if (list.length > 0) out[kind] = list.map((id) => techItemName(kind, id, factionId));
  }
  return out;
}

/** "Unidades: A, B · Construções: C · …" ou `''` se a missão não libera nada. */
export function unlockSummary(unlocks, factionId = 'human') {
  const names = unlockNames(unlocks, factionId);
  return TECH_KINDS.filter((k) => names[k]).map((k) => `${t(`campaign.unlock.${k}`)}: ${names[k].join(', ')}`).join(' · ');
}

/** "Novo: Unidades: A, B · Construções: C" (anúncio) ou `''`. */
export function unlockAnnouncement(unlocks, factionId = 'human') {
  const s = unlockSummary(unlocks, factionId);
  return s ? t('campaign.unlock.announce', { list: s }) : '';
}
