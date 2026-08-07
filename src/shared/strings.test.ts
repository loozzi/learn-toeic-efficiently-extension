import { describe, expect, it } from 'vitest';
import { ERROR_TAG_ORDER, S } from './strings';

describe('strings', () => {
  it('labels all seven error tags, with the four primary ones first', () => {
    expect(ERROR_TAG_ORDER).toEqual([
      'no_grammar', 'no_structure', 'no_vocab', 'misclick',
      'misread', 'time_pressure', 'trap_similar',
    ]);
    for (const tag of ERROR_TAG_ORDER) {
      expect(S.errorTag[tag]).toBeTruthy();
    }
  });

  it('is written in Vietnamese, not English', () => {
    expect(S.review.analyzeButton).toMatch(/[ăâđêôơưáàảãạ]/i);
  });
});
