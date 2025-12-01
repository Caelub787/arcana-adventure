import React, { useState, useEffect, useRef, useCallback, Suspense, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Text } from '@react-three/drei';
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
  targetRotation: THREE.Quaternion;
}

const DIE_COLORS: Record<DieType, string> = {
  d4: '#b91c1c',
  d6: '#1d4ed8',
  d8: '#15803d',
  d10: '#7c3aed',
  d12: '#c2410c',
  d20: '#0e7490',
};

const DIE_SIZES: Record<DieType, number> = {
  d4: 0.9,
  d6: 0.85,
  d8: 0.85,
  d10: 0.8,
  d12: 0.9,
  d20: 0.95,
};

interface FaceData {
  value: number;
  position: [number, number, number];
  rotation: [number, number, number];
  normal: THREE.Vector3;
}

function getD6Faces(size: number): FaceData[] {
  const s = size * 0.5;
  return [
    { value: 1, position: [0, -s - 0.01, 0], rotation: [Math.PI / 2, 0, 0], normal: new THREE.Vector3(0, -1, 0) },
    { value: 6, position: [0, s + 0.01, 0], rotation: [-Math.PI / 2, 0, 0], normal: new THREE.Vector3(0, 1, 0) },
    { value: 2, position: [0, 0, s + 0.01], rotation: [0, 0, 0], normal: new THREE.Vector3(0, 0, 1) },
    { value: 5, position: [0, 0, -s - 0.01], rotation: [0, Math.PI, 0], normal: new THREE.Vector3(0, 0, -1) },
    { value: 3, position: [s + 0.01, 0, 0], rotation: [0, Math.PI / 2, 0], normal: new THREE.Vector3(1, 0, 0) },
    { value: 4, position: [-s - 0.01, 0, 0], rotation: [0, -Math.PI / 2, 0], normal: new THREE.Vector3(-1, 0, 0) },
  ];
}

function getD20Faces(size: number): FaceData[] {
  const phi = (1 + Math.sqrt(5)) / 2;
  const scale = size / Math.sqrt(1 + phi * phi);
  
  const vertices = [
    new THREE.Vector3(0, 1, phi), new THREE.Vector3(0, 1, -phi),
    new THREE.Vector3(0, -1, phi), new THREE.Vector3(0, -1, -phi),
    new THREE.Vector3(1, phi, 0), new THREE.Vector3(1, -phi, 0),
    new THREE.Vector3(-1, phi, 0), new THREE.Vector3(-1, -phi, 0),
    new THREE.Vector3(phi, 0, 1), new THREE.Vector3(phi, 0, -1),
    new THREE.Vector3(-phi, 0, 1), new THREE.Vector3(-phi, 0, -1),
  ].map(v => v.multiplyScalar(scale));
  
  const faceIndices = [
    [0, 2, 8], [0, 8, 4], [0, 4, 6], [0, 6, 10], [0, 10, 2],
    [2, 5, 8], [8, 5, 9], [8, 9, 4], [4, 9, 1], [4, 1, 6],
    [6, 1, 11], [6, 11, 10], [10, 11, 7], [10, 7, 2], [2, 7, 5],
    [3, 5, 7], [3, 9, 5], [3, 1, 9], [3, 11, 1], [3, 7, 11],
  ];
  
  const faceValues = [20, 8, 14, 2, 12, 18, 4, 16, 6, 10, 1, 13, 7, 19, 11, 17, 3, 15, 5, 9];
  
  return faceIndices.map((indices, i) => {
    const v0 = vertices[indices[0]];
    const v1 = vertices[indices[1]];
    const v2 = vertices[indices[2]];
    const center = new THREE.Vector3().addVectors(v0, v1).add(v2).divideScalar(3);
    const normal = new THREE.Vector3().crossVectors(
      new THREE.Vector3().subVectors(v1, v0),
      new THREE.Vector3().subVectors(v2, v0)
    ).normalize();
    
    const up = new THREE.Vector3(0, 1, 0);
    const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    const euler = new THREE.Euler().setFromQuaternion(quaternion);
    
    const offset = center.clone().normalize().multiplyScalar(0.02);
    const pos = center.add(offset);
    
    return {
      value: faceValues[i],
      position: [pos.x, pos.y, pos.z] as [number, number, number],
      rotation: [euler.x, euler.y, euler.z] as [number, number, number],
      normal: normal,
    };
  });
}

function getD4Faces(size: number): FaceData[] {
  const h = size * 0.816;
  const r = size * 0.577;
  
  const vertices = [
    new THREE.Vector3(0, h * 0.75, 0),
    new THREE.Vector3(-r, -h * 0.25, r * 0.577),
    new THREE.Vector3(r, -h * 0.25, r * 0.577),
    new THREE.Vector3(0, -h * 0.25, -r * 1.155),
  ];
  
  const faceIndices = [[0, 1, 2], [0, 2, 3], [0, 3, 1], [1, 3, 2]];
  const faceValues = [4, 3, 2, 1];
  
  return faceIndices.map((indices, i) => {
    const v0 = vertices[indices[0]];
    const v1 = vertices[indices[1]];
    const v2 = vertices[indices[2]];
    const center = new THREE.Vector3().addVectors(v0, v1).add(v2).divideScalar(3);
    const normal = new THREE.Vector3().crossVectors(
      new THREE.Vector3().subVectors(v1, v0),
      new THREE.Vector3().subVectors(v2, v0)
    ).normalize();
    
    const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    const euler = new THREE.Euler().setFromQuaternion(quaternion);
    
    const offset = normal.clone().multiplyScalar(0.02);
    const pos = center.add(offset);
    
    return {
      value: faceValues[i],
      position: [pos.x, pos.y, pos.z] as [number, number, number],
      rotation: [euler.x, euler.y, euler.z] as [number, number, number],
      normal: normal,
    };
  });
}

function getD8Faces(size: number): FaceData[] {
  const vertices = [
    new THREE.Vector3(0, size, 0), new THREE.Vector3(0, -size, 0),
    new THREE.Vector3(-size, 0, 0), new THREE.Vector3(size, 0, 0),
    new THREE.Vector3(0, 0, -size), new THREE.Vector3(0, 0, size),
  ];
  
  const faceIndices = [
    [0, 2, 5], [0, 5, 3], [0, 3, 4], [0, 4, 2],
    [1, 5, 2], [1, 3, 5], [1, 4, 3], [1, 2, 4],
  ];
  const faceValues = [1, 8, 5, 4, 2, 7, 6, 3];
  
  return faceIndices.map((indices, i) => {
    const v0 = vertices[indices[0]];
    const v1 = vertices[indices[1]];
    const v2 = vertices[indices[2]];
    const center = new THREE.Vector3().addVectors(v0, v1).add(v2).divideScalar(3);
    const normal = new THREE.Vector3().crossVectors(
      new THREE.Vector3().subVectors(v1, v0),
      new THREE.Vector3().subVectors(v2, v0)
    ).normalize();
    
    const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    const euler = new THREE.Euler().setFromQuaternion(quaternion);
    
    const offset = normal.clone().multiplyScalar(0.02);
    const pos = center.add(offset);
    
    return {
      value: faceValues[i],
      position: [pos.x, pos.y, pos.z] as [number, number, number],
      rotation: [euler.x, euler.y, euler.z] as [number, number, number],
      normal: normal,
    };
  });
}

function getD10Faces(size: number): FaceData[] {
  const faces: FaceData[] = [];
  const topY = size * 0.6;
  const bottomY = -size * 0.6;
  const midRadius = size * 0.85;
  
  for (let i = 0; i < 10; i++) {
    const angle = (i * Math.PI * 2) / 10;
    const nextAngle = ((i + 1) * Math.PI * 2) / 10;
    const midAngle = (angle + nextAngle) / 2;
    
    const isTop = i % 2 === 0;
    const yPos = isTop ? topY * 0.3 : bottomY * 0.3;
    
    const centerX = Math.cos(midAngle) * midRadius * 0.6;
    const centerZ = Math.sin(midAngle) * midRadius * 0.6;
    
    const normalX = Math.cos(midAngle);
    const normalY = isTop ? 0.4 : -0.4;
    const normalZ = Math.sin(midAngle);
    const normal = new THREE.Vector3(normalX, normalY, normalZ).normalize();
    
    const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    const euler = new THREE.Euler().setFromQuaternion(quaternion);
    
    const value = i === 0 ? 10 : i;
    
    faces.push({
      value: value,
      position: [centerX + normal.x * 0.02, yPos + normal.y * 0.02, centerZ + normal.z * 0.02],
      rotation: [euler.x, euler.y, euler.z],
      normal: normal,
    });
  }
  
  return faces;
}

function getD12Faces(size: number): FaceData[] {
  const phi = (1 + Math.sqrt(5)) / 2;
  const scale = size * 0.5;
  
  const vertices = [
    [1, 1, 1], [1, 1, -1], [1, -1, 1], [1, -1, -1],
    [-1, 1, 1], [-1, 1, -1], [-1, -1, 1], [-1, -1, -1],
    [0, 1/phi, phi], [0, 1/phi, -phi], [0, -1/phi, phi], [0, -1/phi, -phi],
    [1/phi, phi, 0], [-1/phi, phi, 0], [1/phi, -phi, 0], [-1/phi, -phi, 0],
    [phi, 0, 1/phi], [phi, 0, -1/phi], [-phi, 0, 1/phi], [-phi, 0, -1/phi],
  ].map(v => new THREE.Vector3(v[0] * scale, v[1] * scale, v[2] * scale));
  
  const faceIndices = [
    [0, 8, 10, 2, 16], [0, 16, 17, 1, 12], [0, 12, 13, 4, 8],
    [1, 17, 3, 11, 9], [1, 9, 5, 13, 12], [2, 10, 6, 15, 14],
    [2, 14, 3, 17, 16], [3, 14, 15, 7, 11], [4, 13, 5, 19, 18],
    [4, 18, 6, 10, 8], [5, 9, 11, 7, 19], [6, 18, 19, 7, 15],
  ];
  
  const faceValues = [1, 12, 11, 2, 8, 4, 10, 6, 3, 9, 7, 5];
  
  return faceIndices.map((indices, i) => {
    const faceVertices = indices.map(idx => vertices[idx]);
    const center = faceVertices.reduce(
      (acc, v) => acc.add(v.clone()),
      new THREE.Vector3()
    ).divideScalar(5);
    
    const v0 = faceVertices[0];
    const v1 = faceVertices[1];
    const v2 = faceVertices[2];
    const normal = new THREE.Vector3().crossVectors(
      new THREE.Vector3().subVectors(v1, v0),
      new THREE.Vector3().subVectors(v2, v0)
    ).normalize();
    
    if (normal.dot(center) < 0) {
      normal.negate();
    }
    
    const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    const euler = new THREE.Euler().setFromQuaternion(quaternion);
    
    const offset = normal.clone().multiplyScalar(0.02);
    const pos = center.add(offset);
    
    return {
      value: faceValues[i],
      position: [pos.x, pos.y, pos.z] as [number, number, number],
      rotation: [euler.x, euler.y, euler.z] as [number, number, number],
      normal: normal,
    };
  });
}

function getDieFaces(dieType: DieType, size: number): FaceData[] {
  switch (dieType) {
    case 'd4': return getD4Faces(size);
    case 'd6': return getD6Faces(size);
    case 'd8': return getD8Faces(size);
    case 'd10': return getD10Faces(size);
    case 'd12': return getD12Faces(size);
    case 'd20': return getD20Faces(size);
    default: return getD6Faces(size);
  }
}

function getTargetRotationForValue(dieType: DieType, targetValue: number, size: number): THREE.Quaternion {
  const faces = getDieFaces(dieType, size);
  const targetFace = faces.find(f => f.value === targetValue);
  
  if (!targetFace) {
    return new THREE.Quaternion();
  }
  
  const upVector = new THREE.Vector3(0, 1, 0);
  return new THREE.Quaternion().setFromUnitVectors(targetFace.normal, upVector);
}

function generatePhysicsParams(seed: string, targetResult: number, dieType: DieType): {
  position: [number, number, number];
  velocity: [number, number, number];
  angularVelocity: [number, number, number];
  targetRotation: THREE.Quaternion;
} {
  const seedNum = parseInt(seed.substring(0, 8), 16);
  const seed2 = parseInt(seed.substring(8, 16), 16) || seedNum * 31;
  
  const x = ((seedNum % 200) - 100) / 100;
  const z = ((seed2 % 200) - 100) / 100;
  
  const size = DIE_SIZES[dieType];
  const targetRotation = getTargetRotationForValue(dieType, targetResult, size);
  
  return {
    position: [x * 1.5, 4.5, z * 1.5],
    velocity: [
      ((seedNum % 5) - 2.5) * 0.4,
      -2.5,
      ((seed2 % 5) - 2.5) * 0.4
    ],
    angularVelocity: [
      ((seedNum % 12) - 6) + 7,
      ((seed2 % 10) - 5) + 5,
      (((seedNum + seed2) % 8) - 4) + 5
    ],
    targetRotation,
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
      const geo = new THREE.DodecahedronGeometry(size * 0.85);
      geo.scale(1, 1.35, 1);
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

function DieNumbers({ dieType, size, opacity = 1 }: { dieType: DieType; size: number; opacity?: number }) {
  const faces = useMemo(() => getDieFaces(dieType, size), [dieType, size]);
  
  if (!faces.length) return null;
  
  const fontSizes: Record<DieType, number> = {
    d4: 0.22,
    d6: 0.28,
    d8: 0.22,
    d10: 0.18,
    d12: 0.16,
    d20: 0.14,
  };
  const fontSize = fontSizes[dieType] || 0.2;
  
  return (
    <group>
      {faces.map((face, i) => (
        <Text
          key={i}
          position={face.position}
          rotation={face.rotation}
          fontSize={fontSize}
          color="white"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.015}
          outlineColor="#000000"
          fillOpacity={opacity}
          outlineOpacity={opacity}
        >
          {face.value}
        </Text>
      ))}
    </group>
  );
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
  const groupRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const dieType = die.result.dieType;
  const geometry = useMemo(() => createDieGeometry(dieType), [dieType]);
  const size = DIE_SIZES[dieType];
  
  const [ref, api] = useBox(() => ({
    mass: 1,
    position: die.initialPosition,
    velocity: die.initialVelocity,
    angularVelocity: die.initialAngularVelocity,
    args: [size * 0.9, size * 0.9, size * 0.9],
    material: { friction: 0.5, restitution: 0.3 },
    linearDamping: 0.35,
    angularDamping: 0.4,
  }), groupRef);
  
  const velocityRef = useRef<[number, number, number]>([0, 0, 0]);
  const angularRef = useRef<[number, number, number]>([0, 0, 0]);
  const positionRef = useRef<[number, number, number]>(die.initialPosition);
  const quaternionRef = useRef<[number, number, number, number]>([0, 0, 0, 1]);
  const settledRef = useRef(false);
  const stillFrames = useRef(0);
  const fadeStartTime = useRef<number | null>(null);
  const transitioningRef = useRef(false);
  const transitionStartTime = useRef<number | null>(null);
  const startQuaternion = useRef<THREE.Quaternion>(new THREE.Quaternion());
  const opacityRef = useRef(1);
  
  useEffect(() => {
    const unsubVel = api.velocity.subscribe((v) => { velocityRef.current = v; });
    const unsubAng = api.angularVelocity.subscribe((v) => { angularRef.current = v; });
    const unsubPos = api.position.subscribe((p) => { 
      positionRef.current = p;
      onPositionUpdate(die.id, p);
    });
    const unsubQuat = api.quaternion.subscribe((q) => { quaternionRef.current = q; });
    return () => {
      unsubVel();
      unsubAng();
      unsubPos();
      unsubQuat();
    };
  }, [api, die.id, onPositionUpdate]);
  
  useFrame(() => {
    if (!groupRef.current) return;
    
    if (!settledRef.current && !transitioningRef.current) {
      const vel = velocityRef.current;
      const ang = angularRef.current;
      const speed = Math.sqrt(vel[0]**2 + vel[1]**2 + vel[2]**2);
      const angSpeed = Math.sqrt(ang[0]**2 + ang[1]**2 + ang[2]**2);
      
      if (speed < 0.12 && angSpeed < 0.25) {
        stillFrames.current++;
        if (stillFrames.current > 20) {
          transitioningRef.current = true;
          transitionStartTime.current = Date.now();
          api.velocity.set(0, 0, 0);
          api.angularVelocity.set(0, 0, 0);
          startQuaternion.current = new THREE.Quaternion(
            quaternionRef.current[0],
            quaternionRef.current[1],
            quaternionRef.current[2],
            quaternionRef.current[3]
          );
        }
      } else {
        stillFrames.current = 0;
      }
    }
    
    if (transitioningRef.current && !settledRef.current) {
      const elapsed = (Date.now() - (transitionStartTime.current || Date.now())) / 1000;
      const duration = 0.4;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      
      const currentQuat = startQuaternion.current.clone().slerp(die.targetRotation, eased);
      api.quaternion.set(currentQuat.x, currentQuat.y, currentQuat.z, currentQuat.w);
      
      if (progress >= 1) {
        settledRef.current = true;
        onSettled(die.id, positionRef.current);
      }
    }
    
    if (die.fadeOut) {
      if (fadeStartTime.current === null) {
        fadeStartTime.current = Date.now();
      }
      const elapsed = (Date.now() - fadeStartTime.current) / 1000;
      const fadeDuration = 0.7;
      opacityRef.current = Math.max(0, 1 - elapsed / fadeDuration);
      
      if (meshRef.current) {
        const material = meshRef.current.material as THREE.MeshStandardMaterial;
        material.opacity = opacityRef.current;
        material.transparent = true;
      }
      
      if (opacityRef.current <= 0) {
        onFadeComplete(die.id);
      }
    }
  });
  
  const color = DIE_COLORS[dieType];
  
  return (
    <group ref={groupRef}>
      <mesh ref={meshRef} geometry={geometry} castShadow receiveShadow>
        <meshStandardMaterial 
          color={color} 
          metalness={0.45} 
          roughness={0.25}
          envMapIntensity={0.9}
        />
      </mesh>
      <DieNumbers dieType={dieType} size={size} opacity={opacityRef.current} />
    </group>
  );
}

function Ground() {
  const [ref] = usePlane(() => ({
    rotation: [-Math.PI / 2, 0, 0],
    position: [0, -0.3, 0],
    material: { friction: 0.7, restitution: 0.2 },
  }), useRef<THREE.Mesh>(null));
  
  return <mesh ref={ref} receiveShadow visible={false}><planeGeometry args={[30, 30]} /></mesh>;
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
    <Physics gravity={[0, -14, 0]} iterations={12} tolerance={0.0001}>
      <ambientLight intensity={0.5} />
      <directionalLight 
        position={[4, 10, 5]} 
        intensity={1.4} 
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-far={25}
        shadow-camera-left={-6}
        shadow-camera-right={6}
        shadow-camera-top={6}
        shadow-camera-bottom={-6}
      />
      <pointLight position={[-4, 5, -4]} intensity={0.35} color="#ffe4c4" />
      <pointLight position={[0, 3, 3]} intensity={0.25} color="#c4e4ff" />
      
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
    </Physics>
  );
}

export function BattlemapDiceOverlay({ onRollComplete }: BattlemapDiceOverlayProps) {
  const [activeDice, setActiveDice] = useState<ActiveDie[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const diePositions = useRef<Map<string, [number, number, number]>>(new Map());
  
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
      settledPosition: null,
      showResult: false,
      fadeOut: false,
      targetRotation: physics.targetRotation,
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
    }, 2500);
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
