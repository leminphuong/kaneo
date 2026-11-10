import type { PipelineConfig } from "@/fetchers/game-pipeline";

export const TREND_FIELDS = [
  { key: "trendSourceUrl", kind: "url" },
  { key: "trendEvidence", kind: "textarea" },
  { key: "audience", kind: "textarea" },
  { key: "gameplayIdea", kind: "textarea" },
  { key: "coreLoop", kind: "textarea" },
  { key: "winCondition", kind: "textarea" },
  { key: "loseCondition", kind: "textarea" },
  { key: "hook", kind: "textarea" },
] as const;

export const LINK_FIELDS = [
  "repositoryUrl",
  "buildUrl",
  "releaseUrl",
  "designDocUrl",
  "assetsUrl",
  "analyticsUrl",
  "qaReportUrl",
] as const;

export const CRITERIA = [
  "viralPotential",
  "marketFit",
  "gameplayAppeal",
  "productionCost",
  "technicalDifficulty",
] as const;

export const KPI_KEYS = [
  "validPlayers",
  "play30sRate",
  "replayRate",
  "d1Retention",
  "criticalBugs",
  "adsEfficiency",
] as const;

export const DECISIONS = ["approved", "revise", "rejected"] as const;
export const PRODUCER_DECISIONS = [
  "scale",
  "optimize",
  "retest",
  "stop",
] as const;
export const DEVICES = ["mobile", "desktop"] as const;
export const PRIORITIES = [
  "no-priority",
  "low",
  "medium",
  "high",
  "urgent",
] as const;

export type FieldKey =
  | (typeof TREND_FIELDS)[number]["key"]
  | (typeof LINK_FIELDS)[number]
  | "targetMarket"
  | "platform"
  | "mvpBrief";

// The first stage whose entry gate requires the field, for "required from"
// hints in the form and the preview.
export function requiredFromStage(config: PipelineConfig, field: string) {
  return config.stages.find((stage) =>
    (stage.entry.requiredFields as string[]).includes(field),
  );
}

export function stageLabel(stage: { emoji: string; name: string }) {
  return `${stage.emoji} ${stage.name}`.trim();
}

export function todayIn(timezone: string, now = new Date()) {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

export function newKey(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function newCreationKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
