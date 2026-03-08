import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import { connectDB } from './db/mongoose.js';
import { RoomManager } from './rooms/roomManager.js';
import { QuizService } from './quiz/quizService.js';
import { VoiceService, AUDIO_DIR } from './voice/voiceService.js';
import { EscrowService } from './solana/escrowService.js';
import { executeAtomicPayout } from './solana/payout.js';
import { mintSessionReputation } from './solana/mintReputation.js';
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

// â”€â”€ REST routes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

// â”€â”€ On-chain reputation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// GET /api/reputation/:walletAddress
// Returns BUDDY_WIN + BUDDY_XP balances for the waiting room pre-match display.
app.get('/api/reputation/:walletAddress', async (req, res) => {
  try {
    const { getPlayerReputation } = await import('./solana/mintReputation.js');
    const rep = await getPlayerReputation(req.params.walletAddress);
    res.json(rep);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// â”€â”€ Bet / escrow REST endpoints â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const LAMPORTS_PER_SOL = 1_000_000_000;

/**
 * Snapshot of escrow state for a room â€” used by both the verify response
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
      error: 'Wallet not registered in room â€” emit wallet_connected first',
    });
  }
  if (player.escrowConfirmed) {
    return res.status(409).json({ error: 'Deposit already confirmed for this wallet' });
  }

  // Verify on-chain
  const valid = await escrowService.verifyDeposit(txSignature, walletAddress, room.stakeAmount);
  if (!valid) {
    return res.status(400).json({
      error: 'Transaction could not be verified â€” check signature, amount, and confirmation status',
    });
  }

  // Record and broadcast
  room.confirmEscrow(player.socketId, txSignature);
  broadcastRoomState(room);

  const allConfirmed = room.allEscrowConfirmed();
  if (allConfirmed) {
    io.to(roomCode).emit('escrow_ready');
    // Host must still click START SESSION â€” no auto-start
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

// Returns pre-generated narrator URLs grouped by category â†’ index[]
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

// Screen analysis timeline for all players in a room (live, from in-memory room)
app.get('/api/session/:roomCode/timeline', (req, res) => {
  const room = roomManager.getRoom(req.params.roomCode);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  res.json(room.getAllTimelines());
});

// Per-player study reports â€” served from MongoDB after session ends
app.get('/api/session/:roomCode/report', async (req, res) => {
  try {
    const { Session } = await import('./db/models/Session.js');
    const session = await Session.findOne({ roomCode: req.params.roomCode })
      .sort({ createdAt: -1 })
      .lean();
    if (!session) return res.status(404).json({ error: 'Session not found' });
    // Return per-player study reports extracted from the players array
    const reports = {};
    for (const p of session.players ?? []) {
      reports[p.username] = {
        studyReport: p.studyReport ?? null,
        conceptQuiz: p.conceptQuiz ?? null,
      };
    }
    res.json(reports);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
  // Include full room state so clients have fresh buddySelections on session mount
  io.to(room.code).emit('session_start', {
    startTime: room.startTime,
    narratorAudioUrl,
    roomState: room.getState(),
  });
  scheduleNextQuiz(room);
  console.log(`[room:${room.code}] Session started with ${room.players.size} players`);
}

const QUIZ_ANSWER_WINDOW_MS = 30_000; // players have 30s to answer
const QUIZ_DEFAULT_INTERVAL_S = 30;   // default seconds between quizzes

/**
 * Schedule a personalized quiz round for the room.
 *
 * quizMode 'frequency' â†’ quizValue is minutes between quizzes (e.g. 5 = every 5 min)
 * quizMode 'total'     â†’ quizValue is total quiz count for the session
 *                         interval = sessionDuration / quizValue
 */
function scheduleNextQuiz(room) {
  let intervalSec;
  if (room.quizMode === 'total' && room.quizValue) {
    // Spread N quizzes evenly across the session duration (minutes â†’ seconds)
    const sessionSec = (room.duration || 25) * 60;
    intervalSec = Math.round(sessionSec / room.quizValue);
  } else {
    // 'frequency' mode: quizValue is minutes between quizzes
    intervalSec = (room.quizValue || 5) * 60;
  }
  // Solo mode: cap at 60s so quizzes come quickly for demo
  if (room.mode === 'solo') {
    intervalSec = Math.min(intervalSec, 60);
  }
  // For testing: respect QUIZ_MIN_INTERVAL env override
  const minInterval = parseInt(process.env.QUIZ_MIN_INTERVAL_S, 10) || 10;
  intervalSec = Math.max(minInterval, intervalSec);
  // Add Â±20% jitter so quizzes don't feel robotic
  const jitter = intervalSec * 0.2 * (Math.random() * 2 - 1);
  const delayMs = Math.max(10_000, (intervalSec + jitter) * 1000);
  console.log(`[quiz] Next quiz for room ${room.code} in ${Math.round(delayMs / 1000)}s (interval: ${intervalSec}s, mode: ${room.quizMode}, value: ${room.quizValue})`);
  room.quizTimer = setTimeout(async () => {
    if (!room.active) return;

    const bloomLevel = room.getNextBloomLevel();
    const roundId = randomUUID();
    const playerQuestions = new Map(); // socketId -> question

    // Try to generate personalized questions for each player with concepts
    for (const [socketId, player] of room.players) {
      if (!player.screenConcepts.length) continue;
      try {
        const q = await screenAgent.generatePersonalizedQuestion(player.screenConcepts, bloomLevel);
        if (q) playerQuestions.set(socketId, q);
      } catch (err) {
        console.error(`[quiz] Personalized question gen failed for ${player.username}:`, err.message);
      }
    }

    if (playerQuestions.size > 0) {
      // â”€â”€ Personalized round â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      room.startPersonalizedRound(roundId, playerQuestions, bloomLevel);

      // Emit personalized question to each player individually (staggered 500ms to spread load)
      let delay = 0;
      for (const [socketId, q] of playerQuestions) {
        setTimeout(() => {
          console.log(`[quiz] Emitting surprise-quiz to ${socketId}, question: "${q.question?.substring(0, 60)}"`);
          io.to(socketId).emit('surprise-quiz', {
            // Attach roundId and personalized flag directly on the question object
            // so the client QuizOverlay can match quiz-results events by roundId
            question: { ...q, roundId, personalized: true },
            windowMs: QUIZ_ANSWER_WINDOW_MS,
            personalized: true,
            bloomLevel,
          });
        }, delay);
        delay += 500;
      }

      console.log(
        `[quiz] Personalized round ${roundId} fired in room ${room.code} ` +
        `(${playerQuestions.size} players, bloom: ${bloomLevel})`
      );

      // Close the round after window expires
      room.roundAnswerTimeout = setTimeout(() => {
        closePersonalizedRound(room);
      }, QUIZ_ANSWER_WINDOW_MS);

    } else if (room.quizBank.length && room.quizIndex < room.quizBank.length) {
      // â”€â”€ Fallback: PDF quiz bank (shared question for all players) â”€â”€â”€â”€â”€â”€â”€
      const question = room.quizBank[room.quizIndex++];
      room.setActiveQuestion(question);
      io.to(room.code).emit('surprise-quiz', {
        question,
        windowMs: QUIZ_ANSWER_WINDOW_MS,
        personalized: false,
      });
      console.log(`[quiz] PDF fallback quiz in room ${room.code}: "${question.question.slice(0, 60)}..."`);

      const timeoutId = setTimeout(() => closeQuestion(room, question.id), QUIZ_ANSWER_WINDOW_MS);
      room.answerTimeouts.set(question.id, timeoutId);
    } else {
      console.log(`[quiz] No concepts and no quiz bank for room ${room.code} â€” skipping round`);
    }

    // Schedule the next round regardless
    scheduleNextQuiz(room);
  }, delayMs);
}

/** Close a personalized round and broadcast aggregated results. */
function closePersonalizedRound(room) {
  if (room.roundAnswerTimeout) {
    clearTimeout(room.roundAnswerTimeout);
    room.roundAnswerTimeout = null;
  }
  if (!room.currentRoundId) return;

  const results = room.getRoundResults();
  io.to(room.code).emit('quiz-results', results);
  console.log(`[quiz] Personalized round ${room.currentRoundId} closed in room ${room.code}`);
  room.currentRoundId = null;
}

/** Close a PDF quiz-bank question and broadcast results. */
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
  const roomCode = room.code;
  // Keep a stable snapshot of per-player capture data after room removal.
  const roomPlayersBySocket = new Map(room.players);

  const recapText = summary.players
    .map((p) => `${p.username}: ${(p.focusPercent * 100).toFixed(0)}% focus, ${(p.quizAccuracy * 100).toFixed(0)}% quiz accuracy.`)
    .join(' ') + (summary.winner ? ` The winner is ${summary.winner.username}!` : ' It\'s a tie!');

  const roomMode       = room.mode;
  const roomStartTime  = room.startTime;
  const roomEndTime    = room.endTime;
  const roomStakeAmount = room.stakeAmount;
  const allTimelines   = room.getAllTimelines();

  // â”€â”€ Emit immediately â€” recap screen appears with zero delay â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  io.to(roomCode).emit('session_end', summary);
  roomManager.removeRoom(roomCode);
  console.log(`[room:${roomCode}] Session ended`);

  // â”€â”€ Background group 1: DB writes (XP, leaderboard, session record) â”€â”€â”€â”€â”€â”€â”€â”€â”€
  (async () => {
    const { Session }    = await import('./db/models/Session.js');
    const { User }       = await import('./db/models/User.js');
    const { Leaderboard } = await import('./db/models/Leaderboard.js');

    // Parallelize per-player XP + leaderboard updates
    const playerResults = await Promise.all(summary.players.map(async (p) => {
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
          const today     = new Date().toDateString();
          const yesterday = new Date(Date.now() - 86_400_000).toDateString();
          const lastDate  = user.lastSessionDate
            ? new Date(user.lastSessionDate).toDateString()
            : null;
          if (lastDate === yesterday) user.currentStreak += 1;
          else if (lastDate !== today) user.currentStreak = 1;
          user.longestStreak   = Math.max(user.longestStreak, user.currentStreak);
          user.lastSessionDate = new Date();
          await user.save();
          await Leaderboard.upsertFromSession(p.userId, p.username, {
            focusPercent: p.focusPercent,
            quizAccuracy: p.quizAccuracy,
            won:          summary.winner?.userId === p.userId,
            durationMs:   summary.duration,
            petSpecies:   user.petSpecies,
            petLevel:     user.petLevel,
          });
        }
      } catch (err) {
        console.error(`[endSession] XP update failed for ${p.userId}:`, err.message);
      }
      return {
        userId: p.userId,
        username: p.username,
        focusPercent: p.focusPercent,
        screenStudyPercent: p.screenStudyPercent,
        quizAccuracy: p.quizAccuracy,
        quizCorrectCount: p.quizCorrectCount,
        questionsTotal: p.questionsTotal,
        totalQuizPoints: p.totalQuizPoints,
        responseTimeScore: p.responseTimeScore,
        consistencyScore: p.consistencyScore,
        sessionScore: p.sessionScore,
        xpGained,
        newLevel,
      };
    }));

    // Push XP/level into recap after initial session_end emit.
    summary.players = summary.players.map((p) => {
      const pr = playerResults.find((r) => r.userId === p.userId);
      return pr ? { ...p, xpGained: pr.xpGained, newLevel: pr.newLevel } : p;
    });
    io.to(roomCode).emit('session_recap_update', { players: summary.players });

    try {
      await Session.create({
        roomCode, mode: roomMode,
        participants:   summary.players.map((p) => p.userId),
        players:        playerResults,
        startTime:      new Date(roomStartTime),
        endTime:        new Date(roomEndTime),
        winner:         summary.winner?.userId ?? null,
        stakeAmount:    roomStakeAmount,
        screenTimelines: allTimelines,
      });
    } catch (err) {
      console.error('[endSession] Session save failed:', err.message);
    }
  })().catch((err) => console.error('[endSession] DB error:', err.message));

  // â”€â”€ Background group 2: Solana payout + on-chain reputation minting â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Only runs for locked-in mode; fires independently so it never delays recap.
  (async () => {
    if (roomMode !== 'locked-in' || !roomStakeAmount) return;

    // â”€â”€ Rank-based proportional payout â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const payoutResult = await executeAtomicPayout({
      players: summary.players.map((p) => ({
        walletAddress:  p.walletAddress,
        compositeScore: p.sessionScore, // 0â€“1 composite from room.getSummary()
      })),
      totalStakedLamports: roomStakeAmount * summary.players.length,
      serverEscrowKeypair: escrowService.serverKeypair,
    });

    if (payoutResult.success) {
      io.to(roomCode).emit('session_recap_update', {
        payoutTxSignature: payoutResult.signature,
        payouts:           payoutResult.payouts,
      });
    } else {
      console.error('[payout] Failed:', payoutResult.error);
    }

    // â”€â”€ Mint BUDDY_WIN + BUDDY_XP reputation tokens â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const winMintAddr = process.env.BUDDY_WIN_MINT;
    const xpMintAddr  = process.env.BUDDY_XP_MINT;
    if (winMintAddr && xpMintAddr) {
      const { PublicKey } = await import('@solana/web3.js');

      // Compute player ranks from sessionScore descending
      const sorted = [...summary.players].sort((a, b) => b.sessionScore - a.sessionScore);
      let rank = 1;
      const playersWithRank = sorted.map((p, i) => {
        if (i > 0 && p.sessionScore < sorted[i - 1].sessionScore) rank = i + 1;
        return { ...p, rank, focusScore: p.focusPercent };
      });

      await mintSessionReputation({
        players:              playersWithRank,
        mintAuthorityKeypair: escrowService.serverKeypair,
        winTokenMintAddress:  new PublicKey(winMintAddr),
        xpTokenMintAddress:   new PublicKey(xpMintAddr),
      });
    }
  })().catch((err) => console.error('[solana] Background Solana error:', err.message));

  // â”€â”€ Background group 3: per-player AI reports + recap audio â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  (async () => {
    const playersPromise =
      Promise.all(summary.players.map(async (sp) => {
        const rp = roomPlayersBySocket.get(sp.socketId);
        const out = { ...sp, conceptQuiz: null, studyReport: null };
        if (!rp) return out;

        const [conceptResult, reportResult] = await Promise.allSettled([
          rp.screenConcepts?.length
            ? screenAgent.generateConceptQuiz(rp.screenConcepts)
            : Promise.resolve(null),
          rp.screenTimeline?.length
            ? screenAgent.generateStudyReport(rp.screenTimeline)
            : Promise.resolve(null),
        ]);

        if (conceptResult.status === 'fulfilled' && conceptResult.value) {
          out.conceptQuiz = conceptResult.value;
          console.log(`[screen] ${out.conceptQuiz.length} concept quiz questions for ${sp.username}`);
        } else if (conceptResult.status === 'rejected') {
          console.error(`[screen] Concept quiz failed for ${sp.username}:`, conceptResult.reason?.message);
        }

        if (reportResult.status === 'fulfilled' && reportResult.value) {
          out.studyReport = reportResult.value;
          console.log(`[screen] Study report generated for ${sp.username}`);
        } else if (reportResult.status === 'rejected') {
          console.error(`[screen] Study report failed for ${sp.username}:`, reportResult.reason?.message);
        }

        return out;
      }));
    const audioPromise = voiceService.generateRecapAudio(recapText, roomCode);
    const [playersWithReports, audioSettled] = await Promise.all([
      playersPromise,
      Promise.allSettled([audioPromise]),
    ]);

    summary.players = playersWithReports;
    const update = { players: playersWithReports };
    const audioResult = audioSettled[0];

    if (audioResult.status === 'fulfilled' && audioResult.value) {
      update.recapAudioUrl = audioResult.value;
    } else if (audioResult.status === 'rejected') {
      console.error('[voice] Recap audio generation failed:', audioResult.reason?.message);
    }

    if (Object.keys(update).length > 0) {
      io.to(roomCode).emit('session_recap_update', update);
    }
  })().catch((err) => console.error('[endSession] AI/audio error:', err.message));
}

// â”€â”€ Socket.io â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

io.on('connection', (socket) => {
  console.log('[socket] connected:', socket.id);

  // â”€â”€ create_room â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  socket.on('create_room', ({ userId, username, mode, stakeAmount }) => {
    const room = roomManager.createRoom(socket.id, userId, username, mode, stakeAmount);
    socket.join(room.code);
    // creator receives the new state; no broadcast needed (only 1 player so far)
    socket.emit('room_created', room.getState());
    console.log(`[room:${room.code}] Created by ${username} (${mode})`);
  });

  // â”€â”€ join_room â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€ player_ready â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  socket.on('player_ready', ({ roomCode }) => {
    const room = roomManager.getRoom(roomCode);
    if (!room || room.status !== 'waiting') return;

    room.setReady(socket.id);
    broadcastRoomState(room); // everyone sees the updated ready state
  });

  // â”€â”€ player_unready â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  socket.on('player_unready', ({ roomCode }) => {
    const room = roomManager.getRoom(roomCode);
    if (!room || room.status !== 'waiting') return;
    room.setUnready(socket.id);
    broadcastRoomState(room);
  });

  // â”€â”€ select_buddy â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  socket.on('select_buddy', ({ roomCode, buddy }) => {
    const room = roomManager.getRoom(roomCode);
    if (!room) return;
    room.selectBuddy(socket.id, buddy);
    io.to(roomCode).emit('buddy_update', room.buddySelections);
    broadcastRoomState(room); // keeps store.room.buddySelections in sync
  });

  // â”€â”€ update_settings (host only) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  socket.on('update_settings', ({ roomCode, duration, quizMode, quizValue }) => {
    const room = roomManager.getRoom(roomCode);
    if (!room || room.status !== 'waiting') return;
    const player = room.players.get(socket.id);
    if (!player?.isHost) return;
    room.updateSettings(duration, quizMode, quizValue);
    io.to(roomCode).emit('settings_updated', { duration, quizMode, quizValue });
    broadcastRoomState(room);
  });

  // â”€â”€ update_mode (host only) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  socket.on('update_mode', ({ roomCode, mode, stakeAmount }) => {
    const room = roomManager.getRoom(roomCode);
    if (!room || room.status !== 'waiting') return;
    const player = room.players.get(socket.id);
    if (!player?.isHost) return;
    room.updateMode(mode, stakeAmount);
    io.to(roomCode).emit('mode_updated', { mode, stakeAmount });
    broadcastRoomState(room);
  });

  // â”€â”€ start_session (host explicit) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  socket.on('start_session', ({ roomCode }) => {
    const room = roomManager.getRoom(roomCode);
    if (!room || room.status !== 'waiting') return;
    const player = room.players.get(socket.id);
    if (!player?.isHost) return;
    if (!room.allReady()) return;
    // Solo rooms skip escrow check entirely
    if (room.mode === 'locked-in' && !room.allEscrowConfirmed()) return;
    startSession(room);
  });

  // â”€â”€ focus_update â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
    // (The sender already knows their own focused state â€” they sent it.)
    socket.to(roomCode).emit('focus_update', {
      playerId: socket.id,
      focused,
      players: focusData,
    });
  });

  // â”€â”€ screen-capture â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

      // Send full analysis back to the capturing player
      socket.emit('screen-analysis', analysis);

      // Broadcast subject update to all room members so everyone can see each other's subject
      io.to(roomCode).emit('subject_update', {
        socketId: socket.id,
        subject: analysis.subject,
        is_studying: analysis.is_studying,
        distraction: analysis.distraction,
      });

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

  // â”€â”€ quiz_answer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Client emits: { roomCode, questionId, answerIndex: 0-3, timeMs }
  // Routes to personalized-round handler or PDF quiz-bank handler based on
  // which map the questionId is found in.
  socket.on('quiz_answer', ({ roomCode, questionId, answerIndex, timeMs }) => {
    const room = roomManager.getRoom(roomCode);
    if (!room || !room.active) return;

    if (room.personalizedQuestions.has(questionId)) {
      // â”€â”€ Personalized round answer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      const result = room.recordPersonalizedAnswer(socket.id, questionId, answerIndex, timeMs);
      if (!result) return;

      socket.emit('quiz-answer-ack', {
        questionId,
        correct: result.correct,
        points: result.points,
        correctAnswerIndex: result.correctAnswerIndex,
      });

      // If all players in this round answered early, close immediately
      if (room.allRoundAnswered()) {
        closePersonalizedRound(room);
      }
    } else {
      // â”€â”€ PDF quiz-bank answer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      const result = room.recordAnswer(socket.id, questionId, answerIndex, timeMs);
      if (!result) return;

      socket.emit('quiz-answer-ack', {
        questionId,
        correct: result.correct,
        points: result.points,
        correctAnswerIndex: result.correctAnswerIndex,
      });

      if (room.allPlayersAnswered(questionId)) {
        closeQuestion(room, questionId);
      }
    }
  });

  // â”€â”€ wallet_connected â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  socket.on('wallet_connected', ({ roomCode, walletAddress }) => {
    const room = roomManager.getRoom(roomCode);
    if (!room) return;
    room.setWallet(socket.id, walletAddress);
    broadcastRoomState(room);
  });

  // â”€â”€ escrow_confirmed â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
      // Host must still click START SESSION â€” no auto-start
    }
  });

  // â”€â”€ close_room (host only) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  socket.on('close_room', ({ roomCode }) => {
    const room = roomManager.getRoom(roomCode);
    if (!room) return;
    const player = room.players.get(socket.id);
    if (!player?.isHost) return;

    // Notify everyone in the room
    io.to(roomCode).emit('room_closed', { reason: 'Host closed the room' });

    // Remove all players from the socket room and clean up
    for (const [sid] of room.players) {
      const s = io.sockets.sockets.get(sid);
      if (s) s.leave(roomCode);
      roomManager.playerRooms.delete(sid);
    }
    roomManager.removeRoom(roomCode);
    console.log(`[room] Room ${roomCode} closed by host ${player.username}`);
  });

  // â”€â”€ end_session â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  socket.on('end_session', ({ roomCode }) => {
    const room = roomManager.getRoom(roomCode);
    if (!room || !room.active) return;
    endSession(room);
  });

  // â”€â”€ disconnect â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€ Boot â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const PORT = process.env.PORT || 3001;
connectDB().then(() => {
  httpServer.listen(PORT, () => {
    console.log(`Buddy Lock-In server â†’ http://localhost:${PORT}`);
    voiceService.preGenerateNarratorLines().catch((err) =>
      console.error('[voice] Startup narrator generation failed:', err.message)
    );
  });
});

