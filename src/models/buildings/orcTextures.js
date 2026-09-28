import * as THREE from 'three';
import { createScaledCanvas as createCanvas, createBumpCanvas, toTexture as makeTexture } from '../textureQuality.js';

/**
 * Procedural Hand-Painted Stylized PBR Texture Generator for the Orc Faction
 * Faithfully matches the visual style and quality of modeloorcs.png:
 * - Chunky rustic dark ironwood timber with rough bark and annual rings.
 * - Aged mammoth ivory and curved bone tusks.
 * - Hammered dark iron plating with bright silver edge wear and heavy rivets.
 * - Stitched animal fur pelts and fleece for burrows/roofs.
 * - Tattered crimson war canvas with black painted Horde insignias.
 * - Volcanic charred basalt stone masonry for forges.
 * - Glowing hearth fire windows and molten furnace coals.
 * - Muddy ground with glossy water puddles and stylized war pigs.
 */

const textureCache = new Map();

function toTexture(canvas, isSRGB = true, isRepeat = true) {
  return makeTexture(canvas, isSRGB, { wrapS: isRepeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping });
}

function drawRivet(ctx, cx, cy, radius = 10, isDarkIron = true) {
  if (!ctx) return;
  ctx.save();
  // Drop shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.beginPath();
  ctx.arc(cx + 2, cy + 3, radius, 0, Math.PI * 2);
  ctx.fill();

  // Outer bevel
  const ringGrad = ctx.createLinearGradient(cx - radius, cy - radius, cx + radius, cy + radius);
  if (isDarkIron) {
    ringGrad.addColorStop(0, '#71717a');
    ringGrad.addColorStop(0.3, '#3f3f46');
    ringGrad.addColorStop(0.7, '#27272a');
    ringGrad.addColorStop(1, '#09090b');
  } else {
    ringGrad.addColorStop(0, '#fde68a');
    ringGrad.addColorStop(0.5, '#d97706');
    ringGrad.addColorStop(1, '#78350f');
  }
  ctx.fillStyle = ringGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();

  // Highlight dome
  const domeGrad = ctx.createRadialGradient(cx - radius * 0.35, cy - radius * 0.35, 1, cx, cy, radius * 0.85);
  domeGrad.addColorStop(0, '#e4e4e7');
  domeGrad.addColorStop(0.6, '#27272a');
  domeGrad.addColorStop(1, '#09090b');
  ctx.fillStyle = domeGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// 1. ORC DARK TIMBER LOG BARK
export function getOrcDarkLogBarkTextures() {
  const key = 'orc_dark_log_bark';
  if (textureCache.has(key)) return textureCache.get(key);

  const albedo = createCanvas(2048, 2048);
  const rough = createCanvas(2048, 2048);
  const metal = createCanvas(2048, 2048);
  const bump = createBumpCanvas(2048, 2048);
  const actx = albedo.ctx;
  const rctx = rough.ctx;
  const mctx = metal.ctx;
  const bctx = bump.ctx;

  if (actx) {
    // Rich warm cedar/chestnut ironwood timber base
    actx.fillStyle = '#4a2f1e';
    actx.fillRect(0, 0, 2048, 2048);

    // Rough longitudinal bark ridges with warm amber/chestnut gradients
    for (let x = 0; x < 2048; x += 32) {
      const w = 24 + Math.sin(x * 0.05) * 8;
      const barkGrad = actx.createLinearGradient(x, 0, x + w, 0);
      barkGrad.addColorStop(0, '#2d1b11');
      barkGrad.addColorStop(0.3, '#5c3924');
      barkGrad.addColorStop(0.6, '#7a4d31');
      barkGrad.addColorStop(0.85, '#50321f');
      barkGrad.addColorStop(1, '#28170e');
      actx.fillStyle = barkGrad;
      actx.fillRect(x, 0, w, 2048);
    }

    // Weathered fissures, knots, and knife gouges
    for (let i = 0; i < 90; i++) {
      const kx = (i * 127 + 53) % 2048;
      const ky = (i * 269 + 89) % 2048;
      actx.fillStyle = '#1c100a';
      actx.beginPath();
      actx.ellipse(kx, ky, 18, 55, 0.08, 0, Math.PI * 2);
      actx.fill();

      // Knot ring highlight
      actx.strokeStyle = '#9c6442';
      actx.lineWidth = 5;
      actx.beginPath();
      actx.ellipse(kx, ky, 28, 75, 0.08, 0, Math.PI * 2);
      actx.stroke();
    }

    // Subtle moss/patina stains along furrows
    for (let j = 0; j < 40; j++) {
      const mx = (j * 331) % 2048;
      const my = (j * 409) % 2048;
      const mossGrad = actx.createRadialGradient(mx, my, 4, mx, my, 60);
      mossGrad.addColorStop(0, 'rgba(78, 102, 52, 0.45)');
      mossGrad.addColorStop(1, 'rgba(78, 102, 52, 0.0)');
      actx.fillStyle = mossGrad;
      actx.beginPath();
      actx.arc(mx, my, 60, 0, Math.PI * 2);
      actx.fill();
    }
  }


  if (rctx) {
    rctx.fillStyle = '#b8b8b8'; // Wood roughness ~0.72
    rctx.fillRect(0, 0, 2048, 2048);
    // Deep crevices are rougher
    rctx.fillStyle = '#e5e5e5';
    for (let x = 0; x < 2048; x += 64) {
      rctx.fillRect(x, 0, 8, 2048);
    }
  }

  if (mctx) {
    mctx.fillStyle = '#000000'; // Pure dielectric non-metal
    mctx.fillRect(0, 0, 2048, 2048);
  }

  if (bctx) {
    bctx.fillStyle = '#808080';
    bctx.fillRect(0, 0, 2048, 2048);
    bctx.fillStyle = '#404040';
    for (let x = 0; x < 2048; x += 32) {
      bctx.fillRect(x, 0, 10, 2048);
    }
    bctx.fillStyle = '#c0c0c0';
    for (let x = 16; x < 2048; x += 32) {
      bctx.fillRect(x, 0, 12, 2048);
    }
  }

  const result = {
    map: toTexture(albedo.canvas, true, true),
    roughnessMap: toTexture(rough.canvas, false, true),
    metalnessMap: toTexture(metal.canvas, false, true),
    bumpMap: toTexture(bump.canvas, false, true)
  };
  textureCache.set(key, result);
  return result;
}

// 2. ORC LOG END-GRAIN
export function getOrcLogEndTextures() {
  const key = 'orc_log_end';
  if (textureCache.has(key)) return textureCache.get(key);

  const albedo = createCanvas(1024, 1024);
  const rough = createCanvas(1024, 1024);
  const bump = createBumpCanvas(1024, 1024);
  const actx = albedo.ctx;

  if (actx) {
    const cx = 512, cy = 512;
    // Outer bark rim
    actx.fillStyle = '#2e1b12';
    actx.beginPath();
    actx.arc(cx, cy, 490, 0, Math.PI * 2);
    actx.fill();

    // Wood core gradient with warm caramel/chestnut tones
    const coreGrad = actx.createRadialGradient(cx, cy, 20, cx, cy, 470);
    coreGrad.addColorStop(0, '#8c5936');
    coreGrad.addColorStop(0.4, '#734729');
    coreGrad.addColorStop(0.75, '#5a351d');
    coreGrad.addColorStop(1, '#3b2212');
    actx.fillStyle = coreGrad;
    actx.beginPath();
    actx.arc(cx, cy, 470, 0, Math.PI * 2);
    actx.fill();

    // Concentric growth rings
    for (let r = 35; r < 460; r += 16 + (r % 7)) {
      actx.strokeStyle = (r % 32 === 0) ? '#361e0f' : '#aa7044';
      actx.lineWidth = (r % 32 === 0) ? 4.5 : 2.4;
      actx.beginPath();
      actx.arc(cx, cy, r, 0, Math.PI * 2);
      actx.stroke();
    }

    // Radial drying check cracks
    actx.strokeStyle = '#201209';
    actx.lineWidth = 6;
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 3.5) {
      actx.beginPath();
      actx.moveTo(cx, cy);
      const rCrack = 280 + Math.sin(a * 4) * 120;
      actx.lineTo(cx + Math.cos(a) * rCrack, cy + Math.sin(a) * rCrack);
      actx.stroke();
    }
  }


  if (rough.ctx) {
    rough.ctx.fillStyle = '#c4c4c4';
    rough.ctx.fillRect(0, 0, 1024, 1024);
  }

  if (bump.ctx) {
    bump.ctx.fillStyle = '#808080';
    bump.ctx.fillRect(0, 0, 1024, 1024);
    bump.ctx.fillStyle = '#505050';
    bump.ctx.beginPath();
    bump.ctx.arc(512, 512, 480, 0, Math.PI * 2);
    bump.ctx.stroke();
  }

  const result = {
    map: toTexture(albedo.canvas, true, false),
    roughnessMap: toTexture(rough.canvas, false, false),
    metalnessMap: null,
    bumpMap: toTexture(bump.canvas, false, false)
  };
  textureCache.set(key, result);
  return result;
}

// 3. ORC SPLIT-LOG ROOF PLANKS
export function getOrcSplitRoofTextures() {
  const key = 'orc_split_roof';
  if (textureCache.has(key)) return textureCache.get(key);

  const albedo = createCanvas(2048, 2048);
  const rough = createCanvas(2048, 2048);
  const bump = createBumpCanvas(2048, 2048);
  const actx = albedo.ctx;

  if (actx) {
    actx.fillStyle = '#4a2f1e';
    actx.fillRect(0, 0, 2048, 2048);

    // Horizontal split-log shakes/planks with drop shadows
    const rowH = 140;
    for (let y = 0; y < 2048; y += rowH) {
      // Cast shadow under overlapping edge
      actx.fillStyle = 'rgba(0, 0, 0, 0.65)';
      actx.fillRect(0, y + rowH - 18, 2048, 20);

      // Staggered vertical planks with warm cedar tones
      const xOff = (y / rowH) % 2 === 0 ? 0 : 80;
      for (let x = xOff; x < 2048 + 160; x += 160) {
        const pw = 152;
        const plankGrad = actx.createLinearGradient(x, y, x + pw, y + rowH);
        const toneVar = ((x * 13 + y * 7) % 36) - 18;
        const r = Math.min(255, Math.max(0, 115 + toneVar));
        const g = Math.min(255, Math.max(0, 78 + Math.floor(toneVar * 0.7)));
        const b = Math.min(255, Math.max(0, 50 + Math.floor(toneVar * 0.4)));

        plankGrad.addColorStop(0, `rgb(${r - 20}, ${g - 14}, ${b - 10})`);
        plankGrad.addColorStop(0.4, `rgb(${r + 28}, ${g + 20}, ${b + 14})`);
        plankGrad.addColorStop(0.85, `rgb(${r}, ${g}, ${b})`);
        plankGrad.addColorStop(1, `rgb(${r - 25}, ${g - 18}, ${b - 12})`);

        actx.fillStyle = plankGrad;
        actx.fillRect(x, y, pw, rowH - 6);

        // Wood grain streaks
        actx.strokeStyle = 'rgba(40, 20, 10, 0.45)';
        actx.lineWidth = 3;
        actx.beginPath();
        actx.moveTo(x + 25, y);
        actx.lineTo(x + 30, y + rowH);
        actx.moveTo(x + 85, y);
        actx.lineTo(x + 80, y + rowH);
        actx.stroke();

        // Forged iron nail heads
        drawRivet(actx, x + 20, y + 25, 7, true);
        drawRivet(actx, x + pw - 20, y + 25, 7, true);
      }
    }
  }


  if (rough.ctx) {
    rough.ctx.fillStyle = '#b0b0b0';
    rough.ctx.fillRect(0, 0, 2048, 2048);
  }

  if (bump.ctx) {
    bump.ctx.fillStyle = '#808080';
    bump.ctx.fillRect(0, 0, 2048, 2048);
    for (let y = 140; y < 2048; y += 140) {
      bump.ctx.fillStyle = '#202020';
      bump.ctx.fillRect(0, y - 8, 2048, 12);
      bump.ctx.fillStyle = '#e0e0e0';
      bump.ctx.fillRect(0, y + 4, 2048, 8);
    }
  }

  const result = {
    map: toTexture(albedo.canvas, true, true),
    roughnessMap: toTexture(rough.canvas, false, true),
    metalnessMap: null,
    bumpMap: toTexture(bump.canvas, false, true)
  };
  textureCache.set(key, result);
  return result;
}

// 4. ORC ANIMAL FUR & FLEECE PELTS (Burrow/Toca Roof)
export function getOrcAnimalFurTextures() {
  const key = 'orc_animal_fur';
  if (textureCache.has(key)) return textureCache.get(key);

  const albedo = createCanvas(2048, 2048);
  const rough = createCanvas(2048, 2048);
  const bump = createBumpCanvas(2048, 2048);
  const actx = albedo.ctx;

  if (actx) {
    // Patchwork base: alternating warm brown wolf pelt and creamy sheep fleece
    actx.fillStyle = '#5c3a24';
    actx.fillRect(0, 0, 2048, 2048);

    // Large irregular fur pelt patches with high contrast
    const patches = [
      { x: 0, y: 0, w: 900, h: 800, c1: '#e8dcce', c2: '#fcf6ec', furColor: '#c4b29c' }, // Luminous cream fleece
      { x: 850, y: 0, w: 1200, h: 950, c1: '#543725', c2: '#785038', furColor: '#3c2417' }, // Rich brown wolf fur
      { x: 0, y: 750, w: 1100, h: 1300, c1: '#6e4830', c2: '#966645', furColor: '#4d2e1c' }, // Warm tawny fur
      { x: 1050, y: 900, w: 1000, h: 1150, c1: '#f0e5d5', c2: '#ffffff', furColor: '#cdbfa9' } // Bright cream fleece
    ];

    patches.forEach(p => {
      const pgrad = actx.createRadialGradient(p.x + p.w / 2, p.y + p.h / 2, 40, p.x + p.w / 2, p.y + p.h / 2, p.w * 0.6);
      pgrad.addColorStop(0, p.c2);
      pgrad.addColorStop(0.7, p.c1);
      pgrad.addColorStop(1, 'rgba(55, 35, 20, 0.9)');
      actx.fillStyle = pgrad;
      actx.fillRect(p.x, p.y, p.w, p.h);


      // Fur tuft strokes
      actx.strokeStyle = p.furColor;
      actx.lineWidth = 3;
      for (let f = 0; f < 300; f++) {
        const fx = p.x + (f * 47) % p.w;
        const fy = p.y + (f * 89) % p.h;
        actx.beginPath();
        actx.moveTo(fx, fy);
        actx.lineTo(fx + 12, fy + 22);
        actx.stroke();
      }
    });

    // Heavy dark rawhide cross-stitch seams connecting pelts
    const seams = [
      { x1: 900, y1: 0, x2: 900, y2: 2048 },
      { x1: 0, y1: 800, x2: 2048, y2: 800 }
    ];

    seams.forEach(s => {
      actx.strokeStyle = '#1a0e08';
      actx.lineWidth = 14;
      actx.beginPath();
      actx.moveTo(s.x1, s.y1);
      actx.lineTo(s.x2, s.y2);
      actx.stroke();

      // Cross stitches
      actx.strokeStyle = '#8a6542';
      actx.lineWidth = 6;
      if (s.x1 === s.x2) {
        for (let y = 20; y < 2048; y += 40) {
          actx.beginPath();
          actx.moveTo(s.x1 - 16, y - 10);
          actx.lineTo(s.x1 + 16, y + 10);
          actx.moveTo(s.x1 - 16, y + 10);
          actx.lineTo(s.x1 + 16, y - 10);
          actx.stroke();
        }
      } else {
        for (let x = 20; x < 2048; x += 40) {
          actx.beginPath();
          actx.moveTo(x - 10, s.y1 - 16);
          actx.lineTo(x + 10, s.y1 + 16);
          actx.moveTo(x - 10, s.y1 + 16);
          actx.lineTo(x + 10, s.y1 - 16);
          actx.stroke();
        }
      }
    });
  }

  if (rough.ctx) {
    rough.ctx.fillStyle = '#dedede'; // Fur is diffuse/matte
    rough.ctx.fillRect(0, 0, 2048, 2048);
  }

  if (bump.ctx) {
    bump.ctx.fillStyle = '#808080';
    bump.ctx.fillRect(0, 0, 2048, 2048);
    bump.ctx.fillStyle = '#404040';
    bump.ctx.fillRect(890, 0, 20, 2048);
    bump.ctx.fillRect(0, 790, 2048, 20);
  }

  const result = {
    map: toTexture(albedo.canvas, true, true),
    roughnessMap: toTexture(rough.canvas, false, true),
    metalnessMap: null,
    bumpMap: toTexture(bump.canvas, false, true)
  };
  textureCache.set(key, result);
  return result;
}

// 5. ORC HAMMERED SHADOW IRON & SPIKES
export function getOrcSpikedIronTextures() {
  const key = 'orc_spiked_iron';
  if (textureCache.has(key)) return textureCache.get(key);

  const albedo = createCanvas(2048, 2048);
  const rough = createCanvas(2048, 2048);
  const metal = createCanvas(2048, 2048);
  const bump = createBumpCanvas(2048, 2048);
  const actx = albedo.ctx;

  if (actx) {
    // Medium-bright slate gunmetal iron base
    actx.fillStyle = '#3d444f';
    actx.fillRect(0, 0, 2048, 2048);

    // Hammered texture pitting with higher specular contrast
    for (let i = 0; i < 400; i++) {
      const px = (i * 191) % 2048;
      const py = (i * 313) % 2048;
      const r = 8 + (i % 12);
      const pitGrad = actx.createRadialGradient(px, py, 2, px, py, r);
      pitGrad.addColorStop(0, '#1f242c');
      pitGrad.addColorStop(0.6, '#464f5c');
      pitGrad.addColorStop(1, '#626d7e');
      actx.fillStyle = pitGrad;
      actx.beginPath();
      actx.arc(px, py, r, 0, Math.PI * 2);
      actx.fill();
    }

    // Heavy iron plate panels with shiny scratched bevel borders
    const step = 512;
    for (let x = 0; x < 2048; x += step) {
      for (let y = 0; y < 2048; y += step) {
        // Outer dark recessed seam
        actx.strokeStyle = '#16191f';
        actx.lineWidth = 14;
        actx.strokeRect(x + 4, y + 4, step - 8, step - 8);

        // Shiny silver-steel worn edge highlight
        actx.strokeStyle = '#cbd5e1';
        actx.lineWidth = 6;
        actx.strokeRect(x + 12, y + 12, step - 24, step - 24);

        // Heavy corner rivets
        drawRivet(actx, x + 40, y + 40, 16, true);
        drawRivet(actx, x + step - 40, y + 40, 16, true);
        drawRivet(actx, x + 40, y + step - 40, 16, true);
        drawRivet(actx, x + step - 40, y + step - 40, 16, true);
        drawRivet(actx, x + step / 2, y + 40, 14, true);
        drawRivet(actx, x + step / 2, y + step - 40, 14, true);
      }
    }

    // Battle gouges & scratch marks exposing raw bright steel
    actx.strokeStyle = '#f1f5f9';
    actx.lineWidth = 3.5;
    for (let s = 0; s < 60; s++) {
      const sx = (s * 257) % 2048;
      const sy = (s * 349) % 2048;
      actx.beginPath();
      actx.moveTo(sx, sy);
      actx.lineTo(sx + 35, sy + 18);
      actx.stroke();
    }
  }


  if (rough.ctx) {
    rough.ctx.fillStyle = '#555555'; // Roughness ~0.35
    rough.ctx.fillRect(0, 0, 2048, 2048);
  }

  if (metal.ctx) {
    metal.ctx.fillStyle = '#e5e5e5'; // High metalness ~0.9
    metal.ctx.fillRect(0, 0, 2048, 2048);
  }

  if (bump.ctx) {
    bump.ctx.fillStyle = '#808080';
    bump.ctx.fillRect(0, 0, 2048, 2048);
    for (let x = 0; x < 2048; x += 512) {
      bump.ctx.fillStyle = '#202020';
      bump.ctx.fillRect(x, 0, 14, 2048);
      bump.ctx.fillRect(0, x, 2048, 14);
    }
  }

  const result = {
    map: toTexture(albedo.canvas, true, true),
    roughnessMap: toTexture(rough.canvas, false, true),
    metalnessMap: toTexture(metal.canvas, false, true),
    bumpMap: toTexture(bump.canvas, false, true)
  };
  textureCache.set(key, result);
  return result;
}

// 6. AGED BONE & MAMMOTH TUSKS
export function getOrcBoneTuskTextures() {
  const key = 'orc_bone_tusk';
  if (textureCache.has(key)) return textureCache.get(key);

  const albedo = createCanvas(1024, 1024);
  const rough = createCanvas(1024, 1024);
  const bump = createBumpCanvas(1024, 1024);
  const actx = albedo.ctx;

  if (actx) {
    // Luminous polished ivory bone base
    actx.fillStyle = '#faf0de';
    actx.fillRect(0, 0, 1024, 1024);

    // Longitudinal organic growth grain
    for (let y = 0; y < 1024; y += 12) {
      actx.strokeStyle = (y % 36 === 0) ? '#e6d2b3' : '#f0e2ca';
      actx.lineWidth = 2.5;
      actx.beginPath();
      actx.moveTo(0, y);
      actx.lineTo(1024, y + Math.sin(y * 0.04) * 8);
      actx.stroke();
    }

    // Weathered root stains & fissures
    for (let i = 0; i < 25; i++) {
      const x = (i * 137) % 1024;
      const y = (i * 241) % 1024;
      const stain = actx.createRadialGradient(x, y, 4, x, y, 55);
      stain.addColorStop(0, 'rgba(140, 110, 70, 0.35)');
      stain.addColorStop(1, 'rgba(140, 110, 70, 0.0)');
      actx.fillStyle = stain;
      actx.beginPath();
      actx.arc(x, y, 55, 0, Math.PI * 2);
      actx.fill();
    }
  }

  if (rough.ctx) {
    rough.ctx.fillStyle = '#7a7a7a'; // Smooth polished bone ~0.48
    rough.ctx.fillRect(0, 0, 1024, 1024);
  }

  if (bump.ctx) {
    bump.ctx.fillStyle = '#808080';
    bump.ctx.fillRect(0, 0, 1024, 1024);
  }

  const result = {
    map: toTexture(albedo.canvas, true, true),
    roughnessMap: toTexture(rough.canvas, false, true),
    metalnessMap: null,
    bumpMap: toTexture(bump.canvas, false, true)
  };
  textureCache.set(key, result);
  return result;
}

// 7. TATTERED CRIMSON HORDE WAR BANNERS
export function getOrcHordeBannerTextures() {
  const key = 'orc_horde_banner';
  if (textureCache.has(key)) return textureCache.get(key);

  const albedo = createCanvas(1024, 2048);
  const rough = createCanvas(1024, 2048);
  const bump = createBumpCanvas(1024, 2048);
  const actx = albedo.ctx;

  if (actx) {
    // Vibrant iconic crimson war canvas with rich saturation
    const bgGrad = actx.createLinearGradient(0, 0, 1024, 2048);
    bgGrad.addColorStop(0, '#b91c1c');
    bgGrad.addColorStop(0.3, '#dc2626');
    bgGrad.addColorStop(0.7, '#ef4444');
    bgGrad.addColorStop(1, '#991b1b');
    actx.fillStyle = bgGrad;
    actx.fillRect(0, 0, 1024, 2048);


    // Heavy fabric weave texture
    actx.fillStyle = 'rgba(0, 0, 0, 0.15)';
    for (let y = 0; y < 2048; y += 8) {
      actx.fillRect(0, y, 1024, 2);
    }
    for (let x = 0; x < 1024; x += 8) {
      actx.fillRect(x, 0, 2, 2048);
    }

    // Black Horde Wolf / Axe Emblem painted in center
    const cx = 512, cy = 900;
    actx.fillStyle = '#120707';
    actx.beginPath();
    // Central crest circle
    actx.arc(cx, cy, 240, 0, Math.PI * 2);
    actx.fill();

    // Spiked outer fangs on emblem
    for (let ang = 0; ang < Math.PI * 2; ang += Math.PI / 4) {
      const sx = cx + Math.cos(ang) * 230;
      const sy = cy + Math.sin(ang) * 230;
      const tx = cx + Math.cos(ang) * 310;
      const ty = cy + Math.sin(ang) * 310;
      actx.beginPath();
      actx.moveTo(sx - 20, sy - 20);
      actx.lineTo(tx, ty);
      actx.lineTo(sx + 20, sy + 20);
      actx.fill();
    }

    // Crossed battleaxe blades in emblem center
    actx.fillStyle = '#b91c1c';
    actx.beginPath();
    actx.arc(cx, cy, 90, 0, Math.PI * 2);
    actx.fill();

    // Frayed, torn ragged hem at the bottom
    actx.fillStyle = '#0f0505';
    for (let rx = 0; rx < 1024; rx += 45) {
      actx.beginPath();
      actx.moveTo(rx, 2048);
      actx.lineTo(rx + 22, 1950 + (rx % 60));
      actx.lineTo(rx + 45, 2048);
      actx.fill();
    }
  }

  if (rough.ctx) {
    rough.ctx.fillStyle = '#c8c8c8'; // Matte canvas
    rough.ctx.fillRect(0, 0, 1024, 2048);
  }

  if (bump.ctx) {
    bump.ctx.fillStyle = '#808080';
    bump.ctx.fillRect(0, 0, 1024, 2048);
  }

  const result = {
    map: toTexture(albedo.canvas, true, false),
    roughnessMap: toTexture(rough.canvas, false, false),
    metalnessMap: null,
    bumpMap: toTexture(bump.canvas, false, false)
  };
  textureCache.set(key, result);
  return result;
}

// 8. GLOWING HEARTH WINDOW & LANTERN
export function getOrcGlowingWindowTextures() {
  const key = 'orc_glowing_window';
  if (textureCache.has(key)) return textureCache.get(key);

  const albedo = createCanvas(512, 512);
  const emissive = createCanvas(512, 512);
  const actx = albedo.ctx;
  const ectx = emissive.ctx;

  if (actx && ectx) {
    // Bright glowing golden-orange interior fire
    const fireGrad = actx.createRadialGradient(256, 256, 10, 256, 256, 240);
    fireGrad.addColorStop(0, '#fff4b8');
    fireGrad.addColorStop(0.3, '#f59e0b');
    fireGrad.addColorStop(0.7, '#ea580c');
    fireGrad.addColorStop(1, '#9a3412');
    actx.fillStyle = fireGrad;
    actx.fillRect(0, 0, 512, 512);

    ectx.fillStyle = fireGrad;
    ectx.fillRect(0, 0, 512, 512);

    // Heavy dark wooden window mullions
    actx.fillStyle = '#1c1009';
    // Border frame
    actx.fillRect(0, 0, 512, 32);
    actx.fillRect(0, 480, 512, 32);
    actx.fillRect(0, 0, 32, 512);
    actx.fillRect(480, 0, 32, 512);
    // Cross bars
    actx.fillRect(240, 0, 32, 512);
    actx.fillRect(0, 240, 512, 32);

    // Emissive mask blacks out the wooden mullions
    ectx.fillStyle = '#000000';
    ectx.fillRect(0, 0, 512, 32);
    ectx.fillRect(0, 480, 512, 32);
    ectx.fillRect(0, 0, 32, 512);
    ectx.fillRect(480, 0, 32, 512);
    ectx.fillRect(240, 0, 32, 512);
    ectx.fillRect(0, 240, 512, 32);
  }

  const result = {
    map: toTexture(albedo.canvas, true, false),
    emissiveMap: toTexture(emissive.canvas, true, false)
  };
  textureCache.set(key, result);
  return result;
}

// 9. VOLCANIC BASALT STONE (Forge)
export function getOrcBasaltStoneTextures() {
  const key = 'orc_basalt_stone';
  if (textureCache.has(key)) return textureCache.get(key);

  const albedo = createCanvas(2048, 2048);
  const rough = createCanvas(2048, 2048);
  const bump = createBumpCanvas(2048, 2048);
  const actx = albedo.ctx;

  if (actx) {
    // Volcanic slate-basalt stone base with visible ashlar blocks
    actx.fillStyle = '#3a3d46';
    actx.fillRect(0, 0, 2048, 2048);

    // Ashlar stone block grid with rough masonry joints
    const bW = 256;
    const bH = 128;
    for (let y = 0; y < 2048; y += bH) {
      const xOff = (y / bH) % 2 === 0 ? 0 : 128;
      for (let x = xOff; x < 2048 + bW; x += bW) {
        const toneVar = ((x * 7 + y * 13) % 28) - 14;
        const c = Math.min(255, Math.max(0, 84 + toneVar));
        const blockGrad = actx.createLinearGradient(x, y, x + bW, y + bH);
        blockGrad.addColorStop(0, `rgb(${c + 20}, ${c + 20}, ${c + 25})`);
        blockGrad.addColorStop(0.5, `rgb(${c}, ${c}, ${c + 5})`);
        blockGrad.addColorStop(1, `rgb(${c - 16}, ${c - 16}, ${c - 12})`);
        actx.fillStyle = blockGrad;
        actx.fillRect(x + 4, y + 4, bW - 8, bH - 8);

        // Chiseled edges
        actx.strokeStyle = '#202227';
        actx.lineWidth = 6;
        actx.strokeRect(x + 3, y + 3, bW - 6, bH - 6);
      }
    }


    // Black soot burns around chimney and hearth
    for (let s = 0; s < 50; s++) {
      const sx = (s * 277) % 2048;
      const sy = (s * 353) % 2048;
      const soot = actx.createRadialGradient(sx, sy, 5, sx, sy, 85);
      soot.addColorStop(0, 'rgba(10, 10, 12, 0.7)');
      soot.addColorStop(1, 'rgba(10, 10, 12, 0.0)');
      actx.fillStyle = soot;
      actx.beginPath();
      actx.arc(sx, sy, 85, 0, Math.PI * 2);
      actx.fill();
    }
  }

  if (rough.ctx) {
    rough.ctx.fillStyle = '#cccccc'; // Basalt stone roughness ~0.8
    rough.ctx.fillRect(0, 0, 2048, 2048);
  }

  if (bump.ctx) {
    bump.ctx.fillStyle = '#808080';
    bump.ctx.fillRect(0, 0, 2048, 2048);
    bump.ctx.fillStyle = '#303030';
    for (let y = 0; y < 2048; y += 128) {
      bump.ctx.fillRect(0, y, 2048, 6);
    }
  }

  const result = {
    map: toTexture(albedo.canvas, true, true),
    roughnessMap: toTexture(rough.canvas, false, true),
    metalnessMap: null,
    bumpMap: toTexture(bump.canvas, false, true)
  };
  textureCache.set(key, result);
  return result;
}

// 10. BLAZING MOLTEN COALS & FIRE
export function getOrcBlazingFireTextures() {
  const key = 'orc_blazing_fire';
  if (textureCache.has(key)) return textureCache.get(key);

  const albedo = createCanvas(512, 512);
  const emissive = createCanvas(512, 512);
  const actx = albedo.ctx;
  const ectx = emissive.ctx;

  if (actx && ectx) {
    const fireGrad = actx.createRadialGradient(256, 256, 20, 256, 256, 240);
    fireGrad.addColorStop(0, '#ffffff');
    fireGrad.addColorStop(0.2, '#ffea00');
    fireGrad.addColorStop(0.5, '#ff5500');
    fireGrad.addColorStop(0.85, '#cc1100');
    fireGrad.addColorStop(1, '#440500');
    actx.fillStyle = fireGrad;
    actx.fillRect(0, 0, 512, 512);

    ectx.fillStyle = fireGrad;
    ectx.fillRect(0, 0, 512, 512);

    // Glowing charcoal chunks
    actx.fillStyle = '#1c0402';
    for (let i = 0; i < 40; i++) {
      const cx = (i * 97) % 512;
      const cy = (i * 139) % 512;
      actx.beginPath();
      actx.ellipse(cx, cy, 14, 9, 0.4, 0, Math.PI * 2);
      actx.fill();
    }
  }

  const result = {
    map: toTexture(albedo.canvas, true, false),
    emissiveMap: toTexture(emissive.canvas, true, false)
  };
  textureCache.set(key, result);
  return result;
}

// 11. PIG FARM MUD & WATER PUDDLE
export function getOrcMudWaterTextures() {
  const key = 'orc_mud_water';
  if (textureCache.has(key)) return textureCache.get(key);

  const albedo = createCanvas(2048, 2048);
  const rough = createCanvas(2048, 2048);
  const bump = createBumpCanvas(2048, 2048);
  const actx = albedo.ctx;
  const rctx = rough.ctx;

  if (actx) {
    // Churned wet mud base
    actx.fillStyle = '#3a2416';
    actx.fillRect(0, 0, 2048, 2048);

    // Mud tone variations
    for (let i = 0; i < 80; i++) {
      const x = (i * 181) % 2048;
      const y = (i * 263) % 2048;
      const r = 50 + (i % 60);
      const mgrad = actx.createRadialGradient(x, y, 10, x, y, r);
      mgrad.addColorStop(0, '#2b190e');
      mgrad.addColorStop(0.7, '#482e1d');
      mgrad.addColorStop(1, 'rgba(58, 36, 22, 0)');
      actx.fillStyle = mgrad;
      actx.beginPath();
      actx.arc(x, y, r, 0, Math.PI * 2);
      actx.fill();
    }

    // Straw bedding scattered in mud
    actx.strokeStyle = '#c9a24d';
    actx.lineWidth = 3.5;
    for (let s = 0; s < 350; s++) {
      const sx = (s * 89) % 2048;
      const sy = (s * 149) % 2048;
      actx.beginPath();
      actx.moveTo(sx, sy);
      actx.lineTo(sx + 24, sy + 8);
      actx.stroke();
    }

    // Reflective water puddle center
    const px = 1024, py = 1150;
    const puddleGrad = actx.createRadialGradient(px, py, 60, px, py, 450);
    puddleGrad.addColorStop(0, '#202b33'); // Reflecting blue sky
    puddleGrad.addColorStop(0.6, '#282b26');
    puddleGrad.addColorStop(0.85, '#2e2014');
    puddleGrad.addColorStop(1, 'rgba(58, 36, 22, 0)');
    actx.fillStyle = puddleGrad;
    actx.beginPath();
    actx.ellipse(px, py, 460, 310, 0.15, 0, Math.PI * 2);
    actx.fill();
  }

  if (rctx) {
    rctx.fillStyle = '#c0c0c0'; // Mud roughness ~0.75
    rctx.fillRect(0, 0, 2048, 2048);
    // Puddle is glossy specular mirror (roughness ~0.08)
    const pgrad = rctx.createRadialGradient(1024, 1150, 40, 1024, 1150, 440);
    pgrad.addColorStop(0, '#151515');
    pgrad.addColorStop(0.7, '#303030');
    pgrad.addColorStop(1, '#c0c0c0');
    rctx.fillStyle = pgrad;
    rctx.beginPath();
    rctx.ellipse(1024, 1150, 460, 310, 0.15, 0, Math.PI * 2);
    rctx.fill();
  }

  if (bump.ctx) {
    bump.ctx.fillStyle = '#808080';
    bump.ctx.fillRect(0, 0, 2048, 2048);
    // Trodden hoofprints
    bump.ctx.fillStyle = '#404040';
    for (let h = 0; h < 60; h++) {
      const hx = (h * 157) % 2048;
      const hy = (h * 229) % 2048;
      bump.ctx.fillRect(hx, hy, 12, 16);
    }
  }

  const result = {
    map: toTexture(albedo.canvas, true, true),
    roughnessMap: toTexture(rough.canvas, false, true),
    metalnessMap: null,
    bumpMap: toTexture(bump.canvas, false, true)
  };
  textureCache.set(key, result);
  return result;
}

// 12. WAR PIG SKIN (Pig Farm)
export function getOrcPigSkinTextures() {
  const key = 'orc_pig_skin';
  if (textureCache.has(key)) return textureCache.get(key);

  const albedo = createCanvas(1024, 1024);
  const rough = createCanvas(1024, 1024);
  const actx = albedo.ctx;

  if (actx) {
    // Stylized warm pink pig body
    actx.fillStyle = '#f09c91';
    actx.fillRect(0, 0, 1024, 1024);

    // Splotches & mud spatters
    for (let i = 0; i < 35; i++) {
      const mx = (i * 123) % 1024;
      const my = (i * 211) % 1024;
      const r = 15 + (i % 25);
      actx.fillStyle = (i % 2 === 0) ? '#4a2e1c' : '#d67c70';
      actx.beginPath();
      actx.arc(mx, my, r, 0, Math.PI * 2);
      actx.fill();
    }
  }

  if (rough.ctx) {
    rough.ctx.fillStyle = '#a0a0a0'; // Subsurface organic roughness ~0.6
    rough.ctx.fillRect(0, 0, 1024, 1024);
  }

  const result = {
    map: toTexture(albedo.canvas, true, false),
    roughnessMap: toTexture(rough.canvas, false, false),
    metalnessMap: null,
    bumpMap: null
  };
  textureCache.set(key, result);
  return result;
}
