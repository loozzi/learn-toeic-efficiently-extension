import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { Result } from "./Result";
import { S } from "../../shared/strings";
import type { Question, QuestionAnalysis } from "../../shared/types";
const questions: Question[] = [
  {
    id: "q1",
    sessionId: "s",
    order: 1,
    stem: "A stem",
    imageIds: [],
    choices: [
      { label: "A", text: "a" },
      { label: "B", text: "b" },
    ],
  },
  {
    id: "q2",
    sessionId: "s",
    order: 2,
    stem: "B stem",
    imageIds: [],
    choices: [
      { label: "A", text: "a" },
      { label: "B", text: "b" },
    ],
  },
];
const analyses: QuestionAnalysis[] = [
  {
    questionId: "q1",
    correctAnswer: "B",
    explanation: "exp1",
    strategy: "str1",
    topic: "subject-verb agreement",
    topicCategory: "grammar",
  },
  {
    questionId: "q2",
    correctAnswer: "A",
    explanation: "exp2",
    strategy: "str2",
    distractorNotes: { B: "wrong tense" },
    topic: "tense",
    topicCategory: "grammar",
  },
];
function renderResult() {
  render(
    <Result
      questions={questions}
      analyses={analyses}
      answers={{ q1: "B", q2: "B" }}
      attemptIdByQuestionId={{ q1: "a1", q2: "a2" }}
      renderErrorPanel={() => <div data-testid="error-panel" />}
      onRestart={vi.fn()}
    />,
  );
}
describe("Result view", () => {
  it("marks a matching answer correct and a mismatching one wrong", () => {
    renderResult();
    expect(
      within(screen.getByTestId("result-q1")).getByText(S.result.correct),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId("result-q2")).getByText(S.result.wrong),
    ).toBeInTheDocument();
  });
  it("shows explanation and strategy for every question", () => {
    renderResult();
    expect(screen.getByText("exp1")).toBeInTheDocument();
    expect(screen.getByText("str2")).toBeInTheDocument();
  });
  it("offers the mistake-analysis panel only on wrong answers", () => {
    renderResult();
    expect(
      within(screen.getByTestId("result-q1")).queryByTestId("error-panel"),
    ).not.toBeInTheDocument();
    expect(
      within(screen.getByTestId("result-q2")).getByTestId("error-panel"),
    ).toBeInTheDocument();
  });
  it("shows distractor notes when the model supplied them", () => {
    renderResult();
    expect(screen.getByText(/wrong tense/)).toBeInTheDocument();
  });
  it("shows token usage when provided", () => {
    render(
      <Result
        questions={questions}
        analyses={analyses}
        answers={{ q1: "B", q2: "B" }}
        attemptIdByQuestionId={{ q1: "a1", q2: "a2" }}
        renderErrorPanel={() => <div data-testid="error-panel" />}
        onRestart={vi.fn()}
        usage={{ inputTokens: 12, outputTokens: 8, totalTokens: 20 }}
      />,
    );
    expect(
      screen.getByText(S.result.tokenUsage(12, 8, 20)),
    ).toBeInTheDocument();
  });
});
