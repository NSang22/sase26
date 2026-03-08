import { Suspense, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';

const TABLE_POSITION = [0, 1, -1.9];
const TABLE_SCALE    = 2.0;
const LAPTOP_SCALE   = 1.25;
const LAPTOP_POSITIONS = [
  [-0.60, 1.36, -1.70],
  [ 0.60, 1.36, -1.70],
  [-0.60, 1.36, -2.50],
  [ 0.60, 1.36, -2.50],
];

function TableModel() {
  const { scene } = useGLTF('/models/Table.glb');
  const clone = useMemo(() => scene.clone(true), [scene]);
  return <primitive object={clone} position={TABLE_POSITION} scale={TABLE_SCALE} />;
}

function LaptopModel({ position }) {
  const { scene } = useGLTF('/models/Laptop.glb');
  const clone = useMemo(() => scene.clone(true), [scene]);
  return <primitive object={clone} position={position} scale={LAPTOP_SCALE} />;
}

function DeskFallback() {
  return (
    <mesh receiveShadow castShadow position={[0, 1.05, -1.9]}>
      <boxGeometry args={[2.4, 0.06, 1.2]} />
      <meshStandardMaterial color="#3d2b1f" roughness={0.7} />
    </mesh>
  );
}

/**
 * Study-room environment. No walls — open scene.
 * playerCount controls how many laptops appear on the table (max 4).
 */
export function StudyRoom({ playerCount = 2 }) {
  const visibleLaptops = LAPTOP_POSITIONS.slice(0, Math.max(1, playerCount));

  return (
    <>
      {/* ── Lighting ──────────────────────────────────────────────────────── */}
      <ambientLight intensity={0.35} color="#c0cce8" />
      <pointLight
        position={[0, 4.5, -1.9]}
        intensity={2.0}
        color="#ffe8c0"
        castShadow
        shadow-mapSize={[1024, 1024]}
      />
      <directionalLight position={[-4, 5, 3]} intensity={0.35} color="#a0b8e0" />
      <pointLight position={[4, 1.5, 1]} intensity={0.5} color="#7c3aed" />

      {/* ── Floor ─────────────────────────────────────────────────────────── */}
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[20, 20]} />
        <meshStandardMaterial color="#1c1610" roughness={0.95} />
      </mesh>

      {/* ── Table + Laptops ───────────────────────────────────────────────── */}
      <Suspense fallback={<DeskFallback />}>
        <TableModel />
        {visibleLaptops.map((pos, i) => (
          <LaptopModel key={i} position={pos} />
        ))}
      </Suspense>
    </>
  );
}

useGLTF.preload('/models/Table.glb');
useGLTF.preload('/models/Laptop.glb');
