import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import ImportUsersCard from "@/components/admin/import-users-card";
import UserManagementPanel from "@/components/admin/user-management-panel";
import PageTitle from "@/components/page-title";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/settings/admin/users",
)({
  component: RouteComponent,
});

function RouteComponent() {
  const { t } = useTranslation();

  return (
    <>
      <PageTitle title={t("settings:adminUsers.title")} />
      <UserManagementPanel />
      <div className="mx-auto mt-6 max-w-5xl">
        <ImportUsersCard />
      </div>
    </>
  );
}
