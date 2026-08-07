import { describe, expect, it, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { S } from "../../shared/strings";
import type { Question } from "../../shared/types";
const sendRequest = vi.fn();
vi.mock("../../shared/messages", () => ({
  sendRequest: (...args: unknown[]) => sendRequest(...args),
}));
const { Review } = await import("./Review");
const questions: Question[] = [
  {
    id: "q1",
    sessionId: "s1",
    order: 1,
    stem: "The manager ___ the report.",
    imageIds: [],
    choices: [
      { label: "A", text: "submit" },
      { label: "B", text: "submits" },
    ],
  },
  {
    id: "q2",
    sessionId: "s1",
    order: 2,
    stem: "Please ___ us.",
    imageIds: [],
    choices: [
      { label: "A", text: "contact" },
      { label: "B", text: "contacted" },
    ],
  },
];
function renderReview(onAnalyzed = vi.fn()) {
  render(
    <Review
      sessionId="s1"
      questions={questions}
      visionSkipped={false}
      onAnalyzed={onAnalyzed}
    />,
  );
  return onAnalyzed;
}
describe("Review view", () => {
  it("never renders a correct answer — nothing here knows one", () => {
    renderReview();
    expect(screen.queryByText(S.result.correctAnswer)).not.toBeInTheDocument();
    expect(screen.getByText(S.review.hint)).toBeInTheDocument();
  });

  it("sends the ticked answers, leaving unticked ones undefined", async () => {
    sendRequest.mockResolvedValue({
      ok: true,
      data: { analyses: [], attemptIdByQuestionId: {} },
    });
    renderReview();
    await userEvent.click(
      within(screen.getByTestId("question-q1")).getByRole("button", {
        name: "B",
      }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: S.review.analyzeButton }),
    );
    expect(sendRequest).toHaveBeenCalledWith(
      "ANALYZE",
      expect.objectContaining({
        sessionId: "s1",
        answers: [
          { questionId: "q1", userAnswer: "B" },
          { questionId: "q2", userAnswer: undefined },
        ],
        skippedQuestionIds: [],
        requestId: expect.any(String),
      }),
    );
  });

  it("keeps the analyze button enabled with nothing ticked", () => {
    renderReview();
    expect(
      screen.getByRole("button", { name: S.review.analyzeButton }),
    ).toBeEnabled();
  });

  it("drops a skipped question from the payload and from the list", async () => {
    sendRequest.mockResolvedValue({
      ok: true,
      data: { analyses: [], attemptIdByQuestionId: {} },
    });
    renderReview();
    await userEvent.click(
      within(screen.getByTestId("question-q2")).getByRole("button", {
        name: S.review.skip,
      }),
    );
    expect(screen.queryByTestId("question-q2")).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: S.review.analyzeButton }),
    );
    expect(sendRequest).toHaveBeenCalledWith(
      "ANALYZE",
      expect.objectContaining({
        answers: [{ questionId: "q1", userAnswer: undefined }],
        skippedQuestionIds: ["q2"],
      }),
    );
  });

  it("toggles an answer off when the same label is clicked twice", async () => {
    sendRequest.mockResolvedValue({
      ok: true,
      data: { analyses: [], attemptIdByQuestionId: {} },
    });
    renderReview();
    const first = screen.getByTestId("question-q1");
    await userEvent.click(within(first).getByRole("button", { name: "A" }));
    await userEvent.click(within(first).getByRole("button", { name: "A" }));
    expect(screen.getByText(S.review.counter(0, 2))).toBeInTheDocument();
  });

  it("surfaces a failure with a retry instead of losing the parsed questions", async () => {
    sendRequest.mockResolvedValue({ ok: false, error: { code: "RATE_LIMIT" } });
    renderReview();
    await userEvent.click(
      screen.getByRole("button", { name: S.review.analyzeButton }),
    );
    expect(
      await screen.findByRole("button", { name: S.common.retry }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("question-q1")).toBeInTheDocument();
  });

  it("shows a cancel button while the analysis request is in flight", async () => {
    let resolveAnalyze: ((value: unknown) => void) | undefined;
    sendRequest.mockImplementation((type: string) => {
      if (type === "ANALYZE")
        return new Promise((resolve) => {
          resolveAnalyze = resolve;
        });
      return Promise.resolve({ ok: true, data: { ok: true } });
    });
    renderReview();
    await userEvent.click(
      screen.getByRole("button", { name: S.review.analyzeButton }),
    );
    expect(
      screen.getByRole("button", { name: S.common.cancel }),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: S.common.cancel }),
    );
    expect(sendRequest).toHaveBeenCalledWith(
      "CANCEL_ANALYZE",
      expect.objectContaining({ requestId: expect.any(String) }),
    );
    await act(async () => {
      resolveAnalyze?.({ ok: false, error: { code: "CANCELLED" } });
    });
  });
});
