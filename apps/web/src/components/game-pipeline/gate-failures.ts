import type { TFunction } from "i18next";
import type { GateFailure, PipelineConfig } from "@/fetchers/game-pipeline";
import { HttpError } from "@/lib/http-error";
import { stageLabel } from "./fields";

function stageName(config: PipelineConfig, key: string | null | undefined) {
  const stage = config.stages.find((s) => s.key === key);
  return stage ? stageLabel(stage) : (key ?? "");
}

export function formatGateFailure(
  t: TFunction,
  config: PipelineConfig,
  failure: GateFailure,
) {
  switch (failure.code) {
    case "notAllowedFrom":
      return failure.from
        ? t("gamePipeline:failures.notAllowedFrom", {
            stage: stageName(config, failure.from),
          })
        : t("gamePipeline:failures.notAllowedOutside", {
            stage: stageName(config, config.stages[0]?.key),
          });
    case "missingField":
      return t("gamePipeline:failures.missingField", {
        field: t(`gamePipeline:fields.${failure.field}.label`),
      });
    case "briefIncomplete":
      return t("gamePipeline:failures.briefIncomplete", {
        sections: (failure.sections ?? []).join(", "),
      });
    case "checklistIncomplete":
      return t("gamePipeline:failures.checklistIncomplete", {
        stage: stageName(config, failure.stage),
        remaining: failure.remaining ?? 0,
      });
    case "approvalRequired":
      return t(`gamePipeline:failures.approvalRequired.${failure.gate}`);
    case "kpiResultsMissing":
      return t("gamePipeline:failures.kpiResultsMissing", {
        kpis: (failure.kpis ?? [])
          .map((kpi) => t(`gamePipeline:kpis.${kpi}`))
          .join(", "),
      });
    case "wipLimitReached":
      return t("gamePipeline:failures.wipLimitReached", {
        current: failure.current ?? 0,
        limit: failure.limit ?? 0,
      });
    default:
      return t(`gamePipeline:failures.${failure.code}`);
  }
}

const STATUS_MESSAGES: Record<number, string> = {
  400: "gamePipeline:errors.invalid",
  403: "gamePipeline:errors.forbidden",
  404: "gamePipeline:errors.notFound",
  409: "gamePipeline:errors.conflict",
};

// The API's own messages are English, so translate by status instead of
// showing them; anything unexpected gets the caller's localized fallback.
export function apiErrorMessage(
  t: TFunction,
  error: unknown,
  fallback: string,
) {
  const key = error instanceof HttpError ? STATUS_MESSAGES[error.status] : null;
  return key ? t(key) : fallback;
}
