import { z } from "../openapi";
import {
  type APPROVAL_GATES,
  DEVICE_KEYS,
  EVALUATION_CRITERIA,
  EVALUATION_DECISIONS,
  KPI_KEYS,
  PRODUCER_DECISIONS,
} from "./config";

// Only http(s) links are stored: the web renders them as anchors, so any
// other scheme (javascript:, data:) would be an injection vector.
const httpUrl = z
  .string()
  .trim()
  .max(2048)
  .refine((value) => {
    if (value === "") return true;
    try {
      const url = new URL(value);
      return url.protocol === "http:" || url.protocol === "https:";
    } catch {
      return false;
    }
  }, "Expected an http(s) URL");

const longText = z.string().max(20000);
const nullableScore = z.number().int().min(1).max(10).nullable();
const nullableNumber = z.number().min(0).max(1_000_000_000).nullable();

export const gameDetailsSchema = z
  .object({
    targetMarket: longText,
    platform: longText,
    trendEvidence: longText,
    audience: longText,
    gameplayIdea: longText,
    coreLoop: longText,
    winCondition: longText,
    loseCondition: longText,
    hook: longText,
    mvpBrief: longText,
    trendSourceUrl: httpUrl,
    repositoryUrl: httpUrl,
    buildUrl: httpUrl,
    releaseUrl: httpUrl,
    designDocUrl: httpUrl,
    assetsUrl: httpUrl,
    analyticsUrl: httpUrl,
    qaReportUrl: httpUrl,
    devices: z.array(z.enum(DEVICE_KEYS)).max(DEVICE_KEYS.length),
  })
  .partial()
  .openapi("GameDetails");

export const gameEvaluationSchema = z
  .object({
    scores: z
      .object(
        Object.fromEntries(
          EVALUATION_CRITERIA.map((key) => [key, nullableScore]),
        ) as Record<(typeof EVALUATION_CRITERIA)[number], typeof nullableScore>,
      )
      .partial(),
    estimatedMvpDays: z.number().int().min(1).max(3650).nullable(),
    comments: longText,
    decision: z.enum(EVALUATION_DECISIONS).nullable(),
  })
  .partial()
  .openapi("GameEvaluation");

const kpiResultSchema = z
  .object({
    actual: nullableNumber,
    // Per-game override of the project's target threshold.
    target: nullableNumber,
    ltv: nullableNumber,
    cac: nullableNumber,
  })
  .partial();

export const gameKpiSchema = z
  .object({
    results: z
      .object(
        Object.fromEntries(
          KPI_KEYS.map((key) => [key, kpiResultSchema]),
        ) as Record<(typeof KPI_KEYS)[number], typeof kpiResultSchema>,
      )
      .partial(),
    dataSource: z.string().max(500),
    measurementWindow: z.string().max(200),
    sampleSize: z.number().int().min(0).max(1_000_000_000).nullable(),
    notes: longText,
    producerDecision: z.enum(PRODUCER_DECISIONS).nullable(),
  })
  .partial()
  .openapi("GameKpi");

export type GameDetails = z.infer<typeof gameDetailsSchema>;
export type GameEvaluation = z.infer<typeof gameEvaluationSchema>;
export type GameKpi = z.infer<typeof gameKpiSchema>;
export type ApprovalGate = (typeof APPROVAL_GATES)[number];

export type ChecklistState = Record<
  string,
  Record<string, { by: string | null; at: string }>
>;
export type ApprovalState = Partial<
  Record<ApprovalGate, { by: string; at: string }>
>;

export type GameCardData = {
  producerId: string | null;
  qaId: string | null;
  details: GameDetails;
  evaluation: GameEvaluation;
  kpi: GameKpi;
  checklist: ChecklistState;
  approvals: ApprovalState;
};

export function emptyCardData(): GameCardData {
  return {
    producerId: null,
    qaId: null,
    details: {},
    evaluation: {},
    kpi: {},
    checklist: {},
    approvals: {},
  };
}

export function asRecord<T>(value: unknown): T {
  return (
    value && typeof value === "object" && !Array.isArray(value) ? value : {}
  ) as T;
}
