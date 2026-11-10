import { produce } from "immer";
import { ChevronRight, Plus, X } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { PipelineConfig } from "@/fetchers/game-pipeline";
import {
  LINK_FIELDS,
  newKey,
  requiredFromStage,
  stageLabel,
  TREND_FIELDS,
} from "./fields";
import OptionSelect from "./option-select";

const LABEL_COLORS = [
  "gray",
  "dark-gray",
  "purple",
  "teal",
  "green",
  "yellow",
  "orange",
  "pink",
  "red",
] as const;

const RULE_KEYS = [
  "requireDevelopmentApproval",
  "requireScaleApproval",
  "stageChecklists",
  "kpiTracking",
  "changeHistory",
] as const;

type EditorProps = {
  config: PipelineConfig;
  onChange: (config: PipelineConfig) => void;
  disabled?: boolean;
};

function Group({
  title,
  count,
  children,
  defaultOpen = false,
}: {
  title: string;
  count?: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <Collapsible
      defaultOpen={defaultOpen}
      className="rounded-lg border border-border bg-background"
    >
      <CollapsibleTrigger className="group flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium">
        <ChevronRight className="size-4 shrink-0 transition-transform group-data-panel-open:rotate-90" />
        <span className="flex-1">{title}</span>
        {count ? (
          <Badge variant="secondary" className="font-normal">
            {count}
          </Badge>
        ) : null}
      </CollapsibleTrigger>
      <CollapsiblePanel>
        <div className="space-y-3 border-t border-border px-3 py-3">
          {children}
        </div>
      </CollapsiblePanel>
    </Collapsible>
  );
}

function RulesEditor({ config, onChange, disabled }: EditorProps) {
  const { t } = useTranslation();
  const update = (recipe: (draft: PipelineConfig) => void) =>
    onChange(produce(config, recipe));
  return (
    <div className="space-y-3">
      {RULE_KEYS.map((key) => (
        <label
          key={key}
          htmlFor={`rule-${key}`}
          className="flex items-center justify-between gap-3 text-sm"
        >
          <span>{t(`gamePipeline:rules.${key}`)}</span>
          <Switch
            id={`rule-${key}`}
            checked={config.rules[key]}
            disabled={disabled}
            onCheckedChange={(checked) =>
              update((draft) => {
                draft.rules[key] = checked;
              })
            }
          />
        </label>
      ))}
      <div className="flex items-center justify-between gap-3 text-sm">
        <Label htmlFor="rule-wip">{t("gamePipeline:form.wipLimit")}</Label>
        <Input
          id="rule-wip"
          type="number"
          min={1}
          max={50}
          className="w-20"
          disabled={disabled}
          value={config.wipLimitPerDeveloper}
          onChange={(event) =>
            update((draft) => {
              draft.wipLimitPerDeveloper = Math.max(
                1,
                Math.min(50, Number(event.target.value) || 1),
              );
            })
          }
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {t("gamePipeline:preview.wipHint", {
          limit: config.wipLimitPerDeveloper,
        })}
      </p>
    </div>
  );
}

export { RulesEditor };

function PipelineConfigEditor({ config, onChange, disabled }: EditorProps) {
  const { t } = useTranslation();
  const update = (recipe: (draft: PipelineConfig) => void) =>
    onChange(produce(config, recipe));
  const checklistTotal = config.stages.reduce(
    (sum, stage) => sum + stage.checklist.length,
    0,
  );
  const labelTotal = config.labelGroups.reduce(
    (sum, group) => sum + group.labels.length,
    0,
  );

  const requiredHint = (field: string) => {
    const stage = requiredFromStage(config, field);
    return stage
      ? t("gamePipeline:preview.requiredAt", { stage: stageLabel(stage) })
      : t("gamePipeline:preview.optional");
  };

  return (
    <div className="space-y-2">
      <Group
        title={t("gamePipeline:preview.columns")}
        count={String(config.stages.length)}
      >
        {config.stages.map((stage, index) => (
          <div
            key={stage.key}
            className="space-y-2 rounded-md border border-border/70 p-2.5"
          >
            <div className="flex items-center gap-2">
              <span className="w-5 text-xs text-muted-foreground">
                {index + 1}
              </span>
              <Input
                aria-label={t("gamePipeline:preview.columnEmoji")}
                className="w-14 text-center"
                maxLength={16}
                disabled={disabled}
                value={stage.emoji}
                onChange={(event) =>
                  update((draft) => {
                    draft.stages[index].emoji = event.target.value;
                  })
                }
              />
              <Input
                aria-label={t("gamePipeline:preview.columnName")}
                className="flex-1"
                maxLength={120}
                disabled={disabled}
                value={stage.name}
                onChange={(event) =>
                  update((draft) => {
                    draft.stages[index].name = event.target.value;
                  })
                }
              />
              {stage.isFinal ? (
                <Badge variant="outline" className="shrink-0">
                  {t("gamePipeline:preview.finalStage")}
                </Badge>
              ) : null}
            </div>
            <Label className="text-xs text-muted-foreground">
              {t("gamePipeline:preview.columnDescription")}
            </Label>
            <Textarea
              rows={2}
              disabled={disabled}
              value={stage.description}
              onChange={(event) =>
                update((draft) => {
                  draft.stages[index].description = event.target.value;
                })
              }
            />
            <Label className="text-xs text-muted-foreground">
              {t("gamePipeline:preview.columnConditions")}
            </Label>
            <Textarea
              rows={2}
              disabled={disabled}
              value={stage.conditions}
              onChange={(event) =>
                update((draft) => {
                  draft.stages[index].conditions = event.target.value;
                })
              }
            />
          </div>
        ))}
      </Group>

      <Group title={t("gamePipeline:preview.gameForm")}>
        <p className="text-xs text-muted-foreground">
          {t("gamePipeline:preview.gameFormHint")}
        </p>
        {(
          [
            ["general", ["targetMarket", "platform"]],
            ["trend", TREND_FIELDS.map((field) => field.key)],
            ["brief", ["mvpBrief"]],
            ["links", LINK_FIELDS],
          ] as const
        ).map(([section, fields]) => (
          <div key={section} className="space-y-1">
            <p className="text-sm font-medium">
              {t(`gamePipeline:sections.${section}`)}
            </p>
            <ul className="space-y-0.5 text-sm">
              {fields.map((field) => (
                <li
                  key={field}
                  className="flex flex-wrap justify-between gap-x-3"
                >
                  <span>{t(`gamePipeline:fields.${field}.label`)}</span>
                  <span className="text-xs text-muted-foreground">
                    {requiredHint(field)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
        <div className="space-y-1">
          <Label htmlFor="mvp-template" className="text-sm font-medium">
            {t("gamePipeline:preview.briefTemplate")}
          </Label>
          <p className="text-xs text-muted-foreground">
            {t("gamePipeline:preview.briefTemplateHint")}
          </p>
          <Textarea
            id="mvp-template"
            rows={8}
            className="font-mono text-xs"
            disabled={disabled}
            value={config.mvpBrief.template}
            onChange={(event) =>
              update((draft) => {
                draft.mvpBrief.template = event.target.value;
              })
            }
          />
        </div>
      </Group>

      <Group
        title={t("gamePipeline:preview.checklists")}
        count={String(checklistTotal)}
      >
        <p className="text-xs text-muted-foreground">
          {t("gamePipeline:preview.checklistHint")}
        </p>
        {config.stages.map((stage, stageIndex) => (
          <div key={stage.key} className="space-y-1.5">
            <p className="text-sm font-medium">{stageLabel(stage)}</p>
            {stage.checklist.map((item, itemIndex) => (
              <div key={item.key} className="flex items-center gap-2">
                <Input
                  aria-label={t("gamePipeline:preview.itemLabel")}
                  maxLength={120}
                  disabled={disabled}
                  value={item.label}
                  onChange={(event) =>
                    update((draft) => {
                      draft.stages[stageIndex].checklist[itemIndex].label =
                        event.target.value;
                    })
                  }
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={disabled || stage.checklist.length <= 1}
                  aria-label={t("gamePipeline:preview.removeItem")}
                  onClick={() =>
                    update((draft) => {
                      draft.stages[stageIndex].checklist.splice(itemIndex, 1);
                    })
                  }
                >
                  <X className="size-4" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled || stage.checklist.length >= 30}
              onClick={() =>
                update((draft) => {
                  draft.stages[stageIndex].checklist.push({
                    key: newKey(stage.key),
                    label: t("gamePipeline:preview.newItem"),
                  });
                })
              }
            >
              <Plus className="size-4" />
              {t("gamePipeline:preview.addItem")}
            </Button>
          </div>
        ))}
      </Group>

      <Group title={t("gamePipeline:preview.evaluation")}>
        <p className="text-xs text-muted-foreground">
          {t("gamePipeline:preview.evaluationHint")}
        </p>
        {config.evaluation.criteria.map((criterion, index) => (
          <div
            key={criterion.key}
            className="flex flex-wrap items-center justify-between gap-2 text-sm"
          >
            <span className="min-w-0 flex-1">
              {t(`gamePipeline:criteria.${criterion.key}`)}
              {criterion.inverse ? (
                <span className="ms-1 text-xs text-muted-foreground">
                  ({t("gamePipeline:preview.inverse")})
                </span>
              ) : null}
            </span>
            <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {t("gamePipeline:preview.weight")}
              <Input
                type="number"
                min={0}
                max={100}
                className="w-20"
                disabled={disabled}
                value={criterion.weight}
                onChange={(event) =>
                  update((draft) => {
                    draft.evaluation.criteria[index].weight = Math.max(
                      0,
                      Math.min(100, Number(event.target.value) || 0),
                    );
                  })
                }
              />
            </Label>
          </div>
        ))}
        <div className="flex flex-wrap gap-4 text-sm">
          <Label className="flex items-center gap-1.5">
            {t("gamePipeline:preview.scaleMax")}
            <Input
              type="number"
              min={2}
              max={10}
              className="w-20"
              disabled={disabled}
              value={config.evaluation.scaleMax}
              onChange={(event) =>
                update((draft) => {
                  draft.evaluation.scaleMax = Math.max(
                    2,
                    Math.min(10, Number(event.target.value) || 5),
                  );
                })
              }
            />
          </Label>
          <Label className="flex items-center gap-1.5">
            {t("gamePipeline:preview.passThreshold")}
            <Input
              type="number"
              min={0}
              max={100}
              className="w-20"
              disabled={disabled}
              value={config.evaluation.passThreshold}
              onChange={(event) =>
                update((draft) => {
                  draft.evaluation.passThreshold = Math.max(
                    0,
                    Math.min(100, Number(event.target.value) || 0),
                  );
                })
              }
            />
          </Label>
        </div>
      </Group>

      <Group
        title={t("gamePipeline:preview.kpis")}
        count={String(config.kpis.length)}
      >
        <p className="text-xs text-muted-foreground">
          {t("gamePipeline:kpis.note")}
        </p>
        {config.kpis.map((kpi, index) => (
          <div
            key={kpi.key}
            className="flex flex-wrap items-center justify-between gap-2 text-sm"
          >
            <span className="min-w-0 flex-1">
              {t(`gamePipeline:kpis.${kpi.key}`)}
            </span>
            <span className="text-xs text-muted-foreground">
              {t(`gamePipeline:kpis.operators.${kpi.operator}`)}
            </span>
            <Input
              type="number"
              min={0}
              step="any"
              aria-label={t("gamePipeline:kpis.target")}
              className="w-24"
              disabled={disabled}
              value={kpi.target}
              onChange={(event) =>
                update((draft) => {
                  draft.kpis[index].target = Math.max(
                    0,
                    Number(event.target.value) || 0,
                  );
                })
              }
            />
          </div>
        ))}
        <p className="text-xs text-muted-foreground">
          {t("gamePipeline:kpis.neverAutoApprove")}
        </p>
      </Group>

      <Group title={t("gamePipeline:preview.rules")}>
        <RulesEditor config={config} onChange={onChange} disabled={disabled} />
        <ol className="space-y-1.5 border-t border-border pt-3 text-sm">
          {config.stages.map((stage) => (
            <li key={stage.key}>
              <span className="font-medium">{stageLabel(stage)}: </span>
              <span className="text-muted-foreground">{stage.conditions}</span>
            </li>
          ))}
        </ol>
      </Group>

      <Group
        title={t("gamePipeline:preview.labels")}
        count={String(labelTotal)}
      >
        <p className="text-xs text-muted-foreground">
          {t("gamePipeline:preview.labelsHint")}
        </p>
        {config.labelGroups.map((group, groupIndex) => (
          <div key={group.key} className="space-y-1.5">
            <Input
              aria-label={t("gamePipeline:preview.groupName")}
              className="font-medium"
              maxLength={120}
              disabled={disabled}
              value={group.name}
              onChange={(event) =>
                update((draft) => {
                  draft.labelGroups[groupIndex].name = event.target.value;
                })
              }
            />
            {group.labels.map((label, labelIndex) => (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: draft labels have no id yet and are edited in place
                key={`${group.key}-${labelIndex}`}
                className="flex items-center gap-2 ps-3"
              >
                <Input
                  aria-label={t("gamePipeline:preview.labelName")}
                  maxLength={120}
                  disabled={disabled}
                  value={label.name}
                  onChange={(event) =>
                    update((draft) => {
                      draft.labelGroups[groupIndex].labels[labelIndex].name =
                        event.target.value;
                    })
                  }
                />
                <div className="w-32 shrink-0">
                  <OptionSelect
                    value={label.color}
                    disabled={disabled}
                    options={LABEL_COLORS.map((color) => ({
                      value: color,
                      label: t(`gamePipeline:colors.${color}`),
                    }))}
                    onChange={(color) =>
                      update((draft) => {
                        if (color)
                          draft.labelGroups[groupIndex].labels[
                            labelIndex
                          ].color = color;
                      })
                    }
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={disabled}
                  aria-label={t("gamePipeline:preview.removeItem")}
                  onClick={() =>
                    update((draft) => {
                      draft.labelGroups[groupIndex].labels.splice(
                        labelIndex,
                        1,
                      );
                    })
                  }
                >
                  <X className="size-4" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="ms-3"
              disabled={disabled || group.labels.length >= 30}
              onClick={() =>
                update((draft) => {
                  draft.labelGroups[groupIndex].labels.push({
                    name: t("gamePipeline:preview.newLabel"),
                    color: "gray",
                  });
                })
              }
            >
              <Plus className="size-4" />
              {t("gamePipeline:preview.addLabel")}
            </Button>
          </div>
        ))}
      </Group>
    </div>
  );
}

export default PipelineConfigEditor;
