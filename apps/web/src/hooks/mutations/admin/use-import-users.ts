import { useMutation, useQueryClient } from "@tanstack/react-query";
import importUsers, { type UserToImport } from "@/fetchers/admin/import-users";
import { ADMIN_USERS_QUERY_KEY } from "@/hooks/queries/admin/use-admin-users";

const useImportUsers = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (users: UserToImport[]) => importUsers(users),
    onSuccess: (result) => {
      // Only refresh the directory when the import actually added someone.
      if (result.created > 0) {
        void queryClient.invalidateQueries({ queryKey: ADMIN_USERS_QUERY_KEY });
      }
    },
  });
};

export default useImportUsers;
