import React, { useState, useEffect, useRef, useCallback, Suspense, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import { Physics, usePlane, useBox, useSphere } from '@react-three/cannon';
import * as THREE from 'three';
import { type DiceRollResult, type DieType } from '@/lib/diceSystem';

interface BattlemapDiceOverlayProps {
  onRollComplete?: (result: DiceRollResult) => void;
}

interface ActiveDie {
  id: string;
  result: DiceRollResult;
  startTime: number;
  initialPosition: [number, number, number];
  initialVelocity: [number, number, number];
  initialAngularVelocity: [number, number, number];
  settled: boolean;
  showResult: boolean;
  fadeOut: boolean;
  finalRotation: THREE.Euler;
}

const DIE_COLORS: Record<DieType, string> = {
  d4: '#dc2626',
  d6: '#2563eb',
  d8: '#16a34a',
  d10: '#9333ea',
  d12: '#ea580c',
  d20: '#0891b2',
};

const FACE_ROTATIONS_D6: Record<number, THREE.Euler> = {
  1: new THREE.Euler(Math.PI / 2, 0, 0),
  2: new THREE.Euler(0, 0, Math.PI / 2),
  3: new THREE.Euler(0, 0, 0),
  4: new THREE.Euler(Math.PI, 0, 0),
  5: new THREE.Euler(0, 0, -Math.PI / 2),
  6: new THREE.Euler(-Math.PI / 2, 0, 0),
};

const FACE_ROTATIONS_D20: Record<number, THREE.Euler> = {};
for (let i = 1; i <= 20; i++) {
  const theta = ((i - 1) / 20) * Math.PI * 2;
  const phi = ((i % 4) / 4) * Math.PI;
  FACE_ROTATIONS_D20[i] = new THREE.Euler(phi, theta, 0);
}

function getFinalRotation(dieType: DieType, result: number): THREE.Euler {
  if (dieType === 'd6') {
    return FACE_ROTATIONS_D6[result] || new THREE.Euler(0, 0, 0);
  }
  const maxVal = parseInt(dieType.substring(1));
  const normalizedResult = ((result - 1) / maxVal);
  return new THREE.Euler(
    normalizedResult * Math.PI * 2,
    (result % 4) * Math.PI / 2,
    0
  );
}

function generatePhysicsParams(seed: string, targetResult: number, dieType: DieType): {
  position: [number, number, number];
  velocity: [number, number, number];
  angularVelocity: [number, number, number];
  finalRotation: THREE.Euler;
} {
  const seedNum = parseInt(seed.substring(0, 8), 16);
  const seed2 = parseInt(seed.substring(8, 16), 16) || seedNum * 31;
  
  const x = ((seedNum % 300) - 150) / 100;
  const z = ((seed2 % 300) - 150) / 100;
  
  const finalRotation = getFinalRotation(dieType, targetResult);
  
  return {
    position: [x, 5, z],
    velocity: [((seedNum % 4) - 2) * 0.3, -1, ((seed2 % 4) - 2) * 0.3],
    angularVelocity: [
      (seedNum % 8) + 5,
      (seed2 % 6) + 3,
      ((seedNum + seed2) % 7) + 4
    ],
    finalRotation,
  };
}

function createDieGeometry(dieType: DieType): THREE.BufferGeometry {
  switch (dieType) {
    case 'd4':
      return new THREE.TetrahedronGeometry(0.8);
    case 'd6':
      return new THREE.BoxGeometry(0.9, 0.9, 0.9);
    case 'd8':
      return new THREE.OctahedronGeometry(0.8);
    case 'd10': {
      const geo = new THREE.DodecahedronGeometry(0.7);
      geo.scale(1, 1.3, 1);
      return geo;
    }
    case 'd12':
      return new THREE.DodecahedronGeometry(0.75);
    case 'd20':
      return new THREE.IcosahedronGeometry(0.8);
    default:
      return new THREE.BoxGeometry(0.9, 0.9, 0.9);
  }
}

function PhysicsDie({ 
  die, 
  onSettled,
  onFadeComplete 
}: { 
  die: ActiveDie; 
  onSettled: (id: string) => void;
  onFadeComplete: (id: string) => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const dieType = die.result.dieType;
  const geometry = useMemo(() => createDieGeometry(dieType), [dieType]);
  
  const [ref, api] = useBox(() => ({
    mass: 1,
    position: die.initialPosition,
    velocity: die.initialVelocity,
    angularVelocity: die.initialAngularVelocity,
    args: [0.9, 0.9, 0.9],
    material: { friction: 0.6, restitution: 0.3 },
    linearDamping: 0.4,
    angularDamping: 0.4,
  }), meshRef);
  
  const velocityRef = useRef<[number, number, number]>([0, 0, 0]);
  const angularRef = useRef<[number, number, number]>([0, 0, 0]);
  const positionRef = useRef<[number, number, number]>(die.initialPosition);
  const rotationRef = useRef<[number, number, number, number]>([0, 0, 0, 1]);
  const settledRef = useRef(false);
  const stillFrames = useRef(0);
  const fadeStartTime = useRef<number | null>(null);
  const transitioningToFinal = useRef(false);
  const transitionStart = useRef<number | null>(null);
  
  useEffect(() => {
    const unsubVel = api.velocity.subscribe((v) => { velocityRef.current = v; });
    const unsubAng = api.angularVelocity.subscribe((v) => { angularRef.current = v; });
    const unsubPos = api.position.subscribe((p) => { positionRef.current = p; });
    const unsubRot = api.quaternion.subscribe((q) => { rotationRef.current = q; });
    return () => {
      unsubVel();
      unsubAng();
      unsubPos();
      unsubRot();
    };
  }, [api]);
  
  useFrame(() => {
    if (!meshRef.current) return;
    
    if (!settledRef.current && !transitioningToFinal.current) {
      const vel = velocityRef.current;
      const ang = angularRef.current;
      const speed = Math.sqrt(vel[0]**2 + vel[1]**2 + vel[2]**2);
      const angSpeed = Math.sqrt(ang[0]**2 + ang[1]**2 + ang[2]**2);
      
      if (speed < 0.15 && angSpeed < 0.3) {
        stillFrames.current++;
        if (stillFrames.current > 20) {
          transitioningToFinal.current = true;
          transitionStart.current = Date.now();
          api.velocity.set(0, 0, 0);
          api.angularVelocity.set(0, 0, 0);
        }
      } else {
        stillFrames.current = 0;
      }
    }
    
    if (transitioningToFinal.current && !settledRef.current && meshRef.current) {
      const elapsed = (Date.now() - (transitionStart.current || Date.now())) / 1000;
      const duration = 0.3;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      
      const currentQuat = new THREE.Quaternion(
        rotationRef.current[0],
        rotationRef.current[1],
        rotationRef.current[2],
        rotationRef.current[3]
      );
      const targetQuat = new THREE.Quaternion().setFromEuler(die.finalRotation);
      currentQuat.slerp(targetQuat, eased);
      
      api.quaternion.set(currentQuat.x, currentQuat.y, currentQuat.z, currentQuat.w);
      
      if (progress >= 1) {
        settledRef.current = true;
        onSettled(die.id);
      }
    }
    
    if (die.fadeOut && meshRef.current) {
      if (fadeStartTime.current === null) {
        fadeStartTime.current = Date.now();
      }
      const elapsed = (Date.now() - fadeStartTime.current) / 1000;
      const fadeDuration = 0.6;
      const opacity = Math.max(0, 1 - elapsed / fadeDuration);
      
      const material = meshRef.current.material as THREE.MeshStandardMaterial;
      material.opacity = opacity;
      material.transparent = true;
      
      const scale = 1 + (1 - opacity) * 0.2;
      meshRef.current.scale.setScalar(scale);
      
      if (opacity <= 0) {
        onFadeComplete(die.id);
      }
    }
  });
  
  const color = DIE_COLORS[dieType];
  
  return (
    <mesh ref={meshRef} geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial 
        color={color} 
        metalness={0.5} 
        roughness={0.25}
        envMapIntensity={0.8}
      />
    </mesh>
  );
}

function ResultText({ die, position }: { die: ActiveDie; position: [number, number, number] }) {
  const [opacity, setOpacity] = useState(0);
  const startTime = useRef(Date.now());
  
  useFrame(() => {
    const elapsed = (Date.now() - startTime.current) / 1000;
    if (elapsed < 0.3) {
      setOpacity(elapsed / 0.3);
    } else if (!die.fadeOut) {
      setOpacity(1);
    } else {
      const fadeElapsed = (Date.now() - startTime.current - 2000) / 600;
      setOpacity(Math.max(0, 1 - fadeElapsed));
    }
  });
  
  return (
    <Text
      position={[position[0], position[1] + 1.5, position[2]]}
      fontSize={1.2}
      color="white"
      anchorX="center"
      anchorY="middle"
      outlineWidth={0.1}
      outlineColor="#000000"
      fillOpacity={opacity}
      outlineOpacity={opacity}
    >
      {die.result.result}
    </Text>
  );
}

function Ground() {
  const [ref] = usePlane(() => ({
    rotation: [-Math.PI / 2, 0, 0],
    position: [0, -0.5, 0],
    material: { friction: 0.8, restitution: 0.15 },
  }), useRef<THREE.Mesh>(null));
  
  return (
    <mesh ref={ref} receiveShadow visible={false}>
      <planeGeometry args={[30, 30]} />
      <shadowMaterial opacity={0.3} />
    </mesh>
  );
}

function Walls() {
  const positions: Array<{ pos: [number, number, number]; rot: [number, number, number] }> = [
    { pos: [0, 2, -4], rot: [0, 0, 0] },
    { pos: [0, 2, 4], rot: [0, Math.PI, 0] },
    { pos: [-4, 2, 0], rot: [0, Math.PI / 2, 0] },
    { pos: [4, 2, 0], rot: [0, -Math.PI / 2, 0] },
  ];
  
  return (
    <>
      {positions.map((wall, i) => (
        <WallPlane key={i} position={wall.pos} rotation={wall.rot} />
      ))}
    </>
  );
}

function WallPlane({ position, rotation }: { position: [number, number, number]; rotation: [number, number, number] }) {
  const [ref] = usePlane(() => ({
    position,
    rotation,
    material: { friction: 0.2, restitution: 0.6 },
  }), useRef<THREE.Mesh>(null));
  
  return <mesh ref={ref} visible={false}><planeGeometry args={[10, 8]} /></mesh>;
}

function DiceScene({ 
  activeDice, 
  onDieSettled,
  onDieFadeComplete,
  settledPositions
}: { 
  activeDice: ActiveDie[]; 
  onDieSettled: (id: string) => void;
  onDieFadeComplete: (id: string) => void;
  settledPositions: Map<string, [number, number, number]>;
}) {
  return (
    <Physics gravity={[0, -12, 0]} iterations={15} tolerance={0.0001}>
      <ambientLight intensity={0.4} />
      <directionalLight 
        position={[3, 8, 4]} 
        intensity={1.2} 
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-far={20}
        shadow-camera-left={-5}
        shadow-camera-right={5}
        shadow-camera-top={5}
        shadow-camera-bottom={-5}
      />
      <pointLight position={[-3, 4, -3]} intensity={0.4} color="#ffeedd" />
      
      <Ground />
      <Walls />
      
      {activeDice.map((die) => (
        <PhysicsDie
          key={die.id}
          die={die}
          onSettled={onDieSettled}
          onFadeComplete={onDieFadeComplete}
        />
      ))}
      
      {activeDice.filter(d => d.showResult).map((die) => {
        const pos = settledPositions.get(die.id) || [0, 0, 0];
        return <ResultText key={`result-${die.id}`} die={die} position={pos} />;
      })}
    </Physics>
  );
}

export function BattlemapDiceOverlay({ onRollComplete }: BattlemapDiceOverlayProps) {
  const [activeDice, setActiveDice] = useState<ActiveDie[]>([]);
  const [settledPositions] = useState<Map<string, [number, number, number]>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);
  
  const addDiceRoll = useCallback((result: DiceRollResult) => {
    const physics = generatePhysicsParams(result.seed, result.result, result.dieType);
    
    const newDie: ActiveDie = {
      id: result.id,
      result,
      startTime: Date.now(),
      initialPosition: physics.position,
      initialVelocity: physics.velocity,
      initialAngularVelocity: physics.angularVelocity,
      settled: false,
      showResult: false,
      fadeOut: false,
      finalRotation: physics.finalRotation,
    };
    
    setActiveDice(prev => [...prev, newDie]);
  }, []);
  
  const handleDieSettled = useCallback((id: string) => {
    setActiveDice(prev => prev.map(die => 
      die.id === id ? { ...die, settled: true, showResult: true } : die
    ));
    
    settledPositions.set(id, [0, 0, 0]);
    
    setTimeout(() => {
      setActiveDice(prev => prev.map(die =>
        die.id === id ? { ...die, fadeOut: true } : die
      ));
    }, 2000);
  }, [settledPositions]);
  
  const handleDieFadeComplete = useCallback((id: string) => {
    setActiveDice(prev => {
      const die = prev.find(d => d.id === id);
      if (die && onRollComplete) {
        onRollComplete(die.result);
      }
      return prev.filter(d => d.id !== id);
    });
    settledPositions.delete(id);
  }, [onRollComplete, settledPositions]);
  
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
    >
      <Canvas
        shadows
        camera={{ position: [0, 6, 6], fov: 50, near: 0.1, far: 100 }}
        style={{ background: 'transparent' }}
        gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
      >
        <Suspense fallback={null}>
          <DiceScene 
            activeDice={activeDice} 
            onDieSettled={handleDieSettled}
            onDieFadeComplete={handleDieFadeComplete}
            settledPositions={settledPositions}
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
