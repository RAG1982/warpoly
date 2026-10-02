/**
 * optionsStore.js (F6-08) — camada pura de persistência das opções do jogo.
 *
 * Sem DOM/three.js: recebe um `storage` com a API do localStorage (getItem/setItem/removeItem) e
 * é testável em Node. Valores ausentes/inválidos no storage viram o padrão. As chaves reaproveitam
 * as já existentes (`warpoly.uiScale`, `warpoly.edgePan`, `warpoly.colorblind`…).
 *
 * As opções de gráficos (preset, sombras, texturas, DPR, FPS) vivem em `QualitySettings`
 * (`warpoly.quality`, `warpoly.qualityOverrides`); aqui ficam as demais.
 *
 * `runtime` é um espelho em memória lido por código de jogo sem tocar no storage a cada quadro
 * (ex.: `InputManager` lê `runtime.panSpeed`, `ParticleSystem` lê `runtime.floatingText`).
 */

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const num = (raw) => (raw === null || raw === undefined || raw === '' ? NaN : Number(raw));

/** Cada opção: chave de storage, padrão, `parse(raw)` → valor válido ou `undefined`, `format(v)`. */
export const OPTION_DEFS = Object.freeze({
  volumeMaster: { key: 'warpoly.volMaster', def: 1, parse: (r) => { const n = num(r); return Number.isFinite(n) ? clamp(n, 0, 1) : undefined; } },
  volumeSfx: { key: 'warpoly.volSfx', def: 0.5, parse: (r) => { const n = num(r); return Number.isFinite(n) ? clamp(n, 0, 1) : undefined; } },
  volumeMusic: { key: 'warpoly.volMusic', def: 0.25, parse: (r) => { const n = num(r); return Number.isFinite(n) ? clamp(n, 0, 1) : undefined; } },
  panSpeed: { key: 'warpoly.panSpeed', def: 1, parse: (r) => { const n = num(r); return Number.isFinite(n) ? clamp(n, 0.5, 2) : undefined; } },
  edgePan: { key: 'warpoly.edgePan', def: true, parse: (r) => (r === '0' ? false : r === '1' ? true : undefined), format: (v) => (v ? '1' : '0') },
  uiScale: { key: 'warpoly.uiScale', def: 1, parse: (r) => { const n = num(r); return Number.isFinite(n) ? clamp(n, 0.75, 1.5) : undefined; } },
  colorblind: { key: 'warpoly.colorblind', def: 'off', parse: (r) => (['off', 'protan', 'deutan', 'tritan'].includes(r) ? r : undefined) },
  defaultSpeed: { key: 'warpoly.defaultSpeed', def: 1, parse: (r) => { const n = num(r); return [1, 2, 3].includes(n) ? n : undefined; } },
  floatingText: { key: 'warpoly.floatingText', def: true, parse: (r) => (r === '0' ? false : r === '1' ? true : undefined), format: (v) => (v ? '1' : '0') },
  /** Remapeamento: `{ ação: KeyboardEvent.code }` (só o que difere do padrão). JSON. */
  keybinds: {
    key: 'warpoly.keybinds',
    def: {},
    parse: (r) => {
      try {
        const o = JSON.parse(r);
        if (!o || typeof o !== 'object' || Array.isArray(o)) return undefined;
        const out = {};
        for (const [k, v] of Object.entries(o)) if (typeof v === 'string' && /^[A-Za-z0-9]+$/.test(v)) out[k] = v;
        return out;
      } catch { return undefined; }
    },
    format: (v) => JSON.stringify(v)
  }
});

/** Opções por aba (usado por "Restaurar padrão" de cada aba). */
export const TAB_OPTIONS = Object.freeze({
  audio: ['volumeMaster', 'volumeSfx', 'volumeMusic'],
  controls: ['panSpeed', 'edgePan', 'keybinds'],
  interface: ['uiScale', 'colorblind'],
  game: ['defaultSpeed', 'floatingText']
});

/** Espelho em memória (padrões até `createOptionsStore().loadRuntime()` rodar). */
export const runtime = {
  panSpeed: OPTION_DEFS.panSpeed.def,
  edgePan: OPTION_DEFS.edgePan.def,
  floatingText: OPTION_DEFS.floatingText.def
};

function safeStorage() {
  try { return typeof window !== 'undefined' ? window.localStorage : null; } catch { return null; }
}

/**
 * @param {{getItem(k:string):string|null, setItem(k:string,v:string):void, removeItem(k:string):void}|null} [storage]
 */
export function createOptionsStore(storage = safeStorage()) {
  const read = (k) => { try { return storage ? storage.getItem(k) : null; } catch { return null; } };
  const write = (k, v) => { try { storage?.setItem(k, v); } catch { /* storage bloqueado */ } };
  const remove = (k) => { try { storage?.removeItem(k); } catch { /* storage bloqueado */ } };
  const defOf = (name) => {
    const d = OPTION_DEFS[name];
    if (!d) throw new Error(`Opção desconhecida: ${name}`);
    return d;
  };
  const cloneDef = (d) => (typeof d.def === 'object' ? { ...d.def } : d.def);

  const store = {
    /** Valor salvo (ou padrão se ausente/inválido). */
    get(name) {
      const d = defOf(name);
      const raw = read(d.key);
      if (raw === null) return cloneDef(d);
      const v = d.parse(raw);
      return v === undefined ? cloneDef(d) : v;
    },
    /** Grava (normalizando; valor inválido grava o padrão). Devolve o valor efetivo. */
    set(name, value) {
      const d = defOf(name);
      const raw = d.format ? d.format(value) : String(value);
      const parsed = d.parse(raw);
      const eff = parsed === undefined ? cloneDef(d) : parsed;
      write(d.key, d.format ? d.format(eff) : String(eff));
      store._sync(name, eff);
      return eff;
    },
    /** Restaura o padrão de uma opção (remove a chave). */
    reset(name) {
      const d = defOf(name);
      remove(d.key);
      store._sync(name, cloneDef(d));
      return cloneDef(d);
    },
    /** Restaura todas as opções de uma aba (`audio|controls|interface|game`). */
    resetTab(tab) {
      for (const n of TAB_OPTIONS[tab] || []) store.reset(n);
    },
    getAll() {
      const out = {};
      for (const n of Object.keys(OPTION_DEFS)) out[n] = store.get(n);
      return out;
    },
    /** Preenche `runtime` com os valores salvos. */
    loadRuntime() {
      for (const n of Object.keys(runtime)) runtime[n] = store.get(n);
      return runtime;
    },
    _sync(name, value) {
      if (name in runtime) runtime[name] = value;
    }
  };
  return store;
}

/** Instância padrão (localStorage do navegador). */
export const options = createOptionsStore();
