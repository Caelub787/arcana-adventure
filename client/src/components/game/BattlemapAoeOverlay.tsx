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
  console.log('[BattlemapAoeOverlay] Render check:', { 
    active: aoeTargetState.active, 
    hasSpell: !!aoeTargetState.spell,
    spellName: aoeTargetState.spell?.name,
    aoe: aoeTargetState.spell?.aoe,
    center: aoeTargetState.center
  });
  
  if (!aoeTargetState.active || !aoeTargetState.spell) return null;

  const { spell, center, locked } = aoeTargetState;
  
  // Parse the aoe field which is in format "shape:radius" like "circle:15"
  const aoeField = spell.aoe || '';
  const [parsedShape, parsedRadius] = aoeField.split(':');
  const aoeShape = (parsedShape || 'circle').toLowerCase();
  const aoeRangeFeet = parseInt(parsedRadius, 10) || 15;
  const spellRangeFeet = spell.rangeNum || 30;
  
  console.log('[BattlemapAoeOverlay] Rendering shape:', aoeShape, 'radius:', aoeRangeFeet, 'at:', center);
  const radiusPixels = (aoeRangeFeet / 5) * gridSize;

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
        const lineWidth = gridSize;
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
      <g
        style={{
          transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
          transformOrigin: '0 0',
        }}
      >
        <g style={{ transform: 'translate(-9000px, -9000px)' }}>
          {renderShape()}

          {!locked && casterToken && (aoeShape === 'cone' || aoeShape === 'line') && (
            <line
              x1={casterX}
              y1={casterY}
              x2={center.x}
              y2={center.y}
              stroke="rgba(255, 255, 255, 0.4)"
              strokeWidth={1 / zoom}
              strokeDasharray={`${4 / zoom} ${4 / zoom}`}
            />
          )}

          {!locked && (
            <circle
              cx={center.x}
              cy={center.y}
              r={6 / zoom}
              fill="rgba(255, 255, 255, 0.8)"
              stroke={actualStroke}
              strokeWidth={2 / zoom}
            />
          )}
        </g>
      </g>
    </svg>
  );
}
