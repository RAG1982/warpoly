// MP-02: modelo puro da tela Multiplayer (nome, código, lista de salas, entrada para o lobby) e as chaves i18n.
import { describe, it, expect } from 'vitest';
import {
  PLAYER_NAME_KEY, MAX_NAME_LENGTH,
  sanitizePlayerName, normalizeRoomCode, isRoomCodeValid, loadPlayerName, savePlayerName,
  roomListItems, buildLobbyEntry
} from '../../src/ui/multiplayerModel.js';
import { nextFocusIndex } from '../../src/ui/campaignSelectModel.js';
import pt from '../../src/i18n/pt-BR.json';
import en from '../../src/i18n/en.json';

const memory = (init = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), _m: m };
};
const throwing = () => ({
  getItem() { throw new Error('SecurityError'); },
  setItem() { throw new Error('QuotaExceededError'); }
});

describe('nome do jogador (MP-02)', () => {
  it('sanitiza: apara espaços, colapsa, remove controles, limita a 24 e usa o fallback se vazio', () => {
    expect(sanitizePlayerName('  Rafael   Grande  ')).toBe('Rafael Grande');
    expect(sanitizePlayerName('a\u0000b\u007fc')).toBe('abc');
    expect(sanitizePlayerName('x'.repeat(60))).toHaveLength(MAX_NAME_LENGTH);
    expect(sanitizePlayerName('   ')).toBe('');
    expect(sanitizePlayerName(undefined)).toBe('');
    expect(sanitizePlayerName('', 'fallback')).toBe('fallback');
  });

  it('lembra o nome em localStorage (chave própria) e lê de volta', () => {
    const s = memory();
    expect(loadPlayerName(s)).toBe('');
    expect(savePlayerName(s, '  Thrall  ')).toBe(true);
    expect(s._m.get(PLAYER_NAME_KEY)).toBe('Thrall');
    expect(loadPlayerName(s)).toBe('Thrall');
  });

  it('storage ausente ou que lança (modo privado, bloqueado) nunca quebra', () => {
    expect(loadPlayerName(null)).toBe('');
    expect(savePlayerName(null, 'x')).toBe(true); // sem storage: nada a gravar, sem erro
    expect(loadPlayerName(throwing())).toBe('');
    expect(savePlayerName(throwing(), 'x')).toBe(false);
  });
});

describe('código de sala (MP-02)', () => {
  it('normaliza para maiúsculas, só alfanuméricos, até 8', () => {
    expect(normalizeRoomCode(' ab-cd 12 ')).toBe('ABCD12');
    expect(normalizeRoomCode('abcdefghijk')).toBe('ABCDEFGH');
    expect(normalizeRoomCode(null)).toBe('');
  });

  it('válido = 4 a 8 alfanuméricos; espaços e hífens são ignorados', () => {
    expect(isRoomCodeValid('k7px2')).toBe(true);
    expect(isRoomCodeValid('  ABCD  ')).toBe(true);
    expect(isRoomCodeValid('ABC DEF')).toBe(true);
    expect(isRoomCodeValid('AB-CD')).toBe(true);
    expect(isRoomCodeValid('abc')).toBe(false);
    expect(isRoomCodeValid('ABCDEFGHI')).toBe(false);
    expect(isRoomCodeValid('AB-C')).toBe(false);
    expect(isRoomCodeValid('')).toBe(false);
  });
});

describe('lista de salas públicas (MP-02)', () => {
  it('converte a mensagem `rooms` do servidor em linhas e descarta lixo', () => {
    const rows = roomListItems([
      { code: 'k7px2', host: 'Ana', players: 2, maxPlayers: 8, config: { map: 'vale-do-rio' } },
      { code: '?!', host: 'x', players: 1, maxPlayers: 8 },
      null,
      'texto',
      { code: 'zz99', host: 'Bia', players: 1 }
    ]);
    expect(rows).toEqual([
      { code: 'K7PX2', host: 'Ana', players: 2, maxPlayers: 8, mapId: 'vale-do-rio' },
      { code: 'ZZ99', host: 'Bia', players: 1, maxPlayers: 8, mapId: null }
    ]);
  });

  it('nunca mostra mais jogadores que o máximo, nem números inválidos', () => {
    const [r] = roomListItems([{ code: 'ABCDE', host: 'h', players: 99, maxPlayers: 4 }]);
    expect([r.players, r.maxPlayers]).toEqual([4, 4]);
    const [q] = roomListItems([{ code: 'ABCDE', host: 'h', players: 'x', maxPlayers: -1 }]);
    expect([q.players, q.maxPlayers]).toEqual([0, 8]);
  });

  it('entradas que não são lista viram lista vazia; limite de 50 linhas', () => {
    expect(roomListItems(undefined)).toEqual([]);
    expect(roomListItems({ rooms: [] })).toEqual([]);
    const many = Array.from({ length: 80 }, (_, i) => ({ code: `AB${String(i).padStart(4, '0')}`, host: 'h', players: 1, maxPlayers: 8 }));
    expect(roomListItems(many)).toHaveLength(50);
  });

  it('navegação por setas na lista usa o mesmo modelo de foco da escolha de campanha', () => {
    expect(nextFocusIndex(0, 'ArrowDown', 3)).toBe(1);
    expect(nextFocusIndex(0, 'ArrowUp', 3)).toBe(2);
    expect(nextFocusIndex(2, 'End', 3)).toBe(2);
    expect(nextFocusIndex(1, 'Home', 3)).toBe(0);
  });
});

describe('entrada entregue ao OnlineLobby (MP-02)', () => {
  const signal = 'ws://127.0.0.1:8787';

  it('criar: modo create, nome limpo, pública opcional (padrão privada)', () => {
    expect(buildLobbyEntry({ mode: 'create', name: ' Ana ', signal })).toEqual({ mode: 'create', name: 'Ana', public: false, signal });
    expect(buildLobbyEntry({ mode: 'create', name: '', isPublic: true, signal, fallbackName: 'Player' })).toEqual({ mode: 'create', name: 'Player', public: true, signal });
  });

  it('entrar: código normalizado; código inválido não gera entrada', () => {
    expect(buildLobbyEntry({ mode: 'join', name: 'Bia', code: ' k7-px2 ', signal })).toEqual({ mode: 'join', name: 'Bia', code: 'K7PX2', signal });
    expect(buildLobbyEntry({ mode: 'join', name: 'Bia', code: 'ab', signal })).toBeNull();
    expect(buildLobbyEntry({ mode: 'outro', name: 'Bia', signal })).toBeNull();
  });
});

describe('chaves i18n da tela Multiplayer (MP-02)', () => {
  it('todas as chaves mp.* e menu.multiplayer* existem em pt-BR e en, sem texto vazio', () => {
    const keys = Object.keys(pt).filter((k) => k.startsWith('mp.') || k.startsWith('menu.multiplayer'));
    expect(keys.length).toBeGreaterThan(20);
    for (const k of keys) {
      expect(en[k], `en ${k}`).toBeTruthy();
      expect(pt[k].trim(), `pt-BR ${k}`).not.toBe('');
    }
  });

  it('a mensagem de servidor indisponível é a pedida, em PT-BR', () => {
    expect(pt['mp.unavailable']).toBe('Servidor de partidas indisponível. Tente novamente.');
    expect(pt['mp.retry']).toBe('Tentar de novo');
  });
});
