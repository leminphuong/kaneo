import { createFileRoute, Outlet } from "@tanstack/react-router";
import { usePendingCheckout } from "@/hooks/use-pending-checkout";

export const Route = createFileRoute("/_layout/_authenticated/dashboard")({
  component: DashboardLayoutComponent,
});

// No PageTitle here: React flushes child effects before parent ones, so a title
// set by this layout overwrote the one every child page had just set, and on a
// fresh load every /dashboard/* page ended up titled "Projects". Each page owns
// its own title instead.
function DashboardLayoutComponent() {
  usePendingCheckout();

  return <Outlet />;
}
