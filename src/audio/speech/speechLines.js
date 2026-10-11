/**
 * speechLines.js (F7-08) — vozes, falas de confirmação (PT-BR neutro) e a escolha de quem fala o quê. PURO.
 *
 * As falas são ORIGINAIS (frases comuns do português, sem nenhuma fala/nome da Blizzard) e escritas na notação
 * fonética de `phonemes.js`; `speechSynth.js` as sintetiza por formantes. Nenhum áudio de terceiros no repositório.
 *
 *  - `VOICE_PROFILES`   perfis de voz (altura, formantes, rouquidão…)
 *  - `LINES[grupo]`     { select: [...], order: [...] } — `text` é a frase (documentação/testes), `ph` a notação fonética
 *  - `speakerFor`       tipo de unidade (+ facção do dono) -> { role, group, voice }
 *  - `leaderOf`         numa seleção, qual unidade fala (herói > conjurador > equipagem > soldado > trabalhador)
 *  - `createSpeechDirector`  escolhe a fala sem repetir a anterior e limita a frequência (seleção interrompe, ordem não metralha)
 */
import { getUnitDef } from '../../data/index.js';
import { createAudioRng } from '../audioConfig.js';

/** Perfis de voz. fs < 1 = trato vocal maior (voz mais grave/"grossa"); rough = rouquidão; whisper = sussurro. */
export const VOICE_PROFILES = Object.freeze({
  h_worker: { f0: 138, range: 0.24, fs: 1.04, speed: 1.06, oq: 0.62, breath: 0.06, rough: 0 },
  h_soldier: { f0: 112, range: 0.22, fs: 1.0, speed: 1.0, oq: 0.58, breath: 0.04, rough: 0.05 },
  h_knight: { f0: 98, range: 0.2, fs: 0.96, speed: 0.96, oq: 0.55, breath: 0.03, rough: 0.06 },
  h_archer: { f0: 128, range: 0.24, fs: 1.05, speed: 1.05, oq: 0.6, breath: 0.05, rough: 0.02 },
  h_crew: { f0: 118, range: 0.26, fs: 1.0, speed: 1.02, oq: 0.56, breath: 0.04, rough: 0.2 },
  h_caster: { f0: 108, range: 0.28, fs: 1.02, speed: 0.92, oq: 0.66, breath: 0.16, rough: 0.03, vib: 0.025 },
  h_hero: { f0: 90, range: 0.3, fs: 0.94, speed: 0.94, oq: 0.55, breath: 0.03, rough: 0.08 },
  o_worker: { f0: 98, range: 0.2, fs: 0.9, speed: 1.0, oq: 0.55, breath: 0.05, rough: 0.3 },
  o_soldier: { f0: 80, range: 0.2, fs: 0.86, speed: 0.98, oq: 0.5, breath: 0.04, rough: 0.45 },
  o_archer: { f0: 92, range: 0.22, fs: 0.9, speed: 1.02, oq: 0.52, breath: 0.04, rough: 0.35 },
  o_ogre: { f0: 62, range: 0.16, fs: 0.74, speed: 0.84, oq: 0.5, breath: 0.05, rough: 0.5, tilt: 0.25 },
  o_crew: { f0: 90, range: 0.24, fs: 0.9, speed: 1.0, oq: 0.52, breath: 0.04, rough: 0.35 },
  o_caster: { f0: 104, range: 0.26, fs: 0.95, speed: 0.92, oq: 0.64, breath: 0.2, rough: 0.2, whisper: 0.45 },
  o_hero: { f0: 70, range: 0.28, fs: 0.8, speed: 0.92, oq: 0.5, breath: 0.04, rough: 0.5 },
  undead: { f0: 150, range: 0.06, fs: 1.12, speed: 0.9, oq: 0.7, breath: 0.25, rough: 0.2, comb: 7 },
  watcher: { f0: 130, range: 0.1, fs: 1.25, speed: 0.85, oq: 0.7, breath: 0.2, whisper: 1, comb: 11 },
  beast: { f0: 55, range: 0.35, fs: 0.7, speed: 0.8, oq: 0.45, breath: 0.1, rough: 0.7 }
});

/** Falas por grupo `<facção>.<papel>` (h = humanos, o = orcs, x = comum). Notação fonética: ver `phonemes.js`. */
export const LINES = Object.freeze({
  'h.worker': {
    select: [
      { text: 'Pois não?', ph: "p'ojz n'a~w?" },
      { text: 'Às ordens!', ph: "az'Orde~js!" },
      { text: 'Estou pronto!', ph: "est'ow pr'o~tU!" },
      { text: 'Diga!', ph: "dZ'ig@!" }
    ],
    order: [
      { text: 'Já vou!', ph: "Z'a v'ow!" },
      { text: 'É pra já!', ph: "'E pr@ Z'a!" },
      { text: 'A caminho!', ph: "akam'iJU!" },
      { text: 'Certo!', ph: "s'EhtU!" },
      { text: 'Sim, senhor!', ph: "s'i~, se~J'oh!" }
    ]
  },
  'h.soldier': {
    select: [
      { text: 'Às ordens!', ph: "az'Orde~js!" },
      { text: 'Pronto!', ph: "pr'o~tU!" },
      { text: 'Sim, senhor?', ph: "s'i~, se~J'oh?" },
      { text: 'Fale!', ph: "f'alI!" }
    ],
    order: [
      { text: 'Sim, senhor!', ph: "s'i~, se~J'oh!" },
      { text: 'Em frente!', ph: "e~j fr'e~tSI!" },
      { text: 'Pra batalha!', ph: "pr@ bat'aL@!" },
      { text: 'Vamos lá!', ph: "v'a~mUs l'a!" }
    ]
  },
  'h.crew': {
    select: [
      { text: 'Aguardando!', ph: "agward'a~dU!" },
      { text: 'Capitão?', ph: "kapit'a~w?" },
      { text: 'No posto!', ph: "nU p'ostU!" }
    ],
    order: [
      { text: 'Carregar!', ph: "kaReg'ah!" },
      { text: 'Fogo!', ph: "f'ogU!" },
      { text: 'Zarpar!', ph: "zahp'ah!" }
    ]
  },
  'h.caster': {
    select: [
      { text: 'Sim, mestre?', ph: "s'i~, m'EstrI?" },
      { text: 'Que deseja?', ph: "kI dez'eZ@?" },
      { text: 'A magia me guia.', ph: "a maZ'i@ mI g'i@." }
    ],
    order: [
      { text: 'Assim será.', ph: "as'i~ ser'a." },
      { text: 'Como quiser.', ph: "k'omU kiz'Eh." },
      { text: 'A magia obedece.', ph: "a maZ'i@ obed'EsI." }
    ]
  },
  'h.hero': {
    select: [
      { text: 'Pelo reino!', ph: "p'elU R'ejnU!" },
      { text: 'Estou aqui!', ph: "est'ow ak'i!" },
      { text: 'Às ordens, senhor!', ph: "az'Orde~js, se~J'oh!" }
    ],
    order: [
      { text: 'Avante!', ph: "av'a~tSI!" },
      { text: 'Pela honra!', ph: "p'el@ 'o~R@!" },
      { text: 'Sem recuar!', ph: "s'e~j Rekw'ah!" }
    ]
  },
  'o.worker': {
    select: [
      { text: 'Hã?', ph: "'a~?" },
      { text: 'Que foi?', ph: "kI f'oj?" },
      { text: 'Diga logo!', ph: "dZ'ig@ l'ogU!" },
      { text: 'Tô aqui.', ph: "t'o ak'i." }
    ],
    order: [
      { text: 'Já vai, já vai!', ph: "Z'a v'aj, Z'a v'aj!" },
      { text: 'Pode deixar!', ph: "p'OdZI dejS'ah!" },
      { text: 'Tá bom!', ph: "t'a b'o~!" },
      { text: 'Vou nessa.', ph: "v'ow n'Es@." }
    ]
  },
  'o.soldier': {
    select: [
      { text: 'Fala!', ph: "f'al@!" },
      { text: 'Quer briga?', ph: "k'Eh br'ig@?" },
      { text: 'Pode falar.', ph: "p'OdZI fal'ah." },
      { text: 'Sangue!', ph: "s'a~gI!" }
    ],
    order: [
      { text: 'Esmagar!', ph: "ezmag'ah!" },
      { text: 'Pra guerra!', ph: "pr@ g'ER@!" },
      { text: 'Quebrar ossos!', ph: "kebr'ah 'OsUs!" },
      { text: 'Vamos nessa!', ph: "v'a~mUs n'Es@!" },
      { text: 'Pra cima deles!', ph: "pr@ s'im@ d'elIs!" }
    ]
  },
  'o.ogre': {
    select: [
      { text: 'Que é?', ph: "kI 'E?" },
      { text: 'Ogro ouve.', ph: "'ogrU 'owvI." },
      { text: 'Quer o quê?', ph: "k'Eh U k'e?" }
    ],
    order: [
      { text: 'Ogro vai!', ph: "'ogrU v'aj!" },
      { text: 'Esmaga!', ph: "ezm'ag@!" },
      { text: 'Hora de brigar.', ph: "'Or@ dZI brig'ah." }
    ]
  },
  'o.crew': {
    select: [
      { text: 'Pronto, chefe!', ph: "pr'o~tU, S'EfI!" },
      { text: 'Pode mandar.', ph: "p'OdZI ma~d'ah." }
    ],
    order: [
      { text: 'Carregar!', ph: "kaReg'ah!" },
      { text: 'Fogo neles!', ph: "f'ogU n'elIs!" },
      { text: 'Remar!', ph: "Rem'ah!" }
    ]
  },
  'o.caster': {
    select: [
      { text: 'Fale, mortal.', ph: "f'alI, moht'aw." },
      { text: 'Eu escuto.', ph: "'ew esk'utU." },
      { text: 'As cinzas ouvem.', ph: "as s'i~zaz 'ove~j." }
    ],
    order: [
      { text: 'Que seja feito.', ph: "kI s'eZ@ f'ejtU." },
      { text: 'Assim será.', ph: "as'i~ ser'a." },
      { text: 'As cinzas obedecem.', ph: "as s'i~zaz obed'Ese~j." }
    ]
  },
  'o.hero': {
    select: [
      { text: 'Pelo clã!', ph: "p'elU kl'a~!" },
      { text: 'Diga, guerreiro.', ph: "dZ'ig@, geR'ejrU." }
    ],
    order: [
      { text: 'Avançar!', ph: "ava~s'ah!" },
      { text: 'Sem piedade!', ph: "s'e~j pied'adZI!" },
      { text: 'Pelo clã!', ph: "p'elU kl'a~!" }
    ]
  },
  'x.undead': {
    select: [
      { text: 'Mestre.', ph: "m'EstrI." },
      { text: 'Uhh.', ph: "'uh." }
    ],
    order: [
      { text: 'Sim.', ph: "s'i~." },
      { text: 'Ordens.', ph: "'Orde~js." }
    ]
  },
  'x.watcher': {
    select: [
      { text: 'Eu vejo.', ph: "'ew v'eZU." },
      { text: 'Vigio.', ph: "viZ'iU." }
    ],
    order: [
      { text: 'Vou ver.', ph: "v'ow v'eh." },
      { text: 'Sigo.', ph: "s'igU." }
    ]
  },
  'x.beast': {
    select: [
      { text: 'Ssshh!', ph: "ssS'ah!" },
      { text: 'Rrrá!', ph: "R'o~hR!" }
    ],
    order: [
      { text: 'Sshá!', ph: "S'ahS!" },
      { text: 'Rrá!', ph: "R'ah!" }
    ]
  }
});

/** Ordem de "quem fala" numa seleção mista. */
export const ROLE_RANK = Object.freeze({ hero: 6, caster: 5, crew: 4, soldier: 3, ogre: 3, worker: 2, undead: 1, beast: 1, watcher: 0 });

/** Papel de fala de um tipo de unidade (por flags dos dados; unidade nova ganha voz sozinha). `null` = muda (ovelha…). */
export function roleOf(type, def = getUnitDef(type)) {
  if (!def) return null;
  if (def.isHero) return 'hero';
  if (def.undead) return 'undead';
  if (type === 'watching_eye') return 'watcher';
  if (type === 'war_serpent') return 'beast';
  if (def.isSiege || def.layer === 'naval' || def.transportCapacity || def.isTanker || type === 'war_balloon' || type === 'glider') return 'crew';
  if (def.maxMana > 0) return 'caster';
  if (def.isWorker) return 'worker';
  if (type === 'ogre') return 'ogre';
  if (def.isCombat) return 'soldier';
  return null;
}

/** Perfil de voz do tipo (`facção`: 'human'|'orc'; unidades neutras compartilhadas usam a do dono). */
function voiceOf(type, role, f) {
  if (role === 'undead' || role === 'watcher' || role === 'beast') return role;
  if (f === 'h') {
    if (role === 'worker') return 'h_worker';
    if (role === 'crew') return 'h_crew';
    if (role === 'caster') return 'h_caster';
    if (role === 'hero') return 'h_hero';
    if (type === 'knight' || type === 'cavalier') return 'h_knight';
    if (type === 'archer' || type === 'ranger') return 'h_archer';
    return 'h_soldier';
  }
  if (role === 'worker') return 'o_worker';
  if (role === 'crew') return 'o_crew';
  if (role === 'caster') return 'o_caster';
  if (role === 'hero') return 'o_hero';
  if (role === 'ogre') return 'o_ogre';
  if (type === 'axethrower' || type === 'berserker') return 'o_archer';
  return 'o_soldier';
}

/**
 * Quem fala por este tipo de unidade.
 * @param {string} type
 * @param {string} [factionId]  facção do dono (usada quando a unidade é neutra/compartilhada, ex.: petroleiro)
 * @returns {{role:string, group:string, voice:string}|null}
 */
export function speakerFor(type, factionId = 'human') {
  const def = getUnitDef(type);
  const role = roleOf(type, def);
  if (!role) return null;
  const owner = def && def.faction && def.faction !== 'neutral' ? def.faction : factionId;
  const f = owner === 'orc' ? 'o' : 'h';
  const shared = role === 'undead' || role === 'watcher' || role === 'beast';
  let group = shared ? `x.${role}` : `${f}.${role}`;
  if (!LINES[group]) group = `${f}.soldier`; // papel sem falas próprias (ex.: 'ogre' humano) cai no soldado
  return { role, group, voice: voiceOf(type, role, f) };
}

/**
 * Entre as unidades selecionadas, a que fala (maior ROLE_RANK; empate = menor id). Sem unidade com voz = null.
 * @param {Array<{id:number,type:string,ownerId?:number}>} units
 * @param {(u:object)=>string} [factionOf]  facção do dono da unidade
 * @returns {{unit:object, speaker:object}|null}
 */
export function leaderOf(units, factionOf = () => 'human') {
  let best = null;
  for (const u of units) {
    const sp = speakerFor(u.type, factionOf(u));
    if (!sp) continue;
    const rank = ROLE_RANK[sp.role] ?? 0;
    if (!best || rank > best.rank || (rank === best.rank && u.id < best.unit.id)) best = { unit: u, speaker: sp, rank };
  }
  return best ? { unit: best.unit, speaker: best.speaker } : null;
}

/** Política de frequência das falas (segundos). */
export const SPEECH_POLICY = Object.freeze({
  selectGap: 0.18, // entre duas falas de seleção (clique frenético não vira metralhadora)
  orderGap: 1.1, // entre duas falas de ordem
  cutAfter: 0.45 // uma fala só é interrompida por outra depois de tocar pelo menos isso
});

/**
 * Escolhe a fala. Mantém só o necessário: última fala por (grupo, tipo) para não repetir em seguida, e os instantes da
 * última seleção/ordem/fala. O tempo (`now`, s) é injetado; o sorteio usa o RNG de render, nunca Math.random.
 */
export function createSpeechDirector({ rng = createAudioRng(0x5eed), policy = SPEECH_POLICY } = {}) {
  const lastIdx = new Map();
  let lastSelectAt = -Infinity;
  let lastOrderAt = -Infinity;
  let lastStart = -Infinity;
  let lastEnd = -Infinity;

  return {
    /**
     * @param {'select'|'order'} kind
     * @param {{group:string, voice:string}|null} speaker
     * @param {number} now
     * @returns {{key:string, text:string, ph:string, voiceId:string, voice:object}|null}  null = não falar agora
     */
    pick(kind, speaker, now) {
      if (!speaker) return null;
      const pool = LINES[speaker.group] && LINES[speaker.group][kind];
      if (!pool || pool.length === 0) return null;
      if (kind === 'select') {
        if (now - lastSelectAt < policy.selectGap) return null;
      } else {
        if (now - lastOrderAt < policy.orderGap) return null;
        if (now < lastEnd && now - lastStart < policy.cutAfter) return null;
      }
      const slot = `${speaker.group}.${kind}`;
      let idx = Math.floor(rng() * pool.length);
      if (pool.length > 1 && idx === lastIdx.get(slot)) idx = (idx + 1 + Math.floor(rng() * (pool.length - 1))) % pool.length;
      lastIdx.set(slot, idx);
      if (kind === 'select') lastSelectAt = now; else lastOrderAt = now;
      const line = pool[idx];
      return { key: `${slot}.${idx}`, text: line.text, ph: line.ph, voiceId: speaker.voice, voice: VOICE_PROFILES[speaker.voice] };
    },

    /** O motor começou a tocar uma fala de `duration` s. */
    started(now, duration) {
      lastStart = now;
      lastEnd = now + duration;
    },

    /** A fala corrente ainda toca em `now`? */
    speaking(now) {
      return now < lastEnd;
    }
  };
}
