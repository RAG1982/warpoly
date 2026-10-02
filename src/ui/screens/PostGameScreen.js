// src/ui/screens/PostGameScreen.js
// F6-07 · Tela pós-jogo: pontuação estilo WC2 (tabela + ranking) e gráficos de evolução em
// canvas 2D, dentro do `#game-over-modal` existente. Os botões "Jogar novamente" e "Menu
// principal" já são ligados pelo `main.js` (F2-04); aqui só atualizamos título, textos e relatório.
// Todo o modelo/formatação vive em `ui/postGame.js` (puro, testado); textos em `POSTGAME_TEXT`.
import './postGame.css';
import { POSTGAME_TEXT as T, CHART_METRICS, chartGeometry, formatNumber as fmtNumber, formatTime as fmtTime } from '../postGame.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const FALLBACK_COLORS = ['#2563eb', '#dc2626', '#16a34a', '#eab308', '#a855f7', '#06b6d4', '#f97316', '#ec4899'];

export class PostGameScreen {
  /** @param {HTMLElement} modal  `#game-over-modal` */
  constructor(modal) {
    this.modal = modal;
    this.card = modal ? modal.querySelector('.modal-card') : null;
    this.titleEl = document.getElementById('game-over-title');
    this.msgEl = document.getElementById('game-over-msg');
    this.report = null;
    this.model = null;
    this.metric = CHART_METRICS[0];
    this._ro = null;
    this._abort = new AbortController();
  }

  /** @param {ReturnType<import('../postGame.js').buildPostGameModel>} model */
  show(model) {
    if (!this.modal) return;
    this.model = model;
    this.metric = CHART_METRICS[0];
    this.modal.style.display = 'flex';
    this.card?.classList.add('pg-card');
    if (this.titleEl) {
      this.titleEl.textContent = model.title;
      this.titleEl.style.color = model.outcome === 'victory' ? '#ffd700' : '#ef4444';
    }
    if (this.msgEl) {
      this.msgEl.style.whiteSpace = 'pre-line';
      this.msgEl.textContent = `${model.message}\n${T.timeLabel}: ${model.elapsedText}`;
    }
    this._ensureReport();
    this.report.innerHTML = this._tableHtml(model) + this._chartsHtml(model);
    this._wireCharts();
  }

  hide() {
    if (this.modal) this.modal.style.display = 'none';
    this._teardownChart();
    if (this.report) this.report.innerHTML = '';
    this.card?.classList.remove('pg-card');
    this.model = null;
  }

  dispose() {
    this._abort.abort();
    this.hide();
    this.report?.remove();
    this.report = null;
  }

  _ensureReport() {
    if (this.report && this.report.isConnected) return;
    this.report = document.createElement('div');
    this.report.id = 'game-over-report';
    this.report.className = 'pg-report';
    const actions = this.card.querySelector('.gs-actions');
    this.card.insertBefore(this.report, actions);
  }

  _swatch(color, i) {
    return `<span class="pg-swatch" style="background:${esc(color || FALLBACK_COLORS[i % FALLBACK_COLORS.length])}" aria-hidden="true"></span>`;
  }

  _tableHtml(m) {
    const C = T.columns;
    const rows = m.rows.map((r, i) => {
      const tags = [r.isLocal ? (r.name === T.you ? '' : T.you) : r.isAI ? T.ai : '', r.isWinner ? `🏆 ${T.winnerMark}` : ''].filter(Boolean).join(' · ');
      return `<tr class="${r.isLocal ? 'is-local ' : ''}${r.isWinner ? 'is-winner' : ''}" data-player="${r.id}">
        <td class="pg-rank">${r.rank}º</td>
        <th scope="row" class="pg-player">${this._swatch(r.color, i)}<span class="pg-name">${esc(r.name)}</span><span class="pg-sub">${esc(r.faction)}${tags ? ' · ' + esc(tags) : ''}</span></th>
        <td class="pg-score">${fmt(r.score)}</td>
        <td>${fmt(r.unitsTrained)}</td><td>${fmt(r.unitsKilled)}</td><td>${fmt(r.unitsLost)}</td>
        <td>${fmt(r.buildingsBuilt)}</td><td>${fmt(r.buildingsDestroyed)}</td><td>${fmt(r.buildingsLost)}</td>
        <td>${fmt(r.gold)}</td><td>${fmt(r.wood)}</td><td>${fmt(r.stone)}</td>
        <td>${fmt(r.apm)}</td></tr>`;
    }).join('');
    const t = m.totals;
    return `<h3 class="pg-h">${esc(T.scoreTitle)}</h3>
      <div class="pg-table-wrap"><table class="pg-table">
        <caption class="pg-sr">${esc(T.tableCaption)}</caption>
        <thead>
          <tr><th rowspan="2" scope="col">${esc(C.rank)}</th><th rowspan="2" scope="col" class="pg-left">${esc(C.player)}</th><th rowspan="2" scope="col">${esc(C.score)}</th>
            <th colspan="3" scope="colgroup">${esc(C.units)}</th><th colspan="3" scope="colgroup">${esc(C.buildings)}</th><th colspan="3" scope="colgroup">${esc(C.resources)}</th><th rowspan="2" scope="col">${esc(C.apm)}</th></tr>
          <tr><th scope="col">${esc(C.unitsTrained)}</th><th scope="col">${esc(C.unitsKilled)}</th><th scope="col">${esc(C.unitsLost)}</th>
            <th scope="col">${esc(C.buildingsBuilt)}</th><th scope="col">${esc(C.buildingsDestroyed)}</th><th scope="col">${esc(C.buildingsLost)}</th>
            <th scope="col">${esc(C.gold)}</th><th scope="col">${esc(C.wood)}</th><th scope="col">${esc(C.stone)}</th></tr>
        </thead>
        <tbody>${rows}</tbody>
        <tfoot><tr><th scope="row" colspan="2" class="pg-left">${esc(T.totalRow)}</th><td>${fmt(t.score)}</td>
          <td>${fmt(t.unitsTrained)}</td><td>${fmt(t.unitsKilled)}</td><td>${fmt(t.unitsLost)}</td>
          <td>${fmt(t.buildingsBuilt)}</td><td>${fmt(t.buildingsDestroyed)}</td><td>${fmt(t.buildingsLost)}</td>
          <td>${fmt(t.gold)}</td><td>${fmt(t.wood)}</td><td>${fmt(t.stone)}</td><td></td></tr></tfoot>
      </table></div>`;
  }

  _chartsHtml(m) {
    if (!m.series.hasData) return `<h3 class="pg-h">${esc(T.chartsTitle)}</h3><p class="pg-empty">${esc(T.noSeries)}</p>`;
    const tabs = CHART_METRICS.map((k, i) => `<button type="button" class="pg-tab${i === 0 ? ' is-active' : ''}" role="tab" aria-selected="${i === 0}" data-metric="${k}">${esc(T.metrics[k])}</button>`).join('');
    const legend = m.series.players.map((p, i) => `<span class="pg-leg">${this._swatch(p.color, i)}${esc(p.name)}</span>`).join('');
    return `<h3 class="pg-h">${esc(T.chartsTitle)}</h3>
      <div class="pg-tabs" role="tablist">${tabs}</div>
      <div class="pg-chart-box"><canvas class="pg-chart" id="pg-chart" role="img" aria-label="${esc(T.chartsTitle)}"></canvas></div>
      <div class="pg-legend">${legend}<span class="pg-axis">${esc(T.chartAxisTime)}</span></div>`;
  }

  _wireCharts() {
    this._teardownChart();
    const canvas = this.report.querySelector('#pg-chart');
    if (!canvas) return;
    this.report.querySelector('.pg-tabs').addEventListener('click', (e) => {
      const b = e.target.closest('[data-metric]');
      if (!b) return;
      this.metric = b.dataset.metric;
      this.report.querySelectorAll('.pg-tab').forEach((t) => {
        const on = t === b;
        t.classList.toggle('is-active', on);
        t.setAttribute('aria-selected', String(on));
      });
      this.drawChart();
    }, { signal: this._abort.signal });
    if (typeof ResizeObserver !== 'undefined') {
      this._ro = new ResizeObserver(() => this.drawChart());
      this._ro.observe(canvas.parentElement);
    }
    requestAnimationFrame(() => this.drawChart());
  }

  _teardownChart() {
    if (this._ro) { this._ro.disconnect(); this._ro = null; }
  }

  _isLocal(id) {
    return !!this.model.rows.find((r) => r.id === id)?.isLocal;
  }

  /** Desenha o gráfico da métrica atual (linha por jogador, na cor dele). */
  drawChart() {
    const canvas = this.report && this.report.querySelector('#pg-chart');
    if (!canvas || !this.model) return;
    const box = canvas.parentElement.getBoundingClientRect();
    const w = Math.max(200, Math.floor(box.width));
    const h = Math.max(120, Math.floor(box.height));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const s = this.model.series;
    const geo = chartGeometry(s.times, s.metrics[this.metric], w, h);
    ctx.font = '11px Nunito, sans-serif';
    ctx.fillStyle = 'rgba(245,228,178,0.8)';
    ctx.strokeStyle = 'rgba(212,175,55,0.18)';
    ctx.lineWidth = 1;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (const t of geo.yTicks) {
      ctx.beginPath(); ctx.moveTo(40, t.y + 0.5); ctx.lineTo(w - 12, t.y + 0.5); ctx.stroke();
      ctx.fillText(String(Math.round(t.v)), 34, t.y);
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    geo.xTicks.forEach((t, i) => {
      ctx.textAlign = i === geo.xTicks.length - 1 ? 'right' : i === 0 ? 'left' : 'center';
      ctx.fillText(fmtTime(t.t), i === geo.xTicks.length - 1 ? w - 4 : i === 0 ? 36 : t.x, h - 18);
    });

    // O jogador local é desenhado primeiro (linha mais grossa) para as demais não ficarem escondidas.
    const order = s.players.map((p, i) => ({ p, i })).sort((a, b) => Number(!!this._isLocal(b.p.id)) - Number(!!this._isLocal(a.p.id)));
    order.forEach(({ p, i }) => {
      const pts = geo.lines[p.id];
      if (!pts || pts.length < 2) return;
      ctx.strokeStyle = p.color || FALLBACK_COLORS[i % FALLBACK_COLORS.length];
      ctx.lineWidth = this._isLocal(p.id) ? 3 : 2;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      pts.forEach((q, k) => (k === 0 ? ctx.moveTo(q.x, q.y) : ctx.lineTo(q.x, q.y)));
      ctx.stroke();
    });
  }
}

const fmt = fmtNumber;
