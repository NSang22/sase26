import { useState, useCallback, Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Pet, PetPlaceholder } from '../scene/Pet.jsx';

const ALL_SPECIES = ['pikachu', 'jigglypuff', 'bulbasaur', 'charmander', 'squirtle'];

// Positions spread along X axis in the debug canvas
const DEBUG_POSITIONS = [
  [-4.0, 0, 0],
  [-2.0, 0, 0],
  [ 0.0, 0, 0],
  [ 2.0, 0, 0],
  [ 4.0, 0, 0],
];

// Ring colors matching the main scene
const RING_COLORS = ['#F8D030', '#30D8F8', '#50E870', '#F850B8', '#a78bfa'];

// The three animation types from test.jsx
const ANIM_TYPES = [
  { key: 'jump',     label: 'Energetic',       color: '#00aaff' },
  { key: 'spinJump', label: 'Mega Spin',        color: '#ff6a00' },
  { key: 'dizzy',    label: 'Dizzy & Sleep',    color: '#ffe000' },
];

/**
 * Full-screen animation debugger overlay.
 * Toggle with backtick (`) from StudySession.
 * Pet handles all audio internally — this component just fires the trigger.
 */
export function AnimationDebugger({ onClose }) {
  // { species, animType, key } — key change re-triggers even for same animType
  const [activeAnim, setActiveAnim] = useState(null);

  const trigger = useCallback((species, animType) => {
    setActiveAnim({ species, animType, key: Date.now() });
  }, []);

  return (
    <div style={s.overlay}>
      {/* Header */}
      <div style={s.header}>
        <span style={s.title}>🎮 Animation Debugger</span>
        <span style={s.hint}>Press ` to close</span>
        <button style={s.closeBtn} onClick={onClose}>✕ Close</button>
      </div>

      {/* 3D preview — all 5 species side by side */}
      <div style={s.canvasWrap}>
        <Canvas
          camera={{ position: [0, 2, 10], fov: 48 }}
          style={{ background: '#0a0a18' }}
        >
          <ambientLight intensity={0.5} color="#c0cce8" />
          <pointLight position={[0, 5, 5]} intensity={2} color="#ffe8c0" />
          <directionalLight position={[-4, 4, 3]} intensity={0.4} color="#a0b8e0" />

          <Suspense fallback={null}>
            {ALL_SPECIES.map((species, i) => (
              <Pet
                key={species}
                species={species}
                focused={true}
                position={DEBUG_POSITIONS[i]}
                debugAnim={
                  activeAnim?.species === species
                    ? { animType: activeAnim.animType, key: activeAnim.key }
                    : null
                }
              />
            ))}
          </Suspense>

          <OrbitControls enableZoom={true} enablePan={false} />
        </Canvas>

        {/* Species labels overlaid on the canvas */}
        <div style={s.speciesLabels}>
          {ALL_SPECIES.map((species, i) => (
            <div key={species} style={{ ...s.speciesLabel, color: RING_COLORS[i] }}>
              {species}
            </div>
          ))}
        </div>
      </div>

      {/* Control grid: species columns × animation rows */}
      <div style={s.controls}>
        {ALL_SPECIES.map((species, si) => {
          const ringColor = RING_COLORS[si];
          return (
            <div key={species} style={s.speciesCol}>
              <div style={{ ...s.colTitle, color: ringColor, borderBottomColor: ringColor + '50' }}>
                {species.charAt(0).toUpperCase() + species.slice(1)}
              </div>

              {ANIM_TYPES.map(({ key: animType, label, color }) => {
                const isActive =
                  activeAnim?.species === species &&
                  activeAnim?.animType === animType;
                return (
                  <button
                    key={animType}
                    style={{
                      ...s.animBtn,
                      borderColor: isActive ? color : color + '44',
                      background: isActive ? color + '20' : 'transparent',
                      color: isActive ? color : '#888',
                    }}
                    onClick={() => trigger(species, animType)}
                  >
                    {isActive && <span style={{ ...s.dot, background: color }} />}
                    <span style={s.btnLabel}>{label}</span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Legend row */}
      <div style={s.legend}>
        {ANIM_TYPES.map(({ key, label, color }) => (
          <span key={key} style={{ ...s.legendItem, color }}>
            <span style={{ ...s.dot, background: color, display: 'inline-block' }} />
            {label}
          </span>
        ))}
        <span style={s.legendHint}>
          Audio + particles play from Pet — max 3 s per animation
        </span>
      </div>
    </div>
  );
}

const s = {
  overlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 200,
    display: 'flex',
    flexDirection: 'column',
    background: 'rgba(8,8,20,0.97)',
    fontFamily: "'Press Start 2P', monospace",
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    padding: '12px 20px',
    borderBottom: '1px solid #1e1e38',
    flexShrink: 0,
  },
  title: {
    fontSize: 12,
    color: '#a78bfa',
    fontWeight: 700,
    letterSpacing: 1,
  },
  hint: {
    fontSize: 9,
    color: '#333',
    marginLeft: 'auto',
  },
  closeBtn: {
    padding: '6px 14px',
    background: 'transparent',
    border: '1px solid #2e2e4e',
    borderRadius: 6,
    color: '#555',
    fontSize: 9,
    cursor: 'pointer',
    fontFamily: "'Press Start 2P', monospace",
  },
  canvasWrap: {
    flex: 1,
    position: 'relative',
    minHeight: 0,
  },
  speciesLabels: {
    position: 'absolute',
    bottom: 8,
    left: 0,
    right: 0,
    display: 'flex',
    justifyContent: 'space-around',
    pointerEvents: 'none',
  },
  speciesLabel: {
    fontSize: 7,
    fontWeight: 700,
    textShadow: '0 0 8px currentColor',
    letterSpacing: 1,
  },
  controls: {
    display: 'flex',
    borderTop: '1px solid #1e1e38',
    flexShrink: 0,
  },
  speciesCol: {
    flex: 1,
    padding: '10px 8px',
    borderRight: '1px solid #16162a',
    display: 'flex',
    flexDirection: 'column',
    gap: 5,
  },
  colTitle: {
    fontSize: 7,
    fontWeight: 700,
    letterSpacing: 1,
    paddingBottom: 6,
    marginBottom: 4,
    borderBottom: '1px solid',
    textTransform: 'uppercase',
  },
  animBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 8px',
    borderRadius: 5,
    border: '1px solid',
    cursor: 'pointer',
    fontSize: 7,
    fontFamily: "'Press Start 2P', monospace",
    letterSpacing: 0.5,
    transition: 'all 0.12s ease',
    textAlign: 'left',
  },
  btnLabel: {
    flex: 1,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    flexShrink: 0,
    animation: 'pulse 0.8s ease-in-out infinite',
  },
  legend: {
    display: 'flex',
    alignItems: 'center',
    gap: 20,
    padding: '8px 20px',
    borderTop: '1px solid #1e1e38',
    flexShrink: 0,
  },
  legendItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 7,
  },
  legendHint: {
    fontSize: 7,
    color: '#333',
    marginLeft: 'auto',
  },
};
