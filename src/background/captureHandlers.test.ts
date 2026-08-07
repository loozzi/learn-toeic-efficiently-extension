import { beforeEach, describe, expect, it, vi } from 'vitest';
const resolveImageRefs = vi.fn();
const captureRegion = vi.fn();
vi.mock('./capture', () => ({ resolveImageRefs: (...args: unknown[]) => resolveImageRefs(...args), captureRegion: (...args: unknown[]) => captureRegion(...args) }));
const { handleCaptureSelection, handleSnipResult, openPanelFor } = await import('./captureHandlers');
const { claimPending } = await import('./pending');
const open = vi.fn();
const setBadgeText = vi.fn();
beforeEach(() => {
  claimPending();
  resolveImageRefs.mockReset().mockResolvedValue([]);
  captureRegion.mockReset();
  open.mockReset().mockResolvedValue(undefined);
  setBadgeText.mockReset();
  (globalThis as any).chrome = { sidePanel: { open }, action: { setBadgeText, setBadgeBackgroundColor: vi.fn() }, tabs: { sendMessage: vi.fn() } };
});
const req = { rawText: 'raw', imageRefs: [{ kind: 'img' as const, src: 'https://x/a.png' }], bounds: { x: 0, y: 0, width: 100, height: 100 }, dpr: 2, sourceUrl: 'https://site', sourceTitle: 'Site' };

describe('handleCaptureSelection', () => {
  it('stores the resolved capture and opens the panel', async () => {
    resolveImageRefs.mockResolvedValue([{ mime: 'image/jpeg', dataBase64: 'QQ' }]);
    expect((await handleCaptureSelection(req, 7)).panelOpened).toBe(true);
    expect(open).toHaveBeenCalledWith({ tabId: 7 });
    const pending = claimPending();
    expect(pending?.rawText).toBe('raw');
    expect(pending?.images).toHaveLength(1);
  });

  it('falls back to a screenshot crop when no reference resolves', async () => {
    resolveImageRefs.mockResolvedValue([]);
    captureRegion.mockResolvedValue({ mime: 'image/jpeg', dataBase64: 'SHOT' });
    await handleCaptureSelection(req, 7);
    expect(captureRegion).toHaveBeenCalledWith(7, req.bounds, 2);
    expect(claimPending()?.images[0].dataBase64).toBe('SHOT');
  });

  it('does not attempt a screenshot when there were no image refs at all', async () => {
    await handleCaptureSelection({ ...req, imageRefs: [] }, 7);
    expect(captureRegion).not.toHaveBeenCalled();
    expect(claimPending()?.images).toEqual([]);
  });

  it('still stores the capture and flags a badge when the panel refuses to open', async () => {
    open.mockRejectedValue(new Error('user gesture required'));
    expect((await handleCaptureSelection(req, 7)).panelOpened).toBe(false);
    expect(setBadgeText).toHaveBeenCalledWith({ text: '•', tabId: 7 });
    expect(claimPending()).not.toBeNull();
  });
});

describe('openPanelFor', () => {
  it('reports success and failure without throwing', async () => {
    expect(await openPanelFor(1)).toBe(true);
    open.mockRejectedValue(new Error('nope'));
    expect(await openPanelFor(1)).toBe(false);
  });
});

describe('handleSnipResult', () => {
  it('crops the region and pushes the image to the panel', async () => {
    captureRegion.mockResolvedValue({ mime: 'image/jpeg', dataBase64: 'SNIP' });
    expect((await handleSnipResult({ bounds: req.bounds, dpr: 2 }, 7)).ok).toBe(true);
  });

  it('reports failure when the crop yields nothing', async () => {
    captureRegion.mockResolvedValue(null);
    expect((await handleSnipResult({ bounds: req.bounds, dpr: 2 }, 7)).ok).toBe(false);
  });
});
