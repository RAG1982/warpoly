// src/ui/screens/OptionsPanel.js
// F6-08 · Menu de Opções completo — um único componente, aberto pelo menu principal e pelo
// jogo (menu de pausa / engrenagem da HUD). Persistência em `optionsStore` (+ QualitySettings
// para gráficos); aplica imediatamente tudo que não exige recarregar.
import './mainMenu.css';
import './gameScreens.css';
import './optionsPanel.css';
import { options as defaultOptions, TAB_OPTIONS } from '../optionsStore.js';
import { detectAudioLevel } from '../../audio/audioEnv.js';
import { getTextureQuality } from '../../models/textureQuality.js';
import { applyAudio, applyColorblind, applyKeybinds } from '../optionsApply.js';
import { applyUiScale } from '../uiScale.js';
import { QualitySettings, detectDefaultPreset } from '../../core/QualitySettings.js';
import {
  DEFAULT_BINDINGS, getBindings, findConflict, isReservedCode, codeLabel as rawCodeLabel
} from '../../core/Hotkeys.js';
import { t, LANGUAGES, getLanguage, setLanguage, has } from '../../i18n/index.js';

/** Nome da tecla localizado (`key.<code>` quando existe; senão o rótulo padrão do Hotkeys). */
const codeLabel = (code) => (has(`key.${code}`) ? t(`key.${code}`) : rawCodeLabel(code));
const bindLabel = (action) => t(`bind.${action}`);

export const OPEN_OPTIONS_EVENT = 'warpoly:open-options';

// `key` = chave i18n do rótulo; `label` = rótulo literal (números, nomes próprios de idioma).
const TABS = ['graphics', 'audio', 'controls', 'interface', 'game'].map((id) => ({ id, key: `opt.tab.${id}` }));

const PRESETS = ['low', 'med', 'high', 'ultra'].map((id) => ({ id, key: `opt.preset.${id}` }));
const TEXTURES = ['low', 'med', 'high', 'ultra'].map((id) => ({ id, key: `opt.texture.${id}` }));
const FPS_CHOICES = [
  { id: 'auto', key: 'opt.fps.auto' }, { id: '30', label: '30' }, { id: '60', label: '60' },
  { id: '120', label: '120' }, { id: '0', key: 'opt.fps.unlimited' }
];
const COLORBLIND = [
  { id: 'off', key: 'opt.colorblind.off' }, { id: 'protan', key: 'opt.colorblind.protan' },
  { id: 'deutan', key: 'opt.colorblind.deutan' }, { id: 'tritan', key: 'opt.colorblind.tritan' }
];
const SPEEDS = [{ id: '1', label: '1×' }, { id: '2', label: '2×' }, { id: '3', label: '3×' }];
const LIGHTING = ['day', 'sunset', 'night'].map((id) => ({ id, key: `opt.lighting.${id}` }));
const LANG_CHOICES = LANGUAGES.map((l) => ({ id: l.id, label: l.label }));

/** [rótulo da tecla (chave i18n ou literal), chave da descrição]. */
const FIXED_KEYS = [
  ['opt.fixed.camera.k', 'opt.fixed.camera'],
  ['opt.fixed.edge.k', 'opt.fixed.edge'],
  ['1 – 9', 'opt.fixed.group'],
  ['Ctrl + 1 – 9', 'opt.fixed.groupSet'],
  ['Shift + 1 – 9', 'opt.fixed.groupAdd'],
  ['opt.fixed.card.k', 'opt.fixed.card'],
  ['Esc', 'opt.fixed.esc']
];

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pct = (v) => `${Math.round(v * 100)}%`;

export class OptionsPanel {
  /**
   * @param {object} [opts]
   * @param {() => {sound?:any, sceneManager?:any, gameManager?:any}} [opts.getContext]  serviços vivos (áudio, câmera, partida)
   * @param {object} [opts.store]  optionsStore (testes)
   * @param {HTMLElement} [opts.parent]
   */
  constructor({ getContext = () => ({}), store = defaultOptions, parent = document.body } = {}) {
    this.getContext = getContext;
    this.store = store;
    this.parent = parent;
    this.root = null;
    this.tab = 'graphics';
    this.rebinding = null;      // ação em captura de tecla
    this.message = {};          // aviso por aba
    this.lastFocus = null;
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onOpenRequest = () => this.open();
    document.addEventListener(OPEN_OPTIONS_EVENT, this._onOpenRequest);
  }

  get isOpen() { return !!this.root && !this.root.hidden; }

  open(tab = null) {
    if (tab) this.tab = tab;
    if (!this.root) this._build();
    this.lastFocus = document.activeElement;
    this.root.hidden = false;
    this.rebinding = null;
    this._renderBody();
    window.addEventListener('keydown', this._onKeyDown, true);
    requestAnimationFrame(() => this.root?.querySelector('.op-tab[aria-selected="true"]')?.focus({ preventScroll: true }));
  }

  close() {
    if (!this.root || this.root.hidden) return;
    this.rebinding = null;
    this.root.hidden = true;
    window.removeEventListener('keydown', this._onKeyDown, true);
    if (this.lastFocus && document.contains(this.lastFocus)) this.lastFocus.focus({ preventScroll: true });
  }

  destroy() {
    this.close();
    document.removeEventListener(OPEN_OPTIONS_EVENT, this._onOpenRequest);
    this.root?.remove();
    this.root = null;
  }

  // ------------------------------------------------------------------ estrutura
  _build() {
    const root = document.createElement('div');
    root.id = 'options-panel';
    root.className = 'gs-overlay gs-vars op-overlay';
    root.hidden = true;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'op-title');
    root.innerHTML = `
      <div class="gs-card op-card">
        <header class="op-head">
          <div><p class="gs-kicker">${t('opt.kicker')}</p><h2 id="op-title" class="gs-title">${t('opt.title')}</h2></div>
          <button type="button" class="mm-close" data-op="close" aria-label="${t('opt.close')}">✕</button>
        </header>
        <div class="op-tabs" role="tablist" aria-label="${t('opt.sections')}">
          ${TABS.map((tb) => `<button type="button" class="op-tab" role="tab" id="op-tab-${tb.id}" aria-controls="op-body" data-tab="${tb.id}">${t(tb.key)}</button>`).join('')}
        </div>
        <div class="op-body" id="op-body" role="tabpanel" tabindex="-1"></div>
        <footer class="op-foot">
          <button type="button" class="mm-btn mm-btn--ghost" data-op="reset">${t('opt.reset')}</button>
          <button type="button" class="mm-btn mm-btn--primary" data-op="close"><span class="mm-btn__label">${t('opt.closeBtn')}</span></button>
        </footer>
      </div>`;
    root.addEventListener('click', (e) => this._onClick(e));
    root.addEventListener('input', (e) => this._onInput(e));
    root.addEventListener('change', (e) => this._onInput(e));
    root.querySelector('.op-tabs').addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const i = TABS.findIndex((tb) => tb.id === this.tab);
      const n = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length];
      e.preventDefault();
      this._setTab(n.id, true);
    });
    this.parent.appendChild(root);
    this.root = root;
  }

  /** Idioma trocado: refaz o cromo do diálogo (abas, botões) e a aba atual no novo idioma. */
  _rebuild() {
    const wasOpen = this.isOpen;
    this.root?.remove();
    this.root = null;
    this._build();
    this.root.hidden = !wasOpen;
    this.message = {};
    this._renderBody();
    this._focusSeg('lang', getLanguage());
  }

  _setTab(id, focus = false) {
    this.tab = id;
    this.rebinding = null;
    this._renderBody();
    if (focus) this.root.querySelector(`#op-tab-${id}`)?.focus({ preventScroll: true });
  }

  // ------------------------------------------------------------------ renderização
  _renderBody() {
    this.root.querySelectorAll('.op-tab').forEach((b) => {
      const sel = b.dataset.tab === this.tab;
      b.setAttribute('aria-selected', String(sel));
      b.tabIndex = sel ? 0 : -1;
      b.classList.toggle('is-active', sel);
    });
    const body = this.root.querySelector('#op-body');
    body.setAttribute('aria-labelledby', `op-tab-${this.tab}`);
    const scroll = body.scrollTop;
    body.innerHTML = this[`_tab_${this.tab}`]();
    body.scrollTop = scroll;
  }

  _seg(name, choices, current) {
    return `<div class="op-seg" role="radiogroup" data-seg="${name}">${choices.map((c) => `
      <label class="op-seg__item"><input type="radio" name="op-${name}" value="${c.id}" ${String(current) === c.id ? 'checked' : ''}/><span>${esc(c.key ? t(c.key) : c.label)}</span></label>`).join('')}</div>`;
  }

  _toggle(name, on, label) {
    return `<label class="op-toggle"><input type="checkbox" data-opt="${name}" ${on ? 'checked' : ''}/><span class="op-toggle__box" aria-hidden="true"></span><span>${esc(label)}</span></label>`;
  }

  _slider(name, { min, max, step, value, fmt }) {
    return `<div class="op-slider"><input type="range" data-opt="${name}" min="${min}" max="${max}" step="${step}" value="${value}" aria-label="${esc(name)}"/><output data-out="${name}">${fmt(value)}</output></div>`;
  }

  _row(label, control, hint = '') {
    return `<div class="op-row"><div class="op-row__label"><span>${esc(label)}</span>${hint ? `<em>${esc(hint)}</em>` : ''}</div><div class="op-row__ctl">${control}</div></div>`;
  }

  _notice(tab) {
    const m = this.message[tab];
    return `<p class="op-notice" role="status" aria-live="polite" ${m ? '' : 'hidden'}>${m ? esc(m) : ''}</p>`;
  }

  _tab_graphics() {
    const q = QualitySettings.current;
    const ov = QualitySettings.overrides || {};
    const ctx = this.getContext() || {};
    const fpsId = ov.fpsCap !== undefined ? String(ov.fpsCap) : (ov.targetFps !== undefined ? String(ov.targetFps) : 'auto');
    const dpr = Math.round(q.maxPixelRatio * 100) / 100;
    const lighting = ctx.sceneManager?.timeOfDay || 'day';
    return `
      ${this._notice('graphics')}
      <section class="op-group"><h3>${t('opt.g.quality')}</h3>
        ${this._row(t('opt.g.preset'), this._seg('preset', PRESETS, QualitySettings.name), t('opt.g.presetHint'))}
      </section>
      <section class="op-group"><h3>${t('opt.g.advanced')}</h3>
        ${this._row(t('opt.g.texture'), this._seg('texture', TEXTURES, q.textureQuality), t('opt.reloadHint'))}
        ${this._row(t('opt.g.shadows'), this._toggle('shadows', q.shadows, q.shadows ? t('opt.on.f.pl') : t('opt.off.f.pl')))}
        ${this._row(t('opt.g.hoverOutline'), this._toggle('hoverOutline', q.hoverOutline, q.hoverOutline ? t('opt.on.pl') : t('opt.off.pl')), t('opt.g.hoverOutlineHint'))}
        ${this._row(t('opt.g.dynRes'), this._toggle('dynamicResolution', q.dynamicResolution, q.dynamicResolution ? t('opt.on.f') : t('opt.off.f')), t('opt.g.dynResHint'))}
        ${this._row(t('opt.g.fps'), this._seg('fps', FPS_CHOICES, fpsId), t('opt.g.fpsHint'))}
        ${this._row(t('opt.g.scale'), this._slider('maxPixelRatio', { min: 0.5, max: 2, step: 0.05, value: dpr, fmt: (v) => `${Number(v).toFixed(2)}×` }), t('opt.g.scaleHint'))}
      </section>
      ${ctx.gameManager ? `<section class="op-group"><h3>${t('opt.g.currentMatch')}</h3>
        ${this._row(t('opt.g.lighting'), this._seg('lighting', LIGHTING, lighting))}
      </section>` : ''}`;
  }

  _tab_audio() {
    const s = this.store;
    const fmt = (v) => pct(Number(v));
    return `
      <section class="op-group"><h3>${t('opt.a.volume')}</h3>
        ${this._row(t('opt.a.master'), this._slider('volumeMaster', { min: 0, max: 1, step: 0.05, value: s.get('volumeMaster'), fmt }), t('opt.a.masterHint'))}
        ${this._row(t('opt.a.sfx'), this._slider('volumeSfx', { min: 0, max: 1, step: 0.05, value: s.get('volumeSfx'), fmt }))}
        ${this._row(t('opt.a.music'), this._slider('volumeMusic', { min: 0, max: 1, step: 0.05, value: s.get('volumeMusic'), fmt }))}
        ${this._row(t('opt.a.voice'), this._slider('volumeVoice', { min: 0, max: 1, step: 0.05, value: s.get('volumeVoice'), fmt }), t('opt.a.voiceHint'))}
      </section>`;
  }

  _tab_controls() {
    const s = this.store;
    const b = getBindings();
    const rows = Object.keys(DEFAULT_BINDINGS).map((a) => {
      const waiting = this.rebinding === a;
      const modified = b[a] !== DEFAULT_BINDINGS[a];
      return `<tr>
        <th scope="row">${esc(bindLabel(a))}</th>
        <td><kbd class="${waiting ? 'is-waiting' : ''}">${waiting ? t('opt.c.pressKey') : esc(codeLabel(b[a]) || '—')}</kbd></td>
        <td class="op-keys__act">
          <button type="button" class="op-mini" data-rebind="${a}" aria-label="${esc(t('opt.c.changeKeyOf', { action: bindLabel(a) }))}">${waiting ? t('opt.c.cancel') : t('opt.c.change')}</button>
          ${modified ? `<button type="button" class="op-mini" data-unbind="${a}" aria-label="${esc(t('opt.c.restoreKeyOf', { action: bindLabel(a) }))}">${t('opt.c.default')}</button>` : ''}
        </td></tr>`;
    }).join('');
    return `
      ${this._notice('controls')}
      <section class="op-group"><h3>${t('opt.c.camera')}</h3>
        ${this._row(t('opt.c.panSpeed'), this._slider('panSpeed', { min: 0.5, max: 2, step: 0.1, value: s.get('panSpeed'), fmt: (v) => `${Number(v).toFixed(1)}×` }))}
        ${this._row(t('opt.c.edgePan'), this._toggle('edgePan', s.get('edgePan'), s.get('edgePan') ? t('opt.on.f') : t('opt.off.f')), t('opt.c.edgePanHint'))}
      </section>
      <section class="op-group"><h3>${t('opt.c.rebindable')}</h3>
        <table class="op-keys"><tbody>${rows}</tbody></table>
        <p class="op-hint">${t('opt.c.rebindHint')}</p>
      </section>
      <section class="op-group"><h3>${t('opt.c.fixed')}</h3>
        <table class="op-keys op-keys--fixed"><tbody>${FIXED_KEYS.map(([k, d]) => `<tr><th scope="row"><kbd>${esc(has(k) ? t(k) : k)}</kbd></th><td colspan="2">${esc(t(d))}</td></tr>`).join('')}</tbody></table>
      </section>`;
  }

  _tab_interface() {
    const s = this.store;
    return `
      <section class="op-group"><h3>${t('opt.i.interface')}</h3>
        ${this._row(t('opt.i.language'), this._seg('lang', LANG_CHOICES, getLanguage()), t('opt.i.languageHint'))}
        ${this._row(t('opt.i.scale'), this._slider('uiScale', { min: 0.75, max: 1.5, step: 0.05, value: s.get('uiScale'), fmt: (v) => pct(Number(v)) }), t('opt.i.scaleHint'))}
        ${this._row(t('opt.i.colorblind'), this._seg('colorblind', COLORBLIND, s.get('colorblind')), t('opt.i.colorblindHint'))}
      </section>`;
  }

  _tab_game() {
    const s = this.store;
    return `
      <section class="op-group"><h3>${t('opt.m.match')}</h3>
        ${this._row(t('opt.m.speed'), this._seg('speed', SPEEDS, String(s.get('defaultSpeed'))), t('opt.m.speedHint'))}
        ${this._row(t('opt.m.floatingText'), this._toggle('floatingText', s.get('floatingText'), s.get('floatingText') ? t('opt.m.show') : t('opt.m.hide')), t('opt.m.floatingTextHint'))}
        ${this._row(t('opt.m.contextCursors'), this._toggle('contextCursors', s.get('contextCursors'), s.get('contextCursors') ? t('opt.on.pl') : t('opt.off.pl')), t('opt.m.contextCursorsHint'))}
      </section>
      ${document.getElementById('help-modal') ? `<section class="op-group"><h3>${t('opt.m.help')}</h3>
        <div><button type="button" class="op-mini" data-op="guide">${t('opt.m.openGuide')}</button></div>
      </section>` : ''}`;
  }

  // ------------------------------------------------------------------ eventos
  _notify(text) {
    this.message[this.tab] = text;
    const el = this.root.querySelector('.op-notice');
    if (el) { el.textContent = text || ''; el.hidden = !text; }
  }

  _onClick(e) {
    const el = e.target;
    const tab = el.closest('[data-tab]');
    if (tab) return this._setTab(tab.dataset.tab);
    const op = el.closest('[data-op]');
    if (op) {
      if (op.dataset.op === 'close') this.close();
      else if (op.dataset.op === 'reset') this._resetTab();
      else if (op.dataset.op === 'guide') {
        this.close();
        const help = document.getElementById('help-modal');
        if (help) help.style.display = 'flex';
      }
      return;
    }
    const rb = el.closest('[data-rebind]');
    if (rb) {
      const a = rb.dataset.rebind;
      this.rebinding = this.rebinding === a ? null : a;
      this.message.controls = '';
      return this._renderBody();
    }
    const ub = el.closest('[data-unbind]');
    if (ub) {
      const a = ub.dataset.unbind;
      this._saveBinding(a, DEFAULT_BINDINGS[a]);
    }
    if (e.target === this.root) this.close();
  }

  _onInput(e) {
    const el = e.target;
    if (e.type === 'input' && el.type !== 'range') return; // interruptores e segmentados: só no `change`
    const ctx = this.getContext() || {};
    if (el.matches('input[type="range"][data-opt]')) {
      const name = el.dataset.opt;
      const v = Number(el.value);
      const out = this.root.querySelector(`[data-out="${name}"]`);
      if (name === 'maxPixelRatio') {
        QualitySettings.setOverride('maxPixelRatio', v);
        if (out) out.textContent = `${v.toFixed(2)}×`;
        return;
      }
      const eff = this.store.set(name, v);
      if (out) out.textContent = name === 'panSpeed' ? `${eff.toFixed(1)}×` : pct(eff);
      if (name.startsWith('volume')) applyAudio(ctx.sound, this.store);
      else if (name === 'uiScale') applyUiScale();
      return;
    }
    if (el.matches('input[type="checkbox"][data-opt]')) {
      const name = el.dataset.opt;
      if (name === 'shadows' || name === 'dynamicResolution' || name === 'hoverOutline') {
        const { requiresReload } = QualitySettings.setOverride(name, el.checked);
        if (requiresReload) this._notify(t('opt.reloadHint'));
        this._renderBody();
      } else {
        this.store.set(name, el.checked);
        this._renderBody();
      }
      return;
    }
    if (el.matches('input[type="radio"]') && el.checked) {
      const seg = el.closest('[data-seg]')?.dataset.seg;
      this._onSeg(seg, el.value, ctx);
    }
  }

  /** F7-08: o nível de áudio acompanha preset/textura (`?audio=` e automação continuam mandando). */
  _applyAudioLevel(ctx) {
    ctx?.sound?.setLevel?.(detectAudioLevel(QualitySettings.current, getTextureQuality()));
  }

  _onSeg(seg, value, ctx) {
    if (seg === 'preset') {
      const { requiresReload } = QualitySettings.set(value);
      this._applyAudioLevel(ctx); // F7-08: vozes/ambiência do novo preset valem já
      this._notify(requiresReload ? t('opt.reloadHint') : '');
      this._renderBody();
      this._focusSeg(seg, value);
    } else if (seg === 'texture') {
      const { requiresReload } = QualitySettings.setOverride('textureQuality', value);
      this._applyAudioLevel(ctx);
      this._notify(requiresReload ? t('opt.reloadHint') : '');
      this._renderBody();
      this._focusSeg(seg, value);
    } else if (seg === 'fps') {
      if (value === 'auto') { QualitySettings.setOverride('fpsCap', null); QualitySettings.setOverride('targetFps', null); }
      else if (value === '0') { QualitySettings.setOverride('fpsCap', 0); QualitySettings.setOverride('targetFps', null); }
      else { QualitySettings.setOverride('fpsCap', Number(value)); QualitySettings.setOverride('targetFps', Number(value)); }
    } else if (seg === 'lighting') {
      ctx.sceneManager?.setTimeOfDay?.(value);
    } else if (seg === 'lang') {
      setLanguage(value);
      this._rebuild();
    } else if (seg === 'colorblind') {
      this.store.set('colorblind', value);
      applyColorblind(this.store);
    } else if (seg === 'speed') {
      const v = this.store.set('defaultSpeed', Number(value));
      if (ctx.gameManager) ctx.gameManager.gameSpeed = v;
    }
  }

  _focusSeg(seg, value) {
    this.root.querySelector(`[data-seg="${seg}"] input[value="${value}"]`)?.focus({ preventScroll: true });
  }

  _resetTab() {
    const ctx = this.getContext() || {};
    if (this.tab === 'graphics') {
      QualitySettings.set(detectDefaultPreset());
      this._notify(t('opt.g.restored'));
    } else {
      this.store.resetTab(this.tab);
      if (this.tab === 'audio') applyAudio(ctx.sound, this.store);
      else if (this.tab === 'controls') applyKeybinds(this.store);
      else if (this.tab === 'interface') { applyUiScale(); applyColorblind(this.store); }
      else if (this.tab === 'game' && ctx.gameManager) ctx.gameManager.gameSpeed = this.store.get('defaultSpeed');
    }
    this.rebinding = null;
    this._renderBody();
  }

  _saveBinding(action, code) {
    const current = this.store.get('keybinds');
    const next = { ...current, [action]: code };
    if (next[action] === DEFAULT_BINDINGS[action]) delete next[action];
    this.store.set('keybinds', next);
    applyKeybinds(this.store);
    this.rebinding = null;
    this._renderBody();
  }

  _onKeyDown(e) {
    if (!this.isOpen) return;
    const swallow = () => { e.preventDefault(); e.stopPropagation(); };
    if (this.rebinding) {
      swallow();
      if (e.key === 'Escape') { this.rebinding = null; this._notify(''); return this._renderBody(); }
      if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return;
      const a = this.rebinding;
      const code = e.code;
      if (isReservedCode(code)) { this._notify(t('opt.c.reserved', { key: codeLabel(code) })); return this._renderBody(); }
      const clash = findConflict(code, a);
      if (clash) { this._notify(t('opt.c.clash', { key: codeLabel(code), action: bindLabel(clash) })); return this._renderBody(); }
      this.message.controls = '';
      return this._saveBinding(a, code);
    }
    if (e.key === 'Escape') { swallow(); return this.close(); }
    if (e.key === 'Tab') { // prisão de foco dentro do diálogo
      const f = [...this.root.querySelectorAll('button:not([disabled]), input:not([disabled])')].filter((el) => el.offsetParent !== null);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && (document.activeElement === first || !this.root.contains(document.activeElement))) { swallow(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { swallow(); first.focus(); }
      return;
    }
    // O jogo por baixo não reage ao teclado enquanto as opções estão abertas.
    e.stopPropagation();
  }
}

export { TAB_OPTIONS };
