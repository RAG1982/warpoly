import { describe, it, expect } from 'vitest';
import { EventBus } from '../../src/sim/EventBus.js';

describe('EventBus (F2-07)', () => {
  it('emit() enfileira; nenhum ouvinte é chamado antes de flush()', () => {
    const bus = new EventBus();
    const received = [];
    bus.on('foo', p => received.push(p));

    bus.emit('foo', { a: 1 });
    expect(received).toHaveLength(0); // fila durante o passo, não despachado ainda

    bus.flush();
    expect(received).toEqual([{ a: 1 }]);
  });

  it('flush() despacha na ordem de emissão, mesmo entre tipos diferentes', () => {
    const bus = new EventBus();
    const order = [];
    bus.on('a', () => order.push('a'));
    bus.on('b', () => order.push('b'));

    bus.emit('a', {});
    bus.emit('b', {});
    bus.emit('a', {});
    bus.flush();

    expect(order).toEqual(['a', 'b', 'a']);
  });

  it('off() (retornado por on() ou chamado direto) remove o ouvinte', () => {
    const bus = new EventBus();
    let count = 0;
    const off = bus.on('foo', () => count++);

    bus.emit('foo', {});
    bus.flush();
    expect(count).toBe(1);

    off();
    bus.emit('foo', {});
    bus.flush();
    expect(count).toBe(1); // não incrementou de novo

    // off(type, fn) direto (segunda forma)
    const fn2 = () => count++;
    bus.on('bar', fn2);
    bus.off('bar', fn2);
    bus.emit('bar', {});
    bus.flush();
    expect(count).toBe(1);
  });

  it('payload é congelado (serializável, sem referências vivas mutáveis)', () => {
    const bus = new EventBus();
    let seen = null;
    bus.on('foo', p => (seen = p));

    bus.emit('foo', { pos: { x: 1, y: 2, z: 3 }, ownerId: 0 });
    bus.flush();

    expect(Object.isFrozen(seen)).toBe(true);
    expect(Object.isFrozen(seen.pos)).toBe(true);
    expect(() => JSON.stringify(seen)).not.toThrow();
    expect(JSON.parse(JSON.stringify(seen))).toEqual({ pos: { x: 1, y: 2, z: 3 }, ownerId: 0 });
  });

  it('muted: emit()/flush() continuam aceitando eventos, mas nenhum ouvinte é chamado', () => {
    const bus = new EventBus();
    let count = 0;
    bus.on('foo', () => count++);
    bus.muted = true;

    bus.emit('foo', {});
    bus.flush();
    expect(count).toBe(0);
  });

  it('clear() remove ouvintes e esvazia a fila sem despachar', () => {
    const bus = new EventBus();
    let count = 0;
    bus.on('foo', () => count++);
    bus.emit('foo', {});

    bus.clear();
    bus.flush();
    expect(count).toBe(0);
  });
});
