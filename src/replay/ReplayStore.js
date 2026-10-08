/**
 * ReplayStore.js — F9-05: lista de replays guardados (IndexedDB no navegador, memória nos testes).
 *
 * Banco próprio (`warpoly-replays`) para não mexer na versão do banco de saves. API assíncrona:
 *   store.list() → [{id, name, savedAt, createdAt, summary, bytes}] (mais novos primeiro)
 *   store.get(id) → replay|null     store.put(replay)     store.remove(id)
 * `put` poda os mais antigos acima de `maxKeep` (padrão 30). O registro guarda o replay como texto JSON.
 */
import { parseReplay, serializeReplay } from './Replay.js';

export const MAX_REPLAYS_KEPT = 30;

const DB_NAME = 'warpoly-replays';
const STORE = 'replays';

/** Backend em memória (testes / navegador sem IndexedDB). */
export function createMemoryReplayBackend() {
  const m = new Map();
  return {
    async getAll() { return [...m.values()].map((v) => JSON.parse(v)); },
    async get(id) { return m.has(id) ? JSON.parse(m.get(id)) : null; },
    async put(id, rec) { m.set(id, JSON.stringify(rec)); },
    async remove(id) { m.delete(id); }
  };
}

/** Backend IndexedDB: banco `warpoly-replays`, object store `replays` (keyPath `id`). */
export function createIndexedDbReplayBackend(idb = globalThis.indexedDB) {
  let dbPromise = null;
  const open = () => {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const req = idb.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return dbPromise;
  };
  const tx = async (mode, fn) => {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const req = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(req.result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  };
  return {
    getAll: () => tx('readonly', (s) => s.getAll()),
    get: async (id) => (await tx('readonly', (s) => s.get(id))) || null,
    put: (id, rec) => tx('readwrite', (s) => s.put(rec)),
    remove: (id) => tx('readwrite', (s) => s.delete(id))
  };
}

export class ReplayStore {
  /** @param {object} [backend] padrão: IndexedDB se existir, senão memória */
  constructor(backend = null, { maxKeep = MAX_REPLAYS_KEPT } = {}) {
    this.backend = backend || (typeof indexedDB !== 'undefined' ? createIndexedDbReplayBackend() : createMemoryReplayBackend());
    this.maxKeep = maxKeep;
  }

  /** Grava (ou sobrescreve, mesmo `id`) e poda os mais antigos. */
  async put(replay) {
    const data = serializeReplay(replay);
    await this.backend.put(replay.id, {
      id: replay.id,
      name: replay.name || '',
      createdAt: replay.createdAt,
      savedAt: replay.savedAt || replay.createdAt,
      summary: replay.summary || null,
      bytes: data.length,
      data
    });
    await this._prune();
    return replay.id;
  }

  async get(id) {
    const rec = await this.backend.get(id);
    return rec ? parseReplay(rec.data) : null;
  }

  async remove(id) {
    await this.backend.remove(id);
  }

  async list() {
    const all = await this.backend.getAll();
    return all
      .map((r) => ({ id: r.id, name: r.name, createdAt: r.createdAt, savedAt: r.savedAt, summary: r.summary, bytes: r.bytes }))
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }

  async _prune() {
    if (!(this.maxKeep > 0)) return;
    const metas = await this.list();
    for (const m of metas.slice(this.maxKeep)) await this.backend.remove(m.id);
  }
}
