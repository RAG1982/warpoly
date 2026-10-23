/**
 * signalUrl.js — MP-02: URL do servidor de sinalização num único lugar.
 *
 * Ordem de precedência (função pura, testada em tests/unit/signalUrl.test.js):
 *   1. `?signal=ws://…` / `wss://…` válido na URL (dev, testes, servidor alternativo);
 *   2. `PRODUCTION_SIGNAL_URL` quando definida (MP-05/MP-06: Worker da Cloudflare);
 *   3. mesmo host da página na porta 8787 (`ws://` ou `wss://` conforme `https:`).
 */

/** Porta padrão do servidor Node local (`npm run signaling`). */
export const DEV_SIGNAL_PORT = 8787;

/** Constante de produção: `null` até o sinalizador hospedado existir (MP-05/MP-06). */
export const PRODUCTION_SIGNAL_URL = null;

/** @returns {boolean} true para URLs `ws:` ou `wss:` bem formadas. */
export function isSignalUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    const u = new URL(value.trim());
    return u.protocol === 'ws:' || u.protocol === 'wss:';
  } catch {
    return false;
  }
}

/**
 * @param {object} o
 * @param {string|null} [o.param]        valor de `?signal=` (ou null)
 * @param {string} [o.protocol]          `location.protocol` (ex.: 'https:')
 * @param {string} [o.hostname]          `location.hostname`
 * @param {string|null} [o.production]   URL de produção (padrão: PRODUCTION_SIGNAL_URL)
 * @returns {string} URL ws:// ou wss:// do sinalizador
 */
export function resolveSignalUrl({
  param = null,
  protocol = 'http:',
  hostname = 'localhost',
  production = PRODUCTION_SIGNAL_URL
} = {}) {
  if (isSignalUrl(param)) return param.trim();
  if (isSignalUrl(production)) return production.trim();
  const scheme = protocol === 'https:' ? 'wss' : 'ws';
  return `${scheme}://${hostname}:${DEV_SIGNAL_PORT}`;
}
