import {
  GAME_PIPELINE_TEMPLATE_KEY,
  pipelineConfigSchema,
} from "../game-pipeline/config";
import { z } from "../openapi";

export const projectParam = z.object({ id: z.string() });

export const workspaceIdQuery = z.object({ workspaceId: z.string() });

export const listProjectsQuery = z.object({
  workspaceId: z.string(),
  includeArchived: z.string().optional().openapi({
    description: 'Pass "true" to include archived projects in the list.',
  }),
});

export const createProjectBody = z.object({
  name: z.string(),
  workspaceId: z.string(),
  icon: z.string(),
  slug: z.string(),
  description: z.string().max(5000).optional(),
  creationKey: z.string().min(8).max(128).optional().openapi({
    description:
      "Client-generated idempotency key. Repeating a create with the same key returns the project the first request made.",
  }),
  template: z
    .object({
      key: z.literal(GAME_PIPELINE_TEMPLATE_KEY),
      version: z.number().int().min(1),
      config: pipelineConfigSchema,
      includeSampleGame: z.boolean().optional().default(false).openapi({
        description:
          "Also create one game clearly marked as sample data. Off by default.",
      }),
    })
    .optional()
    .openapi({
      description:
        "Create the project from a template. The config (possibly edited) is copied into the project, which owns it from then on.",
    }),
});

export const updateProjectBody = z.object({
  name: z.string(),
  icon: z.string(),
  slug: z.string(),
  description: z.string(),
  isPublic: z.boolean(),
});

export const reorderProjectsBody = z.object({
  // Positions express a relative order only; the controller renumbers the
  // workspace to 0..n-1, so the values just have to be sane.
  projects: z
    .array(z.object({ id: z.string(), position: z.number().int().min(0) }))
    .min(1),
});

export const moveProjectBody = z.object({ workspaceId: z.string().min(1) });
