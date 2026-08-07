import { describe, expect, it, vi } from 'vitest';
import { AnalyzeResultSchema, ParseResultSchema, parseJsonWithRepair } from './schema';

const validParse = JSON.stringify({ questions: [{ order: 1, stem: 'The manager ___ the report.', choices: [{ label: 'A', text: 'submit' }, { label: 'B', text: 'submits' }] }] });

describe('ai schema', () => {
  it('accepts a well-formed parse result', async () => { expect((await parseJsonWithRepair(validParse, ParseResultSchema, vi.fn())).questions[0].order).toBe(1); });
  it('rejects a parse result that leaks the correct answer', () => {
    const parsed = ParseResultSchema.parse({ questions: [{ order: 1, stem: 's', correctAnswer: 'B', choices: [{ label: 'A', text: 'a' }, { label: 'B', text: 'b' }] }] });
    expect(parsed.questions[0]).not.toHaveProperty('correctAnswer');
  });
  it('strips markdown code fences before parsing', async () => { expect((await parseJsonWithRepair(`\`\`\`json\n${validParse}\n\`\`\``, ParseResultSchema, vi.fn())).questions).toHaveLength(1); });
  it('retries exactly once with corrective feedback, then succeeds', async () => {
    const repair = vi.fn().mockResolvedValue(validParse); const output = await parseJsonWithRepair('not json at all', ParseResultSchema, repair);
    expect(repair).toHaveBeenCalledTimes(1); expect(repair.mock.calls[0][0]).toMatch(/JSON/i); expect(output.questions).toHaveLength(1);
  });
  it('throws SCHEMA carrying the raw output after a second failure', async () => {
    const repair = vi.fn().mockResolvedValue('still garbage'); await expect(parseJsonWithRepair('garbage', ParseResultSchema, repair)).rejects.toMatchObject({ code: 'SCHEMA', raw: 'still garbage' }); expect(repair).toHaveBeenCalledTimes(1);
  });
  it('accepts a well-formed analyze result', () => { expect(AnalyzeResultSchema.parse({ analyses: [{ order: 1, correctAnswer: 'B', explanation: 'e', strategy: 's', topic: 'subject-verb agreement', topicCategory: 'grammar' }] }).analyses[0].topicCategory).toBe('grammar'); });
});
