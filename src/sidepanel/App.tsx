import { useCallback, useEffect, useState } from 'react';
import { PORT_PANEL, type PanelEvent, type PendingCapture, sendRequest } from '../shared/messages';
import { getSettings, isConfigured } from '../shared/storage/settings';
import { S } from '../shared/strings';
import type { ImageInput, Question, QuestionAnalysis } from '../shared/types';
import { ErrorPanel } from './components/ErrorPanel';
import { Onboarding } from './components/Onboarding';
import { Paste } from './views/Paste';
import { Result } from './views/Result';
import { Review } from './views/Review';

export type PanelState =
  | { view: 'loading' }
  | { view: 'onboarding' }
  | { view: 'paste' }
  | { view: 'review'; sessionId: string; questions: Question[]; visionSkipped: boolean }
  | { view: 'result'; questions: Question[]; analyses: QuestionAnalysis[]; answers: Record<string, string | undefined>; attemptIdByQuestionId: Record<string, string> };

export function App() {
  const [state, setState] = useState<PanelState>({ view: 'loading' });
  const [snipped, setSnipped] = useState<ImageInput[]>([]);

  const parseCapture = useCallback(async (capture: PendingCapture) => {
    setState({ view: 'loading' });
    const reply = await sendRequest('PARSE_TEXT', { rawText: capture.rawText, images: capture.images, origin: 'selection', sourceUrl: capture.sourceUrl, sourceTitle: capture.sourceTitle });
    // A parse failure drops to the paste view rather than a dead end: the raw
    // text is still in the clipboard and ErrorBanner covers the retry there.
    setState(reply.ok ? { view: 'review', ...reply.data } : { view: 'paste' });
  }, []);

  const claim = useCallback(async () => {
    const reply = await sendRequest('CLAIM_PENDING_CAPTURE', {});
    if (reply.ok && reply.data.capture) {
      await parseCapture(reply.data.capture);
      return true;
    }
    return false;
  }, [parseCapture]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const settings = await getSettings();
      if (cancelled) return;
      if (!isConfigured(settings)) {
        setState({ view: 'onboarding' });
        return;
      }
      const claimed = await claim();
      if (!cancelled && !claimed) setState({ view: 'paste' });
    })();

    const port = chrome.runtime.connect({ name: PORT_PANEL });
    port.onMessage.addListener((event: PanelEvent) => {
      if (event.type === 'pendingCapture') void claim();
      if (event.type === 'snipImage') setSnipped((current) => [...current, event.image]);
    });

    return () => {
      cancelled = true;
      port.disconnect();
    };
  }, [claim]);

  function renderBody() {
    switch (state.view) {
      case 'loading':
        return null;
      case 'onboarding':
        return <Onboarding />;
      case 'paste':
        return <Paste snipped={snipped} onParsed={(payload) => setState({ view: 'review', ...payload })} />;
      case 'review':
        return <Review sessionId={state.sessionId} questions={state.questions} visionSkipped={state.visionSkipped} onAnalyzed={(payload) => setState({ view: 'result', ...payload })} />;
      case 'result':
        return (
          <Result
            questions={state.questions}
            analyses={state.analyses}
            answers={state.answers}
            attemptIdByQuestionId={state.attemptIdByQuestionId}
            renderErrorPanel={(questionId, attemptId) => <ErrorPanel questionId={questionId} attemptId={attemptId} />}
            onRestart={() => setState({ view: 'paste' })}
          />
        );
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-auto">{renderBody()}</div>
      <button className="border-t px-4 py-2 text-left text-xs text-blue-700" onClick={() => chrome.runtime.openOptionsPage()}>{S.common.openDashboard}</button>
    </div>
  );
}
