import gsap from 'gsap';

export type DieType = 'd4' | 'd6' | 'd8' | 'd10' | 'd12' | 'd20';

export interface DiceRollResult {
  id: string;
  dieType: DieType;
  result: number;
  modifier: number;
  total: number;
  timestamp: number;
  seed: string;
  userId: string;
  username: string;
  characterId?: string;
  purpose?: string;
}

export interface RollRequest {
  dieType: DieType;
  modifier?: number;
  purpose?: string;
  characterId?: string;
}

export interface DiceSystemConfig {
  container: HTMLElement;
  onRollComplete?: (result: DiceRollResult) => void;
  onRollStart?: (dieType: DieType) => void;
  textureAtlas?: string;
}

interface DiceState {
  isRolling: boolean;
  currentRoll: DiceRollResult | null;
  pendingRequest: RollRequest | null;
}

type MessageHandler = (data: any) => void;
type DiceRollCallback = (result: DiceRollResult) => void;

let diceConfig: DiceSystemConfig | null = null;
let diceState: DiceState = {
  isRolling: false,
  currentRoll: null,
  pendingRequest: null,
};

const rollCallbacks: Set<DiceRollCallback> = new Set();

const DIE_COLORS: Record<DieType, string> = {
  d4: '#dc2626',
  d6: '#2563eb',
  d8: '#16a34a',
  d10: '#9333ea',
  d12: '#ea580c',
  d20: '#0891b2',
};

const DIE_MAX_VALUES: Record<DieType, number> = {
  d4: 4,
  d6: 6,
  d8: 8,
  d10: 10,
  d12: 12,
  d20: 20,
};

export function initDiceSystem(config: DiceSystemConfig): void {
  diceConfig = config;
  diceState = {
    isRolling: false,
    currentRoll: null,
    pendingRequest: null,
  };
}

export function cleanupDiceSystem(): void {
  diceConfig = null;
  diceState = {
    isRolling: false,
    currentRoll: null,
    pendingRequest: null,
  };
  rollCallbacks.clear();
}

export function onDiceRoll(callback: DiceRollCallback): () => void {
  rollCallbacks.add(callback);
  return () => rollCallbacks.delete(callback);
}

export function handleServerRollResult(result: DiceRollResult): void {
  diceState.currentRoll = result;
  
  if (diceConfig?.container) {
    playRollAnimation(result);
  }
  
  rollCallbacks.forEach(callback => callback(result));
  diceConfig?.onRollComplete?.(result);
}

export function createRollMessage(request: RollRequest, campaignId: string) {
  return {
    type: 'request_dice_roll',
    campaignId,
    dieType: request.dieType,
    modifier: request.modifier || 0,
    purpose: request.purpose,
    characterId: request.characterId,
  };
}

export function isRolling(): boolean {
  return diceState.isRolling;
}

function playRollAnimation(result: DiceRollResult): void {
  if (!diceConfig?.container) return;
  
  diceState.isRolling = true;
  diceConfig.onRollStart?.(result.dieType);
  
  const container = diceConfig.container;
  
  const dieElement = document.createElement('div');
  dieElement.className = 'dice-rolling';
  dieElement.style.cssText = `
    position: absolute;
    left: 50%;
    top: 50%;
    width: 80px;
    height: 80px;
    background: ${DIE_COLORS[result.dieType]};
    border-radius: ${result.dieType === 'd4' ? '0' : '12px'};
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 32px;
    font-weight: bold;
    color: white;
    text-shadow: 2px 2px 4px rgba(0,0,0,0.5);
    box-shadow: 0 4px 20px rgba(0,0,0,0.4);
    transform: translate(-50%, -50%) scale(0) rotate(0deg);
    z-index: 1000;
    pointer-events: none;
  `;
  
  if (result.dieType === 'd4') {
    dieElement.style.clipPath = 'polygon(50% 0%, 0% 100%, 100% 100%)';
    dieElement.style.height = '70px';
  }
  
  container.appendChild(dieElement);
  
  const seedNum = parseInt(result.seed.substring(0, 8), 16);
  const rotations = 3 + (seedNum % 3);
  const finalRotation = (seedNum % 360);
  
  const intermediateValues: number[] = [];
  const maxVal = DIE_MAX_VALUES[result.dieType];
  for (let i = 0; i < 8; i++) {
    intermediateValues.push(Math.floor((seedNum / (i + 1)) % maxVal) + 1);
  }
  intermediateValues.push(result.result);
  
  const tl = gsap.timeline({
    onComplete: () => {
      diceState.isRolling = false;
      
      gsap.to(dieElement, {
        opacity: 0,
        scale: 1.2,
        duration: 0.5,
        delay: 1.5,
        ease: 'power2.out',
        onComplete: () => {
          dieElement.remove();
        },
      });
    },
  });
  
  tl.to(dieElement, {
    scale: 1,
    rotation: rotations * 360 + finalRotation,
    duration: 1.2,
    ease: 'power2.out',
    onUpdate: function() {
      const progress = this.progress();
      const idx = Math.min(
        Math.floor(progress * intermediateValues.length),
        intermediateValues.length - 1
      );
      dieElement.textContent = intermediateValues[idx].toString();
    },
  });
  
  tl.to(dieElement, {
    y: -10,
    duration: 0.1,
    ease: 'power2.out',
  }, '-=0.3');
  
  tl.to(dieElement, {
    y: 0,
    duration: 0.2,
    ease: 'bounce.out',
  });
}

export function create2DFallbackAnimation(
  container: HTMLElement,
  result: DiceRollResult
): void {
  const canvas = document.createElement('canvas');
  canvas.width = 200;
  canvas.height = 200;
  canvas.style.cssText = `
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    z-index: 1000;
    pointer-events: none;
  `;
  
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  
  container.appendChild(canvas);
  
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const size = 60;
  
  let frame = 0;
  const totalFrames = 60;
  const seedNum = parseInt(result.seed.substring(0, 8), 16);
  const maxVal = DIE_MAX_VALUES[result.dieType];
  
  function animate() {
    if (!ctx) return;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const progress = frame / totalFrames;
    const easeProgress = 1 - Math.pow(1 - progress, 3);
    
    const rotation = easeProgress * (3 + (seedNum % 3)) * Math.PI * 2;
    const scale = 0.5 + easeProgress * 0.5;
    
    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate(rotation);
    ctx.scale(scale, scale);
    
    ctx.fillStyle = DIE_COLORS[result.dieType];
    ctx.shadowColor = 'rgba(0,0,0,0.4)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 4;
    
    if (result.dieType === 'd4') {
      ctx.beginPath();
      ctx.moveTo(0, -size);
      ctx.lineTo(-size * 0.866, size * 0.5);
      ctx.lineTo(size * 0.866, size * 0.5);
      ctx.closePath();
      ctx.fill();
    } else {
      const radius = result.dieType === 'd6' ? 8 : 12;
      ctx.beginPath();
      ctx.roundRect(-size / 2, -size / 2, size, size, radius);
      ctx.fill();
    }
    
    ctx.restore();
    
    const currentValue = frame < totalFrames - 10
      ? Math.floor((seedNum / (frame + 1)) % maxVal) + 1
      : result.result;
    
    ctx.fillStyle = 'white';
    ctx.font = 'bold 32px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 4;
    ctx.fillText(currentValue.toString(), centerX, centerY);
    
    frame++;
    
    if (frame <= totalFrames) {
      requestAnimationFrame(animate);
    } else {
      setTimeout(() => {
        gsap.to(canvas, {
          opacity: 0,
          duration: 0.5,
          onComplete: () => canvas.remove(),
        });
      }, 1500);
    }
  }
  
  animate();
}

export function getDieColor(dieType: DieType): string {
  return DIE_COLORS[dieType];
}

export function getDieMaxValue(dieType: DieType): number {
  return DIE_MAX_VALUES[dieType];
}

export { DiceRollResult as RollResult };
