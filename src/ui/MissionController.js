/**
 * MissionController.js — F8-04: apresentação in-game de uma missão (`gm.mission`): painel de objetivos, diálogos com
 * retrato, cutscenes de câmera (keyframes, input travado, Esc pula), avisos, música/som e tela de fim de missão.
 *
 * Só leitura/apresentação: assina `gm.events` com ouvintes de apresentação (mudos durante save/replay fast-forward) e lê
 * `gm.mission.snapshot()` ~4×/s — nunca escreve na simulação. A câmera é render (fora do checksum). Criado e descartado
 * pela `MatchSession`; a lógica pura vive em `missionPresentation.js` (testada em Node).
 */
import './screens/mission.css';
import { EVT } from '../sim/events.js';
import { localize } from '../sim/missions/text.js';
import { t, getLanguage, onLanguageChange } from '../i18n/index.js';
import { getCampaignEndPlan, getProgress } from '../campaign/index.js';
import { getCampaign } from '../data/campaigns/index.js';
import { isCampaignFinale } from './campaignVictoryModel.js';
import { CampaignVictory } from './screens/CampaignVictory.js';
import { DialogQueue, buildObjectivesModel, buildMissionEndModel, cutscenePose, cutsceneDialogs } from './missionPresentation.js';

const POLL_INTERVAL = 0.25;
const END_DELAY = 1.4;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const STATUS_ICON = { completed: '✔', failed: '✘', active: '◻' };

export class MissionController {
  /**
   * @param {object} deps
   * @param {object} deps.gm  GameManager (com `mission`)
   * @param {object} deps.sceneManager
   * @param {object} deps.inputManager
   * @param {object} deps.uiManager
   * @param {object} deps.sound
   */
  constructor({ gm, sceneManager, inputManager, uiManager, sound }) {
    this.gm = gm;
    this.sm = sceneManager;
    this.im = inputManager;
    this.ui = uiManager;
    this.sound = sound;
    this.lang = () => getLanguage();
    this.dialogs = new DialogQueue({ lang: this.lang });
    this.cut = null;
    this._poll = 0;
    this._sig = '';
    this._endIn = -1;
    this._collapsed = false;
    this.disposed = false;

    this._build();
    const on = (type, fn) => gm.events.on(type, fn, true); // true = apresentação (mudo no fast-forward de save/replay)
    this._offs = [
      on(EVT.MISSION_OBJECTIVE, (p) => this._onObjective(p)),
      on(EVT.MISSION_DIALOG, (p) => this._pushDialog(p)),
      on(EVT.MISSION_MESSAGE, (p) => this.ui?.showNotification(localize(p.text, this.lang()), 4500)),
      on(EVT.MISSION_CAMERA, (p) => this._cameraTo(p)),
      on(EVT.MISSION_CUTSCENE, (p) => this._startCutscene(p)),
      on(EVT.MISSION_MUSIC, (p) => this._music(p.id)),
      on(EVT.MISSION_SOUND, (p) => this._sound(p.id)),
      on(EVT.MISSION_ENDED, () => { this._endIn = END_DELAY; })
    ];
    this._offLang = onLanguageChange(() => { this._sig = ''; this._renderPanel(true); this._renderDialog(); this._renderEnd(); });
    this._onKey = (e) => {
      if (e.code === 'Escape' && this.cut && this.cut.skippable) {
        e.preventDefault();
        e.stopImmediatePropagation();
        this._endCutscene(true);
      }
    };
    window.addEventListener('keydown', this._onKey, true);
    this._renderPanel(true);
    // Se a partida terminou antes de a HUD existir (carregar save de missão concluída), mostra o fim direto.
    if (gm.mission.outcome) this._endIn = 0.01;
  }

  // ------------------------------------------------------------------ DOM
  _build() {
    const mk = (tag, id, cls = '') => {
      const el = document.createElement(tag);
      el.id = id;
      if (cls) el.className = cls;
      document.body.appendChild(el);
      return el;
    };
    this.panel = mk('aside', 'mission-panel', 'ms-panel');
    this.panel.setAttribute('aria-live', 'polite');
    this.panel.addEventListener('click', (e) => {
      if (e.target.closest('[data-ms="toggle"]')) { this._collapsed = !this._collapsed; this._sig = ''; this._renderPanel(true); }
    });
    this.dialogBox = mk('div', 'mission-dialog', 'ms-dialog');
    this.dialogBox.hidden = true;
    this.dialogBox.addEventListener('click', () => { this.dialogs.dismiss(); this._renderDialog(); });
    this.bars = mk('div', 'mission-letterbox', 'ms-letterbox');
    this.bars.hidden = true;
    this.bars.addEventListener('click', (e) => { if (e.target.closest('[data-ms="skip"]')) this._endCutscene(true); });
    this.endBox = mk('div', 'mission-end', 'ms-end');
    this.endBox.hidden = true;
    this.endBox.addEventListener('click', (e) => {
      const b = e.target.closest('[data-ms]');
      if (!b) return;
      const act = b.dataset.ms;
      if (act === 'next') document.dispatchEvent(new CustomEvent('warpoly:mission-next'));
      else if (act === 'retry') document.dispatchEvent(new CustomEvent('warpoly:mission-retry'));
      else if (act === 'menu') document.dispatchEvent(new CustomEvent('warpoly:mission-menu'));
      else if (act === 'stats') { this.endBox.hidden = true; this.ui?.showPostGame?.(); }
    });
  }

  _renderPanel(force = false) {
    const snap = this.gm.mission.snapshot();
    const sig = JSON.stringify(snap.objectives.map((o) => [o.id, o.status, o.cur])) + this._collapsed + this.lang();
    if (!force && sig === this._sig) return;
    this._sig = sig;
    const lang = this.lang();
    const m = buildObjectivesModel(snap, lang);
    const row = (o) => `<li class="ms-obj is-${o.status}"><span class="ms-ico" aria-hidden="true">${STATUS_ICON[o.status] || '◻'}</span>`
      + `<span class="ms-txt"><span class="ms-title">${esc(o.title)}</span>${o.progress ? `<span class="ms-prog">${esc(o.progress)}</span>` : ''}${o.description && o.status === 'active' ? `<span class="ms-desc">${esc(o.description)}</span>` : ''}</span></li>`;
    const sec = (key, items) => (items.length ? `<h4 class="ms-h">${esc(t(`mission.${key}`))}</h4><ul class="ms-list">${items.map(row).join('')}</ul>` : '');
    this.panel.innerHTML = `<div class="ms-head"><span class="ms-kicker">${esc(localize(snap.title, lang))}</span>`
      + `<button type="button" class="ms-toggle" data-ms="toggle" aria-expanded="${!this._collapsed}" aria-label="${esc(t('mission.toggle'))}">${this._collapsed ? '▾' : '▴'}</button></div>`
      + (this._collapsed ? '' : sec('primary', m.primary) + sec('secondary', m.secondary) + sec('bonus', m.bonus));
  }

  _renderDialog() {
    const d = this.dialogs.current;
    if (!d) { this.dialogBox.hidden = true; return; }
    const lang = this.lang();
    this.dialogBox.hidden = false;
    this.dialogBox.innerHTML = `<div class="ms-portrait" aria-hidden="true">${esc(d.portrait || '💬')}</div>`
      + `<div class="ms-say">${d.speaker ? `<span class="ms-speaker">${esc(localize(d.speaker, lang))}</span>` : ''}<p>${esc(localize(d.text, lang))}</p></div>`
      + `<span class="ms-next">${esc(t('mission.dialogNext'))}</span>`;
  }

  _renderEnd() {
    if (this.endBox.hidden) return;
    const snap = this.gm.mission.snapshot();
    const plan = getCampaignEndPlan(snap.id, snap.outcome === 'victory' ? 'victory' : 'defeat');
    if (this.victory?.isOpen) return; // a tela final da campanha tem o próprio redesenho de idioma
    if (isCampaignFinale(plan)) { this.endBox.hidden = true; this._openCampaignVictory(plan); return; }
    const m = buildMissionEndModel(snap, this.gm.mission.elapsed, this.lang(), plan);
    const won = m.outcome === 'victory';
    const rows = m.rows.map((r) => `<li class="ms-obj is-${r.status}"><span class="ms-ico" aria-hidden="true">${STATUS_ICON[r.status] || '–'}</span>`
      + `<span class="ms-txt"><span class="ms-title">${esc(r.title)}</span>${r.priority !== 'primary' ? `<span class="ms-prog">${esc(t(`mission.${r.priority}`))}</span>` : ''}</span></li>`).join('');
    this.endBox.innerHTML = `<div class="ms-end-card ${won ? 'is-win' : 'is-lose'}" role="dialog" aria-modal="true" aria-labelledby="ms-end-title">`
      + `<h2 id="ms-end-title">${esc(t(won ? 'mission.victory' : 'mission.defeat'))}</h2>`
      + `<p class="ms-end-mission">${esc(m.title)}</p>`
      + (m.text ? `<p class="ms-end-text">${esc(m.text)}</p>` : '')
      + `<p class="ms-end-stats">${esc(t('mission.time'))}: ${esc(m.time)} · ${esc(t('mission.objectivesDone', { done: m.completed, total: m.total }))}</p>`
      + `<ul class="ms-list">${rows}</ul>`
      + (m.campaignDoneKey ? `<p class="ms-end-text">${esc(t(m.campaignDoneKey))}</p>` : '')
      + `<div class="ms-end-actions">${m.actions.map((x) => `<button type="button"${x.primary ? ' class="ms-primary"' : ''} data-ms="${x.id}">${esc(t(x.labelKey))}</button>`).join('')}</div></div>`;
    this.endBox.querySelector('.ms-primary')?.focus({ preventScroll: true });
  }

  /** Fim da campanha: tela especial de vitória (arte da facção + epílogo) no lugar do cartão simples. */
  _openCampaignVictory(plan) {
    const def = getCampaign(plan.campaignId);
    if (!def) { this.endBox.hidden = false; return; }
    this.victory = new CampaignVictory({
      def, plan, completed: getProgress().completed(plan.campaignId), sound: this.sound,
      onAction: (id) => {
        if (id === 'menu') document.dispatchEvent(new CustomEvent('warpoly:mission-menu'));
        else if (id === 'replay') document.dispatchEvent(new CustomEvent('warpoly:campaign-replay'));
        else if (id === 'stats') this.ui?.showPostGame?.();
      }
    });
    this.victory.open();
  }

  // ------------------------------------------------------------------ eventos
  _onObjective({ id, status, visible }) {
    if (!visible) return;
    const o = this.gm.mission.objectives.get(id);
    if (!o) return;
    const title = localize(o.def.title, this.lang());
    if (status === 'completed') this.ui?.showNotification(`✔ ${t('mission.objDone', { title })}`, 4500, 'good');
    else if (status === 'failed') this.ui?.showNotification(`✘ ${t('mission.objFailed', { title })}`, 5500, 'bad');
    else if (status === 'active' && this.gm.currentTick > 1) this.ui?.showNotification(`◻ ${t('mission.objNew', { title })}`, 4500);
    this._renderPanel();
  }

  _pushDialog(d, fromCutscene = false) {
    this.dialogs.push(fromCutscene ? { ...d, fromCutscene: true } : d);
    this._renderDialog();
  }

  _cameraTo({ x, z, zoom }) {
    this.sm.cameraTarget.set(x, 2.5, z);
    if (zoom) this.sm.targetZoomLevel = zoom;
  }

  _music(id) {
    if (!this.sound) return;
    if (id === 'off') this.sound.stopMusic?.();
    else if (this.sound.musicEnabled && this.sound.initialized) this.sound.startMusic?.();
  }

  _sound(id) {
    const s = this.sound;
    if (!s) return;
    const fn = { victory: 'playVictory', alarm: 'playAlarm', error: 'playError', build: 'playBuildComplete', order: 'playOrder', select: 'playSelect', hammer: 'playHammer', sword: 'playSword' }[id];
    if (fn && typeof s[fn] === 'function') s[fn]();
  }

  // ------------------------------------------------------------------ cutscene
  _startCutscene({ id, duration, skippable, steps }) {
    if (this.cut) this._endCutscene(false);
    const sm = this.sm;
    this.cut = {
      id, duration, skippable, steps, t: 0, sent: -Infinity,
      baseZoom: sm.targetZoomLevel,
      saved: { x: sm.cameraTarget.x, y: sm.cameraTarget.y, z: sm.cameraTarget.z, zoom: sm.targetZoomLevel }
    };
    this.im.suspended = true;
    this.im.cameraLocked = true;
    this.bars.hidden = false;
    this.bars.innerHTML = '<div class="ms-bar ms-bar--top"></div><div class="ms-bar ms-bar--bottom"></div>'
      + (skippable ? `<button type="button" class="ms-skip" data-ms="skip">${esc(t('mission.skip'))}</button>` : '');
    this._stepCutscene(0);
  }

  _stepCutscene(dt) {
    const c = this.cut;
    c.t = Math.min(c.duration, c.t + dt);
    const pose = cutscenePose(c.steps, c.t, c.baseZoom);
    if (pose) {
      this.sm.cameraTarget.set(pose.x, 2.5, pose.z);
      this.sm.targetZoomLevel = pose.zoom;
      this.sm.zoomLevel = pose.zoom;
    }
    for (const d of cutsceneDialogs(c.steps, c.sent, c.t)) this._pushDialog(d, true);
    c.sent = c.t;
    if (c.t >= c.duration) this._endCutscene(false);
  }

  _endCutscene(skipped) {
    const c = this.cut;
    if (!c) return;
    this.cut = null;
    this.bars.hidden = true;
    this.bars.innerHTML = '';
    this.im.cameraLocked = false;
    this.im.suspended = false;
    const sm = this.sm;
    sm.cameraTarget.set(c.saved.x, c.saved.y, c.saved.z); // devolve o jogador à vista dele
    sm.targetZoomLevel = c.saved.zoom;
    if (skipped) { this.dialogs.clear(); this._renderDialog(); }
  }

  // ------------------------------------------------------------------ por quadro
  /** @param {number} delta  segundos reais @param {boolean} simulate  false no menu de pausa */
  update(delta, simulate = true) {
    if (this.disposed) return;
    // Fim de missão: a partida já parou (POST_GAME => simulate=false), mas a tela de fim aparece depois de um respiro.
    if (this._endIn >= 0) {
      this._endIn -= delta;
      if (this._endIn < 0) {
        this._endIn = -2;
        if (this.cut) this._endCutscene(false);
        this.dialogs.clear();
        this._renderDialog();
        this._renderPanel(true);
        this.endBox.hidden = false;
        this._renderEnd();
      }
    }
    if (!simulate) return;
    if (this.cut) {
      this.im.suspended = true; // reafirma (menu de pausa pode ter liberado)
      this._stepCutscene(delta);
    }
    if (this.dialogs.tick(delta) || (this.dialogs.current && this.dialogBox.hidden)) this._renderDialog();
    this._poll += delta;
    if (this._poll >= POLL_INTERVAL) {
      this._poll = 0;
      this._renderPanel();
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.victory?.close();
    this.victory = null;
    if (this.cut) { this.im.cameraLocked = false; this.im.suspended = false; }
    this._offs.forEach((off) => off());
    this._offs = [];
    this._offLang?.();
    window.removeEventListener('keydown', this._onKey, true);
    for (const el of [this.panel, this.dialogBox, this.bars, this.endBox]) el?.remove();
    this.panel = this.dialogBox = this.bars = this.endBox = null;
  }
}
