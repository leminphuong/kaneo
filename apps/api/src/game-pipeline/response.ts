import { nullableResponseTimestamp, responseTimestamp, z } from "../openapi";
import { gameDetailsSchema, gameEvaluationSchema, gameKpiSchema } from "./card";
import {
  GAME_PIPELINE_TEMPLATE_KEY,
  pipelineConfigSchema,
  STAGE_KEYS,
} from "./config";

export const templateSchema = z
  .object({
    key: z.literal(GAME_PIPELINE_TEMPLATE_KEY),
    version: z.number(),
    name: z.string(),
    description: z.string(),
    project: z.object({
      name: z.string(),
      description: z.string(),
      icon: z.string(),
    }),
    config: pipelineConfigSchema,
    updatedAt: nullableResponseTimestamp,
  })
  .openapi("ProjectTemplate");

export const projectPipelineSchema = z
  .object({
    projectId: z.string(),
    templateKey: z.string(),
    templateVersion: z.number(),
    config: pipelineConfigSchema,
    lastGameNumber: z.number(),
  })
  .openapi("ProjectPipeline");

export const projectPipelineResultSchema = z
  .object({ pipeline: projectPipelineSchema.nullable() })
  .openapi("ProjectPipelineResult");

const gateFailureSchema = z
  .object({
    code: z.enum([
      "notAllowedFrom",
      "missingField",
      "briefIncomplete",
      "checklistIncomplete",
      "evaluationIncomplete",
      "evaluationNotApproved",
      "approvalRequired",
      "kpiResultsMissing",
      "criticalBugsOpen",
      "wipLimitReached",
    ]),
    from: z.string().nullable().optional(),
    field: z.string().optional(),
    sections: z.array(z.string()).optional(),
    stage: z.string().optional(),
    remaining: z.number().optional(),
    gate: z.string().optional(),
    kpis: z.array(z.string()).optional(),
    limit: z.number().optional(),
    current: z.number().optional(),
  })
  .openapi("GateFailure");

const checkedItemSchema = z.object({
  by: z.string().nullable(),
  at: z.string(),
});

export const gameSchema = z
  .object({
    taskId: z.string(),
    projectId: z.string(),
    code: z.string().nullable().openapi({
      description:
        "Null until the game's first pipeline write, for tasks that entered the project without one (import, integrations).",
    }),
    isSample: z.boolean(),
    producerId: z.string().nullable(),
    qaId: z.string().nullable(),
    details: gameDetailsSchema,
    evaluation: gameEvaluationSchema,
    kpi: gameKpiSchema,
    checklist: z.record(z.string(), z.record(z.string(), checkedItemSchema)),
    approvals: z.record(
      z.string(),
      checkedItemSchema.extend({ by: z.string() }),
    ),
    stage: z.enum(STAGE_KEYS).nullable(),
    totalScore: z.number().nullable().openapi({
      description:
        "Weighted 0-100 score; null until every criterion is scored.",
    }),
    kpiStatus: z.record(z.string(), z.enum(["met", "notMet", "noData"])),
    canDecide: z.boolean().openapi({
      description:
        "Whether the caller may record decisions and approvals (the game's producer or a project manager).",
    }),
    transitions: z.array(
      z.object({
        stage: z.enum(STAGE_KEYS),
        allowed: z.boolean(),
        failures: z.array(gateFailureSchema),
      }),
    ),
    createdAt: nullableResponseTimestamp,
    updatedAt: nullableResponseTimestamp,
  })
  .openapi("Game");

export const gameSummarySchema = z
  .object({
    taskId: z.string(),
    code: z.string(),
    isSample: z.boolean(),
    stage: z.enum(STAGE_KEYS).nullable(),
    checked: z.number(),
    total: z.number(),
  })
  .openapi("GameSummary");

export const createdGameSchema = z
  .object({
    taskId: z.string(),
    projectId: z.string(),
    code: z.string(),
    number: z.number().nullable(),
    title: z.string(),
    status: z.string(),
    created: z.boolean().openapi({
      description:
        "False when an earlier request with the same creationKey made it.",
    }),
    createdAt: responseTimestamp,
  })
  .openapi("CreatedGame");
