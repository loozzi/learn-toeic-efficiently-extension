import type { ErrorTag, ExplanationLanguage, Question } from '../../shared/types';
import { languageInstruction } from './language';
export const FIX_MARKER = '\n---FIX---\n';
const tagDescriptions: Record<ErrorTag, string> = { no_grammar: 'did not know the grammar rule', no_structure: 'did not recognise the sentence structure', no_vocab: 'did not know the vocabulary', misclick: 'clicked the wrong option by accident', misread: 'skimmed and misread the question', time_pressure: 'ran out of time and guessed', trap_similar: 'was caught by a distractor that looked almost identical' };
export interface ErrorPsychPromptInput { language: ExplanationLanguage; question: Question; correctAnswer: string; userAnswer: string; userTags: ErrorTag[]; userNote?: string; }
export function buildErrorPsychPrompt(input: ErrorPsychPromptInput): { system: string; user: string } {
  const system = ['You are a TOEIC coach diagnosing why a learner picked a specific wrong answer.', '', 'Write two sections separated by the exact marker line ---FIX---:', '1. Before it: explain the specific trap that pulled the learner toward the wrong choice.', '2. After it: give one or two concrete, checkable habits. No generic advice.', 'Keep the whole reply under 180 words. Do not repeat the question.', '', languageInstruction(input.language), '', "The marker must appear exactly once, on its own line:", FIX_MARKER].join('\n');
  const user = JSON.stringify({ passage: input.question.passage, stem: input.question.stem, choices: input.question.choices, correctAnswer: input.correctAnswer, learnerChose: input.userAnswer, learnerSelfReportedReasons: input.userTags.map((tag) => tagDescriptions[tag]), learnerNote: input.userNote || undefined }, null, 2);
  return { system, user };
}
export function splitDiagnosis(text: string): { aiDiagnosis: string; fixAdvice: string } { const index = text.indexOf('---FIX---'); return index === -1 ? { aiDiagnosis: text.trim(), fixAdvice: '' } : { aiDiagnosis: text.slice(0, index).trim(), fixAdvice: text.slice(index + '---FIX---'.length).trim() }; }
