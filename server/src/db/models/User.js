import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, trim: true },
    passwordHash: { type: String, required: true },
    walletAddress: { type: String, default: null },

    // Pet state
    petSpecies: { type: String, enum: ['cat', 'dog', 'owl'], default: 'cat' },
    petLevel: { type: Number, default: 1 },
    petXP: { type: Number, default: 0 },
    petName: { type: String, default: '' },
    unlockedCosmetics: [{ type: String }],

    // Stats
    totalFocusMinutes: { type: Number, default: 0 },
    totalSessions: { type: Number, default: 0 },
    wins: { type: Number, default: 0 },
    currentStreak: { type: Number, default: 0 },
    longestStreak: { type: Number, default: 0 },
    lastSessionDate: { type: Date, default: null },
  },
  { timestamps: true }
);

// XP thresholds: level = floor(sqrt(xp / 50))
userSchema.methods.addXP = function (xp) {
  this.petXP += xp;
  const newLevel = Math.floor(Math.sqrt(this.petXP / 50)) + 1;
  const leveled = newLevel > this.petLevel;
  this.petLevel = newLevel;
  return leveled;
};

export const User = mongoose.models.User ?? mongoose.model('User', userSchema);
