/**
 * musicEngine.js — o "motor de partitura" da música procedural: escalas, acordes, compassos, notação compacta e geração
 * determinística de notas por passo. PURO (sem Web Audio, sem DOM, sem sim). As faixas em si ficam em `musicScores.js`
 * (clássicas), `tracksHuman.js`, `tracksOrc.js` e `tracksTitle.js`; o som é feito por `MusicPlayer`/`instruments.js`.
 *
 * Uma faixa é uma progressão de acordes por compasso (diatônicos à escala do modo; sufixos escolhem a qualidade) mais
 * CAMADAS:
 *   pattern  notas fixas por passo, relativas ao acorde (arpejo, baixo, ostinato, stabs; `stack` empilha intervalos)
 *   hold     o acorde sustentado no compasso (colchão/pad)
 *   drum     percussão por passo (velocidade 0..1; 1 ou 2 compassos em laço); `fill` troca o desenho em compassos de virada
 *   melody   frase GERADA de 2 compassos da escala do modo (faixas clássicas)
 *   line     melodia ESCRITA em notação compacta (graus da escala): motivo reconhecível, sequências, cadência
 * Tudo determinístico: `eventsForStep(track, step, { seed, lite, intensity })` devolve sempre as mesmas notas.
 *
 * INTENSIDADE (0..1, vinda do tempo de partida; ver `intensity.js`): camadas com `int: x` só soam a partir de x (a
 * densidade só cresce com a intensidade), `lift: {at, oct}` sobe a camada de registro e o andamento ganha `tempoGain`
 * (+2…6 % em 1,0). O laço nunca quebra: a posição é sempre `passo % tamanho do laço`.
 *
 * Evento: { inst, midi, vel, dur }  — `dur` em PASSOS (semicolcheias). Percussão: `midi` = 0.
 *
 * NOTAÇÃO DE LINHA (`line`): símbolos separados por espaço, `grau:duração[@vel]`; grau 0 = tônica da escala do modo, 7 = a
 * tônica uma oitava acima, -1 = o grau abaixo da tônica; `r:dur` = pausa; `0,2,4:8` = várias notas juntas (acorde).
 * A duração é em passos (semicolcheias). Ex.: "0:4 2:2 4:2 r:4 7:4@0.8".
 */

export const STEPS_PER_BEAT = 4;
export const STEPS_PER_BAR = 16;

/** Passos (semicolcheias) por compasso de cada fórmula. A semínima vale 4 passos; `bpm` é sempre de semínima. */
export const METERS = Object.freeze({ '2/4': 8, '3/4': 12, '4/4': 16, '5/4': 20, '6/8': 12, '7/8': 14, '9/8': 18, '12/8': 24 });

/** Escalas dos modos usados (semitons a partir da tônica). */
export const MODES = Object.freeze({
  major: Object.freeze([0, 2, 4, 5, 7, 9, 11]),
  dorian: Object.freeze([0, 2, 3, 5, 7, 9, 10]),
  mixolydian: Object.freeze([0, 2, 4, 5, 7, 9, 10]),
  phrygian: Object.freeze([0, 1, 3, 5, 7, 8, 10]),
  lydian: Object.freeze([0, 2, 4, 6, 7, 9, 11]),
  minor: Object.freeze([0, 2, 3, 5, 7, 8, 10]), // menor natural (eólio)
  harmonicMinor: Object.freeze([0, 2, 3, 5, 7, 8, 11]) // menor harmônico: sensível + 2ª aumentada (tensão dramática)
});

/** Modos "menores" (3ª menor sobre a tônica). */
export const MINOR_MODES = Object.freeze(['minor', 'harmonicMinor', 'dorian', 'phrygian']);

/** Intervalos (semitons) dos tons do acorde: 0 fundamental, 1 terça, 2 quinta, 3-5 mesmas notas uma oitava acima. */
export const CHORD_TONES = Object.freeze({
  maj: [0, 4, 7, 12, 16, 19],
  min: [0, 3, 7, 12, 15, 19],
  dim: [0, 3, 6, 12, 15, 18],
  aug: [0, 4, 8, 12, 16, 20],
  sus4: [0, 5, 7, 12, 17, 19],
  sus2: [0, 2, 7, 12, 14, 19],
  pow: [0, 7, 12, 19, 24, 31] // quinta vazia (sem terça): o som de metais da Horda
});

/** Sufixo de grau (`'4M'`) -> qualidade do acorde. Sem sufixo, a qualidade sai da própria escala. */
const QUALITY = Object.freeze({ M: 'maj', m: 'min', d: 'dim', a: 'aug', s: 'sus4', s2: 'sus2', p: 'pow' });

/** Empilhamentos (semitons somados a cada nota de um `pattern` com `stack`). */
const STACKS = Object.freeze({
  fifths: [0, 7, 12], // quintas e oitavas: o som de metais militares (na execução usa a quinta do acorde)
  tritone: [0, 6, 12], // trítono: ameaça (Horda)
  octaves: [0, 12]
});

const mix = (x) => {
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  return (x ^ (x >>> 16)) >>> 0;
};
const hash = (a, b, c, d) => mix(mix(mix(mix((a | 0) + 0x9e3779b9) ^ (b | 0)) ^ (c | 0)) ^ (d | 0));
const clamp01 = (x) => (x > 1 ? 1 : x > 0 ? x : 0);

/** Moldes rítmicos da frase de melodia GERADA (32 passos = 2 compassos de 4/4): [passo, duração]. */
const RHYTHMS = Object.freeze([
  [[0, 3], [3, 3], [6, 2], [8, 4], [12, 2], [14, 2], [16, 3], [19, 3], [22, 2], [24, 6], [30, 2]],
  [[0, 2], [2, 2], [4, 4], [8, 3], [11, 1], [12, 4], [16, 2], [18, 2], [20, 4], [24, 4], [28, 4]],
  [[0, 6], [6, 2], [8, 4], [12, 4], [16, 3], [19, 3], [22, 2], [24, 8]],
  [[0, 1], [1, 1], [2, 2], [4, 2], [6, 2], [8, 3], [11, 1], [12, 4], [16, 4], [20, 2], [22, 2], [24, 6], [30, 2]]
]);

/** Acorde do grau `spec` (número 0-based ou texto com sufixo, ex. '4M'): [fundamental MIDI, tipo]. */
function chordFor(scale, key, spec) {
  let deg = spec;
  let forced = null;
  if (typeof spec === 'string') {
    const m = /^(-?\d+)([A-Za-z0-9]*)$/.exec(spec);
    if (!m) throw new Error(`grau de acorde inválido: ${spec}`);
    deg = Number(m[1]);
    forced = QUALITY[m[2]];
    if (m[2] && !forced) throw new Error(`qualidade de acorde inválida: ${spec}`);
  }
  const n = scale.length;
  const at = (d) => scale[((d % n) + n) % n] + 12 * Math.floor(d / n);
  const r = at(deg);
  if (forced) return [key + r, forced];
  const third = at(deg + 2) - r;
  const fifth = at(deg + 4) - r;
  const type = fifth === 8 ? 'aug' : fifth !== 7 ? 'dim' : third === 3 ? 'min' : 'maj';
  return [key + r, type];
}

/** Arpejo: um passo a cada `every` passos, percorrendo os tons `idx` do acorde. */
export const arp = (idx, every, dur) => idx.map((n, k) => ({ i: k * every, n, dur }));
/** Cada passo vira `{i, n, dur, vel}` por uma tabela de velocidades por passo (0 = pausa). */
export const pump = (vels, fn) => vels.map((v, i) => (v > 0 ? { i, vel: v, ...fn(i) } : null)).filter(Boolean);

const GLYPH = Object.freeze({ X: 1, x: 0.75, o: 0.45, g: 0.25, '.': 0 });
/** Desenho de percussão em texto: X forte, x médio, o fraco, g fantasma, ponto = pausa. Ex.: `'X..o..x.X..o.xo'`. */
export function dr(str) {
  const s = str.replace(/[\s|]/g, '');
  return Array.from(s, (c) => {
    if (!(c in GLYPH)) throw new Error(`símbolo de percussão inválido: ${c}`);
    return GLYPH[c];
  });
}

/** Junta trechos de linha. */
export const L = (...parts) => parts.filter(Boolean).join(' ');
/** Repete um trecho `n` vezes. */
export const rep = (s, n) => Array.from({ length: n }, () => s).join(' ');
/** Aplica a velocidade `v` (0..1) a todos os símbolos de um trecho que ainda não têm `@vel`. */
export const vol = (str, v) => str.split(/\s+/).filter(Boolean).map((tok) => (tok.includes('@') ? tok : `${tok}@${v}`)).join(' ');
/** Rampa de `n` valores de `a` a `b` (rufar crescente/decrescente de percussão). */
export const ramp = (n, a, b) => Array.from({ length: n }, (_, i) => +(a + ((b - a) * i) / Math.max(1, n - 1)).toFixed(3));
/** Rufar de notas afinadas (tímpano) de `spb` passos, velocidade de `a` a `b`, para `pattern` (grau `n` do acorde). */
export const rollSteps = (spb, a, b, n = 0) => ramp(spb, a, b).map((vel, i) => ({ i, n, dur: 1, vel }));
/** Lista de compassos de intervalos fechados: `span([0, 3], [8, 11])` -> [0,1,2,3,8,9,10,11]. */
export const span = (...ranges) => ranges.flatMap(([a, b]) => Array.from({ length: b - a + 1 }, (_, k) => a + k));
/**
 * Posiciona trechos de linha em compassos de uma faixa de `totalBars` compassos, preenchendo os vazios com pausas:
 * `place(40, 16, [4, 'frase…'], [16, 'outra…'])`. Dá erro se um trecho passar do fim ou invadir o seguinte.
 */
export function place(totalBars, spb, ...entries) {
  const out = [];
  let cursor = 0;
  for (const [bar, str] of entries) {
    const start = bar * spb;
    if (start < cursor) throw new Error(`place: trecho do compasso ${bar} invade o anterior`);
    if (start > cursor) out.push(`r:${start - cursor}`);
    out.push(str);
    cursor = start + parseLine(str).len;
  }
  const total = totalBars * spb;
  if (cursor > total) throw new Error(`place: linha com ${cursor} passos passa do fim (${total})`);
  if (cursor < total) out.push(`r:${total - cursor}`);
  return out.join(' ');
}
/** Transpõe os graus de um trecho em `k` degraus da escala (sequência diatônica). */
export function shift(str, k) {
  return str.split(/\s+/).filter(Boolean).map((tok) => {
    const [head, ...rest] = tok.split(':');
    if (head === 'r') return tok;
    const moved = head.split(',').map((d) => Number(d) + k).join(',');
    return [moved, ...rest].join(':');
  }).join(' ');
}

/** Interpreta a notação de linha. -> { notes: [{step, degs, dur, vel}], len } */
export function parseLine(str) {
  const notes = [];
  let step = 0;
  for (const tok of str.split(/\s+/).filter(Boolean)) {
    const m = /^(r|-?\d+(?:,-?\d+)*):(\d+(?:\.\d+)?)(?:@(\d*\.?\d+))?$/.exec(tok);
    if (!m) throw new Error(`símbolo de linha inválido: "${tok}"`);
    const dur = Number(m[2]);
    if (m[1] !== 'r') notes.push({ step, degs: m[1].split(',').map(Number), dur, vel: m[3] ? Number(m[3]) : 1 });
    step += dur;
  }
  return { notes, len: step };
}

const lineCache = new WeakMap();
function lineIndex(layer) {
  let ix = lineCache.get(layer);
  if (!ix) {
    const p = parseLine(layer.line);
    const byStep = new Map();
    for (const n of p.notes) {
      const k = Math.round(n.step);
      if (!byStep.has(k)) byStep.set(k, []);
      byStep.get(k).push(n);
    }
    ix = { len: p.len, byStep };
    lineCache.set(layer, ix);
  }
  return ix;
}

// ------------------------------------------------------------------------------------------------ faixas
/**
 * Monta uma faixa. `deg`: graus dos acordes (um por compasso; número ou texto com sufixo `M m d a s s2 p`).
 * `meter`: '4/4' (padrão), '6/8', '5/4', '7/8'… (ver `METERS`). `tempoGain`: aceleração em intensidade 1 (padrão 4 % na paz).
 * Valida na criação: percussão com 1 ou 2 compassos, linhas que dividem o laço.
 */
export function makeTrack({ family, faction, state, variant, bpm, mode, key, deg, seed = 1, layers, meter = '4/4', tempoGain, id, loopable = true }) {
  const scale = MODES[mode];
  const spb = METERS[meter];
  if (!scale) throw new Error(`modo desconhecido: ${mode}`);
  if (!spb) throw new Error(`compasso desconhecido: ${meter}`);
  const tid = id || `${family}_${variant}`;
  const norm = layers.map((l) => {
    if (l.kind !== 'drum') return l;
    const toArr = (s) => (typeof s === 'string' ? dr(s) : s);
    const steps = toArr(l.steps);
    if (steps.length !== spb && steps.length !== spb * 2) throw new Error(`${tid}: percussão ${l.inst} com ${steps.length} passos (compasso ${meter} = ${spb})`);
    return { ...l, steps, fill: l.fill ? { ...l.fill, steps: toArr(l.fill.steps) } : undefined };
  });
  const len = spb * deg.length;
  for (const l of norm) {
    if (l.kind === 'line') {
      const ix = lineIndex(l);
      if (ix.len % spb !== 0 || len % ix.len !== 0) throw new Error(`${tid}: linha ${l.inst} com ${ix.len} passos não divide o laço (${len}, compasso ${spb})`);
    }
  }
  return {
    id: tid, family, faction, state, variant, bpm, mode, scale, key, seed, meter,
    stepsPerBar: spb, bars: deg.length,
    tempoGain: tempoGain ?? (state === 'peace' ? 0.04 : 0),
    loopable,
    prog: deg.map((dg) => chordFor(scale, key, dg)),
    layers: norm
  };
}

/** Passos de uma volta completa da faixa. */
export function trackLength(track) {
  return track.stepsPerBar * track.bars;
}

/** Duração de um passo (s). `intensity` (0..1) acelera o andamento em até `track.tempoGain`. */
export function stepSeconds(track, intensity = 0) {
  return 60 / (track.bpm * (1 + (track.tempoGain || 0) * clamp01(intensity)) * STEPS_PER_BEAT);
}

/** Duração de uma volta (s) no andamento base. */
export function loopSeconds(track) {
  return trackLength(track) * stepSeconds(track);
}

const chordAt = (track, bar) => track.prog[((bar % track.bars) + track.bars) % track.bars];

/** Frase de melodia GERADA (2 compassos): lista de { step, midi, dur } determinística por (laço, frase, seed). */
const phraseCache = new WeakMap();
function melodyPhrase(track, layerIdx, loop, phrase, seed) {
  let per = phraseCache.get(track);
  if (!per) phraseCache.set(track, (per = new Map()));
  const ck = `${layerIdx}|${loop}|${phrase}|${seed}`;
  const hit = per.get(ck);
  if (hit) return hit;

  const layer = track.layers[layerIdx];
  const scale = track.scale;
  const n = scale.length;
  const keyMidi = track.key + 12 * layer.oct;
  const keyPc = keyMidi % 12;
  const h0 = hash(seed, loop, phrase, layerIdx);
  const molds = layer.rhythms || RHYTHMS;
  const rhythm = molds[(layer.mold + (loop + phrase) % 2) % molds.length]; // alterna o molde entre frases
  const notes = [];
  let d = Math.floor(n / 2) + ((h0 >>> 8) % 3) - 1; // grau inicial (índice na escala)
  const maxD = n + 4; // até ~1,6 oitava acima da tônica
  let prevD = -1;
  rhythm.forEach(([step, dur], k) => {
    const isFirst = k === 0;
    const isLast = k === rhythm.length - 1;
    const h = hash(seed, loop, phrase * 31 + k, layerIdx + 7);
    if (!isFirst && !isLast && h / 4294967296 >= layer.density) return; // pausa
    const bar = phrase * 2 + Math.floor(step / track.stepsPerBar);
    const [root, type] = chordAt(track, bar);
    const tones = CHORD_TONES[type];
    // final de frase pousa na fundamental ou na quinta; tempos fortes, em qualquer tom do acorde
    const wanted = (isLast ? [tones[0], tones[2]] : [tones[0], tones[1], tones[2]]).map((t) => (root + t) % 12);
    const isWanted = (deg) => wanted.includes((keyPc + scale[deg % n]) % 12);
    if (step % 4 === 0 && (step % track.stepsPerBar === 0 || isLast || step % 8 === 0)) {
      // procura o grau-alvo mais próximo do corrente, evitando repetir a nota anterior quando há alternativa
      let best = -1;
      let bestAlt = -1;
      for (let off = 0; off <= 3; off++) {
        for (const cand of off === 0 ? [d] : [d - off, d + off]) {
          if (cand < 0 || cand > maxD || !isWanted(cand)) continue;
          if (cand !== prevD) { if (best < 0) best = cand; } else if (bestAlt < 0) bestAlt = cand;
        }
        if (best >= 0) break;
      }
      d = best >= 0 ? best : bestAlt >= 0 ? bestAlt : d;
    } else {
      d += [-2, -1, -1, 0, 1, 1, 2][(h >>> 4) % 7];
      if (d === prevD) d += (h >>> 9) & 1 ? 1 : -1; // não repete a nota
    }
    d = Math.max(0, Math.min(maxD, d));
    prevD = d;
    notes.push({ step, midi: keyMidi + 12 * Math.floor(d / n) + scale[d % n], dur });
  });
  per.set(ck, notes);
  if (per.size > 64) per.delete(per.keys().next().value);
  return notes;
}

/**
 * Notas do passo global `step` (0, 1, 2…; a faixa dá a volta sozinha).
 * @param {object} track  uma faixa de `musicScores.TRACKS_BY_ID`
 * @param {number} step
 * @param {{seed?:number, lite?:boolean, intensity?:number}} [opts]  `lite`: só as camadas `lite: true` (preset baixo);
 *   `intensity` 0..1: evolução pelo tempo de partida (camadas `int`, registros `lift`)
 * @returns {Array<{inst:string, midi:number, vel:number, dur:number}>}
 */
export function eventsForStep(track, step, { seed = 1, lite = false, intensity = 0 } = {}) {
  const len = trackLength(track);
  const loop = Math.floor(step / len);
  const local = ((step % len) + len) % len;
  const bar = Math.floor(local / track.stepsPerBar);
  const i = local % track.stepsPerBar;
  const [root, type] = chordAt(track, bar);
  const tones = CHORD_TONES[type];
  const inten = clamp01(intensity);
  const out = [];

  track.layers.forEach((layer, li) => {
    if (lite && layer.lite === false) return;
    if (layer.bars && !layer.bars.includes(bar)) return;
    if (layer.int !== undefined && inten < layer.int) return;
    const up = layer.lift && inten >= layer.lift.at ? 12 * layer.lift.oct : 0;
    switch (layer.kind) {
      case 'pattern': {
        // quintas: a quinta do próprio acorde (justa ou diminuta), sempre na escala; trítono é cromático de propósito
        const stack = layer.stack === 'fifths' ? [0, tones[2], 12] : layer.stack ? STACKS[layer.stack] : null;
        for (const s of layer.steps) {
          if (s.i !== i) continue;
          const base = root + 12 * layer.oct + up + (s.semi !== undefined ? s.semi : tones[s.n]);
          const vel = layer.vel * (s.vel ?? 1);
          if (stack) for (const k of stack) out.push({ inst: layer.inst, midi: base + k, vel: vel * (k === 0 ? 1 : 0.8), dur: s.dur });
          else out.push({ inst: layer.inst, midi: base, vel, dur: s.dur });
        }
        break;
      }
      case 'hold':
        if (i === 0) {
          for (let k = 0; k < 3; k++) out.push({ inst: layer.inst, midi: root + 12 * layer.oct + up + tones[k], vel: layer.vel, dur: track.stepsPerBar });
        }
        break;
      case 'drum': {
        const steps = layer.fill && layer.fill.bars.includes(bar) ? layer.fill.steps : layer.steps;
        const v = steps.length > track.stepsPerBar ? steps[local % steps.length] : steps[i];
        if (v > 0) out.push({ inst: layer.inst, midi: 0, vel: Math.min(1, v * (layer.vel ?? 1)), dur: 1 });
        break;
      }
      case 'melody': {
        const phraseSteps = track.stepsPerBar * 2;
        const phrase = Math.floor(local / phraseSteps);
        const notes = melodyPhrase(track, li, loop, phrase, seed + (layer.seedAdd | 0) + (track.seed | 0));
        const within = local - phrase * phraseSteps;
        for (const nt of notes) if (nt.step === within) out.push({ inst: layer.inst, midi: nt.midi + up, vel: layer.vel, dur: nt.dur });
        break;
      }
      case 'line': {
        const ix = lineIndex(layer);
        const hits = ix.byStep.get(local % ix.len);
        if (!hits) break;
        const n = track.scale.length;
        const keyMidi = track.key + 12 * layer.oct + up;
        for (const nt of hits) {
          for (const d of nt.degs) {
            out.push({ inst: layer.inst, midi: keyMidi + 12 * Math.floor(d / n) + track.scale[((d % n) + n) % n], vel: Math.min(1, layer.vel * nt.vel), dur: nt.dur });
          }
        }
        break;
      }
      default:
        break;
    }
  });
  return out;
}

// ------------------------------------------------------------------------------------------------ evolução pelo tempo
/**
 * Camadas EXTRAS das faixas de paz que só entram conforme a intensidade (minutos de partida) sobe: a música começa calma e
 * ganha urgência — caixa marchando, tímpanos, cordas em tremolo, metais, prato, bumbo e taiko em galope. Servem a qualquer
 * compasso (`spb` = passos por compasso). Todas `lite: false` (o preset baixo fica só com o essencial). Não alteram nada em
 * intensidade 0 (as faixas soam exatamente como antes).
 * @param {number} spb  passos por compasso
 * @param {'human'|'orc'} faction
 */
export function evolutionLayers(spb, faction) {
  const eighths = (fn) => Array.from({ length: Math.floor(spb / 2) }, (_, k) => fn(k * 2)).filter(Boolean);
  const beat = (k) => k % 4 === 0;
  const half = Math.floor(spb / 2);
  const grid = (fn) => Array.from({ length: spb }, (_, i) => fn(i));
  if (faction === 'orc') {
    return [
      { kind: 'drum', inst: 'taiko', steps: grid((i) => (i === half ? 0.55 : i === spb - 2 ? 0.4 : 0)), lite: false, int: 0.15 },
      { kind: 'hold', inst: 'choir', oct: 0, vel: 0.2, lite: false, int: 0.3, bars: [2, 3, 6, 7] },
      { kind: 'drum', inst: 'snare', steps: grid((i) => (i % 2 === 0 ? (beat(i) ? 0.3 : 0.16) : 0)), lite: false, int: 0.45 },
      { kind: 'pattern', inst: 'brass', oct: 1, vel: 0.3, lite: false, int: 0.6, stack: 'tritone', steps: [{ i: 0, n: 0, dur: 3 }, { i: half, n: 0, dur: 2 }] },
      { kind: 'drum', inst: 'taiko', steps: grid((i) => (i % 2 === 0 ? (beat(i) ? 0.9 : 0.6) : 0)), lite: false, int: 0.78 },
      { kind: 'drum', inst: 'cymbal', steps: grid((i) => (i === 0 ? 0.5 : 0)), lite: false, int: 0.9 }
    ];
  }
  return [
    { kind: 'drum', inst: 'snare', steps: grid((i) => (i % 2 === 0 ? (beat(i) ? 0.3 : 0.17) : 0)), lite: false, int: 0.15 },
    { kind: 'pattern', inst: 'timpani', oct: 0, vel: 0.55, lite: false, int: 0.3, steps: [{ i: 0, n: 0, dur: 2 }, { i: half, n: 2, dur: 2, vel: 0.7 }] },
    { kind: 'pattern', inst: 'strings', oct: 1, vel: 0.15, lite: false, int: 0.45, steps: eighths((i) => ({ i, n: i % 4 === 2 ? 2 : 0, dur: 1.6 })) },
    { kind: 'pattern', inst: 'brass', oct: 2, vel: 0.26, lite: false, int: 0.6, stack: 'fifths', steps: [{ i: 0, n: 0, dur: 3 }, { i: half, n: 0, dur: 2 }] },
    { kind: 'drum', inst: 'kick', steps: grid((i) => (beat(i) ? 0.65 : 0)), lite: false, int: 0.78 },
    { kind: 'drum', inst: 'cymbal', steps: grid((i) => (i === 0 ? 0.45 : 0)), lite: false, int: 0.9 }
  ];
}
