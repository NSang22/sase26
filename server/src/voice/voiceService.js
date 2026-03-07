import axios from 'axios';

// Voice IDs per pet species — fill in from ElevenLabs dashboard
const VOICE_IDS = {
  owl: process.env.ELEVENLABS_VOICE_ID_OWL || 'EXAVITQu4vr4xnSDxMaL',
  cat: process.env.ELEVENLABS_VOICE_ID_CAT || 'MF3mGyEYCl7XYWbV9V6O',
  dog: process.env.ELEVENLABS_VOICE_ID_DOG || 'AZnzlk1XvdvUeBnXmlld',
};

// Pre-scripted reaction lines per species
const REACTION_LINES = {
  owl: {
    partnerDistracted: "Hm. Your partner seems to have found something more interesting than studying. Tragic.",
    quizCorrect: "Precisely correct. As expected from a dedicated scholar.",
    streakMilestone: "Thirty minutes of continuous focus. Remarkable discipline.",
    sessionStart: "Let us begin. Distractions are for the unambitious.",
    sessionEnd: "Session complete. The data does not lie — you did well.",
  },
  cat: {
    partnerDistracted: "Oh wow, your partner is just... gone. Classic.",
    quizCorrect: "Fine, fine. You got it right. Don't make it a whole thing.",
    streakMilestone: "Okay I'll admit it, twenty minutes without zoning out is actually impressive.",
    sessionStart: "Ugh, fine. Let's study, I guess.",
    sessionEnd: "That's it? Already? ...Okay actually that was decent.",
  },
  dog: {
    partnerDistracted: "Your partner looked away! Stay focused together, let's go!",
    quizCorrect: "YES! That's right! You're doing AMAZING!",
    streakMilestone: "Twenty minutes of pure focus! You're an absolute legend!",
    sessionStart: "Let's GO! Best study session EVER, starting NOW!",
    sessionEnd: "INCREDIBLE SESSION! You should be so proud!",
  },
};

export class VoiceService {
  constructor() {
    this.apiKey = process.env.ELEVENLABS_API_KEY;
    // In-memory cache: text -> base64 audio
    this.cache = new Map();
  }

  async synthesize(text, species = 'cat') {
    const cacheKey = `${species}:${text}`;
    if (this.cache.has(cacheKey)) return this.cache.get(cacheKey);

    if (!this.apiKey) {
      console.warn('[voice] ELEVENLABS_API_KEY not set — skipping TTS');
      return null;
    }

    const voiceId = VOICE_IDS[species] ?? VOICE_IDS.cat;

    try {
      const response = await axios.post(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
        {
          text,
          model_id: 'eleven_monolingual_v1',
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        },
        {
          headers: {
            'xi-api-key': this.apiKey,
            'Content-Type': 'application/json',
            Accept: 'audio/mpeg',
          },
          responseType: 'arraybuffer',
        }
      );

      const base64 = Buffer.from(response.data).toString('base64');
      this.cache.set(cacheKey, base64);
      return base64;
    } catch (err) {
      console.error('[voice] ElevenLabs error:', err.response?.data ?? err.message);
      return null;
    }
  }

  async preGenerateQuizAudio(questions, species = 'cat') {
    for (const q of questions) {
      const text = `Question: ${q.question}. Option A: ${q.options[0].text}. Option B: ${q.options[1].text}. Option C: ${q.options[2].text}. Option D: ${q.options[3].text}.`;
      q.audioBase64 = await this.synthesize(text, species);
    }
  }

  async getReactionAudio(event, species = 'cat') {
    const line = REACTION_LINES[species]?.[event];
    if (!line) return null;
    return this.synthesize(line, species);
  }

  getReactionLine(event, species = 'cat') {
    return REACTION_LINES[species]?.[event] ?? null;
  }
}
