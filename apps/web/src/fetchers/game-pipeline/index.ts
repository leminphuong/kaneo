import { client } from "@kaneo/libs";
import type { InferRequestType, InferResponseType } from "hono/client";
import { HttpError } from "@/lib/http-error";

const api = client["game-pipeline"];

export type ProjectTemplate = InferResponseType<
  (typeof api)["template"]["$get"],
  200
>;
export type PipelineConfig = ProjectTemplate["config"];
export type PipelineStage = PipelineConfig["stages"][number];
export type ProjectPipeline = NonNullable<
  InferResponseType<
    (typeof api)["project"][":projectId"]["$get"],
    200
  >["pipeline"]
>;
export type Game = InferResponseType<
  (typeof api)["game"][":taskId"]["$get"],
  200
>;
export type GameSummary = InferResponseType<
  (typeof api)["project"][":projectId"]["games"]["$get"],
  200
>[number];
export type CreateGameRequest = InferRequestType<
  (typeof api)["project"][":projectId"]["games"]["$post"]
>["json"];
export type UpdateGameRequest = InferRequestType<
  (typeof api)["game"][":taskId"]["$patch"]
>["json"];
export type GateFailure = Game["transitions"][number]["failures"][number];

async function unwrap<T>(response: {
  ok: boolean;
  status: number;
  text: () => Promise<string>;
  json: () => Promise<T>;
}) {
  if (!response.ok) {
    throw new HttpError(response.status, await response.text());
  }
  return response.json();
}

export async function getTemplate() {
  return unwrap(await api.template.$get());
}

export async function saveTemplate(config: PipelineConfig) {
  return unwrap(await api.template.$put({ json: { config } }));
}

export async function getProjectPipeline(projectId: string) {
  const data = await unwrap(
    await api.project[":projectId"].$get({ param: { projectId } }),
  );
  return data.pipeline;
}

export async function updateProjectPipeline(
  projectId: string,
  config: PipelineConfig,
) {
  return unwrap(
    await api.project[":projectId"].$put({
      param: { projectId },
      json: { config },
    }),
  );
}

export async function listGames(projectId: string) {
  return unwrap(
    await api.project[":projectId"].games.$get({ param: { projectId } }),
  );
}

export async function createGame(projectId: string, body: CreateGameRequest) {
  return unwrap(
    await api.project[":projectId"].games.$post({
      param: { projectId },
      json: body,
    }),
  );
}

export async function getGame(taskId: string) {
  return unwrap(await api.game[":taskId"].$get({ param: { taskId } }));
}

export async function updateGame(taskId: string, body: UpdateGameRequest) {
  return unwrap(
    await api.game[":taskId"].$patch({ param: { taskId }, json: body }),
  );
}

export async function setChecklistItem(
  taskId: string,
  body: { stage: PipelineStage["key"]; item: string; checked: boolean },
) {
  return unwrap(
    await api.game[":taskId"].checklist.$put({ param: { taskId }, json: body }),
  );
}

export async function setApproval(
  taskId: string,
  body: { gate: "development" | "scale"; approved: boolean },
) {
  return unwrap(
    await api.game[":taskId"].approval.$put({ param: { taskId }, json: body }),
  );
}
