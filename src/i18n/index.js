/**
 * i18n (F6-09) — textos do jogo em pt-BR (idioma base/fallback) e en.
 *
 * - `t(key, params)`: busca no idioma atual → pt-BR → `params.fallback`/a própria chave. Interpola `{nome}`.
 *   Plural: se `params.count` existir e houver `key.one`/`key.other`, usa a forma certa (um = count === 1).
 * - Idioma: `localStorage['warpoly.lang']` (`pt-BR` | `en`); sem valor salvo, detecta `navigator.language`
 *   (prefixo `pt` → pt-BR, qualquer outro → en). Só grava quando o jogador escolhe (`setLanguage`).
 * - `applyI18n(root)`: preenche elementos estáticos (index.html) via `data-i18n`, `data-i18n-html`,
 *   `data-i18n-title`, `data-i18n-alt`, `data-i18n-aria`.
 * - Auxiliares de dados (`unitName`, `buildingName`, `abilityName`, `researchName`, `describeLevel`…): os
 *   defs em `src/data/` mantêm o nome pt-BR (a simulação/headless não depende de i18n); a UI sempre passa por aqui.
 * - `translateSimText(texto)`: mensagens PT-BR emitidas pela simulação (`src/sim/**`) viram a chave `sim.*`
 *   correspondente por busca reversa (ver `tests/unit/i18n.test.js`). Texto desconhecido passa intacto.
 *
 * Módulo sem three.js/DOM obrigatório: roda em Node (Vitest).
 */
import ptBR from './pt-BR.json';
import en from './en.json';

export const LANGUAGES = Object.freeze([
  { id: 'pt-BR', label: 'Português (Brasil)' },
  { id: 'en', label: 'English' }
]);
export const DEFAULT_LANGUAGE = 'pt-BR';
export const LANG_STORAGE_KEY = 'warpoly.lang';
const DICTS = { 'pt-BR': ptBR, en };

/** Idioma suportado mais próximo de um código de navegador (`pt`, `pt-PT` → pt-BR; resto → en). */
export function detectLanguage(navLang) {
  const l = String(navLang || '').toLowerCase();
  if (!l) return DEFAULT_LANGUAGE;
  return l.startsWith('pt') ? 'pt-BR' : 'en';
}

function safeStorage() {
  try { return typeof window !== 'undefined' ? window.localStorage : null; } catch { return null; }
}
function navLanguage() {
  try { return typeof navigator !== 'undefined' ? navigator.language : ''; } catch { return ''; }
}

/** Fábrica (testável com dicionários/storage falsos). A instância padrão é exportada abaixo. */
export function createI18n({ dicts = DICTS, storage = safeStorage(), navLang = navLanguage() } = {}) {
  const listeners = new Set();
  let lang = DEFAULT_LANGUAGE;

  const read = () => { try { return storage ? storage.getItem(LANG_STORAGE_KEY) : null; } catch { return null; } };
  const saved = read();
  lang = saved && dicts[saved] ? saved : detectLanguage(navLang);

  function lookup(key, l) {
    const d = dicts[l];
    return d && Object.prototype.hasOwnProperty.call(d, key) ? d[key] : undefined;
  }
  function interpolate(str, params) {
    if (!params) return str;
    return str.replace(/\{(\w+)\}/g, (m, k) => (params[k] === undefined || params[k] === null ? m : String(params[k])));
  }

  function t(key, params) {
    let k = key;
    if (params && typeof params.count === 'number') {
      const form = params.count === 1 ? 'one' : 'other';
      if (lookup(`${key}.${form}`, lang) !== undefined || lookup(`${key}.${form}`, DEFAULT_LANGUAGE) !== undefined) k = `${key}.${form}`;
    }
    let s = lookup(k, lang);
    if (s === undefined) s = lookup(k, DEFAULT_LANGUAGE);
    if (s === undefined) s = params && params.fallback !== undefined && params.fallback !== null ? params.fallback : key;
    return interpolate(s, params);
  }

  /** Existe a chave (no idioma atual ou no fallback)? */
  function has(key) {
    return lookup(key, lang) !== undefined || lookup(key, DEFAULT_LANGUAGE) !== undefined;
  }

  const api = {
    t,
    has,
    getLanguage: () => lang,
    setLanguage(next, { persist = true } = {}) {
      if (!dicts[next] || next === lang) return lang;
      lang = next;
      if (persist) { try { storage?.setItem(LANG_STORAGE_KEY, next); } catch { /* storage bloqueado */ } }
      if (typeof document !== 'undefined') document.documentElement.lang = next === 'en' ? 'en' : 'pt-BR';
      for (const cb of [...listeners]) { try { cb(next); } catch (e) { console.error('[i18n]', e); } }
      return lang;
    },
    onLanguageChange(cb) { listeners.add(cb); return () => listeners.delete(cb); },
    dicts
  };
  return api;
}

const instance = createI18n();
export const t = instance.t;
export const has = instance.has;
export const getLanguage = instance.getLanguage;
export const setLanguage = instance.setLanguage;
export const onLanguageChange = instance.onLanguageChange;
export const dicts = DICTS;

/** Aplica os atributos `data-i18n*` num trecho do DOM (padrão: documento inteiro). */
export function applyI18n(root = typeof document !== 'undefined' ? document : null) {
  if (!root || !root.querySelectorAll) return;
  const each = (attr, fn) => root.querySelectorAll(`[${attr}]`).forEach((el) => fn(el, el.getAttribute(attr)));
  each('data-i18n', (el, k) => { el.textContent = t(k); });
  each('data-i18n-html', (el, k) => { el.innerHTML = t(k); });
  each('data-i18n-title', (el, k) => { el.title = t(k); });
  each('data-i18n-alt', (el, k) => { el.alt = t(k); });
  each('data-i18n-aria', (el, k) => { el.setAttribute('aria-label', t(k)); });
}

// ---------------------------------------------------------------------------
// Auxiliares de dados do jogo (nomes/descrições vivem nos JSON; o def fornece o fallback pt-BR).
// ---------------------------------------------------------------------------
/** Locale BCP-47 para `toLocaleString` etc. */
export const getLocale = () => (getLanguage() === 'en' ? 'en-US' : 'pt-BR');
export const resourceName = (type) => (type ? t(`res.${type}`, { fallback: type }) : '');
export const factionName = (id) => t(`faction.${id}.name`, { fallback: id });
export const tierName = (factionId, tier) => t(`tier.${factionId}.${tier}`, { tier, fallback: t('tier.generic', { tier }) });
export const unitName = (type, def) => t(`unit.${type}.name`, { fallback: def?.entityName || def?.name || type });
export const unitDesc = (type, def) => t(`unit.${type}.desc`, { fallback: def?.description || '' });
export const buildingName = (type, def) => {
  const faction = def?.faction;
  if (faction && has(`building.${type}.name_${faction}`)) {
    return t(`building.${type}.name_${faction}`);
  }
  return t(`building.${type}.name`, { fallback: def?.entityName || def?.name || type });
};
export const buildingDesc = (type, def) => t(`building.${type}.desc`, { fallback: def?.description || '' });
export const critterName = (species) => t(`critter.${species}`, { fallback: species === 'boar' ? 'Javali' : (species === 'sheep' ? 'Ovelha' : species) });
export const abilityName = (id, def) => t(`ability.${id}.name`, { fallback: def?.name || id });
export const abilityDesc = (id, def) => t(`ability.${id}.desc`, { fallback: def?.description || '' });
export const researchName = (id, faction, def) => t(`research.${id}.${faction === 'orc' ? 'orc' : 'human'}`, {
  fallback: def ? (def.name?.[faction] || def.name?.human || def.name?.orc || id) : id
});
export const mapName = (id, fallback) => t(`map.${id}.name`, { fallback: fallback || id });

/** Texto curto do efeito de um nível de pesquisa (dados vêm de `RESEARCH`; só o texto é traduzido). */
export function describeLevelText(levelDef) {
  if (!levelDef) return '';
  const parts = [];
  const b = levelDef.bonus || {};
  if (b.basic) parts.push(t('research.fx.basic', { n: b.basic }));
  if (b.piercing) parts.push(t('research.fx.piercing', { n: b.piercing }));
  if (b.armor) parts.push(t('research.fx.armor', { n: b.armor }));
  if (b.range) parts.push(t('research.fx.range', { n: b.range }));
  if (b.sight) parts.push(t('research.fx.sight', { n: b.sight }));
  const e = levelDef.effect || {};
  if (e.woodMultiplier) parts.push(t('research.fx.wood', { n: Math.round((e.woodMultiplier - 1) * 100) }));
  if (e.regen) parts.push(t('research.fx.regen', { n: e.regen }));
  if (e.promote) parts.push(t('research.fx.promote'));
  if (e.unlock) parts.push(t('research.fx.unlock'));
  return parts.join(', ');
}

// ---------------------------------------------------------------------------
// Mensagens da simulação (PT-BR literal em src/sim/**) → chaves `sim.*`
// ---------------------------------------------------------------------------
const simReverse = new Map();
for (const [k, v] of Object.entries(ptBR)) if (k.startsWith('sim.')) simReverse.set(v, k);

/** Remove emojis/⚠️ do começo para casar com a chave; devolve o prefixo para reaplicar. */
export function translateSimText(text) {
  if (typeof text !== 'string' || !text) return text;
  const m = text.match(/^((?:\u26A0\uFE0F?|\u274C\uFE0F?|\s)*)(.*)$/su);
  const prefix = m ? m[1] : '';
  const body = m ? m[2] : text;
  const key = simReverse.get(body) || simReverse.get(text);
  if (!key) return text;
  return (simReverse.get(text) ? '' : prefix) + t(key);
}
