import type { RequestMap } from '../shared/messages';
import { captureRegion, resolveImageRefs } from './capture';
import { pushToPanel, setPending } from './pending';

export async function openPanelFor(tabId: number): Promise<boolean> {
  try {
    await chrome.sidePanel.open({ tabId });
    return true;
  } catch {
    // Chrome rejects this when it does not consider the call to be inside a
    // user gesture. The capture is already stored, so the user can still get
    // to it by clicking the toolbar icon.
    return false;
  }
}

async function flagBadge(tabId: number): Promise<void> {
  await chrome.action.setBadgeBackgroundColor({ color: '#dc2626' });
  await chrome.action.setBadgeText({ text: '•', tabId });
}

export async function handleCaptureSelection(req: RequestMap['CAPTURE_SELECTION']['req'], tabId: number): Promise<RequestMap['CAPTURE_SELECTION']['res']> {
  let images = await resolveImageRefs(req.imageRefs);

  // Rung 4 of the spec's ladder: references existed but none decoded, so fall
  // back to a screenshot of the region.
  if (images.length === 0 && req.imageRefs.length > 0 && req.bounds) {
    const shot = await captureRegion(tabId, req.bounds, req.dpr);
    if (shot) images = [shot];
  }

  setPending({ rawText: req.rawText, images, sourceUrl: req.sourceUrl, sourceTitle: req.sourceTitle });

  const panelOpened = await openPanelFor(tabId);
  if (!panelOpened) await flagBadge(tabId);

  return { panelOpened };
}

export async function handleSnipResult(req: RequestMap['SNIP_RESULT']['req'], tabId: number): Promise<RequestMap['SNIP_RESULT']['res']> {
  const image = await captureRegion(tabId, req.bounds, req.dpr);
  if (!image) {
    pushToPanel({ type: 'snipFailed' });
    return { ok: false };
  }
  pushToPanel({ type: 'snipImage', image });
  return { ok: true };
}
