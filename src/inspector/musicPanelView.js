/**
 * musicPanelView.js — HTML do painel "Músicas" como FUNÇÕES PURAS de texto (sem DOM): a lista agrupada e o cartão do player.
 * `musicPanel.js` só injeta o resultado e liga os eventos. Todo texto vindo do catálogo passa por `esc` (sem HTML injetado).
 */

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** "7 de 41 faixas marcadas "No jogo"". */
export const countText = (model) => `${model.totals.enabled} de ${model.totals.total} faixas marcadas "No jogo"`;

/** Lista agrupada (saída de `buildMusicModel`); `selectedId` destaca a faixa do cartão. */
export function listHtml(model, selectedId) {
  return model.groups.map((g) => `
      <section class="mp-group" data-group="${g.id}">
        <header class="mp-group-head">
          <h3>${esc(g.label)} <small>${g.checked}/${g.total}</small></h3>
          <span class="mp-group-actions">
            <button class="mp-mini" data-act="group-on" data-group="${g.id}" title="Marcar todas deste grupo">marcar</button>
            <button class="mp-mini" data-act="group-off" data-group="${g.id}" title="Desmarcar todas deste grupo">limpar</button>
          </span>
        </header>
        ${g.sections.map((s) => `
          ${s.label ? `<div class="mp-section">${esc(s.label)}</div>` : ''}
          ${s.items.map((it) => `
            <div class="mp-row${it.id === selectedId ? ' selected' : ''}" data-id="${esc(it.id)}">
              <label class="mp-check" title="Entra no sorteio de músicas do jogo">
                <input type="checkbox" data-act="check" data-id="${esc(it.id)}"${it.checked ? ' checked' : ''}><span>No jogo</span>
              </label>
              <div class="mp-main" data-act="select" data-id="${esc(it.id)}">
                <div class="mp-title">${esc(it.title)}${it.candidate ? ' <em class="mp-badge">nova</em>' : ''}</div>
                <div class="mp-meta">${esc(it.meta)}</div>
              </div>
              <button class="mp-play" data-act="play" data-id="${esc(it.id)}" title="Ouvir esta faixa">▶</button>
            </div>`).join('')}
        `).join('')}
      </section>`).join('');
}

/** Cartão do player: descrição da faixa, transporte, progresso, volume/laço/evolução e ações. */
export function cardHtml({ desc, canTransition, volume, loop, intensity }) {
  if (!desc) return '<p class="mp-desc">Selecione uma faixa na lista.</p>';
  return `
      <h3 class="mp-card-title">${esc(desc.title)}</h3>
      <div class="mp-card-sub">${esc(desc.subtitle)}</div>
      <div class="mp-card-meta">${esc(desc.meta)}</div>
      <p class="mp-desc">${esc(desc.description)}</p>
      <ul class="mp-details">${desc.details.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
      <div class="mp-transport">
        <button class="gold-btn" data-act="play-sel" title="Tocar a faixa selecionada">▶ Tocar</button>
        <button class="gold-btn secondary" data-act="pause" id="mp-pause" title="Pausar / continuar">⏸ Pausar</button>
        <button class="gold-btn secondary" data-act="stop" title="Parar">⏹ Parar</button>
      </div>
      <div class="mp-progress-row">
        <span id="mp-time">0:00</span>
        <input type="range" id="mp-progress" min="0" max="1000" value="0" disabled aria-label="Progresso da faixa">
        <span id="mp-dur">0:00</span>
      </div>
      <div class="mp-now" id="mp-now"></div>
      <div class="mp-controls">
        <label>Volume <input type="range" id="mp-volume" min="0" max="100" value="${Math.round(volume * 100)}"></label>
        <label class="mp-loop"><input type="checkbox" id="mp-loop"${loop ? ' checked' : ''}> Repetir (laço)</label>
        <label title="Faixas de paz ganham camadas, registro mais alto e andamento maior com os minutos de partida">Evolução no tempo
          <input type="range" id="mp-intensity" min="0" max="100" value="${Math.round(intensity * 100)}"><small id="mp-intensity-label"></small></label>
      </div>
      <div class="mp-actions">
        <button class="gold-btn secondary" data-act="transition"${canTransition ? '' : ' disabled'} title="${canTransition ? 'Toca a paz, faz o crossfade para o combate da facção e volta à paz' : 'Só vale para faixas de paz/combate de uma facção'}">⚔️ Ouvir transição paz → combate</button>
        <button class="gold-btn secondary" data-act="playlist" title="Toca em sequência só as faixas marcadas &quot;No jogo&quot; (uma volta de cada)">🔁 Só ouvir os marcados</button>
        <button class="gold-btn secondary" data-act="copy" title="Copia a seleção em JSON para colar no chat">📋 Copiar seleção (JSON)</button>
        <button class="gold-btn secondary" data-act="reset" title="Volta aos padrões do repositório (apaga a seleção salva)">↩ Restaurar padrões</button>
      </div>
      <textarea class="mp-json" id="mp-json" readonly rows="3" aria-label="Seleção atual em JSON"></textarea>
      <div class="mp-status" id="mp-status"></div>`;
}
