// src/ui/multiplayerModel.js (MP-02) — modelo puro da tela Multiplayer (sem DOM).
// Nome do jogador (lembrado em localStorage), código de sala, lista de salas públicas e a "entrada"
// que a tela entrega ao OnlineLobby (criar ou entrar). Nada aqui toca rede nem DOM.

export const PLAYER_NAME_KEY = 'warpoly.online.name';
export const MAX_NAME_LENGTH = 24;
export const MAX_CODE_LENGTH = 8;
const MAX_ROOMS_SHOWN = 50;

/** Nome limpo: sem controles, espaços aparados, ≤ 24 caracteres; vazio vira `fallback` (texto i18n de quem chama). */
export function sanitizePlayerName(raw, fallback = '') {
  const s = String(raw ?? '')
    .replace(/[\p{Cc}]/gu, '') // controles (inclui \u0000-\u001f e \u007f)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NAME_LENGTH);
  return s || fallback;
}

/** Código de sala digitado: maiúsculas, só letras e números, ≤ 8. */
export function normalizeRoomCode(raw) {
  return String(raw ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, MAX_CODE_LENGTH);
}

/** Código válido para entrar: 4 a 8 alfanuméricos (separadores como espaço ou hífen são ignorados; o servidor gera 5). */
export function isRoomCodeValid(code) {
  const clean = String(code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return clean.length >= 4 && clean.length <= 8;
}

/**
 * Lê o nome lembrado. `storage` é um objeto tipo localStorage (ou null); qualquer falha (sem storage,
 * modo privado, acesso bloqueado) devolve o padrão — nunca lança.
 */
export function loadPlayerName(storage) {
  try {
    const v = storage?.getItem(PLAYER_NAME_KEY);
    return v ? sanitizePlayerName(v, '') : '';
  } catch {
    return '';
  }
}

/** Grava o nome lembrado. @returns {boolean} false se o storage recusou. */
export function savePlayerName(storage, name) {
  try {
    storage?.setItem(PLAYER_NAME_KEY, sanitizePlayerName(name));
    return true;
  } catch {
    return false;
  }
}

/**
 * Converte a mensagem `rooms` do servidor em linhas exibíveis. Ignora entradas malformadas e limita
 * a quantidade. Mantém a ordem do servidor (mais recentes primeiro quando ele ordena assim).
 * @returns {{code:string, host:string, players:number, maxPlayers:number, mapId:string|null}[]}
 */
export function roomListItems(rooms) {
  if (!Array.isArray(rooms)) return [];
  const out = [];
  for (const r of rooms) {
    if (!r || typeof r.code !== 'string' || !isRoomCodeValid(r.code)) continue;
    const players = Number.isInteger(r.players) ? r.players : 0;
    const maxPlayers = Number.isInteger(r.maxPlayers) && r.maxPlayers > 0 ? r.maxPlayers : 8;
    out.push({
      code: normalizeRoomCode(r.code),
      host: sanitizePlayerName(r.host, '?'),
      players: Math.max(0, Math.min(players, maxPlayers)),
      maxPlayers,
      mapId: typeof r.config?.map === 'string' ? r.config.map : null
    });
    if (out.length >= MAX_ROOMS_SHOWN) break;
  }
  return out;
}

/**
 * Monta a entrada entregue ao OnlineLobby, ou `null` se o pedido for inválido (entrar com código ruim).
 * @param {{mode: 'create'|'join', name?: string, code?: string, isPublic?: boolean, signal: string, fallbackName?: string}} o
 */
export function buildLobbyEntry({ mode, name, code = '', isPublic = false, signal, fallbackName = '' }) {
  const base = { name: sanitizePlayerName(name, fallbackName), signal };
  if (mode === 'create') return { ...base, mode: 'create', public: !!isPublic };
  if (mode === 'join') {
    if (!isRoomCodeValid(code)) return null;
    return { ...base, mode: 'join', code: normalizeRoomCode(code) };
  }
  return null;
}
