import {
  CONTENT_COMMAND,
  PORT_ERROR_PSYCH,
  PORT_PANEL,
  PORT_WEAKNESS,
  registerHandlers,
} from "../shared/messages";
import {
  runAnalyze,
  runErrorPsych,
  runParse,
  runTestConnection,
  runWeaknessSummary,
} from "./aiRunner";
import { handleCaptureSelection, handleSnipResult } from "./captureHandlers";
import { claimPending, registerPanelPort } from "./pending";
import { serializeError } from "../shared/errors";

const analyzeControllers = new Map<string, AbortController>();

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error("[imen] setPanelBehavior failed", error));

registerHandlers({
  PARSE_TEXT: (request) => runParse(request),
  TEST_CONNECTION: (request) => runTestConnection(request.config),

  CAPTURE_SELECTION: async (request, sender) => {
    const tabId = sender.tab?.id;
    if (tabId == null) return { panelOpened: false };
    return handleCaptureSelection(request, tabId);
  },

  CLAIM_PENDING_CAPTURE: async () => ({ capture: claimPending() }),

  START_SNIP: async () => {
    const [tab] = await chrome.tabs.query({
      active: true,
      lastFocusedWindow: true,
    });
    if (tab?.id == null) return { started: false };
    await chrome.tabs.sendMessage(tab.id, {
      [CONTENT_COMMAND]: { type: "startSnip" },
    });
    return { started: true };
  },

  SNIP_RESULT: async (request, sender) => {
    const tabId = sender.tab?.id;
    if (tabId == null) return { ok: false };
    return handleSnipResult(request, tabId);
  },
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const type = (message as { type?: string })?.type;
  if (type === "CANCEL_ANALYZE") {
    const requestId = (message as { requestId?: string }).requestId;
    if (requestId) analyzeControllers.get(requestId)?.abort();
    sendResponse({ ok: true, data: { ok: true } });
    return true;
  }

  if (type !== "ANALYZE") return false;

  const request = message as Parameters<typeof runAnalyze>[0];
  const controller = new AbortController();
  analyzeControllers.set(request.requestId, controller);

  void runAnalyze(request, controller.signal)
    .then((data) => sendResponse({ ok: true, data }))
    .catch((error) => sendResponse({ ok: false, error: serializeError(error) }))
    .finally(() => {
      if (analyzeControllers.get(request.requestId) === controller)
        analyzeControllers.delete(request.requestId);
    });

  return true;
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === PORT_PANEL) {
    registerPanelPort(port);
    return;
  }
  if (port.name !== PORT_ERROR_PSYCH && port.name !== PORT_WEAKNESS) return;

  const controller = new AbortController();
  port.onDisconnect.addListener(() => controller.abort());

  port.onMessage.addListener(async (request) => {
    const events =
      port.name === PORT_WEAKNESS
        ? runWeaknessSummary(request, controller.signal)
        : runErrorPsych(request, controller.signal);
    for await (const event of events) {
      try {
        port.postMessage(event);
      } catch {
        return; // the panel closed mid-stream
      }
    }
  });
});

// Clear the fallback badge once the user actually opens the panel.
chrome.action.onClicked.addListener((tab) => {
  if (tab.id != null)
    void chrome.action.setBadgeText({ text: "", tabId: tab.id });
});
