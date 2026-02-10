export interface BlockingSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  type: 'wall' | 'door' | 'window';
}

export interface VisionPolygon {
  tokenX: number;
  tokenY: number;
  radius: number;
  points: { x: number; y: number }[];
}

interface RayIntersection {
  x: number;
  y: number;
  dist: number;
  angle: number;
}

export function getBlockingSegments(
  walls: Array<{ x1: number; y1: number; x2: number; y2: number; wallType: string; oneWayDirection?: string | null }>,
  doors: Array<{ x1: number; y1: number; x2: number; y2: number; isOpen: boolean; blocksVisionWhenClosed: boolean }>,
  windows: Array<{ x1: number; y1: number; x2: number; y2: number; shutterClosed: boolean }>
): BlockingSegment[] {
  const segments: BlockingSegment[] = [];

  for (const wall of walls) {
    if (wall.wallType === 'transparent' || wall.wallType === 'invisible') continue;
    segments.push({
      x1: wall.x1,
      y1: wall.y1,
      x2: wall.x2,
      y2: wall.y2,
      type: 'wall',
    });
  }

  for (const door of doors) {
    if (!door.isOpen && door.blocksVisionWhenClosed) {
      segments.push({
        x1: door.x1,
        y1: door.y1,
        x2: door.x2,
        y2: door.y2,
        type: 'door',
      });
    }
  }

  for (const win of windows) {
    if (win.shutterClosed) {
      segments.push({
        x1: win.x1,
        y1: win.y1,
        x2: win.x2,
        y2: win.y2,
        type: 'window',
      });
    }
  }

  return segments;
}

function lineSegmentIntersection(
  rx1: number, ry1: number, rx2: number, ry2: number,
  sx1: number, sy1: number, sx2: number, sy2: number
): { x: number; y: number; t: number } | null {
  const dx = rx2 - rx1;
  const dy = ry2 - ry1;
  const ex = sx2 - sx1;
  const ey = sy2 - sy1;

  const denom = dx * ey - dy * ex;
  if (Math.abs(denom) < 1e-10) return null;

  const t = ((sx1 - rx1) * ey - (sy1 - ry1) * ex) / denom;
  const u = ((sx1 - rx1) * dy - (sy1 - ry1) * dx) / denom;

  if (t < 0 || u < 0 || u > 1) return null;

  return {
    x: rx1 + t * dx,
    y: ry1 + t * dy,
    t,
  };
}

function castRay(
  originX: number,
  originY: number,
  angle: number,
  visionRadius: number,
  segments: BlockingSegment[]
): RayIntersection {
  const farX = originX + Math.cos(angle) * visionRadius;
  const farY = originY + Math.sin(angle) * visionRadius;

  let closestDist = visionRadius;
  let closestX = farX;
  let closestY = farY;

  for (const seg of segments) {
    const hit = lineSegmentIntersection(
      originX, originY, farX, farY,
      seg.x1, seg.y1, seg.x2, seg.y2
    );

    if (hit && hit.t > 1e-6) {
      const dist = hit.t * visionRadius;
      if (dist < closestDist) {
        closestDist = dist;
        closestX = hit.x;
        closestY = hit.y;
      }
    }
  }

  return { x: closestX, y: closestY, dist: closestDist, angle };
}

function normalizeAngle(a: number): number {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

export function calculateVisionPolygon(
  tokenX: number,
  tokenY: number,
  visionRadius: number,
  blockingSegments: BlockingSegment[]
): VisionPolygon {
  if (visionRadius <= 0) {
    return { tokenX, tokenY, radius: visionRadius, points: [] };
  }

  const angles: number[] = [];
  const EPSILON = 0.0005;

  for (const seg of blockingSegments) {
    const dx1 = seg.x1 - tokenX;
    const dy1 = seg.y1 - tokenY;
    const dx2 = seg.x2 - tokenX;
    const dy2 = seg.y2 - tokenY;
    const dist1 = Math.hypot(dx1, dy1);
    const dist2 = Math.hypot(dx2, dy2);
    if (dist1 > visionRadius * 1.5 && dist2 > visionRadius * 1.5) continue;

    const a1 = Math.atan2(dy1, dx1);
    const a2 = Math.atan2(dy2, dx2);

    angles.push(a1 - EPSILON, a1, a1 + EPSILON);
    angles.push(a2 - EPSILON, a2, a2 + EPSILON);
  }

  const STEP = Math.PI / 90;
  for (let a = -Math.PI; a < Math.PI; a += STEP) {
    angles.push(a);
  }

  const rayResults: RayIntersection[] = [];
  for (const angle of angles) {
    rayResults.push(castRay(tokenX, tokenY, angle, visionRadius, blockingSegments));
  }

  rayResults.sort((a, b) => a.angle - b.angle);

  const uniqueResults: RayIntersection[] = [];
  let lastAngle = -Infinity;
  for (const r of rayResults) {
    if (r.angle - lastAngle > 1e-6) {
      uniqueResults.push(r);
      lastAngle = r.angle;
    } else if (uniqueResults.length > 0) {
      const prev = uniqueResults[uniqueResults.length - 1];
      if (r.dist < prev.dist) {
        uniqueResults[uniqueResults.length - 1] = r;
      }
    }
  }

  return {
    tokenX,
    tokenY,
    radius: visionRadius,
    points: uniqueResults.map(r => ({ x: r.x, y: r.y })),
  };
}

function rayCircleIntersection(
  ox: number, oy: number, cosA: number, sinA: number,
  cx: number, cy: number, radius: number,
  inside: boolean
): number {
  const fx = ox - cx;
  const fy = oy - cy;
  const b = 2 * (fx * cosA + fy * sinA);
  const c = fx * fx + fy * fy - radius * radius;
  const disc = b * b - 4 * c;
  if (disc < 0) return -1;
  const sqrtDisc = Math.sqrt(disc);
  const t1 = (-b - sqrtDisc) / 2;
  const t2 = (-b + sqrtDisc) / 2;
  if (inside) {
    return t2 > 1e-6 ? t2 : -1;
  }
  if (t1 > 1e-6) return t1;
  if (t2 > 1e-6) return t2;
  return -1;
}

export function calculateVisionInLight(
  tokenX: number,
  tokenY: number,
  lightX: number,
  lightY: number,
  lightRadius: number,
  blockingSegments: BlockingSegment[]
): VisionPolygon {
  if (lightRadius <= 0) {
    return { tokenX, tokenY, radius: lightRadius, points: [] };
  }

  const distToLight = Math.hypot(lightX - tokenX, lightY - tokenY);
  const insideLight = distToLight <= lightRadius;
  const maxReach = distToLight + lightRadius;

  const lightAngle = Math.atan2(lightY - tokenY, lightX - tokenX);
  const angularSpan = insideLight
    ? Math.PI
    : Math.asin(Math.min(1, lightRadius / Math.max(1, distToLight)));

  const angles: number[] = [];
  const EPSILON = 0.0005;

  for (const seg of blockingSegments) {
    const a1 = Math.atan2(seg.y1 - tokenY, seg.x1 - tokenX);
    const a2 = Math.atan2(seg.y2 - tokenY, seg.x2 - tokenX);

    for (const a of [a1, a2]) {
      let diff = normalizeAngle(a - lightAngle);
      if (insideLight || Math.abs(diff) <= angularSpan + 0.3) {
        angles.push(a - EPSILON, a, a + EPSILON);
      }
    }
  }

  if (!insideLight && distToLight > lightRadius) {
    const tangentAngle = Math.asin(Math.min(1, lightRadius / distToLight));
    angles.push(
      lightAngle - tangentAngle - EPSILON,
      lightAngle - tangentAngle,
      lightAngle - tangentAngle + EPSILON,
      lightAngle + tangentAngle - EPSILON,
      lightAngle + tangentAngle,
      lightAngle + tangentAngle + EPSILON
    );
  }

  const STEP = Math.PI / 90;
  const sweepStart = insideLight ? -Math.PI : lightAngle - angularSpan - STEP;
  const sweepEnd = insideLight ? Math.PI : lightAngle + angularSpan + STEP;
  for (let a = sweepStart; a <= sweepEnd; a += STEP) {
    angles.push(a);
  }

  const rayResults: RayIntersection[] = [];

  for (const angle of angles) {
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const ray = castRay(tokenX, tokenY, angle, maxReach, blockingSegments);
    const wallDist = ray.dist;

    const dx = ray.x - lightX;
    const dy = ray.y - lightY;
    const distFromLight = Math.hypot(dx, dy);

    if (distFromLight <= lightRadius + 0.5) {
      rayResults.push(ray);
    } else {
      const t = rayCircleIntersection(tokenX, tokenY, cosA, sinA, lightX, lightY, lightRadius, insideLight);
      if (t > 1e-6 && t < wallDist + 0.5) {
        rayResults.push({
          x: tokenX + cosA * t,
          y: tokenY + sinA * t,
          dist: t,
          angle,
        });
      }
    }
  }

  if (rayResults.length === 0) {
    return { tokenX, tokenY, radius: lightRadius, points: [] };
  }

  rayResults.sort((a, b) => a.angle - b.angle);

  const uniqueResults: RayIntersection[] = [];
  let lastAngle = -Infinity;
  for (const r of rayResults) {
    if (r.angle - lastAngle > 1e-6) {
      uniqueResults.push(r);
      lastAngle = r.angle;
    } else if (uniqueResults.length > 0) {
      const prev = uniqueResults[uniqueResults.length - 1];
      if (r.dist < prev.dist) {
        uniqueResults[uniqueResults.length - 1] = r;
      }
    }
  }

  return {
    tokenX,
    tokenY,
    radius: lightRadius,
    points: uniqueResults.map(r => ({ x: r.x, y: r.y })),
  };
}

export function isPointVisible(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  blockingSegments: BlockingSegment[]
): boolean {
  for (const seg of blockingSegments) {
    const hit = lineSegmentIntersection(
      fromX, fromY, toX, toY,
      seg.x1, seg.y1, seg.x2, seg.y2
    );

    if (hit && hit.t > 1e-6 && hit.t < 1) {
      return false;
    }
  }

  return true;
}
