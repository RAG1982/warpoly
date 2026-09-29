/**
 * src/world/terrainGenerators.js (F2-05 · mapas orientados a dados)
 *
 * Geradores de altura de terreno: funções puras `(mapDef, x, z) -> height`, sem three.js nem
 * DOM — testáveis em Node (ver tests/unit/terrainGenerators.test.js). Registrados em
 * `TERRAIN_GENERATORS` por `mapDef.terrain.generator`; `Terrain.js` delega `getHeight` para
 * `getHeightForMap(this.mapDef, x, z)`.
 *
 * - "continental": plataforma com rio diagonal e vaus (mapa histórico "Vale do Rio",
 *   parametrizado a partir de `mapDef.terrain.params` e `mapDef.fords` — era hardcoded em
 *   `Terrain.js` antes da F2-05; a fórmula é a mesma, byte a byte, só trocando os números fixos
 *   pelos parâmetros do JSON).
 * - "islands": soma de discos/elipses de terra (`params.islands`) e pontes retangulares
 *   (`params.bridges`), com suavização costeira por `smoothstep` na distância até a forma mais
 *   próxima (aproximação: elipse tratada como esfera deformada, não é uma SDF exata, mas é
 *   suficiente para um mapa jogável e é determinística).
 *
 * `loadHeightmap(url)` (suporte futuro ao editor F8-03): só o carregamento (canvas → Float32Array,
 * amostragem bilinear) — não é usado por nenhum dos dois mapas desta tarefa nem tem cobertura de
 * teste em Node (depende de `Image`/`document`, só existe no navegador).
 */

/** Ondulações suaves comuns às plataformas de terra dos dois geradores. */
function rollingBumps(x, z) {
  return Math.sin(x * 0.3) * 0.2 + Math.cos(z * 0.3) * 0.2 + Math.sin((x + z) * 0.14) * 0.12;
}

/**
 * Gerador "continental": réplica exata (mesmas constantes) do `Terrain.getHeight` anterior à
 * F2-05, parametrizada por `mapDef.terrain.params` (baseHeight, river.{bendAmp,bendFreq,halfWidth},
 * coast.{start,falloff}) e `mapDef.fords` ({x,z,r}).
 */
export function continentalHeight(mapDef, x, z) {
  const params = mapDef.terrain.params;
  const { baseHeight } = params;
  const { bendAmp, bendFreq, halfWidth } = params.river;
  const { start, falloff } = params.coast;
  const fords = mapDef.fords || [];

  const maxCoord = Math.max(Math.abs(x), Math.abs(z));

  // Plataforma continental com ondulações suaves.
  let height = baseHeight + rollingBumps(x, z);

  // Faixa costeira: desce suavemente até a água a partir de `coast.start`.
  if (maxCoord > start) {
    const t = Math.min(1, Math.max(0, (maxCoord - start) / falloff));
    const smooth = t * t * (3 - 2 * t);
    height = baseHeight - smooth * 4.4;
  }

  // Vale do rio (diagonal x - z = 0, com curvatura orgânica) e seus vaus.
  const riverBend = Math.sin((x + z) * bendFreq) * bendAmp;
  const distToRiverLine = Math.abs(x - z - riverBend) / Math.SQRT2;

  if (distToRiverLine < halfWidth && maxCoord < start + 2) {
    const isFord = fords.some((f) => Math.hypot(x - f.x, z - f.z) < f.r);
    if (isFord) {
      // Vau: terra seca e caminhável.
      height = Math.max(height, 2.35 + Math.sin(x * 0.5) * 0.1);
    } else {
      // Canal do rio, abaixo do nível da água.
      const riverDepthFactor = 1 - distToRiverLine / halfWidth;
      const channelHeight = -0.6 - riverDepthFactor * 1.4;
      height = Math.min(height, channelHeight);
    }
  }

  return height;
}

/** Distância (aproximada) de (x,z) até fora de uma elipse de terra `{x,z,rx,rz}`: <0 dentro. */
function ellipseSignedDistance(x, z, island) {
  const dx = (x - island.x) / island.rx;
  const dz = (z - island.z) / island.rz;
  const t = Math.sqrt(dx * dx + dz * dz);
  const avgRadius = (island.rx + island.rz) / 2;
  return (t - 1) * avgRadius;
}

/** Distância (real) de (x,z) até fora de uma ponte retangular `{x1,z1,x2,z2,width}`: <0 dentro. */
function bridgeSignedDistance(x, z, bridge) {
  const { x1, z1, x2, z2, width } = bridge;
  const dx = x2 - x1;
  const dz = z2 - z1;
  const lenSq = dx * dx + dz * dz || 1e-6;
  let u = ((x - x1) * dx + (z - z1) * dz) / lenSq;
  u = Math.max(0, Math.min(1, u));
  const px = x1 + u * dx;
  const pz = z1 + u * dz;
  return Math.hypot(x - px, z - pz) - width / 2;
}

/**
 * Gerador "islands": soma de discos/elipses de terra + pontes retangulares, com suavização
 * costeira (smoothstep) na distância até a forma de terra mais próxima.
 */
export function islandsHeight(mapDef, x, z) {
  const params = mapDef.terrain.params;
  const baseHeight = params.baseHeight;
  const islands = params.islands || [];
  const bridges = params.bridges || [];
  const falloff = params.coast?.falloff ?? 8;

  let signedDist = Infinity;
  for (const island of islands) {
    const d = ellipseSignedDistance(x, z, island);
    if (d < signedDist) signedDist = d;
  }
  for (const bridge of bridges) {
    const d = bridgeSignedDistance(x, z, bridge);
    if (d < signedDist) signedDist = d;
  }

  if (signedDist <= 0) {
    // Dentro de uma ilha ou ponte: terra seca com as mesmas ondulações do continental.
    return baseHeight + rollingBumps(x, z);
  }

  const t = Math.min(1, signedDist / falloff);
  const smooth = t * t * (3 - 2 * t);
  return baseHeight - smooth * (baseHeight + 1.8);
}

/** Geradores registrados por `mapDef.terrain.generator`. */
export const TERRAIN_GENERATORS = Object.freeze({
  continental: continentalHeight,
  islands: islandsHeight
});

/** Altura do terreno de `mapDef` em (x, z), delegando ao gerador registrado. */
export function getHeightForMap(mapDef, x, z) {
  const generator = TERRAIN_GENERATORS[mapDef.terrain.generator];
  if (!generator) {
    throw new Error(`terrainGenerators: gerador de terreno desconhecido "${mapDef.terrain.generator}"`);
  }
  return generator(mapDef, x, z);
}

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
