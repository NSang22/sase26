import { Environment, ContactShadows } from '@react-three/drei';

/**
 * The 3D study room environment.
 * Uses built-in primitives: floor, back wall, desk, and decorative lights.
 */
function RoomGeometry() {
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
      {/* Desk legs */}
      {[[-1.8, 0.25, -0.5], [1.8, 0.25, -0.5], [-1.8, 0.25, -1.5], [1.8, 0.25, -1.5]].map((pos, i) => (
        <mesh key={i} castShadow position={pos}>
          <boxGeometry args={[0.06, 0.5, 0.06]} />
          <meshStandardMaterial color="#1e1050" />
        </mesh>
      ))}
      {/* Side walls (subtle) */}
      <mesh receiveShadow position={[-6, 2.5, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[10, 6]} />
        <meshStandardMaterial color="#0f0f24" />
      </mesh>
      <mesh receiveShadow position={[6, 2.5, 0]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[10, 6]} />
        <meshStandardMaterial color="#0f0f24" />
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
      <pointLight position={[2, 2, 1]} intensity={0.3} color="#a78bfa" />

      <Environment preset="night" />

      <ContactShadows
        position={[0, 0, 0]}
        opacity={0.5}
        scale={10}
        blur={2}
        far={1}
      />

      <RoomGeometry />
    </>
  );
}
