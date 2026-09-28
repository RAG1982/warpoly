import { describe, it, expect, vi } from 'vitest';
import { FloatingTextPool } from '../../src/entities/FloatingTextPool.js';

// F1-08: cria uma textura "falsa" sem depender de canvas/document (ambiente de teste é Node puro).
function makeFakeTextureFactory(counterRef, disposedRef) {
  return () => {
    counterRef.count++;
    const tex = { id: counterRef.count, disposed: false };
    tex.dispose = () => {
      tex.disposed = true;
      disposedRef.ids.push(tex.id);
    };
    return tex;
  };
}

function makePool(poolSize = 64, cacheLimit = 128) {
  const created = { count: 0 };
  const disposed = { ids: [] };
  const createTexture = vi.fn(makeFakeTextureFactory(created, disposed));
  const pool = new FloatingTextPool({ poolSize, cacheLimit, createTexture });
  return { pool, created, disposed, createTexture };
}

describe('FloatingTextPool (F1-08)', () => {
  it('nunca ativa mais slots do que o tamanho do pool ao spawnar 200 textos', () => {
    const { pool } = makePool(64);
    for (let i = 0; i < 200; i++) {
      pool.spawn(`+${i}`, { x: 0, y: 0, z: 0 }, '#ffd700');
      expect(pool.activeCount()).toBeLessThanOrEqual(64);
    }
    expect(pool.activeCount()).toBe(64);
    expect(pool.slots.length).toBe(64);
  });

  it('reutiliza a mesma textura para o mesmo texto+cor (não cria textura de novo)', () => {
    const { pool, createTexture } = makePool(64);
    pool.spawn('+10 Madeira', { x: 0, y: 0, z: 0 }, '#ffd700');
    expect(createTexture).toHaveBeenCalledTimes(1);

    pool.spawn('+10 Madeira', { x: 1, y: 0, z: 1 }, '#ffd700');
    expect(createTexture).toHaveBeenCalledTimes(1); // reutilizou o cache

    pool.spawn('+10 Madeira', { x: 1, y: 0, z: 1 }, '#ff0000'); // cor diferente -> nova chave
    expect(createTexture).toHaveBeenCalledTimes(2);
  });

  it('descarta a textura menos recentemente usada ao exceder o limite do cache', () => {
    const { pool, disposed } = makePool(64, /* cacheLimit */ 4);
    for (let i = 0; i < 5; i++) {
      pool.spawn(`texto-${i}`, { x: 0, y: 0, z: 0 }, '#fff');
    }
    // A 5ª entrada estourou o limite de 4 -> a mais antiga (texto-0) deve ter sido descartada
    expect(pool.cache.size).toBe(4);
    expect(disposed.ids.length).toBe(1);
    expect(pool.cache.has('texto-0|#fff')).toBe(false);
    expect(pool.cache.has('texto-4|#fff')).toBe(true);
  });

  it('ao esgotar o pool, reutiliza o slot mais antigo em vez de criar um novo', () => {
    const { pool } = makePool(2);
    const s1 = pool.spawn('a', { x: 0, y: 0, z: 0 }, '#fff');
    const s2 = pool.spawn('b', { x: 0, y: 0, z: 0 }, '#fff');
    expect(s1.active).toBe(true);
    expect(s2.active).toBe(true);

    // Pool (tamanho 2) já está saturado; o 3º spawn deve reciclar o slot mais antigo (s1)
    const s3 = pool.spawn('c', { x: 0, y: 0, z: 0 }, '#fff');
    expect(pool.slots.length).toBe(2);
    expect(s3).toBe(s1);
    expect(s3.key).toBe('c|#fff');
  });

  it('dispose() zera o cache de texturas e desativa todos os slots', () => {
    const { pool, disposed } = makePool(8, 8);
    for (let i = 0; i < 5; i++) {
      pool.spawn(`t${i}`, { x: 0, y: 0, z: 0 }, '#fff');
    }
    expect(pool.cache.size).toBe(5);
    expect(pool.activeCount()).toBe(5);

    pool.dispose();

    expect(pool.cache.size).toBe(0);
    expect(pool.activeCount()).toBe(0);
    expect(disposed.ids.length).toBe(5);
  });

  it('update() expira slots cuja vida chegou a zero, liberando-os para reuso', () => {
    const { pool } = makePool(4);
    pool.spawn('a', { x: 0, y: 0, z: 0 }, '#fff', 1.0);
    expect(pool.activeCount()).toBe(1);

    pool.update(0.5);
    expect(pool.activeCount()).toBe(1);

    pool.update(0.6); // life total consumida (1.0s)
    expect(pool.activeCount()).toBe(0);
  });
});
