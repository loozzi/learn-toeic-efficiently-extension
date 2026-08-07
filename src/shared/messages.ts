import { type SerializedError, serializeError } from './errors';
import type { AnswerSubmission, ErrorTag, ImageInput, ProviderConfig, Question, QuestionAnalysis } from './types';
import type { ImageRef } from '../content/imageScan';
import type { RectLike } from '../content/selection';

/** A capture waiting for the side panel to claim it. */
export interface PendingCapture {
  rawText: string;
  images: ImageInput[];
  sourceUrl: string;
  sourceTitle: string;
}

export interface RequestMap {
  CAPTURE_SELECTION: { req: { rawText: string; imageRefs: ImageRef[]; bounds: RectLike | null; dpr: number; sourceUrl: string; sourceTitle: string }; res: { panelOpened: boolean } };
  CLAIM_PENDING_CAPTURE: { req: Record<string, never>; res: { capture: PendingCapture | null } };
  START_SNIP: { req: Record<string, never>; res: { started: boolean } };
  SNIP_RESULT: { req: { bounds: RectLike; dpr: number }; res: { ok: boolean } };
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

export const PORT_WEAKNESS = 'weakness';
export type WeaknessEvent = { type: 'delta'; text: string } | { type: 'done'; text: string } | { type: 'error'; error: SerializedError };

/** The panel's long-lived port: how the worker reaches a panel that is already open. */
export const PORT_PANEL = 'panel';
export type PanelEvent = { type: 'pendingCapture' } | { type: 'snipImage'; image: ImageInput } | { type: 'snipFailed' };

/** Sent to the content script with chrome.tabs.sendMessage — it travels the other way, so it is not in RequestMap. */
export const CONTENT_COMMAND = 'imen:content-command';
export type ContentCommand = { type: 'startSnip' } | { type: 'toast'; message: string };
