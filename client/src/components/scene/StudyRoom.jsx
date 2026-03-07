import { Suspense } from 'react';
import { useGLTF, Environment, ContactShadows } from '@react-three/drei';

/**
 * The 3D study room environment.
 * Expects /assets/room.glb — a cozy two-seat desk scene from Blender.
 * Falls back to a simple floor + ambient light if the model isn't ready.
 */
function RoomModel() {
  const { scene } = useGLTF('/assets/room.glb');
  return <primitive object={scene} />;
}

function RoomFallback() {
  return (
    <>
      {/* Floor */}
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
        <planeGeometry args={[20, 20]} />
        <meshStandardMaterial color="#1a1a2e" />
      </mesh>
      {/* Back wall */}
      <mesh receiveShadow position={[0, 2.5, -4]}>
        <planeGeometry args={[12, 6]} />
        <meshStandardMaterial color="#12122a" />
      </mesh>
      {/* Desk surface */}
      <mesh receiveShadow castShadow position={[0, 0.5, -1]}>
        <boxGeometry args={[4, 0.08, 1.2]} />
        <meshStandardMaterial color="#2d1b69" />
      </mesh>
    </>
  );
}

export function StudyRoom() {
  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.3} />
      <directionalLight
        castShadow
        position={[3, 8, 5]}
        intensity={1.2}
        shadow-mapSize={[2048, 2048]}
      />
      <pointLight position={[-2, 3, 2]} intensity={0.6} color="#6366f1" />

      <Environment preset="night" />

      <ContactShadows
        position={[0, 0, 0]}
        opacity={0.5}
        scale={10}
        blur={2}
        far={1}
      />

      <Suspense fallback={<RoomFallback />}>
        <RoomModel />
      </Suspense>
    </>
  );
}
