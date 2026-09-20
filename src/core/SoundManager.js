// SoundManager.js - Procedural Web Audio synthesizer for cozy RTS sound effects & ambient music
export class SoundManager {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.musicEnabled = true;
    this.sfxVolume = 0.5;
    this.musicVolume = 0.25;
    this.ambientTimer = null;
    this.isMusicPlaying = false;
    this.initialized = false;
  }

  init() {
    if (this.initialized) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioContext();
      this.initialized = true;
      if (this.musicEnabled) {
        this.startMusic();
      }
    } catch (e) {
      console.warn("Web Audio not supported or blocked", e);
    }
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    if (!this.initialized) {
      this.init();
    }
  }

  toggleSound() {
    this.enabled = !this.enabled;
    if (!this.enabled && this.ctx) {
      this.stopMusic();
    } else if (this.enabled && this.musicEnabled) {
      this.startMusic();
    }
    return this.enabled;
  }

  toggleMusic() {
    this.musicEnabled = !this.musicEnabled;
    if (this.musicEnabled && this.enabled) {
      this.startMusic();
    } else {
      this.stopMusic();
    }
    return this.musicEnabled;
  }

  // Helper to create gain node with master SFX scaling
  createSfxGain(peak = 0.3) {
    if (!this.ctx || !this.enabled) return null;
    this.resume();
    const gain = this.ctx.createGain();
    gain.gain.value = peak * this.sfxVolume;
    gain.connect(this.ctx.destination);
    return gain;
  }

  // --- PROCEDURAL SFX ---

  playChop() {
    const gain = this.createSfxGain(0.4);
    if (!gain) return;
    const now = this.ctx.currentTime;
    
    // Low wood thud
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    const baseFreq = 110 + Math.random() * 30;
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.08);

    // Filtered noise for axe blade bite
    const bufferSize = this.ctx.sampleRate * 0.05;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.25));
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1400;

    noise.connect(filter);
    filter.connect(gain);
    osc.connect(gain);

    gain.gain.setValueAtTime(0.4 * this.sfxVolume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    osc.start(now);
    noise.start(now);
    osc.stop(now + 0.12);
  }

  playMineGold() {
    const gain = this.createSfxGain(0.35);
    if (!gain) return;
    const now = this.ctx.currentTime;

    // High crystalline resonant ping
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    const notes = [1200, 1440, 1680, 1920];
    const freq = notes[Math.floor(Math.random() * notes.length)];
    osc.frequency.setValueAtTime(freq, now);

    const osc2 = this.ctx.createOscillator();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(freq * 1.5, now);

    osc.connect(gain);
    osc2.connect(gain);

    gain.gain.setValueAtTime(0.3 * this.sfxVolume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

    osc.start(now);
    osc2.start(now);
    osc.stop(now + 0.25);
    osc2.stop(now + 0.25);
  }

  playMineStone() {
    const gain = this.createSfxGain(0.35);
    if (!gain) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(60, now + 0.1);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 800;

    osc.connect(filter);
    filter.connect(gain);

    gain.gain.setValueAtTime(0.35 * this.sfxVolume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

    osc.start(now);
    osc.stop(now + 0.14);
  }

  playHammer() {
    const gain = this.createSfxGain(0.3);
    if (!gain) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(750 + Math.random() * 80, now);
    osc.frequency.exponentialRampToValueAtTime(250, now + 0.08);

    osc.connect(gain);
    gain.gain.setValueAtTime(0.3 * this.sfxVolume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    osc.start(now);
    osc.stop(now + 0.09);
  }

  playSword() {
    const gain = this.createSfxGain(0.35);
    if (!gain) return;
    const now = this.ctx.currentTime;

    // Metal clash / slice
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(950, now);
    osc.frequency.exponentialRampToValueAtTime(450, now + 0.12);

    const osc2 = this.ctx.createOscillator();
    osc2.type = 'sawtooth';
    osc2.frequency.setValueAtTime(600, now);
    osc2.frequency.exponentialRampToValueAtTime(180, now + 0.15);

    osc.connect(gain);
    osc2.connect(gain);

    gain.gain.setValueAtTime(0.35 * this.sfxVolume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    osc.start(now);
    osc2.start(now);
    osc.stop(now + 0.18);
    osc2.stop(now + 0.18);
  }

  playBow() {
    const gain = this.createSfxGain(0.3);
    if (!gain) return;
    const now = this.ctx.currentTime;

    // String snap
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(480, now);
    osc.frequency.exponentialRampToValueAtTime(120, now + 0.1);

    osc.connect(gain);
    gain.gain.setValueAtTime(0.3 * this.sfxVolume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    osc.start(now);
    osc.stop(now + 0.12);
  }

  playArrowHit() {
    const gain = this.createSfxGain(0.3);
    if (!gain) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(90, now + 0.07);

    osc.connect(gain);
    gain.gain.setValueAtTime(0.3 * this.sfxVolume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    osc.start(now);
    osc.stop(now + 0.08);
  }

  playSelect() {
    const gain = this.createSfxGain(0.25);
    if (!gain) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(523.25, now); // C5
    osc.frequency.setValueAtTime(659.25, now + 0.05); // E5

    osc.connect(gain);
    gain.gain.setValueAtTime(0.2 * this.sfxVolume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

    osc.start(now);
    osc.stop(now + 0.14);
  }

  playOrder() {
    const gain = this.createSfxGain(0.25);
    if (!gain) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(440, now); // A4
    osc.frequency.setValueAtTime(554.37, now + 0.04); // C#5
    osc.frequency.setValueAtTime(659.25, now + 0.08); // E5

    osc.connect(gain);
    gain.gain.setValueAtTime(0.22 * this.sfxVolume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    osc.start(now);
    osc.stop(now + 0.18);
  }

  playBuildPlace() {
    const gain = this.createSfxGain(0.4);
    if (!gain) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(45, now + 0.15);

    osc.connect(gain);
    gain.gain.setValueAtTime(0.4 * this.sfxVolume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

    osc.start(now);
    osc.stop(now + 0.2);
  }

  playBuildComplete() {
    const gain = this.createSfxGain(0.35);
    if (!gain) return;
    const now = this.ctx.currentTime;

    const chord = [392.00, 493.88, 587.33, 783.99]; // G chord
    chord.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      osc.connect(gain);
      osc.start(now + idx * 0.06);
      osc.stop(now + 0.6);
    });

    gain.gain.setValueAtTime(0.3 * this.sfxVolume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
  }

  playAlarm() {
    const gain = this.createSfxGain(0.4);
    if (!gain) return;
    const now = this.ctx.currentTime;

    // War horn / trumpet
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.linearRampToValueAtTime(246.94, now + 0.2);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 650;

    osc.connect(filter);
    filter.connect(gain);

    gain.gain.setValueAtTime(0.35 * this.sfxVolume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

    osc.start(now);
    osc.stop(now + 0.45);
  }

  playVictory() {
    const gain = this.createSfxGain(0.45);
    if (!gain) return;
    const now = this.ctx.currentTime;

    // Victory fanfare notes: C4 -> E4 -> G4 -> C5
    const fanfare = [261.63, 329.63, 392.00, 523.25];
    fanfare.forEach((f, i) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = f;
      osc.connect(gain);
      const startT = now + i * 0.15;
      osc.start(startT);
      osc.stop(startT + 0.4);
    });

    gain.gain.setValueAtTime(0.4 * this.sfxVolume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
  }

  // --- COZY BACKGROUND AMBIENT LUTE & HARP CHORD ARPEGGIATOR ---

  startMusic() {
    if (this.isMusicPlaying || !this.enabled || !this.musicEnabled) return;
    this.isMusicPlaying = true;
    
    // Play warm gentle medieval chord progression every 4-5 seconds
    const chords = [
      [261.63, 329.63, 392.00, 523.25], // C major
      [220.00, 261.63, 329.63, 440.00], // A minor
      [174.61, 220.00, 261.63, 349.23], // F major
      [196.00, 246.94, 293.66, 392.00], // G major
      [164.81, 196.00, 246.94, 329.63]  // E minor
    ];

    let chordIdx = 0;

    const playNextBar = () => {
      if (!this.isMusicPlaying || !this.musicEnabled || !this.enabled || !this.ctx) return;
      const currentChord = chords[chordIdx % chords.length];
      chordIdx++;

      const now = this.ctx.currentTime;
      // Arpeggiate notes with harp-like decay
      currentChord.forEach((freq, i) => {
        const noteGain = this.ctx.createGain();
        noteGain.gain.setValueAtTime(0.0001, now + i * 0.28);
        noteGain.gain.exponentialRampToValueAtTime(0.07 * this.musicVolume, now + i * 0.28 + 0.05);
        noteGain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.28 + 1.8);
        noteGain.connect(this.ctx.destination);

        const osc = this.ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = freq;
        osc.connect(noteGain);

        osc.start(now + i * 0.28);
        osc.stop(now + i * 0.28 + 2.0);
      });

      // Schedule next bar
      this.ambientTimer = setTimeout(playNextBar, 3800 + Math.random() * 800);
    };

    playNextBar();
  }

  stopMusic() {
    this.isMusicPlaying = false;
    if (this.ambientTimer) {
      clearTimeout(this.ambientTimer);
      this.ambientTimer = null;
    }
  }
}
