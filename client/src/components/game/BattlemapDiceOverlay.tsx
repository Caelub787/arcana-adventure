import React, { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { RoundedBox, Text, Environment } from '@react-three/drei';
import * as THREE from 'three';
import gsap from 'gsap';
import { type DiceRollResult, type DieType } from '@/lib/diceSystem';

interface BattlemapDiceOverlayProps {
  onRollComplete?: (result: DiceRollResult) => void;
}

interface ActiveDie {
  id: string;
  result: DiceRollResult;
  startTime: number;
  position: THREE.Vector3;
  targetPosition: THREE.Vector3;
  rotation: THREE.Euler;
  finalRotation: THREE.Euler;
  phase: 'rolling' | 'settling' | 'showing' | 'fading';
  opacity: number;
}

const DIE_COLORS: Record<DieType, string> = {
  d4: '#dc2626',
  d6: '#2563eb',
  d8: '#16a34a',
  d10: '#9333ea',
  d12: '#ea580c',
  d20: '#0891b2',
};

function Die3D({ die, onComplete }: { die: ActiveDie; onComplete: () => void }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const textRef = useRef<THREE.Mesh>(null);
  const [displayValue, setDisplayValue] = useState('');
  const startTimeRef = useRef(die.startTime);
  const completedRef = useRef(false);
  
  const dieType = die.result.dieType;
  const maxValue = parseInt(dieType.substring(1));
  const seedNum = parseInt(die.result.seed.substring(0, 8), 16);
  
  useFrame((state) => {
    if (!meshRef.current) return;
    
    const elapsed = (Date.now() - startTimeRef.current) / 1000;
    const rollDuration = 1.2;
    const showDuration = 2.0;
    const fadeDuration = 0.5;
    
    if (elapsed < rollDuration) {
      const progress = elapsed / rollDuration;
      const easeProgress = 1 - Math.pow(1 - progress, 3);
      
      meshRef.current.rotation.x = easeProgress * (3 + (seedNum % 3)) * Math.PI * 2;
      meshRef.current.rotation.y = easeProgress * (2 + (seedNum % 2)) * Math.PI * 2;
      meshRef.current.rotation.z = easeProgress * Math.PI;
      
      meshRef.current.position.y = die.position.y + Math.sin(progress * Math.PI) * 1.5;
      meshRef.current.position.x = THREE.MathUtils.lerp(die.position.x, die.targetPosition.x, easeProgress);
      meshRef.current.position.z = THREE.MathUtils.lerp(die.position.z, die.targetPosition.z, easeProgress);
      
      const scale = 0.5 + easeProgress * 0.5;
      meshRef.current.scale.setScalar(scale);
      
      const intermediateValue = Math.floor((seedNum / (Math.floor(elapsed * 10) + 1)) % maxValue) + 1;
      setDisplayValue(intermediateValue.toString());
    } else if (elapsed < rollDuration + showDuration) {
      meshRef.current.position.copy(die.targetPosition);
      meshRef.current.rotation.set(0, 0, 0);
      meshRef.current.scale.setScalar(1);
      setDisplayValue(die.result.result.toString());
    } else if (elapsed < rollDuration + showDuration + fadeDuration) {
      const fadeProgress = (elapsed - rollDuration - showDuration) / fadeDuration;
      const material = (meshRef.current.material as THREE.MeshStandardMaterial);
      material.opacity = 1 - fadeProgress;
      material.transparent = true;
      meshRef.current.scale.setScalar(1 + fadeProgress * 0.3);
      
      if (textRef.current) {
        const textMaterial = (textRef.current.material as THREE.MeshBasicMaterial);
        if (textMaterial) {
          textMaterial.opacity = 1 - fadeProgress;
          textMaterial.transparent = true;
        }
      }
    } else {
      if (!completedRef.current) {
        completedRef.current = true;
        onComplete();
      }
    }
  });
  
  const color = DIE_COLORS[dieType];
  const size = dieType === 'd20' ? 1.2 : dieType === 'd12' ? 1.1 : 1;
  
  return (
    <group>
      <RoundedBox
        ref={meshRef}
        args={[size, size, size]}
        radius={dieType === 'd4' ? 0.02 : 0.15}
        smoothness={4}
        position={[die.position.x, die.position.y, die.position.z]}
      >
        <meshStandardMaterial color={color} metalness={0.3} roughness={0.4} />
      </RoundedBox>
      <Text
        ref={textRef}
        position={[die.targetPosition.x, die.targetPosition.y + 0.6, die.targetPosition.z]}
        fontSize={0.6}
        color="white"
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.05}
        outlineColor="black"
      >
        {displayValue}
      </Text>
    </group>
  );
}

function DiceScene({ activeDice, onDieComplete }: { 
  activeDice: ActiveDie[]; 
  onDieComplete: (id: string) => void 
}) {
  return (
    <>
      <ambientLight intensity={0.6} />
      <pointLight position={[5, 5, 5]} intensity={1} />
      <pointLight position={[-5, 5, -5]} intensity={0.5} />
      
      {activeDice.map((die) => (
        <Die3D
          key={die.id}
          die={die}
          onComplete={() => onDieComplete(die.id)}
        />
      ))}
    </>
  );
}

export function BattlemapDiceOverlay({ onRollComplete }: BattlemapDiceOverlayProps) {
  const [activeDice, setActiveDice] = useState<ActiveDie[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const addDiceRoll = useCallback((result: DiceRollResult) => {
    const seedNum = parseInt(result.seed.substring(0, 8), 16);
    const startX = (seedNum % 4 - 2) * 0.5;
    const targetX = (seedNum % 6 - 3) * 0.3;
    
    const newDie: ActiveDie = {
      id: result.id,
      result,
      startTime: Date.now(),
      position: new THREE.Vector3(startX, 2, -2),
      targetPosition: new THREE.Vector3(targetX, 0, 0),
      rotation: new THREE.Euler(0, 0, 0),
      finalRotation: new THREE.Euler(0, 0, 0),
      phase: 'rolling',
      opacity: 1,
    };
    
    setActiveDice(prev => [...prev, newDie]);
  }, []);
  
  const handleDieComplete = useCallback((id: string) => {
    setActiveDice(prev => {
      const die = prev.find(d => d.id === id);
      if (die && onRollComplete) {
        onRollComplete(die.result);
      }
      return prev.filter(d => d.id !== id);
    });
  }, [onRollComplete]);
  
  useEffect(() => {
    const handleDiceRoll = (event: CustomEvent<DiceRollResult>) => {
      addDiceRoll(event.detail);
    };
    
    window.addEventListener('battlemap-dice-roll' as any, handleDiceRoll);
    return () => {
      window.removeEventListener('battlemap-dice-roll' as any, handleDiceRoll);
    };
  }, [addDiceRoll]);
  
  if (activeDice.length === 0) {
    return null;
  }
  
  return (
    <div 
      ref={containerRef}
      className="absolute inset-0 pointer-events-none z-50"
      style={{ 
        perspective: '1000px',
      }}
    >
      <Canvas
        camera={{ position: [0, 3, 5], fov: 50 }}
        style={{ background: 'transparent' }}
        gl={{ alpha: true, antialias: true }}
      >
        <Suspense fallback={null}>
          <DiceScene 
            activeDice={activeDice} 
            onDieComplete={handleDieComplete}
          />
        </Suspense>
      </Canvas>
    </div>
  );
}

export function triggerBattlemapDiceRoll(result: DiceRollResult) {
  const event = new CustomEvent('battlemap-dice-roll', { detail: result });
  window.dispatchEvent(event);
}

export function create2DDiceAnimation(
  container: HTMLElement,
  result: DiceRollResult
): void {
  const dieType = result.dieType;
  const maxValue = parseInt(dieType.substring(1));
  const seedNum = parseInt(result.seed.substring(0, 8), 16);
  
  const dieElement = document.createElement('div');
  dieElement.className = 'dice-rolling';
  dieElement.style.cssText = `
    position: absolute;
    left: 50%;
    top: 30%;
    width: 100px;
    height: 100px;
    background: linear-gradient(135deg, ${DIE_COLORS[dieType]} 0%, ${adjustColor(DIE_COLORS[dieType], -30)} 100%);
    border-radius: ${dieType === 'd4' ? '0' : '16px'};
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 40px;
    font-weight: bold;
    color: white;
    text-shadow: 2px 2px 4px rgba(0,0,0,0.5);
    box-shadow: 0 8px 32px rgba(0,0,0,0.4), inset 0 2px 8px rgba(255,255,255,0.2);
    transform: translate(-50%, -50%) scale(0) rotate(0deg);
    z-index: 1000;
    pointer-events: none;
    border: 3px solid rgba(255,255,255,0.3);
  `;
  
  if (dieType === 'd4') {
    dieElement.style.clipPath = 'polygon(50% 0%, 0% 100%, 100% 100%)';
    dieElement.style.height = '87px';
  }
  
  container.appendChild(dieElement);
  
  const intermediateValues: number[] = [];
  for (let i = 0; i < 8; i++) {
    intermediateValues.push(Math.floor((seedNum / (i + 1)) % maxValue) + 1);
  }
  intermediateValues.push(result.result);
  
  const tl = gsap.timeline({
    onComplete: () => {
      gsap.to(dieElement, {
        opacity: 0,
        scale: 1.3,
        duration: 0.5,
        delay: 1.5,
        ease: 'power2.out',
        onComplete: () => {
          dieElement.remove();
        },
      });
    },
  });
  
  const rotations = 3 + (seedNum % 3);
  const finalRotation = seedNum % 360;
  
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
    y: -15,
    duration: 0.1,
    ease: 'power2.out',
  }, '-=0.3');
  
  tl.to(dieElement, {
    y: 0,
    duration: 0.25,
    ease: 'bounce.out',
  });
}

function adjustColor(color: string, amount: number): string {
  const hex = color.replace('#', '');
  const r = Math.max(0, Math.min(255, parseInt(hex.slice(0, 2), 16) + amount));
  const g = Math.max(0, Math.min(255, parseInt(hex.slice(2, 4), 16) + amount));
  const b = Math.max(0, Math.min(255, parseInt(hex.slice(4, 6), 16) + amount));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}
