// src/ui/screens/MainMenu.js
// F6-01 · Menu principal + sub-painel "Escaramuça" (maquete da Onda 1).
//
// Fluxo (F2-04):
//   - O menu aparece quando a URL NÃO tem ?play, ?skipMenu, ?bench nem ?skipPreload.
//   - "Iniciar" chama `onStart({ faction, difficulty })`: a máquina de estados (main.js)
//     monta a MatchConfig e inicia a partida sem recarregar a página. Sem `onStart`
//     (uso isolado do menu), cai no fluxo antigo: navega para /?play&faction=<human|orc>.
//   - Abrir/fechar o painel "Escaramuça" avisa `onSetupChange(true|false)` (estado MatchSetup).
//
// Fundo: cena em CSS/SVG + partículas em canvas 2D (sem three.js). As construções
// 3D atuais geram texturas procedurais 2048² na criação, o que atrasaria o menu em
// vários segundos; o fundo 3D animado fica para quando houver assets leves (F7/F1).
import './mainMenu.css';

const BYPASS_PARAMS = ['play', 'skipMenu', 'bench', 'skipPreload'];
const STORAGE_DIFFICULTY = 'warpoly.difficulty';
const STORAGE_FACTION = 'warpoly.faction';

const FACTIONS = [
  {
    id: 'human',
    name: 'Reino Humano',
    icon: '/icoEscudo.svg',
    motto: 'Pedra, aço e disciplina',
    desc: 'Muralhas firmes, cavaleiros pesados e arqueiros treinados. Economia estável e defesa difícil de romper.',
    tags: ['Defensivo', 'Arqueiros', 'Fortificações'],
  },
  {
    id: 'orc',
    name: 'Clãs Orcs',
    icon: '/icoQuartelOrc.svg',
    motto: 'Fúria, tambores e ferro bruto',
    desc: 'Guerreiros robustos e ataques em massa. Pressão constante desde os primeiros minutos da partida.',
    tags: ['Agressivo', 'Tropas robustas', 'Investidas'],
  },
];

const DIFFICULTIES = [
  { id: 'easy', label: 'Fácil' },
  { id: 'normal', label: 'Normal' },
  { id: 'hard', label: 'Difícil' },
  { id: 'brutal', label: 'Brutal' },
];

function safeGet(key) {
  try { return window.localStorage.getItem(key); } catch { return null; }
}
function safeSet(key, value) {
  try { window.localStorage.setItem(key, value); } catch { /* armazenamento indisponível */ }
}

/** true quando a URL atual deve abrir o menu em vez de iniciar o jogo direto. */
export function shouldShowMainMenu(search = window.location.search) {
  const params = new URLSearchParams(search);
  return !BYPASS_PARAMS.some((p) => params.has(p));
}

/** URL que inicia a partida com a facção escolhida (fluxo atual via reload). */
export function buildPlayUrl(faction, search = window.location.search) {
  const f = faction === 'orc' ? 'orc' : 'human';
  // Repassa a qualidade de textura (F1-01) se veio na URL do menu.
  const texq = new URLSearchParams(search).get('texq');
  return `/?play&faction=${f}` + (texq ? `&texq=${encodeURIComponent(texq)}` : '');
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export class MainMenu {
  /**
   * @param {HTMLElement} [parent]
   * @param {object} [opts]
   * @param {(choice: {faction: string, difficulty: string}) => void} [opts.onStart]
   * @param {(open: boolean) => void} [opts.onSetupChange]
   */
  constructor(parent = document.body, { onStart = null, onSetupChange = null } = {}) {
    this.parent = parent;
    this.onStart = onStart;
    this.onSetupChange = onSetupChange;
    this.root = null;
    this.activePanel = null; // 'skirmish' | 'options' | null
    this.lastOpener = null;
    this.particles = null;

    const urlFaction = new URLSearchParams(window.location.search).get('faction');
    const stored = safeGet(STORAGE_FACTION);
    this.faction = urlFaction === 'orc' || urlFaction === 'human'
      ? urlFaction
      : (stored === 'orc' ? 'orc' : 'human');
    const storedDiff = safeGet(STORAGE_DIFFICULTY);
    this.difficulty = DIFFICULTIES.some((d) => d.id === storedDiff) ? storedDiff : 'normal';

    this._onKeyDown = this._onKeyDown.bind(this);
  }

  mount() {
    const root = document.createElement('div');
    root.id = 'main-menu';
    root.className = 'mm-root';
    root.innerHTML = this._template();
    this.parent.appendChild(root);
    this.root = root;
    document.documentElement.classList.add('wp-menu');

    this._bind();
    this._startParticles();
    document.addEventListener('keydown', this._onKeyDown);

    requestAnimationFrame(() => {
      root.classList.add('mm-ready');
      const first = root.querySelector('.mm-nav .mm-btn:not([disabled])');
      first?.focus({ preventScroll: true });
    });
    return this;
  }

  destroy() {
    clearTimeout(this._startTimer);
    this._startTimer = null;
    document.removeEventListener('keydown', this._onKeyDown);
    this._stopParticles();
    this.root?.remove();
    this.root = null;
    document.documentElement.classList.remove('wp-menu');
  }

  // ---------------------------------------------------------------- template
  _template() {
    const factionCards = FACTIONS.map((f) => `
      <label class="mm-faction mm-faction--${f.id}">
        <input type="radio" name="mm-faction" value="${f.id}" ${this.faction === f.id ? 'checked' : ''} />
        <span class="mm-faction__card">
          <span class="mm-faction__emblem"><img src="${f.icon}" alt="" width="64" height="64" /></span>
          <span class="mm-faction__body">
            <span class="mm-faction__name">${esc(f.name)}</span>
            <span class="mm-faction__motto">${esc(f.motto)}</span>
            <span class="mm-faction__desc">${esc(f.desc)}</span>
            <span class="mm-faction__tags">${f.tags.map((t) => `<span>${esc(t)}</span>`).join('')}</span>
          </span>
          <span class="mm-faction__check" aria-hidden="true"></span>
        </span>
      </label>`).join('');

    const diffs = DIFFICULTIES.map((d) => `
      <label class="mm-seg mm-seg--${d.id}">
        <input type="radio" name="mm-difficulty" value="${d.id}" ${this.difficulty === d.id ? 'checked' : ''} />
        <span>${esc(d.label)}</span>
      </label>`).join('');

    return `
      <div class="mm-bg" aria-hidden="true">
        <div class="mm-sky"></div>
        <div class="mm-glow"></div>
        ${BACKDROP_SVG}
        <canvas class="mm-particles"></canvas>
        <div class="mm-vignette"></div>
      </div>

      <div class="mm-layout">
        <section class="mm-home" aria-labelledby="mm-title">
          <header class="mm-brand">
            <span class="mm-brand__ornament" aria-hidden="true"></span>
            <h1 id="mm-title" class="mm-brand__title">WarPoly</h1>
            <p class="mm-brand__tag">Estratégia em tempo real</p>
          </header>

          <nav class="mm-nav" aria-label="Menu principal">
            <button type="button" class="mm-btn mm-btn--primary" data-action="new-game" aria-haspopup="dialog" aria-controls="mm-skirmish">
              <span class="mm-btn__label">Novo Jogo</span><span class="mm-btn__hint">Escaramuça</span>
            </button>
            <button type="button" class="mm-btn" disabled aria-describedby="mm-soon-note">
              <span class="mm-btn__label">Campanha</span><span class="mm-badge">Em breve</span>
            </button>
            <button type="button" class="mm-btn" disabled aria-describedby="mm-soon-note">
              <span class="mm-btn__label">Multiplayer</span><span class="mm-badge">Em breve</span>
            </button>
            <button type="button" class="mm-btn" data-action="options" aria-haspopup="dialog" aria-controls="mm-options">
              <span class="mm-btn__label">Opções</span>
            </button>
            <a class="mm-btn" href="/inspector.html">
              <span class="mm-btn__label">Inspetor 3D</span><span class="mm-btn__hint">Ferramenta</span>
            </a>
            <button type="button" class="mm-btn" data-action="credits" aria-haspopup="dialog" aria-controls="mm-credits">
              <span class="mm-btn__label">Créditos</span>
            </button>
          </nav>
          <p id="mm-soon-note" class="mm-sr">Disponível em uma atualização futura.</p>
        </section>

        <!-- Sub-painel: Escaramuça -->
        <section id="mm-skirmish" class="mm-panel mm-panel--skirmish" role="dialog" aria-modal="false" aria-labelledby="mm-sk-title" hidden>
          <header class="mm-panel__head">
            <div>
              <p class="mm-panel__kicker">Novo Jogo</p>
              <h2 id="mm-sk-title" class="mm-panel__title">Escaramuça</h2>
            </div>
            <button type="button" class="mm-close" data-action="close" aria-label="Voltar ao menu">✕</button>
          </header>

          <div class="mm-panel__scroll">
            <fieldset class="mm-field">
              <legend class="mm-field__label">Facção</legend>
              <div class="mm-factions">${factionCards}</div>
            </fieldset>

            <div class="mm-row">
              <fieldset class="mm-field mm-field--grow">
                <legend class="mm-field__label">Dificuldade da IA</legend>
                <div class="mm-segmented">${diffs}</div>
              </fieldset>

              <div class="mm-field mm-field--grow">
                <span class="mm-field__label" id="mm-map-label">Mapa</span>
                <div class="mm-map" role="group" aria-labelledby="mm-map-label">
                  <span class="mm-map__thumb" aria-hidden="true">${MAP_THUMB_SVG}</span>
                  <span class="mm-map__info">
                    <span class="mm-map__name">Vale do Rio</span>
                    <span class="mm-map__meta">1×1 · 2 jogadores · Médio</span>
                  </span>
                  <span class="mm-map__only">Único</span>
                </div>
              </div>
            </div>
          </div>

          <footer class="mm-panel__foot">
            <button type="button" class="mm-btn mm-btn--ghost" data-action="close">Voltar</button>
            <button type="button" class="mm-btn mm-btn--primary mm-btn--start" data-action="start">
              <span class="mm-btn__label">Iniciar</span>
            </button>
          </footer>
        </section>

        <!-- Painel placeholder: Opções (F6-08) -->
        <section id="mm-options" class="mm-panel mm-panel--options" role="dialog" aria-modal="false" aria-labelledby="mm-op-title" hidden>
          <header class="mm-panel__head">
            <div>
              <p class="mm-panel__kicker">Configurações</p>
              <h2 id="mm-op-title" class="mm-panel__title">Opções</h2>
            </div>
            <button type="button" class="mm-close" data-action="close" aria-label="Voltar ao menu">✕</button>
          </header>
          <div class="mm-panel__scroll">
            <p class="mm-placeholder">Em construção. Esta tela vai reunir as opções completas do jogo:</p>
            <ul class="mm-options-list">
              <li><span>Gráficos</span><em>Predefinições, sombras, texturas, resolução</em></li>
              <li><span>Áudio</span><em>Volume por canal</em></li>
              <li><span>Controles</span><em>Atalhos e velocidade de rolagem</em></li>
              <li><span>Interface</span><em>Escala da HUD e modo daltônico</em></li>
            </ul>
            <p class="mm-placeholder mm-placeholder--small">Durante a partida, velocidade, pausa e volume continuam na engrenagem da HUD.</p>
          </div>
          <footer class="mm-panel__foot">
            <button type="button" class="mm-btn mm-btn--ghost" data-action="close">Voltar</button>
          </footer>
        </section>
      </div>

      <footer class="mm-footer">
        <span>Versão de desenvolvimento · maquete</span>
        <span class="mm-footer__keys"><kbd>Tab</kbd> navegar <kbd>Enter</kbd> confirmar <kbd>Esc</kbd> voltar</span>
      </footer>

      <!-- Modal: Créditos -->
      <div class="mm-modal" id="mm-credits" role="dialog" aria-modal="true" aria-labelledby="mm-cr-title" hidden>
        <div class="mm-modal__card">
          <h2 id="mm-cr-title" class="mm-panel__title">Créditos</h2>
          <div class="mm-credits">
            <p><span>Direção e design</span>Rafael</p>
            <p><span>Programação e arte procedural</span>Equipe WarPoly</p>
            <p><span>Motor 3D</span>three.js</p>
            <p><span>Ferramentas</span>Vite · Blender</p>
            <p class="mm-credits__note">Inspirado nos clássicos de estratégia em tempo real dos anos 90. Todos os nomes, facções e personagens são originais.</p>
          </div>
          <button type="button" class="mm-btn mm-btn--primary mm-modal__ok" data-action="close-modal">Fechar</button>
        </div>
      </div>
    `;
  }

  // ------------------------------------------------------------------ events
  _bind() {
    const root = this.root;
    root.addEventListener('click', (e) => {
      const el = e.target.closest('[data-action]');
      if (!el || !root.contains(el)) return;
      const action = el.dataset.action;
      if (action === 'new-game') this.openPanel('skirmish', el);
      else if (action === 'options') this.openPanel('options', el);
      else if (action === 'credits') this.openCredits(el);
      else if (action === 'close') this.closePanel();
      else if (action === 'close-modal') this.closeCredits();
      else if (action === 'start') this.start();
    });

    root.querySelectorAll('input[name="mm-faction"]').forEach((input) => {
      input.addEventListener('change', () => {
        if (!input.checked) return;
        this.faction = input.value;
        safeSet(STORAGE_FACTION, this.faction);
        root.dataset.faction = this.faction;
      });
    });
    root.dataset.faction = this.faction;

    root.querySelectorAll('input[name="mm-difficulty"]').forEach((input) => {
      input.addEventListener('change', () => {
        if (!input.checked) return;
        this.difficulty = input.value;
        safeSet(STORAGE_DIFFICULTY, this.difficulty);
      });
    });

    // Setas ↑/↓ percorrem os botões do menu principal.
    const nav = root.querySelector('.mm-nav');
    nav.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const items = [...nav.querySelectorAll('.mm-btn:not([disabled])')];
      const i = items.indexOf(document.activeElement);
      if (i < 0) return;
      e.preventDefault();
      const next = items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length];
      next.focus();
    });

    const modal = root.querySelector('#mm-credits');
    modal.addEventListener('click', (e) => { if (e.target === modal) this.closeCredits(); });
  }

  _onKeyDown(e) {
    if (!this.root) return;
    const modal = this.root.querySelector('#mm-credits');
    if (!modal.hidden) {
      if (e.key === 'Escape') { e.preventDefault(); this.closeCredits(); }
      else if (e.key === 'Tab') { e.preventDefault(); modal.querySelector('.mm-modal__ok').focus(); }
      return;
    }
    if (e.key === 'Escape' && this.activePanel) {
      e.preventDefault();
      this.closePanel();
    }
  }

  // ------------------------------------------------------------------ panels
  openPanel(name, opener) {
    const panel = this.root.querySelector(`#mm-${name}`);
    if (!panel) return;
    if (this.activePanel && this.activePanel !== name) {
      this.root.querySelector(`#mm-${this.activePanel}`).hidden = true;
    }
    this.lastOpener = opener || null;
    const wasSetup = this.activePanel === 'skirmish';
    this.activePanel = name;
    if (name === 'skirmish' && !wasSetup) this.onSetupChange?.(true);
    else if (name !== 'skirmish' && wasSetup) this.onSetupChange?.(false);
    panel.hidden = false;
    this.root.classList.add('mm-has-panel');
    this.root.dataset.panel = name;
    this.root.querySelectorAll('[aria-controls]').forEach((b) => b.classList.toggle('is-active', b.getAttribute('aria-controls') === `mm-${name}`));
    requestAnimationFrame(() => {
      const target = name === 'skirmish'
        ? panel.querySelector('input[name="mm-faction"]:checked')
        : panel.querySelector('.mm-close');
      target?.focus({ preventScroll: true });
    });
  }

  closePanel() {
    if (!this.activePanel) return;
    this.root.querySelector(`#mm-${this.activePanel}`).hidden = true;
    const wasSetup = this.activePanel === 'skirmish';
    this.activePanel = null;
    if (wasSetup) this.onSetupChange?.(false);
    this.root.classList.remove('mm-has-panel');
    delete this.root.dataset.panel;
    this.root.querySelectorAll('[aria-controls].is-active').forEach((b) => b.classList.remove('is-active'));
    this.lastOpener?.focus({ preventScroll: true });
  }

  openCredits(opener) {
    this.creditsOpener = opener;
    const modal = this.root.querySelector('#mm-credits');
    modal.hidden = false;
    requestAnimationFrame(() => modal.querySelector('.mm-modal__ok').focus());
  }

  closeCredits() {
    this.root.querySelector('#mm-credits').hidden = true;
    this.creditsOpener?.focus();
  }

  start() {
    safeSet(STORAGE_FACTION, this.faction);
    safeSet(STORAGE_DIFFICULTY, this.difficulty);
    this.root.classList.add('mm-leaving');
    const btn = this.root.querySelector('.mm-btn--start');
    if (btn) { btn.disabled = true; btn.querySelector('.mm-btn__label').textContent = 'Preparando…'; }
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const choice = { faction: this.faction, difficulty: this.difficulty };
    if (this.onStart) {
      this._startTimer = setTimeout(() => {
        this._startTimer = null;
        this.onStart(choice);
      }, reduce ? 0 : 380);
      return;
    }
    const url = buildPlayUrl(this.faction);
    setTimeout(() => window.location.assign(url), reduce ? 0 : 380);
  }

  // --------------------------------------------------------------- particles
  _startParticles() {
    const canvas = this.root.querySelector('.mm-particles');
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    let w = 0, h = 0, dpr = 1;
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const count = Math.round(Math.min(70, Math.max(28, (w * h) / 26000)));
    const spawn = (initial) => ({
      x: Math.random() * w,
      y: initial ? Math.random() * h : h + 10,
      r: 0.6 + Math.random() * 1.9,
      vy: 8 + Math.random() * 22,
      sway: 6 + Math.random() * 18,
      phase: Math.random() * Math.PI * 2,
      life: 0.35 + Math.random() * 0.65,
      hue: Math.random() < 0.8 ? 38 + Math.random() * 12 : 18 + Math.random() * 10,
    });
    const ps = Array.from({ length: count }, () => spawn(true));

    let last = performance.now();
    let raf = 0;
    const draw = (now) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';
      for (const p of ps) {
        p.y -= p.vy * dt;
        p.phase += dt * 0.8;
        const x = p.x + Math.sin(p.phase) * p.sway;
        const fade = Math.min(1, p.y / (h * 0.35)) * p.life * (0.65 + 0.35 * Math.sin(p.phase * 3.1));
        if (p.y < -10) Object.assign(p, spawn(false));
        const g = ctx.createRadialGradient(x, p.y, 0, x, p.y, p.r * 4);
        g.addColorStop(0, `hsla(${p.hue}, 100%, 72%, ${fade})`);
        g.addColorStop(1, `hsla(${p.hue}, 100%, 50%, 0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, p.y, p.r * 4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
      if (!reduce) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    const onVis = () => {
      if (document.hidden) { cancelAnimationFrame(raf); }
      else if (!reduce) { last = performance.now(); raf = requestAnimationFrame(draw); }
    };
    document.addEventListener('visibilitychange', onVis);

    this.particles = () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVis);
    };
  }

  _stopParticles() {
    this.particles?.();
    this.particles = null;
  }
}

/** Monta o menu e esconde a tela de loading/HUD. Retorna a instância. */
export function showMainMenu(parent = document.body, opts = {}) {
  const loading = document.getElementById('loading-screen');
  if (loading) loading.style.display = 'none';
  return new MainMenu(parent, opts).mount();
}

// ------------------------------------------------------------------ artwork
// Paisagem do "Vale do Rio" ao entardecer: castelo humano à esquerda, fortaleza
// orc à direita, rio dourado ao centro. Tudo vetorial (poucos KB, zero rede).
const BACKDROP_SVG = `
<svg class="mm-scene" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMax slice" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="mmRiver" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffd98a" stop-opacity="0.95"/>
      <stop offset="0.45" stop-color="#e9a947" stop-opacity="0.7"/>
      <stop offset="1" stop-color="#6b4a1e" stop-opacity="0.35"/>
    </linearGradient>
    <linearGradient id="mmFar" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#3a3550"/><stop offset="1" stop-color="#2a2a3d"/>
    </linearGradient>
    <linearGradient id="mmMid" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#1f2536"/><stop offset="1" stop-color="#151a27"/>
    </linearGradient>
    <linearGradient id="mmNear" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#10141e"/><stop offset="1" stop-color="#07090e"/>
    </linearGradient>
    <radialGradient id="mmFire" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#ffb347" stop-opacity="0.9"/>
      <stop offset="0.4" stop-color="#ff6a1f" stop-opacity="0.35"/>
      <stop offset="1" stop-color="#ff4500" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="mmWarm" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#ffd27a" stop-opacity="0.55"/>
      <stop offset="1" stop-color="#ffd27a" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <!-- Cordilheira distante -->
  <g class="mm-layer mm-layer--far">
    <path fill="url(#mmFar)" d="M0 560 L90 500 L170 530 L260 450 L340 505 L430 440 L520 500 L600 470 L690 520 L760 500 L840 525 L930 470 L1010 505 L1100 430 L1190 490 L1270 455 L1360 510 L1450 460 L1530 500 L1600 470 L1600 900 L0 900 Z"/>
    <path fill="#4a4460" opacity="0.5" d="M260 450 L285 470 L270 468 L300 490 L262 478 L240 470 Z M1100 430 L1128 455 L1110 452 L1140 478 L1098 462 L1080 452 Z M430 440 L452 460 L438 458 L462 478 L428 466 L410 458 Z"/>
  </g>

  <!-- Colinas médias + rio -->
  <g class="mm-layer mm-layer--mid">
    <path fill="url(#mmMid)" d="M0 610 C120 580 220 560 330 575 C430 588 520 600 640 606 C700 609 760 612 800 612 C850 612 900 606 960 600 C1080 588 1180 565 1300 572 C1420 580 1520 600 1600 590 L1600 900 L0 900 Z"/>
    <path fill="url(#mmRiver)" d="M784 612 C790 612 812 612 818 612 C830 660 860 700 900 745 C950 800 1010 850 1060 900 L880 900 C850 850 812 800 790 745 C770 700 772 655 784 612 Z"/>
    <path fill="none" stroke="#fff3c4" stroke-opacity="0.45" stroke-width="2" d="M800 630 C806 670 830 710 862 750 M820 700 C840 740 870 780 905 820"/>
  </g>

  <!-- Castelo do Reino Humano (esquerda) -->
  <g class="mm-layer mm-layer--near-l">
    <circle cx="570" cy="520" r="210" fill="url(#mmWarm)"/>
    <path fill="url(#mmNear)" d="M0 690 C140 650 300 622 440 614 C580 606 660 626 710 668 C738 694 748 760 752 900 L0 900 Z"/>
    <g transform="translate(250 6)">
    <g fill="#0b0f17">
      <rect x="200" y="470" width="220" height="140"/>
      <path d="M200 470 h22 v-14 h16 v14 h22 v-14 h16 v14 h22 v-14 h16 v14 h22 v-14 h16 v14 h22 v-14 h16 v14 h20 v-14 h14 v14 z"/>
      <rect x="170" y="420" width="50" height="190"/>
      <path d="M160 422 L195 350 L230 422 Z"/>
      <rect x="400" y="430" width="50" height="180"/>
      <path d="M390 432 L425 362 L460 432 Z"/>
      <rect x="275" y="380" width="70" height="230"/>
      <path d="M262 382 L310 280 L358 382 Z"/>
      <rect x="308" y="250" width="3" height="34"/>
      <rect x="236" y="440" width="36" height="170"/>
      <path d="M228 442 L254 392 L280 442 Z"/>
      <rect x="350" y="445" width="34" height="165"/>
      <path d="M342 447 L367 400 L392 447 Z"/>
    </g>
    <path class="mm-banner" fill="#2f5fb3" d="M311 252 L345 260 L338 268 L345 276 L311 272 Z"/>
    <path class="mm-banner" fill="#2f5fb3" d="M196 352 L220 358 L214 364 L220 370 L196 368 Z" transform="translate(-1 -2)"/>
    <path class="mm-banner" fill="#2f5fb3" d="M426 364 L450 370 L444 376 L450 382 L426 380 Z"/>
    <g class="mm-windows" fill="#ffcf6b">
      <rect x="302" y="410" width="8" height="14" rx="4"/><rect x="302" y="450" width="8" height="14" rx="4"/>
      <rect x="190" y="460" width="7" height="12" rx="3.5"/><rect x="420" y="470" width="7" height="12" rx="3.5"/>
      <rect x="250" y="480" width="6" height="11" rx="3"/><rect x="364" y="488" width="6" height="11" rx="3"/>
      <path d="M296 610 v-36 a14 14 0 0 1 28 0 v36 z" fill="#ffb54a" opacity="0.85"/>
    </g>
    </g>
    <g fill="#070a10">
      <path d="M40 720 L62 640 L84 720 Z M70 730 L96 630 L122 730 Z M520 700 L540 632 L560 700 Z M552 716 L576 640 L600 716 Z"/>
    </g>
  </g>

  <!-- Fortaleza dos Clãs Orcs (direita) -->
  <g class="mm-layer mm-layer--near-r">
    <circle cx="1270" cy="560" r="200" fill="url(#mmFire)" class="mm-firelight"/>
    <path fill="url(#mmNear)" d="M1600 690 C1520 640 1420 612 1300 610 C1180 608 1080 640 1010 700 C975 730 955 770 950 900 L1600 900 Z"/>
    <g fill="#0b0f17">
      <path d="M1130 612 L1130 560 L1140 540 L1150 560 L1160 536 L1170 560 L1180 540 L1190 560 L1200 532 L1210 560 L1220 544 L1230 560 L1240 536 L1250 560 L1260 546 L1270 560 L1280 532 L1290 560 L1300 540 L1310 560 L1320 536 L1330 560 L1340 546 L1350 560 L1360 534 L1370 560 L1380 544 L1390 560 L1400 540 L1410 560 L1410 612 Z"/>
      <path d="M1210 560 L1230 450 L1250 440 L1290 440 L1310 450 L1330 560 Z"/>
      <path d="M1222 450 C1200 420 1196 392 1206 366 C1214 396 1228 420 1250 440 Z"/>
      <path d="M1318 450 C1340 420 1344 392 1334 366 C1326 396 1312 420 1290 440 Z"/>
      <path d="M1268 440 L1270 380 L1272 440 Z"/>
      <rect x="1269" y="360" width="3" height="80"/>
      <path d="M1440 612 L1450 500 L1470 488 L1490 500 L1500 612 Z"/>
      <path d="M1444 502 L1470 450 L1496 502 Z"/>
      <path d="M1090 612 L1098 520 L1116 512 L1134 520 L1142 612 Z"/>
    </g>
    <path class="mm-banner mm-banner--orc" fill="#a3281c" d="M1272 362 L1302 368 L1296 380 L1302 392 L1272 388 Z"/>
    <path fill="#e8dcc0" opacity="0.8" d="M1250 470 C1244 490 1250 505 1262 510 C1254 498 1254 486 1258 472 Z M1290 470 C1296 490 1290 505 1278 510 C1286 498 1286 486 1282 472 Z"/>
    <g class="mm-windows mm-windows--orc" fill="#ff7a2e">
      <path d="M1256 560 v-30 a14 14 0 0 1 28 0 v30 z" opacity="0.9"/>
      <rect x="1464" y="520" width="8" height="12" rx="2"/>
      <rect x="1110" y="540" width="7" height="11" rx="2"/>
    </g>
    <g fill="#070a10">
      <path d="M1520 730 L1544 650 L1568 730 Z M1480 740 L1502 670 L1524 740 Z M1010 720 L1030 660 L1050 720 Z"/>
    </g>
  </g>
</svg>`;

const MAP_THUMB_SVG = `
<svg viewBox="0 0 96 64" xmlns="http://www.w3.org/2000/svg">
  <rect width="96" height="64" rx="6" fill="#3f6b3a"/>
  <path d="M0 0 H96 V64 H0 Z" fill="none"/>
  <path d="M40 0 C44 14 36 24 46 34 C56 44 50 54 56 64 H66 C60 52 66 42 56 32 C48 24 54 12 50 0 Z" fill="#3b86b5"/>
  <circle cx="18" cy="16" r="9" fill="#2f5a30"/><circle cx="80" cy="50" r="9" fill="#2f5a30"/>
  <circle cx="72" cy="12" r="5" fill="#2f5a30"/><circle cx="24" cy="50" r="5" fill="#2f5a30"/>
  <rect x="12" y="40" width="10" height="10" rx="2" fill="#2f5fb3" stroke="#ffe7a3" stroke-width="1.2"/>
  <rect x="74" y="12" width="10" height="10" rx="2" fill="#a3281c" stroke="#ffe7a3" stroke-width="1.2"/>
  <circle cx="30" cy="28" r="3" fill="#f5c542"/><circle cx="68" cy="36" r="3" fill="#f5c542"/>
</svg>`;
