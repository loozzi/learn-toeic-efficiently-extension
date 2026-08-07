import { useEffect, useState } from 'react';
import { getSettings, isConfigured } from '../shared/storage/settings';
import { S } from '../shared/strings';
import type { Question, QuestionAnalysis } from '../shared/types';
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

  useEffect(() => { void getSettings().then((settings) => setState({ view: isConfigured(settings) ? 'paste' : 'onboarding' })); }, []);

  function renderBody() {
    switch (state.view) {
      case 'loading':
        return null;
      case 'onboarding':
        return <Onboarding />;
      case 'paste':
        return <Paste onParsed={(payload) => setState({ view: 'review', ...payload })} />;
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
