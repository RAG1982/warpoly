/**
 * src/editor/storage.js (F8-03) — mapas salvos do editor no `localStorage` (injetável: testável com um armazenamento falso).
 * Chave `warpoly.editor.maps.v1` = `{ [id]: { savedAt, map } }`; `warpoly.editor.draft.v1` = rascunho automático (mapa JSON).
 */
export const MAPS_KEY = 'warpoly.editor.maps.v1';
export const DRAFT_KEY = 'warpoly.editor.draft.v1';

function readJson(storage, key, fallback) {
  try {
    const raw = storage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

/** @returns {{id:string,name:string,savedAt:number}[]} mapas salvos, mais recentes primeiro */
export function listSaved(storage) {
  const all = readJson(storage, MAPS_KEY, {});
  return Object.entries(all)
    .map(([id, v]) => ({ id, name: v.map?.name ?? id, savedAt: v.savedAt ?? 0 }))
    .sort((a, b) => b.savedAt - a.savedAt);
}

export function saveMap(storage, mapJson, now = Date.now()) {
  const all = readJson(storage, MAPS_KEY, {});
  all[mapJson.id] = { savedAt: now, map: mapJson };
  storage.setItem(MAPS_KEY, JSON.stringify(all));
}

export function loadSaved(storage, id) {
  return readJson(storage, MAPS_KEY, {})[id]?.map ?? null;
}

export function deleteSaved(storage, id) {
  const all = readJson(storage, MAPS_KEY, {});
  delete all[id];
  storage.setItem(MAPS_KEY, JSON.stringify(all));
}

export function saveDraft(storage, mapJson) {
  try {
    storage.setItem(DRAFT_KEY, JSON.stringify(mapJson));
    return true;
  } catch {
    return false; // cota cheia / modo privado
  }
}

export function loadDraft(storage) {
  return readJson(storage, DRAFT_KEY, null);
}
