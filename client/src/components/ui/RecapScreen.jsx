import { useState } from 'react';
import { useGameStore } from '../../store/gameStore.js';

// ── Style helpers ─────────────────────────────────────────────────────────────

const s = {
  root: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #0a0a18 0%, #12122a 100%)',
    padding: '32px 24px 64px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 32,
    overflowY: 'auto',
  },
  title: { fontSize: 30, fontWeight: 900, color: '#a78bfa', letterSpacing: 2 },
  subtitle: { color: '#555', fontSize: 14 },
  winnerBanner: {
    padding: '14px 40px',
    background: 'linear-gradient(90deg, #4c1d95, #7c3aed)',
    borderRadius: 16,
    fontSize: 18,
    fontWeight: 800,
    color: '#fff',
    letterSpacing: 1,
  },
  tieBanner: {
    padding: '14px 40px',
    background: '#1e1e3a',
    borderRadius: 16,
    fontSize: 16,
    color: '#888',
  },
  escrowBox: {
    background: '#0d2318',
    border: '1px solid #22c55e',
    borderRadius: 12,
    padding: '14px 24px',
    textAlign: 'center',
    color: '#4ade80',
    fontWeight: 700,
    fontSize: 15,
    maxWidth: 480,
  },
  // Player cards row
  cardsRow: { display: 'flex', gap: 20, flexWrap: 'wrap', justifyContent: 'center' },
  card: (isWinner) => ({
    background: isWinner ? '#1a0f3a' : '#16162a',
    border: `1px solid ${isWinner ? '#7c3aed' : '#2a2a4a'}`,
    borderRadius: 16,
    padding: '24px 28px',
    minWidth: 220,
    maxWidth: 260,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    boxShadow: isWinner ? '0 0 30px #7c3aed55' : 'none',
  }),
  playerName: { fontSize: 17, fontWeight: 700, color: '#ddd6fe' },
  bigScore: { fontSize: 36, fontWeight: 900, color: '#a78bfa', textAlign: 'center', lineHeight: 1 },
  bigScoreLabel: { fontSize: 11, color: '#666', textAlign: 'center' },
  row: { display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' },
  rowLabel: { color: '#666', fontSize: 13 },
  rowValue: { color: '#e8e8f0', fontWeight: 700, fontSize: 13 },
  xpBadge: {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    padding: '3px 10px',
    background: 'rgba(250,204,21,0.15)',
    border: '1px solid #ca8a04',
    borderRadius: 20,
    color: '#fde047',
    fontSize: 12, fontWeight: 700,
  },
  divider: { borderColor: '#1e1e3a', margin: '4px 0' },
  // Score bar
  barWrap: { display: 'flex', flexDirection: 'column', gap: 4 },
  barLabel: { display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#888' },
  barTrack: { height: 6, background: '#1e1e3a', borderRadius: 3, overflow: 'hidden' },
  barFill: (pct, color) => ({
    height: '100%',
    width: `${Math.round(pct * 100)}%`,
    background: color,
    borderRadius: 3,
    transition: 'width 0.6s ease',
  }),
  // Player detail section (below the cards)
  section: {
    width: '100%',
    maxWidth: 720,
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
  },
  sectionHead: {
    fontSize: 18, fontWeight: 800, color: '#a78bfa', marginBottom: 4,
  },
  box: {
    background: '#12122a',
    border: '1px solid #2a2a4a',
    borderRadius: 14,
    padding: '20px 24px',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  // Tab bar for player selector
  tabBar: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  tab: (active) => ({
    padding: '7px 18px',
    background: active ? '#4c1d95' : '#16162a',
    border: `1px solid ${active ? '#7c3aed' : '#2a2a4a'}`,
    borderRadius: 20,
    color: active ? '#ddd6fe' : '#555',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  }),
  // Topic tag
  tag: {
    padding: '3px 10px',
    background: '#1e1e3a',
    border: '1px solid #7c3aed',
    borderRadius: 12,
    color: '#c4b5fd',
    fontSize: 12,
    fontWeight: 600,
  },
  // Concept quiz
  quizQ: { color: '#e8e8f0', fontSize: 14, fontWeight: 600, marginBottom: 6 },
  quizOpt: (state) => ({
    padding: '9px 14px',
    background: state === 'correct' ? '#14532d' : state === 'wrong' ? '#450a0a' : state === 'selected' ? '#2d1b69' : '#0d0d1f',
    border: `1px solid ${state === 'correct' ? '#22c55e' : state === 'wrong' ? '#ef4444' : state === 'selected' ? '#7c3aed' : '#2a2a4a'}`,
    borderRadius: 8,
    color: '#e8e8f0',
    fontSize: 13,
    cursor: state ? 'default' : 'pointer',
    textAlign: 'left',
    width: '100%',
    marginBottom: 4,
    transition: 'background 0.15s',
  }),
  btn: {
    padding: '12px 32px',
    background: '#7c3aed',
    color: '#fff',
    border: 'none',
    borderRadius: 10,
    fontSize: 15,
    fontWeight: 700,
    cursor: 'pointer',
  },
  distLabel: { fontSize: 12, color: '#ef4444', fontWeight: 600 },
  distVal: { fontSize: 12, color: '#fca5a5' },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function pct(v) { return `${((v ?? 0) * 100).toFixed(1)}%`; }

function fmtDuration(ms) {
  const min = Math.floor(ms / 60000);
  const sec = Math.floor((ms % 60000) / 1000);
  return `${min}m ${sec}s`;
}

const SCORE_BARS = [
  { key: 'focusPercent',     label: 'Focus',         color: '#7c3aed', weight: '50%' },
  { key: 'quizAccuracy',     label: 'Quiz Accuracy',  color: '#3b82f6', weight: '20%' },
  { key: 'responseTimeScore',label: 'Response Speed', color: '#10b981', weight: '15%' },
  { key: 'consistencyScore', label: 'Consistency',    color: '#f59e0b', weight: '15%' },
];

// ── Sub-components ────────────────────────────────────────────────────────────

function ScoreBars({ player }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {SCORE_BARS.map(({ key, label, color, weight }) => (
        <div key={key} style={s.barWrap}>
          <div style={s.barLabel}>
            <span>{label} <span style={{ color: '#444' }}>({weight})</span></span>
            <span style={{ color }}>{pct(player[key])}</span>
          </div>
          <div style={s.barTrack}>
            <div style={s.barFill(player[key] ?? 0, color)} />
          </div>
        </div>
      ))}
    </div>
  );
}

function StudyReportPanel({ report }) {
  if (!report) return (
    <p style={{ color: '#444', fontSize: 13 }}>No screen data collected this session.</p>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        <div>
          <div style={s.rowLabel}>Productive time</div>
          <div style={{ ...s.rowValue, fontSize: 20, color: '#a78bfa' }}>
            {report.total_productive_minutes ?? 0} min
          </div>
        </div>
        <div>
          <div style={s.rowLabel}>Distractions</div>
          <div style={{ ...s.rowValue, fontSize: 20, color: '#ef4444' }}>
            {report.distraction_count ?? 0}×
          </div>
        </div>
      </div>

      {report.subjects_covered?.length > 0 && (
        <div>
          <div style={{ ...s.rowLabel, marginBottom: 6 }}>Subjects studied</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {report.subjects_covered.map((t, i) => <span key={i} style={s.tag}>{t}</span>)}
          </div>
        </div>
      )}

      {report.distraction_types?.length > 0 && (
        <div>
          <div style={{ ...s.distLabel, marginBottom: 4 }}>Distraction types</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {report.distraction_types.map((d, i) => (
              <span key={i} style={{ ...s.tag, borderColor: '#ef4444', color: '#fca5a5' }}>{d}</span>
            ))}
          </div>
        </div>
      )}

      {report.top_3_concepts_to_review?.length > 0 && (
        <div>
          <div style={{ ...s.rowLabel, marginBottom: 4 }}>Review these concepts</div>
          <ol style={{ margin: 0, paddingLeft: 20, color: '#fbbf24', fontSize: 13, lineHeight: 1.7 }}>
            {report.top_3_concepts_to_review.map((c, i) => <li key={i}>{c}</li>)}
          </ol>
        </div>
      )}

      {report.personalized_recommendation && (
        <div style={{
          padding: '12px 16px',
          background: 'rgba(124,58,237,0.1)',
          border: '1px solid #4c1d95',
          borderRadius: 10,
          color: '#ddd6fe',
          fontSize: 13,
          lineHeight: 1.6,
        }}>
          <span style={{ fontWeight: 700, color: '#a78bfa' }}>Gemini says: </span>
          {report.personalized_recommendation}
        </div>
      )}
    </div>
  );
}

function ConceptQuizPanel({ questions }) {
  const [answers, setAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);

  if (!questions?.length) return (
    <p style={{ color: '#444', fontSize: 13 }}>No concept quiz generated (no screen data).</p>
  );

  const score = submitted
    ? Object.entries(answers).filter(([i, a]) => Number(a) === questions[i]?.correctAnswerIndex).length
    : 0;

  const allAnswered = Object.keys(answers).length === questions.length;

  function pick(qIdx, optIdx) {
    if (submitted) return;
    setAnswers((prev) => ({ ...prev, [qIdx]: optIdx }));
  }

  function optState(qIdx, optIdx) {
    if (!submitted) return answers[qIdx] === optIdx ? 'selected' : null;
    if (optIdx === questions[qIdx]?.correctAnswerIndex) return 'correct';
    if (answers[qIdx] === optIdx) return 'wrong';
    return null;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {submitted && (
        <div style={{ textAlign: 'center', fontWeight: 700, fontSize: 16,
          color: score >= 4 ? '#4ade80' : score >= 2 ? '#fbbf24' : '#f87171' }}>
          {score}/{questions.length} correct
          {score === questions.length && ' — Perfect! 🎉'}
        </div>
      )}
      {questions.map((q, qi) => (
        <div key={qi}>
          <div style={s.quizQ}>{qi + 1}. {q.question}</div>
          {q.options.map((opt, oi) => (
            <button
              key={oi}
              style={s.quizOpt(optState(qi, oi))}
              onClick={() => pick(qi, oi)}
              disabled={submitted}
            >
              <strong>{['A','B','C','D'][oi]}.</strong> {opt}
            </button>
          ))}
          {submitted && q.explanation && (
            <div style={{ fontSize: 12, color: '#86efac', marginTop: 4, paddingLeft: 4 }}>
              {q.explanation}
            </div>
          )}
        </div>
      ))}
      {!submitted && (
        <button
          style={{ ...s.btn, opacity: allAnswered ? 1 : 0.4, cursor: allAnswered ? 'pointer' : 'not-allowed' }}
          disabled={!allAnswered}
          onClick={() => setSubmitted(true)}
        >
          Submit
        </button>
      )}
    </div>
  );
}

// ── Main recap screen ─────────────────────────────────────────────────────────

export function RecapScreen() {
  const { summary, setPhase } = useGameStore();
  const [activeTab, setActiveTab] = useState(0);

  if (!summary) return null;

  const { players, winner, mode, stakeAmount, duration: dur } = summary;
  const stakeSOL = mode === 'locked-in' ? (stakeAmount / 1e9).toFixed(2) : null;
  const activePlayer = players[activeTab] ?? players[0];

  return (
    <div style={s.root}>
      <div style={s.title}>Session Complete</div>
      <div style={s.subtitle}>Duration: {fmtDuration(dur)}</div>

      {winner ? (
        <div style={s.winnerBanner}>{winner.username} wins! 🏆</div>
      ) : (
        <div style={s.tieBanner}>It's a tie — well played</div>
      )}

      {stakeSOL && (
        <div style={s.escrowBox}>
          {winner
            ? `${winner.username} receives ${(parseFloat(stakeSOL) * players.length).toFixed(3)} SOL`
            : `${stakeSOL} SOL returned to each player`}
        </div>
      )}

      {/* ── Player score cards ── */}
      <div style={s.cardsRow}>
        {players.map((p) => {
          const isWinner = winner?.socketId === p.socketId;
          return (
            <div key={p.socketId} style={s.card(isWinner)}>
              <div style={s.playerName}>{p.username}{isWinner ? ' 🏆' : ''}</div>
              <div style={s.bigScore}>{(p.sessionScore * 100).toFixed(1)}</div>
              <div style={s.bigScoreLabel}>composite score</div>

              <hr style={s.divider} />
              <ScoreBars player={p} />
              <hr style={s.divider} />

              <div style={s.row}>
                <span style={s.rowLabel}>Quiz</span>
                <span style={s.rowValue}>{p.quizCorrectCount}/{p.questionsTotal ?? p.quizCorrectCount} correct</span>
              </div>
              <div style={s.row}>
                <span style={s.rowLabel}>Screen study</span>
                <span style={s.rowValue}>{pct(p.screenStudyPercent ?? 0)}</span>
              </div>
              {p.xpGained != null && (
                <div style={{ display: 'flex', justifyContent: 'center', marginTop: 4 }}>
                  <span style={s.xpBadge}>+{p.xpGained} XP{p.newLevel ? ` · Level ${p.newLevel}!` : ''}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Per-player detail panels ── */}
      <div style={s.section}>
        <div style={s.sectionHead}>Detailed Reports</div>

        {/* Tab selector */}
        <div style={s.tabBar}>
          {players.map((p, i) => (
            <button key={p.socketId} style={s.tab(activeTab === i)} onClick={() => setActiveTab(i)}>
              {p.username}
            </button>
          ))}
        </div>

        {activePlayer && (
          <>
            {/* Score breakdown */}
            <div style={s.box}>
              <div style={{ fontWeight: 700, color: '#a78bfa', marginBottom: 4 }}>Score Breakdown</div>
              <ScoreBars player={activePlayer} />
              <div style={{ ...s.row, marginTop: 4, paddingTop: 8, borderTop: '1px solid #1e1e3a' }}>
                <span style={s.rowLabel}>Composite</span>
                <span style={{ ...s.rowValue, color: '#a78bfa', fontSize: 18 }}>
                  {(activePlayer.sessionScore * 100).toFixed(1)}
                </span>
              </div>
            </div>

            {/* Study report */}
            <div style={s.box}>
              <div style={{ fontWeight: 700, color: '#a78bfa', marginBottom: 4 }}>📊 Study Report</div>
              <StudyReportPanel report={activePlayer.studyReport} />
            </div>

            {/* Concept quiz */}
            <div style={s.box}>
              <div style={{ fontWeight: 700, color: '#a78bfa', marginBottom: 4 }}>🧠 Comprehension Quiz</div>
              <ConceptQuizPanel key={activePlayer.socketId} questions={activePlayer.conceptQuiz} />
            </div>
          </>
        )}
      </div>

      {/* ── Bottom actions ── */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
        <button style={s.btn} onClick={() => setPhase('login')}>Play Again</button>
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
