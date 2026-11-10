import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ProjectPipeline } from "@/fetchers/game-pipeline";
import { useCreateGame } from "@/hooks/queries/game-pipeline/use-game-pipeline";
import useGetLabelsByWorkspace from "@/hooks/queries/label/use-get-labels-by-workspace";
import useActiveWorkspace from "@/hooks/queries/workspace/use-active-workspace";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/cn";
import { toast } from "@/lib/toast";
import { newCreationKey, PRIORITIES, stageLabel, todayIn } from "./fields";
import {
  GameDetailSections,
  type GameDetailsValue,
  GameProductFields,
  GameRoleFields,
  Section,
} from "./game-form";
import { apiErrorMessage } from "./gate-failures";
import MemberSelect from "./member-select";
import OptionSelect from "./option-select";

type Props = {
  open: boolean;
  onClose: () => void;
  pipeline: ProjectPipeline;
};

type Priority = (typeof PRIORITIES)[number];

function initialDetails(pipeline: ProjectPipeline): GameDetailsValue {
  const { config } = pipeline;
  return {
    producerId: config.defaults.producerId,
    qaId: config.defaults.qaId,
    details: {
      targetMarket: config.defaults.targetMarket,
      platform: config.defaults.platform,
      devices: [...config.defaults.devices],
      mvpBrief: config.mvpBrief.template,
    },
    evaluation: {},
    kpi: {},
  };
}

function CreateGameModal({ open, onClose, pipeline }: Props) {
  const { t } = useTranslation();
  const { config } = pipeline;
  const firstStage = config.stages[0];
  const { data: workspace } = useActiveWorkspace();
  const { data: session } = authClient.useSession();
  const { canUpdateProjects } = useWorkspacePermission();
  const { data: workspaceLabels = [] } = useGetLabelsByWorkspace(
    workspace?.id ?? "",
  );
  const { mutateAsync: createGame, isPending } = useCreateGame(
    pipeline.projectId,
  );

  const [creationKey] = useState(newCreationKey);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Priority>(config.defaults.priority);
  const [developerId, setDeveloperId] = useState(config.defaults.developerId);
  const [startDate, setStartDate] = useState(todayIn(config.timezone));
  const [dueDate, setDueDate] = useState("");
  const [labelIds, setLabelIds] = useState<string[]>([]);
  const [value, setValue] = useState<GameDetailsValue>(() =>
    initialDetails(pipeline),
  );
  const [showErrors, setShowErrors] = useState(false);

  const definitions = useMemo(
    () => workspaceLabels.filter((label) => label.taskId === null),
    [workspaceLabels],
  );
  const groups = config.labelGroups.map((group) => ({
    ...group,
    labels: group.labels
      .map((label) => definitions.find((d) => d.name === label.name))
      .filter((label): label is (typeof definitions)[number] => Boolean(label)),
  }));

  const currentUserId = session?.user?.id ?? null;
  const canDecide =
    canUpdateProjects() ||
    (!!value.producerId && value.producerId === currentUserId);
  const dateError = Boolean(dueDate && startDate && dueDate < startDate);

  const toggleLabel = (id: string) =>
    setLabelIds((current) =>
      current.includes(id) ? current.filter((l) => l !== id) : [...current, id],
    );

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isPending) return;
    if (!title.trim() || dateError) {
      setShowErrors(true);
      return;
    }
    try {
      // Same key on every retry of this form: a double click or a retry after
      // a network error returns the first game instead of a duplicate.
      const created = await createGame({
        creationKey,
        title: title.trim(),
        description: description.trim() || undefined,
        priority,
        developerId,
        producerId: value.producerId,
        qaId: value.qaId,
        startDate: startDate || null,
        dueDate: dueDate || null,
        labelIds,
        details: value.details,
        evaluation: value.evaluation,
        kpi: value.kpi,
      });
      toast.success(
        t("gamePipeline:game.createdToast", { code: created.code }),
      );
      onClose();
    } catch (error) {
      toast.error(apiErrorMessage(t, error, t("gamePipeline:game.error")));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader className="px-3 pt-4">
          <DialogTitle>{t("gamePipeline:game.createTitle")}</DialogTitle>
          <DialogDescription>
            {t("gamePipeline:game.createDescription")}
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={handleSubmit}
          className="flex max-h-[calc(100dvh-8rem)] flex-col"
        >
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 pb-4">
            <Section title={t("gamePipeline:sections.general")} defaultOpen>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline">
                  {t("gamePipeline:game.codeAuto", {
                    example: `${config.gameCodePrefix}-${String(pipeline.lastGameNumber + 1).padStart(3, "0")}`,
                  })}
                </Badge>
                {firstStage ? (
                  <Badge variant="secondary">
                    {t("gamePipeline:game.initialStage", {
                      stage: stageLabel(firstStage),
                    })}
                  </Badge>
                ) : null}
              </div>
              <div className="space-y-1">
                <Label htmlFor="game-title">
                  {t("gamePipeline:fields.title.label")} *
                </Label>
                <Input
                  id="game-title"
                  autoFocus
                  maxLength={500}
                  placeholder={t("gamePipeline:fields.title.hint")}
                  aria-invalid={(showErrors && !title.trim()) || undefined}
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                />
                {showErrors && !title.trim() ? (
                  <p className="text-xs text-destructive">
                    {t("gamePipeline:game.nameRequired")}
                  </p>
                ) : null}
              </div>
              <div className="space-y-1">
                <Label htmlFor="game-description">
                  {t("gamePipeline:fields.description.label")}
                </Label>
                <Textarea
                  id="game-description"
                  rows={2}
                  placeholder={t("gamePipeline:fields.description.hint")}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <GameRoleFields
                  value={value}
                  onChange={setValue}
                  canChangeProducer
                />
                <div className="space-y-1">
                  <Label htmlFor="game-developer">
                    {t("gamePipeline:form.developer")}
                  </Label>
                  <MemberSelect
                    id="game-developer"
                    value={developerId}
                    onChange={setDeveloperId}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="game-priority">
                    {t("gamePipeline:fields.priority.label")}
                  </Label>
                  <OptionSelect
                    id="game-priority"
                    value={priority}
                    options={PRIORITIES.map((p) => ({
                      value: p,
                      label: t(`gamePipeline:priorities.${p}`),
                    }))}
                    onChange={(next) => next && setPriority(next)}
                  />
                </div>
                <GameProductFields
                  config={config}
                  value={value}
                  onChange={setValue}
                />
                <div className="space-y-1">
                  <Label htmlFor="game-start">
                    {t("gamePipeline:form.startDate")}
                  </Label>
                  <Input
                    id="game-start"
                    type="date"
                    value={startDate}
                    onChange={(event) => setStartDate(event.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="game-due">
                    {t("gamePipeline:fields.dueDate.label")}
                  </Label>
                  <Input
                    id="game-due"
                    type="date"
                    min={startDate || undefined}
                    aria-invalid={dateError || undefined}
                    value={dueDate}
                    onChange={(event) => setDueDate(event.target.value)}
                  />
                  {dateError ? (
                    <p className="text-xs text-destructive">
                      {t("gamePipeline:game.dateError")}
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium">
                  {t("gamePipeline:fields.labels.label")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("gamePipeline:fields.labels.hint")}
                </p>
                {groups.map((group) =>
                  group.labels.length > 0 ? (
                    <div key={group.key} className="space-y-1">
                      <p className="text-xs text-muted-foreground">
                        {group.name}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {group.labels.map((label) => {
                          const active = labelIds.includes(label.id);
                          return (
                            <button
                              key={label.id}
                              type="button"
                              aria-pressed={active}
                              onClick={() => toggleLabel(label.id)}
                              className={cn(
                                "rounded-full border px-2.5 py-1 text-xs transition-colors",
                                active
                                  ? "border-primary bg-primary/10 text-foreground"
                                  : "border-border text-muted-foreground hover:bg-accent",
                              )}
                            >
                              {label.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null,
                )}
              </div>
            </Section>
            <GameDetailSections
              config={config}
              value={value}
              onChange={setValue}
              canDecide={canDecide}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              {t("common:actions.cancel")}
            </Button>
            <Button type="submit" size="sm" disabled={isPending}>
              {t("gamePipeline:game.createButton")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default CreateGameModal;
