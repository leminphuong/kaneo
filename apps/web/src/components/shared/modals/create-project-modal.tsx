import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { newCreationKey } from "@/components/game-pipeline/fields";
import {
  blankDraft,
  draftErrors,
  draftFromTemplate,
  type ProjectDraft,
} from "@/components/game-pipeline/template-draft";
import TemplateProjectFields from "@/components/game-pipeline/template-project-fields";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import icons from "@/constants/project-icons";
import useCreateProject from "@/hooks/mutations/project/use-create-project";
import { useGameTemplate } from "@/hooks/queries/game-pipeline/use-game-pipeline";
import useActiveWorkspace from "@/hooks/queries/workspace/use-active-workspace";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/cn";
import generateProjectSlug from "@/lib/generate-project-id";
import { toast } from "@/lib/toast";
import { useUserPreferencesStore } from "@/store/user-preferences";

type CreateProjectModalProps = {
  open: boolean;
  onClose: () => void;
};

function CreateProjectModal({ open, onClose }: CreateProjectModalProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<ProjectDraft>(blankDraft);
  const [creationKey, setCreationKey] = useState(newCreationKey);
  const [showErrors, setShowErrors] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { name, slug, icon: selectedIcon } = draft;
  const setSlug = (value: string) =>
    setDraft((current) => ({ ...current, slug: value }));
  const setSelectedIcon = (value: string) =>
    setDraft((current) => ({ ...current, icon: value }));
  const [iconPopoverOpen, setIconPopoverOpen] = useState(false);
  const [iconSearch, setIconSearch] = useState("");
  const queryClient = useQueryClient();
  const { data: workspace } = useActiveWorkspace();
  const { data: template, isLoading: templateLoading } = useGameTemplate(open);
  const { canUpdateProjects } = useWorkspacePermission();
  const { data: session } = authClient.useSession();
  const setViewMode = useUserPreferencesStore((state) => state.setViewMode);
  const errors = draftErrors(draft);
  const isTemplate = draft.template !== null;
  const { mutateAsync } = useCreateProject({
    name: name.trim(),
    slug: slug.trim(),
    workspaceId: workspace?.id ?? "",
    icon: selectedIcon,
    description: draft.description.trim() || undefined,
    creationKey,
    template: draft.template
      ? {
          key: draft.template.key,
          version: draft.template.version,
          config: draft.template.config,
          includeSampleGame: draft.template.includeSampleGame,
        }
      : undefined,
  });

  const selectTemplate = () => {
    if (!template) return;
    setShowErrors(false);
    setDraft(
      draftFromTemplate(template, {
        currentUserId: session?.user?.id ?? null,
        canBeProducer: canUpdateProjects(),
      }),
    );
  };

  const selectBlank = () => {
    setShowErrors(false);
    setDraft(blankDraft());
  };

  const SelectedIcon =
    icons[selectedIcon as keyof typeof icons] || icons.Layout;
  const filteredIcons = Object.entries(icons).filter(([iconName]) =>
    iconName.toLowerCase().includes(iconSearch.trim().toLowerCase()),
  );
  const navigate = useNavigate();

  const handleClose = () => {
    setDraft(blankDraft());
    setCreationKey(newCreationKey());
    setShowErrors(false);
    setIconPopoverOpen(false);
    setIconSearch("");
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (errors.length > 0) {
      setShowErrors(true);
      return;
    }

    setIsSubmitting(true);
    try {
      // The creation key stays the same across retries of this form, so a
      // double click or a retry after a network error cannot create twice.
      const { id } = await mutateAsync();
      toast.success(
        isTemplate
          ? t("gamePipeline:form.createdToast")
          : t("gamePipeline:form.createdBlankToast"),
      );
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      if (draft.template) {
        setViewMode(draft.template.config.view === "list" ? "list" : "board");
      }

      navigate({
        to: "/dashboard/workspace/$workspaceId/project/$projectId/board",
        params: {
          workspaceId: workspace?.id ?? "",
          projectId: id,
        },
      });

      handleClose();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("common:modals.createProject.errorToast"),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newName = e.target.value;
    setDraft((current) => ({
      ...current,
      name: newName,
      slug: generateProjectSlug(newName),
    }));
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className={cn(isTemplate ? "max-w-2xl" : "max-w-md")}
        showCloseButton={false}
      >
        <DialogHeader className="px-3 pt-4 pb-1 gap-1.5">
          <DialogTitle className="sr-only">
            {t("common:modals.createProject.title")}
          </DialogTitle>
          <Breadcrumb>
            <BreadcrumbList className="gap-1 text-xs">
              <BreadcrumbItem className="text-muted-foreground font-medium tracking-wide">
                {workspace?.name?.toUpperCase() ||
                  t("common:modals.createProject.workspaceFallback")}
              </BreadcrumbItem>
              <BreadcrumbSeparator className="[&>svg]:size-3.5" />
              <BreadcrumbItem className="text-foreground font-medium">
                {t("common:modals.createProject.breadcrumbNew")}
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <DialogDescription className="sr-only">
            {t("common:modals.createProject.description")}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={handleSubmit}
          className="flex max-h-[calc(100dvh-6rem)] flex-col"
        >
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pb-4">
            <section
              aria-labelledby="project-template-heading"
              className="space-y-2 px-3 pt-2"
            >
              <h2
                id="project-template-heading"
                className="text-sm font-medium text-muted-foreground"
              >
                {t("gamePipeline:templatePicker.title")}
              </h2>
              <div className="grid gap-2 sm:grid-cols-2">
                <TemplateCard
                  title={t("gamePipeline:templatePicker.blankName")}
                  description={t(
                    "gamePipeline:templatePicker.blankDescription",
                  )}
                  selected={!isTemplate}
                  onSelect={selectBlank}
                  actionLabel={t("gamePipeline:templatePicker.useTemplate")}
                  selectedLabel={t("gamePipeline:templatePicker.selected")}
                />
                <TemplateCard
                  title={
                    template?.name ?? t("gamePipeline:templatePicker.loading")
                  }
                  description={template?.description ?? ""}
                  selected={isTemplate}
                  disabled={!template || templateLoading}
                  onSelect={selectTemplate}
                  actionLabel={t("gamePipeline:templatePicker.useTemplate")}
                  selectedLabel={t("gamePipeline:templatePicker.selected")}
                />
              </div>
            </section>
            <div className="space-y-6 px-3 pt-2">
              <Popover
                open={iconPopoverOpen}
                onOpenChange={(open) => {
                  setIconPopoverOpen(open);
                  if (!open) setIconSearch("");
                }}
                modal={true}
              >
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    className="h-8 w-8 p-0"
                    title={t("common:modals.createProject.pickIcon")}
                  >
                    <SelectedIcon className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-2" align="start">
                  <div className="space-y-2">
                    <Input
                      value={iconSearch}
                      onChange={(e) => setIconSearch(e.target.value)}
                      placeholder={t("common:modals.createProject.searchIcons")}
                      className="h-8 text-xs"
                    />
                    <div className="max-h-[280px] overflow-y-auto pr-1">
                      <div className="grid grid-cols-6 gap-1.5">
                        {filteredIcons.map(([iconName, Icon]) => {
                          const isSelected = selectedIcon === iconName;
                          return (
                            <Button
                              key={iconName}
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setSelectedIcon(iconName);
                                setIconPopoverOpen(false);
                                setIconSearch("");
                              }}
                              className={cn(
                                "h-10 items-center justify-center rounded-md p-0",
                                isSelected &&
                                  "bg-sidebar-accent text-sidebar-accent-foreground",
                              )}
                              title={iconName}
                            >
                              <Icon className="h-4 w-4" />
                            </Button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>

              <Input
                unstyled
                value={name}
                onChange={handleNameChange}
                autoFocus
                placeholder={t("common:modals.createProject.projectName")}
                className="w-full [&_[data-slot=input]]:h-auto [&_[data-slot=input]]:px-0 [&_[data-slot=input]]:py-2 [&_[data-slot=input]]:text-2xl [&_[data-slot=input]]:leading-tight [&_[data-slot=input]]:font-semibold [&_[data-slot=input]]:tracking-tight [&_[data-slot=input]]:text-foreground [&_[data-slot=input]]:placeholder:text-muted-foreground [&_[data-slot=input]]:outline-none"
                required
              />
            </div>

            <div className="space-y-3 px-3">
              <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/50 border border-border">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-muted-foreground">
                    {t("common:modals.createProject.keyLabel")}
                  </span>
                  <Input
                    id="project-key"
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    placeholder="PRO"
                    maxLength={8}
                    className="w-20 h-8 text-center font-semibold text-sm bg-background border-border rounded-lg transition-colors duration-150"
                    required
                  />
                </div>
                <div className="flex-1 text-xs text-muted-foreground opacity-80">
                  {t("common:modals.createProject.keyHint", {
                    example: slug || "ABC",
                  })}
                </div>
              </div>
            </div>

            {isTemplate ? (
              <div className="px-3">
                <TemplateProjectFields
                  draft={draft}
                  onChange={setDraft}
                  showErrors={showErrors}
                  errors={errors}
                />
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              type="button"
              onClick={handleClose}
              variant="outline"
              size="sm"
              className="border-border text-foreground hover:bg-accent"
            >
              {t("common:actions.cancel")}
            </Button>
            <Button
              type="submit"
              disabled={!name.trim() || !slug.trim() || isSubmitting}
              size="sm"
              className="bg-primary hover:bg-primary/90  disabled:opacity-50"
            >
              {t("common:modals.createProject.createButton")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TemplateCard({
  title,
  description,
  selected,
  disabled,
  onSelect,
  actionLabel,
  selectedLabel,
}: {
  title: string;
  description: string;
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
  actionLabel: string;
  selectedLabel: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-xl border p-3 transition-colors",
        selected ? "border-primary bg-primary/5" : "border-border bg-muted/30",
      )}
    >
      <p className="text-sm font-semibold">{title}</p>
      <p className="flex-1 text-xs text-muted-foreground">{description}</p>
      <Button
        type="button"
        size="sm"
        variant={selected ? "secondary" : "outline"}
        disabled={disabled || selected}
        aria-pressed={selected}
        onClick={onSelect}
      >
        {selected ? selectedLabel : actionLabel}
      </Button>
    </div>
  );
}

export default CreateProjectModal;
