import { produce } from "immer";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { PipelineConfig } from "@/fetchers/game-pipeline";
import MemberSelect from "./member-select";
import OptionSelect from "./option-select";
import PipelineConfigEditor, { RulesEditor } from "./pipeline-config-editor";
import type { ProjectDraft } from "./template-draft";

const TIMEZONES = [
  "Asia/Ho_Chi_Minh",
  "Asia/Bangkok",
  "Asia/Singapore",
  "Asia/Tokyo",
  "UTC",
];

type Props = {
  draft: ProjectDraft;
  onChange: (draft: ProjectDraft) => void;
  showErrors: boolean;
  errors: string[];
};

export function PipelineSettingsFields({
  config,
  onChange,
  showErrors = false,
  errors = [],
  disabled,
}: {
  config: PipelineConfig;
  onChange: (config: PipelineConfig) => void;
  showErrors?: boolean;
  errors?: string[];
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const update = (recipe: (draft: PipelineConfig) => void) =>
    onChange(produce(config, recipe));
  const timezones = TIMEZONES.includes(config.timezone)
    ? TIMEZONES
    : [config.timezone, ...TIMEZONES];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="pipeline-view">{t("gamePipeline:form.view")}</Label>
          <OptionSelect
            id="pipeline-view"
            value={config.view}
            disabled={disabled}
            options={[
              { value: "kanban", label: t("gamePipeline:form.viewKanban") },
              { value: "list", label: t("gamePipeline:form.viewList") },
            ]}
            onChange={(view) =>
              update((draft) => {
                if (view) draft.view = view;
              })
            }
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pipeline-prefix">
            {t("gamePipeline:form.prefix")}
          </Label>
          <Input
            id="pipeline-prefix"
            maxLength={10}
            disabled={disabled}
            aria-invalid={
              (showErrors && errors.includes("prefix")) || undefined
            }
            value={config.gameCodePrefix}
            onChange={(event) =>
              update((draft) => {
                draft.gameCodePrefix = event.target.value
                  .toUpperCase()
                  .replace(/[^A-Z0-9]/g, "");
              })
            }
          />
          <p className="text-xs text-muted-foreground">
            {t("gamePipeline:form.prefixHint", {
              example: `${config.gameCodePrefix || "H5"}-001`,
            })}
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pipeline-timezone">
            {t("gamePipeline:form.timezone")}
          </Label>
          <OptionSelect
            id="pipeline-timezone"
            value={config.timezone}
            disabled={disabled}
            options={timezones.map((zone) => ({ value: zone, label: zone }))}
            onChange={(zone) =>
              update((draft) => {
                if (zone) draft.timezone = zone;
              })
            }
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pipeline-start">
            {t("gamePipeline:form.startDate")}
          </Label>
          <Input
            id="pipeline-start"
            type="date"
            disabled={disabled}
            value={config.startDate}
            onChange={(event) =>
              update((draft) => {
                if (event.target.value) draft.startDate = event.target.value;
              })
            }
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pipeline-deadline">
            {t("gamePipeline:form.deadline")}
          </Label>
          <Input
            id="pipeline-deadline"
            type="date"
            disabled={disabled}
            min={config.startDate}
            aria-invalid={
              (showErrors && errors.includes("deadline")) || undefined
            }
            value={config.deadline ?? ""}
            onChange={(event) =>
              update((draft) => {
                draft.deadline = event.target.value || null;
              })
            }
          />
          <p className="text-xs text-muted-foreground">
            {t("gamePipeline:form.deadlineHint")}
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="pipeline-producer">
            {t("gamePipeline:form.producer")} *
          </Label>
          <MemberSelect
            id="pipeline-producer"
            allowEmpty={false}
            disabled={disabled}
            invalid={showErrors && errors.includes("producer")}
            value={config.defaults.producerId}
            onChange={(id) =>
              update((draft) => {
                draft.defaults.producerId = id;
              })
            }
          />
          {showErrors && errors.includes("producer") ? (
            <p className="text-xs text-destructive">
              {t("gamePipeline:form.producerRequired")}
            </p>
          ) : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pipeline-developer">
            {t("gamePipeline:form.developer")}
          </Label>
          <MemberSelect
            id="pipeline-developer"
            disabled={disabled}
            value={config.defaults.developerId}
            onChange={(id) =>
              update((draft) => {
                draft.defaults.developerId = id;
              })
            }
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pipeline-qa">{t("gamePipeline:form.qa")}</Label>
          <MemberSelect
            id="pipeline-qa"
            disabled={disabled}
            value={config.defaults.qaId}
            onChange={(id) =>
              update((draft) => {
                draft.defaults.qaId = id;
              })
            }
          />
        </div>
      </div>

      <div className="rounded-lg border border-border p-3">
        <p className="mb-3 text-sm font-medium">
          {t("gamePipeline:form.rulesTitle")}
        </p>
        <RulesEditor config={config} onChange={onChange} disabled={disabled} />
      </div>
    </div>
  );
}

function TemplateProjectFields({ draft, onChange, showErrors, errors }: Props) {
  const { t } = useTranslation();
  const template = draft.template;
  if (!template) return null;
  const setConfig = (config: PipelineConfig) =>
    onChange({ ...draft, template: { ...template, config } });

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="project-description">
          {t("gamePipeline:form.description")}
        </Label>
        <Textarea
          id="project-description"
          rows={2}
          maxLength={5000}
          value={draft.description}
          onChange={(event) =>
            onChange({ ...draft, description: event.target.value })
          }
        />
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">
          {t("gamePipeline:form.template")}
        </span>
        <Badge variant="secondary">{template.name}</Badge>
        <span className="text-xs text-muted-foreground">
          {t("gamePipeline:form.templateVersion", {
            version: template.version,
          })}
        </span>
      </div>

      <PipelineSettingsFields
        config={template.config}
        onChange={setConfig}
        showErrors={showErrors}
        errors={errors}
      />

      <label
        htmlFor="pipeline-sample"
        className="flex items-start justify-between gap-3 rounded-lg border border-border p-3 text-sm"
      >
        <span>
          <span className="block font-medium">
            {t("gamePipeline:form.includeSample")}
          </span>
          <span className="block text-xs text-muted-foreground">
            {t("gamePipeline:form.includeSampleHint")}
          </span>
        </span>
        <Switch
          id="pipeline-sample"
          checked={template.includeSampleGame}
          onCheckedChange={(checked) =>
            onChange({
              ...draft,
              template: { ...template, includeSampleGame: checked },
            })
          }
        />
      </label>

      <div className="space-y-2">
        <p className="text-sm font-semibold">
          {t("gamePipeline:preview.title")}
        </p>
        <p className="text-xs text-muted-foreground">
          {t("gamePipeline:preview.subtitle")}
        </p>
        <PipelineConfigEditor config={template.config} onChange={setConfig} />
        {showErrors &&
        ["stages", "checklists", "labels"].some((key) =>
          errors.includes(key),
        ) ? (
          <p className="text-xs text-destructive">
            {t("gamePipeline:form.previewInvalid")}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export default TemplateProjectFields;
