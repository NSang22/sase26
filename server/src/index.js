import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { connectDB } from './db/mongoose.js';
import { RoomManager } from './rooms/roomManager.js';
import { QuizService } from './quiz/quizService.js';
import { VoiceService, AUDIO_DIR } from './voice/voiceService.js';
import { EscrowService } from './solana/escrowService.js';
import { ScreenAgent } from './services/screenAgent.js';
import authRouter from './routes/auth.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

dotenv.config();

const CLIENT_ORIGIN = (process.env.CLIENT_URL || 'http://localhost:5173').replace(/\/$/, '');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: CLIENT_ORIGIN,
    methods: ['GET', 'POST'],
  },
});

app.use(cors({ origin: CLIENT_ORIGIN }));
app.use(express.json());

// Serve pre-generated audio files (reactions + quiz TTS)
// e.g. GET /audio/reactions/cat/focus-lost-2.mp3
//      GET /audio/quiz/<questionId>.mp3
app.use('/audio', express.static(AUDIO_DIR, { maxAge: '7d' }));

const upload = multer({ storage: multer.memoryStorage() });
const roomManager = new RoomManager();
const quizService = new QuizService();
const voiceService = new VoiceService();
const escrowService = new EscrowService();
const screenAgent = new ScreenAgent();

// ── REST routes ──────────────────────────────────────────────────────────────

// Accepts a PDF or text file + roomCode in form-data.
// Generates quiz bank, stores it on the room, pre-generates TTS audio.
// Also accessible as the legacy route /api/rooms/:code/material (same handler).
async function handleQuizUpload(req, res) {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    // roomCode comes from URL param (legacy route) or form field (new route)
    const roomCode = req.params.code ?? req.body.roomCode;
    if (!roomCode) return res.status(400).json({ error: 'roomCode required' });

    const room = roomManager.getRoom(roomCode);
    if (!room) return res.status(404).json({ error: 'Room not found' });

    const questions = await quizService.generateFromFile(req.file);
    room.quizBank = questions;
    room.quizIndex = 0; // reset in case of re-upload

    // Pre-generate TTS for each question in the background (non-blocking)
    voiceService.preGenerateQuizAudio(questions).catch((err) =>
      console.error('[voice] preGenerateQuizAudio failed:', err.message)
    );

    console.log(`[quiz] ${questions.length} questions stored for room ${roomCode}`);
    res.json({ questionCount: questions.length, questions });
  } catch (err) {
    console.error('[quiz upload]', err);
    res.status(500).json({ error: err.message });
  }
}

app.post('/api/generate-quizzes', upload.single('file'), handleQuizUpload);
app.post('/api/rooms/:code/material', upload.single('file'), handleQuizUpload);

app.get('/api/rooms/:code/escrow-address', (req, res) => {
  const room = roomManager.getRoom(req.params.code);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  if (room.mode !== 'locked-in') return res.status(400).json({ error: 'Not a Locked In room' });
  res.json({ address: escrowService.getDepositAddress() });
});

// ── Bet / escrow REST endpoints ───────────────────────────────────────────────

const LAMPORTS_PER_SOL = 1_000_000_000;

/**
 * Snapshot of escrow state for a room — used by both the verify response
 * and the status polling endpoint.
 */
function getBetStatus(room) {
  const players = [...room.players.values()].map((p) => ({
    username: p.username,
    walletAddress: p.walletAddress ?? null,
    walletConnected: !!p.walletAddress,
    escrowConfirmed: p.escrowConfirmed,
    escrowTx: p.escrowTx ?? null,
  }));

  const confirmedCount = players.filter((p) => p.escrowConfirmed).length;
  const totalPotLamports = room.stakeAmount * room.players.size;

  return {
    roomCode: room.code,
    mode: room.mode,
    stakeAmountLamports: room.stakeAmount,
    stakeAmountSol: room.stakeAmount / LAMPORTS_PER_SOL,
    totalPotLamports,
    totalPotSol: totalPotLamports / LAMPORTS_PER_SOL,
    depositAddress: escrowService.getDepositAddress(),
    confirmedCount,
    requiredCount: room.players.size,
    allConfirmed: room.allEscrowConfirmed(),
    players,
  };
}

/**
 * POST /api/bet/verify
 * Body: { roomCode, txSignature, walletAddress }
 *
 * Alternative to the socket-based escrow_confirmed flow.
 * Verifies the on-chain deposit and records it on the room, then broadcasts
 * the updated room state. If all players are confirmed and ready, starts the session.
 */
app.post('/api/bet/verify', async (req, res) => {
  const { roomCode, txSignature, walletAddress } = req.body;

  if (!roomCode || !txSignature || !walletAddress) {
    return res.status(400).json({ error: 'roomCode, txSignature, and walletAddress required' });
  }

  const room = roomManager.getRoom(roomCode);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  if (room.mode !== 'locked-in') return res.status(400).json({ error: 'Not a Locked In room' });

  // Find player by their registered wallet address
  const player = [...room.players.values()].find((p) => p.walletAddress === walletAddress);
  if (!player) {
    return res.status(400).json({
      error: 'Wallet not registered in room — emit wallet_connected first',
    });
  }
  if (player.escrowConfirmed) {
    return res.status(409).json({ error: 'Deposit already confirmed for this wallet' });
  }

  // Verify on-chain
  const valid = await escrowService.verifyDeposit(txSignature, walletAddress, room.stakeAmount);
  if (!valid) {
    return res.status(400).json({
      error: 'Transaction could not be verified — check signature, amount, and confirmation status',
    });
  }

  // Record and broadcast
  room.confirmEscrow(player.socketId, txSignature);
  broadcastRoomState(room);

  const allConfirmed = room.allEscrowConfirmed();
  if (allConfirmed) {
    io.to(roomCode).emit('escrow_ready');
    if (shouldStartSession(room)) startSession(room);
  }

  res.json({ confirmed: true, allConfirmed, status: getBetStatus(room) });
});

/**
 * GET /api/bet/status/:roomCode
 *
 * Returns the current escrow state for a room so the frontend can poll.
 * Safe to call at any point during the waiting phase.
 */
app.get('/api/bet/status/:roomCode', (req, res) => {
  const room = roomManager.getRoom(req.params.roomCode);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  res.json(getBetStatus(room));
});

// Returns pre-generated narrator URLs grouped by category → index[]
// Client uses this on mount to know which files exist before events fire.
app.get('/api/audio/narrator', (_req, res) => {
  res.json(voiceService.getNarratorManifest());
});

app.get('/api/leaderboard', async (_req, res) => {
  const { Leaderboard } = await import('./db/models/Leaderboard.js');
  const entries = await Leaderboard.find().sort({ totalFocusTime: -1 }).limit(20).lean();
  res.json(entries);
});

app.use('/api', authRouter);

// Stub: return user's previous uploaded materials (empty for now)
app.get('/api/users/materials', (_req, res) => {
  res.json([]);
});

// Stub: reuse a previous material in a room
app.post('/api/rooms/:code/material/reuse', (_req, res) => {
  res.status(501).json({ error: 'Not implemented yet' });
});

// Screen analysis timeline for all players in a room
app.get('/api/session/:roomCode/timeline', (req, res) => {
  const room = roomManager.getRoom(req.params.roomCode);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  res.json(room.getAllTimelines());
});

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Broadcast the full room state to every player in the room. */
function broadcastRoomState(room) {
  io.to(room.code).emit('room_update', room.getState());
}

/**
 * Returns true when a session should auto-start:
 *   - Casual: all ready (min 2)
 *   - Locked-in: all ready AND all escrows confirmed
 */
function shouldStartSession(room) {
  if (!room.allReady()) return false;
  if (room.mode === 'locked-in') return room.allEscrowConfirmed();
  return true;
}

function startSession(room) {
  room.startSession();
  // Include narrator session-start audio URL
  const narratorAudioUrl = voiceService.getNarratorUrl('session-start');
  io.to(room.code).emit('session_start', { startTime: room.startTime, narratorAudioUrl });
  scheduleNextQuiz(room);
  console.log(`[room:${room.code}] Session started with ${room.players.size} players`);
}

const QUIZ_ANSWER_WINDOW_MS = 30_000; // players have 30s to answer

function scheduleNextQuiz(room) {
  if (!room.quizBank.length || room.quizIndex >= room.quizBank.length) return;

  const delayMs = (5 + Math.random() * 5) * 60 * 1000; // 5–10 min random interval
  room.quizTimer = setTimeout(() => {
    if (!room.active) return;

    const question = room.quizBank[room.quizIndex++];
    room.setActiveQuestion(question);

    // Emit to ALL players simultaneously so everyone sees the same question
    io.to(room.code).emit('surprise-quiz', {
      question,
      windowMs: QUIZ_ANSWER_WINDOW_MS,
    });
    console.log(`[quiz] surprise-quiz fired in room ${room.code}: "${question.question.slice(0, 60)}..."`);

    // After 30s, close the question and broadcast results regardless of who answered
    const timeoutId = setTimeout(() => {
      closeQuestion(room, question.id);
    }, QUIZ_ANSWER_WINDOW_MS);
    room.answerTimeouts.set(question.id, timeoutId);

    // Schedule the next quiz after this one resolves
    scheduleNextQuiz(room);
  }, delayMs);
}

/** Broadcast results for a question and clear its tracking state. */
function closeQuestion(room, questionId) {
  const timeoutId = room.answerTimeouts.get(questionId);
  if (timeoutId) {
    clearTimeout(timeoutId);
    room.answerTimeouts.delete(questionId);
  }

  const results = room.getQuestionResults(questionId);
  io.to(room.code).emit('quiz-results', results);

  if (room.currentQuestion?.id === questionId) {
    room.currentQuestion = null;
  }
}

async function endSession(room) {
  room.endSession();
  const summary = room.getSummary();

  // ── Per-player XP awards, stat updates, and leaderboard upserts ────────────
  const { Session } = await import('./db/models/Session.js');
  const { User } = await import('./db/models/User.js');
  const { Leaderboard } = await import('./db/models/Leaderboard.js');

  const playerResults = [];

  for (const p of summary.players) {
    // XP = focus_percentage * 100 + quiz_correct * 10
    const xpGained = Math.round(p.focusPercent * 100) + p.quizCorrectCount * 10;
    let newLevel = null;

    try {
      const user = await User.findById(p.userId);
      if (user) {
        const leveled = user.addXP(xpGained);
        if (leveled) newLevel = user.petLevel;

        user.totalFocusMinutes += summary.duration / 60000;
        user.totalSessions += 1;
        if (summary.winner?.userId === p.userId) user.wins += 1;

        // Daily study streak: increment if last session was yesterday, reset otherwise
        const today = new Date().toDateString();
        const yesterday = new Date(Date.now() - 86_400_000).toDateString();
        const lastDate = user.lastSessionDate
          ? new Date(user.lastSessionDate).toDateString()
          : null;
        if (lastDate === today) {
          // already played today — no streak change
        } else if (lastDate === yesterday) {
          user.currentStreak += 1;
        } else {
          user.currentStreak = 1;
        }
        user.longestStreak = Math.max(user.longestStreak, user.currentStreak);
        user.lastSessionDate = new Date();
        await user.save();

        await Leaderboard.upsertFromSession(p.userId, p.username, {
          focusPercent: p.focusPercent,
          quizAccuracy: p.quizAccuracy,
          won: summary.winner?.userId === p.userId,
          durationMs: summary.duration,
          petSpecies: user.petSpecies,
          petLevel: user.petLevel,
        });
      }
    } catch (err) {
      console.error(`[endSession] XP update failed for ${p.userId}:`, err.message);
    }

    playerResults.push({
      userId: p.userId,
      username: p.username,
      focusPercent: p.focusPercent,
      quizAccuracy: p.quizAccuracy,
      quizCorrectCount: p.quizCorrectCount,
      totalQuizPoints: p.totalQuizPoints,
      sessionScore: p.sessionScore,
      xpGained,
      newLevel,
    });

    // Attach xpGained + newLevel to the summary so the recap screen can show it
    p.xpGained = xpGained;
    p.newLevel = newLevel;
  }

  // ── Persist session ─────────────────────────────────────────────────────────
  try {
    await Session.create({
      roomCode: room.code,
      mode: room.mode,
      participants: summary.players.map((p) => p.userId),
      players: playerResults,
      startTime: new Date(room.startTime),
      endTime: new Date(room.endTime),
      winner: summary.winner?.userId ?? null,
      stakeAmount: room.stakeAmount,
      studyReport: summary.studyReport ?? null,
      screenTimelines: room.getAllTimelines(),
    });
  } catch (err) {
    console.error('[endSession] Session save failed:', err.message);
  }

  // ── Solana payout ───────────────────────────────────────────────────────────
  const payoutTx = await escrowService.handleSessionPayout(summary);
  if (payoutTx) summary.payoutTxSignature = payoutTx;

  // ── Screen-based concept quiz (from screen captures, not PDF) ─────────────
  try {
    // Gather all unique concepts across all players
    const allConcepts = [];
    for (const p of room.players.values()) {
      for (const c of p.screenConcepts) {
        if (!allConcepts.includes(c)) allConcepts.push(c);
      }
    }
    if (allConcepts.length > 0) {
      const conceptQuiz = await screenAgent.generateConceptQuiz(allConcepts);
      summary.conceptQuiz = conceptQuiz;
      console.log(`[screen] Generated ${conceptQuiz.length} concept quiz questions from ${allConcepts.length} concepts`);
    }
  } catch (err) {
    console.error('[screen] Concept quiz generation failed:', err.message);
  }

  // ── Study report from screen timelines ────────────────────────────────────
  try {
    const allTimeline = [];
    for (const p of room.players.values()) {
      for (const entry of p.screenTimeline) {
        allTimeline.push({ ...entry, username: p.username });
      }
    }
    allTimeline.sort((a, b) => a.timestamp - b.timestamp);
    if (allTimeline.length > 0) {
      const studyReport = await screenAgent.generateStudyReport(allTimeline);
      summary.studyReport = studyReport;
      console.log('[screen] Study report generated');
    }
  } catch (err) {
    console.error('[screen] Study report generation failed:', err.message);
  }

  // ── Generate recap narration (ElevenLabs) ─────────────────────────────────
  try {
    const recapText = summary.players
      .map((p) => `${p.username}: ${(p.focusPercent * 100).toFixed(0)}% focus, ${(p.quizAccuracy * 100).toFixed(0)}% quiz accuracy.`)
      .join(' ') + (summary.winner ? ` The winner is ${summary.winner.username}!` : ' It\'s a tie!');
    const recapUrl = await voiceService.generateRecapAudio(recapText, room.code);
    if (recapUrl) summary.recapAudioUrl = recapUrl;
  } catch (err) {
    console.error('[voice] Recap audio generation failed:', err.message);
  }

  io.to(room.code).emit('session_end', summary);
  roomManager.removeRoom(room.code);
  console.log(`[room:${room.code}] Session ended`);
}

// ── Socket.io ────────────────────────────────────────────────────────────────

io.on('connection', (socket) => {
  console.log('[socket] connected:', socket.id);

  // ── create_room ──────────────────────────────────────────────────────────
  socket.on('create_room', ({ userId, username, mode, stakeAmount }) => {
    const room = roomManager.createRoom(socket.id, userId, username, mode, stakeAmount);
    socket.join(room.code);
    // creator receives the new state; no broadcast needed (only 1 player so far)
    socket.emit('room_created', room.getState());
    console.log(`[room:${room.code}] Created by ${username} (${mode})`);
  });

  // ── join_room ────────────────────────────────────────────────────────────
  socket.on('join_room', ({ roomCode, userId, username }) => {
    const room = roomManager.joinRoom(roomCode, socket.id, userId, username);
    if (!room) {
      return socket.emit('error', { message: 'Room not found, full, or already in progress' });
    }
    socket.join(roomCode);
    // Tell the joiner they're in, then broadcast the updated state to everyone
    socket.emit('room_joined', room.getState());
    broadcastRoomState(room);
    console.log(`[room:${roomCode}] ${username} joined (${room.players.size}/${room.getState().maxPlayers})`);
  });

  // ── player_ready ─────────────────────────────────────────────────────────
  socket.on('player_ready', ({ roomCode }) => {
    const room = roomManager.getRoom(roomCode);
    if (!room || room.status !== 'waiting') return;

    room.setReady(socket.id);
    broadcastRoomState(room); // everyone sees the updated ready state
  });

  // ── player_unready ───────────────────────────────────────────────────────
  socket.on('player_unready', ({ roomCode }) => {
    const room = roomManager.getRoom(roomCode);
    if (!room || room.status !== 'waiting') return;
    room.setUnready(socket.id);
    broadcastRoomState(room);
  });

  // ── select_buddy ─────────────────────────────────────────────────────────
  socket.on('select_buddy', ({ roomCode, buddy }) => {
    const room = roomManager.getRoom(roomCode);
    if (!room) return;
    room.selectBuddy(socket.id, buddy);
    io.to(roomCode).emit('buddy_update', room.buddySelections);
  });

  // ── update_settings (host only) ──────────────────────────────────────────
  socket.on('update_settings', ({ roomCode, duration, quizMode, quizValue }) => {
    const room = roomManager.getRoom(roomCode);
    if (!room || room.status !== 'waiting') return;
    const player = room.players.get(socket.id);
    if (!player?.isHost) return;
    room.updateSettings(duration, quizMode, quizValue);
    io.to(roomCode).emit('settings_updated', { duration, quizMode, quizValue });
  });

  // ── update_mode (host only) ──────────────────────────────────────────────
  socket.on('update_mode', ({ roomCode, mode, stakeAmount }) => {
    const room = roomManager.getRoom(roomCode);
    if (!room || room.status !== 'waiting') return;
    const player = room.players.get(socket.id);
    if (!player?.isHost) return;
    room.updateMode(mode, stakeAmount);
    io.to(roomCode).emit('mode_updated', { mode, stakeAmount });
    broadcastRoomState(room);
  });

  // ── start_session (host explicit) ────────────────────────────────────────
  socket.on('start_session', ({ roomCode }) => {
    const room = roomManager.getRoom(roomCode);
    if (!room || room.status !== 'waiting') return;
    const player = room.players.get(socket.id);
    if (!player?.isHost) return;
    if (!room.allReady()) return;
    if (room.mode === 'locked-in' && !room.allEscrowConfirmed()) return;
    startSession(room);
  });

  // ── focus_update ─────────────────────────────────────────────────────────
  // Client emits: { roomCode, focused: boolean }
  // Server broadcasts to all OTHER players: { playerId, focused, players[] }
  // players[] includes live focus_percentage for every player so clients can
  // update focus rings, pet animations, and the HUD score display without
  // doing their own time math.
  socket.on('focus_update', ({ roomCode, focused }) => {
    const room = roomManager.getRoom(roomCode);
    if (!room || !room.active) return;

    // Flip the player's focus state and bank / start the running timer
    room.updateFocus(socket.id, focused);

    // Compute live focus_percentage for all players at this exact moment
    const now = Date.now();
    const focusData = room.getLiveFocusData(now);

    // Broadcast to all OTHER players in the room.
    // (The sender already knows their own focused state — they sent it.)
    socket.to(roomCode).emit('focus_update', {
      playerId: socket.id,
      focused,
      players: focusData,
    });
  });

  // ── screen-capture ───────────────────────────────────────────────────────
  // Client emits: { roomCode, image: base64string, mimeType? }
  // Server analyzes via Gemini Vision, stores result, detects fake focus
  socket.on('screen-capture', async ({ roomCode, image, mimeType }) => {
    const room = roomManager.getRoom(roomCode);
    if (!room || !room.active) return;

    const player = room.players.get(socket.id);
    if (!player) return;

    try {
      const analysis = await screenAgent.analyzeScreen(image, mimeType || 'image/png');
      room.recordScreenAnalysis(socket.id, analysis);

      // Send analysis back to the capturing player
      socket.emit('screen-analysis', analysis);

      // Fake-focus detection: MediaPipe says focused but screen says not studying
      if (player.focused && !analysis.is_studying) {
        room.updateFocus(socket.id, false);
        const now = Date.now();
        const focusData = room.getLiveFocusData(now);
        io.to(roomCode).emit('fake-focus', {
          playerId: socket.id,
          distraction: analysis.distraction,
          players: focusData,
        });
        // Also emit a normal focus_update so HUD/rings update
        io.to(roomCode).emit('focus_update', {
          playerId: socket.id,
          focused: false,
          players: focusData,
        });
        console.log(`[screen] Fake focus detected for ${player.username}: ${analysis.distraction}`);
      }
    } catch (err) {
      console.error(`[screen] Analysis failed for ${player.username}:`, err.message);
    }
  });

  // ── quiz_answer ──────────────────────────────────────────────────────────
  // Client emits: { roomCode, questionId, answerIndex: 0-3, timeMs }
  // Server:
  //   1. Records answer and scores it
  //   2. Sends a private ack back to the answering player
  //   3. If all players have answered → closes question immediately and
  //      broadcasts quiz-results to everyone
  socket.on('quiz_answer', ({ roomCode, questionId, answerIndex, timeMs }) => {
    const room = roomManager.getRoom(roomCode);
    if (!room || !room.active) return;

    const result = room.recordAnswer(socket.id, questionId, answerIndex, timeMs);
    if (!result) return; // duplicate answer or unknown question — ignore

    // Private ack: tell this player whether they were right
    socket.emit('quiz-answer-ack', {
      questionId,
      correct: result.correct,
      points: result.points,
      correctAnswerIndex: result.correctAnswerIndex,
    });

    // If all players answered early, resolve immediately (don't wait for timeout)
    if (room.allPlayersAnswered(questionId)) {
      closeQuestion(room, questionId);
    }
  });

  // ── wallet_connected ─────────────────────────────────────────────────────
  socket.on('wallet_connected', ({ roomCode, walletAddress }) => {
    const room = roomManager.getRoom(roomCode);
    if (!room) return;
    room.setWallet(socket.id, walletAddress);
    broadcastRoomState(room);
  });

  // ── escrow_confirmed ─────────────────────────────────────────────────────
  socket.on('escrow_confirmed', async ({ roomCode, txSignature, walletAddress }) => {
    const room = roomManager.getRoom(roomCode);
    if (!room) return;

    const valid = await escrowService.verifyDeposit(txSignature, walletAddress, room.stakeAmount);
    if (!valid) {
      return socket.emit('error', { message: 'Deposit transaction could not be verified on-chain' });
    }

    room.confirmEscrow(socket.id, txSignature);
    broadcastRoomState(room);

    if (room.allEscrowConfirmed()) {
      io.to(roomCode).emit('escrow_ready');
      // Auto-start if everyone is also marked ready
      if (shouldStartSession(room)) startSession(room);
    }
  });

  // ── end_session ──────────────────────────────────────────────────────────
  socket.on('end_session', ({ roomCode }) => {
    const room = roomManager.getRoom(roomCode);
    if (!room || !room.active) return;
    endSession(room);
  });

  // ── disconnect ───────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    const room = roomManager.removePlayer(socket.id);

    if (room && room.players.size > 0) {
      // Promote a new host if the host left
      if (!room.players.size === 0) {
        const next = room.players.values().next().value;
        if (next) next.isHost = true;
      }
      // Notify everyone still in the room
      io.to(room.code).emit('player_left', {
        playerId: socket.id,
        players: room.getState().players,
      });
      // If session was active and now below min players, end it
      if (room.active && room.players.size < 2) {
        endSession(room);
      }
    }

    console.log('[socket] disconnected:', socket.id);
  });
});

// ── Boot ─────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3001;
connectDB().then(() => {
  httpServer.listen(PORT, () => {
    console.log(`Buddy Lock-In server → http://localhost:${PORT}`);
    voiceService.preGenerateNarratorLines().catch((err) =>
      console.error('[voice] Startup narrator generation failed:', err.message)
    );
  });
});
