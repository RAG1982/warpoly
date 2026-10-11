import { describe, it, expect } from 'vitest';
import { TRACKS_BY_ID, TRACK_IDS } from '../../src/audio/music/musicScores.js';
import { trackToMidi, vlq, MIDI_PPQ, GM_DRUM_NOTE } from '../../src/audio/music/midiExport.js';

/** Leitor mínimo de SMF para validar a saída (independente do exportador). */
function parse(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (o) => String.fromCharCode(...bytes.slice(o, o + 4));
  expect(tag(0)).toBe('MThd');
  const out = { format: dv.getUint16(8), ntrk: dv.getUint16(10), ppq: dv.getUint16(12), tracks: [] };
  let pos = 14;
  for (let t = 0; t < out.ntrk; t++) {
    expect(tag(pos)).toBe('MTrk');
    const len = dv.getUint32(pos + 4);
    const body = bytes.slice(pos + 8, pos + 8 + len);
    pos += 8 + len;
    let i = 0, tick = 0, name = '', tempo = null, ts = null, noteOns = 0, drums = 0, program = null, end = false;
    const rd = () => { let v = 0, b; do { b = body[i++]; v = (v << 7) | (b & 0x7f); } while (b & 0x80); return v; };
    while (i < body.length) {
      tick += rd();
      const st = body[i];
      if (st === 0xff) {
        const ty = body[i + 1]; i += 2; const l = rd(); const data = body.slice(i, i + l); i += l;
        if (ty === 3) name = String.fromCharCode(...data);
        if (ty === 0x51) tempo = (data[0] << 16) | (data[1] << 8) | data[2];
        if (ty === 0x58) ts = [...data];
        if (ty === 0x2f) end = true;
      } else {
        i++;
        const hi = st >> 4;
        if (hi === 0xc) { program = body[i++]; continue; }
        const a = body[i++], b = body[i++];
        if (hi === 0x9 && b > 0) { noteOns++; if ((st & 0xf) === 9) drums++; expect(a).toBeLessThanOrEqual(127); }
      }
    }
    expect(end, 'fim de trilha').toBe(true);
    out.tracks.push({ name, tempo, ts, noteOns, drums, program, ticks: tick });
  }
  return out;
}

describe('exportação MIDI (midiExport)', () => {
  it('vlq: valores de referência do formato', () => {
    expect(vlq(0)).toEqual([0]);
    expect(vlq(127)).toEqual([0x7f]);
    expect(vlq(128)).toEqual([0x81, 0x00]);
    expect(vlq(16383)).toEqual([0xff, 0x7f]);
  });

  it('title_0: SMF formato 1, andamento, compasso, duração igual à do jogo e percussão no canal 10', () => {
    const t = TRACKS_BY_ID.title_0;
    const m = parse(trackToMidi(t));
    expect(m.format).toBe(1);
    expect(m.ppq).toBe(MIDI_PPQ);
    expect(m.ntrk).toBe(m.tracks.length);
    const cond = m.tracks[0];
    expect(Math.round(60000000 / cond.tempo)).toBe(t.bpm);
    expect(cond.ts.slice(0, 2)).toEqual([4, 2]); // 4/4
    const seconds = (cond.ticks / MIDI_PPQ) * (60 / t.bpm);
    expect(seconds).toBeGreaterThanOrEqual(90);
    const names = m.tracks.map((x) => x.name);
    expect(names).toContain('snare');
    expect(m.tracks.find((x) => x.name === 'snare').drums).toBeGreaterThan(0);
    expect(m.tracks.find((x) => x.name === 'trombone').program).toBe(57);
  });

  it('todas as faixas exportam um MIDI válido, com compasso certo e pelo menos uma nota', () => {
    for (const id of TRACK_IDS) {
      const t = TRACKS_BY_ID[id];
      const m = parse(trackToMidi(t, { loops: 1 }));
      const [nn, dPow] = m.tracks[0].ts;
      expect([nn, 2 ** dPow].join('/'), id).toBe(t.meter);
      expect(m.tracks.reduce((n, x) => n + x.noteOns, 0), id).toBeGreaterThan(0);
    }
  });

  it('é determinístico e `loops` repete a duração', () => {
    const t = TRACKS_BY_ID.title_0;
    expect(Buffer.from(trackToMidi(t)).equals(Buffer.from(trackToMidi(t)))).toBe(true);
    const one = parse(trackToMidi(t, { loops: 1 })).tracks[0].ticks;
    const two = parse(trackToMidi(t, { loops: 2 })).tracks[0].ticks;
    expect(two).toBe(one * 2);
  });

  it('todo instrumento de percussão do jogo tem nota General MIDI', () => {
    for (const k of ['kick', 'snare', 'tom', 'taiko', 'cymbal', 'gong']) expect(GM_DRUM_NOTE[k]).toBeGreaterThan(0);
  });
});
