function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function computeFocusPercent(events, startTime, endTime) {
  if (!events.length) return 1.0;
  let focusedMs = 0;
  let currentFocused = true;
  let periodStart = startTime;
  for (const { timestamp, focused } of events) {
    if (focused !== currentFocused) {
      if (currentFocused) focusedMs += timestamp - periodStart;
      currentFocused = focused;
      periodStart = timestamp;
    }
  }
  if (currentFocused) focusedMs += endTime - periodStart;
  const total = endTime - startTime;
  return total > 0 ? focusedMs / total : 1.0;
}

class Room {
  constructor(socketId, userId, username, mode = 'casual', stakeAmount = 0) {
    this.code = generateRoomCode();
    this.mode = mode; // 'casual' | 'locked-in'
    this.stakeAmount = stakeAmount;
    this.status = 'waiting'; // 'waiting' | 'active' | 'ended'
    this.active = false;
    this.players = new Map(); // socketId -> player
    this.quizBank = [];
    this.quizIndex = 0;
    this.quizTimer = null;
    this.startTime = null;
    this.endTime = null;
    this.petSpecies = 'cat'; // default; host can set via separate event
    this.addPlayer(socketId, userId, username, true);
  }

  addPlayer(socketId, userId, username, isHost = false) {
    this.players.set(socketId, {
      socketId,
      userId,
      username,
      isHost,
      ready: false,
      focused: true,
      focusEvents: [],
      answers: {},
      score: 0,
      walletAddress: null,
      escrowConfirmed: false,
      escrowTx: null,
    });
  }

  setReady(socketId) {
    const p = this.players.get(socketId);
    if (p) p.ready = true;
  }

  allReady() {
    if (this.players.size < 2) return false;
    return [...this.players.values()].every((p) => p.ready);
  }

  updateFocus(socketId, focused) {
    const p = this.players.get(socketId);
    if (p) {
      p.focused = focused;
      p.focusEvents.push({ timestamp: Date.now(), focused });
    }
  }

  getFocusState() {
    const state = {};
    for (const [id, p] of this.players) state[id] = p.focused;
    return state;
  }

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

  bothEscrowConfirmed() {
    return [...this.players.values()].every((p) => p.escrowConfirmed);
  }

  recordAnswer(socketId, questionId, answerId, timeMs) {
    const p = this.players.get(socketId);
    const q = this.quizBank.find((q) => q.id === questionId);
    if (!p || !q) return { correct: false, points: 0 };

    const correct = q.correctAnswer === answerId;
    const speedBonus = correct ? Math.max(0, Math.floor((30000 - timeMs) / 1000)) : 0;
    const points = correct ? 10 + speedBonus : 0;
    p.answers[questionId] = { answerId, correct, points, timeMs };
    p.score += points;

    return { correct, points, correctAnswer: q.correctAnswer };
  }

  getScores() {
    const scores = {};
    for (const [id, p] of this.players) {
      scores[id] = { username: p.username, score: p.score };
    }
    return scores;
  }

  startSession() {
    this.status = 'active';
    this.active = true;
    this.startTime = Date.now();
  }

  endSession() {
    this.status = 'ended';
    this.active = false;
    this.endTime = Date.now();
    if (this.quizTimer) clearTimeout(this.quizTimer);
  }

  getSummary() {
    const players = [...this.players.values()].map((p) => {
      const focusPercent = computeFocusPercent(p.focusEvents, this.startTime, this.endTime);
      const totalAnswers = Object.keys(p.answers).length;
      const correctAnswers = Object.values(p.answers).filter((a) => a.correct).length;
      const quizAccuracy = totalAnswers > 0 ? correctAnswers / totalAnswers : 0;
      const sessionScore = 0.8 * focusPercent + 0.2 * quizAccuracy;
      return {
        socketId: p.socketId,
        userId: p.userId,
        username: p.username,
        focusPercent,
        quizAccuracy,
        totalQuizPoints: p.score,
        sessionScore,
        walletAddress: p.walletAddress,
      };
    });

    players.sort((a, b) => b.sessionScore - a.sessionScore);
    const winner =
      players.length === 2 && players[0].sessionScore > players[1].sessionScore
        ? players[0]
        : null;

    return {
      duration: this.endTime - this.startTime,
      players,
      winner,
      mode: this.mode,
      stakeAmount: this.stakeAmount,
    };
  }

  getState() {
    return {
      code: this.code,
      mode: this.mode,
      stakeAmount: this.stakeAmount,
      status: this.status,
      quizBankReady: this.quizBank.length > 0,
      players: [...this.players.values()].map((p) => ({
        socketId: p.socketId,
        userId: p.userId,
        username: p.username,
        isHost: p.isHost,
        ready: p.ready,
        walletConnected: !!p.walletAddress,
        escrowConfirmed: p.escrowConfirmed,
      })),
    };
  }
}

export class RoomManager {
  constructor() {
    this.rooms = new Map(); // code -> Room
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
    if (!room || room.status !== 'waiting' || room.players.size >= 2) return null;
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

  removePlayer(code, socketId) {
    const room = this.rooms.get(code);
    if (room) {
      room.players.delete(socketId);
      if (room.players.size === 0) this.removeRoom(code);
    }
    this.playerRooms.delete(socketId);
  }

  removeRoom(code) {
    const room = this.rooms.get(code);
    if (room?.quizTimer) clearTimeout(room.quizTimer);
    this.rooms.delete(code);
  }
}
