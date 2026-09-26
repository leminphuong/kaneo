import { beforeEach, expect, it, vi } from "vitest";
import { Route } from "./auth";

const mocks = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("@/lib/auth-client", () => ({ authClient: mocks }));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
  redirect: ({ to }: { to: string }) => new Error(`Redirect to ${to}`),
}));
const beforeLoad = Route.options.beforeLoad as (context: {
  location: { pathname: string };
}) => Promise<unknown>;

beforeEach(() => mocks.getSession.mockReset());

it.each(["/auth/sign-in", "/auth/sign-up", "/auth/verify-otp"])(
  "keeps the authenticated redirect on %s",
  async (pathname) => {
    mocks.getSession.mockResolvedValue({
      data: { user: { id: "existing-user" } },
    });
    await expect(beforeLoad({ location: { pathname } })).rejects.toThrow(
      "Redirect to /dashboard",
    );
  },
);

// Password recovery used to be exempt from that redirect. The routes are gone
// now, so a signed-in visitor is sent to the dashboard from anywhere under
// /auth with no exceptions left to get wrong.
it("redirects a signed-in visitor away from every auth path", async () => {
  mocks.getSession.mockResolvedValue({
    data: { user: { id: "existing-user" } },
  });
  await expect(
    beforeLoad({ location: { pathname: "/auth/reset-password" } }),
  ).rejects.toThrow("Redirect to /dashboard");
});

it("lets signed-out visitors through", async () => {
  mocks.getSession.mockResolvedValue({ data: null });
  await expect(
    beforeLoad({ location: { pathname: "/auth/sign-in" } }),
  ).resolves.toEqual({ session: null });
});
