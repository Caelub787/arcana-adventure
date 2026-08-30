// Placeholder tileable terrain textures for the Map Maker's Land/Water
// brush. Real hand-painted textures are the eventual replacement — these
// are procedurally speckled swatches (a base color plus scattered grain)
// so painted terrain reads as an actual material rather than a flat
// color fill. Grain is scattered independently of any large-scale
// pattern, so unlike true Perlin-style noise it needs no seam-matching to
// tile convincingly — fine texture doesn't show repeat boundaries.
export type TerrainKind = 'grass' | 'forest' | 'sand' | 'water' | 'stone' | 'snow' | 'road';

export const TERRAIN_KINDS: { kind: TerrainKind; label: string }[] = [
  { kind: 'grass', label: 'Grass' },
  { kind: 'forest', label: 'Forest Floor' },
  { kind: 'sand', label: 'Sand' },
  { kind: 'water', label: 'Water' },
  { kind: 'stone', label: 'Stone' },
  { kind: 'snow', label: 'Snow' },
  { kind: 'road', label: 'Road / Dirt' },
];

const TILE_SIZE = 340;

function rand(seed: { v: number }) {
  // Small deterministic-ish LCG so a given texture's grain is reproducible
  // per page load without needing crypto-quality randomness.
  seed.v = (seed.v * 1103515245 + 12345) & 0x7fffffff;
  return seed.v / 0x7fffffff;
}

function speckle(ctx: CanvasRenderingContext2D, seed: { v: number }, count: number, sizeMin: number, sizeMax: number, colors: string[], alphaMin = 0.15, alphaMax = 0.4) {
  for (let i = 0; i < count; i++) {
    const x = rand(seed) * TILE_SIZE;
    const y = rand(seed) * TILE_SIZE;
    const size = sizeMin + rand(seed) * (sizeMax - sizeMin);
    const color = colors[Math.floor(rand(seed) * colors.length)];
    ctx.globalAlpha = alphaMin + rand(seed) * (alphaMax - alphaMin);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(x, y, size, size * (0.7 + rand(seed) * 0.6), rand(seed) * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function buildTexture(kind: TerrainKind): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = TILE_SIZE;
  canvas.height = TILE_SIZE;
  const ctx = canvas.getContext('2d')!;
  const seed = { v: (kind.charCodeAt(0) * 9973 + kind.length * 131) & 0x7fffffff };

  switch (kind) {
    case 'grass':
      ctx.fillStyle = '#4a7c3a';
      ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
      speckle(ctx, seed, 620, 2, 6, ['#5c9448', '#3a6530', '#6ba859'], 0.2, 0.45);
      break;
    case 'forest':
      ctx.fillStyle = '#2d5016';
      ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
      speckle(ctx, seed, 215, 8, 18, ['#1f3a0f', '#3a6620', '#254512'], 0.35, 0.6);
      speckle(ctx, seed, 480, 2, 5, ['#3f7024', '#1a300c'], 0.2, 0.4);
      break;
    case 'sand':
      ctx.fillStyle = '#d4b483';
      ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
      speckle(ctx, seed, 720, 1.5, 4, ['#e0c79a', '#bfa06d', '#c9ac7a'], 0.2, 0.4);
      break;
    case 'water':
      ctx.fillStyle = '#2a5f8f';
      ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
      for (let i = 0; i < 95; i++) {
        const x = rand(seed) * TILE_SIZE, y = rand(seed) * TILE_SIZE;
        const w = 14 + rand(seed) * 22;
        ctx.globalAlpha = 0.12 + rand(seed) * 0.18;
        ctx.strokeStyle = rand(seed) > 0.5 ? '#4a86b8' : '#1a3f6f';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + w / 2, y + (rand(seed) - 0.5) * 6, x + w, y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      break;
    case 'stone':
      ctx.fillStyle = '#6b6b6b';
      ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
      speckle(ctx, seed, 170, 6, 16, ['#4f4f4f', '#8a8a8a', '#5c5c5c'], 0.3, 0.55);
      speckle(ctx, seed, 430, 1, 3, ['#3a3a3a', '#a0a0a0'], 0.2, 0.4);
      break;
    case 'snow':
      ctx.fillStyle = '#e8e8e8';
      ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
      speckle(ctx, seed, 480, 1.5, 4, ['#ffffff', '#c9d6de', '#d8e2e8'], 0.15, 0.35);
      break;
    case 'road':
      ctx.fillStyle = '#8b7355';
      ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
      speckle(ctx, seed, 530, 1.5, 4, ['#9c8264', '#6f5a41', '#7a6249'], 0.2, 0.4);
      speckle(ctx, seed, 70, 4, 9, ['#5c4a35', '#a8916f'], 0.25, 0.4);
      break;
  }
  return canvas;
}

const cache = new Map<TerrainKind, HTMLCanvasElement>();

export function getTerrainTextureCanvas(kind: TerrainKind): HTMLCanvasElement {
  let c = cache.get(kind);
  if (!c) {
    c = buildTexture(kind);
    cache.set(kind, c);
  }
  return c;
}

export function getTerrainPattern(ctx: CanvasRenderingContext2D, kind: TerrainKind): CanvasPattern {
  return ctx.createPattern(getTerrainTextureCanvas(kind), 'repeat')!;
}

// A single, large, already-tiled source image per (kind, size, scale) —
// generated once and cached, not regenerated per brush dab. Every tool
// (brush, land shape, river/road, bucket) reads from this SAME static
// canvas at world-aligned coordinates, so no matter how strokes overlap
// or which tool touched an area, the grain is always the one continuous
// image — there's no "stamp" boundary to see, because nothing is ever
// stamped twice from independent copies of the tile.
const fullTextureCache = new Map<string, HTMLCanvasElement>();

export function getFullSizeTerrainTexture(kind: TerrainKind, width: number, height: number, scale = 1): HTMLCanvasElement {
  const w = Math.max(1, Math.round(width)), h = Math.max(1, Math.round(height));
  const key = `${kind}:${w}:${h}:${scale}`;
  let c = fullTextureCache.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d')!;
  const tile = getTerrainTextureCanvas(kind);
  let source: HTMLCanvasElement = tile;
  if (scale !== 1) {
    const scaled = document.createElement('canvas');
    scaled.width = Math.max(8, Math.round(tile.width * scale));
    scaled.height = Math.max(8, Math.round(tile.height * scale));
    const sctx = scaled.getContext('2d')!;
    sctx.imageSmoothingEnabled = true;
    sctx.drawImage(tile, 0, 0, scaled.width, scaled.height);
    source = scaled;
  }
  ctx.fillStyle = ctx.createPattern(source, 'repeat')!;
  ctx.fillRect(0, 0, w, h);
  fullTextureCache.set(key, c);
  if (fullTextureCache.size > 30) {
    const firstKey = fullTextureCache.keys().next().value;
    if (firstKey) fullTextureCache.delete(firstKey);
  }
  return c;
}

// Bucket/paint-fill: flood-fills the region connected to (startX, startY)
// with the given terrain texture. Textures are speckled (not flat color),
// so this compares each pixel to the STARTING pixel's color within a
// tolerance — the same technique paint programs use for a "magic wand"
// selection on noisy/textured source images — rather than requiring exact
// color matches, which would leak through every fleck of grain.
export function floodFillTerrain(ctx: CanvasRenderingContext2D, startX: number, startY: number, fillKind: TerrainKind, scale = 1, tolerance = 60) {
  const canvas = ctx.canvas;
  const w = canvas.width, h = canvas.height;
  const sx = Math.round(startX), sy = Math.round(startY);
  if (sx < 0 || sy < 0 || sx >= w || sy >= h) return;

  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;
  const startIdx = (sy * w + sx) * 4;
  const tr = data[startIdx], tg = data[startIdx + 1], tb = data[startIdx + 2];

  // Read fill color from the same cached full-size source every other tool
  // uses, so a bucket fill matches whatever the brush would have painted.
  const fillData = getFullSizeTerrainTexture(fillKind, w, h, scale).getContext('2d')!.getImageData(0, 0, w, h).data;

  // Each pixel is marked visited (and painted) the moment it's pushed, not
  // when it's popped — so it can only ever be pushed once, which bounds
  // the stack to exactly w*h coordinate pairs with no risk of overflow.
  const visited = new Uint8Array(w * h);
  const stack = new Int32Array(w * h * 2);
  let sp = 0;
  const toleranceSq = tolerance * tolerance;

  const paint = (p: number) => {
    const i = p * 4;
    data[i] = fillData[i]; data[i + 1] = fillData[i + 1]; data[i + 2] = fillData[i + 2]; data[i + 3] = 255;
  };
  const tryPush = (x: number, y: number) => {
    if (x < 0 || x >= w || y < 0 || y >= h) return;
    const p = y * w + x;
    if (visited[p]) return;
    const i = p * 4;
    const dr = data[i] - tr, dg = data[i + 1] - tg, db = data[i + 2] - tb;
    if (dr * dr + dg * dg + db * db > toleranceSq) return;
    visited[p] = 1;
    paint(p);
    stack[sp++] = x; stack[sp++] = y;
  };

  tryPush(sx, sy);
  while (sp > 0) {
    const y = stack[--sp];
    const x = stack[--sp];
    tryPush(x + 1, y);
    tryPush(x - 1, y);
    tryPush(x, y + 1);
    tryPush(x, y - 1);
  }

  ctx.putImageData(imgData, 0, 0);
}

// --- soft (feathered) painting -------------------------------------------
// Inkarnate's own docs call out brush "softness" as a core control — a
// hard-edged dab reads as pixelated/cutout, a soft one blends into
// whatever's underneath. softness is 0 (hard circle) to 100 (very feathered).
const softMaskCache = new Map<string, HTMLCanvasElement>();

function getSoftMask(diameter: number, softness: number): HTMLCanvasElement {
  const d = Math.max(4, Math.round(diameter));
  const key = `${d}:${Math.round(softness)}`;
  let mask = softMaskCache.get(key);
  if (mask) return mask;
  mask = document.createElement('canvas');
  mask.width = d; mask.height = d;
  const ctx = mask.getContext('2d')!;
  const r = d / 2;
  // softness 0 -> inner stop at ~0.92 (barely feathered), 100 -> inner
  // stop at ~0.1 (almost entirely gradient).
  const innerStop = Math.max(0.05, 0.92 - (softness / 100) * 0.82);
  const grad = ctx.createRadialGradient(r, r, r * innerStop, r, r, r);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(r, r, r, 0, Math.PI * 2);
  ctx.fill();
  softMaskCache.set(key, mask);
  if (softMaskCache.size > 60) {
    // drop the oldest entry so brush-size dragging can't grow this forever
    const firstKey = softMaskCache.keys().next().value;
    if (firstKey) softMaskCache.delete(firstKey);
  }
  return mask;
}

// Reveals one feathered dab's worth of the SAME big source texture at its
// world-aligned position — not a freshly-stamped tile copy. Because every
// dab (and every other tool) reads from the identical static source image,
// two overlapping or adjacent dabs always show the exact same underlying
// pixels in their overlap, so there's no seam, no repeated-tile look, and
// no visible "stamp" — it reads as one continuous painted material, the
// same way revealing a mask over a single background image would.
export function paintSoftDab(mainCtx: CanvasRenderingContext2D, x: number, y: number, diameter: number, sourceTexture: HTMLCanvasElement, softness: number, scratch: HTMLCanvasElement) {
  const d = Math.max(4, Math.round(diameter));
  if (scratch.width !== d || scratch.height !== d) { scratch.width = d; scratch.height = d; }
  const dctx = scratch.getContext('2d')!;
  dctx.clearRect(0, 0, d, d);
  dctx.globalCompositeOperation = 'source-over';
  const sx = x - d / 2, sy = y - d / 2;
  dctx.drawImage(sourceTexture, sx, sy, d, d, 0, 0, d, d);
  dctx.globalCompositeOperation = 'destination-in';
  dctx.drawImage(getSoftMask(d, softness), 0, 0);
  dctx.globalCompositeOperation = 'source-over';
  mainCtx.drawImage(scratch, sx, sy);
}

// --- feathered shape/path fills ------------------------------------------
// Fills a smoothed closed (land shape) or open (river/road) path with soft
// edges plus a thin blurred ink line for depth — the "shadow where waves
// meet rocks" darkening Inkarnate's coastline guide describes, done here as
// a blurred multiply-ish stroke rather than a hard outline. Bounded to the
// path's own bounding box (not the whole map) so it stays cheap regardless
// of overall map size.
export function fillSmoothPathFeathered(
  mainCtx: CanvasRenderingContext2D,
  tracePath: (ctx: CanvasRenderingContext2D) => void,
  points: { x: number; y: number }[],
  kind: TerrainKind,
  closed: boolean,
  strokeWidth: number,
  softnessPx: number,
  scale = 1,
) {
  if (points.length === 0) return;
  const pad = Math.max(24, strokeWidth) + softnessPx * 2 + 16;
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  const minX = Math.min(...xs) - pad, minY = Math.min(...ys) - pad;
  const maxX = Math.max(...xs) + pad, maxY = Math.max(...ys) + pad;
  const w = Math.max(1, Math.ceil(maxX - minX)), h = Math.max(1, Math.ceil(maxY - minY));

  const silhouette = document.createElement('canvas');
  silhouette.width = w; silhouette.height = h;
  const sctx = silhouette.getContext('2d')!;
  sctx.translate(-minX, -minY);
  sctx.fillStyle = '#fff'; sctx.strokeStyle = '#fff';
  sctx.lineCap = 'round'; sctx.lineJoin = 'round';
  sctx.lineWidth = strokeWidth;
  tracePath(sctx);
  if (closed) sctx.fill(); else sctx.stroke();

  const blurred = document.createElement('canvas');
  blurred.width = w; blurred.height = h;
  const bctx = blurred.getContext('2d')!;
  bctx.filter = `blur(${Math.max(1, softnessPx)}px)`;
  bctx.drawImage(silhouette, 0, 0);
  bctx.filter = 'none';

  const layer = document.createElement('canvas');
  layer.width = w; layer.height = h;
  const lctx = layer.getContext('2d')!;
  // Sample the exact world-aligned region of the same big cached source
  // texture every other tool reads from, clamped to its bounds.
  const sourceTexture = getFullSizeTerrainTexture(kind, mainCtx.canvas.width, mainCtx.canvas.height, scale);
  const clampedMinX = Math.max(0, minX), clampedMinY = Math.max(0, minY);
  const clampedMaxX = Math.min(sourceTexture.width, maxX), clampedMaxY = Math.min(sourceTexture.height, maxY);
  const srcW = Math.max(0, clampedMaxX - clampedMinX), srcH = Math.max(0, clampedMaxY - clampedMinY);
  if (srcW > 0 && srcH > 0) {
    lctx.drawImage(
      sourceTexture,
      clampedMinX, clampedMinY, srcW, srcH,
      clampedMinX - minX, clampedMinY - minY, srcW, srcH,
    );
  }
  lctx.globalCompositeOperation = 'destination-in';
  lctx.drawImage(blurred, 0, 0);
  lctx.globalCompositeOperation = 'source-over';

  // Ink shadow line for depth (coastline/riverbank), re-clipped to the
  // feathered silhouette afterward so it can't spill past the soft edge.
  lctx.save();
  lctx.translate(-minX, -minY);
  lctx.strokeStyle = 'rgba(32,24,14,0.5)';
  lctx.lineWidth = closed ? 7 : strokeWidth * 0.22 + 5;
  lctx.filter = 'blur(1.5px)';
  lctx.lineCap = 'round'; lctx.lineJoin = 'round';
  tracePath(lctx);
  lctx.stroke();
  lctx.restore();
  lctx.globalCompositeOperation = 'destination-in';
  lctx.drawImage(blurred, 0, 0);
  lctx.globalCompositeOperation = 'source-over';

  mainCtx.drawImage(layer, minX, minY);
}

// --- organic procedural generation -----------------------------------------
// A biome "band": every elevation value up to (and above the previous
// band's) `max` renders as this terrain kind. Bands must be given in
// ascending `max` order and should span up to 1.
export interface TerrainBand {
  kind: TerrainKind;
  max: number;
}

// Composites a full multi-biome terrain fill out of the SAME cached
// full-size textures every brush/shape/bucket tool reads from — one band
// at a time, each revealed through a soft elevation-threshold mask —
// instead of classifying at low resolution and pattern-filling flat-color
// cells (which reads as a blurry mosaic rather than real terrain, and
// looks nothing like the actual painted texture quality elsewhere in the
// editor). Each band's mask is built at a fraction of full resolution
// (`downscale`) and smoothly upscaled, so its boundary is organically
// anti-aliased by the browser's own bilinear filtering rather than a hard
// per-cell edge — this is what turns a noise threshold into a soft,
// natural-looking coastline/biome transition.
export function renderOrganicTerrain(
  mainCtx: CanvasRenderingContext2D,
  width: number,
  height: number,
  elevationAt: (worldX: number, worldY: number) => number,
  bands: TerrainBand[],
  scale = 1,
  downscale = 4,
) {
  const w = Math.max(1, Math.round(width)), h = Math.max(1, Math.round(height));
  const smallW = Math.max(1, Math.round(w / downscale));
  const smallH = Math.max(1, Math.round(h / downscale));

  const elev = new Float32Array(smallW * smallH);
  for (let y = 0; y < smallH; y++) {
    for (let x = 0; x < smallW; x++) {
      elev[y * smallW + x] = Math.max(0, Math.min(1, elevationAt(x * downscale, y * downscale)));
    }
  }

  let prevMax = 0;
  for (const band of bands) {
    const lo = prevMax, hi = Math.max(lo, band.max);
    const feather = Math.max(0.02, (hi - lo) * 0.4);
    const smallMask = document.createElement('canvas');
    smallMask.width = smallW; smallMask.height = smallH;
    const smctx = smallMask.getContext('2d')!;
    const maskData = smctx.createImageData(smallW, smallH);
    for (let p = 0; p < smallW * smallH; p++) {
      const e = elev[p];
      let a: number;
      if (e <= lo - feather || e >= hi + feather) a = 0;
      else if (e >= lo + feather && e <= hi - feather) a = 1;
      else if (e < lo + feather) a = (e - (lo - feather)) / (2 * feather);
      else a = 1 - (e - (hi - feather)) / (2 * feather);
      maskData.data[p * 4 + 3] = Math.max(0, Math.min(255, Math.round(a * 255)));
    }
    smctx.putImageData(maskData, 0, 0);

    const fullMask = document.createElement('canvas');
    fullMask.width = w; fullMask.height = h;
    const fmctx = fullMask.getContext('2d')!;
    fmctx.imageSmoothingEnabled = true;
    (fmctx as any).imageSmoothingQuality = 'high';
    fmctx.drawImage(smallMask, 0, 0, smallW, smallH, 0, 0, w, h);

    fmctx.globalCompositeOperation = 'source-in';
    fmctx.drawImage(getFullSizeTerrainTexture(band.kind, w, h, scale), 0, 0);
    fmctx.globalCompositeOperation = 'source-over';

    mainCtx.drawImage(fullMask, 0, 0);
    prevMax = band.max;
  }
}
