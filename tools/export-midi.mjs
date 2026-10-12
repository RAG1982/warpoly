#!/usr/bin/env node
/**
 * tools/export-midi.mjs — exporta faixas do catálogo de música como .mid.
 * Uso: node tools/export-midi.mjs <id-da-faixa> [saida.mid] [--loops N] [--intensity 0..1]
 *      node tools/export-midi.mjs --list
 */
import { writeFileSync } from 'node:fs';
import { TRACKS_BY_ID, TRACK_IDS } from '../src/audio/music/musicScores.js';
import { trackToMidi } from '../src/audio/music/midiExport.js';

const args = process.argv.slice(2);
if (args.includes('--list')) {
  console.log(TRACK_IDS.join('\n'));
  process.exit(0);
}
const flag = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 ? Number(args.splice(i, 2)[1]) : def;
};
const loops = flag('--loops', 1);
const intensity = flag('--intensity', 0);
const [id, out] = args;
const track = TRACKS_BY_ID[id];
if (!track) {
  console.error(`faixa desconhecida "${id}". Use --list.`);
  process.exit(1);
}
const file = out || `${id}.mid`;
writeFileSync(file, trackToMidi(track, { loops, intensity }));
console.log(`${file}: ${track.id} (${track.bpm} bpm, ${track.meter}, ${track.bars} compassos × ${loops})`);
