chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error('[imen] setPanelBehavior failed', error));

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'SPIKE_OPEN_PANEL') return false;
  const tabId = sender.tab?.id;
  if (tabId == null) {
    sendResponse({ ok: false, error: 'no tab id' });
    return true;
  }
  chrome.sidePanel
    .open({ tabId })
    .then(() => sendResponse({ ok: true }))
    .catch((error: Error) => sendResponse({ ok: false, error: error.message }));
  return true;
});
