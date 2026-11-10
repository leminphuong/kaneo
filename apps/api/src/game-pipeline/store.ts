import { and, count, eq, ne, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../database";
import {
  activityTable,
  columnTable,
  gameCardTable,
  projectPipelineTable,
  taskTable,
} from "../database/schema";
import {
  type ApprovalState,
  asRecord,
  type ChecklistState,
  emptyCardData,
  type GameCardData,
  type GameDetails,
  type GameEvaluation,
  type GameKpi,
} from "./card";
import {
  type PipelineConfig,
  pipelineConfigSchema,
  STAGE_KEYS,
  type StageKey,
} from "./config";
import { describeFailures, evaluateGate, type GateTask } from "./gate";

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type DbOrTx = typeof db | Tx;

export type ProjectPipeline = {
  projectId: string;
  templateKey: string;
  templateVersion: number;
  config: PipelineConfig;
  lastGameNumber: number;
};

export async function getPipeline(
  projectId: string,
  dbOrTx: DbOrTx = db,
): Promise<ProjectPipeline | null> {
  const [row] = await dbOrTx
    .select()
    .from(projectPipelineTable)
    .where(eq(projectPipelineTable.projectId, projectId))
    .limit(1);
  if (!row) return null;
  // Stored configs were validated on write; parsing again guards against a
  // hand-edited row breaking every request with an opaque crash.
  const parsed = pipelineConfigSchema.safeParse(row.config);
  if (!parsed.success) {
    throw new HTTPException(500, {
      message: "This project's pipeline configuration is invalid",
    });
  }
  // Keep the columnIds the server assigned; the schema strips nothing else.
  return {
    projectId: row.projectId,
    templateKey: row.templateKey,
    templateVersion: row.templateVersion,
    config: parsed.data,
    lastGameNumber: row.lastGameNumber,
  };
}

export async function requirePipeline(projectId: string, dbOrTx?: DbOrTx) {
  const pipeline = await getPipeline(projectId, dbOrTx);
  if (!pipeline) {
    throw new HTTPException(400, {
      message: "This project does not use a game pipeline template",
    });
  }
  return pipeline;
}

export function formatGameCode(prefix: string, number: number) {
  return `${prefix}-${String(number).padStart(3, "0")}`;
}

// Increments the project's counter under the row lock of the UPDATE, so two
// concurrent creates can never be handed the same code.
export async function claimGameCode(tx: DbOrTx, projectId: string) {
  const [row] = await tx
    .update(projectPipelineTable)
    .set({ lastGameNumber: sql`${projectPipelineTable.lastGameNumber} + 1` })
    .where(eq(projectPipelineTable.projectId, projectId))
    .returning({
      lastGameNumber: projectPipelineTable.lastGameNumber,
      config: projectPipelineTable.config,
    });
  if (!row) {
    throw new HTTPException(400, {
      message: "This project does not use a game pipeline template",
    });
  }
  const prefix =
    asRecord<{ gameCodePrefix?: string }>(row.config).gameCodePrefix || "GAME";
  return formatGameCode(prefix, row.lastGameNumber);
}

export type GameCardRow = typeof gameCardTable.$inferSelect;

export function cardData(row: GameCardRow | null | undefined): GameCardData {
  if (!row) return emptyCardData();
  return {
    producerId: row.producerId,
    qaId: row.qaId,
    details: asRecord<GameDetails>(row.details),
    evaluation: asRecord<GameEvaluation>(row.evaluation),
    kpi: asRecord<GameKpi>(row.kpi),
    checklist: asRecord<ChecklistState>(row.checklist),
    approvals: asRecord<ApprovalState>(row.approvals),
  };
}

export async function getCardRow(taskId: string, dbOrTx: DbOrTx = db) {
  const [row] = await dbOrTx
    .select()
    .from(gameCardTable)
    .where(eq(gameCardTable.taskId, taskId))
    .limit(1);
  return row ?? null;
}

// Tasks that reached a pipeline project some other way (import, an
// integration) have no card yet; the first write gives them one with a code.
export async function ensureCardRow(
  tx: DbOrTx,
  taskId: string,
  projectId: string,
): Promise<GameCardRow> {
  const [locked] = await tx
    .select()
    .from(gameCardTable)
    .where(eq(gameCardTable.taskId, taskId))
    .for("update")
    .limit(1);
  if (locked) return locked;
  const code = await claimGameCode(tx, projectId);
  const [inserted] = await tx
    .insert(gameCardTable)
    .values({ taskId, projectId, code })
    .onConflictDoNothing({ target: gameCardTable.taskId })
    .returning();
  if (inserted) return inserted;
  const existing = await getCardRow(taskId, tx);
  if (!existing) {
    throw new HTTPException(500, { message: "Failed to create game record" });
  }
  return existing;
}

export function stageForColumn(
  config: PipelineConfig,
  columnId: string | null | undefined,
): StageKey | null {
  if (!columnId) return null;
  return (
    config.stages.find((stage) => stage.columnId === columnId)?.key ?? null
  );
}

export async function stageForStatus(
  config: PipelineConfig,
  projectId: string,
  status: string,
  dbOrTx: DbOrTx = db,
): Promise<StageKey | null> {
  const [column] = await dbOrTx
    .select({ id: columnTable.id })
    .from(columnTable)
    .where(
      and(eq(columnTable.projectId, projectId), eq(columnTable.slug, status)),
    )
    .limit(1);
  return stageForColumn(config, column?.id);
}

export async function countWip(
  config: PipelineConfig,
  projectId: string,
  userId: string | null,
  excludeTaskId: string,
  dbOrTx: DbOrTx = db,
) {
  const development = config.stages.find((stage) => stage.entry.enforceWip);
  if (!userId || !development?.columnId) return 0;
  const [row] = await dbOrTx
    .select({ total: count() })
    .from(taskTable)
    .where(
      and(
        eq(taskTable.projectId, projectId),
        eq(taskTable.columnId, development.columnId),
        eq(taskTable.userId, userId),
        ne(taskTable.id, excludeTaskId),
      ),
    );
  return row?.total ?? 0;
}

export function firstStage(config: PipelineConfig) {
  const stage = config.stages[0];
  if (!stage)
    throw new HTTPException(500, { message: "Pipeline has no stages" });
  return stage;
}

/**
 * Enforces the project's gate rules on a status change. A no-op for projects
 * that were not created from a pipeline template. `task` carries the values
 * the task will have after the write (assignee, due date), so a request that
 * assigns a developer and moves the card at once is judged on its result.
 */
export async function assertGameTransition({
  taskId,
  projectId,
  fromStatus,
  toStatus,
  task,
}: {
  taskId: string;
  projectId: string;
  fromStatus: string | null;
  toStatus: string;
  task: GateTask;
}) {
  if (fromStatus === toStatus) return;
  const pipeline = await getPipeline(projectId);
  if (!pipeline) return;
  const { config } = pipeline;

  const toKey = await stageForStatus(config, projectId, toStatus);
  if (!toKey) return;
  const fromKey = fromStatus
    ? await stageForStatus(config, projectId, fromStatus)
    : null;

  const card = cardData(await getCardRow(taskId));
  const target = config.stages.find((stage) => stage.key === toKey);
  const wipCount = target?.entry.enforceWip
    ? await countWip(config, projectId, task.userId, taskId)
    : 0;
  const failures = evaluateGate({
    config,
    card,
    task,
    fromKey,
    toKey,
    wipCount,
  });
  if (failures.length > 0) {
    throw new HTTPException(409, {
      message: describeFailures(target?.name ?? toKey, failures),
    });
  }
}

export async function recordGameActivity(
  tx: DbOrTx,
  config: PipelineConfig,
  {
    taskId,
    userId,
    type,
    eventData,
  }: {
    taskId: string;
    userId: string;
    type: "game_updated" | "game_checklist" | "game_approval";
    eventData: Record<string, unknown>;
  },
) {
  if (!config.rules.changeHistory) return;
  await tx.insert(activityTable).values({ taskId, userId, type, eventData });
}

export function isStageKey(value: string): value is StageKey {
  return (STAGE_KEYS as readonly string[]).includes(value);
}
