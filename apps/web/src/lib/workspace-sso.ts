import { authClient } from "@/lib/auth-client";

/**
 * Sign-in hand-off from JoyDigi Workspace.
 *
 * Workspace frames this app and puts a one-time code in the URL *fragment*:
 *
 *   https://task.joydigi.net/#joydigi_sso_code=...&joydigi_sso_app=task
 *
 * A fragment is never sent in an HTTP request, which is the point: it keeps
 * the credential out of server logs and past the WAFs that reject
 * authentication-looking values in a query string. The cost is that only the
 * page can see it, so reading it here and posting it back is the whole job.
 */

const CODE_KEY = "joydigi_sso_code";
const APP_KEY = "joydigi_sso_app";
// Workspace parks whatever fragment the URL already had under this key so the
// hand-off does not eat a deep link.
const RETURN_FRAGMENT_KEY = "joydigi_sso_return_fragment";

/** Key under which a failed hand-off leaves its reason, for diagnosis. */
export const WORKSPACE_SSO_ERROR_KEY = "joydigi.sso.error";

/**
 * Take the code out of the address bar and hand it back exactly once.
 *
 * The fragment is rewritten before anything else happens, so the code is not
 * left sitting in the address bar, in browser history, or in a `Referer` of
 * some later request.
 */
export function consumeWorkspaceSsoCode(): string | null {
  if (typeof window === "undefined") return null;

  const hash = window.location.hash.replace(/^#/, "");
  if (!hash.includes(CODE_KEY)) return null;

  const params = new URLSearchParams(hash);
  const code = params.get(CODE_KEY);
  if (!code) return null;

  params.delete(CODE_KEY);
  params.delete(APP_KEY);

  const returned = params.get(RETURN_FRAGMENT_KEY);
  params.delete(RETURN_FRAGMENT_KEY);

  // Prefer the fragment Workspace displaced; otherwise keep anything else that
  // was travelling alongside the code, and fall back to no fragment at all.
  const rest = params.toString();
  const nextHash = returned || rest;

  window.history.replaceState(
    window.history.state,
    "",
    `${window.location.pathname}${window.location.search}${nextHash ? `#${nextHash}` : ""}`,
  );

  return code;
}

/**
 * Redeem the code. Resolves either way: a failed hand-off must still let the
 * app boot and show its own sign-in page rather than leaving a blank frame.
 */
export async function completeWorkspaceSsoSignIn(code: string): Promise<void> {
  try {
    const { error } = await authClient.$fetch<{ ok: true }>(
      "/workspace-sso/login",
      { method: "POST", body: { code } },
    );

    if (error) {
      // The server's reason - NO_MATCHING_ACCOUNT, ACCOUNT_NOT_VERIFIED,
      // INVALID_CODE, UNAVAILABLE - is what an administrator needs to act on.
      // better-auth's error type does not declare `code`, though its API
      // errors carry one, so read it without assuming it is there.
      const { code: reasonCode } = error as { code?: unknown };
      const reason =
        typeof reasonCode === "string" && reasonCode
          ? reasonCode
          : String(error.status || "UNKNOWN");
      recordFailure(reason, error.message);
      return;
    }
  } catch (cause) {
    recordFailure("NETWORK", cause instanceof Error ? cause.message : "");
  }
}

function recordFailure(reason: string, message?: string) {
  console.error(
    `[workspace-sso] sign-in hand-off failed: ${reason}${message ? ` - ${message}` : ""}`,
  );
  try {
    sessionStorage.setItem(WORKSPACE_SSO_ERROR_KEY, reason);
  } catch {
    // Private mode or blocked storage. The console line is the fallback.
  }
}
