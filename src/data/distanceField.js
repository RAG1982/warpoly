/**
 * src/data/distanceField.js (MUNDO-5) — transformada de distância em grade (chanfro 1 / √2), pura (sem three/DOM).
 * Usada pela influência regional na água (`biomeRegions.js`) e pelo brilho da lava (`lavaRender.js`).
 */

/**
 * Distância (em CÉLULAS) de cada nó de uma grade `n × n` ao nó-fonte mais próximo (`source[i]` truthy). Nós-fonte = 0; sem nenhuma
 * fonte, tudo vale `1e9`. Duas passadas com pesos 1 (ortogonal) e √2 (diagonal): erro < 8 % em relação à distância euclidiana.
 * @param {ArrayLike<number>} source  máscara (n × n)
 * @param {number} n
 * @returns {Float32Array}
 */
export function chamferDistance(source, n) {
  const INF = 1e9;
  const D = Math.SQRT2;
  const d = new Float32Array(n * n);
  for (let i = 0; i < d.length; i++) d[i] = source[i] ? 0 : INF;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const k = j * n + i;
      let v = d[k];
      if (i > 0) v = Math.min(v, d[k - 1] + 1);
      if (j > 0) {
        v = Math.min(v, d[k - n] + 1);
        if (i > 0) v = Math.min(v, d[k - n - 1] + D);
        if (i < n - 1) v = Math.min(v, d[k - n + 1] + D);
      }
      d[k] = v;
    }
  }
  for (let j = n - 1; j >= 0; j--) {
    for (let i = n - 1; i >= 0; i--) {
      const k = j * n + i;
      let v = d[k];
      if (i < n - 1) v = Math.min(v, d[k + 1] + 1);
      if (j < n - 1) {
        v = Math.min(v, d[k + n] + 1);
        if (i < n - 1) v = Math.min(v, d[k + n + 1] + D);
        if (i > 0) v = Math.min(v, d[k + n - 1] + D);
      }
      d[k] = v;
    }
  }
  return d;
}
