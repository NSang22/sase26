import { Component, Suspense, useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
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
import { usePictureInPicture } from '../../hooks/usePictureInPicture.js';
import { socket } from '../../lib/socket.js';

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

const SEAT_POSITIONS = [
  [-1.0, 1.7, -1.4],
  [1.0, 1.7, -1.4],
  [-1.2, 1.7, -2.5],
  [1.0, 1.7, -2.5],
];

const RING_COLORS = ['#F8D030', '#30D8F8', '#50E870', '#F850B8'];

export function StudySession() {
  const room = useGameStore((s) => s.room);
  const mySocketId = useGameStore((s) => s.mySocketId);
  const focusStates = useGameStore((s) => s.focusStates);
  const currentQuestion = useGameStore((s) => s.currentQuestion);
  const petBubbles = useGameStore((s) => s.petBubbles);
  const fakeFocusWarning = useGameStore((s) => s.fakeFocusWarning);
  const playerSubjects = useGameStore((s) => s.playerSubjects);
  const studyStarted = useGameStore((s) => s.studyStarted);
  const setStudyStarted = useGameStore((s) => s.setStudyStarted);

  const playerIndex = (room?.players ?? []).findIndex((p) => p.socketId === mySocketId);

  const {
    screenEnabled,
    screenDenied,
    showModal: showScreenModal,
    awaitingBrowser,
    confirmScreenShare,
    dismissScreenCapture,
  } = useScreenCapture(room?.code, Math.max(0, playerIndex));

  const sceneReady = !showScreenModal && studyStarted;
  const showStartOverlay = !studyStarted;

  const handleFocusChange = useCallback(
    (focused) => {
      if (!room?.code) return;
      socket.emit('focus_update', { roomCode: room.code, focused });
    },
    [room]
  );

  const { videoRef, calibrating } = useFocusTracker({
    onFocusChange: handleFocusChange,
    enabled: sceneReady,
  });

  const players = room?.players ?? [];
  const myPlayer = players.find((p) => p.socketId === mySocketId);
  const partners = players.filter((p) => p.socketId !== mySocketId);
  const partner = partners[0];

  const usernameToSpecies = {};
  if (room?.buddySelections) {
    for (const [species, username] of Object.entries(room.buddySelections)) {
      usernameToSpecies[username] = species.toLowerCase();
    }
  }

  const seatedPlayers = myPlayer ? [myPlayer, ...partners].slice(0, 4) : partners.slice(0, 4);

  const myFocused = focusStates[mySocketId] ?? true;
  const firstPartner = partners[0];
  const partnerFocused = firstPartner ? (focusStates[firstPartner.socketId] ?? true) : true;

  const mySubject = playerSubjects[mySocketId] ?? null;
  const partnerSubject = partner ? (playerSubjects[partner.socketId] ?? null) : null;

  const [debugOpen, setDebugOpen] = useState(false);
  useEffect(() => {
    const handler = (e) => {
      if (e.key === '`') setDebugOpen((o) => !o);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const { setContainerRef, pipActive, pipReady, enterPiP, pipWindow } = usePictureInPicture({ enabled: sceneReady });
  const pipOverlayRoot = pipWindow?.document?.getElementById('pip-overlay-root');

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      <video ref={videoRef} style={{ display: 'none' }} playsInline muted />

      {sceneReady && calibrating && (
        <div style={ov.calibrating}>Look straight ahead - calibrating your gaze...</div>
      )}

      {sceneReady && (
        <div ref={setContainerRef} style={{ width: '100%', height: '100%' }}>
          <Canvas
            shadows
            camera={{ position: [0, 3, 6], fov: 50 }}
            gl={{ preserveDrawingBuffer: true }}
            frameloop="always"
            style={{ background: '#0a0a18' }}
          >
            <Suspense fallback={null}>
              <StudyRoom playerCount={seatedPlayers.length || 1} />

              {seatedPlayers.map((player, i) => {
                const pos = SEAT_POSITIONS[i];
                const ringPos = [pos[0], pos[1] - 0.01, pos[2]];
                const focused = focusStates[player.socketId] ?? true;
                const species = usernameToSpecies[player.username] ?? 'pikachu';
                const nameColor = RING_COLORS[i];

                return (
                  <group key={player.socketId}>
                    <PetErrorBoundary fallback={<PetPlaceholder focused={focused} position={pos} />}>
                      <Suspense fallback={<PetPlaceholder focused={focused} position={pos} />}>
                        <Pet species={species} focused={focused} position={pos} />
                      </Suspense>
                    </PetErrorBoundary>

                    <FocusRing focused={focused} position={ringPos} color={RING_COLORS[i]} />

                    <Html
                      position={[pos[0], pos[1] + 1.4, pos[2]]}
                      center
                      distanceFactor={6}
                      style={{ pointerEvents: 'none' }}
                    >
                      <div
                        style={{
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
                        }}
                      >
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
        </div>
      )}

      {showStartOverlay && (
        <div style={ov.startOverlay}>
          <div style={ov.startCard}>
            <div style={{ fontSize: 40 }}>??</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#ddd6fe' }}>You're all set!</div>
            <div style={{ fontSize: 14, color: '#888', lineHeight: 1.5, maxWidth: 340 }}>
              When you start studying, your 3D study room will load.
              Switch to your study tab and click <strong>Pin mini-player</strong> to
              keep the room floating on screen.
            </div>
            <button style={ov.startBtn} onClick={() => setStudyStarted()}>
              Start Studying
            </button>
          </div>
        </div>
      )}

      {pipActive && <div style={ov.pipBadge}>Study room is in mini-player</div>}

      {sceneReady && !pipActive && (
        <button
          style={{ ...ov.pipBtn, opacity: pipReady ? 1 : 0.5, cursor: pipReady ? 'pointer' : 'default' }}
          onClick={pipReady ? enterPiP : undefined}
          title={pipReady ? 'Pin study room as mini-player' : 'Preparing stream...'}
        >
          {pipReady ? 'Pin mini-player' : 'Preparing mini-player...'}
        </button>
      )}

      {sceneReady && <SessionHUD myFocused={myFocused} partnerFocused={partnerFocused} />}
      {sceneReady && currentQuestion && <QuizOverlay question={currentQuestion} />}

      {pipOverlayRoot && currentQuestion && createPortal(<QuizOverlay question={currentQuestion} />, pipOverlayRoot)}

      <div style={ov.statusStrip}>
        {screenEnabled && mySubject && <SubjectPill data={mySubject} label="You" isSelf />}
        {screenDenied && <div style={ov.deniedPill}>Screen analysis disabled</div>}
        {partners.map((p) => {
          const sub = playerSubjects[p.socketId] ?? null;
          if (!sub) return null;
          return <SubjectPill key={p.socketId} data={sub} label={p.username} />;
        })}
      </div>

      {fakeFocusWarning && (
        <div style={ov.fakeFocusBanner}>
          <span style={{ fontSize: 22 }}>??</span>
          <div>
            <div style={{ fontWeight: 800, fontSize: 15 }}>Nice try - we can see your screen</div>
            <div style={{ fontSize: 12, opacity: 0.85, marginTop: 2 }}>Detected: {fakeFocusWarning}</div>
          </div>
        </div>
      )}

      <div style={ov.debugHint}>` debug</div>
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

      {partner && partnerSubject && (
        <div style={ov.partnerSubjectBadge}>
          <SubjectPill data={partnerSubject} label={partner.username} compact />
        </div>
      )}

      {showScreenModal && (
        <div style={ov.modalBackdrop}>
          <div style={ov.modal}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>???</div>
            <div style={ov.modalTitle}>
              {awaitingBrowser ? 'Select your screen' : 'You need to give access to your entire screen'}
            </div>
            <div style={ov.modalBody}>
              {awaitingBrowser
                ? 'In the browser dialog, choose your entire screen - not just a window or tab.'
                : "The AI study agent needs to see your whole screen to detect what you're studying and catch distractions."}
            </div>
            {!awaitingBrowser && (
              <div style={ov.modalSteps}>
                <div style={ov.step}><span style={ov.stepNum}>1</span>Click <strong>Got it</strong> below</div>
                <div style={ov.step}><span style={ov.stepNum}>2</span>Select the <strong>Entire Screen</strong> tab</div>
                <div style={ov.step}><span style={ov.stepNum}>3</span>Click <strong>Share</strong></div>
                <div style={ov.step}><span style={ov.stepNum}>4</span>Switch to your <strong>study tab</strong></div>
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 4 }}>
              {awaitingBrowser ? (
                <div style={{ ...ov.shareBtn, opacity: 0.6, cursor: 'default' }}>Waiting for browser...</div>
              ) : (
                <button style={ov.shareBtn} onClick={confirmScreenShare}>Got it</button>
              )}
              {!awaitingBrowser && <button style={ov.skipBtn} onClick={dismissScreenCapture}>Skip</button>}
            </div>
            <div style={ov.modalNote}>Screenshots are analyzed by AI and never stored as images.</div>
          </div>
        </div>
      )}
    </div>
  );
}

function SubjectPill({ data, label, compact = false }) {
  const studying = data.is_studying;
  const text = studying ? data.subject || 'Studying' : data.distraction || 'Off-task';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: compact ? 4 : 6,
        padding: compact ? '4px 10px' : '6px 14px',
        background: studying ? 'rgba(20,83,45,0.92)' : 'rgba(69,10,10,0.92)',
        border: `1px solid ${studying ? '#22c55e' : '#ef4444'}`,
        borderRadius: 20,
        fontSize: compact ? 11 : 13,
        fontWeight: 600,
        color: studying ? '#86efac' : '#fca5a5',
        backdropFilter: 'blur(6px)',
        whiteSpace: 'nowrap',
      }}
    >
      <span>{studying ? '??' : '??'}</span>
      {!compact && <span style={{ color: '#aaa', fontSize: 11 }}>{label}:</span>}
      <span>{text}</span>
    </div>
  );
}

const ov = {
  calibrating: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(10,10,24,0.85)',
    color: '#a78bfa',
    fontSize: 22,
    fontWeight: 600,
    zIndex: 100,
  },
  statusStrip: {
    position: 'absolute',
    top: 16,
    right: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    alignItems: 'flex-end',
    zIndex: 50,
    pointerEvents: 'none',
  },
  deniedPill: {
    padding: '6px 14px',
    background: 'rgba(40,30,10,0.9)',
    border: '1px solid #b45309',
    borderRadius: 20,
    color: '#fbbf24',
    fontSize: 12,
    fontWeight: 600,
  },
  fakeFocusBanner: {
    position: 'absolute',
    top: 60,
    left: '50%',
    transform: 'translateX(-50%)',
    padding: '14px 28px',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    background: 'linear-gradient(90deg, #7f1d1d, #991b1b)',
    border: '2px solid #ef4444',
    borderRadius: 14,
    color: '#fca5a5',
    zIndex: 60,
    boxShadow: '0 0 24px rgba(239,68,68,0.4)',
    animation: 'pulse 1s ease-in-out infinite',
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
  partnerSubjectBadge: {
    position: 'absolute',
    bottom: '42%',
    right: '18%',
    zIndex: 30,
    pointerEvents: 'none',
  },
  modalBackdrop: {
    position: 'absolute',
    inset: 0,
    background: 'rgba(10,10,24,0.88)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 200,
    backdropFilter: 'blur(4px)',
  },
  modal: {
    background: '#16162a',
    border: '1px solid #4c1d95',
    borderRadius: 20,
    padding: '36px 44px',
    maxWidth: 440,
    width: '90%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 16,
    boxShadow: '0 0 60px rgba(124,58,237,0.25)',
    textAlign: 'center',
  },
  modalTitle: { fontSize: 22, fontWeight: 800, color: '#ddd6fe', letterSpacing: 0.5 },
  modalBody: { fontSize: 14, color: '#888', lineHeight: 1.6 },
  modalSteps: { display: 'flex', flexDirection: 'column', gap: 10, width: '100%', textAlign: 'left' },
  step: { display: 'flex', alignItems: 'center', gap: 12, fontSize: 13, color: '#c4b5fd' },
  stepNum: {
    minWidth: 26,
    height: 26,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#4c1d95',
    borderRadius: '50%',
    fontSize: 12,
    fontWeight: 700,
    color: '#fff',
    flexShrink: 0,
  },
  shareBtn: {
    padding: '11px 28px',
    background: '#7c3aed',
    color: '#fff',
    border: 'none',
    borderRadius: 10,
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
    letterSpacing: 0.5,
    boxShadow: '0 4px 0 #4c1d95',
  },
  skipBtn: {
    padding: '11px 20px',
    background: 'transparent',
    color: '#555',
    border: '1px solid #2a2a4a',
    borderRadius: 10,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  },
  modalNote: { fontSize: 11, color: '#444', marginTop: -4 },
  pipBadge: {
    position: 'absolute',
    bottom: 16,
    left: '50%',
    transform: 'translateX(-50%)',
    padding: '8px 18px',
    background: 'rgba(16,16,42,0.92)',
    border: '1px solid #4c1d95',
    borderRadius: 12,
    color: '#a78bfa',
    fontSize: 13,
    fontWeight: 600,
    backdropFilter: 'blur(6px)',
    zIndex: 50,
    whiteSpace: 'nowrap',
  },
  pipBtn: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    padding: '8px 16px',
    background: 'rgba(16,16,42,0.92)',
    border: '1px solid #3b3b5c',
    borderRadius: 10,
    color: '#a78bfa',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    zIndex: 50,
    backdropFilter: 'blur(6px)',
  },
  startOverlay: {
    position: 'absolute',
    inset: 0,
    background: 'rgba(10,10,24,0.8)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 150,
    backdropFilter: 'blur(3px)',
  },
  startCard: {
    background: '#16162a',
    border: '1px solid #4c1d95',
    borderRadius: 20,
    padding: '36px 44px',
    maxWidth: 420,
    width: '90%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 14,
    boxShadow: '0 0 60px rgba(124,58,237,0.25)',
    textAlign: 'center',
  },
  startBtn: {
    padding: '12px 32px',
    background: '#22c55e',
    color: '#fff',
    border: 'none',
    borderRadius: 12,
    fontSize: 16,
    fontWeight: 800,
    cursor: 'pointer',
    letterSpacing: 0.5,
    boxShadow: '0 4px 0 #15803d',
    marginTop: 4,
  },
};
