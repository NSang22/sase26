import { useEffect, useCallback } from 'react';
import { socket, connectSocket } from '../lib/socket.js';
import { useGameStore } from '../store/gameStore.js';
import { playAudio, playQuestionAudio } from '../lib/audio.js';

/**
 * Wires up all socket event listeners for the active session.
 * Call this once inside a component that lives for the session lifetime.
 */
export function useSocket() {
  const {
    setMySocketId,
    setRoom,
    setPhase,
    updateFocusState,
    setFocusStates,
    setScores,
    setCurrentQuestion,
    setSummary,
  } = useGameStore();

  const emit = useCallback((event, data) => {
    socket.emit(event, data);
  }, []);

  useEffect(() => {
    connectSocket();

    socket.on('connect', () => {
      setMySocketId(socket.id);
    });

    socket.on('room_created', (room) => {
      setRoom(room);
      setPhase('waiting');
    });

    socket.on('room_update', (room) => {
      setRoom(room);
    });

    socket.on('session_start', ({ startTime }) => {
      useGameStore.getState().setSessionStartTime(startTime);
      setPhase('session');
    });

    // players[] is the live focus data array from getLiveFocusData()
    socket.on('focus_update', ({ players }) => {
      const states = {};
      players.forEach((p) => { states[p.socketId] = p.focused; });
      setFocusStates(states);
    });

    // surprise-quiz: { question, windowMs }
    socket.on('surprise-quiz', ({ question }) => {
      setCurrentQuestion(question);
      if (question.audioUrl) playQuestionAudio(question.audioUrl);
    });

    // quiz-answer-ack: private result for the answering player (handled in QuizOverlay)

    // quiz-results: broadcast after question closes; update scores for everyone
    socket.on('quiz-results', ({ scores }) => {
      setScores(scores);
    });

    socket.on('session_end', (summary) => {
      setSummary(summary);
      setPhase('recap');
    });

    socket.on('player_left', ({ playerId }) => {
      console.warn('[socket] Player left:', playerId);
    });

    socket.on('error', ({ message }) => {
      console.error('[socket] Server error:', message);
    });

    socket.on('escrow_ready', () => {
      console.log('[socket] All escrows confirmed — session can start');
    });

    return () => {
      socket.off('connect');
      socket.off('room_created');
      socket.off('room_update');
      socket.off('session_start');
      socket.off('focus_update');
      socket.off('surprise-quiz');
      socket.off('quiz-results');
      socket.off('session_end');
      socket.off('player_left');
      socket.off('error');
      socket.off('escrow_ready');
    };
  }, [setMySocketId, setRoom, setPhase, updateFocusState, setFocusStates, setScores, setCurrentQuestion, setSummary]);

  return { emit, socket };
}
