import mongoose from 'mongoose';

const focusScoreSchema = new mongoose.Schema(
  { userId: String, score: Number },
  { _id: false }
);

const quizResultSchema = new mongoose.Schema(
  { userId: String, accuracy: Number },
  { _id: false }
);

const sessionSchema = new mongoose.Schema(
  {
    roomCode: { type: String, required: true },
    mode: { type: String, enum: ['casual', 'locked-in'], default: 'casual' },
    participants: [{ type: String }], // userId strings
    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },
    durationMs: { type: Number },
    focusScores: [focusScoreSchema],
    quizResults: [quizResultSchema],
    winner: { type: String, default: null }, // userId
    stakeAmount: { type: Number, default: 0 },
    escrowTxSignature: { type: String, default: null },
    payoutTxSignature: { type: String, default: null },
  },
  { timestamps: true }
);

sessionSchema.pre('save', function (next) {
  if (this.startTime && this.endTime) {
    this.durationMs = this.endTime - this.startTime;
  }
  next();
});

export const Session = mongoose.models.Session ?? mongoose.model('Session', sessionSchema);
