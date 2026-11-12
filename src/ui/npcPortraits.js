/**
 * npcPortraits.js (M3-14) — retrato de NPC nos diálogos/briefings: troca o emoji por `public/ui/portraits/npc_<id>.webp`
 * (render_npc_portraits.py) ou, para os heróis, pelo retrato de unidade já existente (`hero_<id>_idle.webp`).
 *
 * O NPC é resolvido pelo NOME do falante (pt-BR ou en) ou pelo campo opcional `portraitId` do diálogo. Falante sem
 * retrato, manifesto ainda não carregado ou arquivo ausente => cai no emoji (`portrait`), como antes.
 * Parte pura (sem DOM), testada em `tests/unit/npcPortraits.test.js`.
 */
import { getManifest } from './uiSprites.js';

const BASE = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL) || '/';

/** id do retrato -> palavras-chave do nome (normalizado: minúsculo, sem acento). `start` = o nome deve COMEÇAR com a palavra. */
export const NPC_SPEAKERS = Object.freeze({
  sevelin: { words: ['sevelin'] },
  orsolo: { words: ['orsolo'] },
  lyra: { words: ['lyra'] },
  mervane: { words: ['mervane'] },
  tomas_rocha: { words: ['tomas rocha'] },
  elara: { words: ['elara'] },
  brumar: { words: ['brumar'], start: true },
  isolda: { words: ['isolda'] },
  aurora: { words: ['aurora'] },
  brakka: { words: ['brakka'] },
  grok: { words: ['grok'] },
  orvanna: { words: ['orvanna'] },
  // M4-13: campanha da Horda
  ulma: { words: ['ulma'] },
  hurgan: { words: ['hurgan'] },
  narga: { words: ['narga'] },
  rurga: { words: ['rurga'] },
  zarruk: { words: ['zarruk'] }
});

/** Heróis: falante -> retrato de unidade existente. */
export const HERO_SPEAKERS = Object.freeze({
  hero_brann: ['brann'], hero_dorian: ['dorian'], hero_oren: ['oren'],
  hero_drogath: ['drogath'], hero_vozgul: ['vozgul'], hero_skarn: ['skarn']
});

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

function speakerStrings(speaker) {
  if (!speaker) return [];
  if (typeof speaker === 'string') return [norm(speaker)];
  return Object.values(speaker).filter((v) => typeof v === 'string').map(norm);
}

/** id de retrato (`sevelin`, `hero_brann`…) do falante, ou null. */
export function npcPortraitIdForSpeaker(speaker) {
  for (const s of speakerStrings(speaker)) {
    for (const [id, def] of Object.entries(NPC_SPEAKERS)) {
      if (def.words.some((w) => (def.start ? s.startsWith(w) : s.includes(w)))) return id;
    }
    for (const [id, words] of Object.entries(HERO_SPEAKERS)) {
      if (words.some((w) => new RegExp(`(^|[^a-z])${w}([^a-z]|$)`).test(s))) return id;
    }
  }
  return null;
}

/** URL do retrato do diálogo/briefing `d` ({speaker, portraitId?}) se o manifesto lista o arquivo; senão null. */
export function npcPortraitUrl(d, m = getManifest(), base = BASE) {
  if (!m || !d) return null;
  const id = d.portraitId || npcPortraitIdForSpeaker(d.speaker);
  if (!id) return null;
  if (id.startsWith('hero_')) return m.portraitIds && m.portraitIds.has(id) ? `${base}ui/portraits/${id}_idle.webp` : null;
  return m.npcPortraitIds && m.npcPortraitIds.has(id) ? `${base}ui/portraits/npc_${id}.webp` : null;
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Conteúdo interno de `.ms-portrait`: <img> com retrato (cai no emoji se o arquivo falhar) ou o próprio emoji. */
export function portraitInnerHtml(d, defaultEmoji, m = getManifest(), base = BASE) {
  const emoji = (d && d.portrait) || defaultEmoji;
  const url = npcPortraitUrl(d, m, base);
  if (!url) return esc(emoji);
  return `<img class="ms-portrait-img" src="${esc(url)}" alt="" draggable="false" data-ui-sprite="npc" data-fb-emoji="${esc(emoji)}">`;
}
