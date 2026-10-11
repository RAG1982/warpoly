/**
 * lod.js (F1-10) — decisões puras de LOD/culling (sem three.js/DOM, testável em Node).
 *
 * Distâncias em unidades de mundo ao alvo da câmera (a mesma referência do LOD de animação, F1-09).
 * A histerese evita que um objeto na fronteira alterne de nível a cada quadro.
 */

/** Distância (u) a partir da qual cada categoria troca para o nível "longe". */
export const LOD_DISTANCES = Object.freeze({ unit: 90, building: 130, tree: 110, decoration: 70 });

/** Fração da distância usada como banda morta (±) em torno do limiar. */
export const LOD_HYSTERESIS = 0.08;

/** Zoom (`SceneManager.zoomLevel`) acima do qual as decorações pequenas somem. */
export const DECORATION_HIDE_ZOOM = 1.45;

/**
 * Nível de LOD para uma distância: 0 = perto, 1 = longe. `current` é o nível atual do objeto: só muda ao
 * ultrapassar o limiar por mais de `LOD_HYSTERESIS` (para longe: > limiar·(1+h); para perto: < limiar·(1−h)).
 */
export function lodLevelForDistance(dist, threshold, current = 0, hysteresis = LOD_HYSTERESIS) {
  if (current === 0) return dist > threshold * (1 + hysteresis) ? 1 : 0;
  return dist < threshold * (1 - hysteresis) ? 0 : 1;
}

/** Com a câmera bem afastada, decorações pequenas (grama, seixos, cogumelos, flores) não valem o draw call. */
export function zoomHidesDecorations(zoomLevel) {
  return zoomLevel > DECORATION_HIDE_ZOOM;
}

/** `?lod=0` desliga todo o LOD (comparação A/B no bench). */
export function lodEnabled(search = typeof window !== 'undefined' ? window.location.search : '') {
  try {
    return new URLSearchParams(search).get('lod') !== '0';
  } catch {
    return true;
  }
}

/**
 * Aplica o nível de LOD a uma raiz 3D de unidade/construção (só render): desliga `castShadow` das malhas que projetavam
 * sombra (opcional) e oculta peças `userData.lodDetail`. O cache (`view._lodCache`) é preenchido na 1ª troca de nível e deve
 * ser zerado (`= null`) quando o modelo é recriado. Restaura os valores originais ao voltar para perto.
 */
export function applyEntityLod(view, root, level, shadows) {
  let cache = view._lodCache;
  if (!cache) {
    cache = view._lodCache = { shadow: [], detail: [] };
    root.traverse(o => {
      if (o.userData && o.userData.lodDetail) cache.detail.push(o);
      else if (shadows && o.isMesh && o.castShadow) cache.shadow.push(o);
    });
  }
  const near = level === 0;
  for (let i = 0; i < cache.shadow.length; i++) cache.shadow[i].castShadow = near;
  for (let i = 0; i < cache.detail.length; i++) {
    const d = cache.detail[i];
    if (near) {
      if (d.userData.lodWasVisible !== undefined) d.visible = d.userData.lodWasVisible;
    } else {
      d.userData.lodWasVisible = d.visible;
      d.visible = false;
    }
  }
}
