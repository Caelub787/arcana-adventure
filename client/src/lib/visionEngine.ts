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
): { x: number; y: number; t: number; u: number } | null {
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
    u,
  };
}

const ENDPOINT_U_MARGIN = 1e-4;

function castRay(
  originX: number,
  originY: number,
  angle: number,
  visionRadius: number,
  segments: BlockingSegment[],
  skipEndpointCheck = false,
  cornerEndpoints?: Set<string>
): RayIntersection {
  const farX = originX + Math.cos(angle) * visionRadius;
  const farY = originY + Math.sin(angle) * visionRadius;
  const rayDx = Math.cos(angle);
  const rayDy = Math.sin(angle);

  let closestDist = visionRadius;
  let closestX = farX;
  let closestY = farY;

  for (const seg of segments) {
    const hit = lineSegmentIntersection(
      originX, originY, farX, farY,
      seg.x1, seg.y1, seg.x2, seg.y2
    );

    if (hit && hit.t > 1e-6) {
      if (hit.u < ENDPOINT_U_MARGIN || hit.u > 1 - ENDPOINT_U_MARGIN) {
        if (skipEndpointCheck && cornerEndpoints) {
          const epX = hit.u < 0.5 ? seg.x1 : seg.x2;
          const epY = hit.u < 0.5 ? seg.y1 : seg.y2;
          const key = `${Math.round(epX)},${Math.round(epY)}`;
          if (cornerEndpoints.has(key)) {
            const dist = hit.t * visionRadius;
            if (dist < closestDist) {
              closestDist = dist;
              closestX = hit.x;
              closestY = hit.y;
            }
            continue;
          }
        }

        {
          let bodyDx: number, bodyDy: number;
          if (hit.u < 0.5) {
            bodyDx = seg.x2 - seg.x1;
            bodyDy = seg.y2 - seg.y1;
          } else {
            bodyDx = seg.x1 - seg.x2;
            bodyDy = seg.y1 - seg.y2;
          }
          const dot = bodyDx * rayDx + bodyDy * rayDy;
          if (dot <= 0) {
            continue;
          }
        }
      }

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
  blockingSegments: BlockingSegment[],
  skipEndpointCheck = false
): VisionPolygon {
  if (visionRadius <= 0) {
    return { tokenX, tokenY, radius: visionRadius, points: [] };
  }

  let cornerEndpoints: Set<string> | undefined;
  if (skipEndpointCheck) {
    const epCount = new Map<string, number>();
    for (const seg of blockingSegments) {
      const k1 = `${Math.round(seg.x1)},${Math.round(seg.y1)}`;
      const k2 = `${Math.round(seg.x2)},${Math.round(seg.y2)}`;
      epCount.set(k1, (epCount.get(k1) || 0) + 1);
      epCount.set(k2, (epCount.get(k2) || 0) + 1);
    }
    cornerEndpoints = new Set<string>();
    epCount.forEach((count, k) => {
      if (count >= 2) cornerEndpoints!.add(k);
    });
  }

  const angles: number[] = [];
  const EPSILON = 0.001;

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
    rayResults.push(castRay(tokenX, tokenY, angle, visionRadius, blockingSegments, skipEndpointCheck, cornerEndpoints));
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

function pointInPolygon(px: number, py: number, poly: { x: number; y: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const yi = poly[i].y, yj = poly[j].y;
    if ((yi > py) !== (yj > py) &&
        px < (poly[j].x - poly[i].x) * (py - yi) / (yj - yi) + poly[i].x) {
      inside = !inside;
    }
  }
  return inside;
}

function clipSegmentToPolygon(
  ax: number, ay: number, bx: number, by: number,
  poly: { x: number; y: number }[]
): { x: number; y: number }[] {
  const intersections: { x: number; y: number; t: number }[] = [];
  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length;
    const hit = lineSegmentIntersection(
      ax, ay, bx, by,
      poly[i].x, poly[i].y, poly[j].x, poly[j].y
    );
    if (hit && hit.t > 1e-6 && hit.t < 1 - 1e-6) {
      intersections.push({ x: hit.x, y: hit.y, t: hit.t });
    }
  }
  intersections.sort((a, b) => a.t - b.t);
  return intersections;
}

export function calculateVisionInLight(
  tokenX: number,
  tokenY: number,
  lightX: number,
  lightY: number,
  lightRadius: number,
  blockingSegments: BlockingSegment[],
  precomputedLightPoly?: VisionPolygon
): VisionPolygon {
  if (lightRadius <= 0) {
    return { tokenX, tokenY, radius: lightRadius, points: [] };
  }

  const lightPoly = precomputedLightPoly || calculateVisionPolygon(lightX, lightY, lightRadius, blockingSegments);
  if (lightPoly.points.length < 3) {
    return { tokenX, tokenY, radius: lightRadius, points: [] };
  }

  const lp = lightPoly.points;

  const distToLight = Math.hypot(lightX - tokenX, lightY - tokenY);
  const insideLight = distToLight <= lightRadius;
  const maxReach = distToLight + lightRadius + 50;

  const lightAngle = Math.atan2(lightY - tokenY, lightX - tokenX);
  const angularSpan = insideLight
    ? Math.PI
    : Math.asin(Math.min(1, lightRadius / Math.max(1, distToLight)));

  const angles: number[] = [];
  const EPSILON = 0.001;

  for (const seg of blockingSegments) {
    const a1 = Math.atan2(seg.y1 - tokenY, seg.x1 - tokenX);
    const a2 = Math.atan2(seg.y2 - tokenY, seg.x2 - tokenX);
    for (const a of [a1, a2]) {
      if (insideLight) {
        angles.push(a - EPSILON, a, a + EPSILON);
      } else {
        const diff = normalizeAngle(a - lightAngle);
        if (Math.abs(diff) <= angularSpan + 0.5) {
          angles.push(a - EPSILON, a, a + EPSILON);
        }
      }
    }
  }

  for (let i = 0; i < lp.length; i++) {
    const a = Math.atan2(lp[i].y - tokenY, lp[i].x - tokenX);
    if (insideLight) {
      angles.push(a - EPSILON, a, a + EPSILON);
    } else {
      const diff = normalizeAngle(a - lightAngle);
      if (Math.abs(diff) <= angularSpan + 0.5) {
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

  const STEP = Math.PI / 60;
  const sweepStart = insideLight ? -Math.PI : lightAngle - angularSpan - STEP;
  const sweepEnd = insideLight ? Math.PI : lightAngle + angularSpan + STEP;
  for (let a = sweepStart; a <= sweepEnd; a += STEP) {
    angles.push(a);
  }

  const tokenInsideLight = pointInPolygon(tokenX, tokenY, lp);
  const rayResults: RayIntersection[] = [];

  for (const angle of angles) {
    const ray = castRay(tokenX, tokenY, angle, maxReach, blockingSegments);
    const wallDist = ray.dist;

    const crossings = clipSegmentToPolygon(tokenX, tokenY, ray.x, ray.y, lp);

    let bestX = 0, bestY = 0, bestDist = -1;

    if (crossings.length === 0) {
      if (tokenInsideLight) {
        bestX = ray.x;
        bestY = ray.y;
        bestDist = wallDist;
      }
    } else {
      let inside = tokenInsideLight;

      for (const c of crossings) {
        const cDist = Math.hypot(c.x - tokenX, c.y - tokenY);
        if (inside && cDist <= wallDist + 1) {
          if (cDist > bestDist) {
            bestX = c.x;
            bestY = c.y;
            bestDist = cDist;
          }
        }
        inside = !inside;
      }

      if (inside && wallDist > bestDist) {
        if (pointInPolygon(ray.x, ray.y, lp)) {
          bestX = ray.x;
          bestY = ray.y;
          bestDist = wallDist;
        }
      }
    }

    if (bestDist > 0) {
      rayResults.push({ x: bestX, y: bestY, dist: bestDist, angle });
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
      if (r.dist > prev.dist) {
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
  const rayDx = toX - fromX;
  const rayDy = toY - fromY;
  const rayLen = Math.hypot(rayDx, rayDy);
  const nRayDx = rayLen > 0 ? rayDx / rayLen : 0;
  const nRayDy = rayLen > 0 ? rayDy / rayLen : 0;

  for (const seg of blockingSegments) {
    const hit = lineSegmentIntersection(
      fromX, fromY, toX, toY,
      seg.x1, seg.y1, seg.x2, seg.y2
    );

    if (hit && hit.t > 1e-6 && hit.t < 1) {
      if (hit.u < ENDPOINT_U_MARGIN || hit.u > 1 - ENDPOINT_U_MARGIN) {
        let bodyDx: number, bodyDy: number;
        if (hit.u < 0.5) {
          bodyDx = seg.x2 - seg.x1;
          bodyDy = seg.y2 - seg.y1;
        } else {
          bodyDx = seg.x1 - seg.x2;
          bodyDy = seg.y1 - seg.y2;
        }
        const dot = bodyDx * nRayDx + bodyDy * nRayDy;
        if (dot <= 0) {
          continue;
        }
      }
      return false;
    }
  }

  return true;
}
