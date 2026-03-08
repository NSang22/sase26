import { BLOOM_LEVELS } from '../services/screenAgent.js';

const MAX_PLAYERS = 4;
const MIN_PLAYERS_TO_START = 2;
// Matches client CAPTURE_INTERVAL_MS — used to estimate screen study time per analysis event
const SCREEN_STUDY_INTERVAL_MS = 45_000;

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
    // Per-question answer collection (PDF quiz bank)
    this.currentQuestion = null;
    this.questionAnswers = new Map();  // questionId -> Map(socketId -> answerData)
    this.answerTimeouts = new Map();   // questionId -> setTimeout handle
    // Personalized quiz rounds
    this.personalizedQuestions = new Map(); // questionId -> question object
    this.currentRoundId = null;
    this.currentRoundBloomLevel = null;
    this.roundPlayerQuestions = new Map(); // socketId -> questionId
    this.roundAnswers = new Map();         // socketId -> answerData
    this.roundAnswerTimeout = null;        // setTimeout handle for round close
    // Bloom's rotation (starts at -1 so first call to getNextBloomLevel returns index 0)
    this.bloomIndex = -1;
    this.startTime = null;
    this.endTime = null;
    this.createdAt = Date.now();
    this.petSpecies = 'cat';
    // Buddy selection: buddyName -> username
    this.buddySelections = {};
    // Session settings (host-configurable)
    this.duration = mode === 'solo' ? 25 : 25;
    this.quizMode = 'frequency';
    this.quizValue = mode === 'solo' ? 1 : 5; // solo: quiz every 1 min for quick demo
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
      focus_start_timestamp: null,
      total_focused_ms: 0,
      focusStateChanges: [], // { timestamp, focused }
      // Scoring
      score: 0,
      answers: {},           // questionId -> { answerIndex, correct, points, timeMs }
      questionsTotal: 0,
      questionsCorrect: 0,
      answerTimes: [],       // ms per answer (for response_time_score)
      // Wallet (locked-in mode)
      walletAddress: null,
      escrowConfirmed: false,
      escrowTx: null,
      // Screen analysis
      screenConcepts: [],    // deduplicated concept strings
      screenTimeline: [],    // { timestamp, subject, is_studying, distraction }
      screen_study_ms: 0,    // cumulative ms where screen was confirmed studying
      bloomMaxLevel: null,   // highest bloom level seen for this player
    });
  }

  canJoin() {
    if (this.mode === 'solo') return false; // solo rooms are private
    return this.status === 'waiting' && this.players.size < MAX_PLAYERS;
  }

  addPlayer(socketId, userId, username) {
    this._addPlayer(socketId, userId, username, false);
  }

  removePlayer(socketId) {
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
    for (const [name, uname] of Object.entries(this.buddySelections)) {
      if (uname === p.username) delete this.buddySelections[name];
    }
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
    if (this.mode === 'solo') return this.players.size >= 1;
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
    if (!p || p.focused === focused) return;

    const now = Date.now();
    if (!focused) {
      this._bankFocus(socketId, now);
    } else {
      p.focus_start_timestamp = now;
    }
    p.focused = focused;
    p.focusStateChanges.push({ timestamp: now, focused });
  }

  // ── Screen analysis ──────────────────────────────────────────────────────

  recordScreenAnalysis(socketId, analysis) {
    const p = this.players.get(socketId);
    if (!p) return;

    p.screenTimeline.push({
      timestamp: Date.now(),
      subject: analysis.subject,
      is_studying: analysis.is_studying,
      distraction: analysis.distraction,
    });

    for (const concept of analysis.key_concepts) {
      if (!p.screenConcepts.includes(concept)) {
        p.screenConcepts.push(concept);
      }
    }

    // Accumulate screen study time — each positive analysis ≈ one capture interval
    if (analysis.is_studying) {
      p.screen_study_ms += SCREEN_STUDY_INTERVAL_MS;
    }

    // Track highest bloom level seen for this player
    if (analysis.bloom_max_level) {
      const newIdx = BLOOM_LEVELS.indexOf(analysis.bloom_max_level);
      const curIdx = p.bloomMaxLevel ? BLOOM_LEVELS.indexOf(p.bloomMaxLevel) : -1;
      if (newIdx > curIdx) p.bloomMaxLevel = analysis.bloom_max_level;
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
   * Returns live focus data for every player.
   * Computes focus_percentage without mutating player state.
   */
  getLiveFocusData(now = Date.now()) {
    const sessionMs = this.startTime ? now - this.startTime : 0;

    return [...this.players.values()].map((p) => {
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

  // ── Bloom's level management ──────────────────────────────────────────────

  /**
   * Returns the minimum bloom level across all players with data.
   * Caps quiz difficulty so every player can fairly participate.
   */
  getMinBloomLevel() {
    const indices = [...this.players.values()]
      .map((p) => p.bloomMaxLevel)
      .filter(Boolean)
      .map((l) => BLOOM_LEVELS.indexOf(l))
      .filter((i) => i >= 0);
    if (!indices.length) return 'recall';
    return BLOOM_LEVELS[Math.min(...indices)];
  }

  /**
   * Advance the Bloom's rotation and return the next level,
   * capped at the room's minimum.
   */
  getNextBloomLevel() {
    this.bloomIndex = (this.bloomIndex + 1) % BLOOM_LEVELS.length;
    const desired = BLOOM_LEVELS[this.bloomIndex];
    const min = this.getMinBloomLevel();
    const desiredIdx = BLOOM_LEVELS.indexOf(desired);
    const minIdx = BLOOM_LEVELS.indexOf(min);
    return desiredIdx <= minIdx ? desired : min;
  }

  // ── Personalized quiz rounds ──────────────────────────────────────────────

  /**
   * Open a new personalized quiz round.
   * @param {string} roundId
   * @param {Map<string, object>} playerQuestions — socketId -> question object
   * @param {string} bloomLevel
   */
  startPersonalizedRound(roundId, playerQuestions, bloomLevel) {
    this.currentRoundId = roundId;
    this.currentRoundBloomLevel = bloomLevel;
    this.roundPlayerQuestions.clear();
    this.roundAnswers.clear();
    for (const [sid, q] of playerQuestions) {
      this.personalizedQuestions.set(q.id, q);
      this.questionAnswers.set(q.id, new Map());
      this.roundPlayerQuestions.set(sid, q.id);
    }
  }

  /**
   * Record a player's answer to their personalized question.
   * Returns { correct, points, correctAnswerIndex } or null on duplicate/mismatch.
   */
  recordPersonalizedAnswer(socketId, questionId, answerIndex, timeMs) {
    const p = this.players.get(socketId);
    const q = this.personalizedQuestions.get(questionId);
    if (!p || !q) return null;
    if (this.roundPlayerQuestions.get(socketId) !== questionId) return null;
    if (this.roundAnswers.has(socketId)) return null;

    const correct = q.correctAnswerIndex === answerIndex;
    const speedBonus = correct ? Math.max(0, Math.floor((30000 - timeMs) / 1000)) : 0;
    const points = correct ? 10 + speedBonus : 0;

    const answerData = { answerIndex, correct, points, timeMs };
    this.roundAnswers.set(socketId, answerData);
    p.answers[questionId] = answerData;
    p.score += points;
    p.questionsTotal += 1;
    if (correct) p.questionsCorrect += 1;
    p.answerTimes.push(timeMs);

    return { correct, points, correctAnswerIndex: q.correctAnswerIndex };
  }

  allRoundAnswered() {
    if (!this.currentRoundId) return false;
    return [...this.roundPlayerQuestions.keys()].every((sid) => this.roundAnswers.has(sid));
  }

  getRoundResults() {
    return {
      roundId: this.currentRoundId,
      bloomLevel: this.currentRoundBloomLevel,
      playerResults: [...this.roundPlayerQuestions.entries()].map(([sid, qId]) => {
        const p = this.players.get(sid);
        const q = this.personalizedQuestions.get(qId);
        const a = this.roundAnswers.get(sid);
        return {
          socketId: sid,
          username: p?.username ?? 'Unknown',
          answered: !!a,
          correct: a?.correct ?? false,
          points: a?.points ?? 0,
          timeMs: a?.timeMs ?? null,
          correctAnswerIndex: q?.correctAnswerIndex ?? null,
        };
      }),
      scores: this.getScores(),
    };
  }

  // ── PDF quiz bank (shared questions) ─────────────────────────────────────

  setActiveQuestion(question) {
    this.currentQuestion = question;
    this.questionAnswers.set(question.id, new Map());
  }

  recordAnswer(socketId, questionId, answerIndex, timeMs) {
    const p = this.players.get(socketId);
    const q = this.quizBank.find((q) => q.id === questionId);
    const answerMap = this.questionAnswers.get(questionId);

    if (!p || !q || !answerMap) return null;
    if (answerMap.has(socketId)) return null;

    const correct = q.correctAnswerIndex === answerIndex;
    const speedBonus = correct ? Math.max(0, Math.floor((30000 - timeMs) / 1000)) : 0;
    const points = correct ? 10 + speedBonus : 0;

    const answerData = { answerIndex, correct, points, timeMs };
    answerMap.set(socketId, answerData);
    p.answers[questionId] = answerData;
    p.score += points;
    p.questionsTotal += 1;
    if (correct) p.questionsCorrect += 1;
    p.answerTimes.push(timeMs);

    return { correct, points, correctAnswerIndex: q.correctAnswerIndex };
  }

  allPlayersAnswered(questionId) {
    const answerMap = this.questionAnswers.get(questionId);
    if (!answerMap) return false;
    return [...this.players.keys()].every((sid) => answerMap.has(sid));
  }

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
          answerIndex: a?.answerIndex ?? null,
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

  // ── Session lifecycle ────────────────────────────────────────────────────

  startSession() {
    this.status = 'active';
    this.active = true;
    this.startTime = Date.now();
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
    if (this.roundAnswerTimeout) clearTimeout(this.roundAnswerTimeout);
    for (const t of this.answerTimeouts.values()) clearTimeout(t);
    this.answerTimeouts.clear();
    for (const p of this.players.values()) {
      this._bankFocus(p.socketId, now);
    }
  }

  // ── Summary / state ──────────────────────────────────────────────────────

  getSummary() {
    const duration = this.endTime - this.startTime;

    const players = [...this.players.values()].map((p) => {
      const focusPercent = duration > 0 ? Math.min(p.total_focused_ms / duration, 1) : 1;
      const screenStudyPercent = duration > 0 ? Math.min(p.screen_study_ms / duration, 1) : 0;

      const quizAccuracy = p.questionsTotal > 0 ? p.questionsCorrect / p.questionsTotal : 0;

      // Response time score: <5s = 1.0, >30s = 0.0, linear between
      const avgTimeMs =
        p.answerTimes.length > 0
          ? p.answerTimes.reduce((a, b) => a + b, 0) / p.answerTimes.length
          : 15_000;
      const responseTimeScore = Math.max(0, Math.min(1, (30_000 - avgTimeMs) / 25_000));

      // Consistency score: lower variance in focus-state-change intervals = higher score
      let consistencyScore = 1.0;
      if (p.focusStateChanges.length >= 2) {
        const intervals = [];
        for (let i = 1; i < p.focusStateChanges.length; i++) {
          intervals.push(p.focusStateChanges[i].timestamp - p.focusStateChanges[i - 1].timestamp);
        }
        const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
        const variance =
          intervals.reduce((a, b) => a + (b - mean) ** 2, 0) / intervals.length;
        const stdDev = Math.sqrt(variance);
        consistencyScore = Math.max(0, 1 - stdDev / 300_000);
      }

      // Composite: 0.50 focus + 0.20 accuracy + 0.15 response_time + 0.15 consistency
      const sessionScore =
        0.5 * focusPercent +
        0.2 * quizAccuracy +
        0.15 * responseTimeScore +
        0.15 * consistencyScore;

      return {
        socketId: p.socketId,
        userId: p.userId,
        username: p.username,
        focused: p.focused,
        focusPercent,
        screenStudyPercent,
        total_focused_ms: p.total_focused_ms,
        screen_study_ms: p.screen_study_ms,
        quizAccuracy,
        quizCorrectCount: p.questionsCorrect,
        questionsTotal: p.questionsTotal,
        totalQuizPoints: p.score,
        responseTimeScore,
        consistencyScore,
        sessionScore,
        walletAddress: p.walletAddress,
      };
    });

    players.sort((a, b) => b.sessionScore - a.sessionScore);

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
   */
  getState() {
    return {
      code: this.code,
      mode: this.mode,
      stakeAmount: this.stakeAmount,
      status: this.status,
      createdAt: this.createdAt,
      quizBankReady: this.quizBank.length > 0,
      playerCount: this.players.size,
      maxPlayers: MAX_PLAYERS,
      duration: this.duration,
      quizMode: this.quizMode,
      quizValue: this.quizValue,
      buddySelections: this.buddySelections,
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
