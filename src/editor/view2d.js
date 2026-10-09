/**
 * src/editor/view2d.js (F8-03) — vista de cima do mapa em <canvas> 2D: terreno por altura (com relevo sombreado), área jogável,
 * vaus, bases, recursos, florestas, neutros e o cursor do pincel. Só leitura do modelo; as conversões tela↔mundo ficam aqui.
 */
import { heightAtNode } from './mapModel.js';

/** Cor RGB de uma altura (água funda → água → areia → grama → rocha → neve). */
export function heightColor(h) {
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  if (h < 0.5) return lerp([18, 48, 104], [58, 118, 178], clamp01((h + 4) / 4.5));
  if (h < 1.8) return lerp([206, 190, 130], [150, 176, 92], clamp01((h - 0.5) / 1.3));
  if (h < 4.2) return lerp([96, 152, 70], [116, 112, 74], clamp01((h - 1.8) / 2.4));
  return lerp([116, 112, 74], [236, 236, 240], clamp01((h - 4.2) / 5));
}

const ITEM_COLORS = { gold: '#ffd23a', stone: '#c3c8d0', oil: '#1a1a22', start: '#4aa3ff', camp: '#ff5a4a', critters: '#ffffff', forest: '#2f8f3a', ford: '#e9d27a' };
export const startColor = (i) => ['#4aa3ff', '#ff5a4a', '#46d36b', '#ffd23a', '#c47bff', '#ff9a3a', '#3ad6d0', '#ff7bc6'][i % 8];

export class View2D {
  /** @param {HTMLCanvasElement} canvas */
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.tex = document.createElement('canvas');
    this.showGrid = true;
    this.cursor = null; // {x, z, radius, color}
    this.px = 1; // pixels de tela por unidade de mundo
  }

  /** Ajusta o canvas ao contêiner mantendo o mapa quadrado. */
  resize(side) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const s = Math.max(240, Math.floor(side));
    this.canvas.style.width = `${s}px`;
    this.canvas.style.height = `${s}px`;
    this.canvas.width = Math.round(s * dpr);
    this.canvas.height = Math.round(s * dpr);
    this.dpr = dpr;
  }

  worldToScreen(model, x, z) {
    const k = this.canvas.width / model.size;
    return [(x + model.size / 2) * k, (z + model.size / 2) * k];
  }

  /** Posição de ponteiro (clientX/Y) → coordenadas de mundo. */
  screenToWorld(model, clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    const u = (clientX - r.left) / r.width;
    const v = (clientY - r.top) / r.height;
    return [u * model.size - model.size / 2, v * model.size - model.size / 2];
  }

  draw(model) {
    const { ctx, canvas } = this;
    const n = model.nodes;
    this.tex.width = n;
    this.tex.height = n;
    const tctx = this.tex.getContext('2d');
    const img = tctx.createImageData(n, n);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const h = heightAtNode(model, i, j);
        const [r, g, b] = heightColor(h);
        // relevo sombreado (luz vinda do noroeste)
        const dx = heightAtNode(model, Math.min(n - 1, i + 1), j) - heightAtNode(model, Math.max(0, i - 1), j);
        const dz = heightAtNode(model, i, Math.min(n - 1, j + 1)) - heightAtNode(model, i, Math.max(0, j - 1));
        const shade = h >= 0.5 ? Math.max(0.65, Math.min(1.3, 1 - (dx + dz) * 0.09)) : 1;
        const o = (j * n + i) * 4;
        img.data[o] = Math.min(255, r * shade);
        img.data[o + 1] = Math.min(255, g * shade);
        img.data[o + 2] = Math.min(255, b * shade);
        img.data[o + 3] = 255;
      }
    }
    tctx.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // os nós ficam nas bordas das células: desenha de meia célula antes até meia depois
    const k = canvas.width / model.size;
    const half = model.cell / 2;
    ctx.drawImage(this.tex, 0, 0, n, n, -half * k, -half * k, canvas.width + model.cell * k, canvas.height + model.cell * k);

    if (this.showGrid) this.drawGrid(model);
    this.drawPlayable(model);
    this.drawItems(model);
    if (this.cursor) this.drawCursor(model);
  }

  drawGrid(model) {
    const { ctx } = this;
    const k = this.canvas.width / model.size;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let v = -Math.floor(model.size / 2 / 16) * 16; v <= model.size / 2; v += 16) {
      const p = (v + model.size / 2) * k;
      ctx.moveTo(p, 0); ctx.lineTo(p, this.canvas.height);
      ctx.moveTo(0, p); ctx.lineTo(this.canvas.width, p);
    }
    ctx.stroke();
    ctx.restore();
  }

  drawPlayable(model) {
    const { ctx } = this;
    const [a, b] = this.worldToScreen(model, -model.playable / 2, -model.playable / 2);
    const k = this.canvas.width / model.size;
    ctx.save();
    ctx.setLineDash([8 * this.dpr, 6 * this.dpr]);
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1.5 * this.dpr;
    ctx.strokeRect(a, b, model.playable * k, model.playable * k);
    ctx.restore();
  }

  drawItems(model) {
    const { ctx, dpr } = this;
    const k = this.canvas.width / model.size;
    const dot = (x, z, rad, fill, stroke = '#10151b') => {
      const [sx, sy] = this.worldToScreen(model, x, z);
      ctx.beginPath(); ctx.arc(sx, sy, rad * dpr, 0, Math.PI * 2);
      ctx.fillStyle = fill; ctx.fill();
      ctx.lineWidth = 1.5 * dpr; ctx.strokeStyle = stroke; ctx.stroke();
      return [sx, sy];
    };
    ctx.save();
    for (const f of model.fords) {
      const [sx, sy] = this.worldToScreen(model, f.x, f.z);
      ctx.beginPath(); ctx.arc(sx, sy, f.r * k, 0, Math.PI * 2);
      ctx.setLineDash([4 * dpr, 4 * dpr]); ctx.strokeStyle = ITEM_COLORS.ford; ctx.lineWidth = 1.5 * dpr; ctx.stroke();
    }
    ctx.setLineDash([]);
    for (const f of model.forests) {
      const [sx, sy] = this.worldToScreen(model, f.x, f.z);
      ctx.beginPath(); ctx.arc(sx, sy, f.radius * k, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(30,110,40,0.35)'; ctx.fill();
      ctx.strokeStyle = ITEM_COLORS.forest; ctx.lineWidth = 2 * dpr; ctx.stroke();
      ctx.fillStyle = '#eaffea'; ctx.font = `bold ${11 * dpr}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(f.count), sx, sy);
    }
    for (const r of model.resources) {
      const [sx, sy] = dot(r.x, r.z, 6, ITEM_COLORS[r.type]);
      ctx.fillStyle = r.type === 'oil' ? '#fff' : '#10151b'; ctx.font = `bold ${8 * dpr}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(r.type === 'gold' ? 'O' : r.type === 'stone' ? 'P' : '~', sx, sy + 0.5 * dpr);
    }
    for (const n of model.neutrals) {
      if (n.kind === 'camp') {
        const [sx, sy] = dot(n.x, n.z, 7, ITEM_COLORS.camp);
        ctx.fillStyle = '#fff'; ctx.font = `bold ${9 * dpr}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(n.guards), sx, sy + 0.5 * dpr);
      } else {
        const [sx, sy] = this.worldToScreen(model, n.x, n.z);
        ctx.beginPath(); ctx.arc(sx, sy, n.radius * k, 0, Math.PI * 2);
        ctx.setLineDash([2 * dpr, 4 * dpr]); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5 * dpr; ctx.stroke(); ctx.setLineDash([]);
        dot(n.x, n.z, 4, ITEM_COLORS.critters);
      }
    }
    model.startSlots.forEach((s, i) => {
      const [sx, sy] = dot(s.x, s.z, 10, startColor(i), '#fff');
      ctx.fillStyle = '#0b0f14'; ctx.font = `bold ${11 * dpr}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(i + 1), sx, sy + 0.5 * dpr);
    });
    ctx.restore();
  }

  drawCursor(model) {
    const { ctx, dpr } = this;
    const c = this.cursor;
    const [sx, sy] = this.worldToScreen(model, c.x, c.z);
    const k = this.canvas.width / model.size;
    ctx.save();
    ctx.beginPath();
    ctx.arc(sx, sy, Math.max(3 * dpr, (c.radius || 0.8) * k), 0, Math.PI * 2);
    ctx.strokeStyle = c.color || '#fff';
    ctx.lineWidth = 2 * dpr;
    ctx.stroke();
    if (c.radius > 0) {
      ctx.beginPath(); ctx.arc(sx, sy, Math.max(1, c.radius * k * 0.5), 0, Math.PI * 2);
      ctx.lineWidth = 1 * dpr; ctx.globalAlpha = 0.5; ctx.stroke();
    }
    ctx.restore();
  }
}
