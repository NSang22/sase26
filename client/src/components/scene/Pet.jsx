import { useRef, useEffect, useMemo, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF, useAnimations } from '@react-three/drei';
import { MathUtils } from 'three';

// ─── Particle Effects (ported from Test/test.jsx) ─────────────────────────────

function EnergyParticles() {
  const group = useRef();
  const particles = useMemo(
    () =>
      Array.from({ length: 15 }, (_, i) => ({
        speed: 0.05 + (((Math.sin((i + 1) * 97) + 1) / 2) * 0.1),
        x: (((Math.sin((i + 1) * 131) + 1) / 2) - 0.5) * 1.2,
        y: ((Math.cos((i + 1) * 193) + 1) / 2) * 1.0,
        z: (((Math.cos((i + 1) * 157) + 1) / 2) - 0.5) * 1.2,
      })),
    []
  );

  useFrame((state) => {
    if (!group.current) return;
    const t = state.clock.elapsedTime;
    group.current.children.forEach((p, i) => {
      const data = particles[i];
      p.position.y = ((data.y + t * data.speed * 15) % 2.5) + 0.2;
      p.position.x = data.x + Math.sin(t * 12 + i) * 0.1;
      p.material.opacity = 1 - p.position.y / 3;
    });
  });

  return (
    <group ref={group}>
      {particles.map((_, i) => (
        <mesh key={i}>
          <sphereGeometry args={[0.08, 8, 8]} />
          <meshBasicMaterial color="#00aaff" transparent />
        </mesh>
      ))}
    </group>
  );
}

function DizzySleepParticles() {
  const starsRef = useRef();
  const zsRef = useRef();
  const startRef = useRef(null);
  const zData = useMemo(
    () =>
      Array.from({ length: 4 }, (_, i) => ({
        x: 1.15 + i * 0.26,
        y: 0.85 + i * 0.45,
        z: 0.1 + ((Math.sin((i + 1) * 71) + 1) / 2) * 0.35,
        drift: 0.08 + i * 0.03,
        scale: 0.9 + i * 0.18,
      })),
    []
  );

  useFrame((state) => {
    if (startRef.current === null) startRef.current = state.clock.elapsedTime;
    const phaseTime = state.clock.elapsedTime - startRef.current;
    const isSleeping = phaseTime > 3;
    const t = state.clock.elapsedTime;

    if (starsRef.current) {
      starsRef.current.visible = !isSleeping;
      starsRef.current.children.forEach((p, i) => {
        const angle = (i / 5) * Math.PI * 2;
        p.position.x = Math.cos(angle + t * 5) * 0.8;
        p.position.z = Math.sin(angle + t * 5) * 0.8;
        p.position.y = 2.0 + Math.sin(t * 5 + i) * 0.1;
      });
    }

    if (zsRef.current) {
      zsRef.current.visible = isSleeping;
      zsRef.current.children.forEach((zGroup, i) => {
        const data = zData[i];
        zGroup.position.x = data.x + Math.sin(t * 1.6 + i) * data.drift;
        zGroup.position.y = data.y + (Math.sin(t * 2 + i) + 1) * 0.18;
        zGroup.position.z = data.z + Math.cos(t * 1.2 + i) * 0.08;
        zGroup.rotation.z = Math.sin(t * 0.8 + i) * 0.08;
        zGroup.scale.setScalar(data.scale + Math.sin(t * 1.3 + i) * 0.05);
      });
    }
  });

  return (
    <group>
      <group ref={starsRef}>
        {Array.from({ length: 5 }).map((_, i) => (
          <mesh key={i}>
            <octahedronGeometry args={[0.12, 0]} />
            <meshBasicMaterial color="#ffe000" transparent />
          </mesh>
        ))}
      </group>
      <group ref={zsRef} visible={false}>
        {zData.map((_, i) => (
          <group key={i}>
            <mesh position={[0, 0.15, 0]} rotation={[0, 0, 0.12]}>
              <boxGeometry args={[0.28, 0.055, 0.04]} />
              <meshBasicMaterial color="#a8e8ff" transparent opacity={0.92} />
            </mesh>
            <mesh position={[0, 0, 0]} rotation={[0, 0, -0.62]}>
              <boxGeometry args={[0.32, 0.055, 0.04]} />
              <meshBasicMaterial color="#8bdcff" transparent opacity={0.9} />
            </mesh>
            <mesh position={[0, -0.15, 0]} rotation={[0, 0, 0.12]}>
              <boxGeometry args={[0.28, 0.055, 0.04]} />
              <meshBasicMaterial color="#a8e8ff" transparent opacity={0.92} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
}

function MegaSpinParticles() {
  const heatRingRef = useRef();
  const flamesRef = useRef();
  const embersRef = useRef();
  const flames = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => ({
        angle: (i / 14) * Math.PI * 2,
        radius: 1.05 + ((Math.sin((i + 1) * 211) + 1) / 2) * 0.38,
        speed: 2.6 + ((Math.cos((i + 1) * 149) + 1) / 2) * 2.1,
        height: 0.45 + ((Math.sin((i + 1) * 61) + 1) / 2) * 0.55,
        sway: 0.08 + ((Math.cos((i + 1) * 41) + 1) / 2) * 0.08,
      })),
    []
  );
  const embers = useMemo(
    () =>
      Array.from({ length: 18 }, (_, i) => ({
        angle: (i / 18) * Math.PI * 2,
        radius: 0.65 + ((Math.sin((i + 1) * 73) + 1) / 2) * 0.9,
        speed: 4.5 + ((Math.cos((i + 1) * 37) + 1) / 2) * 3,
        rise: 0.7 + ((Math.sin((i + 1) * 89) + 1) / 2) * 0.9,
      })),
    []
  );

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (heatRingRef.current) {
      heatRingRef.current.rotation.z = t * 7;
      heatRingRef.current.scale.setScalar(1 + Math.sin(t * 7) * 0.1);
    }
    if (flamesRef.current) {
      flamesRef.current.children.forEach((flame, i) => {
        const data = flames[i];
        const orbit = data.angle + t * data.speed;
        flame.position.x = Math.cos(orbit) * data.radius + Math.sin(t * 9 + i) * data.sway;
        flame.position.z = Math.sin(orbit) * data.radius + Math.cos(t * 8 + i) * data.sway;
        flame.position.y = 0.2 + Math.abs(Math.sin(t * 6 + i)) * data.height;
        flame.rotation.y = -orbit + Math.PI / 2;
        flame.scale.set(1, 0.9 + Math.sin(t * 10 + i) * 0.18, 1);
      });
    }
    if (!embersRef.current) return;
    embersRef.current.children.forEach((ember, i) => {
      const data = embers[i];
      const orbit = data.angle + t * data.speed;
      ember.position.x = Math.cos(orbit) * data.radius;
      ember.position.z = Math.sin(orbit) * data.radius;
      ember.position.y = ((t * data.rise + i * 0.15) % 1.6) + 0.3;
      ember.scale.setScalar(0.7 + Math.sin(t * 12 + i) * 0.12);
    });
  });

  return (
    <group>
      <mesh ref={heatRingRef} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.32, 0.08, 12, 48]} />
        <meshBasicMaterial color="#ff6a00" transparent opacity={0.72} />
      </mesh>
      <group ref={flamesRef}>
        {flames.map((_, i) => (
          <mesh key={i}>
            <coneGeometry args={[0.09, 0.45, 8]} />
            <meshBasicMaterial color="#ffb347" transparent opacity={0.78} />
          </mesh>
        ))}
      </group>
      <group ref={embersRef}>
        {embers.map((_, i) => (
          <mesh key={i}>
            <sphereGeometry args={[0.04, 8, 8]} />
            <meshBasicMaterial color="#ffd37a" transparent opacity={0.9} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

// ─── Animation Apply Functions ────────────────────────────────────────────────

function applyJumpAnimation(model3D, time) {
  model3D.position.y = Math.abs(Math.sin(time * 10)) * 1.2;
}

function applyDizzyAnimation(model3D, time) {
  if (time < 3) {
    model3D.rotation.z = Math.sin(time * 22) * 0.3;
    return;
  }
  model3D.rotation.z = MathUtils.lerp(model3D.rotation.z, Math.PI * 1.805, 0.08);
  model3D.rotation.x = MathUtils.lerp(model3D.rotation.x, 0.08, 0.08);
  model3D.position.y = -0.45;
}

function applySpinJumpAnimation(model3D, time) {
  model3D.position.y = Math.abs(Math.sin(time * 8)) * 1.8;
  model3D.rotation.y = time * 12;
}

// ─── Animation Modules ────────────────────────────────────────────────────────

const animationModules = {
  jump:     { apply: applyJumpAnimation,     Particles: EnergyParticles },
  dizzy:    { apply: applyDizzyAnimation,    Particles: DizzySleepParticles },
  spinJump: { apply: applySpinJumpAnimation, Particles: MegaSpinParticles },
};

// ─── Audio Map (mirrors Test/test.jsx) ────────────────────────────────────────

const SPECIES_AUDIO = {
  pikachu: {
    action: [
      '/models/pikachu/pika1.mp4',
      '/models/pikachu/pika2.mp4',
      '/models/pikachu/pika3.mp4',
      '/models/pikachu/pika4.mp4',
    ],
    spin:  '/models/pikachu/pika5_spin.mp4',
    daze:  '/models/pikachu/pika6_daze.mp4',
    sleep: null,
  },
  jigglypuff: {
    action: ['/models/jigglypuff/jiggly1.mp4'],
    spin:   '/models/jigglypuff/jiggly2_spin.mp4',
    daze:   '/models/jigglypuff/jiggly2_daze.mp4',
    sleep:  '/models/jigglypuff/jigglypuff_sleeping.mp3',
  },
  bulbasaur: {
    action: [
      '/models/bulbasaur/bulba1.mp4',
      '/models/bulbasaur/bulba2.mp4',
    ],
    spin:  '/models/bulbasaur/bulba4_spin.mp4',
    daze:  '/models/bulbasaur/bulba3_daze.mp4',
    sleep: null,
  },
  charmander: {
    // char1.mp4 intentionally excluded
    action: [
      '/models/charmander/char2.mp4',
      '/models/charmander/char4.mp4',
    ],
    spin:  '/models/charmander/char3_spin.mp4',
    daze:  '/models/charmander/char5_daze.mp4',
    sleep: null,
  },
  squirtle: {
    action: [
      '/models/squirtle/squirt1.mp4',
      '/models/squirtle/squirt2.mp4',
    ],
    spin:  '/models/squirtle/squirt4_spin.mp4',
    daze:  '/models/squirtle/squirt3_daze.mp4',
    sleep: null,
  },
};

// ─── Species Config ───────────────────────────────────────────────────────────

const SPECIES_PATH = {
  pikachu:    '/models/pikachu/Pikachu.glb',
  jigglypuff: '/models/jigglypuff/JigglyPuff.glb',
  bulbasaur:  '/models/bulbasaur/Bulbasaur.glb',
  squirtle:   '/models/squirtle/Squirtle.glb',
  charmander: '/models/charmander/Charmander.glb',
};

const SPECIES_CONFIG = {
  pikachu:    { scale: 0.5,  yOffset: 0,    rotation: [0, 0, 0] },
  jigglypuff: { scale: 0.4,  yOffset: -0.4, rotation: [0, 0, 0] },
  bulbasaur:  { scale: 0.5,  yOffset: -0.5, rotation: [0, 0, 0] },
  squirtle:   { scale: 1.5,  yOffset: 0.0,  rotation: [0, 0, 0] },
  charmander: { scale: 0.55, yOffset: -0.2, rotation: [0, 0, 0] },
};

// ─── Pet Component ────────────────────────────────────────────────────────────

/**
 * debugAnim: { animType: 'jump' | 'spinJump' | 'dizzy', key: number } | null
 * A new `key` value re-triggers the animation even for the same type.
 */
export function Pet({
  species  = 'pikachu',
  focused  = true,
  position = [0, 0, 0],
  debugAnim = null,
}) {
  const key  = species?.toLowerCase();
  const path = SPECIES_PATH[key] ?? SPECIES_PATH.pikachu;
  const cfg  = SPECIES_CONFIG[key] ?? SPECIES_CONFIG.pikachu;

  const groupRef = useRef();  // outer scaled group
  const animRef  = useRef();  // debug animation transforms applied here

  const focusedRef = useRef(focused);
  useEffect(() => { focusedRef.current = focused; }, [focused]);

  const { scene, animations } = useGLTF(path);
  const clonedScene = useMemo(() => scene.clone(true), [scene]);
  const { actions, mixer } = useAnimations(animations, groupRef);
  const hasAnimations = animations.length > 0;

  // GLB idle animation
  useEffect(() => {
    if (!hasAnimations) return;
    const idle =
      actions['Idle'] ??
      actions['idle'] ??
      Object.values(actions)[0];
    if (!idle) return;
    idle.reset().fadeIn(0.3).play();
    return () => { idle.fadeOut(0.3); };
  }, [hasAnimations, actions]);

  // Idle animation speed with focus state
  useEffect(() => {
    if (!mixer || !hasAnimations) return;
    mixer.timeScale = focused ? 1 : 0.25;
  }, [focused, mixer, hasAnimations]);

  // ── Audio refs (created per species) ────────────────────────────────────
  const actionAudiosRef = useRef([]);
  const spinAudioRef    = useRef(null);
  const dazeAudioRef    = useRef(null);
  const sleepAudioRef   = useRef(null);
  const actionIndexRef  = useRef(0);

  useEffect(() => {
    const info = SPECIES_AUDIO[key];
    if (!info || typeof Audio === 'undefined') return;

    actionAudiosRef.current = info.action.map((src) => {
      const a = new Audio(src);
      a.preload = 'auto';
      a.volume = 0.7;
      return a;
    });
    if (info.spin) {
      const a = new Audio(info.spin);
      a.preload = 'auto';
      a.volume = 0.75;
      spinAudioRef.current = a;
    }
    if (info.daze) {
      const a = new Audio(info.daze);
      a.preload = 'auto';
      a.volume = 0.75;
      dazeAudioRef.current = a;
    }
    if (info.sleep) {
      const a = new Audio(info.sleep);
      a.loop = true;
      a.volume = 0.6;
      sleepAudioRef.current = a;
    }

    return () => {
      [
        ...actionAudiosRef.current,
        spinAudioRef.current,
        dazeAudioRef.current,
        sleepAudioRef.current,
      ].filter(Boolean).forEach((a) => { a.pause(); a.currentTime = 0; });
      actionAudiosRef.current = [];
      spinAudioRef.current    = null;
      dazeAudioRef.current    = null;
      sleepAudioRef.current   = null;
      actionIndexRef.current  = 0;
    };
  }, [key]);

  // ── Debug animation state ────────────────────────────────────────────────
  const activeAnimTypeRef  = useRef(null);
  const [activeAnimType, setActiveAnimType] = useState(null); // drives particle render
  const animStartTimeRef   = useRef(0);
  const needsAnimStartRef  = useRef(false);

  const stopAllAudio = () => {
    [
      ...actionAudiosRef.current,
      spinAudioRef.current,
      dazeAudioRef.current,
      sleepAudioRef.current,
    ].filter(Boolean).forEach((a) => { a.pause(); a.currentTime = 0; });
  };

  useEffect(() => {
    if (!debugAnim) return;
    const { animType } = debugAnim;

    stopAllAudio();

    // Play the correct audio for this animation type
    if (animType === 'jump') {
      const audios = actionAudiosRef.current;
      if (audios.length > 0) {
        const idx = actionIndexRef.current % audios.length;
        actionIndexRef.current += 1;
        audios[idx].play().catch(() => {});
      }
    } else if (animType === 'spinJump') {
      const a = spinAudioRef.current;
      if (a) { a.currentTime = 0; a.play().catch(() => {}); }
    } else if (animType === 'dizzy') {
      const a = dazeAudioRef.current;
      if (a) { a.currentTime = 0; a.play().catch(() => {}); }
    }

    // Activate animation
    activeAnimTypeRef.current = animType;
    setActiveAnimType(animType);
    needsAnimStartRef.current = true;

    if (animRef.current) {
      animRef.current.position.set(0, 0, 0);
      animRef.current.rotation.set(0, 0, 0);
    }

    // Reset after 3 s
    const timer = setTimeout(() => {
      stopAllAudio();
      activeAnimTypeRef.current = null;
      setActiveAnimType(null);

      if (animRef.current) {
        animRef.current.position.set(0, 0, 0);
        animRef.current.rotation.set(0, 0, 0);
      }
      // Restore idle GLB animation
      if (hasAnimations && mixer) {
        const idle =
          actions['Idle'] ??
          actions['idle'] ??
          Object.values(actions)[0];
        if (idle) idle.reset().fadeIn(0.3).play();
        mixer.timeScale = focusedRef.current ? 1 : 0.25;
      }
    }, 3000);

    return () => clearTimeout(timer);
  // Only re-fire when the key changes — suppress exhaustive-deps lint
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debugAnim?.key]);

  // Per-frame: animation transform + idle bob/tilt
  useFrame((state) => {
    if (!groupRef.current) return;

    if (activeAnimTypeRef.current && animRef.current) {
      // Capture start time on the first frame of this animation
      if (needsAnimStartRef.current) {
        animStartTimeRef.current = state.clock.elapsedTime;
        needsAnimStartRef.current = false;
      }
      const t = state.clock.elapsedTime - animStartTimeRef.current;
      animationModules[activeAnimTypeRef.current]?.apply(animRef.current, t);
    } else {
      // Clear any leftover transform
      if (animRef.current) {
        animRef.current.position.set(0, 0, 0);
        animRef.current.rotation.set(0, 0, 0);
      }
      // Float bob for static models
      if (!hasAnimations) {
        groupRef.current.position.y =
          position[1] + Math.sin(state.clock.elapsedTime * 1.5) * 0.05;
      }
      // Drowsy tilt (suppressed during debug animations)
      const targetX = focusedRef.current ? 0 : Math.PI / 12;
      groupRef.current.rotation.x +=
        (targetX - groupRef.current.rotation.x) * 0.08;
    }
  });

  const ActiveParticles = animationModules[activeAnimType]?.Particles ?? null;

  return (
    <>
      {/* Scaled outer group at seat position */}
      <group ref={groupRef} position={position} scale={cfg.scale}>
        {/* Animation transform group — manipulated by debug animations */}
        <group ref={animRef}>
          {/* Per-species mesh corrections */}
          <group position={[0, cfg.yOffset, 0]} rotation={cfg.rotation}>
            <primitive object={clonedScene} />
          </group>
        </group>
      </group>

      {/* Particles live outside the scaled group so they're world-scale */}
      {ActiveParticles && (
        <group position={position}>
          <ActiveParticles />
        </group>
      )}
    </>
  );
}

/**
 * Fallback placeholder used when the real model fails to load.
 */
export function PetPlaceholder({ focused = true, position = [0, 0, 0] }) {
  return (
    <group position={position}>
      <mesh castShadow>
        <boxGeometry args={[0.6, 0.6, 0.6]} />
        <meshStandardMaterial color={focused ? '#7c3aed' : '#3a3a3a'} />
      </mesh>
    </group>
  );
}

useGLTF.preload('/models/pikachu/Pikachu.glb');
useGLTF.preload('/models/jigglypuff/JigglyPuff.glb');
useGLTF.preload('/models/bulbasaur/Bulbasaur.glb');
useGLTF.preload('/models/squirtle/Squirtle.glb');
useGLTF.preload('/models/charmander/Charmander.glb');
