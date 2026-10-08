/**
 * ReplayService.js — F9-05: gravação automática de replays e importação/exportação de arquivos.
 *
 * Vive na aplicação (main.js). Durante a partida só chama `poll()` por quadro (lê `gm.checksums`; custo
 * desprezível) e grava no armazenamento a cada `PERSIST_EVERY` ticks (3 min de jogo), ao fim da partida e ao sair.
 * Nunca escreve na simulação.
 */
import { ReplayRecorder, parseReplay, serializeReplay, replayFileName, MIN_RECORD_TICKS, REPLAY_EXT } from '../replay/Replay.js';
import { ReplayStore } from '../replay/ReplayStore.js';

/** Regrava o replay em andamento a cada 3 min de jogo (3600 ticks), para sobreviver a fechar a aba. */
const PERSIST_EVERY = 3600;

export class ReplayService {
  constructor({ store = null } = {}) {
    this.store = store || new ReplayStore();
    this.recorder = null;
    this._lastPutTick = -1;
    this._nextPersist = Infinity;
  }

  /** Começa a gravar a partida `gm` (single ou online). Ignora tutorial (não é reproduzível fora do contexto). */
  begin(gm, { online = false } = {}) {
    this.recorder = null;
    if (!gm || gm.matchConfig?.tutorial) return;
    this.recorder = new ReplayRecorder(gm, { online });
    this._lastPutTick = -1;
    this._nextPersist = gm.currentTick + PERSIST_EVERY;
  }

  /** Por quadro: coleta checksums e, de tempos em tempos, persiste. */
  poll() {
    const rec = this.recorder;
    if (!rec) return;
    rec.poll();
    if (rec.ticks >= this._nextPersist) {
      this._nextPersist = rec.ticks + PERSIST_EVERY;
      this.save().catch((err) => console.warn('[WarPoly] replay: falha ao gravar:', err));
    }
  }

  /** Grava o replay atual (se a partida passou do mínimo). @returns {Promise<string|null>} id gravado */
  async save() {
    const rec = this.recorder;
    if (!rec || rec.ticks < MIN_RECORD_TICKS || rec.ticks === this._lastPutTick) return null;
    this._lastPutTick = rec.ticks;
    const replay = rec.snapshot();
    await this.store.put(replay);
    return replay.id;
  }

  /** Fim da partida / saída: grava e para de gravar. */
  async finish() {
    const rec = this.recorder;
    if (!rec) return null;
    const p = this.save();
    this.recorder = null;
    return p;
  }

  // ---------------------------------------------------------------- arquivos
  /** Baixa o replay como `.warpolyreplay`. */
  exportFile(replay) {
    const blob = new Blob([serializeReplay(replay)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = replayFileName(replay);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  /** Lê um `File` `.warpolyreplay`, valida (lança Error com `code`) e o guarda na lista. @returns {Promise<object>} o replay */
  async importFile(file) {
    if (!file) throw Object.assign(new Error('Nenhum arquivo.'), { code: 'format' });
    const text = await file.text();
    const replay = parseReplay(text);
    await this.store.put({ ...replay, savedAt: Date.now() });
    return replay;
  }
}

export { REPLAY_EXT };
