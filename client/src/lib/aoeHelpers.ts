export interface AoeTargetState {
  active: boolean;
  spell: any;
  casterTokenId: string;
  center: { x: number; y: number };
  locked: boolean;
}

export const createInitialAoeState = (): AoeTargetState => ({
  active: false,
  spell: null,
  casterTokenId: '',
  center: { x: 0, y: 0 },
  locked: false,
});

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
  casterToken?: { x: number; y: number }
): any[] {
  if (!aoeState.active || !aoeState.spell) return [];

  const { spell, center } = aoeState;
  
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
  
  const radiusPixels = (aoeRangeFeet / 5) * gridSize;

  const casterX = casterToken?.x ?? 0;
  const casterY = casterToken?.y ?? 0;

  return tokens.filter((token) => {
    const tokenCenterX = token.x + gridSize / 2;
    const tokenCenterY = token.y + gridSize / 2;

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
          casterX + gridSize / 2,
          casterY + gridSize / 2,
          center.x,
          center.y,
          90,
          radiusPixels
        );
      case 'line':
        return isTokenInLine(
          tokenCenterX,
          tokenCenterY,
          casterX + gridSize / 2,
          casterY + gridSize / 2,
          center.x,
          center.y,
          gridSize,
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
  gridSize: number
): boolean {
  const dx = targetX - casterX;
  const dy = targetY - casterY;
  const distancePixels = Math.sqrt(dx * dx + dy * dy);
  const distanceFeet = (distancePixels / gridSize) * 5;
  return distanceFeet <= rangeNum;
}
