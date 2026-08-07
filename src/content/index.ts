import { CONTENT_COMMAND, type ContentCommand, sendRequest } from '../shared/messages';
import { getSettings } from '../shared/storage/settings';
import { S } from '../shared/strings';
import { scanImages } from './imageScan';
import { anchorFromRects, boundsFromRects, isEligible, rectsOfSelection, selectionTextOf } from './selection';
import { startSnip } from './snip';
import { createShadowHost, mountTrigger, showToast } from './trigger';

const EXPAND_TOP = 200;
const BLOCKED_SCHEMES = ['chrome:', 'chrome-extension:', 'about:', 'devtools:', 'view-source:'];

export function shouldRunHere(href: string): boolean {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return false;
  }
  if (BLOCKED_SCHEMES.includes(url.protocol)) return false;

  // Chrome blocks extension injection on both Web Store hostnames.
  if (url.hostname === 'chromewebstore.google.com') return false;
  if (url.hostname === 'chrome.google.com' && url.pathname.startsWith('/webstore')) return false;

  // The built-in PDF viewer is its own plugin document; the paste flow covers it.
  if (url.pathname.toLowerCase().endsWith('.pdf')) return false;

  return true;
}

export function bootstrap(): void {
  const { shadow } = createShadowHost();
  let minChars = 15;
  let captureImages = true;

  void getSettings().then((settings) => {
    minChars = settings.minSelectionChars;
    captureImages = settings.captureImages;
  });

  const trigger = mountTrigger(shadow, () => {
    void capture();
    trigger.hide();
  });

  function currentSelectionState() {
    const selection = document.getSelection();
    return { text: selectionTextOf(selection), rects: rectsOfSelection(selection) };
  }

  async function capture(): Promise<void> {
    const { text, rects } = currentSelectionState();
    if (!isEligible(text, minChars)) return;

    const bounds = boundsFromRects(rects, EXPAND_TOP);
    const imageRefs = captureImages && bounds ? scanImages(bounds).map(({ kind, src }) => ({ kind, src })) : [];

    const reply = await sendRequest('CAPTURE_SELECTION', {
      rawText: text.trim(),
      imageRefs,
      bounds,
      dpr: window.devicePixelRatio || 1,
      sourceUrl: location.href,
      sourceTitle: document.title,
    });

    if (!reply.ok || !reply.data.panelOpened) showToast(shadow, S.content.openPanelManually);
  }

  function refresh(): void {
    const { text, rects } = currentSelectionState();
    if (!isEligible(text, minChars)) {
      trigger.hide();
      return;
    }
    const anchor = anchorFromRects(rects);
    if (anchor) trigger.show(anchor);
    else trigger.hide();
  }

  document.addEventListener('mouseup', () => setTimeout(refresh, 0));
  document.addEventListener('scroll', () => trigger.hide(), true);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') trigger.hide();
  });

  chrome.runtime.onMessage.addListener((message) => {
    const command = (message as Record<string, ContentCommand>)?.[CONTENT_COMMAND];
    if (command?.type !== 'startSnip') return;

    startSnip(shadow, (rect) => {
      if (!rect) return;
      void sendRequest('SNIP_RESULT', { bounds: rect, dpr: window.devicePixelRatio || 1 });
    });
  });
}
