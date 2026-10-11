/**
 * MusicPlayer.js (F7-08) — toca as faixas procedurais (`musicScores.js`) com um agendador de antecipação e faz o
 * CROSSFADE entre faixas (paz ⇄ combate, facção). Cada faixa em execução tem o próprio GainNode. A que sai segue
 * agendando por uns instantes (as notas já soam sob o fade), para de agendar quando o ganho chega perto de zero e é
 * desconectada depois da cauda das notas.
 *
 * Uso: `play(id)` (crossfade), `stop()`, `tick()` chamado por um temporizador do motor a cada ~150 ms. O relógio é o do
 * AudioContext (`ctx.currentTime`), então nada depende de `Date.now`/`performance.now`.
 */
import { TRACKS, eventsForStep, trackLength, stepSeconds } from './musicScores.js';
import { playInstrument } from './instruments.js';

const LOOKAHEAD = 1.0; // s agendados à frente (tolera timers estrangulados em aba em segundo plano)
const MAX_PENDING_STEPS = 24; // teto por tick (nunca trava se o relógio saltar)

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
    this.currentId = null;
    this.stats = { notes: 0, switches: 0 };
  }

  get playing() {
    return this.currentId !== null;
  }

  /** Começa `id` (crossfade a partir da atual). Mesma faixa = não faz nada. */
  play(id, { fade = 2.5 } = {}) {
    const track = TRACKS[id];
    if (!track || this.currentId === id) return false;
    const now = this.ctx.currentTime;
    const prev = this.runs[this.runs.length - 1];
    if (prev) this._fadeOut(prev, now, fade);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.setTargetAtTime(1, now, fade / 3);
    gain.connect(this.out);
    this.runs.push({ id, track, gain, step: 0, next: now + 0.12, killAt: Infinity, stepSec: stepSeconds(track) });
    this.currentId = id;
    this.stats.switches++;
    return true;
  }

  /** Para a faixa atual com fade (a música cala; `play` retoma). */
  stop({ fade = 1.2 } = {}) {
    const prev = this.runs[this.runs.length - 1];
    if (prev && prev.killAt === Infinity) this._fadeOut(prev, this.ctx.currentTime, fade);
    this.currentId = null;
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
      let n = 0;
      while (run.next < now + LOOKAHEAD && n++ < MAX_PENDING_STEPS) {
        this._scheduleStep(run);
        run.step++;
        run.next += run.stepSec;
      }
    }
  }

  _scheduleStep(run) {
    const evs = eventsForStep(run.track, run.step, { seed: this.seed, lite: this.lite });
    for (let i = 0; i < evs.length; i++) {
      const e = evs[i];
      const t = Math.max(this.ctx.currentTime, run.next + this.rng.signed(0.006)); // humanização leve de tempo
      const vel = Math.min(1, e.vel * (1 + this.rng.signed(0.08)));
      playInstrument(this.ctx, run.gain, this.noise, e.inst, e.midi, t, e.dur * run.stepSec, vel, this.rng);
      this.stats.notes++;
    }
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
  }
}
