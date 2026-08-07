import { type SerializedError, serializeError } from './errors';
import type { AnswerSubmission, ErrorTag, ImageInput, ProviderConfig, Question, QuestionAnalysis } from './types';

export interface RequestMap {
  PARSE_TEXT: { req: { rawText: string; images: ImageInput[]; origin: 'paste' | 'selection'; sourceUrl?: string; sourceTitle?: string }; res: { sessionId: string; questions: Question[]; visionSkipped: boolean } };
  ANALYZE: { req: { sessionId: string; answers: AnswerSubmission[]; skippedQuestionIds: string[] }; res: { analyses: QuestionAnalysis[]; attemptIdByQuestionId: Record<string, string> } };
  TEST_CONNECTION: { req: { config: ProviderConfig }; res: { ok: boolean; message: string } };
}
export type RequestType = keyof RequestMap;
export type Reply<T extends RequestType> = { ok: true; data: RequestMap[T]['res'] } | { ok: false; error: SerializedError };

export async function sendRequest<T extends RequestType>(type: T, req: RequestMap[T]['req']): Promise<Reply<T>> {
  return (await chrome.runtime.sendMessage({ type, ...req })) as Reply<T>;
}

export type Handlers = { [T in RequestType]?: (req: RequestMap[T]['req']) => Promise<RequestMap[T]['res']> };
export function registerHandlers(handlers: Handlers): void {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const type = (message as { type?: RequestType })?.type;
    if (!type) return false;
    const handler = handlers[type];
    if (!handler) return false;
    (handler as (request: unknown) => Promise<unknown>)(message)
      .then((data) => sendResponse({ ok: true, data }))
      .catch((error) => sendResponse({ ok: false, error: serializeError(error) }));
    return true;
  });
}

export const PORT_ERROR_PSYCH = 'errorPsych';
export interface ErrorPsychRequest { questionId: string; attemptId: string; userTags: ErrorTag[]; userNote?: string; }
export type ErrorPsychEvent = { type: 'delta'; text: string } | { type: 'done'; aiDiagnosis: string; fixAdvice: string } | { type: 'error'; error: SerializedError };
