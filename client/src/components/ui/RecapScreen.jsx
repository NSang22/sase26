import { useGameStore } from '../../store/gameStore.js';

const s = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    gap: 24,
    background: 'linear-gradient(135deg, #0a0a18 0%, #12122a 100%)',
    padding: 24,
  },
  title: { fontSize: 32, fontWeight: 900, color: '#a78bfa', letterSpacing: 2 },
  winnerBanner: {
    padding: '16px 40px',
    background: 'linear-gradient(90deg, #4c1d95, #7c3aed)',
    borderRadius: 16,
    fontSize: 20,
    fontWeight: 800,
    color: '#fff',
    letterSpacing: 1,
  },
  tieBanner: {
    padding: '16px 40px',
    background: '#1e1e3a',
    borderRadius: 16,
    fontSize: 18,
    color: '#888',
  },
  cards: { display: 'flex', gap: 20, flexWrap: 'wrap', justifyContent: 'center' },
  card: (isWinner) => ({
    background: isWinner ? '#1a0f3a' : '#16162a',
    border: `1px solid ${isWinner ? '#7c3aed' : '#2a2a4a'}`,
    borderRadius: 16,
    padding: '28px 32px',
    minWidth: 240,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    boxShadow: isWinner ? '0 0 30px #7c3aed55' : 'none',
  }),
  playerName: { fontSize: 18, fontWeight: 700, color: '#ddd6fe' },
  stat: { display: 'flex', justifyContent: 'space-between', gap: 24 },
  statLabel: { color: '#666', fontSize: 14 },
  statValue: { color: '#e8e8f0', fontWeight: 700, fontSize: 14 },
  sessionScore: { fontSize: 28, fontWeight: 900, color: '#a78bfa', textAlign: 'center' },
  escrowBox: {
    background: '#0d2318',
    border: '1px solid #22c55e',
    borderRadius: 12,
    padding: '16px 24px',
    textAlign: 'center',
    color: '#4ade80',
    fontWeight: 700,
    fontSize: 16,
    maxWidth: 480,
  },
  btn: {
    padding: '14px 40px',
    background: '#7c3aed',
    color: '#fff',
    border: 'none',
    borderRadius: 10,
    fontSize: 16,
    fontWeight: 700,
    cursor: 'pointer',
    letterSpacing: 1,
  },
};

function pct(v) {
  return `${(v * 100).toFixed(1)}%`;
}

function duration(ms) {
  const min = Math.floor(ms / 60000);
  const sec = Math.floor((ms % 60000) / 1000);
  return `${min}m ${sec}s`;
}

export function RecapScreen() {
  const { summary, setPhase } = useGameStore();

  if (!summary) return null;

  const { players, winner, mode, stakeAmount, duration: dur } = summary;
  const stakeSOL = mode === 'locked-in' ? (stakeAmount / 1e9).toFixed(2) : null;

  return (
    <div style={s.root}>
      <div style={s.title}>Session Complete</div>
      <div style={{ color: '#666', fontSize: 14 }}>Duration: {duration(dur)}</div>

      {winner ? (
        <div style={s.winnerBanner}>{winner.username} wins!</div>
      ) : (
        <div style={s.tieBanner}>It's a tie — funds returned</div>
      )}

      <div style={s.cards}>
        {players.map((p) => {
          const isWinner = winner?.socketId === p.socketId;
          return (
            <div key={p.socketId} style={s.card(isWinner)}>
              <div style={s.playerName}>{p.username} {isWinner ? '🏆' : ''}</div>
              <div style={s.sessionScore}>{(p.sessionScore * 100).toFixed(1)}</div>
              <div style={{ color: '#888', fontSize: 12, textAlign: 'center' }}>session score</div>

              <div style={s.stat}>
                <span style={s.statLabel}>Focus</span>
                <span style={s.statValue}>{pct(p.focusPercent)}</span>
              </div>
              <div style={s.stat}>
                <span style={s.statLabel}>Quiz accuracy</span>
                <span style={s.statValue}>{pct(p.quizAccuracy)}</span>
              </div>
              <div style={s.stat}>
                <span style={s.statLabel}>Quiz points</span>
                <span style={s.statValue}>{p.totalQuizPoints}</span>
              </div>
            </div>
          );
        })}
      </div>

      {stakeSOL && (
        <div style={s.escrowBox}>
          {winner
            ? `${winner.username} receives ${(parseFloat(stakeSOL) * 2).toFixed(2)} SOL`
            : `${stakeSOL} SOL returned to each player`}
        </div>
      )}

      <div style={{ display: 'flex', gap: 12 }}>
        <button style={s.btn} onClick={() => setPhase('login')}>
          Play Again
        </button>
        <button
          style={{ ...s.btn, background: 'transparent', border: '1px solid #7c3aed', color: '#a78bfa' }}
          onClick={() => window.open('/leaderboard', '_blank')}
        >
          Leaderboard
        </button>
      </div>
    </div>
  );
}
