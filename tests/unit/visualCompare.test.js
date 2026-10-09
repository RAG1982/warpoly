import { describe, it, expect } from 'vitest';
import { deflateSync } from 'zlib';
import { compareImages, buildDiffImage } from '../../tools/lib/visualCompare.mjs';
import { decodePng, encodePng } from '../../tools/lib/png.mjs';

/** Imagem sintética sólida (RGBA). */
function solid(w, h, rgba) {
  const data = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set(rgba, i * 4);
  return { width: w, height: h, data };
}

/** Pinta `n` pixels a partir do início com a cor dada. */
function paint(img, n, rgba) {
  for (let i = 0; i < n; i++) img.data.set(rgba, i * 4);
  return img;
}

describe('compareImages (regressão visual)', () => {
  it('imagens idênticas passam com zero pixels diferentes', () => {
    const a = solid(20, 10, [10, 20, 30, 255]);
    const r = compareImages(a, solid(20, 10, [10, 20, 30, 255]));
    expect(r.diffPixels).toBe(0);
    expect(r.ratio).toBe(0);
    expect(r.pass).toBe(true);
  });

  it('diferenças dentro da tolerância por pixel não contam', () => {
    const a = solid(20, 10, [100, 100, 100, 255]);
    const b = solid(20, 10, [110, 95, 100, 255]); // delta 10 <= 24
    const r = compareImages(a, b);
    expect(r.diffPixels).toBe(0);
    expect(r.maxDelta).toBe(10);
    expect(r.pass).toBe(true);
  });

  it('uma fração acima do limiar falha; abaixo passa', () => {
    const base = solid(100, 100, [0, 0, 0, 255]); // 10 000 px
    const within = paint(solid(100, 100, [0, 0, 0, 255]), 15, [255, 255, 255, 255]); // 0,15 %
    const over = paint(solid(100, 100, [0, 0, 0, 255]), 50, [255, 255, 255, 255]); // 0,5 %
    expect(compareImages(base, within).pass).toBe(true);
    const r = compareImages(base, over);
    expect(r.diffPixels).toBe(50);
    expect(r.ratio).toBeCloseTo(0.005, 6);
    expect(r.pass).toBe(false);
  });

  it('limiar e tolerância são configuráveis', () => {
    const base = solid(100, 100, [0, 0, 0, 255]);
    const img = paint(solid(100, 100, [0, 0, 0, 255]), 50, [255, 255, 255, 255]);
    expect(compareImages(base, img, { maxDiffRatio: 0.01 }).pass).toBe(true);
    expect(compareImages(base, img, { pixelTolerance: 255 }).diffPixels).toBe(0);
  });

  it('dimensões diferentes falham como mudança de layout', () => {
    const r = compareImages(solid(20, 10, [0, 0, 0, 255]), solid(10, 20, [0, 0, 0, 255]));
    expect(r.sizeMismatch).toBe(true);
    expect(r.pass).toBe(false);
  });

  it('o diff marca em magenta só os pixels acima da tolerância', () => {
    const base = solid(4, 1, [40, 40, 40, 255]);
    const act = paint(solid(4, 1, [40, 40, 40, 255]), 1, [200, 40, 40, 255]);
    const diff = buildDiffImage(base, act);
    expect(Array.from(diff.data.slice(0, 4))).toEqual([255, 0, 255, 255]);
    expect(diff.data[4]).not.toBe(255); // pixel igual fica acinzentado, não magenta
    expect(diff.data[4]).toBe(diff.data[5]);
  });
});

describe('PNG (codec mínimo)', () => {
  it('encode -> decode preserva pixels RGBA', () => {
    const img = { width: 3, height: 2, data: new Uint8Array(3 * 2 * 4) };
    for (let i = 0; i < img.data.length; i++) img.data[i] = (i * 37) & 0xff;
    const back = decodePng(encodePng(img));
    expect(back.width).toBe(3);
    expect(back.height).toBe(2);
    expect(Array.from(back.data)).toEqual(Array.from(img.data));
  });

  it('decodifica RGB com filtro Sub (tipo 1) e Paeth (tipo 4)', () => {
    // PNG 2x2 RGB 8 bits: linha 0 com filtro Sub, linha 1 com filtro Paeth (codificados aqui).
    const w = 2, h = 2, bpp = 3, stride = w * bpp;
    const px = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120];
    const r0 = px.slice(0, stride), r1 = px.slice(stride);
    const paeth = (a, b, c) => {
      const p = a + b - c;
      const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
    };
    const row0 = [1];
    for (let x = 0; x < stride; x++) row0.push((r0[x] - (x >= bpp ? r0[x - bpp] : 0)) & 0xff);
    const row1 = [4];
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? r1[x - bpp] : 0;
      const b = r0[x];
      const c = x >= bpp ? r0[x - bpp] : 0;
      row1.push((r1[x] - paeth(a, b, c)) & 0xff);
    }
    const png = buildRawPng(w, h, 2, Buffer.from([...row0, ...row1]));
    const back = decodePng(png);
    expect(Array.from(back.data)).toEqual([
      10, 20, 30, 255, 40, 50, 60, 255,
      70, 80, 90, 255, 100, 110, 120, 255
    ]);
  });
});

/** Monta um PNG cru (colorType informado, bit depth 8) a partir de linhas já filtradas. */
function buildRawPng(width, height, colorType, filtered) {
  const crcTable = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTable[n] = c >>> 0;
  }
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, body) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(body.length);
    const t = Buffer.from(type, 'ascii');
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(Buffer.concat([t, body])));
    return Buffer.concat([len, t, body, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = colorType;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(filtered)),
    chunk('IEND', Buffer.alloc(0))
  ]);
}
