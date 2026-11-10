import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { PipelineConfig } from "@/fetchers/game-pipeline";
import {
  useGameTemplate,
  useProjectPipeline,
  useSaveTemplate,
  useUpdateProjectPipeline,
} from "@/hooks/queries/game-pipeline/use-game-pipeline";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { toast } from "@/lib/toast";
import PipelineConfigEditor, { RulesEditor } from "./pipeline-config-editor";
import { PipelineSettingsFields } from "./template-project-fields";

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

/** Project settings: edits this project's own copy of the template config. */
export function PipelineSettingsCard({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const { data: pipeline } = useProjectPipeline(projectId);
  const { canUpdateProjects } = useWorkspacePermission();
  const canEdit = canUpdateProjects();
  const { mutate, isPending } = useUpdateProjectPipeline(projectId);
  const [config, setConfig] = useState<PipelineConfig | null>(null);

  useEffect(() => {
    if (pipeline) setConfig(structuredClone(pipeline.config));
  }, [pipeline]);

  if (!pipeline || !config) return null;
  const dirty = JSON.stringify(config) !== JSON.stringify(pipeline.config);

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="flex flex-wrap items-center gap-2 text-md font-medium">
          {t("gamePipeline:settings.title")}
          <Badge variant="secondary" className="font-normal">
            {t("gamePipeline:form.templateVersion", {
              version: pipeline.templateVersion,
            })}
          </Badge>
        </h2>
        <p className="text-xs text-muted-foreground">
          {t("gamePipeline:settings.description")}
        </p>
      </div>
      <PipelineSettingsFields
        config={config}
        onChange={setConfig}
        disabled={!canEdit}
      />
      <PipelineConfigEditor
        config={config}
        onChange={setConfig}
        disabled={!canEdit}
      />
      {canEdit ? (
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!dirty || isPending}
            onClick={() => setConfig(structuredClone(pipeline.config))}
          >
            {t("common:actions.reset")}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!dirty || isPending}
            onClick={() =>
              mutate(config, {
                onSuccess: () =>
                  toast.success(t("gamePipeline:settings.saved")),
                onError: (error) =>
                  toast.error(
                    errorMessage(error, t("gamePipeline:panel.saveError")),
                  ),
              })
            }
          >
            {t("gamePipeline:settings.save")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/** Instance admin: edits the default template and saves it as a new version. */
export function TemplateAdminCard() {
  const { t } = useTranslation();
  const { data: template } = useGameTemplate();
  const { mutate, isPending } = useSaveTemplate();
  const [config, setConfig] = useState<PipelineConfig | null>(null);

  useEffect(() => {
    if (template) setConfig(structuredClone(template.config));
  }, [template]);

  if (!template || !config) return null;
  const dirty = JSON.stringify(config) !== JSON.stringify(template.config);

  return (
    <section className="mx-auto mt-6 max-w-5xl space-y-4 rounded-xl border border-border p-4">
      <div className="space-y-1">
        <h2 className="flex flex-wrap items-center gap-2 text-md font-semibold">
          {t("gamePipeline:admin.title")}
          <Badge variant="secondary" className="font-normal">
            {template.name}
          </Badge>
          <Badge variant="outline" className="font-normal">
            {t("gamePipeline:form.templateVersion", {
              version: template.version,
            })}
          </Badge>
        </h2>
        <p className="text-xs text-muted-foreground">
          {t("gamePipeline:admin.description")}
        </p>
      </div>
      <div className="rounded-lg border border-border p-3">
        <RulesEditor config={config} onChange={setConfig} />
      </div>
      <PipelineConfigEditor config={config} onChange={setConfig} />
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!dirty || isPending}
          onClick={() => setConfig(structuredClone(template.config))}
        >
          {t("common:actions.reset")}
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={!dirty || isPending}
          onClick={() =>
            mutate(config, {
              onSuccess: (saved) =>
                toast.success(
                  t("gamePipeline:admin.saved", { version: saved.version }),
                ),
              onError: (error) =>
                toast.error(
                  errorMessage(error, t("gamePipeline:panel.saveError")),
                ),
            })
          }
        >
          {t("gamePipeline:admin.save")}
        </Button>
      </div>
    </section>
  );
}
