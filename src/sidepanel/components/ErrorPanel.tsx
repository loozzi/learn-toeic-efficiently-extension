import { Brain, Lightbulb, Loader2 } from 'lucide-react';
import { useRef, useState } from 'react';
import type { SerializedError } from '../../shared/errors';
import { type ErrorPsychEvent, PORT_ERROR_PSYCH } from '../../shared/messages';
import { Button } from '../../shared/components/Button';
import { TagButton } from '../../shared/components/TagButton';
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
    return (
      <Button variant="outline" size="sm" icon={<Brain size={14} strokeWidth={2} />} onClick={() => setPhase({ kind: 'form' })}>
        {S.result.analyzeMistake}
      </Button>
    );
  }

  return (
    <div className="space-y-2.5 rounded-lg border border-border bg-surface-muted p-3">
      <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
        <Brain size={15} strokeWidth={2} className="text-primary" />
        {S.errorPanel.title}
      </p>

      {phase.kind === 'form' && (
        <>
          <p className="text-xs text-muted-foreground">{S.errorPanel.hint}</p>
          <div className="flex flex-wrap gap-1.5">
            {ERROR_TAG_ORDER.map((tag) => <TagButton key={tag} label={S.errorTag[tag]} active={tags.includes(tag)} onClick={() => toggle(tag)} />)}
          </div>
          <textarea
            className="w-full rounded-lg border border-border bg-surface p-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            rows={2}
            placeholder={S.errorPanel.notePlaceholder}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
          <Button variant="primary" size="sm" disabled={tags.length === 0} onClick={submit}>{S.errorPanel.submit}</Button>
        </>
      )}

      {phase.kind === 'streaming' && (
        <div className="space-y-1.5">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 size={12} strokeWidth={2} className="animate-spin" />
            {S.errorPanel.thinking}
          </p>
          <p className="text-sm whitespace-pre-wrap">{phase.text}</p>
        </div>
      )}

      {phase.kind === 'done' && (
        <div className="space-y-2.5 text-sm">
          <div className="flex gap-1.5">
            <Brain size={15} strokeWidth={2} className="mt-0.5 shrink-0 text-primary" />
            <div>
              <p className="font-medium text-foreground">{S.errorPanel.diagnosis}</p>
              <p className="whitespace-pre-wrap text-muted-foreground">{phase.aiDiagnosis}</p>
            </div>
          </div>
          {phase.fixAdvice && (
            <div className="flex gap-1.5">
              <Lightbulb size={15} strokeWidth={2} className="mt-0.5 shrink-0 text-accent" />
              <div>
                <p className="font-medium text-foreground">{S.errorPanel.fixAdvice}</p>
                <p className="whitespace-pre-wrap text-muted-foreground">{phase.fixAdvice}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {phase.kind === 'error' && <ErrorBanner error={phase.error} onRetry={() => setPhase({ kind: 'form' })} />}
    </div>
  );
}
