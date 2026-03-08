import React, { Suspense, useState, useRef, useEffect } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { useGLTF, OrbitControls, ContactShadows } from '@react-three/drei'
import * as THREE from 'three'

// Scene object controls: edit these values to move/rotate/resize desk and laptop.
const TABLE_TRANSFORM = {
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  scale: 1.18,
}

const LAPTOP_TRANSFORM = {
  position: [0.5, 0.15, 0],
  rotation: [0, -5, 0],
  scale: 2,
}

function Table({ transform = TABLE_TRANSFORM }) {
  const { scene } = useGLTF('/models/Table.glb')
  return (
    <primitive
      object={scene}
      position={transform.position}
      rotation={transform.rotation}
      scale={transform.scale}
    />
  )
}

function Laptop({ transform = LAPTOP_TRANSFORM }) {
  const { scene } = useGLTF('/models/Laptop.glb')
  return (
    <primitive
      object={scene.clone()}
      position={transform.position}
      rotation={transform.rotation}
      scale={transform.scale}
    />
  )
}

// --- MODULAR PARTICLE COMPONENTS ---

function EnergyParticles() {
  const group = useRef()
  // Deterministic particle values avoid impure random calls during render.
  const particles = Array.from({ length: 15 }, (_, i) => ({
    speed: 0.05 + (((Math.sin((i + 1) * 97) + 1) / 2) * 0.1),
    x: (((Math.sin((i + 1) * 131) + 1) / 2) - 0.5) * 1.2,
    y: ((Math.cos((i + 1) * 193) + 1) / 2) * 1.0,
    z: (((Math.cos((i + 1) * 157) + 1) / 2) - 0.5) * 1.2,
  }))

  useFrame((state) => {
    const t = state.clock.elapsedTime
    group.current.children.forEach((p, i) => {
      const data = particles[i]
      // Fast upward movement, resetting very close to the model
      p.position.y = ((data.y + t * data.speed * 15) % 2.5) + 0.2
      p.position.x = data.x + Math.sin(t * 12 + i) * 0.1
      p.material.opacity = 1 - p.position.y / 3
    })
  })

  return (
    <group ref={group}>
      {particles.map((_, i) => (
        <mesh key={i}>
          <sphereGeometry args={[0.08, 8, 8]} />
          <meshBasicMaterial color="#00aaff" transparent />
        </mesh>
      ))}
    </group>
  )
}

function DizzySleepParticles() {
  const starsRef = useRef()
  const zsRef = useRef()
  const startRef = useRef(null)
  const zData = Array.from({ length: 4 }, (_, i) => ({
    x: 1.15 + i * 0.26,
    y: 0.85 + i * 0.45,
    z: 0.1 + ((Math.sin((i + 1) * 71) + 1) / 2) * 0.35,
    drift: 0.08 + i * 0.03,
    scale: 0.9 + i * 0.18,
  }))

  useFrame((state) => {
    if (startRef.current === null) {
      startRef.current = state.clock.elapsedTime
    }

    const phaseTime = state.clock.elapsedTime - startRef.current
    const isSleeping = phaseTime > 3
    const t = state.clock.elapsedTime
    if (starsRef.current) {
      starsRef.current.visible = !isSleeping
      starsRef.current.children.forEach((p, i) => {
        const angle = (i / 5) * Math.PI * 2
        p.position.x = Math.cos(angle + t * 5) * 0.8
        p.position.z = Math.sin(angle + t * 5) * 0.8
        p.position.y = 2.0 + Math.sin(t * 5 + i) * 0.1
      })
    }

    if (zsRef.current) {
      zsRef.current.visible = isSleeping
      zsRef.current.children.forEach((zGroup, i) => {
        const data = zData[i]
        zGroup.position.x = data.x + Math.sin(t * 1.6 + i) * data.drift
        zGroup.position.y = data.y + (Math.sin(t * 2 + i) + 1) * 0.18
        zGroup.position.z = data.z + Math.cos(t * 1.2 + i) * 0.08
        zGroup.rotation.z = Math.sin(t * 0.8 + i) * 0.08
        zGroup.scale.setScalar(data.scale + Math.sin(t * 1.3 + i) * 0.05)
      })
    }
  })

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
  )
}

function MegaSpinParticles() {
  const heatRingRef = useRef()
  const flamesRef = useRef()
  const embersRef = useRef()
  const flames = Array.from({ length: 14 }, (_, i) => ({
    angle: (i / 14) * Math.PI * 2,
    radius: 1.05 + ((Math.sin((i + 1) * 211) + 1) / 2) * 0.38,
    speed: 2.6 + ((Math.cos((i + 1) * 149) + 1) / 2) * 2.1,
    height: 0.45 + ((Math.sin((i + 1) * 61) + 1) / 2) * 0.55,
    sway: 0.08 + ((Math.cos((i + 1) * 41) + 1) / 2) * 0.08,
  }))
  const embers = Array.from({ length: 18 }, (_, i) => ({
    angle: (i / 18) * Math.PI * 2,
    radius: 0.65 + ((Math.sin((i + 1) * 73) + 1) / 2) * 0.9,
    speed: 4.5 + ((Math.cos((i + 1) * 37) + 1) / 2) * 3,
    rise: 0.7 + ((Math.sin((i + 1) * 89) + 1) / 2) * 0.9,
  }))

  useFrame((state) => {
    const t = state.clock.elapsedTime
    if (heatRingRef.current) {
      heatRingRef.current.rotation.z = t * 7
      heatRingRef.current.scale.setScalar(1 + Math.sin(t * 7) * 0.1)
    }

    if (flamesRef.current) {
      flamesRef.current.children.forEach((flame, i) => {
        const data = flames[i]
        const orbit = data.angle + t * data.speed
        flame.position.x = Math.cos(orbit) * data.radius + Math.sin(t * 9 + i) * data.sway
        flame.position.z = Math.sin(orbit) * data.radius + Math.cos(t * 8 + i) * data.sway
        flame.position.y = 0.2 + Math.abs(Math.sin(t * 6 + i)) * data.height
        flame.rotation.y = -orbit + Math.PI / 2
        flame.scale.set(1, 0.9 + Math.sin(t * 10 + i) * 0.18, 1)
      })
    }

    if (!embersRef.current) return
    embersRef.current.children.forEach((ember, i) => {
      const data = embers[i]
      const orbit = data.angle + t * data.speed
      ember.position.x = Math.cos(orbit) * data.radius
      ember.position.z = Math.sin(orbit) * data.radius
      ember.position.y = ((t * data.rise + i * 0.15) % 1.6) + 0.3
      ember.scale.setScalar(0.7 + Math.sin(t * 12 + i) * 0.12)
    })
  })

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
  )
}

function applyJumpAnimation(model3D, time) {
  model3D.position.y = Math.abs(Math.sin(time * 10)) * 1.2
}

function applyDizzyAnimation(model3D, time) {
  if (time < 3) {
    model3D.rotation.z = Math.sin(time * 22) * 0.3
    return
  }

  // Nearly flat sleeping pose.
  model3D.rotation.z = THREE.MathUtils.lerp(model3D.rotation.z, Math.PI * 1.805, 0.08)
  model3D.rotation.x = THREE.MathUtils.lerp(model3D.rotation.x, 0.08, 0.08)
  model3D.position.y = -0.45
}

function applySpinJumpAnimation(model3D, time) {
  model3D.position.y = Math.abs(Math.sin(time * 8)) * 1.8
  model3D.rotation.y = time * 12
}

const animationModules = {
  jump: {
    apply: applyJumpAnimation,
    Particles: EnergyParticles,
  },
  dizzy: {
    apply: applyDizzyAnimation,
    Particles: DizzySleepParticles,
  },
  spinJump: {
    apply: applySpinJumpAnimation,
    Particles: MegaSpinParticles,
  },
}

// Per-Pokemon placement/scaling controls.
// Edit these values to fine-tune each model quickly.
const DEFAULT_POKEMON_TRANSFORM = {
  scenePosition: [-0.58, 0.88, 0.04],
  sceneRotation: [0, -Math.PI / 2.35, 0],
  modelScale: 1.5,
}

const POKEMON_TRANSFORMS = {
  '/models/pikachu/pikachu.glb': {
    ...DEFAULT_POKEMON_TRANSFORM,
    scenePosition: [0, 0.88, 0.04],
    sceneRotation: [0, -Math.PI / 2.35, 0],
    modelScale: 1,
  },
  '/models/bulbasaur/bulbasaur.glb': {
    ...DEFAULT_POKEMON_TRANSFORM,
  },
  '/models/charmander/charmander.glb': {
    ...DEFAULT_POKEMON_TRANSFORM,
  },
  '/models/squirtle/squirtle.glb': {
    ...DEFAULT_POKEMON_TRANSFORM,
    modelScale: 2.7,
  },
  '/models/eevee.glb': {
    ...DEFAULT_POKEMON_TRANSFORM,
  },
  '/models/jigglypuff/jigglypuff.glb': {
    ...DEFAULT_POKEMON_TRANSFORM,
  },
}

// --- MAIN PIKACHU COMPONENT ---

function Pet({ url, animationType, modelScale }) {
  const { scene } = useGLTF(url)
  const group = useRef()
  const startTimeRef = useRef(0)
  const prevAnimRef = useRef(animationType)
  const jigglySleepAudioRef = useRef(null)
  const pikachuActionAudioRefs = useRef([])
  const pikachuSpinAudioRef = useRef(null)
  const pikachuDazeAudioRef = useRef(null)
  const charmanderActionAudioRefs = useRef([])
  const charmanderSpinAudioRef = useRef(null)
  const charmanderDazeAudioRef = useRef(null)
  const bulbasaurActionAudioRefs = useRef([])
  const bulbasaurSpinAudioRef = useRef(null)
  const bulbasaurDazeAudioRef = useRef(null)
  const squirtleActionAudioRefs = useRef([])
  const squirtleSpinAudioRef = useRef(null)
  const squirtleDazeAudioRef = useRef(null)
  const jigglyActionAudioRefs = useRef([])
  const jigglySpinAudioRef = useRef(null)
  const jigglyDazeAudioRef = useRef(null)
  const nextPikachuAudioIndexRef = useRef(0)
  const nextCharmanderAudioIndexRef = useRef(0)
  const nextBulbasaurAudioIndexRef = useRef(0)
  const nextSquirtleAudioIndexRef = useRef(0)
  const nextJigglyAudioIndexRef = useRef(0)
  const wasJigglySleepPhaseRef = useRef(false)
  const wasPikachuDazePhaseRef = useRef(false)
  const wasCharmanderDazePhaseRef = useRef(false)
  const wasBulbasaurDazePhaseRef = useRef(false)
  const wasSquirtleDazePhaseRef = useRef(false)
  const wasJigglyDazePhaseRef = useRef(false)
  const hasPrimedAudioRef = useRef(false)

  useEffect(() => {
    if (typeof Audio === 'undefined') return
    const audio = new Audio('/models/jigglypuff/jigglypuff_sleeping.mp3')
    audio.loop = true
    audio.volume = 0.6
    jigglySleepAudioRef.current = audio

    return () => {
      audio.pause()
      audio.currentTime = 0
      jigglySleepAudioRef.current = null
    }
  }, [])

  useEffect(() => {
    const primeAudio = () => {
      if (hasPrimedAudioRef.current) return

      const refs = [
        ...pikachuActionAudioRefs.current,
        ...charmanderActionAudioRefs.current,
        ...bulbasaurActionAudioRefs.current,
        ...squirtleActionAudioRefs.current,
        ...jigglyActionAudioRefs.current,
        pikachuSpinAudioRef.current,
        charmanderSpinAudioRef.current,
        bulbasaurSpinAudioRef.current,
        squirtleSpinAudioRef.current,
        jigglySpinAudioRef.current,
        pikachuDazeAudioRef.current,
        charmanderDazeAudioRef.current,
        bulbasaurDazeAudioRef.current,
        squirtleDazeAudioRef.current,
        jigglyDazeAudioRef.current,
        jigglySleepAudioRef.current,
      ].filter(Boolean)

      if (refs.length === 0) return

      hasPrimedAudioRef.current = true
      refs.forEach((audio) => {
        const previousMuted = audio.muted
        audio.muted = true
        audio.play()
          .then(() => {
            audio.pause()
            audio.currentTime = 0
            audio.muted = previousMuted
          })
          .catch(() => {
            audio.muted = previousMuted
          })
      })
    }

    window.addEventListener('pointerdown', primeAudio, { once: true })
    window.addEventListener('keydown', primeAudio, { once: true })

    return () => {
      window.removeEventListener('pointerdown', primeAudio)
      window.removeEventListener('keydown', primeAudio)
    }
  }, [])

  useEffect(() => {
    if (typeof Audio === 'undefined') return

    const audio = new Audio('/models/jigglypuff/jiggly2_spin.mp4')
    audio.loop = false
    audio.volume = 0.75
    audio.preload = 'auto'
    jigglySpinAudioRef.current = audio

    return () => {
      audio.pause()
      audio.currentTime = 0
      jigglySpinAudioRef.current = null
    }
  }, [])

  useEffect(() => {
    if (typeof Audio === 'undefined') return

    const audio = new Audio('/models/jigglypuff/jiggly2_daze.mp4')
    audio.loop = false
    audio.volume = 0.75
    audio.preload = 'auto'
    jigglyDazeAudioRef.current = audio

    return () => {
      audio.pause()
      audio.currentTime = 0
      jigglyDazeAudioRef.current = null
    }
  }, [])

  useEffect(() => {
    if (typeof Audio === 'undefined') return

    jigglyActionAudioRefs.current = [
      new Audio('/models/jigglypuff/jiggly1.mp4'),
    ]

    jigglyActionAudioRefs.current.forEach((audio) => {
      audio.loop = false
      audio.volume = 0.7
      audio.preload = 'auto'
    })

    return () => {
      jigglyActionAudioRefs.current.forEach((audio) => {
        audio.pause()
        audio.currentTime = 0
      })
      jigglyActionAudioRefs.current = []
      nextJigglyAudioIndexRef.current = 0
    }
  }, [])

  useEffect(() => {
    if (typeof Audio === 'undefined') return

    const audio = new Audio('/models/squirtle/squirt4_spin.mp4')
    audio.loop = false
    audio.volume = 0.75
    audio.preload = 'auto'
    squirtleSpinAudioRef.current = audio

    return () => {
      audio.pause()
      audio.currentTime = 0
      squirtleSpinAudioRef.current = null
    }
  }, [])

  useEffect(() => {
    if (typeof Audio === 'undefined') return

    const audio = new Audio('/models/squirtle/squirt3_daze.mp4')
    audio.loop = false
    audio.volume = 0.75
    audio.preload = 'auto'
    squirtleDazeAudioRef.current = audio

    return () => {
      audio.pause()
      audio.currentTime = 0
      squirtleDazeAudioRef.current = null
    }
  }, [])

  useEffect(() => {
    if (typeof Audio === 'undefined') return

    squirtleActionAudioRefs.current = [
      new Audio('/models/squirtle/squirt1.mp4'),
      new Audio('/models/squirtle/squirt2.mp4'),
    ]

    squirtleActionAudioRefs.current.forEach((audio) => {
      audio.loop = false
      audio.volume = 0.7
      audio.preload = 'auto'
    })

    return () => {
      squirtleActionAudioRefs.current.forEach((audio) => {
        audio.pause()
        audio.currentTime = 0
      })
      squirtleActionAudioRefs.current = []
      nextSquirtleAudioIndexRef.current = 0
    }
  }, [])

  useEffect(() => {
    if (typeof Audio === 'undefined') return

    const audio = new Audio('/models/bulbasaur/bulba4_spin.mp4')
    audio.loop = false
    audio.volume = 0.75
    audio.preload = 'auto'
    bulbasaurSpinAudioRef.current = audio

    return () => {
      audio.pause()
      audio.currentTime = 0
      bulbasaurSpinAudioRef.current = null
    }
  }, [])

  useEffect(() => {
    if (typeof Audio === 'undefined') return

    const audio = new Audio('/models/bulbasaur/bulba3_daze.mp4')
    audio.loop = false
    audio.volume = 0.75
    audio.preload = 'auto'
    bulbasaurDazeAudioRef.current = audio

    return () => {
      audio.pause()
      audio.currentTime = 0
      bulbasaurDazeAudioRef.current = null
    }
  }, [])

  useEffect(() => {
    if (typeof Audio === 'undefined') return

    bulbasaurActionAudioRefs.current = [
      new Audio('/models/bulbasaur/bulba1.mp4'),
      new Audio('/models/bulbasaur/bulba2.mp4'),
    ]

    bulbasaurActionAudioRefs.current.forEach((audio) => {
      audio.loop = false
      audio.volume = 0.7
      audio.preload = 'auto'
    })

    return () => {
      bulbasaurActionAudioRefs.current.forEach((audio) => {
        audio.pause()
        audio.currentTime = 0
      })
      bulbasaurActionAudioRefs.current = []
      nextBulbasaurAudioIndexRef.current = 0
    }
  }, [])

  useEffect(() => {
    if (typeof Audio === 'undefined') return

    const audio = new Audio('/models/charmander/char3_spin.mp4')
    audio.loop = false
    audio.volume = 0.75
    audio.preload = 'auto'
    charmanderSpinAudioRef.current = audio

    return () => {
      audio.pause()
      audio.currentTime = 0
      charmanderSpinAudioRef.current = null
    }
  }, [])

  useEffect(() => {
    if (typeof Audio === 'undefined') return

    const audio = new Audio('/models/charmander/char5_daze.mp4')
    audio.loop = false
    audio.volume = 0.75
    audio.preload = 'auto'
    charmanderDazeAudioRef.current = audio

    return () => {
      audio.pause()
      audio.currentTime = 0
      charmanderDazeAudioRef.current = null
    }
  }, [])

  useEffect(() => {
    if (typeof Audio === 'undefined') return

    charmanderActionAudioRefs.current = [
      new Audio('/models/charmander/char1.mp4'),
      new Audio('/models/charmander/char2.mp4'),
      new Audio('/models/charmander/char4.mp4'),
    ]

    charmanderActionAudioRefs.current.forEach((audio) => {
      audio.loop = false
      audio.volume = 0.7
      audio.preload = 'auto'
    })

    return () => {
      charmanderActionAudioRefs.current.forEach((audio) => {
        audio.pause()
        audio.currentTime = 0
      })
      charmanderActionAudioRefs.current = []
      nextCharmanderAudioIndexRef.current = 0
    }
  }, [])

  useEffect(() => {
    if (typeof Audio === 'undefined') return

    const audio = new Audio('/models/pikachu/pika5_spin.mp4')
    audio.loop = false
    audio.volume = 0.75
    audio.preload = 'auto'
    pikachuSpinAudioRef.current = audio

    return () => {
      audio.pause()
      audio.currentTime = 0
      pikachuSpinAudioRef.current = null
    }
  }, [])

  useEffect(() => {
    if (typeof Audio === 'undefined') return

    const audio = new Audio('/models/pikachu/pika6_daze.mp4')
    audio.loop = false
    audio.volume = 0.75
    audio.preload = 'auto'
    pikachuDazeAudioRef.current = audio

    return () => {
      audio.pause()
      audio.currentTime = 0
      pikachuDazeAudioRef.current = null
    }
  }, [])

  useEffect(() => {
    if (typeof Audio === 'undefined') return

    pikachuActionAudioRefs.current = [
      new Audio('/models/pikachu/pika1.mp4'),
      new Audio('/models/pikachu/pika2.mp4'),
      new Audio('/models/pikachu/pika3.mp4'),
      new Audio('/models/pikachu/pika4.mp4'),
    ]

    pikachuActionAudioRefs.current.forEach((audio) => {
      audio.loop = false
      audio.volume = 0.7
      audio.preload = 'auto'
    })

    return () => {
      pikachuActionAudioRefs.current.forEach((audio) => {
        audio.pause()
        audio.currentTime = 0
      })
      pikachuActionAudioRefs.current = []
      nextPikachuAudioIndexRef.current = 0
    }
  }, [])

  useFrame((state) => {
    if (!group.current) return
    const previousAnimation = prevAnimRef.current
    if (prevAnimRef.current !== animationType) {
      startTimeRef.current = state.clock.elapsedTime
      prevAnimRef.current = animationType
    }

    const t = state.clock.elapsedTime - startTimeRef.current
    const normalizedUrl = url.toLowerCase()
    const isJigglypuff = normalizedUrl.includes('/models/jigglypuff/jigglypuff.glb')
    const isPikachu = normalizedUrl.endsWith('/pikachu.glb')
    const isCharmander = normalizedUrl.endsWith('/charmander.glb')
    const isBulbasaur = normalizedUrl.endsWith('/bulbasaur.glb')
    const isSquirtle = normalizedUrl.endsWith('/squirtle.glb')
    const isJiggly = normalizedUrl.endsWith('/jigglypuff.glb')
    const isJigglySleepPhase = isJigglypuff && animationType === 'dizzy' && t > 3
    const isPikachuDazePhase = isPikachu && animationType === 'dizzy' && t < 3
    const isCharmanderDazePhase = isCharmander && animationType === 'dizzy' && t < 3
    const isBulbasaurDazePhase = isBulbasaur && animationType === 'dizzy' && t < 3
    const isSquirtleDazePhase = isSquirtle && animationType === 'dizzy' && t < 3
    const isJigglyDazePhase = isJiggly && animationType === 'dizzy' && t < 3

    // Reset base transformations
    group.current.position.set(0, 0, 0)
    group.current.rotation.set(0, 0, 0)
    // Fallback preserves old behavior if a transform entry is missing.
    const fallbackScale = isSquirtle ? 2.7 : 1.5
    const baseScale = modelScale ?? fallbackScale
    group.current.scale.set(baseScale, baseScale, baseScale)

    const module = animationModules[animationType]
    if (module?.apply) {
      module.apply(group.current, t)
    }

    const enteredActionAnim = previousAnimation !== animationType && animationType === 'jump'
    if (isPikachu && enteredActionAnim) {
      const actionAudios = pikachuActionAudioRefs.current
      if (actionAudios.length > 0) {
        actionAudios.forEach((audio) => {
          audio.pause()
          audio.currentTime = 0
        })
        const nextIndex = nextPikachuAudioIndexRef.current % actionAudios.length
        nextPikachuAudioIndexRef.current += 1
        actionAudios[nextIndex].play().catch(() => {})
      }
    }

    if (isCharmander && enteredActionAnim) {
      const actionAudios = charmanderActionAudioRefs.current
      if (actionAudios.length > 0) {
        actionAudios.forEach((audio) => {
          audio.pause()
          audio.currentTime = 0
        })
        const nextIndex = nextCharmanderAudioIndexRef.current % actionAudios.length
        nextCharmanderAudioIndexRef.current += 1
        actionAudios[nextIndex].play().catch(() => {})
      }
    }

    if (isBulbasaur && enteredActionAnim) {
      const actionAudios = bulbasaurActionAudioRefs.current
      if (actionAudios.length > 0) {
        actionAudios.forEach((audio) => {
          audio.pause()
          audio.currentTime = 0
        })
        const nextIndex = nextBulbasaurAudioIndexRef.current % actionAudios.length
        nextBulbasaurAudioIndexRef.current += 1
        actionAudios[nextIndex].play().catch(() => {})
      }
    }

    if (isSquirtle && enteredActionAnim) {
      const actionAudios = squirtleActionAudioRefs.current
      if (actionAudios.length > 0) {
        actionAudios.forEach((audio) => {
          audio.pause()
          audio.currentTime = 0
        })
        const nextIndex = nextSquirtleAudioIndexRef.current % actionAudios.length
        nextSquirtleAudioIndexRef.current += 1
        actionAudios[nextIndex].play().catch(() => {})
      }
    }

    if (isJiggly && enteredActionAnim) {
      const actionAudios = jigglyActionAudioRefs.current
      if (actionAudios.length > 0) {
        actionAudios.forEach((audio) => {
          audio.pause()
          audio.currentTime = 0
        })
        const nextIndex = nextJigglyAudioIndexRef.current % actionAudios.length
        nextJigglyAudioIndexRef.current += 1
        actionAudios[nextIndex].play().catch(() => {})
      }
    }

    if (isPikachu && previousAnimation !== 'spinJump' && animationType === 'spinJump') {
      const spinAudio = pikachuSpinAudioRef.current
      if (spinAudio) {
        spinAudio.pause()
        spinAudio.currentTime = 0
        spinAudio.play().catch(() => {})
      }
    }

    if (isCharmander && previousAnimation !== 'spinJump' && animationType === 'spinJump') {
      const spinAudio = charmanderSpinAudioRef.current
      if (spinAudio) {
        spinAudio.pause()
        spinAudio.currentTime = 0
        spinAudio.play().catch(() => {})
      }
    }

    if (isBulbasaur && previousAnimation !== 'spinJump' && animationType === 'spinJump') {
      const spinAudio = bulbasaurSpinAudioRef.current
      if (spinAudio) {
        spinAudio.pause()
        spinAudio.currentTime = 0
        spinAudio.play().catch(() => {})
      }
    }

    if (isSquirtle && previousAnimation !== 'spinJump' && animationType === 'spinJump') {
      const spinAudio = squirtleSpinAudioRef.current
      if (spinAudio) {
        spinAudio.pause()
        spinAudio.currentTime = 0
        spinAudio.play().catch(() => {})
      }
    }

    if (isJiggly && previousAnimation !== 'spinJump' && animationType === 'spinJump') {
      const spinAudio = jigglySpinAudioRef.current
      if (spinAudio) {
        spinAudio.pause()
        spinAudio.currentTime = 0
        spinAudio.play().catch(() => {})
      }
    }

    if (isPikachu && previousAnimation === 'spinJump' && animationType !== 'spinJump') {
      const spinAudio = pikachuSpinAudioRef.current
      if (spinAudio) {
        spinAudio.pause()
        spinAudio.currentTime = 0
      }
    }

    if (isCharmander && previousAnimation === 'spinJump' && animationType !== 'spinJump') {
      const spinAudio = charmanderSpinAudioRef.current
      if (spinAudio) {
        spinAudio.pause()
        spinAudio.currentTime = 0
      }
    }

    if (isBulbasaur && previousAnimation === 'spinJump' && animationType !== 'spinJump') {
      const spinAudio = bulbasaurSpinAudioRef.current
      if (spinAudio) {
        spinAudio.pause()
        spinAudio.currentTime = 0
      }
    }

    if (isSquirtle && previousAnimation === 'spinJump' && animationType !== 'spinJump') {
      const spinAudio = squirtleSpinAudioRef.current
      if (spinAudio) {
        spinAudio.pause()
        spinAudio.currentTime = 0
      }
    }

    if (isJiggly && previousAnimation === 'spinJump' && animationType !== 'spinJump') {
      const spinAudio = jigglySpinAudioRef.current
      if (spinAudio) {
        spinAudio.pause()
        spinAudio.currentTime = 0
      }
    }

    const pikachuDazeAudio = pikachuDazeAudioRef.current
    if (pikachuDazeAudio) {
      if (isPikachuDazePhase && !wasPikachuDazePhaseRef.current) {
        pikachuDazeAudio.pause()
        pikachuDazeAudio.currentTime = 0
        pikachuDazeAudio.play().catch(() => {})
      }

      if (!isPikachuDazePhase && wasPikachuDazePhaseRef.current) {
        pikachuDazeAudio.pause()
        pikachuDazeAudio.currentTime = 0
      }
    }

    const charmanderDazeAudio = charmanderDazeAudioRef.current
    if (charmanderDazeAudio) {
      if (isCharmanderDazePhase && !wasCharmanderDazePhaseRef.current) {
        charmanderDazeAudio.pause()
        charmanderDazeAudio.currentTime = 0
        charmanderDazeAudio.play().catch(() => {})
      }

      if (!isCharmanderDazePhase && wasCharmanderDazePhaseRef.current) {
        charmanderDazeAudio.pause()
        charmanderDazeAudio.currentTime = 0
      }
    }

    const bulbasaurDazeAudio = bulbasaurDazeAudioRef.current
    if (bulbasaurDazeAudio) {
      if (isBulbasaurDazePhase && !wasBulbasaurDazePhaseRef.current) {
        bulbasaurDazeAudio.pause()
        bulbasaurDazeAudio.currentTime = 0
        bulbasaurDazeAudio.play().catch(() => {})
      }

      if (!isBulbasaurDazePhase && wasBulbasaurDazePhaseRef.current) {
        bulbasaurDazeAudio.pause()
        bulbasaurDazeAudio.currentTime = 0
      }
    }

    const squirtleDazeAudio = squirtleDazeAudioRef.current
    if (squirtleDazeAudio) {
      if (isSquirtleDazePhase && !wasSquirtleDazePhaseRef.current) {
        squirtleDazeAudio.pause()
        squirtleDazeAudio.currentTime = 0
        squirtleDazeAudio.play().catch(() => {})
      }

      if (!isSquirtleDazePhase && wasSquirtleDazePhaseRef.current) {
        squirtleDazeAudio.pause()
        squirtleDazeAudio.currentTime = 0
      }
    }

    const jigglyDazeAudio = jigglyDazeAudioRef.current
    if (jigglyDazeAudio) {
      if (isJigglyDazePhase && !wasJigglyDazePhaseRef.current) {
        jigglyDazeAudio.pause()
        jigglyDazeAudio.currentTime = 0
        jigglyDazeAudio.play().catch(() => {})
      }

      if (!isJigglyDazePhase && wasJigglyDazePhaseRef.current) {
        jigglyDazeAudio.pause()
        jigglyDazeAudio.currentTime = 0
      }
    }

    const jigglySleepAudio = jigglySleepAudioRef.current
    if (jigglySleepAudio) {
      if (isJigglySleepPhase && !wasJigglySleepPhaseRef.current) {
        jigglySleepAudio.currentTime = 0
        jigglySleepAudio.play().catch(() => {})
      }

      if (!isJigglySleepPhase && wasJigglySleepPhaseRef.current) {
        jigglySleepAudio.pause()
        jigglySleepAudio.currentTime = 0
      }
    }

    wasPikachuDazePhaseRef.current = isPikachuDazePhase
    wasCharmanderDazePhaseRef.current = isCharmanderDazePhase
    wasBulbasaurDazePhaseRef.current = isBulbasaurDazePhase
    wasSquirtleDazePhaseRef.current = isSquirtleDazePhase
    wasJigglyDazePhaseRef.current = isJigglyDazePhase
    wasJigglySleepPhaseRef.current = isJigglySleepPhase
  })

  const ActiveParticles = animationModules[animationType]?.Particles

  return (
    <group>
      <primitive ref={group} object={scene} />
      {ActiveParticles && <ActiveParticles />}
    </group>
  )
}

export default function App() {
  const [activeAnim, setActiveAnim] = useState(null)
  const [selectedPokemon, setSelectedPokemon] = useState('/models/pikachu/Pikachu.glb')
  const pokemonModels = [
    { label: 'Pikachu', path: '/models/pikachu/Pikachu.glb' },
    { label: 'Bulbasaur', path: '/models/bulbasaur/Bulbasaur.glb' },
    { label: 'Charmander', path: '/models/charmander/Charmander.glb' },
    { label: 'Squirtle', path: '/models/squirtle/Squirtle.glb' },
    { label: 'Eevee', path: '/models/Eevee.glb' },
    { label: 'JigglyPuff', path: '/models/jigglypuff/JigglyPuff.glb' },
  ]

  const selectedKey = selectedPokemon.toLowerCase()
  const selectedTransform = {
    ...DEFAULT_POKEMON_TRANSFORM,
    ...(POKEMON_TRANSFORMS[selectedKey] || {}),
  }

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#111', position: 'relative' }}>
      <div style={{ position: 'absolute', top: 20, width: '100%', display: 'flex', justifyContent: 'center', gap: '10px', zIndex: 10, flexWrap: 'wrap' }}>
        <select
          value={selectedPokemon}
          onChange={(e) => setSelectedPokemon(e.target.value)}
          style={{ background: '#222', color: '#fff', border: '1px solid #555', borderRadius: 6, padding: '6px 10px' }}
        >
          {pokemonModels.map((model) => (
            <option key={model.path} value={model.path}>{model.label}</option>
          ))}
        </select>
        <button onClick={() => setActiveAnim('jump')}>Energetic</button>
        <button onClick={() => setActiveAnim('dizzy')}>Dizzy & Sleep</button>
        <button onClick={() => setActiveAnim('spinJump')}>Mega Spin</button>
        <button onClick={() => setActiveAnim(null)} style={{ background: '#333', color: '#fff' }}>Reset</button>
      </div>

      <Canvas camera={{ position: [0, 2.2, 8.4], fov: 42 }}>
        <color attach="background" args={['#111']} />
        <Suspense fallback={null}>
          <ambientLight intensity={1.2} />
          <pointLight position={[10, 10, 10]} intensity={1} />

          <Table transform={TABLE_TRANSFORM} />
          <Laptop transform={LAPTOP_TRANSFORM} />

          <group position={selectedTransform.scenePosition} rotation={selectedTransform.sceneRotation}>
            <Pet
              key={selectedPokemon}
              url={selectedPokemon}
              animationType={activeAnim}
              modelScale={selectedTransform.modelScale}
            />
          </group>

          <ContactShadows position={[0, -0.58, 0]} opacity={0.5} scale={10} blur={2.5} />
          <OrbitControls makeDefault target={[0, 0.86, 0]} minPolarAngle={0.45} maxPolarAngle={Math.PI / 2.03} />
        </Suspense>
      </Canvas>
    </div>
  )
}