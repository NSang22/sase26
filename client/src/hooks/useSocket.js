import { useEffect, useCallback } from 'react';
import { socket, connectSocket } from '../lib/socket.js';
import { useGameStore } from '../store/gameStore.js';
import { playAudio, playQuestionAudio, playPokemonSfx } from '../lib/audio.js';

// Pet reaction text lines (matches server PET_REACTIONS)
const PET_REACTIONS = {
  'focus-lost': ["Huh?! Stay focused!", "Hey! Don't zone out!", "Come back!", "No slacking off!", "Focus!"],
  'focus-regained': ["Welcome back!", "Let's go!", "That's the spirit!", "Locked in again!", "Back on track!"],
};

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
    showPetBubble,
    setNarratorManifest,
    setScreenAnalysis,
    setFakeFocusWarning,
  } = useGameStore();

  const emit = useCallback((event, data) => {
    socket.emit(event, data);
  }, []);

  useEffect(() => {
    connectSocket();

    // Fetch narrator manifest on connect
    fetch('/api/audio/narrator')
      .then((r) => r.ok ? r.json() : null)
      .then((m) => { if (m) setNarratorManifest(m); })
      .catch(() => {});

    socket.on('connect', () => {
      setMySocketId(socket.id);
    });

    socket.on('room_created', (room) => {
      setRoom(room);
      // Navigation to 'waiting' is handled by LandingPage's socket.once('room_created')
      // which also calls setUser — don't race it by changing phase here
    });

    socket.on('room_update', (room) => {
      setRoom(room);
    });

    socket.on('session_start', ({ startTime, narratorAudioUrl, roomState }) => {
      const store = useGameStore.getState();
      // Atomically sync the latest room state (with buddySelections) before
      // switching phase so StudySession always renders the right Pokemon.
      if (roomState) store.setRoom(roomState);
      store.setSessionStartTime(startTime);
      setPhase('session');
      if (narratorAudioUrl) playAudio(narratorAudioUrl, { priority: true });
    });

    // Track previous focus to detect changes for SFX/bubbles
    const prevFocus = {};

    socket.on('focus_update', ({ playerId, focused, players }) => {
      const states = {};
      players.forEach((p) => { states[p.socketId] = p.focused; });
      setFocusStates(states);

      // Detect focus *change* for the player who triggered this event
      if (playerId && prevFocus[playerId] !== undefined && prevFocus[playerId] !== focused) {
        const category = focused ? 'focus-regained' : 'focus-lost';
        const lines = PET_REACTIONS[category];
        const text = lines[Math.floor(Math.random() * lines.length)];
        showPetBubble(playerId, text);

        // Play Pokemon SFX for the player's pet
        const room = useGameStore.getState().room;
        const player = room?.players?.find?.((p) => p.socketId === playerId);
        if (player?.pokemon) playPokemonSfx(player.pokemon);

        // Play narrator focus alert if someone lost focus
        if (!focused) {
          const manifest = useGameStore.getState().narratorManifest;
          const urls = manifest?.['focus-alert'];
          if (urls?.length) {
            const url = urls[Math.floor(Math.random() * urls.length)];
            if (url) playAudio(url);
          }
        }
      }
      // Update tracking
      players.forEach((p) => { prevFocus[p.socketId] = p.focused; });
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
      // Play narrator session-end line
      const manifest = useGameStore.getState().narratorManifest;
      const urls = manifest?.['session-end'];
      if (urls?.length) {
        const url = urls[Math.floor(Math.random() * urls.length)];
        if (url) playAudio(url);
      }
      // Play recap narration if available
      if (summary.recapAudioUrl) {
        setTimeout(() => playAudio(summary.recapAudioUrl), 2000);
      }
    });

    // ── Screen analysis from server ────────────────────────────────────────
    socket.on('screen-analysis', (data) => {
      setScreenAnalysis(data);
    });

    socket.on('fake-focus', ({ distraction }) => {
      setFakeFocusWarning(distraction);
      const myId = useGameStore.getState().mySocketId;
      if (myId) showPetBubble(myId, '🚨 I see you slacking!');
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
      socket.off('screen-analysis');
      socket.off('fake-focus');
      socket.off('player_left');
      socket.off('error');
      socket.off('escrow_ready');
    };
  }, [setMySocketId, setRoom, setPhase, updateFocusState, setFocusStates, setScores, setCurrentQuestion, setSummary]);

  return { emit, socket };
}
