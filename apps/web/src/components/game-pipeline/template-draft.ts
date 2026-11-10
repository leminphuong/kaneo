import type { PipelineConfig, ProjectTemplate } from "@/fetchers/game-pipeline";
import generateProjectSlug from "@/lib/generate-project-id";
import { todayIn } from "./fields";

export type ProjectDraft = {
  name: string;
  slug: string;
  icon: string;
  description: string;
  // Present only while a template is selected.
  template: {
    key: ProjectTemplate["key"];
    version: number;
    name: string;
    config: PipelineConfig;
    includeSampleGame: boolean;
  } | null;
};

export const BLANK_DRAFT: ProjectDraft = {
  name: "",
  slug: "",
  icon: "Layout",
  description: "",
  template: null,
};

/**
 * Pre-fills the project form from a template. The config is deep-copied so
 * editing the draft can never mutate the cached template. The creator becomes
 * the default producer only when they may manage projects; otherwise the form
 * asks for one. The start date is today in the template's time zone and the
 * deadline stays empty: nothing is invented.
 */
export function draftFromTemplate(
  template: ProjectTemplate,
  {
    currentUserId,
    canBeProducer,
    now = new Date(),
  }: { currentUserId: string | null; canBeProducer: boolean; now?: Date },
): ProjectDraft {
  const config = structuredClone(template.config);
  config.startDate = todayIn(config.timezone, now);
  config.deadline = null;
  config.defaults.producerId =
    canBeProducer && currentUserId ? currentUserId : null;
  config.defaults.developerId = null;
  config.defaults.qaId = null;
  return {
    name: template.project.name,
    slug: generateProjectSlug(template.project.name),
    icon: template.project.icon,
    description: template.project.description,
    template: {
      key: template.key,
      version: template.version,
      name: template.name,
      config,
      includeSampleGame: false,
    },
  };
}

// Returning to the blank project drops every template value, including the
// name and description the template filled in.
export function blankDraft(): ProjectDraft {
  return { ...BLANK_DRAFT };
}

export function draftErrors(draft: ProjectDraft) {
  const errors: string[] = [];
  if (!draft.name.trim()) errors.push("name");
  if (!draft.slug.trim()) errors.push("slug");
  if (draft.template) {
    const { config } = draft.template;
    if (!config.defaults.producerId) errors.push("producer");
    if (!/^[A-Z0-9]{1,10}$/.test(config.gameCodePrefix)) errors.push("prefix");
    if (config.deadline && config.deadline < config.startDate)
      errors.push("deadline");
    if (config.stages.some((stage) => !stage.name.trim()))
      errors.push("stages");
    if (
      config.stages.some((stage) =>
        stage.checklist.some((item) => !item.label.trim()),
      )
    )
      errors.push("checklists");
    if (
      config.labelGroups.some(
        (group) =>
          !group.name.trim() ||
          group.labels.some((label) => !label.name.trim()),
      )
    )
      errors.push("labels");
  }
  return errors;
}
