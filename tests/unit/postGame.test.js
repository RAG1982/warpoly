import { describe, it, expect } from 'vitest';
import {
  buildPostGameModel, buildSeries, chartGeometry, niceMax, formatTime, formatNumber, metricValue, POSTGAME_TEXT, CHART_METRICS
} from '../../src/ui/postGame.js';
import { computeScore } from '../../src/sim/MatchStats.js';

const mkPlayer = (id, over = {}) => ({
  id, name: `P${id}`, factionId: id % 2 ? 'orc' : 'human', team: id, isAI: id !== 0, defeated: false,
  unitsTrained: 5, unitsLost: 2, unitsKilled: 3, buildingsBuilt: 4, buildingsLost: 1, buildingsDestroyed: 2,
  resources: { gold: 100, wood: 200, stone: 0 }, spent: { gold: 0, wood: 0, stone: 0 }, commands: 30, apm: 12.4, score: 0, ...over
});
const snap = (players, series = [], extra = {}) => ({ elapsed: 305, mode: 'conquest', winnerTeam: null, players, series, ...extra });
const pt = (t, d) => ({ t, players: d });

describe('formatTime / formatNumber', () => {
  it('formata mm:ss, h:mm:ss e valores inválidos', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(65.9)).toBe('1:05');
    expect(formatTime(3725)).toBe('1:02:05');
    expect(formatTime(NaN)).toBe('0:00');
    expect(formatTime(-5)).toBe('0:00');
  });
  it('separador de milhar pt-BR', () => {
    expect(formatNumber(1234567)).toBe('1.234.567');
    expect(formatNumber(999)).toBe('999');
    expect(formatNumber(1234.6)).toBe('1.235');
    expect(formatNumber(undefined)).toBe('0');
  });
});

describe('buildPostGameModel (F6-07)', () => {
  it('ranking por pontuação decrescente, empate = mesma posição, desempate por id', () => {
    const m = buildPostGameModel(snap([mkPlayer(0, { score: 50 }), mkPlayer(1, { score: 120 }), mkPlayer(2, { score: 50 }), mkPlayer(3, { score: 10 })]), { localId: 0, victory: false });
    expect(m.rows.map((r) => [r.id, r.rank])).toEqual([[1, 1], [0, 2], [2, 2], [3, 4]]);
  });

  it('vitória: todo o time local é vencedor; derrota sem time vivo: ninguém', () => {
    const players = [mkPlayer(0, { team: 0 }), mkPlayer(1, { team: 0 }), mkPlayer(2, { team: 1, defeated: true })];
    const v = buildPostGameModel(snap(players, [], { winnerTeam: 0 }), { localId: 0, victory: true });
    expect(v.outcome).toBe('victory');
    expect(v.title).toBe(POSTGAME_TEXT.victoryTitle);
    expect(v.rows.filter((r) => r.isWinner).map((r) => r.id).sort()).toEqual([0, 1]);
    expect(v.rows.find((r) => r.id === 1).isAlly).toBe(true);
    expect(v.rows.find((r) => r.id === 0).isLocal).toBe(true);
    const d = buildPostGameModel(snap(players), { localId: 0, victory: false });
    expect(d.outcome).toBe('defeat');
    expect(d.title).toBe(POSTGAME_TEXT.defeatTitle);
    expect(d.rows.some((r) => r.isWinner)).toBe(false);
    // derrota mas um único time inimigo vivo (winnerTeam informado pelo snapshot): ele vence
    const d2 = buildPostGameModel(snap(players, [], { winnerTeam: 1 }), { localId: 0, victory: false });
    expect(d2.rows.filter((r) => r.isWinner).map((r) => r.id)).toEqual([2]);
  });

  it('mensagem do modo (conquista × regicídio) e tempo formatado', () => {
    const c = buildPostGameModel(snap([mkPlayer(0)]), { localId: 0, victory: true });
    expect(c.message).toBe('Todas as construções inimigas foram destruídas!');
    expect(c.elapsedText).toBe('5:05');
    const r = buildPostGameModel(snap([mkPlayer(0)], [], { mode: 'regicide' }), { localId: 0, victory: false });
    expect(r.message).toBe('Seu Centro caiu diante dos invasores...');
  });

  it('linhas trazem valores do snapshot (recursos, APM arredondado, pontuação) e a cor do jogador', () => {
    const score = computeScore({ unitsKilled: 3, buildingsDestroyed: 2, resources: { gold: 100, wood: 200, stone: 0 } });
    const m = buildPostGameModel(snap([mkPlayer(0, { score })]), { localId: 0, victory: true, colors: { 0: '#2563eb' } });
    const r = m.rows[0];
    expect(r).toMatchObject({ unitsTrained: 5, unitsKilled: 3, unitsLost: 2, buildingsBuilt: 4, buildingsDestroyed: 2, buildingsLost: 1, gold: 100, wood: 200, stone: 0, apm: 12, color: '#2563eb', faction: 'Reino Humano' });
    expect(r.score).toBe(Math.round(score));
  });

  it('totais somam as colunas; snapshot vazio/nulo não quebra', () => {
    const m = buildPostGameModel(snap([mkPlayer(0, { score: 10 }), mkPlayer(1, { score: 20 })]), { localId: 0, victory: true });
    expect(m.totals).toMatchObject({ score: 30, unitsTrained: 10, gold: 200, wood: 400 });
    const e = buildPostGameModel(null, { localId: 0, victory: false });
    expect(e.rows).toEqual([]);
    expect(e.series.hasData).toBe(false);
  });
});

describe('séries e geometria dos gráficos', () => {
  const series = [
    pt(10, { 0: { units: 4, buildings: 3, kills: 0, gold: 10, wood: 5, stone: 0 }, 1: { units: 5, buildings: 3, kills: 1, gold: 0, wood: 0, stone: 0 } }),
    pt(20, { 0: { units: 7, buildings: 4, kills: 2, gold: 30, wood: 20, stone: 5 }, 1: { units: 6, buildings: 3, kills: 1, gold: 5, wood: 5, stone: 0 } })
  ];
  const rows = [{ id: 0, name: 'A', color: '#111' }, { id: 1, name: 'B', color: '#222' }];

  it('série vazia (partida < 10 s): hasData falso e métricas vazias', () => {
    const s = buildSeries({ series: [] }, rows);
    expect(s.hasData).toBe(false);
    for (const k of CHART_METRICS) expect(s.metrics[k][0]).toEqual([]);
  });
  it('1 ponto e N pontos; "recursos" soma ouro+madeira+pedra', () => {
    expect(buildSeries({ series: series.slice(0, 1) }, rows).metrics.units[0]).toEqual([4]);
    const s = buildSeries({ series }, rows);
    expect(s.times).toEqual([10, 20]);
    expect(s.metrics.units[1]).toEqual([5, 6]);
    expect(s.metrics.resources[0]).toEqual([15, 55]);
    expect(metricValue(series[1].players[0], 'resources')).toBe(55);
    expect(metricValue(undefined, 'units')).toBe(0);
  });
  it('niceMax: nunca menor que o máximo e mínimo 4', () => {
    expect(niceMax(0)).toBe(4);
    expect(niceMax(3)).toBe(4);
    expect(niceMax(7)).toBe(8);
    expect(niceMax(55)).toBe(80);
    expect(niceMax(101)).toBe(200);
    for (const v of [5, 9, 13, 99, 250, 1234]) expect(niceMax(v)).toBeGreaterThanOrEqual(v);
  });
  it('chartGeometry: dentro do retângulo, y invertido, origem (0,0) e último ponto no fim do eixo X', () => {
    const s = buildSeries({ series }, rows);
    const g = chartGeometry(s.times, s.metrics.resources, 600, 200);
    expect(g.xMax).toBe(20);
    expect(g.yMax).toBe(80);
    for (const pts of Object.values(g.lines)) {
      expect(pts).toHaveLength(3);
      expect(pts[0].x).toBeCloseTo(40);
      expect(pts[0].y).toBeCloseTo(200 - 24); // base do gráfico
      for (const p of pts) { expect(p.x).toBeGreaterThanOrEqual(40); expect(p.x).toBeLessThanOrEqual(600 - 12); expect(p.y).toBeGreaterThanOrEqual(10); expect(p.y).toBeLessThanOrEqual(176); }
    }
    expect(g.lines[0][2].x).toBeCloseTo(600 - 12);
    expect(g.lines[0][2].y).toBeLessThan(g.lines[1][2].y); // 55 > 10: mais alto (y menor)
    expect(g.yTicks).toHaveLength(5);
  });
  it('chartGeometry com série vazia não gera NaN', () => {
    const g = chartGeometry([], { 0: [] }, 300, 120);
    expect(g.xMax).toBe(1);
    expect(g.lines[0]).toHaveLength(1);
    expect(Number.isFinite(g.lines[0][0].x)).toBe(true);
  });
});
