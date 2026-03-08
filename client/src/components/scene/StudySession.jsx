import { Suspense, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { StudyRoom } from './StudyRoom.jsx';
import { PetPlaceholder } from './Pet.jsx';
import { FocusRing } from './FocusRing.jsx';
import { SessionHUD } from '../ui/SessionHUD.jsx';
import { QuizOverlay } from '../ui/QuizOverlay.jsx';
import { PetTextBubble } from '../ui/PetTextBubble.jsx';
import { useGameStore } from '../../store/gameStore.js';
import { useFocusTracker } from '../../hooks/useFocusTracker.js';
import { useScreenCapture } from '../../hooks/useScreenCapture.js';
import { usePictureInPicture } from '../../hooks/usePictureInPicture.js';
import { socket } from '../../lib/socket.js';

/**
 * Main session view: 3D canvas + 2D overlays (HUD, quiz, screen analysis).
 */
export function StudySession() {
  // ── Individual selectors — only re-render when these specific values change ──
  const room             = useGameStore((s) => s.room);
  const mySocketId       = useGameStore((s) => s.mySocketId);
  const focusStates      = useGameStore((s) => s.focusStates);
  const currentQuestion  = useGameStore((s) => s.currentQuestion);
  const petBubbles       = useGameStore((s) => s.petBubbles);
  const fakeFocusWarning = useGameStore((s) => s.fakeFocusWarning);
  const playerSubjects   = useGameStore((s) => s.playerSubjects);
  const studyStarted     = useGameStore((s) => s.studyStarted);
  const setStudyStarted  = useGameStore((s) => s.setStudyStarted);

  const playerIndex = (room?.players ?? []).findIndex((p) => p.socketId === mySocketId);

  // Screen capture hook FIRST so we know whether the modal is still up
  const {
    screenEnabled,
    screenDenied,
    showModal: showScreenModal,
    awaitingBrowser,
    confirmScreenShare,
    dismissScreenCapture,
  } = useScreenCapture(room?.code, Math.max(0, playerIndex));

  // NOTHING heavy mounts until BOTH overlays are dismissed
  const sceneReady = !showScreenModal && studyStarted;
  // Start overlay sits at z-150, behind screen-share modal (z-200).
  // Depends ONLY on studyStarted so a single store bool controls it.
  const showStartOverlay = !studyStarted;

  const handleFocusChange = useCallback(
    (focused) => {
      if (!room?.code) return;
      socket.emit('focus_update', { roomCode: room.code, focused });
    },
    [room]
  );

  // Don't start webcam / MediaPipe until BOTH modals are gone
  const { videoRef, calibrating } = useFocusTracker({
    onFocusChange: handleFocusChange,
    enabled: sceneReady,
  });

  const players = room?.players ?? [];
  const myPlayer = players.find((p) => p.socketId === mySocketId);
  const partners = players.filter((p) => p.socketId !== mySocketId);
  const partner = partners[0]; // primary partner for 2-player layout

  const myFocused = focusStates[mySocketId] ?? true;
  const partnerFocused = partner ? (focusStates[partner.socketId] ?? true) : true;

  const mySubject = playerSubjects[mySocketId] ?? null;
  const partnerSubject = partner ? (playerSubjects[partner.socketId] ?? null) : null;

  // PiP — only enable after scene is mounted
  const { setContainerRef, pipActive, pipReady, enterPiP, pipWindow } = usePictureInPicture({ enabled: sceneReady });

  // Portal target for rendering overlays inside the Document PiP window
  const pipOverlayRoot = pipWindow?.document?.getElementById('pip-overlay-root');

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      {/* Hidden webcam for MediaPipe */}
      <video ref={videoRef} style={{ display: 'none' }} playsInline muted />

      {/* Calibration overlay */}
      {sceneReady && calibrating && (
        <div style={ov.calibrating}>
          Look straight ahead — calibrating your gaze...
        </div>
      )}

      {/* 3D Canvas — only mount after ALL overlays are dismissed */}
      {sceneReady && (
        <div ref={setContainerRef} style={{ width: '100%', height: '100%' }}>
          <Canvas shadows camera={{ position: [0, 3, 6], fov: 50 }} gl={{ preserveDrawingBuffer: true }} frameloop="always" style={{ background: '#0a0a18' }}>
            <Suspense fallback={null}>
              <StudyRoom />
              <PetPlaceholder focused={myFocused} position={[-1.2, 0.55, -1]} label="You" />
              <FocusRing focused={myFocused} position={[-1.2, 0.54, -1]} />
              {partner && (
                <>
                  <PetPlaceholder focused={partnerFocused} position={[1.2, 0.55, -1]} label={partner.username} />
                  <FocusRing focused={partnerFocused} position={[1.2, 0.54, -1]} />
                </>
              )}
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

      {/* "You're all set" overlay — no Canvas behind it */}
      {showStartOverlay && (
        <div style={ov.startOverlay}>
          <div style={ov.startCard}>
            <div style={{ fontSize: 40 }}>📚</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#ddd6fe' }}>You’re all set!</div>
            <div style={{ fontSize: 14, color: '#888', lineHeight: 1.5, maxWidth: 340 }}>
              When you start studying, your 3D study room will load.
              Switch to your study tab and click <strong>📌 Pin mini-player</strong> to
              keep the room floating on screen.
            </div>
            <button style={ov.startBtn} onClick={() => setStudyStarted()}>
              🚀 Start Studying
            </button>
          </div>
        </div>
      )}

      {/* PiP active badge */}
      {pipActive && (
        <div style={ov.pipBadge}>
          📺 Study room is in mini-player
        </div>
      )}

      {/* Pin mini-player button — appears once stream is captured */}
      {sceneReady && !pipActive && (
        <button
          style={{ ...ov.pipBtn, opacity: pipReady ? 1 : 0.5, cursor: pipReady ? 'pointer' : 'default' }}
          onClick={pipReady ? enterPiP : undefined}
          title={pipReady ? 'Pin study room as mini-player' : 'Preparing stream...'}
        >
          {pipReady ? '📌 Pin mini-player' : '⏳ Preparing mini-player...'}
        </button>
      )}

      {/* 2D overlays */}
      {sceneReady && <SessionHUD myFocused={myFocused} partnerFocused={partnerFocused} />}
      {sceneReady && currentQuestion && <QuizOverlay question={currentQuestion} />}

      {/* Mirror quiz into Document PiP window so it's visible in mini-player */}
      {pipOverlayRoot && currentQuestion && createPortal(
        <QuizOverlay question={currentQuestion} />,
        pipOverlayRoot,
      )}

      {/* ── Screen status strip (top-right) ───────────────────────────── */}
      <div style={ov.statusStrip}>
        {/* My subject pill */}
        {screenEnabled && mySubject && (
          <SubjectPill data={mySubject} label="You" isSelf />
        )}
        {/* Screen sharing denied note */}
        {screenDenied && (
          <div style={ov.deniedPill}>
            Screen analysis disabled
          </div>
        )}
        {/* Partners' subjects */}
        {partners.map((p) => {
          const sub = playerSubjects[p.socketId] ?? null;
          if (!sub) return null;
          return <SubjectPill key={p.socketId} data={sub} label={p.username} />;
        })}
      </div>

      {/* ── Fake-focus warning banner ─────────────────────────────────── */}
      {fakeFocusWarning && (
        <div style={ov.fakeFocusBanner}>
          <span style={{ fontSize: 22 }}>🚨</span>
          <div>
            <div style={{ fontWeight: 800, fontSize: 15 }}>Nice try — we can see your screen</div>
            <div style={{ fontSize: 12, opacity: 0.85, marginTop: 2 }}>
              Detected: {fakeFocusWarning}
            </div>
          </div>
        </div>
      )}

      {/* Pet text bubbles */}
      {mySocketId && petBubbles[mySocketId] && (
        <div style={{ position: 'absolute', bottom: '35%', left: '30%', pointerEvents: 'none' }}>
          <PetTextBubble text={petBubbles[mySocketId]} />
        </div>
      )}
      {partner && petBubbles[partner.socketId] && (
        <div style={{ position: 'absolute', bottom: '35%', right: '30%', pointerEvents: 'none' }}>
          <PetTextBubble text={petBubbles[partner.socketId]} />
        </div>
      )}

      {/* Partner subject badge over their side of the desk */}
      {partner && partnerSubject && (
        <div style={ov.partnerSubjectBadge}>
          <SubjectPill data={partnerSubject} label={partner.username} compact />
        </div>
      )}

      {/* ── Screen share instruction modal ───────────────────────────── */}
      {showScreenModal && (
        <div style={ov.modalBackdrop}>
          <div style={ov.modal}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>🖥️</div>
            <div style={ov.modalTitle}>
              {awaitingBrowser ? 'Select your screen' : 'You need to give access to your entire screen'}
            </div>
            <div style={ov.modalBody}>
              {awaitingBrowser
                ? 'In the browser dialog, choose your entire screen — not just a window or tab.'
                : 'The AI study agent needs to see your whole screen to detect what you\'re studying and catch distractions.'}
            </div>
            {!awaitingBrowser && (
              <div style={ov.modalSteps}>
                <div style={ov.step}>
                  <span style={ov.stepNum}>1</span>
                  Click <strong>Got it</strong> below
                </div>
                <div style={ov.step}>
                  <span style={ov.stepNum}>2</span>
                  In the browser dialog, select the <strong>Entire Screen</strong> tab
                </div>
                <div style={ov.step}>
                  <span style={ov.stepNum}>3</span>
                  Click <strong>Share</strong> to confirm
                </div>
                <div style={ov.step}>
                  <span style={ov.stepNum}>4</span>
                  Switch to your <strong>study tab</strong> and get to work — a mini study room will float on screen
                </div>
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 4 }}>
              {awaitingBrowser ? (
                <div style={{ ...ov.shareBtn, opacity: 0.6, cursor: 'default' }}>
                  Waiting for browser...
                </div>
              ) : (
                <button style={ov.shareBtn} onClick={confirmScreenShare}>
                  Got it
                </button>
              )}
              {!awaitingBrowser && (
                <button style={ov.skipBtn} onClick={dismissScreenCapture}>
                  Skip
                </button>
              )}
            </div>
            <div style={ov.modalNote}>
              Screenshots are analyzed by AI and never stored as images.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Small pill showing a player's current screen subject or distraction. */
function SubjectPill({ data, label, isSelf = false, compact = false }) {
  const studying = data.is_studying;
  const text = studying
    ? (data.subject || 'Studying')
    : (data.distraction || 'Off-task');

  return (
    <div style={{
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
    }}>
      <span>{studying ? '📚' : '⚠️'}</span>
      {!compact && <span style={{ color: '#aaa', fontSize: 11 }}>{label}:</span>}
      <span>{text}</span>
    </div>
  );
}

const ov = {
  calibrating: {
    position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(10,10,24,0.85)', color: '#a78bfa', fontSize: 22, fontWeight: 600, zIndex: 100,
  },
  statusStrip: {
    position: 'absolute', top: 16, right: 16, display: 'flex', flexDirection: 'column', gap: 6,
    alignItems: 'flex-end', zIndex: 50, pointerEvents: 'none',
  },
  deniedPill: {
    padding: '6px 14px', background: 'rgba(40,30,10,0.9)', border: '1px solid #b45309',
    borderRadius: 20, color: '#fbbf24', fontSize: 12, fontWeight: 600,
  },
  fakeFocusBanner: {
    position: 'absolute', top: 60, left: '50%', transform: 'translateX(-50%)',
    padding: '14px 28px', display: 'flex', alignItems: 'center', gap: 12,
    background: 'linear-gradient(90deg, #7f1d1d, #991b1b)',
    border: '2px solid #ef4444', borderRadius: 14,
    color: '#fca5a5', zIndex: 60, boxShadow: '0 0 24px rgba(239,68,68,0.4)',
    animation: 'pulse 1s ease-in-out infinite',
  },
  partnerSubjectBadge: {
    position: 'absolute', bottom: '42%', right: '18%', zIndex: 30, pointerEvents: 'none',
  },
  // Screen share instruction modal
  modalBackdrop: {
    position: 'absolute', inset: 0, background: 'rgba(10,10,24,0.88)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200,
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
  modalTitle: {
    fontSize: 22, fontWeight: 800, color: '#ddd6fe', letterSpacing: 0.5,
  },
  modalBody: {
    fontSize: 14, color: '#888', lineHeight: 1.6,
  },
  modalSteps: {
    display: 'flex', flexDirection: 'column', gap: 10, width: '100%', textAlign: 'left',
  },
  step: {
    display: 'flex', alignItems: 'center', gap: 12,
    fontSize: 13, color: '#c4b5fd',
  },
  stepNum: {
    minWidth: 26, height: 26,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: '#4c1d95', borderRadius: '50%',
    fontSize: 12, fontWeight: 700, color: '#fff', flexShrink: 0,
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
  modalNote: {
    fontSize: 11, color: '#444', marginTop: -4,
  },
  pipBadge: {
    position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
    padding: '8px 18px', background: 'rgba(16,16,42,0.92)', border: '1px solid #4c1d95',
    borderRadius: 12, color: '#a78bfa', fontSize: 13, fontWeight: 600,
    backdropFilter: 'blur(6px)', zIndex: 50, whiteSpace: 'nowrap',
  },
  pipBtn: {
    position: 'absolute', bottom: 16, right: 16,
    padding: '8px 16px', background: 'rgba(16,16,42,0.92)', border: '1px solid #3b3b5c',
    borderRadius: 10, color: '#a78bfa', fontSize: 12, fontWeight: 600,
    cursor: 'pointer', zIndex: 50, backdropFilter: 'blur(6px)',
  },
  startOverlay: {
    position: 'absolute', inset: 0, background: 'rgba(10,10,24,0.80)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 150,
    backdropFilter: 'blur(3px)',
  },
  startCard: {
    background: '#16162a', border: '1px solid #4c1d95', borderRadius: 20,
    padding: '36px 44px', maxWidth: 420, width: '90%',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
    boxShadow: '0 0 60px rgba(124,58,237,0.25)', textAlign: 'center',
  },
  startBtn: {
    padding: '12px 32px', background: '#22c55e', color: '#fff', border: 'none',
    borderRadius: 12, fontSize: 16, fontWeight: 800, cursor: 'pointer',
    letterSpacing: 0.5, boxShadow: '0 4px 0 #15803d', marginTop: 4,
  },
};
