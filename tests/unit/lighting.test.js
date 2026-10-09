import { describe, it, expect } from 'vitest';
import {
  FX_KEYS, selectEffects, anyEffect, parseFxParam, parseDayNightParam, sampleDayNight, advancePhase,
  gradeOf, NEUTRAL_GRADE, mixHex, wrap01, bloomStrengthFor, DEFAULT_DAY_BASE
} from '../../src/core/lighting.js';
import { QUALITY_PRESETS, sanitizeOverrides, mergePreset } from '../../src/core/QualitySettings.js';
import { TILESETS, TILESET_IDS } from '../../src/data/tilesets.js';
import { boostFactor, BLOOM_TARGET } from '../../src/render/postfx/bloomTag.js';

describe('F7-03 curva de dia/noite', () => {
  it('é cíclica e contínua nas bordas', () => {
    const a = sampleDayNight(0), b = sampleDayNight(1), c = sampleDayNight(-1);
    expect(a).toEqual(b);
    expect(a).toEqual(c);
  });
  it('meio-dia = atmosfera do dia; meia-noite = escura e com bloom reforçado', () => {
    const noon = sampleDayNight(0.5);
    const night = sampleDayNight(0);
    expect(noon.sky).toBe(DEFAULT_DAY_BASE.sky);
    expect(noon.night).toBe(0);
    expect(night.night).toBe(1);
    expect(night.sunI).toBeLessThan(noon.sunI);
    expect(night.hemiI).toBeLessThan(noon.hemiI);
    expect(night.exposure).toBeLessThan(noon.exposure);
  });
  it('o dia usa o céu/hemisfério do tileset', () => {
    const base = { sky: 0xc9dbe8, hemiSky: 0xdbe9ff, hemiGround: 0x8497ad };
    expect(sampleDayNight(0.5, base).sky).toBe(0xc9dbe8);
    expect(sampleDayNight(0.5, base).hemiGround).toBe(0x8497ad);
  });
  it('é suave: variações pequenas de fase mudam pouco', () => {
    let prev = sampleDayNight(0);
    for (let i = 1; i <= 1000; i++) {
      const cur = sampleDayNight(i / 1000);
      expect(Math.abs(cur.sunI - prev.sunI)).toBeLessThan(0.1);
      expect(Math.abs(cur.exposure - prev.exposure)).toBeLessThan(0.02);
      prev = cur;
    }
  });
  it('advancePhase/wrap01/mixHex', () => {
    expect(advancePhase(0.9, 24, 240)).toBeCloseTo(0, 6);
    expect(advancePhase(0.2, 60, 240)).toBeCloseTo(0.45, 6);
    expect(advancePhase(0.2, 1, 0)).toBe(0.2);
    expect(wrap01(-0.25)).toBeCloseTo(0.75, 9);
    expect(mixHex(0x000000, 0xffffff, 0.5)).toBe(0x808080);
    expect(mixHex(0x102030, 0x102030, 0.7)).toBe(0x102030);
  });
  it('bloom mais forte à noite', () => {
    expect(bloomStrengthFor(0.5, 0)).toBe(0.5);
    expect(bloomStrengthFor(0.5, 1)).toBeGreaterThan(0.5);
    expect(bloomStrengthFor(0.5, 9)).toBe(bloomStrengthFor(0.5, 1));
  });
});

describe('F7-03 parâmetros de URL', () => {
  it('ciclo dia/noite vem desligado por padrão', () => {
    expect(parseDayNightParam(null, null).enabled).toBe(false);
    expect(parseDayNightParam('0', null).enabled).toBe(false);
    expect(parseDayNightParam('banana', null).enabled).toBe(false);
  });
  it('liga com 1/on ou período em segundos, com fase inicial opcional', () => {
    expect(parseDayNightParam('1', null)).toMatchObject({ enabled: true, period: 240 });
    expect(parseDayNightParam('90', '0.5')).toEqual({ enabled: true, period: 90, phase: 0.5 });
    expect(parseDayNightParam('5', null).enabled).toBe(false); // < 20 s não é período válido
  });
  it('?fx= força efeitos', () => {
    expect(parseFxParam(null)).toEqual({});
    expect(parseFxParam('0')).toEqual({ bloom: false, ssao: false, colorGrading: false, selectionOutline: false });
    expect(parseFxParam('all').ssao).toBe(true);
    expect(parseFxParam('bloom,-outline,ao')).toEqual({ bloom: true, selectionOutline: false, ssao: true });
    expect(parseFxParam('xyz')).toEqual({});
  });
});

describe('F7-03 seleção de efeitos por qualidade', () => {
  it('presets: low sem nenhum efeito, high/ultra com todos', () => {
    for (const k of FX_KEYS) {
      expect(QUALITY_PRESETS.low[k]).toBe(false);
      expect(QUALITY_PRESETS.high[k]).toBe(true);
      expect(QUALITY_PRESETS.ultra[k]).toBe(true);
    }
    expect(QUALITY_PRESETS.med.ssao).toBe(false); // AO de tela só de high para cima
    expect(QUALITY_PRESETS.med.bloom).toBe(true);
  });
  it('texq=low desliga tudo mesmo no preset high', () => {
    const fx = selectEffects(QUALITY_PRESETS.high, 'low');
    expect(anyEffect(fx)).toBe(false);
  });
  it('preset high com textura média liga tudo; med liga só o barato', () => {
    expect(selectEffects(QUALITY_PRESETS.high, 'med')).toEqual({ bloom: true, ssao: true, colorGrading: true, selectionOutline: true });
    expect(selectEffects(QUALITY_PRESETS.med, 'med')).toEqual({ bloom: true, ssao: false, colorGrading: true, selectionOutline: true });
  });
  it('?fx= tem prioridade sobre o preset', () => {
    expect(selectEffects(QUALITY_PRESETS.low, 'low', parseFxParam('bloom')).bloom).toBe(true);
    expect(selectEffects(QUALITY_PRESETS.high, 'high', parseFxParam('-ssao')).ssao).toBe(false);
  });
  it('overrides avançados aceitam os efeitos e descartam lixo', () => {
    expect(sanitizeOverrides({ bloom: false, ssao: 'sim', colorGrading: true })).toEqual({ bloom: false, colorGrading: true });
    expect(mergePreset(QUALITY_PRESETS.high, { ssao: false }).ssao).toBe(false);
  });
});

describe('F7-03 color grading por tileset', () => {
  it('todo tileset tem grade válida; sem grade = neutra', () => {
    expect(gradeOf(null)).toEqual(NEUTRAL_GRADE);
    for (const id of TILESET_IDS) {
      const g = gradeOf(TILESETS[id]);
      expect(g.tint).toHaveLength(3);
      expect(g.sat).toBeGreaterThan(0.5);
      expect(g.vignette).toBeLessThan(0.4);
    }
  });
  it('tilesets têm looks distintos', () => {
    const ids = TILESET_IDS.map((id) => JSON.stringify(gradeOf(TILESETS[id])));
    expect(new Set(ids).size).toBe(TILESET_IDS.length);
  });
  it('valores absurdos são limitados', () => {
    const g = gradeOf({ grade: { tint: [9, -3, 1], sat: 50, contrast: 0, brightness: NaN, vignette: 5 } });
    expect(g.tint).toEqual([1.5, 0.5, 1]);
    expect(g.sat).toBe(2);
    expect(g.contrast).toBe(0.5);
    expect(g.brightness).toBe(1);
    expect(g.vignette).toBe(0.6);
  });
});

describe('F7-03 elevação do emissivo (bloom seletivo)', () => {
  it('só eleva emissivo forte e nunca acima do alvo', () => {
    expect(boostFactor(0.1)).toBe(0); // decoração
    expect(boostFactor(0.5) * 0.5).toBeLessThanOrEqual(BLOOM_TARGET + 1e-9);
    expect(boostFactor(0.01, true)).toBeLessThanOrEqual(3.5);
    expect(boostFactor(0.5)).toBeGreaterThan(1);
    expect(boostFactor(BLOOM_TARGET + 0.1)).toBe(0); // já brilha
    expect(boostFactor(0.1, true)).toBeGreaterThan(1); // userData.bloom força
    expect(boostFactor(0)).toBe(0);
  });
});
