import { appError } from '../errors';
import type { Attempt, ErrorAnalysis, Question, QuestionAnalysis, Session } from '../types';
import { getAllAnalyses, getAllAttempts, getAllErrorAnalyses, getAllQuestions, getAllSessions, openDb } from './history';

export interface ExportBundle {
  version: 1;
  exportedAt: number;
  sessions: Session[];
  questions: Question[];
  analyses: QuestionAnalysis[];
  attempts: Attempt[];
  errorAnalyses: ErrorAnalysis[];
  images?: { id: string; mime: string; dataBase64: string }[];
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBlob(dataBase64: string, mime: string): Blob {
  const binary = atob(dataBase64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: mime });
}

/** Settings are deliberately absent: an exported file must not carry the API key. */
export async function buildExport(includeImages: boolean): Promise<ExportBundle> {
  const [sessions, questions, analyses, attempts, errorAnalyses] = await Promise.all([getAllSessions(), getAllQuestions(), getAllAnalyses(), getAllAttempts(), getAllErrorAnalyses()]);
  const bundle: ExportBundle = { version: 1, exportedAt: Date.now(), sessions, questions, analyses, attempts, errorAnalyses };

  if (includeImages) {
    const stored = await (await openDb()).getAll('images');
    bundle.images = await Promise.all(stored.map(async (row) => ({ id: row.id, mime: row.blob.type || 'image/jpeg', dataBase64: await blobToBase64(row.blob) })));
  }

  return bundle;
}

export async function importBundle(bundle: ExportBundle): Promise<{ added: number; skipped: number }> {
  if (bundle?.version !== 1) throw appError('UNKNOWN', { detail: `unsupported export version: ${bundle?.version}` });

  const db = await openDb();
  let added = 0;
  let skipped = 0;

  type HistoryStore = 'sessions' | 'questions' | 'analyses' | 'attempts' | 'errorAnalyses';

  async function mergeInto<T>(store: HistoryStore, records: T[] | undefined, keyOf: (record: T) => string): Promise<void> {
    for (const record of records ?? []) {
      if (await db.get(store, keyOf(record))) { skipped += 1; continue; }
      // The bundle is user-supplied JSON; idb's generics cannot vouch for it,
      // so the cast is unavoidable. zod validation would be overkill for a
      // file the user exported from this same extension.
      await db.put(store, record as never);
      added += 1;
    }
  }

  await mergeInto<Session>('sessions', bundle.sessions, (record) => record.id);
  await mergeInto<Question>('questions', bundle.questions, (record) => record.id);
  await mergeInto<QuestionAnalysis>('analyses', bundle.analyses, (record) => record.questionId);
  await mergeInto<Attempt>('attempts', bundle.attempts, (record) => record.id);
  await mergeInto<ErrorAnalysis>('errorAnalyses', bundle.errorAnalyses, (record) => record.attemptId);

  for (const image of bundle.images ?? []) {
    if (await db.get('images', image.id)) { skipped += 1; continue; }
    await db.put('images', { id: image.id, blob: base64ToBlob(image.dataBase64, image.mime) });
    added += 1;
  }

  return { added, skipped };
}

/** Clears history only. Settings survive, so the user does not have to re-enter their key. */
export async function wipeAll(): Promise<void> {
  const db = await openDb();
  for (const store of ['sessions', 'questions', 'analyses', 'attempts', 'errorAnalyses', 'images'] as const) await db.clear(store);
}
