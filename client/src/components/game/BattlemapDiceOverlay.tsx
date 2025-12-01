import React, { useState, useEffect, useRef, useCallback, Suspense, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Text, RoundedBox } from '@react-three/drei';
import { Physics, usePlane, useBox } from '@react-three/cannon';
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
  settledPosition: [number, number, number] | null;
  showResult: boolean;
  fadeOut: boolean;
}

const DIE_COLORS: Record<DieType, string> = {
  d4: '#dc2626',
  d6: '#2563eb',
  d8: '#16a34a',
  d10: '#9333ea',
  d12: '#ea580c',
  d20: '#0891b2',
};

const DIE_SIZES: Record<DieType, number> = {
  d4: 0.7,
  d6: 0.8,
  d8: 0.75,
  d10: 0.7,
  d12: 0.85,
  d20: 0.9,
};

function generatePhysicsParams(seed: string): {
  position: [number, number, number];
  velocity: [number, number, number];
  angularVelocity: [number, number, number];
} {
  const seedNum = parseInt(seed.substring(0, 8), 16);
  const seed2 = parseInt(seed.substring(8, 16), 16) || seedNum * 31;
  
  const x = ((seedNum % 200) - 100) / 100;
  const z = ((seed2 % 200) - 100) / 100;
  
  return {
    position: [x * 1.5, 4, z * 1.5],
    velocity: [
      ((seedNum % 6) - 3) * 0.5,
      -3,
      ((seed2 % 6) - 3) * 0.5
    ],
    angularVelocity: [
      ((seedNum % 15) - 7) + 8,
      ((seed2 % 12) - 6) + 5,
      (((seedNum + seed2) % 10) - 5) + 6
    ],
  };
}

function createDieGeometry(dieType: DieType): THREE.BufferGeometry {
  const size = DIE_SIZES[dieType];
  switch (dieType) {
    case 'd4':
      return new THREE.TetrahedronGeometry(size);
    case 'd6':
      return new THREE.BoxGeometry(size, size, size);
    case 'd8':
      return new THREE.OctahedronGeometry(size);
    case 'd10': {
      const geo = new THREE.DodecahedronGeometry(size * 0.9);
      geo.scale(1, 1.4, 1);
      return geo;
    }
    case 'd12':
      return new THREE.DodecahedronGeometry(size);
    case 'd20':
      return new THREE.IcosahedronGeometry(size);
    default:
      return new THREE.BoxGeometry(size, size, size);
  }
}

function PhysicsDie({ 
  die, 
  onSettled,
  onFadeComplete,
  onPositionUpdate
}: { 
  die: ActiveDie; 
  onSettled: (id: string, position: [number, number, number]) => void;
  onFadeComplete: (id: string) => void;
  onPositionUpdate: (id: string, position: [number, number, number]) => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const dieType = die.result.dieType;
  const geometry = useMemo(() => createDieGeometry(dieType), [dieType]);
  const size = DIE_SIZES[dieType];
  
  const [ref, api] = useBox(() => ({
    mass: 1,
    position: die.initialPosition,
    velocity: die.initialVelocity,
    angularVelocity: die.initialAngularVelocity,
    args: [size, size, size],
    material: { friction: 0.5, restitution: 0.35 },
    linearDamping: 0.3,
    angularDamping: 0.35,
  }), meshRef);
  
  const velocityRef = useRef<[number, number, number]>([0, 0, 0]);
  const angularRef = useRef<[number, number, number]>([0, 0, 0]);
  const positionRef = useRef<[number, number, number]>(die.initialPosition);
  const settledRef = useRef(false);
  const stillFrames = useRef(0);
  const fadeStartTime = useRef<number | null>(null);
  
  useEffect(() => {
    const unsubVel = api.velocity.subscribe((v) => { velocityRef.current = v; });
    const unsubAng = api.angularVelocity.subscribe((v) => { angularRef.current = v; });
    const unsubPos = api.position.subscribe((p) => { 
      positionRef.current = p;
      onPositionUpdate(die.id, p);
    });
    return () => {
      unsubVel();
      unsubAng();
      unsubPos();
    };
  }, [api, die.id, onPositionUpdate]);
  
  useFrame(() => {
    if (!meshRef.current) return;
    
    if (!settledRef.current) {
      const vel = velocityRef.current;
      const ang = angularRef.current;
      const speed = Math.sqrt(vel[0]**2 + vel[1]**2 + vel[2]**2);
      const angSpeed = Math.sqrt(ang[0]**2 + ang[1]**2 + ang[2]**2);
      
      if (speed < 0.08 && angSpeed < 0.15) {
        stillFrames.current++;
        if (stillFrames.current > 25) {
          settledRef.current = true;
          api.velocity.set(0, 0, 0);
          api.angularVelocity.set(0, 0, 0);
          onSettled(die.id, positionRef.current);
        }
      } else {
        stillFrames.current = 0;
      }
    }
    
    if (die.fadeOut && meshRef.current) {
      if (fadeStartTime.current === null) {
        fadeStartTime.current = Date.now();
      }
      const elapsed = (Date.now() - fadeStartTime.current) / 1000;
      const fadeDuration = 0.7;
      const opacity = Math.max(0, 1 - elapsed / fadeDuration);
      
      const material = meshRef.current.material as THREE.MeshStandardMaterial;
      material.opacity = opacity;
      material.transparent = true;
      
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
        roughness={0.2}
        envMapIntensity={1}
      />
    </mesh>
  );
}

function ResultBadge({ die }: { die: ActiveDie }) {
  const [opacity, setOpacity] = useState(0);
  const [scale, setScale] = useState(0.5);
  const startTime = useRef(Date.now());
  
  const position: [number, number, number] = die.settledPosition 
    ? [die.settledPosition[0], die.settledPosition[1] + 1.2, die.settledPosition[2]]
    : [0, 1.5, 0];
  
  useFrame(() => {
    const elapsed = (Date.now() - startTime.current) / 1000;
    
    if (elapsed < 0.25) {
      const t = elapsed / 0.25;
      const eased = 1 - Math.pow(1 - t, 3);
      setOpacity(eased);
      setScale(0.5 + eased * 0.7);
    } else if (!die.fadeOut) {
      setOpacity(1);
      setScale(1.2);
    } else {
      const fadeElapsed = elapsed - 2;
      const fadeProgress = Math.min(fadeElapsed / 0.5, 1);
      setOpacity(Math.max(0, 1 - fadeProgress));
      setScale(1.2 + fadeProgress * 0.3);
    }
  });
  
  const color = DIE_COLORS[die.result.dieType];
  
  return (
    <group position={position} scale={scale}>
      <RoundedBox args={[1.4, 0.9, 0.1]} radius={0.15}>
        <meshStandardMaterial 
          color={color} 
          opacity={opacity * 0.9}
          transparent
          metalness={0.3}
          roughness={0.5}
        />
      </RoundedBox>
      <Text
        position={[0, 0, 0.1]}
        fontSize={0.55}
        color="white"
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.04}
        outlineColor="#000000"
        fillOpacity={opacity}
        outlineOpacity={opacity}
      >
        {die.result.result}
      </Text>
    </group>
  );
}

function Ground() {
  const [ref] = usePlane(() => ({
    rotation: [-Math.PI / 2, 0, 0],
    position: [0, -0.3, 0],
    material: { friction: 0.7, restitution: 0.2 },
  }), useRef<THREE.Mesh>(null));
  
  return (
    <mesh ref={ref} receiveShadow visible={false}>
      <planeGeometry args={[30, 30]} />
    </mesh>
  );
}

function Walls() {
  const positions: Array<{ pos: [number, number, number]; rot: [number, number, number] }> = [
    { pos: [0, 2, -3.5], rot: [0, 0, 0] },
    { pos: [0, 2, 3.5], rot: [0, Math.PI, 0] },
    { pos: [-3.5, 2, 0], rot: [0, Math.PI / 2, 0] },
    { pos: [3.5, 2, 0], rot: [0, -Math.PI / 2, 0] },
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
    material: { friction: 0.2, restitution: 0.5 },
  }), useRef<THREE.Mesh>(null));
  
  return <mesh ref={ref} visible={false}><planeGeometry args={[8, 6]} /></mesh>;
}

function DiceScene({ 
  activeDice, 
  onDieSettled,
  onDieFadeComplete,
  onPositionUpdate
}: { 
  activeDice: ActiveDie[]; 
  onDieSettled: (id: string, position: [number, number, number]) => void;
  onDieFadeComplete: (id: string) => void;
  onPositionUpdate: (id: string, position: [number, number, number]) => void;
}) {
  return (
    <Physics gravity={[0, -15, 0]} iterations={12} tolerance={0.0001}>
      <ambientLight intensity={0.5} />
      <directionalLight 
        position={[4, 10, 5]} 
        intensity={1.3} 
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-far={25}
        shadow-camera-left={-6}
        shadow-camera-right={6}
        shadow-camera-top={6}
        shadow-camera-bottom={-6}
      />
      <pointLight position={[-4, 5, -4]} intensity={0.3} color="#ffe4c4" />
      <pointLight position={[0, 3, 3]} intensity={0.2} color="#c4e4ff" />
      
      <Ground />
      <Walls />
      
      {activeDice.map((die) => (
        <PhysicsDie
          key={die.id}
          die={die}
          onSettled={onDieSettled}
          onFadeComplete={onDieFadeComplete}
          onPositionUpdate={onPositionUpdate}
        />
      ))}
      
      {activeDice.filter(d => d.showResult && d.settledPosition).map((die) => (
        <ResultBadge key={`result-${die.id}`} die={die} />
      ))}
    </Physics>
  );
}

export function BattlemapDiceOverlay({ onRollComplete }: BattlemapDiceOverlayProps) {
  const [activeDice, setActiveDice] = useState<ActiveDie[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const diePositions = useRef<Map<string, [number, number, number]>>(new Map());
  
  const addDiceRoll = useCallback((result: DiceRollResult) => {
    const physics = generatePhysicsParams(result.seed);
    
    const newDie: ActiveDie = {
      id: result.id,
      result,
      startTime: Date.now(),
      initialPosition: physics.position,
      initialVelocity: physics.velocity,
      initialAngularVelocity: physics.angularVelocity,
      settled: false,
      settledPosition: null,
      showResult: false,
      fadeOut: false,
    };
    
    setActiveDice(prev => [...prev, newDie]);
  }, []);
  
  const handlePositionUpdate = useCallback((id: string, position: [number, number, number]) => {
    diePositions.current.set(id, position);
  }, []);
  
  const handleDieSettled = useCallback((id: string, position: [number, number, number]) => {
    setActiveDice(prev => prev.map(die => 
      die.id === id 
        ? { ...die, settled: true, showResult: true, settledPosition: position } 
        : die
    ));
    
    setTimeout(() => {
      setActiveDice(prev => prev.map(die =>
        die.id === id ? { ...die, fadeOut: true } : die
      ));
    }, 2000);
  }, []);
  
  const handleDieFadeComplete = useCallback((id: string) => {
    setActiveDice(prev => {
      const die = prev.find(d => d.id === id);
      if (die && onRollComplete) {
        onRollComplete(die.result);
      }
      return prev.filter(d => d.id !== id);
    });
    diePositions.current.delete(id);
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
    >
      <Canvas
        shadows
        camera={{ position: [0, 5, 5], fov: 55, near: 0.1, far: 100 }}
        style={{ background: 'transparent' }}
        gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
      >
        <Suspense fallback={null}>
          <DiceScene 
            activeDice={activeDice} 
            onDieSettled={handleDieSettled}
            onDieFadeComplete={handleDieFadeComplete}
            onPositionUpdate={handlePositionUpdate}
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
