import { useState, useEffect, useRef } from 'react';
import { socket } from '../../lib/socket.js';
import { useGameStore } from '../../store/gameStore.js';

const TIME_LIMIT_MS = 30000;

const s = {
  backdrop: {
    position: 'absolute',
    inset: 0,
    background: 'rgba(10,10,24,0.78)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50,
  },
  card: {
    background: '#16162a',
    border: '1px solid #4c1d95',
    borderRadius: 20,
    padding: '36px 44px',
    maxWidth: 560,
    width: '90%',
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
    boxShadow: '0 0 40px #7c3aed44',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: { color: '#a78bfa', fontSize: 13, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase' },
  question: { fontSize: 20, fontWeight: 600, lineHeight: 1.5, color: '#e8e8f0' },
  options: { display: 'flex', flexDirection: 'column', gap: 10 },
  optionBtn: (state) => ({
    padding: '12px 16px',
    background:
      state === 'correct' ? '#14532d' :
      state === 'wrong'   ? '#450a0a' :
      state === 'selected' ? '#2d1b69' : '#0d0d1f',
    border: `1px solid ${
      state === 'correct' ? '#22c55e' :
      state === 'wrong'   ? '#ef4444' :
      state === 'selected' ? '#7c3aed' : '#2a2a4a'
    }`,
    borderRadius: 10,
    color: '#e8e8f0',
    fontSize: 15,
    cursor: state ? 'default' : 'pointer',
    textAlign: 'left',
    transition: 'background 0.2s',
  }),
  timer: {
    height: 4,
    borderRadius: 2,
    background: '#4c1d95',
    transition: 'width 0.1s linear',
  },
  result: (correct) => ({
    textAlign: 'center',
    fontWeight: 700,
    fontSize: 16,
    color: correct ? '#4ade80' : '#f87171',
    padding: '8px 0',
  }),
};

const OPTION_LABELS = ['A', 'B', 'C', 'D'];

export function QuizOverlay({ question }) {
  const { room, clearCurrentQuestion } = useGameStore();
  const [selected, setSelected] = useState(null);   // answerIndex (0-3)
  const [result, setResult] = useState(null);        // { correct, points, correctAnswerIndex }
  const [timeLeft, setTimeLeft] = useState(TIME_LIMIT_MS);
  const startRef = useRef(Date.now());
  const timerRef = useRef(null);

  // Countdown
  useEffect(() => {
    startRef.current = Date.now();
    setSelected(null);
    setResult(null);
    setTimeLeft(TIME_LIMIT_MS);
    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - startRef.current;
      const remaining = Math.max(0, TIME_LIMIT_MS - elapsed);
      setTimeLeft(remaining);
      if (remaining === 0) {
        clearInterval(timerRef.current);
      }
    }, 100);
    return () => clearInterval(timerRef.current);
  }, [question.id]);

  // Private ack from server after submitting an answer
  useEffect(() => {
    function onAck(data) {
      if (data.questionId !== question.id) return;
      setResult(data);
      setTimeout(() => clearCurrentQuestion(), 2500);
    }
    socket.on('quiz-answer-ack', onAck);
    return () => socket.off('quiz-answer-ack', onAck);
  }, [question.id, clearCurrentQuestion]);

  // When the question closes (timeout or all answered), dismiss if no ack received yet
  useEffect(() => {
    function onResults(data) {
      if (data.questionId !== question.id) return;
      setTimeout(() => clearCurrentQuestion(), 2500);
    }
    socket.on('quiz-results', onResults);
    return () => socket.off('quiz-results', onResults);
  }, [question.id, clearCurrentQuestion]);

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
        <div style={s.header}>
          <span style={s.label}>Quiz Time</span>
          <span style={{ color: '#a78bfa', fontWeight: 700, fontSize: 15 }}>
            {(timeLeft / 1000).toFixed(1)}s
          </span>
        </div>

        <div style={{ ...s.timer, width: `${pct}%`, background: pct < 30 ? '#dc2626' : '#7c3aed' }} />

        <div style={s.question}>{question.question}</div>

        <div style={s.options}>
          {question.options.map((text, i) => (
            <button
              key={i}
              style={s.optionBtn(optionState(i))}
              onClick={() => submitAnswer(i)}
              disabled={selected !== null || !!result}
            >
              <strong>{OPTION_LABELS[i]}.</strong> {text}
            </button>
          ))}
        </div>

        {result && (
          <div style={s.result(result.correct)}>
            {result.correct
              ? `Correct! +${result.points} points`
              : `Wrong. Correct answer: ${OPTION_LABELS[result.correctAnswerIndex]}`}
          </div>
        )}
      </div>
    </div>
  );
}
