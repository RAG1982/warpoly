/**
 * AudioEngine.js (F7-08) — o motor de áudio de produção sobre um AudioContext (criado só depois de um gesto do usuário,
 * ver `SoundManager`). Responsabilidades:
 *
 *  MIXER      música, efeitos e falas em barramentos separados -> mestre -> DynamicsCompressor (limitador) -> saída.
 *             Volume por canal (+ geral) com suavização; a ambiência entra no barramento de efeitos; a música abaixa
 *             (ducking) enquanto uma fala toca.
 *  POSICIONAL `playSfx(nome, { pos })`: só soa o que está na CENA VISÍVEL (frustum da câmera + margem); ganho pela distância
 *             ao alvo da câmera e pelo zoom (longe = mais baixo e alcance menor) + panorama estéreo (attenuation.js) e
 *             limite de vozes com prioridade (VoicePool). Fora da cena/alcance nem cria nós.
 *  FALAS      `speak(...)`: sintetiza a fala por formantes (speech/), guarda o AudioBuffer em cache (LRU) e toca numa
 *             única "vaga" (a nova fala corta a anterior).
 *  MÚSICA     `MusicPlayer` + `MusicDirector`: paz × combate por facção com crossfade (combate recente = `noteCombat`).
 *  AMBIÊNCIA  `AmbiencePlayer` por tileset (+ insetos à noite).
 *
 * Só apresentação: nada aqui lê ou escreve a simulação, nenhum Math.random (RNG de render próprio) nem Date.now.
 * O relógio é `ctx.currentTime`; um temporizador de ~150 ms agenda notas, avalia o diretor de música e atualiza a ambiência.
 */
import { capsFor, createAudioRng, clampVolume } from './audioConfig.js';
import { positionalMix } from './attenuation.js';
import { VoicePool } from './VoicePool.js';
import { SFX, SFX_LIMITS } from './sfxRecipes.js';
import { createNoiseBuffers } from './noise.js';
import { MusicPlayer } from './music/MusicPlayer.js';
import { AmbiencePlayer } from './AmbiencePlayer.js';
import { MusicDirector, trackIdFor, pickVariant } from './musicDirector.js';
import { enabledVariants, normalizeSelection } from './music/catalog.js';
import { intensityFromGameTime } from './music/intensity.js';
import { ambienceMix, nightFactor } from './ambience.js';
import { renderUtterance, SPEECH_SR } from './speech/speechSynth.js';

const TICK_MS = 150;
const SPEECH_CACHE_MAX = 64;
const MENU_FACTION = 'human'; // música do menu = a de paz dos humanos
const ROTATE_AFTER_LOOPS = 3; // depois de tantas voltas da mesma variação (≈ 50 s), troca por outra da família (crossfade)

/** FNV-1a de 32 bits (semente por chave de fala: mesma fala = mesmas amostras). */
function hashKey(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export class AudioEngine {
  /**
   * @param {{ctx:BaseAudioContext, level?:string, seed?:number, volumes?:object, musicOn?:boolean, timers?:{setInterval:Function, clearInterval:Function}|null}} o
   *   `volumes`/`musicOn`: estado inicial do mixer (o `SoundManager` guarda as preferências antes do 1º gesto);
   *   `timers: null` desliga o temporizador interno (testes chamam `tick()` à mão).
   */
  constructor({ ctx, level = 'med', seed = 0x51f7, volumes = null, musicOn = true, timers = globalThis } = {}) {
    this.ctx = ctx;
    this.rng = createAudioRng(seed);
    this.level = level;
    this.caps = capsFor(level);
    this.volumes = { master: 1, music: 0.25, sfx: 0.5, voice: 0.8 };
    if (volumes) for (const k of ['master', 'music', 'sfx', 'voice']) if (volumes[k] !== undefined) this.volumes[k] = clampVolume(volumes[k], this.volumes[k]);
    this.listener = { x: 0, z: 0, zoom: 1, rightX: 1, rightZ: 0, viewProj: null, bounds: null };

    // --- mixer: barramentos -> mestre -> limitador -> saída
    this.master = ctx.createGain();
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -9;
    this.limiter.knee.value = 5;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.15;
    this.master.connect(this.limiter);
    this.limiter.connect(ctx.destination);
    this.musicDuck = ctx.createGain();
    this.musicDuck.connect(this.master);
    this.buses = { music: ctx.createGain(), sfx: ctx.createGain(), voice: ctx.createGain() };
    this.buses.music.connect(this.musicDuck);
    this.buses.sfx.connect(this.master);
    this.buses.voice.connect(this.master);
    this.ambienceBus = ctx.createGain();
    this.ambienceBus.gain.value = 0.55;
    this.ambienceBus.connect(this.buses.sfx);
    this.setVolumes(this.volumes, true);

    this.noise = createNoiseBuffers(ctx, this.rng);
    this.pool = new VoicePool({ max: this.caps.maxVoices, perKey: SFX_LIMITS.perKey, minGap: SFX_LIMITS.minGap });
    /** @type {Map<number, {vg:GainNode, sources:AudioScheduledSourceNode[], end:number}>} */
    this.live = new Map();
    this.counters = { played: 0, culled: 0, dropped: 0, speech: 0 };

    this.music = new MusicPlayer({ ctx, out: this.buses.music, noise: this.noise.white, rng: this.rng, lite: this.caps.music === 'lite' });
    this.ambience = new AmbiencePlayer({ ctx, out: this.ambienceBus, noise: this.noise, rng: this.rng });
    this.director = new MusicDirector();
    this.match = null; // { faction, tilesetId }
    this.musicSeed = seed >>> 0; // semente das variações de música (determinística, fora da sim)
    this._musicSerial = 0; // quantas faixas já começaram (entra no sorteio da variação)
    this._lastVariant = {}; // família -> última variação tocada (nunca repete em seguida)
    this.musicSelection = null; // seleção de faixas do jogador (Map do catálogo) ou null = padrões `inGame` do catálogo
    this.musicOn = !!musicOn; // preferência do jogador (música ligada)
    this.musicHold = false; // silêncio temporário (cutscene/missão)
    this.sceneProbe = null; // () => ({ timeOfDay, dayNight }) para a ambiência noturna
    this._speech = null;
    this._speechCache = new Map();
    this._ambienceAt = -Infinity;
    this._lastUpdate = 0;

    this._applyMusic(); // música do menu já no primeiro gesto (respeita volume/preferência/nível)
    this._timers = timers;
    this._timer = timers && timers.setInterval ? timers.setInterval(() => this.tick(), TICK_MS) : null;
  }

  /** Relógio do áudio (s). */
  now() {
    return this.ctx.currentTime;
  }

  get ready() {
    return this.level !== 'off';
  }

  // ------------------------------------------------------------------------------------------ mixer
  /** Aplica os volumes (0..1) de geral/música/efeitos/falas. `immediate` pula a suavização (criação do motor). */
  setVolumes(v, immediate = false) {
    const next = { ...this.volumes };
    for (const k of ['master', 'music', 'sfx', 'voice']) if (v[k] !== undefined) next[k] = clampVolume(v[k], next[k]);
    this.volumes = next;
    const now = this.ctx.currentTime;
    const apply = (node, value) => {
      node.gain.cancelScheduledValues(now);
      if (immediate) node.gain.setValueAtTime(value, now);
      else node.gain.setTargetAtTime(value, now, 0.03);
    };
    apply(this.master, next.master);
    apply(this.buses.music, next.music);
    apply(this.buses.sfx, next.sfx);
    apply(this.buses.voice, next.voice);
    if (this.music) this._applyMusic(); // (ainda não existe quando o construtor aplica os volumes iniciais)
  }

  setListener(l) {
    const L = this.listener;
    L.x = l.x; L.z = l.z; L.zoom = l.zoom;
    L.rightX = l.rightX ?? 1; L.rightZ = l.rightZ ?? 0;
    L.viewProj = l.viewProj ?? null; // projeção × visão da câmera (recorte pela cena visível)
    L.bounds = l.bounds ?? null;
  }

  /** Muda o nível (preset/`?audio=`): teto de vozes, ambiência e música leve; 'off' cala tudo. */
  setLevel(level) {
    this.level = level;
    this.caps = capsFor(level);
    for (const id of this.pool.setMax(this.caps.maxVoices)) this._stopVoice(id);
    this.music.lite = this.caps.music === 'lite';
    if (!this.ready) this._silenceAll();
    this._applyMusic();
    this._applyAmbience(true);
  }

  _silenceAll() {
    for (const id of [...this.live.keys()]) this._stopVoice(id);
    this.music.stop({ fade: 0.3 });
    this.ambience.stop(0.5);
    this._cutSpeech();
  }

  // ------------------------------------------------------------------------------------------ efeitos
  /**
   * Toca um efeito. `opts`: `pos` ({x,z} no mundo; ausente = interface, sem atenuação), `priority`, `gain`, `variant`, `key`.
   * @returns {boolean} true se uma voz foi criada
   */
  playSfx(name, opts = {}) {
    if (!this.ready || this.volumes.master <= 0 || this.volumes.sfx <= 0) return false;
    const recipe = SFX[name];
    if (!recipe) return false;
    const now = this.ctx.currentTime;
    let gain = opts.gain ?? 1;
    let pan = 0;
    if (opts.pos && this.caps.positional) {
      const m = positionalMix(this.listener, opts.pos, opts.margin);
      if (!m.audible) { this.counters.culled++; return false; }
      gain *= m.gain;
      pan = this.caps.pan ? m.pan : 0;
    }
    const req = this.pool.request({ key: opts.key || name, priority: opts.priority ?? recipe.priority ?? 1, loudness: gain, duration: recipe.dur }, now);
    if (!req.ok) { this.counters.dropped++; return false; }
    if (req.evicted) this._stopVoice(req.evicted);
    this.live.set(req.id, this._build(recipe, opts, gain, pan, now));
    if (this.live.size > 64) this._pruneLive(now);
    this.counters.played++;
    return true;
  }

  _build(recipe, opts, gain, pan, now) {
    const c = this.ctx;
    const t = now + 0.005;
    const vg = c.createGain();
    vg.gain.value = gain;
    let tail = vg;
    if (pan && c.createStereoPanner) {
      const sp = c.createStereoPanner();
      sp.pan.value = pan;
      vg.connect(sp);
      tail = sp;
    }
    tail.connect(this.buses.sfx);
    const sources = [];
    const noise = this.noise.white;
    const rng = this.rng;
    const builder = {
      ctx: c, t, rng, out: vg,
      gain: (v) => { const g = c.createGain(); g.gain.value = v; g.connect(vg); return g; },
      osc: (type, f) => { const o = c.createOscillator(); o.type = type; if (f) o.frequency.value = f; sources.push(o); return o; },
      filter: (type, f, q = 0.7) => { const b = c.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; },
      burst: (dur, peak = 1, delay = 0) => {
        const n = c.createBufferSource();
        n.buffer = noise;
        n.loop = true;
        const g = c.createGain();
        const t0 = t + delay;
        g.gain.setValueAtTime(peak, t0);
        g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
        n.connect(g);
        n.start(t0, rng() * 1.5);
        n.stop(t0 + dur + 0.02);
        sources.push(n);
        return g;
      }
    };
    recipe.play(builder, opts);
    return { vg, sources, end: now + recipe.dur };
  }

  _stopVoice(id) {
    const v = this.live.get(id);
    if (!v) return;
    this.live.delete(id);
    const now = this.ctx.currentTime;
    try {
      v.vg.gain.cancelScheduledValues(now);
      v.vg.gain.setTargetAtTime(0, now, 0.01);
      for (const s of v.sources) { try { s.stop(now + 0.05); } catch { /* já parado */ } }
    } catch { /* nó já descartado */ }
  }

  _pruneLive(now) {
    for (const [id, v] of this.live) if (v.end < now) this.live.delete(id);
  }

  // ------------------------------------------------------------------------------------------ falas
  /**
   * Fala (já escolhida pelo `SpeechDirector`). Sintetiza (ou pega do cache) e toca, cortando a fala anterior.
   * @param {{key:string, ph:string, voice:object, gain?:number}} s
   * @returns {number} duração em segundos (0 = não falou)
   */
  speak(s) {
    if (!this.ready || !this.caps.speech || this.volumes.master <= 0 || this.volumes.voice <= 0) return 0;
    const c = this.ctx;
    let buf = this._speechCache.get(s.key);
    if (buf) {
      this._speechCache.delete(s.key); // LRU: reinsere como o mais recente
    } else {
      const samples = renderUtterance(s.ph, s.voice, { seed: hashKey(s.key) });
      buf = c.createBuffer(1, samples.length, SPEECH_SR);
      buf.getChannelData(0).set(samples);
      if (this._speechCache.size >= SPEECH_CACHE_MAX) this._speechCache.delete(this._speechCache.keys().next().value);
    }
    this._speechCache.set(s.key, buf);

    const now = c.currentTime;
    this._cutSpeech();
    const src = c.createBufferSource();
    src.buffer = buf;
    const g = c.createGain();
    g.gain.value = s.gain ?? 1;
    src.connect(g);
    g.connect(this.buses.voice);
    const t = now + 0.01;
    src.start(t);
    this._speech = { src, g, end: t + buf.duration };
    // música abaixa enquanto fala
    this.musicDuck.gain.cancelScheduledValues(now);
    this.musicDuck.gain.setTargetAtTime(0.5, now, 0.04);
    this.musicDuck.gain.setTargetAtTime(1, t + buf.duration + 0.1, 0.25);
    this.counters.speech++;
    return buf.duration;
  }

  _cutSpeech() {
    const sp = this._speech;
    if (!sp) return;
    this._speech = null;
    const now = this.ctx.currentTime;
    if (now >= sp.end) return;
    try {
      sp.g.gain.cancelScheduledValues(now);
      sp.g.gain.setTargetAtTime(0, now, 0.012);
      sp.src.stop(now + 0.06);
    } catch { /* já parou */ }
  }

  // ------------------------------------------------------------------------------------------ música e ambiência
  /** Preferência "música ligada" do jogador (toggle/volume 0). */
  setMusicOn(on) {
    this.musicOn = !!on;
    this._applyMusic();
  }

  /** Silêncio temporário da música (missão/cutscene) sem mexer na preferência. */
  setMusicHold(hold) {
    this.musicHold = !!hold;
    this._applyMusic();
  }

  /** Começa uma partida: música da facção (paz) e ambiência do tileset. */
  beginMatch({ faction, tilesetId }) {
    this.match = { faction, tilesetId };
    this.director.reset(this.now());
    this._applyMusic();
    this._applyAmbience(true);
  }

  /** Pausa da partida: a ambiência cala (a música segue); ao retomar, a ambiência volta. Só apresentação. */
  setPaused(paused) {
    paused = !!paused;
    if (paused === !!this.paused) return;
    this.paused = paused;
    this._applyAmbience(true);
  }

  /** Fim de jogo (vitória/derrota): a intensidade de combate zera e a música volta à de paz. */
  calm() {
    this.director.reset(this.now());
    this._applyMusic();
  }

  /** Fim da partida (descarte da sessão): ambiência para, música volta à do menu. */
  endMatch() {
    this.match = null;
    this.director.reset(this.now());
    this.ambience.stop(1.2);
    this._applyMusic();
  }

  /** Evento de combate (peso por `combatWeight`): alimenta a música adaptativa. */
  noteCombat(weight) {
    if (weight > 0) this.director.add(weight, this.now());
  }

  _wantMusic() {
    return this.ready && this.caps.music !== 'none' && this.musicOn && !this.musicHold && this.volumes.music > 0 && this.volumes.master > 0;
  }

  _applyMusic() {
    if (!this._wantMusic()) {
      if (this.music.playing) this.music.stop({ fade: 0.8 });
      return;
    }
    const id = trackIdFor(this.match ? this.match.faction : MENU_FACTION, this.director.state);
    if (this.music.currentId === id) return; // mesma família: segue na variação atual (o rodízio é à parte)
    this._startMusic(id, false);
  }

  /** Seleção de faixas (ver `catalog.js`): `null` = padrões do catálogo. Vale a partir da próxima troca de faixa. */
  setMusicSelection(raw) {
    this.musicSelection = normalizeSelection(raw);
  }

  /** Tempo de partida (s): evolução da música de paz (camadas, registro e andamento; ver `intensity.js`). Só apresentação. */
  setMatchTime(seconds) {
    this.music.setIntensity(intensityFromGameTime(seconds));
  }

  /**
   * Começa a família `id` numa variação escolhida de forma determinística (semente + família + contador) entre as
   * HABILITADAS no catálogo/seleção (com reserva nas atuais se nenhuma estiver habilitada).
   */
  _startMusic(id, force) {
    const pool = enabledVariants(id, this.musicSelection);
    if (!pool.length) return;
    const prev = this._lastVariant[id] ?? -1;
    const k = pickVariant(this.musicSeed, id, this._musicSerial++, pool.indexOf(prev), pool.length);
    const variant = pool[k];
    if (this.music.play(id, { fade: this.music.playing ? 2.5 : 1.2, variant, force })) this._lastVariant[id] = this.music.currentVariant;
  }

  /** Rodízio: depois de algumas voltas da mesma variação, troca por outra da mesma família (variedade em partidas longas). */
  _rotateMusic() {
    if (!this.music.playing || this.music.loopsPlayed() < ROTATE_AFTER_LOOPS) return;
    if (enabledVariants(this.music.currentId, this.musicSelection).length < 2) return; // só uma habilitada: segue em laço
    this._startMusic(this.music.currentId, true);
  }

  _applyAmbience(force = false) {
    const now = this.now();
    if (!force && now - this._ambienceAt < 2) return;
    this._ambienceAt = now;
    if (!this.ready || !this.caps.ambience || !this.match || this.paused || this.volumes.sfx <= 0) {
      this.ambience.stop(1.5);
      return;
    }
    const night = nightFactor(this.sceneProbe ? this.sceneProbe() : {});
    this.ambience.setMix(ambienceMix(this.match.tilesetId, { night }), force ? 2 : 4);
  }

  /** Um passo do relógio interno (temporizador a cada ~150 ms; testes chamam à mão). */
  tick() {
    if (!this.ready) return;
    const now = this.now();
    this._lastUpdate = now;
    if (this._wantMusic()) {
      const before = this.director.state;
      if (this.match) this.director.update(now);
      if (this.director.state !== before || !this.music.playing) this._applyMusic();
      else this._rotateMusic();
      this.music.tick();
    } else {
      this.music.tick(); // deixa a faixa que está saindo terminar o fade
    }
    this.ambience.update();
    this._applyAmbience(false);
    if (this.pool.voices.length === 0 && this.live.size) this._pruneLive(now);
  }

  /** Estado para depuração (`game.sound.stats()`) e para a ferramenta de verificação. */
  stats() {
    const now = this.now();
    return {
      level: this.level,
      state: this.ctx.state,
      sampleRate: this.ctx.sampleRate,
      volumes: { ...this.volumes },
      voices: this.pool.count(now),
      maxVoices: this.pool.max,
      counters: { ...this.counters },
      pool: { ...this.pool.stats, deniedByReason: { ...this.pool.stats.deniedByReason } },
      music: { track: this.music.currentId, variant: this.music.currentVariant, state: this.director.state, intensity: +this.director.level(now).toFixed(2), notes: this.music.stats.notes, switches: this.music.stats.switches, hold: this.musicHold },
      ambience: this.ambience.active,
      speechCached: this._speechCache.size,
      limiterReductionDb: this.limiter.reduction
    };
  }

  dispose() {
    if (this._timer !== null && this._timers && this._timers.clearInterval) this._timers.clearInterval(this._timer);
    this._timer = null;
    for (const id of [...this.live.keys()]) this._stopVoice(id);
    this._cutSpeech();
    this.music.dispose();
    this.ambience.dispose();
    this._speechCache.clear();
    try { this.ctx.close && this.ctx.close(); } catch { /* ok */ }
  }
}
