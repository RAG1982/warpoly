// SoundManager.js — fachada de áudio do jogo (F7-08: antes um sintetizador único; agora delega ao motor em src/audio/).
//
// Mantém a API que a HUD, o InputManager e o MissionController já usam (`resume`, `playSelect`, `playOrder`, `startMusic`,
// `setSfxVolume`…) e acrescenta: volume por canal (música/efeitos/falas + geral), nível de áudio por preset (`?audio=`),
// som posicional (`playChop(pos)`…), falas de unidade, música adaptativa e ambiência por partida.
//
// Regras: o AudioContext só nasce depois de um gesto do usuário (`init` via `resume`, chamados pelos ouvintes de
// click/keydown do main.js); nível 'off' (testes/automação, `?audio=0`) não cria nada; nada aqui toca a simulação.
import { AudioEngine } from '../audio/AudioEngine.js';
import { clampVolume } from '../audio/audioConfig.js';

export class SoundManager {
  /**
   * @param {{level?:string, env?:{AudioContext?:Function, log?:Function, timers?:object|null}}} [opts]
   *   `level`: 'off'|'low'|'med'|'high' (ver `detectAudioLevel`); `env` injeta AudioContext/log/timers (testes).
   */
  constructor({ level = 'med', env = {} } = {}) {
    this.env = env;
    this.level = level;
    this.ctx = null;
    this.engine = null;
    this.enabled = true; // mudo geral (toggleSound)
    this.musicEnabled = true; // preferência de música (toggleMusic)
    this.initialized = false;
    /** @type {{master:number, music:number, sfx:number, voice:number}} */
    this.volumes = { master: 1, music: 0.25, sfx: 0.5, voice: 0.8 };
    this._musicHold = false;
    this._match = null;
    this._listener = null;
    this._sceneProbe = null;
  }

  // Compatibilidade com o código antigo (leitura)
  get sfxVolume() { return this.volumes.sfx; }
  get musicVolume() { return this.volumes.music; }
  get isMusicPlaying() { return !!(this.engine && this.engine.music.playing); }

  // ------------------------------------------------------------------ ciclo de vida
  /** Cria o AudioContext e o motor. Só chamar a partir de um gesto do usuário (ver `resume`). */
  init() {
    if (this.initialized || this.level === 'off') return;
    try {
      const Ctor = this.env.AudioContext || (typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext));
      if (!Ctor) throw new Error('Web Audio indisponível');
      this.ctx = new Ctor();
      this.engine = new AudioEngine({ ctx: this.ctx, level: this.level, timers: this.env.timers === undefined ? globalThis : this.env.timers });
      this.initialized = true;
      this._pushState(true);
      if (this._match) this.engine.beginMatch(this._match);
      const log = this.env.log || ((...a) => console.info(...a));
      log(`[WarPoly áudio] AudioContext iniciado: estado=${this.ctx.state}, nível=${this.level}, ${this.ctx.sampleRate} Hz`);
    } catch (e) {
      console.warn('[WarPoly áudio] Web Audio indisponível ou bloqueado', e);
      this.engine = null;
      this.ctx = null;
    }
  }

  /** Gesto do usuário: cria o motor na primeira vez e retoma um contexto suspenso (autoplay/aba em segundo plano). */
  resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      try { this.ctx.resume().catch(() => {}); } catch { /* ok */ }
    }
    if (!this.initialized) this.init();
  }

  /** Muda o nível (preset/`?audio=`). 'off' cala; sair de 'off' só vale após um gesto (cria o motor em `resume`). */
  setLevel(level) {
    if (level === this.level) return;
    this.level = level;
    if (this.engine) this.engine.setLevel(level);
    else if (level !== 'off' && this._match && this.initialized === false) { /* o motor nasce no próximo gesto */ }
  }

  dispose() {
    if (this.engine) this.engine.dispose();
    this.engine = null;
    this.ctx = null;
    this.initialized = false;
  }

  _pushState(immediate = false) {
    const e = this.engine;
    if (!e) return;
    e.setVolumes({ ...this.volumes, master: this.enabled ? this.volumes.master : 0 }, immediate);
    e.setMusicOn(this.musicEnabled);
    e.setMusicHold(this._musicHold);
    if (this._listener) e.setListener(this._listener);
    if (this._sceneProbe) e.sceneProbe = this._sceneProbe;
  }

  // ------------------------------------------------------------------ volumes e liga/desliga
  /** @param {{master?:number, music?:number, sfx?:number, voice?:number}} v  valores 0..1 por canal */
  setVolumes(v) {
    for (const k of ['master', 'music', 'sfx', 'voice']) if (v[k] !== undefined) this.volumes[k] = clampVolume(v[k], this.volumes[k]);
    this._pushState();
  }

  setMasterVolume(v) { this.setVolumes({ master: v }); }
  setSfxVolume(v) { this.setVolumes({ sfx: v }); }
  setMusicVolume(v) { this.setVolumes({ music: v }); }
  setVoiceVolume(v) { this.setVolumes({ voice: v }); }

  toggleSound() {
    this.enabled = !this.enabled;
    this._pushState();
    return this.enabled;
  }

  toggleMusic() {
    this.musicEnabled = !this.musicEnabled;
    this._pushState();
    return this.musicEnabled;
  }

  // ------------------------------------------------------------------ efeitos
  /** Toca um efeito pelo nome da receita (`audio/sfxRecipes.js`). `opts`: pos, priority, gain, variant. */
  playSfx(name, opts) {
    const e = this.engine;
    if (!e || !this.enabled) return false;
    if (this.ctx.state === 'suspended') this.resume();
    return e.playSfx(name, opts);
  }

  // API antiga (sons de trabalho/combate aceitam a posição no mundo para atenuar pela distância)
  playChop(pos) { return this.playSfx('chop', { pos }); }
  playMineGold(pos) { return this.playSfx('mineGold', { pos }); }
  playMineStone(pos) { return this.playSfx('mineStone', { pos }); }
  playHammer(pos) { return this.playSfx('hammer', { pos }); }
  playSword(pos) { return this.playSfx('sword', { pos }); }
  playBow(pos) { return this.playSfx('bow', { pos }); }
  playArrowHit(pos) { return this.playSfx('arrowHit', { pos }); }
  playBuildPlace(pos) { return this.playSfx('buildPlace', { pos }); }
  // Interface (sem posição)
  playSelect() { return this.playSfx('select'); }
  playOrder() { return this.playSfx('order'); }
  playBuildComplete() { return this.playSfx('buildComplete'); }
  /** F6-05: bipe curto e grave de recusa (sem comida, ação indisponível). */
  playError() { return this.playSfx('error'); }
  playAlarm() { return this.playSfx('alarm'); }
  playVictory() { return this.playSfx('victory'); }

  // ------------------------------------------------------------------ falas, posição e partida
  /** Tempo do áudio em segundos (relógio do AudioContext; antes do motor existir, 0). */
  now() {
    return this.engine ? this.engine.now() : 0;
  }

  /** Há como falar agora? (motor ligado, nível com falas e canal de falas audível) */
  canSpeak() {
    const e = this.engine;
    return !!(e && this.enabled && e.caps.speech && this.volumes.voice > 0 && this.volumes.master > 0);
  }

  /** Toca uma fala já escolhida (`createSpeechDirector().pick`). Devolve a duração (0 = não falou). */
  speak(line) {
    if (!this.canSpeak()) return 0;
    if (this.ctx.state === 'suspended') this.resume();
    return this.engine.speak(line);
  }

  setListener(l) {
    this._listener = l;
    if (this.engine) this.engine.setListener(l);
  }

  /** `() => ({ timeOfDay, dayNight })` para os insetos da ambiência à noite. */
  setSceneProbe(fn) {
    this._sceneProbe = fn;
    if (this.engine) this.engine.sceneProbe = fn;
  }

  /** Começa a partida: música da facção (paz/combate) e ambiência do tileset. Vale mesmo antes do 1º gesto. */
  beginMatch(match) {
    this._match = match;
    if (this.engine) this.engine.beginMatch(match);
  }

  endMatch() {
    this._match = null;
    this._sceneProbe = null;
    if (this.engine) { this.engine.sceneProbe = null; this.engine.endMatch(); }
  }

  /** Peso de combate (música adaptativa). */
  noteCombat(weight) {
    if (this.engine) this.engine.noteCombat(weight);
  }

  // ------------------------------------------------------------------ música
  /** Retoma a música (depois de `stopMusic`). A preferência do jogador continua em `musicEnabled`/volume. */
  startMusic() {
    this._musicHold = false;
    if (this.engine) this.engine.setMusicHold(false);
  }

  /** Silencia a música (missão/cutscene) sem mexer nas preferências. */
  stopMusic() {
    this._musicHold = true;
    if (this.engine) this.engine.setMusicHold(true);
  }

  /** Estado do áudio para depuração (`game.sound.stats()`). */
  stats() {
    return this.engine ? this.engine.stats() : { level: this.level, state: 'sem gesto (AudioContext não criado)', volumes: { ...this.volumes } };
  }
}
