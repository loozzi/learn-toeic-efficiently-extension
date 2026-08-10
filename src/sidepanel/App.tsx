import { Settings as SettingsIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  PORT_PANEL,
  type PanelEvent,
  type PendingCapture,
  sendRequest,
} from "../shared/messages";
import { IconButton } from "../shared/components/IconButton";
import { ThemeToggle } from "../shared/components/ThemeToggle";
import { getSettings, isConfigured } from "../shared/storage/settings";
import { S } from "../shared/strings";
import type {
  ImageInput,
  Question,
  QuestionAnalysis,
  TokenUsage,
} from "../shared/types";
import { ErrorPanel } from "./components/ErrorPanel";
import { Onboarding } from "./components/Onboarding";
import { Paste } from "./views/Paste";
import { Result } from "./views/Result";
import { Review } from "./views/Review";

export type PanelState =
  | { view: "loading" }
  | { view: "onboarding" }
  | { view: "paste" }
  | {
      view: "review";
      sessionId: string;
      questions: Question[];
      visionSkipped: boolean;
    }
  | {
      view: "result";
      questions: Question[];
      analyses: QuestionAnalysis[];
      answers: Record<string, string | undefined>;
      attemptIdByQuestionId: Record<string, string>;
      usage?: TokenUsage;
    };

const STEP_ORDER = ["paste", "review", "result"] as const;
const STEP_LABEL = {
  paste: S.steps.paste,
  review: S.steps.review,
  result: S.steps.result,
};

function Steps({ current }: { current: (typeof STEP_ORDER)[number] }) {
  const index = STEP_ORDER.indexOf(current);
  return (
    <ol className="flex items-center gap-1.5 text-xs">
      {STEP_ORDER.map((step, i) => (
        <li key={step} className="flex items-center gap-1.5">
          <span
            className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1 font-semibold transition-colors duration-150 ${
              i < index
                ? "bg-accent text-accent-foreground"
                : i === index
                  ? "bg-primary text-primary-foreground"
                  : "bg-surface-muted text-muted-foreground"
            }`}
          >
            {i + 1}
          </span>
          <span
            className={
              i === index
                ? "font-medium text-foreground"
                : "text-muted-foreground"
            }
          >
            {STEP_LABEL[step]}
          </span>
          {i < STEP_ORDER.length - 1 && (
            <span className="mx-0.5 h-px w-3 bg-border" />
          )}
        </li>
      ))}
    </ol>
  );
}

export function App() {
  const [state, setState] = useState<PanelState>({ view: "loading" });
  const [snipped, setSnipped] = useState<ImageInput[]>([]);
  const [snipFailed, setSnipFailed] = useState(0);

  const parseCapture = useCallback(async (capture: PendingCapture) => {
    setState({ view: "loading" });
    const reply = await sendRequest("PARSE_TEXT", {
      rawText: capture.rawText,
      images: capture.images,
      origin: "selection",
      sourceUrl: capture.sourceUrl,
      sourceTitle: capture.sourceTitle,
    });
    // A parse failure drops to the paste view rather than a dead end: the raw
    // text is still in the clipboard and ErrorBanner covers the retry there.
    setState(reply.ok ? { view: "review", ...reply.data } : { view: "paste" });
  }, []);

  const claim = useCallback(async () => {
    const reply = await sendRequest("CLAIM_PENDING_CAPTURE", {});
    if (reply.ok && reply.data.capture) {
      await parseCapture(reply.data.capture);
      return true;
    }
    return false;
  }, [parseCapture]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const settings = await getSettings();
      if (cancelled) return;
      if (!isConfigured(settings)) {
        setState({ view: "onboarding" });
        return;
      }
      const claimed = await claim();
      if (!cancelled && !claimed) setState({ view: "paste" });
    })();

    const port = chrome.runtime.connect({ name: PORT_PANEL });
    port.onMessage.addListener((event: PanelEvent) => {
      if (event.type === "pendingCapture") void claim();
      if (event.type === "snipImage")
        setSnipped((current) => [...current, event.image]);
      if (event.type === "snipFailed")
        setSnipFailed((current) => current + 1);
    });

    return () => {
      cancelled = true;
      port.disconnect();
    };
  }, [claim]);

  function renderBody() {
    switch (state.view) {
      case "loading":
        return (
          <div className="flex h-full items-center justify-center">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary" />
          </div>
        );
      case "onboarding":
        return <Onboarding />;
      case "paste":
        return (
          <Paste
            snipped={snipped}
            snipFailed={snipFailed}
            onParsed={(payload) => setState({ view: "review", ...payload })}
          />
        );
      case "review":
        return (
          <Review
            sessionId={state.sessionId}
            questions={state.questions}
            visionSkipped={state.visionSkipped}
            onAnalyzed={(payload) => setState({ view: "result", ...payload })}
          />
        );
      case "result":
        return (
          <Result
            questions={state.questions}
            analyses={state.analyses}
            answers={state.answers}
            attemptIdByQuestionId={state.attemptIdByQuestionId}
            usage={state.usage}
            renderErrorPanel={(questionId, attemptId) => (
              <ErrorPanel questionId={questionId} attemptId={attemptId} />
            )}
            onRestart={() => setState({ view: "paste" })}
          />
        );
    }
  }

  const step =
    state.view === "paste" || state.view === "review" || state.view === "result"
      ? state.view
      : null;

  return (
    <div className="flex h-full flex-col bg-background">
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-surface px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
            I
          </span>
          {step ? (
            <Steps current={step} />
          ) : (
            <span className="text-sm font-semibold">{S.appName}</span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <ThemeToggle />
          <IconButton
            aria-label={S.common.openDashboard}
            title={S.common.openDashboard}
            onClick={() => chrome.runtime.openOptionsPage()}
          >
            <SettingsIcon size={16} strokeWidth={2} />
          </IconButton>
        </div>
      </header>

      <div className="flex-1 overflow-auto">{renderBody()}</div>
    </div>
  );
}
