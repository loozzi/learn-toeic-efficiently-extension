import { beforeEach, describe, expect, it, vi } from 'vitest';
import { claimPending, pushToPanel, registerPanelPort, setPending } from './pending';
const capture = { rawText: 'raw', images: [], sourceUrl: 'https://x', sourceTitle: 'T' };
function fakePort() {
  const listeners: (() => void)[] = [];
  return { postMessage: vi.fn(), onDisconnect: { addListener: (fn: () => void) => listeners.push(fn) }, disconnect: () => listeners.forEach((fn) => fn()) };
}
beforeEach(() => { claimPending(); registerPanelPort(null); });
describe('pending capture', () => {
  it('hands the stored capture over exactly once', () => {
    setPending(capture);
    expect(claimPending()).toEqual(capture);
    expect(claimPending()).toBeNull();
  });

  it('returns null when nothing was captured', () => { expect(claimPending()).toBeNull(); });

  it('replaces an unclaimed capture rather than queueing', () => {
    setPending(capture);
    setPending({ ...capture, rawText: 'newer' });
    expect(claimPending()?.rawText).toBe('newer');
  });

  it('notifies an already-open panel when a capture arrives', () => {
    const port = fakePort();
    registerPanelPort(port as never);
    setPending(capture);
    expect(port.postMessage).toHaveBeenCalledWith({ type: 'pendingCapture' });
  });

  it('stops pushing to a disconnected panel', () => {
    const port = fakePort();
    registerPanelPort(port as never);
    port.disconnect();
    pushToPanel({ type: 'pendingCapture' });
    expect(port.postMessage).not.toHaveBeenCalled();
  });
});
