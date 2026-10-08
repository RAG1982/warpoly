/**
 * OnlineHud.js — F9-03: HUD mínima da partida online: RTT máximo, atraso de input atual,
 * indicador "aguardando jogador X" (após ~400 ms parado) e aviso de desync com botão para baixar o
 * relatório (JSON). F9-04: pausa votada (botão + Sim/Não + contagem da retomada), aviso de queda/IA e de
 * ressincronização. Só apresentação: lê `session.status()`; nunca escreve na sim. Textos em PT-BR.
 */
export class OnlineHud {
  /**
   * @param {import('./LockstepSession.js').LockstepSession} session
   * @param {string[]} names  nome de cada jogador, indexado pelo playerId de jogo
   */
  constructor(session, names) {
    this.session = session;
    this.names = names;
    this._acc = 0;
    this.el = document.createElement('div');
    this.el.id = 'online-hud';
    this.el.style.cssText = 'position:fixed;top:6px;left:50%;transform:translateX(-50%);z-index:9000;padding:3px 10px;border-radius:6px;background:rgba(10,14,28,.75);color:#cbd5e1;font:12px/1.4 system-ui,sans-serif;pointer-events:none;text-align:center';
    this.line = document.createElement('div');
    this.wait = document.createElement('div');
    this.wait.style.cssText = 'color:#fbbf24;font-weight:600';
    this.alert = document.createElement('div');
    this.alert.style.cssText = 'color:#fecaca;background:#7f1d1d;border-radius:4px;padding:4px 8px;margin-top:3px;pointer-events:auto;display:none';
    this.alertText = document.createElement('span');
    this.btn = document.createElement('button');
    this.btn.textContent = 'Baixar relatório';
    this.btn.style.marginLeft = '8px';
    this.btn.onclick = () => this.download();
    this.alert.append(this.alertText, this.btn);
    this.pauseBar = document.createElement('div');
    this.pauseBar.style.cssText = 'margin-top:3px;pointer-events:auto;display:flex;gap:6px;justify-content:center;align-items:center;flex-wrap:wrap';
    this.btnPause = document.createElement('button');
    this.btnPause.id = 'online-pause';
    this.btnPause.onclick = () => this.session.proposePause();
    this.voteText = document.createElement('span');
    this.voteText.style.color = '#fde68a';
    this.btnYes = document.createElement('button');
    this.btnYes.textContent = 'Sim';
    this.btnYes.onclick = () => this._vote(true);
    this.btnNo = document.createElement('button');
    this.btnNo.textContent = 'Não';
    this.btnNo.onclick = () => this._vote(false);
    this.pauseBar.append(this.btnPause, this.voteText, this.btnYes, this.btnNo);
    this.notice = document.createElement('div');
    this.notice.style.cssText = 'color:#bae6fd;font-weight:600';
    this.banner = document.createElement('div');
    this.banner.style.cssText = 'color:#fff;background:#92400e;border-radius:4px;padding:4px 8px;margin-top:3px;display:none;font-weight:600';
    this.el.append(this.line, this.wait, this.pauseBar, this.notice, this.banner, this.alert);
    this._voted = null;
    document.body.append(this.el);
    this._reported = false;
  }

  _vote(yes) {
    this._voted = this.session.room.vote ? this.session.room.vote.at : true;
    this.session.vote(yes);
    this.btnYes.style.display = this.btnNo.style.display = 'none';
  }

  nameOf(pid) {
    return this.names[pid] || `Jogador ${pid + 1}`;
  }

  /** Chamar a cada quadro com o `delta` em segundos; atualiza o DOM a cada ~250 ms. */
  update(delta) {
    this._acc += delta;
    if (this._acc < 0.25) return;
    this._acc = 0;
    const s = this.session.status();
    this.line.textContent = `Online · RTT ${s.maxRtt || '—'} ms · atraso ${s.delay} turnos (${s.delay * this.session.turnMs} ms) · turno ${s.turn}`;
    this.wait.textContent = s.waiting.length > 0 && s.stalledMs > 400
      ? `Aguardando ${s.waiting.map((p) => this.nameOf(p)).join(', ')}… (${(s.stalledMs / 1000).toFixed(1)} s)`
      : '';
    this._updatePause(s);
    const d = s.desync;
    if (d) {
      this.alert.style.display = '';
      const who = d.divergent.length > 0 ? d.divergent.map((p) => this.nameOf(p)).join(', ') : 'indeterminado';
      this.alertText.textContent = `DESSINCRONIA no turno ${d.turn} (divergente: ${who}). A partida foi congelada.`;
      if (!this._reported) {
        this._reported = true;
        console.error('[WarPoly online] DESYNC', this.session.desyncDump());
      }
    }
  }

  _updatePause(s) {
    const p = s.pause;
    const me = this.session.localId;
    const out = !s.active.includes(me);
    this.btnPause.textContent = p.paused ? 'Propor retomar' : 'Propor pausa';
    this.btnPause.style.display = out || p.vote || (p.paused && p.resumeIn !== null) ? 'none' : '';
    if (p.vote && !out) {
      const who = this.nameOf(p.vote.proposer);
      const hasVoted = p.vote.yes.includes(me) || p.vote.no.includes(me);
      this.voteText.textContent = `${who} propõe ${p.vote.kind === 'pause' ? 'pausar' : 'retomar'} (${p.vote.yes.length} sim / ${p.vote.no.length} não, ${Math.ceil((p.vote.turnsLeft * this.session.turnMs) / 1000)} s)`;
      this.btnYes.style.display = this.btnNo.style.display = hasVoted ? 'none' : '';
    } else {
      this.voteText.textContent = '';
      this.btnYes.style.display = this.btnNo.style.display = 'none';
    }
    this.notice.textContent = p.paused
      ? (p.resumeIn !== null ? `Retomando em ${Math.ceil((p.resumeIn * this.session.turnMs) / 1000)}…` : 'Partida pausada (votação)')
      : '';
    const lines = [];
    if (s.removed || s.resyncing) lines.push('Conexão perdida: a IA assumiu o seu lugar. Ressincronizando com a partida…');
    else if (out) lines.push('Você saiu da partida (a IA joga por você).');
    if (s.catchingUp && !s.removed) lines.push('Alcançando a partida…');
    const gone = s.dropped.filter((q) => q !== me);
    if (gone.length > 0) lines.push(`${gone.map((q) => this.nameOf(q)).join(', ')}: desconectado — a IA assumiu.`);
    if (s.dropping.length > 0) lines.push(`Sem resposta de ${s.dropping.map((q) => this.nameOf(q)).join(', ')} — passando para a IA…`);
    this.banner.textContent = lines.join(' ');
    this.banner.style.display = lines.length > 0 ? '' : 'none';
  }

  /** Baixa o relatório (relatório de desync + log de comandos recentes) como JSON. */
  download() {
    const blob = new Blob([JSON.stringify(this.session.desyncDump(), null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `warpoly-desync-turno${this.session.desync ? this.session.desync.turn : 0}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  dispose() {
    this.el.remove();
  }
}
