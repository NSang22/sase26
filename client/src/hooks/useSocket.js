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

    socket.on('focus_update', ({ playerId, focused, roomFocusState }) => {
      setFocusStates(roomFocusState);
    });

    socket.on('score_update', (scores) => {
      setScores(scores);
    });

    socket.on('quiz_question', (question) => {
      setCurrentQuestion(question);
      if (question.audioBase64) playQuestionAudio(question.audioBase64);
    });

    socket.on('quiz_result', ({ correct, points, correctAnswer }) => {
      // Handled locally in QuizOverlay — no store update needed here
    });

    socket.on('session_end', (summary) => {
      setSummary(summary);
      setPhase('recap');
    });

    socket.on('player_disconnected', ({ playerId }) => {
      console.warn('[socket] Player disconnected:', playerId);
    });

    socket.on('error', ({ message }) => {
      console.error('[socket] Server error:', message);
    });

    socket.on('escrow_ready', () => {
      console.log('[socket] Both escrows confirmed — session can start');
    });

    return () => {
      socket.off('connect');
      socket.off('room_created');
      socket.off('room_update');
      socket.off('session_start');
      socket.off('focus_update');
      socket.off('score_update');
      socket.off('quiz_question');
      socket.off('quiz_result');
      socket.off('session_end');
      socket.off('player_disconnected');
      socket.off('error');
      socket.off('escrow_ready');
    };
  }, [setMySocketId, setRoom, setPhase, updateFocusState, setFocusStates, setScores, setCurrentQuestion, setSummary]);

  return { emit, socket };
}
