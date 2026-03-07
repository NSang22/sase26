import axios from 'axios';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Audio files live at server/audio/ and are served statically at /audio
export const AUDIO_DIR = join(__dirname, '../../audio');

// ── Voice IDs ─────────────────────────────────────────────────────────────────

const VOICE_IDS = {
  owl: process.env.ELEVENLABS_VOICE_ID_OWL || 'EXAVITQu4vr4xnSDxMaL',
  cat: process.env.ELEVENLABS_VOICE_ID_CAT || 'MF3mGyEYCl7XYWbV9V6O',
  dog: process.env.ELEVENLABS_VOICE_ID_DOG || 'AZnzlk1XvdvUeBnXmlld',
};

// ── Reaction scripts ──────────────────────────────────────────────────────────
// 5 lines per category per species.
// Categories: focus-lost | focus-regained | quiz-correct | quiz-wrong | streak-milestone

const REACTIONS = {
  owl: {
    'focus-lost': [
      "Hm. Distraction, is it? How predictably human.",
      "Your attention has wandered. This is suboptimal.",
      "I see you've found something more interesting than studying. Tragic.",
      "Focus lost. The opportunity cost is quite real.",
      "One cannot learn while staring at nothing. Return your gaze.",
    ],
    'focus-regained': [
      "Ah. You've returned. Acceptable.",
      "Focus restored. Let us continue without further interruption.",
      "Good. The work has been waiting.",
      "Composure regained. Proceed.",
      "Back to it. I'd prefer this not happen again.",
    ],
    'quiz-correct': [
      "Precisely correct. As expected from someone paying attention.",
      "Accurate. Your preparation is evident.",
      "That is correct. Well reasoned.",
      "Correct. Perhaps there is hope for you yet.",
      "Indeed. A sound and defensible answer.",
    ],
    'quiz-wrong': [
      "Incorrect. I suggest reviewing your materials.",
      "That is not right. Consider the underlying concept again.",
      "Wrong. Don't let overconfidence override careful thought.",
      "Incorrect. This is precisely why we study.",
      "No. The correct answer was rather clear in retrospect.",
    ],
    'streak-milestone': [
      "Thirty minutes of uninterrupted focus. Remarkable.",
      "A sustained streak. I'm almost impressed.",
      "Consistent focus achieved. This is how mastery is built.",
      "Milestone reached. The discipline is duly noted.",
      "An hour of focus. Even I would acknowledge that is admirable.",
    ],
  },

  cat: {
    'focus-lost': [
      "Oh wow, you just... left. Classic.",
      "Really? Right now? We were actually doing so well.",
      "Cool, cool. Just going to stare into the void, huh.",
      "Lost focus again. Shocking. Truly shocking.",
      "You're literally doing the thing we said we weren't doing.",
    ],
    'focus-regained': [
      "Oh you're back. Great. Thanks for eventually coming back.",
      "Oh look who decided to show up again.",
      "Welcome back, I guess.",
      "Fine, you're focused again. Happy now? Great.",
      "Back already? Cool. We can pretend that didn't happen.",
    ],
    'quiz-correct': [
      "Fine, fine, you got it. Don't make it a whole thing.",
      "Okay yeah, that's right. Whatever.",
      "Correct. I'm not going to congratulate you excessively about it.",
      "Yeah okay, good job. Moving on.",
      "Sure, that's right. You actually know stuff. Noted.",
    ],
    'quiz-wrong': [
      "That's... not right. We literally talked about this.",
      "Wrong. I'm not mad, I'm just a little disappointed.",
      "Nope. Do you even read the notes?",
      "Incorrect. Maybe study harder next time? Just a thought.",
      "Not even close. Just saying.",
    ],
    'streak-milestone': [
      "Okay I'll admit it, twenty minutes straight is actually impressive.",
      "Fine, you've been focused for a while. I'll acknowledge that.",
      "Streak milestone. You're doing better than I expected, honestly.",
      "I didn't think you had it in you. Respect, I guess.",
      "That's... actually a solid streak. Please don't mess it up now.",
    ],
  },

  dog: {
    'focus-lost': [
      "Hey! Hey! Come back! You looked away!",
      "Your focus! Where did it go? Let's get it back right now!",
      "Oh no no no! Stay with me! We are so close!",
      "You looked away! That's okay! We can absolutely do this!",
      "Focus lost! But we are NOT giving up! Let's GO!",
    ],
    'focus-regained': [
      "YES! You're back! I knew you could do it!",
      "FOCUS RESTORED! Let's GOOOOO!",
      "There you are! I missed you! Back to work we go!",
      "You came back! This is honestly the BEST!",
      "Welcome back! Now let's absolutely crush the rest of this session!",
    ],
    'quiz-correct': [
      "YES! THAT'S RIGHT! YOU ARE AMAZING!",
      "CORRECT! I knew you knew it! This is INCREDIBLE!",
      "OH WOW YES! Perfect answer! You are so incredibly smart!",
      "THAT'S IT! YES YES YES! Let's GO!",
      "CORRECT! You are an absolute LEGEND and I am so proud!",
    ],
    'quiz-wrong': [
      "Aww, that wasn't right. But that's okay! We learn from this!",
      "Not quite! But you tried so hard! That honestly matters!",
      "Wrong answer, but you're still amazing! Keep going!",
      "Oops! It's okay! Every mistake is just a lesson in disguise!",
      "That's not it, but I still believe in you SO MUCH!",
    ],
    'streak-milestone': [
      "TWENTY MINUTES! YOU ARE ABSOLUTELY UNSTOPPABLE!",
      "STREAK MILESTONE! This is INCREDIBLE! Keep going forever!",
      "OH WOW! You've been focused for SO LONG! I AM SO PROUD OF YOU!",
      "AMAZING STREAK! You're doing PHENOMENALLY and I love it!",
      "BEST STUDY SESSION EVER! You are completely crushing it!",
    ],
  },
};

export const CATEGORIES = ['focus-lost', 'focus-regained', 'quiz-correct', 'quiz-wrong', 'streak-milestone'];
export const SPECIES = ['cat', 'dog', 'owl'];

// ── Service ───────────────────────────────────────────────────────────────────

export class VoiceService {
  constructor() {
    this.apiKey = process.env.ELEVENLABS_API_KEY;
    // Maps 'species:category:index' -> URL path (e.g. '/audio/reactions/cat/focus-lost-2.mp3')
    this.reactionUrls = new Map();
  }

  // ── Core TTS ───────────────────────────────────────────────────────────────

  /**
   * Call the ElevenLabs TTS API and return a raw MP3 Buffer.
   *
   * @param {string} text    - text to synthesize
   * @param {string} voiceId - ElevenLabs voice ID
   * @returns {Promise<Buffer|null>}
   */
  async synthesize(text, voiceId) {
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

  /**
   * Synthesize text for a species and write the MP3 to disk.
   * Skips generation if the file already exists (safe across restarts).
   *
   * @param {string} text        - text to speak
   * @param {string} species     - 'cat' | 'dog' | 'owl'
   * @param {string} relPath     - relative path under AUDIO_DIR, e.g. 'reactions/cat/focus-lost-0.mp3'
   * @returns {Promise<string|null>} URL path the client can fetch, or null on failure
   */
  async generateAndSave(text, species, relPath) {
    const absPath = join(AUDIO_DIR, relPath);
    const urlPath = '/audio/' + relPath.replace(/\\/g, '/');

    // Skip if already on disk — avoids redundant API calls on restart
    if (existsSync(absPath)) return urlPath;

    const voiceId = VOICE_IDS[species] ?? VOICE_IDS.cat;
    const buffer = await this.synthesize(text, voiceId);
    if (!buffer) return null;

    await mkdir(dirname(absPath), { recursive: true });
    await writeFile(absPath, buffer);
    return urlPath;
  }

  // ── Reactions ──────────────────────────────────────────────────────────────

  /**
   * Pre-generate all reaction audio files at server startup.
   * Writes to audio/reactions/{species}/{category}-{index}.mp3
   * Calls are serialized per-species to stay within ElevenLabs rate limits.
   */
  async preGenerateReactions() {
    if (!this.apiKey) {
      console.warn('[voice] Skipping reaction pre-generation — no ELEVENLABS_API_KEY');
      return;
    }

    console.log('[voice] Pre-generating reaction audio...');
    let generated = 0;
    let skipped = 0;

    for (const species of SPECIES) {
      for (const category of CATEGORIES) {
        const lines = REACTIONS[species][category];
        for (let i = 0; i < lines.length; i++) {
          const relPath = `reactions/${species}/${category}-${i}.mp3`;
          const url = await this.generateAndSave(lines[i], species, relPath);
          const key = `${species}:${category}:${i}`;
          if (url) {
            this.reactionUrls.set(key, url);
            generated++;
          } else {
            skipped++;
          }
        }
      }
    }

    console.log(`[voice] Reactions ready — ${generated} generated, ${skipped} skipped`);
  }

  /**
   * Pre-generate TTS audio for each quiz question.
   * Attaches .audioUrl to each question object in-place.
   * Writes to audio/quiz/{questionId}.mp3
   *
   * @param {object[]} questions - quiz bank (mutated in-place)
   * @param {string}   species   - pet species for voice selection
   */
  async preGenerateQuizAudio(questions, species = 'cat') {
    if (!this.apiKey) return;

    console.log(`[voice] Pre-generating quiz audio (${questions.length} questions, species: ${species})...`);

    for (const q of questions) {
      const text =
        `Question: ${q.question}. ` +
        `Option one: ${q.options[0]}. ` +
        `Option two: ${q.options[1]}. ` +
        `Option three: ${q.options[2]}. ` +
        `Option four: ${q.options[3]}.`;

      const relPath = `quiz/${q.id}.mp3`;
      const url = await this.generateAndSave(text, species, relPath);
      if (url) q.audioUrl = url;
    }

    console.log('[voice] Quiz audio generation complete');
  }

  // ── Client helpers ─────────────────────────────────────────────────────────

  /**
   * Return a random URL from the pre-generated reaction pool.
   * Returns null if audio hasn't been generated (no API key, or startup still running).
   *
   * @param {string} species   - 'cat' | 'dog' | 'owl'
   * @param {string} category  - one of CATEGORIES
   * @returns {string|null}
   */
  getReactionUrl(species, category) {
    const lines = REACTIONS[species]?.[category];
    if (!lines) return null;
    const i = Math.floor(Math.random() * lines.length);
    return this.reactionUrls.get(`${species}:${category}:${i}`) ?? null;
  }

  /**
   * Return the full manifest of all generated reaction URLs, keyed by
   * species → category → index[].  Used by GET /api/audio/reactions.
   *
   * @returns {{ [species]: { [category]: string[] } }}
   */
  getReactionManifest() {
    const manifest = {};
    for (const [key, url] of this.reactionUrls) {
      const [species, category, indexStr] = key.split(':');
      manifest[species] ??= {};
      manifest[species][category] ??= [];
      manifest[species][category][parseInt(indexStr)] = url;
    }
    return manifest;
  }
}
