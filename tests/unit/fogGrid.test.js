import { describe, it, expect } from 'vitest';
import { FogGrid, BuildingMemory, FOG_UNEXPLORED, FOG_MEMORY, FOG_VISIBLE, MINIMAP_STYLE } from '../../src/core/FogGrid.js';

/** Um tick de 10 Hz com as posições de visão dadas: [[x, z, raio], ...] */
function tick(grid, viewers) {
  grid.beginVision();
  for (const [x, z, r] of viewers) grid.revealArea(x, z, r);
  return grid.endVision();
}

const building = (x, z, extra = {}) => ({ mesh: { position: { x, z } }, collisionRadius: 3, isDead: false, ...extra });

describe('FogGrid — estados', () => {
  it('começa tudo não explorado', () => {
    const g = new FogGrid(160, 160, 128);
    expect(g.stateAt(0, 0)).toBe(FOG_UNEXPLORED);
    expect(g.isExplored(0, 0)).toBe(false);
    expect(g.isVisible(0, 0)).toBe(false);
  });

  it('revelar marca visível e explorado dentro do raio, e nada fora', () => {
    const g = new FogGrid(160, 160, 128);
    tick(g, [[10, 10, 8]]);
    expect(g.stateAt(10, 10)).toBe(FOG_VISIBLE);
    expect(g.stateAt(15, 10)).toBe(FOG_VISIBLE);
    expect(g.stateAt(25, 10)).toBe(FOG_UNEXPLORED);
    expect(g.stateAt(-10, -10)).toBe(FOG_UNEXPLORED);
  });

  it('ao sair da visão a área vira memória (explorada, não visível)', () => {
    const g = new FogGrid(160, 160, 128);
    tick(g, [[10, 10, 8]]);
    tick(g, [[-30, -30, 8]]);
    expect(g.stateAt(10, 10)).toBe(FOG_MEMORY);
    expect(g.isExplored(10, 10)).toBe(true);
    expect(g.isVisible(10, 10)).toBe(false);
    expect(g.stateAt(-30, -30)).toBe(FOG_VISIBLE);
  });

  it('coordenadas fora do mundo fazem clamp na borda', () => {
    const g = new FogGrid(160, 160, 128);
    expect(g.cellIndex(-1000, -1000)).toBe(0);
    expect(g.cellIndex(1000, 1000)).toBe(128 * 128 - 1);
  });

  it('endVision só acusa mudança quando a visão ou a exploração mudam', () => {
    const g = new FogGrid(160, 160, 128);
    g.needsUpdate = false;
    expect(tick(g, [[0, 0, 6]])).toBe(true); // explorou área nova
    g.writeTexture(new Uint8Array(128 * 128 * 4)); // consome needsUpdate
    expect(tick(g, [[0, 0, 6]])).toBe(false); // nada mudou
    expect(tick(g, [[0.2, 0.1, 6]])).toBe(false); // mesma célula
    expect(tick(g, [[-2, 0, 6]])).toBe(true); // visão andou para área já explorada? ainda muda a visão
  });

  it('detecta reset externo (explored.fill(0) feito pelo GameManager)', () => {
    const g = new FogGrid(160, 160, 128);
    tick(g, [[0, 0, 10]]);
    expect(g.detectExternalReset()).toBe(false);
    g.explored.fill(0);
    g.revealArea(30, 30, 5); // revelação inicial do novo mapa
    expect(g.detectExternalReset()).toBe(true);
    expect(g.detectExternalReset()).toBe(false);
  });
});

describe('FogGrid — textura e minimapa', () => {
  it('sem blur: R = explorado, G = visível (0/255)', () => {
    const g = new FogGrid(160, 160, 128);
    tick(g, [[0, 0, 8]]);
    tick(g, [[40, 40, 8]]);
    const out = new Uint8Array(128 * 128 * 4);
    g.writeTexture(out, 1, 0);
    const at = (x, z) => Array.from(out.subarray(g.cellIndex(x, z) * 4, g.cellIndex(x, z) * 4 + 4)).join(',');
    expect(at(0, 0)).toBe('255,0,255,0'); // memória
    expect(at(40, 40)).toBe('255,255,255,255'); // visível
    expect(at(-40, -40)).toBe('0,0,0,0'); // não explorado
  });

  it('com escala 2 e blur: borda suave e interior intacto', () => {
    const g = new FogGrid(160, 160, 128);
    tick(g, [[0, 0, 12]]);
    const m = 256;
    const out = new Uint8Array(m * m * 4);
    g.writeTexture(out, 2, 2);
    const texel = (x, z, ch = 1) => {
      const tx = Math.floor(((x + 80) / 160) * m);
      const tz = Math.floor(((z + 80) / 160) * m);
      return out[(tz * m + tx) * 4 + ch];
    };
    expect(texel(0, 0)).toBe(255);
    expect(texel(-60, -60)).toBe(0);
    // Em algum ponto da borda (raio ~12) há valores intermediários
    let hasMid = false;
    for (let x = 8; x < 18; x += 0.3) {
      const v = texel(x, 0);
      if (v > 0 && v < 255) hasMid = true;
    }
    expect(hasMid).toBe(true);
    // canais duros continuam binários e iguais à grade lógica
    for (let x = 8; x < 18; x += 0.3) {
      expect([0, 255]).toContain(texel(x, 0, 3));
      expect(texel(x, 0, 3) === 255).toBe(g.isVisible(x, 0));
    }
  });

  it('minimapa: alfa opaco / memória / transparente', () => {
    const g = new FogGrid(160, 160, 128);
    tick(g, [[0, 0, 8]]);
    tick(g, [[40, 40, 8]]);
    const out = new Uint8ClampedArray(128 * 128 * 4);
    g.writeMinimap(out);
    expect(out[g.cellIndex(-40, -40) * 4 + 3]).toBe(MINIMAP_STYLE.unexploredAlpha);
    expect(out[g.cellIndex(0, 0) * 4 + 3]).toBe(MINIMAP_STYLE.memoryAlpha);
    expect(out[g.cellIndex(40, 40) * 4 + 3]).toBe(0);
  });
});

describe('BuildingMemory — fantasmas de construções', () => {
  it('construção nunca vista não é conhecida', () => {
    const g = new FogGrid(160, 160, 128);
    const mem = new BuildingMemory();
    const b = building(30, 30);
    tick(g, [[-30, -30, 8]]);
    mem.update(g, [b]);
    expect(mem.isKnown(b)).toBe(false);
  });

  it('construção vista continua conhecida (memória) após sair da visão', () => {
    const g = new FogGrid(160, 160, 128);
    const mem = new BuildingMemory();
    const b = building(30, 30);
    tick(g, [[30, 30, 8]]);
    mem.update(g, [b]);
    expect(mem.isVisibleNow(b)).toBe(true);
    tick(g, [[-30, -30, 8]]);
    mem.update(g, [b]);
    expect(mem.isKnown(b)).toBe(true);
    expect(mem.isVisibleNow(b)).toBe(false);
  });

  it('basta ver a borda da construção para conhecê-la', () => {
    const g = new FogGrid(160, 160, 128);
    const mem = new BuildingMemory();
    const b = building(30, 30);
    tick(g, [[30 - 2.1 - 3, 30, 3]]); // visão alcança só a lateral esquerda
    mem.update(g, [b]);
    expect(mem.isKnown(b)).toBe(true);
  });

  it('destruída fora da visão vira fantasma até a área ser revista', () => {
    const g = new FogGrid(160, 160, 128);
    const mem = new BuildingMemory();
    const b = building(30, 30);
    tick(g, [[30, 30, 8]]);
    mem.update(g, [b]);
    tick(g, [[-30, -30, 8]]);
    b.isDead = true;
    let r = mem.update(g, []); // saiu da lista ao morrer
    expect(r.newGhosts).toEqual([b]);
    const ghosts = [];
    mem.forEachGhost((gb, rec) => ghosts.push([gb, rec.x, rec.z]));
    expect(ghosts).toEqual([[b, 30, 30]]);
    // continua fantasma enquanto não houver visão
    r = mem.update(g, []);
    expect(r.removedGhosts).toEqual([]);
    // revista: o fantasma some
    tick(g, [[30, 30, 8]]);
    r = mem.update(g, []);
    expect(r.removedGhosts).toEqual([b]);
    expect(mem.records.size).toBe(0);
  });

  it('destruída sob visão não deixa fantasma', () => {
    const g = new FogGrid(160, 160, 128);
    const mem = new BuildingMemory();
    const b = building(30, 30);
    tick(g, [[30, 30, 8]]);
    mem.update(g, [b]);
    b.isDead = true;
    const r = mem.update(g, [b]);
    expect(r.newGhosts).toEqual([]);
    expect(mem.records.size).toBe(0);
  });

  it('removida sem morrer (reset do mapa) é esquecida', () => {
    const g = new FogGrid(160, 160, 128);
    const mem = new BuildingMemory();
    const b = building(30, 30);
    tick(g, [[30, 30, 8]]);
    mem.update(g, [b]);
    tick(g, [[-30, -30, 8]]);
    const r = mem.update(g, []);
    expect(r.newGhosts).toEqual([]);
    expect(mem.isKnown(b)).toBe(false);
  });

  it('avistar a construção explora a origem dela (mesmo vista só pela borda)', () => {
    const g = new FogGrid(160, 160, 128);
    const mem = new BuildingMemory();
    const b = building(30, 30);
    tick(g, [[30 - 2.1 - 3, 30, 3]]);
    expect(g.isExplored(30, 30)).toBe(false);
    mem.update(g, [b]);
    expect(g.isExplored(30, 30)).toBe(true);
    expect(g.isVisible(30, 30)).toBe(false);
  });

  it('construída depois, em área só de memória, não aparece até ser vista', () => {
    const g = new FogGrid(160, 160, 128);
    const mem = new BuildingMemory();
    tick(g, [[30, 30, 8]]);
    tick(g, [[-30, -30, 8]]); // (30,30) agora é memória
    const b = building(30, 30);
    mem.update(g, [b]);
    expect(mem.isKnown(b)).toBe(false);
  });
});
