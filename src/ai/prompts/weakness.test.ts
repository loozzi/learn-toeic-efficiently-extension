import { describe, expect, it } from 'vitest';
import { buildWeaknessPrompt } from './weakness';
import type { Stats } from '../../shared/storage/stats';
const stats: Stats = {
  total: 50, correct: 34, accuracy: 0.68,
  byWeek: [{ weekStart: Date.UTC(2026, 0, 5), total: 50, correct: 34 }],
  topMissedTopics: [{ topic: 'gerund vs infinitive', wrong: 6, total: 8 }, { topic: 'shipping vocabulary', wrong: 4, total: 5 }],
  errorTagCounts: [{ tag: 'no_vocab', count: 7 }, { tag: 'time_pressure', count: 3 }],
  byPart: [{ part: 5, total: 30, correct: 22 }, { part: 7, total: 20, correct: 12 }],
};
describe('buildWeaknessPrompt', () => {
  it('asks for a small number of concrete bullets', () => { expect(buildWeaknessPrompt({ language: 'vi', stats }).system).toMatch(/3.{0,10}5/); });
  it('passes the aggregated numbers through', () => { const { user } = buildWeaknessPrompt({ language: 'vi', stats }); expect(user).toContain('gerund vs infinitive'); expect(user).toContain('no_vocab'); expect(user).toMatch(/"accuracy": 0.68/); });
  it('never carries question text — only counts', () => { expect(buildWeaknessPrompt({ language: 'vi', stats }).user).not.toMatch(/stem|choices|explanation/); });
  it('honours the language setting', () => { expect(buildWeaknessPrompt({ language: 'en', stats }).system).toMatch(/English/); });
});
