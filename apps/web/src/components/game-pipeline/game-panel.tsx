import { CheckCircle2, CircleDashed, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import type { Game, PipelineConfig } from "@/fetchers/game-pipeline";
import {
  useGame,
  useProjectPipeline,
  useSetApproval,
  useSetChecklistItem,
  useUpdateGame,
} from "@/hooks/queries/game-pipeline/use-game-pipeline";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { toast } from "@/lib/toast";
import { stageLabel } from "./fields";
import {
  GameDetailSections,
  type GameDetailsValue,
  GameProductFields,
  GameRoleFields,
  Section,
} from "./game-form";
import { formatGateFailure } from "./gate-failures";

function toValue(game: Game): GameDetailsValue {
  return {
    producerId: game.producerId,
    qaId: game.qaId,
    details: { ...game.details },
    evaluation: { ...game.evaluation },
    kpi: { ...game.kpi },
  };
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function ChecklistBlock({
  config,
  game,
  stageKey,
  canEdit,
  projectId,
}: {
  config: PipelineConfig;
  game: Game;
  stageKey: string;
  canEdit: boolean;
  projectId: string;
}) {
  const { t } = useTranslation();
  const stage = config.stages.find((s) => s.key === stageKey);
  const { mutate, isPending } = useSetChecklistItem(game.taskId, projectId);
  if (!stage) return null;
  const checked = game.checklist[stage.key] ?? {};
  const done = stage.checklist.filter((item) => checked[item.key]).length;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="font-medium">{stageLabel(stage)}</span>
        <span className="text-xs text-muted-foreground">
          {t("gamePipeline:panel.progress", {
            checked: done,
            total: stage.checklist.length,
          })}
        </span>
      </div>
      <Progress value={(done / Math.max(1, stage.checklist.length)) * 100} />
      <ul className="space-y-1">
        {stage.checklist.map((item) => {
          const id = `check-${stage.key}-${item.key}`;
          return (
            <li key={item.key}>
              <label htmlFor={id} className="flex items-center gap-2 text-sm">
                <Checkbox
                  id={id}
                  checked={Boolean(checked[item.key])}
                  disabled={!canEdit || isPending}
                  onCheckedChange={(next) =>
                    mutate(
                      {
                        stage: stage.key,
                        item: item.key,
                        checked: Boolean(next),
                      },
                      {
                        onError: (error) =>
                          toast.error(
                            errorMessage(
                              error,
                              t("gamePipeline:panel.saveError"),
                            ),
                          ),
                      },
                    )
                  }
                />
                {item.label}
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function GamePanel({
  taskId,
  projectId,
}: {
  taskId: string;
  projectId: string;
}) {
  const { t } = useTranslation();
  const { data: pipeline } = useProjectPipeline(projectId);
  const { data: game, isLoading } = useGame(taskId, Boolean(pipeline));
  const { canUpdateTasks } = useWorkspacePermission();
  const canEdit = canUpdateTasks();
  const updateGame = useUpdateGame(taskId, projectId);
  const setApproval = useSetApproval(taskId, projectId);

  const [value, setValue] = useState<GameDetailsValue | null>(null);
  const serverValue = useMemo(() => (game ? toValue(game) : null), [game]);
  const previousServerValue = useRef<GameDetailsValue | null>(null);
  // Fresh server data (a checklist tick, another member's edit over the
  // socket) replaces the form only while it has no unsaved edits.
  useEffect(() => {
    setValue((current) =>
      current === null ||
      JSON.stringify(current) === JSON.stringify(previousServerValue.current)
        ? serverValue
        : current,
    );
    previousServerValue.current = serverValue;
  }, [serverValue]);

  if (!pipeline || isLoading || !game || !value || !serverValue) return null;
  const { config } = pipeline;
  const stage = config.stages.find((s) => s.key === game.stage);
  const dirty = JSON.stringify(value) !== JSON.stringify(serverValue);

  const next = config.stages.filter(
    (candidate) =>
      candidate.key !== game.stage &&
      (candidate.key === "stopped" ||
        (game.stage
          ? (candidate.entry.from as string[]).includes(game.stage)
          : candidate.key === config.stages[0]?.key)),
  );

  const save = () => {
    const patch: Parameters<typeof updateGame.mutate>[0] = {};
    if (value.producerId !== serverValue.producerId)
      patch.producerId = value.producerId;
    if (value.qaId !== serverValue.qaId) patch.qaId = value.qaId;
    if (JSON.stringify(value.details) !== JSON.stringify(serverValue.details))
      patch.details = value.details;
    if (
      JSON.stringify(value.evaluation) !==
      JSON.stringify(serverValue.evaluation)
    )
      patch.evaluation = value.evaluation;
    if (JSON.stringify(value.kpi) !== JSON.stringify(serverValue.kpi))
      patch.kpi = value.kpi;
    updateGame.mutate(patch, {
      onSuccess: (saved) => {
        setValue(toValue(saved));
        toast.success(t("gamePipeline:panel.saved"));
      },
      onError: (error) =>
        toast.error(errorMessage(error, t("gamePipeline:panel.saveError"))),
    });
  };

  const approvalGates = (["development", "scale"] as const).filter((gate) =>
    gate === "development"
      ? config.rules.requireDevelopmentApproval
      : config.rules.requireScaleApproval,
  );

  return (
    <section
      aria-label={t("gamePipeline:panel.title")}
      className="space-y-3 rounded-lg border border-border bg-sidebar/30 p-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold">
          {t("gamePipeline:panel.title")}
        </h2>
        {game.code ? <Badge variant="outline">{game.code}</Badge> : null}
        {stage ? <Badge variant="secondary">{stageLabel(stage)}</Badge> : null}
        {game.isSample ? (
          <Badge variant="warning">{t("gamePipeline:panel.sample")}</Badge>
        ) : null}
      </div>
      {stage ? (
        <p className="text-xs text-muted-foreground">{stage.description}</p>
      ) : null}

      {config.rules.stageChecklists && stage ? (
        <ChecklistBlock
          config={config}
          game={game}
          stageKey={stage.key}
          canEdit={canEdit}
          projectId={projectId}
        />
      ) : null}

      <div className="space-y-1.5">
        <p className="text-sm font-medium">
          {t("gamePipeline:panel.nextTitle")}
        </p>
        {next.map((candidate) => {
          const transition = game.transitions.find(
            (item) => item.stage === candidate.key,
          );
          const allowed = transition?.allowed ?? false;
          return (
            <div key={candidate.key} className="text-sm">
              <div className="flex items-center gap-1.5">
                {allowed ? (
                  <CheckCircle2 className="size-4 text-emerald-600" />
                ) : (
                  <CircleDashed className="size-4 text-muted-foreground" />
                )}
                <span className="font-medium">{stageLabel(candidate)}</span>
                <span className="text-xs text-muted-foreground">
                  {allowed
                    ? t("gamePipeline:panel.ready")
                    : t("gamePipeline:panel.blocked")}
                </span>
              </div>
              {!allowed && transition ? (
                <ul className="ms-6 list-disc text-xs text-muted-foreground">
                  {transition.failures.map((failure) => (
                    <li
                      key={`${failure.code}-${failure.field ?? failure.stage ?? failure.gate ?? ""}`}
                    >
                      {formatGateFailure(t, config, failure)}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          );
        })}
      </div>

      {approvalGates.length > 0 ? (
        <div className="space-y-1.5">
          <p className="text-sm font-medium">
            {t("gamePipeline:panel.approvalsTitle")}
          </p>
          {approvalGates.map((gate) => {
            const approval = game.approvals[gate];
            return (
              <div
                key={gate}
                className="flex flex-wrap items-center justify-between gap-2 text-sm"
              >
                <span className="flex items-center gap-1.5">
                  <ShieldCheck
                    className={
                      approval
                        ? "size-4 text-emerald-600"
                        : "size-4 text-muted-foreground"
                    }
                  />
                  {t(`gamePipeline:panel.approvals.${gate}`)}
                  <span className="text-xs text-muted-foreground">
                    {approval
                      ? t("gamePipeline:panel.approved")
                      : t("gamePipeline:panel.notApproved")}
                  </span>
                </span>
                {game.canDecide ? (
                  <Button
                    type="button"
                    size="sm"
                    variant={approval ? "outline" : "default"}
                    disabled={setApproval.isPending}
                    onClick={() =>
                      setApproval.mutate(
                        { gate, approved: !approval },
                        {
                          onError: (error) =>
                            toast.error(
                              errorMessage(
                                error,
                                t("gamePipeline:panel.saveError"),
                              ),
                            ),
                        },
                      )
                    }
                  >
                    {approval
                      ? t("gamePipeline:panel.revoke")
                      : t("gamePipeline:panel.approve")}
                  </Button>
                ) : null}
              </div>
            );
          })}
          {!game.canDecide ? (
            <p className="text-xs text-muted-foreground">
              {t("gamePipeline:decisionRestricted")}
            </p>
          ) : null}
        </div>
      ) : null}

      <Section title={t("gamePipeline:sections.general")}>
        <div className="grid gap-3 sm:grid-cols-2">
          <GameRoleFields
            value={value}
            onChange={setValue}
            canChangeProducer={game.canDecide}
            disabled={!canEdit}
          />
          <GameProductFields
            config={config}
            value={value}
            onChange={setValue}
            disabled={!canEdit}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {t("gamePipeline:panel.taskFieldsHint")}
        </p>
      </Section>
      <GameDetailSections
        config={config}
        value={value}
        onChange={setValue}
        canDecide={game.canDecide}
        disabled={!canEdit}
      />
      {config.rules.stageChecklists ? (
        <Section title={t("gamePipeline:panel.allChecklists")}>
          {config.stages
            .filter((s) => s.key !== stage?.key)
            .map((s) => (
              <ChecklistBlock
                key={s.key}
                config={config}
                game={game}
                stageKey={s.key}
                canEdit={canEdit}
                projectId={projectId}
              />
            ))}
        </Section>
      ) : null}

      {canEdit ? (
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!dirty || updateGame.isPending}
            onClick={() => setValue(serverValue)}
          >
            {t("common:actions.reset")}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!dirty || updateGame.isPending}
            onClick={save}
          >
            {t("gamePipeline:panel.save")}
          </Button>
        </div>
      ) : null}
    </section>
  );
}

export default GamePanel;
