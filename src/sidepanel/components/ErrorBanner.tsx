import { type SerializedError, deserializeError, errorMessage } from '../../shared/errors';
import { S } from '../../shared/strings';

export function ErrorBanner({ error, onRetry }: { error: SerializedError; onRetry?: () => void }) {
  const appError = deserializeError(error);
  return (
    <div className="space-y-2 rounded border border-red-300 bg-red-50 p-3 text-sm">
      <p className="text-red-800">{errorMessage(appError)}</p>
      {appError.raw && (
        <details>
          <summary className="cursor-pointer text-xs text-red-700">{S.common.rawOutput}</summary>
          <pre className="mt-1 max-h-40 overflow-auto text-xs whitespace-pre-wrap">{appError.raw}</pre>
        </details>
      )}
      {onRetry && <button className="rounded border border-red-400 px-3 py-1 text-red-800" onClick={onRetry}>{S.common.retry}</button>}
    </div>
  );
}
