import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import { connectDB } from './db/mongoose.js';
import { RoomManager } from './rooms/roomManager.js';
import { QuizService } from './quiz/quizService.js';
import { VoiceService } from './voice/voiceService.js';
import { EscrowService } from './solana/escrowService.js';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    methods: ['GET', 'POST'],
  },
});

app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173' }));
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage() });
const roomManager = new RoomManager();
const quizService = new QuizService();
const voiceService = new VoiceService();
const escrowService = new EscrowService();

// --- REST Routes ---

app.post('/api/rooms', (req, res) => {
  const { socketId, userId, username, mode, stakeAmount } = req.body;
  const room = roomManager.createRoom(socketId, userId, username, mode, stakeAmount);
  res.json(room.getState());
});

app.post('/api/rooms/:code/material', upload.single('file'), async (req, res) => {
  try {
    const room = roomManager.getRoom(req.params.code);
    if (!room) return res.status(404).json({ error: 'Room not found' });

    const questions = await quizService.generateFromFile(req.file);
    room.quizBank = questions;

    // Pre-generate TTS audio for each question
    await voiceService.preGenerateQuizAudio(questions, room.petSpecies);

    res.json({ questionCount: questions.length });
  } catch (err) {
    console.error('[material upload]', err);
    res.status(500).json({ error: err.message });
  }
});

// Returns the server wallet address so clients know where to send SOL
app.get('/api/rooms/:code/escrow-address', (req, res) => {
  const room = roomManager.getRoom(req.params.code);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  if (room.mode !== 'locked-in') return res.status(400).json({ error: 'Not a Locked In room' });
  res.json({ address: escrowService.getDepositAddress() });
});

app.get('/api/leaderboard', async (_req, res) => {
  const { Leaderboard } = await import('./db/models/Leaderboard.js');
  const entries = await Leaderboard.find()
    .sort({ totalFocusTime: -1 })
    .limit(20)
    .lean();
  res.json(entries);
});

// --- Socket.io ---

io.on('connection', (socket) => {
  console.log('[socket] connected:', socket.id);

  socket.on('create_room', ({ userId, username, mode, stakeAmount }) => {
    const room = roomManager.createRoom(socket.id, userId, username, mode, stakeAmount);
    socket.join(room.code);
    socket.emit('room_created', room.getState());
  });

  socket.on('join_room', ({ roomCode, userId, username }) => {
    const room = roomManager.joinRoom(roomCode, socket.id, userId, username);
    if (!room) return socket.emit('error', { message: 'Room not found or full' });
    socket.join(roomCode);
    io.to(roomCode).emit('room_update', room.getState());
  });

  socket.on('player_ready', ({ roomCode }) => {
    const room = roomManager.getRoom(roomCode);
    if (!room) return;
    room.setReady(socket.id);
    io.to(roomCode).emit('room_update', room.getState());
    if (room.allReady()) {
      startSession(io, room);
    }
  });

  socket.on('focus_update', ({ roomCode, focused }) => {
    const room = roomManager.getRoom(roomCode);
    if (!room || !room.active) return;
    room.updateFocus(socket.id, focused);
    io.to(roomCode).emit('focus_update', {
      playerId: socket.id,
      focused,
      roomFocusState: room.getFocusState(),
    });
  });

  socket.on('quiz_answer', ({ roomCode, questionId, answerId, timeMs }) => {
    const room = roomManager.getRoom(roomCode);
    if (!room) return;
    const result = room.recordAnswer(socket.id, questionId, answerId, timeMs);
    socket.emit('quiz_result', result);
    io.to(roomCode).emit('score_update', room.getScores());
  });

  socket.on('wallet_connected', ({ roomCode, walletAddress }) => {
    const room = roomManager.getRoom(roomCode);
    if (!room) return;
    room.setWallet(socket.id, walletAddress);
    io.to(roomCode).emit('room_update', room.getState());
  });

  socket.on('escrow_confirmed', async ({ roomCode, txSignature, walletAddress }) => {
    const room = roomManager.getRoom(roomCode);
    if (!room) return;

    // Verify the deposit on-chain before marking confirmed
    const valid = await escrowService.verifyDeposit(
      txSignature,
      walletAddress,
      room.stakeAmount
    );
    if (!valid) {
      socket.emit('error', { message: 'Deposit transaction could not be verified' });
      return;
    }

    room.confirmEscrow(socket.id, txSignature);
    io.to(roomCode).emit('room_update', room.getState());
    if (room.bothEscrowConfirmed()) {
      io.to(roomCode).emit('escrow_ready');
    }
  });

  socket.on('end_session', ({ roomCode }) => {
    const room = roomManager.getRoom(roomCode);
    if (!room) return;
    endSession(io, room, roomManager);
  });

  socket.on('disconnect', () => {
    const roomCode = roomManager.getPlayerRoom(socket.id);
    if (roomCode) {
      roomManager.removePlayer(roomCode, socket.id);
      io.to(roomCode).emit('player_disconnected', { playerId: socket.id });
    }
    console.log('[socket] disconnected:', socket.id);
  });
});

function startSession(io, room) {
  room.startSession();
  io.to(room.code).emit('session_start', { startTime: room.startTime });
  scheduleNextQuiz(io, room);
}

function scheduleNextQuiz(io, room) {
  if (!room.quizBank.length || room.quizIndex >= room.quizBank.length) return;
  const delayMs = (5 + Math.random() * 5) * 60 * 1000; // 5–10 min
  room.quizTimer = setTimeout(() => {
    if (!room.active) return;
    const question = room.quizBank[room.quizIndex++];
    io.to(room.code).emit('quiz_question', question);
    scheduleNextQuiz(io, room);
  }, delayMs);
}

async function endSession(io, room, roomManager) {
  room.endSession();
  const summary = room.getSummary();

  try {
    const { Session } = await import('./db/models/Session.js');
    await Session.create({
      roomCode: room.code,
      participants: summary.players.map((p) => p.userId),
      startTime: new Date(room.startTime),
      endTime: new Date(room.endTime),
      focusScores: summary.players.map((p) => ({ userId: p.userId, score: p.focusPercent })),
      quizResults: summary.players.map((p) => ({ userId: p.userId, accuracy: p.quizAccuracy })),
      winner: summary.winner?.userId ?? null,
      stakeAmount: room.stakeAmount,
      mode: room.mode,
    });
  } catch (err) {
    console.error('[endSession] DB write failed:', err.message);
  }

  // Solana payout (server-managed wallet → winner/refund)
  const payoutTx = await escrowService.handleSessionPayout(summary);
  if (payoutTx) summary.payoutTxSignature = payoutTx;

  io.to(room.code).emit('session_end', summary);
  roomManager.removeRoom(room.code);
}

const PORT = process.env.PORT || 3001;
connectDB().then(() => {
  httpServer.listen(PORT, () => console.log(`Buddy Lock-In server → http://localhost:${PORT}`));
});
