import { describe, it, expect, vi } from 'vitest';

// Troca o GLTFLoader: registra as URLs pedidas e devolve uma cena mínima com o nó raiz pedido.
const requested = [];
vi.mock('three/examples/jsm/loaders/GLTFLoader.js', async () => {
  const THREE = await import('three');
  return {
    GLTFLoader: class {
      setMeshoptDecoder() { return this; }
      async loadAsync(url) {
        requested.push(url);
        const scene = new THREE.Group();
        const n = new THREE.Group();
        n.name = url; // identifica; `getObjectByName(def.root)` não acha => usa a cena inteira
        scene.add(n);
        return { scene };
      }
    }
  };
});

const mod = await import('../../src/entities/glbModels.js');
const { GLB_MODELS, glbFaction } = mod;

/**
 * F10-05b — .glb por facção: classificação derivada de src/data e carga sob demanda (cada arquivo baixado uma única vez).
 */
describe('glbFaction (F10-05b)', () => {
  it('classifica pelo `faction` das tabelas e trata o resto como neutro', () => {
    expect(glbFaction('knight')).toBe('human');
    expect(glbFaction('castle')).toBe('human');
    expect(glbFaction('grunt')).toBe('orc');
    expect(glbFaction('great_hall')).toBe('orc');
    expect(glbFaction('orc_frigate')).toBe('orc');
    expect(glbFaction('wall_orc')).toBe('orc');
    expect(glbFaction('wall_human')).toBe('human');
    for (const k of ['tree_oak', 'gold_mine', 'stone_quarry', 'bandit_camp', 'bandit', 'tanker']) expect(glbFaction(k), k).toBe('neutral');
  });

  it('toda chave do GLB_MODELS tem facção definida e há modelos nas três classes', () => {
    const by = { human: 0, orc: 0, neutral: 0 };
    for (const k of Object.keys(GLB_MODELS)) by[glbFaction(k)]++;
    expect(by.human).toBeGreaterThan(5);
    expect(by.orc).toBeGreaterThan(5);
    expect(by.neutral).toBeGreaterThan(3);
  });
});

describe('loadGlbTemplates por facção (F10-05b)', () => {
  it('["human"] baixa humanos + neutros (nenhum orc); depois ["orc"] completa só o que falta, sem repetir downloads', async () => {
    // módulo novo com `?glb=0` (sem a carga automática da importação) para medir só estas chamadas
    vi.resetModules();
    globalThis.window = { location: { search: '?glb=0' } };
    try {
      const fresh = await import('../../src/entities/glbModels.js');
      requested.length = 0;
      await fresh.loadGlbTemplates(['human']);
      const keys = [...fresh.glbTemplates.keys()];
      expect(keys.length).toBeGreaterThan(10);
      expect(keys.some((k) => fresh.glbFaction(k) === 'orc')).toBe(false);
      expect(keys.some((k) => fresh.glbFaction(k) === 'human')).toBe(true);
      expect(keys.some((k) => fresh.glbFaction(k) === 'neutral')).toBe(true);
      const afterHuman = requested.length;

      await fresh.loadGlbTemplates(['orc']);
      const all = Object.keys(fresh.GLB_MODELS).length;
      expect(fresh.glbTemplates.size).toBe(all);
      expect(requested.length).toBe(all); // cada arquivo uma vez
      expect(requested.length).toBeGreaterThan(afterHuman);

      await fresh.loadGlbTemplates(); // tudo já carregado: nenhum download novo
      expect(requested.length).toBe(all);
    } finally {
      delete globalThis.window;
    }
  });
});
