import mongoose from 'mongoose';

const playerResultSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    username: { type: String, required: true },
    focusPercent: { type: Number, default: 0 },   // 0–1
    quizAccuracy: { type: Number, default: 0 },   // 0–1
    quizCorrectCount: { type: Number, default: 0 },
    totalQuizPoints: { type: Number, default: 0 },
    sessionScore: { type: Number, default: 0 },
    responseTimeScore: { type: Number, default: 0 },
    consistencyScore: { type: Number, default: 0 },
    screenStudyPercent: { type: Number, default: 0 },
    questionsTotal: { type: Number, default: 0 },
    xpGained: { type: Number, default: 0 },
    newLevel: { type: Number, default: null },
    studyReport: { type: mongoose.Schema.Types.Mixed, default: null }, // per-player report
    conceptQuiz: { type: mongoose.Schema.Types.Mixed, default: null }, // per-player end quiz
  },
  { _id: false }
);

const sessionSchema = new mongoose.Schema(
  {
    roomCode: { type: String, required: true },
    mode: { type: String, enum: ['casual', 'locked-in'], default: 'casual' },
    participants: [{ type: String }], // userId strings (for fast membership queries)
    players: [playerResultSchema],    // full per-player results
    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },
    durationMs: { type: Number },
    winner: { type: String, default: null }, // userId
    stakeAmount: { type: Number, default: 0 },
    payoutTxSignature: { type: String, default: null },
    studyReport: { type: mongoose.Schema.Types.Mixed, default: null },
    screenTimelines: { type: mongoose.Schema.Types.Mixed, default: null },
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
