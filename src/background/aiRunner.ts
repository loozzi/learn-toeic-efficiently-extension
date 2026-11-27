import { createProvider } from "../ai/index";
import { buildAnalyzePrompt } from "../ai/prompts/analyze";
import {
  FIX_MARKER,
  buildErrorPsychPrompt,
  splitDiagnosis,
} from "../ai/prompts/errorPsych";
import { buildHintPrompt } from "../ai/prompts/hint";
import { buildParsePrompt } from "../ai/prompts/parse";
import { buildWeaknessPrompt } from "../ai/prompts/weakness";
import {
  AnalyzeResultSchema,
  ParseResultSchema,
  parseJsonWithRepairWithUsage,
} from "../ai/schema";
import type { ChatPart, ChatUsage } from "../ai/types";
import { appError, serializeError } from "../shared/errors";
import type {
  ErrorPsychEvent,
  RequestMap,
  WeaknessEvent,
} from "../shared/messages";
import type { Stats } from "../shared/storage/stats";
import {
  answerForAttempt,
  createSession,
  deleteQuestions,
  findQuestion,
  getAnalysis,
  getQuestionsBySession,
  getSession,
  putAnalyses,
  putErrorAnalysis,
  putQuestions,
  putSession,
  recordAttempt,
} from "../shared/storage/history";
import { getSettings, isConfigured } from "../shared/storage/settings";
import type {
  ErrorTag,
  ImageInput,
  Question,
  QuestionAnalysis,
  Settings,
} from "../shared/types";

const MAX_QUESTIONS = 20;

async function requireSettings(): Promise<Settings> {
  const settings = await getSettings();
  if (!isConfigured(settings)) throw appError("NO_API_KEY");
  return settings;
}
function imageParts(images: ImageInput[], supportsVision: boolean): ChatPart[] {
  return supportsVision
    ? images.map((image) => ({
        type: "image" as const,
        mime: image.mime,
        dataBase64: image.dataBase64,
      }))
    : [];
}
function sumUsage(
  first?: ChatUsage,
  second?: ChatUsage,
): ChatUsage | undefined {
  if (!first && !second) return undefined;
  return {
    inputTokens: (first?.inputTokens ?? 0) + (second?.inputTokens ?? 0),
    outputTokens: (first?.outputTokens ?? 0) + (second?.outputTokens ?? 0),
    totalTokens: (first?.totalTokens ?? 0) + (second?.totalTokens ?? 0),
  };
}

export async function runParse(
  input: RequestMap["PARSE_TEXT"]["req"],
  signal: AbortSignal = new AbortController().signal,
): Promise<RequestMap["PARSE_TEXT"]["res"]> {
  const settings = await requireSettings();
  const provider = createProvider(settings.ai);
  const system = buildParsePrompt(settings.explanationLanguage);
  const visionSkipped = input.images.length > 0 && !settings.ai.supportsVision;
  const userParts: ChatPart[] = [
    { type: "text", text: input.rawText },
    ...imageParts(input.images, settings.ai.supportsVision),
  ];

  const initial = await provider.complete(
    { system, userParts, json: true },
    signal,
  );
  const result = await parseJsonWithRepairWithUsage(
    initial.text,
    ParseResultSchema,
    async (feedback) =>
      provider.complete(
        {
          system,
          userParts: [...userParts, { type: "text", text: feedback }],
          json: true,
        },
        signal,
      ),
  );
  void sumUsage(initial.usage, result.usage);
  const parsed = result.value;

  if (parsed.questions.length === 0) throw appError("PARSE_EMPTY");
  if (parsed.questions.length > MAX_QUESTIONS)
    throw appError("TOO_MANY", {
      detail: `${parsed.questions.length} questions`,
    });

  const session = await createSession({
    origin: input.origin,
    sourceUrl: input.sourceUrl,
    sourceTitle: input.sourceTitle,
    rawText: input.rawText,
    questionIds: [],
  });
  const questions: Question[] = parsed.questions.map((question) => ({
    id: crypto.randomUUID(),
    sessionId: session.id,
    order: question.order,
    stem: question.stem,
    passage: question.passage,
    choices: question.choices,
    imageIds: [],
    toeicPart: question.toeicPart as Question["toeicPart"],
  }));

  await putQuestions(questions);
  await putSession({
    ...session,
    questionIds: questions.map((question) => question.id),
  });
  return { sessionId: session.id, questions, visionSkipped };
}

export async function runAnalyze(
  input: RequestMap["ANALYZE"]["req"],
  signal: AbortSignal = new AbortController().signal,
): Promise<RequestMap["ANALYZE"]["res"]> {
  const settings = await requireSettings();
  const provider = createProvider(settings.ai);
  const session = await getSession(input.sessionId);
  if (!session) throw appError("UNKNOWN", { detail: "session missing" });

  if (input.skippedQuestionIds.length > 0)
    await deleteQuestions(input.skippedQuestionIds);
  const kept = (await getQuestionsBySession(input.sessionId)).filter(
    (question) => !input.skippedQuestionIds.includes(question.id),
  );
  if (kept.length === 0) throw appError("PARSE_EMPTY");

  const answers: Record<string, string | undefined> = {};
  for (const answer of input.answers)
    answers[answer.questionId] = answer.userAnswer;

  const { system, user } = buildAnalyzePrompt({
    language: settings.explanationLanguage,
    questions: kept,
    answers,
  });
  const userParts: ChatPart[] = [{ type: "text", text: user }];

  const initial = await provider.complete(
    { system, userParts, json: true },
    signal,
  );
  const result = await parseJsonWithRepairWithUsage(
    initial.text,
    AnalyzeResultSchema,
    async (feedback) =>
      provider.complete(
        {
          system,
          userParts: [...userParts, { type: "text", text: feedback }],
          json: true,
        },
        signal,
      ),
  );
  const usage = sumUsage(initial.usage, result.usage);
  const parsed = result.value;
  if (signal.aborted) throw appError("CANCELLED");

  const byOrder = new Map(kept.map((question) => [question.order, question]));
  const analyses: QuestionAnalysis[] = [];
  const attemptIdByQuestionId: Record<string, string> = {};

  for (const rawAnalysis of parsed.analyses) {
    const question = byOrder.get(rawAnalysis.order);
    if (!question) continue; // the model invented an order; drop it rather than mis-attributing
    analyses.push({
      questionId: question.id,
      correctAnswer: rawAnalysis.correctAnswer,
      explanation: rawAnalysis.explanation,
      strategy: rawAnalysis.strategy,
      distractorNotes: rawAnalysis.distractorNotes,
      topic: rawAnalysis.topic,
      topicCategory: rawAnalysis.topicCategory,
    });
    const attempt = await recordAttempt({
      questionId: question.id,
      userAnswer: answers[question.id],
      correctAnswer: rawAnalysis.correctAnswer,
      isRetry: false,
    });
    attemptIdByQuestionId[question.id] = attempt.id;
  }

  await putAnalyses(analyses);
  await putSession({ ...session, analysisUsage: usage });
  return { analyses, attemptIdByQuestionId, usage };
}

export async function* runErrorPsych(
  input: {
    questionId: string;
    attemptId: string;
    userTags: ErrorTag[];
    userNote?: string;
  },
  signal: AbortSignal = new AbortController().signal,
): AsyncGenerator<ErrorPsychEvent> {
  try {
    const settings = await requireSettings();
    const provider = createProvider(settings.ai);

    const analysis = await getAnalysis(input.questionId);
    if (!analysis)
      throw appError("UNKNOWN", { detail: "analysis missing for question" });
    const question = await findQuestion(input.questionId);
    if (!question) throw appError("UNKNOWN", { detail: "question missing" });
    const attemptAnswer = await answerForAttempt(input.attemptId);

    const { system, user } = buildErrorPsychPrompt({
      language: settings.explanationLanguage,
      question,
      correctAnswer: analysis.correctAnswer,
      userAnswer: attemptAnswer ?? "",
      userTags: input.userTags,
      userNote: input.userNote,
    });

    let full = "";
    for await (const chunk of provider.stream(
      { system, userParts: [{ type: "text", text: user }], json: false },
      signal,
    )) {
      full += chunk.delta;
      yield { type: "delta", text: chunk.delta };
    }

    const { aiDiagnosis, fixAdvice } = splitDiagnosis(full || FIX_MARKER);
    await putErrorAnalysis({
      attemptId: input.attemptId,
      questionId: input.questionId,
      userTags: input.userTags,
      userNote: input.userNote,
      aiDiagnosis,
      fixAdvice,
    });
    yield { type: "done", aiDiagnosis, fixAdvice };
  } catch (error) {
    yield { type: "error", error: serializeError(error) };
  }
}

export async function* runWeaknessSummary(
  stats: Stats,
  signal: AbortSignal = new AbortController().signal,
): AsyncGenerator<WeaknessEvent> {
  try {
    const settings = await requireSettings();
    const provider = createProvider(settings.ai);
    const { system, user } = buildWeaknessPrompt({
      language: settings.explanationLanguage,
      stats,
    });

    let full = "";
    for await (const chunk of provider.stream(
      { system, userParts: [{ type: "text", text: user }], json: false },
      signal,
    )) {
      full += chunk.delta;
      yield { type: "delta", text: chunk.delta };
    }

    yield { type: "done", text: full };
  } catch (error) {
    yield { type: "error", error: serializeError(error) };
  }
}

export async function runHint(
  input: RequestMap["HINT"]["req"],
  signal: AbortSignal = new AbortController().signal,
): Promise<RequestMap["HINT"]["res"]> {
  const settings = await requireSettings();
  const provider = createProvider(settings.ai);
  const question = await findQuestion(input.questionId);
  if (!question) throw appError("UNKNOWN", { detail: "question missing" });

  const { system, user } = buildHintPrompt({
    language: settings.explanationLanguage,
    question,
    previousHints: input.previousHints,
  });
  const reply = await provider.complete(
    { system, userParts: [{ type: "text", text: user }], json: false },
    signal,
  );
  const hint = reply.text
    .trim()
    .replace(/^["“](.*)["”]$/s, "$1")
    .trim();
  if (!hint) throw appError("UNKNOWN", { detail: "empty hint" });
  return { hint };
}

export async function runTestConnection(
  config: RequestMap["TEST_CONNECTION"]["req"]["config"],
): Promise<RequestMap["TEST_CONNECTION"]["res"]> {
  try {
    const provider = createProvider(config);
    await provider.complete(
      {
        system: "Reply with the single word OK.",
        userParts: [{ type: "text", text: "ping" }],
        json: false,
      },
      AbortSignal.timeout(20_000),
    );
    return { ok: true, message: "" };
  } catch (error) {
    return { ok: false, message: serializeError(error).code };
  }
}
