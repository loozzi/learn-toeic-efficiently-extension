import type { ExplanationLanguage } from '../../shared/types';
export function languageInstruction(language: ExplanationLanguage): string {
  if (language === 'vi') return 'Write all explanatory prose in Vietnamese.';
  if (language === 'en') return 'Write all explanatory prose in English.';
  return 'Write both languages for every explanatory point: first in Vietnamese, then the same point in English on the next line.';
}
