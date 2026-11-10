import { and, eq, inArray, isNull } from "drizzle-orm";
import {
  columnTable,
  labelTable,
  projectPipelineTable,
} from "../../database/schema";
import type { PipelineConfig } from "../config";
import type { Tx } from "../store";
import { insertGame } from "./create-game";

export type PipelineTemplateInput = {
  key: string;
  version: number;
  config: PipelineConfig;
  includeSampleGame: boolean;
};

/**
 * Builds a template project's columns, pipeline config, labels and optional
 * sample game. Runs inside the project-creation transaction so a failure at
 * any step leaves no half-built project behind.
 */
export async function setupPipelineProject(
  tx: Tx,
  {
    projectId,
    workspaceId,
    currentUserId,
    canCreateLabels,
    template,
  }: {
    projectId: string;
    workspaceId: string;
    currentUserId: string;
    canCreateLabels: boolean;
    template: PipelineTemplateInput;
  },
) {
  const columns = await tx
    .insert(columnTable)
    .values(
      template.config.stages.map((stage, position) => ({
        projectId,
        name: `${stage.emoji} ${stage.name}`.trim(),
        slug: stage.key,
        position,
        isFinal: stage.isFinal,
      })),
    )
    .returning({ id: columnTable.id, slug: columnTable.slug });

  // Deep copy: the project owns its config from here on, so later edits to
  // the template (or to another project) can never reach it.
  const config: PipelineConfig = structuredClone({
    ...template.config,
    stages: template.config.stages.map((stage) => ({
      ...stage,
      columnId: columns.find((column) => column.slug === stage.key)?.id ?? null,
    })),
  });

  await tx.insert(projectPipelineTable).values({
    projectId,
    templateKey: template.key,
    templateVersion: template.version,
    config,
  });

  // Labels are workspace-wide definitions. Reuse ones that already exist by
  // name; create the rest only when the creator may create labels.
  const names = config.labelGroups.flatMap((group) => group.labels);
  if (names.length > 0) {
    const existing = await tx
      .select({ name: labelTable.name })
      .from(labelTable)
      .where(
        and(
          eq(labelTable.workspaceId, workspaceId),
          isNull(labelTable.taskId),
          inArray(
            labelTable.name,
            names.map((label) => label.name),
          ),
        ),
      );
    const known = new Set(existing.map((label) => label.name));
    const missing = names.filter((label) => !known.has(label.name));
    if (canCreateLabels && missing.length > 0) {
      await tx
        .insert(labelTable)
        .values(
          missing.map((label) => ({
            name: label.name,
            color: label.color,
            workspaceId,
            taskId: null,
          })),
        )
        .onConflictDoNothing();
    }
  }

  if (template.includeSampleGame) {
    await insertGame(tx, config, workspaceId, {
      projectId,
      currentUserId,
      canManageProject: false,
      title: "[DỮ LIỆU MẪU] Game ví dụ — Né Meme",
      description:
        "Đây là dữ liệu mẫu để làm quen với quy trình. Có thể xoá bất cứ lúc nào.",
      details: {
        trendEvidence:
          "Dữ liệu mẫu — thay bằng bằng chứng thật trước khi dùng.",
        gameplayIdea: "Dữ liệu mẫu — người chơi né các meme rơi xuống.",
      },
      isSample: true,
    });
  }

  return config;
}
