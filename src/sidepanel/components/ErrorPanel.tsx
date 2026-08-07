import { useRef, useState } from 'react';
import type { SerializedError } from '../../shared/errors';
import { type ErrorPsychEvent, PORT_ERROR_PSYCH } from '../../shared/messages';
import { ERROR_TAG_ORDER, S } from '../../shared/strings';
import type { ErrorTag } from '../../shared/types';
import { ErrorBanner } from './ErrorBanner';

type Phase =
  | { kind: 'closed' }
  | { kind: 'form' }
  | { kind: 'streaming'; text: string }
  | { kind: 'done'; aiDiagnosis: string; fixAdvice: string }
  | { kind: 'error'; error: SerializedError };

export function ErrorPanel({ questionId, attemptId }: { questionId: string; attemptId: string }) {
  const [phase, setPhase] = useState<Phase>({ kind: 'closed' });
  const [tags, setTags] = useState<ErrorTag[]>([]);
  const [note, setNote] = useState('');
  const portRef = useRef<chrome.runtime.Port | null>(null);

  function toggle(tag: ErrorTag) { setTags((current) => current.includes(tag) ? current.filter((other) => other !== tag) : [...current, tag]); }

  function submit() {
    setPhase({ kind: 'streaming', text: '' });
    const port = chrome.runtime.connect({ name: PORT_ERROR_PSYCH });
    portRef.current = port;

    port.onMessage.addListener((event: ErrorPsychEvent) => {
      if (event.type === 'delta') {
        setPhase((current) => current.kind === 'streaming' ? { kind: 'streaming', text: current.text + event.text } : current);
      } else if (event.type === 'done') {
        setPhase({ kind: 'done', aiDiagnosis: event.aiDiagnosis, fixAdvice: event.fixAdvice });
        port.disconnect();
      } else {
        setPhase({ kind: 'error', error: event.error });
        port.disconnect();
      }
    });

    port.postMessage({ questionId, attemptId, userTags: tags, userNote: note.trim() || undefined });
  }

  if (phase.kind === 'closed') {
    return <button className="rounded border px-3 py-1 text-sm" onClick={() => setPhase({ kind: 'form' })}>{S.result.analyzeMistake}</button>;
  }

  return (
    <div className="space-y-2 rounded bg-gray-50 p-3">
      <p className="text-sm font-medium">{S.errorPanel.title}</p>

      {phase.kind === 'form' && (
        <>
          <p className="text-xs text-gray-600">{S.errorPanel.hint}</p>
          <div className="flex flex-wrap gap-2">
            {ERROR_TAG_ORDER.map((tag) => (
              <button key={tag} aria-pressed={tags.includes(tag)} className={`rounded-full border px-3 py-1 text-xs ${tags.includes(tag) ? 'border-blue-600 bg-blue-600 text-white' : ''}`} onClick={() => toggle(tag)}>{S.errorTag[tag]}</button>
            ))}
          </div>
          <textarea className="w-full rounded border p-2 text-sm" rows={2} placeholder={S.errorPanel.notePlaceholder} value={note} onChange={(event) => setNote(event.target.value)} />
          <button className="rounded bg-blue-600 px-3 py-1 text-sm text-white disabled:opacity-50" disabled={tags.length === 0} onClick={submit}>{S.errorPanel.submit}</button>
        </>
      )}

      {phase.kind === 'streaming' && (
        <div className="space-y-1">
          <p className="text-xs text-gray-500">{S.errorPanel.thinking}</p>
          <p className="text-sm whitespace-pre-wrap">{phase.text}</p>
        </div>
      )}

      {phase.kind === 'done' && (
        <div className="space-y-2 text-sm">
          <div>
            <p className="font-medium">{S.errorPanel.diagnosis}</p>
            <p className="whitespace-pre-wrap text-gray-700">{phase.aiDiagnosis}</p>
          </div>
          {phase.fixAdvice && (
            <div>
              <p className="font-medium">{S.errorPanel.fixAdvice}</p>
              <p className="whitespace-pre-wrap text-gray-700">{phase.fixAdvice}</p>
            </div>
          )}
        </div>
      )}

      {phase.kind === 'error' && <ErrorBanner error={phase.error} onRetry={() => setPhase({ kind: 'form' })} />}
    </div>
  );
}
