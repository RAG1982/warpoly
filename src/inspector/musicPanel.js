/**
 * musicPanel.js — a TELA do painel "Músicas" do inspetor (DOM fino). A lógica vive em `musicPanelModel.js` (modelo puro,
 * testado), o HTML em `musicPanelView.js` (funções de texto, testadas) e o áudio em `musicPreview.js` (mesmo `AudioEngine`/
 * `MusicPlayer` do jogo). Aqui só se injeta o HTML, se ligam os eventos e se salva a seleção em
 * `localStorage['warpoly.music.selection']` (o jogo a honra na mesma máquina).
 *
 * O AudioContext só nasce dentro de um clique (▶ de uma faixa, Tocar, transição ou lista).
 */
import './musicPanel.css';
import { getTrack, saveSelection, enabledIds } from '../audio/music/catalog.js';
import { MusicPreview } from './musicPreview.js';
import {
  buildMusicModel, describeTrack, initialEnabledSet, setEnabled, playlistFrom, selectionJson, transitionPlan, formatTime, minutesForIntensity
} from './musicPanelModel.js';
import { listHtml, cardHtml, countText } from './musicPanelView.js';

function safeStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * @param {Document} doc
 * @param {{storage?:Storage|null, preview?:MusicPreview}} [opts]
 */
export function initMusicPanel(doc = document, { storage = safeStorage(), preview = new MusicPreview() } = {}) {
  const panel = doc.getElementById('music-panel');
  const openBtn = doc.getElementById('btn-music');
  if (!panel || !openBtn) return null;

  let enabled = initialEnabledSet(storage);
  let selectedId = 'title_0';
  let status = '';
  let timer = null;

  panel.innerHTML = `
    <div class="mp-head">
      <h2>🎵 Músicas</h2>
      <span class="mp-count" id="mp-count"></span>
      <button class="gold-btn secondary" data-act="close" title="Fechar o painel (Esc)">✕ Fechar</button>
    </div>
    <div class="mp-body">
      <div class="mp-list custom-scroll" id="mp-list"></div>
      <div class="mp-card custom-scroll" id="mp-card"></div>
    </div>`;
  const listEl = panel.querySelector('#mp-list');
  const cardEl = panel.querySelector('#mp-card');
  const countEl = panel.querySelector('#mp-count');
  const $ = (sel) => cardEl.querySelector(sel);

  const persist = () => {
    const ok = saveSelection(storage, [...enabled]);
    status = ok ? 'Seleção salva neste navegador (o jogo usa a mesma seleção nesta máquina).' : 'Não foi possível salvar (armazenamento bloqueado); use "Copiar seleção".';
  };
  const audioError = () => `Áudio indisponível: ${preview.error}`;

  function renderList() {
    const model = buildMusicModel(enabled);
    countEl.textContent = countText(model);
    listEl.innerHTML = listHtml(model, selectedId);
  }

  function renderCard() {
    cardEl.innerHTML = cardHtml({
      desc: describeTrack(getTrack(selectedId)), canTransition: !!transitionPlan(selectedId, enabled),
      volume: preview.volume, loop: preview.loop, intensity: preview.intensity
    });
    updateJson();
    updateIntensityLabel();
    updateStatus();
    updateTransport();
  }

  function updateJson() {
    const el = $('#mp-json');
    if (el) el.value = selectionJson(enabled);
  }

  function updateStatus() {
    const el = $('#mp-status');
    if (el) el.textContent = status || (preview.error ? audioError() : 'O áudio só começa depois do seu primeiro clique em ▶.');
  }

  function updateIntensityLabel() {
    const el = $('#mp-intensity-label');
    if (el) el.textContent = preview.intensity <= 0 ? ' início da partida' : ` ≈ ${minutesForIntensity(preview.intensity)} min de partida`;
  }

  function updateTransport() {
    const st = preview.state();
    const prog = $('#mp-progress');
    if (prog) {
      prog.value = st.dur > 0 ? Math.round((st.pos / st.dur) * 1000) : 0;
      $('#mp-time').textContent = formatTime(st.pos);
      $('#mp-dur').textContent = formatTime(st.dur);
      $('#mp-pause').textContent = st.paused ? '▶ Continuar' : '⏸ Pausar';
      const e = st.id ? getTrack(st.id) : null;
      $('#mp-now').textContent = e
        ? `${st.paused ? 'Pausada' : 'Tocando'}: ${e.title}${st.mode === 'playlist' ? ' (lista dos marcados)' : ''}${st.step ? ` — ${st.step.label} (${st.step.index + 1}/${st.step.total}, ${Math.ceil(st.step.remaining)} s)` : ''}${st.loop > 0 && preview.loop && st.mode === 'single' ? ` · volta ${st.loop + 1}` : ''}`
        : '';
    }
    listEl.querySelectorAll('.mp-row').forEach((row) => row.classList.toggle('playing', row.dataset.id === st.id));
  }

  const markSelected = () => listEl.querySelectorAll('.mp-row').forEach((row) => row.classList.toggle('selected', row.dataset.id === selectedId));

  function select(id) {
    selectedId = id;
    markSelected();
    renderCard();
  }

  function play(id) {
    selectedId = id;
    status = preview.play(id) ? '' : (preview.error ? audioError() : 'Faixa não encontrada.');
    markSelected();
    renderCard();
  }

  async function copySelection() {
    try {
      await navigator.clipboard.writeText(selectionJson(enabled));
      status = 'Seleção copiada para a área de transferência.';
    } catch {
      const el = $('#mp-json');
      if (el) { el.focus(); el.select(); }
      status = 'Copie o texto da caixa acima (Ctrl+C).';
    }
    updateStatus();
  }

  panel.addEventListener('click', (ev) => {
    const t = ev.target.closest('[data-act]');
    if (!t || t.dataset.act === 'check') return;
    const id = t.dataset.id;
    switch (t.dataset.act) {
      case 'close': close(); break;
      case 'select': select(id); break;
      case 'play': play(id); break;
      case 'play-sel': play(selectedId); break;
      case 'pause': preview.togglePause(); updateTransport(); break;
      case 'stop': preview.stop(); updateTransport(); break;
      case 'group-on':
      case 'group-off': {
        const g = buildMusicModel(enabled).groups.find((x) => x.id === t.dataset.group);
        const ids = g ? g.sections.flatMap((s) => s.items.map((i) => i.id)) : [];
        enabled = setEnabled(enabled, ids, t.dataset.act === 'group-on');
        persist();
        renderList();
        renderCard();
        break;
      }
      case 'transition': {
        const steps = preview.startTransition(selectedId, enabled);
        status = steps ? `Transição: ${steps.map((s) => `${s.label} ${s.seconds} s`).join(' → ')}.` : (preview.error ? audioError() : 'Esta faixa não tem transição.');
        updateStatus();
        break;
      }
      case 'playlist': {
        const ids = playlistFrom(enabled);
        if (!ids.length) status = 'Nenhuma música marcada "No jogo".';
        else status = preview.startPlaylist(ids) ? `Tocando ${ids.length} faixa(s) marcada(s), uma volta de cada.` : (preview.error ? audioError() : 'Não foi possível tocar a lista.');
        updateStatus();
        break;
      }
      case 'copy': copySelection(); break;
      case 'reset':
        enabled = new Set(enabledIds());
        saveSelection(storage, null);
        status = 'Padrões restaurados (seleção salva apagada).';
        renderList();
        renderCard();
        break;
      default: break;
    }
  });

  panel.addEventListener('change', (ev) => {
    const el = ev.target;
    if (el.dataset && el.dataset.act === 'check') {
      enabled = setEnabled(enabled, [el.dataset.id], el.checked);
      persist();
      // atualiza só os contadores (sem recriar a lista, para não perder o foco)
      const model = buildMusicModel(enabled);
      countEl.textContent = countText(model);
      model.groups.forEach((g) => {
        const small = listEl.querySelector(`[data-group="${g.id}"] .mp-group-head small`);
        if (small) small.textContent = `${g.checked}/${g.total}`;
      });
      updateJson();
      updateStatus();
    } else if (el.id === 'mp-loop') {
      preview.setLoop(el.checked);
    }
  });

  panel.addEventListener('input', (ev) => {
    const el = ev.target;
    if (el.id === 'mp-volume') preview.setVolume(el.value / 100);
    else if (el.id === 'mp-intensity') {
      preview.setIntensity(el.value / 100);
      updateIntensityLabel();
    }
  });

  function open() {
    panel.hidden = false;
    openBtn.classList.add('active');
    if (!timer) timer = setInterval(updateTransport, 200);
    renderList();
    renderCard();
  }

  function close() {
    panel.hidden = true;
    openBtn.classList.remove('active');
    if (timer) { clearInterval(timer); timer = null; }
  }

  openBtn.addEventListener('click', () => (panel.hidden ? open() : close()));
  doc.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && !panel.hidden) close();
  });

  const q = new URLSearchParams(window.location.search);
  if (q.get('panel') === 'music' || window.location.hash === '#musicas') open();

  return { open, close, preview, select, play, get enabled() { return enabled; } };
}
