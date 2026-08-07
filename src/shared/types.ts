export type Provider = 'openai' | 'gemini';
export type ExplanationLanguage = 'vi' | 'en' | 'bilingual';

export interface ProviderConfig { provider: Provider; baseUrl?: string; apiKey: string; model: string; supportsVision: boolean; }
export interface Settings { ai: ProviderConfig; explanationLanguage: ExplanationLanguage; captureImages: boolean; minSelectionChars: number; }
export interface Choice { label: string; text: string; }
export interface Question { id: string; sessionId: string; order: number; stem: string; passage?: string; choices: Choice[]; imageIds: string[]; toeicPart?: 1 | 2 | 3 | 4 | 5 | 6 | 7; }
export interface Attempt { id: string; questionId: string; userAnswer?: string; isCorrect: boolean; createdAt: number; isRetry: boolean; }
export type TopicCategory = 'grammar' | 'vocabulary' | 'reading' | 'other';
export interface QuestionAnalysis { questionId: string; correctAnswer: string; explanation: string; strategy: string; distractorNotes?: Record<string, string>; topic: string; topicCategory: TopicCategory; }
export type ErrorTag = 'no_grammar' | 'no_structure' | 'no_vocab' | 'misclick' | 'misread' | 'time_pressure' | 'trap_similar';
export interface ErrorAnalysis { attemptId: string; questionId: string; userTags: ErrorTag[]; userNote?: string; aiDiagnosis: string; fixAdvice: string; }
export interface Session { id: string; createdAt: number; origin: 'selection' | 'paste'; sourceUrl?: string; sourceTitle?: string; rawText: string; questionIds: string[]; }
export interface ImageInput { mime: string; dataBase64: string; }
export interface AnswerSubmission { questionId: string; userAnswer?: string; }
