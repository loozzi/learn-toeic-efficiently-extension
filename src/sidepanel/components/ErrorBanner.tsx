import { AlertTriangle } from 'lucide-react';
import { type SerializedError, deserializeError, errorMessage } from '../../shared/errors';
import { Button } from '../../shared/components/Button';
import { S } from '../../shared/strings';

export function ErrorBanner({ error, onRetry }: { error: SerializedError; onRetry?: () => void }) {
  const appError = deserializeError(error);
  return (
    <div role="alert" className="space-y-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm">
      <div className="flex items-start gap-2">
        <AlertTriangle size={16} strokeWidth={2} className="mt-0.5 shrink-0 text-destructive" />
        <p className="text-destructive">{errorMessage(appError)}</p>
      </div>
      {appError.raw && (
        <details>
          <summary className="cursor-pointer text-xs text-destructive/80">{S.common.rawOutput}</summary>
          <pre className="mt-1 max-h-40 overflow-auto rounded bg-surface p-2 text-xs whitespace-pre-wrap">{appError.raw}</pre>
        </details>
      )}
      {onRetry && <Button variant="destructive" size="sm" onClick={onRetry}>{S.common.retry}</Button>}
    </div>
  );
}
