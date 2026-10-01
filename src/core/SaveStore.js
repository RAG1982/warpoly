/**
 * SaveStore.js — F2-06: slots de save (IndexedDB no navegador, memória nos testes).
 *
 * Um save é o objeto de `captureSave` (JSON puro). A API é assíncrona e independente do backend:
 *   store.list() → [{slot, name, savedAt, summary}]   store.get(slot) → save|null
 *   store.put(slot, save)                              store.remove(slot)
 * Slots usados pela UI: `slot1..slot3` (manuais) e `autosave`.
 */
import { parseSave } from '../sim/SaveGame.js';

export const SAVE_SLOTS = Object.freeze(['slot1', 'slot2', 'slot3']);
export const AUTOSAVE_SLOT = 'autosave';

const DB_NAME = 'warpoly';
const STORE = 'saves';

/** Backend em memória (testes / navegador sem IndexedDB). */
export function createMemoryBackend() {
  const m = new Map();
  return {
    async getAll() { return [...m.values()].map(v => JSON.parse(v)); },
    async get(slot) { return m.has(slot) ? JSON.parse(m.get(slot)) : null; },
    async put(slot, rec) { m.set(slot, JSON.stringify(rec)); },
    async remove(slot) { m.delete(slot); }
  };
}

/** Backend IndexedDB: banco `warpoly`, object store `saves` (keyPath `slot`). */
export function createIndexedDbBackend(idb = globalThis.indexedDB) {
  let dbPromise = null;
  const open = () => {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const req = idb.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'slot' });
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
    getAll: () => tx('readonly', s => s.getAll()),
    get: async (slot) => (await tx('readonly', s => s.get(slot))) || null,
    put: (slot, rec) => tx('readwrite', s => s.put(rec)),
    remove: (slot) => tx('readwrite', s => s.delete(slot))
  };
}

export class SaveStore {
  /** @param {object} [backend]  padrão: IndexedDB se existir, senão memória */
  constructor(backend = null) {
    this.backend = backend || (typeof indexedDB !== 'undefined' ? createIndexedDbBackend() : createMemoryBackend());
  }

  async put(slot, save) {
    // O registro guarda o save inteiro em `data` (JSON) + metadados para listar sem parsear tudo.
    await this.backend.put(slot, {
      slot,
      name: save.name || slot,
      savedAt: save.savedAt,
      summary: save.summary || null,
      data: JSON.stringify(save)
    });
  }

  async get(slot) {
    const rec = await this.backend.get(slot);
    return rec ? parseSave(rec.data) : null;
  }

  async remove(slot) {
    await this.backend.remove(slot);
  }

  async list() {
    const all = await this.backend.getAll();
    return all
      .map(r => ({ slot: r.slot, name: r.name, savedAt: r.savedAt, summary: r.summary }))
      .sort((a, b) => b.savedAt - a.savedAt);
  }
}
