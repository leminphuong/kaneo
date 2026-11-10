import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import {
  apiRouter,
  type BaseVariables,
  createRoute,
  errorResponse,
  jsonResponse,
  z,
} from "../openapi";
import { isInstanceAdmin } from "../utils/is-instance-admin";
import {
  hasWorkspacePermission,
  requireWorkspacePermission,
} from "../utils/require-workspace-permission";
import { workspaceAccess } from "../utils/workspace-access-middleware";
import createGame from "./controllers/create-game";
import {
  getGame,
  listGames,
  setApproval,
  setChecklistItem,
  updateGame,
  updatePipelineConfig,
} from "./controllers/game";
import {
  createdGameSchema,
  gameSchema,
  gameSummarySchema,
  projectPipelineResultSchema,
  projectPipelineSchema,
  templateSchema,
} from "./response";
import {
  createGameBody,
  projectIdParam,
  saveTemplateBody,
  setApprovalBody,
  setChecklistItemBody,
  taskIdParam,
  updateGameBody,
  updatePipelineBody,
} from "./schema";
import { getPipeline } from "./store";
import { getLatestTemplate, saveTemplateVersion } from "./template-store";

const TAG = ["Game Pipeline"];

const getTemplateRoute = createRoute({
  method: "get",
  path: "/template",
  operationId: "getGamePipelineTemplate",
  tags: TAG,
  summary: "Get the game pipeline template",
  description:
    "The latest version of the GAME PRODUCTION PIPELINE template: its stable key, version and default config. Creating a project copies this config into the project.",
  responses: {
    200: jsonResponse("The latest template version", templateSchema),
    401: errorResponse("Unauthorized"),
  },
});

const saveTemplateRoute = createRoute({
  method: "put",
  path: "/template",
  operationId: "saveGamePipelineTemplate",
  tags: TAG,
  summary: "Save a new template version",
  description:
    "Instance administrators only. Saves the config as the next template version. Existing projects keep their own copy and are not changed.",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: saveTemplateBody } },
    },
  },
  responses: {
    200: jsonResponse("The saved template version", templateSchema),
    400: errorResponse("Invalid config"),
    403: errorResponse("Not an instance administrator"),
    409: errorResponse("A newer version was saved concurrently"),
  },
});

const getPipelineRoute = createRoute({
  method: "get",
  path: "/project/{projectId}",
  operationId: "getProjectPipeline",
  tags: TAG,
  summary: "Get a project's pipeline config",
  description:
    "The project's own copy of its template config, or null for a project that was not created from a template.",
  middleware: [workspaceAccess.fromProject("projectId")] as const,
  request: { params: projectIdParam },
  responses: {
    200: jsonResponse("The pipeline, or null", projectPipelineResultSchema),
    400: errorResponse("Unknown project"),
    403: errorResponse("No access to the project's workspace"),
  },
});

const updatePipelineRoute = createRoute({
  method: "put",
  path: "/project/{projectId}",
  operationId: "updateProjectPipeline",
  tags: TAG,
  summary: "Update a project's pipeline config",
  description:
    "Replace the project's pipeline config (rules, WIP limit, defaults, checklists, KPI thresholds). Never changes the template or other projects.",
  middleware: [
    workspaceAccess.fromProject("projectId"),
    requireWorkspacePermission({ project: ["update"] }),
  ] as const,
  request: {
    params: projectIdParam,
    body: {
      required: true,
      content: { "application/json": { schema: updatePipelineBody } },
    },
  },
  responses: {
    200: jsonResponse("The updated pipeline", projectPipelineSchema),
    400: errorResponse("Invalid config, or not a pipeline project"),
    403: errorResponse("Missing project:update, or a role is not a member"),
  },
});

const listGamesRoute = createRoute({
  method: "get",
  path: "/project/{projectId}/games",
  operationId: "listGames",
  tags: TAG,
  summary: "List a project's games",
  description:
    "Game code and current-stage checklist progress for every game in the project, for board cards.",
  middleware: [workspaceAccess.fromProject("projectId")] as const,
  request: { params: projectIdParam },
  responses: {
    200: jsonResponse("Game summaries", z.array(gameSummarySchema)),
    400: errorResponse("Unknown project"),
    403: errorResponse("No access to the project's workspace"),
  },
});

const createGameRoute = createRoute({
  method: "post",
  path: "/project/{projectId}/games",
  operationId: "createGame",
  tags: TAG,
  summary: "Create a game",
  description:
    "Create a game (a task plus its pipeline record) in the first stage. Only the title is required; unset roles, priority, platform and devices inherit the project defaults, and the code (e.g. H5-001) is assigned automatically. Retrying with the same creationKey returns the first game.",
  middleware: [
    workspaceAccess.fromProject("projectId"),
    requireWorkspacePermission({ task: ["create"] }),
  ] as const,
  request: {
    params: projectIdParam,
    body: {
      required: true,
      content: { "application/json": { schema: createGameBody } },
    },
  },
  responses: {
    200: jsonResponse("The created game", createdGameSchema),
    400: errorResponse(
      "Invalid body, unknown labels, or not a pipeline project",
    ),
    403: errorResponse(
      "Missing task:create, a role is not a member, or a decision was recorded without the right to decide",
    ),
  },
});

const getGameRoute = createRoute({
  method: "get",
  path: "/game/{taskId}",
  operationId: "getGame",
  tags: TAG,
  summary: "Get a game",
  description:
    "A game's pipeline record with its computed score, KPI status and, for every other stage, whether a move there would pass the Gate Review and why not.",
  middleware: [workspaceAccess.fromTask("taskId")] as const,
  request: { params: taskIdParam },
  responses: {
    200: jsonResponse("The game", gameSchema),
    400: errorResponse("Not a pipeline project"),
    403: errorResponse("No access to the task's workspace"),
    404: errorResponse("Task not found"),
  },
});

const updateGameRoute = createRoute({
  method: "patch",
  path: "/game/{taskId}",
  operationId: "updateGame",
  tags: TAG,
  summary: "Update a game",
  description:
    "Merge fields into a game's pipeline record. Recording an evaluation or producer decision, or changing the producer, requires being the game's producer or holding project:update.",
  middleware: [
    workspaceAccess.fromTask("taskId"),
    requireWorkspacePermission({ task: ["update"] }),
  ] as const,
  request: {
    params: taskIdParam,
    body: {
      required: true,
      content: { "application/json": { schema: updateGameBody } },
    },
  },
  responses: {
    200: jsonResponse("The updated game", gameSchema),
    400: errorResponse("Invalid body, or not a pipeline project"),
    403: errorResponse("Missing permission or decision right"),
    404: errorResponse("Task not found"),
  },
});

const setChecklistRoute = createRoute({
  method: "put",
  path: "/game/{taskId}/checklist",
  operationId: "setGameChecklistItem",
  tags: TAG,
  summary: "Check or uncheck a checklist item",
  description: "Records who checked a stage checklist item and when.",
  middleware: [
    workspaceAccess.fromTask("taskId"),
    requireWorkspacePermission({ task: ["update"] }),
  ] as const,
  request: {
    params: taskIdParam,
    body: {
      required: true,
      content: { "application/json": { schema: setChecklistItemBody } },
    },
  },
  responses: {
    200: jsonResponse("The updated game", gameSchema),
    400: errorResponse("Unknown checklist item"),
    403: errorResponse("Missing task:update"),
    404: errorResponse("Task not found"),
  },
});

const setApprovalRoute = createRoute({
  method: "put",
  path: "/game/{taskId}/approval",
  operationId: "setGameApproval",
  tags: TAG,
  summary: "Grant or revoke a gate approval",
  description:
    "Approve (or revoke approval of) a game's move into Development or Scale. Only the game's producer or a holder of project:update may approve. Meeting KPIs never approves anything by itself.",
  middleware: [
    workspaceAccess.fromTask("taskId"),
    requireWorkspacePermission({ task: ["update"] }),
  ] as const,
  request: {
    params: taskIdParam,
    body: {
      required: true,
      content: { "application/json": { schema: setApprovalBody } },
    },
  },
  responses: {
    200: jsonResponse("The updated game", gameSchema),
    403: errorResponse("Not the producer and missing project:update"),
    404: errorResponse("Task not found"),
  },
});

function canManageProject(c: Context) {
  return hasWorkspacePermission(c, { project: ["update"] });
}

const gamePipeline = apiRouter<BaseVariables & { workspaceId: string }>()
  .openapi(getTemplateRoute, async (c) =>
    c.json(await getLatestTemplate(), 200),
  )
  .openapi(saveTemplateRoute, async (c) => {
    if (!(await isInstanceAdmin(c))) {
      throw new HTTPException(403, {
        message: "Only instance administrators can edit templates",
      });
    }
    const { config } = c.req.valid("json");
    return c.json(await saveTemplateVersion(config, c.get("userId")), 200);
  })
  .openapi(getPipelineRoute, async (c) => {
    const { projectId } = c.req.valid("param");
    return c.json({ pipeline: await getPipeline(projectId) }, 200);
  })
  .openapi(updatePipelineRoute, async (c) => {
    const { projectId } = c.req.valid("param");
    const { config } = c.req.valid("json");
    return c.json(
      await updatePipelineConfig(projectId, c.get("workspaceId"), config),
      200,
    );
  })
  .openapi(listGamesRoute, async (c) => {
    const { projectId } = c.req.valid("param");
    return c.json(await listGames(projectId), 200);
  })
  .openapi(createGameRoute, async (c) => {
    const { projectId } = c.req.valid("param");
    const body = c.req.valid("json");
    const { task, card, created } = await createGame({
      ...body,
      projectId,
      currentUserId: c.get("userId"),
      canManageProject: await canManageProject(c),
    });
    return c.json(
      {
        taskId: task.id,
        projectId: task.projectId,
        code: card.code,
        number: task.number,
        title: task.title,
        status: task.status,
        created,
        createdAt: task.createdAt,
      },
      200,
    );
  })
  .openapi(getGameRoute, async (c) => {
    const { taskId } = c.req.valid("param");
    return c.json(
      await getGame(taskId, c.get("userId"), await canManageProject(c)),
      200,
    );
  })
  .openapi(updateGameRoute, async (c) => {
    const { taskId } = c.req.valid("param");
    return c.json(
      await updateGame({
        taskId,
        userId: c.get("userId"),
        canManageProject: await canManageProject(c),
        patch: c.req.valid("json"),
      }),
      200,
    );
  })
  .openapi(setChecklistRoute, async (c) => {
    const { taskId } = c.req.valid("param");
    const { stage, item, checked } = c.req.valid("json");
    return c.json(
      await setChecklistItem({
        taskId,
        userId: c.get("userId"),
        canManageProject: await canManageProject(c),
        stage,
        item,
        checked,
      }),
      200,
    );
  })
  .openapi(setApprovalRoute, async (c) => {
    const { taskId } = c.req.valid("param");
    const { gate, approved } = c.req.valid("json");
    return c.json(
      await setApproval({
        taskId,
        userId: c.get("userId"),
        canManageProject: await canManageProject(c),
        gate,
        approved,
      }),
      200,
    );
  });

export default gamePipeline;
