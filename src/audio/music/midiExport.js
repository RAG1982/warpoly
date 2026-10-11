/**
 * midiExport.js — exporta uma faixa do catálogo como arquivo MIDI padrão (SMF formato 1). PURO (sem DOM/Web Audio), testável em Node.
 *
 * Usa o mesmo `eventsForStep` do jogo: o que se ouve no jogo é o que vai para o arquivo. Cada instrumento vira uma trilha MIDI
 * (nome = instrumento do jogo) com um programa General MIDI; a percussão vai no canal 10 (índice 9). 1 passo do jogo = 1/16 de
 * semibreve = ppq/4 ticks. O MIDI não carrega timbre: o som no seu DAW depende do banco de sons (soundfont) escolhido.
 */
import { eventsForStep, trackLength, STEPS_PER_BEAT } from './musicEngine.js';

export const MIDI_PPQ = 480;
const TICKS_PER_STEP = MIDI_PPQ / STEPS_PER_BEAT;

/** Instrumento do jogo -> programa General MIDI (0-based). */
export const GM_PROGRAM = Object.freeze({
  pluck: 24, pad: 89, drone: 38, flute: 73, brass: 61, horn: 60, bass: 43, strings: 48, trumpet: 56, fife: 72, warhorn: 60,
  harpsichord: 6, violin: 40, cello: 42, trombone: 57, choir: 52, organ: 19, timpani: 47, bell: 14
});

/** Instrumentos de percussão -> nota do canal 10 (General MIDI). */
export const GM_DRUM_NOTE = Object.freeze({ kick: 36, snare: 38, hat: 42, tom: 47, shaker: 70, taiko: 41, cymbal: 49, gong: 52 });

const CHANNEL_DRUMS = 9;

const u16 = (n) => [(n >> 8) & 0xff, n & 0xff];
const u32 = (n) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];

/** Quantidade de variável (VLQ) do formato MIDI. */
export function vlq(n) {
  let v = Math.max(0, Math.round(n));
  const out = [v & 0x7f];
  while ((v >>= 7) > 0) out.unshift((v & 0x7f) | 0x80);
  return out;
}

const meta = (delta, type, data) => [...vlq(delta), 0xff, type, ...vlq(data.length), ...data];
const text = (s) => Array.from(new TextEncoder().encode(s));

function chunk(tag, data) {
  return [...text(tag), ...u32(data.length), ...data];
}

/** Fórmula de compasso ('6/8') -> bytes do meta 0x58: numerador, log2(denominador), relógios por clique, 32avos por semínima. */
function timeSignature(meter) {
  const [nn, dd] = meter.split('/').map(Number);
  return [nn, Math.log2(dd), dd === 8 ? 36 : 24, 8];
}

/**
 * Converte a faixa em bytes de um arquivo .mid.
 * @param {object} track  faixa de `musicScores.TRACKS_BY_ID`
 * @param {{loops?:number, intensity?:number, seed?:number}} [opts]  `loops` voltas completas (padrão 1)
 * @returns {Uint8Array}
 */
export function trackToMidi(track, { loops = 1, intensity = 0, seed = 1 } = {}) {
  const steps = trackLength(track) * Math.max(1, loops);
  // eventos por instrumento: { tick, dur, midi, vel }
  const byInst = new Map();
  for (let s = 0; s < steps; s++) {
    for (const ev of eventsForStep(track, s, { seed, intensity })) {
      if (!byInst.has(ev.inst)) byInst.set(ev.inst, []);
      byInst.get(ev.inst).push({ tick: s * TICKS_PER_STEP, dur: Math.max(1, ev.dur) * TICKS_PER_STEP, midi: ev.midi, vel: ev.vel });
    }
  }
  // canais: percussão no 9; os demais instrumentos afinados, um canal cada (0..15 menos o 9), repetindo se faltar
  const pitched = [...byInst.keys()].filter((i) => !(i in GM_DRUM_NOTE));
  const free = Array.from({ length: 16 }, (_, c) => c).filter((c) => c !== CHANNEL_DRUMS);
  const channelOf = new Map(pitched.map((inst, k) => [inst, free[k % free.length]]));

  // trilha 0: andamento, compasso e nome
  const usPerQuarter = Math.round(60000000 / track.bpm);
  const conductor = [
    ...meta(0, 0x03, text(track.id)),
    ...meta(0, 0x51, [(usPerQuarter >> 16) & 0xff, (usPerQuarter >> 8) & 0xff, usPerQuarter & 0xff]),
    ...meta(0, 0x58, timeSignature(track.meter || '4/4')),
    ...meta(steps * TICKS_PER_STEP, 0x2f, [])
  ];
  const tracks = [chunk('MTrk', conductor)];

  for (const [inst, list] of byInst) {
    const isDrum = inst in GM_DRUM_NOTE;
    const ch = isDrum ? CHANNEL_DRUMS : channelOf.get(inst);
    const evs = []; // { tick, order, bytes }
    for (const e of list) {
      const note = isDrum ? GM_DRUM_NOTE[inst] : Math.max(0, Math.min(127, Math.round(e.midi)));
      const vel = Math.max(1, Math.min(127, Math.round(e.vel * 127)));
      evs.push({ tick: e.tick, order: 1, bytes: [0x90 | ch, note, vel] });
      evs.push({ tick: e.tick + (isDrum ? TICKS_PER_STEP : e.dur), order: 0, bytes: [0x80 | ch, note, 0] });
    }
    evs.sort((a, b) => a.tick - b.tick || a.order - b.order);
    const data = [...meta(0, 0x03, text(inst))];
    if (!isDrum) data.push(0, 0xc0 | ch, GM_PROGRAM[inst] ?? 0);
    let prev = 0;
    for (const e of evs) {
      data.push(...vlq(e.tick - prev), ...e.bytes);
      prev = e.tick;
    }
    data.push(...meta(Math.max(0, steps * TICKS_PER_STEP - prev), 0x2f, []));
    tracks.push(chunk('MTrk', data));
  }

  const header = chunk('MThd', [...u16(1), ...u16(tracks.length), ...u16(MIDI_PPQ)]);
  return Uint8Array.from([...header, ...tracks.flat()]);
}
