import { useState, useEffect, useRef } from 'react';
import { socket } from '../../lib/socket.js';
import { useGameStore } from '../../store/gameStore.js';
import { playPokemonSfx } from '../../lib/audio.js';
import { drawPixelPokemon } from '../../lib/pixelArt.js';

const QUIZ_REACTIONS = {
  correct: ["Yes! Nailed it!", "Super effective!", "Big brain time!", "Too easy!", "Let's gooo!"],
  wrong: ["Oof...", "Not quite...", "We'll get 'em next time", "Yikes...", "Unlucky..."],
};

const TIME_LIMIT_MS = 30000;
const OPTION_LABELS = ['A', 'B', 'C', 'D'];

// ── Pet sprite (pixel art canvas) ────────────────────────────────────────────
function PetSprite({ species, size = 52 }) {
  const canvasRef = useRef(null);
  const frameRef  = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !species) return;
    const ctx = canvas.getContext('2d');
    let animId;
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawPixelPokemon(ctx, 2, 2, species, frameRef.current++, 2);
      animId = requestAnimationFrame(animate);
    };
    animate();
    return () => cancelAnimationFrame(animId);
  }, [species]);

  if (!species) return null;
  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      style={{ imageRendering: 'pixelated', flexShrink: 0 }}
    />
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

function makeStyles(compact) {
  return {
    backdrop: {
      position: 'absolute',
      inset: 0,
      background: compact ? 'rgba(10,10,24,0.92)' : 'rgba(10,10,24,0.78)',
      display: 'flex',
      alignItems: compact ? 'stretch' : 'center',
      justifyContent: 'center',
      zIndex: 50,
    },
    card: {
      background: '#16162a',
      border: '1px solid #4c1d95',
      borderRadius: compact ? 0 : 20,
      padding: compact ? '10px 12px' : '36px 44px',
      width: '100%',
      maxWidth: compact ? '100%' : 560,
      display: 'flex',
      flexDirection: 'column',
      gap: compact ? 8 : 20,
      boxShadow: compact ? 'none' : '0 0 40px #7c3aed44',
      overflowY: compact ? 'auto' : 'visible',
    },
    header: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 6,
    },
    petRow: {
      display: 'flex',
      alignItems: 'center',
      gap: compact ? 6 : 8,
      minWidth: 0,
    },
    label: {
      color: '#a78bfa',
      fontSize: compact ? 10 : 13,
      fontWeight: 700,
      letterSpacing: 2,
      textTransform: 'uppercase',
      whiteSpace: 'nowrap',
    },
    bloomBadge: (level) => ({
      padding: compact ? '1px 5px' : '2px 8px',
      background:
        level === 'analysis'      ? 'rgba(124,58,237,0.3)' :
        level === 'application'   ? 'rgba(59,130,246,0.3)' :
        level === 'comprehension' ? 'rgba(16,185,129,0.3)' : 'rgba(107,114,128,0.3)',
      border: `1px solid ${
        level === 'analysis'      ? '#7c3aed' :
        level === 'application'   ? '#3b82f6' :
        level === 'comprehension' ? '#10b981' : '#6b7280'
      }`,
      borderRadius: 6,
      fontSize: compact ? 8 : 10,
      fontWeight: 700,
      color: '#e8e8f0',
      textTransform: 'uppercase',
      letterSpacing: 1,
      flexShrink: 0,
    }),
    timerText: (pct) => ({
      color: pct < 30 ? '#ef4444' : '#a78bfa',
      fontWeight: 700,
      fontSize: compact ? 12 : 15,
      whiteSpace: 'nowrap',
      flexShrink: 0,
    }),
    timerBar: (pct) => ({
      height: compact ? 3 : 4,
      borderRadius: 2,
      background: pct < 30 ? '#dc2626' : '#7c3aed',
      transition: 'width 0.1s linear',
      width: `${pct}%`,
    }),
    question: {
      fontSize: compact ? 13 : 20,
      fontWeight: 600,
      lineHeight: 1.4,
      color: '#e8e8f0',
    },
    sourceConcept: {
      fontSize: compact ? 10 : 11,
      color: '#7c3aed',
      fontStyle: 'italic',
      marginTop: compact ? -4 : -8,
    },
    options: compact
      ? { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }
      : { display: 'flex', flexDirection: 'column', gap: 10 },
    optionBtn: (state, compact) => ({
      padding: compact ? '8px 10px' : '12px 16px',
      background:
        state === 'correct'  ? '#14532d' :
        state === 'wrong'    ? '#450a0a' :
        state === 'selected' ? '#2d1b69' : '#0d0d1f',
      border: `1px solid ${
        state === 'correct'  ? '#22c55e' :
        state === 'wrong'    ? '#ef4444' :
        state === 'selected' ? '#7c3aed' : '#2a2a4a'
      }`,
      borderRadius: compact ? 8 : 10,
      color: '#e8e8f0',
      fontSize: compact ? 11 : 15,
      cursor: state ? 'default' : 'pointer',
      textAlign: 'left',
      transition: 'background 0.2s',
      lineHeight: 1.3,
    }),
    result: (correct) => ({
      textAlign: 'center',
      fontWeight: 700,
      fontSize: compact ? 12 : 16,
      color: correct ? '#4ade80' : '#f87171',
      padding: compact ? '4px 0' : '8px 0',
    }),
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

export function QuizOverlay({ question, compact = false, petSpecies = null }) {
  const { room, clearCurrentQuestion, showPetBubble } = useGameStore();
  const [selected, setSelected] = useState(null);
  const [result,   setResult]   = useState(null);
  const [timeLeft, setTimeLeft] = useState(TIME_LIMIT_MS);
  const startRef  = useRef(Date.now());
  const timerRef  = useRef(null);

  const s = makeStyles(compact);

  // Countdown
  useEffect(() => {
    startRef.current = Date.now();
    setSelected(null);
    setResult(null);
    setTimeLeft(TIME_LIMIT_MS);
    timerRef.current = setInterval(() => {
      const elapsed   = Date.now() - startRef.current;
      const remaining = Math.max(0, TIME_LIMIT_MS - elapsed);
      setTimeLeft(remaining);
      if (remaining === 0) clearInterval(timerRef.current);
    }, 100);
    return () => clearInterval(timerRef.current);
  }, [question.id]);

  // Private ack from server after submitting
  useEffect(() => {
    function onAck(data) {
      if (data.questionId !== question.id) return;
      setResult(data);
      const myId = socket.id;
      const myPlayer = room?.players?.find?.((p) => p.socketId === myId);
      if (myPlayer?.pokemon) playPokemonSfx(myPlayer.pokemon);
      const category = data.correct ? 'correct' : 'wrong';
      const lines = QUIZ_REACTIONS[category];
      showPetBubble(myId, lines[Math.floor(Math.random() * lines.length)]);
      setTimeout(() => clearCurrentQuestion(), 2500);
    }
    socket.on('quiz-answer-ack', onAck);
    return () => socket.off('quiz-answer-ack', onAck);
  }, [question.id, clearCurrentQuestion, room, showPetBubble]);

  // Dismiss when question closes (timeout or all answered)
  useEffect(() => {
    function onResults(data) {
      if (data.questionId && data.questionId !== question.id) return;
      if (data.roundId && question.roundId && data.roundId !== question.roundId) return;
      setTimeout(() => clearCurrentQuestion(), 2500);
    }
    socket.on('quiz-results', onResults);
    return () => socket.off('quiz-results', onResults);
  }, [question.id, question.roundId, clearCurrentQuestion]);

  function submitAnswer(answerIndex) {
    if (selected !== null || result) return;
    const timeMs = Date.now() - startRef.current;
    setSelected(answerIndex);
    clearInterval(timerRef.current);
    socket.emit('quiz_answer', {
      roomCode: room?.code,
      questionId: question.id,
      answerIndex,
      timeMs,
    });
  }

  function optionState(index) {
    if (!result) return selected === index ? 'selected' : null;
    if (index === result.correctAnswerIndex) return 'correct';
    if (index === selected && !result.correct) return 'wrong';
    return null;
  }

  const pct = (timeLeft / TIME_LIMIT_MS) * 100;

  return (
    <div style={s.backdrop}>
      <div style={s.card}>

        {/* Header: pet + label + bloom badge + timer */}
        <div style={s.header}>
          <div style={s.petRow}>
            {compact && petSpecies && <PetSprite species={petSpecies} size={compact ? 40 : 52} />}
            <div>
              <div style={s.label}>
                {question.personalized ? 'Personalized Quiz' : 'Quiz Time'}
              </div>
              {compact && petSpecies && (
                <div style={{ fontSize: 9, color: '#6b7280', textTransform: 'capitalize', marginTop: 1 }}>
                  {petSpecies}
                </div>
              )}
            </div>
            {question.bloom_level && (
              <span style={s.bloomBadge(question.bloom_level)}>{question.bloom_level}</span>
            )}
          </div>
          <span style={s.timerText(pct)}>{(timeLeft / 1000).toFixed(1)}s</span>
        </div>

        {/* Timer bar */}
        <div style={{ background: '#1e1e3a', borderRadius: 2, overflow: 'hidden', height: compact ? 3 : 4 }}>
          <div style={s.timerBar(pct)} />
        </div>

        {/* Question */}
        <div style={s.question}>{question.question}</div>

        {/* Source concept (full view only — too cramped in compact) */}
        {!compact && question.source_concept && (
          <div style={s.sourceConcept}>Concept: {question.source_concept}</div>
        )}

        {/* Options */}
        <div style={s.options}>
          {question.options.map((text, i) => (
            <button
              key={i}
              style={s.optionBtn(optionState(i), compact)}
              onClick={() => submitAnswer(i)}
              disabled={selected !== null || !!result}
            >
              <strong>{OPTION_LABELS[i]}.</strong> {text}
            </button>
          ))}
        </div>

        {/* Result */}
        {result && (
          <div style={s.result(result.correct)}>
            {result.correct
              ? `✓ Correct! +${result.points} pts`
              : `✗ Answer: ${OPTION_LABELS[result.correctAnswerIndex]}`}
          </div>
        )}
      </div>
    </div>
  );
}
