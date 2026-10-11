import { describe, it, expect } from 'vitest';
import { SoundManager } from '../../src/core/SoundManager.js';
import { createOptionsStore } from '../../src/ui/optionsStore.js';
import { applyAudio } from '../../src/ui/optionsApply.js';
import { QUALITY_PRESETS } from '../../src/core/QualitySettings.js';
import { detectAudioLevel } from '../../src/audio/audioEnv.js';
import { AUDIO_CAPS } from '../../src/audio/audioConfig.js';
import { createFakeAudioContextClass } from './helpers/fakeAudio.js';
import ptBR from '../../src/i18n/pt-BR.json';
import en from '../../src/i18n/en.json';

// F7-08 — integração do áudio ao ciclo de partida (pausa/fim), às opções e aos presets. Só apresentação (nada em src/sim).
const mkSm = (level = 'med') => {
  const Fake = createFakeAudioContextClass();
  const sm = new SoundManager({ level, env: { AudioContext: Fake, log: () => {}, timers: null } });
  return { sm, Fake };
};
const mkStore = () => {
  const m = new Map();
  return createOptionsStore({
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); }
  });
};

describe('F7-08 integração: pausa e fim de jogo', () => {
  it('pausa cala a ambiência e retomar a religa; música segue; pausa antes do gesto vale quando o motor nasce', () => {
    const { sm } = mkSm();
    sm.beginMatch({ faction: 'human', tilesetId: 'devastadas' });
    sm.setPaused(true); // antes do 1º gesto
    sm.resume();
    expect(sm.engine.paused).toBe(true);
    expect(sm.engine.ambience.active).not.toContain('rumble');
    expect(sm.isMusicPlaying).toBe(true);
    sm.setPaused(false);
    expect(sm.engine.ambience.active).toContain('rumble');
    sm.setPaused(true);
    sm.endMatch(); // sair para o menu zera a pausa
    expect(sm.engine.paused).toBe(false);
    expect(sm._paused).toBe(false);
  });

  it('fim de jogo (calmMusic) devolve a música de combate para a de paz', () => {
    const { sm } = mkSm();
    sm.beginMatch({ faction: 'orc', tilesetId: 'inverno' });
    sm.resume();
    for (let i = 0; i < 6; i++) sm.noteCombat(1);
    sm.ctx.advance(0.15);
    sm.engine.tick();
    expect(sm.engine.music.currentId).toBe('orc_combat');
    sm.calmMusic();
    expect(sm.engine.director.state).toBe('peace');
    expect(sm.engine.music.currentId).toBe('orc_peace');
  });

  it('pausa e fim sem motor (antes do gesto / nível off) não lançam', () => {
    const { sm } = mkSm('off');
    expect(() => { sm.setPaused(true); sm.calmMusic(); sm.endMatch(); sm.resume(); }).not.toThrow();
    expect(sm.initialized).toBe(false);
  });
});

describe('F7-08 integração: opções, presets e i18n', () => {
  it('volumes mestre/música/efeitos/voz valem ao vivo no SoundManager e no motor', () => {
    const { sm } = mkSm();
    sm.resume();
    const store = mkStore();
    store.set('volumeMaster', 0.4);
    store.set('volumeMusic', 0.3);
    store.set('volumeSfx', 0.6);
    store.set('volumeVoice', 0.2);
    applyAudio(sm, store);
    expect(sm.volumes).toEqual({ master: 0.4, music: 0.3, sfx: 0.6, voice: 0.2 });
    expect(sm.engine.volumes).toMatchObject({ master: 0.4, music: 0.3, sfx: 0.6, voice: 0.2 });
    store.set('volumeVoice', 0);
    applyAudio(sm, store);
    expect(sm.canSpeak()).toBe(false);
  });

  it('cada preset define o nível de áudio e o orçamento de vozes cresce com ele; trocar ao vivo reduz o teto', () => {
    for (const p of Object.values(QUALITY_PRESETS)) {
      expect(['low', 'med', 'high']).toContain(p.audio);
      const tq = p.textureQuality === 'low' ? 'med' : p.textureQuality;
      expect(detectAudioLevel(p, tq, { location: { search: '' }, navigator: {} })).toBe(p.audio);
    }
    expect(AUDIO_CAPS.low.maxVoices).toBeLessThan(AUDIO_CAPS.med.maxVoices);
    expect(AUDIO_CAPS.med.maxVoices).toBeLessThan(AUDIO_CAPS.high.maxVoices);
    const { sm } = mkSm('high');
    sm.resume();
    expect(sm.engine.pool.max).toBe(AUDIO_CAPS.high.maxVoices);
    sm.setLevel(QUALITY_PRESETS.low.audio);
    expect(sm.engine.pool.max).toBe(AUDIO_CAPS.low.maxVoices);
  });

  it('i18n: as chaves de áudio existem em pt-BR e en', () => {
    for (const k of ['opt.a.master', 'opt.a.masterHint', 'opt.a.music', 'opt.a.sfx', 'opt.a.voice', 'opt.a.voiceHint']) {
      expect(ptBR[k], k).toBeTruthy();
      expect(en[k], k).toBeTruthy();
    }
  });
});
