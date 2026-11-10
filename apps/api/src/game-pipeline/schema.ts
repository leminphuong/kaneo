import { z } from "../openapi";
import { gameDetailsSchema, gameEvaluationSchema, gameKpiSchema } from "./card";
import { APPROVAL_GATES, pipelineConfigSchema, STAGE_KEYS } from "./config";

export const projectIdParam = z.object({ projectId: z.string() });
export const taskIdParam = z.object({ taskId: z.string() });

export const saveTemplateBody = z.object({ config: pipelineConfigSchema });

export const updatePipelineBody = z.object({ config: pipelineConfigSchema });

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");
const optionalUser = z.string().min(1).nullable().optional().openapi({
  description: "Omit to use the project default; null leaves the role empty.",
});

export const createGameBody = z.object({
  title: z.string().trim().min(1).max(500),
  description: z.string().max(100000).optional(),
  creationKey: z.string().min(8).max(128).optional().openapi({
    description:
      "Client-generated idempotency key; a retry with the same key returns the first game.",
  }),
  priority: z
    .enum(["no-priority", "low", "medium", "high", "urgent"])
    .optional(),
  developerId: optionalUser,
  producerId: optionalUser,
  qaId: optionalUser,
  startDate: isoDate.nullable().optional(),
  dueDate: isoDate.nullable().optional(),
  labelIds: z.array(z.string()).max(50).optional(),
  details: gameDetailsSchema.optional(),
  evaluation: gameEvaluationSchema.optional(),
  kpi: gameKpiSchema.optional(),
});

export const updateGameBody = z.object({
  producerId: z.string().min(1).nullable().optional(),
  qaId: z.string().min(1).nullable().optional(),
  details: gameDetailsSchema.optional(),
  evaluation: gameEvaluationSchema.optional(),
  kpi: gameKpiSchema.optional(),
});

export const setChecklistItemBody = z.object({
  stage: z.enum(STAGE_KEYS),
  item: z.string().min(1).max(64),
  checked: z.boolean(),
});

export const setApprovalBody = z.object({
  gate: z.enum(APPROVAL_GATES),
  approved: z.boolean(),
});
