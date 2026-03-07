import { GoogleGenerativeAI } from '@google/generative-ai';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import { randomUUID } from 'crypto';

// ── Prompt ────────────────────────────────────────────────────────────────────

const QUIZ_PROMPT = (text) => `
You are a quiz generator. Given the following study material, generate between 10 and 15 multiple-choice questions.

Return ONLY a valid JSON array — no markdown fences, no explanation, no extra text.
Each element must follow this exact schema:
{
  "id": "<uuid v4>",
  "question": "<question text>",
  "options": ["<option 0>", "<option 1>", "<option 2>", "<option 3>"],
  "correctAnswerIndex": <integer 0-3>,
  "explanation": "<one sentence explaining why the answer is correct>"
}

Rules:
- options must be an array of exactly 4 plain strings (no letter prefixes like "A.")
- correctAnswerIndex must be an integer (0, 1, 2, or 3) — NOT a letter
- questions must be directly derived from the study material below
- vary difficulty: ~4 easy, ~6 medium, ~4 hard

Study material:
"""
${text.slice(0, 14000)}
"""
`.trim();

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractJSON(raw) {
  // 1. Try direct parse
  try {
    return JSON.parse(raw);
  } catch {}
  // 2. Strip markdown fences and retry
  const stripped = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  try {
    return JSON.parse(stripped);
  } catch {}
  // 3. Find the first [...] block
  const match = raw.match(/\[[\s\S]*\]/);
  if (match) return JSON.parse(match[0]);
  throw new Error('Could not extract JSON array from Gemini response');
}

function validateQuestion(q) {
  return (
    typeof q.question === 'string' &&
    Array.isArray(q.options) &&
    q.options.length === 4 &&
    q.options.every((o) => typeof o === 'string') &&
    typeof q.correctAnswerIndex === 'number' &&
    q.correctAnswerIndex >= 0 &&
    q.correctAnswerIndex <= 3
  );
}

// ── Service ───────────────────────────────────────────────────────────────────

export class QuizService {
  constructor() {
    if (!process.env.GEMINI_API_KEY) {
      console.warn('[quiz] GEMINI_API_KEY not set — quiz generation will fail');
    }
    this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || 'missing');
    this.model = this.genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
  }

  /**
   * Extract text from an uploaded file (PDF or plain text) and generate questions.
   * @param {Express.Multer.File} file
   * @returns {Promise<Question[]>}
   */
  async generateFromFile(file) {
    let text = '';
    if (file.mimetype === 'application/pdf') {
      const parsed = await pdfParse(file.buffer);
      text = parsed.text;
    } else {
      text = file.buffer.toString('utf-8');
    }
    if (!text.trim()) throw new Error('Uploaded file contains no readable text');
    return this._generate(text);
  }

  /**
   * Generate questions from a raw text string.
   * @param {string} text
   * @returns {Promise<Question[]>}
   */
  async generateFromText(text) {
    if (!text.trim()) throw new Error('No text content to generate questions from');
    return this._generate(text);
  }

  /**
   * Core generation logic with one automatic retry on malformed JSON.
   */
  async _generate(text) {
    const prompt = QUIZ_PROMPT(text);

    for (let attempt = 1; attempt <= 2; attempt++) {
      const result = await this.model.generateContent(prompt);
      const raw = result.response.text().trim();

      let questions;
      try {
        questions = extractJSON(raw);
      } catch (err) {
        if (attempt === 2) throw new Error(`Gemini returned malformed JSON after retry: ${err.message}`);
        console.warn('[quiz] Attempt 1 produced malformed JSON — retrying...');
        continue;
      }

      // Validate schema; filter out any malformed entries
      const valid = questions
        .filter(validateQuestion)
        .map((q) => ({
          id: typeof q.id === 'string' && q.id.length > 0 ? q.id : randomUUID(),
          question: q.question,
          options: q.options.map(String),
          correctAnswerIndex: q.correctAnswerIndex,
          explanation: q.explanation || '',
        }));

      if (valid.length < 5) {
        if (attempt === 2) throw new Error(`Too few valid questions generated (${valid.length})`);
        console.warn(`[quiz] Only ${valid.length} valid questions on attempt 1 — retrying...`);
        continue;
      }

      console.log(`[quiz] Generated ${valid.length} questions (attempt ${attempt})`);
      return valid;
    }
  }

  /**
   * Generate a session recap and study tips (called after session ends).
   */
  async generateRecap({ focusPercent, quizAccuracy, topicHints = '' }) {
    const prompt = `
A student just completed a focus session:
- Focus percentage: ${(focusPercent * 100).toFixed(1)}%
- Quiz accuracy: ${(quizAccuracy * 100).toFixed(1)}%
- Topics studied: ${topicHints || 'general material'}

Write an encouraging 3-sentence recap and 2 specific study tips.
Return JSON only: { "recap": "...", "tips": ["...", "..."] }
    `.trim();

    const result = await this.model.generateContent(prompt);
    const raw = result.response.text().trim();
    try {
      return extractJSON(raw);
    } catch {
      return { recap: raw, tips: [] };
    }
  }
}
