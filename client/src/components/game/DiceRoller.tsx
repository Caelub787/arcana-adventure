import { useRef, useState, useEffect, useMemo, forwardRef, useImperativeHandle, Suspense, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Environment, useTexture, Html } from '@react-three/drei';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Dice1, Dice3, Dice5, Dice6, X, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DiceTextureSettings } from './DiceTextureSettings';
import { api, type DiceTexture } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';

type DieType = 'd4' | 'd6' | 'd8' | 'd10' | 'd12' | 'd20';

interface DiceRollResult {
  dieType: DieType;
  result: number;
  modifier: number;
  total: number;
  userId?: string;
  username?: string;
  characterName?: string;
  purpose?: string;
}

interface DiceRollerProps {
  onRollComplete?: (result: DiceRollResult) => void;
  userTextures?: Record<DieType, string>;
  modifier?: number;
  purpose?: string;
  characterName?: string;
  onClose?: () => void;
}

interface PhysicsDieProps {
  dieType: DieType;
  texture?: string;
  initialPosition: [number, number, number];
  initialVelocity: [number, number, number];
  initialAngularVelocity: [number, number, number];
  world: CANNON.World;
  onRollComplete: (result: number) => void;
  seed: string;
}

const seededRandom = (seed: string) => {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  const x = Math.sin(hash) * 10000;
  return x - Math.floor(x);
};

const generateSeed = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

const createD6Geometry = () => {
  return new THREE.BoxGeometry(1, 1, 1);
};

const createD4Geometry = () => {
  return new THREE.TetrahedronGeometry(0.7);
};

const createD8Geometry = () => {
  return new THREE.OctahedronGeometry(0.6);
};

const createD10Geometry = () => {
  const vertices = [];
  const indices = [];
  const top = [0, 0.6, 0];
  const bottom = [0, -0.6, 0];
  const middleTop: number[][] = [];
  const middleBottom: number[][] = [];
  
  for (let i = 0; i < 5; i++) {
    const angle = (i * 2 * Math.PI) / 5;
    const angleOffset = (i * 2 * Math.PI) / 5 + Math.PI / 5;
    middleTop.push([Math.cos(angle) * 0.5, 0.2, Math.sin(angle) * 0.5]);
    middleBottom.push([Math.cos(angleOffset) * 0.5, -0.2, Math.sin(angleOffset) * 0.5]);
  }
  
  vertices.push(...top);
  for (const v of middleTop) vertices.push(...v);
  for (const v of middleBottom) vertices.push(...v);
  vertices.push(...bottom);
  
  for (let i = 0; i < 5; i++) {
    indices.push(0, 1 + i, 1 + ((i + 1) % 5));
    indices.push(1 + i, 6 + i, 1 + ((i + 1) % 5));
    indices.push(1 + ((i + 1) % 5), 6 + i, 6 + ((i + 1) % 5));
    indices.push(6 + i, 11, 6 + ((i + 1) % 5));
  }
  
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
};

const createD12Geometry = () => {
  return new THREE.DodecahedronGeometry(0.6);
};

const createD20Geometry = () => {
  return new THREE.IcosahedronGeometry(0.6);
};

const getDieGeometry = (dieType: DieType): THREE.BufferGeometry => {
  switch (dieType) {
    case 'd4': return createD4Geometry();
    case 'd6': return createD6Geometry();
    case 'd8': return createD8Geometry();
    case 'd10': return createD10Geometry();
    case 'd12': return createD12Geometry();
    case 'd20': return createD20Geometry();
    default: return createD6Geometry();
  }
};

const getDieMaxValue = (dieType: DieType): number => {
  const match = dieType.match(/d(\d+)/);
  return match ? parseInt(match[1]) : 6;
};

const createCannonShape = (dieType: DieType): CANNON.Shape => {
  switch (dieType) {
    case 'd4':
      const d4Verts = [
        new CANNON.Vec3(0, 0.7, 0),
        new CANNON.Vec3(-0.5, -0.35, 0.5),
        new CANNON.Vec3(0.5, -0.35, 0.5),
        new CANNON.Vec3(0, -0.35, -0.5),
      ];
      return new CANNON.ConvexPolyhedron({
        vertices: d4Verts,
        faces: [[0, 1, 2], [0, 2, 3], [0, 3, 1], [1, 3, 2]]
      });
    case 'd6':
      return new CANNON.Box(new CANNON.Vec3(0.5, 0.5, 0.5));
    case 'd8':
      const d8Verts = [
        new CANNON.Vec3(0.6, 0, 0),
        new CANNON.Vec3(-0.6, 0, 0),
        new CANNON.Vec3(0, 0.6, 0),
        new CANNON.Vec3(0, -0.6, 0),
        new CANNON.Vec3(0, 0, 0.6),
        new CANNON.Vec3(0, 0, -0.6),
      ];
      return new CANNON.ConvexPolyhedron({
        vertices: d8Verts,
        faces: [
          [0, 2, 4], [0, 4, 3], [0, 3, 5], [0, 5, 2],
          [1, 4, 2], [1, 3, 4], [1, 5, 3], [1, 2, 5]
        ]
      });
    case 'd10':
      return new CANNON.Sphere(0.5);
    case 'd12':
      return new CANNON.Sphere(0.55);
    case 'd20':
      return new CANNON.Sphere(0.5);
    default:
      return new CANNON.Box(new CANNON.Vec3(0.5, 0.5, 0.5));
  }
};

const createDieMaterial = (dieType: DieType, customTexture?: string): THREE.MeshStandardMaterial => {
  const material = new THREE.MeshStandardMaterial({
    color: customTexture ? 0xffffff : 0x1a1a2e,
    roughness: 0.3,
    metalness: 0.7,
  });
  
  if (customTexture && customTexture.startsWith('data:image')) {
    const textureLoader = new THREE.TextureLoader();
    textureLoader.load(customTexture, (texture) => {
      material.map = texture;
      material.needsUpdate = true;
    });
  }
  
  return material;
};

const PhysicsDie: React.FC<PhysicsDieProps> = ({
  dieType,
  texture,
  initialPosition,
  initialVelocity,
  initialAngularVelocity,
  world,
  onRollComplete,
  seed,
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const bodyRef = useRef<CANNON.Body | null>(null);
  const [isSettled, setIsSettled] = useState(false);
  const settledFrames = useRef(0);
  const maxValue = getDieMaxValue(dieType);

  useEffect(() => {
    const shape = createCannonShape(dieType);
    const body = new CANNON.Body({
      mass: 1,
      shape,
      position: new CANNON.Vec3(...initialPosition),
      velocity: new CANNON.Vec3(...initialVelocity),
      angularVelocity: new CANNON.Vec3(...initialAngularVelocity),
      linearDamping: 0.3,
      angularDamping: 0.3,
    });
    
    const dieMaterial = new CANNON.Material('die');
    body.material = dieMaterial;
    
    world.addBody(body);
    bodyRef.current = body;

    return () => {
      world.removeBody(body);
    };
  }, [dieType, initialPosition, initialVelocity, initialAngularVelocity, world]);

  useFrame(() => {
    if (!meshRef.current || !bodyRef.current || isSettled) return;
    
    const body = bodyRef.current;
    meshRef.current.position.copy(body.position as unknown as THREE.Vector3);
    meshRef.current.quaternion.copy(body.quaternion as unknown as THREE.Quaternion);
    
    const velocity = body.velocity.length();
    const angularVelocity = body.angularVelocity.length();
    
    if (velocity < 0.05 && angularVelocity < 0.05) {
      settledFrames.current++;
      if (settledFrames.current > 60) {
        setIsSettled(true);
        const random = seededRandom(seed + dieType);
        const result = Math.floor(random * maxValue) + 1;
        onRollComplete(result);
      }
    } else {
      settledFrames.current = 0;
    }
  });

  const geometry = useMemo(() => getDieGeometry(dieType), [dieType]);
  const material = useMemo(() => createDieMaterial(dieType, texture), [dieType, texture]);

  return (
    <mesh ref={meshRef} geometry={geometry} material={material} castShadow receiveShadow>
      <DieNumberOverlay dieType={dieType} />
    </mesh>
  );
};

const DieNumberOverlay: React.FC<{ dieType: DieType }> = ({ dieType }) => {
  const maxValue = getDieMaxValue(dieType);
  const numberPositions = useMemo(() => {
    const positions: Array<{ position: [number, number, number]; rotation: [number, number, number]; value: number }> = [];
    
    switch (dieType) {
      case 'd6':
        positions.push(
          { position: [0, 0.51, 0], rotation: [-Math.PI/2, 0, 0], value: 1 },
          { position: [0, -0.51, 0], rotation: [Math.PI/2, 0, 0], value: 6 },
          { position: [0.51, 0, 0], rotation: [0, Math.PI/2, 0], value: 3 },
          { position: [-0.51, 0, 0], rotation: [0, -Math.PI/2, 0], value: 4 },
          { position: [0, 0, 0.51], rotation: [0, 0, 0], value: 2 },
          { position: [0, 0, -0.51], rotation: [0, Math.PI, 0], value: 5 },
        );
        break;
      default:
        break;
    }
    
    return positions;
  }, [dieType]);

  if (dieType !== 'd6') return null;

  return (
    <>
      {numberPositions.map((np, i) => (
        <mesh key={i} position={np.position} rotation={np.rotation}>
          <planeGeometry args={[0.6, 0.6]} />
          <meshBasicMaterial transparent opacity={0} />
        </mesh>
      ))}
    </>
  );
};

const DiceScene: React.FC<{
  dieType: DieType;
  texture?: string;
  seed: string;
  onRollComplete: (result: number) => void;
}> = ({ dieType, texture, seed, onRollComplete }) => {
  const worldRef = useRef<CANNON.World | null>(null);
  const bodiesRef = useRef<CANNON.Body[]>([]);

  const world = useMemo(() => {
    if (worldRef.current) {
      bodiesRef.current.forEach(body => {
        worldRef.current!.removeBody(body);
      });
      bodiesRef.current = [];
    }

    const w = new CANNON.World();
    w.gravity.set(0, -20, 0);
    w.broadphase = new CANNON.NaiveBroadphase();
    
    const groundMaterial = new CANNON.Material('ground');
    const groundBody = new CANNON.Body({
      mass: 0,
      shape: new CANNON.Plane(),
      material: groundMaterial,
    });
    groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    groundBody.position.set(0, -2, 0);
    w.addBody(groundBody);
    bodiesRef.current.push(groundBody);
    
    const wallMaterial = new CANNON.Material('wall');
    const walls = [
      { position: [4, 0, 0], rotation: [0, 0, Math.PI/2] },
      { position: [-4, 0, 0], rotation: [0, 0, -Math.PI/2] },
      { position: [0, 0, 4], rotation: [Math.PI/2, 0, 0] },
      { position: [0, 0, -4], rotation: [-Math.PI/2, 0, 0] },
    ];
    
    walls.forEach(({ position, rotation }) => {
      const wallBody = new CANNON.Body({
        mass: 0,
        shape: new CANNON.Plane(),
        material: wallMaterial,
      });
      wallBody.quaternion.setFromEuler(...rotation as [number, number, number]);
      wallBody.position.set(...position as [number, number, number]);
      w.addBody(wallBody);
      bodiesRef.current.push(wallBody);
    });
    
    worldRef.current = w;
    return w;
  }, [seed]);

  useEffect(() => {
    return () => {
      if (worldRef.current) {
        bodiesRef.current.forEach(body => {
          worldRef.current!.removeBody(body);
        });
        bodiesRef.current = [];
        worldRef.current = null;
      }
    };
  }, []);

  useFrame(() => {
    world.step(1 / 60);
  });

  const random = seededRandom(seed);
  const initialVelocity: [number, number, number] = [
    (random - 0.5) * 8,
    -5,
    (random - 0.5) * 8,
  ];
  const initialAngularVelocity: [number, number, number] = [
    (random - 0.5) * 20,
    (random - 0.5) * 20,
    (random - 0.5) * 20,
  ];

  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight position={[5, 10, 5]} intensity={1} castShadow />
      <pointLight position={[-5, 5, -5]} intensity={0.5} />
      
      <mesh receiveShadow position={[0, -2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[12, 12]} />
        <meshStandardMaterial color="#2a2a4a" roughness={0.8} />
      </mesh>
      
      <PhysicsDie
        dieType={dieType}
        texture={texture}
        initialPosition={[0, 4, 0]}
        initialVelocity={initialVelocity}
        initialAngularVelocity={initialAngularVelocity}
        world={world}
        onRollComplete={onRollComplete}
        seed={seed}
      />
    </>
  );
};

export interface DiceRollerHandle {
  roll: (dieType: DieType) => void;
}

export const DiceRoller = forwardRef<DiceRollerHandle, DiceRollerProps>(({
  onRollComplete,
  userTextures: propTextures = {},
  modifier = 0,
  purpose,
  characterName,
  onClose,
}, ref) => {
  const { user } = useAuth();
  const [isRolling, setIsRolling] = useState(false);
  const [currentDie, setCurrentDie] = useState<DieType | null>(null);
  const [seed, setSeed] = useState('');
  const [result, setResult] = useState<number | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const { data: userTexturesData = [] } = useQuery({
    queryKey: [`/api/users/${user?.id}/dice-textures`],
    queryFn: () => api.getUserDiceTextures(user!.id),
    enabled: !!user?.id,
  });

  const userTextures = useMemo(() => {
    const textures: Record<DieType, string> = { ...propTextures } as Record<DieType, string>;
    userTexturesData.forEach((t: DiceTexture) => {
      textures[t.dieType as DieType] = t.textureData;
    });
    return textures;
  }, [userTexturesData, propTextures]);

  const handleRoll = useCallback((dieType: DieType) => {
    setIsRolling(true);
    setCurrentDie(dieType);
    setSeed(generateSeed());
    setResult(null);
    setShowResult(false);
  }, []);

  useImperativeHandle(ref, () => ({
    roll: handleRoll,
  }), [handleRoll]);

  const handleRollComplete = useCallback((rollResult: number) => {
    setResult(rollResult);
    setShowResult(true);
    
    if (onRollComplete && currentDie) {
      onRollComplete({
        dieType: currentDie,
        result: rollResult,
        modifier,
        total: rollResult + modifier,
        purpose,
        characterName,
      });
    }
    
    setTimeout(() => {
      setIsRolling(false);
      setCurrentDie(null);
      setShowResult(false);
    }, 2000);
  }, [onRollComplete, currentDie, modifier, purpose, characterName]);

  const diceButtons: Array<{ type: DieType; label: string }> = [
    { type: 'd4', label: 'D4' },
    { type: 'd6', label: 'D6' },
    { type: 'd8', label: 'D8' },
    { type: 'd10', label: 'D10' },
    { type: 'd12', label: 'D12' },
    { type: 'd20', label: 'D20' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm" data-testid="dice-roller-overlay">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="relative w-full max-w-lg mx-4"
      >
        <div className="bg-gradient-to-b from-stone-900 to-stone-950 rounded-xl border border-amber-900/50 shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-amber-900/30">
            <h2 className="text-xl font-bold text-amber-100">Roll Dice</h2>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSettingsOpen(true)}
                className="text-amber-100/70 hover:text-amber-100 hover:bg-amber-900/20"
                data-testid="dice-roller-settings"
              >
                <Settings className="h-5 w-5" />
              </Button>
              {onClose && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onClose}
                  className="text-amber-100/70 hover:text-amber-100 hover:bg-amber-900/20"
                  data-testid="dice-roller-close"
                >
                  <X className="h-5 w-5" />
                </Button>
              )}
            </div>
          </div>

          <div className="aspect-video relative bg-stone-950">
            {isRolling && currentDie ? (
              <Canvas
                shadows
                camera={{ position: [0, 6, 6], fov: 50 }}
                className="touch-none"
              >
                <Suspense fallback={null}>
                  <DiceScene
                    dieType={currentDie}
                    texture={userTextures[currentDie]}
                    seed={seed}
                    onRollComplete={handleRollComplete}
                  />
                  <OrbitControls
                    enablePan={false}
                    enableZoom={false}
                    minPolarAngle={Math.PI / 4}
                    maxPolarAngle={Math.PI / 2}
                  />
                </Suspense>
              </Canvas>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-amber-100/30 text-center">
                  <Dice6 className="h-16 w-16 mx-auto mb-2" />
                  <p>Select a die to roll</p>
                </div>
              </div>
            )}
            
            <AnimatePresence>
              {showResult && result !== null && (
                <motion.div
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.5, opacity: 0 }}
                  className="absolute inset-0 flex items-center justify-center pointer-events-none"
                >
                  <div className="text-center bg-black/60 backdrop-blur-sm rounded-2xl p-6">
                    <div className="text-6xl font-bold text-amber-400 mb-2">
                      {result}
                    </div>
                    {modifier !== 0 && (
                      <div className="text-2xl text-amber-200/80">
                        {modifier > 0 ? '+' : ''}{modifier} = {result + modifier}
                      </div>
                    )}
                    {purpose && (
                      <div className="text-sm text-amber-100/60 mt-2">{purpose}</div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="p-4">
            <div className="grid grid-cols-6 gap-2">
              {diceButtons.map(({ type, label }) => (
                <Button
                  key={type}
                  onClick={() => handleRoll(type)}
                  disabled={isRolling}
                  variant="outline"
                  className={cn(
                    "h-14 flex flex-col items-center justify-center border-amber-900/50 bg-stone-800/50 hover:bg-amber-900/30 hover:border-amber-700/70 text-amber-100 disabled:opacity-50",
                    currentDie === type && "ring-2 ring-amber-500"
                  )}
                  data-testid={`dice-button-${type}`}
                >
                  <span className="text-lg font-bold">{label}</span>
                </Button>
              ))}
            </div>

            {modifier !== 0 && (
              <div className="mt-3 text-center text-sm text-amber-200/70">
                Modifier: {modifier > 0 ? '+' : ''}{modifier}
              </div>
            )}
            {purpose && (
              <div className="mt-1 text-center text-xs text-amber-100/50">
                Rolling for: {purpose}
              </div>
            )}
          </div>
        </div>
      </motion.div>
      
      <DiceTextureSettings
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
      />
    </div>
  );
});

DiceRoller.displayName = 'DiceRoller';

export const DiceRollNotification: React.FC<{
  roll: DiceRollResult;
  onDismiss: () => void;
}> = ({ roll, onDismiss }) => {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 5000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <motion.div
      initial={{ x: 100, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 100, opacity: 0 }}
      className="bg-stone-900/95 border border-amber-900/50 rounded-lg p-3 shadow-xl min-w-[200px]"
    >
      <div className="flex items-center gap-3">
        <div className="flex-shrink-0 w-12 h-12 bg-amber-900/30 rounded-lg flex items-center justify-center">
          <span className="text-2xl font-bold text-amber-400">{roll.result}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            <span className="text-sm font-medium text-amber-100 truncate">
              {roll.username || 'Player'}
            </span>
            <span className="text-xs text-amber-100/50">rolled {roll.dieType}</span>
          </div>
          {roll.modifier !== 0 && (
            <div className="text-xs text-amber-200/70">
              {roll.result} {roll.modifier > 0 ? '+' : ''}{roll.modifier} = {roll.total}
            </div>
          )}
          {roll.purpose && (
            <div className="text-xs text-amber-100/40 truncate">{roll.purpose}</div>
          )}
        </div>
      </div>
    </motion.div>
  );
};

export default DiceRoller;
