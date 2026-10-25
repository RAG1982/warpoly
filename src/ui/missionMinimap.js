/**
 * missionMinimap.js — M3-X1: marcas das missões no minimapa (losango dourado/ciano dos marcadores de objetivo, pip das
 * unidades de escolta/resgate VISÍVEIS e pontos dos marcos já explorados). Só desenho; `toMap(x,z)` mundo → pixel.
 * Chamado por `UIManager.drawMinimap` depois da névoa, para aparecer por cima dela.
 */
const MARK_COLOR = { goal: '#ffd700', discover: '#67e8f9' };
const LANDMARK_COLOR = { ruins: '#d6d3d1', truce_post: '#fde68a', shrine: '#67e8f9' };

function diamond(ctx, x, y, r) {
  ctx.beginPath();
  ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath();
  ctx.fill();
}

/** Desenha as marcas da missão atual de `gm` (no-op sem missão). */
export function drawMissionMinimap(ctx, gm, toMap, fog) {
  const rt = gm.mission;
  if (!rt) return;
  ctx.save();
  // 1. Marcadores de objetivo: losango no centro + anel com o raio da área
  for (const mk of rt.markers()) {
    const c = toMap(mk.area.x, mk.area.z);
    const edge = toMap(mk.area.x + mk.area.r, mk.area.z);
    const rp = Math.max(3, Math.abs(edge.x - c.x));
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = MARK_COLOR[mk.style] || MARK_COLOR.goal;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(c.x, c.y, rp, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = MARK_COLOR[mk.style] || MARK_COLOR.goal;
    diamond(ctx, c.x, c.y, 4.5);
  }
  // 2. Marcos já explorados (ou sempre visíveis)
  for (const lm of rt.landmarks) {
    if (!lm.known && fog && !fog.isExplored(lm.x, lm.z)) continue;
    const m = toMap(lm.x, lm.z);
    ctx.globalAlpha = 1;
    ctx.fillStyle = LANDMARK_COLOR[lm.kind] || '#e5e7eb';
    ctx.fillRect(m.x - 2, m.y - 2, 4, 4);
  }
  // 3. Unidades de escolta/resgate ativas, só as visíveis pela névoa
  const seen = new Set();
  for (const o of rt.objectives.values()) {
    if (o.status !== 'active' || !o.def.tag || (o.def.type !== 'escort' && o.def.type !== 'rescue')) continue;
    for (const id of rt.tags.get(o.def.tag) || []) {
      if (seen.has(id)) continue;
      seen.add(id);
      const u = gm.entitiesById.get(id);
      if (!u || u.isDead || u.isDying || !u.mesh) continue;
      const p = u.mesh.position;
      if (fog && !fog.isVisible(p.x, p.z)) continue;
      const m = toMap(p.x, p.z);
      ctx.globalAlpha = 1;
      ctx.fillStyle = u.markColor || '#ffd700';
      diamond(ctx, m.x, m.y, 3.5);
      ctx.strokeStyle = '#0f0a00';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
  ctx.restore();
}
