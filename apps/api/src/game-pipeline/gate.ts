import type { GameCardData } from "./card";
import type {
  PipelineConfig,
  PipelineStage,
  RequirableField,
  StageKey,
} from "./config";

// [Bracketed text] in a template or scaffold is guidance for the writer. It
// never counts as content, so an untouched scaffold cannot pass a gate.
const PLACEHOLDER = /\[[^\]\n]*\]/g;
const HAS_CONTENT = /[\p{L}\p{N}]/u;

export function stripPlaceholders(value: string) {
  return value.replace(PLACEHOLDER, "");
}

export function isFilled(value: unknown): boolean {
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "string") return false;
  return HAS_CONTENT.test(stripPlaceholders(value));
}

function normalizeLine(line: string) {
  return stripPlaceholders(line)
    .replace(/^\s*(?:[-*+]|\d+[.)])\s*/, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[:：]$/, "")
    .trim()
    .toLowerCase();
}

function headingOf(line: string) {
  const match = /^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/.exec(line);
  return match?.[1] ? match[1].trim().toLowerCase() : null;
}

function splitSections(markdown: string) {
  const sections = new Map<string, string[]>();
  let current: string[] | null = null;
  for (const line of markdown.split(/\r?\n/)) {
    const heading = headingOf(line);
    if (heading !== null) {
      current = [];
      sections.set(heading, current);
    } else if (current) {
      current.push(line);
    }
  }
  return sections;
}

function contentLines(lines: string[]) {
  return lines.map(normalizeLine).filter((line) => HAS_CONTENT.test(line));
}

// A required brief section is filled once it holds a line of the writer's
// own: placeholders are stripped and lines copied verbatim from the scaffold
// (like "PC:" or "game_start:") do not count.
export function missingBriefSections(
  brief: string | undefined,
  config: Pick<PipelineConfig, "mvpBrief">,
): string[] {
  const written = splitSections(brief ?? "");
  const scaffold = splitSections(config.mvpBrief.template);
  return config.mvpBrief.requiredSections.filter((section) => {
    const key = section.trim().toLowerCase();
    const lines = written.get(key);
    if (!lines) return true;
    const scaffoldLines = new Set(contentLines(scaffold.get(key) ?? []));
    return !contentLines(lines).some((line) => !scaffoldLines.has(line));
  });
}

export function computeTotalScore(
  config: Pick<PipelineConfig, "evaluation">,
  scores: Partial<Record<string, number | null>> | undefined,
): number | null {
  const { scaleMax, criteria } = config.evaluation;
  let weighted = 0;
  let totalWeight = 0;
  for (const criterion of criteria) {
    const score = scores?.[criterion.key];
    if (typeof score !== "number") return null;
    const clamped = Math.min(Math.max(score, 1), scaleMax);
    const normalized = criterion.inverse
      ? (scaleMax - clamped) / (scaleMax - 1)
      : (clamped - 1) / (scaleMax - 1);
    weighted += normalized * criterion.weight;
    totalWeight += criterion.weight;
  }
  if (totalWeight === 0) return null;
  return Math.round((weighted / totalWeight) * 1000) / 10;
}

export type KpiStatus = "met" | "notMet" | "noData";

export function kpiTarget(
  config: Pick<PipelineConfig, "kpis">,
  card: Pick<GameCardData, "kpi">,
  key: string,
) {
  const definition = config.kpis.find((kpi) => kpi.key === key);
  const override =
    card.kpi.results?.[key as keyof typeof card.kpi.results]?.target;
  return typeof override === "number" ? override : (definition?.target ?? null);
}

export function kpiStatus(
  config: Pick<PipelineConfig, "kpis">,
  card: Pick<GameCardData, "kpi">,
  key: string,
): KpiStatus {
  const definition = config.kpis.find((kpi) => kpi.key === key);
  const result = card.kpi.results?.[key as keyof typeof card.kpi.results];
  const target = kpiTarget(config, card, key);
  if (!definition || target === null || !result) return "noData";
  if (definition.operator === "ltvOverCac") {
    if (typeof result.ltv !== "number" || typeof result.cac !== "number")
      return "noData";
    return result.ltv > result.cac * (1 + target / 100) ? "met" : "notMet";
  }
  if (typeof result.actual !== "number") return "noData";
  switch (definition.operator) {
    case "gte":
      return result.actual >= target ? "met" : "notMet";
    case "lte":
      return result.actual <= target ? "met" : "notMet";
    default:
      return result.actual === target ? "met" : "notMet";
  }
}

export type GateFailure =
  | { code: "notAllowedFrom"; from: string | null }
  | { code: "missingField"; field: RequirableField }
  | { code: "briefIncomplete"; sections: string[] }
  | { code: "checklistIncomplete"; stage: StageKey; remaining: number }
  | { code: "evaluationIncomplete" }
  | { code: "evaluationNotApproved" }
  | { code: "approvalRequired"; gate: "development" | "scale" }
  | { code: "kpiResultsMissing"; kpis: string[] }
  | { code: "criticalBugsOpen" }
  | { code: "wipLimitReached"; limit: number; current: number };

export type GateTask = {
  userId: string | null;
  dueDate: Date | string | null;
};

export function uncheckedCount(
  stage: Pick<PipelineStage, "key" | "checklist">,
  card: Pick<GameCardData, "checklist">,
) {
  const checked = card.checklist[stage.key] ?? {};
  return stage.checklist.filter((item) => !checked[item.key]).length;
}

function fieldValue(
  field: RequirableField,
  card: GameCardData,
  task: GateTask,
): unknown {
  switch (field) {
    case "producerId":
      return card.producerId ?? undefined;
    case "qaId":
      return card.qaId ?? undefined;
    case "developerId":
      return task.userId ?? undefined;
    case "dueDate":
      return task.dueDate ? "set" : undefined;
    case "kpiDataSource":
      return card.kpi.dataSource;
    case "kpiMeasurementWindow":
      return card.kpi.measurementWindow;
    case "kpiSampleSize":
      return card.kpi.sampleSize ?? undefined;
    case "producerDecision":
      return card.kpi.producerDecision ?? undefined;
    default:
      return card.details[field];
  }
}

export function stageIndex(config: PipelineConfig, key: string | null) {
  return key ? config.stages.findIndex((stage) => stage.key === key) : -1;
}

/**
 * Checks a move of one game from `fromKey` to `toKey`. A null `fromKey` means
 * the game is not in a pipeline stage (new, planned, or in a column the team
 * added). Returns the unmet conditions; an empty list means the move passes.
 */
export function evaluateGate({
  config,
  card,
  task,
  fromKey,
  toKey,
  wipCount = 0,
}: {
  config: PipelineConfig;
  card: GameCardData;
  task: GateTask;
  fromKey: StageKey | null;
  toKey: StageKey;
  wipCount?: number;
}): GateFailure[] {
  const target = config.stages.find((stage) => stage.key === toKey);
  if (!target || fromKey === toKey) return [];
  // Stopping a game is never blocked; its checklist records the postmortem.
  if (toKey === "stopped") return [];

  const fromIndex = stageIndex(config, fromKey);
  const toIndex = stageIndex(config, toKey);
  // Moving back is rework and always allowed.
  if (fromIndex !== -1 && toIndex < fromIndex) return [];

  const first = config.stages[0];
  if (fromIndex === -1) {
    return toKey === first?.key
      ? []
      : [{ code: "notAllowedFrom", from: fromKey }];
  }
  if (!fromKey || !target.entry.from.includes(fromKey)) {
    return [{ code: "notAllowedFrom", from: fromKey }];
  }

  const failures: GateFailure[] = [];
  const source = config.stages[fromIndex];

  if (
    config.rules.stageChecklists &&
    target.entry.requireSourceChecklist &&
    source
  ) {
    const remaining = uncheckedCount(source, card);
    if (remaining > 0) {
      failures.push({
        code: "checklistIncomplete",
        stage: source.key,
        remaining,
      });
    }
  }

  for (const field of target.entry.requiredFields) {
    if (!config.rules.kpiTracking && field.startsWith("kpi")) continue;
    if (field === "mvpBrief") {
      const sections = missingBriefSections(card.details.mvpBrief, config);
      if (!isFilled(card.details.mvpBrief)) {
        failures.push({ code: "missingField", field });
      } else if (sections.length > 0) {
        failures.push({ code: "briefIncomplete", sections });
      }
      continue;
    }
    if (!isFilled(fieldValue(field, card, task))) {
      failures.push({ code: "missingField", field });
    }
  }

  if (target.entry.requireEvaluation) {
    if (computeTotalScore(config, card.evaluation.scores) === null) {
      failures.push({ code: "evaluationIncomplete" });
    }
    if (card.evaluation.decision !== "approved") {
      failures.push({ code: "evaluationNotApproved" });
    }
  }

  const gate = target.entry.requireApproval;
  if (gate) {
    const required =
      gate === "development"
        ? config.rules.requireDevelopmentApproval
        : config.rules.requireScaleApproval;
    if (required && !card.approvals[gate]) {
      failures.push({ code: "approvalRequired", gate });
    }
  }

  if (config.rules.kpiTracking) {
    if (target.entry.requireKpiResults) {
      const missing = config.kpis
        .filter((kpi) => kpiStatus(config, card, kpi.key) === "noData")
        .map((kpi) => kpi.key);
      if (missing.length > 0) {
        failures.push({ code: "kpiResultsMissing", kpis: missing });
      }
    }
    if (
      target.entry.requireNoCriticalBugs &&
      kpiStatus(config, card, "criticalBugs") !== "met"
    ) {
      failures.push({ code: "criticalBugsOpen" });
    }
  }

  if (target.entry.enforceWip && task.userId) {
    if (wipCount >= config.wipLimitPerDeveloper) {
      failures.push({
        code: "wipLimitReached",
        limit: config.wipLimitPerDeveloper,
        current: wipCount,
      });
    }
  }

  return failures;
}

export function describeFailures(stageName: string, failures: GateFailure[]) {
  const parts = failures.map((failure) => {
    switch (failure.code) {
      case "notAllowedFrom":
        return `not reachable from ${failure.from ?? "outside the pipeline"}`;
      case "missingField":
        return `missing ${failure.field}`;
      case "briefIncomplete":
        return `MVP brief sections not filled: ${failure.sections.join(", ")}`;
      case "checklistIncomplete":
        return `${failure.remaining} unchecked item(s) in the ${failure.stage} checklist`;
      case "evaluationIncomplete":
        return "idea evaluation not fully scored";
      case "evaluationNotApproved":
        return "idea evaluation decision is not approved";
      case "approvalRequired":
        return `${failure.gate} approval required`;
      case "kpiResultsMissing":
        return `KPI results missing: ${failure.kpis.join(", ")}`;
      case "criticalBugsOpen":
        return "critical bugs must be recorded as 0";
      case "wipLimitReached":
        return `developer WIP limit ${failure.limit} reached`;
      default:
        return "condition not met";
    }
  });
  return `Gate review blocked the move to ${stageName}: ${parts.join("; ")}`;
}
