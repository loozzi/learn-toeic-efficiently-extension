import type { Stats } from '../../shared/storage/stats';
import type { ExplanationLanguage } from '../../shared/types';
import { languageInstruction } from './language';

export interface WeaknessPromptInput { language: ExplanationLanguage; stats: Stats }

export function buildWeaknessPrompt(input: WeaknessPromptInput): { system: string; user: string } {
  const system = [
    'You advise a TOEIC learner on what to study next, based only on their own practice statistics.',
    '',
    'Rules:',
    '- Return 3 to 5 bullets, ordered by what would raise their score fastest.',
    '- Each bullet names the specific weakness and one concrete action. Not "study grammar" but "drill gerund vs infinitive after verbs like avoid, consider, suggest".',
    '- If the mistake-reason counts point at exam technique rather than knowledge (time pressure, misclicks, skim-reading), say so and address the technique.',
    '- Do not invent weaknesses the numbers do not support, and do not pad to reach five bullets.',
    '- No preamble and no closing encouragement. Bullets only.',
    '',
    languageInstruction(input.language),
  ].join('\n');

  // Aggregates only — the question text is never resent.
  const user = JSON.stringify({
    accuracy: Number(input.stats.accuracy.toFixed(2)),
    questionsAttempted: input.stats.total,
    topMissedTopics: input.stats.topMissedTopics.slice(0, 8),
    mistakeReasonCounts: input.stats.errorTagCounts,
    accuracyByToeicPart: input.stats.byPart,
  }, null, 2);

  return { system, user };
}
