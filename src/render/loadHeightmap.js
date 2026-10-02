/** F2-08c: carregamento de heightmap (precisa de `Image`/canvas do navegador); era parte de `terrainGenerators.js`. */
/**
 * Carrega um heightmap (canal R de uma imagem) e devolve um amostrador bilinear em [0,1]²
 * (suporte futuro ao editor F8-03, `mapDef.terrain.heightmap` — só o carregamento, sem uso pelos
 * mapas atuais). Só funciona no navegador (usa `Image`/`document`).
 */
export async function loadHeightmap(url) {
  const image = await new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0);
  const { data } = ctx.getImageData(0, 0, image.width, image.height);
  const width = image.width;
  const height = image.height;
  const values = new Float32Array(width * height);
  for (let i = 0; i < values.length; i++) values[i] = data[i * 4] / 255;

  return {
    width,
    height,
    /** Amostra bilinear em (u, v) ∈ [0,1]². */
    sample(u, v) {
      const x = Math.min(Math.max(u, 0), 1) * (width - 1);
      const y = Math.min(Math.max(v, 0), 1) * (height - 1);
      const x0 = Math.floor(x);
      const y0 = Math.floor(y);
      const x1 = Math.min(x0 + 1, width - 1);
      const y1 = Math.min(y0 + 1, height - 1);
      const fx = x - x0;
      const fy = y - y0;
      const h00 = values[y0 * width + x0];
      const h10 = values[y0 * width + x1];
      const h01 = values[y1 * width + x0];
      const h11 = values[y1 * width + x1];
      const top = h00 + (h10 - h00) * fx;
      const bottom = h01 + (h11 - h01) * fx;
      return top + (bottom - top) * fy;
    }
  };
}
