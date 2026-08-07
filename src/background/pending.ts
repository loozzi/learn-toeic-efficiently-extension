import type { PanelEvent, PendingCapture } from '../shared/messages';

let pending: PendingCapture | null = null;
let panelPort: chrome.runtime.Port | null = null;

export function setPending(capture: PendingCapture): void {
  // A newer selection supersedes an unclaimed one; the user only ever wants
  // the thing they just clicked on.
  pending = capture;
  pushToPanel({ type: 'pendingCapture' });
}

export function claimPending(): PendingCapture | null {
  const claimed = pending;
  pending = null;
  return claimed;
}

export function registerPanelPort(port: chrome.runtime.Port | null): void {
  panelPort = port;
  port?.onDisconnect.addListener(() => {
    if (panelPort === port) panelPort = null;
  });
}

export function pushToPanel(event: PanelEvent): void {
  if (!panelPort) return;
  try {
    panelPort.postMessage(event);
  } catch {
    panelPort = null; // the panel closed between the check and the post
  }
}
