// MP-02: URL do sinalizador (função pura, um único módulo).
import { describe, it, expect } from 'vitest';
import { resolveSignalUrl, isSignalUrl, DEV_SIGNAL_PORT, PRODUCTION_SIGNAL_URL } from '../../src/net/signalUrl.js';

describe('signalUrl (MP-02)', () => {
  it('padrão: mesmo host na porta 8787, ws:// em http e wss:// em https', () => {
    expect(DEV_SIGNAL_PORT).toBe(8787);
    expect(resolveSignalUrl({ protocol: 'http:', hostname: 'localhost' })).toBe('ws://localhost:8787');
    expect(resolveSignalUrl({ protocol: 'https:', hostname: 'jogo.exemplo.org' })).toBe('wss://jogo.exemplo.org:8787');
    expect(resolveSignalUrl({ protocol: 'http:', hostname: '[::1]' })).toBe('ws://[::1]:8787');
  });

  it('?signal= válido (ws ou wss) tem precedência e é aparado', () => {
    expect(resolveSignalUrl({ param: 'ws://192.168.0.5:9000', protocol: 'https:', hostname: 'x' })).toBe('ws://192.168.0.5:9000');
    expect(resolveSignalUrl({ param: '  wss://sinal.exemplo.net  ', protocol: 'http:', hostname: 'x' })).toBe('wss://sinal.exemplo.net');
  });

  it('?signal= inválido (esquema http, lixo, vazio) cai no padrão', () => {
    for (const bad of ['http://h:8787', 'javascript:alert(1)', 'nao é url', '', '   ', null, undefined, 42]) {
      expect(resolveSignalUrl({ param: bad, protocol: 'http:', hostname: 'localhost' }), String(bad)).toBe('ws://localhost:8787');
    }
  });

  it('a constante de produção vale quando definida e perde para ?signal=', () => {
    expect(PRODUCTION_SIGNAL_URL).toBeNull(); // até MP-05/MP-06
    const prod = 'wss://warpoly-sinal.exemplo.workers.dev';
    expect(resolveSignalUrl({ protocol: 'https:', hostname: 'jogo', production: prod })).toBe(prod);
    expect(resolveSignalUrl({ param: 'ws://127.0.0.1:8787', protocol: 'https:', hostname: 'jogo', production: prod })).toBe('ws://127.0.0.1:8787');
    // produção inválida é ignorada
    expect(resolveSignalUrl({ protocol: 'http:', hostname: 'localhost', production: 'https://nao-ws' })).toBe('ws://localhost:8787');
  });

  it('isSignalUrl aceita só ws/wss bem formadas', () => {
    expect(isSignalUrl('ws://a:1')).toBe(true);
    expect(isSignalUrl('wss://a')).toBe(true);
    expect(isSignalUrl('https://a')).toBe(false);
    expect(isSignalUrl('ws://')).toBe(false);
    expect(isSignalUrl(undefined)).toBe(false);
  });
});
