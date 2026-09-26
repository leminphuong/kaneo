import { createFileRoute, redirect } from "@tanstack/react-router";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/auth")({
  beforeLoad: async () => {
    let session = null;
    try {
      const { data } = await authClient.getSession();
      session = data;
    } catch (error) {
      if (import.meta.env.DEV) console.warn("getSession failed", error);
      // getSession() rejected (e.g. network error) — treat as unauthenticated, allow auth pages to render
    }
    // Password recovery used to be exempt from this redirect so a signed-in
    // user could still finish a reset link. Those routes are gone: the reset
    // link could only arrive by email and this instance sends none.
    if (session) {
      throw redirect({
        to: "/dashboard",
      });
    }
    return { session };
  },
});
