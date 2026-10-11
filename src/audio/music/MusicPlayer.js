/**
 * MusicPlayer.js (F7-08) — toca as faixas procedurais (`musicScores.js`) com um agendador de antecipação e faz o
 * CROSSFADE entre faixas (paz ⇄ combate, facção). Cada faixa em execução tem o próprio GainNode. A que sai segue
 * agendando por uns instantes (as notas já soam sob o fade), para de agendar quando o ganho chega perto de zero e é
 * desconectada depois da cauda das notas.
 *
 * Uso: `play(família, { variant })` ou `playTrack(faixa)` (crossfade), `stop()`, `setIntensity(0..1)` (evolução pelo tempo de
 * partida, ver `intensity.js`), `tick()` chamado por um temporizador do motor a cada ~150 ms. O
 * relógio é o do AudioContext (`ctx.currentTime`), então nada depende de `Date.now`/`performance.now`.
 *
 * ORÇAMENTO DE CPU (nada de bloquear o thread principal por mais de ~16 ms): a música é GERADA de forma incremental, só um
 * passo (semicolcheia) por vez e só dentro da janela de antecipação de `LOOKAHEAD` s (≈ 8–9 passos); cada passo gera
 * ≤ ~16 notas (verificado em tests/unit/musicScores.test.js) e cada nota cria uns 4–6 nós de áudio (sem decodificar nem
 * pré-renderizar buffers). Cada `tick` agenda no máximo `MAX_NOTES_PER_TICK` notas e `MAX_PENDING_STEPS` passos: o que não
 * coube fica para o tick seguinte (a antecipação de 1 s absorve), então um tick nunca passa de poucos milissegundos.
 * A frase da melodia é memorizada por laço (cache pequeno), então o custo por passo é só ler tabelas.
 */
import { trackFor, eventsForStep, trackLength, stepSeconds } from './musicScores.js';
import { quantizeIntensity } from './intensity.js';
import { playInstrument } from './instruments.js';

const LOOKAHEAD = 1.0; // s agendados à frente (tolera timers estrangulados em aba em segundo plano)
const MAX_PENDING_STEPS = 24; // teto por tick (nunca trava se o relógio saltar)
const MAX_NOTES_PER_TICK = 80; // teto de notas criadas por tick (≈ 5 passos densos): limita o trabalho no thread principal

export class MusicPlayer {
  /**
   * @param {{ctx:BaseAudioContext, out:AudioNode, noise:AudioBuffer, rng:()=>number, lite?:boolean, seed?:number}} o
   */
  constructor({ ctx, out, noise, rng, lite = false, seed = 1 }) {
    this.ctx = ctx;
    this.out = out;
    this.noise = noise;
    this.rng = rng;
    this.lite = lite;
    this.seed = seed;
    /** @type {Array<object>} faixas vivas (a última é a atual) */
    this.runs = [];
    this.currentId = null; // família da faixa tocando (ex.: 'orc_combat')
    this.currentVariant = 0; // variação (índice na família)
    this.currentTrackId = null; // id completo da faixa (ex.: 'orc_combat_2')
    this.intensity = 0; // 0..1: evolução pelo tempo de partida
    this.stats = { notes: 0, switches: 0 };
  }

  get playing() {
    return this.currentId !== null;
  }

  /**
   * Começa a família `id` na `variant` (crossfade a partir da atual). Mesma família e mesma variação = não faz nada,
   * salvo `force` (rodízio de variações dentro da mesma família).
   */
  play(id, { fade = 2.5, variant = 0, force = false } = {}) {
    return this.playTrack(trackFor(id, variant), { fade, force });
  }

  /** Começa uma faixa específica (objeto de `musicScores`); o crossfade e o resto seguem como em `play`. */
  playTrack(track, { fade = 2.5, force = false } = {}) {
    if (!track) return false;
    const id = track.family;
    if (this.currentTrackId === track.id && !force) return false;
    const now = this.ctx.currentTime;
    const prev = this.runs[this.runs.length - 1];
    if (prev) this._fadeOut(prev, now, fade);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.setTargetAtTime(1, now, fade / 3);
    gain.connect(this.out);
    this.runs.push({ id, track, gain, step: 0, next: now + 0.12, killAt: Infinity, stepSec: stepSeconds(track, this.intensity) });
    this.currentId = id;
    this.currentTrackId = track.id;
    this.currentVariant = track.variant;
    this.stats.switches++;
    return true;
  }

  /** Voltas completas já tocadas da faixa atual (0 se nada toca). */
  loopsPlayed() {
    const run = this.runs[this.runs.length - 1];
    if (!run || run.killAt !== Infinity) return 0;
    return Math.floor(run.step / trackLength(run.track));
  }

  /** Para a faixa atual com fade (a música cala; `play` retoma). */
  stop({ fade = 1.2 } = {}) {
    const prev = this.runs[this.runs.length - 1];
    if (prev && prev.killAt === Infinity) this._fadeOut(prev, this.ctx.currentTime, fade);
    this.currentId = null;
    this.currentTrackId = null;
  }

  /** Intensidade 0..1 (tempo de partida). Quantizada a 1/16: o andamento e as camadas mudam em degraus pequenos. */
  setIntensity(x) {
    this.intensity = quantizeIntensity(Number.isFinite(x) ? x : 0);
  }

  /** Posição na volta atual da faixa que toca (para a barra de progresso do inspetor): { pos, dur, loop } em segundos. */
  progress() {
    const run = this.runs[this.runs.length - 1];
    if (!run || run.killAt !== Infinity) return { pos: 0, dur: 0, loop: 0 };
    const len = trackLength(run.track);
    const dur = len * run.stepSec;
    const ahead = Math.max(0, run.next - this.ctx.currentTime); // passos já agendados à frente do relógio
    const total = run.step * run.stepSec - ahead;
    const loop = Math.max(0, Math.floor(total / dur));
    return { pos: Math.max(0, total - loop * dur), dur, loop };
  }

  _fadeOut(run, now, fade) {
    run.gain.gain.cancelScheduledValues(now);
    run.gain.gain.setTargetAtTime(0, now, fade / 3);
    run.killAt = now + fade * 1.6 + 3; // cauda das notas já agendadas
    run.stopScheduling = now + fade * 1.2; // depois disso o ganho é ~0: não adianta agendar mais
  }

  /** Agenda os passos que cabem na janela de antecipação e recolhe as faixas que terminaram. */
  tick() {
    const now = this.ctx.currentTime;
    for (let r = this.runs.length - 1; r >= 0; r--) {
      const run = this.runs[r];
      if (now >= run.killAt) {
        try { run.gain.disconnect(); } catch { /* já desconectado */ }
        this.runs.splice(r, 1);
        continue;
      }
      if (run.stopScheduling !== undefined && now >= run.stopScheduling) continue;
      if (run.next < now - 0.1) run.next = now + 0.05; // ficou para trás (timer estrangulado): ressincroniza
      run.stepSec = stepSeconds(run.track, this.intensity); // andamento acompanha a intensidade
      let n = 0;
      let notes = 0;
      while (run.next < now + LOOKAHEAD && n++ < MAX_PENDING_STEPS && notes < MAX_NOTES_PER_TICK) {
        notes += this._scheduleStep(run);
        run.step++;
        run.next += run.stepSec;
      }
    }
  }

  _scheduleStep(run) {
    const evs = eventsForStep(run.track, run.step, { seed: this.seed, lite: this.lite, intensity: this.intensity });
    for (let i = 0; i < evs.length; i++) {
      const e = evs[i];
      const t = Math.max(this.ctx.currentTime, run.next + this.rng.signed(0.006)); // humanização leve de tempo
      const vel = Math.min(1, e.vel * (1 + this.rng.signed(0.08)));
      playInstrument(this.ctx, run.gain, this.noise, e.inst, e.midi, t, e.dur * run.stepSec, vel, this.rng);
      this.stats.notes++;
    }
    return evs.length;
  }

  /** Volta de uma faixa = passos/volta (para depuração e testes). */
  loopSteps() {
    const run = this.runs[this.runs.length - 1];
    return run ? trackLength(run.track) : 0;
  }

  dispose() {
    for (const run of this.runs) {
      try { run.gain.disconnect(); } catch { /* ok */ }
    }
    this.runs.length = 0;
    this.currentId = null;
    this.currentTrackId = null;
  }
}
