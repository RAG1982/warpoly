import { describe, it, expect } from 'vitest';
import { terrainBandColor } from '../../src/models/environment/terrainTextures.js';

describe('terrainBandColor', () => {
  const waterLevel = 0.5;
  const x = 0;
  const z = 0;

  it('retorna fundo marinho para h < waterLevel - 0.3', () => {
    const color = terrainBandColor(0.19, waterLevel, x, z);
    expect(color).toBe('#c9b27a');
  });

  it('retorna areia para h no intervalo [waterLevel - 0.3, 1.4)', () => {
    const color = terrainBandColor(1.39, waterLevel, x, z);
    expect(color).toBe('#e4ce95');
  });

  it('retorna grama para h no intervalo [1.4, 3.2)', () => {
    const color = terrainBandColor(3.19, waterLevel, x, z);
    // A cor de grama depende do ruído determinístico, mas deve estar no intervalo
    expect(color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('retorna rocha para h >= 3.2', () => {
    const color = terrainBandColor(3.21, waterLevel, x, z);
    expect(color).toBe('#8a8f6a');
  });

  it('retorna valores corretos nos limites exatos', () => {
    // Limite: h = 0.2 (waterLevel - 0.3) — valores < 0.2 são fundo marinho, >= 0.2 são areia
    expect(terrainBandColor(0.19, waterLevel, x, z)).toBe('#c9b27a');
    expect(terrainBandColor(0.2, waterLevel, x, z)).toBe('#e4ce95');

    // Limite: h = 1.4 — valores < 1.4 são areia, >= 1.4 são grama
    expect(terrainBandColor(1.399, waterLevel, x, z)).toBe('#e4ce95');
    expect(terrainBandColor(1.4, waterLevel, x, z)).toMatch(/^#[0-9a-f]{6}$/i);

    // Limite: h = 3.2 — valores < 3.2 são grama, >= 3.2 são rocha
    expect(terrainBandColor(3.199, waterLevel, x, z)).toMatch(/^#[0-9a-f]{6}$/i);
    expect(terrainBandColor(3.2, waterLevel, x, z)).toBe('#8a8f6a');
  });
});
