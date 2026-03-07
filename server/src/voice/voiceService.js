import axios from 'axios';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Audio files live at server/audio/ and are served statically at /audio
export const AUDIO_DIR = join(__dirname, '../../audio');

// ── Narrator Voice ID ─────────────────────────────────────────────────────────
// Single "Professor Oak"-style narrator — used for quiz questions, recaps, alerts

const NARRATOR_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL';

// ── Narrator lines ────────────────────────────────────────────────────────────
// Spoken by the narrator on key events. Pokémon reactions use SFX + text bubbles instead.

const NARRATOR_LINES = {
  'session-start': [
    "Trainers, lock in! Your study session begins now.",
    "Welcome, trainers! Time to focus. Let's go!",
    "All trainers ready. Session starting. Lock in!",
  ],
  'focus-alert': [
    "A trainer in the room has lost focus!",
    "Attention! One of your fellow trainers is distracted.",
    "Focus alert! A trainer needs to lock back in.",
  ],
  'session-end': [
    "Session complete! Great work, trainers.",
    "That's time! Let's see how everyone did.",
    "Session over. Time for the results!",
  ],
};

export const NARRATOR_CATEGORIES = ['session-start', 'focus-alert', 'session-end'];

// ── Text-bubble reactions (no TTS — displayed as text over the Pokémon) ──────

export const PET_REACTIONS = {
  'focus-lost': [
    "Huh?! Stay focused!",
    "Hey! Don't zone out!",
    "Come back! We were doing great!",
    "No slacking off, trainer!",
    "Focus! You got this!",
  ],
  'focus-regained': [
    "Welcome back!",
    "Let's go! Back on track!",
    "That's the spirit!",
    "Nice, you're locked in again!",
    "Good to have you back!",
  ],
  'quiz-correct': [
    "Nailed it!",
    "You're so smart!",
    "Correct! Amazing!",
    "Big brain energy!",
    "That's right!",
  ],
  'quiz-wrong': [
    "Hmm, not quite...",
    "We'll get the next one!",
    "Keep studying!",
    "Don't worry about it!",
    "It happens, let's move on!",
  ],
  'streak-milestone': [
    "Incredible focus streak!",
    "You're on fire!",
    "Unstoppable!",
    "What a streak!",
    "Keep it up, champion!",
  ],
};

export const PET_CATEGORIES = ['focus-lost', 'focus-regained', 'quiz-correct', 'quiz-wrong', 'streak-milestone'];

// ── Service ───────────────────────────────────────────────────────────────────

export class VoiceService {
  constructor() {
    this.apiKey = process.env.ELEVENLABS_API_KEY;
    // Maps 'narrator:{category}:{index}' -> URL path
    this.narratorUrls = new Map();
  }

  // ── Core TTS ───────────────────────────────────────────────────────────────

  async synthesize(text, voiceId = NARRATOR_VOICE_ID) {
    if (!this.apiKey) {
      console.warn('[voice] ELEVENLABS_API_KEY not set — skipping TTS');
      return null;
    }

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
          timeout: 20_000,
        }
      );
      return Buffer.from(response.data);
    } catch (err) {
      const detail = err.response
        ? `HTTP ${err.response.status}: ${JSON.stringify(err.response.data)}`
        : err.message;
      console.error('[voice] ElevenLabs error:', detail);
      return null;
    }
  }

  // ── Disk I/O ───────────────────────────────────────────────────────────────

  async generateAndSave(text, relPath) {
    const absPath = join(AUDIO_DIR, relPath);
    const urlPath = '/audio/' + relPath.replace(/\\/g, '/');

    if (existsSync(absPath)) return urlPath;

    const buffer = await this.synthesize(text);
    if (!buffer) return null;

    await mkdir(dirname(absPath), { recursive: true });
    await writeFile(absPath, buffer);
    return urlPath;
  }

  // ── Narrator lines ─────────────────────────────────────────────────────────

  async preGenerateNarratorLines() {
    if (!this.apiKey) {
      console.warn('[voice] Skipping narrator pre-generation — no ELEVENLABS_API_KEY');
      return;
    }

    console.log('[voice] Pre-generating narrator audio...');
    let generated = 0;
    let skipped = 0;

    for (const category of NARRATOR_CATEGORIES) {
      const lines = NARRATOR_LINES[category];
      for (let i = 0; i < lines.length; i++) {
        const relPath = `narrator/${category}-${i}.mp3`;
        const url = await this.generateAndSave(lines[i], relPath);
        const key = `narrator:${category}:${i}`;
        if (url) {
          this.narratorUrls.set(key, url);
          generated++;
        } else {
          skipped++;
        }
      }
    }

    console.log(`[voice] Narrator audio ready — ${generated} generated, ${skipped} skipped`);
  }

  // ── Quiz TTS ───────────────────────────────────────────────────────────────

  async preGenerateQuizAudio(questions) {
    if (!this.apiKey) return;

    console.log(`[voice] Pre-generating quiz audio (${questions.length} questions)...`);

    for (const q of questions) {
      const text =
        `Question: ${q.question}. ` +
        `Option one: ${q.options[0]}. ` +
        `Option two: ${q.options[1]}. ` +
        `Option three: ${q.options[2]}. ` +
        `Option four: ${q.options[3]}.`;

      const relPath = `quiz/${q.id}.mp3`;
      const url = await this.generateAndSave(text, relPath);
      if (url) q.audioUrl = url;
    }

    console.log('[voice] Quiz audio generation complete');
  }

  // ── Recap TTS ──────────────────────────────────────────────────────────────

  async generateRecapAudio(recapText, sessionId) {
    if (!this.apiKey) return null;

    const relPath = `recaps/${sessionId}.mp3`;
    return this.generateAndSave(recapText, relPath);
  }

  // ── Client helpers ─────────────────────────────────────────────────────────

  getNarratorUrl(category) {
    const lines = NARRATOR_LINES[category];
    if (!lines) return null;
    const i = Math.floor(Math.random() * lines.length);
    return this.narratorUrls.get(`narrator:${category}:${i}`) ?? null;
  }

  getRandomPetReaction(category) {
    const lines = PET_REACTIONS[category];
    if (!lines) return null;
    return lines[Math.floor(Math.random() * lines.length)];
  }

  getNarratorManifest() {
    const manifest = {};
    for (const [key, url] of this.narratorUrls) {
      const [, category, indexStr] = key.split(':');
      manifest[category] ??= [];
      manifest[category][parseInt(indexStr)] = url;
    }
    return manifest;
  }
}
