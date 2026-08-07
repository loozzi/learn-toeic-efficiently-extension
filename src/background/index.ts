import { PORT_ERROR_PSYCH, registerHandlers } from '../shared/messages';
import { runAnalyze, runErrorPsych, runParse, runTestConnection } from './aiRunner';

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error) => console.error('[imen] setPanelBehavior failed', error));

registerHandlers({
  PARSE_TEXT: (request) => runParse(request),
  ANALYZE: (request) => runAnalyze(request),
  TEST_CONNECTION: (request) => runTestConnection(request.config),
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== PORT_ERROR_PSYCH) return;
  const controller = new AbortController();
  port.onDisconnect.addListener(() => controller.abort());
  port.onMessage.addListener(async (request) => {
    for await (const event of runErrorPsych(request, controller.signal)) {
      try {
        port.postMessage(event);
      } catch {
        return; // the panel closed mid-stream
      }
    }
  });
});
