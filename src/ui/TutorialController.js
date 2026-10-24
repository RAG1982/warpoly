/**
 * TutorialController.js (F6-09) — cola entre a lógica pura (`tutorial.js`) e a partida: assina o `EventBus`
 * da simulação, alimenta o `Tutorial`, desenha o painel de objetivo (passo, texto, progresso, Pular) e a seta/destaque
 * que mostra onde clicar (posição de mundo projetada na câmera, ou um botão da HUD). Só existe em partidas com
 * `matchConfig.tutorial`; criado e descartado pela `MatchSession`.
 */
import * as THREE from 'three';
import './screens/tutorial.css';
import { Tutorial, TUTORIAL_EVENT_TYPES, TUTORIAL_RIVAL_ID } from './tutorial.js';
import { t, onLanguageChange, resourceName } from '../i18n/index.js';
import { getUnitDef } from '../data/index.js';

const POLL_INTERVAL = 0.25;

export class TutorialController {
  /**
   * @param {object} deps
   * @param {object} deps.gm  GameManager
   * @param {object} deps.sceneManager
   * @param {object} [deps.uiManager]  para avisos ("passo concluído")
   * @param {() => void} [deps.onExit]  "Menu principal" na tela de conclusão
   */
  constructor({ gm, sceneManager, uiManager = null, onExit = null }) {
    this.gm = gm;
    this.sm = sceneManager;
    this.ui = uiManager;
    this.onExit = onExit;
    this._poll = 0;
    this._v = new THREE.Vector3();
    this._lastStepId = null;

    this.tutorial = new Tutorial({ localPlayerId: gm.localPlayerId, onChange: (s) => this._onChange(s) });
    this._offs = TUTORIAL_EVENT_TYPES.map((type) => gm.events.on(type, (payload) => this.tutorial.handleEvent(type, payload), true));
    this._offLang = onLanguageChange(() => this._render());
    this._build();
    this._render();
  }

  // ------------------------------------------------------------------ DOM
  _build() {
    const panel = document.createElement('aside');
    panel.id = 'tutorial-panel';
    panel.setAttribute('aria-live', 'polite');
    panel.setAttribute('aria-label', 'Tutorial');
    document.body.appendChild(panel);
    panel.addEventListener('click', (e) => {
      const b = e.target.closest('[data-tut]');
      if (!b) return;
      const act = b.dataset.tut;
      if (act === 'skip') this.tutorial.skip();
      else if (act === 'continue') this._hidePanel();
      else if (act === 'menu') this.onExit?.();
    });
    this.panel = panel;

    const marker = document.createElement('div');
    marker.id = 'tutorial-marker';
    marker.setAttribute('aria-hidden', 'true');
    marker.textContent = '▼';
    document.body.appendChild(marker);
    this.marker = marker;

    const ring = document.createElement('div');
    ring.id = 'tutorial-ring';
    ring.setAttribute('aria-hidden', 'true');
    document.body.appendChild(ring);
    this.ring = ring;
  }

  _hidePanel() {
    this.panel.hidden = true;
    this.marker.style.display = 'none';
    this.ring.style.display = 'none';
  }

  _onChange(state) {
    // Aviso a cada passo concluído (não no primeiro estado nem ao pular).
    if (this._lastStepId !== null && state.stepId !== this._lastStepId && !state.skipped) {
      this.ui?.showNotification(`✔ ${t('tut.stepDone')}`, 2200, 'good');
    }
    this._lastStepId = state.stepId;
    if (this.panel) this._render();
  }

  _render() {
    const panel = this.panel;
    if (!panel) return;
    const s = this.tutorial.state();
    if (s.skipped) { this._hidePanel(); return; }
    panel.hidden = false;
    const dots = Array.from({ length: s.total }, (_, i) => `<i class="${s.finished || i < s.index ? 'is-done' : (i === s.index ? 'is-current' : '')}"></i>`).join('');
    if (s.finished) {
      panel.innerHTML = `
        <div class="tut-head"><span class="tut-kicker">${t('tut.kicker')}</span><span class="tut-count">${s.total}/${s.total}</span></div>
        <h3 class="tut-title">${t('tut.done.title')}</h3>
        <p class="tut-text">${t('tut.done.text')}</p>
        <div class="tut-dots">${dots}</div>
        <div class="tut-actions">
          <button type="button" class="tut-primary" data-tut="continue">${t('tut.continue')}</button>
          <button type="button" data-tut="menu">${t('tut.menu')}</button>
        </div>`;
      return;
    }
    const id = s.stepId;
    const showProgress = s.need > 1;
    const label = s.unit ? `${resourceName(s.unit)}: ${s.count}/${s.need}` : t('tut.progress', { count: s.count, need: s.need });
    panel.innerHTML = `
      <div class="tut-head"><span class="tut-kicker">${t('tut.kicker')}</span><span class="tut-count">${t('tut.step', { n: s.index + 1, total: s.total })}</span></div>
      <h3 class="tut-title">${t(`tut.${id}.title`)}</h3>
      <p class="tut-text">${t(`tut.${id}.text`)}</p>
      <div class="tut-dots">${dots}</div>
      <div class="tut-progress"${showProgress ? '' : ' hidden'}><div class="tut-bar"><div style="width:${Math.round((s.count / Math.max(1, s.need)) * 100)}%"></div></div><span class="tut-progress-label">${label}</span></div>
      <div class="tut-actions"><button type="button" data-tut="skip">${t('tut.skip')}</button></div>`;
  }

  // ------------------------------------------------------------------ por quadro
  update(delta) {
    if (!this.tutorial.active) return;
    this._poll += delta;
    if (this._poll >= POLL_INTERVAL) {
      this._poll = 0;
      this.tutorial.update(this._snapshot());
    }
    this._placeMarker();
  }

  _snapshot() {
    const gm = this.gm;
    const sel = gm.selectedUnits || [];
    return {
      selectedWorker: sel.some((u) => !u.isDead && getUnitDef(u.type).isWorker),
      campGone: !(gm.buildings || []).some((b) => b.type === 'bandit_camp' && !b.isDead),
      rivalDefeated: !!(gm.players || []).find((p) => p.id === TUTORIAL_RIVAL_ID)?.defeated
    };
  }

  /** Posição de mundo do alvo `what` (ou null). */
  _worldTarget(what) {
    const gm = this.gm;
    const me = gm.localPlayerId;
    const home = gm.localPlayer && gm.localPlayer.startPos ? gm.localPlayer.startPos : { x: 0, z: 0 };
    const nearest = (list, ok, posOf) => {
      let best = null; let bd = Infinity;
      for (const e of list || []) {
        if (!ok(e)) continue;
        const p = posOf(e);
        const d = (p.x - home.x) ** 2 + (p.z - home.z) ** 2;
        if (d < bd) { bd = d; best = p; }
      }
      return best;
    };
    const pos = (e) => e.mesh.position;
    if (what === 'worker') return nearest(gm.units, (u) => u.ownerId === me && !u.isDead && getUnitDef(u.type).isWorker, pos);
    if (what === 'tree') return nearest(gm.trees, (tr) => !tr.isDead && tr.woodRemaining > 0, pos);
    if (what === 'gold') return nearest(gm.resourceDeposits, (r) => r.type === 'gold' && !r.isDead && (r.resourcesRemaining ?? 1) > 0, pos);
    if (what === 'camp') return nearest(gm.buildings, (b) => b.type === 'bandit_camp' && !b.isDead, pos);
    if (what === 'barracks') return nearest(gm.buildings, (b) => b.ownerId === me && !b.isDead && b.isConstructed && b.type === 'barracks', pos);
    if (what === 'rivalBase') return nearest(gm.buildings, (b) => b.ownerId === TUTORIAL_RIVAL_ID && !b.isDead, pos);
    return null;
  }

  _placeMarker() {
    const step = this.tutorial.step;
    const marker = this.marker;
    const ring = this.ring;
    if (!step) { marker.style.display = 'none'; ring.style.display = 'none'; return; }

    let focus = step.focus;
    if (focus.kind === 'ui') {
      const el = document.querySelector(focus.selector);
      const r = el && el.offsetParent !== null ? el.getBoundingClientRect() : null;
      if (r && r.width > 0) {
        ring.style.display = 'block';
        ring.style.left = `${r.left - 4}px`;
        ring.style.top = `${r.top - 4}px`;
        ring.style.width = `${r.width + 8}px`;
        ring.style.height = `${r.height + 8}px`;
        marker.style.display = 'none';
        return;
      }
      ring.style.display = 'none';
      focus = step.fallback || null;
      if (!focus) { marker.style.display = 'none'; return; }
    } else {
      ring.style.display = 'none';
    }

    const p = this._worldTarget(focus.what);
    if (!p) { marker.style.display = 'none'; return; }
    const cam = this.sm.camera;
    const canvas = this.sm.renderer.domElement;
    const rect = canvas.getBoundingClientRect();
    this._v.set(p.x, (p.y || 0) + 3.5, p.z).project(cam);
    let x = (this._v.x * 0.5 + 0.5) * rect.width + rect.left;
    let y = (-this._v.y * 0.5 + 0.5) * rect.height + rect.top;
    const margin = 40;
    const off = this._v.z > 1 || x < rect.left + margin || x > rect.right - margin || y < rect.top + margin || y > rect.bottom - margin;
    marker.style.display = 'block';
    if (off) {
      // Fora da tela: seta presa à borda apontando para o alvo.
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      let dx = x - cx; let dy = y - cy;
      if (this._v.z > 1) { dx = -dx; dy = -dy; }
      const k = Math.min((rect.width / 2 - margin) / Math.max(1e-3, Math.abs(dx)), (rect.height / 2 - margin) / Math.max(1e-3, Math.abs(dy)));
      x = cx + dx * k;
      y = cy + dy * k;
      marker.textContent = '➤';
      marker.style.transform = `translate(-50%, -50%) rotate(${Math.atan2(dy, dx)}rad)`;
      marker.classList.remove('is-world');
    } else {
      marker.textContent = '▼';
      marker.style.transform = 'translate(-50%, -100%)';
      marker.classList.add('is-world');
    }
    marker.style.left = `${x}px`;
    marker.style.top = `${y}px`;
  }

  dispose() {
    this._offs.forEach((off) => off());
    this._offs = [];
    this._offLang?.();
    this.panel?.remove();
    this.marker?.remove();
    this.ring?.remove();
    this.panel = this.marker = this.ring = null;
  }
}
