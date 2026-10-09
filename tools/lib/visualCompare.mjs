/**
 * Comparador de pixels para a regressão visual (F10-03).
 *
 * Um pixel conta como diferente quando a maior diferença entre canais (R,G,B,A) passa de
 * `pixelTolerance`. A imagem falha quando a fração de pixels diferentes passa de `maxDiffRatio`
 * (ou quando as dimensões mudam). A tolerância por pixel absorve ruído de antialias/GPU;
 * a fração absorve pequenas animações (água, fogo) sem deixar passar mudanças de layout.
 */

export const DEFAULT_PIXEL_TOLERANCE = 24;
export const DEFAULT_MAX_DIFF_RATIO = 0.002; // 0,2 % dos pixels

/**
 * @param {{width:number,height:number,data:Uint8Array}} base imagem de referência (baseline)
 * @param {{width:number,height:number,data:Uint8Array}} actual imagem nova
 * @param {{pixelTolerance?:number,maxDiffRatio?:number}} [opts]
 * @returns {{sizeMismatch:boolean,totalPixels:number,diffPixels:number,ratio:number,maxDelta:number,pass:boolean}}
 */
export function compareImages(base, actual, opts = {}) {
  const pixelTolerance = opts.pixelTolerance ?? DEFAULT_PIXEL_TOLERANCE;
  const maxDiffRatio = opts.maxDiffRatio ?? DEFAULT_MAX_DIFF_RATIO;
  const totalPixels = base.width * base.height;
  if (base.width !== actual.width || base.height !== actual.height) {
    return { sizeMismatch: true, totalPixels, diffPixels: totalPixels, ratio: 1, maxDelta: 255, pass: false };
  }
  const a = base.data, b = actual.data;
  let diffPixels = 0, maxDelta = 0;
  for (let i = 0; i < totalPixels; i++) {
    const o = i * 4;
    const d = Math.max(
      Math.abs(a[o] - b[o]),
      Math.abs(a[o + 1] - b[o + 1]),
      Math.abs(a[o + 2] - b[o + 2]),
      Math.abs(a[o + 3] - b[o + 3])
    );
    if (d > maxDelta) maxDelta = d;
    if (d > pixelTolerance) diffPixels++;
  }
  const ratio = totalPixels ? diffPixels / totalPixels : 0;
  return { sizeMismatch: false, totalPixels, diffPixels, ratio, maxDelta, pass: ratio <= maxDiffRatio };
}

/**
 * Imagem de diferença para o relatório: pixels diferentes em magenta; o resto é a referência
 * em tons de cinza esmaecidos, para o diff ser lido de relance.
 */
export function buildDiffImage(base, actual, pixelTolerance = DEFAULT_PIXEL_TOLERANCE) {
  const { width, height } = base;
  const out = new Uint8Array(width * height * 4);
  const a = base.data, b = actual.data;
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    const d = Math.max(
      Math.abs(a[o] - b[o]),
      Math.abs(a[o + 1] - b[o + 1]),
      Math.abs(a[o + 2] - b[o + 2]),
      Math.abs(a[o + 3] - b[o + 3])
    );
    if (d > pixelTolerance) {
      out[o] = 255; out[o + 1] = 0; out[o + 2] = 255; out[o + 3] = 255;
    } else {
      const lum = Math.round(0.299 * a[o] + 0.587 * a[o + 1] + 0.114 * a[o + 2]);
      const g = 128 + Math.round((lum - 128) * 0.25) + 96;
      out[o] = out[o + 1] = out[o + 2] = Math.min(255, g);
      out[o + 3] = 255;
    }
  }
  return { width, height, data: out };
}
