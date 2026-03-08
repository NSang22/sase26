import { useState } from 'react';
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
  reportBox: {
    background: '#12122a',
    border: '1px solid #2a2a4a',
    borderRadius: 16,
    padding: '20px 28px',
    maxWidth: 560,
    width: '100%',
  },
  reportRow: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  topicTag: {
    padding: '3px 10px',
    background: '#1e1e3a',
    border: '1px solid #7c3aed',
    borderRadius: 12,
    color: '#c4b5fd',
    fontSize: 12,
    fontWeight: 600,
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
  const [conceptAnswers, setConceptAnswers] = useState({});
  const [showConceptResults, setShowConceptResults] = useState(false);

  if (!summary) return null;

  const { players, winner, mode, stakeAmount, duration: dur, studyReport, conceptQuiz } = summary;
  const stakeSOL = mode === 'locked-in' ? (stakeAmount / 1e9).toFixed(2) : null;

  const handleConceptAnswer = (qIdx, optIdx) => {
    if (showConceptResults) return;
    setConceptAnswers((prev) => ({ ...prev, [qIdx]: optIdx }));
  };

  const conceptScore = conceptQuiz?.length
    ? Object.entries(conceptAnswers).filter(([i, a]) => a === conceptQuiz[i]?.correctIndex).length
    : 0;

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

      {/* Study Report */}
      {studyReport && (
        <div style={s.reportBox}>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#a78bfa', marginBottom: 12 }}>📊 Study Report</div>
          {studyReport.productive_minutes != null && (
            <div style={s.reportRow}>
              <span style={s.statLabel}>Productive time</span>
              <span style={s.statValue}>{studyReport.productive_minutes} min</span>
            </div>
          )}
          {studyReport.main_topics?.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <span style={s.statLabel}>Topics studied</span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                {studyReport.main_topics.map((t, i) => (
                  <span key={i} style={s.topicTag}>{t}</span>
                ))}
              </div>
            </div>
          )}
          {studyReport.distraction_patterns?.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <span style={{ ...s.statLabel, color: '#ef4444' }}>Distractions</span>
              <ul style={{ margin: '4px 0 0 16px', padding: 0, color: '#fca5a5', fontSize: 13 }}>
                {studyReport.distraction_patterns.map((d, i) => <li key={i}>{d}</li>)}
              </ul>
            </div>
          )}
          {studyReport.recommendations?.length > 0 && (
            <div>
              <span style={{ ...s.statLabel, color: '#4ade80' }}>Recommendations</span>
              <ul style={{ margin: '4px 0 0 16px', padding: 0, color: '#86efac', fontSize: 13 }}>
                {studyReport.recommendations.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Concept Quiz */}
      {conceptQuiz?.length > 0 && (
        <div style={s.reportBox}>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#a78bfa', marginBottom: 12 }}>
            🧠 Concept Quiz {showConceptResults && <span style={{ fontSize: 14, color: '#4ade80' }}>— {conceptScore}/{conceptQuiz.length}</span>}
          </div>
          {conceptQuiz.map((q, qi) => (
            <div key={qi} style={{ marginBottom: 16 }}>
              <div style={{ color: '#e8e8f0', fontSize: 14, fontWeight: 600, marginBottom: 6 }}>{qi + 1}. {q.question}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {q.options.map((opt, oi) => {
                  const selected = conceptAnswers[qi] === oi;
                  const isCorrect = q.correctIndex === oi;
                  let bg = selected ? '#2a2a5a' : '#16162a';
                  let border = selected ? '#7c3aed' : '#2a2a4a';
                  if (showConceptResults && isCorrect) { bg = '#0d3320'; border = '#22c55e'; }
                  else if (showConceptResults && selected && !isCorrect) { bg = '#3b1010'; border = '#ef4444'; }
                  return (
                    <button
                      key={oi}
                      onClick={() => handleConceptAnswer(qi, oi)}
                      style={{
                        background: bg, border: `1px solid ${border}`, borderRadius: 8,
                        padding: '8px 12px', color: '#ddd6fe', fontSize: 13, cursor: showConceptResults ? 'default' : 'pointer',
                        textAlign: 'left',
                      }}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {!showConceptResults && Object.keys(conceptAnswers).length === conceptQuiz.length && (
            <button style={s.btn} onClick={() => setShowConceptResults(true)}>Submit Quiz</button>
          )}
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
