/**
 * Codec PNG mínimo para a regressão visual (F10-03). Sem dependência externa: usa só `zlib`.
 *
 * Suporta: decodificação de PNG não entrelaçado, 8 bits por canal, tipos de cor
 * 0 (cinza), 2 (RGB), 4 (cinza+alfa), 6 (RGBA) — o que o Chromium/Playwright gera.
 * Codificação: sempre RGBA 8 bits, filtro 0 (sem filtragem).
 */
import { inflateSync, deflateSync } from 'zlib';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const CHANNELS = { 0: 1, 2: 3, 4: 2, 6: 4 };

/**
 * @param {Buffer|Uint8Array} input bytes de um PNG
 * @returns {{width:number,height:number,data:Uint8Array}} RGBA 8 bits, `width*height*4` bytes
 */
export function decodePng(input) {
  const buf = Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  if (!buf.subarray(0, 8).equals(SIGNATURE)) throw new Error('PNG inválido: assinatura');
  let pos = 8;
  let width = 0, height = 0, colorType = -1, bitDepth = 0, interlace = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const body = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      bitDepth = body[8];
      colorType = body[9];
      interlace = body[12];
    } else if (type === 'IDAT') {
      idat.push(body);
    } else if (type === 'IEND') {
      break;
    }
    pos += 12 + len; // len + tipo + dados + crc
  }
  if (!CHANNELS[colorType] || bitDepth !== 8 || interlace !== 0) {
    throw new Error(`PNG não suportado: colorType=${colorType} bitDepth=${bitDepth} interlace=${interlace}`);
  }
  const ch = CHANNELS[colorType];
  const stride = width * ch;
  const raw = inflateSync(Buffer.concat(idat));
  if (raw.length !== (stride + 1) * height) throw new Error('PNG corrompido: tamanho dos dados');

  // Desfaz os filtros de linha (0-4) para um buffer de pixels sem filtro.
  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const dst = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? pixels[dst + x - ch] : 0; // esquerda
      const b = y > 0 ? pixels[dst - stride + x] : 0; // acima
      const c = y > 0 && x >= ch ? pixels[dst - stride + x - ch] : 0; // acima-esquerda
      let v = raw[src + x];
      switch (filter) {
        case 0: break;
        case 1: v += a; break;
        case 2: v += b; break;
        case 3: v += (a + b) >> 1; break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
          break;
        }
        default: throw new Error(`filtro PNG desconhecido: ${filter}`);
      }
      pixels[dst + x] = v & 0xff;
    }
  }

  // Converte para RGBA.
  const data = new Uint8Array(width * height * 4);
  for (let i = 0, n = width * height; i < n; i++) {
    const s = i * ch, d = i * 4;
    if (colorType === 6) { data[d] = pixels[s]; data[d + 1] = pixels[s + 1]; data[d + 2] = pixels[s + 2]; data[d + 3] = pixels[s + 3]; }
    else if (colorType === 2) { data[d] = pixels[s]; data[d + 1] = pixels[s + 1]; data[d + 2] = pixels[s + 2]; data[d + 3] = 255; }
    else if (colorType === 4) { data[d] = data[d + 1] = data[d + 2] = pixels[s]; data[d + 3] = pixels[s + 1]; }
    else { data[d] = data[d + 1] = data[d + 2] = pixels[s]; data[d + 3] = 255; }
  }
  return { width, height, data };
}

function chunk(type, body) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), body])), 0);
  return Buffer.concat([head, body, crc]);
}

/**
 * @param {{width:number,height:number,data:Uint8Array}} img RGBA 8 bits
 * @returns {Buffer} PNG
 */
export function encodePng({ width, height, data }) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(data.buffer, data.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bits por canal
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 6 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}
