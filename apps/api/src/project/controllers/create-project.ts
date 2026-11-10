import { and, eq, max, sql } from "drizzle-orm";
import db from "../../database";
import { columnTable, projectTable } from "../../database/schema";
import {
  type PipelineTemplateInput,
  setupPipelineProject,
} from "../../game-pipeline/controllers/setup-pipeline-project";

export const DEFAULT_PROJECT_COLUMNS = [
  { name: "To Do", slug: "to-do", position: 0, isFinal: false },
  { name: "In Progress", slug: "in-progress", position: 1, isFinal: false },
  { name: "In Review", slug: "in-review", position: 2, isFinal: false },
  { name: "Done", slug: "done", position: 3, isFinal: true },
] as const;

export type CreateProjectOptions = {
  description?: string;
  creationKey?: string;
  // Present only when the project is created from a template.
  template?: PipelineTemplateInput & {
    currentUserId: string;
    canCreateLabels: boolean;
  };
};

async function createProject(
  workspaceId: string,
  name: string,
  icon: string,
  slug: string,
  options: CreateProjectOptions = {},
) {
  return db.transaction(async (tx) => {
    // Serialize ordering writes per workspace: without this, two concurrent
    // creates can read the same max(position) and land on the same slot, and a
    // create can interleave with a reorder's renumber. `reorderProjects` takes
    // the same lock with the same key.
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(1524, hashtext(${workspaceId}))`,
    );

    // A retried or double-submitted create returns the first one's project.
    // The workspace lock above makes this check race-free.
    if (options.creationKey) {
      const [existing] = await tx
        .select()
        .from(projectTable)
        .where(
          and(
            eq(projectTable.workspaceId, workspaceId),
            eq(projectTable.creationKey, options.creationKey),
          ),
        )
        .limit(1);
      if (existing) return existing;
    }

    // New projects go to the bottom of the workspace's ordering.
    const [{ maxPosition } = { maxPosition: null }] = await tx
      .select({ maxPosition: max(projectTable.position) })
      .from(projectTable)
      .where(eq(projectTable.workspaceId, workspaceId));

    const [createdProject] = await tx
      .insert(projectTable)
      .values({
        workspaceId,
        name,
        icon,
        slug,
        description: options.description,
        creationKey: options.creationKey ?? null,
        position: maxPosition === null ? 0 : maxPosition + 1,
      })
      .returning();

    if (createdProject) {
      if (options.template) {
        const { currentUserId, canCreateLabels, ...template } =
          options.template;
        await setupPipelineProject(tx, {
          projectId: createdProject.id,
          workspaceId,
          currentUserId,
          canCreateLabels,
          template,
        });
      } else {
        for (const col of DEFAULT_PROJECT_COLUMNS) {
          await tx.insert(columnTable).values({
            projectId: createdProject.id,
            name: col.name,
            slug: col.slug,
            position: col.position,
            isFinal: col.isFinal,
          });
        }
      }
    }

    return createdProject;
  });
}

export default createProject;
