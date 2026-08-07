import type { ExplanationLanguage, Question } from '../../shared/types';
import { languageInstruction } from './language';
export interface AnalyzePromptInput { language: ExplanationLanguage; questions: Question[]; answers: Record<string, string | undefined>; }
export function buildAnalyzePrompt(input: AnalyzePromptInput): { system: string; user: string } {
  const system = ['You are a TOEIC coach. For each question decide the correct answer and explain it.', '', 'Rules:', '- explanation: 3 to 4 lines about the grammar rule, collocation or reading clue.', '- strategy: 1 to 2 lines with a reusable signal.', '- distractorNotes: one short line per wrong label, or omit it.', '- topic: short reusable English lowercase label.', '- topicCategory: grammar, vocabulary, reading, or other.', '- Keep English grammar terminology and source vocabulary in English even when surrounding prose is Vietnamese.', '- Return one entry per input question, matched by order.', '', languageInstruction(input.language), '', 'Reply with ONLY this JSON object, no prose and no markdown fences:', '{ "analyses": [{ "order": 1, "correctAnswer": "B", "explanation": "string", "strategy": "string", "distractorNotes": { "A": "string" }, "topic": "string", "topicCategory": "grammar" }] }'].join('\n');
  const questions = input.questions.map((question) => ({ order: question.order, passage: question.passage, stem: question.stem, choices: question.choices, userAnswer: input.answers[question.id] ?? 'not attempted' }));
  return { system, user: JSON.stringify({ questions }, null, 2) };
}
