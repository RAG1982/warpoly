/**
 * musicPanelModel.js — MODELO PURO do painel "Músicas" do inspetor (sem DOM, sem Web Audio): monta a lista agrupada a partir do
 * catálogo (`src/audio/music/catalog.js`), formata textos em PT-BR, gera a seleção (JSON), a lista de reprodução ("só ouvir
 * os marcados") e o plano da transição paz → combate. O DOM fica em `musicPanel.js` e o áudio em `musicPreview.js`.
 */
import { MUSIC_CATALOG, getTrack, enabledIds, enabledForGroup, serializeSelection, loadSelection } from '../audio/music/catalog.js';
import { INTENSITY_RAMP, intensityFromGameTime } from '../audio/music/intensity.js';

export const MODE_LABELS = Object.freeze({
  major: 'maior', minor: 'menor', dorian: 'dórico', phrygian: 'frígio', mixolydian: 'mixolídio', lydian: 'lídio', harmonicMinor: 'menor harmônico'
});
const NOTE_NAMES = ['Dó', 'Dó#', 'Ré', 'Mi♭', 'Mi', 'Fá', 'Fá#', 'Sol', 'Lá♭', 'Lá', 'Si♭', 'Si']; // grafias usuais (Mi♭, Lá♭, Si♭; Dó#, Fá#)

export const FAMILY_LABELS = Object.freeze({
  title: 'Abertura', human_peace: 'Reino / paz', human_combat: 'Reino / combate', orc_peace: 'Clãs / paz', orc_combat: 'Clãs / combate'
});

/** Grupos da lista, na ordem de exibição. `pick` decide quais entradas do catálogo entram (candidatas só em "Candidatas novas"). */
export const MUSIC_GROUPS = Object.freeze([
  { id: 'title', label: 'Abertura', pick: (e) => e.category === 'title' && !e.candidate },
  { id: 'human_peace', label: 'Reino / paz', pick: (e) => e.family === 'human_peace' && !e.candidate },
  { id: 'human_combat', label: 'Reino / combate', pick: (e) => e.family === 'human_combat' && !e.candidate },
  { id: 'orc_peace', label: 'Clãs / paz', pick: (e) => e.family === 'orc_peace' && !e.candidate },
  { id: 'orc_combat', label: 'Clãs / combate', pick: (e) => e.family === 'orc_combat' && !e.candidate },
  { id: 'endings', label: 'Vitória / Derrota', pick: (e) => (e.category === 'victory' || e.category === 'defeat') && !e.candidate },
  { id: 'candidates', label: 'Candidatas novas', pick: (e) => e.candidate, sectionBy: (e) => FAMILY_LABELS[e.family] || e.family }
]);

/** "75" -> "1:15". */
export function formatTime(sec) {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Nome PT-BR da tônica ("Ré") a partir da nota MIDI. */
export function tonicName(key) {
  return Number.isFinite(key) ? NOTE_NAMES[((Math.round(key) % 12) + 12) % 12] : '';
}

/** Resumo técnico de uma entrada: "120 bpm · 4/4 · Ré menor · 0:38". */
export function metaLine(e) {
  if (e.kind === 'sfx') return `fanfarra curta · ${formatTime(e.seconds)}${e.mode ? ` · ${MODE_LABELS[e.mode] || e.mode}` : ''}`;
  return [`${e.bpm} bpm`, e.meter, `${tonicName(e.key)} ${MODE_LABELS[e.mode] || e.mode}`.trim(), formatTime(e.seconds)].join(' · ');
}

/** Descrição completa para o cartão do player. */
export function describeTrack(e) {
  if (!e) return null;
  const faction = e.faction === 'human' ? 'Reino Humano' : e.faction === 'orc' ? 'Clãs' : 'Neutra';
  const cat = { title: 'Abertura', peace: 'Paz', combat: 'Combate', victory: 'Vitória', defeat: 'Derrota' }[e.category] || e.category;
  return {
    id: e.id,
    title: e.title,
    subtitle: `${cat} · ${faction}${e.candidate ? ' · candidata nova' : ''}`,
    meta: metaLine(e),
    details: e.kind === 'sfx'
      ? ['Efeito sintetizado curto (não repete em laço).']
      : [`Andamento: ${e.bpm} bpm (semínima)`, `Compasso: ${e.meter}`, `Modo: ${tonicName(e.key)} ${MODE_LABELS[e.mode] || e.mode}`, `Volta: ${e.bars} compassos (${formatTime(e.seconds)})`, `Instrumentos: ${e.instrumentLabels.join(', ')}`],
    description: e.description
  };
}

/** Conjunto inicial de faixas marcadas: a seleção salva ou os padrões `inGame` do catálogo. */
export function initialEnabledSet(storage) {
  const saved = loadSelection(storage);
  return new Set(saved ? [...saved].filter(([, on]) => on).map(([id]) => id) : enabledIds());
}

/** Lista agrupada para a tela. `enabled`: Set de ids marcados ("No jogo"). */
export function buildMusicModel(enabled) {
  const on = enabled instanceof Set ? enabled : new Set(enabled || []);
  const groups = MUSIC_GROUPS.map((g) => {
    const entries = MUSIC_CATALOG.filter(g.pick);
    const sections = [];
    for (const e of entries) {
      const label = g.sectionBy ? g.sectionBy(e) : null;
      let sec = sections.find((s) => s.label === label);
      if (!sec) sections.push((sec = { label, items: [] }));
      sec.items.push({
        id: e.id, title: e.title, kind: e.kind, category: e.category, faction: e.faction, candidate: e.candidate,
        checked: on.has(e.id), meta: metaLine(e), description: e.description
      });
    }
    if (g.sectionBy) {
      const order = Object.values(FAMILY_LABELS);
      sections.sort((a, b) => order.indexOf(a.label) - order.indexOf(b.label));
    }
    return { id: g.id, label: g.label, total: entries.length, checked: entries.filter((e) => on.has(e.id)).length, sections };
  });
  const total = MUSIC_CATALOG.length;
  return { groups, totals: { total, enabled: MUSIC_CATALOG.filter((e) => on.has(e.id)).length } };
}

/** Marca/desmarca ids (devolve um Set NOVO). */
export function setEnabled(enabled, ids, on) {
  const next = new Set(enabled);
  for (const id of ids) {
    if (!getTrack(id)) continue;
    if (on) next.add(id);
    else next.delete(id);
  }
  return next;
}

/** Ids de música (não fanfarras) marcados, na ordem do catálogo: a lista do "Só ouvir os marcados". */
export function playlistFrom(enabled) {
  const on = enabled instanceof Set ? enabled : new Set(enabled || []);
  return MUSIC_CATALOG.filter((e) => e.kind === 'music' && on.has(e.id)).map((e) => e.id);
}

/** Próxima faixa da lista (circular). Lista vazia = `null`; id fora da lista = a primeira. */
export function nextInPlaylist(list, currentId) {
  if (!list.length) return null;
  const i = list.indexOf(currentId);
  return list[(i + 1) % list.length];
}

/** Texto da seleção para copiar: `{"version":1,"enabled":[…]}` (ordem do catálogo). */
export function selectionJson(enabled) {
  const on = enabled instanceof Set ? enabled : new Set(enabled || []);
  return serializeSelection(MUSIC_CATALOG.filter((e) => on.has(e.id)).map((e) => e.id));
}

/**
 * Plano da transição paz → combate da facção da faixa `id`: paz (a própria faixa, se for de paz; senão a primeira de paz
 * habilitada), depois combate (a primeira habilitada, com a reserva das atuais) e volta à paz. Abertura e fanfarras não têm
 * transição (`null`). Cada passo: { id, seconds }.
 */
export function transitionPlan(id, enabled, { peaceSeconds = 9, combatSeconds = 12 } = {}) {
  const e = getTrack(id);
  if (!e || e.kind !== 'music' || (e.faction !== 'human' && e.faction !== 'orc')) return null;
  const sel = enabled instanceof Set ? [...enabled] : enabled;
  const peaceId = e.category === 'peace' ? e.id : (enabledForGroup('peace', e.faction, sel)[0] || {}).id;
  const combatId = e.category === 'combat' ? e.id : (enabledForGroup('combat', e.faction, sel)[0] || {}).id;
  if (!peaceId || !combatId) return null;
  return [
    { id: peaceId, seconds: peaceSeconds, label: 'paz' },
    { id: combatId, seconds: combatSeconds, label: 'combate' },
    { id: peaceId, seconds: peaceSeconds, label: 'paz' }
  ];
}

/** Intensidade 0..1 -> minutos de partida equivalentes (inverso aproximado de `intensityFromGameTime`). */
export function minutesForIntensity(x) {
  if (!(x > 0)) return 0;
  if (x >= 1) return INTENSITY_RAMP.fullSeconds / 60;
  let lo = INTENSITY_RAMP.startSeconds;
  let hi = INTENSITY_RAMP.fullSeconds;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (intensityFromGameTime(mid) < x) lo = mid;
    else hi = mid;
  }
  return Math.round(((lo + hi) / 2 / 60) * 10) / 10;
}
