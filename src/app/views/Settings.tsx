import { useEffect, useState } from 'react';
import { type ErrorCode, appError, deserializeError, errorMessage } from '../../shared/errors';
import { sendRequest } from '../../shared/messages';
import { buildExport, importBundle, wipeAll } from '../../shared/storage/exportImport';
import { DEFAULT_SETTINGS, getSettings, saveSettings } from '../../shared/storage/settings';
import { S } from '../../shared/strings';
import type { ExplanationLanguage, Provider, Settings as SettingsType } from '../../shared/types';

type TestState = { status: 'idle' | 'running' | 'ok' | 'fail'; message?: string };

// Labels are bound with htmlFor rather than by wrapping the control: hints and
// validation messages sit outside the label so the accessible name stays exact.
function fieldLabel(htmlFor: string, text: string) {
  return <label htmlFor={htmlFor} className="mb-1 block text-sm">{text}</label>;
}

export function Settings() {
  const [draft, setDraft] = useState<SettingsType>(DEFAULT_SETTINGS);
  const [touched, setTouched] = useState(false);
  const [saved, setSaved] = useState(false);
  const [test, setTest] = useState<TestState>({ status: 'idle' });
  const [withImages, setWithImages] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => { void getSettings().then(setDraft); }, []);

  const missingKey = draft.ai.apiKey.trim() === '';
  const missingModel = draft.ai.model.trim() === '';

  function patchAi(patch: Partial<SettingsType['ai']>) { setSaved(false); setDraft((current) => ({ ...current, ai: { ...current.ai, ...patch } })); }

  async function onSave() {
    setTouched(true);
    if (missingKey || missingModel) return;
    await saveSettings(draft);
    setSaved(true);
  }

  async function onTest() {
    setTouched(true);
    if (missingKey || missingModel) return;
    setTest({ status: 'running' });
    const reply = await sendRequest('TEST_CONNECTION', { config: draft.ai });
    if (reply.ok && reply.data.ok) { setTest({ status: 'ok' }); return; }
    // runTestConnection reports failure as an ErrorCode string; a transport
    // failure arrives as a SerializedError. Both go through the same table.
    const error = reply.ok ? appError(reply.data.message as ErrorCode) : deserializeError(reply.error);
    setTest({ status: 'fail', message: errorMessage(error) });
  }

  async function doExport() {
    const bundle = await buildExport(withImages);
    const url = URL.createObjectURL(new Blob([JSON.stringify(bundle)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `imen-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function doImport(file: File | undefined) {
    if (!file) return;
    try {
      const result = await importBundle(JSON.parse(await file.text()));
      setNotice(S.settings.importDone(result.added, result.skipped));
    } catch {
      setNotice(S.settings.importFailed);
    }
  }

  async function doWipe() {
    if (!confirm(S.settings.wipeConfirm)) return;
    await wipeAll();
    setNotice(S.settings.wipeDone);
  }

  return (
    <div className="mx-auto max-w-xl space-y-5 p-6">
      <h1 className="text-xl font-semibold">{S.settings.title}</h1>

      <div>
        {fieldLabel('provider', S.settings.provider)}
        <select id="provider" className="w-full rounded border p-2" value={draft.ai.provider} onChange={(event) => patchAi({ provider: event.target.value as Provider })}>
          <option value="openai">OpenAI</option>
          <option value="gemini">Gemini</option>
        </select>
      </div>

      <div>
        {fieldLabel('baseUrl', S.settings.baseUrl)}
        <input id="baseUrl" className="w-full rounded border p-2" value={draft.ai.baseUrl ?? ''} onChange={(event) => patchAi({ baseUrl: event.target.value })} />
        <span className="mt-1 block text-xs text-gray-500">{S.settings.baseUrlHint}</span>
      </div>

      <div>
        {fieldLabel('apiKey', S.settings.apiKey)}
        <input id="apiKey" type="password" className="w-full rounded border p-2" value={draft.ai.apiKey} onChange={(event) => patchAi({ apiKey: event.target.value })} />
        {touched && missingKey && <span className="text-xs text-red-600">{S.settings.required}</span>}
        <span className="mt-1 block rounded bg-amber-50 p-2 text-xs text-amber-900">{S.settings.apiKeyWarning}</span>
      </div>

      <div>
        {fieldLabel('model', S.settings.model)}
        <input id="model" className="w-full rounded border p-2" value={draft.ai.model} onChange={(event) => patchAi({ model: event.target.value })} />
        {touched && missingModel && <span className="text-xs text-red-600">{S.settings.required}</span>}
      </div>

      <div className="flex items-center gap-2">
        <input id="supportsVision" type="checkbox" checked={draft.ai.supportsVision} onChange={(event) => patchAi({ supportsVision: event.target.checked })} />
        <label htmlFor="supportsVision" className="text-sm">{S.settings.supportsVision}</label>
      </div>

      <div>
        {fieldLabel('explanationLanguage', S.settings.explanationLanguage)}
        <select id="explanationLanguage" className="w-full rounded border p-2" value={draft.explanationLanguage} onChange={(event) => setDraft((current) => ({ ...current, explanationLanguage: event.target.value as ExplanationLanguage }))}>
          <option value="vi">{S.settings.langVi}</option>
          <option value="en">{S.settings.langEn}</option>
          <option value="bilingual">{S.settings.langBilingual}</option>
        </select>
      </div>

      <div className="flex items-center gap-2">
        <input id="captureImages" type="checkbox" checked={draft.captureImages} onChange={(event) => setDraft((current) => ({ ...current, captureImages: event.target.checked }))} />
        <label htmlFor="captureImages" className="text-sm">{S.settings.captureImages}</label>
      </div>

      <div>
        {fieldLabel('minSelectionChars', S.settings.minSelectionChars)}
        <input id="minSelectionChars" type="number" min={1} className="w-32 rounded border p-2" value={draft.minSelectionChars} onChange={(event) => setDraft((current) => ({ ...current, minSelectionChars: Number(event.target.value) || 1 }))} />
      </div>

      <div className="flex items-center gap-3">
        <button className="rounded bg-blue-600 px-4 py-2 text-white" onClick={onSave}>{S.settings.save}</button>
        <button className="rounded border px-4 py-2" onClick={onTest} disabled={test.status === 'running'}>{test.status === 'running' ? S.settings.testing : S.settings.testConnection}</button>
        {saved && <span className="text-sm text-green-700">{S.settings.saved}</span>}
        {test.status === 'ok' && <span className="text-sm text-green-700">{S.settings.testOk}</span>}
        {test.status === 'fail' && <span className="text-sm text-red-600">{test.message}</span>}
      </div>

      <section className="space-y-2 border-t pt-4">
        <h2 className="text-sm font-medium">{S.settings.exportTitle}</h2>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={withImages} onChange={(event) => setWithImages(event.target.checked)} />
          {S.settings.exportWithImages}
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <button className="rounded border px-3 py-2 text-sm" onClick={() => void doExport()}>{S.settings.exportButton}</button>

          <label className="cursor-pointer rounded border px-3 py-2 text-sm">
            {S.settings.importButton}
            <input type="file" accept="application/json" className="hidden" onChange={(event) => void doImport(event.target.files?.[0])} />
          </label>

          <button className="rounded border border-red-400 px-3 py-2 text-sm text-red-700" onClick={() => void doWipe()}>{S.settings.wipeButton}</button>
        </div>

        {notice && <p className="text-sm text-gray-700">{notice}</p>}
      </section>
    </div>
  );
}
