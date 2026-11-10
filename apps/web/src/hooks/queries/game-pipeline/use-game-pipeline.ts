import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type CreateGameRequest,
  createGame,
  type Game,
  getGame,
  getProjectPipeline,
  getTemplate,
  listGames,
  type PipelineConfig,
  saveTemplate,
  setApproval,
  setChecklistItem,
  type UpdateGameRequest,
  updateGame,
  updateProjectPipeline,
} from "@/fetchers/game-pipeline";

// Keys nest under ["tasks", projectId] and ["task", taskId] so the existing
// realtime invalidation (TASK_UPDATED and friends) refreshes them for free.
export const gamePipelineKeys = {
  template: ["game-pipeline-template"] as const,
  pipeline: (projectId: string) => ["project-pipeline", projectId] as const,
  games: (projectId: string) => ["tasks", projectId, "games"] as const,
  game: (taskId: string) => ["task", taskId, "game"] as const,
};

export function useGameTemplate(enabled = true) {
  return useQuery({
    queryKey: gamePipelineKeys.template,
    queryFn: getTemplate,
    enabled,
    staleTime: 60_000,
  });
}

export function useProjectPipeline(projectId: string | undefined) {
  return useQuery({
    queryKey: gamePipelineKeys.pipeline(projectId ?? ""),
    queryFn: () => getProjectPipeline(projectId ?? ""),
    enabled: !!projectId,
    staleTime: 30_000,
  });
}

export function useProjectGames(projectId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: gamePipelineKeys.games(projectId ?? ""),
    queryFn: () => listGames(projectId ?? ""),
    enabled: !!projectId && enabled,
  });
}

export function useGame(taskId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: gamePipelineKeys.game(taskId ?? ""),
    queryFn: () => getGame(taskId ?? ""),
    enabled: !!taskId && enabled,
  });
}

function useGameMutation<TVars>(
  taskId: string,
  projectId: string | undefined,
  mutationFn: (vars: TVars) => Promise<Game>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: (game) => {
      queryClient.setQueryData(gamePipelineKeys.game(taskId), game);
      queryClient.invalidateQueries({ queryKey: ["activities", taskId] });
      if (projectId) {
        queryClient.invalidateQueries({
          queryKey: gamePipelineKeys.games(projectId),
        });
      }
    },
  });
}

export function useUpdateGame(taskId: string, projectId?: string) {
  return useGameMutation(taskId, projectId, (body: UpdateGameRequest) =>
    updateGame(taskId, body),
  );
}

export function useSetChecklistItem(taskId: string, projectId?: string) {
  return useGameMutation(
    taskId,
    projectId,
    (body: Parameters<typeof setChecklistItem>[1]) =>
      setChecklistItem(taskId, body),
  );
}

export function useSetApproval(taskId: string, projectId?: string) {
  return useGameMutation(
    taskId,
    projectId,
    (body: Parameters<typeof setApproval>[1]) => setApproval(taskId, body),
  );
}

export function useCreateGame(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateGameRequest) => createGame(projectId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks", projectId] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

export function useUpdateProjectPipeline(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (config: PipelineConfig) =>
      updateProjectPipeline(projectId, config),
    onSuccess: (pipeline) => {
      queryClient.setQueryData(gamePipelineKeys.pipeline(projectId), pipeline);
      queryClient.invalidateQueries({ queryKey: ["tasks", projectId] });
      queryClient.invalidateQueries({ queryKey: ["task"] });
      queryClient.invalidateQueries({ queryKey: ["columns", projectId] });
    },
  });
}

export function useSaveTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (config: PipelineConfig) => saveTemplate(config),
    onSuccess: (template) => {
      queryClient.setQueryData(gamePipelineKeys.template, template);
    },
  });
}
