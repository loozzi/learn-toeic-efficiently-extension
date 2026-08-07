import { Sparkles } from 'lucide-react';
import { Button } from '../../shared/components/Button';
import { S } from '../../shared/strings';

export function Onboarding() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Sparkles size={22} strokeWidth={1.75} />
      </span>
      <div className="space-y-1.5">
        <h2 className="font-semibold text-foreground">{S.onboarding.title}</h2>
        <p className="max-w-xs text-sm text-muted-foreground">{S.onboarding.body}</p>
      </div>
      <Button variant="primary" onClick={() => chrome.runtime.openOptionsPage()}>{S.onboarding.openSettings}</Button>
    </div>
  );
}
