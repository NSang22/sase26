import mongoose from 'mongoose';

// Aggregated stats per user — updated at end of each session
const leaderboardSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, unique: true },
    username: { type: String, required: true },
    totalFocusTime: { type: Number, default: 0 }, // minutes
    totalSessions: { type: Number, default: 0 },
    wins: { type: Number, default: 0 },
    avgQuizAccuracy: { type: Number, default: 0 }, // 0–1
    winRate: { type: Number, default: 0 }, // 0–1
    currentStreak: { type: Number, default: 0 },
    longestStreak: { type: Number, default: 0 },
    petSpecies: { type: String, default: 'cat' },
    petLevel: { type: Number, default: 1 },
  },
  { timestamps: true }
);

leaderboardSchema.statics.upsertFromSession = async function (userId, username, sessionData) {
  const { focusPercent, quizAccuracy, won, durationMs, petSpecies, petLevel } = sessionData;
  const focusMinutes = durationMs / 60000;

  const entry = await this.findOne({ userId });
  if (!entry) {
    await this.create({
      userId,
      username,
      totalFocusTime: focusMinutes,
      totalSessions: 1,
      wins: won ? 1 : 0,
      avgQuizAccuracy: quizAccuracy,
      winRate: won ? 1 : 0,
      currentStreak: won ? 1 : 0,
      longestStreak: won ? 1 : 0,
      petSpecies,
      petLevel,
    });
    return;
  }

  const newSessions = entry.totalSessions + 1;
  const newWins = entry.wins + (won ? 1 : 0);
  const newAvgAccuracy =
    (entry.avgQuizAccuracy * entry.totalSessions + quizAccuracy) / newSessions;
  const newStreak = won ? entry.currentStreak + 1 : 0;

  await this.updateOne(
    { userId },
    {
      username,
      totalFocusTime: entry.totalFocusTime + focusMinutes,
      totalSessions: newSessions,
      wins: newWins,
      avgQuizAccuracy: newAvgAccuracy,
      winRate: newWins / newSessions,
      currentStreak: newStreak,
      longestStreak: Math.max(entry.longestStreak, newStreak),
      petSpecies,
      petLevel,
    }
  );
};

export const Leaderboard =
  mongoose.models.Leaderboard ?? mongoose.model('Leaderboard', leaderboardSchema);
