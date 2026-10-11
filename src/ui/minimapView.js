/**
 * minimapView.js (F6-04) — lógica do minimapa de produção, sem DOM (testável em Node):
 * trapézio do frustum da câmera projetado no chão, cores por jogador, escolha do alvo de uma
 * ordem dada por clique direito e flashes de ordem. O desenho em si fica em `UIManager.drawMinimap`.
 */

/** Cor dos neutros hostis (bandoleiros/acampamentos) e fallback de jogador sem cor. */
export const NEUTRAL_COLOR = '#f97316';
export const FALLBACK_COLOR = '#9ca3af';

/** Tempo de vida (s) do flash de ordem no minimapa. */
export const ORDER_FLASH_LIFE = 0.9;

const MIN_DIR_Y = 0.02;

/**
 * Pontos do chão (y = `groundY`) vistos pelos 4 cantos da tela, na ordem
 * inferior-esquerdo, inferior-direito, superior-direito, superior-esquerdo — um trapézio.
 * Raios que não atingem o chão (acima do horizonte) ou que chegam além de `maxDist` são
 * limitados a `maxDist` na horizontal. O resultado é limitado ao quadrado do mapa.
 * @param {import('three').PerspectiveCamera} camera  com `matrixWorld`/`projectionMatrixInverse` atuais
 * @param {new (x:number,y:number,z:number) => {unproject:(c:any)=>any,x:number,y:number,z:number}} Vec3  `THREE.Vector3`
 * @returns {{x:number,z:number}[]}
 */
export function frustumGroundQuad(camera, Vec3, mapSize, { groundY = 0, maxDist = 220 } = {}) {
  camera.updateMatrixWorld();
  const cx = camera.matrixWorld.elements[12];
  const cy = camera.matrixWorld.elements[13];
  const cz = camera.matrixWorld.elements[14];
  const half = mapSize / 2;
  const out = [];
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  for (const [nx, ny] of corners) {
    const p = new Vec3(nx, ny, 0.5).unproject(camera);
    let dx = p.x - cx;
    let dy = p.y - cy;
    let dz = p.z - cz;
    let t = dy < -MIN_DIR_Y * Math.hypot(dx, dy, dz) ? (groundY - cy) / dy : Infinity;
    const horiz = Math.hypot(dx, dz) || 1;
    const maxT = maxDist / horiz;
    if (!(t > 0) || t > maxT) t = maxT;
    dx *= t; dz *= t;
    out.push({
      x: Math.max(-half, Math.min(half, cx + dx)),
      z: Math.max(-half, Math.min(half, cz + dz))
    });
  }
  return out;
}

/** Cor CSS do dono de uma entidade (neutro hostil em laranja, desconhecido em cinza). */
export function playerColor(registry, ownerId, neutralId) {
  if (ownerId === neutralId) return NEUTRAL_COLOR;
  const p = registry && registry.getPlayer ? registry.getPlayer(ownerId) : null;
  return (p && p.color) || FALLBACK_COLOR;
}

/**
 * Converte um evento de ponteiro (clientX/Y) em pixel do canvas, respeitando a escala CSS
 * (a escala de UI faz o canvas de 140 px aparecer maior/menor que o tamanho intrínseco).
 */
export function pointerToCanvas(clientX, clientY, rect, canvasW, canvasH) {
  const sx = rect.width > 0 ? canvasW / rect.width : 1;
  const sy = rect.height > 0 ? canvasH / rect.height : 1;
  return { x: (clientX - rect.left) * sx, y: (clientY - rect.top) * sy };
}

const pos = (e) => (e && e.mesh && e.mesh.position) || null;

/**
 * Entidade mais provável sob o ponto (x, z) do minimapa, para `gm.issueOrder`:
 * hostil visível (unidade, depois construção conhecida) > mina visível/explorada >
 * construção própria incompleta ou danificada > nada (move). `radius` em unidades de mundo.
 * @param {object} gm  GameManager (duck typing: enemies, buildings, resourceDeposits, fogOfWar,
 *   isHostile, localPlayerId)
 */
export function pickMinimapTarget(gm, x, z, radius) {
  const r2 = radius * radius;
  const fog = gm.fogOfWar;
  const local = gm.localPlayerId;
  let best = null;
  let bestScore = Infinity; // classe*1e6 + distância²
  const consider = (e, cls) => {
    const p = pos(e);
    if (!p) return;
    const d2 = (p.x - x) ** 2 + (p.z - z) ** 2;
    if (d2 > r2) return;
    const s = cls * 1e6 + d2;
    if (s < bestScore) { bestScore = s; best = e; }
  };

  for (const u of gm.enemies || []) {
    if (u.isDead || u.isDying) continue;
    const p = pos(u);
    if (!p || (fog && !fog.isVisible(p.x, p.z))) continue;
    consider(u, 0);
  }
  for (const b of gm.buildings || []) {
    if (b.isDead) continue;
    if (gm.isHostile(local, b.ownerId)) {
      if (fog && !fog.isBuildingKnown(b)) continue;
      consider(b, 1);
    } else if (b.ownerId === local && (!b.isConstructed || b.hp < b.maxHp)) {
      consider(b, 3);
    }
  }
  for (const d of gm.resourceDeposits || []) {
    if (d.isDead || (d.resourcesRemaining !== undefined && d.resourcesRemaining <= 0)) continue;
    const p = pos(d);
    if (!p || (fog && !fog.isExplored(p.x, p.z))) continue;
    consider(d, 2);
  }
  return best;
}

/** Flashes de ordem no minimapa (marca o ponto onde o clique direito mandou as unidades). */
export class OrderFlashes {
  constructor() { this.items = []; }
  /** @param {'move'|'attack'|'gather'|'rally'} kind */
  add(x, z, kind = 'move') {
    this.items.push({ x, z, kind, age: 0 });
    if (this.items.length > 8) this.items.shift();
  }
  update(dt) {
    for (const f of this.items) f.age += dt / ORDER_FLASH_LIFE;
    this.items = this.items.filter((f) => f.age < 1);
  }
  clear() { this.items.length = 0; }
}

/** Classe visual da ordem dada ao alvo `e` (para a cor do flash). */
export function orderKindFor(gm, e) {
  if (!e) return 'move';
  if (gm.isHostile(gm.localPlayerId, e.ownerId)) return 'attack';
  if (e.resourcesRemaining !== undefined) return 'gather';
  return 'move';
}

const FLASH_COLORS = { move: '#4ade80', attack: '#ef4444', gather: '#fbbf24', rally: '#60a5fa' };

/** Desenha os flashes (anel que encolhe). `toMap(x,z)` mundo → pixel do minimapa. */
export function drawOrderFlashes(ctx, flashes, toMap) {
  if (!flashes.length) return;
  ctx.save();
  ctx.lineWidth = 2;
  for (const f of flashes) {
    const m = toMap(f.x, f.z);
    ctx.globalAlpha = Math.max(0, 1 - f.age);
    ctx.strokeStyle = FLASH_COLORS[f.kind] || FLASH_COLORS.move;
    ctx.beginPath();
    ctx.arc(m.x, m.y, 2 + (1 - f.age) * 10, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

/** Desenha o trapézio da câmera (contorno claro com sombra fina para contraste). */
export function drawCameraQuad(ctx, quad, toMap) {
  if (!quad || quad.length < 3) return;
  ctx.save();
  ctx.beginPath();
  quad.forEach((q, i) => {
    const m = toMap(q.x, q.z);
    if (i === 0) ctx.moveTo(m.x, m.y); else ctx.lineTo(m.x, m.y);
  });
  ctx.closePath();
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(0,0,0,0.65)';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.strokeStyle = '#ffd700';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

/**
 * NEW-24: pontos e linhas de muralha no minimapa. Só segmentos `isKnown` (visíveis/explorados pela névoa, mesma regra das
 * construções). Segmentos consecutivos do mesmo dono a no máx. `maxLink` de distância ligam-se por uma linha.
 * @param {{x:number,z:number,ownerId:number}[]} walls  posições de mundo, na ordem de criação
 * @param {(x:number,z:number)=>{x:number,y:number}} toMap
 * @param {(w:object)=>boolean} [isKnown]
 */
export function wallMinimapShapes(walls, toMap, isKnown = () => true, maxLink = 3) {
  const points = [];
  const lines = [];
  let prev = null;
  for (const w of walls) {
    if (!isKnown(w)) { prev = null; continue; }
    const m = toMap(w.x, w.z);
    points.push({ x: m.x, y: m.y, ownerId: w.ownerId });
    if (prev && prev.ownerId === w.ownerId && Math.hypot(w.x - prev.x, w.z - prev.z) <= maxLink) {
      const p = toMap(prev.x, prev.z);
      lines.push({ x1: p.x, y1: p.y, x2: m.x, y2: m.y, ownerId: w.ownerId });
    }
    prev = w;
  }
  return { points, lines };
}
