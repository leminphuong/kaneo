import { produce } from "immer";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type {
  CreateGameRequest,
  PipelineConfig,
} from "@/fetchers/game-pipeline";
import {
  CRITERIA,
  DECISIONS,
  DEVICES,
  LINK_FIELDS,
  PRODUCER_DECISIONS,
  requiredFromStage,
  stageLabel,
  TREND_FIELDS,
} from "./fields";
import MemberSelect from "./member-select";
import OptionSelect from "./option-select";

type Details = NonNullable<CreateGameRequest["details"]>;
type Evaluation = NonNullable<CreateGameRequest["evaluation"]>;
type Kpi = NonNullable<CreateGameRequest["kpi"]>;

export type GameDetailsValue = {
  producerId: string | null;
  qaId: string | null;
  details: Details;
  evaluation: Evaluation;
  kpi: Kpi;
};

export function computeTotalScore(
  config: PipelineConfig,
  scores: Evaluation["scores"],
) {
  const { scaleMax, criteria } = config.evaluation;
  let weighted = 0;
  let total = 0;
  for (const criterion of criteria) {
    const score = scores?.[criterion.key];
    if (typeof score !== "number") return null;
    const normalized = criterion.inverse
      ? (scaleMax - score) / (scaleMax - 1)
      : (score - 1) / (scaleMax - 1);
    weighted += normalized * criterion.weight;
    total += criterion.weight;
  }
  return total === 0 ? null : Math.round((weighted / total) * 1000) / 10;
}

function parseNumber(value: string) {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function Section({
  title,
  children,
  defaultOpen = false,
  badge,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  badge?: ReactNode;
}) {
  return (
    <Collapsible
      defaultOpen={defaultOpen}
      className="rounded-lg border border-border bg-background"
    >
      <CollapsibleTrigger className="group flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium">
        <ChevronRight className="size-4 shrink-0 transition-transform group-data-panel-open:rotate-90" />
        <span className="flex-1">{title}</span>
        {badge}
      </CollapsibleTrigger>
      <CollapsiblePanel>
        <div className="space-y-3 border-t border-border px-3 py-3">
          {children}
        </div>
      </CollapsiblePanel>
    </Collapsible>
  );
}

function FieldHint({
  config,
  field,
}: {
  config: PipelineConfig;
  field: string;
}) {
  const { t } = useTranslation();
  const stage = requiredFromStage(config, field);
  if (!stage) return null;
  return (
    <span className="text-[11px] font-normal text-muted-foreground">
      {t("gamePipeline:preview.requiredAt", { stage: stageLabel(stage) })}
    </span>
  );
}

function TextField({
  id,
  config,
  field,
  value,
  onChange,
  multiline,
  type = "text",
  disabled,
}: {
  id: string;
  config: PipelineConfig;
  field: string;
  value: string | undefined;
  onChange: (value: string) => void;
  multiline?: boolean;
  type?: string;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const placeholder = t(`gamePipeline:fields.${field}.hint`);
  return (
    <div className="space-y-1">
      <Label
        htmlFor={id}
        className="flex flex-wrap items-baseline justify-between gap-x-2"
      >
        <span>{t(`gamePipeline:fields.${field}.label`)}</span>
        <FieldHint config={config} field={field} />
      </Label>
      {multiline ? (
        <Textarea
          id={id}
          rows={2}
          placeholder={placeholder}
          disabled={disabled}
          value={value ?? ""}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <Input
          id={id}
          type={type}
          inputMode={type === "url" ? "url" : undefined}
          placeholder={placeholder}
          disabled={disabled}
          value={value ?? ""}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </div>
  );
}

export function GameRoleFields({
  value,
  onChange,
  canChangeProducer,
  disabled,
}: {
  value: GameDetailsValue;
  onChange: (value: GameDetailsValue) => void;
  canChangeProducer: boolean;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <>
      <div className="space-y-1">
        <Label htmlFor="game-producer">{t("gamePipeline:form.producer")}</Label>
        <MemberSelect
          id="game-producer"
          value={value.producerId}
          disabled={disabled || !canChangeProducer}
          onChange={(producerId) => onChange({ ...value, producerId })}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="game-qa">{t("gamePipeline:form.qa")}</Label>
        <MemberSelect
          id="game-qa"
          value={value.qaId}
          disabled={disabled}
          onChange={(qaId) => onChange({ ...value, qaId })}
        />
      </div>
    </>
  );
}

export function GameProductFields({
  config,
  value,
  onChange,
  disabled,
}: {
  config: PipelineConfig;
  value: GameDetailsValue;
  onChange: (value: GameDetailsValue) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const set = (recipe: (draft: GameDetailsValue) => void) =>
    onChange(produce(value, recipe));
  const devices = value.details.devices ?? [];
  return (
    <>
      <TextField
        id="game-targetMarket"
        config={config}
        field="targetMarket"
        disabled={disabled}
        value={value.details.targetMarket}
        onChange={(next) =>
          set((draft) => {
            draft.details.targetMarket = next;
          })
        }
      />
      <TextField
        id="game-platform"
        config={config}
        field="platform"
        disabled={disabled}
        value={value.details.platform}
        onChange={(next) =>
          set((draft) => {
            draft.details.platform = next;
          })
        }
      />
      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium">
          {t("gamePipeline:fields.devices.label")}
        </legend>
        <div className="flex gap-4">
          {DEVICES.map((device) => (
            <label
              key={device}
              htmlFor={`game-device-${device}`}
              className="flex items-center gap-2 text-sm"
            >
              <Checkbox
                id={`game-device-${device}`}
                disabled={disabled}
                checked={devices.includes(device)}
                onCheckedChange={(checked) =>
                  set((draft) => {
                    const current = new Set(draft.details.devices ?? []);
                    if (checked) current.add(device);
                    else current.delete(device);
                    draft.details.devices = DEVICES.filter((d) =>
                      current.has(d),
                    );
                  })
                }
              />
              {t(`gamePipeline:devices.${device}`)}
            </label>
          ))}
        </div>
      </fieldset>
    </>
  );
}

/** Sections B to F of a game: everything a plain task has no field for. */
export function GameDetailSections({
  config,
  value,
  onChange,
  canDecide,
  disabled,
  defaultOpen = false,
}: {
  config: PipelineConfig;
  value: GameDetailsValue;
  onChange: (value: GameDetailsValue) => void;
  canDecide: boolean;
  disabled?: boolean;
  defaultOpen?: boolean;
}) {
  const { t } = useTranslation();
  const set = (recipe: (draft: GameDetailsValue) => void) =>
    onChange(produce(value, recipe));
  const total = computeTotalScore(config, value.evaluation.scores);
  const scoreOptions = Array.from(
    { length: config.evaluation.scaleMax },
    (_, index) => ({ value: String(index + 1), label: String(index + 1) }),
  );

  return (
    <div className="space-y-2">
      <Section
        title={t("gamePipeline:sections.trend")}
        defaultOpen={defaultOpen}
      >
        {TREND_FIELDS.map((field) => (
          <TextField
            key={field.key}
            id={`game-${field.key}`}
            config={config}
            field={field.key}
            disabled={disabled}
            multiline={field.kind === "textarea"}
            type={field.kind === "url" ? "url" : "text"}
            value={value.details[field.key]}
            onChange={(next) =>
              set((draft) => {
                draft.details[field.key] = next;
              })
            }
          />
        ))}
      </Section>

      <Section
        title={t("gamePipeline:sections.evaluation")}
        badge={
          <Badge variant="secondary" className="font-normal">
            {total === null
              ? t("gamePipeline:notScored")
              : t("gamePipeline:totalScore", { score: total })}
          </Badge>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {CRITERIA.map((criterion) => (
            <div key={criterion} className="space-y-1">
              <Label htmlFor={`game-score-${criterion}`}>
                {t(`gamePipeline:criteria.${criterion}`)}
              </Label>
              <OptionSelect
                id={`game-score-${criterion}`}
                disabled={disabled}
                emptyLabel={t("gamePipeline:notScored")}
                value={
                  typeof value.evaluation.scores?.[criterion] === "number"
                    ? String(value.evaluation.scores[criterion])
                    : null
                }
                options={scoreOptions}
                onChange={(next) =>
                  set((draft) => {
                    draft.evaluation.scores = {
                      ...draft.evaluation.scores,
                      [criterion]: next === null ? null : Number(next),
                    };
                  })
                }
              />
            </div>
          ))}
          <div className="space-y-1">
            <Label htmlFor="game-mvp-days">
              {t("gamePipeline:fields.estimatedMvpDays.label")}
            </Label>
            <Input
              id="game-mvp-days"
              type="number"
              min={1}
              inputMode="numeric"
              placeholder={t("gamePipeline:notScored")}
              disabled={disabled}
              value={value.evaluation.estimatedMvpDays ?? ""}
              onChange={(event) =>
                set((draft) => {
                  const parsed = parseNumber(event.target.value);
                  draft.evaluation.estimatedMvpDays =
                    parsed === null ? null : Math.max(1, Math.round(parsed));
                })
              }
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {t("gamePipeline:evaluationHint", {
            threshold: config.evaluation.passThreshold,
          })}
        </p>
        <div className="space-y-1">
          <Label htmlFor="game-eval-comments">
            {t("gamePipeline:fields.comments.label")}
          </Label>
          <Textarea
            id="game-eval-comments"
            rows={2}
            placeholder={t("gamePipeline:fields.comments.hint")}
            disabled={disabled}
            value={value.evaluation.comments ?? ""}
            onChange={(event) =>
              set((draft) => {
                draft.evaluation.comments = event.target.value;
              })
            }
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="game-decision">
            {t("gamePipeline:fields.decision.label")}
          </Label>
          <OptionSelect
            id="game-decision"
            disabled={disabled || !canDecide}
            emptyLabel={t("gamePipeline:notDecided")}
            value={value.evaluation.decision ?? null}
            options={DECISIONS.map((decision) => ({
              value: decision,
              label: t(`gamePipeline:decisions.${decision}`),
            }))}
            onChange={(decision) =>
              set((draft) => {
                draft.evaluation.decision = decision;
              })
            }
          />
          {!canDecide ? (
            <p className="text-xs text-muted-foreground">
              {t("gamePipeline:decisionRestricted")}
            </p>
          ) : null}
        </div>
      </Section>

      <Section title={t("gamePipeline:sections.brief")}>
        <p className="text-xs text-muted-foreground">
          {t("gamePipeline:briefHint")}
        </p>
        <Textarea
          aria-label={t("gamePipeline:fields.mvpBrief.label")}
          rows={14}
          className="font-mono text-xs"
          disabled={disabled}
          value={value.details.mvpBrief ?? ""}
          onChange={(event) =>
            set((draft) => {
              draft.details.mvpBrief = event.target.value;
            })
          }
        />
      </Section>

      <Section title={t("gamePipeline:sections.links")}>
        {LINK_FIELDS.map((field) => (
          <TextField
            key={field}
            id={`game-${field}`}
            config={config}
            field={field}
            type="url"
            disabled={disabled}
            value={value.details[field]}
            onChange={(next) =>
              set((draft) => {
                draft.details[field] = next;
              })
            }
          />
        ))}
      </Section>

      {config.rules.kpiTracking ? (
        <Section title={t("gamePipeline:sections.kpi")}>
          <p className="text-xs text-muted-foreground">
            {t("gamePipeline:kpis.note")}
          </p>
          {config.kpis.map((kpi) => {
            const result = value.kpi.results?.[kpi.key] ?? {};
            const setResult = (patch: Partial<NonNullable<typeof result>>) =>
              set((draft) => {
                draft.kpi.results = {
                  ...draft.kpi.results,
                  [kpi.key]: { ...draft.kpi.results?.[kpi.key], ...patch },
                };
              });
            return (
              <div
                key={kpi.key}
                className="space-y-2 rounded-md border border-border/70 p-2.5"
              >
                <p className="text-sm font-medium">
                  {t(`gamePipeline:kpis.${kpi.key}`)}{" "}
                  <span className="text-xs font-normal text-muted-foreground">
                    {t(`gamePipeline:kpis.operators.${kpi.operator}`)}{" "}
                    {typeof result.target === "number"
                      ? result.target
                      : kpi.target}
                  </span>
                </p>
                <div className="grid gap-2 sm:grid-cols-3">
                  <Label className="space-y-1 text-xs text-muted-foreground">
                    <span>{t("gamePipeline:kpis.targetOverride")}</span>
                    <Input
                      type="number"
                      min={0}
                      step="any"
                      placeholder={String(kpi.target)}
                      disabled={disabled}
                      value={result.target ?? ""}
                      onChange={(event) =>
                        setResult({ target: parseNumber(event.target.value) })
                      }
                    />
                  </Label>
                  {kpi.operator === "ltvOverCac" ? (
                    <>
                      <Label className="space-y-1 text-xs text-muted-foreground">
                        <span>{t("gamePipeline:kpis.ltv")}</span>
                        <Input
                          type="number"
                          min={0}
                          step="any"
                          placeholder={t("gamePipeline:kpis.noData")}
                          disabled={disabled}
                          value={result.ltv ?? ""}
                          onChange={(event) =>
                            setResult({ ltv: parseNumber(event.target.value) })
                          }
                        />
                      </Label>
                      <Label className="space-y-1 text-xs text-muted-foreground">
                        <span>{t("gamePipeline:kpis.cac")}</span>
                        <Input
                          type="number"
                          min={0}
                          step="any"
                          placeholder={t("gamePipeline:kpis.noData")}
                          disabled={disabled}
                          value={result.cac ?? ""}
                          onChange={(event) =>
                            setResult({ cac: parseNumber(event.target.value) })
                          }
                        />
                      </Label>
                    </>
                  ) : (
                    <Label className="space-y-1 text-xs text-muted-foreground">
                      <span>{t("gamePipeline:kpis.actual")}</span>
                      <Input
                        type="number"
                        min={0}
                        step="any"
                        placeholder={t("gamePipeline:kpis.noData")}
                        disabled={disabled}
                        value={result.actual ?? ""}
                        onChange={(event) =>
                          setResult({ actual: parseNumber(event.target.value) })
                        }
                      />
                    </Label>
                  )}
                </div>
              </div>
            );
          })}
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField
              id="game-kpiDataSource"
              config={config}
              field="kpiDataSource"
              disabled={disabled}
              value={value.kpi.dataSource}
              onChange={(next) =>
                set((draft) => {
                  draft.kpi.dataSource = next;
                })
              }
            />
            <TextField
              id="game-kpiMeasurementWindow"
              config={config}
              field="kpiMeasurementWindow"
              disabled={disabled}
              value={value.kpi.measurementWindow}
              onChange={(next) =>
                set((draft) => {
                  draft.kpi.measurementWindow = next;
                })
              }
            />
            <div className="space-y-1">
              <Label htmlFor="game-sample-size">
                {t("gamePipeline:fields.kpiSampleSize.label")}
              </Label>
              <Input
                id="game-sample-size"
                type="number"
                min={0}
                inputMode="numeric"
                placeholder={t("gamePipeline:kpis.noData")}
                disabled={disabled}
                value={value.kpi.sampleSize ?? ""}
                onChange={(event) =>
                  set((draft) => {
                    const parsed = parseNumber(event.target.value);
                    draft.kpi.sampleSize =
                      parsed === null ? null : Math.round(parsed);
                  })
                }
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="game-producer-decision">
                {t("gamePipeline:fields.producerDecision.label")}
              </Label>
              <OptionSelect
                id="game-producer-decision"
                disabled={disabled || !canDecide}
                emptyLabel={t("gamePipeline:notDecided")}
                value={value.kpi.producerDecision ?? null}
                options={PRODUCER_DECISIONS.map((decision) => ({
                  value: decision,
                  label: t(`gamePipeline:producerDecisions.${decision}`),
                }))}
                onChange={(decision) =>
                  set((draft) => {
                    draft.kpi.producerDecision = decision;
                  })
                }
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="game-kpi-notes">
              {t("gamePipeline:fields.kpiNotes.label")}
            </Label>
            <Textarea
              id="game-kpi-notes"
              rows={2}
              placeholder={t("gamePipeline:fields.kpiNotes.hint")}
              disabled={disabled}
              value={value.kpi.notes ?? ""}
              onChange={(event) =>
                set((draft) => {
                  draft.kpi.notes = event.target.value;
                })
              }
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {t("gamePipeline:kpis.neverAutoApprove")}
          </p>
        </Section>
      ) : null}
    </div>
  );
}
