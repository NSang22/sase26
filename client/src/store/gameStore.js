import { create } from 'zustand';

/**
 * Central Zustand store.
 * Phases: 'login' → 'waiting' → 'session' → 'recap'
 */
export const useGameStore = create((set, get) => ({
  // ── Auth ──────────────────────────────────────────────────────────────────
  user: null, // { userId, username, petSpecies, petLevel, petXP }
  setUser: (user) => set({ user }),

  // ── Wallet ────────────────────────────────────────────────────────────────
  walletAddress: null,
  setWalletAddress: (addr) => set({ walletAddress: addr }),

  // ── Room ──────────────────────────────────────────────────────────────────
  room: null, // room state from server
  setRoom: (room) => set({ room }),

  // ── Phase ─────────────────────────────────────────────────────────────────
  phase: 'login', // 'login' | 'waiting' | 'session' | 'recap'
  setPhase: (phase) => set({ phase }),

  // ── Session ───────────────────────────────────────────────────────────────
  sessionStartTime: null,
  setSessionStartTime: (t) => set({ sessionStartTime: t }),

  // focusStates: { [socketId]: boolean }
  focusStates: {},
  updateFocusState: (playerId, focused) =>
    set((s) => ({ focusStates: { ...s.focusStates, [playerId]: focused } })),
  setFocusStates: (states) => set({ focusStates: states }),

  // scores: { [socketId]: { username, score } }
  scores: {},
  setScores: (scores) => set({ scores }),

  // ── Quiz ──────────────────────────────────────────────────────────────────
  currentQuestion: null, // { id, question, options, audioBase64? }
  setCurrentQuestion: (q) => set({ currentQuestion: q }),
  clearCurrentQuestion: () => set({ currentQuestion: null }),

  // ── Recap ─────────────────────────────────────────────────────────────────
  summary: null,
  setSummary: (summary) => set({ summary }),
  patchSummary: (patch) => set((s) => ({ summary: s.summary ? { ...s.summary, ...patch } : patch })),

  // ── Screen analysis ────────────────────────────────────────────────────────
  screenAnalysis: null, // latest { is_studying, subject, key_concepts, distraction }
  setScreenAnalysis: (a) => set({ screenAnalysis: a }),

  fakeFocusWarning: null, // distraction string when fake-focus detected
  setFakeFocusWarning: (msg) => {
    set({ fakeFocusWarning: msg });
    if (msg) setTimeout(() => set((s) => s.fakeFocusWarning === msg ? { fakeFocusWarning: null } : {}), 6000);
  },

  // ── Pet text bubbles ──────────────────────────────────────────────────────
  // { [socketId]: string } — current reaction text to show over each pet
  petBubbles: {},
  showPetBubble: (socketId, text) => {
    set((s) => ({ petBubbles: { ...s.petBubbles, [socketId]: text } }));
    setTimeout(() => {
      set((s) => {
        const updated = { ...s.petBubbles };
        if (updated[socketId] === text) delete updated[socketId];
        return { petBubbles: updated };
      });
    }, 3000);
  },

  // ── Narrator audio ────────────────────────────────────────────────────────
  narratorManifest: null, // { [category]: string[] }
  setNarratorManifest: (m) => set({ narratorManifest: m }),

  // ── Derived helpers ───────────────────────────────────────────────────────
  mySocketId: null,
  setMySocketId: (id) => set({ mySocketId: id }),

  isMyself: (socketId) => get().mySocketId === socketId,

  myFocusState: () => {
    const { focusStates, mySocketId } = get();
    return mySocketId ? (focusStates[mySocketId] ?? true) : true;
  },

  partnerFocusState: () => {
    const { focusStates, mySocketId } = get();
    const partnerKey = Object.keys(focusStates).find((k) => k !== mySocketId);
    return partnerKey ? focusStates[partnerKey] : true;
  },
}));
