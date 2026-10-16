/**
 * src/data/maps/coast/rotate.js (MUNDO-1): rotação de 180° em torno do centro do mapa, usada pela simetria `rotate`.
 */

/** Índice da célula girada 180°: `(i, j) → (G-1-i, G-1-j)` numa grade `G × G`. */
export const rotateIndex = (c, G) => (G - 1 - ((c - (c % G)) / G)) * G + (G - 1 - (c % G));
