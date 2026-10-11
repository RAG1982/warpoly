/**
 * musicPreview.js — controlador de ÁUDIO do player de músicas do inspetor. Reaproveita o código do jogo: o mesmo `AudioEngine`
 * (mixer: barramento de música/efeitos → mestre → limitador) e o mesmo `MusicPlayer` (gerador incremental de notas), então o
 * que se ouve aqui é o que toca no jogo. O `AudioContext` só nasce em `ensureAudio()`, que a tela chama dentro de um clique.
 *
 * Modos: `single` (uma faixa, com laço opcional), `playlist` (só os marcados, uma volta de cada, em sequência) e `transition`
 * (paz → combate → paz da facção, com o crossfade real do jogo). O relógio é o do AudioContext; `tick()` roda a cada ~100 ms
 * (temporizador injetável: testes passam `timers: null` e chamam `tick()` à mão). Pausar = `ctx.suspend()` (tudo congela).
 */
import { AudioEngine } from '../audio/AudioEngine.js';
import { MusicPlayer } from '../audio/music/MusicPlayer.js';
import { TRACKS_BY_ID } from '../audio/music/musicScores.js';
import { getTrack } from '../audio/music/catalog.js';
import { transitionPlan, nextInPlaylist } from './musicPanelModel.js';

const TICK_MS = 100;

export class MusicPreview {
  /**
   * @param {{AudioContextCtor?:Function, timers?:{setInterval:Function, clearInterval:Function}|null}} [o]
   */
  constructor({ AudioContextCtor = null, timers = globalThis } = {}) {
    this.Ctor = AudioContextCtor;
    this.timers = timers;
    this.ctx = null;
    this.engine = null;
    this.music = null;
    this.volume = 0.6;
    this.loop = true;
    this.intensity = 0;
    this.mode = 'single'; // 'single' | 'playlist' | 'transition'
    this.current = null; // { id, kind:'music'|'sfx', start, dur }
    this.paused = false;
    this.list = [];
    this.plan = null; // transição: { steps, index, endsAt }
    this.error = null;
    this._timer = null;
  }

  get ready() {
    return !!this.ctx;
  }

  /** Cria o AudioContext e o motor (SÓ dentro de um gesto do usuário). Devolve se há áudio. */
  ensureAudio() {
    if (this.ctx) {
      this._resumeCtx();
      return true;
    }
    try {
      const Ctor = this.Ctor || (typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext));
      if (!Ctor) throw new Error('Web Audio indisponível');
      this.ctx = new Ctor();
      this.engine = new AudioEngine({
        ctx: this.ctx, level: 'high', volumes: { master: 1, music: this.volume, sfx: 0.8, voice: 0 }, musicOn: false, timers: null
      });
      // o MusicPlayer do jogo, ligado ao barramento de música do mesmo mixer (a música do motor fica parada: musicOn=false)
      this.music = new MusicPlayer({ ctx: this.ctx, out: this.engine.buses.music, noise: this.engine.noise.white, rng: this.engine.rng, seed: this.engine.musicSeed });
      this.music.setIntensity(this.intensity);
      if (this.timers && this.timers.setInterval) this._timer = this.timers.setInterval(() => this.tick(), TICK_MS);
      this._resumeCtx();
      return true;
    } catch (e) {
      this.error = String((e && e.message) || e);
      this.ctx = null;
      this.engine = null;
      this.music = null;
      return false;
    }
  }

  _resumeCtx() {
    this.paused = false;
    try {
      if (this.ctx && this.ctx.state === 'suspended' && this.ctx.resume) this.ctx.resume().catch(() => {});
    } catch { /* sem áudio */ }
  }

  /** Toca a faixa `id` (música em laço/uma volta, ou fanfarra). `mode` volta a 'single'. */
  play(id, { keepMode = false } = {}) {
    const entry = getTrack(id);
    if (!entry || !this.ensureAudio()) return false;
    if (!keepMode) {
      this.mode = 'single';
      this.plan = null;
      this.list = [];
    }
    this._resumeCtx();
    const now = this.ctx.currentTime;
    if (entry.kind === 'sfx') {
      this.music.stop({ fade: 0.4 });
      this.engine.playSfx(entry.sfx);
      this.current = { id, kind: 'sfx', start: now, dur: entry.seconds };
      return true;
    }
    const track = TRACKS_BY_ID[id];
    if (!track) return false;
    this.music.playTrack(track, { fade: this.music.playing ? 1.4 : 0.25, force: true });
    this.current = { id, kind: 'music', start: now, dur: 0 };
    return true;
  }

  /** Pausa/retoma (congela o relógio do AudioContext). Devolve se ficou pausado. */
  togglePause() {
    if (!this.ctx || !this.current) return false;
    try {
      if (this.paused) {
        this._resumeCtx();
      } else {
        this.paused = true;
        if (this.ctx.suspend) this.ctx.suspend().catch(() => {});
      }
    } catch { /* sem áudio */ }
    return this.paused;
  }

  stop() {
    if (this.music) this.music.stop({ fade: 0.6 });
    this.current = null;
    this.plan = null;
    this.list = [];
    this.mode = 'single';
    if (this.paused) this._resumeCtx();
  }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, Number(v) || 0));
    if (this.engine) this.engine.setVolumes({ music: this.volume });
  }

  setLoop(on) {
    this.loop = !!on;
  }

  /** Intensidade 0..1 (evolução pelo tempo de partida das faixas de paz). */
  setIntensity(x) {
    this.intensity = Math.max(0, Math.min(1, Number(x) || 0));
    if (this.music) this.music.setIntensity(this.intensity);
  }

  /** "Só ouvir os marcados": toca a lista em sequência (uma volta de cada), em círculo. */
  startPlaylist(ids) {
    const list = ids.filter((id) => getTrack(id) && getTrack(id).kind === 'music');
    if (!list.length) return false;
    this.list = list;
    if (!this.play(list[0], { keepMode: true })) return false;
    this.mode = 'playlist';
    this.plan = null;
    return true;
  }

  /** "Ouvir transição paz → combate" da facção da faixa `id`. Devolve o plano (ou `null` se não se aplica). */
  startTransition(id, enabled) {
    const steps = transitionPlan(id, enabled);
    if (!steps || !this.ensureAudio()) return null;
    this.mode = 'transition';
    this.list = [];
    this.play(steps[0].id, { keepMode: true });
    this.plan = { steps, index: 0, endsAt: this.ctx.currentTime + steps[0].seconds };
    return steps;
  }

  /** Relógio interno (~100 ms): agenda notas, encerra voltas, avança lista/transição. */
  tick() {
    if (!this.ctx || !this.music) return;
    this.music.tick();
    if (this.paused || !this.current) return;
    const now = this.ctx.currentTime;
    const cur = this.current;
    if (cur.kind === 'sfx') {
      if (now - cur.start < cur.dur) return;
      if (this.mode === 'single' && this.loop) this.play(cur.id, { keepMode: true });
      else this.current = null;
      return;
    }
    if (this.mode === 'transition' && this.plan) {
      if (now < this.plan.endsAt) return;
      const next = this.plan.index + 1;
      if (next >= this.plan.steps.length) {
        this.stop();
        return;
      }
      const step = this.plan.steps[next];
      this.plan = { ...this.plan, index: next, endsAt: now + step.seconds };
      this.music.playTrack(TRACKS_BY_ID[step.id], { fade: 2.5, force: true });
      this.current = { id: step.id, kind: 'music', start: now, dur: 0 };
      return;
    }
    const done = this.music.progress().loop >= 1;
    if (!done) return;
    if (this.mode === 'playlist') this.play(nextInPlaylist(this.list, cur.id), { keepMode: true });
    else if (!this.loop) this.stop();
  }

  /** Estado para a tela. */
  state() {
    if (!this.current) return { status: 'idle', id: null, mode: this.mode, pos: 0, dur: 0, loop: 0, paused: false, step: null };
    const cur = this.current;
    let pos = 0;
    let dur = 0;
    let loop = 0;
    if (cur.kind === 'sfx') {
      dur = cur.dur;
      pos = Math.min(dur, Math.max(0, this.ctx.currentTime - cur.start));
    } else {
      ({ pos, dur, loop } = this.music.progress());
    }
    const step = this.plan ? { index: this.plan.index, total: this.plan.steps.length, label: this.plan.steps[this.plan.index].label, remaining: Math.max(0, this.plan.endsAt - this.ctx.currentTime) } : null;
    return { status: this.paused ? 'paused' : 'playing', id: cur.id, mode: this.mode, pos, dur, loop, paused: this.paused, step };
  }

  dispose() {
    if (this._timer !== null && this.timers && this.timers.clearInterval) this.timers.clearInterval(this._timer);
    this._timer = null;
    if (this.music) this.music.dispose();
    if (this.engine) this.engine.dispose();
    this.ctx = null;
    this.engine = null;
    this.music = null;
    this.current = null;
  }
}
