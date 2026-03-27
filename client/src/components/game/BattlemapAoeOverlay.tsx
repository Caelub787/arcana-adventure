import React, { useMemo } from 'react';
import { type AoeTargetState, isCasterInRange } from '@/lib/aoeHelpers';

interface BattlemapAoeOverlayProps {
  aoeTargetState: AoeTargetState;
  gridSize: number;
  casterToken?: { x: number; y: number };
  panX: number;
  panY: number;
  zoom: number;
}

export function BattlemapAoeOverlay({
  aoeTargetState,
  gridSize,
  casterToken,
  panX,
  panY,
  zoom,
}: BattlemapAoeOverlayProps) {
  if (!aoeTargetState.active || !aoeTargetState.spell) return null;
  if (!aoeTargetState.locked && aoeTargetState.center.x === 0 && aoeTargetState.center.y === 0) return null;

  const { spell, center, locked, width: aoeWidth } = aoeTargetState;
  
  // Parse the aoe field which is in format "shape:radius" like "circle:15"
  // Fall back to separate aoeShape/aoeRange fields for backwards compatibility
  let aoeShape = 'circle';
  let aoeRangeFeet = 15;
  
  const aoeField = spell.aoe || '';
  if (aoeField && typeof aoeField === 'string' && aoeField.includes(':')) {
    const [parsedShape, parsedRadius] = aoeField.split(':');
    aoeShape = (parsedShape || 'circle').toLowerCase();
    aoeRangeFeet = parseInt(parsedRadius, 10) || 15;
  } else if (spell.aoeShape || spell.aoeRange) {
    aoeShape = (spell.aoeShape || 'circle').toLowerCase();
    aoeRangeFeet = spell.aoeRange || 15;
  }
  const spellRangeFeet = spell.rangeNum || 30;
  // AOE stat is the diameter (edge-to-edge distance), not radius
  // 30ft AOE = 6 squares diameter = 3 squares radius
  // Each grid square = 5ft
  const diameterInCells = aoeRangeFeet / 5;
  const radiusPixels = (diameterInCells / 2) * gridSize;

  const casterX = casterToken ? casterToken.x + gridSize / 2 : 0;
  const casterY = casterToken ? casterToken.y + gridSize / 2 : 0;

  const isInRange = casterToken
    ? isCasterInRange(casterX, casterY, center.x, center.y, spellRangeFeet, gridSize)
    : true;

  const fillColor = isInRange 
    ? 'rgba(139, 92, 246, 0.3)' 
    : 'rgba(239, 68, 68, 0.3)';
  const strokeColor = isInRange 
    ? 'rgba(139, 92, 246, 0.8)' 
    : 'rgba(239, 68, 68, 0.8)';
  const lockedFillColor = 'rgba(139, 92, 246, 0.5)';
  const lockedStrokeColor = 'rgba(139, 92, 246, 1)';

  const actualFill = locked ? lockedFillColor : fillColor;
  const actualStroke = locked ? lockedStrokeColor : strokeColor;

  const renderShape = () => {
    switch (aoeShape) {
      case 'circle':
        return (
          <circle
            cx={center.x}
            cy={center.y}
            r={radiusPixels}
            fill={actualFill}
            stroke={actualStroke}
            strokeWidth={2 / zoom}
            strokeDasharray={locked ? 'none' : `${8 / zoom} ${4 / zoom}`}
          />
        );

      case 'square':
        return (
          <rect
            x={center.x - radiusPixels}
            y={center.y - radiusPixels}
            width={radiusPixels * 2}
            height={radiusPixels * 2}
            fill={actualFill}
            stroke={actualStroke}
            strokeWidth={2 / zoom}
            strokeDasharray={locked ? 'none' : `${8 / zoom} ${4 / zoom}`}
          />
        );

      case 'cone':
        if (!casterToken) return null;
        const angleRad = Math.atan2(center.y - casterY, center.x - casterX);
        const halfConeAngle = (90 / 2) * (Math.PI / 180);
        const leftAngle = angleRad - halfConeAngle;
        const rightAngle = angleRad + halfConeAngle;
        const leftX = casterX + Math.cos(leftAngle) * radiusPixels;
        const leftY = casterY + Math.sin(leftAngle) * radiusPixels;
        const rightX = casterX + Math.cos(rightAngle) * radiusPixels;
        const rightY = casterY + Math.sin(rightAngle) * radiusPixels;
        const arcSweep = '0';
        const largeArc = '0';
        return (
          <path
            d={`
              M ${casterX} ${casterY}
              L ${leftX} ${leftY}
              A ${radiusPixels} ${radiusPixels} 0 ${largeArc} 1 ${rightX} ${rightY}
              Z
            `}
            fill={actualFill}
            stroke={actualStroke}
            strokeWidth={2 / zoom}
            strokeDasharray={locked ? 'none' : `${8 / zoom} ${4 / zoom}`}
          />
        );

      case 'line':
        if (!casterToken) return null;
        // Use aoeWidth in feet (default 5ft = 1 grid cell)
        const lineWidth = aoeWidth ? (aoeWidth / 5) * gridSize : gridSize;
        const dirX = center.x - casterX;
        const dirY = center.y - casterY;
        const dirLen = Math.sqrt(dirX * dirX + dirY * dirY);
        if (dirLen === 0) return null;
        const normX = dirX / dirLen;
        const normY = dirY / dirLen;
        const perpX = -normY * (lineWidth / 2);
        const perpY = normX * (lineWidth / 2);
        const endX = casterX + normX * radiusPixels;
        const endY = casterY + normY * radiusPixels;
        return (
          <polygon
            points={`
              ${casterX + perpX},${casterY + perpY}
              ${endX + perpX},${endY + perpY}
              ${endX - perpX},${endY - perpY}
              ${casterX - perpX},${casterY - perpY}
            `}
            fill={actualFill}
            stroke={actualStroke}
            strokeWidth={2 / zoom}
            strokeDasharray={locked ? 'none' : `${8 / zoom} ${4 / zoom}`}
          />
        );

      default:
        return (
          <circle
            cx={center.x}
            cy={center.y}
            r={radiusPixels}
            fill={actualFill}
            stroke={actualStroke}
            strokeWidth={2 / zoom}
            strokeDasharray={locked ? 'none' : `${8 / zoom} ${4 / zoom}`}
          />
        );
    }
  };

  // Convert world coordinates to screen coordinates
  // World coords are in the 0-2000 range (map content area)
  // Screen position = (worldCoord + 9000) * zoom + pan - 9000
  // But since we're inside an SVG that fills the viewport, we need direct screen coords
  const screenCenterX = (center.x + 9000) * zoom + panX - 9000;
  const screenCenterY = (center.y + 9000) * zoom + panY - 9000;
  const screenCasterX = casterToken ? (casterToken.x + gridSize/2 + 9000) * zoom + panX - 9000 : 0;
  const screenCasterY = casterToken ? (casterToken.y + gridSize/2 + 9000) * zoom + panY - 9000 : 0;
  // Radius should scale with zoom to maintain proper size relative to the grid
  const screenRadius = radiusPixels * zoom;

  const renderScreenShape = () => {
    switch (aoeShape) {
      case 'circle':
        return (
          <circle
            cx={screenCenterX}
            cy={screenCenterY}
            r={screenRadius}
            fill={actualFill}
            stroke={actualStroke}
            strokeWidth={2}
            strokeDasharray={locked ? 'none' : '8 4'}
          />
        );

      case 'square':
        return (
          <rect
            x={screenCenterX - screenRadius}
            y={screenCenterY - screenRadius}
            width={screenRadius * 2}
            height={screenRadius * 2}
            fill={actualFill}
            stroke={actualStroke}
            strokeWidth={2}
            strokeDasharray={locked ? 'none' : '8 4'}
          />
        );

      case 'cone':
        if (!casterToken) return null;
        {
          const angleRad = Math.atan2(screenCenterY - screenCasterY, screenCenterX - screenCasterX);
          const halfConeAngle = (90 / 2) * (Math.PI / 180);
          const leftAngle = angleRad - halfConeAngle;
          const rightAngle = angleRad + halfConeAngle;
          const leftX = screenCasterX + Math.cos(leftAngle) * screenRadius;
          const leftY = screenCasterY + Math.sin(leftAngle) * screenRadius;
          const rightX = screenCasterX + Math.cos(rightAngle) * screenRadius;
          const rightY = screenCasterY + Math.sin(rightAngle) * screenRadius;
          return (
            <path
              d={`
                M ${screenCasterX} ${screenCasterY}
                L ${leftX} ${leftY}
                A ${screenRadius} ${screenRadius} 0 0 1 ${rightX} ${rightY}
                Z
              `}
              fill={actualFill}
              stroke={actualStroke}
              strokeWidth={2}
              strokeDasharray={locked ? 'none' : '8 4'}
            />
          );
        }

      case 'line':
        if (!casterToken) return null;
        {
          // Use aoeWidth in feet (default 5ft = 1 grid cell)
          const screenLineWidth = aoeWidth ? ((aoeWidth / 5) * gridSize) * zoom : gridSize * zoom;
          const dirX = screenCenterX - screenCasterX;
          const dirY = screenCenterY - screenCasterY;
          const dirLen = Math.sqrt(dirX * dirX + dirY * dirY);
          if (dirLen === 0) return null;
          const normX = dirX / dirLen;
          const normY = dirY / dirLen;
          const perpX = -normY * (screenLineWidth / 2);
          const perpY = normX * (screenLineWidth / 2);
          const endX = screenCasterX + normX * screenRadius;
          const endY = screenCasterY + normY * screenRadius;
          return (
            <polygon
              points={`
                ${screenCasterX + perpX},${screenCasterY + perpY}
                ${endX + perpX},${endY + perpY}
                ${endX - perpX},${endY - perpY}
                ${screenCasterX - perpX},${screenCasterY - perpY}
              `}
              fill={actualFill}
              stroke={actualStroke}
              strokeWidth={2}
              strokeDasharray={locked ? 'none' : '8 4'}
            />
          );
        }

      default:
        return (
          <circle
            cx={screenCenterX}
            cy={screenCenterY}
            r={screenRadius}
            fill={actualFill}
            stroke={actualStroke}
            strokeWidth={2}
            strokeDasharray={locked ? 'none' : '8 4'}
          />
        );
    }
  };

  return (
    <svg
      className="absolute inset-0 pointer-events-none"
      style={{
        width: '100%',
        height: '100%',
        overflow: 'visible',
        zIndex: 40,
      }}
    >
      {renderScreenShape()}

      {/* Center dot indicator when not locked */}
      {!locked && (
        <circle
          cx={screenCenterX}
          cy={screenCenterY}
          r={6}
          fill="rgba(255, 255, 255, 0.8)"
          stroke={actualStroke}
          strokeWidth={2}
        />
      )}
    </svg>
  );
}
