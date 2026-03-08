import { useEffect, useCallback } from 'react';
import { socket, connectSocket } from '../lib/socket.js';
import { useGameStore } from '../store/gameStore.js';
import { playAudio, playQuestionAudio, playPokemonSfx } from '../lib/audio.js';

const PET_REACTIONS = {
  'focus-lost': ["Huh?! Stay focused!", "Hey! Don't zone out!", 'Come back!', 'No slacking off!', 'Focus!'],
  'focus-regained': ['Welcome back!', "Let's go!", "That's the spirit!", 'Locked in again!', 'Back on track!'],
};

export function useSocket() {
  const {
    setMySocketId,
    setRoom,
    setPhase,
    updateFocusState,
    setFocusStates,
    setScores,
    setCurrentQuestion,
    clearCurrentQuestion,
    setSummary,
    showPetBubble,
    setNarratorManifest,
    setScreenAnalysis,
    setFakeFocusWarning,
    setPlayerSubject,
    patchSummary,
  } = useGameStore();

  const emit = useCallback((event, data) => {
    socket.emit(event, data);
  }, []);

  useEffect(() => {
    connectSocket();

    fetch('/api/audio/narrator')
      .then((r) => (r.ok ? r.json() : null))
      .then((m) => {
        if (m) setNarratorManifest(m);
      })
      .catch(() => {});

    socket.on('connect', () => {
      setMySocketId(socket.id);
    });

    socket.on('room_created', (room) => {
      setRoom(room);
    });

    socket.on('room_update', (room) => {
      setRoom(room);
    });

    socket.on('session_start', ({ startTime, narratorAudioUrl, roomState }) => {
      const store = useGameStore.getState();
      if (roomState) store.setRoom(roomState);
      store.setSessionStartTime(startTime);
      useGameStore.setState({ screenShareResolved: false, studyStarted: false });
      setPhase('session');
      if (narratorAudioUrl) playAudio(narratorAudioUrl, { priority: true });
    });

    const prevFocus = {};

    socket.on('focus_update', ({ playerId, focused, players }) => {
      const states = {};
      players.forEach((p) => {
        states[p.socketId] = p.focused;
      });
      setFocusStates(states);

      if (playerId && prevFocus[playerId] !== undefined && prevFocus[playerId] !== focused) {
        const category = focused ? 'focus-regained' : 'focus-lost';
        const lines = PET_REACTIONS[category];
        const text = lines[Math.floor(Math.random() * lines.length)];
        showPetBubble(playerId, text);

        const room = useGameStore.getState().room;
        const player = room?.players?.find?.((p) => p.socketId === playerId);
        if (player?.pokemon) playPokemonSfx(player.pokemon);

        if (!focused) {
          const manifest = useGameStore.getState().narratorManifest;
          const urls = manifest?.['focus-alert'];
          if (urls?.length) {
            const url = urls[Math.floor(Math.random() * urls.length)];
            if (url) playAudio(url);
          }
        }
      }

      players.forEach((p) => {
        prevFocus[p.socketId] = p.focused;
      });
    });

    socket.on('surprise-quiz', ({ question }) => {
      setCurrentQuestion(question);
      if (question.audioUrl) playQuestionAudio(question.audioUrl);
    });

    socket.on('quiz-results', ({ scores }) => {
      if (scores) setScores(scores);
      // Clear stale question in case QuizOverlay wasn't mounted to do it
      setTimeout(() => clearCurrentQuestion(), 3000);
    });

    socket.on('session_end', (summary) => {
      setSummary(summary);
      setPhase('recap');
      const manifest = useGameStore.getState().narratorManifest;
      const urls = manifest?.['session-end'];
      if (urls?.length) {
        const url = urls[Math.floor(Math.random() * urls.length)];
        if (url) playAudio(url);
      }
    });

    socket.on('session_recap_update', (patch) => {
      patchSummary(patch);
      if (patch.recapAudioUrl) {
        setTimeout(() => playAudio(patch.recapAudioUrl), 2000);
      }
    });

    socket.on('screen-analysis', (data) => {
      setScreenAnalysis(data);
      const myId = useGameStore.getState().mySocketId;
      if (myId) setPlayerSubject(myId, data);
    });

    socket.on('subject_update', ({ socketId, subject, is_studying, distraction }) => {
      setPlayerSubject(socketId, { subject, is_studying, distraction });
    });

    socket.on('fake-focus', ({ playerId, distraction }) => {
      const myId = useGameStore.getState().mySocketId;
      if (playerId === myId) {
        setFakeFocusWarning(distraction);
        if (myId) showPetBubble(myId, 'Caught slacking!');
      } else if (playerId) {
        showPetBubble(playerId, `Distracted: ${distraction || 'off-task'}`);
      }
    });

    socket.on('player_left', ({ playerId }) => {
      console.warn('[socket] Player left:', playerId);
    });

    socket.on('room_closed', () => {
      useGameStore.getState().setRoom(null);
      setPhase('login');
    });

    socket.on('error', ({ message }) => {
      console.error('[socket] Server error:', message);
    });

    socket.on('escrow_ready', () => {
      console.log('[socket] All escrows confirmed - session can start');
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
      socket.off('session_recap_update');
      socket.off('screen-analysis');
      socket.off('subject_update');
      socket.off('fake-focus');
      socket.off('player_left');
      socket.off('room_closed');
      socket.off('error');
      socket.off('escrow_ready');
    };
  }, [
    setMySocketId,
    setRoom,
    setPhase,
    updateFocusState,
    setFocusStates,
    setScores,
    setCurrentQuestion,
    clearCurrentQuestion,
    setSummary,
    patchSummary,
    setNarratorManifest,
    setScreenAnalysis,
    setFakeFocusWarning,
    setPlayerSubject,
    showPetBubble,
  ]);

  return { emit, socket };
}
