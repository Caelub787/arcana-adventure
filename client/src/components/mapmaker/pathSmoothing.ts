// Catmull-Rom-to-Bezier smoothing for a closed loop of points — turns the
// jagged polygon you get from clicking points around a landmass into the
// soft, hand-inked coastline look Inkarnate-style maps use. Traces the
// smoothed path onto a canvas context; the caller fills/strokes it.
export interface Point { x: number; y: number }

export function traceSmoothClosedPath(ctx: CanvasRenderingContext2D, points: Point[]) {
  const n = points.length;
  if (n < 3) return;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n];
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    const p3 = points[(i + 2) % n];
    const cp1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const cp2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    ctx.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, p2.x, p2.y);
  }
  ctx.closePath();
}

// Same idea for an open path (rivers/roads) — no wraparound, ends stay put.
export function traceSmoothOpenPath(ctx: CanvasRenderingContext2D, points: Point[]) {
  const n = points.length;
  if (n < 2) return;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  if (n === 2) {
    ctx.lineTo(points[1].x, points[1].y);
    return;
  }
  for (let i = 0; i < n - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(n - 1, i + 2)];
    const cp1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const cp2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    ctx.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, p2.x, p2.y);
  }
}
