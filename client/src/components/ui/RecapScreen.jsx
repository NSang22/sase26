import { useState, useRef, useEffect } from 'react';
import { useGameStore } from '../../store/gameStore.js';
import {
  POKEMON_SPRITES,
  fillRect,
  drawPixelPokemon,
  drawParticle,
  drawStar,
  drawGround,
} from '../../lib/pixelArt.js';

// ── Style helpers ─────────────────────────────────────────────────────────────

const FONT = "'Press Start 2P', monospace";

const s = {
  root: {
    height: '100vh',
    backgroundColor: '#0A0A2E',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
    padding: '32px 24px 64px',
    boxSizing: 'border-box',
  },
  canvas: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    zIndex: 0,
    imageRendering: 'pixelated',
  },
  mainCard: {
    position: 'relative',
    zIndex: 10,
    background: 'rgba(10,10,46,0.85)',
    border: '2px solid rgba(248,208,48,0.2)',
    borderRadius: 12,
    boxShadow: '0 0 40px rgba(0,0,0,0.5)',
    backdropFilter: 'blur(8px)',
    maxWidth: 700,
    width: '100%',
    maxHeight: '90vh',
    overflowY: 'auto',
    padding: '24px 32px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 20,
    boxSizing: 'border-box',
  },
  title: {
    fontFamily: FONT,
    fontSize: 16,
    color: '#F8D030',
    textShadow: '0 0 20px rgba(248,208,48,0.5), 0 2px 0 #B8860B',
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: FONT,
    color: '#8888BB',
    fontSize: 7,
    textAlign: 'center',
  },
  winnerBanner: {
    fontFamily: FONT,
    padding: '14px 32px',
    background: 'rgba(248,208,48,0.08)',
    border: '2px solid rgba(248,208,48,0.5)',
    borderRadius: 8,
    fontSize: 10,
    color: '#F8D030',
    textAlign: 'center',
    boxShadow: '0 4px 0 rgba(184,134,11,0.5), 0 0 20px rgba(248,208,48,0.15)',
    textShadow: '0 0 10px rgba(248,208,48,0.5)',
    letterSpacing: 1,
  },
  tieBanner: {
    fontFamily: FONT,
    padding: '14px 32px',
    background: 'rgba(0,0,0,0.3)',
    border: '2px solid rgba(136,136,187,0.3)',
    borderRadius: 8,
    fontSize: 9,
    color: '#8888BB',
    textAlign: 'center',
  },
  // SOL Pot box
  potBox: {
    background: 'rgba(0,0,0,0.4)',
    border: '2px solid rgba(104,184,104,0.5)',
    borderRadius: 8,
    padding: '16px 20px',
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    boxShadow: '0 0 20px rgba(104,184,104,0.1)',
    boxSizing: 'border-box',
  },
  potTitle: {
    fontFamily: FONT,
    fontSize: 10,
    color: '#68B868',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    textShadow: '0 0 8px rgba(104,184,104,0.5)',
    flexWrap: 'wrap',
  },
  simBadge: {
    fontFamily: FONT,
    fontSize: 6,
    color: '#F8D030',
    background: 'rgba(248,208,48,0.08)',
    border: '1px solid rgba(248,208,48,0.4)',
    borderRadius: 4,
    padding: '2px 6px',
  },
  txLink: {
    fontFamily: FONT,
    fontSize: 7,
    color: '#58A8E8',
    textDecoration: 'none',
    marginLeft: 'auto',
  },
  payoutRows: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  payoutRow: (isWin) => ({
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 12px',
    background: isWin ? 'rgba(104,184,104,0.08)' : 'rgba(0,0,0,0.2)',
    border: `1px solid ${isWin ? 'rgba(104,184,104,0.4)' : 'rgba(136,136,187,0.12)'}`,
    borderRadius: 6,
  }),
  potVerdict: {
    fontFamily: FONT,
    textAlign: 'center',
    fontSize: 7,
    color: '#8888BB',
    paddingTop: 8,
    borderTop: '1px solid rgba(136,136,187,0.15)',
    lineHeight: 1.8,
  },
  // Player cards
  cardsRow: { display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center', width: '100%' },
  card: (isWinner) => ({
    background: isWinner ? 'rgba(248,208,48,0.05)' : 'rgba(0,0,0,0.3)',
    border: `2px solid ${isWinner ? 'rgba(248,208,48,0.6)' : 'rgba(136,136,187,0.2)'}`,
    borderRadius: 8,
    padding: '20px 20px',
    minWidth: 190,
    maxWidth: 230,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    boxShadow: isWinner ? '0 0 30px rgba(248,208,48,0.2)' : 'none',
    position: 'relative',
  }),
  winnerBadge: {
    fontFamily: FONT,
    fontSize: 6,
    color: '#0A0A2E',
    background: '#F8D030',
    padding: '3px 8px',
    borderRadius: 4,
    position: 'absolute',
    top: -11,
    left: '50%',
    transform: 'translateX(-50%)',
    whiteSpace: 'nowrap',
    boxShadow: '0 2px 0 #B8860B',
    letterSpacing: 1,
  },
  playerName: {
    fontFamily: FONT,
    fontSize: 9,
    color: '#FFFFFF',
  },
  bigScore: {
    fontFamily: FONT,
    fontSize: 28,
    color: '#F8D030',
    textAlign: 'center',
    lineHeight: 1,
    textShadow: '0 0 15px rgba(248,208,48,0.4)',
  },
  bigScoreLabel: {
    fontFamily: FONT,
    fontSize: 6,
    color: '#8888BB',
    textAlign: 'center',
  },
  row: { display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' },
  rowLabel: {
    fontFamily: FONT,
    color: '#8888BB',
    fontSize: 7,
  },
  rowValue: {
    fontFamily: FONT,
    color: '#FFFFFF',
    fontSize: 7,
  },
  xpBadge: {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    padding: '3px 10px',
    background: 'rgba(248,208,48,0.1)',
    border: '1px solid rgba(248,208,48,0.4)',
    borderRadius: 4,
    color: '#F8D030',
    fontFamily: FONT,
    fontSize: 6,
    boxShadow: '0 0 8px rgba(248,208,48,0.2)',
  },
  divider: { borderColor: 'rgba(136,136,187,0.2)', margin: '4px 0' },
  // Score bars
  barWrap: { display: 'flex', flexDirection: 'column', gap: 4 },
  barLabel: { display: 'flex', justifyContent: 'space-between', fontFamily: FONT, fontSize: 6, color: '#8888BB' },
  barTrack: { height: 6, background: 'rgba(0,0,0,0.4)', borderRadius: 2, overflow: 'hidden' },
  barFill: (pct, color) => ({
    height: '100%',
    width: `${Math.round(pct * 100)}%`,
    background: color,
    borderRadius: 2,
    transition: 'width 0.6s ease',
  }),
  // Section
  section: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  sectionHead: {
    fontFamily: FONT,
    fontSize: 10,
    color: '#F8D030',
    textShadow: '0 0 8px rgba(248,208,48,0.4)',
    marginBottom: 4,
  },
  box: {
    background: 'rgba(0,0,0,0.3)',
    border: '1px solid rgba(248,208,48,0.15)',
    borderRadius: 8,
    padding: '16px 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  boxHead: {
    fontFamily: FONT,
    fontSize: 8,
    color: '#F8D030',
    marginBottom: 4,
  },
  // Tab bar
  tabBar: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  tab: (active) => ({
    fontFamily: FONT,
    padding: '7px 14px',
    background: active ? 'rgba(248,208,48,0.12)' : 'rgba(0,0,0,0.3)',
    border: `1px solid ${active ? 'rgba(248,208,48,0.6)' : 'rgba(136,136,187,0.2)'}`,
    borderRadius: 4,
    color: active ? '#F8D030' : '#8888BB',
    fontSize: 7,
    cursor: 'pointer',
    boxShadow: active ? '0 0 8px rgba(248,208,48,0.2)' : 'none',
  }),
  // Tags/pills
  subjectTag: {
    fontFamily: FONT,
    padding: '4px 10px',
    background: 'rgba(104,184,104,0.15)',
    border: '1px solid #68B868',
    borderRadius: 4,
    color: '#68B868',
    fontSize: 6,
  },
  distractionTag: {
    fontFamily: FONT,
    padding: '4px 10px',
    background: 'rgba(232,80,80,0.15)',
    border: '1px solid #E85050',
    borderRadius: 4,
    color: '#E85050',
    fontSize: 6,
  },
  conceptsList: {
    margin: 0,
    paddingLeft: 20,
    fontFamily: FONT,
    color: '#F8D030',
    fontSize: 7,
    lineHeight: 2,
  },
  // Gemini box
  geminiBox: {
    padding: '12px 16px',
    background: 'rgba(0,0,0,0.3)',
    border: '1px solid rgba(248,208,48,0.3)',
    borderRadius: 8,
  },
  geminiLabel: {
    fontFamily: FONT,
    color: '#F8D030',
    fontSize: 7,
    display: 'block',
    marginBottom: 8,
  },
  geminiText: {
    fontFamily: FONT,
    color: '#CCCCDD',
    fontSize: 7,
    lineHeight: 1.8,
  },
  // Quiz
  quizQ: {
    fontFamily: FONT,
    color: '#CCCCDD',
    fontSize: 7,
    lineHeight: 1.8,
    marginBottom: 8,
  },
  quizOpt: (state) => ({
    fontFamily: FONT,
    padding: '9px 12px',
    background: state === 'correct' ? 'rgba(104,184,104,0.2)' : state === 'wrong' ? 'rgba(232,80,80,0.2)' : state === 'selected' ? 'rgba(248,208,48,0.1)' : 'rgba(0,0,0,0.3)',
    border: `1px solid ${state === 'correct' ? '#68B868' : state === 'wrong' ? '#E85050' : state === 'selected' ? 'rgba(248,208,48,0.5)' : 'rgba(136,136,187,0.2)'}`,
    borderRadius: 4,
    color: '#CCCCDD',
    fontSize: 7,
    lineHeight: 1.8,
    cursor: state ? 'default' : 'pointer',
    textAlign: 'left',
    width: '100%',
    marginBottom: 6,
    transition: 'background 0.15s',
  }),
  quizExplain: {
    fontFamily: FONT,
    fontSize: 6,
    color: '#68B868',
    marginTop: 4,
    paddingLeft: 4,
    lineHeight: 1.8,
  },
  quizScore: (score, total) => ({
    fontFamily: FONT,
    textAlign: 'center',
    fontSize: 10,
    color: score >= total ? '#68B868' : score >= Math.floor(total / 2) ? '#F8D030' : '#E85050',
    textShadow: '0 0 8px currentColor',
    marginBottom: 8,
  }),
  // Buttons
  btn: {
    fontFamily: FONT,
    padding: '12px 24px',
    background: '#F8D030',
    color: '#0A0A2E',
    border: 'none',
    borderRadius: 4,
    fontSize: 9,
    cursor: 'pointer',
    boxShadow: '0 4px 0 #B8860B, 0 0 12px rgba(248,208,48,0.3)',
    letterSpacing: 1,
  },
  btnSecondary: {
    fontFamily: FONT,
    padding: '12px 24px',
    background: 'rgba(0,0,0,0.4)',
    color: '#58A8E8',
    border: '2px solid rgba(88,168,232,0.5)',
    borderRadius: 4,
    fontSize: 9,
    cursor: 'pointer',
    boxShadow: '0 0 8px rgba(88,168,232,0.2)',
    letterSpacing: 1,
  },
  noData: {
    fontFamily: FONT,
    color: '#8888BB',
    fontSize: 7,
    lineHeight: 1.8,
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function pct(v) { return `${((v ?? 0) * 100).toFixed(1)}%`; }

function fmtDuration(ms) {
  const min = Math.floor(ms / 60000);
  const sec = Math.floor((ms % 60000) / 1000);
  return `${min}m ${sec}s`;
}

const SCORE_BARS = [
  { key: 'focusPercent',     label: 'Focus',         color: '#F8D030', weight: '50%' },
  { key: 'quizAccuracy',     label: 'Quiz Accuracy',  color: '#58A8E8', weight: '20%' },
  { key: 'responseTimeScore',label: 'Response Speed', color: '#68B868', weight: '15%' },
  { key: 'consistencyScore', label: 'Consistency',    color: '#E85050', weight: '15%' },
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
    <p style={s.noData}>No screen data collected this session.</p>
  );

  const productiveMin = Math.round((report.total_productive_minutes ?? 0) * 10) / 10;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
        <div>
          <div style={s.rowLabel}>Productive time</div>
          <div style={{ fontFamily: FONT, fontSize: 14, color: '#FFFFFF', marginTop: 4 }}>
            {productiveMin.toFixed(1)} min
          </div>
        </div>
        <div>
          <div style={s.rowLabel}>Distractions</div>
          <div style={{ fontFamily: FONT, fontSize: 14, color: '#E85050', marginTop: 4 }}>
            {report.distraction_count ?? 0}&times;
          </div>
        </div>
      </div>

      {report.subjects_covered?.length > 0 && (
        <div>
          <div style={{ ...s.rowLabel, marginBottom: 8 }}>Subjects studied</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {report.subjects_covered.map((t, i) => <span key={i} style={s.subjectTag}>{t}</span>)}
          </div>
        </div>
      )}

      {report.distraction_types?.length > 0 && (
        <div>
          <div style={{ fontFamily: FONT, fontSize: 7, color: '#E85050', marginBottom: 8 }}>Distraction types</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {report.distraction_types.map((d, i) => (
              <span key={i} style={s.distractionTag}>{d}</span>
            ))}
          </div>
        </div>
      )}

      {report.top_3_concepts_to_review?.length > 0 && (
        <div>
          <div style={{ ...s.rowLabel, marginBottom: 8 }}>Review these concepts</div>
          <ol style={s.conceptsList}>
            {report.top_3_concepts_to_review.map((c, i) => <li key={i}>{c}</li>)}
          </ol>
        </div>
      )}

      {report.personalized_recommendation && (
        <div style={s.geminiBox}>
          <span style={s.geminiLabel}>Gemini says:</span>
          <span style={s.geminiText}>{report.personalized_recommendation}</span>
        </div>
      )}
    </div>
  );
}

function ConceptQuizPanel({ questions }) {
  const [answers, setAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);

  if (!questions?.length) return (
    <p style={s.noData}>No concept quiz generated (no screen data).</p>
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
        <div style={s.quizScore(score, questions.length)}>
          {score}/{questions.length} correct
          {score === questions.length && ' — Perfect!'}
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
            <div style={s.quizExplain}>
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

  // Canvas background refs
  const canvasRef = useRef(null);
  const frameRef = useRef(0);
  const starsRef = useRef([]);
  const particlesRef = useRef([]);

  // Init stars and particles
  useEffect(() => {
    const stars = [];
    for (let i = 0; i < 120; i++) {
      stars.push({ x: Math.random() * 1200, y: Math.random() * 500, seed: Math.random() });
    }
    starsRef.current = stars;

    const particles = [];
    for (let i = 0; i < 20; i++) {
      particles.push({
        x: Math.random() * 1200,
        y: Math.random() * 600,
        vy: -0.3 - Math.random() * 0.5,
        size: 2 + Math.random() * 3,
        color: ['#F8D030', '#58A8E8', '#68B868', '#F08830', '#E85050'][Math.floor(Math.random() * 5)],
        alpha: 0.3 + Math.random() * 0.4,
        life: Math.random() * 200,
      });
    }
    particlesRef.current = particles;
  }, []);

  // Canvas animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animId;

    const pokemonPositions = [
      { type: 'pikachu',    x: 80  },
      { type: 'jigglypuff', x: 220 },
      { type: 'bulbasaur',  x: 800 },
      { type: 'squirtle',   x: 940 },
      { type: 'charmander', x: 520 },
    ];

    const render = () => {
      const frame = frameRef.current++;
      const w = canvas.width;
      const h = canvas.height;

      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#0A0A2E');
      grad.addColorStop(0.4, '#16163A');
      grad.addColorStop(0.7, '#1A2847');
      grad.addColorStop(1, '#1E3A20');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      starsRef.current.forEach((star) => {
        drawStar(ctx, star.x, star.y, frame, star.seed);
      });

      // Crescent moon (top right)
      ctx.fillStyle = '#FFFDE8';
      ctx.beginPath();
      ctx.arc(950, 80, 35, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0A0A2E';
      ctx.beginPath();
      ctx.arc(940, 75, 30, 0, Math.PI * 2);
      ctx.fill();

      particlesRef.current.forEach((p) => {
        p.y += p.vy;
        p.x += Math.sin(frame * 0.02 + p.life) * 0.3;
        p.life++;
        if (p.y < -10) {
          p.y = h + 10;
          p.x = Math.random() * w;
        }
        drawParticle(ctx, p.x, p.y, p.size, p.color, p.alpha * (Math.sin(p.life * 0.03) * 0.3 + 0.7));
      });

      drawGround(ctx, w, h, frame);

      // Pokemon sprites bouncing on the grass
      const groundY = h - 100;
      pokemonPositions.forEach((pkmn, i) => {
        const yPos = groundY - 52 + Math.sin(frame * 0.06 + i * 1.5) * 3;
        drawPixelPokemon(ctx, pkmn.x, yPos, pkmn.type, frame + i * 20, 3);
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.fillText(POKEMON_SPRITES[pkmn.type].name, pkmn.x + 24, yPos - 8);
      });

      // Pokeball decorations on ground
      const pokeballPositions = [
        { x: 400, y: groundY + 8 },
        { x: 650, y: groundY + 12 },
        { x: 150, y: groundY + 10 },
      ];
      pokeballPositions.forEach((pb) => {
        ctx.fillStyle = '#E85050';
        fillRect(ctx, pb.x, pb.y, 10, 5);
        ctx.fillStyle = '#F8F8F8';
        fillRect(ctx, pb.x, pb.y + 5, 10, 5);
        ctx.fillStyle = '#282828';
        fillRect(ctx, pb.x, pb.y + 4, 10, 2);
        ctx.fillStyle = '#F8F8F8';
        fillRect(ctx, pb.x + 4, pb.y + 3, 3, 3);
      });

      animId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animId);
  }, []);

  if (!summary) return null;

  const { players, winner, mode, stakeAmount, duration: dur, payouts, payoutsSimulated, totalPotSol, payoutTxSignature } = summary;
  const isLockedIn = mode === 'locked-in' || mode === 'demo';
  const activePlayer = players[activeTab] ?? players[0];

  // Map socketId/walletAddress -> payout entry for quick lookup
  const payoutByUsername = {};
  if (payouts) {
    for (const p of payouts) payoutByUsername[p.username] = p;
  }

  return (
    <div style={s.root}>
      {/* Google Font */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap" rel="stylesheet" />

      {/* Animated canvas background */}
      <canvas
        ref={canvasRef}
        width={1200}
        height={600}
        style={s.canvas}
      />

      {/* Main scrollable card */}
      <div style={s.mainCard}>
        <div style={s.title}>Session Complete</div>
        <div style={s.subtitle}>Duration: {fmtDuration(dur)}</div>

        {winner ? (
          <div style={s.winnerBanner}>{winner.username} wins! 🏆</div>
        ) : (
          <div style={s.tieBanner}>It's a tie — well played</div>
        )}

        {/* ── SOL Pot Breakdown ── */}
        {isLockedIn && payouts && (
          <div style={s.potBox}>
            <div style={s.potTitle}>
              💰 {totalPotSol ?? (stakeAmount * players.length / 1e9).toFixed(4)} SOL pot
              {payoutsSimulated && <span style={s.simBadge}>simulated</span>}
              {payoutTxSignature && (
                <a
                  href={`https://explorer.solana.com/tx/${payoutTxSignature}?cluster=devnet`}
                  target="_blank"
                  rel="noreferrer"
                  style={s.txLink}
                >
                  View tx ↗
                </a>
              )}
            </div>
            <div style={s.payoutRows}>
              {payouts.map((p, i) => {
                const rank = i + 1;
                const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;
                const isWin = parseFloat(p.sol) > 0;
                return (
                  <div key={p.username} style={s.payoutRow(isWin)}>
                    <span style={{ fontSize: 18 }}>{medal}</span>
                    <span style={{ fontFamily: FONT, fontWeight: 700, color: '#FFFFFF', flex: 1, fontSize: 8 }}>{p.username}</span>
                    <span style={{ fontFamily: FONT, color: isWin ? '#68B868' : '#555', fontSize: 9, textShadow: isWin ? '0 0 8px rgba(104,184,104,0.5)' : 'none' }}>
                      {isWin ? `+${p.sol} SOL` : '—'}
                    </span>
                    <span style={{ fontFamily: FONT, color: '#555', fontSize: 6 }}>({(p.share * 100).toFixed(0)}%)</span>
                  </div>
                );
              })}
            </div>
            {winner && payoutByUsername[winner.username] && (
              <div style={s.potVerdict}>
                {winner.username} takes the pot —&nbsp;
                <strong style={{ color: '#68B868' }}>
                  {payoutByUsername[winner.username].sol} SOL
                </strong>
                {payoutsSimulated ? ' (simulated)' : ''}!
              </div>
            )}
          </div>
        )}

        {/* ── Player score cards ── */}
        <div style={s.cardsRow}>
          {players.map((p) => {
            const isWinner = winner?.socketId === p.socketId;
            const payout = payoutByUsername[p.username];
            return (
              <div key={p.socketId} style={s.card(isWinner)}>
                {isWinner && <div style={s.winnerBadge}>WINNER</div>}
                <div style={s.playerName}>{p.username}{isWinner ? ' 🏆' : ''}</div>
                <div style={s.bigScore}>{(p.sessionScore * 100).toFixed(1)}</div>
                <div style={s.bigScoreLabel}>composite score</div>

                {payout && (
                  <div style={{
                    textAlign: 'center',
                    fontFamily: FONT,
                    fontSize: 9,
                    color: parseFloat(payout.sol) > 0 ? '#68B868' : '#555',
                    textShadow: parseFloat(payout.sol) > 0 ? '0 0 8px rgba(104,184,104,0.5)' : 'none',
                    marginTop: -4,
                  }}>
                    {parseFloat(payout.sol) > 0 ? `+${payout.sol} SOL` : 'no SOL'}
                    {payoutsSimulated && <span style={{ fontFamily: FONT, fontSize: 6, color: '#555', marginLeft: 6 }}>sim</span>}
                  </div>
                )}

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
                    <span style={s.xpBadge}>+{p.xpGained} XP{p.newLevel ? ` · Lv ${p.newLevel}!` : ''}</span>
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
                <div style={s.boxHead}>Score Breakdown</div>
                <ScoreBars player={activePlayer} />
                <div style={{ ...s.row, marginTop: 4, paddingTop: 8, borderTop: '1px solid rgba(136,136,187,0.15)' }}>
                  <span style={s.rowLabel}>Composite</span>
                  <span style={{ fontFamily: FONT, color: '#F8D030', fontSize: 14, textShadow: '0 0 10px rgba(248,208,48,0.4)' }}>
                    {(activePlayer.sessionScore * 100).toFixed(1)}
                  </span>
                </div>
              </div>

              {/* Study report */}
              <div style={s.box}>
                <div style={s.boxHead}>📊 Study Report</div>
                <StudyReportPanel report={activePlayer.studyReport} />
              </div>

              {/* Concept quiz */}
              <div style={s.box}>
                <div style={s.boxHead}>🧠 Comprehension Quiz</div>
                <ConceptQuizPanel key={activePlayer.socketId} questions={activePlayer.conceptQuiz} />
              </div>
            </>
          )}
        </div>

        {/* ── Bottom actions ── */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button style={s.btn} onClick={() => setPhase('login')}>Play Again</button>
          <button
            style={s.btnSecondary}
            onClick={() => window.open('/leaderboard', '_blank')}
          >
            Leaderboard
          </button>
        </div>
      </div>
    </div>
  );
}
