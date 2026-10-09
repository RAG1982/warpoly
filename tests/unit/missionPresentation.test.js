import { describe, it, expect } from 'vitest';
import {
  ease, cutscenePose, cutsceneDialogs, dialogDuration, DialogQueue, formatClock, buildObjectivesModel, buildMissionEndModel
} from '../../src/ui/missionPresentation.js';
import { localize } from '../../src/sim/missions/text.js';
import { dicts } from '../../src/i18n/index.js';

/** F8-04 — lógica pura da apresentação: cutscene por keyframes, fila de diálogos, modelos de painel e de fim. */
describe('localize (F8-04)', () => {
  it('string vale para todos; objeto escolhe o idioma com fallback pt-BR', () => {
    expect(localize('oi', 'en')).toBe('oi');
    expect(localize({ 'pt-BR': 'olá', en: 'hi' }, 'en')).toBe('hi');
    expect(localize({ 'pt-BR': 'olá' }, 'en')).toBe('olá');
    expect(localize(undefined)).toBe('');
  });
});

describe('cutscenePose (F8-04)', () => {
  const steps = [{ at: 0, x: 0, z: 0, zoom: 1 }, { at: 4, x: 40, z: -20, zoom: 2 }, { at: 6, dialog: { text: 'x' } }, { at: 8, x: 40, z: -20 }];
  it('interpola suavemente entre keyframes e segura nos extremos', () => {
    expect(cutscenePose(steps, -1)).toEqual({ x: 0, z: 0, zoom: 1 });
    expect(cutscenePose(steps, 0)).toEqual({ x: 0, z: 0, zoom: 1 });
    const mid = cutscenePose(steps, 2);
    expect(mid.x).toBeCloseTo(20, 5);
    expect(mid.z).toBeCloseTo(-10, 5);
    expect(mid.zoom).toBeCloseTo(1.5, 5);
    expect(cutscenePose(steps, 4)).toEqual({ x: 40, z: -20, zoom: 2 });
    expect(cutscenePose(steps, 99)).toEqual({ x: 40, z: -20, zoom: 1 }); // último keyframe sem zoom => padrão
  });
  it('ease é monótona e limitada a [0,1]; sem keyframes devolve null', () => {
    expect(ease(-3)).toBe(0);
    expect(ease(9)).toBe(1);
    expect(ease(0.25)).toBeLessThan(ease(0.5));
    expect(cutscenePose([{ at: 0, dialog: { text: 'x' } }], 1)).toBeNull();
  });
  it('cutsceneDialogs devolve só os diálogos do intervalo (t0, t1]', () => {
    expect(cutsceneDialogs(steps, -Infinity, 5)).toEqual([]);
    expect(cutsceneDialogs(steps, 5, 6)).toEqual([{ text: 'x' }]);
    expect(cutsceneDialogs(steps, 6, 9)).toEqual([]);
  });
});

describe('DialogQueue (F8-04)', () => {
  it('mostra um diálogo por vez, avança pelo tempo e por dismiss', () => {
    const q = new DialogQueue();
    q.push({ text: 'a', duration: 2 });
    q.push({ text: 'b', duration: 2 });
    expect(q.current.text).toBe('a');
    expect(q.tick(1)).toBe(false);
    expect(q.tick(1.5)).toBe(true);
    expect(q.current.text).toBe('b');
    q.dismiss();
    expect(q.current).toBeNull();
    expect(q.tick(5)).toBe(false);
  });
  it('limita a fila e limpa', () => {
    const q = new DialogQueue({ max: 2 });
    for (let i = 0; i < 6; i++) q.push({ text: String(i), duration: 1 });
    expect(q.items.length).toBeLessThanOrEqual(2);
    q.clear();
    expect(q.current).toBeNull();
  });
  it('duração padrão cresce com o texto, com mínimo e máximo', () => {
    expect(dialogDuration({ text: 'oi' })).toBe(3);
    expect(dialogDuration({ text: 'x'.repeat(10000) })).toBe(12);
    expect(dialogDuration({ text: 'x', duration: 7 })).toBe(7);
  });
});

describe('modelos de painel e fim de missão (F8-04)', () => {
  const snap = {
    id: 'm', title: { 'pt-BR': 'Missão', en: 'Mission' }, outcome: 'victory', outcomeText: { 'pt-BR': 'Vencemos', en: 'We won' },
    objectives: [
      { id: 'a', priority: 'primary', status: 'active', title: { 'pt-BR': 'Um', en: 'One' }, cur: 1, max: 3, unit: null },
      { id: 'b', priority: 'secondary', status: 'completed', title: 'Dois', cur: 1, max: 1, unit: null },
      { id: 'c', priority: 'hidden', status: 'completed', title: 'Segredo', cur: 1, max: 1, unit: null },
      { id: 'd', priority: 'primary', status: 'active', title: 'Tempo', cur: 65, max: 120, unit: 'seconds' }
    ]
  };
  it('agrupa por prioridade, localiza e formata o progresso', () => {
    const m = buildObjectivesModel(snap, 'en');
    expect(m.primary.map((r) => r.title)).toEqual(['One', 'Tempo']);
    expect(m.primary[0].progress).toBe('1/3');
    expect(m.primary[1].progress).toBe('1:05 / 2:00');
    expect(m.secondary[0].status).toBe('completed');
    expect(m.bonus[0].title).toBe('Segredo');
  });
  it('modelo de fim: vitória/derrota, tempo, objetivos cumpridos sem contar bônus', () => {
    const m = buildMissionEndModel(snap, 125, 'pt-BR');
    expect(m).toMatchObject({ outcome: 'victory', title: 'Missão', text: 'Vencemos', time: '2:05', completed: 1, total: 3 });
    expect(buildMissionEndModel({ ...snap, outcome: 'defeat' }, 0).outcome).toBe('defeat');
    expect(formatClock(-4)).toBe('0:00');
  });
});

describe('i18n da UI de missões (F8-04)', () => {
  it('chaves mission.* e menu.missions existem nos dois idiomas', () => {
    const keys = Object.keys(dicts['pt-BR']).filter((k) => k.startsWith('mission.') || k === 'menu.missions' || k === 'menu.missionsHint');
    expect(keys.length).toBeGreaterThan(20);
    for (const k of keys) expect(dicts.en[k], k).toBeTruthy();
  });
});
