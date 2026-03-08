import mongoose from 'mongoose';

export async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.warn('[db] MONGODB_URI not set — skipping DB connection');
    return;
  }
  try {
    await mongoose.connect(uri);
    console.log('[db] Connected to MongoDB Atlas');
  } catch (err) {
    console.error('[db] Connection failed:', err.message);
    console.warn('[db] Continuing without DB — leaderboard/session history will not persist');
  }
}
