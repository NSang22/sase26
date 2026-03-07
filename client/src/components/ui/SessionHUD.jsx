import { useEffect, useState } from 'react';
import { useGameStore } from '../../store/gameStore.js';
import { socket } from '../../lib/socket.js';

const s = {
  hud: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    padding: '16px 24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 20,
    pointerEvents: 'none',
    background: 'linear-gradient(to bottom, rgba(10,10,24,0.85) 0%, transparent 100%)',
  },
  playerCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    pointerEvents: 'none',
  },
  name: { fontSize: 13, color: '#888', fontWeight: 600 },
  score: { fontSize: 22, fontWeight: 900, color: '#ddd6fe' },
  focusBadge: (focused) => ({
    display: 'inline-block',
    padding: '2px 10px',
    borderRadius: 20,
    background: focused ? '#4c1d95' : '#1e1e1e',
    color: focused ? '#ddd6fe' : '#555',
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 1,
    textTransform: 'uppercase',
  }),
  center: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
    pointerEvents: 'none',
  },
  timer: { fontSize: 28, fontWeight: 900, color: '#a78bfa', letterSpacing: 2, fontFamily: 'monospace' },
  mode: { fontSize: 11, color: '#6366f1', fontWeight: 700, letterSpacing: 1 },
  stake: { fontSize: 13, color: '#facc15', fontWeight: 700 },
  endBtn: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    padding: '10px 22px',
    background: 'transparent',
    border: '1px solid #3a3a5a',
    borderRadius: 8,
    color: '#555',
    fontSize: 13,
    cursor: 'pointer',
    zIndex: 20,
    pointerEvents: 'all',
  },
};

function useElapsed(startTime) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!startTime) return;
    const id = setInterval(() => setElapsed(Date.now() - startTime), 1000);
    return () => clearInterval(id);
  }, [startTime]);
  return elapsed;
}

function formatTime(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export function SessionHUD({ myFocused, partnerFocused }) {
  const { scores, room, sessionStartTime, mySocketId } = useGameStore();
  const elapsed = useElapsed(sessionStartTime);

  const players = room?.players ?? [];
  const me = players.find((p) => p.socketId === mySocketId);
  const partner = players.find((p) => p.socketId !== mySocketId);

  const myScore = scores[mySocketId]?.score ?? 0;
  const partnerScore = partner ? (scores[partner.socketId]?.score ?? 0) : 0;

  const stakeSOL = room?.mode === 'locked-in' ? (room.stakeAmount / 1e9).toFixed(2) : null;

  function handleEnd() {
    if (room?.code) socket.emit('end_session', { roomCode: room.code });
  }

  return (
    <>
      <div style={s.hud}>
        {/* My stats */}
        <div style={s.playerCard}>
          <span style={s.name}>{me?.username ?? 'You'}</span>
          <span style={s.score}>{myScore} pts</span>
          <span style={s.focusBadge(myFocused)}>{myFocused ? 'Locked In' : 'Distracted'}</span>
        </div>

        {/* Center timer + stake */}
        <div style={s.center}>
          <span style={s.timer}>{formatTime(elapsed)}</span>
          <span style={s.mode}>{room?.mode === 'locked-in' ? 'Locked In Mode' : 'Casual Mode'}</span>
          {stakeSOL && <span style={s.stake}>{stakeSOL} SOL on the line</span>}
        </div>

        {/* Partner stats */}
        <div style={{ ...s.playerCard, alignItems: 'flex-end' }}>
          <span style={s.name}>{partner?.username ?? 'Partner'}</span>
          <span style={s.score}>{partnerScore} pts</span>
          <span style={s.focusBadge(partnerFocused)}>{partnerFocused ? 'Locked In' : 'Distracted'}</span>
        </div>
      </div>

      <button style={s.endBtn} onClick={handleEnd}>
        End Session
      </button>
    </>
  );
}
