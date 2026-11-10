import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import {
  columnTable,
  gameCardTable,
  projectPipelineTable,
  projectTable,
  taskTable,
} from "../../database/schema";
import { publishEvent } from "../../events";
import {
  asRecord,
  type ChecklistState,
  type GameCardData,
  type GameEvaluation,
  type GameKpi,
} from "../card";
import { KPI_KEYS, type PipelineConfig } from "../config";
import {
  computeTotalScore,
  evaluateGate,
  kpiStatus,
  uncheckedCount,
} from "../gate";
import {
  cardData,
  countWip,
  ensureCardRow,
  getCardRow,
  getPipeline,
  recordGameActivity,
  requirePipeline,
  stageForColumn,
} from "../store";
import { assertWorkspaceMembers } from "./create-game";

async function loadTask(taskId: string) {
  const [task] = await db
    .select({
      id: taskTable.id,
      projectId: taskTable.projectId,
      title: taskTable.title,
      status: taskTable.status,
      columnId: taskTable.columnId,
      userId: taskTable.userId,
      dueDate: taskTable.dueDate,
      workspaceId: projectTable.workspaceId,
    })
    .from(taskTable)
    .innerJoin(projectTable, eq(projectTable.id, taskTable.projectId))
    .where(eq(taskTable.id, taskId))
    .limit(1);
  if (!task) throw new HTTPException(404, { message: "Task not found" });
  return task;
}

export function canDecideOn(
  card: Pick<GameCardData, "producerId">,
  userId: string,
  canManageProject: boolean,
) {
  return canManageProject || (!!card.producerId && card.producerId === userId);
}

export async function getGame(
  taskId: string,
  userId: string,
  canManageProject: boolean,
) {
  const task = await loadTask(taskId);
  const { config } = await requirePipeline(task.projectId);
  const row = await getCardRow(taskId);
  const card = cardData(row);
  const stage = stageForColumn(config, task.columnId);
  const developmentStage = config.stages.find((s) => s.entry.enforceWip);
  const wipCount = developmentStage
    ? await countWip(config, task.projectId, task.userId, taskId)
    : 0;

  return {
    taskId,
    projectId: task.projectId,
    code: row?.code ?? null,
    isSample: row?.isSample ?? false,
    producerId: card.producerId,
    qaId: card.qaId,
    details: card.details,
    evaluation: card.evaluation,
    kpi: card.kpi,
    checklist: card.checklist,
    approvals: card.approvals as Record<string, { by: string; at: string }>,
    stage,
    totalScore: computeTotalScore(config, card.evaluation.scores),
    kpiStatus: Object.fromEntries(
      KPI_KEYS.map((key) => [key, kpiStatus(config, card, key)]),
    ),
    canDecide: canDecideOn(card, userId, canManageProject),
    transitions: config.stages
      .filter((target) => target.key !== stage)
      .map((target) => {
        const failures = evaluateGate({
          config,
          card,
          task,
          fromKey: stage,
          toKey: target.key,
          wipCount,
        });
        return { stage: target.key, allowed: failures.length === 0, failures };
      }),
    createdAt: row?.createdAt ?? null,
    updatedAt: row?.updatedAt ?? null,
  };
}

export async function listGames(projectId: string) {
  const pipeline = await getPipeline(projectId);
  if (!pipeline) return [];
  const { config } = pipeline;
  const rows = await db
    .select({
      taskId: gameCardTable.taskId,
      code: gameCardTable.code,
      isSample: gameCardTable.isSample,
      checklist: gameCardTable.checklist,
      columnId: taskTable.columnId,
    })
    .from(gameCardTable)
    .innerJoin(taskTable, eq(taskTable.id, gameCardTable.taskId))
    .where(eq(gameCardTable.projectId, projectId));

  return rows.map((row) => {
    const stageKey = stageForColumn(config, row.columnId);
    const stage = config.stages.find((s) => s.key === stageKey);
    const total = config.rules.stageChecklists
      ? (stage?.checklist.length ?? 0)
      : 0;
    const remaining = stage
      ? uncheckedCount(stage, {
          checklist: asRecord<ChecklistState>(row.checklist),
        })
      : 0;
    return {
      taskId: row.taskId,
      code: row.code,
      isSample: row.isSample,
      stage: stageKey,
      checked: total === 0 ? 0 : total - remaining,
      total,
    };
  });
}

async function notifyGameChanged(
  task: { id: string; projectId: string; title: string; status: string },
  userId: string,
) {
  await publishEvent("task.updated", {
    taskId: task.id,
    projectId: task.projectId,
    title: task.title,
    status: task.status,
    userId,
  });
}

function mergeEvaluation(
  current: GameEvaluation,
  patch: GameEvaluation | undefined,
): GameEvaluation {
  if (!patch) return current;
  return {
    ...current,
    ...patch,
    scores: { ...current.scores, ...patch.scores },
  };
}

function mergeKpi(current: GameKpi, patch: GameKpi | undefined): GameKpi {
  if (!patch) return current;
  const results: NonNullable<GameKpi["results"]> = { ...current.results };
  for (const [key, value] of Object.entries(patch.results ?? {})) {
    const k = key as keyof typeof results;
    results[k] = { ...results[k], ...value };
  }
  return { ...current, ...patch, results };
}

export async function updateGame({
  taskId,
  userId,
  canManageProject,
  patch,
}: {
  taskId: string;
  userId: string;
  canManageProject: boolean;
  patch: {
    producerId?: string | null;
    qaId?: string | null;
    details?: GameCardData["details"];
    evaluation?: GameEvaluation;
    kpi?: GameKpi;
  };
}) {
  const task = await loadTask(taskId);
  const { config } = await requirePipeline(task.projectId);
  await assertWorkspaceMembers(task.workspaceId, [
    patch.producerId,
    patch.qaId,
  ]);

  await db.transaction(async (tx) => {
    const row = await ensureCardRow(tx, taskId, task.projectId);
    const current = cardData(row);
    const canDecide = canDecideOn(current, userId, canManageProject);

    const decisionChanged =
      (patch.evaluation?.decision !== undefined &&
        patch.evaluation.decision !== (current.evaluation.decision ?? null)) ||
      (patch.kpi?.producerDecision !== undefined &&
        patch.kpi.producerDecision !== (current.kpi.producerDecision ?? null));
    const producerChanged =
      patch.producerId !== undefined && patch.producerId !== current.producerId;
    // Decisions are the producer's; reassigning the producer is guarded the
    // same way so nobody can make themselves producer and then approve.
    if ((decisionChanged || producerChanged) && !canDecide) {
      throw new HTTPException(403, {
        message:
          "Only the game's producer or a project manager can record decisions or change the producer",
      });
    }

    const next = {
      producerId:
        patch.producerId === undefined ? current.producerId : patch.producerId,
      qaId: patch.qaId === undefined ? current.qaId : patch.qaId,
      details: patch.details
        ? { ...current.details, ...patch.details }
        : current.details,
      evaluation: mergeEvaluation(current.evaluation, patch.evaluation),
      kpi: mergeKpi(current.kpi, patch.kpi),
    };

    await tx
      .update(gameCardTable)
      .set(next)
      .where(eq(gameCardTable.taskId, taskId));

    const fields = [
      ...(producerChanged ? ["producerId"] : []),
      ...(patch.qaId !== undefined && patch.qaId !== current.qaId
        ? ["qaId"]
        : []),
      ...Object.keys(patch.details ?? {}).filter(
        (key) =>
          JSON.stringify(patch.details?.[key as keyof typeof patch.details]) !==
          JSON.stringify(current.details[key as keyof typeof current.details]),
      ),
      ...(patch.evaluation ? ["evaluation"] : []),
      ...(patch.kpi ? ["kpi"] : []),
    ];
    if (fields.length > 0) {
      await recordGameActivity(tx, config, {
        taskId,
        userId,
        type: "game_updated",
        eventData: {
          fields,
          ...(decisionChanged
            ? {
                decision: next.evaluation.decision ?? null,
                producerDecision: next.kpi.producerDecision ?? null,
              }
            : {}),
        },
      });
    }
  });

  await notifyGameChanged(task, userId);
  return getGame(taskId, userId, canManageProject);
}

export async function setChecklistItem({
  taskId,
  userId,
  canManageProject,
  stage,
  item,
  checked,
}: {
  taskId: string;
  userId: string;
  canManageProject: boolean;
  stage: string;
  item: string;
  checked: boolean;
}) {
  const task = await loadTask(taskId);
  const { config } = await requirePipeline(task.projectId);
  const stageConfig = config.stages.find((s) => s.key === stage);
  const itemConfig = stageConfig?.checklist.find((i) => i.key === item);
  if (!stageConfig || !itemConfig) {
    throw new HTTPException(400, { message: "Unknown checklist item" });
  }

  await db.transaction(async (tx) => {
    const row = await ensureCardRow(tx, taskId, task.projectId);
    const checklist = cardData(row).checklist;
    const stageItems = { ...checklist[stage] };
    if (Boolean(stageItems[item]) === checked) return;
    if (checked) {
      stageItems[item] = { by: userId, at: new Date().toISOString() };
    } else {
      delete stageItems[item];
    }
    await tx
      .update(gameCardTable)
      .set({ checklist: { ...checklist, [stage]: stageItems } })
      .where(eq(gameCardTable.taskId, taskId));
    await recordGameActivity(tx, config, {
      taskId,
      userId,
      type: "game_checklist",
      eventData: {
        stage,
        stageName: stageConfig.name,
        item,
        label: itemConfig.label,
        checked,
      },
    });
  });

  await notifyGameChanged(task, userId);
  return getGame(taskId, userId, canManageProject);
}

export async function setApproval({
  taskId,
  userId,
  canManageProject,
  gate,
  approved,
}: {
  taskId: string;
  userId: string;
  canManageProject: boolean;
  gate: "development" | "scale";
  approved: boolean;
}) {
  const task = await loadTask(taskId);
  const { config } = await requirePipeline(task.projectId);

  await db.transaction(async (tx) => {
    const row = await ensureCardRow(tx, taskId, task.projectId);
    const current = cardData(row);
    if (!canDecideOn(current, userId, canManageProject)) {
      throw new HTTPException(403, {
        message: "Only the game's producer or a project manager can approve",
      });
    }
    if (Boolean(current.approvals[gate]) === approved) return;
    const approvals = { ...current.approvals };
    if (approved) {
      approvals[gate] = { by: userId, at: new Date().toISOString() };
    } else {
      delete approvals[gate];
    }
    await tx
      .update(gameCardTable)
      .set({ approvals })
      .where(eq(gameCardTable.taskId, taskId));
    await recordGameActivity(tx, config, {
      taskId,
      userId,
      type: "game_approval",
      eventData: { gate, approved },
    });
  });

  await notifyGameChanged(task, userId);
  return getGame(taskId, userId, canManageProject);
}

/**
 * Replaces a project's own pipeline config. Column ids stay as the server
 * assigned them; a renamed stage renames its column so the board and the
 * config never disagree. The template and other projects are not touched.
 */
export async function updatePipelineConfig(
  projectId: string,
  workspaceId: string,
  incoming: PipelineConfig,
) {
  const pipeline = await requirePipeline(projectId);
  if (!incoming.defaults.producerId) {
    throw new HTTPException(400, {
      message: "A producer is required for a game pipeline project",
    });
  }
  await assertWorkspaceMembers(workspaceId, [
    incoming.defaults.producerId,
    incoming.defaults.developerId,
    incoming.defaults.qaId,
  ]);

  const config: PipelineConfig = {
    ...incoming,
    stages: incoming.stages.map((stage) => ({
      ...stage,
      columnId:
        pipeline.config.stages.find((s) => s.key === stage.key)?.columnId ??
        null,
    })),
  };

  await db.transaction(async (tx) => {
    for (const stage of config.stages) {
      const previous = pipeline.config.stages.find((s) => s.key === stage.key);
      if (
        stage.columnId &&
        previous &&
        (previous.name !== stage.name || previous.emoji !== stage.emoji)
      ) {
        await tx
          .update(columnTable)
          .set({ name: `${stage.emoji} ${stage.name}`.trim() })
          .where(
            and(
              eq(columnTable.id, stage.columnId),
              eq(columnTable.projectId, projectId),
            ),
          );
      }
    }
    await tx
      .update(projectPipelineTable)
      .set({ config })
      .where(eq(projectPipelineTable.projectId, projectId));
  });

  return { ...pipeline, config };
}
