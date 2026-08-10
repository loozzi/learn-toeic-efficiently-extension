import { ArrowRight, Crop, ImageIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { SerializedError } from '../../shared/errors';
import { sendRequest } from '../../shared/messages';
import { Button } from '../../shared/components/Button';
import { S } from '../../shared/strings';
import type { ImageInput, Question } from '../../shared/types';
import { ErrorBanner } from '../components/ErrorBanner';

export interface ParsedPayload { sessionId: string; questions: Question[]; visionSkipped: boolean }

async function fileToImageInput(file: File): Promise<ImageInput> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return { mime: file.type || 'image/png', dataBase64: btoa(binary) };
}

export function Paste({ onParsed, snipped = [], snipFailed = 0 }: { onParsed: (payload: ParsedPayload) => void; snipped?: ImageInput[]; snipFailed?: number }) {
  const [text, setText] = useState('');
  const [images, setImages] = useState<ImageInput[]>([]);
  const [busy, setBusy] = useState(false);
  const [sniping, setSniping] = useState(false);
  const [empty, setEmpty] = useState(false);
  const [error, setError] = useState<SerializedError | null>(null);
  const [snipIssue, setSnipIssue] = useState<'start' | 'capture' | null>(null);

  const allImages = [...images, ...snipped];

  // The panel pushes this event once the region the user dragged failed to
  // capture; surface it the same way a failed START_SNIP is surfaced below.
  useEffect(() => {
    if (snipFailed > 0) setSnipIssue('capture');
  }, [snipFailed]);

  async function submit() {
    setError(null);
    if (text.trim() === '') { setEmpty(true); return; }
    setEmpty(false);
    setBusy(true);
    const reply = await sendRequest('PARSE_TEXT', { rawText: text.trim(), images: allImages, origin: 'paste' });
    setBusy(false);
    if (reply.ok) onParsed(reply.data); else setError(reply.error);
  }

  async function snip() {
    setSnipIssue(null);
    setSniping(true);
    const reply = await sendRequest('START_SNIP', {});
    setSniping(false);
    if (!reply.ok || !reply.data.started) setSnipIssue('start');
  }

  async function onPaste(event: React.ClipboardEvent<HTMLTextAreaElement>) {
    const files = Array.from(event.clipboardData?.files ?? []).filter((file) => file.type.startsWith('image/'));
    if (files.length === 0) return;
    setImages(await Promise.all(files.map(fileToImageInput)));
  }

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <textarea
        className="h-56 w-full flex-1 resize-none rounded-lg border border-border bg-surface p-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        placeholder={S.paste.placeholder}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onPaste={onPaste}
      />

      {allImages.length > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ImageIcon size={13} strokeWidth={2} />
          {S.paste.imageCount(allImages.length)}
        </p>
      )}

      {empty && <p className="text-sm text-destructive">{S.paste.empty}</p>}
      {snipIssue === 'start' && <p className="text-sm text-destructive">{S.paste.snipStartFailed}</p>}
      {snipIssue === 'capture' && <p className="text-sm text-destructive">{S.content.snipFailed}</p>}
      {error && <ErrorBanner error={error} onRetry={() => void submit()} />}

      <div className="flex items-center gap-2">
        <Button className="flex-1" icon={<Crop size={15} strokeWidth={2} />} onClick={() => void snip()} disabled={sniping}>
          {sniping ? S.paste.sniping : S.paste.snip}
        </Button>
        <Button
          variant="primary"
          className="flex-[2]"
          icon={!busy ? <ArrowRight size={15} strokeWidth={2} /> : undefined}
          disabled={busy}
          onClick={() => void submit()}
        >
          {busy ? S.paste.parsing : S.paste.submit}
        </Button>
      </div>
    </div>
  );
}
