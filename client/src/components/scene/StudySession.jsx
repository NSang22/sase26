import { Suspense, useCallback } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { StudyRoom } from './StudyRoom.jsx';
import { PetPlaceholder } from './Pet.jsx';
import { FocusRing } from './FocusRing.jsx';
import { SessionHUD } from '../ui/SessionHUD.jsx';
import { QuizOverlay } from '../ui/QuizOverlay.jsx';
import { useGameStore } from '../../store/gameStore.js';
import { useFocusTracker } from '../../hooks/useFocusTracker.js';
import { socket } from '../../lib/socket.js';

/**
 * Main session view: 3D canvas + 2D overlays (HUD, quiz).
 * Mounts webcam focus tracking and syncs focus events to server.
 */
export function StudySession() {
  const { room, mySocketId, focusStates, currentQuestion } = useGameStore();

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

  // Determine positions for the two pets on either side of the desk
  const players = room?.players ?? [];
  const myPlayer = players.find((p) => p.socketId === mySocketId);
  const partner = players.find((p) => p.socketId !== mySocketId);

  const myFocused = focusStates[mySocketId] ?? true;
  const partnerFocused = partner ? (focusStates[partner.socketId] ?? true) : true;

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      {/* Hidden webcam video element for MediaPipe */}
      <video
        ref={videoRef}
        style={{ display: 'none' }}
        playsInline
        muted
      />

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
          <StudyRoom />

          {/* My pet — left side of desk */}
          <PetPlaceholder focused={myFocused} position={[-1.2, 0.55, -1]} label="You" />
          <FocusRing focused={myFocused} position={[-1.2, 0.54, -1]} />

          {/* Partner's pet — right side of desk */}
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

      {/* 2D overlays */}
      <SessionHUD myFocused={myFocused} partnerFocused={partnerFocused} />
      {currentQuestion && <QuizOverlay question={currentQuestion} />}
    </div>
  );
}

const overlayStyles = {
  calibrating: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
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
};
