const MAX_PLAYERS = 4;
const MIN_PLAYERS_TO_START = 2;

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

class Room {
  constructor(socketId, userId, username, mode = 'casual', stakeAmount = 0) {
    this.code = generateRoomCode();
    this.mode = mode; // 'casual' | 'locked-in'
    this.stakeAmount = stakeAmount; // lamports per player
    this.status = 'waiting'; // 'waiting' | 'active' | 'ended'
    this.active = false;
    this.players = new Map(); // socketId -> player
    this.quizBank = [];
    this.quizIndex = 0;
    this.quizTimer = null;
    // Per-question answer collection
    this.currentQuestion = null;               // question object currently in-flight
    this.questionAnswers = new Map();          // questionId -> Map(socketId -> answerData)
    this.answerTimeouts = new Map();           // questionId -> setTimeout handle
    this.startTime = null;
    this.endTime = null;
    this.createdAt = Date.now();
    this.petSpecies = 'cat';
    // Buddy selection: buddyName -> username
    this.buddySelections = {};
    // Session settings (host-configurable)
    this.duration = 25;
    this.quizMode = 'frequency';
    this.quizValue = 5;
    this._addPlayer(socketId, userId, username, true);
  }

  // ── Player management ────────────────────────────────────────────────────

  _addPlayer(socketId, userId, username, isHost = false) {
    this.players.set(socketId, {
      socketId,
      userId,
      username,
      isHost,
      ready: false,
      // Focus tracking
      focused: true,
      focus_start_timestamp: null, // ms — non-null while actively focused during a session
      total_focused_ms: 0,
      // Scoring
      score: 0,
      answers: {}, // questionId -> { answerId, correct, points, timeMs }
      // Wallet (locked-in mode)
      walletAddress: null,
      escrowConfirmed: false,
      escrowTx: null,
      // Screen analysis
      screenConcepts: [],     // deduplicated concept strings
      screenTimeline: [],     // { timestamp, subject, is_studying, distraction }
    });
  }

  canJoin() {
    return this.status === 'waiting' && this.players.size < MAX_PLAYERS;
  }

  addPlayer(socketId, userId, username) {
    this._addPlayer(socketId, userId, username, false);
  }

  removePlayer(socketId) {
    // Bank any in-progress focus time before removing
    if (this.active) this._bankFocus(socketId, Date.now());
    this.players.delete(socketId);
  }

  setReady(socketId) {
    const p = this.players.get(socketId);
    if (p) p.ready = true;
  }

  setUnready(socketId) {
    const p = this.players.get(socketId);
    if (p) p.ready = false;
  }

  selectBuddy(socketId, buddyName) {
    const p = this.players.get(socketId);
    if (!p) return;
    // Remove any previous selection by this player
    for (const [name, uname] of Object.entries(this.buddySelections)) {
      if (uname === p.username) delete this.buddySelections[name];
    }
    // Check if this buddy is taken by someone else
    if (this.buddySelections[buddyName] && this.buddySelections[buddyName] !== p.username) return;
    this.buddySelections[buddyName] = p.username;
  }

  updateSettings(duration, quizMode, quizValue) {
    this.duration = duration;
    this.quizMode = quizMode;
    this.quizValue = quizValue;
  }

  updateMode(mode, stakeAmount) {
    this.mode = mode;
    this.stakeAmount = stakeAmount;
  }

  allReady() {
    if (this.players.size < MIN_PLAYERS_TO_START) return false;
    return [...this.players.values()].every((p) => p.ready);
  }

  // ── Focus ────────────────────────────────────────────────────────────────

  _bankFocus(socketId, now) {
    const p = this.players.get(socketId);
    if (!p || p.focus_start_timestamp === null) return;
    p.total_focused_ms += now - p.focus_start_timestamp;
    p.focus_start_timestamp = null;
  }

  updateFocus(socketId, focused) {
    const p = this.players.get(socketId);
    if (!p || p.focused === focused) return; // ignore no-change events

    const now = Date.now();
    if (!focused) {
      // Transitioning focused → distracted: bank elapsed focused time
      this._bankFocus(socketId, now);
    } else {
      // Transitioning distracted → focused: start a new focus period
      p.focus_start_timestamp = now;
    }
    p.focused = focused;
  }

  // ── Screen analysis ──────────────────────────────────────────────────────

  recordScreenAnalysis(socketId, analysis) {
    const p = this.players.get(socketId);
    if (!p) return;
    // Append to timeline
    p.screenTimeline.push({
      timestamp: Date.now(),
      subject: analysis.subject,
      is_studying: analysis.is_studying,
      distraction: analysis.distraction,
    });
    // Accumulate deduplicated concepts
    for (const concept of analysis.key_concepts) {
      if (!p.screenConcepts.includes(concept)) {
        p.screenConcepts.push(concept);
      }
    }
  }

  getPlayerConcepts(socketId) {
    return this.players.get(socketId)?.screenConcepts ?? [];
  }

  getAllTimelines() {
    const timelines = {};
    for (const [id, p] of this.players) {
      timelines[id] = {
        username: p.username,
        timeline: p.screenTimeline,
        concepts: p.screenConcepts,
      };
    }
    return timelines;
  }

  getFocusState() {
    const state = {};
    for (const [id, p] of this.players) state[id] = p.focused;
    return state;
  }

  /**
   * Returns live focus data for every player in the room.
   * Computes focus_percentage without mutating player state — safe to call at any time.
   *
   * focus_percentage = (total_focused_ms + in-progress focused ms) / total_session_ms
   *
   * @param {number} [now] - current timestamp (defaults to Date.now())
   * @returns {{ socketId, username, focused, total_focused_ms, focus_percentage }[]}
   */
  getLiveFocusData(now = Date.now()) {
    const sessionMs = this.startTime ? now - this.startTime : 0;

    return [...this.players.values()].map((p) => {
      // Add the in-progress focused window without touching stored state
      const liveMs =
        p.focused && p.focus_start_timestamp !== null
          ? p.total_focused_ms + (now - p.focus_start_timestamp)
          : p.total_focused_ms;

      const focus_percentage = sessionMs > 0 ? Math.min(liveMs / sessionMs, 1) : 1;

      return {
        socketId: p.socketId,
        username: p.username,
        focused: p.focused,
        total_focused_ms: liveMs,
        focus_percentage,
      };
    });
  }

  // ── Wallet / escrow ──────────────────────────────────────────────────────

  setWallet(socketId, walletAddress) {
    const p = this.players.get(socketId);
    if (p) p.walletAddress = walletAddress;
  }

  confirmEscrow(socketId, txSignature) {
    const p = this.players.get(socketId);
    if (p) {
      p.escrowConfirmed = true;
      p.escrowTx = txSignature;
    }
  }

  allEscrowConfirmed() {
    return [...this.players.values()].every((p) => p.escrowConfirmed);
  }

  // ── Quiz ─────────────────────────────────────────────────────────────────

  // ── Quiz ─────────────────────────────────────────────────────────────────

  /**
   * Called when the server emits a new surprise-quiz event.
   * Opens a fresh answer-collection map for this question.
   */
  setActiveQuestion(question) {
    this.currentQuestion = question;
    this.questionAnswers.set(question.id, new Map());
  }

  /**
   * Record a player's answer to the current question.
   * Returns null if the player already answered or the question is unknown.
   *
   * @param {string} socketId
   * @param {string} questionId
   * @param {number} answerIndex  — 0-3 index into question.options
   * @param {number} timeMs       — ms elapsed since question was shown
   * @returns {{ correct, points, correctAnswerIndex } | null}
   */
  recordAnswer(socketId, questionId, answerIndex, timeMs) {
    const p = this.players.get(socketId);
    const q = this.quizBank.find((q) => q.id === questionId);
    const answerMap = this.questionAnswers.get(questionId);

    if (!p || !q || !answerMap) return null;
    if (answerMap.has(socketId)) return null; // duplicate answer — ignore

    const correct = q.correctAnswerIndex === answerIndex;
    const speedBonus = correct ? Math.max(0, Math.floor((30000 - timeMs) / 1000)) : 0;
    const points = correct ? 10 + speedBonus : 0;

    const answerData = { answerIndex, correct, points, timeMs };
    answerMap.set(socketId, answerData);
    p.answers[questionId] = answerData;
    p.score += points;

    return { correct, points, correctAnswerIndex: q.correctAnswerIndex };
  }

  /**
   * True when every player in the room has submitted an answer for this question.
   */
  allPlayersAnswered(questionId) {
    const answerMap = this.questionAnswers.get(questionId);
    if (!answerMap) return false;
    return [...this.players.keys()].every((sid) => answerMap.has(sid));
  }

  /**
   * Build the full results payload broadcast to all players after a question closes.
   * Includes each player's answer, whether it was correct, points earned,
   * the correct answer, and updated scores.
   */
  getQuestionResults(questionId) {
    const q = this.quizBank.find((q) => q.id === questionId);
    const answerMap = this.questionAnswers.get(questionId) ?? new Map();

    return {
      questionId,
      correctAnswerIndex: q?.correctAnswerIndex ?? -1,
      explanation: q?.explanation ?? '',
      playerResults: [...this.players.values()].map((p) => {
        const a = answerMap.get(p.socketId);
        return {
          socketId: p.socketId,
          username: p.username,
          answerIndex: a?.answerIndex ?? null,    // null = did not answer in time
          correct: a?.correct ?? false,
          points: a?.points ?? 0,
          timeMs: a?.timeMs ?? null,
        };
      }),
      scores: this.getScores(),
    };
  }

  getScores() {
    const scores = {};
    for (const [id, p] of this.players) {
      scores[id] = { username: p.username, score: p.score };
    }
    return scores;
  }

  // ── Session lifecycle ────────────────────────────────────────────────────

  startSession() {
    this.status = 'active';
    this.active = true;
    this.startTime = Date.now();
    // Begin focus clocks for players who are already focused at session start
    for (const p of this.players.values()) {
      if (p.focused) p.focus_start_timestamp = this.startTime;
    }
  }

  endSession() {
    const now = Date.now();
    this.status = 'ended';
    this.active = false;
    this.endTime = now;
    if (this.quizTimer) clearTimeout(this.quizTimer);
    for (const t of this.answerTimeouts.values()) clearTimeout(t);
    this.answerTimeouts.clear();
    // Finalize focus time for any still-focused players
    for (const p of this.players.values()) {
      this._bankFocus(p.socketId, now);
    }
  }

  // ── Summary / state ──────────────────────────────────────────────────────

  getSummary() {
    const duration = this.endTime - this.startTime;

    const players = [...this.players.values()].map((p) => {
      const focusPercent = duration > 0 ? Math.min(p.total_focused_ms / duration, 1) : 1;
      const answered = Object.values(p.answers);
      const quizCorrectCount = answered.filter((a) => a.correct).length;
      const quizAccuracy = answered.length > 0 ? quizCorrectCount / answered.length : 0;
      const sessionScore = 0.8 * focusPercent + 0.2 * quizAccuracy;

      return {
        socketId: p.socketId,
        userId: p.userId,
        username: p.username,
        focused: p.focused,
        focusPercent,
        total_focused_ms: p.total_focused_ms,
        quizAccuracy,
        quizCorrectCount,
        totalQuizPoints: p.score,
        sessionScore,
        walletAddress: p.walletAddress,
      };
    });

    // Sort descending by session score
    players.sort((a, b) => b.sessionScore - a.sessionScore);

    // Winner = sole top scorer. Tie if top two share the same score.
    const winner =
      players.length >= 2 && players[0].sessionScore > players[1].sessionScore
        ? players[0]
        : null;

    return {
      duration,
      players,
      winner,
      mode: this.mode,
      stakeAmount: this.stakeAmount,
    };
  }

  /**
   * Full room state broadcast to all clients whenever something changes.
   * Includes live focus + score data so clients can render it.
   */
  getState() {
    return {
      code: this.code,
      mode: this.mode,
      stakeAmount: this.stakeAmount,
      duration: this.duration,
      quizMode: this.quizMode,
      quizValue: this.quizValue,
      buddySelections: this.buddySelections,
      status: this.status,
      createdAt: this.createdAt,
      quizBankReady: this.quizBank.length > 0,
      playerCount: this.players.size,
      maxPlayers: MAX_PLAYERS,
      players: [...this.players.values()].map((p) => ({
        socketId: p.socketId,
        userId: p.userId,
        username: p.username,
        isHost: p.isHost,
        ready: p.ready,
        focused: p.focused,
        score: p.score,
        focus_start_timestamp: p.focus_start_timestamp,
        total_focused_ms: p.total_focused_ms,
        walletConnected: !!p.walletAddress,
        escrowConfirmed: p.escrowConfirmed,
      })),
    };
  }
}

// ── RoomManager ──────────────────────────────────────────────────────────────

export class RoomManager {
  constructor() {
    this.rooms = new Map();       // code -> Room
    this.playerRooms = new Map(); // socketId -> code
  }

  createRoom(socketId, userId, username, mode, stakeAmount) {
    const room = new Room(socketId, userId, username, mode, stakeAmount);
    this.rooms.set(room.code, room);
    this.playerRooms.set(socketId, room.code);
    return room;
  }

  /**
   * @returns {Room|null} the room on success, null if not found / full / in-progress
   */
  joinRoom(code, socketId, userId, username) {
    const room = this.rooms.get(code);
    if (!room || !room.canJoin()) return null;
    room.addPlayer(socketId, userId, username);
    this.playerRooms.set(socketId, code);
    return room;
  }

  getRoom(code) {
    return this.rooms.get(code) ?? null;
  }

  getPlayerRoom(socketId) {
    return this.playerRooms.get(socketId) ?? null;
  }

  /**
   * Remove a player from their room.
   * @returns {Room|null} the room they were in (may now have 0 players)
   */
  removePlayer(socketId) {
    const code = this.playerRooms.get(socketId);
    if (!code) return null;

    const room = this.rooms.get(code);
    if (room) {
      room.removePlayer(socketId);
      if (room.players.size === 0) this.removeRoom(code);
    }
    this.playerRooms.delete(socketId);
    return room ?? null;
  }

  removeRoom(code) {
    const room = this.rooms.get(code);
    if (room?.quizTimer) clearTimeout(room.quizTimer);
    this.rooms.delete(code);
  }
}
