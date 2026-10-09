import { describe, it, expect } from 'vitest';
import { parsePhonemes, SYMBOLS, VOWELS } from '../../src/audio/speech/phonemes.js';
import { renderUtterance, planUtterance, f0Contour, SPEECH_SR } from '../../src/audio/speech/speechSynth.js';
import {
  LINES, VOICE_PROFILES, speakerFor, roleOf, leaderOf, createSpeechDirector, SPEECH_POLICY, ROLE_RANK
} from '../../src/audio/speech/speechLines.js';
import { UNITS } from '../../src/data/index.js';
import { createAudioRng } from '../../src/audio/audioConfig.js';

const base = { f0: 120, range: 0, fs: 1, speed: 1, oq: 0.6, breath: 0.02, rough: 0 };
const rms = (x, a = 0, b = x.length) => { let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i]; return Math.sqrt(s / Math.max(1, b - a)); };
const peak = (x) => { let p = 0; for (const v of x) p = Math.max(p, Math.abs(v)); return p; };

/** Energia numa faixa de frequências (Goertzel em passos de 50 Hz) sobre [a, b) amostras. */
function bandEnergy(x, a, b, f1, f2) {
  let total = 0;
  for (let f = f1; f < f2; f += 50) {
    const w = (2 * Math.PI * f) / SPEECH_SR;
    const c = 2 * Math.cos(w);
    let s0 = 0, s1 = 0, s2 = 0;
    for (let i = a; i < b; i++) {
      const win = 0.5 - 0.5 * Math.cos((2 * Math.PI * (i - a)) / (b - a - 1));
      s0 = x[i] * win + c * s1 - s2;
      s2 = s1;
      s1 = s0;
    }
    total += s1 * s1 + s2 * s2 - c * s1 * s2;
  }
  return total;
}

/** Período fundamental (amostras) por autocorrelação em [a, b). */
function periodOf(x, a, b, minLag = 40, maxLag = 520) {
  let best = 0, bestLag = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let s = 0;
    for (let i = a; i + lag < b; i++) s += x[i] * x[i + lag];
    if (s > best) { best = s; bestLag = lag; }
  }
  return bestLag;
}

const segOf = (plan, tag, n = 0) => plan.segs.filter((s) => s.tag === tag)[n];
const idx = (t) => Math.round(t * SPEECH_SR);

describe('F7-08 fonemas PT-BR e parser', () => {
  it('reconhece africadas e nasais antes das letras simples e marca tônica/pausas', () => {
    const items = parsePhonemes("tS'i~, dZ@ s'a!");
    expect(items.filter((i) => i.k === 'ph').map((i) => i.s)).toEqual(['tS', 'i~', 'dZ', '@', 's', 'a']);
    expect(items.find((i) => i.k === 'ph' && i.s === 'i~').stress).toBe(true);
    expect(items.filter((i) => i.k === 'punct').map((i) => i.m)).toEqual([',', '!']);
    expect(items.filter((i) => i.k === 'gap')).toHaveLength(2); // entre as 3 palavras
  });

  it('símbolo desconhecido lança erro com a notação; "-" é só separador de sílaba', () => {
    expect(() => parsePhonemes('s?x1')).toThrow(/desconhecido/);
    expect(parsePhonemes('s a-j').filter((i) => i.k === 'ph')).toHaveLength(3);
    expect(SYMBOLS.length).toBeGreaterThan(30);
    expect(Object.keys(VOWELS)).toEqual(expect.arrayContaining(['a', 'e', 'E', 'i', 'o', 'O', 'u']));
  });

  it('o plano tem duração coerente: tônica mais longa, pausa de vírgula e ponto final', () => {
    const plain = planUtterance('sa', base).total;
    const stressed = planUtterance("s'a", base).total;
    expect(stressed).toBeGreaterThan(plain);
    expect(planUtterance("s'a, s'a", base).total).toBeGreaterThan(planUtterance("s'a s'a", base).total);
    const slow = planUtterance("s'a", { ...base, speed: 0.5 }).total;
    expect(slow).toBeGreaterThan(stressed * 1.4);
  });
});

describe('F7-08 sintetizador de fala (DSP)', () => {
  it('é determinístico: mesma notação, voz e semente = mesmas amostras; semente diferente muda o ruído', () => {
    const v = VOICE_PROFILES.h_soldier;
    const a = renderUtterance("s'i~, se~J'oh!", v, { seed: 7 });
    const b = renderUtterance("s'i~, se~J'oh!", v, { seed: 7 });
    expect(a.length).toBe(b.length);
    expect(a.every((s, i) => s === b[i])).toBe(true);
    const c = renderUtterance("s'i~, se~J'oh!", v, { seed: 8 });
    expect(c.some((s, i) => s !== a[i])).toBe(true);
  });

  it('amostras finitas, pico < 1 e volume nivelado pelo RMS alvo', () => {
    for (const ph of ["s'a", "p'ojz n'a~w?", "kaReg'ah!", "'uh."]) {
      const x = renderUtterance(ph, VOICE_PROFILES.o_soldier);
      expect(x.every(Number.isFinite), ph).toBe(true);
      expect(peak(x), ph).toBeLessThanOrEqual(0.951);
      expect(peak(x), ph).toBeGreaterThan(0.1);
      expect(rms(x), ph).toBeGreaterThan(0.04);
      expect(rms(x), ph).toBeLessThan(0.14);
    }
    const quiet = renderUtterance("s'a", base, { targetRms: 0.05 });
    expect(rms(quiet)).toBeLessThan(0.08);
  });

  it('a altura (f0) da voz aparece no período fundamental', () => {
    const lo = renderUtterance("'a", { ...base, f0: 100 });
    const hi = renderUtterance("'a", { ...base, f0: 200 });
    const mid = (x) => [Math.round(x.length * 0.3), Math.round(x.length * 0.7)];
    const pLo = periodOf(lo, ...mid(lo), 80, 520);
    const pHi = periodOf(hi, ...mid(hi), 80, 520);
    // declinação muda o f0 em poucos %; tolerância 15%
    expect(pLo).toBeGreaterThan((SPEECH_SR / 100) * 0.85);
    expect(pLo).toBeLessThan((SPEECH_SR / 100) * 1.2);
    expect(pHi).toBeGreaterThan((SPEECH_SR / 200) * 0.85);
    expect(pHi).toBeLessThan((SPEECH_SR / 200) * 1.2);
    expect(pLo).toBeGreaterThan(pHi * 1.6);
  });

  it('as vogais têm formantes distintos: /i/ brilhante (F2 alto), /u/ escura, /a/ forte no F1 alto', () => {
    const mid = (ph) => {
      const plan = planUtterance(ph, base);
      const v = segOf(plan, 'v');
      const x = renderUtterance(ph, base, { raw: true });
      return { x, a: idx(v.t0 + v.tr), b: idx(v.t0 + v.dur) };
    };
    const ratio = ({ x, a, b }) => bandEnergy(x, a, b, 1800, 3200) / bandEnergy(x, a, b, 300, 1100);
    const i = ratio(mid("'i")), u = ratio(mid("'u")), a = ratio(mid("'a"));
    expect(i).toBeGreaterThan(a);
    expect(a).toBeGreaterThan(u * 0.9);
    expect(i).toBeGreaterThan(u * 8);
    // F1 do /a/ (≈740 Hz) acima do /i/ (≈290 Hz): mais energia em 600-1000 que em 200-400
    const A = mid("'a"), I = mid("'i");
    expect(bandEnergy(A.x, A.a, A.b, 600, 1000) / bandEnergy(A.x, A.a, A.b, 200, 400)).toBeGreaterThan(
      bandEnergy(I.x, I.a, I.b, 600, 1000) / bandEnergy(I.x, I.a, I.b, 200, 400));
  });

  it('fricativas têm energia nas altas (/s/ > 4 kHz) e vogais nas baixas; voz sussurrada não tem harmônicos', () => {
    const ph = "'asa";
    const plan = planUtterance(ph, base);
    const x = renderUtterance(ph, base, { raw: true });
    const f = segOf(plan, 'fric');
    const v = segOf(plan, 'v');
    const hiLo = (a, b) => bandEnergy(x, a, b, 4000, 7500) / bandEnergy(x, a, b, 100, 1500);
    expect(hiLo(idx(f.t0 + f.tr), idx(f.t0 + f.dur))).toBeGreaterThan(5);
    expect(hiLo(idx(v.t0 + v.tr), idx(v.t0 + v.dur))).toBeLessThan(0.2);
    // sussurro: sem pulsos glotais, a autocorrelação NO PERÍODO DA VOZ (f0 = 120 Hz ±) é bem menor que na voz normal
    const norm = renderUtterance("'a", base, { raw: true });
    const whisper = renderUtterance("'a", { ...base, whisper: 1 }, { raw: true });
    const peri = (y) => {
      const a = Math.round(y.length * 0.3), b = Math.round(y.length * 0.7);
      let e = 0; for (let i = a; i < b; i++) e += y[i] * y[i];
      let best = 0;
      for (let lag = Math.round(SPEECH_SR / 130); lag <= Math.round(SPEECH_SR / 108); lag++) {
        let s = 0; for (let i = a; i + lag < b; i++) s += y[i] * y[i + lag];
        best = Math.max(best, s / e);
      }
      return best;
    };
    expect(peri(norm)).toBeGreaterThan(0.5);
    expect(peri(whisper)).toBeLessThan(peri(norm) * 0.5);
  });

  it('há silêncio de verdade na pausa da vírgula e plosivas têm fechamento mudo + estouro', () => {
    const ph = "'a, 'a";
    const plan = planUtterance(ph, base);
    const x = renderUtterance(ph, base, { raw: true });
    const pause = segOf(plan, 'pause');
    const vowel = segOf(plan, 'v');
    const vr = rms(x, idx(vowel.t0 + vowel.tr), idx(vowel.t0 + vowel.dur));
    const pr = rms(x, idx(pause.t0 + pause.tr + 0.02), idx(pause.t0 + pause.dur));
    expect(pr).toBeLessThan(vr * 0.08);
    const pl = planUtterance("'ata", base);
    const y = renderUtterance("'ata", base, { raw: true });
    const clo = segOf(pl, 'closure'), bur = segOf(pl, 'burst');
    const cr = rms(y, idx(clo.t0 + clo.tr + 0.005), idx(clo.t0 + clo.dur));
    const br = rms(y, idx(bur.t0), idx(bur.t0 + bur.dur));
    expect(br).toBeGreaterThan(cr * 5);
  });

  it('entonação: pergunta (?) sobe no fim; afirmação e exclamação descem; tônica tem pico', () => {
    const f0 = (ph) => { const p = planUtterance(ph, { ...base, range: 0.25 }); return { p, f: f0Contour(p, { ...base, range: 0.25 }) }; };
    const q = f0("s'a?"), d = f0("s'a."), e = f0("s'a!");
    const endQ = q.p.finals[0].t0;
    expect(q.f(endQ - 0.02)).toBeGreaterThan(q.f(endQ - 0.3) * 1.1);
    const endD = d.p.finals[0].t0;
    expect(d.f(endD - 0.02)).toBeLessThan(d.f(endD - 0.3) * 0.95);
    expect(e.f(e.p.finals[0].t0 - 0.02)).toBeLessThan(e.f(e.p.finals[0].t0 - 0.3));
    const a = f0("sa 's'a sa"); // acento
    const peak = a.p.accents[0].t;
    expect(a.f(peak)).toBeGreaterThan(a.f(peak + 0.25));
  });

  it('o grave rouco/ogro: período maior (f0 baixo) e rouquidão não quebra o sinal', () => {
    const ogre = renderUtterance("'a", VOICE_PROFILES.o_ogre);
    const worker = renderUtterance("'a", VOICE_PROFILES.h_worker);
    const m = (x) => [Math.round(x.length * 0.3), Math.round(x.length * 0.7)];
    expect(periodOf(ogre, ...m(ogre), 80, 700)).toBeGreaterThan(periodOf(worker, ...m(worker), 80, 700) * 1.7);
    expect(ogre.every(Number.isFinite)).toBe(true);
  });

  it('fala vazia ou só pontuação não quebra', () => {
    expect(renderUtterance('', base).length).toBeGreaterThan(0);
    expect(renderUtterance('.', base).every(Number.isFinite)).toBe(true);
  });

  it('render rápido: uma fala leva poucos ms (cache evita refazer)', () => {
    renderUtterance("s'a", base); // aquece o JIT
    const t0 = performance.now();
    renderUtterance("s'i~, se~J'oh!", VOICE_PROFILES.h_soldier);
    expect(performance.now() - t0).toBeLessThan(200);
  });
});

describe('F7-08 vozes e falas por unidade (PT-BR neutro, originais)', () => {
  const allLines = Object.entries(LINES).flatMap(([g, k]) => ['select', 'order'].flatMap((kind) => k[kind].map((l, i) => ({ g, kind, i, ...l }))));

  it('todas as falas parseiam e sintetizam dentro da faixa de duração e volume', () => {
    expect(allLines.length).toBeGreaterThan(60);
    for (const l of allLines) {
      const voice = VOICE_PROFILES.h_soldier;
      const plan = planUtterance(l.ph, voice);
      expect(plan.total, `${l.g} ${l.kind} ${l.i} ${l.text}`).toBeGreaterThan(0.3);
      expect(plan.total, `${l.g} ${l.kind} ${l.i} ${l.text}`).toBeLessThan(2.4);
      const x = renderUtterance(l.ph, voice);
      expect(x.every(Number.isFinite), l.text).toBe(true);
      expect(peak(x), l.text).toBeLessThanOrEqual(0.951);
    }
  });

  it('cada grupo tem pelo menos 2 falas de seleção e 2 de ordem (variedade), textos não vazios e distintos', () => {
    for (const [g, k] of Object.entries(LINES)) {
      for (const kind of ['select', 'order']) {
        expect(k[kind].length, `${g}.${kind}`).toBeGreaterThanOrEqual(2);
        const texts = k[kind].map((l) => l.text);
        expect(new Set(texts).size, `${g}.${kind}`).toBe(texts.length);
        for (const l of k[kind]) { expect(l.text.trim().length).toBeGreaterThan(1); expect(l.ph.trim().length).toBeGreaterThan(1); }
      }
    }
  });

  it('nenhuma fala copia frases/nomes próprios da Blizzard', () => {
    const banned = /zug|lok'?tar|work work|job'?s done|yes,? my lord|more work|stormwind|orgrimmar|thrall|warcraft/i;
    for (const l of allLines) expect(l.text + ' ' + l.ph).not.toMatch(banned);
  });

  it('perfis de voz têm campos válidos e as vozes soam diferentes (f0 humano > orc > ogro)', () => {
    for (const [id, v] of Object.entries(VOICE_PROFILES)) {
      expect(v.f0, id).toBeGreaterThan(40);
      expect(v.f0, id).toBeLessThan(260);
      expect(v.fs, id).toBeGreaterThan(0.5);
      expect(v.fs, id).toBeLessThan(1.5);
    }
    expect(VOICE_PROFILES.h_worker.f0).toBeGreaterThan(VOICE_PROFILES.o_soldier.f0);
    expect(VOICE_PROFILES.o_soldier.f0).toBeGreaterThan(VOICE_PROFILES.o_ogre.f0);
    expect(VOICE_PROFILES.o_ogre.fs).toBeLessThan(VOICE_PROFILES.h_soldier.fs);
  });

  it('toda unidade dos dados resolve para um falante com falas (só neutras sem combate ficam mudas)', () => {
    const silent = [];
    for (const [type, def] of Object.entries(UNITS)) {
      for (const f of ['human', 'orc']) {
        const sp = speakerFor(type, f);
        if (!sp) { if (f === 'human') silent.push(type); continue; }
        expect(LINES[sp.group], `${type}→${sp.group}`).toBeTruthy();
        expect(VOICE_PROFILES[sp.voice], `${type}→${sp.voice}`).toBeTruthy();
        expect(roleOf(type)).toBe(sp.role);
      }
      void def;
    }
    expect(silent).toEqual(['sheep']);
  });

  it('papéis e grupos esperados por facção', () => {
    const g = (t, f) => speakerFor(t, f).group;
    expect(g('villager')).toBe('h.worker');
    expect(g('peon')).toBe('o.worker');
    expect(g('knight')).toBe('h.soldier');
    expect(g('archer')).toBe('h.soldier');
    expect(g('grunt')).toBe('o.soldier');
    expect(g('ogre')).toBe('o.ogre');
    expect(g('mage')).toBe('h.caster');
    expect(g('necromancer')).toBe('o.caster');
    expect(g('hero_brann')).toBe('h.hero');
    expect(g('hero_drogath')).toBe('o.hero');
    expect(g('ballista')).toBe('h.crew');
    expect(g('catapult')).toBe('o.crew');
    expect(g('frigate')).toBe('h.crew');
    expect(g('war_galley')).toBe('o.crew');
    expect(g('skeleton')).toBe('x.undead');
    expect(g('watching_eye')).toBe('x.watcher');
    expect(g('war_serpent')).toBe('x.beast');
    expect(g('tanker', 'orc')).toBe('o.crew');
    expect(g('tanker', 'human')).toBe('h.crew');
    expect(speakerFor('knight').voice).toBe('h_knight');
    expect(speakerFor('axethrower').voice).toBe('o_archer');
    expect(speakerFor('castle')).toBe(null); // construção não fala
    expect(speakerFor('sheep')).toBe(null);
  });

  it('numa seleção mista quem fala é o de maior patente; empate = menor id; sem voz = null', () => {
    const mk = (id, type) => ({ id, type, ownerId: 0 });
    const lead = (list) => leaderOf(list, () => 'human');
    expect(lead([mk(5, 'villager'), mk(3, 'knight'), mk(9, 'hero_brann')]).unit.id).toBe(9);
    expect(lead([mk(5, 'villager'), mk(3, 'knight'), mk(2, 'mage')]).unit.id).toBe(2);
    expect(lead([mk(8, 'knight'), mk(4, 'archer')]).unit.id).toBe(4);
    expect(lead([mk(1, 'sheep')])).toBe(null);
    expect(lead([])).toBe(null);
    expect(ROLE_RANK.hero).toBeGreaterThan(ROLE_RANK.caster);
    expect(ROLE_RANK.soldier).toBeGreaterThan(ROLE_RANK.worker);
  });
});

describe('F7-08 diretor de falas (escolha e frequência)', () => {
  const sp = speakerFor('knight');

  it('nunca repete a mesma fala em seguida e usa todas com o tempo', () => {
    const d = createSpeechDirector({ rng: createAudioRng(3) });
    let last = null;
    const seen = new Set();
    let t = 0;
    for (let i = 0; i < 200; i++) {
      t += 1; // acima de selectGap
      const line = d.pick('select', sp, t);
      expect(line).toBeTruthy();
      expect(line.key).not.toBe(last);
      last = line.key;
      seen.add(line.key);
    }
    expect(seen.size).toBe(LINES[sp.group].select.length);
  });

  it('seleção respeita o intervalo mínimo (clique frenético não metralha); ordem tem intervalo maior', () => {
    const d = createSpeechDirector({ rng: createAudioRng(1) });
    expect(d.pick('select', sp, 10)).toBeTruthy();
    expect(d.pick('select', sp, 10 + SPEECH_POLICY.selectGap - 0.01)).toBe(null);
    expect(d.pick('select', sp, 10 + SPEECH_POLICY.selectGap + 0.01)).toBeTruthy();
    expect(d.pick('order', sp, 20)).toBeTruthy();
    expect(d.pick('order', sp, 20.5)).toBe(null);
    expect(d.pick('order', sp, 20 + SPEECH_POLICY.orderGap + 0.01)).toBeTruthy();
  });

  it('ordem não corta uma fala que acabou de começar (mas seleção sempre interrompe)', () => {
    const d = createSpeechDirector({ rng: createAudioRng(2) });
    d.started(5, 1.2); // fala tocando de 5 a 6,2
    expect(d.speaking(5.5)).toBe(true);
    expect(d.pick('order', sp, 5.2)).toBe(null); // < cutAfter
    expect(d.pick('select', sp, 5.2)).toBeTruthy();
    const d2 = createSpeechDirector({ rng: createAudioRng(2) });
    d2.started(5, 1.2);
    expect(d2.pick('order', sp, 5 + SPEECH_POLICY.cutAfter + 0.05)).toBeTruthy(); // já tocou o bastante: pode cortar
    expect(d.speaking(7)).toBe(false);
  });

  it('sem falante ou grupo desconhecido = nada; entrega chave estável e voz do falante', () => {
    const d = createSpeechDirector();
    expect(d.pick('select', null, 0)).toBe(null);
    expect(d.pick('select', { group: 'x.nada', voice: 'h_soldier' }, 0)).toBe(null);
    const line = d.pick('order', speakerFor('grunt'), 0);
    expect(line.key).toMatch(/^o\.soldier\.order\.\d+$/);
    expect(line.voiceId).toBe('o_soldier');
    expect(line.voice).toBe(VOICE_PROFILES.o_soldier);
    expect(line.ph.length).toBeGreaterThan(1);
  });
});
