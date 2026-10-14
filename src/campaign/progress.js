/**
 * progress.js (F8-05) — progresso de campanha persistido em localStorage, POR TENTATIVA.
 *
 * Formato (chave `warpoly.campaign.v1`):
 *   { version:1, campaigns:{ [campaignId]:{ current:N, attempts:{ N:{ startedAt, completed:{ [missionId]:{ seconds, resources, at } } } } } } }
 * "Nova tentativa" abre a tentativa N+1 vazia (as anteriores ficam gravadas). Só UI/persistência: nada disto entra na sim.
 * O armazenamento é injetável (testes usam um objeto em memória); falhas de localStorage nunca lançam.
 */
import { missionStatus, nextMission, isCampaignComplete, startingResourcesFor, entryOf } from './campaign.js';

export const PROGRESS_KEY = 'warpoly.campaign.v1';
const VERSION = 1;

export function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); } };
}

function defaultStorage() {
  try { return globalThis.localStorage || null; } catch { return null; }
}

export class CampaignProgress {
  /** @param {{getItem:Function,setItem:Function}|null} [storage]  padrão: localStorage (ou memória se indisponível) */
  constructor(storage = defaultStorage(), { now = () => Date.now() } = {}) {
    this.storage = storage || memoryStorage();
    this.now = now;
    this.data = this._load();
  }

  _load() {
    try {
      const raw = this.storage.getItem(PROGRESS_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (d && d.version === VERSION && d.campaigns && typeof d.campaigns === 'object') return d;
      }
    } catch { /* dados corrompidos: recomeça */ }
    return { version: VERSION, campaigns: {} };
  }

  _save() {
    try { this.storage.setItem(PROGRESS_KEY, JSON.stringify(this.data)); } catch { /* cota cheia / modo privado */ }
  }

  _camp(cid) {
    let c = this.data.campaigns[cid];
    if (!c) {
      c = { current: 1, attempts: { 1: { startedAt: this.now(), completed: {} } } };
      this.data.campaigns[cid] = c;
    }
    return c;
  }

  /** Número da tentativa atual (≥ 1). */
  attemptNumber(cid) { return this._camp(cid).current; }

  attemptCount(cid) { return Object.keys(this._camp(cid).attempts).length; }

  /** Missões concluídas na tentativa atual: `{ [missionId]: { seconds, resources, at } }`. */
  completed(cid) { return this._camp(cid).attempts[this._camp(cid).current].completed; }

  /** Abre uma tentativa nova (vazia) e a torna a atual. */
  newAttempt(cid) {
    const c = this._camp(cid);
    const n = Math.max(...Object.keys(c.attempts).map(Number)) + 1;
    c.attempts[n] = { startedAt: this.now(), completed: {} };
    c.current = n;
    this._save();
    return n;
  }

  /** Volta para uma tentativa anterior (continuar o progresso dela). */
  selectAttempt(cid, n) {
    const c = this._camp(cid);
    if (!c.attempts[n]) return false;
    c.current = n;
    this._save();
    return true;
  }

  /** Registra a vitória (mantém o melhor tempo se já havia). `resources` = saldo final do jogador (carry-over). */
  recordVictory(cid, missionId, { seconds = 0, resources = null } = {}) {
    const done = this.completed(cid);
    const prev = done[missionId];
    const keepBest = prev && prev.seconds > 0 && prev.seconds <= seconds;
    done[missionId] = {
      seconds: keepBest ? prev.seconds : seconds,
      resources: resources ? { gold: resources.gold | 0, wood: resources.wood | 0, stone: resources.stone | 0 } : (prev && prev.resources) || null,
      at: this.now()
    };
    this._save();
    return done[missionId];
  }

  status(def, missionId, opts) { return missionStatus(def, missionId, this.completed(def.id), opts); }

  next(def, opts) { return nextMission(def, this.completed(def.id), opts); }

  isComplete(def) { return isCampaignComplete(def, this.completed(def.id)); }

  /** Recursos iniciais (com carry-over) da missão, dado o progresso da tentativa atual. */
  startingResources(def, missionDef) {
    return startingResourcesFor(missionDef, entryOf(def, missionDef.id), this.completed(def.id));
  }

  /** Verifica se a história de abertura foi vista na tentativa atual da campanha. */
  isStorySeen(cid) {
    const att = this._camp(cid).attempts[this._camp(cid).current];
    return !!att.storySeen;
  }

  /** Marca a história de abertura como vista na tentativa atual da campanha. */
  markStorySeen(cid) {
    const att = this._camp(cid).attempts[this._camp(cid).current];
    att.storySeen = true;
    this._save();
  }

  /** Apaga todo o progresso (depuração/testes). */
  reset() {
    this.data = { version: VERSION, campaigns: {} };
    this._save();
  }
}
