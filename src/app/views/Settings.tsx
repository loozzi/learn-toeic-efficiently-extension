import { AlertTriangle, CheckCircle2, Database, Download, KeyRound, Loader2, Trash2, Upload, Zap } from 'lucide-react';
import { useEffect, useState } from 'react';
import { type ErrorCode, appError, deserializeError, errorMessage } from '../../shared/errors';
import { sendRequest } from '../../shared/messages';
import { buildExport, importBundle, wipeAll } from '../../shared/storage/exportImport';
import { DEFAULT_SETTINGS, getSettings, saveSettings } from '../../shared/storage/settings';
import { Button } from '../../shared/components/Button';
import { S } from '../../shared/strings';
import type { ExplanationLanguage, Provider, Settings as SettingsType } from '../../shared/types';

type TestState = { status: 'idle' | 'running' | 'ok' | 'fail'; message?: string };

const inputClass = 'w-full rounded-lg border border-border bg-surface p-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

// Labels are bound with htmlFor rather than by wrapping the control: hints and
// validation messages sit outside the label so the accessible name stays exact.
function fieldLabel(htmlFor: string, text: string) {
  return <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium text-foreground">{text}</label>;
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 rounded-xl border border-border bg-surface p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {children}
    </section>
  );
}

export function Settings() {
  const [draft, setDraft] = useState<SettingsType>(DEFAULT_SETTINGS);
  const [touched, setTouched] = useState(false);
  const [saved, setSaved] = useState(false);
  const [test, setTest] = useState<TestState>({ status: 'idle' });
  const [withImages, setWithImages] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => { void getSettings().then(setDraft); }, []);

  const missingKey = draft.ai.provider !== 'ollama' && draft.ai.apiKey.trim() === '';
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
    <div className="space-y-5">
      <h1 className="text-xl font-semibold text-foreground">{S.settings.title}</h1>

      <Card title={S.settings.provider}>
        <div>
          {fieldLabel('provider', S.settings.provider)}
          <select id="provider" className={inputClass} value={draft.ai.provider} onChange={(event) => patchAi({ provider: event.target.value as Provider })}>
            <option value="openai">OpenAI</option>
            <option value="gemini">Gemini</option>
            <option value="ollama">Ollama</option>
          </select>
        </div>

        <div>
          {fieldLabel('baseUrl', S.settings.baseUrl)}
          <input id="baseUrl" className={inputClass} placeholder={draft.ai.provider === 'ollama' ? 'http://localhost:11434/v1' : undefined} value={draft.ai.baseUrl ?? ''} onChange={(event) => patchAi({ baseUrl: event.target.value })} />
          <span className="mt-1 block text-xs text-muted-foreground">{S.settings.baseUrlHint}</span>
        </div>

        <div>
          {fieldLabel('apiKey', S.settings.apiKey)}
          <input id="apiKey" type="password" className={inputClass} placeholder={draft.ai.provider === 'ollama' ? S.settings.apiKeyOptional : undefined} value={draft.ai.apiKey} onChange={(event) => patchAi({ apiKey: event.target.value })} />
          {touched && missingKey && <span className="mt-1 block text-xs text-destructive">{S.settings.required}</span>}
          {draft.ai.provider !== 'ollama' && (
            <span className="mt-2 flex items-start gap-1.5 rounded-lg border border-warning-border bg-warning-bg p-2 text-xs text-warning">
              <AlertTriangle size={13} strokeWidth={2} className="mt-0.5 shrink-0" />
              {S.settings.apiKeyWarning}
            </span>
          )}
        </div>

        <div>
          {fieldLabel('model', S.settings.model)}
          <input id="model" className={inputClass} value={draft.ai.model} onChange={(event) => patchAi({ model: event.target.value })} />
          {touched && missingModel && <span className="mt-1 block text-xs text-destructive">{S.settings.required}</span>}
        </div>

        <div className="flex items-center gap-2">
          <input id="supportsVision" type="checkbox" className="h-4 w-4 accent-primary" checked={draft.ai.supportsVision} onChange={(event) => patchAi({ supportsVision: event.target.checked })} />
          <label htmlFor="supportsVision" className="text-sm text-foreground">{S.settings.supportsVision}</label>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
          <Button variant="primary" icon={<KeyRound size={15} strokeWidth={2} />} onClick={onSave}>{S.settings.save}</Button>
          <Button icon={test.status === 'running' ? <Loader2 size={15} strokeWidth={2} className="animate-spin" /> : <Zap size={15} strokeWidth={2} />} onClick={onTest} disabled={test.status === 'running'}>
            {test.status === 'running' ? S.settings.testing : S.settings.testConnection}
          </Button>
          {saved && <span className="flex items-center gap-1 text-sm text-accent"><CheckCircle2 size={14} strokeWidth={2} />{S.settings.saved}</span>}
          {test.status === 'ok' && <span className="flex items-center gap-1 text-sm text-accent"><CheckCircle2 size={14} strokeWidth={2} />{S.settings.testOk}</span>}
          {test.status === 'fail' && <span className="flex items-center gap-1 text-sm text-destructive"><AlertTriangle size={14} strokeWidth={2} />{test.message}</span>}
        </div>
      </Card>

      <Card title={S.settings.preferencesTitle}>
        <div>
          {fieldLabel('explanationLanguage', S.settings.explanationLanguage)}
          <select id="explanationLanguage" className={inputClass} value={draft.explanationLanguage} onChange={(event) => setDraft((current) => ({ ...current, explanationLanguage: event.target.value as ExplanationLanguage }))}>
            <option value="vi">{S.settings.langVi}</option>
            <option value="en">{S.settings.langEn}</option>
            <option value="bilingual">{S.settings.langBilingual}</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <input id="captureImages" type="checkbox" className="h-4 w-4 accent-primary" checked={draft.captureImages} onChange={(event) => setDraft((current) => ({ ...current, captureImages: event.target.checked }))} />
          <label htmlFor="captureImages" className="text-sm text-foreground">{S.settings.captureImages}</label>
        </div>

        <div>
          {fieldLabel('minSelectionChars', S.settings.minSelectionChars)}
          <input id="minSelectionChars" type="number" min={1} className={`${inputClass} w-32`} value={draft.minSelectionChars} onChange={(event) => setDraft((current) => ({ ...current, minSelectionChars: Number(event.target.value) || 1 }))} />
        </div>
      </Card>

      <Card title={S.settings.exportTitle}>
        <div className="flex items-center gap-2 text-muted-foreground">
          <Database size={16} strokeWidth={2} />
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input type="checkbox" className="h-4 w-4 accent-primary" checked={withImages} onChange={(event) => setWithImages(event.target.checked)} />
            {S.settings.exportWithImages}
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button icon={<Download size={15} strokeWidth={2} />} onClick={() => void doExport()}>{S.settings.exportButton}</Button>

          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground transition-colors duration-150 hover:bg-surface-muted">
            <Upload size={15} strokeWidth={2} />
            {S.settings.importButton}
            <input type="file" accept="application/json" className="hidden" onChange={(event) => void doImport(event.target.files?.[0])} />
          </label>

          <Button variant="destructive" icon={<Trash2 size={15} strokeWidth={2} />} onClick={() => void doWipe()}>{S.settings.wipeButton}</Button>
        </div>

        {notice && <p className="text-sm text-muted-foreground">{notice}</p>}
      </Card>
    </div>
  );
}
