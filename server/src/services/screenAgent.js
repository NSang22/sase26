import { GoogleGenerativeAI } from '@google/generative-ai';
import { randomUUID } from 'crypto';

// ── Prompts ──────────────────────────────────────────────────────────────────

const SCREEN_ANALYSIS_PROMPT = `Analyze this screenshot. Return JSON only, no markdown.
{
  "is_studying": boolean,
  "subject": string or null,
  "key_concepts": string array (max 5),
  "distraction": string or null (e.g. "social media", "youtube", "messaging app")
}
If the user is on educational content, is_studying is true. If they're on social media, games, messaging, or anything non-study-related, is_studying is false. Extract key concepts from whatever educational content is visible.`;

const CONCEPT_QUIZ_PROMPT = (concepts) => `Given these concepts extracted from a study session: ${JSON.stringify(concepts)}.
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

const STUDY_REPORT_PROMPT = (timeline) => `Here is a study session timeline showing what subjects a student studied and when they were distracted: ${JSON.stringify(timeline)}.
Generate a brief study report. Return JSON only, no markdown:
{
  "total_productive_minutes": number,
  "main_topics": string array,
  "distraction_patterns": string,
  "recommendations": [string, string, string]
}`;

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractJSON(raw) {
  try { return JSON.parse(raw); } catch {}
  const stripped = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  try { return JSON.parse(stripped); } catch {}
  // Try to find object or array
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
    // Vision-capable model for screenshot analysis
    this.visionModel = this.genAI.getGenerativeModel({ model: 'gemini-2.5-flash-preview-05-20' });
    // Text model for quiz + report generation
    this.textModel = this.genAI.getGenerativeModel({ model: 'gemini-2.5-flash-preview-05-20' });
  }

  /**
   * Analyze a screenshot via Gemini Vision.
   * @param {string} base64Image — raw base64 string (no data: prefix)
   * @param {string} mimeType — e.g. 'image/png' or 'image/jpeg'
   * @returns {Promise<{ is_studying: boolean, subject: string|null, key_concepts: string[], distraction: string|null }>}
   */
  async analyzeScreen(base64Image, mimeType = 'image/png') {
    const result = await this.visionModel.generateContent([
      SCREEN_ANALYSIS_PROMPT,
      { inlineData: { data: base64Image, mimeType } },
    ]);
    const raw = result.response.text().trim();
    const parsed = extractJSON(raw);

    // Normalize
    return {
      is_studying: !!parsed.is_studying,
      subject: parsed.subject ?? null,
      key_concepts: Array.isArray(parsed.key_concepts)
        ? parsed.key_concepts.slice(0, 5).map(String)
        : [],
      distraction: parsed.distraction ?? null,
    };
  }

  /**
   * Generate concept-based quiz questions from accumulated concepts.
   * @param {string[]} concepts — deduplicated concept list
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
      .filter((q) =>
        typeof q.question === 'string' &&
        Array.isArray(q.options) &&
        q.options.length === 4 &&
        typeof q.correctAnswerIndex === 'number'
      )
      .map((q) => ({ ...q, id: q.id || randomUUID() }));
  }

  /**
   * Generate a study report from a session timeline.
   * @param {{ timestamp: number, subject: string|null, is_studying: boolean, distraction: string|null }[]} timeline
   * @returns {Promise<{ total_productive_minutes: number, main_topics: string[], distraction_patterns: string, recommendations: string[] }>}
   */
  async generateStudyReport(timeline) {
    if (!timeline.length) {
      return {
        total_productive_minutes: 0,
        main_topics: [],
        distraction_patterns: 'No data collected',
        recommendations: ['Upload study materials and try again'],
      };
    }
    const prompt = STUDY_REPORT_PROMPT(timeline);
    const result = await this.textModel.generateContent(prompt);
    const raw = result.response.text().trim();
    return extractJSON(raw);
  }
}
