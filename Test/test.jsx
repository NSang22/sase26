import React, { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { useGLTF, OrbitControls, Environment, ContactShadows } from '@react-three/drei'

function Pet({ url, position, scale }) {
  const { scene } = useGLTF(url)
  return <primitive object={scene} position={position} scale={scale} />
}

export default function App() {
  const petData = [
    { name: 'Bulbasaur', file: 'Bulbasaur.glb', scale: 1.5 },
    { name: 'Charmander', file: 'Charmander.glb', scale: 1.5 },
    { name: 'JigglyPuff', file: 'JigglyPuff.glb', scale: 1.5 },
    { name: 'Squirtle', file: 'Squirtle.glb', scale: 4.5 }, 
    { name: 'Pikachu', file: 'Pikachu.glb', scale: 1.5 },
    { name: 'Eevee', file: 'Eevee.glb', scale: 1.5 }
  ]

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#000' }}>
      <Canvas camera={{ position: [0, 5, 15], fov: 45 }}>
        <Suspense fallback={null}>
          
          {/* Using a CDN link to guarantee the file is perfect and not cached brokenly */}
          <Environment 
            files="https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/church_meeting_room_1k.hdr" 
            background 
            blur={0.05} 
          />
          
          <ambientLight intensity={0.7} />
          <pointLight position={[10, 10, 10]} intensity={1.5} />

          {petData.map((pet, index) => (
            <Pet 
              key={pet.file} 
              url={`/models/${pet.file}`} 
              position={[(index - 2.5) * 4, 0, 0]} 
              scale={pet.scale}
            />
          ))}

          <ContactShadows position={[0, -0.01, 0]} opacity={0.5} scale={25} blur={2} />
        </Suspense>

        <OrbitControls makeDefault />
      </Canvas>
    </div>
  )
}