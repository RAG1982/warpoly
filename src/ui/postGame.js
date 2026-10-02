/**
 * postGame.js (F6-07) — modelo puro da tela pós-jogo (sem DOM/three.js; testável em Node):
 * ranking por pontuação, linhas da tabela estilo WC2, séries de evolução e geometria dos gráficos.
 * A tela (DOM + canvas) vive em `screens/PostGameScreen.js`. Lê o snapshot de `MatchStats`
 * (`gm.result` / `matchStats.snapshot()`); nunca altera a simulação.
 */
import { t } from '../i18n/index.js';

/** Textos de UI (localizados via i18n, F6-09): getters para refletir a troca de idioma em tempo real. */
const COLS = ['rank', 'player', 'score', 'units', 'unitsTrained', 'unitsKilled', 'unitsLost', 'buildings', 'buildingsBuilt', 'buildingsDestroyed', 'buildingsLost', 'resources', 'gold', 'wood', 'stone', 'apm'];
const group = (prefix, keys) => Object.defineProperties({}, Object.fromEntries(keys.map(k => [k, { enumerable: true, get: () => t(`${prefix}.${k}`) }])));
export const POSTGAME_TEXT = {
  get victoryTitle() { return t('hud.victoryTitle'); },
  get defeatTitle() { return t('hud.defeatTitle'); },
  get timeLabel() { return t('pg.timeLabel'); },
  get scoreTitle() { return t('pg.scoreTitle'); },
  get chartsTitle() { return t('pg.chartsTitle'); },
  get noSeries() { return t('pg.noSeries'); },
  get playAgain() { return t('pg.playAgain'); },
  get mainMenu() { return t('pg.mainMenu'); },
  get you() { return t('pg.you'); },
  get ai() { return t('pg.ai'); },
  get winnerMark() { return t('pg.winnerMark'); },
  get tableCaption() { return t('pg.tableCaption'); },
  get chartAxisTime() { return t('pg.chartAxisTime'); },
  factions: group('pg.faction', ['human', 'orc']),
  columns: group('pg.col', COLS),
  get totalRow() { return t('pg.totalRow'); },
  metrics: group('pg.metric', ['units', 'buildings', 'kills', 'resources'])
};

/** Métricas dos gráficos, na ordem das abas. */
export const CHART_METRICS = Object.freeze(['units', 'buildings', 'kills', 'resources']);

/** `mm:ss` (ou `h:mm:ss` a partir de 1 h) de um tempo em segundos. */
export function formatTime(seconds) {
  const t = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = String(t % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

/** Inteiro com separador de milhar pt-BR (sem depender de `Intl` do ambiente de teste). */
export function formatNumber(n) {
  const v = Math.round(Number.isFinite(n) ? n : 0);
  return String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, '.').replace(/^/, v < 0 ? '-' : '');
}

/** Valor de uma métrica de gráfico num ponto da série de um jogador. */
export function metricValue(point, metric) {
  if (!point) return 0;
  if (metric === 'resources') return (point.gold || 0) + (point.wood || 0) + (point.stone || 0);
  return point[metric] || 0;
}

/**
 * @param {object} snapshot  `MatchStats.snapshot()`
 * @param {object} opts
 * @param {number} opts.localId
 * @param {boolean} opts.victory           vitória do time local?
 * @param {Record<number,string>} [opts.colors]  cor CSS por id de jogador
 */
export function buildPostGameModel(snapshot, { localId, victory, colors = {} }) {
  const snap = snapshot || { elapsed: 0, mode: 'conquest', winnerTeam: null, players: [], series: [] };
  const mode = snap.mode || 'conquest';
  const localTeam = (snap.players.find((p) => p.id === localId) || {}).team;
  // Vencedores: com vitória, todos do time do jogador local; senão, o único time vivo (se houver).
  const winnerTeam = victory ? localTeam : snap.winnerTeam;

  const rows = snap.players.map((p) => ({
    id: p.id,
    name: p.name,
    factionId: p.factionId,
    faction: POSTGAME_TEXT.factions[p.factionId] || p.factionId,
    team: p.team,
    isAI: !!p.isAI,
    isLocal: p.id === localId,
    isAlly: p.id !== localId && p.team === localTeam,
    color: colors[p.id] || null,
    defeated: !!p.defeated,
    isWinner: winnerTeam !== null && winnerTeam !== undefined && p.team === winnerTeam,
    score: Math.round(p.score || 0),
    unitsTrained: p.unitsTrained || 0,
    unitsKilled: p.unitsKilled || 0,
    unitsLost: p.unitsLost || 0,
    buildingsBuilt: p.buildingsBuilt || 0,
    buildingsDestroyed: p.buildingsDestroyed || 0,
    buildingsLost: p.buildingsLost || 0,
    gold: Math.round((p.resources && p.resources.gold) || 0),
    wood: Math.round((p.resources && p.resources.wood) || 0),
    stone: Math.round((p.resources && p.resources.stone) || 0),
    apm: Math.round(p.apm || 0),
    rank: 0
  }));
  // Ranking por pontuação (empate = mesma posição; desempate estável por id).
  rows.sort((a, b) => b.score - a.score || a.id - b.id);
  rows.forEach((r, i) => { r.rank = i > 0 && r.score === rows[i - 1].score ? rows[i - 1].rank : i + 1; });

  const sum = (k) => rows.reduce((acc, r) => acc + r[k], 0);
  const totals = {};
  for (const k of ['score', 'unitsTrained', 'unitsKilled', 'unitsLost', 'buildingsBuilt', 'buildingsDestroyed', 'buildingsLost', 'gold', 'wood', 'stone']) totals[k] = sum(k);

  return {
    outcome: victory ? 'victory' : 'defeat',
    title: victory ? POSTGAME_TEXT.victoryTitle : POSTGAME_TEXT.defeatTitle,
    message: t(`result.${victory ? 'victory' : 'defeat'}.${mode === 'regicide' ? 'regicide' : 'conquest'}`),
    mode,
    elapsed: snap.elapsed || 0,
    elapsedText: formatTime(snap.elapsed || 0),
    rows,
    totals,
    series: buildSeries(snap, rows)
  };
}

/** Séries por métrica: `{ times:[s], hasData, players:[{id,color,name}], metrics:{ units:{ [id]: number[] } } }`. */
export function buildSeries(snap, rows) {
  const pts = (snap.series || []).filter((p) => p && p.players);
  const metrics = {};
  for (const m of CHART_METRICS) {
    metrics[m] = {};
    for (const r of rows) metrics[m][r.id] = pts.map((p) => metricValue(p.players[r.id], m));
  }
  return {
    times: pts.map((p) => p.t),
    hasData: pts.length >= 1,
    players: rows.map((r) => ({ id: r.id, name: r.name, color: r.color })),
    metrics
  };
}

/**
 * Geometria de um gráfico de linhas dentro de um retângulo w×h com margens `pad`.
 * Eixo X de 0 até o último instante (cada série começa em (0,0) quando a primeira amostra é > 0);
 * eixo Y de 0 até um máximo "redondo" ≥ maior valor. Devolve pontos em pixels (y para baixo).
 * @returns {{xMax:number,yMax:number,xTicks:{t:number,x:number}[],yTicks:{v:number,y:number}[],lines:Record<number,{x:number,y:number}[]>}}
 */
export function chartGeometry(times, seriesById, w, h, pad = { l: 40, r: 12, t: 10, b: 24 }) {
  const innerW = Math.max(1, w - pad.l - pad.r);
  const innerH = Math.max(1, h - pad.t - pad.b);
  const xMax = Math.max(1, times.length ? times[times.length - 1] : 1);
  let max = 0;
  for (const arr of Object.values(seriesById)) for (const v of arr) if (v > max) max = v;
  const yMax = niceMax(max);
  const X = (t) => pad.l + (t / xMax) * innerW;
  const Y = (v) => pad.t + innerH - (v / yMax) * innerH;
  const lines = {};
  for (const [id, arr] of Object.entries(seriesById)) {
    const pts = [{ x: X(0), y: Y(0) }];
    arr.forEach((v, i) => pts.push({ x: X(times[i]), y: Y(v) }));
    lines[id] = pts;
  }
  const nx = Math.min(5, Math.max(1, Math.floor(xMax / 60)));
  const xTicks = [];
  for (let i = 0; i <= nx; i++) { const t = (xMax * i) / nx; xTicks.push({ t, x: X(t) }); }
  const yTicks = [];
  for (let i = 0; i <= 4; i++) { const v = (yMax * i) / 4; yTicks.push({ v, y: Y(v) }); }
  return { xMax, yMax, xTicks, yTicks, lines };
}

/** Menor valor "redondo" (1, 2, 4, 5, 8, 10 × 10^n) ≥ v; mínimo 4 (eixo nunca degenera). */
export function niceMax(v) {
  if (!(v > 4)) return 4;
  const mag = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 4, 5, 8, 10]) if (m * mag >= v) return m * mag;
  return 10 * mag;
}
