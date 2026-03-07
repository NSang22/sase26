import { useRef, useEffect } from 'react';
import { useGLTF, useAnimations } from '@react-three/drei';

/**
 * Pet model component.
 *
 * Expects a .glb at /assets/pets/{species}.glb with three named animation clips:
 *   - "Working"    — happy studying idle loop
 *   - "Idle"       — neutral waiting loop
 *   - "Distracted" — sleeping/sad loop triggered when owner loses focus
 *
 * During development before Blender assets exist, falls back to a placeholder
 * colored cube that still drives the animation state machine.
 */
export function Pet({ species = 'cat', focused = true, position = [0, 0, 0], scale = 1 }) {
  const groupRef = useRef();
  const modelPath = `/assets/pets/${species}.glb`;

  // Try to load the real model — useGLTF will throw if missing
  // We catch this in a Suspense boundary or ErrorBoundary above
  const { scene, animations } = useGLTF(modelPath);
  const { actions, mixer } = useAnimations(animations, groupRef);

  useEffect(() => {
    const clipName = focused ? 'Working' : 'Distracted';
    const target = actions[clipName] ?? actions['Idle'];
    if (!target) return;

    // Crossfade into the new state
    Object.values(actions).forEach((a) => a?.fadeOut(0.4));
    target.reset().fadeIn(0.4).play();
  }, [focused, actions]);

  return (
    <group ref={groupRef} position={position} scale={scale}>
      <primitive object={scene} />
    </group>
  );
}

/**
 * Fallback placeholder used before real .glb assets are ready.
 * A simple colored box that changes color based on focus state.
 */
export function PetPlaceholder({ focused = true, position = [0, 0, 0], label = 'Pet' }) {
  const meshRef = useRef();

  return (
    <group position={position}>
      <mesh ref={meshRef} castShadow>
        <boxGeometry args={[0.6, 0.6, 0.6]} />
        <meshStandardMaterial color={focused ? '#7c3aed' : '#3a3a3a'} />
      </mesh>
      {/* Simple bounce when focused */}
    </group>
  );
}
