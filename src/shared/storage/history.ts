import { type DBSchema, type IDBPDatabase, deleteDB, openDB } from 'idb';
import type { Attempt, ErrorAnalysis, Question, QuestionAnalysis, Session } from '../types';

const DB_NAME = 'imen';
const DB_VERSION = 1;

interface ImenDb extends DBSchema {
  sessions: { key: string; value: Session };
  questions: { key: string; value: Question; indexes: { bySession: string } };
  analyses: { key: string; value: QuestionAnalysis };
  attempts: { key: string; value: Attempt; indexes: { byQuestion: string; byCreatedAt: number } };
  errorAnalyses: { key: string; value: ErrorAnalysis; indexes: { byQuestion: string } };
  images: { key: string; value: { id: string; blob: Blob } };
}

let dbPromise: Promise<IDBPDatabase<ImenDb>> | null = null;

export function openDb(): Promise<IDBPDatabase<ImenDb>> {
  dbPromise ??= openDB<ImenDb>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      db.createObjectStore('sessions', { keyPath: 'id' });
      const questions = db.createObjectStore('questions', { keyPath: 'id' });
      questions.createIndex('bySession', 'sessionId');
      db.createObjectStore('analyses', { keyPath: 'questionId' });
      const attempts = db.createObjectStore('attempts', { keyPath: 'id' });
      attempts.createIndex('byQuestion', 'questionId');
      attempts.createIndex('byCreatedAt', 'createdAt');
      const errors = db.createObjectStore('errorAnalyses', { keyPath: 'attemptId' });
      errors.createIndex('byQuestion', 'questionId');
      db.createObjectStore('images', { keyPath: 'id' });
    },
  });
  return dbPromise;
}

export async function resetDb(): Promise<void> {
  if (dbPromise) (await dbPromise).close();
  dbPromise = null;
  await deleteDB(DB_NAME);
}

export async function createSession(input: Omit<Session, 'id' | 'createdAt'>): Promise<Session> {
  const session: Session = { ...input, id: crypto.randomUUID(), createdAt: Date.now() };
  await (await openDb()).put('sessions', session);
  return session;
}

export async function putQuestions(questions: Question[]): Promise<void> {
  const transaction = (await openDb()).transaction('questions', 'readwrite');
  await Promise.all([...questions.map((question) => transaction.store.put(question)), transaction.done]);
}
export async function deleteQuestions(ids: string[]): Promise<void> {
  const transaction = (await openDb()).transaction('questions', 'readwrite');
  await Promise.all([...ids.map((id) => transaction.store.delete(id)), transaction.done]);
}
export async function getQuestionsBySession(sessionId: string): Promise<Question[]> {
  const questions = await (await openDb()).getAllFromIndex('questions', 'bySession', sessionId);
  return questions.sort((left, right) => left.order - right.order);
}
export async function putAnalyses(analyses: QuestionAnalysis[]): Promise<void> {
  const transaction = (await openDb()).transaction('analyses', 'readwrite');
  await Promise.all([...analyses.map((analysis) => transaction.store.put(analysis)), transaction.done]);
}
export async function getAnalysis(questionId: string): Promise<QuestionAnalysis | undefined> { return (await openDb()).get('analyses', questionId); }
export async function recordAttempt(input: { questionId: string; userAnswer?: string; correctAnswer: string; isRetry: boolean }): Promise<Attempt> {
  const attempt: Attempt = { id: crypto.randomUUID(), questionId: input.questionId, userAnswer: input.userAnswer, isCorrect: input.userAnswer != null && input.userAnswer === input.correctAnswer, createdAt: Date.now(), isRetry: input.isRetry };
  await (await openDb()).put('attempts', attempt);
  return attempt;
}
export async function putErrorAnalysis(analysis: ErrorAnalysis): Promise<void> { await (await openDb()).put('errorAnalyses', analysis); }
export async function putImage(blob: Blob): Promise<string> {
  const id = crypto.randomUUID();
  await (await openDb()).put('images', { id, blob });
  return id;
}
export async function getImage(id: string): Promise<Blob | undefined> { return (await (await openDb()).get('images', id))?.blob; }
