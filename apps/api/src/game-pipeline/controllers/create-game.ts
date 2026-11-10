import { and, eq, inArray, isNull } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import {
  gameCardTable,
  labelTable,
  projectPipelineTable,
  projectTable,
  taskTable,
} from "../../database/schema";
import { publishEvent } from "../../events";
import { claimTaskNumber } from "../../task/controllers/claim-task-numbers";
import { nextTaskPosition } from "../../task/controllers/next-task-position";
import { filterAssignableUsers } from "../../utils/assert-assignable-user";
import type { GameDetails, GameEvaluation, GameKpi } from "../card";
import type { PipelineConfig } from "../config";
import {
  claimGameCode,
  type DbOrTx,
  firstStage,
  type GameCardRow,
  getPipeline,
  requirePipeline,
  type Tx,
} from "../store";

export function todayIn(timezone: string, now = new Date()) {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

// Date-only values are stored as midnight UTC, matching the task date pickers.
export function dateOnly(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

export async function assertWorkspaceMembers(
  workspaceId: string,
  userIds: (string | null | undefined)[],
) {
  const ids = [...new Set(userIds.filter((id): id is string => Boolean(id)))];
  const assignable = await filterAssignableUsers(ids, workspaceId);
  if (ids.some((id) => !assignable.has(id))) {
    throw new HTTPException(403, {
      message: "Assignee is not a member of this workspace",
    });
  }
}

type CardSeed = {
  taskId: string;
  projectId: string;
  producerId: string | null;
  qaId: string | null;
  details: GameDetails;
  evaluation?: GameEvaluation;
  kpi?: GameKpi;
  isSample?: boolean;
  creationKey?: string | null;
};

/**
 * Inserts a game card, claiming the next code. The caller must hold the
 * pipeline row lock (see lockPipeline) inside the same transaction.
 */
export async function insertGameCard(
  tx: DbOrTx,
  seed: CardSeed,
): Promise<GameCardRow> {
  const code = await claimGameCode(tx, seed.projectId);
  const [card] = await tx
    .insert(gameCardTable)
    .values({
      taskId: seed.taskId,
      projectId: seed.projectId,
      code,
      producerId: seed.producerId,
      qaId: seed.qaId,
      details: seed.details,
      evaluation: seed.evaluation ?? {},
      kpi: seed.kpi ?? {},
      checklist: {},
      approvals: {},
      isSample: seed.isSample ?? false,
      creationKey: seed.creationKey ?? null,
    })
    .returning();
  if (!card) {
    throw new HTTPException(500, { message: "Failed to create game record" });
  }
  return card;
}

export async function lockPipeline(tx: DbOrTx, projectId: string) {
  await tx
    .select({ projectId: projectPipelineTable.projectId })
    .from(projectPipelineTable)
    .where(eq(projectPipelineTable.projectId, projectId))
    .for("update");
}

export type CreateGameInput = {
  projectId: string;
  currentUserId: string;
  // Holds project:update; may record decisions on any game.
  canManageProject: boolean;
  creationKey?: string;
  title: string;
  description?: string;
  priority?: string;
  // undefined = use the project default, null = leave unassigned.
  developerId?: string | null;
  producerId?: string | null;
  qaId?: string | null;
  startDate?: string | null;
  dueDate?: string | null;
  labelIds?: string[];
  details?: GameDetails;
  evaluation?: GameEvaluation;
  kpi?: GameKpi;
  isSample?: boolean;
};

function pick<T>(value: T | undefined, fallback: T) {
  return value === undefined ? fallback : value;
}

export function resolveGameDefaults(
  config: PipelineConfig,
  input: CreateGameInput,
) {
  const today = todayIn(config.timezone);
  return {
    developerId: pick(input.developerId, config.defaults.developerId),
    producerId: pick(input.producerId, config.defaults.producerId),
    qaId: pick(input.qaId, config.defaults.qaId),
    priority: input.priority || config.defaults.priority,
    startDate: pick(input.startDate, today),
    dueDate: input.dueDate ?? null,
    details: {
      platform: config.defaults.platform,
      devices: [...config.defaults.devices],
      targetMarket: config.defaults.targetMarket,
      ...input.details,
    } satisfies GameDetails,
  };
}

export async function insertGame(
  tx: Tx,
  config: PipelineConfig,
  workspaceId: string,
  input: CreateGameInput,
) {
  const stage = firstStage(config);
  const resolved = resolveGameDefaults(config, input);

  if (
    resolved.startDate &&
    resolved.dueDate &&
    resolved.dueDate < resolved.startDate
  ) {
    throw new HTTPException(400, {
      message: "The deadline must not be before the start date",
    });
  }

  const taskNumber = await claimTaskNumber(input.projectId, tx);
  const position = await nextTaskPosition(
    tx,
    input.projectId,
    stage.key,
    stage.columnId ?? null,
  );
  const [task] = await tx
    .insert(taskTable)
    .values({
      projectId: input.projectId,
      userId: resolved.developerId,
      title: input.title,
      description: input.description ?? "",
      status: stage.key,
      columnId: stage.columnId ?? null,
      priority: resolved.priority,
      startDate: resolved.startDate ? dateOnly(resolved.startDate) : null,
      dueDate: resolved.dueDate ? dateOnly(resolved.dueDate) : null,
      number: taskNumber,
      position,
    })
    .returning();
  if (!task) throw new HTTPException(500, { message: "Failed to create game" });

  const card = await insertGameCard(tx, {
    taskId: task.id,
    projectId: input.projectId,
    producerId: resolved.producerId,
    qaId: resolved.qaId,
    details: resolved.details,
    evaluation: input.evaluation,
    kpi: input.kpi,
    isSample: input.isSample,
    creationKey: input.creationKey,
  });

  const labelIds = [...new Set(input.labelIds ?? [])];
  if (labelIds.length > 0) {
    const labels = await tx
      .select({ name: labelTable.name, color: labelTable.color })
      .from(labelTable)
      .where(
        and(
          inArray(labelTable.id, labelIds),
          eq(labelTable.workspaceId, workspaceId),
          isNull(labelTable.taskId),
          isNull(labelTable.deletionStartedAt),
        ),
      );
    if (labels.length !== labelIds.length) {
      throw new HTTPException(400, {
        message: "Labels must be existing labels of this workspace",
      });
    }
    await tx
      .insert(labelTable)
      .values(
        labels.map((label) => ({ ...label, taskId: task.id, workspaceId })),
      )
      .onConflictDoNothing({ target: [labelTable.taskId, labelTable.name] });
  }

  return { task, card };
}

async function createGame(input: CreateGameInput) {
  const pipeline = await requirePipeline(input.projectId);
  const { config } = pipeline;
  const [project] = await db
    .select({ workspaceId: projectTable.workspaceId })
    .from(projectTable)
    .where(eq(projectTable.id, input.projectId))
    .limit(1);
  if (!project) throw new HTTPException(404, { message: "Project not found" });

  const resolved = resolveGameDefaults(config, input);
  await assertWorkspaceMembers(project.workspaceId, [
    resolved.developerId,
    resolved.producerId,
    resolved.qaId,
  ]);

  const recordsDecision =
    Boolean(input.evaluation?.decision) || Boolean(input.kpi?.producerDecision);
  if (
    recordsDecision &&
    !input.canManageProject &&
    resolved.producerId !== input.currentUserId
  ) {
    throw new HTTPException(403, {
      message:
        "Only the game's producer or a project manager can record decisions",
    });
  }

  const result = await db.transaction(async (tx) => {
    // Serializes creates in this project, so the idempotency check below and
    // the code counter can't race a concurrent retry of the same request.
    await lockPipeline(tx, input.projectId);
    if (input.creationKey) {
      const [existing] = await tx
        .select({ task: taskTable, card: gameCardTable })
        .from(gameCardTable)
        .innerJoin(taskTable, eq(taskTable.id, gameCardTable.taskId))
        .where(
          and(
            eq(gameCardTable.projectId, input.projectId),
            eq(gameCardTable.creationKey, input.creationKey),
          ),
        )
        .limit(1);
      if (existing) return { ...existing, created: false };
    }
    const created = await insertGame(tx, config, project.workspaceId, input);
    return { ...created, created: true };
  });

  if (result.created) {
    await publishEvent("task.created", {
      ...result.task,
      taskId: result.task.id,
      userId: result.task.userId ?? "",
      currentUserId: input.currentUserId,
      type: "created",
      content: null,
    });
  }

  return result;
}

export default createGame;

/**
 * For task-creating paths that are not the game form (generic task API, MCP,
 * duplicate, import): in a pipeline project every task is a game, so it gets
 * a card with the project defaults. Returns the stage key new tasks must use,
 * or null for ordinary projects.
 */
export async function pipelineEntryStage(projectId: string, dbOrTx?: DbOrTx) {
  const pipeline = await getPipeline(projectId, dbOrTx);
  return pipeline ? firstStage(pipeline.config).key : null;
}

export async function attachDefaultGameCard(
  tx: DbOrTx,
  projectId: string,
  taskId: string,
) {
  const pipeline = await getPipeline(projectId, tx);
  if (!pipeline) return null;
  const { config } = pipeline;
  return insertGameCard(tx, {
    taskId,
    projectId,
    producerId: config.defaults.producerId,
    qaId: config.defaults.qaId,
    details: {
      platform: config.defaults.platform,
      devices: [...config.defaults.devices],
      targetMarket: config.defaults.targetMarket,
    },
  });
}
