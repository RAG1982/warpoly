import * as THREE from 'three';

/**
 * Procedural Hand-Painted Stylized PBR Texture Generator for Trees & Foliage in WarPoly
 * Inspired by Warcraft 2 hand-painted art style, Valorant, and Overwatch.
 *
 * Generates 2048x2048 high-definition textures cached across instances:
 * 1. Oak Bark (getOakBarkTextures): Deep stylized fissures, warm oak tones, hand-painted
 *    bevel highlights on bark ridges, emerald green moss creeping up one side,
 *    circular growth rings for cut branch knotholes, roughness and bump maps.
 * 2. Pine Bark (getPineBarkTextures): Weathered reddish-brown scaly pine bark plates,
 *    translucent amber sap drippings, crustose lichen in crevices, roughness and bump maps.
 * 3. Oak Foliage (getOakFoliageTextures): Lush layered stylized leaf clumps with brushstroke
 *    highlights, golden rim light, deep ambient occlusion shadows between leaf clusters.
 * 4. Pine Needle (getPineNeedleTextures): Tiered coniferous needle brush textures,
 *    frosted/sunlit tips, subtle pinecones nestled in needles.
 * 5. Autumn Oak Foliage (getAutumnOakFoliageTextures): Vibrant amber, gold, burnt orange,
 *    and crimson hand-painted leaves with warm sunlight rim.
 * 6. Birch Bark (getBirchBarkTextures): Papery chalk-white bark with horizontal dark
 *    charcoal lenticels, peeling bark paper curls, and soft lichen patches.
 * 7. Birch Foliage (getBirchFoliageTextures): Delicate airy yellow-green and golden-chartreuse
 *    leaf clusters with translucent sunlit tips.
 * 8. Pinecone (getPineconeTextures): Woody layered scales with warm ochre highlights.
 */

const textureCache = new Map();

/**
 * Canvas factory with safe mock fallback for headless / server / test environments
 */
function createCanvas(width = 2048, height = 2048) {
  let canvas, ctx;
  if (typeof document !== 'undefined') {
    canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    ctx = canvas.getContext('2d', { willReadFrequently: false });
  } else {
    // Headless / Node SSR mock
    canvas = { width, height };
    const noop = () => {};
    const gradMock = { addColorStop: noop };
    ctx = new Proxy({}, {
      get: (target, prop) => {
        if (prop === 'createLinearGradient' || prop === 'createRadialGradient') {
          return () => gradMock;
        }
        return noop;
      }
    });
  }
  return { canvas, ctx, width, height };
}

/**
 * Converts HTML5 Canvas to a high-quality Three.js texture with proper color space & filtering
 */
function toTexture(canvas, isSRGB = true, wrapRepeat = true) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = isSRGB ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  if (wrapRepeat) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
  } else {
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
  }
  tex.needsUpdate = true;
  return tex;
}

/**
 * PBR Material creation helper
 */
export function createTreeMaterial(texSet, options = {}) {
  return new THREE.MeshStandardMaterial({
    map: texSet.map,
    roughnessMap: texSet.roughnessMap,
    metalnessMap: texSet.metalnessMap,
    bumpMap: texSet.bumpMap,
    bumpScale: options.bumpScale !== undefined ? options.bumpScale : 0.05,
    roughness: options.roughness !== undefined ? options.roughness : 1.0,
    metalness: options.metalness !== undefined ? options.metalness : 0.0,
    flatShading: options.flatShading !== undefined ? options.flatShading : false,
    ...options
  });
}

/* ==========================================================================
   1. OAK BARK TEXTURES (getOakBarkTextures)
   Deep stylized fissures, warm oak tones, bevel highlights on ridges,
   emerald green moss on one side, circular knotholes with growth rings.
   ========================================================================== */
export function getOakBarkTextures() {
  if (textureCache.has('oakBark')) return textureCache.get('oakBark');

  const { canvas: albC, ctx: alb, width: W, height: H } = createCanvas(2048, 2048);
  const { canvas: rghC, ctx: rgh } = createCanvas(2048, 2048);
  const { canvas: metC, ctx: met } = createCanvas(2048, 2048);
  const { canvas: bmpC, ctx: bmp } = createCanvas(2048, 2048);

  // 1.1 Base warm, light honey-amber cedar/oak gradient
  const baseGrad = alb.createLinearGradient(0, 0, W, 0);
  baseGrad.addColorStop(0.0, '#7e4d2d');
  baseGrad.addColorStop(0.25, '#99633c');
  baseGrad.addColorStop(0.5, '#ad754a');
  baseGrad.addColorStop(0.75, '#9c653e');
  baseGrad.addColorStop(1.0, '#804f2f');
  alb.fillStyle = baseGrad;
  alb.fillRect(0, 0, W, H);

  // Soft stylized vertical grain lines
  alb.fillStyle = 'rgba(70, 35, 15, 0.12)';
  for (let x = 0; x < W; x += 18) {
    alb.fillRect(x, 0, 4, H);
  }

  // 1.2 Undulating vertical furrow ridges (8 broad stylized bark plates)
  const numFurrows = 8;
  const colW = W / numFurrows;

  for (let i = 0; i < numFurrows; i++) {
    const baseX = i * colW;
    const ridgeW = colW * 0.82;
    const fissureW = colW - ridgeW;

    // Gentle crevice shadow (soft warm brown, not pitch black)
    const creviceShadow = alb.createLinearGradient(baseX + ridgeW, 0, baseX + colW, 0);
    creviceShadow.addColorStop(0.0, '#56301a');
    creviceShadow.addColorStop(0.5, '#6a3c22');
    creviceShadow.addColorStop(1.0, '#7d492b');
    alb.fillStyle = creviceShadow;
    alb.fillRect(baseX + ridgeW, 0, fissureW, H);

    // Main ridge body with smooth flowing contours
    alb.save();
    alb.beginPath();
    alb.moveTo(baseX, 0);

    for (let y = 0; y <= H; y += 64) {
      const wave = Math.sin((y / 200) + i * 2.1) * 14;
      alb.lineTo(baseX + wave, y);
    }
    for (let y = H; y >= 0; y -= 64) {
      const wave = Math.sin((y / 200) + i * 2.1) * 14;
      alb.lineTo(baseX + ridgeW + wave, y);
    }
    alb.closePath();

    // Stylized warm gradient across ridge
    const ridgeGrad = alb.createLinearGradient(baseX, 0, baseX + ridgeW, 0);
    ridgeGrad.addColorStop(0.0, '#855130');
    ridgeGrad.addColorStop(0.3, '#9e643d');
    ridgeGrad.addColorStop(0.7, '#ba8054');
    ridgeGrad.addColorStop(1.0, '#8f5734');
    alb.fillStyle = ridgeGrad;
    alb.fill();
    alb.restore();

    // Soft warm highlight line on ridge crest
    alb.strokeStyle = 'rgba(235, 175, 120, 0.45)';
    alb.lineWidth = 6;
    alb.beginPath();
    for (let y = 0; y <= H; y += 64) {
      const wave = Math.sin((y / 200) + i * 2.1) * 14;
      const hx = baseX + ridgeW * 0.72 + wave;
      if (y === 0) alb.moveTo(hx, y);
      else alb.lineTo(hx, y);
    }
    alb.stroke();
  }

  // 1.3 Clean stylized knothole
  const kx = W * 0.48;
  const ky = H * 0.42;
  const kr = 70;

  alb.save();
  const knotGrad = alb.createRadialGradient(kx, ky, 10, kx, ky, kr);
  knotGrad.addColorStop(0.0, '#5a3118');
  knotGrad.addColorStop(0.5, '#7d4a2a');
  knotGrad.addColorStop(0.85, '#9f673f');
  knotGrad.addColorStop(1.0, '#b57a4e');
  alb.fillStyle = knotGrad;
  alb.beginPath();
  alb.ellipse(kx, ky, kr, kr * 1.15, 0, 0, Math.PI * 2);
  alb.fill();

  // Subtle growth rings
  const ringColors = ['#6d3c1e', '#884f29', '#a4693e'];
  for (let r = 0; r < ringColors.length; r++) {
    alb.strokeStyle = ringColors[r];
    alb.lineWidth = 3.5;
    alb.beginPath();
    alb.ellipse(kx, ky, kr * (0.4 + r * 0.22), kr * 1.15 * (0.4 + r * 0.22), 0, 0, Math.PI * 2);
    alb.stroke();
  }
  alb.restore();

  // 1.4 Subtle, soft seamless moss wash at the ground base
  const mossGrad = alb.createLinearGradient(0, H * 0.85, 0, H);
  mossGrad.addColorStop(0.0, 'rgba(125, 205, 65, 0)');
  mossGrad.addColorStop(1.0, 'rgba(115, 195, 55, 0.22)');
  alb.fillStyle = mossGrad;
  alb.fillRect(0, H * 0.85, W, H * 0.15);

  // 1.5 Roughness Map (Clean and smooth)
  rgh.fillStyle = '#b8b8b8';
  rgh.fillRect(0, 0, W, H);

  // 1.6 Metalness Map (Pure non-metal)
  met.fillStyle = '#000000';
  met.fillRect(0, 0, W, H);

  // 1.7 Bump Map (Subtle gentle relief)
  bmp.fillStyle = '#808080';
  bmp.fillRect(0, 0, W, H);

  bmp.fillStyle = '#949494';
  for (let i = 0; i < numFurrows; i++) {
    bmp.fillRect(i * colW + colW * 0.15, 0, colW * 0.55, H);
  }

  const texSet = {
    map: toTexture(albC, true, true),
    roughnessMap: toTexture(rghC, false, true),
    metalnessMap: toTexture(metC, false, true),
    bumpMap: toTexture(bmpC, false, true)
  };
  textureCache.set('oakBark', texSet);
  return texSet;
}



/* ==========================================================================
   2. PINE BARK TEXTURES (getPineBarkTextures)
   Weathered reddish-brown scaly pine bark plates, sap drippings, moss/lichen.
   ========================================================================== */
export function getPineBarkTextures() {
  if (textureCache.has('pineBark')) return textureCache.get('pineBark');

  const { canvas: albC, ctx: alb, width: W, height: H } = createCanvas(2048, 2048);
  const { canvas: rghC, ctx: rgh } = createCanvas(2048, 2048);
  const { canvas: metC, ctx: met } = createCanvas(2048, 2048);
  const { canvas: bmpC, ctx: bmp } = createCanvas(2048, 2048);

  // 2.1 Base warm terracotta / cinnamon pine wood tone
  const baseGrad = alb.createLinearGradient(0, 0, W, 0);
  baseGrad.addColorStop(0.0, '#86472d');
  baseGrad.addColorStop(0.35, '#a65e3e');
  baseGrad.addColorStop(0.7, '#ba7251');
  baseGrad.addColorStop(1.0, '#8d4c31');
  alb.fillStyle = baseGrad;
  alb.fillRect(0, 0, W, H);

  // 2.2 Clean stylized pine bark plates (6 rows x 5 cols)
  const rows = 6;
  const cols = 5;
  const plateH = H / rows;
  const plateW = W / cols;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const offsetX = (r % 2) * (plateW * 0.5);
      const px = (c * plateW + offsetX) % W;
      const py = r * plateH;
      const pw = plateW * 0.90;
      const ph = plateH * 0.88;

      // Soft warm gap separating plates
      alb.fillStyle = '#5d2c19';
      alb.fillRect(px - 3, py - 3, pw + 6, ph + 6);

      // Plate gradient
      const pGrad = alb.createLinearGradient(px, py, px + pw, py + ph);
      pGrad.addColorStop(0.0, '#985335');
      pGrad.addColorStop(0.4, '#b56d4b');
      pGrad.addColorStop(0.8, '#c98361');
      pGrad.addColorStop(1.0, '#9e5839');
      alb.fillStyle = pGrad;

      // Stylized rounded plate
      alb.beginPath();
      alb.roundRect(px, py, pw, ph, 24);
      alb.fill();

      // Soft warm bevel highlight on top & left of plate
      alb.strokeStyle = 'rgba(245, 185, 150, 0.45)';
      alb.lineWidth = 5;
      alb.beginPath();
      alb.moveTo(px + 6, py + ph - 12);
      alb.lineTo(px + 6, py + 24);
      alb.arcTo(px + 6, py + 6, px + 24, py + 6, 20);
      alb.lineTo(px + pw - 20, py + 6);
      alb.stroke();
    }
  }

  // 2.3 Subtle golden amber sap glints
  const sapGlints = [
    { x: 520, y: 480, r: 14 },
    { x: 1380, y: 1240, r: 16 }
  ];
  sapGlints.forEach(s => {
    alb.fillStyle = '#f59e0b';
    alb.beginPath();
    alb.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    alb.fill();
    alb.fillStyle = '#fef08a';
    alb.beginPath();
    alb.arc(s.x - 3, s.y - 3, s.r * 0.45, 0, Math.PI * 2);
    alb.fill();
  });

  // 2.4 Roughness Map (Matte and smooth)
  rgh.fillStyle = '#b8b8b8';
  rgh.fillRect(0, 0, W, H);

  // 2.5 Metalness Map
  met.fillStyle = '#000000';
  met.fillRect(0, 0, W, H);

  // 2.6 Bump Map (Gentle plate embossing)
  bmp.fillStyle = '#808080';
  bmp.fillRect(0, 0, W, H);

  bmp.fillStyle = '#9c9c9c';
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const offsetX = (r % 2) * (plateW * 0.5);
      const px = (c * plateW + offsetX) % W;
      const py = r * plateH;
      bmp.beginPath();
      bmp.roundRect(px, py, plateW * 0.90, plateH * 0.88, 24);
      bmp.fill();
    }
  }

  const texSet = {
    map: toTexture(albC, true, true),
    roughnessMap: toTexture(rghC, false, true),
    metalnessMap: toTexture(metC, false, true),
    bumpMap: toTexture(bmpC, false, true)
  };
  textureCache.set('pineBark', texSet);
  return texSet;
}

/* ==========================================================================
   3. OAK FOLIAGE TEXTURES (getOakFoliageTextures)
   Lush layered stylized leaf clumps with brushstroke highlights,
   golden rim light, deep ambient occlusion shadows between leaf clusters.
   ========================================================================== */
export function getOakFoliageTextures() {
  if (textureCache.has('oakFoliage')) return textureCache.get('oakFoliage');

  const { canvas: albC, ctx: alb, width: W, height: H } = createCanvas(2048, 2048);
  const { canvas: rghC, ctx: rgh } = createCanvas(2048, 2048);
  const { canvas: metC, ctx: met } = createCanvas(2048, 2048);
  const { canvas: bmpC, ctx: bmp } = createCanvas(2048, 2048);

  // 3.1 Fresh, bright spring green base gradient
  const baseGrad = alb.createRadialGradient(W * 0.5, H * 0.5, 100, W * 0.5, H * 0.5, W * 0.75);
  baseGrad.addColorStop(0.0, '#66c43d');
  baseGrad.addColorStop(0.5, '#56b030');
  baseGrad.addColorStop(1.0, '#459924');
  alb.fillStyle = baseGrad;
  alb.fillRect(0, 0, W, H);

  // 3.2 20 Large, clean stylized leaf puffs (Warcraft 3 / Zelda style)
  const numClusters = 20;
  for (let k = 0; k < numClusters; k++) {
    const cx = ((k * 547) % (W - 320)) + 160;
    const cy = ((k * 691) % (H - 320)) + 160;
    const baseRadius = 140 + (k % 5) * 30;

    // Gentle soft green depth shadow
    alb.fillStyle = 'rgba(45, 95, 25, 0.28)';
    alb.beginPath();
    alb.arc(cx + 8, cy + 14, baseRadius * 1.08, 0, Math.PI * 2);
    alb.fill();

    // Leaf cluster body gradient: bright sunlit lime -> rich warm green
    const clumpGrad = alb.createRadialGradient(cx - baseRadius * 0.25, cy - baseRadius * 0.35, 10, cx, cy, baseRadius);
    clumpGrad.addColorStop(0.0, '#94ef55');
    clumpGrad.addColorStop(0.45, '#75d638');
    clumpGrad.addColorStop(0.85, '#5bb82a');
    clumpGrad.addColorStop(1.0, '#489c20');
    alb.fillStyle = clumpGrad;

    // Scalloped multi-lobed cloud contour
    alb.beginPath();
    const lobes = 6;
    for (let l = 0; l <= lobes; l++) {
      const angle = (l / lobes) * Math.PI * 2;
      const dist = baseRadius * (0.88 + 0.18 * Math.sin(angle * 3.0 + k));
      const lx = cx + Math.cos(angle) * dist;
      const ly = cy + Math.sin(angle) * dist;
      if (l === 0) alb.moveTo(lx, ly);
      else alb.lineTo(lx, ly);
    }
    alb.closePath();
    alb.fill();

    // Soft warm sunlight rim along upper crest
    alb.strokeStyle = 'rgba(235, 255, 160, 0.75)';
    alb.lineWidth = 8;
    alb.beginPath();
    alb.arc(cx, cy, baseRadius * 0.94, Math.PI * 1.1, Math.PI * 1.9);
    alb.stroke();
  }

  // 3.3 Roughness Map (Matte and smooth)
  rgh.fillStyle = '#b0b0b0';
  rgh.fillRect(0, 0, W, H);

  // 3.4 Metalness Map
  met.fillStyle = '#000000';
  met.fillRect(0, 0, W, H);

  // 3.5 Bump Map (Gentle canopy dome relief)
  bmp.fillStyle = '#808080';
  bmp.fillRect(0, 0, W, H);

  bmp.fillStyle = '#9c9c9c';
  for (let k = 0; k < numClusters; k++) {
    const cx = ((k * 547) % (W - 320)) + 160;
    const cy = ((k * 691) % (H - 320)) + 160;
    const baseRadius = 140 + (k % 5) * 30;
    bmp.beginPath();
    bmp.arc(cx, cy, baseRadius * 0.85, 0, Math.PI * 2);
    bmp.fill();
  }

  const texSet = {
    map: toTexture(albC, true, true),
    roughnessMap: toTexture(rghC, false, true),
    metalnessMap: toTexture(metC, false, true),
    bumpMap: toTexture(bmpC, false, true)
  };
  textureCache.set('oakFoliage', texSet);
  return texSet;
}

/* ==========================================================================
   4. PINE NEEDLE TEXTURES (getPineNeedleTextures)
   Tiered coniferous needle brush textures, frosted/sunlit tips,
   subtle pinecones nestled in needles.
   ========================================================================== */
export function getPineNeedleTextures() {
  if (textureCache.has('pineNeedle')) return textureCache.get('pineNeedle');

  const { canvas: albC, ctx: alb, width: W, height: H } = createCanvas(2048, 2048);
  const { canvas: rghC, ctx: rgh } = createCanvas(2048, 2048);
  const { canvas: metC, ctx: met } = createCanvas(2048, 2048);
  const { canvas: bmpC, ctx: bmp } = createCanvas(2048, 2048);

  // 4.1 Fresh, bright emerald evergreen base gradient
  const baseGrad = alb.createLinearGradient(0, 0, 0, H);
  baseGrad.addColorStop(0.0, '#3fa86e');
  baseGrad.addColorStop(0.5, '#32945f');
  baseGrad.addColorStop(1.0, '#268050');
  alb.fillStyle = baseGrad;
  alb.fillRect(0, 0, W, H);

  // 4.2 8 Clean, stylized coniferous bough tiers
  const numBoughs = 8;
  const boughH = H / numBoughs;

  for (let b = 0; b < numBoughs; b++) {
    const by = b * boughH;

    // Gentle soft shade at top of tier
    const shadeGrad = alb.createLinearGradient(0, by, 0, by + 30);
    shadeGrad.addColorStop(0.0, 'rgba(25, 80, 45, 0.35)');
    shadeGrad.addColorStop(1.0, 'rgba(25, 80, 45, 0)');
    alb.fillStyle = shadeGrad;
    alb.fillRect(0, by, W, 30);

    // Stylized scalloped bough fan teeth across tier
    const numFans = 7;
    const fanW = W / numFans;
    for (let f = 0; f < numFans; f++) {
      const fx = f * fanW + ((b % 2) * fanW * 0.5);

      const fanGrad = alb.createLinearGradient(fx + fanW * 0.5, by, fx + fanW * 0.5, by + boughH * 0.9);
      fanGrad.addColorStop(0.0, '#3aa669');
      fanGrad.addColorStop(0.6, '#4fbe7e');
      fanGrad.addColorStop(1.0, '#75e2a4'); // sunlit mint tip

      alb.fillStyle = fanGrad;
      alb.beginPath();
      alb.moveTo(fx, by);
      alb.quadraticCurveTo(fx + fanW * 0.5, by + boughH * 0.95, fx + fanW, by);
      alb.closePath();
      alb.fill();

      // Soft sunlit needle tip highlight
      alb.strokeStyle = 'rgba(200, 255, 225, 0.7)';
      alb.lineWidth = 4;
      alb.beginPath();
      alb.arc(fx + fanW * 0.5, by + boughH * 0.65, fanW * 0.35, Math.PI * 0.2, Math.PI * 0.8);
      alb.stroke();
    }
  }

  // 4.3 Roughness Map
  rgh.fillStyle = '#adadad';
  rgh.fillRect(0, 0, W, H);

  // 4.4 Metalness Map
  met.fillStyle = '#000000';
  met.fillRect(0, 0, W, H);

  // 4.5 Bump Map (Gentle bough tier ridges)
  bmp.fillStyle = '#808080';
  bmp.fillRect(0, 0, W, H);

  bmp.fillStyle = '#9c9c9c';
  for (let b = 0; b < numBoughs; b++) {
    bmp.fillRect(0, b * boughH + boughH * 0.2, W, boughH * 0.5);
  }

  const texSet = {
    map: toTexture(albC, true, true),
    roughnessMap: toTexture(rghC, false, true),
    metalnessMap: toTexture(metC, false, true),
    bumpMap: toTexture(bmpC, false, true)
  };
  textureCache.set('pineNeedle', texSet);
  return texSet;
}

/* ==========================================================================
   5. AUTUMN OAK FOLIAGE TEXTURES (getAutumnOakFoliageTextures)
   Vibrant amber, gold, burnt orange, and crimson hand-painted leaves
   with warm sunlight rim.
   ========================================================================== */
export function getAutumnOakFoliageTextures() {
  if (textureCache.has('autumnOakFoliage')) return textureCache.get('autumnOakFoliage');

  const { canvas: albC, ctx: alb, width: W, height: H } = createCanvas(2048, 2048);
  const { canvas: rghC, ctx: rgh } = createCanvas(2048, 2048);
  const { canvas: metC, ctx: met } = createCanvas(2048, 2048);
  const { canvas: bmpC, ctx: bmp } = createCanvas(2048, 2048);

  // 5.1 Warm, sunny amber / terracotta base gradient
  const baseGrad = alb.createRadialGradient(W * 0.5, H * 0.5, 100, W * 0.5, H * 0.5, W * 0.75);
  baseGrad.addColorStop(0.0, '#e58528');
  baseGrad.addColorStop(0.5, '#d4721d');
  baseGrad.addColorStop(1.0, '#bf5e12');
  alb.fillStyle = baseGrad;
  alb.fillRect(0, 0, W, H);

  // 5.2 20 Large, clean stylized golden-amber leaf puffs
  const numClusters = 20;
  const autumnPalettes = [
    { inner: '#fed330', mid: '#fa8231', rim: '#fff4b8' }, // Golden Amber
    { inner: '#f7b731', mid: '#eb5c17', rim: '#ffeaa7' }, // Sunny Tangerine
    { inner: '#ffeaa7', mid: '#f39c12', rim: '#fff9db' }, // Warm Honey
    { inner: '#fd9644', mid: '#d35400', rim: '#fed330' }  // Amber Flame
  ];

  for (let k = 0; k < numClusters; k++) {
    const cx = ((k * 547) % (W - 320)) + 160;
    const cy = ((k * 691) % (H - 320)) + 160;
    const baseRadius = 140 + (k % 5) * 30;
    const pal = autumnPalettes[k % autumnPalettes.length];

    // Gentle warm terracotta depth shadow
    alb.fillStyle = 'rgba(150, 55, 15, 0.28)';
    alb.beginPath();
    alb.arc(cx + 8, cy + 14, baseRadius * 1.08, 0, Math.PI * 2);
    alb.fill();

    // Cluster gradient
    const clumpGrad = alb.createRadialGradient(cx - baseRadius * 0.25, cy - baseRadius * 0.35, 10, cx, cy, baseRadius);
    clumpGrad.addColorStop(0.0, pal.inner);
    clumpGrad.addColorStop(0.5, pal.mid);
    clumpGrad.addColorStop(1.0, '#bd5810');
    alb.fillStyle = clumpGrad;

    // Scalloped multi-lobed cloud contour
    alb.beginPath();
    const lobes = 6;
    for (let l = 0; l <= lobes; l++) {
      const angle = (l / lobes) * Math.PI * 2;
      const dist = baseRadius * (0.88 + 0.18 * Math.sin(angle * 3.0 + k));
      const lx = cx + Math.cos(angle) * dist;
      const ly = cy + Math.sin(angle) * dist;
      if (l === 0) alb.moveTo(lx, ly);
      else alb.lineTo(lx, ly);
    }
    alb.closePath();
    alb.fill();

    // Warm sunlight rim highlight along top of clump
    alb.strokeStyle = pal.rim;
    alb.lineWidth = 8;
    alb.beginPath();
    alb.arc(cx, cy, baseRadius * 0.94, Math.PI * 1.1, Math.PI * 1.9);
    alb.stroke();
  }

  // 5.3 Roughness Map
  rgh.fillStyle = '#b0b0b0';
  rgh.fillRect(0, 0, W, H);

  // 5.4 Metalness Map
  met.fillStyle = '#000000';
  met.fillRect(0, 0, W, H);

  // 5.5 Bump Map (Gentle canopy dome relief)
  bmp.fillStyle = '#808080';
  bmp.fillRect(0, 0, W, H);

  bmp.fillStyle = '#9c9c9c';
  for (let k = 0; k < numClusters; k++) {
    const cx = ((k * 547) % (W - 320)) + 160;
    const cy = ((k * 691) % (H - 320)) + 160;
    const baseRadius = 140 + (k % 5) * 30;
    bmp.beginPath();
    bmp.arc(cx, cy, baseRadius * 0.85, 0, Math.PI * 2);
    bmp.fill();
  }

  const texSet = {
    map: toTexture(albC, true, true),
    roughnessMap: toTexture(rghC, false, true),
    metalnessMap: toTexture(metC, false, true),
    bumpMap: toTexture(bmpC, false, true)
  };
  textureCache.set('autumnOakFoliage', texSet);
  return texSet;
}

/* ==========================================================================
   6. BIRCH BARK TEXTURES (getBirchBarkTextures)
   Papery chalk-white bark with horizontal dark charcoal lenticels,
   peeling bark paper curls, and soft lichen patches.
   ========================================================================== */
export function getBirchBarkTextures() {
  if (textureCache.has('birchBark')) return textureCache.get('birchBark');

  const { canvas: albC, ctx: alb, width: W, height: H } = createCanvas(2048, 2048);
  const { canvas: rghC, ctx: rgh } = createCanvas(2048, 2048);
  const { canvas: metC, ctx: met } = createCanvas(2048, 2048);
  const { canvas: bmpC, ctx: bmp } = createCanvas(2048, 2048);

  // 6.1 Papery chalk-white and cream base
  const baseGrad = alb.createLinearGradient(0, 0, W, 0);
  baseGrad.addColorStop(0.0, '#e2e8f0');
  baseGrad.addColorStop(0.25, '#f8fafc');
  baseGrad.addColorStop(0.5, '#ffffff');
  baseGrad.addColorStop(0.75, '#f1f5f9');
  baseGrad.addColorStop(1.0, '#cbd5e1');
  alb.fillStyle = baseGrad;
  alb.fillRect(0, 0, W, H);

  // Fine horizontal papery grain striations
  for (let y = 0; y < H; y += 4) {
    alb.fillStyle = (y % 8 === 0) ? 'rgba(148, 163, 184, 0.08)' : 'rgba(255, 255, 255, 0.12)';
    alb.fillRect(0, y, W, 2);
  }

  // 6.2 Characteristic horizontal dark charcoal lenticels (birch dash marks)
  const numLenticels = 140;
  for (let l = 0; l < numLenticels; l++) {
    const lx = ((l * 283) % (W - 160)) + 60;
    const ly = ((l * 157) % (H - 60)) + 30;
    const len = 35 + (l % 8) * 18;
    const thick = 4 + (l % 4) * 3;

    // Lenticel dark core
    alb.fillStyle = '#0f172a';
    alb.beginPath();
    alb.ellipse(lx, ly, len * 0.5, thick * 0.5, 0, 0, Math.PI * 2);
    alb.fill();

    // Softer slate feathered edges
    alb.strokeStyle = 'rgba(71, 85, 105, 0.65)';
    alb.lineWidth = 2.5;
    alb.beginPath();
    alb.moveTo(lx - len * 0.5 - 6, ly);
    alb.lineTo(lx + len * 0.5 + 6, ly);
    alb.stroke();
  }

  // 6.3 Larger diamond-shaped nodal scars / branch knots
  const knots = [
    { x: W * 0.28, y: H * 0.25, w: 90, h: 48 },
    { x: W * 0.68, y: H * 0.62, w: 110, h: 56 },
    { x: W * 0.42, y: H * 0.82, w: 85, h: 42 }
  ];

  knots.forEach(k => {
    // Drop shadow
    alb.fillStyle = 'rgba(15, 23, 42, 0.4)';
    alb.beginPath();
    alb.ellipse(k.x + 3, k.y + 4, k.w * 0.55, k.h * 0.55, 0, 0, Math.PI * 2);
    alb.fill();

    // Dark diamond knot
    alb.fillStyle = '#020617';
    alb.beginPath();
    alb.moveTo(k.x - k.w * 0.5, k.y);
    alb.lineTo(k.x, k.y - k.h * 0.5);
    alb.lineTo(k.x + k.w * 0.5, k.y);
    alb.lineTo(k.x, k.y + k.h * 0.5);
    alb.closePath();
    alb.fill();

    // Warm ochre-brown weathered halo
    alb.strokeStyle = '#92400e';
    alb.lineWidth = 4;
    alb.stroke();

    // Core pitch
    alb.fillStyle = '#000000';
    alb.beginPath();
    alb.arc(k.x, k.y, k.h * 0.22, 0, Math.PI * 2);
    alb.fill();
  });

  // 6.4 Peeling bark paper curls
  const curls = [
    { x: 300, y: 500, len: 140, h: 22 },
    { x: 1200, y: 1100, len: 170, h: 26 },
    { x: 800, y: 1700, len: 150, h: 24 }
  ];

  curls.forEach(c => {
    // Shadow under curling strip
    alb.fillStyle = 'rgba(30, 41, 59, 0.45)';
    alb.fillRect(c.x, c.y + 8, c.len, c.h * 0.6);

    // Warm cream inner bark exposed underneath
    alb.fillStyle = '#fef3c7';
    alb.fillRect(c.x + 4, c.y + 4, c.len - 8, c.h * 0.7);

    // Curled white outer paper flap
    alb.fillStyle = '#ffffff';
    alb.beginPath();
    alb.moveTo(c.x, c.y);
    alb.quadraticCurveTo(c.x + c.len * 0.5, c.y - 12, c.x + c.len, c.y);
    alb.lineTo(c.x + c.len, c.y + 8);
    alb.quadraticCurveTo(c.x + c.len * 0.5, c.y - 4, c.x, c.y + 8);
    alb.closePath();
    alb.fill();
  });

  // 6.5 Soft sage green and pale golden lichen patches
  for (let p = 0; p < 75; p++) {
    const px = ((p * 229) % (W - 100)) + 50;
    const py = ((p * 367) % (H - 100)) + 50;
    const pr = 14 + (p % 6) * 6;

    const licGrad = alb.createRadialGradient(px, py, 2, px, py, pr);
    licGrad.addColorStop(0.0, '#a3c49e');
    licGrad.addColorStop(0.6, '#6b8f67');
    licGrad.addColorStop(1.0, 'rgba(107, 143, 103, 0)');

    alb.fillStyle = licGrad;
    alb.beginPath();
    alb.arc(px, py, pr, 0, Math.PI * 2);
    alb.fill();
  }

  // 6.6 Roughness Map (Chalky bark ~0.72, lenticels ~0.88, smooth paper curls ~0.55)
  rgh.fillStyle = '#b8b8b8'; // ~0.72 base
  rgh.fillRect(0, 0, W, H);

  rgh.fillStyle = '#e0e0e0'; // lenticels rougher
  for (let l = 0; l < numLenticels; l++) {
    const lx = ((l * 283) % (W - 160)) + 60;
    const ly = ((l * 157) % (H - 60)) + 30;
    const len = 35 + (l % 8) * 18;
    rgh.beginPath();
    rgh.ellipse(lx, ly, len * 0.5, 5, 0, 0, Math.PI * 2);
    rgh.fill();
  }

  // 6.7 Metalness Map
  met.fillStyle = '#000000';
  met.fillRect(0, 0, W, H);

  // 6.8 Bump Map (Lenticels slightly indented, curls raised)
  bmp.fillStyle = '#909090';
  bmp.fillRect(0, 0, W, H);

  bmp.fillStyle = '#404040'; // indented lenticels
  for (let l = 0; l < numLenticels; l++) {
    const lx = ((l * 283) % (W - 160)) + 60;
    const ly = ((l * 157) % (H - 60)) + 30;
    const len = 35 + (l % 8) * 18;
    bmp.beginPath();
    bmp.ellipse(lx, ly, len * 0.5, 4, 0, 0, Math.PI * 2);
    bmp.fill();
  }

  bmp.fillStyle = '#d0d0d0'; // raised peeling curls
  curls.forEach(c => {
    bmp.fillRect(c.x, c.y, c.len, 10);
  });

  const texSet = {
    map: toTexture(albC, true, true),
    roughnessMap: toTexture(rghC, false, true),
    metalnessMap: toTexture(metC, false, true),
    bumpMap: toTexture(bmpC, false, true)
  };
  textureCache.set('birchBark', texSet);
  return texSet;
}

/* ==========================================================================
   7. BIRCH FOLIAGE TEXTURES (getBirchFoliageTextures)
   Delicate airy yellow-green & golden-chartreuse leaf clusters.
   ========================================================================== */
export function getBirchFoliageTextures() {
  if (textureCache.has('birchFoliage')) return textureCache.get('birchFoliage');

  const { canvas: albC, ctx: alb, width: W, height: H } = createCanvas(2048, 2048);
  const { canvas: rghC, ctx: rgh } = createCanvas(2048, 2048);
  const { canvas: metC, ctx: met } = createCanvas(2048, 2048);
  const { canvas: bmpC, ctx: bmp } = createCanvas(2048, 2048);

  // Deep lime-forest base
  const baseGrad = alb.createRadialGradient(W * 0.5, H * 0.5, 100, W * 0.5, H * 0.5, W * 0.75);
  baseGrad.addColorStop(0.0, '#2b4d1b');
  baseGrad.addColorStop(0.5, '#1e3813');
  baseGrad.addColorStop(1.0, '#0f2009');
  alb.fillStyle = baseGrad;
  alb.fillRect(0, 0, W, H);

  // Dainty scalloped leaf clusters with golden chartreuse highlights
  const numClusters = 54;
  for (let k = 0; k < numClusters; k++) {
    const cx = ((k * 347) % (W - 220)) + 110;
    const cy = ((k * 491) % (H - 220)) + 110;
    const baseRadius = 70 + (k % 6) * 18;

    alb.fillStyle = 'rgba(10, 22, 6, 0.72)';
    alb.beginPath();
    alb.arc(cx + 6, cy + 12, baseRadius * 1.15, 0, Math.PI * 2);
    alb.fill();

    const clumpGrad = alb.createRadialGradient(cx - baseRadius * 0.2, cy - baseRadius * 0.3, 8, cx, cy, baseRadius);
    clumpGrad.addColorStop(0.0, '#bef264');
    clumpGrad.addColorStop(0.4, '#84cc16');
    clumpGrad.addColorStop(0.75, '#4d7c0f');
    clumpGrad.addColorStop(1.0, '#1a3307');
    alb.fillStyle = clumpGrad;

    alb.beginPath();
    const lobes = 7;
    for (let l = 0; l <= lobes; l++) {
      const angle = (l / lobes) * Math.PI * 2;
      const dist = baseRadius * (0.8 + 0.22 * Math.sin(angle * 4 + k));
      const lx = cx + Math.cos(angle) * dist;
      const ly = cy + Math.sin(angle) * dist;
      if (l === 0) alb.moveTo(lx, ly);
      else alb.lineTo(lx, ly);
    }
    alb.closePath();
    alb.fill();

    // Golden sunlight rim
    alb.strokeStyle = 'rgba(254, 240, 138, 0.88)';
    alb.lineWidth = 6;
    alb.beginPath();
    alb.arc(cx, cy, baseRadius * 0.94, Math.PI * 1.05, Math.PI * 1.95);
    alb.stroke();
  }

  // Roughness Map
  rgh.fillStyle = '#dedede';
  rgh.fillRect(0, 0, W, H);
  rgh.fillStyle = '#8a8a8a';
  for (let k = 0; k < numClusters; k++) {
    const cx = ((k * 347) % (W - 220)) + 110;
    const cy = ((k * 491) % (H - 220)) + 110;
    const baseRadius = 70 + (k % 6) * 18;
    rgh.beginPath();
    rgh.arc(cx, cy, baseRadius * 0.85, 0, Math.PI * 2);
    rgh.fill();
  }

  // Metalness Map
  met.fillStyle = '#000000';
  met.fillRect(0, 0, W, H);

  // Bump Map
  bmp.fillStyle = '#404040';
  bmp.fillRect(0, 0, W, H);
  bmp.fillStyle = '#bfbfbf';
  for (let k = 0; k < numClusters; k++) {
    const cx = ((k * 347) % (W - 220)) + 110;
    const cy = ((k * 491) % (H - 220)) + 110;
    const baseRadius = 70 + (k % 6) * 18;
    bmp.beginPath();
    bmp.arc(cx, cy, baseRadius * 0.9, 0, Math.PI * 2);
    bmp.fill();
  }

  const texSet = {
    map: toTexture(albC, true, true),
    roughnessMap: toTexture(rghC, false, true),
    metalnessMap: toTexture(metC, false, true),
    bumpMap: toTexture(bmpC, false, true)
  };
  textureCache.set('birchFoliage', texSet);
  return texSet;
}
