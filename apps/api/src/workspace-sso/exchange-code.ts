import type { WorkspaceSsoConfig } from "./config";

/** The subset of the Workspace profile this instance acts on. */
export type WorkspaceProfile = {
  email: string;
  displayName: string;
  login: string;
};

export type ExchangeResult =
  | { ok: true; profile: WorkspaceProfile }
  | { ok: false; reason: "INVALID_CODE" | "UNAVAILABLE" };

// Workspace expires a code after 90 seconds, so a slow exchange is a failed
// one. Ten seconds is generous and still well inside that window.
const REQUEST_TIMEOUT_MS = 10_000;

// The documented response is a handful of profile fields. Anything larger is
// not Workspace answering, and reading it would be the only unbounded work
// an unauthenticated caller can make this endpoint do.
const MAX_RESPONSE_BYTES = 64 * 1024;

function readProfile(payload: unknown): WorkspaceProfile | null {
  if (!payload || typeof payload !== "object") return null;
  const body = payload as { ok?: unknown; user?: unknown };
  if (body.ok !== true) return null;

  if (!body.user || typeof body.user !== "object") return null;
  const user = body.user as Record<string, unknown>;

  // Email is the only field this instance makes a decision on, so it is the
  // only one allowed to be missing-equals-failure.
  const email = typeof user.email === "string" ? user.email.trim() : "";
  if (!email) return null;

  return {
    email,
    displayName:
      typeof user.display_name === "string" ? user.display_name.trim() : "",
    login: typeof user.login === "string" ? user.login.trim() : "",
  };
}

/**
 * Redeem a Workspace one-time code, server to server.
 *
 * Nothing the browser said about who it is survives this call: the identity
 * comes from Workspace's own answer, which is why the code has to be redeemed
 * here rather than trusted in the page.
 *
 * Neither the code nor the secret is ever logged - a code is live for 90
 * seconds and would be replayable from a log that outlives it.
 */
export async function exchangeWorkspaceCode(
  config: WorkspaceSsoConfig,
  code: string,
): Promise<ExchangeResult> {
  const body = new URLSearchParams({ app: config.appId, code });
  if (config.secret) body.set("secret", config.secret);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(config.exchangeUrl, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
      },
      body,
      signal: controller.signal,
      redirect: "error",
    });
  } catch {
    // Timed out, DNS failure, TLS failure, or a redirect we refused to follow.
    return { ok: false, reason: "UNAVAILABLE" };
  } finally {
    clearTimeout(timeout);
  }

  // Workspace answers 401/403 for a code that is expired, already spent or
  // bound to another app. Those are all "this code is no good", not outages.
  if (response.status === 401 || response.status === 403) {
    return { ok: false, reason: "INVALID_CODE" };
  }
  if (!response.ok) {
    return { ok: false, reason: "UNAVAILABLE" };
  }

  const raw = await readBounded(response);
  if (raw === null) return { ok: false, reason: "UNAVAILABLE" };

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "UNAVAILABLE" };
  }

  const profile = readProfile(payload);
  if (!profile) return { ok: false, reason: "INVALID_CODE" };

  return { ok: true, profile };
}

async function readBounded(response: Response): Promise<string | null> {
  const reader = response.body?.getReader();
  if (!reader) return null;

  const decoder = new TextDecoder();
  let text = "";
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        return null;
      }
      text += decoder.decode(value, { stream: true });
    }
  } catch {
    return null;
  }

  return text + decoder.decode();
}
