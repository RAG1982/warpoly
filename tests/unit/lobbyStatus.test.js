import { describe, it, expect } from 'vitest';
import { bindStatus, ERR } from '../../src/net/lobbyStatus.js';

function fake() {
  const h = {};
  return { on: (e, f) => ((h[e] ||= []).push(f)), emit: (e, m) => (h[e] || []).forEach((f) => f(m)) };
}

describe('lobby status (NEW-50)', () => {
  it('mostra o erro e limpa ao receber room ou start', () => {
    for (const ev of ['room', 'start']) {
      const sig = fake();
      let s = '';
      bindStatus(sig, (t) => (s = t));
      sig.emit('error', { code: 'not-all-ready' });
      expect(s).toBe(ERR['not-all-ready']);
      sig.emit(ev, {});
      expect(s).toBe('');
    }
  });
  it('código desconhecido gera mensagem genérica', () => {
    const sig = fake();
    let s = '';
    bindStatus(sig, (t) => (s = t));
    sig.emit('error', { code: 'xyz' });
    expect(s).toBe('Erro: xyz');
  });
});
