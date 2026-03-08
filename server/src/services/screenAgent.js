import { GoogleGenerativeAI } from '@google/generative-ai';
import { randomUUID } from 'crypto';

export const BLOOM_LEVELS = ['recall', 'comprehension', 'application', 'analysis'];

// ── Prompts ──────────────────────────────────────────────────────────────────

const SCREEN_ANALYSIS_PROMPT = `Analyze this screenshot. Return JSON only, no markdown.
{
  "is_studying": boolean,
  "subject": string or null,
  "key_concepts": string array (max 5),
  "distraction": string or null (e.g. "social media", "youtube", "messaging app"),
  "bloom_max_level": string - the highest Bloom's taxonomy level a fair question could target given the depth of content visible. Must be exactly one of: "recall", "comprehension", "application", "analysis". If not studying, return "recall".
}
If the user is on educational content, is_studying is true. Extract key concepts from visible educational content.
For bloom_max_level: "recall" for basic facts/definitions only, "comprehension" for explanations/summaries, "application" for worked problems/examples/code, "analysis" for complex reasoning/comparisons/proofs.`;

const PERSONALIZED_QUIZ_PROMPT = (concepts, bloomLevel) =>
  `Generate exactly 1 multiple-choice question at the "${bloomLevel}" cognitive level (Bloom's taxonomy) from these study concepts: ${JSON.stringify(concepts)}.
Return ONLY a valid JSON object — no markdown, no explanation, no extra text.
Schema:
{
  "id": "<uuid>",
  "question": "<question text>",
  "options": ["<option A>", "<option B>", "<option C>", "<option D>"],
  "correctAnswerIndex": <integer 0-3>,
  "explanation": "<one sentence why the answer is correct>",
  "bloom_level": "${bloomLevel}",
  "source_concept": "<the concept this question tests>"
}`;

const CONCEPT_QUIZ_PROMPT = (concepts) =>
  `Given these concepts extracted from a study session: ${JSON.stringify(concepts)}.
Generate 5 multiple-choice quiz questions specifically testing comprehension of these concepts.
Return ONLY a valid JSON array — no markdown fences, no explanation, no extra text.
Each element must follow this exact schema:
{
  "id": "<uuid>",
  "question": "<question text>",
  "options": ["<option 0>", "<option 1>", "<option 2>", "<option 3>"],
  "correctAnswerIndex": <integer 0-3>,
  "explanation": "<one sentence>",
  "source_concept": "<the concept this question tests>"
}`;

const STUDY_REPORT_PROMPT = (timeline) =>
  `Here is a study session timeline showing what a student was studying and when they were distracted: ${JSON.stringify(timeline)}.
Generate a personalized study report. Return JSON only, no markdown:
{
  "total_productive_minutes": number,
  "subjects_covered": string array,
  "distraction_count": number,
  "distraction_types": string array,
  "top_3_concepts_to_review": string array,
  "personalized_recommendation": string
}`;

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractJSON(raw) {
  try { return JSON.parse(raw); } catch {}
  const stripped = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  try { return JSON.parse(stripped); } catch {}
  const objMatch = raw.match(/\{[\s\S]*\}/);
  if (objMatch) try { return JSON.parse(objMatch[0]); } catch {}
  const arrMatch = raw.match(/\[[\s\S]*\]/);
  if (arrMatch) try { return JSON.parse(arrMatch[0]); } catch {}
  throw new Error('Could not extract JSON from Gemini response');
}

// ── Service ──────────────────────────────────────────────────────────────────

export class ScreenAgent {
  constructor() {
    if (!process.env.GEMINI_API_KEY) {
      console.warn('[screenAgent] GEMINI_API_KEY not set');
    }
    this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || 'missing');
    this.visionModel = this.genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    this.textModel = this.genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
  }

  /**
   * Analyze a screenshot via Gemini Vision.
   * @param {string} base64Image — raw base64 string (no data: prefix)
   * @param {string} mimeType — e.g. 'image/jpeg'
   * @returns {Promise<{ is_studying, subject, key_concepts, distraction, bloom_max_level }>}
   */
  async analyzeScreen(base64Image, mimeType = 'image/jpeg') {
    const result = await this.visionModel.generateContent([
      SCREEN_ANALYSIS_PROMPT,
      { inlineData: { data: base64Image, mimeType } },
    ]);
    const raw = result.response.text().trim();
    const parsed = extractJSON(raw);

    const bloomLevel = BLOOM_LEVELS.includes(parsed.bloom_max_level)
      ? parsed.bloom_max_level
      : 'recall';

    return {
      is_studying: !!parsed.is_studying,
      subject: parsed.subject ?? null,
      key_concepts: Array.isArray(parsed.key_concepts)
        ? parsed.key_concepts.slice(0, 5).map(String)
        : [],
      distraction: parsed.distraction ?? null,
      bloom_max_level: bloomLevel,
    };
  }

  /**
   * Generate a single personalized quiz question for one player.
   * @param {string[]} concepts — player's accumulated concept list
   * @param {string} bloomLevel — Bloom's level to target
   * @returns {Promise<object|null>}
   */
  async generatePersonalizedQuestion(concepts, bloomLevel) {
    if (!concepts.length) return null;
    const prompt = PERSONALIZED_QUIZ_PROMPT(concepts, bloomLevel);
    const result = await this.textModel.generateContent(prompt);
    const raw = result.response.text().trim();
    const q = extractJSON(raw);

    if (
      typeof q.question !== 'string' ||
      !Array.isArray(q.options) ||
      q.options.length !== 4 ||
      typeof q.correctAnswerIndex !== 'number'
    ) {
      throw new Error('Invalid personalized question schema from Gemini');
    }

    return { ...q, id: q.id || randomUUID(), bloom_level: bloomLevel };
  }

  /**
   * Generate 5 end-of-session concept questions from a player's accumulated concepts.
   * @param {string[]} concepts
   * @returns {Promise<Array>}
   */
  async generateConceptQuiz(concepts) {
    if (!concepts.length) return [];
    const prompt = CONCEPT_QUIZ_PROMPT(concepts);
    const result = await this.textModel.generateContent(prompt);
    const raw = result.response.text().trim();
    const questions = extractJSON(raw);

    if (!Array.isArray(questions)) throw new Error('Expected JSON array for concept quiz');

    return questions
      .filter(
        (q) =>
          typeof q.question === 'string' &&
          Array.isArray(q.options) &&
          q.options.length === 4 &&
          typeof q.correctAnswerIndex === 'number'
      )
      .map((q) => ({ ...q, id: q.id || randomUUID() }));
  }

  /**
   * Generate a personalized study report from one player's screen timeline.
   * @param {Array} timeline — { timestamp, subject, is_studying, distraction }[]
   * @returns {Promise<{ total_productive_minutes, subjects_covered, distraction_count, distraction_types, top_3_concepts_to_review, personalized_recommendation }>}
   */
  async generateStudyReport(timeline) {
    if (!timeline.length) {
      return {
        total_productive_minutes: 0,
        subjects_covered: [],
        distraction_count: 0,
        distraction_types: [],
        top_3_concepts_to_review: [],
        personalized_recommendation: 'No screen data collected this session.',
      };
    }
    const prompt = STUDY_REPORT_PROMPT(timeline);
    const result = await this.textModel.generateContent(prompt);
    const raw = result.response.text().trim();
    return extractJSON(raw);
  }
}
