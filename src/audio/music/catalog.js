/**
 * catalog.js — CATÁLOGO ÚNICO das faixas de música do WarPoly (fonte única para o jogo e para o player do inspetor).
 * PURO (sem Web Audio, sem DOM): metadados + regras de seleção. As partituras ficam em `musicScores.js` (`TRACKS_BY_ID`); o
 * catálogo deriva bpm, compasso, modo, instrumentos e duração delas, então não há números duplicados para sair de sincronia.
 *
 * Entrada: { id, title, category:'title'|'peace'|'combat'|'victory'|'defeat', faction:'human'|'orc'|'neutral', bpm, meter,
 *   mode, description, inGame, candidate, kind:'music'|'sfx', family, variant, bars, seconds, instruments, sfx? }
 *  - `inGame`    a faixa entra no sorteio do jogo (padrão do repositório; o dono pode mudar no inspetor)
 *  - `candidate` faixa NOVA em avaliação (nasce `inGame: false`)
 *  - `kind:'sfx'` fanfarras curtas (vitória/derrota) que vivem em `sfxRecipes.js` (`sfx` = nome da receita)
 *
 * SELEÇÃO: o inspetor grava a escolha em `localStorage['warpoly.music.selection']` como `{"version":1,"enabled":[ids]}` (lista
 * EXATA das faixas habilitadas) e o jogo a honra na mesma máquina. Sem seleção salva vale `inGame`. Se uma categoria (família)
 * ficar sem faixas habilitadas, o jogo usa as ATUAIS (não candidatas) como reserva.
 */
import { TRACKS_BY_ID } from './musicScores.js';

export const MUSIC_SELECTION_KEY = 'warpoly.music.selection';

export const MUSIC_CATEGORIES = Object.freeze(['title', 'peace', 'combat', 'victory', 'defeat']);
export const MUSIC_FACTIONS = Object.freeze(['human', 'orc', 'neutral']);

/** Nomes (PT-BR) dos instrumentos sintetizados, para as descrições. */
export const INSTRUMENT_LABELS = Object.freeze({
  pluck: 'alaúde', pad: 'colchão de cordas', drone: 'bordão grave', flute: 'flauta de osso', brass: 'metais', horn: 'trompa',
  bass: 'contrabaixo', strings: 'cordas', kick: 'bumbo', tom: 'tom', snare: 'caixa', hat: 'chimbal', shaker: 'chocalho',
  trumpet: 'trompete', fife: 'pífaro', warhorn: 'trompa de guerra', taiko: 'taiko', cymbal: 'prato', harpsichord: 'cravo',
  violin: 'violinos', cello: 'violoncelos', trombone: 'trombones', choir: 'coro grave', organ: 'órgão', timpani: 'tímpanos',
  gong: 'gongo', bell: 'sino'
});

// ------------------------------------------------------------------------------------------------ dados
/** Informação editorial por faixa: título, descrição e flags. `inGame`/`candidate` ausentes: clássicas de paz entram, o resto não. */
const INFO = {
  human_peace_0: { title: 'Alvorada na Muralha', description: 'Marcha leve ao amanhecer: alaúde em arpejos, pífaro heroico e trompas sustentadas.', inGame: true },
  human_peace_1: { title: 'Estandarte ao Vento', description: 'Marcha dórica mais séria, com o pífaro sobre arpejos de alaúde.', inGame: true },
  human_peace_2: { title: 'Passo da Guarda Real', description: 'Marcha firme e luminosa em maior, com caixa suave e bumbo marcando a guarda.', inGame: true },
  human_combat_0: { title: 'Clarim de Guerra', description: 'Fanfarra urgente: metais em quintas e oitavas, rufar de caixa nas viradas e trompete (atual, em reavaliação).', inGame: false },
  human_combat_1: { title: 'Carga da Guarda', description: 'Marcha de ataque em maior, com síncopes de metais e trompete (atual, em reavaliação).', inGame: false },
  human_combat_2: { title: 'Aço e Estandarte', description: 'Ataque mais rápido, em dórico, com baixo em colcheias e rufar (atual, em reavaliação).', inGame: false },
  orc_peace_0: { title: 'Brasas nas Montanhas', description: 'Brasa lenta: bordão grave, taiko esparso, trompa de guerra e flauta de osso em frígio.', inGame: true },
  orc_peace_1: { title: 'Tambores Distantes', description: 'Pulsação de taiko com síncopes e flauta de osso sobre um bordão ameaçador.', inGame: true },
  orc_peace_2: { title: 'Noite do Clã', description: 'Frígio grave: baixo sustentado, caixa abafada e trompas longas.', inGame: true },
  orc_combat_0: { title: 'Trovão de Guerra', description: 'Taiko pesado em galope, metais em trítono e cordas ameaçadoras (atual, em reavaliação).', inGame: false },
  orc_combat_1: { title: 'Galope do Clã', description: 'Guerra em frígio com baixo em colcheias e trompa de guerra (atual, em reavaliação).', inGame: false },
  orc_combat_2: { title: 'Ruína e Cinza', description: 'A mais rápida: taiko em semicolcheias, metais dissonantes e rufar (atual, em reavaliação).', inGame: false },
  human_peace_3: { title: 'Corte de Cristal', candidate: true, description: 'Barroco em ré maior: cravo em arpejos, violinos em sequências elegantes e violoncelo firme. Aristocrático e sereno.' },
  human_peace_4: { title: 'Fanfarra do Rei', candidate: true, description: 'Dó maior em ritmo pontuado: trompetes majestosos sobre cordas e baixo real, com trompa ao fundo. Ordem e dever.' },
  human_peace_5: { title: 'Jardins do Castelo', candidate: true, description: 'Minueto em 3/4 (sol maior): cravo valsando, violino cantante e flauta. Calma da corte.' },
  human_peace_6: { title: 'Cavaleiros ao Amanhecer', candidate: true, description: 'Marcha pastoral em 6/8 (fá maior): chamados de trompa, alaúde e caixa leve.' },
  human_peace_7: { title: 'Juramento da Guarda', candidate: true, description: 'Solene, em mi bemol maior a 84 bpm: coral de órgão, melodia de violoncelo e trompa distante.' },
  human_combat_3: { title: 'Marcha de Ataque Pesada', candidate: true, description: 'Ré menor, tímpanos e caixa, trombones pesados em ostinato e trompetes dobrando na segunda metade. Ataque em bloco.' },
  human_combat_4: { title: 'Perseguição em 6/8', candidate: true, description: 'Lá menor em 6/8: violinos em galope de colcheias, trompete a toda e rufar nas viradas. Rápida e urgente.' },
  human_combat_5: { title: 'Cerco Lento', candidate: true, description: 'Si menor a 72 bpm: ostinato grave de violoncelos, tímpanos fúnebres, sinos e lamento de trompete. Ameaça que cresce devagar.' },
  human_combat_6: { title: 'Carga da Cavalaria', candidate: true, description: 'Sol mixolídio a 144 bpm: galope de tímpanos (longa-curta-curta), chamado repetido de trompetes e metais em quintas.' },
  human_combat_7: { title: 'Defesa Desesperada', candidate: true, description: 'Mi menor harmônico: tremolo de cordas, sinos dobrando e gritos de trompete que sobem. Termina na dominante e volta ao início.' },
  human_combat_8: { title: 'Confronto Sombrio', candidate: true, description: 'Sol menor harmônico a 80 bpm: coro grave, órgão, violoncelos e tímpanos lentos; violinos agudos entram na segunda metade.' },
  orc_peace_3: { title: 'Fogueira dos Clãs', candidate: true, description: '5/4 em mi frígio: flauta de osso, taiko de batimento irregular, bordão e coro grave ao redor da fogueira.' },
  orc_peace_4: { title: 'Marcha das Trompas', candidate: true, description: '7/8 (2+2+3) em lá frígio: chamados de trompa sobre taiko e baixo coxos. Marcha implacável.' },
  orc_peace_5: { title: 'Canto da Planície', candidate: true, description: 'Ré menor a 84 bpm: coro grave amplo, violoncelo, flauta ecoando e batida lenta. Espaçosa.' },
  orc_peace_6: { title: 'Forja do Clã', candidate: true, description: 'Lá frígio: riff de trombones em ritmo de martelo, sinos de bigorna e taiko. Trabalho pesado.' },
  orc_peace_7: { title: 'Pedra e Fumaça', candidate: true, description: '6/8 lento em sol menor harmônico: balanço de flauta, trompa de guerra e gongo.' },
  orc_combat_3: { title: 'Invasão Implacável', candidate: true, description: 'Mi frígio a 112 bpm: riff de trombones em tríades pesadas, taiko em marcha, trompa de guerra e coro na segunda metade.' },
  orc_combat_4: { title: 'Perseguição Selvagem', candidate: true, description: '6/8 em ré frígio a 132 bpm: galope de colcheias nos trombones e taiko de dois tempos.' },
  orc_combat_5: { title: 'Cerco da Horda', candidate: true, description: 'Dó frígio a 66 bpm: trombones longos que sobem, taiko fúnebre, gongos e coro grave. Lento e ameaçador.' },
  orc_combat_6: { title: 'Carga dos Lobos', candidate: true, description: '7/8 (2+2+3) em si frígio a 150 bpm: galope de sete colcheias nos trombones, taiko sem trégua.' },
  orc_combat_7: { title: 'Defesa do Clã', candidate: true, description: '5/4 em fá menor harmônico: riffs sincopados, sinos dobrando e coro; a dominante fecha cada volta.' },
  orc_combat_8: { title: 'Coro da Escuridão', candidate: true, description: 'Dó sustenido menor a 90 bpm: coro grave num canto repetido, órgão, violoncelos e tímpanos lentos. Confronto sombrio.' },
  title_0: { title: 'Marcha da Tempestade', description: 'TEMA DE ABERTURA do jogo. Caixas e tambores marchando, metais graves da Horda, suspense quase silencioso, cordas trágicas dos humanos, explosões com tímpanos e final em acorde suspenso (laço suave no menu).', inGame: true },
  title_1: { title: 'Réquiem das Muralhas', description: 'Abertura alternativa, mais lenta e trágica: lamento de violinos e violoncelos, resposta de trombones e coro, clímax e despedida em acorde suspenso.', candidate: true },
  title_2: { title: 'Chamado dos Tambores', description: 'Abertura alternativa da Horda em 5/4: taiko irregular, trombones em frígio, canto do clã com flauta de osso e final de força total.', candidate: true }
};

/** Fanfarras curtas (sfx): `sfx` é o nome em `sfxRecipes.js`. */
const SFX_INFO = [
  { id: 'victory_human', title: 'Fanfarra de Vitória (Reino)', category: 'victory', faction: 'human', sfx: 'victoryFanfareHuman', mode: 'major', description: 'Arpejo ascendente de metais e acorde final de dó maior (tela final da campanha).', inGame: true },
  { id: 'victory_orc', title: 'Fanfarra de Vitória (Horda)', category: 'victory', faction: 'orc', sfx: 'victoryFanfareOrc', mode: 'minor', description: 'Metais graves em lá menor que terminam numa quinta vazia, com golpe de tambor.', inGame: true },
  { id: 'defeat_human', title: 'Derrota (Reino)', category: 'defeat', faction: 'human', sfx: 'defeatHuman', mode: 'minor', seconds: 3, description: 'Trompete que desce (mi–ré–dó–si) e se apaga num acorde de lá menor.', inGame: true, candidate: false },
  { id: 'defeat_orc', title: 'Derrota (Horda)', category: 'defeat', faction: 'orc', sfx: 'defeatOrc', mode: 'phrygian', seconds: 3, description: 'Metais graves em trítono descendente, bordão que desaba de altura e um último golpe de tambor.', inGame: true, candidate: false }
];

// ------------------------------------------------------------------------------------------------ montagem
/** Padrão de `inGame`: candidatas nascem desligadas; as atuais de combate também (o dono não gostou); o resto liga. */
const defaultInGame = (info, category) => (info.inGame !== undefined ? !!info.inGame : !info.candidate && category !== 'combat');

function musicEntry(id, info) {
  const t = TRACKS_BY_ID[id];
  if (!t) throw new Error(`catálogo: faixa sem partitura: ${id}`);
  const insts = [...new Set(t.layers.map((l) => l.inst))];
  const category = t.state;
  const candidate = !!info.candidate;
  return Object.freeze({
    id, title: info.title, category, faction: t.faction, family: t.family, variant: t.variant, kind: 'music',
    bpm: t.bpm, meter: t.meter, mode: t.mode, bars: t.bars,
    seconds: Math.round((t.bars * t.stepsPerBar * 60) / (t.bpm * 4)),
    instruments: Object.freeze(insts), instrumentLabels: Object.freeze(insts.map((i) => INSTRUMENT_LABELS[i] || i)),
    description: info.description,
    inGame: defaultInGame(info, category),
    candidate
  });
}

function sfxEntry(s) {
  return Object.freeze({
    id: s.id, title: s.title, category: s.category, faction: s.faction, family: s.id, variant: 0, kind: 'sfx', sfx: s.sfx,
    bpm: s.bpm ?? null, meter: s.meter ?? null, mode: s.mode ?? null, bars: 0, seconds: s.seconds ?? 2,
    instruments: Object.freeze(['sintetizador']), instrumentLabels: Object.freeze(['metais sintetizados']),
    description: s.description, inGame: s.inGame !== false, candidate: !!s.candidate
  });
}

/** Ordem: por score (família e variação), depois as fanfarras. */
export const MUSIC_CATALOG = Object.freeze([
  ...Object.keys(TRACKS_BY_ID).map((id) => musicEntry(id, INFO[id] || missing(id))),
  ...SFX_INFO.map(sfxEntry)
]);

function missing(id) {
  throw new Error(`catálogo: faixa sem entrada em INFO: ${id}`);
}

const BY_ID = new Map(MUSIC_CATALOG.map((e) => [e.id, e]));

// ------------------------------------------------------------------------------------------------ consulta
/** Entrada do catálogo (ou `undefined`). */
export function getTrack(id) {
  return BY_ID.get(id);
}

/** Entradas do catálogo (opcional: filtro `{category, faction, family, candidate, kind}`). */
export function listTracks(filter = {}) {
  return MUSIC_CATALOG.filter((e) => Object.entries(filter).every(([k, v]) => e[k] === v));
}

// ------------------------------------------------------------------------------------------------ seleção
/**
 * Normaliza uma seleção salva/colada: `null` (valem os padrões `inGame`) ou um Map id -> habilitada (cobre o catálogo todo).
 * Aceita: texto JSON; `{enabled:[ids]}` (lista exata); array de ids (lista exata); Set de ids; mapa parcial `{id: bool}`
 * (o que não aparece segue `inGame`). Entrada inválida = `null`.
 */
export function normalizeSelection(raw) {
  if (raw === null || raw === undefined) return null;
  let v = raw;
  if (typeof v === 'string') {
    try { v = JSON.parse(v); } catch { return null; }
  }
  if (v instanceof Map) return new Map(MUSIC_CATALOG.map((e) => [e.id, v.has(e.id) ? !!v.get(e.id) : e.inGame]));
  let exact = null;
  if (v instanceof Set) exact = [...v];
  else if (Array.isArray(v)) exact = v;
  else if (v && typeof v === 'object' && Array.isArray(v.enabled)) exact = v.enabled;
  if (exact) {
    const set = new Set(exact.filter((x) => typeof x === 'string'));
    return new Map(MUSIC_CATALOG.map((e) => [e.id, set.has(e.id)]));
  }
  if (v && typeof v === 'object') {
    return new Map(MUSIC_CATALOG.map((e) => [e.id, typeof v[e.id] === 'boolean' ? v[e.id] : e.inGame]));
  }
  return null;
}

/** A faixa `id` toca no jogo? `selectionOverride`: ver `normalizeSelection` (ausente = padrões do catálogo). */
export function isTrackEnabled(id, selectionOverride) {
  const e = BY_ID.get(id);
  if (!e) return false;
  const sel = normalizeSelection(selectionOverride);
  return sel ? sel.get(id) === true : e.inGame;
}

/** Lista de ids habilitados (ordem do catálogo). */
export function enabledIds(selectionOverride) {
  const sel = normalizeSelection(selectionOverride);
  return MUSIC_CATALOG.filter((e) => (sel ? sel.get(e.id) === true : e.inGame)).map((e) => e.id);
}

/**
 * Faixas de música HABILITADAS de uma categoria/facção, com RESERVA: se nenhuma estiver habilitada, devolve as ATUAIS (não
 * candidatas) do mesmo grupo — o jogo nunca fica sem música.
 * @returns {Array<object>} entradas `kind:'music'`
 */
export function enabledForGroup(category, faction, selectionOverride) {
  const group = MUSIC_CATALOG.filter((e) => e.kind === 'music' && e.category === category && e.faction === faction);
  const sel = normalizeSelection(selectionOverride);
  const on = group.filter((e) => (sel ? sel.get(e.id) === true : e.inGame));
  return on.length ? on : group.filter((e) => !e.candidate);
}

/** Índices de variação (em `TRACK_SETS[família]`) habilitados para a família, com a mesma reserva. */
export function enabledVariants(family, selectionOverride) {
  const group = MUSIC_CATALOG.filter((e) => e.kind === 'music' && e.family === family);
  if (!group.length) return [];
  const sel = normalizeSelection(selectionOverride);
  const on = group.filter((e) => (sel ? sel.get(e.id) === true : e.inGame));
  return (on.length ? on : group.filter((e) => !e.candidate)).map((e) => e.variant);
}

/** Texto da seleção para copiar/guardar: `{"version":1,"enabled":[…]}`. */
export function serializeSelection(ids) {
  return JSON.stringify({ version: 1, enabled: [...ids].filter((id) => BY_ID.has(id)) });
}

/** Lê a seleção salva (`storage` = localStorage ou equivalente; qualquer erro = `null`). */
export function loadSelection(storage) {
  try {
    const raw = storage && storage.getItem(MUSIC_SELECTION_KEY);
    return raw ? normalizeSelection(raw) : null;
  } catch {
    return null;
  }
}

/** Grava (ou apaga, com `null`) a seleção. Devolve se gravou. */
export function saveSelection(storage, ids) {
  try {
    if (!storage) return false;
    if (ids === null || ids === undefined) storage.removeItem(MUSIC_SELECTION_KEY);
    else storage.setItem(MUSIC_SELECTION_KEY, serializeSelection(ids));
    return true;
  } catch {
    return false;
  }
}
