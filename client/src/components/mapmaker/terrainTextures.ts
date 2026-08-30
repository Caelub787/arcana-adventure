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

const TILE_SIZE = 220;

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
      speckle(ctx, seed, 260, 2, 6, ['#5c9448', '#3a6530', '#6ba859'], 0.2, 0.45);
      break;
    case 'forest':
      ctx.fillStyle = '#2d5016';
      ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
      speckle(ctx, seed, 90, 8, 18, ['#1f3a0f', '#3a6620', '#254512'], 0.35, 0.6);
      speckle(ctx, seed, 200, 2, 5, ['#3f7024', '#1a300c'], 0.2, 0.4);
      break;
    case 'sand':
      ctx.fillStyle = '#d4b483';
      ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
      speckle(ctx, seed, 300, 1.5, 4, ['#e0c79a', '#bfa06d', '#c9ac7a'], 0.2, 0.4);
      break;
    case 'water':
      ctx.fillStyle = '#2a5f8f';
      ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
      for (let i = 0; i < 40; i++) {
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
      speckle(ctx, seed, 70, 6, 16, ['#4f4f4f', '#8a8a8a', '#5c5c5c'], 0.3, 0.55);
      speckle(ctx, seed, 180, 1, 3, ['#3a3a3a', '#a0a0a0'], 0.2, 0.4);
      break;
    case 'snow':
      ctx.fillStyle = '#e8e8e8';
      ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
      speckle(ctx, seed, 200, 1.5, 4, ['#ffffff', '#c9d6de', '#d8e2e8'], 0.15, 0.35);
      break;
    case 'road':
      ctx.fillStyle = '#8b7355';
      ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
      speckle(ctx, seed, 220, 1.5, 4, ['#9c8264', '#6f5a41', '#7a6249'], 0.2, 0.4);
      speckle(ctx, seed, 30, 4, 9, ['#5c4a35', '#a8916f'], 0.25, 0.4);
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

// Bucket/paint-fill: flood-fills the region connected to (startX, startY)
// with the given terrain texture. Textures are speckled (not flat color),
// so this compares each pixel to the STARTING pixel's color within a
// tolerance — the same technique paint programs use for a "magic wand"
// selection on noisy/textured source images — rather than requiring exact
// color matches, which would leak through every fleck of grain.
export function floodFillTerrain(ctx: CanvasRenderingContext2D, startX: number, startY: number, fillKind: TerrainKind, tolerance = 60) {
  const canvas = ctx.canvas;
  const w = canvas.width, h = canvas.height;
  const sx = Math.round(startX), sy = Math.round(startY);
  if (sx < 0 || sy < 0 || sx >= w || sy >= h) return;

  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;
  const startIdx = (sy * w + sx) * 4;
  const tr = data[startIdx], tg = data[startIdx + 1], tb = data[startIdx + 2];

  // Render the fill texture into an offscreen buffer the same size as the
  // canvas so we can read a per-pixel fill color (canvas patterns don't
  // expose that directly).
  const fillCanvas = document.createElement('canvas');
  fillCanvas.width = w; fillCanvas.height = h;
  const fillCtx = fillCanvas.getContext('2d')!;
  fillCtx.fillStyle = getTerrainPattern(fillCtx, fillKind);
  fillCtx.fillRect(0, 0, w, h);
  const fillData = fillCtx.getImageData(0, 0, w, h).data;

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
