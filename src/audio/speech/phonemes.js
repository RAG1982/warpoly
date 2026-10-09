/**
 * phonemes.js (F7-08) — tabela de fonemas do PT-BR e parser da notação fonética das falas (PURO, sem Web Audio).
 *
 * Notação (ASCII, estilo SAMPA simplificado). Palavras separadas por espaço; dentro da palavra os fonemas vão colados;
 * `-` é só separador de sílaba para leitura (ignorado); `'` antes da vogal marca a sílaba tônica; `, . ! ?` no fim da
 * palavra marcam pausa e entonação.
 *
 *   Vogais orais   a e E i o O u   (E = é aberto, O = ó aberto)
 *   Átonas finais  @ (a → ɐ)  I (e → i)  U (o → u)
 *   Nasais         a~ e~ i~ o~ u~
 *   Semivogais     j w
 *   Plosivas       p b t d k g
 *   Fricativas     f v s z S (ch) Z (j) h (r final/aspirado)  R (rr/r inicial)
 *   Africadas      tS (ti) dZ (di)    — marca do PT-BR neutro
 *   Nasais cons.   m n J (nh)        Líquidas  l L (lh) r (tap)
 *
 * Exemplo: "Sim, senhor!" = `s'i~, se~J'oh!`
 */

/** Símbolos reconhecidos, do mais longo para o mais curto (casamento guloso). */
export const SYMBOLS = Object.freeze([
  'tS', 'dZ', 'a~', 'e~', 'i~', 'o~', 'u~',
  'a', 'e', 'E', 'i', 'o', 'O', 'u', '@', 'I', 'U', 'j', 'w',
  'p', 'b', 't', 'd', 'k', 'g', 'f', 'v', 's', 'z', 'S', 'Z', 'm', 'n', 'J', 'l', 'L', 'r', 'R', 'h'
]);

/** Vogais: formantes F1/F2/F3 (Hz, voz masculina adulta) e duração base (ms). */
export const VOWELS = Object.freeze({
  a: { f: [740, 1250, 2500], d: 105 },
  e: { f: [440, 1950, 2600], d: 100 },
  E: { f: [580, 1750, 2500], d: 105 },
  i: { f: [290, 2250, 3000], d: 92 },
  o: { f: [440, 880, 2450], d: 100 },
  O: { f: [590, 1000, 2450], d: 105 },
  u: { f: [310, 820, 2300], d: 92 },
  '@': { f: [620, 1250, 2500], d: 78 },
  I: { f: [340, 2150, 2900], d: 70 },
  U: { f: [360, 900, 2350], d: 70 }
});

/** Pontos de articulação das plosivas/nasais: locus dos formantes (transições) e espectro do estouro. */
export const PLACES = Object.freeze({
  lab: { f: [200, 900, 2200], burst: { c: 1000, bw: 1900, amp: 1.15 } },
  alv: { f: [220, 1700, 2700], burst: { c: 4300, bw: 3000, amp: 2.0 } },
  vel: { f: [240, 1600, 2300], burst: { c: 2100, bw: 1500, amp: 1.8 } }
});

const PLOSIVES = Object.freeze({
  p: { place: 'lab', voiced: false }, b: { place: 'lab', voiced: true },
  t: { place: 'alv', voiced: false }, d: { place: 'alv', voiced: true },
  k: { place: 'vel', voiced: false }, g: { place: 'vel', voiced: true }
});

export const isVowelSym = (s) => !!VOWELS[s[0]] && (s.length === 1 || s[1] === '~');
export const isNasalVowel = (s) => s.length === 2 && s[1] === '~';
export const plosiveOf = (s) => PLOSIVES[s] || null;

/**
 * @param {string} str  notação fonética (ver cabeçalho)
 * @returns {Array<{k:'ph', s:string, stress:boolean} | {k:'gap'} | {k:'punct', m:string}>}
 * @throws {Error} símbolo desconhecido
 */
export function parsePhonemes(str) {
  const out = [];
  const words = String(str).trim().split(/\s+/).filter(Boolean);
  words.forEach((w, wi) => {
    let i = 0;
    let stress = false;
    while (i < w.length) {
      const c = w[i];
      if (c === "'") { stress = true; i++; continue; }
      if (c === '-') { i++; continue; }
      if (c === ',' || c === '.' || c === '!' || c === '?') { out.push({ k: 'punct', m: c }); i++; continue; }
      const sym = SYMBOLS.find((s) => w.startsWith(s, i));
      if (!sym) throw new Error(`fonema desconhecido '${c}' em "${str}"`);
      out.push({ k: 'ph', s: sym, stress });
      stress = false;
      i += sym.length;
    }
    if (wi < words.length - 1) out.push({ k: 'gap' });
  });
  return out;
}
