import * as THREE from 'three';
import { createScaledCanvas as createCanvas, createBumpCanvas, toTexture as makeTexture } from '../textureQuality.js';

/**
 * Procedural Hand-Painted Stylized PBR Texture Generator for Human Forge (Forja dos Humanos)
 * Faithfully matches forjaHumanos.png:
 * - Rustic chiseled dark charcoal / slate stone blocks with mortar lines and soot stains.
 * - Forged dark iron / steel for anvil, tongs, hammer and chimney collar.
 * - Weathered oak wood for the anvil foundation block, tool handles and stump.
 * - Incandescent molten coal fire bed and glowing iron with emissive maps.
 */

const textureCache = new Map();

function toTexture(canvas, isSRGB = true, repeatX = 1, repeatY = 1) {
  if (repeatX > 1 || repeatY > 1) {
    return makeTexture(canvas, isSRGB, { wrapS: THREE.RepeatWrapping, repeatX, repeatY });
  }
  return makeTexture(canvas, isSRGB, { wrapS: THREE.ClampToEdgeWrapping });
}

/**
 * 1. Dark Chiseled Stone Masonry for Furnace & Chimney (matches forjaHumanos.png)
 */
export function getHumanForgeStoneTextures() {
  if (textureCache.has('human_forge_stone')) {
    return textureCache.get('human_forge_stone');
  }

  const { canvas: diffCanvas, ctx: diffCtx, width: W, height: H } = createCanvas(512, 512);
  const { canvas: roughCanvas, ctx: roughCtx } = createCanvas(512, 512);
  const { canvas: bumpCanvas, ctx: bumpCtx } = createBumpCanvas(512, 512);

  // Base stone tone: rich dark slate charcoal with warm undertones
  diffCtx.fillStyle = '#2f343b';
  diffCtx.fillRect(0, 0, W, H);
  roughCtx.fillStyle = '#b0b0b0';
  roughCtx.fillRect(0, 0, W, H);
  bumpCtx.fillStyle = '#808080';
  bumpCtx.fillRect(0, 0, W, H);

  // Draw rustic stone blocks
  const rows = 12;
  const rowH = H / rows;

  for (let r = 0; r < rows; r++) {
    const y = r * rowH;
    const isOdd = r % 2 === 1;
    const cols = isOdd ? 6 : 5;
    const colW = W / cols;

    for (let c = 0; c < cols; c++) {
      const x = c * colW;
      const pad = 6;
      const bx = x + pad;
      const by = y + pad;
      const bw = colW - pad * 2;
      const bh = rowH - pad * 2;

      // Varied stone hue: charcoal, slate gray, subtle blue-grey and warm brown-gray
      const hueShift = Math.sin(r * 4.3 + c * 2.7);
      const lightness = 22 + Math.floor(hueShift * 6);
      const stoneColor = `hsl(215, 12%, ${lightness}%)`;

      // Stone block fill with subtle top-to-bottom gradient
      const grad = diffCtx.createLinearGradient(bx, by, bx, by + bh);
      grad.addColorStop(0, `hsl(215, 10%, ${lightness + 5}%)`);
      grad.addColorStop(0.7, stoneColor);
      grad.addColorStop(1, `hsl(215, 12%, ${lightness - 4}%)`);

      diffCtx.fillStyle = grad;
      diffCtx.beginPath();
      diffCtx.roundRect(bx, by, bw, bh, [4, 4, 3, 3]);
      diffCtx.fill();

      // Stone surface noise / chisel flecks
      for (let n = 0; n < 35; n++) {
        const nx = bx + Math.random() * bw;
        const ny = by + Math.random() * bh;
        const nr = 1.5 + Math.random() * 3.5;
        const isLight = Math.random() > 0.5;
        diffCtx.fillStyle = isLight ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.2)';
        diffCtx.beginPath();
        diffCtx.arc(nx, ny, nr, 0, Math.PI * 2);
        diffCtx.fill();
      }

      // Chiseled stone edge highlights (top and left bevel)
      diffCtx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
      diffCtx.lineWidth = 2.5;
      diffCtx.beginPath();
      diffCtx.moveTo(bx + 2, by + bh - 2);
      diffCtx.lineTo(bx + 2, by + 2);
      diffCtx.lineTo(bx + bw - 2, by + 2);
      diffCtx.stroke();

      // Deep recessed shadow (bottom and right bevel)
      diffCtx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
      diffCtx.lineWidth = 3;
      diffCtx.beginPath();
      diffCtx.moveTo(bx + bw - 2, by + 2);
      diffCtx.lineTo(bx + bw - 2, by + bh - 2);
      diffCtx.lineTo(bx + 2, by + bh - 2);
      diffCtx.stroke();

      // Roughness & bump map representation
      roughCtx.fillStyle = `rgb(${160 + Math.floor(Math.random() * 40)}, ${160 + Math.floor(Math.random() * 40)}, ${160 + Math.floor(Math.random() * 40)})`;
      roughCtx.fillRect(bx, by, bw, bh);

      bumpCtx.fillStyle = `rgb(${140 + Math.floor(hueShift * 30)}, ${140 + Math.floor(hueShift * 30)}, ${140 + Math.floor(hueShift * 30)})`;
      bumpCtx.fillRect(bx, by, bw, bh);
    }
  }

  // Soot and smoke gradient on top third (simulating chimney exhaust soot)
  const sootGrad = diffCtx.createLinearGradient(0, 0, 0, H * 0.45);
  sootGrad.addColorStop(0, 'rgba(18, 18, 20, 0.7)');
  sootGrad.addColorStop(0.6, 'rgba(25, 25, 28, 0.35)');
  sootGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  diffCtx.fillStyle = sootGrad;
  diffCtx.fillRect(0, 0, W, H * 0.45);

  const stoneTextures = {
    map: toTexture(diffCanvas, true, 2, 2),
    roughnessMap: toTexture(roughCanvas, false, 2, 2),
    bumpMap: toTexture(bumpCanvas, false, 2, 2)
  };

  textureCache.set('human_forge_stone', stoneTextures);
  return stoneTextures;
}

/**
 * 2. Weathered Oak Timber for Anvil Base and Stump
 */
export function getHumanForgeWoodTextures() {
  if (textureCache.has('human_forge_wood')) {
    return textureCache.get('human_forge_wood');
  }

  const { canvas: diffCanvas, ctx: diffCtx, width: W, height: H } = createCanvas(512, 512);
  const { canvas: roughCanvas, ctx: roughCtx } = createCanvas(512, 512);
  const { canvas: bumpCanvas, ctx: bumpCtx } = createBumpCanvas(512, 512);

  // Dark weathered oak brown base
  diffCtx.fillStyle = '#422817';
  diffCtx.fillRect(0, 0, W, H);
  roughCtx.fillStyle = '#cccccc';
  roughCtx.fillRect(0, 0, W, H);
  bumpCtx.fillStyle = '#808080';
  bumpCtx.fillRect(0, 0, W, H);

  // Longitudinal grain lines
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * W;
    const w = 4 + Math.random() * 18;
    const isDark = Math.random() > 0.4;
    diffCtx.fillStyle = isDark ? 'rgba(30, 15, 8, 0.45)' : 'rgba(100, 65, 38, 0.35)';
    diffCtx.fillRect(x, 0, w, H);

    bumpCtx.fillStyle = isDark ? 'rgb(60, 60, 60)' : 'rgb(160, 160, 160)';
    bumpCtx.fillRect(x, 0, w, H);
  }

  // Tree growth rings on bottom quadrant (for log stump ends)
  const cx = W * 0.5;
  const cy = H * 0.75;
  for (let r = 10; r < 340; r += 14) {
    diffCtx.strokeStyle = 'rgba(25, 12, 5, 0.55)';
    diffCtx.lineWidth = 3.5 + Math.random() * 2;
    diffCtx.beginPath();
    diffCtx.arc(cx, cy, r, 0, Math.PI * 2);
    diffCtx.stroke();
  }

  const woodTextures = {
    map: toTexture(diffCanvas, true, 1, 1),
    roughnessMap: toTexture(roughCanvas, false, 1, 1),
    bumpMap: toTexture(bumpCanvas, false, 1, 1)
  };

  textureCache.set('human_forge_wood', woodTextures);
  return woodTextures;
}

/**
 * 3. Forged Steel & Cast Iron for Anvil, Tools & Chimney Rim
 */
export function getHumanForgeIronTextures() {
  if (textureCache.has('human_forge_iron')) {
    return textureCache.get('human_forge_iron');
  }

  const { canvas: diffCanvas, ctx: diffCtx, width: W, height: H } = createCanvas(512, 512);
  const { canvas: roughCanvas, ctx: roughCtx } = createCanvas(512, 512);
  const { canvas: metalCanvas, ctx: metalCtx } = createCanvas(512, 512);

  // Gunmetal / forged dark iron
  diffCtx.fillStyle = '#373d47';
  diffCtx.fillRect(0, 0, W, H);
  roughCtx.fillStyle = '#555555'; // smooth metal
  roughCtx.fillRect(0, 0, W, H);
  metalCtx.fillStyle = '#e6e6e6'; // highly metallic
  metalCtx.fillRect(0, 0, W, H);

  // Hammered metal texture / bevel flecks
  for (let i = 0; i < 120; i++) {
    const x = Math.random() * W;
    const y = Math.random() * H;
    const r = 2 + Math.random() * 8;
    const isBright = Math.random() > 0.45;
    diffCtx.fillStyle = isBright ? 'rgba(200, 215, 235, 0.12)' : 'rgba(10, 15, 20, 0.35)';
    diffCtx.beginPath();
    diffCtx.arc(x, y, r, 0, Math.PI * 2);
    diffCtx.fill();
  }

  const ironTextures = {
    map: toTexture(diffCanvas, true, 1, 1),
    roughnessMap: toTexture(roughCanvas, false, 1, 1),
    metalnessMap: toTexture(metalCanvas, false, 1, 1)
  };

  textureCache.set('human_forge_iron', ironTextures);
  return ironTextures;
}

/**
 * 4. Blazing Molten Coals and Embers for Furnace Hearth and Anvil
 */
export function getHumanForgeFireTextures() {
  if (textureCache.has('human_forge_fire')) {
    return textureCache.get('human_forge_fire');
  }

  const { canvas: diffCanvas, ctx: diffCtx, width: W, height: H } = createCanvas(512, 512);
  const { canvas: emissiveCanvas, ctx: emissiveCtx } = createCanvas(512, 512);

  // Fiery crimson base
  diffCtx.fillStyle = '#ff3300';
  diffCtx.fillRect(0, 0, W, H);
  emissiveCtx.fillStyle = '#ff2200';
  emissiveCtx.fillRect(0, 0, W, H);

  // Glowing hot coal embers
  for (let i = 0; i < 60; i++) {
    const cx = Math.random() * W;
    const cy = Math.random() * H;
    const r = 15 + Math.random() * 45;

    const radGrad = diffCtx.createRadialGradient(cx, cy, 0, cx, cy, r);
    radGrad.addColorStop(0, '#ffff88'); // white-yellow heat center
    radGrad.addColorStop(0.35, '#ff8800'); // blazing orange
    radGrad.addColorStop(0.7, '#cc2200'); // red flame
    radGrad.addColorStop(1, '#330800'); // charred black crust

    diffCtx.fillStyle = radGrad;
    diffCtx.beginPath();
    diffCtx.arc(cx, cy, r, 0, Math.PI * 2);
    diffCtx.fill();

    const emGrad = emissiveCtx.createRadialGradient(cx, cy, 0, cx, cy, r);
    emGrad.addColorStop(0, '#ffffcc');
    emGrad.addColorStop(0.4, '#ff9900');
    emGrad.addColorStop(0.8, '#ff3300');
    emGrad.addColorStop(1, '#000000');
    emissiveCtx.fillStyle = emGrad;
    emissiveCtx.beginPath();
    emissiveCtx.arc(cx, cy, r, 0, Math.PI * 2);
    emissiveCtx.fill();
  }

  const fireTextures = {
    map: toTexture(diffCanvas, true, 1, 1),
    emissiveMap: toTexture(emissiveCanvas, false, 1, 1)
  };

  textureCache.set('human_forge_fire', fireTextures);
  return fireTextures;
}
