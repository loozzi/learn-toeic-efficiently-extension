import { describe, expect, it } from 'vitest';
import { buildParsePrompt } from './parse';
import { buildAnalyzePrompt } from './analyze';
import { FIX_MARKER, buildErrorPsychPrompt, splitDiagnosis } from './errorPsych';

const question = { id: 'q1', sessionId: 's', order: 1, stem: 'The manager ___ the report.', choices: [{ label: 'A', text: 'submit' }, { label: 'B', text: 'submits' }], imageIds: [] };
describe('prompts', () => {
  it('forbids the parse step from returning the correct answer', () => { const prompt = buildParsePrompt('vi'); expect(prompt.toLowerCase()).toMatch(/never.*(correct answer|which answer is correct)/s); expect(prompt).toMatch(/"order"/); });
  it('caps the parse step at 20 questions', () => { expect(buildParsePrompt('vi')).toMatch(/20/); });
  it('instructs each language mode differently', () => { expect(buildParsePrompt('vi')).toMatch(/Vietnamese/); expect(buildAnalyzePrompt({ language: 'en', questions: [question], answers: {} }).system).toMatch(/English/); expect(buildAnalyzePrompt({ language: 'bilingual', questions: [question], answers: {} }).system).toMatch(/both/i); });
  it('tells the analyze step what the user picked, including not attempted', () => { expect(buildAnalyzePrompt({ language: 'vi', questions: [question], answers: { q1: undefined } }).user).toMatch(/not attempted/i); expect(buildAnalyzePrompt({ language: 'vi', questions: [question], answers: { q1: 'A' } }).user).toMatch(/"userAnswer": "A"/); });
  it('keeps English grammar terminology even when explaining in Vietnamese', () => { expect(buildAnalyzePrompt({ language: 'vi', questions: [question], answers: {} }).system).toMatch(/terminology/i); });
  it('asks the error-psychology step for two sections split by a marker', () => { expect(buildErrorPsychPrompt({ language: 'vi', question, correctAnswer: 'B', userAnswer: 'A', userTags: ['no_grammar'], userNote: 'nhìn nhầm' }).system).toContain(FIX_MARKER); });
  it('splits a streamed diagnosis on the marker', () => { expect(splitDiagnosis(`why you erred${FIX_MARKER}how to fix`)).toEqual({ aiDiagnosis: 'why you erred', fixAdvice: 'how to fix' }); });
  it('puts the whole text in the diagnosis when the marker is missing', () => { expect(splitDiagnosis('only prose')).toEqual({ aiDiagnosis: 'only prose', fixAdvice: '' }); });
});
