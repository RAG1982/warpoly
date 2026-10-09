/**
 * fakeAudio.js — AudioContext FALSO para testar o motor de áudio (F7-08) em Node, sem Web Audio.
 * Registra os nós criados (por tipo), as ligações e os eventos de automação dos parâmetros; o relógio é manual
 * (`ctx.advance(s)`), então música/ambiência/crossfade são determinísticos.
 */

export function createFakeParam(value = 0) {
  return {
    value,
    events: [],
    setValueAtTime(v, t) { this.events.push(['set', v, t]); this.value = v; return this; },
    linearRampToValueAtTime(v, t) { this.events.push(['linear', v, t]); return this; },
    exponentialRampToValueAtTime(v, t) { this.events.push(['exp', v, t]); return this; },
    setTargetAtTime(v, t, tc) { this.events.push(['target', v, t, tc]); this.value = v; return this; },
    cancelScheduledValues(t) { this.events.push(['cancel', t]); return this; }
  };
}

export function createFakeAudioContext({ sampleRate = 44100 } = {}) {
  let time = 0;
  const nodes = [];
  const counts = {};
  const node = (kind, extra = {}) => {
    const n = {
      kind,
      connections: [],
      connect(dest) { this.connections.push(dest); return dest; },
      disconnect() { this.connections.length = 0; this.disconnected = true; },
      ...extra
    };
    nodes.push(n);
    counts[kind] = (counts[kind] || 0) + 1;
    return n;
  };
  const source = (kind, extra = {}) => node(kind, {
    started: false,
    stopped: false,
    start(t = 0) { this.started = true; this.startAt = t; },
    stop(t = 0) { this.stopped = true; this.stopAt = t; },
    ...extra
  });
  const ctx = {
    nodes,
    counts,
    state: 'running',
    sampleRate,
    get currentTime() { return time; },
    advance(dt) { time += dt; },
    destination: null,
    createGain() { return node('gain', { gain: createFakeParam(1) }); },
    createDynamicsCompressor() {
      return node('compressor', {
        threshold: createFakeParam(-24), knee: createFakeParam(30), ratio: createFakeParam(12),
        attack: createFakeParam(0.003), release: createFakeParam(0.25), reduction: 0
      });
    },
    createStereoPanner() { return node('panner', { pan: createFakeParam(0) }); },
    createOscillator() { return source('osc', { type: 'sine', frequency: createFakeParam(440), detune: createFakeParam(0) }); },
    createBiquadFilter() {
      return node('filter', { type: 'lowpass', frequency: createFakeParam(350), Q: createFakeParam(1), gain: createFakeParam(0) });
    },
    createBufferSource() { return source('bufsrc', { buffer: null, loop: false }); },
    createBuffer(channels, length, sr) {
      const data = new Float32Array(length);
      return { numberOfChannels: channels, length, sampleRate: sr, duration: length / sr, getChannelData() { return data; } };
    },
    resume() { ctx.state = 'running'; return Promise.resolve(); },
    close() { ctx.state = 'closed'; return Promise.resolve(); }
  };
  ctx.destination = node('destination');
  return ctx;
}

/** Construtor falso de AudioContext que guarda a instância criada (para `SoundManager`: `env.AudioContext`). */
export function createFakeAudioContextClass(opts) {
  const made = [];
  function FakeAudioContext() {
    const c = createFakeAudioContext(opts);
    made.push(c);
    return c;
  }
  FakeAudioContext.made = made;
  return FakeAudioContext;
}

/** Quantas fontes de `kind` (osc/bufsrc) ainda tocam no relógio atual do contexto (iniciadas e ainda não paradas). */
export function liveSources(ctx, kind) {
  return ctx.nodes.filter((n) => n.kind === kind && n.started && !(n.stopped && n.stopAt <= ctx.currentTime)).length;
}
