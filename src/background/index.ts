import { PORT_ERROR_PSYCH, PORT_WEAKNESS, registerHandlers } from '../shared/messages';
import { runAnalyze, runErrorPsych, runParse, runTestConnection, runWeaknessSummary } from './aiRunner';

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error) => console.error('[imen] setPanelBehavior failed', error));

registerHandlers({
  PARSE_TEXT: (request) => runParse(request),
  ANALYZE: (request) => runAnalyze(request),
  TEST_CONNECTION: (request) => runTestConnection(request.config),
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== PORT_ERROR_PSYCH && port.name !== PORT_WEAKNESS) return;

  const controller = new AbortController();
  port.onDisconnect.addListener(() => controller.abort());

  port.onMessage.addListener(async (request) => {
    const events = port.name === PORT_WEAKNESS ? runWeaknessSummary(request, controller.signal) : runErrorPsych(request, controller.signal);
    for await (const event of events) {
      try {
        port.postMessage(event);
      } catch {
        return; // the panel closed mid-stream
      }
    }
  });
});
