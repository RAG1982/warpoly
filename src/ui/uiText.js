/**
 * uiText.js (F6-09) — textos de UI derivados de dados do jogo, já localizados.
 *
 * Une `src/data/` (ids, defs) a `src/i18n` (nomes/descrições traduzidos) para a HUD e os menus não
 * repetirem a mesma lógica. Sem DOM; roda em Node (testável).
 */
import { t, getLanguage, unitName, buildingName, researchName, tierName, translateSimText, resourceName } from '../i18n/index.js';
import { localize } from '../sim/missions/text.js';
import { getUnitDef, getBuildingDef, BUILDINGS, RESEARCH, TIER_NAMES } from '../data/index.js';

/** 'orc' | 'human' da facção do jogador local. */
export const factionKey = (gm) => (gm && gm.playerFaction === 'orc' ? 'orc' : 'human');

/** Nome localizado de um tipo de unidade (`knight`) / construção (`barracks`). */
export const unitLabel = (type) => unitName(type, getUnitDef(type));
export const buildingLabel = (type) => buildingName(type, getBuildingDef(type));

/** M3-X1: nome da unidade no painel/tooltip — `displayName` da missão (ex.: 'Emissário') ou o nome do tipo. */
export const unitDisplayLabel = (u) => (u && u.displayName ? localize(u.displayName, getLanguage()) : unitLabel(u.type));

/** Nome localizado de uma entidade viva (unidade, construção ou nó de recurso). */
export function entityLabel(e) {
  if (!e) return '';
  if (e.isConstructed !== undefined) return buildingLabel(e.type);
  return unitDisplayLabel(e);
}

/** Texto localizado de um requisito faltante (`'barracks'`, `{hq:2}`, `{role}`, `{research}`). */
export function requirementText(req, factionId = null) {
  if (req && req.locked) return req.mission ? t('req.locked', { n: req.mission }) : t('req.lockedNever'); // F8-05b
  if (typeof req === 'string') return buildingLabel(req);
  if (req && typeof req.hq === 'number') {
    return factionId
      ? t('req.hqTier', { n: req.hq, name: tierName(factionId, req.hq) })
      : t('req.hq', { n: req.hq });
  }
  if (req && typeof req.role === 'string') return t(`req.role.${req.role}`, { fallback: req.role });
  if (req && typeof req.research === 'string') {
    return researchName(req.research, factionId || 'human') + (req.level > 1 ? ` ${req.level}` : '');
  }
  return String(req);
}

/** "Requer: A, B" já localizado, a partir da lista de requisitos faltantes. */
export function requirementsLine(missing, factionId = null) {
  const lock = missing.find((r) => r && r.locked); // F8-05b: bloqueado pela campanha — "Disponível na missão N" (sem "Requer:")
  if (lock) return requirementText(lock, factionId);
  return t('hud.requires', { list: missing.map((r) => requirementText(r, factionId)).join(', ') });
}

/** Nome de um nó de recurso do mapa (`gold` → Mina de ouro; árvores tratadas à parte). */
export function resourceNodeName(type) {
  return t(`res.node.${type}`, { fallback: type });
}

/** Nome de jogador para exibição: 'Você'/'IA n' (nomes padrão da simulação) seguem o idioma atual. */
export function playerDisplayName(name) {
  if (name === 'Você' || name === 'You') return t('player.you');
  const m = /^(?:IA|AI) (\d+)$/.exec(String(name));
  return m ? t('player.ai', { n: m[1] }) : String(name);
}

/** `mm:ss` de uma duração em segundos. */
export function formatClock(sec) {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Mensagens da simulação com parâmetros (src/sim/** emite PT-BR literal; a UI traduz na exibição)
// ---------------------------------------------------------------------------
let reqNameMap = null;
function requirementNameMap() {
  if (reqNameMap) return reqNameMap;
  reqNameMap = new Map();
  for (const [type, def] of Object.entries(BUILDINGS)) {
    reqNameMap.set(def.entityName || def.name, () => buildingLabel(type));
  }
  for (const [id, def] of Object.entries(RESEARCH)) {
    for (const f of ['human', 'orc']) if (def.name && def.name[f]) reqNameMap.set(def.name[f], () => researchName(id, f, def));
  }
  reqNameMap.set('Oficina', () => t('req.role.workshop'));
  return reqNameMap;
}

function localizeRequirementName(part) {
  const direct = requirementNameMap().get(part);
  if (direct) return direct();
  const hq = /^Centro nível (\d)(?: \((.+)\))?$/.exec(part);
  if (hq) {
    const n = Number(hq[1]);
    const faction = Object.keys(TIER_NAMES).find((f) => TIER_NAMES[f][n] === hq[2]);
    return faction ? t('req.hqTier', { n, name: tierName(faction, n) }) : t('req.hq', { n });
  }
  const lv = /^(.+) (\d)$/.exec(part);
  if (lv && requirementNameMap().get(lv[1])) return `${requirementNameMap().get(lv[1])()} ${lv[2]}`;
  return part;
}

const RES_FROM_PT = { ouro: 'gold', madeira: 'wood', pedra: 'stone' };

/**
 * Texto da simulação (PT-BR literal) → idioma atual. Cobre as mensagens fixas (`sim.*`), "Requer: A, B",
 * a recompensa do acampamento de bandidos e o aviso de onda da IA; o que não casar passa intacto.
 */
export function localizeSimText(text) {
  if (typeof text !== 'string' || !text) return text;
  const fixed = translateSimText(text);
  if (fixed !== text) return fixed;
  let m = /^((?:⚠️|❌|\s)*)Requer: (.+)$/su.exec(text);
  if (m) return `${m[1]}${t('hud.requires', { list: m[2].split(', ').map(localizeRequirementName).join(', ') })}`;
  m = /^((?:⚠️|\s)*)Disponível na missão (\d+)$/su.exec(text); // F8-05b
  if (m) return `${m[1]}${t('req.locked', { n: m[2] })}`;
  m = /^((?:⚠️|\s)*)Indisponível nesta campanha$/su.exec(text);
  if (m) return `${m[1]}${t('req.lockedNever')}`;
  m = /^Acampamento de bandidos destruído!(?: (.*))?$/su.exec(text);
  if (m) return t('sim.banditsDestroyed') + (m[1] ? ` ${localizeRewards(m[1])}` : '');
  m = /^⚔️ (?:(Os Clãs Orcs) reuniram|O Reino Humano reuniu) um esquadrão de guerra \((\d+) tropas\) e avança(?:m)? contra sua base!$/u.exec(text);
  if (m) return `⚔️ ${t(m[1] ? 'sim.aiWaveOrc' : 'sim.aiWaveHuman', { count: m[2] })}`;
  return text;
}

function localizeRewards(raw) {
  // "+10 de ouro +5 de madeira" → "+10 ouro +5 madeira" (ou o equivalente em inglês)
  return raw.replace(/\+(\d+) de (ouro|madeira|pedra)/g, (_, n, r) => `+${n} ${resourceName(RES_FROM_PT[r]).toLowerCase()}`);
}
