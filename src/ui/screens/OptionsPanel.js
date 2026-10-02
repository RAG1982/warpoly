// src/ui/screens/OptionsPanel.js
// F6-08 · Menu de Opções completo — um único componente, aberto pelo menu principal e pelo
// jogo (menu de pausa / engrenagem da HUD). Persistência em `optionsStore` (+ QualitySettings
// para gráficos); aplica imediatamente tudo que não exige recarregar.
import './mainMenu.css';
import './gameScreens.css';
import './optionsPanel.css';
import { options as defaultOptions, TAB_OPTIONS } from '../optionsStore.js';
import { applyAudio, applyColorblind, applyKeybinds } from '../optionsApply.js';
import { applyUiScale } from '../uiScale.js';
import { QualitySettings, detectDefaultPreset } from '../../core/QualitySettings.js';
import {
  DEFAULT_BINDINGS, BINDING_LABELS, getBindings, findConflict, isReservedCode, codeLabel
} from '../../core/Hotkeys.js';

export const OPEN_OPTIONS_EVENT = 'warpoly:open-options';

const TABS = [
  { id: 'graphics', label: 'Gráficos' },
  { id: 'audio', label: 'Áudio' },
  { id: 'controls', label: 'Controles' },
  { id: 'interface', label: 'Interface' },
  { id: 'game', label: 'Jogo' }
];

const PRESETS = [
  { id: 'low', label: 'Baixo' }, { id: 'med', label: 'Médio' },
  { id: 'high', label: 'Alto' }, { id: 'ultra', label: 'Ultra' }
];
const TEXTURES = [
  { id: 'low', label: 'Baixa' }, { id: 'med', label: 'Média' },
  { id: 'high', label: 'Alta' }, { id: 'ultra', label: 'Ultra' }
];
const FPS_CHOICES = [
  { id: 'auto', label: 'Automático' }, { id: '30', label: '30' }, { id: '60', label: '60' },
  { id: '120', label: '120' }, { id: '0', label: 'Sem limite' }
];
const COLORBLIND = [
  { id: 'off', label: 'Desligado' }, { id: 'protan', label: 'Protanopia' },
  { id: 'deutan', label: 'Deuteranopia' }, { id: 'tritan', label: 'Tritanopia' }
];
const SPEEDS = [{ id: '1', label: '1×' }, { id: '2', label: '2×' }, { id: '3', label: '3×' }];
const LIGHTING = [{ id: 'day', label: 'Dia' }, { id: 'sunset', label: 'Pôr do sol' }, { id: 'night', label: 'Noite' }];

const FIXED_KEYS = [
  ['W A S D / setas', 'Mover a câmera'],
  ['Mouse na borda', 'Mover a câmera (se ativado)'],
  ['1 – 9', 'Selecionar grupo de controle'],
  ['Ctrl + 1 – 9', 'Definir grupo de controle'],
  ['Shift + 1 – 9', 'Adicionar ao grupo'],
  ['Letras do card', 'Construir, treinar e pesquisar (mostradas nos botões)'],
  ['Esc', 'Cancelar / menu de pausa']
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
          <div><p class="gs-kicker">Configurações</p><h2 id="op-title" class="gs-title">Opções</h2></div>
          <button type="button" class="mm-close" data-op="close" aria-label="Fechar opções">✕</button>
        </header>
        <div class="op-tabs" role="tablist" aria-label="Seções de opções">
          ${TABS.map((t) => `<button type="button" class="op-tab" role="tab" id="op-tab-${t.id}" aria-controls="op-body" data-tab="${t.id}">${t.label}</button>`).join('')}
        </div>
        <div class="op-body" id="op-body" role="tabpanel" tabindex="-1"></div>
        <footer class="op-foot">
          <button type="button" class="mm-btn mm-btn--ghost" data-op="reset">Restaurar padrão</button>
          <button type="button" class="mm-btn mm-btn--primary" data-op="close"><span class="mm-btn__label">Fechar</span></button>
        </footer>
      </div>`;
    root.addEventListener('click', (e) => this._onClick(e));
    root.addEventListener('input', (e) => this._onInput(e));
    root.addEventListener('change', (e) => this._onInput(e));
    root.querySelector('.op-tabs').addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const i = TABS.findIndex((t) => t.id === this.tab);
      const n = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length];
      e.preventDefault();
      this._setTab(n.id, true);
    });
    this.parent.appendChild(root);
    this.root = root;
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
      <label class="op-seg__item"><input type="radio" name="op-${name}" value="${c.id}" ${String(current) === c.id ? 'checked' : ''}/><span>${esc(c.label)}</span></label>`).join('')}</div>`;
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
      <section class="op-group"><h3>Qualidade geral</h3>
        ${this._row('Predefinição', this._seg('preset', PRESETS, QualitySettings.name), 'Escolher uma predefinição descarta os ajustes avançados.')}
      </section>
      <section class="op-group"><h3>Avançado</h3>
        ${this._row('Qualidade de textura', this._seg('texture', TEXTURES, q.textureQuality), 'Aplica ao recarregar a página.')}
        ${this._row('Sombras', this._toggle('shadows', q.shadows, q.shadows ? 'Ligadas' : 'Desligadas'))}
        ${this._row('Resolução dinâmica', this._toggle('dynamicResolution', q.dynamicResolution, q.dynamicResolution ? 'Ligada' : 'Desligada'), 'Reduz a resolução quando o FPS cai.')}
        ${this._row('FPS alvo', this._seg('fps', FPS_CHOICES, fpsId), 'Limita os quadros por segundo.')}
        ${this._row('Escala de resolução máx.', this._slider('maxPixelRatio', { min: 0.5, max: 2, step: 0.05, value: dpr, fmt: (v) => `${Number(v).toFixed(2)}×` }), 'Limitada pela densidade de pixels da tela.')}
      </section>
      ${ctx.gameManager ? `<section class="op-group"><h3>Partida atual</h3>
        ${this._row('Iluminação', this._seg('lighting', LIGHTING, lighting))}
      </section>` : ''}`;
  }

  _tab_audio() {
    const s = this.store;
    const fmt = (v) => pct(Number(v));
    return `
      <section class="op-group"><h3>Volume</h3>
        ${this._row('Geral', this._slider('volumeMaster', { min: 0, max: 1, step: 0.05, value: s.get('volumeMaster'), fmt }), 'Multiplica efeitos e música.')}
        ${this._row('Efeitos sonoros', this._slider('volumeSfx', { min: 0, max: 1, step: 0.05, value: s.get('volumeSfx'), fmt }))}
        ${this._row('Música', this._slider('volumeMusic', { min: 0, max: 1, step: 0.05, value: s.get('volumeMusic'), fmt }))}
      </section>`;
  }

  _tab_controls() {
    const s = this.store;
    const b = getBindings();
    const rows = Object.keys(DEFAULT_BINDINGS).map((a) => {
      const waiting = this.rebinding === a;
      const modified = b[a] !== DEFAULT_BINDINGS[a];
      return `<tr>
        <th scope="row">${esc(BINDING_LABELS[a])}</th>
        <td><kbd class="${waiting ? 'is-waiting' : ''}">${waiting ? 'Pressione uma tecla…' : esc(codeLabel(b[a]) || '—')}</kbd></td>
        <td class="op-keys__act">
          <button type="button" class="op-mini" data-rebind="${a}" aria-label="Alterar tecla de ${esc(BINDING_LABELS[a])}">${waiting ? 'Cancelar' : 'Alterar'}</button>
          ${modified ? `<button type="button" class="op-mini" data-unbind="${a}" aria-label="Restaurar tecla de ${esc(BINDING_LABELS[a])}">Padrão</button>` : ''}
        </td></tr>`;
    }).join('');
    return `
      ${this._notice('controls')}
      <section class="op-group"><h3>Câmera</h3>
        ${this._row('Velocidade de rolagem', this._slider('panSpeed', { min: 0.5, max: 2, step: 0.1, value: s.get('panSpeed'), fmt: (v) => `${Number(v).toFixed(1)}×` }))}
        ${this._row('Rolagem pela borda', this._toggle('edgePan', s.get('edgePan'), s.get('edgePan') ? 'Ligada' : 'Desligada'), 'Move a câmera com o mouse na borda da janela.')}
      </section>
      <section class="op-group"><h3>Atalhos remapeáveis</h3>
        <table class="op-keys"><tbody>${rows}</tbody></table>
        <p class="op-hint">Clique em Alterar e pressione a nova tecla. Esc cancela.</p>
      </section>
      <section class="op-group"><h3>Atalhos fixos</h3>
        <table class="op-keys op-keys--fixed"><tbody>${FIXED_KEYS.map(([k, d]) => `<tr><th scope="row"><kbd>${esc(k)}</kbd></th><td colspan="2">${esc(d)}</td></tr>`).join('')}</tbody></table>
      </section>`;
  }

  _tab_interface() {
    const s = this.store;
    return `
      <section class="op-group"><h3>Interface</h3>
        ${this._row('Escala da interface', this._slider('uiScale', { min: 0.75, max: 1.5, step: 0.05, value: s.get('uiScale'), fmt: (v) => pct(Number(v)) }), 'Multiplica o ajuste automático da janela.')}
        ${this._row('Modo daltônico', this._seg('colorblind', COLORBLIND, s.get('colorblind')), 'Cores de time em paletas alternativas (aplicação completa em breve).')}
      </section>`;
  }

  _tab_game() {
    const s = this.store;
    return `
      <section class="op-group"><h3>Partida</h3>
        ${this._row('Velocidade padrão', this._seg('speed', SPEEDS, String(s.get('defaultSpeed'))), 'Vale para novas partidas e já altera a atual.')}
        ${this._row('Textos de dano', this._toggle('floatingText', s.get('floatingText'), s.get('floatingText') ? 'Mostrar' : 'Ocultar'), 'Números flutuantes sobre unidades e construções.')}
      </section>
      ${document.getElementById('help-modal') ? `<section class="op-group"><h3>Ajuda</h3>
        <div><button type="button" class="op-mini" data-op="guide">Abrir o Guia do Jogo</button></div>
      </section>` : ''}`;
  }

  // ------------------------------------------------------------------ eventos
  _notify(text) {
    this.message[this.tab] = text;
    const el = this.root.querySelector('.op-notice');
    if (el) { el.textContent = text || ''; el.hidden = !text; }
  }

  _onClick(e) {
    const t = e.target;
    const tab = t.closest('[data-tab]');
    if (tab) return this._setTab(tab.dataset.tab);
    const op = t.closest('[data-op]');
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
    const rb = t.closest('[data-rebind]');
    if (rb) {
      const a = rb.dataset.rebind;
      this.rebinding = this.rebinding === a ? null : a;
      this.message.controls = '';
      return this._renderBody();
    }
    const ub = t.closest('[data-unbind]');
    if (ub) {
      const a = ub.dataset.unbind;
      this._saveBinding(a, DEFAULT_BINDINGS[a]);
    }
    if (e.target === this.root) this.close();
  }

  _onInput(e) {
    const t = e.target;
    if (e.type === 'input' && t.type !== 'range') return; // interruptores e segmentados: só no `change`
    const ctx = this.getContext() || {};
    if (t.matches('input[type="range"][data-opt]')) {
      const name = t.dataset.opt;
      const v = Number(t.value);
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
    if (t.matches('input[type="checkbox"][data-opt]')) {
      const name = t.dataset.opt;
      if (name === 'shadows' || name === 'dynamicResolution') {
        const { requiresReload } = QualitySettings.setOverride(name, t.checked);
        if (requiresReload) this._notify('Aplica ao recarregar a página.');
        this._renderBody();
      } else {
        this.store.set(name, t.checked);
        this._renderBody();
      }
      return;
    }
    if (t.matches('input[type="radio"]') && t.checked) {
      const seg = t.closest('[data-seg]')?.dataset.seg;
      this._onSeg(seg, t.value, ctx);
    }
  }

  _onSeg(seg, value, ctx) {
    if (seg === 'preset') {
      const { requiresReload } = QualitySettings.set(value);
      this._notify(requiresReload ? 'Aplica ao recarregar a página.' : '');
      this._renderBody();
      this._focusSeg(seg, value);
    } else if (seg === 'texture') {
      const { requiresReload } = QualitySettings.setOverride('textureQuality', value);
      this._notify(requiresReload ? 'Aplica ao recarregar a página.' : '');
      this._renderBody();
      this._focusSeg(seg, value);
    } else if (seg === 'fps') {
      if (value === 'auto') { QualitySettings.setOverride('fpsCap', null); QualitySettings.setOverride('targetFps', null); }
      else if (value === '0') { QualitySettings.setOverride('fpsCap', 0); QualitySettings.setOverride('targetFps', null); }
      else { QualitySettings.setOverride('fpsCap', Number(value)); QualitySettings.setOverride('targetFps', Number(value)); }
    } else if (seg === 'lighting') {
      ctx.sceneManager?.setTimeOfDay?.(value);
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
      this._notify('Gráficos restaurados. Texturas aplicam ao recarregar a página.');
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
      if (isReservedCode(code)) { this._notify(`A tecla ${codeLabel(code)} é reservada e não pode ser usada.`); return this._renderBody(); }
      const clash = findConflict(code, a);
      if (clash) { this._notify(`${codeLabel(code)} já é usada por "${BINDING_LABELS[clash]}". Escolha outra.`); return this._renderBody(); }
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
