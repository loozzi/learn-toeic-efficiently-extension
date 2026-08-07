import { z } from "zod";
import { appError } from "../shared/errors";
import type { ChatUsage } from "./types";

const ChoiceSchema = z.object({
  label: z.string().min(1).max(4),
  text: z.string(),
});
export const ParsedQuestionSchema = z.object({
  order: z.number().int().min(1),
  stem: z.string().min(1),
  passage: z.string().optional(),
  choices: z.array(ChoiceSchema).min(2),
  toeicPart: z.number().int().min(1).max(7).optional(),
});
export const ParseResultSchema = z.object({
  questions: z.array(ParsedQuestionSchema),
});
export const RawAnalysisSchema = z.object({
  order: z.number().int().min(1),
  correctAnswer: z.string().min(1).max(4),
  explanation: z.string().min(1),
  strategy: z.string().min(1),
  distractorNotes: z.record(z.string(), z.string()).optional(),
  topic: z.string().min(1),
  topicCategory: z.enum(["grammar", "vocabulary", "reading", "other"]),
});
export const AnalyzeResultSchema = z.object({
  analyses: z.array(RawAnalysisSchema),
});
export type ParsedQuestion = z.infer<typeof ParsedQuestionSchema>;
export type RawAnalysis = z.infer<typeof RawAnalysisSchema>;
export function stripFences(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1] : raw).trim();
}
export async function parseJsonWithRepair<T>(
  raw: string,
  schema: z.ZodType<T>,
  repair: (feedback: string) => Promise<string>,
): Promise<T> {
  return (
    await parseJsonWithRepairWithUsage(raw, schema, async (feedback) => ({
      text: await repair(feedback),
    }))
  ).value;
}

export async function parseJsonWithRepairWithUsage<T>(
  raw: string,
  schema: z.ZodType<T>,
  repair: (feedback: string) => Promise<{ text: string; usage?: ChatUsage }>,
): Promise<{ value: T; usage?: ChatUsage }> {
  const attempt = (
    text: string,
  ): { ok: true; value: T } | { ok: false; reason: string } => {
    try {
      return { ok: true, value: schema.parse(JSON.parse(stripFences(text))) };
    } catch (error) {
      return {
        ok: false,
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  };
  const first = attempt(raw);
  if (first.ok) return { value: first.value };
  const retried = await repair(
    `Your previous reply was not valid JSON matching the required schema. Error: ${first.reason}. Reply again with ONLY the JSON object, no prose, no markdown fences.`,
  );
  const second = attempt(retried.text);
  if (second.ok) return { value: second.value, usage: retried.usage };
  throw appError("SCHEMA", { detail: second.reason, raw: retried.text });
}
