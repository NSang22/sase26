import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { User } from '../db/models/User.js';
import { Session } from '../db/models/Session.js';

const router = Router();
const SALT_ROUNDS = 10;

function makeToken(user) {
  return jwt.sign(
    { userId: user._id.toString(), username: user.username },
    process.env.JWT_SECRET || 'changeme',
    { expiresIn: '7d' }
  );
}

function userPayload(user) {
  return {
    userId: user._id.toString(),
    username: user.username,
    petSpecies: user.petSpecies,
    petLevel: user.petLevel,
    petXP: user.petXP,
    petName: user.petName,
    unlockedCosmetics: user.unlockedCosmetics,
    totalFocusMinutes: user.totalFocusMinutes,
    totalSessions: user.totalSessions,
    wins: user.wins,
    currentStreak: user.currentStreak,
    longestStreak: user.longestStreak,
    walletAddress: user.walletAddress,
  };
}

// POST /api/auth/register
router.post('/auth/register', async (req, res) => {
  try {
    const { username, password, petSpecies } = req.body;
    if (!username || !password)
      return res.status(400).json({ error: 'username and password required' });

    const existing = await User.findOne({ username });
    if (existing) return res.status(409).json({ error: 'Username already taken' });

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await User.create({ username, passwordHash, petSpecies: petSpecies || 'cat' });

    res.status(201).json({ token: makeToken(user), user: userPayload(user) });
  } catch (err) {
    console.error('[auth] register error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/login
router.post('/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ error: 'username and password required' });

    const user = await User.findOne({ username });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) return res.status(401).json({ error: 'Invalid credentials' });

    res.json({ token: makeToken(user), user: userPayload(user) });
  } catch (err) {
    console.error('[auth] login error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/profile/:username
router.get('/profile/:username', async (req, res) => {
  try {
    const user = await User.findOne({ username: req.params.username }).lean();
    if (!user) return res.status(404).json({ error: 'User not found' });

    const userId = user._id.toString();
    const recentSessions = await Session.find({ participants: userId })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    res.json({ user: userPayload(user), recentSessions });
  } catch (err) {
    console.error('[auth] profile error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/profile/:username/history — split solo vs competitive sessions
router.get('/profile/:username/history', async (req, res) => {
  try {
    const user = await User.findOne({ username: req.params.username }).lean();
    if (!user) return res.status(404).json({ error: 'User not found' });

    const userId = user._id.toString();
    const sessions = await Session.find({ participants: userId })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    const solo = sessions.filter((s) => s.mode === 'solo');
    const competitive = sessions.filter((s) => s.mode !== 'solo');
    res.json({ solo, competitive });
  } catch (err) {
    console.error('[auth] history error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
