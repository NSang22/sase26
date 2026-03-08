import { Component, Suspense, useCallback, useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import { StudyRoom } from './StudyRoom.jsx';
import { Pet, PetPlaceholder } from './Pet.jsx';
import { FocusRing } from './FocusRing.jsx';
import { SessionHUD } from '../ui/SessionHUD.jsx';
import { QuizOverlay } from '../ui/QuizOverlay.jsx';
import { PetTextBubble } from '../ui/PetTextBubble.jsx';
import { AnimationDebugger } from '../ui/AnimationDebugger.jsx';
import { useGameStore } from '../../store/gameStore.js';
import { useFocusTracker } from '../../hooks/useFocusTracker.js';
import { useScreenCapture } from '../../hooks/useScreenCapture.js';
import { socket } from '../../lib/socket.js';

// ── ErrorBoundary for individual pet models ───────────────────────────────────
class PetErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: false };
  }
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    if (this.state.error) return this.props.fallback;
    return this.props.children;
  }
}

// Seat positions around the table — index 0 is always the local player.
const SEAT_POSITIONS = [
  [-1.0, 1.7, -1.4],
  [ 1.0, 1.7, -1.4],
  [-1.2, 1.7, -2.5],
  [ 1.0, 1.7, -2.5],
];

// Distinct neon ring color per seat.
const RING_COLORS = [
  '#F8D030', // gold
  '#30D8F8', // cyan
  '#50E870', // green
  '#F850B8', // pink
];

/**
 * Main session view: 3D canvas + 2D overlays (HUD, quiz).
 */
export function StudySession() {
  const {
    room,
    mySocketId,
    focusStates,
    currentQuestion,
    petBubbles,
    screenAnalysis,
    fakeFocusWarning,
  } = useGameStore();

  // ── Focus tracking ────────────────────────────────────────────────────────
  const handleFocusChange = useCallback(
    (focused) => {
      if (!room?.code) return;
      socket.emit('focus_update', { roomCode: room.code, focused });
    },
    [room]
  );

  const { videoRef, calibrating } = useFocusTracker({
    onFocusChange: handleFocusChange,
    enabled: true,
  });

  const { screenEnabled, screenDenied, startScreenCapture } = useScreenCapture();

  useEffect(() => {
    if (!calibrating && room?.code && !screenEnabled && !screenDenied) {
      startScreenCapture(room.code);
    }
  }, [calibrating, room?.code, screenEnabled, screenDenied, startScreenCapture]);

  // ── Species resolution ────────────────────────────────────────────────────
  // buddySelections = { 'Pikachu': 'Ash', 'Jigglypuff': 'Misty' }
  // Normalize keys to lowercase so they match SPECIES_PATH in Pet.jsx.
  const usernameToSpecies = {};
  if (room?.buddySelections) {
    for (const [species, username] of Object.entries(room.buddySelections)) {
      usernameToSpecies[username] = species.toLowerCase();
    }
  }

  const allPlayers = room?.players ?? [];
  const myPlayer = allPlayers.find((p) => p.socketId === mySocketId);
  const partners = allPlayers.filter((p) => p.socketId !== mySocketId);
  // Local player always sits in seat 0
  const seatedPlayers = myPlayer
    ? [myPlayer, ...partners].slice(0, 4)
    : partners.slice(0, 4);

  const myFocused = focusStates[mySocketId] ?? true;
  const firstPartner = partners[0];
  const partnerFocused = firstPartner ? (focusStates[firstPartner.socketId] ?? true) : true;

  // ── Debug mode (toggle with backtick key) ─────────────────────────────────
  const [debugOpen, setDebugOpen] = useState(false);
  useEffect(() => {
    const handler = (e) => {
      if (e.key === '`') setDebugOpen((o) => !o);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      {/* Hidden webcam element for MediaPipe */}
      <video ref={videoRef} style={{ display: 'none' }} playsInline muted />

      {/* Calibration overlay */}
      {calibrating && (
        <div style={overlayStyles.calibrating}>
          Look straight ahead — calibrating your gaze...
        </div>
      )}

      {/* 3D Canvas */}
      <Canvas
        shadows
        camera={{ position: [0, 3, 6], fov: 50 }}
        style={{ background: '#0a0a18' }}
      >
        <Suspense fallback={null}>
          <StudyRoom playerCount={allPlayers.length} />

          {seatedPlayers.map((player, i) => {
            const pos = SEAT_POSITIONS[i];
            const ringPos = [pos[0], pos[1] - 0.01, pos[2]];
            const focused = focusStates[player.socketId] ?? true;
            const species = usernameToSpecies[player.username] ?? 'pikachu';

            const nameColor = RING_COLORS[i];

            return (
              <group key={player.socketId}>
                <PetErrorBoundary
                  fallback={<PetPlaceholder focused={focused} position={pos} />}
                >
                  <Suspense fallback={<PetPlaceholder focused={focused} position={pos} />}>
                    <Pet species={species} focused={focused} position={pos} />
                  </Suspense>
                </PetErrorBoundary>
                <FocusRing focused={focused} position={ringPos} color={RING_COLORS[i]} />

                {/* Player name label — rendered in world space above the seat */}
                <Html
                  position={[pos[0], pos[1] + 1.4, pos[2]]}
                  center
                  distanceFactor={6}
                  style={{ pointerEvents: 'none' }}
                >
                  <div style={{
                    fontFamily: "'Press Start 2P', monospace",
                    fontSize: '8px',
                    color: nameColor,
                    textShadow: `0 0 10px ${nameColor}`,
                    whiteSpace: 'nowrap',
                    background: 'rgba(8,8,20,0.78)',
                    padding: '3px 8px',
                    borderRadius: '4px',
                    border: `1px solid ${nameColor}55`,
                    letterSpacing: '0.5px',
                  }}>
                    {player.username}
                  </div>
                </Html>
              </group>
            );
          })}
        </Suspense>

        <OrbitControls
          enableZoom={false}
          enablePan={false}
          minPolarAngle={Math.PI / 6}
          maxPolarAngle={Math.PI / 2.5}
        />
      </Canvas>

      {/* 2D overlays */}
      <SessionHUD myFocused={myFocused} partnerFocused={partnerFocused} />
      {currentQuestion && <QuizOverlay question={currentQuestion} />}

      {screenAnalysis && (
        <div style={overlayStyles.subjectPill}>
          {screenAnalysis.is_studying
            ? `Studying: ${screenAnalysis.subject}`
            : `Distracted: ${screenAnalysis.distraction || 'Off-task'}`}
        </div>
      )}

      {screenDenied && (
        <div style={overlayStyles.screenDenied}>
          Screen sharing denied — AI study tracking disabled
        </div>
      )}

      {fakeFocusWarning && (
        <div style={overlayStyles.fakeFocusWarning}>
          Fake focus detected — {fakeFocusWarning}
        </div>
      )}

      {/* Debug toggle hint */}
      <div style={overlayStyles.debugHint}>` debug</div>

      {/* Animation debugger overlay */}
      {debugOpen && <AnimationDebugger onClose={() => setDebugOpen(false)} />}

      {mySocketId && petBubbles[mySocketId] && (
        <div style={{ position: 'absolute', bottom: '35%', left: '30%', pointerEvents: 'none' }}>
          <PetTextBubble text={petBubbles[mySocketId]} />
        </div>
      )}
      {firstPartner && petBubbles[firstPartner.socketId] && (
        <div style={{ position: 'absolute', bottom: '35%', right: '30%', pointerEvents: 'none' }}>
          <PetTextBubble text={petBubbles[firstPartner.socketId]} />
        </div>
      )}
    </div>
  );
}

const overlayStyles = {
  calibrating: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(10,10,24,0.85)',
    color: '#a78bfa',
    fontSize: 22,
    fontWeight: 600,
    zIndex: 100,
    letterSpacing: 1,
  },
  subjectPill: {
    position: 'absolute',
    top: 16,
    right: 16,
    padding: '8px 18px',
    background: 'rgba(16,16,40,0.9)',
    border: '1px solid #7c3aed',
    borderRadius: 20,
    color: '#ddd6fe',
    fontSize: 13,
    fontWeight: 600,
    zIndex: 50,
    backdropFilter: 'blur(6px)',
  },
  screenDenied: {
    position: 'absolute',
    top: 16,
    right: 16,
    padding: '8px 18px',
    background: 'rgba(40,30,10,0.9)',
    border: '1px solid #b45309',
    borderRadius: 20,
    color: '#fbbf24',
    fontSize: 12,
    fontWeight: 600,
    zIndex: 50,
  },
  debugHint: {
    position: 'absolute',
    bottom: 8,
    left: 12,
    fontSize: 9,
    color: '#333',
    fontFamily: "'Press Start 2P', monospace",
    letterSpacing: 1,
    zIndex: 10,
    pointerEvents: 'none',
  },
  fakeFocusWarning: {
    position: 'absolute',
    top: 60,
    left: '50%',
    transform: 'translateX(-50%)',
    padding: '12px 28px',
    background: 'linear-gradient(90deg, #7f1d1d, #991b1b)',
    border: '1px solid #ef4444',
    borderRadius: 12,
    color: '#fca5a5',
    fontSize: 15,
    fontWeight: 700,
    zIndex: 60,
    animation: 'pulse 1s ease-in-out infinite',
    textAlign: 'center',
  },
};
