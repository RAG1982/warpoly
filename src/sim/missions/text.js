/**
 * text.js — F8-04: textos localizáveis das missões. Um texto é `string` (vale para todos os idiomas) ou
 * `{ "pt-BR": "...", "en": "..." }`; `pt-BR` é o idioma base/fallback. Puro (sem DOM/i18n global): o idioma é parâmetro.
 */
export function localize(text, lang = 'pt-BR') {
  if (text === undefined || text === null) return '';
  if (typeof text === 'string') return text;
  return text[lang] || text['pt-BR'] || Object.values(text)[0] || '';
}
