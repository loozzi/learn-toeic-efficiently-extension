import { useState } from 'react';
import type { SerializedError } from '../../shared/errors';
import { sendRequest } from '../../shared/messages';
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

export function Paste({ onParsed, snipped = [] }: { onParsed: (payload: ParsedPayload) => void; snipped?: ImageInput[] }) {
  const [text, setText] = useState('');
  const [images, setImages] = useState<ImageInput[]>([]);
  const [busy, setBusy] = useState(false);
  const [sniping, setSniping] = useState(false);
  const [empty, setEmpty] = useState(false);
  const [error, setError] = useState<SerializedError | null>(null);

  const allImages = [...images, ...snipped];

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
    setSniping(true);
    await sendRequest('START_SNIP', {});
    setSniping(false);
  }

  async function onPaste(event: React.ClipboardEvent<HTMLTextAreaElement>) {
    const files = Array.from(event.clipboardData?.files ?? []).filter((file) => file.type.startsWith('image/'));
    if (files.length === 0) return;
    setImages(await Promise.all(files.map(fileToImageInput)));
  }

  return (
    <div className="space-y-3 p-4">
      <textarea className="h-64 w-full resize-none rounded border p-2 text-sm" placeholder={S.paste.placeholder} value={text} onChange={(event) => setText(event.target.value)} onPaste={onPaste} />
      {allImages.length > 0 && <p className="text-xs text-gray-500">{S.paste.imageCount(allImages.length)}</p>}
      {empty && <p className="text-sm text-red-600">{S.paste.empty}</p>}
      {error && <ErrorBanner error={error} onRetry={() => void submit()} />}
      <button className="w-full rounded border px-3 py-2" onClick={() => void snip()}>{sniping ? S.paste.sniping : S.paste.snip}</button>
      <button className="w-full rounded bg-blue-600 px-3 py-2 text-white disabled:opacity-50" disabled={busy} onClick={() => void submit()}>{busy ? S.paste.parsing : S.paste.submit}</button>
    </div>
  );
}
