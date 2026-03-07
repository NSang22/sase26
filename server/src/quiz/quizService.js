import { GoogleGenerativeAI } from '@google/generative-ai';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import { randomUUID } from 'crypto';

const QUIZ_PROMPT = (text) => `
You are a quiz generator. Given the following study material, generate exactly 12 multiple-choice questions.
Return ONLY valid JSON — no markdown, no explanation — in this exact format:
[
  {
    "id": "<uuid>",
    "question": "<question text>",
    "options": [
      { "id": "A", "text": "<option>" },
      { "id": "B", "text": "<option>" },
      { "id": "C", "text": "<option>" },
      { "id": "D", "text": "<option>" }
    ],
    "correctAnswer": "<A|B|C|D>",
    "explanation": "<brief explanation>"
  }
]

Study material:
"""
${text.slice(0, 12000)}
"""
`;

export class QuizService {
  constructor() {
    this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    this.model = this.genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
  }

  async generateFromFile(file) {
    let text = '';

    if (file.mimetype === 'application/pdf') {
      const parsed = await pdfParse(file.buffer);
      text = parsed.text;
    } else {
      // Plain text / markdown
      text = file.buffer.toString('utf-8');
    }

    return this.generateFromText(text);
  }

  async generateFromText(text) {
    if (!text.trim()) throw new Error('No text content to generate questions from');

    const prompt = QUIZ_PROMPT(text);
    const result = await this.model.generateContent(prompt);
    const raw = result.response.text().trim();

    let questions;
    try {
      questions = JSON.parse(raw);
    } catch {
      // Try to extract JSON array from response if wrapped in markdown
      const match = raw.match(/\[[\s\S]*\]/);
      if (!match) throw new Error('Gemini returned malformed quiz JSON');
      questions = JSON.parse(match[0]);
    }

    // Ensure each question has a valid UUID id
    return questions.map((q) => ({ ...q, id: q.id || randomUUID() }));
  }

  // Generate a session recap / study tips after a session
  async generateRecap({ focusPercent, quizAccuracy, topicHints = '' }) {
    const prompt = `
A student just completed a focus session with the following results:
- Focus percentage: ${(focusPercent * 100).toFixed(1)}%
- Quiz accuracy: ${(quizAccuracy * 100).toFixed(1)}%
- Topics studied: ${topicHints || 'general material'}

Write a brief, encouraging 3-sentence session recap and 2 specific study tips.
Return JSON: { "recap": "...", "tips": ["...", "..."] }
`.trim();

    const result = await this.model.generateContent(prompt);
    const raw = result.response.text().trim();
    try {
      return JSON.parse(raw);
    } catch {
      return { recap: raw, tips: [] };
    }
  }
}
