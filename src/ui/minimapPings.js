/**
 * minimapPings.js (F6-05) — desenha os pings de alerta no canvas do minimapa: anel que se
 * expande e some + ponto central pulsante. `toMap(x, z)` converte mundo → pixels do minimapa.
 */
const COLORS = { attack: '#ff3b30', depleted: '#fbbf24' };

/** @param {CanvasRenderingContext2D} ctx @param {{x:number,z:number,kind:string,age:number}[]} pings */
export function drawMinimapPings(ctx, pings, toMap) {
  if (!pings || !pings.length) return;
  ctx.save();
  for (const p of pings) {
    const m = toMap(p.x, p.z);
    const color = p.color || COLORS[p.kind] || '#ffd700'; // F9-04: ping de aliado traz a cor do jogador
    const fade = 1 - p.age;
    // dois anéis defasados (pulso)
    for (let k = 0; k < 2; k++) {
      const ph = (p.age * 3 + k * 0.5) % 1;
      ctx.globalAlpha = Math.max(0, fade * (1 - ph));
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(m.x, m.y, 4 + ph * 18, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = Math.max(0.25, fade);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(m.x, m.y, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
