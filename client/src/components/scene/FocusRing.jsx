import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';

/**
 * Neon "Lock-In" ring that glows under a pet when focused.
 * Dims and pulses when distracted.
 * Pass a `color` hex string to give each player a unique ring color.
 */
export function FocusRing({ focused = true, position = [0, 0, 0], color = '#a78bfa' }) {
  const matRef = useRef();

  useFrame(({ clock }) => {
    if (!matRef.current) return;
    const t = clock.getElapsedTime();
    if (focused) {
      matRef.current.opacity = 0.6 + Math.sin(t * 2) * 0.2;
      matRef.current.emissiveIntensity = 1.5 + Math.sin(t * 2) * 0.5;
    } else {
      matRef.current.opacity = 0.1 + Math.abs(Math.sin(t * 0.5)) * 0.15;
      matRef.current.emissiveIntensity = 0.2;
    }
  });

  return (
    <mesh position={position} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.45, 0.55, 64]} />
      <meshStandardMaterial
        ref={matRef}
        color={focused ? color : '#444'}
        emissive={focused ? color : '#222'}
        emissiveIntensity={focused ? 1.5 : 0.2}
        transparent
        opacity={focused ? 0.7 : 0.15}
      />
    </mesh>
  );
}
