/**
 * uiSprites.js (F7-09) — sprites 2D da HUD renderizados no Blender (tools/blender/render_*.py -> public/ui/).
 *
 * O que existe em `public/ui/` (lista exata em `public/ui/manifest.json`, lida em tempo de execução: o JSON NÃO entra no
 * bundle JS):
 *   icons/<128|256>/<tipo>_<id>.webp   ícones de comando, unidades, construções, pesquisas e magias (fundo transparente)
 *   portraits/<tipo>_<idle|attack>.webp  retratos 128² das unidades (1 quadro por estado)
 *   art/menu.webp, art/loading.webp      artes de tela (<= 1920x1080)
 * Ids de ícone: `unit_<tipo>`, `building_<tipo>`, `command_<ação>`, `research_<id>`, `ability_<id>`; variantes de facção
 * têm o sufixo `_orc` (ex.: `unit_tanker_orc`, `research_melee_weapons_orc`). `aliases` do manifesto reaproveitam um
 * ícone (a pesquisa de uma magia usa o ícone da própria magia).
 *
 * Regra de ouro: NADA aqui pode quebrar a HUD. Se o manifesto não carregar, se um id não existir ou se o arquivo falhar,
 * o botão cai no ícone antigo (`data/*.js` -> `icon`) e, se esse também falhar, no emoji provisório (ver
 * `installSpriteFallback`). A parte pura (sem DOM) é testada em `tests/unit/uiSprites.test.js`.
 */

const BASE = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL) || '/';

/** Manifesto normalizado (ou null enquanto não carregou / se falhou). */
let manifest = null;
let loading = null;
const subscribers = new Set();

/** Emoji de último recurso por tipo de ícone (os botões passam o seu, mais específico). */
export const KIND_EMOJI = Object.freeze({ unit: '⚔️', building: '🏠', command: '❔', research: '📜', ability: '✨', stat: '▪️' });

const escAttr = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ------------------------------------------------------------------------------------------------- manifesto
/** Normaliza o JSON bruto de `public/ui/manifest.json` (ou devolve null se não for um manifesto utilizável). */
export function normalizeManifest(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const icons = raw.icons && typeof raw.icons === 'object' ? raw.icons : {};
  const portraits = raw.portraits && typeof raw.portraits === 'object' ? raw.portraits : {};
  const sizes = Array.isArray(icons.sizes) && icons.sizes.length ? icons.sizes.map(Number).filter(Number.isFinite).sort((a, b) => a - b) : [128, 256];
  return {
    version: Number(raw.version) || 0,
    iconSizes: sizes,
    iconIds: new Set(Array.isArray(icons.ids) ? icons.ids : []),
    aliases: raw.aliases && typeof raw.aliases === 'object' ? { ...raw.aliases } : {},
    portraitIds: new Set(Array.isArray(portraits.ids) ? portraits.ids : []),
    portraitSize: Number(portraits.size) || 128,
    art: raw.art && typeof raw.art === 'object' ? raw.art : {}
  };
}

export function setManifest(raw) {
  manifest = normalizeManifest(raw);
  for (const fn of [...subscribers]) {
    try { fn(manifest); } catch { /* ouvinte com erro não pode derrubar os demais */ }
  }
  return manifest;
}

export function getManifest() {
  return manifest;
}

/** Avisa quando o manifesto chegar (a HUD redesenha o card). Devolve a função que cancela a inscrição. */
export function onUiManifestReady(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

/**
 * Carrega `ui/manifest.json` uma vez (promessa memoizada). Nunca rejeita: falha de rede/JSON => manifesto nulo e a HUD
 * segue com os ícones antigos.
 */
export function loadUiManifest(fetchFn = (typeof fetch === 'function' ? fetch : null), base = BASE) {
  if (loading) return loading;
  if (!fetchFn) return Promise.resolve(null);
  loading = fetchFn(`${base}ui/manifest.json`, { cache: 'default' })
    .then((r) => (r && r.ok ? r.json() : null))
    .then((raw) => (raw ? setManifest(raw) : null))
    .catch(() => null);
  return loading;
}

/** Só para testes: esquece o manifesto e a promessa de carga. */
export function resetUiSprites() {
  manifest = null;
  loading = null;
  subscribers.clear();
}

// ------------------------------------------------------------------------------------------------- ids e URLs
/** Segue os aliases (até 4 saltos) e devolve o id existente no manifesto, ou null. */
export function resolveIconId(id, m = manifest) {
  if (!m || !id) return null;
  let cur = id;
  for (let i = 0; i < 4; i++) {
    if (m.iconIds.has(cur)) return cur;
    const next = m.aliases[cur];
    if (!next) return null;
    cur = next;
  }
  return null;
}

/** Primeiro candidato que existe no manifesto (variante de facção primeiro). */
function firstIcon(m, ...candidates) {
  for (const c of candidates) {
    if (!c) continue;
    const r = resolveIconId(c, m);
    if (r) return r;
  }
  return null;
}

export function unitIconId(type, factionId = null, m = manifest) {
  return firstIcon(m, factionId === 'orc' ? `unit_${type}_orc` : null, `unit_${type}`);
}
export function buildingIconId(type, factionId = null, m = manifest) {
  return firstIcon(m, factionId === 'orc' ? `building_${type}_orc` : null, `building_${type}`);
}
export function researchIconId(id, factionId = null, m = manifest) {
  return firstIcon(m, factionId === 'orc' ? `research_${id}_orc` : null, `research_${id}`);
}
export function abilityIconId(id, m = manifest) {
  return firstIcon(m, `ability_${id}`);
}
export function commandIconId(name, factionId = null, m = manifest) {
  return firstIcon(m, factionId === 'orc' ? `command_${name}_orc` : null, `command_${name}`);
}
/** Atributos da linha de status do card (`stat_attack`, `stat_armor`, `stat_mana`…). */
export function statIconId(name, m = manifest) {
  return firstIcon(m, `stat_${name}`);
}

/** 128 ou 256 conforme o tamanho em pixels de DISPOSITIVO (css × escala da HUD × devicePixelRatio). */
export function pickIconSize(cssPx, uiScale = 1, dpr = 1, sizes = [128, 256]) {
  const need = cssPx * uiScale * dpr;
  for (const s of sizes) if (need <= s * 1.0001) return s;
  return sizes[sizes.length - 1];
}

/** URL do ícone `id` (já resolvido ou não) no tamanho pedido; null se o id não existir no manifesto. */
export function iconUrl(id, size = 128, m = manifest, base = BASE) {
  const rid = resolveIconId(id, m);
  if (!rid) return null;
  const sz = m.iconSizes.includes(size) ? size : m.iconSizes[m.iconSizes.length - 1];
  return `${base}ui/icons/${sz}/${rid}.webp`;
}

/** Id do retrato de um tipo de unidade (variante de facção primeiro), ou null. */
export function portraitId(type, factionId = null, m = manifest) {
  if (!m || !type) return null;
  if (factionId === 'orc' && m.portraitIds.has(`${type}_orc`)) return `${type}_orc`;
  return m.portraitIds.has(type) ? type : null;
}

/** URL do retrato (`state` = 'idle' | 'attack'); null se o tipo não tem retrato. */
export function portraitUrl(type, state = 'idle', factionId = null, m = manifest, base = BASE) {
  const id = portraitId(type, factionId, m);
  return id ? `${base}ui/portraits/${id}_${state === 'attack' ? 'attack' : 'idle'}.webp` : null;
}

/** Estado do retrato de uma unidade: 'attack' enquanto golpeia (`fight`) ou lança magia (`cast`) e está viva; senão 'idle'. */
export function portraitState(unit) {
  if (!unit || unit.isDead || unit.isDying) return 'idle';
  return unit.anim === 'fight' || unit.anim === 'cast' ? 'attack' : 'idle';
}

/** URL de uma arte de tela (`menu` | `loading`) ou null. */
export function artUrl(name, m = manifest, base = BASE) {
  const a = m && m.art && m.art[name];
  return a && a.file ? `${base}ui/${a.file}` : null;
}

// ------------------------------------------------------------------------------------------------- HTML
/**
 * `<img>` de um ícone com fallback encadeado: sprite -> ícone antigo (`fallbackSrc`) -> emoji (`fallbackEmoji`).
 * Sem manifesto/id, devolve direto o ícone antigo (ou o emoji). `cssPx` = tamanho exibido (escolhe 128 ou 256).
 */
export function spriteImgHtml({ id, cssPx = 44, uiScale = 1, dpr = 1, cls = '', alt = '', fallbackSrc = '', fallbackEmoji = '', m = manifest, base = BASE }) {
  const rid = id ? resolveIconId(id, m) : null;
  const emoji = fallbackEmoji || KIND_EMOJI[String(id || '').split('_')[0]] || '❔';
  const common = `class="${escAttr(cls)}" alt="${escAttr(alt)}" draggable="false"`;
  if (rid) {
    const url = iconUrl(rid, pickIconSize(cssPx, uiScale, dpr, m.iconSizes), m, base);
    return `<img ${common} src="${escAttr(url)}" data-ui-sprite="${escAttr(rid)}" data-fb-src="${escAttr(fallbackSrc)}" data-fb-emoji="${escAttr(emoji)}">`;
  }
  if (fallbackSrc) {
    return `<img ${common} src="${escAttr(fallbackSrc)}" data-ui-sprite="" data-fb-emoji="${escAttr(emoji)}">`;
  }
  return `<span class="${escAttr(cls)} ui-sprite-emoji" aria-hidden="true">${escAttr(emoji)}</span>`;
}

/**
 * Instala UM ouvinte de `error` (fase de captura: o evento não borbulha) que trata falhas de `<img data-ui-sprite>`:
 * primeiro tenta o ícone antigo (`data-fb-src`), depois troca a imagem por um <span> com o emoji (`data-fb-emoji`).
 */
export function installSpriteFallback(doc = (typeof document !== 'undefined' ? document : null)) {
  if (!doc || doc.__wpSpriteFallback) return () => {};
  const handle = (img) => {
    if (!img || img.tagName !== 'IMG' || !img.hasAttribute('data-ui-sprite')) return;
    const fb = img.getAttribute('data-fb-src');
    if (fb && img.getAttribute('data-fb-tried') !== '1') {
      img.setAttribute('data-fb-tried', '1');
      img.src = fb;
      return;
    }
    const span = doc.createElement('span');
    span.className = `${img.className} ui-sprite-emoji`.trim();
    span.textContent = img.getAttribute('data-fb-emoji') || '❔';
    span.setAttribute('aria-hidden', 'true');
    img.replaceWith(span);
  };
  const onError = (e) => handle(e.target);
  doc.addEventListener('error', onError, true);
  doc.__wpSpriteFallback = true;
  // <img> estáticas do index.html podem ter falhado ANTES deste instalador rodar (o erro já passou): trata agora.
  if (typeof doc.querySelectorAll === 'function') {
    for (const img of doc.querySelectorAll('img[data-ui-sprite]')) if (img.complete && img.naturalWidth === 0) handle(img);
  }
  return () => {
    doc.removeEventListener('error', onError, true);
    doc.__wpSpriteFallback = false;
  };
}

/** Pré-carrega imagens (evita o "piscar" ao trocar o retrato idle/ataque ou ao abrir um card novo). */
const preloaded = new Map();
export function preloadSprites(urls) {
  if (typeof Image === 'undefined') return;
  for (const u of urls) {
    if (!u || preloaded.has(u)) continue;
    const im = new Image();
    im.decoding = 'async';
    im.src = u;
    preloaded.set(u, im);
  }
}
