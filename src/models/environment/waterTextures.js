import * as THREE from 'three';

/**
 * Procedural Hand-Painted Stylized PBR Texture Generator for Water & Shoreline
 * Inspired by Warcraft 2 hand-painted art style, Valorant, and Overwatch.
 *
 * Generates high-resolution (2048x2048) PBR texture sets with textureCache:
 * 1. getWaterSurfaceTextures(): Seamless stylized caustic pattern (Voronoi/cellular water light webs),
 *    subtle foam ripples, and specular glints.
 * 2. getShorelineFoamTextures(): Stylized scalloped surf foam lines that hug the coast,
 *    with fading alpha and bubbly lace edges.
 * 3. getCattailLotusTextures(): Velvet brown cattail texture, fibrous green reed stem,
 *    and hand-painted lotus petal & lily pad textures.
 */

const textureCache = new Map();

function createCanvas(width = 2048, height = 2048) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: false });
  return { canvas, ctx, width, height };
}

function toTexture(canvas, isSRGB = true, wrap = THREE.RepeatWrapping, repeatX = 1, repeatY = 1) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = isSRGB ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = wrap;
  tex.wrapT = wrap;
  tex.repeat.set(repeatX, repeatY);
  tex.needsUpdate = true;
  return tex;
}

/**
 * Deterministic pseudo-random number generator for reproducible hand-painted strokes
 */
function pseudoRandom(seed) {
  const s = Math.sin(seed) * 43758.5453123;
  return s - Math.floor(s);
}

/**
 * Draws a bezier curve that wraps seamlessly across a toroidal W x H canvas
 */
function drawSeamlessBezier(ctx, p1, cp, p2, color, lineWidth, w = 2048, h = 2048) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const offsets = [
    [0, 0],
    [-w, 0], [w, 0],
    [0, -h], [0, h],
    [-w, -h], [w, -h], [-w, h], [w, h]
  ];

  for (let i = 0; i < offsets.length; i++) {
    const [ox, oy] = offsets[i];
    const x1 = p1.x + ox;
    const y1 = p1.y + oy;
    const cx = cp.x + ox;
    const cy = cp.y + oy;
    const x2 = p2.x + ox;
    const y2 = p2.y + oy;

    // Fast bounding box rejection
    const minX = Math.min(x1, cx, x2) - lineWidth;
    const maxX = Math.max(x1, cx, x2) + lineWidth;
    const minY = Math.min(y1, cy, y2) - lineWidth;
    const maxY = Math.max(y1, cy, y2) + lineWidth;

    if (maxX >= 0 && minX <= w && maxY >= 0 && minY <= h) {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.quadraticCurveTo(cx, cy, x2, y2);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/**
 * Draws a stylized 4-point diamond specular star glint with toroidal wrapping
 */
function drawSeamlessGlint(ctx, cx, cy, size = 32, w = 2048, h = 2048) {
  ctx.save();
  const offsets = [
    [0, 0],
    [-w, 0], [w, 0],
    [0, -h], [0, h],
    [-w, -h], [w, -h], [-w, h], [w, h]
  ];

  for (let o = 0; o < offsets.length; o++) {
    const gx = cx + offsets[o][0];
    const gy = cy + offsets[o][1];

    if (gx + size < 0 || gx - size > w || gy + size < 0 || gy - size > h) continue;

    // 1. Soft turquoise-cyan halo
    const haloGrad = ctx.createRadialGradient(gx, gy, 0, gx, gy, size * 0.9);
    haloGrad.addColorStop(0, 'rgba(165, 243, 252, 0.7)');
    haloGrad.addColorStop(0.3, 'rgba(56, 189, 248, 0.4)');
    haloGrad.addColorStop(1, 'rgba(56, 189, 248, 0)');
    ctx.fillStyle = haloGrad;
    ctx.beginPath();
    ctx.arc(gx, gy, size * 0.9, 0, Math.PI * 2);
    ctx.fill();

    // 2. Primary 4-pointed diamond flare (Horizontal & Vertical)
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    // Vertical diamond
    ctx.moveTo(gx, gy - size);
    ctx.quadraticCurveTo(gx, gy, gx + size * 0.15, gy);
    ctx.quadraticCurveTo(gx, gy, gx, gy + size);
    ctx.quadraticCurveTo(gx, gy, gx - size * 0.15, gy);
    ctx.quadraticCurveTo(gx, gy, gx, gy - size);
    ctx.fill();

    ctx.beginPath();
    // Horizontal diamond
    ctx.moveTo(gx - size, gy);
    ctx.quadraticCurveTo(gx, gy, gx, gy + size * 0.15);
    ctx.quadraticCurveTo(gx, gy, gx + size, gy);
    ctx.quadraticCurveTo(gx, gy, gx, gy - size * 0.15);
    ctx.quadraticCurveTo(gx, gy, gx - size, gy);
    ctx.fill();

    // 3. Hot intense center core
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(gx, gy, size * 0.22, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * ----------------------------------------------------------------------------
 * 1. STYLIZED WATER SURFACE TEXTURES
 * Seamless stylized Voronoi caustic light webs, subtle foam ripples & specular glints
 * ----------------------------------------------------------------------------
 */
export function getWaterSurfaceTextures() {
  if (textureCache.has('water_surface_pbr')) {
    return textureCache.get('water_surface_pbr');
  }

  const { canvas: albCanvas, ctx: albCtx, width, height } = createCanvas(2048, 2048);
  const { canvas: roughCanvas, ctx: roughCtx } = createCanvas(2048, 2048);
  const { canvas: bumpCanvas, ctx: bumpCtx } = createCanvas(2048, 2048);

  // --- A. ALBEDO MAP ---
  // 1. Deep vibrant gradient base (Warcraft 2 / Valorant sea palette: Deep Sapphire to Aquamarine Cyan)
  const baseGrad = albCtx.createLinearGradient(0, 0, width, height);
  baseGrad.addColorStop(0, '#105e8d');   // Deep sapphire turquoise
  baseGrad.addColorStop(0.35, '#167aa8'); // Mid-depth ocean azure
  baseGrad.addColorStop(0.7, '#1c93be');  // Vibrant crystal cyan
  baseGrad.addColorStop(1, '#23a8ce');    // Radiant shallow lagoon cyan
  albCtx.fillStyle = baseGrad;
  albCtx.fillRect(0, 0, width, height);

  // 2. Soft painterly watercolor cloud dapples
  for (let i = 0; i < 36; i++) {
    const rx = pseudoRandom(i * 13.7) * width;
    const ry = pseudoRandom(i * 29.1) * height;
    const rad = 220 + pseudoRandom(i * 7.3) * 320;
    const alpha = 0.08 + pseudoRandom(i * 19.5) * 0.12;

    const cloudGrad = albCtx.createRadialGradient(rx, ry, 0, rx, ry, rad);
    cloudGrad.addColorStop(0, `rgba(56, 189, 248, ${alpha})`);
    cloudGrad.addColorStop(0.6, `rgba(14, 165, 233, ${alpha * 0.5})`);
    cloudGrad.addColorStop(1, 'rgba(14, 165, 233, 0)');
    albCtx.fillStyle = cloudGrad;

    // Seamless toroidal stamp
    const offsets = [[0, 0], [-width, 0], [width, 0], [0, -height], [0, height]];
    offsets.forEach(([ox, oy]) => {
      albCtx.beginPath();
      albCtx.arc(rx + ox, ry + oy, rad, 0, Math.PI * 2);
      albCtx.fill();
    });
  }

  // 3. Procedural Seamless Voronoi / Cellular Caustic Web
  // Grid resolution 14x14 creates optimal stylized cell size (~146px)
  const gridSize = 14;
  const cellSize = width / gridSize;
  const points = [];

  for (let gy = 0; gy < gridSize; gy++) {
    points[gy] = [];
    for (let gx = 0; gx < gridSize; gx++) {
      // Deterministic periodic jitter for seamless toroidal matching
      const angle = (gx / gridSize) * Math.PI * 2 * 3 + (gy / gridSize) * Math.PI * 2 * 2;
      const jitterDist = cellSize * 0.32;
      const jx = Math.sin(angle) * jitterDist;
      const jy = Math.cos(angle * 1.3) * jitterDist;

      points[gy][gx] = {
        x: (gx + 0.5) * cellSize + jx,
        y: (gy + 0.5) * cellSize + jy
      };
    }
  }

  // Draw caustic connections
  const neighborDeltas = [
    [1, 0],  // right
    [0, 1],  // bottom
    [1, 1],  // bottom-right
    [-1, 1]  // bottom-left
  ];

  // Pass 1: Broad soft luminous cyan bloom (Layer 1)
  for (let gy = 0; gy < gridSize; gy++) {
    for (let gx = 0; gx < gridSize; gx++) {
      const p1 = points[gy][gx];
      for (let d = 0; d < neighborDeltas.length; d++) {
        const [dx, dy] = neighborDeltas[d];
        const ngx = (gx + dx + gridSize) % gridSize;
        const ngy = (gy + dy + gridSize) % gridSize;
        const p2Raw = points[ngy][ngx];

        // Wrap delta coordinates
        let p2x = p2Raw.x + dx * cellSize - ((gx + dx) - ngx) * width;
        let p2y = p2Raw.y + dy * cellSize - ((gy + dy) - ngy) * height;

        // Fix wrapping distance
        if (p2x - p1.x > width / 2) p2x -= width;
        if (p2x - p1.x < -width / 2) p2x += width;
        if (p2y - p1.y > height / 2) p2y -= height;
        if (p2y - p1.y < -height / 2) p2y += height;

        const p2 = { x: p2x, y: p2y };
        // Curved bowed control point
        const midX = (p1.x + p2.x) * 0.5;
        const midY = (p1.y + p2.y) * 0.5;
        const bow = (pseudoRandom(gx * 11 + gy * 17 + d) - 0.5) * cellSize * 0.45;
        const cp = { x: midX - (p2.y - p1.y) * 0.2 + bow, y: midY + (p2.x - p1.x) * 0.2 + bow };

        drawSeamlessBezier(albCtx, p1, cp, p2, 'rgba(56, 225, 248, 0.38)', 22, width, height);
      }
    }
  }

  // Pass 2: Main vibrant aquamarine caustic filament body (Layer 2)
  for (let gy = 0; gy < gridSize; gy++) {
    for (let gx = 0; gx < gridSize; gx++) {
      const p1 = points[gy][gx];
      for (let d = 0; d < neighborDeltas.length; d++) {
        const [dx, dy] = neighborDeltas[d];
        const ngx = (gx + dx + gridSize) % gridSize;
        const ngy = (gy + dy + gridSize) % gridSize;
        const p2Raw = points[ngy][ngx];

        let p2x = p2Raw.x;
        let p2y = p2Raw.y;
        if (p2x - p1.x > width / 2) p2x -= width;
        if (p2x - p1.x < -width / 2) p2x += width;
        if (p2y - p1.y > height / 2) p2y -= height;
        if (p2y - p1.y < -height / 2) p2y += height;

        const p2 = { x: p2x, y: p2y };
        const midX = (p1.x + p2.x) * 0.5;
        const midY = (p1.y + p2.y) * 0.5;
        const bow = (pseudoRandom(gx * 11 + gy * 17 + d) - 0.5) * cellSize * 0.45;
        const cp = { x: midX - (p2.y - p1.y) * 0.2 + bow, y: midY + (p2.x - p1.x) * 0.2 + bow };

        drawSeamlessBezier(albCtx, p1, cp, p2, 'rgba(165, 243, 252, 0.75)', 10, width, height);
      }
    }
  }

  // Pass 3: Sharp crisp white-cyan core line (Layer 3)
  for (let gy = 0; gy < gridSize; gy++) {
    for (let gx = 0; gx < gridSize; gx++) {
      const p1 = points[gy][gx];
      for (let d = 0; d < neighborDeltas.length; d++) {
        const [dx, dy] = neighborDeltas[d];
        const ngx = (gx + dx + gridSize) % gridSize;
        const ngy = (gy + dy + gridSize) % gridSize;
        const p2Raw = points[ngy][ngx];

        let p2x = p2Raw.x;
        let p2y = p2Raw.y;
        if (p2x - p1.x > width / 2) p2x -= width;
        if (p2x - p1.x < -width / 2) p2x += width;
        if (p2y - p1.y > height / 2) p2y -= height;
        if (p2y - p1.y < -height / 2) p2y += height;

        const p2 = { x: p2x, y: p2y };
        const midX = (p1.x + p2.x) * 0.5;
        const midY = (p1.y + p2.y) * 0.5;
        const bow = (pseudoRandom(gx * 11 + gy * 17 + d) - 0.5) * cellSize * 0.45;
        const cp = { x: midX - (p2.y - p1.y) * 0.2 + bow, y: midY + (p2.x - p1.x) * 0.2 + bow };

        drawSeamlessBezier(albCtx, p1, cp, p2, 'rgba(255, 255, 255, 0.92)', 3.5, width, height);
      }
    }
  }

  // 4. Stylized Specular Star Glints at selected node junctions
  for (let gy = 0; gy < gridSize; gy++) {
    for (let gx = 0; gx < gridSize; gx++) {
      const p = points[gy][gx];
      const randVal = pseudoRandom(gx * 37 + gy * 53);
      if (randVal > 0.45) {
        const glintSize = 24 + randVal * 28;
        drawSeamlessGlint(albCtx, p.x, p.y, glintSize, width, height);
      }
    }
  }

  // 5. Stylized crescent foam ripples & drift flecks
  albCtx.save();
  for (let i = 0; i < 70; i++) {
    const fx = pseudoRandom(i * 19.3) * width;
    const fy = pseudoRandom(i * 41.7) * height;
    const radius = 18 + pseudoRandom(i * 5.1) * 32;
    const startAng = pseudoRandom(i * 13.9) * Math.PI * 2;
    const arcLen = 1.0 + pseudoRandom(i * 7.7) * 1.4;

    const drawFoamArc = (ox, oy) => {
      // Subtle ocean drop shadow under foam arc
      albCtx.strokeStyle = 'rgba(12, 74, 110, 0.45)';
      albCtx.lineWidth = 5;
      albCtx.beginPath();
      albCtx.arc(fx + ox + 2, fy + oy + 2, radius, startAng, startAng + arcLen);
      albCtx.stroke();

      // Bright foam crest
      albCtx.strokeStyle = 'rgba(240, 253, 250, 0.88)';
      albCtx.lineWidth = 3.5;
      albCtx.beginPath();
      albCtx.arc(fx + ox, fy + oy, radius, startAng, startAng + arcLen);
      albCtx.stroke();

      // Micro bubble dots alongside arc
      albCtx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      const bx = fx + ox + Math.cos(startAng + arcLen * 0.5) * (radius + 5);
      const by = fy + oy + Math.sin(startAng + arcLen * 0.5) * (radius + 5);
      albCtx.beginPath();
      albCtx.arc(bx, by, 2.5, 0, Math.PI * 2);
      albCtx.fill();
    };

    const offsets = [[0, 0], [-width, 0], [width, 0], [0, -height], [0, height]];
    offsets.forEach(([ox, oy]) => drawFoamArc(ox, oy));
  }
  albCtx.restore();

  // --- B. ROUGHNESS MAP ---
  // Glossy water base (#242424 ~ 0.14 roughness), caustics slightly smoother, foam flecks slightly rougher
  roughCtx.fillStyle = '#222222';
  roughCtx.fillRect(0, 0, width, height);

  // Soft caustic specular sheen
  roughCtx.drawImage(albCanvas, 0, 0);
  roughCtx.fillStyle = 'rgba(20, 20, 20, 0.85)';
  roughCtx.fillRect(0, 0, width, height);

  // --- C. BUMP MAP (Subtle refractive water lens heights) ---
  bumpCtx.fillStyle = '#808080';
  bumpCtx.fillRect(0, 0, width, height);

  // Subtle cellular height embossing
  for (let gy = 0; gy < gridSize; gy++) {
    for (let gx = 0; gx < gridSize; gx++) {
      const p = points[gy][gx];
      const rad = cellSize * 0.6;
      const bGrad = bumpCtx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rad);
      bGrad.addColorStop(0, 'rgba(160, 160, 160, 0.35)');
      bGrad.addColorStop(1, 'rgba(128, 128, 128, 0)');
      bumpCtx.fillStyle = bGrad;

      const offsets = [[0, 0], [-width, 0], [width, 0], [0, -height], [0, height]];
      offsets.forEach(([ox, oy]) => {
        bumpCtx.beginPath();
        bumpCtx.arc(p.x + ox, p.y + oy, rad, 0, Math.PI * 2);
        bumpCtx.fill();
      });
    }
  }

  const result = {
    map: toTexture(albCanvas, true, THREE.RepeatWrapping, 8, 8),
    roughnessMap: toTexture(roughCanvas, false, THREE.RepeatWrapping, 8, 8),
    bumpMap: toTexture(bumpCanvas, false, THREE.RepeatWrapping, 8, 8)
  };

  textureCache.set('water_surface_pbr', result);
  return result;
}

/**
 * ----------------------------------------------------------------------------
 * 2. SHORELINE FOAM TEXTURES
 * Stylized scalloped surf foam lines with fading alpha & bubbly lace edges
 * ----------------------------------------------------------------------------
 */
export function getShorelineFoamTextures() {
  if (textureCache.has('shoreline_foam_pbr')) {
    return textureCache.get('shoreline_foam_pbr');
  }

  const width = 2048;
  const height = 1024;
  const { canvas: albCanvas, ctx: albCtx } = createCanvas(width, height);
  const { canvas: alphaCanvas, ctx: alphaCtx } = createCanvas(width, height);
  const { canvas: roughCanvas, ctx: roughCtx } = createCanvas(width, height);

  // Clear to transparent
  albCtx.clearRect(0, 0, width, height);
  alphaCtx.fillStyle = '#000000';
  alphaCtx.fillRect(0, 0, width, height);
  roughCtx.fillStyle = '#282828';
  roughCtx.fillRect(0, 0, width, height);

  // Geometry mapping:
  // V=0 (Y=0) is outer sea edge.
  // V=1 (Y=height) is inner shoreline beach edge.
  // Surf crest runs dynamically between Y = 350 and Y = 750.

  const wavePoints = 64;
  const stepX = width / wavePoints;

  // Generate 3 layers of rhythmic stylized scalloped surf waves
  const surfBands = [
    { baseRatio: 0.38, amp: 45, freq: 4, scallopRad: 70, shadowOffset: 8, opacity: 0.7 },
    { baseRatio: 0.54, amp: 65, freq: 5, scallopRad: 95, shadowOffset: 12, opacity: 0.95 },
    { baseRatio: 0.72, amp: 35, freq: 7, scallopRad: 55, shadowOffset: 6, opacity: 0.82 }
  ];

  surfBands.forEach((band, bandIdx) => {
    const baseY = height * band.baseRatio;

    // 1. Under-surf teal/sapphire volume shadow (AO under foam crest)
    albCtx.save();
    albCtx.fillStyle = 'rgba(8, 48, 72, 0.55)';
    albCtx.beginPath();
    albCtx.moveTo(0, height);
    for (let i = 0; i <= wavePoints; i++) {
      const x = i * stepX;
      const angle = (x / width) * Math.PI * 2 * band.freq;
      const waveY = baseY + Math.sin(angle) * band.amp + Math.cos(angle * 2.3) * (band.amp * 0.35) + band.shadowOffset;
      if (i === 0) albCtx.lineTo(x, waveY);
      else albCtx.lineTo(x, waveY);
    }
    albCtx.lineTo(width, height);
    albCtx.closePath();
    albCtx.fill();
    albCtx.restore();

    // 2. Main creamy white surf wave body with scalloped crest
    albCtx.save();
    const surfGrad = albCtx.createLinearGradient(0, baseY - band.amp, 0, height);
    surfGrad.addColorStop(0, '#ffffff');             // Pure white froth crest
    surfGrad.addColorStop(0.2, '#f0fdfa');           // Mint-kissed cream
    surfGrad.addColorStop(0.55, '#ccfbf1');          // Soft aquamarine wash
    surfGrad.addColorStop(0.85, 'rgba(153, 246, 228, 0.4)'); // Translucent receding water
    surfGrad.addColorStop(1, 'rgba(45, 212, 191, 0)');
    albCtx.fillStyle = surfGrad;

    // Scalloped undulating contour
    albCtx.beginPath();
    albCtx.moveTo(0, height);
    for (let i = 0; i <= wavePoints; i++) {
      const x = i * stepX;
      const angle = (x / width) * Math.PI * 2 * band.freq;
      // Scalloped sharpening via Math.abs(sin)
      const scallop = -Math.abs(Math.sin(angle * 1.5)) * band.scallopRad * 0.4;
      const waveY = baseY + Math.sin(angle) * band.amp + scallop;
      albCtx.lineTo(x, waveY);
    }
    albCtx.lineTo(width, height);
    albCtx.closePath();
    albCtx.fill();
    albCtx.restore();

    // Alpha map update for this surf band
    alphaCtx.save();
    const aGrad = alphaCtx.createLinearGradient(0, baseY - band.amp - 10, 0, height);
    aGrad.addColorStop(0, `rgba(255, 255, 255, 0)`);
    aGrad.addColorStop(0.12, `rgba(255, 255, 255, ${band.opacity})`);
    aGrad.addColorStop(0.65, `rgba(255, 255, 255, ${band.opacity * 0.75})`);
    aGrad.addColorStop(0.92, 'rgba(255, 255, 255, 0.2)');
    aGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    alphaCtx.fillStyle = aGrad;
    alphaCtx.beginPath();
    alphaCtx.moveTo(0, height);
    for (let i = 0; i <= wavePoints; i++) {
      const x = i * stepX;
      const angle = (x / width) * Math.PI * 2 * band.freq;
      const scallop = -Math.abs(Math.sin(angle * 1.5)) * band.scallopRad * 0.4;
      const waveY = baseY + Math.sin(angle) * band.amp + scallop;
      alphaCtx.lineTo(x, waveY);
    }
    alphaCtx.lineTo(width, height);
    alphaCtx.closePath();
    alphaCtx.fill();
    alphaCtx.restore();
  });

  // 3. Stylized Seafoam Lace Bubbles & Perforations (Bubbly edges)
  const bubbleCount = 420;
  for (let b = 0; b < bubbleCount; b++) {
    const bx = pseudoRandom(b * 17.3) * width;
    const bandSelection = pseudoRandom(b * 31.7);
    const bandY = bandSelection < 0.35 ? height * 0.42 : (bandSelection < 0.75 ? height * 0.58 : height * 0.75);
    const by = bandY + (pseudoRandom(b * 47.9) - 0.5) * 160;

    if (by < 80 || by > height - 60) continue;

    const bRad = 6 + pseudoRandom(b * 11.3) * 22;

    const drawBubble = (ox) => {
      const cx = bx + ox;

      // Draw bubble onto albedo
      // Outer foam rim
      albCtx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
      albCtx.lineWidth = 2.5;
      albCtx.beginPath();
      albCtx.arc(cx, by, bRad, 0, Math.PI * 2);
      albCtx.stroke();

      // Semi-translucent inner center
      albCtx.fillStyle = 'rgba(204, 251, 241, 0.45)';
      albCtx.beginPath();
      albCtx.arc(cx, by, bRad * 0.85, 0, Math.PI * 2);
      albCtx.fill();

      // Specular glint on bubble dome
      albCtx.fillStyle = '#ffffff';
      albCtx.beginPath();
      albCtx.arc(cx - bRad * 0.35, by - bRad * 0.35, bRad * 0.25, 0, Math.PI * 2);
      albCtx.fill();

      // Stamp bubble onto alpha map
      alphaCtx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      alphaCtx.beginPath();
      alphaCtx.arc(cx, by, bRad, 0, Math.PI * 2);
      alphaCtx.fill();

      // Foam lace cutout (creates hollow bubbly lace perforations)
      if (bRad > 14) {
        alphaCtx.fillStyle = 'rgba(0, 0, 0, 0.35)';
        alphaCtx.beginPath();
        alphaCtx.arc(cx, by, bRad * 0.5, 0, Math.PI * 2);
        alphaCtx.fill();
      }
    };

    drawBubble(0);
    if (bx - bRad < 0) drawBubble(width);
    if (bx + bRad > width) drawBubble(-width);
  }

  // 4. Fine stippled sea froth flecks along outer wash
  albCtx.fillStyle = '#ffffff';
  for (let i = 0; i < 300; i++) {
    const fx = pseudoRandom(i * 23.1) * width;
    const fy = height * 0.35 + pseudoRandom(i * 37.3) * (height * 0.5);
    const r = 1.5 + pseudoRandom(i * 7.9) * 3;

    albCtx.beginPath();
    albCtx.arc(fx, fy, r, 0, Math.PI * 2);
    albCtx.fill();

    alphaCtx.fillStyle = '#ffffff';
    alphaCtx.beginPath();
    alphaCtx.arc(fx, fy, r, 0, Math.PI * 2);
    alphaCtx.fill();
  }

  // Roughness: high roughness on foam froth (0.65), low roughness on clear water (0.15)
  roughCtx.drawImage(alphaCanvas, 0, 0);
  roughCtx.fillStyle = 'rgba(120, 120, 120, 0.4)';
  roughCtx.fillRect(0, 0, width, height);

  const result = {
    map: toTexture(albCanvas, true, THREE.RepeatWrapping, 1, 1),
    alphaMap: toTexture(alphaCanvas, false, THREE.RepeatWrapping, 1, 1),
    roughnessMap: toTexture(roughCanvas, false, THREE.RepeatWrapping, 1, 1)
  };

  textureCache.set('shoreline_foam_pbr', result);
  return result;
}

/**
 * ----------------------------------------------------------------------------
 * 3. CATTAIL & LOTUS TEXTURES
 * Velvet brown cattail, fibrous reed stem, lotus petal & lily pad leaf
 * ----------------------------------------------------------------------------
 */
export function getCattailLotusTextures() {
  if (textureCache.has('cattail_lotus_pbr')) {
    return textureCache.get('cattail_lotus_pbr');
  }

  // --- A. VELVET BROWN CATTAIL HEAD (1024x1024) ---
  const { canvas: cattailCanvas, ctx: catCtx, width: cW, height: cH } = createCanvas(1024, 1024);
  const { canvas: cattailRoughCanvas, ctx: catRoughCtx } = createCanvas(1024, 1024);

  // Rich dark chocolate / espresso velvet base gradient
  const catGrad = catCtx.createLinearGradient(0, 0, cW, 0);
  catGrad.addColorStop(0, '#32190b');    // Deep chestnut shadow edge
  catGrad.addColorStop(0.3, '#4e2813');  // Warm chocolate body
  catGrad.addColorStop(0.65, '#633418'); // Velvet brown highlight
  catGrad.addColorStop(1, '#381c0c');    // Shadow turn
  catCtx.fillStyle = catGrad;
  catCtx.fillRect(0, 0, cW, cH);

  // Micro-stippled velvet nap fibers
  catCtx.fillStyle = 'rgba(217, 155, 56, 0.08)'; // Golden pollen flecks
  for (let i = 0; i < 6000; i++) {
    const vx = pseudoRandom(i * 13.1) * cW;
    const vy = pseudoRandom(i * 31.7) * cH;
    const vw = 1 + pseudoRandom(i * 7.3) * 2.5;
    const vh = 3 + pseudoRandom(i * 19.9) * 7;
    catCtx.fillRect(vx, vy, vw, vh);
  }

  // Top apex pollen dusting (golden amber dusting at top of cattail)
  const pollenGrad = catCtx.createLinearGradient(0, 0, 0, cH * 0.35);
  pollenGrad.addColorStop(0, 'rgba(217, 155, 56, 0.55)');
  pollenGrad.addColorStop(0.5, 'rgba(180, 119, 40, 0.25)');
  pollenGrad.addColorStop(1, 'rgba(180, 119, 40, 0)');
  catCtx.fillStyle = pollenGrad;
  catCtx.fillRect(0, 0, cW, cH * 0.35);

  // Base dried calyx collar (dark umber at bottom)
  const baseCalyx = catCtx.createLinearGradient(0, cH * 0.85, 0, cH);
  baseCalyx.addColorStop(0, 'rgba(30, 15, 8, 0)');
  baseCalyx.addColorStop(1, 'rgba(24, 12, 6, 0.85)');
  catCtx.fillStyle = baseCalyx;
  catCtx.fillRect(0, cH * 0.85, cW, cH * 0.15);

  // Cattail Velvet Roughness (very high diffuse roughness ~ 0.88)
  catRoughCtx.fillStyle = '#dedede';
  catRoughCtx.fillRect(0, 0, cW, cH);

  // --- B. FIBROUS GREEN REED STEM (512x1024) ---
  const { canvas: stemCanvas, ctx: stemCtx, width: sW, height: sH } = createCanvas(512, 1024);
  const stemGrad = stemCtx.createLinearGradient(0, 0, sW, 0);
  stemGrad.addColorStop(0, '#336329');   // Olive shadow edge
  stemGrad.addColorStop(0.35, '#4e943f'); // Lush reed green
  stemGrad.addColorStop(0.65, '#68b354'); // Lime highlight ridge
  stemGrad.addColorStop(1, '#3b6e30');   // Turned shadow
  stemCtx.fillStyle = stemGrad;
  stemCtx.fillRect(0, 0, sW, sH);

  // Vertical fibrous reed striations
  for (let i = 0; i < 80; i++) {
    const lx = (i / 80) * sW;
    const isBright = pseudoRandom(i * 17.3) > 0.5;
    stemCtx.fillStyle = isBright ? 'rgba(134, 239, 172, 0.25)' : 'rgba(20, 50, 15, 0.25)';
    stemCtx.fillRect(lx, 0, 2 + pseudoRandom(i * 5.1) * 3, sH);
  }

  // Bamboo / reed joint nodes (horizontal sheath collars)
  const nodeYPositions = [sH * 0.25, sH * 0.55, sH * 0.85];
  nodeYPositions.forEach(ny => {
    // Shadow crevice
    stemCtx.fillStyle = 'rgba(20, 45, 15, 0.7)';
    stemCtx.fillRect(0, ny - 3, sW, 6);
    // Pale chartreuse node ridge
    stemCtx.fillStyle = 'rgba(187, 247, 208, 0.65)';
    stemCtx.fillRect(0, ny + 3, sW, 4);
  });

  // --- C. LOTUS LEAF / LILY PAD (1024x1024) ---
  const { canvas: leafCanvas, ctx: leafCtx, width: lW, height: lH } = createCanvas(1024, 1024);
  const centerX = lW / 2;
  const centerY = lH / 2;
  const leafRadius = lW * 0.46;

  // Deep emerald to bright jade radial gradient
  const padGrad = leafCtx.createRadialGradient(centerX, centerY, 0, centerX, centerY, leafRadius);
  padGrad.addColorStop(0, '#15803d');   // Deep jade heart
  padGrad.addColorStop(0.6, '#22c55e'); // Vibrant emerald pad
  padGrad.addColorStop(0.88, '#16a34a'); // Shadow rim slope
  padGrad.addColorStop(0.96, '#86efac'); // Pale lime-chartreuse rim lip
  padGrad.addColorStop(1, '#4ade80');
  leafCtx.fillStyle = padGrad;
  leafCtx.beginPath();
  leafCtx.arc(centerX, centerY, leafRadius, 0, Math.PI * 2);
  leafCtx.fill();

  // Hand-painted radiating leaf veins branching outward
  const veinCount = 14;
  for (let v = 0; v < veinCount; v++) {
    const angle = (v / veinCount) * Math.PI * 2;
    const vLen = leafRadius * 0.92;
    const endX = centerX + Math.cos(angle) * vLen;
    const endY = centerY + Math.sin(angle) * vLen;

    // Main primary rib
    leafCtx.strokeStyle = 'rgba(187, 247, 208, 0.75)';
    leafCtx.lineWidth = 4;
    leafCtx.beginPath();
    leafCtx.moveTo(centerX, centerY);
    leafCtx.quadraticCurveTo(
      centerX + Math.cos(angle + 0.1) * (vLen * 0.5),
      centerY + Math.sin(angle + 0.1) * (vLen * 0.5),
      endX, endY
    );
    leafCtx.stroke();

    // Secondary micro-branches
    for (let b = 1; b <= 3; b++) {
      const bDist = vLen * (b * 0.25);
      const bx = centerX + Math.cos(angle) * bDist;
      const by = centerY + Math.sin(angle) * bDist;
      const bAngle1 = angle + 0.35;
      const bAngle2 = angle - 0.35;

      leafCtx.strokeStyle = 'rgba(187, 247, 208, 0.45)';
      leafCtx.lineWidth = 2;
      leafCtx.beginPath();
      leafCtx.moveTo(bx, by);
      leafCtx.lineTo(bx + Math.cos(bAngle1) * (leafRadius * 0.18), by + Math.sin(bAngle1) * (leafRadius * 0.18));
      leafCtx.stroke();

      leafCtx.beginPath();
      leafCtx.moveTo(bx, by);
      leafCtx.lineTo(bx + Math.cos(bAngle2) * (leafRadius * 0.18), by + Math.sin(bAngle2) * (leafRadius * 0.18));
      leafCtx.stroke();
    }
  }

  // Iconic V-notch cut (pie wedge cutout characteristic of water lily pads)
  leafCtx.save();
  leafCtx.globalCompositeOperation = 'destination-out';
  leafCtx.beginPath();
  leafCtx.moveTo(centerX, centerY);
  leafCtx.arc(centerX, centerY, leafRadius + 10, -Math.PI * 0.12, Math.PI * 0.12);
  leafCtx.closePath();
  leafCtx.fill();
  leafCtx.restore();

  // Waxy dewdrop water droplets on the pad surface
  for (let d = 0; d < 8; d++) {
    const dDist = leafRadius * (0.25 + pseudoRandom(d * 9.3) * 0.55);
    const dAng = pseudoRandom(d * 17.7) * Math.PI * 1.6 + 0.4;
    const dx = centerX + Math.cos(dAng) * dDist;
    const dy = centerY + Math.sin(dAng) * dDist;
    const dr = 7 + pseudoRandom(d * 5.1) * 11;

    // Drop shadow
    leafCtx.fillStyle = 'rgba(10, 40, 15, 0.45)';
    leafCtx.beginPath();
    leafCtx.arc(dx + 2, dy + 2, dr, 0, Math.PI * 2);
    leafCtx.fill();

    // Droplet lens body
    const dropGrad = leafCtx.createRadialGradient(dx - dr * 0.3, dy - dr * 0.3, 0, dx, dy, dr);
    dropGrad.addColorStop(0, '#ffffff');
    dropGrad.addColorStop(0.4, 'rgba(204, 251, 241, 0.85)');
    dropGrad.addColorStop(1, 'rgba(45, 212, 191, 0.4)');
    leafCtx.fillStyle = dropGrad;
    leafCtx.beginPath();
    leafCtx.arc(dx, dy, dr, 0, Math.PI * 2);
    leafCtx.fill();

    // Specular highlight pinprick
    leafCtx.fillStyle = '#ffffff';
    leafCtx.beginPath();
    leafCtx.arc(dx - dr * 0.35, dy - dr * 0.35, dr * 0.3, 0, Math.PI * 2);
    leafCtx.fill();
  }

  // --- D. LOTUS FLOWER PETAL & STAMEN (512x1024) ---
  const { canvas: petalCanvas, ctx: petalCtx, width: pW, height: pH } = createCanvas(512, 1024);

  // Gradient: Rose-pink / magenta tip blending into ivory white and golden yellow base
  const petalGrad = petalCtx.createLinearGradient(0, 0, 0, pH);
  petalGrad.addColorStop(0, '#f43f5e');   // Deep rose tip
  petalGrad.addColorStop(0.18, '#fb7185'); // Coral pink blush
  petalGrad.addColorStop(0.45, '#fce7f3'); // Silky petal pink
  petalGrad.addColorStop(0.75, '#ffffff'); // Pure ivory white body
  petalGrad.addColorStop(1, '#fef08a');   // Tender pollen yellow base
  petalCtx.fillStyle = petalGrad;
  petalCtx.fillRect(0, 0, pW, pH);

  // Fine translucent longitudinal petal veins
  for (let i = 0; i < 28; i++) {
    const px = (i / 28) * pW;
    petalCtx.strokeStyle = 'rgba(244, 63, 94, 0.22)';
    petalCtx.lineWidth = 1.5;
    petalCtx.beginPath();
    petalCtx.moveTo(px, 0);
    petalCtx.quadraticCurveTo(pW * 0.5, pH * 0.5, px, pH);
    petalCtx.stroke();
  }

  // Soft pearlescent rim glow
  const rimGlow = petalCtx.createLinearGradient(0, 0, pW, 0);
  rimGlow.addColorStop(0, 'rgba(255, 255, 255, 0.5)');
  rimGlow.addColorStop(0.15, 'rgba(255, 255, 255, 0)');
  rimGlow.addColorStop(0.85, 'rgba(255, 255, 255, 0)');
  rimGlow.addColorStop(1, 'rgba(255, 255, 255, 0.5)');
  petalCtx.fillStyle = rimGlow;
  petalCtx.fillRect(0, 0, pW, pH);

  const result = {
    cattailHeadMap: toTexture(cattailCanvas, true, THREE.ClampToEdgeWrapping),
    cattailHeadRoughness: toTexture(cattailRoughCanvas, false, THREE.ClampToEdgeWrapping),
    cattailStemMap: toTexture(stemCanvas, true, THREE.RepeatWrapping, 1, 2),
    lotusLeafMap: toTexture(leafCanvas, true, THREE.ClampToEdgeWrapping),
    lotusPetalMap: toTexture(petalCanvas, true, THREE.ClampToEdgeWrapping)
  };

  textureCache.set('cattail_lotus_pbr', result);
  return result;
}
