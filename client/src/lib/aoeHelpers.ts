export interface AoeTargetState {
  active: boolean;
  spell: any;
  throwableItem?: any; // For throwable item AOE targeting
  casterTokenId: string;
  center: { x: number; y: number };
  locked: boolean;
  width?: number; // Width in feet for line/cone AOE (default 5ft = 1 grid cell)
}

export const createInitialAoeState = (): AoeTargetState => ({
  active: false,
  spell: null,
  casterTokenId: '',
  center: { x: 0, y: 0 },
  locked: false,
});

export function getTokenGridSpan(size: string | undefined): number {
  switch (size) {
    case 'Huge': return 2;
    case 'Gargantuan': return 3;
    default: return 1; // Tiny, Small, Medium, Large all use 1x1
  }
}

export function isTokenInCircle(
  tokenX: number,
  tokenY: number,
  centerX: number,
  centerY: number,
  radius: number
): boolean {
  const dx = tokenX - centerX;
  const dy = tokenY - centerY;
  return Math.sqrt(dx * dx + dy * dy) <= radius;
}

export function isTokenInSquare(
  tokenX: number,
  tokenY: number,
  centerX: number,
  centerY: number,
  halfSize: number
): boolean {
  return (
    Math.abs(tokenX - centerX) <= halfSize &&
    Math.abs(tokenY - centerY) <= halfSize
  );
}

export function isTokenInCone(
  tokenX: number,
  tokenY: number,
  casterX: number,
  casterY: number,
  targetX: number,
  targetY: number,
  coneAngle: number,
  coneLength: number
): boolean {
  const dirX = targetX - casterX;
  const dirY = targetY - casterY;
  const dirLen = Math.sqrt(dirX * dirX + dirY * dirY);
  if (dirLen === 0) return false;

  const normDirX = dirX / dirLen;
  const normDirY = dirY / dirLen;

  const toTokenX = tokenX - casterX;
  const toTokenY = tokenY - casterY;
  const tokenDist = Math.sqrt(toTokenX * toTokenX + toTokenY * toTokenY);

  if (tokenDist > coneLength || tokenDist === 0) return false;

  const normTokenX = toTokenX / tokenDist;
  const normTokenY = toTokenY / tokenDist;

  const dot = normDirX * normTokenX + normDirY * normTokenY;
  const angle = Math.acos(Math.max(-1, Math.min(1, dot)));

  const halfConeAngle = (coneAngle / 2) * (Math.PI / 180);
  return angle <= halfConeAngle;
}

export function isTokenInLine(
  tokenX: number,
  tokenY: number,
  casterX: number,
  casterY: number,
  targetX: number,
  targetY: number,
  lineWidth: number,
  lineLength: number
): boolean {
  const dirX = targetX - casterX;
  const dirY = targetY - casterY;
  const dirLen = Math.sqrt(dirX * dirX + dirY * dirY);
  if (dirLen === 0) return false;

  const normDirX = dirX / dirLen;
  const normDirY = dirY / dirLen;

  const toTokenX = tokenX - casterX;
  const toTokenY = tokenY - casterY;

  const projectionLength = toTokenX * normDirX + toTokenY * normDirY;
  if (projectionLength < 0 || projectionLength > lineLength) return false;

  const closestX = casterX + normDirX * projectionLength;
  const closestY = casterY + normDirY * projectionLength;

  const perpDist = Math.sqrt(
    Math.pow(tokenX - closestX, 2) + Math.pow(tokenY - closestY, 2)
  );

  return perpDist <= lineWidth / 2;
}

export function getTokensInAoe(
  tokens: any[],
  aoeState: AoeTargetState,
  gridSize: number,
  casterToken?: { x: number; y: number; id?: string; speciesSize?: string },
  aoeWidth?: number
): any[] {
  if (!aoeState.active || !aoeState.spell) return [];

  const { spell, center, casterTokenId } = aoeState;
  
  // Parse the aoe field which is in format "shape:radius" like "circle:15"
  // Fall back to separate aoeShape/aoeRange fields for backwards compatibility
  let aoeShape = 'circle';
  let aoeRangeFeet = 15;
  
  if (spell.aoe && typeof spell.aoe === 'string' && spell.aoe.includes(':')) {
    const [parsedShape, parsedRadius] = spell.aoe.split(':');
    aoeShape = (parsedShape || 'circle').toLowerCase();
    aoeRangeFeet = parseInt(parsedRadius, 10) || 15;
  } else {
    aoeShape = spell.aoeShape?.toLowerCase() || 'circle';
    aoeRangeFeet = spell.aoeRange || 15;
  }
  
  // aoeRangeFeet is the radius in feet (5ft = 1 grid cell)
  const radiusPixels = (aoeRangeFeet / 5) * gridSize;
  
  // Width for line/cone (in grid cells, default to 1 cell = 5 feet)
  const widthPixels = aoeWidth ? (aoeWidth / 5) * gridSize : gridSize;

  // Calculate caster center accounting for token size
  const casterGridSpan = getTokenGridSpan(casterToken?.speciesSize);
  const casterX = casterToken?.x ?? 0;
  const casterY = casterToken?.y ?? 0;
  const casterCenterX = casterX + (casterGridSpan * gridSize) / 2;
  const casterCenterY = casterY + (casterGridSpan * gridSize) / 2;

  return tokens.filter((token) => {
    // Exclude caster from cone and line AOE (they don't damage themselves)
    if ((aoeShape === 'cone' || aoeShape === 'line') && 
        (token.id === casterTokenId || token.id === casterToken?.id)) {
      return false;
    }
    
    // Calculate token center accounting for token size
    const tokenGridSpan = getTokenGridSpan(token.speciesSize);
    const tokenCenterX = token.x + (tokenGridSpan * gridSize) / 2;
    const tokenCenterY = token.y + (tokenGridSpan * gridSize) / 2;

    switch (aoeShape) {
      case 'circle':
        return isTokenInCircle(
          tokenCenterX,
          tokenCenterY,
          center.x,
          center.y,
          radiusPixels
        );
      case 'square':
        return isTokenInSquare(
          tokenCenterX,
          tokenCenterY,
          center.x,
          center.y,
          radiusPixels
        );
      case 'cone':
        return isTokenInCone(
          tokenCenterX,
          tokenCenterY,
          casterCenterX,
          casterCenterY,
          center.x,
          center.y,
          90,
          radiusPixels
        );
      case 'line':
        return isTokenInLine(
          tokenCenterX,
          tokenCenterY,
          casterCenterX,
          casterCenterY,
          center.x,
          center.y,
          widthPixels,
          radiusPixels
        );
      default:
        return isTokenInCircle(
          tokenCenterX,
          tokenCenterY,
          center.x,
          center.y,
          radiusPixels
        );
    }
  });
}

export function isCasterInRange(
  casterX: number,
  casterY: number,
  targetX: number,
  targetY: number,
  rangeNum: number,
  gridSize: number,
  casterSize?: string
): boolean {
  // Account for caster token size - distance is measured from edge of token
  const casterGridSpan = getTokenGridSpan(casterSize);
  const casterCenterX = casterX + (casterGridSpan * gridSize) / 2;
  const casterCenterY = casterY + (casterGridSpan * gridSize) / 2;
  
  const dx = targetX - casterCenterX;
  const dy = targetY - casterCenterY;
  const distancePixels = Math.sqrt(dx * dx + dy * dy);
  
  // Subtract the distance from caster center to edge (radius of caster token)
  const casterRadiusPixels = (casterGridSpan * gridSize) / 2;
  const effectiveDistancePixels = Math.max(0, distancePixels - casterRadiusPixels);
  
  const distanceFeet = (effectiveDistancePixels / gridSize) * 5;
  return distanceFeet <= rangeNum;
}

/**
 * Get the grid cell bounds of a token (min/max grid cells occupied)
 */
export function getTokenGridBounds(
  tokenX: number,
  tokenY: number,
  gridSize: number,
  speciesSize?: string
): { minGridX: number; minGridY: number; maxGridX: number; maxGridY: number } {
  const gridSpan = getTokenGridSpan(speciesSize);
  // Token position is in pixels, convert to grid cells
  const baseGridX = Math.floor(tokenX / gridSize);
  const baseGridY = Math.floor(tokenY / gridSize);
  return {
    minGridX: baseGridX,
    minGridY: baseGridY,
    maxGridX: baseGridX + gridSpan - 1,
    maxGridY: baseGridY + gridSpan - 1,
  };
}

/**
 * Get the bounds of a token in pixels (min/max x/y based on grid position and size)
 */
export function getTokenBounds(
  tokenX: number,
  tokenY: number,
  gridSize: number,
  speciesSize?: string
): { minX: number; minY: number; maxX: number; maxY: number } {
  const gridSpan = getTokenGridSpan(speciesSize);
  const sizePixels = gridSpan * gridSize;
  return {
    minX: tokenX,
    minY: tokenY,
    maxX: tokenX + sizePixels,
    maxY: tokenY + sizePixels,
  };
}

/**
 * Calculate the distance in feet from a point to the nearest grid cell of a token.
 * Uses Chebyshev distance (grid-based) where diagonal = 1 grid = 5ft.
 * For larger tokens (2x2, 3x3), finds the closest occupied grid cell.
 * Adjacent cells (including diagonal) = 0ft distance.
 */
export function getDistanceToTokenEdge(
  pointX: number,
  pointY: number,
  tokenX: number,
  tokenY: number,
  gridSize: number,
  speciesSize?: string
): number {
  // Convert point to grid cell
  const pointGridX = Math.floor(pointX / gridSize);
  const pointGridY = Math.floor(pointY / gridSize);
  
  // Get token's occupied grid cells
  const bounds = getTokenGridBounds(tokenX, tokenY, gridSize, speciesSize);
  
  // Calculate the number of EMPTY cells between the point and the token on each axis
  // If point is adjacent to or inside the token, gap is 0
  // Formula: gap = (separation - 1) where separation is the difference between ranges
  // For adjacent: point at 2, token at [0,1] -> 2 - 1 - 1 = 0 (adjacent, no gap)
  // For 1 cell apart: point at 3, token at [0,1] -> 3 - 1 - 1 = 1 (one cell gap)
  let gapGridX = 0;
  if (pointGridX < bounds.minGridX) {
    gapGridX = bounds.minGridX - pointGridX - 1;
  } else if (pointGridX > bounds.maxGridX) {
    gapGridX = pointGridX - bounds.maxGridX - 1;
  }
  
  let gapGridY = 0;
  if (pointGridY < bounds.minGridY) {
    gapGridY = bounds.minGridY - pointGridY - 1;
  } else if (pointGridY > bounds.maxGridY) {
    gapGridY = pointGridY - bounds.maxGridY - 1;
  }
  
  // Ensure gaps are non-negative
  gapGridX = Math.max(0, gapGridX);
  gapGridY = Math.max(0, gapGridY);
  
  // Chebyshev distance - diagonal movement = 1 grid
  const gridDistance = Math.max(gapGridX, gapGridY);
  
  // Convert to pixels for compatibility
  return gridDistance * gridSize;
}

/**
 * Calculate the distance in feet between two tokens, measuring from nearest grid cells.
 * Uses Chebyshev distance (TTRPG-style where diagonal = 5ft).
 * For large tokens, finds the closest occupied grid cells between them.
 * Adjacent tokens (including diagonal) = 0ft distance.
 */
export function getDistanceBetweenTokensFeet(
  token1X: number,
  token1Y: number,
  token1Size: string | undefined,
  token2X: number,
  token2Y: number,
  token2Size: string | undefined,
  gridSize: number
): number {
  const bounds1 = getTokenGridBounds(token1X, token1Y, gridSize, token1Size);
  const bounds2 = getTokenGridBounds(token2X, token2Y, gridSize, token2Size);
  
  // Calculate the number of EMPTY cells between the two tokens on each axis
  // Adjacent/overlapping tokens have 0 empty cells between them
  // Formula: gap = (min_of_one - max_of_other - 1) when not overlapping
  // Example: token1 at [0,0], token2 at [2,2] -> 2 - 0 - 1 = 1 cell gap = 5ft
  // Example: token1 at [0,0], token2 at [1,1] -> 1 - 0 - 1 = 0 cell gap = 0ft (adjacent)
  let gapGridX = 0;
  if (bounds1.maxGridX < bounds2.minGridX) {
    gapGridX = bounds2.minGridX - bounds1.maxGridX - 1;
  } else if (bounds2.maxGridX < bounds1.minGridX) {
    gapGridX = bounds1.minGridX - bounds2.maxGridX - 1;
  }
  
  let gapGridY = 0;
  if (bounds1.maxGridY < bounds2.minGridY) {
    gapGridY = bounds2.minGridY - bounds1.maxGridY - 1;
  } else if (bounds2.maxGridY < bounds1.minGridY) {
    gapGridY = bounds1.minGridY - bounds2.maxGridY - 1;
  }
  
  // Ensure gaps are non-negative
  gapGridX = Math.max(0, gapGridX);
  gapGridY = Math.max(0, gapGridY);
  
  // Chebyshev distance - diagonal movement counts as 1 grid cell (5ft)
  const gridDistance = Math.max(gapGridX, gapGridY);
  
  // Convert to feet (1 grid cell = 5 feet)
  return gridDistance * 5;
}

/**
 * Check if a point is within range of a token, accounting for token size.
 * Measures from the nearest grid cell of the token using Chebyshev distance.
 */
export function isPointInRangeOfToken(
  pointX: number,
  pointY: number,
  tokenX: number,
  tokenY: number,
  tokenSize: string | undefined,
  rangeFeet: number,
  gridSize: number
): boolean {
  const distancePixels = getDistanceToTokenEdge(pointX, pointY, tokenX, tokenY, gridSize, tokenSize);
  const distanceFeet = (distancePixels / gridSize) * 5;
  return distanceFeet <= rangeFeet;
}

/**
 * Check if a token is within range of another token, measuring from nearest grid cells.
 * Uses Chebyshev distance (TTRPG-style where diagonal = 5ft).
 */
export function isTokenInRangeOfToken(
  attackerX: number,
  attackerY: number,
  attackerSize: string | undefined,
  targetX: number,
  targetY: number,
  targetSize: string | undefined,
  rangeFeet: number,
  gridSize: number
): boolean {
  const distanceFeet = getDistanceBetweenTokensFeet(
    attackerX, attackerY, attackerSize,
    targetX, targetY, targetSize,
    gridSize
  );
  return distanceFeet <= rangeFeet;
}
