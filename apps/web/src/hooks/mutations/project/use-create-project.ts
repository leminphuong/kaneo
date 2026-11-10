import { useMutation } from "@tanstack/react-query";
import createProject, {
  type CreateProjectRequest,
} from "@/fetchers/project/create-project";

function useCreateProject(request: CreateProjectRequest) {
  return useMutation({
    mutationFn: () => createProject(request),
  });
}

export default useCreateProject;
